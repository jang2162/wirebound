import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import {
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type CreatedPage,
  type CreatedProject,
  type SignedUpUser,
  type TestContext,
} from './helpers'

/**
 * undo/redo 왕복 테스트다. **전부 HTTP 라우트를 거친다** — `PATCH .../ops`로 편집하고,
 * `GET .../pages/:pageId`로 문서를 되읽고, `GET .../revisions`로 이력을 받는다.
 *
 * **왜 파이프라인을 직접 부르지 않는가.** `edit-pipeline.test.ts`가 이미 `applyEdit`을
 * 직접 부르며 각 단계를 하나씩 고정한다. 이 파일이 고정하는 것은 그 조각들이
 * **클라이언트가 실제로 쓰는 경로 위에서** undo/redo를 이루는가다: 서버에 undo라는
 * 개념은 없고, 클라이언트는 저장된 `inverse`를 그냥 새 편집으로
 * 되보낼 뿐이다(설계서 「개인 undo/redo」). 그 왕복이 성립하려면 파이프라인뿐 아니라 라우트의 zod
 * 경계·응답 조립까지 전부 맞아야 한다.
 *
 * `withApi`를 쓴다 — 이 파일의 시나리오는 전부 순차이므로 단일 트랜잭션으로 충분하다.
 * 여러 커넥션이 실제로 커밋해야만 검증되는 성질(seq 채번 경합)은
 * `revisions-concurrency.test.ts`가 따로 본다.
 *
 * **이 파일이 라우트를 거치기 때문에 닫히는 구멍이 하나 있다.** 케이스 1의 세 번째
 * 편집이 `move`인데, 저장소에서 `PATCH .../ops`에 **유효한** `move`를 보내는 테스트는
 * 이것뿐이다(`revisions.test.ts`의 `move` 케이스는 `from`이 `/root` 밖이라 400을
 * 기대한다). 이것이 없으면 `http/patch-ops.ts`의 `PatchOpBody`에서 `move` 변형을 통째로
 * 지워도 컴파일이 통과하고(좁아지는 쪽은 여전히 `PatchOp[]`에 대입 가능하다) 다른
 * 테스트도 전부 초록이다. 지우면 케이스 1이 400으로 죽는다.
 */

/**
 * 케이스 1의 세 번째 편집이 쓰는 **덮어쓰기 move**의 대상 노드 둘.
 *
 * `props.content`는 카탈로그에서 `z.string().default(...)`이므로 키가 없어도 검증을
 * 통과한다(`packages/schema/src/component/catalog/document.ts`) — 그래서 한 노드의
 * `content`를 다른 노드로 옮겨 원본 노드에 그 키가 사라져도 6단계(`validatePage`)에
 * 걸리지 않는다. 이 성질이 있어야 덮어쓰기 move를 정상 편집으로 태울 수 있다.
 */
const NODE_A = { id: 'n_undo_a', type: 'Text', props: { content: 'A' } }
const NODE_B = { id: 'n_undo_b', type: 'Text', props: { content: 'B' } }

interface Fixture {
  owner: SignedUpUser
  project: CreatedProject
  page: CreatedPage
}

async function setup(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  return { owner, project, page }
}

function pageUrl(fx: Fixture): string {
  return `/api/projects/${fx.project.id}/pages/${fx.page.id}`
}

interface EditResult {
  seq: number
  inverse: PatchOp[]
}

