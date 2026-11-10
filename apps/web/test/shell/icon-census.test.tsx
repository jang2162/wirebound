/**
 * **아이콘 인구조사** — 셸의 아이콘 표(`src/shell/icons.ts`)가 지키는 성질을 화면째 센다.
 *
 * 1. **아이콘만 남은 단추는 이름과 `title` 을 가진다.** 화면을 그려 `button` 가운데 보이는 글이 없는 것을 모으고, 그 `aria-label` 과
 *    `title` 이 비었거나 서로 다르면 죽는다(이름 · `title` 은 아이콘을 얹기 전의 글 그대로다 — 표 머리말 «이름은 아이콘이 나르지 않는다»).
 * 2. **행동 메뉴 항목은 모두 아이콘을 받는다.** 화면의 행동 메뉴 단추(`aria-haspopup="menu"`)를 하나씩 열어 항목마다 아이콘
 *    (`svg.wb-shell-action-menu-icon`)이 있는지 센다. 일부러 아이콘을 안 주는 항목은 `WITHOUT_ICON` 에 이름으로 둔다(지금 비었다).
 * 3. **lucide 를 값으로 들이는 곳은 표 하나다**(표 머리말 «lucide 를 들이는 곳은 …») — 자리마다 직접 들이면 같은 동작이 다른 그림이
 *    되어도 표만 봐서는 모른다. 표 안에서 두 동작이 한 그림을 나눠 쓰지 않는 것도 함께 본다.
 *
 * **자가 0 을 세지 않게** 화면마다 센 수에 하한을 두고, 꼭 있어야 할 이름(`ICON_ONLY` · `MENU_ITEMS`)이 모두 나왔는지 본다 — 화면을
 * 잘못 세워 단추가 안 그려지면 «빈 이름 0 개»가 통과로 읽히지 않는다.
 *
 * ## 이 자가 안 그리는 자리
 *
 * - **떠남 통지의 «통지 닫기»**(`src/shell/edit-alert.tsx`) — 보내지 않은 편집을 두고 페이지를 떠나야 서는 판이라 여기서 세우지 않는다.
 *   이름 · `title` 은 `test/edit/reload-sent-edits.test.tsx` «떠남의 통지는 닫는 단추로 닫는다»가 잰다(`title` 을 `aria-label` 과 같은 값으로).
 * - **역할 · 판에 따라만 서는 단추** — 여기 세운 판(owner · 편집 모드 · 내 코멘트 하나)에 없는 것은 안 센다.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { App } from '../../src/app'
import type { ApiClient } from '../../src/api/client'
import type { AdminInvite, AdminProject, AdminUser, Comment, ProjectView, SessionUser } from '../../src/api/types'
import { PageJsonNoticeList, type PageJsonNotices } from '../../src/panels/page-json-notices'
import { ICONS } from '../../src/shell/icons'
import { canvasQuery, OTHER_PAGE_ID, openPage, pageDoc, PAGE_ID, PROJECT_ID, PROJECT_NAME, SHELL_MENU } from '../editor-harness'
import { fakeApi, renderWithProviders, listItem } from '../helpers'
import { adminThemeView } from '../theme-loader'
import '../../src/catalog-setup'

const DOC: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-list', type: 'Tree', props: { items: [{ label: '개요', open: true, children: [{ label: '상세' }] }] } },
    {
      id: 'n-kv',
      type: 'KeyValue',
      props: {
        pairs: [
          { key: '가', value: '1' },
          { key: '나', value: '2' },
        ],
      },
    },
    {
      id: 'n-btn',
      type: 'Button',
      props: { label: '검색' },
      marker: 1,
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-list', value: false }] }],
    },
  ],
})

/**
 * 화면째 세는 두 케이스(에디터 한 판 + 셸 밖 화면 넷을 그리고 메뉴를 스물 몇 개 연다)의 시간 한도. 기본 5s 는 붐빌 때 값 단언 없이 «시간 초과» 로만 빨강이었다(L-298 —
 * N27 전량 한 판에서 두 케이스). 잰 값(이 기계 15코어): 혼자 0.25 ~ 1.0s(첫 케이스가 에디터 모듈을 처음 적재하는 판이 가장 느리다), web 전량 한 판 0.72 ~ 0.98s, 코어의
 * 두 배(30개)로 CPU 를 붙든 판 1.4s 까지. 5s 는 그 3.5 ~ 20배라 한도에 닿으려면 기계가 멈추다시피 해야 한다 — 20s(api 프로젝트의 `testTimeout` 과 같은 값)는 재는 값의
 * 14배이고, 멈춘 케이스가 20s 뒤 «시간 초과» 로 보이는 것은 다른 web 케이스의 멈춤 감지(5s)에 영향이 없다. 시간이 드는 곳은 에디터 판 하나다(케이스 시간의 65 ~ 90% — `editorButtons`
 * 0.37 ~ 1.2s, 셸 밖 화면 넷 합 0.03 ~ 0.3s). 두 케이스가 그 판을 따로 그려 셀 것이 서로 다르므로(단추 이름 · 메뉴 항목) 덜 세는 길이 없다 — 한 케이스에 몰면 그 케이스의 시간이 두 배다.
 */
