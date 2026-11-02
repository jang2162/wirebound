/**
 * 프로젝트 목록의 만들기(고치기 · 지우기는 설정 페이지 — `test/routes/settings.test.tsx` · `test/settings/danger-section.test.tsx`). **`<App />`을 라우트째 렌더한다** — 목록이
 * `/`에 실제로 걸려 있는지와 만든 뒤의 이동까지 같은 케이스가 지난다.
 *
 * **가짜 `ApiClient`를 쓴다**(`test/helpers.tsx`의 `fakeApi`). 나가는 본문의 조립은
 * `test/api/http-client.test.ts`가 따로 지킨다 — 여기서는 **무엇을 부르는가**와 **화면이
 * 무엇을 보이는가**를 본다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { SessionUser, ProjectListItem } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders, LIST_ITEM_DEFAULTS } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 화면이 하드코딩할 리 없는 문자열이어야 서버 문장이 그대로 온 것을 잴 수 있다. */
const DUPLICATE_SLUG = '이미 사용 중인 슬러그입니다 [T4-DUP]'
const BAD_SLUG = '슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다 [T4-FMT]'
const ENVELOPE = '요청을 처리할 수 없습니다'
const FORBIDDEN = '이 작업을 수행할 권한이 없습니다 [T6-403]'

function project(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return { id: 'p-1', name: '관리자 콘솔', slug: 'admin-console', description: null, role: 'owner', ...LIST_ITEM_DEFAULTS, ...overrides }
}

interface Harness {
  listProjects: ReturnType<typeof vi.fn>
  createProject: ReturnType<typeof vi.fn>
  updateProject: ReturnType<typeof vi.fn>
  deleteProject: ReturnType<typeof vi.fn>
}

/**
 * 목록 화면을 띄운다. `listProjects`는 호출마다 다음 목록을 낸다 — 재조회를 세려면
 * 두 번째 호출이 구별돼야 한다.
 */
function renderCrud(
  options: {
    lists?: ProjectListItem[][]
    createProject?: ApiClient['createProject']
    updateProject?: ApiClient['updateProject']
    deleteProject?: ApiClient['deleteProject']
  } = {},
): Harness {
  const lists = options.lists ?? [[project()]]
  let call = 0
  const listProjects = vi.fn(async () => {
    const next = lists[Math.min(call, lists.length - 1)] ?? []
    call += 1
    return next
  })
  const createProject = vi.fn(options.createProject ?? (async () => project({ id: 'p-new' })))
  const updateProject = vi.fn(options.updateProject ?? (async () => project()))
  const deleteProject = vi.fn(options.deleteProject ?? (async () => undefined))

  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => USER, listProjects, createProject, updateProject, deleteProject }),
    route: '/',
  })
  return { listProjects, createProject, updateProject, deleteProject }
}

const field = (label: string): HTMLElement => screen.getByLabelText(label)
const type = (label: string, value: string): void => {
  fireEvent.change(field(label), { target: { value } })
}

/** 여는 단추 — 격자 맨 앞의 «프로젝트 추가» 카드(`routes/project-list.tsx` 의 `AddCard`). */
const ADD = { name: '프로젝트 추가' }

async function openCreateForm(): Promise<void> {
  await screen.findByText('관리자 콘솔')
  fireEvent.click(screen.getByRole('button', ADD))
  await screen.findByLabelText('이름')
}

