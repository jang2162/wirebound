/**
 * 화면 테스트의 공통 배선. 두 가지를 준다 — 서버 대역인 `fakeApi`와, Provider·라우터를
 * 씌워 렌더하는 `renderWithProviders`.
 *
 * 테스트는 `http-client.ts`를 거치지 않는다. 화면이 보는 것은 `ApiClient` 인터페이스
 * 하나뿐이므로, 여기서 그 인터페이스를 직접 만족시키는 편이 `fetch`를 흉내 내는 것보다
 * 짧고 무엇을 검사하는지가 분명하다.
 */
import { KnownUserProvider, type KnownUserHolder } from '../src/api/known-user'
import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { systemTheme } from '@wirebound/themes'
import { ApiError, type ApiClient } from '../src/api/client'
import { ApiProvider } from '../src/api/context'
import { RealtimeProvider, type RealtimeSetup } from '../src/realtime/context'
import type { SessionUser } from '../src/api/types'
import { TabChannelProvider, type SessionNews, type TabChannel } from '../src/session/tab-channel'
import { DraftStoreProvider, type DraftStore } from '../src/panels/draft-store'

/**
 * 스텁되지 않은 메서드 자리에 놓는 함수. **`undefined`를 돌려주지 않고 던진다.**
 * 예상하지 못한 호출이 조용히 지나가면, 화면이 부르지도 않은 데이터로 그린 것처럼
 * 보이는 거짓 초록이 된다.
 */
function notStubbed(method: string): () => never {
  return () => {
    throw new Error(`fakeApi: ${method}가 스텁되지 않았습니다`)
  }
}

/**
 * 가짜가 쓰는 시스템 `admin`의 행 id. **실제 서버에서는 uuid이고 기동 동기화가 만든다** —
 * 값 자체에 뜻이 없고, `getProjectTheme`의 `themeId`와 `listProjectThemes`의 항목이
 * **같은 값을 가리키는 것**이 요점이다.
 */
export const SYSTEM_ADMIN_THEME_ID = '00000000-0000-4000-8000-000000000001'

