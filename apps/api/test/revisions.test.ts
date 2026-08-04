import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { withTransaction } from '../src/db/tx'
import {
  addMember,
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
 * 편집 이력 관련 두 라우트의 테스트다 — `PATCH .../pages/:pageId/ops`(편집)와
 * `GET .../pages/:pageId/revisions`(이력 조회). 후자는 아래 두 번째 `describe`에 있고,
 * 자기 계약을 그 자리에서 다시 설명한다.
 *
 * 아래 설명은 첫 번째 `describe`(`PATCH .../ops`)의 것이다.
 *
 * **여기서 검사하는 것은 HTTP 매핑과 zod 경계뿐이다.** 파이프라인 규칙 자체
 * (잠금 순서·stale 판정·역패치 생성·아무것도 안 쓰기)는 `edit-pipeline.test.ts`가
 * 라우트를 거치지 않고 이미 고정한다 — 그것을 여기서 되풀이하면 같은 성질을 두 곳에서
 * 검사하면서 정작 매핑이 틀려도 못 잡는 스위트가 된다. 이 파일이 고정하는 것은
 * 딱 두 가지다:
 *
 * 1. `EditOutcome`의 여섯 실패 사유가 각각 어떤 상태 코드·에러 봉투가 되는가.
 * 2. 어떤 본문이 파이프라인에 **도달조차 못 하는가**(zod 경계).
 *
 * 2번이 중요한 이유: `/version` 편집 금지(케이스 13·14)처럼 zod가 막는 것과
 * 파이프라인이 막는 것이 겹칠 때, 기대 상태를 400(zod)으로 못박아야 zod 제약이
 * 사라진 순간을 잡아낸다. 422(파이프라인)로 느슨하게 기대하면 zod를 통째로 지워도
 * 초록인 채로 남는다.
 */

const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

/** Postgres가 텍스트 계열 타입에 담지 못하는 문자. `db/nul-guard.ts` 참고. */
const NUL = String.fromCharCode(0)

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

function opsUrl(fx: Fixture): string {
  return `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`
}

/**
 * 편집 요청 하나를 보낸다. `payload`가 `unknown`인 이유: zod 경계 케이스가 일부러
 * 계약을 어긴 본문(필드 누락, 선언 안 된 키, 없는 op 종류)을 보내야 하는데, 여기에
 * 타입을 붙이면 그 케이스들이 컴파일되지 않는다.
 */
function patchOps(
  ctx: TestContext,
  fx: Fixture,
  payload: unknown,
  cookie: { wb_session: string } | undefined,
  url = opsUrl(fx),
) {
  return ctx.app.inject({ method: 'PATCH', url, cookies: cookie, payload: payload as never })
}

/** 빈 페이지의 `/root/children/0`에 Text 노드를 하나 넣는 연산. 대부분의 케이스가 이걸 쓴다. */
function textOp(id = 'n_route000001'): PatchOp {
  return { op: 'add', path: '/root/children/0', value: { id, type: 'Text', props: { content: '본문' } } }
}

describe('PATCH /api/projects/:projectId/pages/:pageId/ops', () => {
  it('유효한 ops는 200과 seq·inverse를 준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const body = res.json()
      expect(body.seq).toBe(1)
      // `Array.isArray(inverse)`만 보면 응답이 빈 배열을 실어도 초록이다 — undo가
      // 통째로 죽어 있어도 통과하는 단언이므로 실제 역연산까지 못박는다
      // (배열에 끼워 넣은 add의 역은 같은 자리의 remove다, `patch/inverse.ts`).
      expect(body.inverse).toEqual([{ op: 'remove', path: '/root/children/0' }])
    })
  })

  it('응답은 계약된 키만 담는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // 파이프라인의 성공 결과에는 `schema`(적용 후 문서 전체)도 들어 있다. 그걸
      // 그대로 스프레드해 흘려보내면 편집 응답마다 문서 전체가 실려 나간다 —
      // 클라이언트는 ops를 자기도 적용했으므로 필요 없다. 이 단언이 그 누수를 막는다.
      expect(Object.keys(res.json()).sort()).toEqual(['inverse', 'revisionId', 'schemaVersion', 'seq'])
    })
  })

  it('clientOpId를 그대로 되돌려 준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()], clientOpId: 'c_1' }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().clientOpId).toBe('c_1')
    })
  })

  it('baseSeq가 낡으면 409다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const first = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, fx.owner.cookie)
      expect(first.statusCode, first.body).toBe(200)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp('n_route000002')] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(409)
      expect(res.json().error.code).toBe('conflict')
      // 현재 head_seq가 메시지에 실려야 한다(에러 봉투에 새 필드를 만들지 않는다는
      // 규칙 때문에 메시지가 유일한 자리다). '1'만 찾으면 요청 baseSeq 쪽 숫자와
      // 구분되지 않으므로 라벨까지 함께 본다 — 두 숫자가 뒤바뀌면 실패해야 한다.
      expect(res.json().error.message).toContain('현재 1')
      expect(res.json().error.message).toContain('요청 baseSeq 0')
    })
  })

  it('없는 경로는 409다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(
        ctx,
        fx,
        { baseSeq: 0, ops: [{ op: 'replace', path: '/root/children/9/props/x', value: 1 }] },
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(409)
      // stale(위 케이스)도 409/conflict라, 상태와 코드만 보면 두 사유를 같은 응답으로
      // 뭉개도 두 테스트가 모두 초록이다. 메시지로 사유를 구분한다.
      expect(res.json().error.message).toContain('편집을 적용할 수 없습니다')
    })
  })

  it('카탈로그 위반은 422이고 issues를 담는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(
        ctx,
        fx,
        { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_bogus00001', type: 'Bogus' } }] },
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(422)
      expect(res.json().error.code).toBe('validation-failed')
      // `issues`가 있기만 한 게 아니라 파이프라인의 ValidationIssue가 그대로
      // 실려야 한다 — 클라이언트가 어느 노드가 왜 틀렸는지 보여주는 근거다.
      expect(res.json().error.issues[0].code).toBe('unknown-type')
      expect(res.json().error.issues[0].nodeId).toBe('n_bogus00001')
    })
  })

  it('NUL 문자는 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(
        ctx,
        fx,
        {
          baseSeq: 0,
          ops: [
            { op: 'add', path: '/root/children/0', value: { id: 'n_nul0000001', type: 'Text', props: { content: `a${NUL}b` } } },
          ],
        },
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(400)
      expect(res.json().error.code).toBe('bad-request')
      expect(res.json().error.message).toContain('NUL')
    })
  })

  it('지원하지 않는 버전은 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // 제약 위반이 날 수 있는 직접 조작은 withTransaction으로 감싼다
      // (`helpers.ts`의 트랜잭션 오염 주석, `edit-pipeline.test.ts`와 같은 관례).
      await withTransaction(ctx.db, (trx) =>
        trx
          .updateTable('pages')
          .set({ schema: JSON.stringify({ version: 999, root: { id: 'n_root', type: 'Page', children: [] } }) })
          .where('id', '=', fx.page.id)
          .execute(),
      )

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
      // NUL(위 케이스)도 400/bad-request다. 메시지로 사유를 구분한다.
      expect(res.json().error.message).toContain('지원하지 않는 문서 버전')
    })
  })

  it('baseSeq가 없으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { ops: [textOp()] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('baseSeq가 음수면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: -1, ops: [textOp()] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('선언 안 된 키가 있으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()], foo: 1 }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('op가 네 종류 밖이면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // RFC 6902의 copy는 wirebound의 PatchOp에 없다(`patch/types.ts`: add·remove·
      // replace·move 넷뿐). 파이프라인은 op 종류를 검사하지 않으므로 — applyOp의
      // switch가 아는 네 종류 밖이면 아무 분기도 타지 않고 문서를 그대로 돌려준다 —
      // 여기서 막지 않으면 "아무 일도 안 일어났는데 revision은 남는" 편집이 된다.
      const res = await patchOps(
        ctx,
        fx,
        { baseSeq: 0, ops: [{ op: 'copy', path: '/root/children/0', from: '/root' }] },
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('path가 /root 밖이면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // 파이프라인도 /version 편집을 422(invalid)로 막지만, 기대를 400으로 못박아야
      // zod 제약(PatchPath)이 사라진 순간을 이 테스트가 잡는다.
      const res = await patchOps(
        ctx,
        fx,
        { baseSeq: 0, ops: [{ op: 'replace', path: '/version', value: 2 }] },
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('move의 from이 /root 밖이면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(
        ctx,
        fx,
        { baseSeq: 0, ops: [{ op: 'move', path: '/root/children/0', from: '/version' }] },
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('add에 value 키가 없으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/0' }] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
      // 어느 필드가 문제인지까지 고정한다 — 400이기만 하면 path 제약이 잘못 걸려
      // 실패해도 통과해 버린다.
      expect(res.json().error.issues.some((issue: { path: string }) => issue.path.endsWith('value'))).toBe(true)
    })
  })

  it('add의 value가 null이면 통과한다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // `null`을 넣을 수 있는 자리를 먼저 만든다. 카탈로그의 컴포넌트 props는 전부
      // 엄격한 타입(문자열·enum 등)이라 null을 받지 못하고, 스키마 전체에서 임의의
      // JSON 값을 담도록 선언된 필드는 상호작용 액션 `setProp`의 `value`뿐이다
      // (`envelope.ts`의 `SetPropActionSchema`). 그래서 그 자리를 target으로 쓴다.
      const seeded = await patchOps(
        ctx,
        fx,
        {
          baseSeq: 0,
          ops: [
            {
              op: 'add',
              path: '/root/children/0',
              value: {
                id: 'n_null000001',
                type: 'Text',
                props: { content: '본문' },
                interactions: [
                  { on: 'click', actions: [{ type: 'setProp', target: 'n_null000001', prop: 'content', value: '이전' }] },
                ],
              },
            },
          ],
        },
        fx.owner.cookie,
      )
      expect(seeded.statusCode, seeded.body).toBe(200)

      const res = await patchOps(
        ctx,
        fx,
        {
          baseSeq: 1,
          ops: [{ op: 'add', path: '/root/children/0/interactions/0/actions/0/value', value: null }],
        },
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(200)
      // 200이기만 하면 zod가 null을 다른 값으로 바꿔치기해도 통과한다. 실제로
      // null이 저장됐는지 확인한다.
      const row = await ctx.db.selectFrom('pages').select('schema').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      const doc = row.schema as { root: { children: { interactions: { actions: { value: unknown }[] }[] }[] } }
      expect(doc.root.children[0]?.interactions[0]?.actions[0]?.value).toBeNull()
    })
  })

  it('ops가 200개를 넘으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // 201개 전부가 그 자체로는 유효한 연산이다 — 상한이 없으면 이 요청은 200이
      // 된다. 실패할 연산으로 채우면 상한을 지워도 다른 사유(409)로 4xx가 나와
      // 이 테스트가 상한을 검사하는지 알 수 없게 된다.
      const ops = Array.from({ length: 201 }, (_, index) => ({
        op: 'add',
        path: '/root/children/-',
        value: { id: `n_bulk${String(index).padStart(6, '0')}`, type: 'Text', props: { content: 'x' } },
      }))

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('ops가 빈 배열이면 200이고 seq가 오른다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [] }, fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().seq).toBe(1)
      expect(res.json().inverse).toEqual([])
      // "seq가 오른다"는 응답 숫자가 아니라 페이지의 head_seq가 실제로 올랐다는 뜻이다.
      const row = await ctx.db.selectFrom('pages').select('head_seq').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      expect(Number(row.head_seq)).toBe(1)
    })
  })

  it('없는 페이지는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(
        ctx,
        fx,
        { baseSeq: 0, ops: [textOp()] },
        fx.owner.cookie,
        `/api/projects/${fx.project.id}/pages/${NONEXISTENT_UUID}/ops`,
      )

      expect(res.statusCode, res.body).toBe(404)
      expect(res.json().error.code).toBe('not-found')

      // 라우트를 아예 등록하지 않아도 Fastify가 404를 주므로, 위 두 줄만으로는
      // "라우트가 없다"와 "페이지가 없다"가 구분되지 않는다(실측: 핸들러를 만들기
      // 전에도 이 테스트만 초록이었다). 같은 URL 모양이 실제 pageId로는 200이라는
      // 것까지 확인해야 404가 페이지 부재를 뜻한다.
      const exists = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, fx.owner.cookie)
      expect(exists.statusCode, exists.body).toBe(200)
    })
  })

  /**
   * 아래 세 케이스(viewer 403 / 비멤버 404 / 미인증 401)는 `permission-matrix.test.ts`의
   * '페이지 ops 편집' 행과 겹친다. 일부러 둘 다 둔다 — 매트릭스는 상태 코드만 보지만
   * (`expectedRejection`), 여기서는 에러 봉투의 `code`까지 고정한다. 그리고 매트릭스는
   * 엔드포인트 행을 지우면 조용히 사라지는 반면 이쪽은 이 파일에 남는다.
   */
  it('viewer는 403이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const viewer = await signup(ctx)
      await addMember(ctx, fx.project.id, viewer.user.id, 'viewer')

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, viewer.cookie)

      expect(res.statusCode, res.body).toBe(403)
      expect(res.json().error.code).toBe('forbidden')
    })
  })

  it('비멤버는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const outsider = await signup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, outsider.cookie)

      // 프로젝트가 없는 경우와 구분하지 않는다 — 프로젝트 id의 존재가 비멤버에게
      // 새어 나가면 안 된다(설계 §10).
      expect(res.statusCode, res.body).toBe(404)
      expect(res.json().error.code).toBe('not-found')

      // '없는 페이지는 404다'와 같은 이유: 라우트가 없어도 404가 나오므로, 같은
      // 요청이 멤버에게는 200이라는 것까지 봐야 이 404가 인가 판정의 결과가 된다.
      const member = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, fx.owner.cookie)
      expect(member.statusCode, member.body).toBe(200)
    })
  })

  it('미인증은 401이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, undefined)

      expect(res.statusCode, res.body).toBe(401)
      expect(res.json().error.code).toBe('unauthenticated')
    })
  })

  it('editor는 편집할 수 있다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const editor = await signup(ctx)
      await addMember(ctx, fx.project.id, editor.user.id, 'editor')

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, editor.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // 200을 받았다는 것과 실제로 저장됐다는 것은 다르다.
      const row = await ctx.db.selectFrom('pages').select('schema').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      const doc = row.schema as { root: { children: { id: string }[] } }
      expect(doc.root.children[0]?.id).toBe('n_route000001')
    })
  })

  it('revision의 actor가 요청한 사용자다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const editor = await signup(ctx)
      await addMember(ctx, fx.project.id, editor.user.id, 'editor')

      const res = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp()] }, editor.cookie)
      expect(res.statusCode, res.body).toBe(200)

      const row = await ctx.db
        .selectFrom('revisions')
        .select(['id', 'actor_type', 'actor_id', 'actor_label'])
        .where('page_id', '=', fx.page.id)
        .executeTakeFirstOrThrow()

      expect(row.id).toBe(res.json().revisionId)
      expect(row.actor_type).toBe('user')
      // 라우트가 actor를 세션이 아니라 소유자(페이지를 만든 사람)에서 가져오면 이
      // 단언이 실패한다 — 그래서 owner가 아닌 editor로 편집한다.
      expect(row.actor_id).toBe(editor.user.id)
      expect(row.actor_label).toBe(editor.user.name)
      expect(row.actor_id).not.toBe(fx.owner.user.id)
    })
  })
})

