/**
 * `createHttpClient`의 계약 테스트. **네트워크를 타지 않는다** — 가짜 `fetch`를
 * 주입하고, 그 가짜가 받은 인자와 돌려준 응답만으로 판정한다.
 *
 * 이 파일이 검사하는 것은 "서버가 무엇을 주느냐"가 아니라 "클라이언트가 서버 계약
 * (`apps/api/README.md`의 엔드포인트 표)을 어떻게 번역하느냐"다 — 경로·메서드·본문,
 * 쿠키를 싣기 위한 `credentials`, `{ menu }` 봉투 벗기기, 에러 봉투 → `ApiError`.
 */
import type { PatchOp } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiErrorCode } from '../../src/api/client'
import { createHttpClient } from '../../src/api/http-client'
import type { MenuNode, PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from '../../src/api/types'

interface RecordedCall {
  url: string
  init: RequestInit | undefined
}

interface FetchStub {
  fetchImpl: typeof fetch
  calls: RecordedCall[]
}

/**
 * 준비한 응답을 순서대로 내주는 가짜 fetch. 호출마다 인자를 그대로 기록한다 —
 * `credentials` 같은 옵션은 jsdom에서 지워도 아무것도 깨지지 않으므로, 화면 동작이
 * 아니라 이 기록을 직접 단언해야만 판별된다.
 *
 * `Response`는 본문을 한 번만 읽을 수 있으므로 호출 횟수만큼 서로 다른 인스턴스를 준다.
 */
function stubFetch(...responses: Response[]): FetchStub {
  const calls: RecordedCall[] = []
  let index = 0
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init })
    const response = responses[index]
    index += 1
    if (response === undefined) {
      return Promise.reject(new Error(`가짜 fetch에 준비된 응답이 없다 (${index}번째 호출)`))
    }
    return Promise.resolve(response)
  }
  return { fetchImpl, calls }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** 프록시나 리버스 프록시가 JSON 대신 낼 수 있는 HTML 응답. */
function htmlResponse(status: number): Response {
  return new Response('<!doctype html><title>502 Bad Gateway</title>', {
    status,
    headers: { 'content-type': 'text/html' },
  })
}

const user: SessionUser = { id: 'u1', email: 'a@b.c', name: '홍길동' }
const project: ProjectDetail = { id: 'p1', name: '프로젝트', slug: 'proj', description: null, role: 'owner' }
const treeNode: TreeMenuNode = {
  id: 'm1',
  title: '회원관리',
  sortOrder: 0,
  pages: [{ id: 'pg1', title: '목록', sortOrder: 0 }],
  children: [{ id: 'm2', title: '권한', sortOrder: 0, pages: [], children: [] }],
}
/** `PATCH .../ops` 성공 응답. `inverse`는 **서버가** 만든 것이다(설계 §7.1). */
const patchResult = {
  seq: 8,
  revisionId: 'rev-1',
  inverse: [{ op: 'replace', path: '/root/children/0/props/title', value: '옛 제목' }],
  schemaVersion: 1,
  clientOpId: 'op-1',
}

const page: PageDetail = {
  id: 'pg1',
  menuNodeId: 'm1',
  title: '목록',
  description: null,
  sortOrder: 0,
  schemaVersion: 1,
  headSeq: 7,
  schema: { version: 1, root: { id: 'n_000000000001', type: 'Page', children: [] } },
}

/** `catch`로 받은 값을 `ApiError`로 좁힌다. 아니면 그 자리에서 던져 테스트를 실패시킨다. */
function asApiError(value: unknown): ApiError {
  if (!(value instanceof ApiError)) {
    throw new Error(`ApiError가 아니라 ${String(value)}가 나왔다`)
  }
  return value
}

