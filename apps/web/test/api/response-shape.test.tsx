/**
 * **성공 응답이 계약을 어겼을 때.** 서버가 200과 함께 계약에 없는 모양을 내면 화면이
 * 어떻게 되는지, 그리고 그것을 `http-client`가 어디서 막는지 본다.
 *
 * **왜 따로 있나.** `http-client.test.ts`는 "클라이언트가 계약을 어떻게 번역하느냐"를 보고,
 * 화면 테스트들은 `fakeApi`로 `ApiClient`를 직접 만족시키므로 **둘 다 `http-client`의 형태
 * 검사를 지나지 않는다.** 이 파일만 두 층을 함께 지난다 — 가짜 `fetch` → 진짜
 * `createHttpClient` → 진짜 화면.
 *
 * 잰 것(수정 전, 이 파일의 하네스 그대로):
 *
 * | 조회 | 계약 위반 본문 | 수정 전 |
 * |---|---|---|
 * | `getTree` | `{}` · `{menu:'x'}` · `{menu:[{}]}` | **화면 전체 사망**(`byOrder`의 전개에서 `items is not iterable`) |
 * | `listProjects` | `null` | **화면 전체 사망**(`state.projects.length`) |
 * | `getProject` | `null` | **화면 전체 사망**(`props.project.name`) |
 * | `getPage` | `{schema:{}}` | **화면 전체 사망**(렌더러가 `root.children`을 읽는다) |
 * | `getPage` | `null` | 살아남는다 — `load()`의 `try`가 흡수해 "페이지를 불러오지 못했습니다"가 뜬다 |
 *
 * 마지막 줄이 나머지와 갈리는 이유는 그 접근만 `try` 안에 있기 때문이다. **수정 뒤에는
 * 다섯 줄이 같은 경로로 모인다** — `ApiError('internal', '서버 응답을 이해할 수 없습니다')`가
 * 되어 D5의 실패 → 화면 규칙(`api/failure.tsx`)을 그대로 지난다. 그래서 `getPage`가 `null`인
 * 경우의 **문안만** 바뀐다(이유가 더 정확해진다). 셸이 사는 것은 그대로다.
 *
 * `schema.root` **안쪽**을 보지 않는 것은 렌더러가 거기서부터 폴백으로 흡수하기 때문이다(D8).
 * 실측: `{root:{id:'n-root',type:99}}`는 봉투 검사를 지나 캔버스까지 가고, 거기서
 * `.wb-shell-canvas-surface`가 그려진 채 `노드 1개를 그리지 못했습니다`와
 * `data-wb-error="노드의 type이 문자열이 아닙니다"`가 붙는다. 아래
 * `문서 노드가 깨진 것은 렌더러가 흡수한다`가 그 경계를 지킨다.
 *
 * **root 자신은 그 반대편이다.** `{root:'x'}`는 위 표의 `getPage` 줄에 걸려 렌더러에 닿지도
 * 않는다(실측: `ApiError(200, 'internal')`, 화면에는 `alert` 하나뿐이고
 * `.wb-shell-canvas-surface`는 **null**이다).
 */
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError } from '../../src/api/client'
import { createHttpClient } from '../../src/api/http-client'
import type { ApiClient } from '../../src/api/client'
import { renderWithProviders } from '../helpers'

const UNREADABLE = '서버 응답을 이해할 수 없습니다'

const USER = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT = { id: 'p-1', name: '관리자 콘솔 설계서', slug: 'ac', description: null, role: 'owner' }
const MENU = [{ id: 'mn-1', title: '회원관리', sortOrder: 1, pages: [], children: [] }]
const PAGE = {
  id: 'pg-1',
  menuNodeId: 'mn-1',
  title: '회원 목록',
  description: null,
  sortOrder: 1,
  schemaVersion: 1,
  headSeq: 7,
  schema: { version: 1, root: { id: 'n-root', type: 'Page', children: [] } },
}