const CENSUS_TIMEOUT_MS = 20_000

/** 하나는 내 글(하네스의 사용자 `u-1`)이라 «수정»도 선다. */
const COMMENTS: Comment[] = [
  {
    id: 'c-1',
    nodeId: 'n-btn',
    body: '버튼 문구 확인',
    authorId: 'u-1',
    authorName: '테스터',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'c-2',
    nodeId: 'n-btn',
    body: '버튼 위치',
    authorId: 'u-2',
    authorName: '밥',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
]

const EDITOR_API: Partial<ApiClient> = {
  listComments: async () => COMMENTS,
  listSnapshots: async () => [],
}

/** 이 판에서 꼭 나와야 하는 «아이콘만 남은 단추»의 이름 — 자리 표의 «아이콘만» 칸이다. */
const ICON_ONLY = [
  '되돌리기',
  '다시 실행',
  '더 보기',
  '메뉴 트리에 추가',
  '회원관리 추가',
  '회원관리 더 보기',
  '회원 목록 더 보기',
  'Tree 항목 2 더 보기',
  'Tree 옮기기',
  '축소',
  '확대',
  '화면 맞춤',
  '1번째 지우기',
  '2번째 지우기',
  '항목 1 더 보기',
  '항목 1-1 더 보기',
  '접기',
  '규칙 1 삭제',
  '액션 1 삭제',
  '삭제',
  '탭 넣기',
  '닫기',
  '가져오기 결과 닫기',
]

/** 이 판에서 꼭 나와야 하는 행동 메뉴 항목 — 자리 표의 «아이콘 + 글» 칸의 메뉴 몫이다. */
const MENU_ITEMS = [
  '이름 변경',
  '위로',
  '아래로',
  '들여쓰기',
  '내어쓰기',
  '삭제',
  '하위 메뉴',
  '페이지 추가',
  'JSON 에서 가져오기…',
  'JSON 내보내기',
  '옮기기',
  '최상위 메뉴 추가',
  '모듈로 저장…',
  '계정 설정',
  '공통코드',
  '프로젝트 설정',
  '스냅샷',
  '프로젝트 내보내기',
  '로그아웃',
  '기본',
  // 관리자 칸의 줄 «…»(`src/admin/*`) — 사용자 넷(비활성 · 일반 · 관리자 줄) · 초대 링크 · 프로젝트.
  '다시 활성화',
  '재설정 링크 만들기',
  '관리자로 지정',
  '관리자 해제',
  '비활성화',
  '거두기',
  'owner 넘기기',
]

/** 일부러 아이콘을 안 주는 행동 메뉴 항목(머리말 2) — 없다. 생기면 이름과 까닭을 여기 둔다. */
const WITHOUT_ICON: readonly string[] = []

interface IconOnly {
  name: string | null
  title: string | null
}

/** 보이는 글이 없는 단추 — 아이콘만 남은 단추(머리말 1). */
function iconOnlyButtons(root: ParentNode = document.body): IconOnly[] {
  return [...root.querySelectorAll<HTMLButtonElement>('button')]
    .filter((button) => (button.textContent ?? '').trim() === '')
    .map((button) => ({ name: button.getAttribute('aria-label'), title: button.getAttribute('title') }))
}

/** 이름 · `title` 이 비었거나 서로 다른 것 — 비어야 한다. */
function unnamed(found: readonly IconOnly[]): IconOnly[] {
  return found.filter((button) => button.name === null || button.name.trim() === '' || button.title !== button.name)
}

/** 메뉴 항목 하나 — 이름과 아이콘이 있는가. */
interface MenuEntry {
  menu: string
  item: string
  icon: boolean
}

/**
 * 화면의 행동 메뉴를 하나씩 열어 항목을 센다(머리말 2). 단추는 열 때마다 다시 찾는다 — 트리 줄의 메뉴는 열면서 그 줄을 골라 화면이 다시
 * 그려진다. 연 메뉴는 Escape 로 닫는다.
 */
async function openEveryMenu(): Promise<MenuEntry[]> {
  const entries: MenuEntry[] = []
  const done = new Set<string>()
  for (let guard = 0; guard < 100; guard += 1) {
    const next = [...document.body.querySelectorAll<HTMLButtonElement>('[aria-haspopup="menu"]')].find(
      (toggle) => !done.has(toggle.getAttribute('aria-label') ?? ''),
    )
    if (next === undefined) return entries
    const menu = next.getAttribute('aria-label') ?? ''
    done.add(menu)
    fireEvent.click(next)
    await act(async () => {})
    const list = document.getElementById(next.getAttribute('aria-controls') ?? '')
    if (list === null) throw new Error(`«${menu}»를 열었는데 목록이 없다`)
    // 하나를 고르는 항목(`menuitemradio` — 상태 전환기)도 행동 메뉴 항목이다.
    for (const item of [...within(list).queryAllByRole('menuitem'), ...within(list).queryAllByRole('menuitemradio')]) {
      entries.push({ menu, item: item.textContent ?? '', icon: item.querySelector('svg.wb-shell-action-menu-icon') !== null })
    }
    fireEvent.keyDown(list, { key: 'Escape' })
    await act(async () => {})
  }
  throw new Error('행동 메뉴가 끝나지 않는다')
}

function pickOnCanvas(nodeId: string): void {
  const el = canvasQuery(`[data-wb-id="${nodeId}"]`)
  if (el === null) throw new Error(`캔버스에 ${nodeId} 가 없다`)
  fireEvent.click(el)
}

/** 에디터의 판 — 노드를 고르고 탭 · 판 · 대화 상자를 차례로 열며 아이콘만 남은 단추를 모은다. */
async function editorButtons(): Promise<{ found: IconOnly[]; menus: MenuEntry[] }> {
  await openPage(DOC, { docs: { [PAGE_ID]: DOC, [OTHER_PAGE_ID]: DOC }, apiOverrides: EDITOR_API })
  const found: IconOnly[] = []
  // 트리 항목 위젯(줄 `…` · 펼침 표지)과 목록 위젯(옮기기 · 지우기)을 한 판씩 — 둘 다 아이콘만 남은 단추를 든다.
  pickOnCanvas('n-list')
  await screen.findByRole('button', { name: '항목 1 더 보기' })
  found.push(...iconOnlyButtons())
  pickOnCanvas('n-kv')
  await screen.findByRole('button', { name: '1번째 지우기' })
  // 하단 컴포넌트 판을 연다 — 카드의 «넣기». 열림은 창 저장소에 남아 앞 케이스가 연 판이면 이미 열려 있다.
  const toggle = screen.getByRole('button', { name: '컴포넌트' })
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  await act(async () => {})
  await screen.findByRole('group', { name: '컴포넌트 카드' })
  found.push(...iconOnlyButtons())

  pickOnCanvas('n-btn')
  fireEvent.click(screen.getByRole('tab', { name: '상호작용' }))
  await screen.findByRole('button', { name: '규칙 1 삭제' })
  found.push(...iconOnlyButtons())

  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  await screen.findByText('버튼 위치')
  found.push(...iconOnlyButtons())

  const menus = await openEveryMenu()

  // 대화 상자 — 머리 `…` 의 «스냅샷».
  fireEvent.click(screen.getByRole('button', { name: SHELL_MENU }))
  fireEvent.click(screen.getByRole('menuitem', { name: '스냅샷' }))
  const dialog = await screen.findByRole('dialog')
  found.push(...iconOnlyButtons(dialog))
  return { found, menus }
}

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터', isInstanceAdmin: true }
const PROJECT: ProjectView = { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin', description: null, role: 'owner', themeRev: 0 }

const adminRow = (id: string, name: string, extra: Partial<AdminUser>): AdminUser => ({
  id,
  email: `${id}@example.com`,
  name,
  isInstanceAdmin: false,
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastSeenAt: null,
  projectCount: 0,
  invite: null,
  ...extra,
})
const ADMIN_USERS: AdminUser[] = [
  adminRow('u-2', '일반', {}),
  adminRow('u-3', '다른관리자', { isInstanceAdmin: true }),
  adminRow('u-4', '꺼진사람', { active: false }),
]
const ADMIN_INVITE: AdminInvite = {
  id: 'i-1',
  name: '디자인팀',
  kind: 'multi',
  expiresAt: '2026-11-08T00:00:00.000Z',
  state: 'usable',
  signups: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  createdBy: { id: 'u-1', name: '테스터' },
}
const ORPHAN: AdminProject = {
  id: 'p-9',
  name: '주인 없음',
  slug: 'orphan',
  owners: [],
  hasActiveOwner: false,
  memberCount: 1,
  updatedAt: '2026-10-01T00:00:00.000Z',
}

/** 에디터 밖 화면 넷 — 주소 · 그 화면이 부르는 조회 · 다 그려졌다는 표지(`test/shell/workspace-layout.test.tsx` 의 `SCREENS` 와 같은 판). */
const OUTSIDE = [
  { screen: '프로젝트 목록', route: '/', heading: '프로젝트', api: { listProjects: async () => [listItem(PROJECT)] } },
  {
    screen: '프로젝트 설정',
    route: `/projects/${PROJECT_ID}/settings`,
    heading: `${PROJECT_NAME} 설정`,
    api: {
      getProject: async () => PROJECT,
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
      listMembers: async () => [],
    },
  },
  { screen: '계정 설정', route: '/account', heading: '계정 설정', api: { listMyTokens: async () => [] } },
  { screen: '테마 관리', route: '/admin/themes', heading: '테마 관리', api: { listThemePackages: async () => [] } },
  // 관리자 칸 넷 — 줄 «…» 가 서도록 줄을 싣는다(비활성 · 일반 · 관리자 사용자, 쓸 수 있는 초대 링크, 활성 owner 없는 프로젝트).
  { screen: '관리자 › 사용자', route: '/admin/users', heading: '사용자', api: { listAdminUsers: async () => ADMIN_USERS } },
  { screen: '관리자 › 초대 링크', route: '/admin/invites', heading: '초대 링크', api: { listInvites: async () => [ADMIN_INVITE] } },
  {
    screen: '관리자 › 프로젝트',
    route: '/admin/projects',
    heading: '프로젝트',
    api: { listAdminProjects: async () => [ORPHAN], listProjects: async () => [] },
  },
  {
    screen: '관리자 › 기록',
    route: '/admin/audit',
    heading: '기록',
    api: { listAudit: async () => ({ entries: [], next: null }), listAdminUsers: async () => [] },
  },
] as const satisfies readonly { screen: string; route: string; heading: string; api: Partial<ApiClient> }[]

async function outsideScreen(
  at: (typeof OUTSIDE)[number],
): Promise<{ found: IconOnly[]; menus: MenuEntry[]; sideLinks: { name: string; icon: boolean }[] }> {
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => USER, listProjects: async () => [], ...at.api }),
    route: at.route,
  })
  await screen.findByRole('heading', { name: at.heading })
  const found = iconOnlyButtons()
  // 사이드바의 칸(`shell/workspace-layout.tsx`)도 «아이콘 + 글» 이다 — 행동 메뉴 항목과 같은 성질을 센다.
  const side = document.body.querySelector<HTMLElement>('.wb-shell-workspace-side')
  const sideLinks = [...(side?.querySelectorAll<HTMLElement>('.wb-shell-workspace-link') ?? [])].map((link) => ({
    name: link.textContent ?? '',
    icon: link.querySelector('svg.wb-shell-icon-lead') !== null,
  }))
  return { found, menus: await openEveryMenu(), sideLinks }
}

