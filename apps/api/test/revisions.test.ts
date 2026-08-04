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
 * `PATCH /api/projects/:projectId/pages/:pageId/ops`의 라우트 테스트다.
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
