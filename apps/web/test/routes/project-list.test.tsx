import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectListItem, SessionUser } from '../../src/api/types'
import {
  currentPath,
  currentSearch,
  expiringSession,
  fakeApi,
  LIST_ITEM_DEFAULTS,
  renderWithProviders,
  tabHub,
  unauthenticatedError,
} from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/**
 * 서버가 준 문장이 그대로 화면에 오는지 보려면 화면이 하드코딩할 리 없는 문자열이어야
 * 한다. "목록을 불러오지 못했습니다" 같은 그럴듯한 문안을 박아 넣은 구현도 통과하는
 * 테스트는 아무것도 지키지 못한다.
 */
const SERVER_MESSAGE = '프로젝트 저장소가 응답하지 않습니다 [T5-LIST-4]'

/**
 * 화면의 문안을 여기 한 번 더 적어 둔다. 구현에서 상수를 import하면 문안이 엉뚱하게
 * 바뀌어도 테스트가 따라가 버려서, 사용자가 보는 문장을 아무도 지키지 않게 된다.
 */
const EMPTY_NOTICE = '참여 중인 프로젝트가 없습니다'
const LOADING_NOTICE = '불러오는 중…'
const UNKNOWN_FAILURE = '프로젝트 목록을 불러오지 못했습니다'

function project(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    ...LIST_ITEM_DEFAULTS,
    id: 'p-1',
    name: '관리자 콘솔',
    slug: 'admin-console',
    description: '내부 운영 도구',
    role: 'owner',
    ...overrides,
  }
}

/**
 * 로그인된 상태로 목록 화면을 띄운다. 라우트 표를 함께 지나므로 `/`에 이 화면이 실제로
 * 걸려 있는지도 같이 검사된다.
 */
/** 내용 칸 — 사이드바의 칸 목록(`<ul>`)과 가른다. */
function content(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-workspace-main')
  if (found === null) throw new Error('내용 칸을 찾지 못했습니다')
  return found
}

function renderList(listProjects: ApiClient['listProjects']): void {
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => USER, listProjects }),
    route: '/',
  })
}