/** 테스트가 명시적으로 스텁한 메서드만 동작하는 `ApiClient`. */
export function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    login: notStubbed('login'),
    logout: notStubbed('logout'),
    me: notStubbed('me'),
    listProjects: notStubbed('listProjects'),
    getProject: notStubbed('getProject'),
    createProject: notStubbed('createProject'),
    updateProject: notStubbed('updateProject'),
    deleteProject: notStubbed('deleteProject'),
    getTree: notStubbed('getTree'),
    createMenu: notStubbed('createMenu'),
    updateMenu: notStubbed('updateMenu'),
    deleteMenu: notStubbed('deleteMenu'),
    createPage: notStubbed('createPage'),
    updatePage: notStubbed('updatePage'),
    deletePage: notStubbed('deletePage'),
    importPage: notStubbed('importPage'),
    getPage: notStubbed('getPage'),
    patchOps: notStubbed('patchOps'),
    listPresets: notStubbed('listPresets'),
    createPreset: notStubbed('createPreset'),
    listComments: notStubbed('listComments'),
    createComment: notStubbed('createComment'),
    updateComment: notStubbed('updateComment'),
    deleteComment: notStubbed('deleteComment'),
    renumberComments: notStubbed('renumberComments'),
    /**
      * **이 메서드만 `notStubbed`가 아니다 — 유일한 예외이고 근거가 있다.**
      *
      * 나머지는 화면이 **그 데이터를 쓰려고** 부르므로, 스텁하지 않았다는 것은 곧 그
      * 테스트가 무엇을 그리는지 정하지 않았다는 뜻이다. 그런데 `getProjectTheme`은
      * 캔버스가 **테스트가 요청하지 않아도** 부른다(`canvas.tsx`가 `useProjectTheme`을
      * 쓴다). 여기서 던지면 캔버스를 지나가기만 하는 테스트 수십 개가 무관한 이유로
      * 콘솔을 채우고, 그 소음이 진짜 오류를 가린다.
      *
      * **기본값이 시스템 `admin`인 것도 근거가 있다** — 서버가 프로젝트를 만들 때 기본
      * 레이아웃을 시스템 `admin`에 걸어 두므로(`repos/projects.ts`), 새 프로젝트의
      * **실제 상태**가 이것이다. `null`을 기본값으로 두면 테스트가 실재하지 않는 상태를
      * 보게 된다.
      *
      * 테마가 판정에 걸리는 테스트는 **직접 스텁한다**
      * (`theme/project-theme-cascade.test.tsx`가 그렇게 한다) — 그 파일들이 기본값에
      * 기대지 않으므로 이 예외가 거짓 초록을 만들지 않는다.
      */
    getProjectTheme: async () => ({
      themeId: SYSTEM_ADMIN_THEME_ID,
      theme: systemTheme('admin') ?? null,
      issues: [],
    }),
    listMyRevisions: notStubbed('listMyRevisions'),
    /**
     * **`getProjectTheme`과 같은 이유로 `notStubbed`가 아니다.** 에디터 셸의 테마 고르개가
     * **테스트가 요청하지 않아도** 부른다(`routes/editor.tsx`). 여기서 던지면 셸을 지나가는
     * 테스트마다 무관한 콘솔 오류가 쌓이고, 그 소음이 진짜 오류를 가린다.
     *
     * **기본값이 시스템 `admin` 하나인 것도 실재하는 상태다** — 기동 동기화가 시스템
     * 테마를 넣고(`services/system-themes.ts`) 새 프로젝트는 파생 테마가 없다.
     * 위 `getProjectTheme`의 `themeId`와 같은 id를 쓰므로 **고르개가 "admin이 골라져
     * 있다"를 일관되게 그린다** — 둘이 갈리면 고르개가 실재하지 않는 상태를 보인다.
     */
    listProjectThemes: async () => {
      const admin = systemTheme('admin')
      return admin === undefined ? [] : [{ id: SYSTEM_ADMIN_THEME_ID, system: true, theme: admin }]
    },
    /**
     * **이쪽은 `notStubbed`다.** 위 둘은 화면이 스스로 부르는 **조회**이지만 이것은
     * **쓰기**이고, 테스트가 요청하지 않았는데 불릴 자리가 없다 — 불렸다면 그 테스트가
     * 무엇을 하는지 정하지 않은 것이다.
     */
    setProjectTheme: notStubbed('setProjectTheme'),
    /**
     * **셋 다 `notStubbed`다.** 위 두 예외(`getProjectTheme`·`listProjectThemes`)는
     * *"테스트가 요청하지 않아도 화면이 부른다"*가 근거인데, 이 셋을 부르는 화면은
     * 테마 저작 라우트 하나뿐이고 **그 주소로 가는 테스트만 그것을 지난다.**
     * 그러므로 불렸는데 스텁이 없다면 그 테스트가 무엇을 그리는지 정하지 않은 것이다.
     */
    getTheme: notStubbed('getTheme'),
    createTheme: notStubbed('createTheme'),
    updateTheme: notStubbed('updateTheme'),
    /**
     * **셋 다 `notStubbed`다.** 위 두 예외(`getProjectTheme`·`listProjectThemes`)의 근거는
     * *"테스트가 요청하지 않아도 화면이 부른다"*인데, 스냅샷 셋을 부르는 화면은 셸 머리의
     * 스냅샷 팝오버 하나뿐이고 팝오버를 **열어야** 부른다 — **그것을 여는 테스트만 그것을
     * 지난다**(테마 저작 셋과 같다).
     */
    listSnapshots: notStubbed('listSnapshots'),
    createSnapshot: notStubbed('createSnapshot'),
    restoreSnapshot: notStubbed('restoreSnapshot'),
    getExportPreview: notStubbed('getExportPreview'),
    downloadExport: notStubbed('downloadExport'),
    ...overrides,
  }
}

/** 세션이 없을 때 서버가 내는 오류. 여러 테스트가 같은 모양을 쓴다. */
export function unauthenticatedError(message = '로그인이 필요합니다'): ApiError {
  return new ApiError(401, 'unauthenticated', message)
}

/**
 * **첫 호출만 성공하고 그 뒤로는 세션이 없다고 답하는 `me`.**
 *
 * 재현하는 상황은 "화면에 들어와 있는 동안 서버가 세션을 지웠다"이다 — 문지기
 * (`routes/require-auth.tsx`)는 첫 호출로 이미 통과했고, 그다음 조회부터 401이 온다.
 * 401 의 `code`(`unauthenticated`)를 보고 로그인으로 돌려보내는 분기가 문지기 하나에만 있으면
 * 사용자는 그 화면에 갇힌다.
 *
 * **뒤 호출까지 성공하게 두면 안 된다.** 로그인 화면의 `RedirectWhenAuthenticated`가 다시
 * `me()`를 부르는데, 그것이 성공하면 목록으로 되돌려 보내고 그 목록이 다시 401을 받아
 * 케이스가 두 주소를 무한히 오간다.
 */
export function expiringSession(user: SessionUser): ApiClient['me'] {
  let alive = true
  return async () => {
    if (alive) {
      alive = false
      return user
    }
    throw unauthenticatedError()
  }
}

/** `currentPath()`가 읽는 자리. 화면이 쓸 일이 없도록 테스트 전용 이름을 쓴다. */
const LOCATION_PROBE = 'location-probe'

/**
 * 지금 라우터 위치를 DOM에 적어 두는 탐침. `renderWithProviders`가 아무것도 돌려주지
 * 않으므로(라우터 객체를 손에 쥐지 않으므로), 위치를 단언하는 통로가 이것 하나다.
 */
