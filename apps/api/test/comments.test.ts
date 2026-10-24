/**
 * 코멘트 라우트. 설계서 「설계서 화면 구조」의 *"우측 코멘트 탭 + 캔버스 번호 마커"*의 서버 쪽이다.
 *
 * **이 파일이 재는 것의 축은 둘이다.**
 *
 * 1. **표의 일**(본문·작성자·시각) — 평범한 CRUD다.
 * 2. **문서의 일**(번호) — `POST`·`DELETE`·`renumber`가 편집 파이프라인을 지나
 *    `pages.schema`의 `marker`를 바꾸고 revision을 남긴다. 그 둘이 **한
 *    트랜잭션 안에서** 움직이는지까지 본다.
 */
import { describe, expect, it } from 'vitest'
import { COMMENT_BODY_MAX_LENGTH, COMMENT_BODY_MIN_LENGTH, type PageDocument } from '@wirebound/schema'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

/** 노드 셋을 가진 문서. 번호가 여럿 붙는 케이스가 필요로 한다. */
function docWithThree(): PageDocument {
  return {
    version: 4,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_a', type: 'Text', props: { content: '가' } },
        { id: 'n_b', type: 'Text', props: { content: '나' } },
        { id: 'n_c', type: 'Text', props: { content: '다' } },
      ],
    },
  }
}

interface Fixture {
  cookie: { wb_session: string }
  userId: string
  userName: string
  projectId: string
  pageId: string
  /** 처음 만든 페이지의 루트 노드 id. `docWithThree`를 싣기 전의 값이다. */
  rootNodeId: string
}

/** owner 하나 · 프로젝트 하나 · 페이지 하나. 거의 모든 케이스가 이것으로 출발한다. */
async function setup(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)

  return {
    cookie: owner.cookie,
    userId: owner.user.id,
    userName: owner.user.name,
    projectId: project.id,
    pageId: page.id,
    rootNodeId: (page.schema as { root: { id: string } }).root.id,
  }
}

/** 페이지에 `docWithThree`를 싣는다. 반환값은 그 뒤의 `headSeq`다. */
async function putThree(ctx: TestContext, fx: Fixture): Promise<number> {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/schema`,
    cookies: fx.cookie,
    payload: { schema: docWithThree() },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json().headSeq
}

function commentsUrl(fx: Fixture): string {
  return `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`
}

/** 지금 저장된 문서. 번호가 실제로 문서에 실렸는지 보는 유일한 관문이다. */
async function readDoc(ctx: TestContext, fx: Fixture): Promise<PageDocument> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
    cookies: fx.cookie,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json().schema
}

/** 문서에서 노드 하나의 `marker`. 노드가 없으면 `'없는 노드'`를 낸다(오진을 막는다). */
function markerOf(document: PageDocument, nodeId: string): number | undefined | '없는 노드' {
  const found = [document.root, ...(document.root.children ?? [])].find((node) => node.id === nodeId)
  return found === undefined ? '없는 노드' : found.marker
}

async function postComment(ctx: TestContext, fx: Fixture, nodeId: string, body = '검색 조건은 AND 결합', cookie = fx.cookie) {
  return ctx.app.inject({ method: 'POST', url: commentsUrl(fx), cookies: cookie, payload: { nodeId, body } })
}

describe('GET .../comments', () => {
  it('코멘트가 없으면 빈 배열이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const res = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: fx.cookie })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })

  it('작성자 이름이 함께 온다 — 화면이 누가 말했는지 그린다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await postComment(ctx, fx, fx.rootNodeId)

      const res = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: fx.cookie })
      const [comment] = res.json()

      expect(comment.authorId).toBe(fx.userId)
      expect(comment.authorName).toBe(fx.userName)
      expect(comment.nodeId).toBe(fx.rootNodeId)
      expect(comment.body).toBe('검색 조건은 AND 결합')
    })
  })

  it('먼저 단 코멘트가 먼저 온다', async () => {
    // **`created_at`이 `now()`면 이 케이스가 죽는다.** `withApi`가 테스트 하나를
    // 트랜잭션 하나로 감싸므로 `now()`는 두 행에 같은 값을 준다 — 그러면 순서가
    // 2차 키(랜덤 uuid)로 갈려 매 실행 결과가 달라진다. 그래서 0008이
    // `clock_timestamp()`를 쓴다(그 마이그레이션의 주석).
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await postComment(ctx, fx, fx.rootNodeId, '첫째')
      await postComment(ctx, fx, fx.rootNodeId, '둘째')
      await postComment(ctx, fx, fx.rootNodeId, '셋째')

      const res = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: fx.cookie })

      expect(res.json().map((comment: { body: string }) => comment.body)).toEqual(['첫째', '둘째', '셋째'])
    })
  })

  it('남의 프로젝트 페이지 id로는 볼 수 없다 — 페이지 존재를 먼저 본다', async () => {
    // `comments`에는 `project_id`가 없다. 이 확인이 없으면 자기 프로젝트 경로에 남의
    // 페이지 id를 실어 그 페이지의 코멘트를 그대로 받는다(설계서 「권한 모델」).
    await withApi(async (ctx) => {
      const mine = await setup(ctx)
      const theirs = await setup(ctx)
      await postComment(ctx, theirs, theirs.rootNodeId, '남의 말')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${mine.projectId}/pages/${theirs.pageId}/comments`,
        cookies: mine.cookie,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  it('viewer도 읽는다 — 조회는 viewer, 쓰기는 editor다(설계서 「권한 모델」)', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await postComment(ctx, fx, fx.rootNodeId)
      const viewer = await signup(ctx)
      await addMember(ctx, fx.projectId, viewer.user.id, 'viewer')

      const read = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: viewer.cookie })
      const write = await postComment(ctx, fx, fx.rootNodeId, '읽기 전용', viewer.cookie)

      expect(read.statusCode).toBe(200)
      expect(read.json()).toHaveLength(1)
      expect(write.statusCode).toBe(403)
    })
  })
})

