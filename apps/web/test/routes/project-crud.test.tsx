/**
 * 프로젝트 만들기·수정·삭제. **`<App />`을 라우트째 렌더한다** — 목록이
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
import type { ProjectDetail, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 화면이 하드코딩할 리 없는 문자열이어야 서버 문장이 그대로 온 것을 잴 수 있다. */
const DUPLICATE_SLUG = '이미 사용 중인 슬러그입니다 [T4-DUP]'
const BAD_SLUG = '슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다 [T4-FMT]'
const ENVELOPE = '요청을 처리할 수 없습니다'
const FORBIDDEN = '이 작업을 수행할 권한이 없습니다 [T6-403]'

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return { id: 'p-1', name: '관리자 콘솔', slug: 'admin-console', description: null, role: 'owner', ...overrides }
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
function renderCrud(options: {
  lists?: ProjectDetail[][]
  createProject?: ApiClient['createProject']
  updateProject?: ApiClient['updateProject']
  deleteProject?: ApiClient['deleteProject']
} = {}): Harness {
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

async function openCreateForm(): Promise<void> {
  await screen.findByText('관리자 콘솔')
  fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }))
  await screen.findByLabelText('이름')
}

describe('프로젝트 만들기', () => {
  it('새 프로젝트를 누르면 폼이 열리고 포커스가 첫 필드로 간다', async () => {
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
    // **여는 것도 잠긴다** — 제출만 잠그고 여는 쪽을 빠뜨리면 요청이 나가 있는 동안 폼이 다시 열린다.
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

    // 요청이 나가 있는 동안: 여는 버튼이 비활성이다.
    await waitFor(() => expect(screen.getByRole('button', { name: '새 프로젝트' })).toHaveProperty('disabled', true))

    release()
    await waitFor(() => expect(h.createProject).toHaveBeenCalledTimes(1))
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
describe('프로젝트 삭제', () => {
  const owned = project({ id: 'p-own', name: '내 프로젝트', slug: 'mine' })
  const other = project({ id: 'p-two', name: '둘째 프로젝트', slug: 'two' })
  const asViewer = project({ id: 'p-vw', name: '뷰어 프로젝트', slug: 'vw', role: 'viewer' })

  const askDelete = (name: string): void => {
    fireEvent.click(screen.getByRole('button', { name: `${name} 삭제` }))
  }
  const confirmButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: '삭제 확정' }) as HTMLButtonElement

  it('owner인 항목에만 삭제 버튼이 있다', async () => {
    renderCrud({ lists: [[owned, asViewer]] })
    await screen.findByText('내 프로젝트')

    expect(screen.getByRole('button', { name: '내 프로젝트 삭제' })).toBeDefined()
    expect(screen.queryByRole('button', { name: '뷰어 프로젝트 삭제' })).toBeNull()
  })

  it('누르면 입력이 열리고 요청이 나가지 않는다', async () => {
    const h = renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    expect(screen.getByLabelText('삭제하려면 프로젝트 이름을 입력하세요')).toBeDefined()
    expect(h.deleteProject).not.toHaveBeenCalled()
  })

  it('확인이 열리면 포커스가 이름 입력으로 간다', async () => {
    // **`project-form.tsx`와 같은 관용구다 — 이 케이스가 없으면 포커스를 빼도 아무것도 안 죽는다.**
    // 확인이 열렸는데 커서가 없으면 키보드 사용자는 Tab을 눌러 찾아야 하고, 그 사이 포커스는
    // 방금 누른 `삭제` 버튼에 남아 있다.
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    expect(document.activeElement).toBe(field('삭제하려면 프로젝트 이름을 입력하세요'))
  })

  it('이름이 정확히 일치할 때만 확정 버튼이 활성이다', async () => {
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    expect(confirmButton().disabled).toBe(true)
    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝')
    expect(confirmButton().disabled).toBe(true)
    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝트')
    expect(confirmButton().disabled).toBe(false)
  })

  it('앞뒤 공백이 붙으면 활성이 아니다', async () => {
    // **재서 정했다.** 서버는 이름을 정규화하지 않는다 — `'  앞뒤 공백  '`으로 만들면 그대로
    // 돌아온다(api 하네스 실측). 즉 **공백만 다른 두 프로젝트가 함께 있을 수 있다.**
    // 입력을 `trim`하면 `'가 '`와 `'가'` 중 어느 것을 확인한 것인지 갈리지 않는다 —
    // 확인의 하중이 "어느 것을 지우는지 안다"이므로 **정확히 일치**로 둔다.
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    type('삭제하려면 프로젝트 이름을 입력하세요', ' 내 프로젝트')
    expect(confirmButton().disabled).toBe(true)
    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝트 ')
    expect(confirmButton().disabled).toBe(true)
  })

  it('일치하는 이름을 넣고 확정하면 deleteProject가 나간다', async () => {
    const h = renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝트')
    fireEvent.click(confirmButton())

    await waitFor(() => expect(h.deleteProject).toHaveBeenCalledTimes(1))
    expect(h.deleteProject.mock.calls[0]?.[0]).toBe('p-own')
  })

  it('Esc로 닫힌다', async () => {
    const h = renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    fireEvent.keyDown(screen.getByLabelText('삭제하려면 프로젝트 이름을 입력하세요'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByLabelText('삭제하려면 프로젝트 이름을 입력하세요')).toBeNull())
    expect(h.deleteProject).not.toHaveBeenCalled()
  })

  it('취소로 닫힌다', async () => {
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    fireEvent.click(screen.getByRole('button', { name: '삭제 취소' }))

    await waitFor(() => expect(screen.queryByLabelText('삭제하려면 프로젝트 이름을 입력하세요')).toBeNull())
  })

  it('다른 항목의 삭제를 시작하면 앞의 확인이 닫힌다', async () => {
    // **확인은 하나뿐이다.** 둘이 동시에 열리면 사용자가 확인한 것과 지워지는 것이 달라진다.
    renderCrud({ lists: [[owned, other]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')
    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝트')

    askDelete('둘째 프로젝트')

    expect(screen.getAllByLabelText('삭제하려면 프로젝트 이름을 입력하세요')).toHaveLength(1)
    // **친 이름도 함께 사라진다** — 남아 있으면 앞 프로젝트의 이름으로 뒤 프로젝트가 지워진다.
    expect((field('삭제하려면 프로젝트 이름을 입력하세요') as HTMLInputElement).value).toBe('')
    expect(confirmButton().disabled).toBe(true)
  })

  it('다른 조작을 시작하면 확인이 닫힌다', async () => {
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }))

    expect(screen.queryByLabelText('삭제하려면 프로젝트 이름을 입력하세요')).toBeNull()
    expect(screen.getByLabelText('이름')).toBeDefined()
  })

  it('성공하면 목록을 다시 받는다', async () => {
    const h = renderCrud({ lists: [[owned, other], [other]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝트')
    fireEvent.click(confirmButton())

    await waitFor(() => expect(h.listProjects).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('내 프로젝트')).toBeNull())
    screen.getByText('둘째 프로젝트')
  })

  it('실패하면 서버 문장이 남고 목록을 다시 받지 않는다', async () => {
    const h = renderCrud({
      lists: [[owned]],
      deleteProject: async () => {
        throw new ApiError(403, 'forbidden', FORBIDDEN)
      },
    })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝트')
    fireEvent.click(confirmButton())

    await screen.findByText(FORBIDDEN)
    expect(h.listProjects).toHaveBeenCalledTimes(1)
  })

  it('무엇이 함께 사라지는지 알린다', async () => {
    // **함께 사라지는 것을 화면이 말한다.** 메뉴 삭제는 자식이 있으면 서버가 409로 막지만
    // 프로젝트는 아무것도 막지 않고 `ON DELETE CASCADE`로 딸린 것이 함께 사라진다 —
    // 실측(api 하네스): 메뉴 2·페이지 1·멤버 1·revision 1이 있는 프로젝트를 지우면
    // 네 표의 행이 전부 0이 된다. **수를 문안에 적지 않는다**(프로젝트마다 다르다).
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')
    askDelete('내 프로젝트')

    screen.getByText(/메뉴·페이지·편집 이력.*함께 사라집니다/)
  })
})

describe('통합 — 한 화면에서 이어서', () => {
  it('삭제 뒤 목록이 새 상태를 보인다 — 다른 곳에서 바뀐 이름으로 확인한다', async () => {
    // **만들기는 이동으로 끝나고 고치기는 설정 페이지라** 이 화면에서 잇는 조작은 삭제다. 첫 목록 뒤 이름이 바뀐 판(설정
    // 페이지 · 다른 탭)을 두 번째 목록이 싣고, 삭제는 그 새 이름으로 확인해야 한다.
    const first = project({ id: 'p-a', name: '첫째', slug: 'a' })
    const renamed = project({ id: 'p-a', name: '고친 이름', slug: 'a2' })
    const other = project({ id: 'p-b', name: '둘째', slug: 'b' })
    const h = renderCrud({ lists: [[first, other], [renamed], []] })
    await screen.findByText('첫째')

    // 둘째를 지우면 목록을 다시 받는다 — 고친 이름이 선다.
    fireEvent.click(screen.getByRole('button', { name: '둘째 삭제' }))
    type('삭제하려면 프로젝트 이름을 입력하세요', '둘째')
    fireEvent.click(screen.getByRole('button', { name: '삭제 확정' }))
    await screen.findByText('고친 이름')
    expect(h.listProjects).toHaveBeenCalledTimes(2)

    // 삭제 — 새 이름으로 확인해야 한다(목록이 새 상태를 보인다는 뜻이다)
    fireEvent.click(screen.getByRole('button', { name: '고친 이름 삭제' }))
    type('삭제하려면 프로젝트 이름을 입력하세요', '고친 이름')
    fireEvent.click(screen.getByRole('button', { name: '삭제 확정' }))

    await screen.findByText('참여 중인 프로젝트가 없습니다')
    expect(h.deleteProject).toHaveBeenCalledTimes(2)
    expect(h.listProjects).toHaveBeenCalledTimes(3)
  })

  it('viewer·editor·owner가 섞인 목록에서 버튼이 역할대로 나온다', async () => {
    // **«owner인 항목에만 버튼이 있다»의 하중이다.** 분모를 손으로 적지 않고 목록에서
    // 계산한다 — 역할이 늘면 여기가 아니라 `projectAbilities`의 대조표가 먼저 죽는다.
    const rows = [
      project({ id: 'p-o', name: 'owner 것', role: 'owner' }),
      project({ id: 'p-e', name: 'editor 것', role: 'editor' }),
      project({ id: 'p-v', name: 'viewer 것', role: 'viewer' }),
    ]
    renderCrud({ lists: [rows] })
    await screen.findByText('owner 것')

    for (const row of rows) {
      const open = row.role === 'owner'
      expect(screen.queryByRole('button', { name: `${row.name} 삭제` }) !== null).toBe(open)
    }
    // 링크는 역할과 무관하게 줄마다 둘(이름 · 설정)이다 — 읽기는 viewer도 된다. 목록 안에서 센다 — 머리의 계정 묶음에도 링크가
    // 있다(«API 토큰» — `session/session-menu.tsx`).
    expect(within(screen.getByRole('list')).getAllByRole('link')).toHaveLength(6)
  })

  it('조회 실패와 조작 실패가 각자 자리에 나온다', async () => {
    // 둘이 독립 상태다. 조작이 실패해도 목록은 그대로 보인다.
    const h = renderCrud({
      lists: [[project({ id: 'p-own', name: '내 프로젝트' })]],
      deleteProject: async () => {
        throw new ApiError(403, 'forbidden', FORBIDDEN)
      },
    })
    await screen.findByText('내 프로젝트')

    fireEvent.click(screen.getByRole('button', { name: '내 프로젝트 삭제' }))
    type('삭제하려면 프로젝트 이름을 입력하세요', '내 프로젝트')
    fireEvent.click(screen.getByRole('button', { name: '삭제 확정' }))

    await screen.findByText(FORBIDDEN)
    // **목록은 그대로다** — 조작 실패가 조회 상태를 덮지 않는다.
    expect(screen.getByText('내 프로젝트')).toBeDefined()
    expect(h.listProjects).toHaveBeenCalledTimes(1)
  })

  it('signed-out이면 목록 대신 로그인으로 간다', async () => {
    renderCrud({ lists: [[]] })
    await screen.findByText('참여 중인 프로젝트가 없습니다')
    // 조회가 아니라 **조작**이 세션 만료를 받는 경로는 이 화면에 아직 없다 —
    // `SignedOut`은 `state.failure`만 본다. 그 사실을 여기 적어 둔다.
    expect(currentPath()).toBe('/')
  })

  it('Tab 정지점을 센다 — 폼과 확인이 열리고 닫힐 때', async () => {
    // **"열면 늘고 닫으면 되돌아온다"를 고정한다.**
    const owned = project({ id: 'p-own', name: '내 프로젝트' })
    renderCrud({ lists: [[owned]] })
    await screen.findByText('내 프로젝트')

    const stops = (): number =>
      screen.queryAllByRole('button').length +
      screen.queryAllByRole('textbox').length +
      screen.queryAllByRole('link').length

    // 닫힌 상태: 링크 2(이름 · 설정) + 새 프로젝트·삭제 2 + **머리의 `…` 1**(계정 설정 · 로그아웃이 그 뒤다) = 5.
    // `…` 는 이 화면에서도 앱에서 나가는 길이다(`shell/action-menu.tsx`,
    // `test/routes/shell-nav.test.tsx`). 이 케이스가 재는 것은 *"열면 늘고 닫으면
    // 되돌아온다"*이고, 바탕 수는 이 화면의 정지점을 셀 뿐이다.
    const closed = stops()
    expect(closed).toBe(5)

    fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }))
    // 폼: 입력 3 + 만들기·취소 2
    expect(stops()).toBe(closed + 5)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(stops()).toBe(closed)

    fireEvent.click(screen.getByRole('button', { name: '내 프로젝트 삭제' }))
    // 확인: 입력 1 + 확정·취소 2
    expect(stops()).toBe(closed + 3)
    fireEvent.click(screen.getByRole('button', { name: '삭제 취소' }))
    expect(stops()).toBe(closed)
  })
})