function LocationProbe(): ReactElement {
  const location = useLocation()
  return <span data-testid={LOCATION_PROBE}>{location.pathname}</span>
}

export interface RenderOptions {
  /** 화면이 볼 `ApiClient`. 생략하면 모든 메서드가 던지는 가짜다. */
  client?: ApiClient
  /** 라우터의 시작 위치. 생략하면 `/`다. */
  route?: string
  /**
   * 실시간 연결 설정. **생략하면 `RealtimeProvider`를 아예 안 세운다** — 그것이 화면
   * 테스트가 소켓을 열지 않는 이유이고(`src/realtime/context.tsx`), 편집이 REST로 나가는
   * 이유이기도 하다. 재연결·WS 전송을 재는 테스트만 이것을 준다.
   */
  realtime?: RealtimeSetup
  /**
   * 탭 사이의 세션 소식 통로(`src/session/tab-channel.tsx`). **생략하면 `TabChannelProvider`를 안 세운다** —
   * 다른 탭이 없는 화면이다. 진짜 `BroadcastChannel`을 기본으로 두지 않는 까닭은 그 파일의 머리말에 있다(워커
   * 사이로 흐른다). 탭 사이를 재는 테스트만 `tabHub()`의 것을 준다.
   */
  tabChannel?: TabChannel
  /**
   * 이 탭이 아는 사용자(`src/api/known-user.tsx`). **생략하면 `KnownUserProvider`를 안 세운다** — 세션이 적지도 듣지도
   * 않는다. 그 길을 재는 테스트만 준다.
   */
  knownUser?: KnownUserHolder
  /**
   * 초안의 사본(`src/panels/draft-store.tsx`). **생략하면 `DraftStoreProvider`를 안 세운다** — 초안이 메모리에만
   * 사는 화면이다. jsdom 의 `sessionStorage`는 파일 안의 케이스끼리 이어지므로 기본으로 두면
   * 앞 케이스의 초안이 뒤 케이스에 되살아난다. 사본을 재는 테스트만 준다(`test/panels/draft-store.test.tsx`).
   */
  draftStore?: DraftStore
}

/**
 * **다른 탭을 흉내 내는 통로.** 이 탭이 낸 소식은 `posted`에 쌓이고(다른 탭이 받을 것), `fromOtherTab`이 다른
 * 탭의 소식을 이 탭에 건넨다. 실제 `BroadcastChannel`처럼 **보낸 탭에는 안 온다** — `posted`는 이 탭의 수신자에
 * 닿지 않는다.
 */
export interface TabHub {
  channel: TabChannel
  posted: SessionNews[]
  fromOtherTab: (news: SessionNews) => Promise<void>
  /** 지금 듣고 있는 수신자 수 — 구독을 떼는지 잰다. */
  listeners: () => number
}

export function tabHub(): TabHub {
  const posted: SessionNews[] = []
  const receivers = new Set<(news: SessionNews) => void>()
  return {
    posted,
    listeners: () => receivers.size,
    channel: {
      post: (news) => {
        posted.push(news)
      },
      listen: (receive) => {
        receivers.add(receive)
        return () => {
          receivers.delete(receive)
        }
      },
    },
    fromOtherTab: async (news) => {
      await act(async () => {
        for (const receive of [...receivers]) receive(news)
      })
    },
  }
}

/**
 * 앱을 `ApiProvider` + 메모리 라우터 안에서 렌더한다.
 *
 * 브라우저 히스토리 대신 `MemoryRouter`를 쓰는 이유는 jsdom의 URL이 파일 간에 공유되기
 * 때문이다 — 앞 테스트가 옮겨 놓은 주소에서 뒤 테스트가 시작되면 원인을 찾기 어려운
 * 순서 의존이 생긴다.
 */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}): void {
  const routed = (
    <MemoryRouter initialEntries={[options.route ?? '/']}>
      {ui}
      <LocationProbe />
    </MemoryRouter>
  )

  const stored =
    options.draftStore === undefined ? routed : <DraftStoreProvider store={options.draftStore}>{routed}</DraftStoreProvider>
  const tabbed =
    options.tabChannel === undefined ? stored : <TabChannelProvider channel={options.tabChannel}>{stored}</TabChannelProvider>

  const live =
    options.realtime === undefined ? tabbed : <RealtimeProvider setup={options.realtime}>{tabbed}</RealtimeProvider>
  render(
    <ApiProvider client={options.client ?? fakeApi()}>
      {options.knownUser === undefined ? live : <KnownUserProvider holder={options.knownUser}>{live}</KnownUserProvider>}
    </ApiProvider>,
  )
}

/** 지금 라우터 위치의 경로. `renderWithProviders`로 렌더한 뒤에만 쓸 수 있다. */
export function currentPath(): string {
  return screen.getByTestId(LOCATION_PROBE).textContent ?? ''
}