/** 성공을 전제로 한 편집. 200이 아니면 그 자리에서 크게 던진다(시나리오가 깨졌다는 뜻). */
async function edit(ctx: TestContext, fx: Fixture, baseSeq: number, ops: PatchOp[]): Promise<EditResult> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `${pageUrl(fx)}/ops`,
    cookies: fx.owner.cookie,
    payload: { baseSeq, ops },
  })
  if (res.statusCode !== 200) {
    throw new Error(`편집이 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
  const body = res.json<{ seq: number; inverse: PatchOp[] }>()
  return { seq: body.seq, inverse: body.inverse }
}

/** 실패를 기대하는 편집. 응답을 그대로 돌려준다. */
function tryEdit(ctx: TestContext, fx: Fixture, baseSeq: number, ops: PatchOp[]) {
  return ctx.app.inject({
    method: 'PATCH',
    url: `${pageUrl(fx)}/ops`,
    cookies: fx.owner.cookie,
    payload: { baseSeq, ops },
  })
}

interface PageView {
  schema: unknown
  headSeq: number
}

async function getPage(ctx: TestContext, fx: Fixture): Promise<PageView> {
  const res = await ctx.app.inject({ method: 'GET', url: pageUrl(fx), cookies: fx.owner.cookie })
  if (res.statusCode !== 200) {
    throw new Error(`페이지 조회가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
  return res.json<PageView>()
}

interface RevisionView {
  seq: number
  inverse: PatchOp[]
}

async function getRevisions(ctx: TestContext, fx: Fixture, query = ''): Promise<RevisionView[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `${pageUrl(fx)}/revisions${query}`,
    cookies: fx.owner.cookie,
  })
  if (res.statusCode !== 200) {
    throw new Error(`이력 조회가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
  return res.json<RevisionView[]>()
}

/**
 * 편집 세 번(add·replace·move)을 순서대로 적용한다.
 *
 * 세 번째가 **덮어쓰기 move**인 것이 이 시나리오의 핵심이다. `invertOps`의 독스트링이
 * 경고하듯 목적지에 값이 들어 있는 move의 역패치는 연산 **두 개**(`[replace 목적지=옛값,
 * add 출발지=옮긴값]`)라 ops와 inverse 사이에 1:1 인덱스 대응이 없다 — 파이프라인이나
 * 응답 조립이 그 대응을 가정하고 있으면 여기서 깨진다.
 */
async function threeEdits(ctx: TestContext, fx: Fixture): Promise<[EditResult, EditResult, EditResult]> {
  const e1 = await edit(ctx, fx, 0, [
    { op: 'add', path: '/root/children/0', value: NODE_A },
    { op: 'add', path: '/root/children/1', value: NODE_B },
  ])
  const e2 = await edit(ctx, fx, e1.seq, [{ op: 'replace', path: '/root/children/0/props/content', value: '고친 A' }])
  const e3 = await edit(ctx, fx, e2.seq, [{ op: 'move', from: '/root/children/0/props/content', path: '/root/children/1/props/content' }])
  return [e1, e2, e3]
}

/** 주어진 inverse들을 **역순으로** 새 편집으로 되보낸다. 마지막 편집의 seq를 돌려준다. */
async function undoAll(ctx: TestContext, fx: Fixture, inverses: PatchOp[][], fromSeq: number): Promise<number> {
  let base = fromSeq
  for (const inverse of [...inverses].reverse()) {
    base = (await edit(ctx, fx, base, inverse)).seq
  }
  return base
}

describe('undo/redo 왕복', () => {
  it('세 번 편집한 뒤 inverse를 역순으로 보내면 최초 문서로 정확히 돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const initial = await getPage(ctx, fx)

      const [e1, e2, e3] = await threeEdits(ctx, fx)

      // 덮어쓰기 move는 ops 하나에 inverse 둘이다. 이 단언이 없으면 응답 조립이
      // "inverse는 ops와 같은 길이"를 가정하도록 퇴행해도(예: 앞 하나만 싣도록)
      // 아래 왕복이 우연히 통과할 여지가 남는다 — 실제로는 통과하지 못하지만,
      // 무엇이 깨졌는지를 이 줄이 곧바로 가리킨다.
      expect(e3.inverse).toHaveLength(2)
      expect(e3.inverse[0]?.op).toBe('replace')
      expect(e3.inverse[1]?.op).toBe('add')

      await undoAll(ctx, fx, [e1.inverse, e2.inverse, e3.inverse], e3.seq)

      const restored = await getPage(ctx, fx)
      expect(restored.schema).toEqual(initial.schema)
    })
  })

  it('undo도 새 revision을 만든다 — head_seq는 되돌아가지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const [e1, e2, e3] = await threeEdits(ctx, fx)
      await undoAll(ctx, fx, [e1.inverse, e2.inverse, e3.inverse], e3.seq)

      // 편집 3 + undo 3 = 6. 서버에 undo라는 개념이 없다는 것이 여기서 드러난다 —
      // undo는 seq를 3으로 되돌리는 것이 아니라 새 편집 세 개를 더 쌓는 일이다.
      const page = await getPage(ctx, fx)
      expect(page.headSeq).toBe(6)

      // head_seq만 보면 revision을 남기지 않고 head_seq만 올려도 통과하므로 이력
      // 자체의 개수도 함께 못박는다(append-only 로그, 설계서 「테이블 정의」).
      const revisions = await getRevisions(ctx, fx, '?limit=200')
      expect(revisions.map((r) => r.seq)).toEqual([6, 5, 4, 3, 2, 1])
    })
  })

  it('undo revision의 inverse를 보내면 redo가 된다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const e1 = await edit(ctx, fx, 0, [{ op: 'add', path: '/root/children/0', value: NODE_A }])
      const afterEdit = await getPage(ctx, fx)

      // undo: seq 1의 inverse를 새 편집으로 보낸다 → seq 2.
      const undo = await edit(ctx, fx, e1.seq, e1.inverse)

      // redo: undo 자신도 평범한 편집이므로 자기 inverse를 갖는다. 그것을 보내면
      // undo가 취소된다 — redo 역시 서버에겐 그냥 또 하나의 편집이다.
      await edit(ctx, fx, undo.seq, undo.inverse)

      const redone = await getPage(ctx, fx)
      expect(redone.schema).toEqual(afterEdit.schema)
      expect(redone.headSeq).toBe(3)
    })
  })

  it('GET .../revisions?mine=true의 inverse만으로 왕복이 성립한다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const initial = await getPage(ctx, fx)

      // **PATCH 응답을 일부러 버린다.** 새로고침한 클라이언트는 그 응답을 갖고
      // 있지 않고 이력 조회만으로 undo 스택을 복원해야 한다(설계서 「개인 undo/redo」) — 이
      // 엔드포인트가 존재하는 이유 자체다.
      await threeEdits(ctx, fx)

      const revisions = await getRevisions(ctx, fx, '?mine=true')
      expect(revisions.map((r) => r.seq)).toEqual([3, 2, 1])

      // 이력은 최신순이므로 받은 순서대로 되보내는 것이 곧 역순 undo다.
      let base = 3
      for (const revision of revisions) {
        base = (await edit(ctx, fx, base, revision.inverse)).seq
      }

      const restored = await getPage(ctx, fx)
      expect(restored.schema).toEqual(initial.schema)
      expect(restored.headSeq).toBe(6)
    })
  })

  it('PUT .../schema가 만든 revision도 이력의 inverse로 되돌릴 수 있다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const initial = await getPage(ctx, fx)

      // **이 왕복은 반드시 라우트를 거쳐야 한다.** `pages.test.ts`가 같은 성질을
      // 검사하지만 저장된 문서에 `applyOps`를 **직접** 적용하므로 zod 경계를 지나지
      // 않는다 — 그래서 이 경로가 400으로 튕겨도 그 테스트는 초록이다.
      const put = await ctx.app.inject({
        method: 'PUT',
        url: `${pageUrl(fx)}/schema`,
        cookies: fx.owner.cookie,
        payload: {
          schema: {
            version: 5,
            root: { id: 'n_put_root', type: 'Page', children: [NODE_A] },
          },
        },
      })
      expect(put.statusCode, put.body).toBe(200)

      // 새로고침한 클라이언트처럼 이력에서만 inverse를 얻는다(설계서 「개인 undo/redo」).
      const revisions = await getRevisions(ctx, fx)
      expect(revisions.map((r) => r.seq)).toEqual([1])
      const inverse = revisions[0]?.inverse ?? []
      // `/version`이 inverse에 실려 있다는 것 자체가 이 케이스의 전제다. 빠지면
      // 왕복은 성립하지만 이 테스트가 겨냥한 경로를 지나지 않는다.
      expect(inverse.map((op) => op.path)).toContain('/version')

      const undo = await tryEdit(ctx, fx, 1, inverse)
      expect(undo.statusCode, undo.body).toBe(200)

      const restored = await getPage(ctx, fx)
      expect(restored.schema).toEqual(initial.schema)
      expect(restored.headSeq).toBe(2)
    })
  })

  it('대상 노드가 이미 지워졌으면 undo는 409다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const e1 = await edit(ctx, fx, 0, [{ op: 'add', path: '/root/children/0', value: NODE_A }])
      await edit(ctx, fx, e1.seq, [{ op: 'remove', path: '/root/children/0' }])

      // seq 1의 inverse는 `remove /root/children/0`인데 그 자리는 이미 비어 있다.
      // 클라이언트에게 "이 항목은 스택에서 빼라"는 신호다(설계서 「개인 undo/redo」의 "적용 불가 시
      // 정상 흐름").
      const res = await tryEdit(ctx, fx, 2, e1.inverse)

      expect(res.statusCode, res.body).toBe(409)
      // stale도 409/conflict이므로 상태 코드만 보면 두 사유를 뭉개도 통과한다.
      // 메시지로 사유를 구분한다(`routes/pages.ts`의 `toApiError`).
      expect(res.json<{ error: { message: string } }>().error.message).toContain('편집을 적용할 수 없습니다')
    })
  })

  it('409를 받은 뒤에도 문서와 head_seq는 멀쩡하다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const e1 = await edit(ctx, fx, 0, [{ op: 'add', path: '/root/children/0', value: NODE_A }])
      await edit(ctx, fx, e1.seq, [{ op: 'remove', path: '/root/children/0' }])
      const beforeUndo = await getPage(ctx, fx)

      const res = await tryEdit(ctx, fx, 2, e1.inverse)
      expect(res.statusCode, res.body).toBe(409)

      // 적용 불가한 undo는 아무것도 쓰지 않는다 — 그래야 클라이언트가 그 항목만
      // 버리고 나머지 스택을 그대로 계속 쓸 수 있다.
      const afterUndo = await getPage(ctx, fx)
      expect(afterUndo.headSeq).toBe(2)
      expect(afterUndo.schema).toEqual(beforeUndo.schema)

      const revisions = await getRevisions(ctx, fx)
      expect(revisions.map((r) => r.seq)).toEqual([2, 1])
    })
  })
})
