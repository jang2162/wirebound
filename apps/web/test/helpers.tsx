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
import { ApiError, type ApiClient } from '../src/api/client'
import { ApiProvider } from '../src/api/context'
import { RealtimeProvider, type RealtimeSetup } from '../src/realtime/context'
import type { ProjectDetail, ProjectListItem, SessionUser } from '../src/api/types'
import { TabChannelProvider, type SessionNews, type TabChannel } from '../src/session/tab-channel'
import { DraftStoreProvider, type DraftStore } from '../src/panels/draft-store'
import { ThemeBundleProvider } from '../src/theme/bundle-context'
import type { ThemeBundleLoader } from '../src/theme/bundle-loader'
import { staticBundleLoader } from './theme-loader'

/** `listProjects` 픽스처의 두 칸 기본값 — 시각은 `projects/project-filter.ts` 의 정렬을 흔들지 않는 고정값이다. */
export const LIST_ITEM_DEFAULTS = { memberCount: 1, updatedAt: '2026-10-01T00:00:00.000Z' } as const

/** 프로젝트 픽스처를 `GET /api/projects` 항목으로 — 상세의 `themeRev` 같은 칸은 떼고 목록의 두 칸을 더한다. */
export function listItem(project: ProjectDetail, extra: Partial<Pick<ProjectListItem, 'memberCount' | 'updatedAt'>> = {}): ProjectListItem {
  const { id, name, slug, description, role } = project
  return { id, name, slug, description, role, ...LIST_ITEM_DEFAULTS, ...extra }
}

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
 * 테스트가 명시적으로 스텁한 메서드만 동작하는 `ApiClient`.
 *
 * **`readTree`는 스텁하지 않으면 그 객체의 `getTree`로 선다**(판 번호 0) — 메뉴 트리를 그리는 케이스가 `getTree`만 스텁하고 그 호출 수를
 * 센다. 번호가 늘 0 이면 트리 칸은 «늦게 낸 조회의 답만»으로 가른다(`tree/use-tree-commands.tsx`의 `settles`).
 */