describe('POST .../comments — 번호 부여', () => {
  it('첫 코멘트가 노드에 1번을 만들고 문서에 남긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const before = await readDoc(ctx, fx)
      expect(markerOf(before, fx.rootNodeId)).toBeUndefined()

      const res = await postComment(ctx, fx, fx.rootNodeId)

      expect(res.statusCode, res.body).toBe(201)
      expect(res.json().marker).toBe(1)
      expect(res.json().markerOps).toEqual([{ op: 'add', path: '/root/marker', value: 1 }])
      expect(markerOf(await readDoc(ctx, fx), fx.rootNodeId)).toBe(1)
    })
  })

  it('번호 부여가 revision을 남긴다 — undo가 그것을 되돌릴 수 있다는 뜻이다', async () => {
    // **`routes/comments.ts` 머리말의 «대가 1»(undo가 번호를 되돌린다)을 실제로 재는 자리다.** 파이프라인을 안 타면 이 케이스가
    // 죽는다 — 그리고 `head_seq`가 안 올라 그 뒤 편집의 `baseSeq`가 틀어진다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await postComment(ctx, fx, fx.rootNodeId)

      const revisions = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/revisions?mine=true`,
        cookies: fx.cookie,
      })
      const [latest] = revisions.json()

      expect(latest.seq).toBe(created.json().seq)
      expect(latest.ops).toEqual([{ op: 'add', path: '/root/marker', value: 1 }])
      // undo가 되보낼 것. 번호가 사라지고 코멘트 행은 남는다(라우트 머리말의 대가 1).
      expect(latest.inverse).toEqual([{ op: 'remove', path: '/root/marker' }])
    })
  })

  it('같은 노드의 둘째 코멘트는 번호를 나눠 쓰고 문서를 안 바꾼다(D3)', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const first = await postComment(ctx, fx, fx.rootNodeId, '첫째')
      const second = await postComment(ctx, fx, fx.rootNodeId, '둘째')

      expect(second.json().marker).toBe(1)
      expect(second.json().markerOps).toEqual([])
      // **`seq`가 안 오른다** — 아무것도 안 바꾼 revision을 쌓지 않는다는 뜻이다.
      expect(second.json().seq).toBe(first.json().seq)
    })
  })

  it('다른 노드의 첫 코멘트는 다음 번호를 받는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await putThree(ctx, fx)

      const a = await postComment(ctx, fx, 'n_a')
      const c = await postComment(ctx, fx, 'n_c')

      expect(a.json().marker).toBe(1)
      expect(c.json().marker).toBe(2)
      const document = await readDoc(ctx, fx)
      expect(markerOf(document, 'n_a')).toBe(1)
      expect(markerOf(document, 'n_b')).toBeUndefined()
      expect(markerOf(document, 'n_c')).toBe(2)
    })
  })

  it('번호는 최댓값 + 1이다 — 지운 번호를 재사용하지 않는다', async () => {
    // 개수 + 1로 매기면 여기서 `n_c`가 **1번을 다시 받아** 옛 1번을 가리키던 말이
    // 다른 노드를 가리키게 된다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await putThree(ctx, fx)
      const a = await postComment(ctx, fx, 'n_a')
      await postComment(ctx, fx, 'n_b')

      await ctx.app.inject({
        method: 'DELETE',
        url: `${commentsUrl(fx)}/${a.json().comment.id}`,
        cookies: fx.cookie,
      })
      const c = await postComment(ctx, fx, 'n_c')

      expect(c.json().marker).toBe(3)
    })
  })

  it('문서에 없는 노드에는 달 수 없다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const res = await postComment(ctx, fx, 'n_없는노드')

      expect(res.statusCode).toBe(404)
      expect(res.json().error.message).toBe('그 노드가 이 페이지에 없습니다')
    })
  })

  it('본문의 NUL 문자를 400으로 막는다', async () => {
    // 막지 않으면 `text` 컬럼이 삽입 시점에 죽고 그것이 **500**으로 나간다
    // (`repos/comments.ts`의 머리말).
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const res = await postComment(ctx, fx, fx.rootNodeId, `가${String.fromCharCode(0)}나`)

      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('bad-request')
    })
  })

  /**
   * **경계를 숫자로 박지 않고 상수에서 만든다.**
   *
   * 같은 상한을 설계서 「페이지 JSON」의 봉투도 걸어야 한다(가져오기가 이 라우트를 지나지 않는다).
   * 라우트가 상수 대신 `2000`을 그대로 박으면 **값이 두 자리**가 되는데, 이 케이스까지 숫자를
   * 박으면 그 갈림을 **잴 수 없다** — 봉투의 상수를 바꿔도 이 파일이 전부 통과한다.
   *
   * **상수에서 만들면 그 변이가 죽는다:** 라우트가 이어져 있으면 경계가 함께 움직여 통과하고,
   * 누가 다시 박아 두면 두 값이 갈리는 순간 여기가 죽는다.
   */
  it('빈 본문과 상한+1을 막고 상한은 받는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const empty = await postComment(ctx, fx, fx.rootNodeId, '')
      const tooLong = await postComment(ctx, fx, fx.rootNodeId, '가'.repeat(COMMENT_BODY_MAX_LENGTH + 1))
      const atLimit = await postComment(ctx, fx, fx.rootNodeId, '가'.repeat(COMMENT_BODY_MAX_LENGTH))
      const atMin = await postComment(ctx, fx, fx.rootNodeId, '가'.repeat(COMMENT_BODY_MIN_LENGTH))

      expect(empty.statusCode).toBe(400)
      expect(tooLong.statusCode).toBe(400)
      expect(atLimit.statusCode).toBe(201)
      expect(atMin.statusCode).toBe(201)
    })
  })

  it('선언되지 않은 키는 그 자체로 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: commentsUrl(fx),
        cookies: fx.cookie,
        payload: { nodeId: fx.rootNodeId, body: '가', marker: 7 },
      })

      // **`marker`를 본문으로 받지 않는다는 것이 요점이다** — 번호를 정하는 것은
      // 서버이고, 사람이 고치는 경로는 설계서 「설계서 화면 구조」의 재번호 버튼이다.
      expect(res.statusCode).toBe(400)
    })
  })

  it('ops 편집은 낡은 baseSeq 면 409 · 게시는 그 사이 문서가 바뀌었어도 지금 문서에 번호를 매긴다', async () => {
    // 게시는 번호를 잠근 뒤의 문서로 센다(`routes/comments.ts` 머리말 「게시는 잠근 뒤의 문서로 번호를 매긴다」) —
    // 클라이언트의 `baseSeq`를 받지 않으므로 클라이언트가 뒤처져 있어도 거절되지 않는다. 대조로 클라이언트가 낡은
    // `baseSeq`로 낸 ops 편집은 409 다. 겹친 두 게시는 `comments-concurrency.test.ts`가 잰다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const headSeq = await putThree(ctx, fx)

      const stale = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.cookie,
        payload: { baseSeq: headSeq - 1, ops: [{ op: 'add', path: '/root/children/0/marker', value: 1 }] },
      })

      expect(stale.statusCode).toBe(409)
      // 그리고 코멘트 경로는 지금 head를 읽으므로 통과한다.
      expect((await postComment(ctx, fx, 'n_a')).statusCode).toBe(201)
    })
  })
})

/**
 * **멱등 키**(`0012-comment-idempotency-key`). 웹의 쓰기 장부가 응답 없는 게시를
 * 다시 읽어 «안 달림»으로 판정한 뒤 서버가 늦게 커밋하면, 키가 없을 때 다시 단 게시가 **같은 글의 둘째 행**이
 * 된다(`apps/web/src/panels/write-ledger.tsx`의 머리말). 같은 초안은 같은 키를 싣고,
 * 서버는 같은 키면 앞 행을 돌려준다. 무엇을 왜 하는지는 `routes/comments.ts`의 `replayOf`가 갖는다.
 *
 * **각 케이스가 혼자 죽는다** — 변조를 하나씩 심고 백업에서 바이트 비교로 복원하며 잰다(이 절 ·
 * `comments-concurrency.test.ts` · `repos-comments.test.ts` · 웹 케이스를 함께 돌린다):
 *
 * | 변조 | 혼자 죽는 것 |
 * |---|---|
 * | 재생도 번호 변화(`markerOps`)를 다시 싣는다 | *"같은 키가 다시 오면 …"* |
 * | 같은 키에 다른 글이어도 앞 행을 돌려준다 | *"같은 키에 다른 글이 오면 409 …"* |
 * | 그 409 에서 이슈 코드(`REUSED_KEY`)를 뺀다 | *"첫 게시 뒤 그 코멘트가 고쳐졌으면 …"* |
 * | 키가 없어도 같은 (노드, 본문)이면 합친다 | *"키가 없으면 예전 그대로다 …"* |
 * | 키 값을 안 본다(내 키 있는 행이면 합친다) | *"키가 다르면 같은 말이어도 새 행이다"* |
 * | 키의 범위에서 작성자를 뺀다 | *"남이 같은 키를 실어도 …"* |
 * | 노드를 보기 전의 키 확인을 뺀다 | *"첫 게시 뒤 그 노드가 지워졌어도 …"* |
 * | 키의 글자를 안 좁힌다(길이만) | *"키의 글자를 좁힌다 …"* |
 * | 잠금 안의 키 확인을 뺀다 | `comments-concurrency.test.ts`의 *"둘 다 성공하고 …"* |
 * | 유일 색인을 안 만든다(보통 색인으로) | `repos-comments.test.ts`의 *"같은 (페이지, 작성자, 키)의 둘째 행은 …"* |
 *
 * 묶음: 키를 저장하지 않으면 다섯이, 재생도 201 이면 셋이 함께 죽는다.
 */
describe('POST .../comments — 멱등 키', () => {
  function postKeyed(ctx: TestContext, fx: Fixture, nodeId: string, body: string, key: string, cookie = fx.cookie) {
    return ctx.app.inject({
      method: 'POST',
      url: commentsUrl(fx),
      cookies: cookie,
      payload: { nodeId, body, idempotencyKey: key },
    })
  }

  async function rows(ctx: TestContext, fx: Fixture): Promise<{ id: string; body: string; authorId: string }[]> {
    const res = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: fx.cookie })
    return res.json()
  }

  it('같은 키가 다시 오면 앞 행을 그대로 돌려준다 — 행이 하나이고 번호가 두 번 오르지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await putThree(ctx, fx)

      const first = await postKeyed(ctx, fx, 'n_b', '같은 말', 'key-1')
      const again = await postKeyed(ctx, fx, 'n_b', '같은 말', 'key-1')

      expect(first.statusCode, first.body).toBe(201)
      // **200 이다** — 이 요청은 아무것도 만들지 않았다.
      expect(again.statusCode, again.body).toBe(200)
      expect(again.json().comment).toEqual(first.json().comment)
      expect(again.json().marker).toBe(1)
      // 이 요청이 문서에 낸 변화가 없다 — 빈 `markerOps`이고 `seq`는 지금의 것이다.
      expect(again.json().markerOps).toEqual([])
      expect(again.json().seq).toBe(first.json().seq)
      expect(await rows(ctx, fx)).toHaveLength(1)

      // **번호가 두 번 오르지 않았다** — 다음 노드의 첫 코멘트가 2번을 받는다(재생이 번호를
      // 하나 먹었으면 3번이다).
      const next = await postComment(ctx, fx, 'n_c', '다음 노드')
      expect(next.json().marker).toBe(2)
    })
  })

  it('같은 키에 다른 글이 오면 409 다 — 앞 행도 새 행도 돌려주지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await putThree(ctx, fx)
      await postKeyed(ctx, fx, 'n_a', '처음 쓴 말', 'key-1')

      const edited = await postKeyed(ctx, fx, 'n_a', '고쳐 쓴 말', 'key-1')
      const moved = await postKeyed(ctx, fx, 'n_b', '처음 쓴 말', 'key-1')

      expect(edited.statusCode, edited.body).toBe(409)
      expect(edited.json().error.message).toBe('같은 멱등 키로 다른 코멘트가 이미 달렸습니다')
      expect(moved.statusCode, moved.body).toBe(409)
      expect((await rows(ctx, fx)).map((row) => row.body)).toEqual(['처음 쓴 말'])
    })
  })

  it('첫 게시 뒤 그 코멘트가 고쳐졌으면 같은 키 · 처음 글도 409 — 이슈 코드로 «그 키의 게시는 이미 달렸다»를 가른다', async () => {
    // 웹이 되살린 키로 처음 글을 다시 보내는 사이 같은 사람이 다른 탭에서 그 코멘트를
    // 고치면 이 409 다. 게시의 409 는 셋이 모두 `code: 'conflict'`라(`routes/comments.ts`의 `REUSED_KEY`) 웹은
    // **이슈 코드**로만 이것을 «달림»으로 읽는다 — 문장은 가르는 값이 아니다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const first = await postKeyed(ctx, fx, fx.rootNodeId, '처음 쓴 말', 'key-1')
      const patched = await ctx.app.inject({
        method: 'PATCH',
        url: `${commentsUrl(fx)}/${first.json().comment.id}`,
        cookies: fx.cookie,
        payload: { body: '다른 탭에서 고친 말' },
      })
      expect(patched.statusCode, patched.body).toBe(200)

      const again = await postKeyed(ctx, fx, fx.rootNodeId, '처음 쓴 말', 'key-1')

      expect(again.statusCode, again.body).toBe(409)
      expect(again.json().error.code).toBe('conflict')
      expect(again.json().error.issues).toEqual([
        { path: 'idempotencyKey', message: '같은 멱등 키로 다른 코멘트가 이미 달렸습니다', code: 'idempotency-key-reused' },
      ])
      expect((await rows(ctx, fx)).map((row) => row.body)).toEqual(['다른 탭에서 고친 말'])
    })
  })

  it('키가 없으면 예전 그대로다 — 같은 말을 두 번 보내면 두 행이다', async () => {
    // **양성 대조.** 이것이 없으면 «키와 무관하게 같은 글이면 합친다»도 위 케이스를 통과한다 —
    // 같은 말을 일부러 두 번 다는 사람(«확인»)의 둘째 행이 사라진다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await postComment(ctx, fx, fx.rootNodeId, '확인')
      await postComment(ctx, fx, fx.rootNodeId, '확인')

      expect(await rows(ctx, fx)).toHaveLength(2)
    })
  })

  it('키가 다르면 같은 말이어도 새 행이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await postKeyed(ctx, fx, fx.rootNodeId, '확인', 'key-1')
      const second = await postKeyed(ctx, fx, fx.rootNodeId, '확인', 'key-2')

      expect(second.statusCode, second.body).toBe(201)
      expect(await rows(ctx, fx)).toHaveLength(2)
    })
  })

  it('남이 같은 키를 실어도 내 행을 받지 않는다 — 범위는 (페이지, 작성자, 키)다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const other = await signup(ctx)
      await addMember(ctx, fx.projectId, other.user.id, 'editor')
      const mine = await postKeyed(ctx, fx, fx.rootNodeId, '같은 말', 'key-1')

      const theirs = await postKeyed(ctx, fx, fx.rootNodeId, '같은 말', 'key-1', other.cookie)

      expect(theirs.statusCode, theirs.body).toBe(201)
      expect(theirs.json().comment.id).not.toBe(mine.json().comment.id)
      expect(theirs.json().comment.authorId).toBe(other.user.id)
      expect(await rows(ctx, fx)).toHaveLength(2)
    })
  })

  it('첫 게시 뒤 그 노드가 지워졌어도 같은 키면 재생한다 — 번호는 `null`이다', async () => {
    // **노드를 보기 전에 키를 본다**(`routes/comments.ts`). 노드부터 보면 여기가 404 다 —
    // 게시는 있는데(«사라진 노드» 무리) «그 노드가 없다»고 말하게 된다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await putThree(ctx, fx)
      const first = await postKeyed(ctx, fx, 'n_a', '가에 단 말', 'key-1')
      const withoutA = docWithThree()
      withoutA.root.children = (withoutA.root.children ?? []).filter((node) => node.id !== 'n_a')
      const put = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/schema`,
        cookies: fx.cookie,
        payload: { schema: withoutA },
      })
      expect(put.statusCode, put.body).toBe(200)

      const again = await postKeyed(ctx, fx, 'n_a', '가에 단 말', 'key-1')

      expect(again.statusCode, again.body).toBe(200)
      expect(again.json().comment.id).toBe(first.json().comment.id)
      expect(again.json().marker).toBeNull()
      expect(await rows(ctx, fx)).toHaveLength(1)
    })
  })

  /**
   * **키 판정이 권한 가드 앞이다**(`routes/comments.ts`의 `replayBeforeGuard`). 가드 뒤에서 보면
   * 여기가 403 · 404 이고, 웹은 다시 보낸 것의 4xx 를 «안 달림»으로 확정해 초안을 연다 — 권한을 되찾아
   * 고쳐 달면 두 행이다.
   *
   * 강등과 제외를 한 케이스에 둔다 — 같은 축(가드가 재생을 가리는가)이고 «키 판정을 가드 뒤로»가 둘을 함께
   * 죽인다. 끝의 새 키 둘은 **대조**다: 재생만 가드 앞이고 새 게시는 가드가 그대로 막는다.
   */
  it('역할이 내려가거나 멤버에서 빠진 뒤에도 같은 키면 재생한다 — 새 키는 가드가 막는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const demoted = await signup(ctx)
      const removed = await signup(ctx)
      await addMember(ctx, fx.projectId, demoted.user.id, 'editor')
      await addMember(ctx, fx.projectId, removed.user.id, 'editor')
      const firstDemoted = await postKeyed(ctx, fx, fx.rootNodeId, '강등 전에 단 말', 'key-d', demoted.cookie)
      const firstRemoved = await postKeyed(ctx, fx, fx.rootNodeId, '빠지기 전에 단 말', 'key-r', removed.cookie)
      expect(firstDemoted.statusCode, firstDemoted.body).toBe(201)
      expect(firstRemoved.statusCode, firstRemoved.body).toBe(201)

      const toViewer = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/members/${demoted.user.id}`,
        cookies: fx.cookie,
        payload: { role: 'viewer' },
      })
      const out = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.projectId}/members/${removed.user.id}`,
        cookies: fx.cookie,
      })
      expect(toViewer.statusCode, toViewer.body).toBe(200)
      expect(out.statusCode, out.body).toBe(204)

      const againDemoted = await postKeyed(ctx, fx, fx.rootNodeId, '강등 전에 단 말', 'key-d', demoted.cookie)
      const againRemoved = await postKeyed(ctx, fx, fx.rootNodeId, '빠지기 전에 단 말', 'key-r', removed.cookie)

      expect(againDemoted.statusCode, againDemoted.body).toBe(200)
      expect(againDemoted.json().comment.id).toBe(firstDemoted.json().comment.id)
      expect(againRemoved.statusCode, againRemoved.body).toBe(200)
      expect(againRemoved.json().comment.id).toBe(firstRemoved.json().comment.id)
      expect(await rows(ctx, fx)).toHaveLength(2)

      const freshDemoted = await postKeyed(ctx, fx, fx.rootNodeId, '강등 뒤의 새 말', 'key-d2', demoted.cookie)
      const freshRemoved = await postKeyed(ctx, fx, fx.rootNodeId, '빠진 뒤의 새 말', 'key-r2', removed.cookie)
      expect(freshDemoted.statusCode, freshDemoted.body).toBe(403)
      expect(freshRemoved.statusCode, freshRemoved.body).toBe(404)
      expect(await rows(ctx, fx)).toHaveLength(2)
    })
  })

  /**
   * **가드 앞에서도 토큰의 스코프는 먼저 본다**(`outOfTokenScope`). 안 보면 다른 프로젝트에 묶인 토큰이 같은
   * 키로 이 페이지의 재생 — 지금의 `head_seq`·번호 — 을 받는다. 스코프 안의 토큰은 재생을 받는다(대조 — «토큰은
   * 재생하지 않는다»가 이 케이스를 통과하지 못하게).
   */
  it('다른 프로젝트에 묶인 토큰은 같은 키여도 재생을 못 받는다 — 404 · 이 프로젝트의 토큰은 받는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const elsewhere = await createProject(ctx, fx.cookie)
      const posted = await postKeyed(ctx, fx, fx.rootNodeId, '세션으로 단 말', 'key-1')
      expect(posted.statusCode, posted.body).toBe(201)

      async function tokenFor(projectId: string): Promise<string> {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${projectId}/tokens`,
          cookies: fx.cookie,
          payload: { name: '재생 토큰' },
        })
        expect(res.statusCode, res.body).toBe(201)
        return `Bearer ${res.json().value}`
      }
      const resend = async (authorization: string) =>
        ctx.app.inject({
          method: 'POST',
          url: commentsUrl(fx),
          headers: { authorization },
          payload: { nodeId: fx.rootNodeId, body: '세션으로 단 말', idempotencyKey: 'key-1' },
        })

      const outOfScope = await resend(await tokenFor(elsewhere.id))
      const inScope = await resend(await tokenFor(fx.projectId))

      expect(outOfScope.statusCode, outOfScope.body).toBe(404)
      expect(inScope.statusCode, inScope.body).toBe(200)
      expect(inScope.json().comment.id).toBe(posted.json().comment.id)
      expect(await rows(ctx, fx)).toHaveLength(1)
    })
  })

  it('키의 글자를 좁힌다 — 영숫자·`-`·`_` 1~64자 밖은 400 이다(NUL 이 컬럼까지 가지 않는다)', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      for (const key of ['', 'a'.repeat(65), 'has space', `nul${String.fromCharCode(0)}`, '한글']) {
        const res = await postKeyed(ctx, fx, fx.rootNodeId, '말', key)
        expect(res.statusCode, `${JSON.stringify(key)} ${res.body}`).toBe(400)
      }
      const ok = await postKeyed(ctx, fx, fx.rootNodeId, '말', 'a'.repeat(64))
      expect(ok.statusCode, ok.body).toBe(201)
      expect(await rows(ctx, fx)).toHaveLength(1)
    })
  })
})

describe('PATCH .../comments/:commentId — 본문 수정', () => {
  it('작성자는 고칠 수 있고 문서는 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await postComment(ctx, fx, fx.rootNodeId, '옛 말')
      const seqAfterCreate = created.json().seq

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `${commentsUrl(fx)}/${created.json().comment.id}`,
        cookies: fx.cookie,
        payload: { body: '새 말' },
      })

      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().body).toBe('새 말')
      // 응답에 `seq`가 없다 — 문서를 안 바꾸므로 실을 변화가 없다.
      expect(res.json().seq).toBeUndefined()
      const page = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
        cookies: fx.cookie,
      })
      expect(page.json().headSeq).toBe(seqAfterCreate)
    })
  })

  it('남의 코멘트는 고칠 수 없다 — 403이다(재라 #2)', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await postComment(ctx, fx, fx.rootNodeId)
      const other = await signup(ctx)
      await addMember(ctx, fx.projectId, other.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `${commentsUrl(fx)}/${created.json().comment.id}`,
        cookies: other.cookie,
        payload: { body: '내가 고친다' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.message).toBe('다른 사람의 코멘트는 고칠 수 없습니다')
    })
  })

  it('남의 페이지에 붙은 코멘트 id로는 못 고친다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const menu = await createMenuNode(ctx, fx.cookie, fx.projectId)
      const other = await createPage(ctx, fx.cookie, fx.projectId, menu.id)
      const created = await postComment(ctx, fx, fx.rootNodeId)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${other.id}/comments/${created.json().comment.id}`,
        cookies: fx.cookie,
        payload: { body: '엉뚱한 페이지' },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})