describe('프로젝트 만들기', () => {
  it('«프로젝트 추가» 를 누르면 폼이 열리고 포커스가 첫 필드로 간다', async () => {
    renderCrud()
    await openCreateForm()

    expect(field('슬러그')).toBeDefined()
    expect(field('설명')).toBeDefined()
    // **포커스가 첫 필드에 있다.** 폼이 열렸는데 커서가 없으면 키보드 사용자는 Tab을
    // 눌러 찾아야 한다.
    expect(document.activeElement).toBe(field('이름'))
  })

  it('세 필드를 채워 제출하면 createProject가 나간다', async () => {
    const h = renderCrud()
    await openCreateForm()

    type('이름', '고객 포털')
    type('슬러그', 'portal')
    type('설명', '외부용')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => expect(h.createProject).toHaveBeenCalledTimes(1))
    expect(h.createProject.mock.calls[0]?.[0]).toEqual({
      name: '고객 포털',
      slug: 'portal',
      description: '외부용',
    })
  })

  it('설명을 비우면 description을 undefined로 넘긴다', async () => {
    // 폼의 빈 칸은 **"설명 없음"이지 "빈 문자열인 설명"이 아니다.**
    //
    // **여기서 재는 것은 훅의 경계까지다.** 이 케이스는 가짜 `ApiClient`를 쓰므로
    // `http-client.ts`를 지나지 않는다 — 그래서 `description` **키 자체는 남아 있고 값이
    // `undefined`**다. 그 키가 나가는 본문에서 사라지는 것은 `declaredOnly`의 일이고
    // `test/api/http-client.test.ts`의 `설명을 주지 않으면 그 키를 만들지 않는다`가 지킨다.
    // **`Object.hasOwn(body,'description') === false`로 적지 마라 — 이 층에서는 거짓이다** —
    // 어느 층이 무엇을 지키는지가 갈리는 자리다.
    //
    // **빈 문자열을 그대로 넘기면 안 되는 이유:** 서버의 `description`은 nullable이라
    // `''`도 유효한 값이다 — 즉 "설명을 빈 문자열로 설정"이 되어 버린다.
    const h = renderCrud()
    await openCreateForm()

    type('이름', '고객 포털')
    type('슬러그', 'portal')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => expect(h.createProject).toHaveBeenCalledTimes(1))
    const body = h.createProject.mock.calls[0]?.[0] as Record<string, unknown>
    expect(body['description']).toBeUndefined()
    expect(body['name']).toBe('고객 포털')
  })

  it('성공하면 목록을 다시 받는다', async () => {
    // **재조회가 곧 수렴이다.** 응답을 목록에 꽂지 않는다.
    //
    // **새 목록이 화면에 그려지는 것까지는 못 잰다 — 재조회 다음에 만든 프로젝트로의 이동이
    // 일어나 목록이 언마운트되기 때문이다.** `findByText('고객 포털')`로 재면 그 이동에
    // 걸려 죽는다 — 그래서 두 번째 `listProjects` 호출을 센다.
    //
    // **만들기에서 그 재조회는 실제로 버려진다.** 그래도 `run`에 두는 것은 수정·삭제가 같은
    // 자리를 쓰고(그쪽은 목록에 남는다), 이동이 막히는 경우 — 응답 `id`가 계약을 어겨
    // 관문이 던지면 — 목록이 최신이어야 하기 때문이다. **버려진다는 사실 자체를 여기 적어
    // 둔다:** 만들기만 재조회를 건너뛰게 하면 `run`의 계약이 조작마다 갈린다.
    const h = renderCrud({ lists: [[project()], [project(), project({ id: 'p-new', name: '고객 포털' })]] })
    await openCreateForm()

    expect(h.listProjects).toHaveBeenCalledTimes(1)
    type('이름', '고객 포털')
    type('슬러그', 'portal')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => expect(h.listProjects).toHaveBeenCalledTimes(2))
  })

  it('만든 프로젝트로 이동한다', async () => {
    // 응답의 `id`가 주소에 들어간다. 빈 문자열이면 `/projects/`가 되고 화면이 통째로
    // 비는데, 그것은 `SHAPES.projectDetail`이 관문에서 막는다.
    renderCrud({ createProject: async () => project({ id: 'p-made' }) })
    await openCreateForm()

    type('이름', '고객 포털')
    type('슬러그', 'portal')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => expect(currentPath()).toBe('/projects/p-made'))
  })

  it('Esc로 닫히고 요청이 나가지 않는다', async () => {
    const h = renderCrud()
    await openCreateForm()

    type('이름', '고객 포털')
    fireEvent.keyDown(field('이름'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByLabelText('이름')).toBeNull())
    expect(h.createProject).not.toHaveBeenCalled()
  })

  it('취소로 닫히고 요청이 나가지 않는다', async () => {
    const h = renderCrud()
    await openCreateForm()

    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    await waitFor(() => expect(screen.queryByLabelText('이름')).toBeNull())
    expect(h.createProject).not.toHaveBeenCalled()
  })

  it('필드 사이를 옮겨도 닫히지 않는다', async () => {
    // **blur로 닫지 않는다.** 필드 사이 이동이 blur이기 때문이다.
    // **입력이 하나인 폼의 «blur는 취소»가 여기서는 성립하지 않는다.**
    renderCrud()
    await openCreateForm()

    type('이름', '고객 포털')
    fireEvent.blur(field('이름'))
    fireEvent.focus(field('슬러그'))

    expect(screen.getByLabelText('이름')).toBeDefined()
    expect((field('이름') as HTMLInputElement).value).toBe('고객 포털')
  })

  it('이름이나 슬러그가 비면 제출되지 않고 폼이 남는다', async () => {
    // 서버의 `Name`이 `z.string().min(1)`이고 빈 슬러그도 400이다(실측) — 그 왕복을
    // 만들지 않는다. **닫지 않는 것이 요점이다:** 닫으면 친 값을 잃는다.
    const h = renderCrud()
    await openCreateForm()

    type('이름', '고객 포털')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))
    expect(h.createProject).not.toHaveBeenCalled()
    expect(screen.getByLabelText('이름')).toBeDefined()

    type('이름', '')
    type('슬러그', 'portal')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))
    expect(h.createProject).not.toHaveBeenCalled()
    expect(screen.getByLabelText('슬러그')).toBeDefined()
  })

  it('슬러그가 중복이면 서버 문장이 남고 목록을 다시 받지 않는다', async () => {
    // **서버 실측: 409 `conflict` / "이미 사용 중인 슬러그입니다"**(봉투 문장이 곧 이유라
    // `issues`가 비어 있다).
    const h = renderCrud({
      createProject: async () => {
        throw new ApiError(409, 'conflict', DUPLICATE_SLUG)
      },
    })
    await openCreateForm()

    type('이름', '고객 포털')
    type('슬러그', 'admin-console')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await screen.findByText(DUPLICATE_SLUG)
    // **실패하면 목록을 다시 받지 않는다** — 서버가 거절했으니 목록은 그대로다.
    expect(h.listProjects).toHaveBeenCalledTimes(1)
  })

  it('슬러그 형식이 틀리면 issues의 문장이 남는다', async () => {
    // **서버 실측:** 400의 봉투는 `"요청을 처리할 수 없습니다"`이고 진짜 이유는
    // `issues[0].message`에 있다. **봉투가 남으면 사용자는 무엇이 틀렸는지 알 수 없다** —
    // 클라이언트 검사를 두지 않는 근거가 그 문장이므로 이 자리가 그 근거를 지킨다.
    //
    // **길이 초과(65자)도 같은 문장이다**(실측: `a`×65는 400, `a`×64는 201). 즉 이 문장은
    // 길이 위반의 원인을 말하지 못한다 — 서버 문구가 나아지면 이 케이스가 알려 준다.
    const h = renderCrud({
      createProject: async () => {
        throw new ApiError(400, 'bad-request', ENVELOPE, [{ path: 'slug', message: BAD_SLUG }])
      },
    })
    await openCreateForm()

    type('이름', '고객 포털')
    type('슬러그', 'Bad Slug')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await screen.findByText(BAD_SLUG)
    expect(screen.queryByText(ENVELOPE)).toBeNull()
    expect(h.listProjects).toHaveBeenCalledTimes(1)
  })

  it('요청이 나가 있는 동안 여는 버튼과 제출이 잠긴다', async () => {
    // **여는 것도 잠긴다** — 제출만 잠그고 여는 쪽을 빠뜨리면 요청이 나가 있는 동안 폼이 다시 열린다. 폼이 여는 단추(«프로젝트 추가») 자리를
    // 대신하고 폼의 «취소» 도 요청 중에 잠기므로, 요청이 나가 있는 동안 여는 단추는 화면에 없다.
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const h = renderCrud({
      createProject: async () => {
        await gate
        return project({ id: 'p-new' })
      },
    })
    await openCreateForm()

    type('이름', '고객 포털')
    type('슬러그', 'portal')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    // 요청이 나가 있는 동안: 제출 · 취소가 비활성이고 여는 단추가 없다.
    await waitFor(() => expect(screen.getByRole('button', { name: '만들기' })).toHaveProperty('disabled', true))
    expect(screen.getByRole('button', { name: '취소' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', ADD)).toBeNull()

    release()
    await waitFor(() => expect(h.createProject).toHaveBeenCalledTimes(1))
  })
  /**
   * 만들기 요청을 붙잡았다가 409 로 거절하는 판. 슬러그 칸에서 보낸 뒤 **Chrome 이 하는 포커스 떨굼을 흉내 낸다** — Chrome 은 포커스가 선 칸에
   * `disabled` 를 걸면 포커스를 `body` 로 떨구는데, jsdom 은 포커스를 그 칸에 그대로 두고 잠긴 칸의 `blur()` 도 받지 않는다. 그래서 요청이
   * 나가는 순간(칸이 잠기기 전) 칸을 `blur` 한다. 실브라우저 판은 `build-test/rv-cd-cards.test.ts` «실패 갈래 — 실패한 뒤 포커스가 …».
   */
  async function failWhileFocusLost(whileBusy: () => void = () => {}): Promise<HTMLElement> {
    let reject = (): void => {}
    const gate = new Promise<never>((_resolve, fail) => {
      reject = () => fail(new ApiError(409, 'conflict', DUPLICATE_SLUG))
    })
    renderCrud({
      createProject: () => {
        ;(document.activeElement as HTMLElement | null)?.blur()
        return gate
      },
    })
    await openCreateForm()
    type('이름', '고객 포털')
    type('슬러그', 'admin-console')
    const slug = field('슬러그')
    slug.focus()
    fireEvent.submit(slug.closest('form')!)
    await waitFor(() => expect(slug).toHaveProperty('disabled', true))
    // 카나리아 — 흉내가 판을 세웠다(잠긴 동안 포커스가 `body`).
    expect(document.activeElement).toBe(document.body)
    whileBusy()
    reject()
    await screen.findByText(DUPLICATE_SLUG)
    await waitFor(() => expect(slug).toHaveProperty('disabled', false))
    return slug
  }

  it('실패한 뒤 포커스가 보냈던 칸으로 돌아온다 — 잠금이 떨군 포커스', async () => {
    const slug = await failWhileFocusLost()
    expect(document.activeElement).toBe(slug)
    // 친 글도 남는다 — 포커스를 돌리려고 폼을 새로 그리지 않았다.
    expect((slug as HTMLInputElement).value).toBe('admin-console')
  })

  it('요청 중에 다른 곳으로 옮긴 포커스는 실패 뒤에 뺏지 않는다', async () => {
    let moved: HTMLElement | null = null
    await failWhileFocusLost(() => {
      // 요청이 나가 있는 동안 사람이 사이드바의 링크로 옮겼다.
      moved = document.body.querySelector<HTMLElement>('.wb-shell-workspace a[href]')
      moved?.focus()
    })
    expect(moved).not.toBeNull()
    expect(document.activeElement).toBe(moved)
  })

  it('실패 뒤 «취소» 로 닫으면 그 폼의 실패 알림이 걷힌다', async () => {
    renderCrud({
      createProject: async () => {
        throw new ApiError(409, 'conflict', DUPLICATE_SLUG)
      },
    })
    await openCreateForm()
    type('이름', '고객 포털')
    type('슬러그', 'admin-console')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))
    await screen.findByText(DUPLICATE_SLUG)

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await screen.findByRole('button', ADD)
    expect(screen.queryByText(DUPLICATE_SLUG)).toBeNull()
  })

  it('폼을 열고 닫아도 목록 조회 실패 알림은 남는다 — 닫기가 걷는 것은 폼의 실패뿐이다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({
        me: async () => USER,
        listProjects: async () => {
          throw new ApiError(500, 'internal', '목록 조회 실패 [FX-CD]')
        },
      }),
      route: '/',
    })
    await screen.findByText('목록 조회 실패 [FX-CD]')
    fireEvent.click(screen.getByRole('button', ADD))
    await screen.findByLabelText('이름')
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await screen.findByRole('button', ADD)
    expect(screen.getByText('목록 조회 실패 [FX-CD]')).toBeDefined()
  })
})