describe('프로젝트 목록 화면', () => {
  it('프로젝트 목록을 이름으로 보여준다', async () => {
    renderList(async () => [project(), project({ id: 'p-2', name: '고객 포털', slug: 'portal' })])

    await screen.findByText('관리자 콘솔')
    screen.getByText('고객 포털')
    // 카드 둘 + 맨 앞의 «프로젝트 추가» 카드.
    expect(within(content()).getAllByRole('listitem')).toHaveLength(3)
    // 양성 대조: 비었을 때의 안내는 비지 않았으면 보이면 안 된다. 이것이 없으면
    // 안내를 늘 그리는 구현도 "비면 안내를 보여준다"를 통과한다.
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
  })

  it('프로젝트를 누르면 그 프로젝트로 간다', async () => {
    renderList(async () => [project({ id: 'p-7', name: '고객 포털' })])

    const link = await screen.findByRole('link', { name: '고객 포털' })
    // 양성 대조: 누르기 전에는 목록에 있다. 이것이 없으면 처음부터 프로젝트 주소에
    // 있는 상태로도 아래 단언이 통과한다.
    expect(currentPath()).toBe('/')

    fireEvent.click(link)

    await waitFor(() => {
      expect(currentPath()).toBe('/projects/p-7')
    })
  })

  it('목록이 비면 안내를 보여준다', async () => {
    renderList(async () => [])

    await screen.findByText(EMPTY_NOTICE)
    // 빈 목록은 실패가 아니다. 오류 문구가 함께 뜨면 사용자는 뭔가 망가졌다고 읽는다.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('조회에 실패하면 서버 메시지를 보여준다', async () => {
    renderList(async () => Promise.reject(new ApiError(500, 'internal', SERVER_MESSAGE)))

    await screen.findByText(SERVER_MESSAGE)
    // 실패는 "프로젝트가 없음"이 아니다. 둘을 같은 화면으로 뭉개면 사용자는 자기
    // 프로젝트가 사라졌다고 읽는다.
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
  })

  it('세션이 끊긴 실패면 로그인 화면으로 보낸다', async () => {
    // 화면은 `code`로 분기한다 — `unauthenticated`면 로그인으로. 문지기는 이미
    // 통과한 뒤라 다시 판정하지 않으므로, 이 판정이 없으면 사용자는 오류 문장만 보고
    // 새로고침 말고는 로그인 화면에 갈 길이 없다.
    renderWithProviders(<App />, {
      client: fakeApi({
        me: expiringSession(USER),
        listProjects: async () => Promise.reject(unauthenticatedError()),
      }),
      route: '/',
    })

    await waitFor(() => {
      expect(currentPath()).toBe('/login')
    })
    // 양성 대조: 실제로 **로그인 화면**이 떴다. 주소만 보면 빈 화면으로 보내는 구현도
    // 통과한다.
    await screen.findByRole('heading', { name: 'wirebound' })
    // 그리고 그 문장은 목록 자리에 남지 않는다 — 화면이 통째로 바뀌었다는 뜻이다.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('서버가 이유를 주지 않으면 화면이 가진 문장을 쓴다', async () => {
    // `http-client`가 네트워크 단절도 `ApiError`로 번역하지만, 화면이 보는 것은
    // `ApiClient` 인터페이스이지 그 구현이 아니다. `ApiError`가 아닌 값이 와도
    // 사용자에게 내부 문자열이 아니라 읽을 수 있는 문장이 가야 한다.
    renderList(async () => Promise.reject(new TypeError('Failed to fetch')))

    await screen.findByText(UNKNOWN_FAILURE)
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('클라이언트가 그 자리에서 던져도 화면이 살아남는다', async () => {
    // Promise를 돌려주지 않고 즉시 던지는 구현(테스트의 스텁 누락이 그렇다)을 흡수하지
    // 못하면 이펙트 밖으로 예외가 새어 나가 앱 트리 전체가 죽는다.
    renderList(() => {
      throw new TypeError('listProjects가 던졌다')
    })

    await screen.findByText(UNKNOWN_FAILURE)
  })

  it('로딩 중에는 목록도 빈 안내도 보이지 않는다', async () => {
    let deliver: (projects: ProjectListItem[]) => void = () => {}
    const pending = new Promise<ProjectListItem[]>((resolve) => {
      deliver = resolve
    })
    renderList(() => pending)

    // 로딩 중임을 화면이 실제로 말하는지부터 본다. 이것 없이 아래 단언만 하면
    // "아직 아무것도 안 그려졌다"를 "로딩을 구분한다"로 잘못 읽는다.
    await screen.findByText(LOADING_NOTICE)
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
    // 격자에는 «프로젝트 추가» 카드 하나뿐이다 — 프로젝트 카드는 아직 없다.
    expect(
      within(content())
        .getAllByRole('listitem')
        .map((li) => li.querySelector('.wb-shell-home-name')),
    ).toEqual([null])

    // 양성 대조: 응답이 오면 그때 안내가 나오고 로딩 표시는 사라진다.
    deliver([])
    await screen.findByText(EMPTY_NOTICE)
    expect(screen.queryByText(LOADING_NOTICE)).toBeNull()
  })

  it('설명이 없는 프로젝트도 그린다', async () => {
    renderList(async () => [
      project({ id: 'p-1', name: '설명 있는 설계서', description: '한 줄 설명' }),
      project({ id: 'p-2', name: '설명 없는 설계서', description: null }),
    ])

    const named = await screen.findByText('설명 없는 설계서')
    // 양성 대조: 설명이 있는 쪽은 설명이 실제로 보인다. 이것이 없으면 설명을 아예
    // 그리지 않는 구현도 이 케이스를 통과한다.
    screen.getByText('한 줄 설명')
    // 설명이 없는 항목에는 **설명 자리가 아예 없다.** 'null'이나 '설명 없음' 같은 대체
    // 문구를 끼워 넣으면 여기서 걸린다.
    //
    // **`li.textContent`가 이름과 정확히 같은지를 보지 마라.** 그 줄에는 `수정`·`삭제`
    // 버튼도 붙으므로 그 단언은 **결함이 아니라 케이스가 너무 넓어서** 깨진다 — 재는 것은
    // "설명이 그려지지 않는다"이지 "줄에 이름 말고 아무것도 없다"가 아니다. 설명이 그려지는
    // 자리(`<p>`)만 본다.
    const row = named.closest('li')
    expect(row?.querySelectorAll('p')).toHaveLength(0)
    // 양성 대조: 설명이 있는 쪽에는 그 자리가 있다.
    expect(screen.getByText('한 줄 설명').closest('li')?.querySelectorAll('p')).toHaveLength(1)
  })
})

/** 뼈대 사이드바의 칸 · 로그아웃은 `test/shell/workspace-layout.test.tsx` 가 화면마다 잰다. 여기는 목록 화면에만 있는 판 하나다. */
describe('목록 화면의 사이드바', () => {
  const ADMIN: SessionUser = { ...USER, isInstanceAdmin: true }

  /** 다른 탭의 로그인 소식으로 들어온 관리자 — 관리자 표시는 소식이 싣는다(`session/tab-channel.tsx`의 `readNews`). `/me`를 다시 부르지 않는다. */
  it('다른 탭의 로그인 소식으로 들어온 관리자에게도 «관리자» 묶음이 선다', async () => {
    const hub = tabHub()
    let me = 0
    const client = fakeApi({
      me: async () => {
        me += 1
        throw unauthenticatedError()
      },
      listProjects: async () => [],
    })
    renderWithProviders(<App />, { client, route: '/login', tabChannel: hub.channel })
    await screen.findByLabelText('이메일')

    await hub.fromOtherTab({ kind: 'signed-in', user: ADMIN })
    await screen.findByText(EMPTY_NOTICE)

    expect(screen.getByRole('navigation', { name: '관리자' })).toBeTruthy()
    expect(me).toBe(1)
  })
})

/**
 * **카드 격자 · 검색 · 역할 거름 · 정렬**(설계 「프로젝트 목록」 — `projects/project-filter.ts` 가 규칙을 갖고 여기는 화면에 닿는지를 잰다).
 * 상대 시각은 «지금» 에서 뺀 시각으로 짓는다 — 몇 ms 흔들려도 같은 글이 나오는 값(분 단위 한가운데)이다.
 */
describe('카드 격자 · 검색 · 거름 · 정렬', () => {
  const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000 - 20_000).toISOString()
  const ROWS = [
    project({ id: 'p-a', name: '관리자 콘솔', slug: 'admin', role: 'owner', memberCount: 3, updatedAt: minutesAgo(90) }),
    project({ id: 'p-b', name: '고객 포털', slug: 'portal', role: 'editor', memberCount: 1, updatedAt: minutesAgo(5) }),
    project({ id: 'p-c', name: '가나 보고서', slug: 'report', role: 'viewer', memberCount: 7, updatedAt: minutesAgo(60 * 24 * 2) }),
  ]

  /** 카드 이름 차례 — 내용 칸의 카드 목록에서. 맨 앞의 «프로젝트 추가» 카드는 이름이 없어 빠진다. */
  function names(): string[] {
    return within(within(content()).getByRole('list', { name: '프로젝트' }))
      .queryAllByRole('listitem')
      .flatMap((card) => {
        const name = card.querySelector('.wb-shell-home-name')
        return name === null ? [] : [name.textContent ?? '']
      })
  }

  function card(name: string): HTMLElement {
    const found = within(content())
      .getAllByRole('listitem')
      .find((li) => li.querySelector('.wb-shell-home-name')?.textContent === name)
    if (found === undefined) throw new Error(`카드가 없다: ${name}`)
    return found
  }

  it('카드에 역할 표지 · 멤버 수 · 상대 시각 · «설정» 링크가 선다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    const a = card('관리자 콘솔')
    expect(a.querySelector('.wb-shell-home-role')?.textContent).toBe('owner')
    expect(a.textContent).toContain('멤버 3명')
    expect(a.querySelector('time')?.textContent).toBe('1시간 전')
    expect(within(a).getByRole('link', { name: '관리자 콘솔 설정' }).getAttribute('href')).toBe('/projects/p-a/settings')
    expect(card('고객 포털').querySelector('time')?.textContent).toBe('5분 전')
    expect(card('가나 보고서').querySelector('.wb-shell-home-role')?.textContent).toBe('viewer')
    expect(card('가나 보고서').querySelector('time')?.textContent).toBe('2일 전')
  })

  it('기본 정렬은 «최근 수정» — 늦게 바뀐 것이 위다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    expect(names()).toEqual(['고객 포털', '관리자 콘솔', '가나 보고서'])
    expect((screen.getByLabelText('정렬') as HTMLSelectElement).value).toBe('updated')
  })

  it('검색 결과가 없으면 «검색 결과가 없습니다» — 빈 목록의 안내와 다른 문장이다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '없는 글자' } })
    expect(screen.getByText('검색 결과가 없습니다')).toBeTruthy()
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
    expect(names()).toEqual([])
    expect(content().textContent).toContain('프로젝트 3개 중 0개')
  })

  it('검색어 · 역할 · 정렬은 주소 질의에 둔다 — 고르면 주소가 바뀌고, 그 주소로 열면 그대로 선다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    fireEvent.change(screen.getByLabelText('역할'), { target: { value: 'editor' } })
    fireEvent.change(screen.getByLabelText('정렬'), { target: { value: 'name' } })
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '포' } })
    expect(names()).toEqual(['고객 포털'])
    expect(Object.fromEntries(new URLSearchParams(currentSearch()))).toEqual({ q: '포', role: 'editor', sort: 'name' })
    expect(currentPath()).toBe('/')
    cleanup()

    // 뒤로 가기로 돌아온 판 — 같은 주소로 다시 연다.
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => USER, listProjects: async () => ROWS }),
      route: '/?role=viewer&sort=name',
    })
    await screen.findByText('가나 보고서')
    expect(names()).toEqual(['가나 보고서'])
    expect((screen.getByLabelText('역할') as HTMLSelectElement).value).toBe('viewer')
    expect((screen.getByLabelText('정렬') as HTMLSelectElement).value).toBe('name')
  })

  /**
   * 검색 글은 칸이 들고 주소에는 싣기만 한다(`routes/project-list.tsx` 머리말 «검색 글은 칸이 든다»). 조합이 굳는 판 자체는 jsdom 이 못 낸다 — 실브라우저
   * `build-test/rv-ws-workspace.test.ts` «검색 칸에 한글을 조합해 치면 …» 이 잰다. 여기는 조합 중 주소 · 칸 밖 주소 변경 둘의 규칙만 잰다.
   */
  it('검색 칸 — 한글 조합 중에는 주소를 안 고치고 끝나면 싣는다 · 주소가 칸 밖에서 바뀌면(사이드바 «프로젝트») 칸이 따른다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    const box = screen.getByLabelText('검색') as HTMLInputElement
    fireEvent.compositionStart(box)
    fireEvent.change(box, { target: { value: 'ㄱ' } })
    fireEvent.change(box, { target: { value: '고' } })
    expect({ value: box.value, search: currentSearch() }).toEqual({ value: '고', search: '' })
    fireEvent.compositionEnd(box)
    expect(new URLSearchParams(currentSearch()).get('q')).toBe('고')

    fireEvent.click(within(screen.getByRole('navigation', { name: '작업 공간' })).getByRole('link', { name: '프로젝트' }))
    await waitFor(() => expect(currentSearch()).toBe(''))
    expect(box.value).toBe('')
  })

  it('«이름» 정렬은 한국어 차례다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => USER, listProjects: async () => ROWS }),
      route: '/?sort=name',
    })
    await screen.findByText('관리자 콘솔')
    expect(names()).toEqual(['가나 보고서', '고객 포털', '관리자 콘솔'])
  })
})