describe('DELETE .../comments/:commentId — 마지막이면 번호도 간다', () => {
  it('마지막 코멘트를 지우면 문서에서 번호가 사라진다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await postComment(ctx, fx, fx.rootNodeId)
      expect(markerOf(await readDoc(ctx, fx), fx.rootNodeId)).toBe(1)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `${commentsUrl(fx)}/${created.json().comment.id}`,
        cookies: fx.cookie,
      })

      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().markerOps).toEqual([{ op: 'remove', path: '/root/marker' }])
      expect(res.json().seq).toBe(created.json().seq + 1)
      expect(markerOf(await readDoc(ctx, fx), fx.rootNodeId)).toBeUndefined()
    })
  })

  it('마지막이 아니면 번호가 남고 문서도 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const first = await postComment(ctx, fx, fx.rootNodeId, '첫째')
      const second = await postComment(ctx, fx, fx.rootNodeId, '둘째')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `${commentsUrl(fx)}/${first.json().comment.id}`,
        cookies: fx.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().markerOps).toEqual([])
      expect(res.json().seq).toBe(second.json().seq)
      expect(markerOf(await readDoc(ctx, fx), fx.rootNodeId)).toBe(1)
    })
  })

  it('editor는 남의 코멘트도 지운다 — 수정과 갈린다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await postComment(ctx, fx, fx.rootNodeId)
      const other = await signup(ctx)
      await addMember(ctx, fx.projectId, other.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `${commentsUrl(fx)}/${created.json().comment.id}`,
        cookies: other.cookie,
      })

      expect(res.statusCode).toBe(200)
    })
  })

  it('없는 코멘트는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `${commentsUrl(fx)}/00000000-0000-4000-8000-000000000000`,
        cookies: fx.cookie,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  it('노드가 이미 지워졌으면 지울 번호도 없다 — 문서를 안 건드린다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await putThree(ctx, fx)
      const created = await postComment(ctx, fx, 'n_a')

      // 코멘트가 달린 노드를 지운다. `node_id`에 FK가 없으므로 코멘트 행은 남는다.
      const removed = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.cookie,
        payload: { baseSeq: created.json().seq, ops: [{ op: 'remove', path: '/root/children/0' }] },
      })
      expect(removed.statusCode, removed.body).toBe(200)

      const listed = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: fx.cookie })
      expect(listed.json()).toHaveLength(1)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `${commentsUrl(fx)}/${created.json().comment.id}`,
        cookies: fx.cookie,
      })

      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().markerOps).toEqual([])
      expect(res.json().seq).toBe(removed.json().seq)
    })
  })
})