describe('createHttpClient', () => {
  it('login은 이메일과 비밀번호를 POST하고 사용자를 돌려준다', async () => {
    const stub = stubFetch(jsonResponse(200, user))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.login('a@b.c', 'pw1234!')

    expect(stub.calls[0]?.url).toBe('/api/auth/login')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ email: 'a@b.c', password: 'pw1234!' })
    expect(result).toEqual(user)
  })

  it('getTree는 봉투를 벗겨 배열을 돌려준다', async () => {
    // 서버는 이 엔드포인트에서만 `{ menu }` 봉투를 쓴다(README "트리 응답 형태").
    // 그 관용구를 앱 안으로 들이지 않는다 — 호출자는 배열만 본다.
    const stub = stubFetch(jsonResponse(200, { menu: [treeNode] }))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.getTree('p1')

    expect(result).toEqual([treeNode])
  })

  // **아래 셋은 오늘 매 렌더마다 주소가 된다.** 실측(진짜 `<App />`):
  //
  //   `TreePage.id: ''`      → `PageLink`가 `/projects/p1/pages/`     → innerHTML 0자, `.wb-shell` 없음
  //   `ProjectDetail.id: ''` → 같은 `PageLink`가 `/projects/pages/pg1` → 0자, 없음
  //                            (`routes/editor.tsx`가 **조회해 온** id를 트리에 넘긴다)
  //   목록의 `ProjectDetail.id: ''` → `<Link>`가 `/projects/`          → 0자, 없음
  //
  // `app.tsx`에 `*` 라우트가 없어 어느 것도 잡히지 않는다. `SHAPES.pageDetail`이 막는 것과
  // **같은 결과**인데 이쪽이 먼저 도달한다.
  //
  // **갈래를 나눠 둔 것은 구분력 때문이다** — 한 `it`에 묶으면 `isTreePage`를 고쳐도
  // `isProjectDetail`을 고쳐도 "1 사망"으로 같아 보여 어느 검사가 무엇을 지키는지 드러나지 않는다.
  it('트리의 페이지 id가 빈 문자열이면 ApiError를 던진다', async () => {
    const menu = [
      { id: 'm1', title: '메뉴', sortOrder: 0, pages: [{ id: '', title: '목록', sortOrder: 0 }], children: [] },
    ]
    const stub = stubFetch(jsonResponse(200, { menu }))

    const error = asApiError(await createHttpClient(stub.fetchImpl).getTree('p1').catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('프로젝트 id가 빈 문자열이면 ApiError를 던진다', async () => {
    const stub = stubFetch(jsonResponse(200, { ...project, id: '' }))

    const error = asApiError(await createHttpClient(stub.fetchImpl).getProject('p1').catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('프로젝트 목록의 id가 빈 문자열이면 ApiError를 던진다', async () => {
    // 목록과 상세가 같은 `isProjectDetail`을 지나지만 부르는 자리가 달라 따로 본다.
    const stub = stubFetch(jsonResponse(200, [{ ...project, id: '' }]))

    const error = asApiError(await createHttpClient(stub.fetchImpl).listProjects().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('프로젝트의 description이 문자열도 null도 아니면 ApiError를 던진다', async () => {
    // **이것만 화면을 통째로 비운다**(리뷰 W6). 목록의 `<p>{project.description}</p>`가 그 값을
    // React 자식으로 그리는데, **React가 그리지 못하는 객체가 닿으면** React가
    // `Objects are not valid as a React child`를 던지고 **목록에 오류 경계가 없다**
    // (`apps/web/src`에서 경계는 캔버스의 `CanvasBoundary` 하나다).
    //
    // **실측(진짜 `<App />`, 계약 밖 값을 관문에 태워 목록까지 보냈다):**
    //
    // | `description` | `<main>` | `innerHTML` |
    // |---|---|---|
    // | `{}` · `{x:1}` · `[{x:1}]` · `[[{}]]` | **없음** | **11자** |
    // | `[1,2]` · `42` · `true` · 키 없음 | 있음 | 277~279자 |
    // | `null` · `''` · 공백 · 2000자 | 있음 | 270~2277자 |
    //
    // **갈리는 축은 "이터러블인가"다**(리뷰 F3에서 좁혔다). 이터러블이 아닌 객체(`{}`·`Date`·
    // 정규식·`Object.create(null)`)와 그런 객체를 **담은** 이터러블(`[{x:1}]`·`Set([{x:1}])`)이
    // 죽고, 원소가 그릴 수 있는 이터러블(`[1,2]`·`Map([['a',1]])`·제너레이터·빈 것들)은 산다.
    // **함수와 Symbol도 산다** — React가 그리지 않고 지나간다. 앞 판의 *"객체를 품으면"*은
    // 그 셋이 반례였다.
    //
    // 그래도 검사는 "문자열이거나 `null`"로 두고 나머지를 전부 막는다: 계약이 그 둘뿐이고,
    // 통과시킬 이유가 있는 값이 그 밖에 없다.
    const broken: unknown[] = [{}, { x: 1 }, [{ x: 1 }], [[{}]], [1, 2], 42, true]

    for (const description of broken) {
      const stub = stubFetch(jsonResponse(200, [{ ...project, description }]))

      const error = asApiError(
        await createHttpClient(stub.fetchImpl).listProjects().catch((e: unknown) => e),
      )

      expect(error.code, JSON.stringify(description)).toBe('internal')
    }
  })

  it('description 키가 없어도 막는다', async () => {
    // 키 없음은 화면을 죽이지 않지만(`undefined`는 React가 그리지 않는다) **계약은 그 키를
    // 약속한다.** 여기서 통과시키면 `ProjectDetail.description`을 읽는 다음 소비자가
    // `string | null`이라는 타입을 믿고 `undefined`를 받는다.
    const { description: _dropped, ...withoutDescription } = project
    const stub = stubFetch(jsonResponse(200, [withoutDescription]))

    const error = asApiError(
      await createHttpClient(stub.fetchImpl).listProjects().catch((e: unknown) => e),
    )

    expect(error.code).toBe('internal')
  })

  it('slug와 role은 계약을 어겨도 통과시킨다', async () => {
    // **과도 차단을 재는 자리이자 범위를 못박는 자리다.** 셋 다 검사 밖이었는데
    // `description`만 막는다 — **그 셋이 화면에서 갈리기 때문이다**(전부 진짜 `<App />`로 쟀다):
    //
    // | 키 | 계약 밖 값이 닿는 곳 | 관측 |
    // |---|---|---|
    // | `description` | 목록의 `<p>` 자식 | **화면이 통째로 빈다**(11자) |
    // | `slug` | 수정 폼의 `<input value>` | 폼이 열리고 화면이 산다(629자) |
    // | `role` | `projectAbilities`의 `!== 'owner'` 비교 | 버튼만 닫히고 화면이 산다(190자) |
    //
    // **`role`을 막지 않는 것이 특히 의도다.** `projectAbilities`는 계약 밖 값을 받아 닫도록
    // 만들어졌고(그쪽 케이스 `계약에 없는 역할 문자열은 아무것도 열지 않는다`), 여기서 막으면
    // **그 프로젝트의 버튼이 닫히는 대신 목록 전체가 막힌다.** 손해가 더 크다.
    //
    // 즉 이 관문이 막는 기준은 "계약을 어겼는가"가 아니라 **"어겼을 때 화면이 통째로 비는가"**다
    // — `id`의 빈 문자열(주소가 된다)·`name`(링크의 자식)이 막히는 것도 같은 기준이다.
    const passing: Partial<ProjectDetail>[] = [
      { slug: 42 as unknown as string },
      { slug: { x: 1 } as unknown as string },
      { role: 'admin' as ProjectDetail['role'] },
      { role: { x: 1 } as unknown as ProjectDetail['role'] },
    ]

    for (const patch of passing) {
      const stub = stubFetch(jsonResponse(200, [{ ...project, ...patch }]))
      await expect(
        createHttpClient(stub.fetchImpl).listProjects(),
        JSON.stringify(patch),
      ).resolves.toHaveLength(1)
    }
  })

  it('정상 description은 그대로 통과한다', async () => {
    // 음성 대조. 위 검사가 좁아졌으므로 정상값이 막히지 않는지 따로 본다.
    for (const description of [null, '', '   ', 'ㄱ'.repeat(2000), '줄\n바꿈']) {
      const stub = stubFetch(jsonResponse(200, [{ ...project, description }]))
      await expect(
        createHttpClient(stub.fetchImpl).listProjects(),
        String(description),
      ).resolves.toHaveLength(1)
    }
  })

  it('비어 있지 않은 id는 그대로 통과한다', async () => {
    // **과도 차단을 재는 자리다.** 위 검사가 "문자열이면 통과"보다 좁아졌으므로, 정상 id가
    // 막히지 않는지 따로 본다. 공백 한 칸은 통과해야 한다 — 실측으로 그 주소는 라우트가
    // 잡히고 셸이 산다(`/projects/p1/pages/%20`).
    const ids = ['pg1', ' ', '0', '한글', '../x', '/', 'a'.repeat(200), '3f2504e0-4f89-11d3-9a0c-0305e82c3301']

    for (const id of ids) {
      const treeStub = stubFetch(jsonResponse(200, { menu: [{ ...treeNode, pages: [{ id, title: '목록', sortOrder: 0 }], children: [] }] }))
      await expect(createHttpClient(treeStub.fetchImpl).getTree('p1'), id).resolves.toBeDefined()

      const projectStub = stubFetch(jsonResponse(200, { ...project, id }))
      await expect(createHttpClient(projectStub.fetchImpl).getProject('p1'), id).resolves.toBeDefined()
    }
  })

  it("모든 요청에 credentials: 'same-origin'이 붙는다", async () => {
    // 본문이 있는 요청과 없는 요청, GET과 POST를 섞어 부른다 — 한 곳에만 붙인
    // 구현이 통과하지 못하게 하려는 것이다.
    const stub = stubFetch(jsonResponse(200, user), jsonResponse(200, user), jsonResponse(200, { menu: [] }))
    const client = createHttpClient(stub.fetchImpl)

    await client.login('a@b.c', 'pw')
    await client.me()
    await client.getTree('p1')

    expect(stub.calls).toHaveLength(3)
    for (const call of stub.calls) {
      expect(call.init?.credentials).toBe('same-origin')
    }
  })

  it('204 응답은 본문을 파싱하지 않는다', async () => {
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const client = createHttpClient(stubFetch(empty).fetchImpl)

    await expect(client.logout()).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })

  it('에러 봉투를 ApiError로 바꾼다', async () => {
    const stub = stubFetch(
      jsonResponse(401, { error: { code: 'unauthenticated', message: '로그인이 필요합니다' } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.status).toBe(401)
    expect(error.code).toBe('unauthenticated')
    expect(error.message).toBe('로그인이 필요합니다')
    expect(error.name).toBe('ApiError')
  })

  it('issues가 있으면 그대로 싣는다', async () => {
    const issues = [{ code: 'unknown-type', nodeId: 'n_1', path: '/root/children/0', message: '알 수 없는 타입' }]
    const stub = stubFetch(
      jsonResponse(422, { error: { code: 'validation-failed', message: '검증 실패', issues } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.getPage('p1', 'pg1').catch((e: unknown) => e))

    expect(error.code).toBe('validation-failed')
    expect(error.issues).toEqual(issues)
  })

  it('issues가 없으면 빈 배열이다', async () => {
    // 화면이 `err.issues.length`를 그냥 읽을 수 있어야 한다 — undefined면 거기서 죽는다.
    const stub = stubFetch(jsonResponse(404, { error: { code: 'not-found', message: '대상을 찾을 수 없습니다' } }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.getProject('p1').catch((e: unknown) => e))

    expect(error.issues).toEqual([])
  })

  it('봉투가 아닌 응답도 ApiError로 바꾼다', async () => {
    // 리버스 프록시가 502 HTML을 내면 `res.json()`이 SyntaxError를 던진다.
    // 그것이 새어 나가면 화면이 서버 코드 대신 "Unexpected token <"를 보여준다.
    const stub = stubFetch(htmlResponse(500))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.listProjects().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    expect(error.status).toBe(500)
  })

  it('getPage는 headSeq를 그대로 싣는다', async () => {
    // P2b-2가 이 값을 편집 요청의 baseSeq로 쓴다.
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.getPage('p1', 'pg1')

    expect(result.headSeq).toBe(7)
    // 서버 계약(apps/api/test/pages.test.ts "페이지 응답은 계약된 키만 담는다")의
    // 여덟 키가 전부 그대로 온다.
    expect(result).toEqual(page)
  })

  // --- 아래는 브리프의 9개 케이스 뒤에 변이가 없던 지점을 메우려고 더한 것들이다 ---

  it('각 메서드는 계약된 경로와 HTTP 메서드로 요청한다', async () => {
    // 경로 오타나 메서드 뒤바뀜은 위 케이스들이 login·getTree 말고는 잡지 못한다.
    const cases: Array<{ url: string; method: string; body: unknown; call: (c: ReturnType<typeof createHttpClient>) => Promise<unknown> }> = [
      { url: '/api/auth/login', method: 'POST', body: user, call: (c) => c.login('a@b.c', 'pw') },
      { url: '/api/auth/logout', method: 'POST', body: null, call: (c) => c.logout() },
      { url: '/api/auth/me', method: 'GET', body: user, call: (c) => c.me() },
      { url: '/api/projects', method: 'GET', body: [project], call: (c) => c.listProjects() },
      { url: '/api/projects/p1', method: 'GET', body: project, call: (c) => c.getProject('p1') },
      { url: '/api/projects/p1/tree', method: 'GET', body: { menu: [] }, call: (c) => c.getTree('p1') },
      { url: '/api/projects/p1/pages/pg1', method: 'GET', body: page, call: (c) => c.getPage('p1', 'pg1') },
    ]

    for (const testCase of cases) {
      const response = testCase.body === null ? new Response(null, { status: 204 }) : jsonResponse(200, testCase.body)
      const stub = stubFetch(response)

      await testCase.call(createHttpClient(stub.fetchImpl))

      expect(stub.calls[0]?.url, testCase.url).toBe(testCase.url)
      expect(stub.calls[0]?.init?.method, testCase.url).toBe(testCase.method)
    }
  })

  it('본문이 있는 요청에만 content-type을 붙인다', async () => {
    const stub = stubFetch(jsonResponse(200, user), jsonResponse(200, user))
    const client = createHttpClient(stub.fetchImpl)

    await client.login('a@b.c', 'pw')
    await client.me()

    expect(stub.calls[0]?.init?.headers).toEqual({ 'content-type': 'application/json' })
    // GET에 본문이 없는데 content-type을 붙이면 서버가 받는 요청이 계약과 달라진다.
    expect(stub.calls[1]?.init?.headers).toBeUndefined()
    expect(stub.calls[1]?.init?.body).toBeUndefined()
  })

  it('listProjects는 각 항목의 role을 그대로 돌려준다', async () => {
    // 서버는 목록의 각 항목에도 내 role을 싣는다
    // (apps/api/test/projects.test.ts "각 항목에 내 role이 실린다").
    const stub = stubFetch(jsonResponse(200, [project, { ...project, id: 'p2', role: 'viewer' }]))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.listProjects()

    expect(result.map((p) => p.role)).toEqual(['owner', 'viewer'])
  })

  it('성공 응답이 JSON이 아니어도 ApiError로 바꾼다', async () => {
    // 개발 중 프록시가 빠지면 Vite가 /api/* 요청에 index.html을 200으로 낸다.
    // 실패 경로와 같은 이유로 여기서도 SyntaxError가 새어 나가면 안 된다.
    const stub = stubFetch(htmlResponse(200))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('알 수 없는 code는 internal로 바꾼다', async () => {
    // 화면은 상태 코드가 아니라 `code`로 분기한다(404가 "없음"과 "비멤버"를 일부러
    // 구분하지 않기 때문이다 — 설계 §10). 계약에 없는 문자열이 `code`에 그대로
    // 실리면 그 분기의 exhaustive switch가 거짓말이 된다.
    const stub = stubFetch(jsonResponse(418, { error: { code: 'teapot', message: '나는 주전자다' } }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    expect(error.status).toBe(418)
    // 메시지는 서버가 준 것을 유지한다 — 코드를 몰라도 사람이 읽을 값은 있다.
    expect(error.message).toBe('나는 주전자다')
  })

  it('계약의 code 일곱을 그대로 싣는다', async () => {
    // **일곱을 하나씩 지나간다.** 여기까지 오는 값은 `API_ERROR_CODES`를 통과한 것이고,
    // 통과하지 못한 문자열은 위 케이스가 보듯 `internal`로 흡수된다 — 즉 목록에서 하나가
    // 빠지거나 오타가 나면 그 코드가 조용히 `internal`이 되고 화면의 분기가 닿지 않는다.
    // `ApiErrorCode` 유니온을 그대로 훑는 것은 유니온에 코드가 늘면 이 배열이 컴파일
    // 에러가 되게 하기 위해서다.
    const codes: ApiErrorCode[] = [
      'bad-request',
      'unauthenticated',
      'forbidden',
      'not-found',
      'conflict',
      'validation-failed',
      'internal',
    ]

    for (const code of codes) {
      const stub = stubFetch(jsonResponse(400, { error: { code, message: '이유' } }))
      const client = createHttpClient(stub.fetchImpl)

      const error = asApiError(await client.me().catch((e: unknown) => e))

      expect(error.code).toBe(code)
    }
  })

  it('프로토타입에 있는 이름은 code가 아니다', async () => {
    // `'toString' in API_ERROR_CODES`는 `true`다. 목록을 `in`으로 보면 이 문자열이
    // 계약의 코드인 척 그대로 실려, 화면의 `switch`가 어느 갈래에도 닿지 않는 값을 받는다.
    const stub = stubFetch(
      jsonResponse(500, { error: { code: 'toString', message: '이상한 코드' } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('fetchImpl을 주지 않으면 전역 fetch를 쓴다', async () => {
    // 다른 테스트는 전부 가짜를 주입하므로 기본값 자리는 아무도 지나가지 않는다 —
    // 그 자리가 잘못돼도 이 파일이 통째로 초록일 수 있어 여기서만 따로 본다.
    const stub = stubFetch(jsonResponse(200, user))
    vi.stubGlobal('fetch', stub.fetchImpl)
    try {
      await createHttpClient().me()
      expect(stub.calls[0]?.url).toBe('/api/auth/me')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fetch 자체가 실패하면 ApiError로 바꾼다', async () => {
    // 네트워크 단절·DNS 실패·CORS 차단에서 `fetch`는 응답 없이 raw `TypeError`로
    // reject한다 — 실패 응답이 아니므로 봉투 번역 경로를 아예 지나가지 않는다.
    // 그것이 그대로 새어 나가면 호출자의 `err instanceof ApiError` 분기가 통째로
    // 빗나가서, 화면이 네트워크 오류를 오류로 알아보지 못한다.
    const fetchImpl: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'))
    const client = createHttpClient(fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    // 응답이 없었다는 뜻의 0. 서버가 낼 수 있는 상태 코드가 아니라서 실제 응답과 섞이지 않는다.
    expect(error.status).toBe(0)
    // 사용자에게 그대로 보여도 되는 문장이어야 한다 — 브라우저별 영문 문구를 흘리지 않는다.
    expect(error.message).toBe('서버에 연결하지 못했습니다')
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    // 주소창에서 온 id가 그대로 경로에 붙으면 URL이 깨지거나 다른 경로로 샌다.
    const stub = stubFetch(jsonResponse(404, { error: { code: 'not-found', message: '대상을 찾을 수 없습니다' } }))
    const client = createHttpClient(stub.fetchImpl)

    await client.getPage('p 1/x', '../pg1').catch(() => undefined)

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1')
  })
})

describe('patchOps', () => {
  const OPS: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/title', value: '새 제목' }]

  it('ops를 PATCH로 보낸다', async () => {
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)

    await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS, clientOpId: 'op-1' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p-1/pages/pg-1/ops')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      baseSeq: 7,
      ops: OPS,
      clientOpId: 'op-1',
    })
  })

  it('clientOpId가 없으면 본문에 키를 만들지 않는다', async () => {
    // 서버는 `z.strictObject`를 쓰므로 선언되지 않은 키는 400이다. `clientOpId: undefined`를
    // 그대로 넘기면 `JSON.stringify`가 키를 지우므로 실제로는 통과하지만, 그것에 기대면
    // 본문 조립이 바뀔 때 조용히 어긋난다 — 나가는 본문을 직접 본다.
    const stub = stubFetch(jsonResponse(200, { ...patchResult, clientOpId: undefined }))
    const client = createHttpClient(stub.fetchImpl)

    await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ baseSeq: 7, ops: OPS })
  })

  it('응답의 seq와 inverse를 그대로 낸다', async () => {
    // **봉투를 벗기지 않는다** — 서버 응답이 곧 `PatchResult`다. `inverse`는 서버가 적용
    // 직전 상태를 보고 만든 것이고(설계 §7.1), 클라이언트는 그것을 그대로 되보내는 것
    // 말고는 아무것도 하지 않는다.
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS })

    expect(result).toEqual(patchResult)
    expect(result.inverse).toEqual(patchResult.inverse)
  })

  it('baseSeq 불일치는 conflict 코드로 온다', async () => {
    // 서버는 리베이스를 시도하지 않고 곧바로 409를 낸다(README). 화면은 그것을 재조회로
    // 수렴시킨다(D4).
    const stub = stubFetch(
      jsonResponse(409, { error: { code: 'conflict', message: '문서가 이미 바뀌었습니다' } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.patchOps('p-1', 'pg-1', { baseSeq: 3, ops: OPS }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('conflict')
    expect(error.status).toBe(409)
  })

  it('카탈로그 위반은 validation-failed와 issues를 싣는다', async () => {
    const issues = [
      { code: 'unknown-prop', nodeId: 'n_1', path: '/root/children/0/props/nope', message: '알 수 없는 prop' },
    ]
    const stub = stubFetch(
      jsonResponse(422, { error: { code: 'validation-failed', message: '검증 실패', issues } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('validation-failed')
    expect(error.issues).toHaveLength(1)
    expect(error.issues).toEqual(issues)
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)

    await client.patchOps('p 1/x', '../pg1', { baseSeq: 7, ops: OPS })

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1/ops')
  })
})

describe('listMyRevisions', () => {
  const revision = {
    id: 'rev-1',
    seq: 8,
    actorType: 'user',
    actorId: 'u1',
    actorLabel: '홍길동',
    ops: [{ op: 'replace', path: '/root/children/0/props/title', value: '새' }],
    inverse: [{ op: 'replace', path: '/root/children/0/props/title', value: '옛' }],
    createdAt: '2026-08-04T09:00:00.000Z',
  }

  it('mine=true만 붙여 GET한다', async () => {
    // **`limit`을 붙이지 않는다.** 기본값 50이 설계 §7.3의 "최근 50개"와 같고,
    // **선언하지 않은 쿼리 키는 그 자체로 400이다**(README) — 캐시 버스터도 거부된다.
    const stub = stubFetch(jsonResponse(200, [revision]))
    const client = createHttpClient(stub.fetchImpl)

    await client.listMyRevisions('p-1', 'pg-1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p-1/pages/pg-1/revisions?mine=true')
    expect(stub.calls[0]?.init?.method).toBe('GET')
  })

  it('응답을 순서 그대로 낸다', async () => {
    // 서버가 `seq` 내림차순으로 준다. 여기서 뒤집지 않는다 — 스택으로 옮기는 자리가
    // 그 순서를 안다(`store/editor-store.ts`의 `restoreUndoStack`).
    const older = { ...revision, id: 'rev-0', seq: 7 }
    const stub = stubFetch(jsonResponse(200, [revision, older]))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.listMyRevisions('p-1', 'pg-1')

    expect(result.map((r) => r.seq)).toEqual([8, 7])
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, []))
    const client = createHttpClient(stub.fetchImpl)

    await client.listMyRevisions('p 1/x', '../pg1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1/revisions?mine=true')
  })
})

/**
 * 메뉴·페이지 CRUD 여섯(P2b-4 Task 1).
 *
 * **이 여섯이 지켜야 하는 것은 본문 조립이다.** 서버의 `CreateMenuBody`·`UpdateMenuBody`·
 * `CreatePageBody`·`UpdatePageBody`가 전부 `z.strictObject`이고, 갱신 둘은
 * `.refine((body) => Object.keys(body).length > 0)`까지 걸려 있다
 * (`apps/api/src/routes/menu.ts`·`pages.ts`). 즉 **어떤 키를 만드는가**가 그대로 200과
 * 400을 가른다 — 화면 테스트는 가짜 `ApiClient`를 쓰므로 이 조립을 지나가지 않는다.
 */
describe('메뉴 CRUD', () => {
  /** `POST /menu`·`PATCH /menu/:nodeId`의 응답. 트리 노드와 달리 `pages`·`children`이 없다(D1). */
  const menuNode: MenuNode = { id: 'm1', projectId: 'p1', parentId: null, title: '회원관리', sortOrder: 0 }

  it('createMenu는 parentId를 null로도 싣는다', async () => {
    // 서버의 `parentId`는 `z.uuid().nullable().optional()`이라 **`null`이 유효한 값**이고
    // "루트에 만든다"는 뜻이다. 클라이언트가 그 뜻을 흘리지 않도록 값으로 싣는다 —
    // 이 계약이 `updateMenu`의 `parentId: null`(내어쓰기로 루트에 보낸다)과 같은 모양이어야
    // 한다. **키를 빼도 서버는 같은 곳(루트 맨 뒤)에 만든다** — api 하네스로 쟀고 근거는
    // `api/client.ts`의 `createMenu` 주석에 있다. 결과가 같아도 뜻을 값으로 남긴다.
    const stub = stubFetch(jsonResponse(201, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.createMenu('p1', { parentId: null, title: '회원관리' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/menu')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: null, title: '회원관리' })
  })

  it('createMenu는 하위 메뉴의 parentId를 그대로 싣는다', async () => {
    const stub = stubFetch(jsonResponse(201, { ...menuNode, id: 'm2', parentId: 'm1' }))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.createMenu('p1', { parentId: 'm1', title: '권한' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: 'm1', title: '권한' })
    expect(result.id).toBe('m2')
  })

  it('선언되지 않은 키를 만들지 않는다 — undefined인 필드는 본문에서 빠진다', async () => {
    // 서버의 `UpdateMenuBody`는 `z.strictObject`다 — 선언되지 않은 키는 그 자체로 400이고,
    // `undefined`를 실은 키가 오늘 통과하는 것은 `JSON.stringify`가 지워 주는 우연이다
    // (`patchOps`가 같은 이유로 `clientOpId` 키를 만들지 않는다). 그 우연에 기대면
    // 본문 조립이 바뀔 때 조용히 어긋나므로 나가는 본문을 직접 본다.
    const stub = stubFetch(jsonResponse(200, { ...menuNode, title: '가' }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm1', { title: '가' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/menu/m1')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ title: '가' })
  })

  it('updateMenu는 parentId: null을 싣는다 — 키 없음과 다른 뜻이다', async () => {
    // 키가 없으면 "부모를 바꾸지 않는다", `null`이면 "루트로 옮긴다"이다(내어쓰기의
    // 목적지가 루트 목록일 때 나가는 본문이다 — Task 8). `undefined`만 걸러야 하고
    // falsy 전체를 걸러서는 안 된다.
    const stub = stubFetch(jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm2', { parentId: null })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: null })
  })

  it('updateMenu는 sortOrder 0을 싣는다', async () => {
    // 0은 falsy인데 서버의 `sortOrder`는 `z.int().min(0)`이라 **0이 유효 범위의 하한**이다.
    // 걸러야 하는 것은 `undefined` 하나뿐이라는 것을 이 케이스가 못박는다 — 0이 빠지면
    // 본문이 비어 서버의 `.refine(빈 본문 금지)`에 걸린다.
    const stub = stubFetch(jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm1', { sortOrder: 0 })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ sortOrder: 0 })
  })

  it('updateMenu는 준 키를 전부 싣는다', async () => {
    const stub = stubFetch(jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm1', { title: '가', parentId: 'm9', sortOrder: 2 })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      title: '가',
      parentId: 'm9',
      sortOrder: 2,
    })
  })

  it('빈 갱신 본문은 서버에 보내지 않고 ApiError로 막는다', async () => {
    // **서버 실측**(api 하네스, 임시 파일을 두고 지웠다): `PATCH /menu {}`·`PATCH /pages {}`가
    // 둘 다 `400 {"code":"bad-request", …, "issues":[{"path":"","message":"변경할 값이
    // 없습니다"}]}`다. 보내 봐야 400인 요청은 만들지 않는다 — D5·P2b-2 D7이 버튼에 쓴 정신을
    // 이 층에 적용한 것이다.
    //
    // **`fetch`가 아예 불리지 않는 것까지 본다.** 던지기만 하고 요청이 나가면 서버에 쓸모없는
    // 왕복이 남는다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateMenu('p1', 'm1', {}).catch((e: unknown) => e))

    expect(error.code).toBe('bad-request')
    expect(error.status).toBe(0)
    expect(stub.calls).toHaveLength(0)
  })

  it('undefined만 담긴 갱신 본문도 같다', async () => {
    // `definedOnly`가 이것을 `{}`로 **만들어 낸다** — 타입이 세 키를 전부 optional로 두므로
    // 호출부가 계산한 값이 `undefined`가 되는 경로가 실제로 열려 있다(계획서 Task 8이
    // `previousMenuSibling`·`menuOutdentTarget`의 `null`을 다루는 자리다).
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateMenu('p1', 'm1', { title: undefined, parentId: undefined, sortOrder: undefined })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('거절은 동기 throw가 아니라 rejection이다', () => {
    // `ApiClient`의 계약은 `Promise`를 돌려주는 것이다. 몸통에서 그냥 던지면 `await` 없이
    // `.catch`를 붙이는 호출부가 그것을 못 잡는다.
    const client = createHttpClient(stubFetch().fetchImpl)

    expect(() => client.updateMenu('p1', 'm1', {}).catch(() => undefined)).not.toThrow()
    expect(() => client.updatePage('p1', 'pg1', {}).catch(() => undefined)).not.toThrow()
  })

  it('삭제는 204를 본문 없이 받는다', async () => {
    // 204에서 `request`가 조기 반환하므로 shape 검사에 닿지 않는다. 본문을 읽으려
    // 들면 거기서 죽는다(`logout`이 같은 자리를 지킨다).
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const stub = stubFetch(empty)
    const client = createHttpClient(stub.fetchImpl)

    await expect(client.deleteMenu('p1', 'm1')).resolves.toBeUndefined()

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/menu/m1')
    expect(stub.calls[0]?.init?.method).toBe('DELETE')
    expect(json).not.toHaveBeenCalled()
  })

  it('메뉴 응답이 계약과 다른 모양이면 ApiError를 던진다', async () => {
    // `sortOrder`가 문자열인 응답. **이 값을 읽는 자리는 지금 0건이다** — 앞서 여기에
    // "위/아래 이동의 목적지 계산에 들어간다"고 적었던 것은 거짓이었다(계획서 Task 7
    // 케이스 7이 `node.sortOrder`를 쓰지 말라고 못박는다). 그런데도 계약을 벗어난 응답을
    // 통과시키지 않는 것은 `SHAPES.menuNode` 주석의 근거 둘 때문이다.
    const stub = stubFetch(jsonResponse(200, { ...menuNode, sortOrder: '0' }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateMenu('p1', 'm1', { title: '가' }).catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    expect(error.message).toBe('서버 응답을 이해할 수 없습니다')
  })

  it('메뉴 응답에 id가 없으면 ApiError를 던진다', async () => {
    const stub = stubFetch(jsonResponse(201, { projectId: 'p1', parentId: null, title: '가', sortOrder: 0 }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.createMenu('p1', { parentId: null, title: '가' }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('internal')
  })

  it('선언되지 않은 키만 담긴 메뉴 갱신 본문은 빈 본문으로 거절된다', async () => {
    // **떨어내는 순서가 정하는 결과다**(`updateProject`와 같은 자리). 미선언 키를 먼저
    // 떨어낸 뒤에 남은 키를 세므로 `{id, projectId}`는 `{}`가 되어 `updateBody`가 던진다.
    // 순서가 반대면 "두 키가 있으니 빈 본문이 아니다"로 통과해 `{}`가 나가고 400을 받는다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateMenu('p1', 'm1', { id: 'm1', projectId: 'p1' } as unknown as { title?: string })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('메뉴 응답 객체를 그대로 넘겨도 선언된 키만 나간다', async () => {
    // **`MenuNode` 응답에는 요청이 받지 않는 키가 셋 섞여 있다**(`id`·`projectId`·`sortOrder` —
    // `sortOrder`는 갱신에만 선언돼 있다). 서버의 본문 스키마가 `z.strictObject`라 그것이
    // 그대로 나가면 400이다. **실측(api 하네스):**
    //
    //   POST  /menu     응답 그대로 → 400 인식할 수 없는 키: "id", "projectId", "sortOrder"
    //   PATCH /menu/:id 응답 그대로 → 400 인식할 수 없는 키: "id", "projectId"
    //   선언된 키만 담으면            → 201 / 200
    //
    // **타입은 막지 못한다** — 변수도 스프레드 리터럴도 `tsc` 0 에러다(`declaredOnly` 머리말의
    // 프로브 표). 그래서 `declaredOnly`가 여기서 막는다.
    const stub = stubFetch(jsonResponse(201, menuNode), jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.createMenu('p1', menuNode)
    await client.updateMenu('p1', 'm1', { ...menuNode })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: null, title: '회원관리' })
    expect(JSON.parse(String(stub.calls[1]?.init?.body))).toEqual({
      title: '회원관리',
      parentId: null,
      sortOrder: 0,
    })
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, menuNode), new Response(null, { status: 204 }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p 1/x', '../m1', { title: '가' })
    await client.deleteMenu('p 1/x', '../m1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/menu/..%2Fm1')
    expect(stub.calls[1]?.url).toBe('/api/projects/p%201%2Fx/menu/..%2Fm1')
  })
})

describe('페이지 CRUD', () => {
  it('createPage는 menuNodeId와 title을 싣는다', async () => {
    // `description`은 이 단계가 만들지 않는다 — 설계 §9가 그것을 우측 패널의
    // "페이지 설명" 탭에 두기로 했다. 그래서 본문에 그 키가 아예 없다.
    const stub = stubFetch(jsonResponse(201, page))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.createPage('p1', { menuNodeId: 'm1', title: '목록' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/pages')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ menuNodeId: 'm1', title: '목록' })
    // 만든 페이지로 이동하려면 응답의 `id`가 필요하다(D8).
    expect(result.id).toBe('pg1')
  })

  it('updatePage는 준 키만 본문에 만든다', async () => {
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { title: '새 이름' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/pages/pg1')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ title: '새 이름' })
  })

  it('updatePage는 sortOrder 0을 싣는다', async () => {
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { sortOrder: 0 })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ sortOrder: 0 })
  })

  it('updatePage는 소속 메뉴만 바꿀 때 다른 키를 만들지 않는다', async () => {
    // `reparent`가 내는 본문이다(Task 9). `title`이 섞여 나가면 사용자가 바꾸지 않은
    // 값을 덮어쓴다.
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { menuNodeId: 'm2' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ menuNodeId: 'm2' })
  })

  it('deletePage는 204를 본문 없이 받는다', async () => {
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const stub = stubFetch(empty)
    const client = createHttpClient(stub.fetchImpl)

    await expect(client.deletePage('p1', 'pg1')).resolves.toBeUndefined()

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/pages/pg1')
    expect(stub.calls[0]?.init?.method).toBe('DELETE')
    expect(json).not.toHaveBeenCalled()
  })

  it('빈 갱신 본문은 페이지 쪽도 막힌다', async () => {
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updatePage('p1', 'pg1', {}).catch((e: unknown) => e))

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('페이지 CRUD 응답도 페이지 계약을 지난다', async () => {
    // `POST`·`PATCH`의 응답은 `GET`과 같은 여덟 키다(`apps/api/src/routes/pages.ts`의
    // `toResponse` 하나가 셋을 다 만든다). 조회만 검사하고 쓰기를 통과시키면 같은
    // 계약이 반쪽만 지켜진다.
    const stub = stubFetch(jsonResponse(201, { ...page, headSeq: '0' }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.createPage('p1', { menuNodeId: 'm1', title: '목록' }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('internal')
  })

  it('만든 페이지의 id가 계약과 다르면 ApiError를 던진다', async () => {
    // **D8이 이 값을 주소에 넣는다** — 만들고 나서 그 페이지로 이동한다. 통과시키면
    // `ApiError`가 아니라 **200 성공 경로로** 잘못된 주소가 만들어진다.
    //
    // 실측(가짜 소비자를 세워 `PageLink`와 같은 형태로 조립했다):
    //   `id` 키 없음 → `/projects/p1/pages/undefined`
    //   `id: 42` → `…/42`,  `id: null` → `…/null`,  `id: ''` → `/projects/p1/pages/`
    //
    // **빈 문자열이 가장 나쁘다** — 진짜 `<App />`을 그 주소로 렌더하면 `innerHTML`이
    // 0자이고 `.wb-shell`이 없다(`app.tsx`에 `*` 라우트가 없어 아무 라우트도 안 잡힌다).
    // 앞 판은 그것을 "다른 라우트가 받는다"로 적었고 거짓이었다.
    const { id: _dropped, ...withoutId } = page
    const broken: unknown[] = [
      withoutId,
      { ...page, id: 42 },
      { ...page, id: null },
      { ...page, id: '' },
    ]

    for (const body of broken) {
      const stub = stubFetch(jsonResponse(201, body))
      const client = createHttpClient(stub.fetchImpl)

      const error = asApiError(
        await client.createPage('p1', { menuNodeId: 'm1', title: '목록' }).catch((e: unknown) => e),
      )

      expect(error.code, JSON.stringify(body)).toBe('internal')
    }
  })

  it('선언되지 않은 키만 담긴 페이지 갱신 본문은 빈 본문으로 거절된다', async () => {
    // `updateProject`·`updateMenu`와 같은 자리. `PageDetail`의 `schema`는 `PATCH`가 받지
    // 않는 키라 떨어져 나가고, 남는 것이 없으면 그 자리에서 던진다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updatePage('p1', 'pg1', { id: 'pg1', headSeq: 3 } as unknown as { title?: string })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('patchOps도 선언된 세 키만 보낸다', async () => {
    // **이 자리는 다른 넷과 위험의 모양이 다르다.** 응답(`PatchResult`)에는 `baseSeq`·`ops`가
    // 없어 그것을 되보내는 것은 타입이 이미 막는다. 그런데도 같은 관용구를 쓰는 것은
    // **규칙을 한 벌로 두기 위해서다** — 자리마다 방식이 다르면 다음 사람이 자기가 먼저 본
    // 쪽을 따르고, 이 저장소가 반복해 겪은 "한 곳만 고치고 다른 곳을 놓치는" 결함이 거기서 난다.
    //
    // **닫는 케이스가 없으면 그 관용구가 지켜지는지 알 수 없어 여기 둔다.** 오늘 부르는 자리는
    // `edit/use-edit-commit.tsx` 하나이고 `store.nextRequest()`가 정확히 세 키를 주므로,
    // 이 케이스가 재는 것은 **호출부가 아니라 이 층의 계약**이다.
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)
    const ops: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/title', value: '가' }]

    await client.patchOps('p1', 'pg1', {
      baseSeq: 7,
      ops,
      clientOpId: 'op-1',
      seq: 9,
      revisionId: 'rev-1',
    } as unknown as { baseSeq: number; ops: PatchOp[]; clientOpId?: string })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ baseSeq: 7, ops, clientOpId: 'op-1' })
  })

  it('페이지 응답 객체를 그대로 넘겨도 선언된 키만 나간다', async () => {
    // `PageDetail`은 여덟 키인데 요청이 받는 것은 그 일부다. **실측(api 하네스):**
    //
    //   POST  /pages     응답 그대로 → 400 인식할 수 없는 키: "id", "sortOrder", "schemaVersion", "schema", "headSeq"
    //   PATCH /pages/:id 응답 그대로 → 400 인식할 수 없는 키: "id", "schemaVersion", "schema", "headSeq"
    //   선언된 키만 담으면             → 201 / 200
    //
    // **`schema`가 섞여 나가는 것이 특히 나쁘다** — 서버는 그것을 `PUT .../schema`·
    // `PATCH .../ops`로만 받는다(`api/client.ts`의 `updatePage` 주석).
    const stub = stubFetch(jsonResponse(201, page), jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.createPage('p1', page)
    await client.updatePage('p1', 'pg1', { ...page })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ menuNodeId: 'm1', title: '목록' })
    expect(JSON.parse(String(stub.calls[1]?.init?.body))).toEqual({
      title: '목록',
      menuNodeId: 'm1',
      sortOrder: 0,
    })
  })

  it('나가는 키 순서는 호출자가 적은 순서가 아니라 계약의 순서다', async () => {
    // **`declaredOnly`가 만든 동작이고 의도한 것이다.** 키 목록(`BODY_KEYS`)의 순서로
    // 정규화되므로, 호출자가 어떤 순서로 적든 같은 바이트가 나간다. JSON 객체의 키 순서는
    // 뜻을 바꾸지 않고 서버의 zod도 보지 않는다.
    //
    // **이것을 케이스로 두는 것은 "바이트가 그대로다"라고 적지 않기 위해서다** — 옛 구현은
    // 호출자가 적은 순서를 그대로 냈다. 정상 본문 48조합에서 값과 키 집합은 하나도 바뀌지
    // 않았지만, **역순으로 적은 본문은 바이트가 다르다**(재서 확인했다).
    const stub = stubFetch(jsonResponse(200, page), jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { sortOrder: 2, title: '가' })
    await client.updatePage('p1', 'pg1', { title: '가', sortOrder: 2 })

    expect(stub.calls[0]?.init?.body).toBe('{"title":"가","sortOrder":2}')
    expect(stub.calls[0]?.init?.body).toBe(String(stub.calls[1]?.init?.body))
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, page), new Response(null, { status: 204 }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p 1/x', '../pg1', { title: '가' })
    await client.deletePage('p 1/x', '../pg1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1')
    expect(stub.calls[1]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1')
  })
})

/**
 * 프로젝트 CRUD 셋(P2b-5 Task 1).
 *
 * **서버 실측**(api 하네스, `apps/api/test/`에 임시 파일을 두고 재고 지웠다):
 *
 * ```
 * POST   /projects {name,slug}                → 201 {"id","name","slug","description":null,"role":"owner"}
 * POST   /projects {name,slug,description}    → 201 (같은 다섯 키)
 * POST   /projects {name,slug,role:'owner'}   → 400 {"code":"bad-request", issues:[{"message":"인식할 수 없는 키: \"role\""}]}
 * PATCH  /projects/:id {}                     → 400 {"code":"bad-request", issues:[{"message":"변경할 값이 없습니다"}]}
 * PATCH  /projects/:id {description:null}     → 200 (description 이 null 로 바뀐다)
 * PATCH  /projects/:id {name, unknownKey}     → 400 {"message":"인식할 수 없는 키: \"unknownKey\""}
 * ```
 *
 * **읽어야 할 것 둘.**
 *
 * 1. **생성 응답에 `role`이 실려 온다** — 계획서 D1 이 *"`role`이 없어 목록 항목과 다른
 *    모양이다"*라고 적었던 것은 거짓이다(`repos/projects.ts`의 `insertProject`가
 *    `.returning([…])` 뒤에 `{ ...project, role: 'owner' }`로 감싼다). 그래서 반환 타입이
 *    `ProjectSummary`가 아니라 `ProjectDetail`이고, 응답 검사도 `SHAPES.projectDetail`을
 *    같이 쓴다.
 * 2. **그런데도 응답을 그대로 요청 본문으로 되보낼 수 없다** — `role` 키가 있으면 서버의
 *    `z.strictObject`가 400을 낸다(위 셋째 줄). 이 파일이 나가는 본문을 직접 보는 이유다.
 */
describe('프로젝트 CRUD', () => {
  it('createProject는 이름·슬러그·설명을 POST한다', async () => {
    const stub = stubFetch(jsonResponse(201, { ...project, description: '설명' }))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.createProject({ name: '프로젝트', slug: 'proj', description: '설명' })

    expect(stub.calls[0]?.url).toBe('/api/projects')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '프로젝트',
      slug: 'proj',
      description: '설명',
    })
    // 만든 프로젝트로 이동하려면 응답의 `id`가 필요하다(D7).
    expect(result.id).toBe('p1')
  })

  it('설명을 주지 않으면 그 키를 만들지 않는다', async () => {
    // `undefined`를 실은 키가 통과하는 것은 `JSON.stringify`가 지워 주는 우연이라 그것에
    // 기대지 않는다(`patchOps`의 `clientOpId`와 같은 판단).
    //
    // **이 케이스만으로는 `declaredOnly`가 키를 고르지 않게 바꿔도 죽지 않는다** — 관찰 지점이
    // 직렬화된 문자열 하나뿐이라 두 구현의 바이트가 같아진다(선언된 세 키의 39조합에서
    // 차이 0을 쟀다). 그것을 닫는 것은 **아래 "응답 객체를 그대로 넘겨도" 케이스**다.
    const stub = stubFetch(jsonResponse(201, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.createProject({ name: '가', slug: 'ga' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ name: '가', slug: 'ga' })
  })

  it('응답 객체를 그대로 넘겨도 선언된 세 키만 나간다', async () => {
    // **여기가 `declaredOnly`를 닫는 자리다.** 서버의 `CreateProjectBody`는 `z.strictObject`라
    // 선언되지 않은 키가 그 자체로 400인데, **`definedOnly`는 미선언 키를 하나도 거르지
    // 않는다** — 값이 `undefined`인 키만 뺀다. 두 장치가 막는 실패가 다르다(리뷰 F1).
    //
    // **실측(api 하네스):** `{id,name,slug,description,role}`을 실제로 보내면 `POST`·`PATCH`
    // 둘 다 `400 bad-request` / issues `[{"path":"","message":"인식할 수 없는 키: \"id\",
    // \"role\""}]`이고, 선언된 셋만 담은 본문은 200이다.
    //
    // **타입은 이것을 막지 못한다**(`tsc` 프로브): 변수로 넘기면 에러가 없고, 키를 적은
    // 리터럴만 `TS2353`이 나며, **스프레드 리터럴(`{ ...created }`)은 에러가 없다.**
    // 수정 폼이 쓰기 가장 쉬운 모양이 그 셋째다.
    const stub = stubFetch(jsonResponse(201, project), jsonResponse(200, project))
    const client = createHttpClient(stub.fetchImpl)
    const created: ProjectDetail = { id: 'p1', name: '가', slug: 'ga', description: null, role: 'owner' }

    await client.createProject(created)
    await client.updateProject('p1', { ...created })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: null,
    })
    expect(JSON.parse(String(stub.calls[1]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: null,
    })
  })

  it('선언되지 않은 키만 담긴 갱신 본문은 빈 본문으로 거절된다', async () => {
    // **떨어내는 순서가 정하는 결과다.** 미선언 키를 먼저 떨어낸 뒤에 남은 키를 세므로
    // `{id, role}`은 `{}`가 되어 `updateBody`가 던진다. 순서가 반대면 "두 키가 있으니 빈
    // 본문이 아니다"로 통과해 `{}`가 서버로 나가고 400을 받는다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateProject('p1', { id: 'p1', role: 'owner' } as unknown as { name?: string })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('설명에 null을 주면 그 값을 그대로 싣는다', async () => {
    // `null`은 **"설명 없음"이라는 값**이고 키가 없는 것과 다른 뜻이다 — 서버가
    // `z.string().max(2000).nullable().optional()`로 받고 `body.description ?? null`로 쓴다.
    // 실측으로 `POST {description:null}`이 201, `PATCH {description:null}`이 200이다.
    // 걸러야 하는 것은 `undefined` 하나뿐이라는 것을 이 케이스가 못박는다
    // (`updateMenu`의 `parentId: null`과 같은 자리).
    const stub = stubFetch(jsonResponse(201, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.createProject({ name: '가', slug: 'ga', description: null })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: null,
    })
  })

  it('만든 프로젝트의 id가 계약과 다르면 ApiError를 던진다', async () => {
    // **그 값이 곧 주소가 된다**(D7) — 만들고 나서 그 프로젝트로 이동한다. 통과시키면
    // `ApiError`가 아니라 **201 성공 경로로** 잘못된 주소가 만들어진다.
    //
    // **빈 문자열이 가장 나쁘다.** P2b-4가 진짜 `<App />`으로 쟀다: `/projects/`는
    // `innerHTML` 0자·`.wb-shell` 없음이다(`app.tsx`에 `*` 라우트가 없다). 같은 근거로
    // `TreePage.id`·`projectDetail.id`·`projectList[].id` 셋을 이미 막고 있고,
    // **`createProject`가 그 셋을 지키는 `isProjectDetail`을 그대로 지난다.**
    const { id: _dropped, ...withoutId } = project
    const broken: unknown[] = [withoutId, { ...project, id: 42 }, { ...project, id: null }, { ...project, id: '' }]

    for (const body of broken) {
      const stub = stubFetch(jsonResponse(201, body))
      const client = createHttpClient(stub.fetchImpl)

      const error = asApiError(
        await client.createProject({ name: '가', slug: 'ga' }).catch((e: unknown) => e),
      )

      expect(error.code, JSON.stringify(body)).toBe('internal')
    }
  })

  it('updateProject는 준 키만 본문에 만든다', async () => {
    const stub = stubFetch(jsonResponse(200, { ...project, name: '새 이름' }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p1', { name: '새 이름' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ name: '새 이름' })
  })

  it('updateProject는 description: null을 싣는다 — 키 없음과 다른 뜻이다', async () => {
    // 키가 없으면 "설명을 바꾸지 않는다", `null`이면 "설명을 지운다"이다. 실측으로 그
    // 본문이 200이고 응답의 `description`이 `null`이 된다.
    const stub = stubFetch(jsonResponse(200, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p1', { description: null })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ description: null })
  })

  it('updateProject는 준 키를 전부 싣는다', async () => {
    const stub = stubFetch(jsonResponse(200, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p1', { name: '가', slug: 'ga', description: '설명' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: '설명',
    })
  })

  it('빈 갱신 본문은 그 자리에서 거절한다', async () => {
    // **재라 #4를 프로젝트 쪽에서도 쟀다**: `PATCH /projects/:id {}`가
    // `400 {"code":"bad-request", …, "issues":[{"path":"","message":"변경할 값이 없습니다"}]}`로
    // 메뉴·페이지와 **같은 코드·문장**이다. 보내 봐야 400인 요청은 만들지 않는다 —
    // P2b-4가 `updateBody`에 적용한 판단을 그대로 쓴다(**새로 만들지 않았다**).
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateProject('p1', {}).catch((e: unknown) => e))

    expect(error.code).toBe('bad-request')
    expect(error.status).toBe(0)
    expect(stub.calls).toHaveLength(0)
  })

  it('undefined만 담긴 갱신 본문도 같다', async () => {
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateProject('p1', { name: undefined, slug: undefined, description: undefined })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('프로젝트 갱신의 거절도 동기 throw가 아니라 rejection이다', () => {
    const client = createHttpClient(stubFetch().fetchImpl)

    expect(() => client.updateProject('p1', {}).catch(() => undefined)).not.toThrow()
  })

  it('갱신 응답도 프로젝트 계약을 지난다', async () => {
    // `PATCH`의 응답은 `GET /:projectId`와 같은 다섯 키다(실측). 조회만 검사하고 쓰기를
    // 통과시키면 같은 계약이 반쪽만 지켜진다 — `pageDetail`이 겪은 자리와 같은 부류다.
    const stub = stubFetch(jsonResponse(200, { ...project, id: '' }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateProject('p1', { name: '가' }).catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('deleteProject는 204를 본문 없이 받는다', async () => {
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const stub = stubFetch(empty)
    const client = createHttpClient(stub.fetchImpl)

    await expect(client.deleteProject('p1')).resolves.toBeUndefined()

    expect(stub.calls[0]?.url).toBe('/api/projects/p1')
    expect(stub.calls[0]?.init?.method).toBe('DELETE')
    expect(json).not.toHaveBeenCalled()
  })

  it('경로에 들어가는 프로젝트 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, project), new Response(null, { status: 204 }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p 1/x', { name: '가' })
    await client.deleteProject('p 1/x')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx')
    expect(stub.calls[1]?.url).toBe('/api/projects/p%201%2Fx')
  })
})