/**
 * `PATCH .../ops`의 계약대로인 응답. **`inverse` 안쪽은 보지 않는다**(D11) — 그것은 서버가
 * 만든 `PatchOp[]`이고 거기서부터는 `@wirebound/schema`의 일이다.
 */
const PATCH_RESULT = {
  seq: 8,
  revisionId: 'rev-1',
  inverse: [{ op: 'replace', path: '/root/children/0/props/title', value: '옛 제목' }],
  schemaVersion: 1,
}

/** `GET .../revisions?mine=true`의 계약대로인 항목. */
const REVISION = {
  id: 'rev-1',
  seq: 8,
  actorType: 'user',
  actorId: 'u1',
  actorLabel: '홍길동',
  ops: [],
  inverse: [],
  createdAt: '2026-08-04T09:00:00.000Z',
}

/** 경로 끝으로 응답을 고르는 가짜 `fetch`. 전부 200 JSON이다 — 여기서 재는 것은 성공 대역이다. */
function routedFetch(bodies: Record<string, unknown>): typeof fetch {
  return (input) => {
    const url = String(input)
    const key = Object.keys(bodies).find((suffix) => url.endsWith(suffix))
    return Promise.resolve(
      new Response(JSON.stringify(key === undefined ? null : bodies[key]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
}

function client(bodies: Record<string, unknown>): ApiClient {
  return createHttpClient(routedFetch(bodies))
}

/** `catch`로 받은 값을 `ApiError`로 좁힌다. 아니면 그 자리에서 던져 테스트를 실패시킨다. */
function asApiError(value: unknown): ApiError {
  if (!(value instanceof ApiError)) {
    throw new Error(`ApiError가 아니라 ${String(value)}가 나왔다`)
  }
  return value
}

describe('성공 응답이 계약을 어기면 — http-client 층', () => {
  /** 조회 다섯과, 각각을 죽이는 본문들. 정상 본문이 짝으로 있어야 검사가 무조건 물지 않음을 안다. */
  const BROKEN: { name: string; call: (api: ApiClient) => Promise<unknown>; bodies: unknown[] }[] = [
    {
      name: 'me',
      call: (api) => api.me(),
      bodies: [null, 'x', [], { email: 'a@b.c' }],
    },
    {
      name: 'listProjects',
      call: (api) => api.listProjects(),
      bodies: [null, {}, 'x', [{}], [{ id: 'p-1' }]],
    },
    {
      name: 'getProject',
      call: (api) => api.getProject('p-1'),
      bodies: [null, [], {}, { id: 'p-1' }],
    },
    {
      name: 'getTree',
      call: (api) => api.getTree('p-1'),
      bodies: [
        null,
        {},
        { menu: 'x' },
        { menu: null },
        // 원소가 계약을 어기면 트리가 그리다 죽는다 — `pages`·`children`을 전개하기 때문이다.
        { menu: [{}] },
        { menu: [{ id: 'm', title: 'M', sortOrder: 1, children: [] }] },
        { menu: [{ id: 'm', title: 'M', sortOrder: 1, pages: [], children: [{}] }] },
        { menu: [{ id: 'm', title: 'M', sortOrder: 1, pages: [{}], children: [] }] },
      ],
    },
    {
      name: 'getPage',
      call: (api) => api.getPage('p-1', 'pg-1'),
      bodies: [null, [], {}, { ...PAGE, schema: 'x' }, { ...PAGE, schema: {} }, { ...PAGE, headSeq: '7' }],
    },
    {
      // undo 스택을 채우는 값이다. 배열이 아니거나 원소의 `inverse`가 배열이 아니면
      // 그것이 그대로 스택에 실려 undo가 `ops`로 보내다 죽는다.
      name: 'listMyRevisions',
      call: (api) => api.listMyRevisions('p-1', 'pg-1'),
      bodies: [
        null,
        {},
        'x',
        [{}],
        [{ ...REVISION, id: 1 }],
        [{ ...REVISION, inverse: 'x' }],
        [{ ...REVISION, inverse: null }],
      ],
    },
    {
      // `seq`가 다음 요청의 `baseSeq`이고 `inverse`가 undo가 되보낼 ops다. 둘 중 하나라도
      // 계약을 어기면 그 값이 그대로 큐와 undo 스택에 실린다 — `seq`가 문자열이면 다음
      // `baseSeq`가 조용히 어긋나고, `inverse`가 배열이 아니면 undo가 그것을 `ops`로
      // 보내다 죽는다.
      name: 'patchOps',
      call: (api) => api.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: [] }),
      bodies: [
        null,
        [],
        {},
        { ...PATCH_RESULT, seq: 'x' },
        { ...PATCH_RESULT, revisionId: 1 },
        { ...PATCH_RESULT, inverse: 'x' },
        { ...PATCH_RESULT, inverse: null },
      ],
    },
  ]

  describe('ApiError로 바꾼다', () => {
    for (const { name, call, bodies } of BROKEN) {
      it.each(bodies.map((body, index) => ({ name, body, index })))(
        `${name} ← $index: $body`,
        async ({ body }) => {
          const error = asApiError(await call(client({ '': body })).catch((caught: unknown) => caught))

          // **`ApiError`인 것이 요점이다.** 호출자는 `err instanceof ApiError`로 분기하므로
          // (`api/failure.tsx`), raw `TypeError`가 새면 그 분기가 통째로 빗나간다.
          expect(error.code).toBe('internal')
          expect(error.message).toBe(UNREADABLE)
          // 응답은 왔고 성공이었다. 연결 실패(0)와 섞이지 않아야 로그에서 갈라 볼 수 있다.
          expect(error.status).toBe(200)
        },
      )
    }
  })

  it('계약을 지킨 응답은 그대로 지나간다', async () => {
    // 음성 대조. 이것이 없으면 "무조건 던지는" 구현도 위 표를 전부 통과한다.
    const api = client({
      '/auth/me': USER,
      '/projects/p-1/tree': { menu: MENU },
      '/projects/p-1/pages/pg-1': PAGE,
      '/projects/p-1': PROJECT,
      '/projects': [PROJECT],
    })

    await expect(api.me()).resolves.toEqual(USER)
    await expect(api.listProjects()).resolves.toEqual([PROJECT])
    await expect(api.getProject('p-1')).resolves.toEqual(PROJECT)
    await expect(api.getTree('p-1')).resolves.toEqual(MENU)
    await expect(api.getPage('p-1', 'pg-1')).resolves.toEqual(PAGE)
  })

  it('patchOps의 계약을 지킨 응답은 그대로 지나간다', async () => {
    // 음성 대조. `clientOpId`가 없는 응답도 계약대로다 — 서버는 요청에 그 키가 있었을
    // 때만 되돌려 준다(`apps/api/src/routes/pages.ts`).
    const api = client({ '/ops': PATCH_RESULT })

    await expect(api.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: [] })).resolves.toEqual(PATCH_RESULT)
  })

  it('revision 목록이 비어 있어도 지나간다', async () => {
    // 편집한 적이 없는 페이지다. 검사가 "비어 있으면 잘못됐다"로 새면 여기서 죽는다.
    const api = client({ '/revisions?mine=true': [] })

    await expect(api.listMyRevisions('p-1', 'pg-1')).resolves.toEqual([])
  })

  it('계약을 지킨 revision 목록은 그대로 지나간다', async () => {
    const api = client({ '/revisions?mine=true': [REVISION] })

    await expect(api.listMyRevisions('p-1', 'pg-1')).resolves.toEqual([REVISION])
  })

  it('inverse가 빈 배열인 응답도 지나간다', async () => {
    // 계약이 허용하는 경계값이다. 검사가 "비어 있으면 잘못됐다"로 새면 여기서 죽는다.
    const api = client({ '/ops': { ...PATCH_RESULT, inverse: [] } })

    await expect(api.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: [] })).resolves.toEqual({
      ...PATCH_RESULT,
      inverse: [],
    })
  })

  it('빈 트리·설명 없는 프로젝트처럼 정상인 경계값도 지나간다', async () => {
    // 계약이 허용하는 빈 값들이다. 검사가 "비어 있으면 잘못됐다"로 새면 여기서 죽는다.
    const api = client({
      '/projects/p-1/tree': { menu: [] },
      '/projects': [],
      '/projects/p-1': { ...PROJECT, description: null },
    })

    await expect(api.getTree('p-1')).resolves.toEqual([])
    await expect(api.listProjects()).resolves.toEqual([])
    await expect(api.getProject('p-1')).resolves.toEqual({ ...PROJECT, description: null })
  })
})