describe('POST .../comments/renumber — 문서 순서대로', () => {
  it('번호가 있는 노드를 1부터 한 patch로 다시 매긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const headSeq = await putThree(ctx, fx)
      // 문서 순서와 어긋나게 번호를 심는다: n_a=5, n_c=2 → 재번호 뒤 n_a=1, n_c=2.
      const planted = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.cookie,
        payload: {
          baseSeq: headSeq,
          ops: [
            { op: 'add', path: '/root/children/0/marker', value: 5 },
            { op: 'add', path: '/root/children/2/marker', value: 2 },
          ],
        },
      })
      expect(planted.statusCode, planted.body).toBe(200)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `${commentsUrl(fx)}/renumber`,
        cookies: fx.cookie,
      })

      expect(res.statusCode, res.body).toBe(200)
      // **한 patch다** — 노드 둘이 하나의 ops 배열에 담긴다.
      expect(res.json().markerOps).toEqual([{ op: 'replace', path: '/root/children/0/marker', value: 1 }])
      expect(res.json().seq).toBe(planted.json().seq + 1)

      const document = await readDoc(ctx, fx)
      expect(markerOf(document, 'n_a')).toBe(1)
      expect(markerOf(document, 'n_c')).toBe(2)
    })
  })

  it('두 노드가 함께 움직여도 revision은 하나다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const headSeq = await putThree(ctx, fx)
      const planted = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.cookie,
        payload: {
          baseSeq: headSeq,
          ops: [
            { op: 'add', path: '/root/children/0/marker', value: 9 },
            { op: 'add', path: '/root/children/1/marker', value: 7 },
          ],
        },
      })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `${commentsUrl(fx)}/renumber`,
        cookies: fx.cookie,
      })

      expect(res.json().markerOps).toHaveLength(2)
      // 노드마다 따로 불렀다면 seq가 둘 올랐을 것이다.
      expect(res.json().seq).toBe(planted.json().seq + 1)
    })
  })

  it('바꿀 것이 없으면 문서를 안 건드린다 — 눌러도 revision이 안 쌓인다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await postComment(ctx, fx, fx.rootNodeId)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `${commentsUrl(fx)}/renumber`,
        cookies: fx.cookie,
      })

      expect(res.json().markerOps).toEqual([])
      expect(res.json().seq).toBe(created.json().seq)
    })
  })

  it('번호가 없는 노드에는 새로 주지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await putThree(ctx, fx)
      await postComment(ctx, fx, 'n_b')

      await ctx.app.inject({ method: 'POST', url: `${commentsUrl(fx)}/renumber`, cookies: fx.cookie })

      const document = await readDoc(ctx, fx)
      expect(markerOf(document, 'n_a')).toBeUndefined()
      expect(markerOf(document, 'n_b')).toBe(1)
      expect(markerOf(document, 'n_c')).toBeUndefined()
    })
  })
})