/**
 * **목록 줄에는 «수정» 이 없다** — 이름 · 슬러그 · 설명은 설정 페이지에서 고친다(`routes/settings.tsx` · `test/routes/settings.test.tsx`).
 * 줄의 «설정» 링크는 모든 멤버에게 있다.
 */
describe('프로젝트 고치기는 설정 페이지다', () => {
  it('어느 역할에도 수정 버튼이 없고 설정 링크가 있다', async () => {
    const rows = [
      project({ id: 'p-own', name: '내 프로젝트' }),
      project({ id: 'p-ed', name: '편집자 프로젝트', role: 'editor' }),
      project({ id: 'p-vw', name: '뷰어 프로젝트', role: 'viewer' }),
    ]
    const h = renderCrud({ lists: [rows] })
    await screen.findByText('내 프로젝트')
    for (const row of rows) {
      expect(screen.queryByRole('button', { name: `${row.name} 수정` })).toBeNull()
      expect(screen.getByRole('link', { name: `${row.name} 설정` }).getAttribute('href')).toBe(`/projects/${row.id}/settings`)
    }
    expect(h.updateProject).not.toHaveBeenCalled()
  })
})
/** 카드 목록 — 사이드바의 칸 목록(`<ul>`)과 가른다. */
function cards(): HTMLElement {
  const main = document.body.querySelector<HTMLElement>('.wb-shell-workspace-main')
  if (main === null) throw new Error('내용 칸을 찾지 못했습니다')
  return within(main).getByRole('list')
}