/** 하단 바의 페이지 JSON 통지 — 가져온 결과. 트리의 가져오기를 끝까지 돌리지 않고 통지만 세운다(내보내기의 실패는 모달 안의 문장이다). */
function noticeButtons(): IconOnly[] {
  const notices: PageJsonNotices = {
    imported: {
      page: { id: 'pg-9', menuNodeId: 'mn-1', title: '가져온 페이지', sortOrder: 9 },
      comments: { inserted: 0, dangling: 0 },
    } as unknown as PageJsonNotices['imported'],
    showImported: () => {},
  }
  renderWithProviders(<PageJsonNoticeList notices={notices} />)
  return iconOnlyButtons()
}

describe('아이콘만 남은 단추는 이름과 title 을 가진다', () => {
  it(
    '에디터 · 셸 밖 화면 넷 · 하단 바 통지 — 이름 · title 이 빈 것이 없다',
    async () => {
      const all: IconOnly[] = []
      const editor = await editorButtons()
      all.push(...editor.found)
      cleanup()
      const perScreen: Record<string, number> = { 에디터: editor.found.length }
      for (const at of OUTSIDE) {
        const { found, sideLinks } = await outsideScreen(at)
        // 에디터 밖 화면에는 아이콘만 남은 단추가 없을 수 있다 — 카나리아는 사이드바가 선 것(칸 수)으로 센다.
        perScreen[at.screen] = sideLinks.length
        all.push(...found)
        cleanup()
      }
      const notices = noticeButtons()
      perScreen['통지'] = notices.length
      all.push(...notices)

      expect(unnamed(all)).toEqual([])
      // 카나리아 — 판이 섰다: 꼭 나올 이름이 다 나왔고, 화면마다 센 수가 있다(에디터 밖 화면은 사이드바의 칸 수).
      const names = new Set(all.map((button) => button.name))
      expect(ICON_ONLY.filter((name) => !names.has(name))).toEqual([])
      expect(perScreen).toEqual({
        에디터: expect.any(Number),
        '프로젝트 목록': expect.any(Number),
        '프로젝트 설정': expect.any(Number),
        '계정 설정': expect.any(Number),
        '테마 관리': expect.any(Number),
        '관리자 › 사용자': expect.any(Number),
        '관리자 › 초대 링크': expect.any(Number),
        '관리자 › 프로젝트': expect.any(Number),
        '관리자 › 기록': expect.any(Number),
        통지: 1,
      })
      for (const [where, count] of Object.entries(perScreen)) expect({ where, enough: count >= 1 }).toEqual({ where, enough: true })
    },
    CENSUS_TIMEOUT_MS,
  )
})