describe('표와 문서의 경계', () => {
  it('페이지를 지우면 코멘트도 함께 사라진다(CASCADE)', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await postComment(ctx, fx, fx.rootNodeId)

      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
        cookies: fx.cookie,
      })

      const rows = await ctx.db.selectFrom('comments').selectAll().where('page_id', '=', fx.pageId).execute()
      expect(rows).toHaveLength(0)
    })
  })

  it('번호는 남의 편집을 409로 만들고 본문은 아무 신호도 안 만든다', async () => {
    // **"번호는 실시간이고 본문은 아니다"의 비대칭을 HTTP 로 잰다.** 여기서 관찰하는 것은
    // **`head_seq`가 오르는가**이고, 그것이 남의 다음 편집을 409로 만들어 그쪽의 복구
    // 재조회가 번호를 데려온다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const headSeq = await putThree(ctx, fx)

      // ① 코멘트를 단다 — 번호가 붙어 `head_seq`가 오른다.
      const created = await postComment(ctx, fx, 'n_a')
      expect(created.json().seq).toBe(headSeq + 1)

      // 그 사이 남이 들고 있던 baseSeq(=headSeq)로 편집을 내면 409다.
      const afterComment = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.cookie,
        payload: { baseSeq: headSeq, ops: [{ op: 'add', path: '/root/children/1/props', value: {} }] },
      })
      expect(afterComment.statusCode).toBe(409)

      // ② 본문만 고친다 — `head_seq`가 그대로라 남의 편집이 그냥 통과한다.
      const patched = await ctx.app.inject({
        method: 'PATCH',
        url: `${commentsUrl(fx)}/${created.json().comment.id}`,
        cookies: fx.cookie,
        payload: { body: '고친 말' },
      })
      expect(patched.statusCode).toBe(200)

      const afterEdit = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.cookie,
        payload: {
          baseSeq: created.json().seq,
          ops: [{ op: 'add', path: '/root/children/1/props', value: {} }],
        },
      })
      expect(afterEdit.statusCode, afterEdit.body).toBe(200)
    })
  })

  it('번호는 있는데 코멘트 행이 없는 노드가 성립한다', async () => {
    // 도달 경로는 셋이다(undo · JSON 가져오기 · 사람이 직접 편집). 여기서는 셋째를
    // 편집 경로로 만든다. **화면은 문서를 진실로 삼아 번호를 그리고**, 코멘트 탭에는
    // 그 번호 아래 아무것도 없다 — 서버는 그 상태를 고쳐 주지 않는다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const headSeq = await putThree(ctx, fx)
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.cookie,
        payload: { baseSeq: headSeq, ops: [{ op: 'add', path: '/root/children/1/marker', value: 4 }] },
      })

      const listed = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: fx.cookie })

      expect(listed.json()).toEqual([])
      expect(markerOf(await readDoc(ctx, fx), 'n_b')).toBe(4)
      // 그 노드에 코멘트를 달면 **있던 번호를 그대로 쓴다** — 새 번호를 주지 않는다.
      expect((await postComment(ctx, fx, 'n_b')).json().marker).toBe(4)
    })
  })
})