describe('통합 — 한 화면에서 이어서', () => {
  it('viewer·editor·owner가 섞인 목록의 어느 줄에도 삭제가 없다 — 삭제는 설정 페이지의 «위험 구역»이다', async () => {
    const rows = [
      project({ id: 'p-o', name: 'owner 것', role: 'owner' }),
      project({ id: 'p-e', name: 'editor 것', role: 'editor' }),
      project({ id: 'p-v', name: 'viewer 것', role: 'viewer' }),
    ]
    renderCrud({ lists: [rows] })
    await screen.findByText('owner 것')

    for (const row of rows) {
      expect(screen.queryByRole('button', { name: `${row.name} 삭제` }), row.role).toBeNull()
    }
    // 격자의 단추는 맨 앞 «프로젝트 추가» 하나뿐이다.
    expect(
      within(cards())
        .queryAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['프로젝트 추가'])
    // 링크는 역할과 무관하게 줄마다 셋(이름 · 열기 · 설정)이다 — 읽기는 viewer도 된다. 카드 목록 안에서 센다 — 사이드바에도 링크 목록이 있다.
    expect(within(cards()).getAllByRole('link')).toHaveLength(9)
  })

  it('조회 실패와 조작 실패가 각자 자리에 나온다', async () => {
    // 둘이 독립 상태다. 조작(이 화면에서는 만들기 하나)이 실패해도 목록은 그대로 보인다.
    const h = renderCrud({
      createProject: async () => {
        throw new ApiError(403, 'forbidden', FORBIDDEN)
      },
    })
    await openCreateForm()
    type('이름', '새것')
    type('슬러그', 'new')
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await screen.findByText(FORBIDDEN)
    // **목록은 그대로다** — 조작 실패가 조회 상태를 덮지 않는다.
    expect(screen.getByText('관리자 콘솔')).toBeDefined()
    expect(h.listProjects).toHaveBeenCalledTimes(1)
  })

  it('signed-out이면 목록 대신 로그인으로 간다', async () => {
    renderCrud({ lists: [[]] })
    await screen.findByText('참여 중인 프로젝트가 없습니다')
    // 조회가 아니라 **조작**이 세션 만료를 받는 경로는 이 화면에 아직 없다 —
    // `SignedOut`은 `state.failure`만 본다. 그 사실을 여기 적어 둔다.
    expect(currentPath()).toBe('/')
  })

  it('Tab 정지점을 센다 — 폼이 열리고 닫힐 때', async () => {
    // **"열면 늘고 닫으면 되돌아온다"를 고정한다.**
    const owned = project({ id: 'p-own', name: '내 프로젝트' })
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')

    // 내용 칸만 센다 — 사이드바(칸 · «메뉴» · 로그아웃)는 이 폼과 무관하게 늘 같다(`test/shell/workspace-layout.test.tsx`).
    const main = (): HTMLElement => document.body.querySelector<HTMLElement>('.wb-shell-workspace-main')!
    const stops = (): number =>
      within(main()).queryAllByRole('button').length +
      within(main()).queryAllByRole('textbox').length +
      within(main()).queryAllByRole('link').length

    // 닫힌 상태: 링크 3(이름 · 열기 · 설정) + 프로젝트 추가 1 = 4. 줄의 삭제는 설정 페이지의 위험 구역으로 옮겨 갔다(`settings/danger-section.tsx`).
    // 이 케이스가 재는 것은 *"열면 늘고 닫으면 되돌아온다"*이고, 바탕 수는 이 화면의 정지점을 셀 뿐이다.
    const closed = stops()
    expect(closed).toBe(4)

    fireEvent.click(screen.getByRole('button', ADD))
    // 폼이 여는 단추 자리를 대신한다: 입력 3 + 만들기·취소 2 − 프로젝트 추가 1
    expect(stops()).toBe(closed + 4)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(stops()).toBe(closed)
  })
})