/** `GET .../revisions` 응답 항목. 응답은 `any`로 오므로 단언에 쓸 형태를 여기서 못박는다. */
interface RevisionResponse {
  id: string
  seq: number
  actorType: string
  actorId: string | null
  actorLabel: string
  ops: PatchOp[]
  inverse: PatchOp[]
  createdAt: string
}

function revisionsUrl(fx: Fixture, query = ''): string {
  return `/api/projects/${fx.project.id}/pages/${fx.page.id}/revisions${query}`
}

function getRevisions(ctx: TestContext, url: string, cookie: { wb_session: string } | undefined) {
  return ctx.app.inject({ method: 'GET', url, cookies: cookie })
}

/**
 * 편집을 `count`회 적용해 revision을 `count`개 만든다(seq는 1..count).
 *
 * 노드 id를 매번 다르게 준다 — 같은 id를 두 번 넣으면 카탈로그 검증이 `duplicate-id`로
 * 막아 픽스처가 200을 받지 못한다. 200이 아니면 여기서 던진다: 이력이 조용히 덜 만들어진
 * 채로 아래 단언이 도는 것보다 픽스처 실패로 죽는 편이 낫다.
 */
async function editTimes(ctx: TestContext, fx: Fixture, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const res = await patchOps(
      ctx,
      fx,
      { baseSeq: index, ops: [textOp(`n_seed${String(index).padStart(6, '0')}`)] },
      fx.owner.cookie,
    )
    if (res.statusCode !== 200) {
      throw new Error(`편집 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
    }
  }
}

/**
 * `GET /api/projects/:projectId/pages/:pageId/revisions`의 라우트 테스트다.
 *
 * 이 엔드포인트의 존재 이유는 설계 §7.3의 "새로고침 후 undo 스택 복원"이다 —
 * 클라이언트가 페이지를 다시 열면 자기 actor의 최근 revision을 받아 그 `inverse`만으로
 * 스택을 재구성한다. 그래서 '`inverse`를 그대로 실어 준다'가 이 스위트의 중심이고,
 * 나머지는 그 주변의 계약(정렬·필터·상한·권한)이다.
 *
 * **404 케이스마다 양성 대조(같은 URL 모양이 정상 조건에서는 200)를 함께 둔다.**
 * 라우트를 아예 등록하지 않아도 Fastify가 404를 주므로, 상태 코드만 보는 404 테스트는
 * 라우트가 없어도 초록이다(이 저장소에서 실제로 그렇게 통과한 테스트가 있었다).
 */
describe('GET /api/projects/:projectId/pages/:pageId/revisions', () => {
  it('기본은 그 페이지의 모든 revision을 seq 내림차순으로 준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 3)

      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // 삽입 순서(1,2,3)와 기대 순서(3,2,1)가 반대다 — 두 순서가 같으면 정렬을
      // 통째로 지워도 Postgres가 우연히 같은 순서를 돌려줘 통과할 수 있다.
      const body: RevisionResponse[] = res.json()
      expect(body.map((revision) => revision.seq)).toEqual([3, 2, 1])
    })
  })

  it('배열을 그대로 낸다 (봉투가 없다)', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 1)

      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // `/projects`·`/members`·`/menu`가 전부 배열을 그대로 낸다. `{ revisions: [...] }`
      // 같은 두 번째 관용구를 늘리지 않는다.
      expect(Array.isArray(res.json())).toBe(true)
    })
  })

  it('각 항목은 계약된 키만 담는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 1)

      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const [first] = res.json() as RevisionResponse[]
      // 저장소 레코드를 그대로 흘려보내면 나중에 그 타입에 필드가 붙는 순간(예:
      // `pageId`) 응답 계약이 조용히 넓어진다. 라우트의 명시적 투영이 그것을 막는다.
      expect(Object.keys(first ?? {}).sort()).toEqual(
        ['id', 'seq', 'actorType', 'actorId', 'actorLabel', 'ops', 'inverse', 'createdAt'].sort(),
      )
    })
  })

  it('createdAt은 ISO 8601이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 1)

      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const [first] = res.json() as RevisionResponse[]
      // `invitedAt`(멤버 목록)과 같은 형식이다 — `Date`를 그대로 반환하고 Fastify가
      // 직렬화한다. 정규식만으로는 "그럴듯한 문자열"도 통과하므로 파싱까지 확인한다.
      expect(first?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(Number.isNaN(Date.parse(first?.createdAt ?? ''))).toBe(false)
    })
  })

  it('mine=true는 내 revision만 준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const editor = await signup(ctx)
      await addMember(ctx, fx.project.id, editor.user.id, 'editor')

      // 내 편집이 먼저(seq 1), 남의 편집이 나중(seq 2)이다. 필터가 사라지면 최신
      // 항목이 남의 것이 되므로 길이와 actorId 둘 다 어긋난다.
      const mine = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp('n_mine000001')] }, fx.owner.cookie)
      expect(mine.statusCode, mine.body).toBe(200)
      const other = await patchOps(ctx, fx, { baseSeq: 1, ops: [textOp('n_other00001')] }, editor.cookie)
      expect(other.statusCode, other.body).toBe(200)

      const res = await getRevisions(ctx, revisionsUrl(fx, '?mine=true'), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const body: RevisionResponse[] = res.json()
      expect(body.map((revision) => revision.seq)).toEqual([1])
      expect(body[0]?.actorId).toBe(fx.owner.user.id)
    })
  })

  it('mine=false는 전부 준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const editor = await signup(ctx)
      await addMember(ctx, fx.project.id, editor.user.id, 'editor')

      const mine = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp('n_mine000002')] }, fx.owner.cookie)
      expect(mine.statusCode, mine.body).toBe(200)
      const other = await patchOps(ctx, fx, { baseSeq: 1, ops: [textOp('n_other00002')] }, editor.cookie)
      expect(other.statusCode, other.body).toBe(200)

      const res = await getRevisions(ctx, revisionsUrl(fx, '?mine=false'), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const body: RevisionResponse[] = res.json()
      expect(body.map((revision) => revision.actorId)).toEqual([editor.user.id, fx.owner.user.id])
    })
  })

  it('mine을 생략하면 전부 준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const editor = await signup(ctx)
      await addMember(ctx, fx.project.id, editor.user.id, 'editor')

      const mine = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp('n_mine000003')] }, fx.owner.cookie)
      expect(mine.statusCode, mine.body).toBe(200)
      const other = await patchOps(ctx, fx, { baseSeq: 1, ops: [textOp('n_other00003')] }, editor.cookie)
      expect(other.statusCode, other.body).toBe(200)

      // 브리프의 18개 케이스에 없던 행이다. `mine=false`만 검사하면 "생략도 내 것만"
      // (기본값을 mine으로 뒤집는 변이)이 아무 테스트에도 안 걸린다 — 다른 케이스는
      // 전부 한 사용자만 편집하기 때문이다.
      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const body: RevisionResponse[] = res.json()
      expect(body.map((revision) => revision.actorId)).toEqual([editor.user.id, fx.owner.user.id])
    })
  })

  it('limit을 지킨다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 5)

      const res = await getRevisions(ctx, revisionsUrl(fx, '?limit=2'), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // 개수만 보면 "앞에서 2개"(오래된 것)를 잘라도 통과한다. 최신 2개인지까지 본다.
      const body: RevisionResponse[] = res.json()
      expect(body.map((revision) => revision.seq)).toEqual([5, 4])
    })
  })

  it('limit 기본값은 50이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 3)

      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // **이 이름은 실제보다 강한 주장을 한다.** 여기서 증명되는 것은 "limit을 생략해도
      // 200이고 3개가 전부 온다"뿐이다 — 기본값이 3 이상인 어떤 값이어도(50이든 200이든)
      // 이 단언은 통과한다. 51개를 만들어 50을 확인하는 것이 진짜 검사지만 그만큼 느리다.
      expect((res.json() as RevisionResponse[]).map((revision) => revision.seq)).toEqual([3, 2, 1])
    })
  })

  it('limit이 200을 넘으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await getRevisions(ctx, revisionsUrl(fx, '?limit=201'), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
      expect(res.json().error.code).toBe('bad-request')
    })
  })

  it('limit이 0이면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await getRevisions(ctx, revisionsUrl(fx, '?limit=0'), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('limit이 숫자가 아니면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await getRevisions(ctx, revisionsUrl(fx, '?limit=abc'), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('선언 안 된 쿼리 키가 있으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // 본문 스키마와 같은 관례(`z.strictObject`)를 쿼리에도 적용한다. 이 케이스가
      // 없으면 `strictObject`를 `object`로 바꿔도 아무 테스트가 실패하지 않는다.
      const res = await getRevisions(ctx, revisionsUrl(fx, '?since=3'), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(400)
    })
  })

  it('없는 페이지는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await getRevisions(
        ctx,
        `/api/projects/${fx.project.id}/pages/${NONEXISTENT_UUID}/revisions`,
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(404)
      expect(res.json().error.code).toBe('not-found')

      // 양성 대조. 라우트를 등록하지 않아도 Fastify가 404를 주므로 위 두 줄만으로는
      // "라우트가 없다"와 "페이지가 없다"가 구분되지 않는다.
      const exists = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)
      expect(exists.statusCode, exists.body).toBe(200)
    })
  })

  it('다른 프로젝트의 페이지는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 1)

      // **실재하는** 다른 프로젝트의 페이지를 쓴다. 임의 uuid로는 이 케이스가
      // 아무것도 판별하지 못한다 — 페이지 존재 확인을 지워도 조회 결과가 비어 있어
      // 404가 아닌 200이 나오는지 알 수 없기 때문이다. 그 페이지에 이력까지 남겨
      // 두면, 존재 확인이 사라지는 순간 이 요청이 200과 **남의 프로젝트 이력**을
      // 돌려주고 이 단언이 실패한다(설계 §10).
      const outsider = await signup(ctx)
      const otherProject = await createProject(ctx, outsider.cookie)
      const otherMenu = await createMenuNode(ctx, outsider.cookie, otherProject.id)
      const otherPage = await createPage(ctx, outsider.cookie, otherProject.id, otherMenu.id)
      const seeded = await patchOps(
        ctx,
        fx,
        { baseSeq: 0, ops: [textOp('n_leak000001')] },
        outsider.cookie,
        `/api/projects/${otherProject.id}/pages/${otherPage.id}/ops`,
      )
      expect(seeded.statusCode, seeded.body).toBe(200)

      const res = await getRevisions(
        ctx,
        `/api/projects/${fx.project.id}/pages/${otherPage.id}/revisions`,
        fx.owner.cookie,
      )

      expect(res.statusCode, res.body).toBe(404)
      expect(res.json().error.code).toBe('not-found')

      // 양성 대조 — 같은 URL 모양이 내 프로젝트의 페이지로는 200이다.
      const exists = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)
      expect(exists.statusCode, exists.body).toBe(200)
    })
  })

  it('viewer도 읽을 수 있다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await editTimes(ctx, fx, 1)
      const viewer = await signup(ctx)
      await addMember(ctx, fx.project.id, viewer.user.id, 'viewer')

      const res = await getRevisions(ctx, revisionsUrl(fx), viewer.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // 200이기만 하면 viewer에게 빈 배열을 돌려줘도 통과한다. 이력이 실제로 보이는지
      // 확인한다 — 이 엔드포인트는 조회 전용이므로 viewer가 남의 편집도 볼 수 있다.
      expect((res.json() as RevisionResponse[]).map((revision) => revision.seq)).toEqual([1])
    })
  })

  it('비멤버는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const outsider = await signup(ctx)

      const res = await getRevisions(ctx, revisionsUrl(fx), outsider.cookie)

      // 프로젝트가 없는 경우와 구분하지 않는다(설계 §10).
      expect(res.statusCode, res.body).toBe(404)
      expect(res.json().error.code).toBe('not-found')

      const member = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)
      expect(member.statusCode, member.body).toBe(200)
    })
  })

  it('미인증은 401이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await getRevisions(ctx, revisionsUrl(fx), undefined)

      expect(res.statusCode, res.body).toBe(401)
      expect(res.json().error.code).toBe('unauthenticated')
    })
  })

  it('이력이 없으면 빈 배열이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      // 페이지 생성(`POST .../pages`)은 편집이 아니므로 revision을 남기지 않는다 —
      // 새 페이지의 head_seq는 0이고 이력은 비어 있다.
      expect(res.json()).toEqual([])
    })
  })

  it('inverse를 그대로 실어 준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp('n_undo000001')] }, fx.owner.cookie)
      expect(edit.statusCode, edit.body).toBe(200)

      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const [first] = res.json() as RevisionResponse[]
      // **이 단언이 이 엔드포인트의 존재 이유다**(설계 §7.3): 새로고침한 클라이언트가
      // 여기서 받은 `inverse`를 그대로 `PATCH .../ops`로 되보내 undo를 한다.
      expect(first?.inverse).toEqual(edit.json().inverse)
      // 위 한 줄만으로는 양쪽이 나란히 빈 배열이어도 통과한다. 실제 역연산까지 못박는다.
      expect(first?.inverse).toEqual([{ op: 'remove', path: '/root/children/0' }])
      // `ops`·`id`도 함께 확인한다 — 세 필드를 서로 바꿔 실어도 위 단언만으로는
      // `inverse` 자리만 맞으면 통과한다.
      expect(first?.ops).toEqual([textOp('n_undo000001')])
      expect(first?.id).toBe(edit.json().revisionId)
    })
  })

  it('actor 필드는 편집한 사용자를 가리킨다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const editor = await signup(ctx)
      await addMember(ctx, fx.project.id, editor.user.id, 'editor')

      const edit = await patchOps(ctx, fx, { baseSeq: 0, ops: [textOp('n_actor00001')] }, editor.cookie)
      expect(edit.statusCode, edit.body).toBe(200)

      // 브리프의 18개 케이스에 없던 행이다. 나머지 케이스는 `actorId`만 보므로
      // 응답 투영이 `actorLabel`·`actorType`을 엉뚱한 필드에서 채워도 잡히지 않는다.
      // 편집자를 owner가 아닌 다른 사람으로 두어 "페이지 소유자를 실어 준다"는 오류도
      // 함께 배제한다.
      const res = await getRevisions(ctx, revisionsUrl(fx), fx.owner.cookie)

      expect(res.statusCode, res.body).toBe(200)
      const [first] = res.json() as RevisionResponse[]
      expect(first?.actorType).toBe('user')
      expect(first?.actorId).toBe(editor.user.id)
      expect(first?.actorLabel).toBe(editor.user.name)
    })
  })
})