export function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  const api: ApiClient = {
    login: notStubbed('login'),
    logout: notStubbed('logout'),
    me: notStubbed('me'),
    listProjects: notStubbed('listProjects'),
    listMyTokens: notStubbed('listMyTokens'),
    revokeMyToken: notStubbed('revokeMyToken'),
    revokeAllMyTokens: notStubbed('revokeAllMyTokens'),
    changePassword: notStubbed('changePassword'),
    listMembers: notStubbed('listMembers'),
    addMember: notStubbed('addMember'),
    updateMemberRole: notStubbed('updateMemberRole'),
    removeMember: notStubbed('removeMember'),
    getProject: notStubbed('getProject'),
    createProject: notStubbed('createProject'),
    updateProject: notStubbed('updateProject'),
    deleteProject: notStubbed('deleteProject'),
    getTree: notStubbed('getTree'),
    createMenu: notStubbed('createMenu'),
    updateMenu: notStubbed('updateMenu'),
    deleteMenu: notStubbed('deleteMenu'),
    deleteMenuCascade: notStubbed('deleteMenuCascade'),
    createPage: notStubbed('createPage'),
    updatePage: notStubbed('updatePage'),
    deletePage: notStubbed('deletePage'),
    importPage: notStubbed('importPage'),
    getPage: notStubbed('getPage'),
    patchOps: notStubbed('patchOps'),
    listModules: notStubbed('listModules'),
    getModule: notStubbed('getModule'),
    createModule: notStubbed('createModule'),
    renameModule: notStubbed('renameModule'),
    deleteModule: notStubbed('deleteModule'),
    listMyModules: notStubbed('listMyModules'),
    getMyModule: notStubbed('getMyModule'),
    createMyModule: notStubbed('createMyModule'),
    renameMyModule: notStubbed('renameMyModule'),
    deleteMyModule: notStubbed('deleteMyModule'),
    uploadAsset: notStubbed('uploadAsset'),
    listAssets: notStubbed('listAssets'),
    claimAssets: notStubbed('claimAssets'),
    claimMyAssets: notStubbed('claimMyAssets'),
    listComments: notStubbed('listComments'),
    createComment: notStubbed('createComment'),
    updateComment: notStubbed('updateComment'),
    deleteComment: notStubbed('deleteComment'),
    renumberComments: notStubbed('renumberComments'),
    listMyRevisions: notStubbed('listMyRevisions'),
    listRevisionsBefore: notStubbed('listRevisionsBefore'),
    /**
     * **셋 다 `notStubbed`다.** 스냅샷 셋을 부르는 화면은 셸 머리의 스냅샷 팝오버 하나뿐이고 팝오버를 **열어야**
     * 부른다 — **그것을 여는 테스트만 그것을 지난다.**
     */
    listSnapshots: notStubbed('listSnapshots'),
    createSnapshot: notStubbed('createSnapshot'),
    restoreSnapshot: notStubbed('restoreSnapshot'),
    getExportPreview: notStubbed('getExportPreview'),
    downloadExport: notStubbed('downloadExport'),
    getProjectTheme: notStubbed('getProjectTheme'),
    putProjectTheme: notStubbed('putProjectTheme'),
    getThemeImpact: notStubbed('getThemeImpact'),
    listThemePackages: notStubbed('listThemePackages'),
    getThemeManifest: notStubbed('getThemeManifest'),
    uploadThemePackage: notStubbed('uploadThemePackage'),
    setThemePackageHidden: notStubbed('setThemePackageHidden'),
    downloadThemeTemplate: notStubbed('downloadThemeTemplate'),
    readTree: async (projectId, options) => ({ menu: await api.getTree(projectId, options), rev: 0 }),
    ...overrides,
  }
  return api
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
  // 질의는 속성에 싣는다 — 글(`currentPath()`)은 경로만이라 기존 단언이 그대로 선다.
  return (
    <span data-testid={LOCATION_PROBE} data-search={location.search}>
      {location.pathname}
    </span>
  )
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
  /**
   * 테마 번들 로더. **생략하면 `system-admin@0.1.0` 만 아는 시험용 로더다**(`test/theme-loader.ts`) — jsdom 은 `<script src>` 를 실행하지
   * 않으므로 앱의 스크립트 로더를 쓸 수 없다. 적재를 재는 테스트만 준다.
   */
  bundleLoader?: ThemeBundleLoader
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

  const stored = options.draftStore === undefined ? routed : <DraftStoreProvider store={options.draftStore}>{routed}</DraftStoreProvider>
  const tabbed = options.tabChannel === undefined ? stored : <TabChannelProvider channel={options.tabChannel}>{stored}</TabChannelProvider>

  const live = options.realtime === undefined ? tabbed : <RealtimeProvider setup={options.realtime}>{tabbed}</RealtimeProvider>
  render(
    <ApiProvider client={options.client ?? fakeApi()}>
      <ThemeBundleProvider loader={options.bundleLoader ?? staticBundleLoader()}>
        {options.knownUser === undefined ? live : <KnownUserProvider holder={options.knownUser}>{live}</KnownUserProvider>}
      </ThemeBundleProvider>
    </ApiProvider>,
  )
}

/** 지금 라우터 위치의 경로. `renderWithProviders`로 렌더한 뒤에만 쓸 수 있다. */
export function currentPath(): string {
  return screen.getByTestId(LOCATION_PROBE).textContent ?? ''
}

/** 지금 라우터 위치의 질의(`?…` — 없으면 빈 글). `renderWithProviders`로 렌더한 뒤에만 쓸 수 있다. */
export function currentSearch(): string {
  return screen.getByTestId(LOCATION_PROBE).getAttribute('data-search') ?? ''
}