describe('행동 메뉴 항목은 모두 아이콘을 받는다', () => {
  it(
    '에디터 · 셸 밖 화면의 메뉴를 전부 열어 — 아이콘 없는 항목이 없다',
    async () => {
      const entries: MenuEntry[] = []
      const sideLinks: { name: string; icon: boolean }[] = []
      entries.push(...(await editorButtons()).menus)
      cleanup()
      for (const at of OUTSIDE) {
        const outside = await outsideScreen(at)
        entries.push(...outside.menus)
        sideLinks.push(...outside.sideLinks)
        cleanup()
      }

      expect(entries.filter((entry) => !entry.icon && !WITHOUT_ICON.includes(entry.item))).toEqual([])
      // 사이드바의 칸도 모두 아이콘을 받는다 — 판의 사람이 관리자라 관리자 칸 다섯까지 화면마다 일곱이다.
      expect(sideLinks.filter((link) => !link.icon)).toEqual([])
      expect(sideLinks).toHaveLength(OUTSIDE.length * 7)
      // 카나리아 — 메뉴가 열렸다: 꼭 나올 항목이 다 나왔다.
      const items = new Set(entries.map((entry) => entry.item))
      expect(MENU_ITEMS.filter((item) => !items.has(item))).toEqual([])
      expect(entries.length).toBeGreaterThanOrEqual(MENU_ITEMS.length)
    },
    CENSUS_TIMEOUT_MS,
  )
})