/**
 * **«프로젝트 추가» 카드 · «열기» · 톱니 설정**(설계 `docs/superpowers/specs/2026-11-02-theme-preview-and-project-cards-design.md` 「프로젝트 목록 카드」).
 * 추가 카드는 격자 맨 앞에 늘 선다 — 거른 결과 0 · 빈 목록 · 불러오는 중 · 조회 실패에서도. 누르면 그 카드 자리가 만들기 폼이다.
 * 만들기의 검사 · 오류 · 잠금은 `test/routes/project-crud.test.tsx` 가 잰다.
 */
describe('추가 카드 · 열기 · 톱니 설정', () => {
  const ROWS = [project({ id: 'p-a', name: '관리자 콘솔' }), project({ id: 'p-b', name: '고객 포털', slug: 'portal' })]
  const ADD = { name: '프로젝트 추가' }
  /** 빈 목록의 보조 글 — 화면 문안이라 여기 한 번 더 적는다(`EMPTY_NOTICE` 위 주석과 같은 까닭). */
  const EMPTY_HINT = '«프로젝트 추가» 카드로 첫 프로젝트를 만드세요'

  function grid(): HTMLElement {
    return within(content()).getByRole('list', { name: '프로젝트' })
  }

  it('추가 카드가 격자 맨 앞이다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    const [first] = within(grid()).getAllByRole('listitem')
    expect(within(first!).getByRole('button', ADD)).toBeTruthy()
    // 추가 단추는 하나뿐이다 — 프로젝트 카드 안에는 없다.
    expect(within(grid()).getAllByRole('button', ADD)).toHaveLength(1)
  })

  it('머리에 «새 프로젝트» 단추가 없다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    expect(screen.queryByRole('button', { name: '새 프로젝트' })).toBeNull()
    expect(document.body.querySelector('.wb-shell-workspace-head')?.querySelector('button')).toBeNull()
  })

  it('검색 결과 0 에서도 추가 카드가 남고 만들 수 있다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '없는 글자' } })
    expect(within(grid()).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(within(grid()).getByRole('button', ADD))
    expect(within(grid()).getByLabelText('이름')).toBeTruthy()
  })

  it('0 개 — 추가 카드와 빈 안내가 함께 서고, 안내는 «새 프로젝트» 단추를 가리키지 않는다', async () => {
    renderList(async () => [])
    await screen.findByText(EMPTY_NOTICE)
    expect(within(grid()).getAllByRole('listitem')).toHaveLength(1)
    expect(within(grid()).getByRole('button', ADD)).toBeTruthy()
    const hint = content().querySelector('.wb-shell-home-empty-hint')?.textContent ?? ''
    expect(hint).toBe(EMPTY_HINT)
    expect(hint).not.toMatch(/새 프로젝트/)
  })

  it('조회에 실패해도 추가 카드로 만든다 — 만들면 그 프로젝트로 간다', async () => {
    const createProject = vi.fn(async () => project({ id: 'p-new', name: '새것' }))
    renderWithProviders(<App />, {
      client: fakeApi({
        me: async () => USER,
        listProjects: async () => Promise.reject(new ApiError(500, 'internal', SERVER_MESSAGE)),
        createProject,
      }),
      route: '/',
    })
    await screen.findByText(SERVER_MESSAGE)
    fireEvent.click(within(grid()).getByRole('button', ADD))
    fireEvent.change(within(grid()).getByLabelText('이름'), { target: { value: '새것' } })
    fireEvent.change(within(grid()).getByLabelText('슬러그'), { target: { value: 'new' } })
    fireEvent.click(within(grid()).getByRole('button', { name: '만들기' }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-new'))
    expect(createProject).toHaveBeenCalledTimes(1)
  })

  it('불러오는 중에도 추가 카드로 폼을 연다', async () => {
    renderList(() => new Promise<ProjectListItem[]>(() => {}))
    await screen.findByText(LOADING_NOTICE)
    fireEvent.click(within(grid()).getByRole('button', ADD))
    expect(within(grid()).getByLabelText('이름')).toBeTruthy()
  })

  it('누르면 그 카드 자리가 폼이 되고, 닫으면 단추로 돌아와 포커스를 받는다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    fireEvent.click(within(grid()).getByRole('button', ADD))
    // 연 폼의 첫 칸 포커스는 `test/routes/project-crud.test.tsx` ««프로젝트 추가» 를 누르면 …» 가 잰다.
    const card = within(grid()).getByLabelText('이름').closest('li')!
    expect(within(grid()).queryByRole('button', ADD)).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: '취소' }))
    const again = within(grid()).getByRole('button', ADD)
    expect(document.activeElement).toBe(again)
  })

  it('카드마다 «<이름> 열기» 는 에디터로 · «<이름> 설정» 은 글자 없는 톱니로 설정에 간다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    for (const row of ROWS) {
      const open = within(grid()).getByRole('link', { name: `${row.name} 열기` })
      expect(open.getAttribute('href')).toBe(`/projects/${row.id}`)
      expect(open.textContent?.trim()).toBe('열기')
      const gear = within(grid()).getByRole('link', { name: `${row.name} 설정` })
      expect(gear.getAttribute('href')).toBe(`/projects/${row.id}/settings`)
      expect(gear.textContent?.trim()).toBe('')
      expect(gear.getAttribute('title')).toBe(`${row.name} 설정`)
    }
  })

  it('«열기» 를 누르면 그 프로젝트로 간다', async () => {
    renderList(async () => ROWS)
    await screen.findByText('관리자 콘솔')
    fireEvent.click(within(grid()).getByRole('link', { name: '고객 포털 열기' }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-b'))
  })
})