describe('성공 응답이 계약을 어기면 — 화면 층', () => {
  it('트리 응답이 계약을 어겨도 셸이 산다', async () => {
    renderWithProviders(<App />, {
      client: client({ '/auth/me': USER, '/tree': { menu: [{}] }, '/projects/p-1': PROJECT }),
      route: '/projects/p-1',
    })

    // 셸은 그대로다. 수정 전에는 여기서 `document.body`가 통째로 비었다.
    await screen.findByRole('heading', { name: PROJECT.name })
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
    expect(screen.getAllByText(UNREADABLE).length).toBeGreaterThan(0)
  })

  it('프로젝트 목록 응답이 계약을 어겨도 화면이 산다', async () => {
    renderWithProviders(<App />, {
      client: client({ '/auth/me': USER, '/projects': null }),
      route: '/',
    })

    await screen.findByRole('alert')
    screen.getByRole('heading', { name: '프로젝트' })
    screen.getByText(UNREADABLE)
  })

  it('프로젝트 응답이 계약을 어기면 오류 화면이 뜬다', async () => {
    renderWithProviders(<App />, {
      client: client({ '/auth/me': USER, '/projects/p-1': null }),
      route: '/projects/p-1',
    })

    // 셸 **대신** 오류 화면이다(`routes/editor.tsx`의 판정). 수정 전에는 흰 화면이었다.
    await screen.findByRole('heading', { name: '설계서를 열지 못했습니다' })
    screen.getByText(UNREADABLE)
  })

  it('페이지 응답이 계약을 어겨도 셸이 산다', async () => {
    renderWithProviders(<App />, {
      client: client({
        '/auth/me': USER,
        '/tree': { menu: MENU },
        '/pages/pg-1': { ...PAGE, schema: {} },
        '/projects/p-1': PROJECT,
      }),
      route: '/projects/p-1/pages/pg-1',
    })

    // 실패는 캔버스 안에서 끝난다 — 트리와 도구는 그대로 있어야 다른 페이지로 옮겨 갈 수 있다.
    await screen.findByRole('heading', { name: PROJECT.name })
    await screen.findByRole('alert')
    screen.getByRole('region', { name: '메뉴·페이지 트리' })
  })

  it('문서 노드가 깨진 것은 렌더러가 흡수한다', async () => {
    // 봉투 검사가 `schema.root` **안쪽**까지 내려가면 안 된다는 반대편이다(D8).
    // 여기까지 막으면 그릴 수 있는 문서를 못 그리게 된다.
    renderWithProviders(<App />, {
      client: client({
        '/auth/me': USER,
        '/tree': { menu: MENU },
        '/pages/pg-1': { ...PAGE, schema: { version: 1, root: { id: 'n-root', type: 99 } } },
        '/projects/p-1': PROJECT,
      }),
      route: '/projects/p-1/pages/pg-1',
    })

    await screen.findByRole('heading', { name: PROJECT.name })
    // 문서는 실렸고, 깨진 노드는 폴백으로 그려진다.
    await waitFor(() => {
      expect(document.body.querySelector('.wb-shell-canvas-surface')).not.toBeNull()
    })
  })
})
