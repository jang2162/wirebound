/**
 * `createHttpClient`의 계약 테스트. **네트워크를 타지 않는다** — 가짜 `fetch`를
 * 주입하고, 그 가짜가 받은 인자와 돌려준 응답만으로 판정한다.
 *
 * 이 파일이 검사하는 것은 "서버가 무엇을 주느냐"가 아니라 "클라이언트가 서버 계약
 * (`apps/api/README.md`의 엔드포인트 표)을 어떻게 번역하느냐"다 — 경로·메서드·본문,
 * 쿠키를 싣기 위한 `credentials`, `{ menu }` 봉투 벗기기, 에러 봉투 → `ApiError`.
 */
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiErrorCode } from '../../src/api/client'
import { createHttpClient } from '../../src/api/http-client'
import type { PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from '../../src/api/types'

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