/** `src` 의 `.ts` · `.tsx` 원문 — `?raw` 라 실행되지 않는다(`test/shell-css-coverage.test.ts` 의 `RAW` 와 같은 기전). */
const RAW = import.meta.glob('../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/**
 * 원문의 `import` 문 가운데 값을 들이는 것(`import type` 빼고)의 모듈 이름. 문은 줄 머리의 `import` 에서 다음 줄 머리의 `import` 앞까지로
 * 자르고 그 안의 첫 `from '…'` 을 읽는다 — 여러 줄에 걸친 문도 한 조각이다. 동적 `import('…')` · `export … from` 은 안 본다.
 */
function valueImports(source: string): string[] {
  return source
    .split(/^(?=import\b)/m)
    .map((chunk) => /^import\s+(type\s)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/.exec(chunk))
    .filter((match): match is RegExpExecArray => match !== null && match[1] === undefined)
    .map((match) => match[2]!)
}

describe('lucide 를 값으로 들이는 곳은 아이콘 표 하나다', () => {
  it('`import … from "lucide-react"`(타입만 들이는 것 빼고)는 `shell/icons.ts` 에만 있다', () => {
    const importers = Object.entries(RAW)
      .filter(([, source]) => valueImports(source).includes('lucide-react'))
      .map(([path]) => path.replace(/^\.\.\/\.\.\/src\//, ''))
    expect(importers).toEqual(['shell/icons.ts'])
    // 카나리아 — 원문을 읽었다.
    expect(Object.keys(RAW).length).toBeGreaterThan(50)
  })

  it('표 안에서 두 동작이 한 그림을 나눠 쓰지 않는다', () => {
    const byIcon = new Map<unknown, string[]>()
    for (const [name, icon] of Object.entries(ICONS)) byIcon.set(icon, [...(byIcon.get(icon) ?? []), name])
    expect([...byIcon.values()].filter((names) => names.length > 1)).toEqual([])
  })
})
