/**
 * 페이지 JSON — 메뉴 줄 `+`의 «JSON 에서 가져오기…»가 여는 대화 상자 · 페이지 줄 `…`의 «JSON 내보내기» · 하단 바의 통지(설계서 「페이지 JSON」).
 *
 * **이 파일의 첫 하중은 «상자의 키가 트리 단축키로 새지 않는다»이다** — 메뉴 트리의 단축키 상자는 수식 키 없는 `Delete`·`Backspace`를
 * **메뉴 삭제 확인**으로 받고, React 의 키 이벤트는 모달에서도 React 트리를 따라 버블된다. 상자 안의 단추(입력 칸이 아니다 —
 * `isTypingSurface`가 못 거른다)에서 친 `Delete`가 뒤에 고른 메뉴의 삭제 확인을 걸면 안 된다(`src/panels/page-import-dialog.tsx` 머리말).
 *
 * **jsdom 값이다** — `ShellDialog`가 `showModal` 없는 jsdom 에서 `open` 속성으로 서므로 뒤 화면의 `inert` · 포커스 가둠이 없다. 실브라우저의
 * 모달 · 파일 칸은 `build-test/page-json-dialog.test.ts`가 잰다.
 *
 * # 내려받기를 어떻게 재는가 — **절반은 대역이다**
 *
 * jsdom에 `URL.createObjectURL`이 없다(`files/file-io.ts`의 머리말에 잰 표가 있다). 아래 `withDownloadCapture`가 재는 것은
 * Blob에 실린 글자·앵커의 `download` 이름·클릭 한 번이다. **재지 못하는
 * 것은 브라우저가 실제로 파일을 저장하는지**다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WIREBOUND_PAGE_VERSION, type PageJson } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type {
  Comment,
  PageDetail,
  PageImported,
  ProjectView,
  SessionUser,
  TreeMenuNode,
} from '../../src/api/types'
import { App } from '../../src/app'
import { ApiError } from '../../src/api/client'
import { fakeApi, renderWithProviders } from '../helpers'
import { chooseRowAction, rowAction, rowNamed } from './tree-row'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT: ProjectView = { id: 'p-1', name: '설계서', slug: 'proj', description: null, role: 'owner', themeRev: 0 }

function tree(): TreeMenuNode[] {
  return [
    {
      id: 'm-member',
      title: '회원관리',
      sortOrder: 0,
      pages: [
        { id: 'pg-list', title: '회원 목록', sortOrder: 0 },
        { id: 'pg-detail', title: '회원 상세', sortOrder: 1 },
      ],
      children: [],
    },
    // **빈 메뉴 하나가 필요하다** — `treeAbilities.remove`가 자식 메뉴·페이지가 둘 다 없을
    // 것을 요구하므로(서버의 409와 같은 조건), 삭제 확인을 재는 음성 대조는 이쪽을 고른다.
    { id: 'm-order', title: '주문관리', sortOrder: 1, pages: [], children: [] },
  ]
}

function pageDetail(id: string, title: string): PageDetail {
  return {
    id,
    menuNodeId: 'm-member',
    title,
    description: '가입한 회원을 본다',
    sortOrder: 0,
    schemaVersion: 1,
    headSeq: 1,
    schema: {
      version: 1,
      root: { id: 'n_00000000000a', type: 'Page', children: [{ id: 'n_00000000000b', type: 'List', marker: 1 }] },
    },
  }
}

const COMMENT: Comment = {
  id: 'c-1',
  nodeId: 'n_00000000000b',
  body: '목록은 10개씩',
  authorId: 'u-1',
  authorName: '테스터',
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
}

/** 정상 파일 하나. */
function file(patch: Partial<PageJson> = {}): PageJson {
  return {
    wireboundVersion: WIREBOUND_PAGE_VERSION,
    page: { title: '가져온 목록', description: null },
    schema: {
      version: 1,
      root: { id: 'file_root', type: 'Page', children: [{ id: 'file_list', type: 'List' }] },
    },
    comments: [{ nodeId: 'file_list', body: '가' }],
    ...patch,
  }
}

function imported(patch: Partial<PageImported> = {}): PageImported {
  return { page: pageDetail('pg-new', '가져온 목록'), comments: { inserted: 1, dangling: 0 }, ...patch }
}

function stubs(overrides: Partial<ApiClient> = {}) {
  const getTree = vi.fn(async () => tree())
  const getPage = vi.fn(async (_p: string, pageId: string) =>
    pageDetail(pageId, pageId === 'pg-detail' ? '회원 상세' : '회원 목록'),
  )
  const listComments = vi.fn(async () => [COMMENT])
  const importPage = vi.fn(async () => imported())
  const deleteMenu = vi.fn(async () => undefined)

  const client = fakeApi({
    me: async () => USER,
    getProject: async () => PROJECT,
    listMyRevisions: async () => [],
    getTree,
    getPage,
    listComments,
    importPage,
    deleteMenu,
    ...overrides,
  })

  return {
    client,
    getTree: (overrides.getTree ?? getTree) as typeof getTree,
    getPage: (overrides.getPage ?? getPage) as typeof getPage,
    listComments: (overrides.listComments ?? listComments) as typeof listComments,
    importPage: (overrides.importPage ?? importPage) as typeof importPage,
    deleteMenu: (overrides.deleteMenu ?? deleteMenu) as typeof deleteMenu,
  }
}

async function open(overrides: Partial<ApiClient> = {}, route = '/projects/p-1') {
  const harness = stubs(overrides)
  const rendered = renderWithProviders(<App />, { client: harness.client, route })
  await screen.findByRole('heading', { name: '설계서' })
  await within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).findByText('회원관리')
  return { ...harness, rendered }
}

function treeRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

/** 열린 가져오기 상자. 없으면 던진다. */
function dialog(): HTMLElement {
  return screen.getByRole('dialog')
}

/** 메뉴 줄 `+`의 «JSON 에서 가져오기…»로 상자를 연다 — 그 줄이 대상이다. */
function openImport(menu = '회원관리'): void {
  chooseRowAction(treeRegion(), 'JSON 에서 가져오기…', rowNamed(treeRegion(), menu))
}

/** «JSON 직접 붙여 넣기»를 펴고 글자를 넣는다. 상자가 없으면 «회원관리»로 연다. */
function paste(text: string): void {
  if (screen.queryByRole('dialog') === null) openImport()
  const toggle = within(dialog()).getByRole('button', { name: /JSON 직접 붙여 넣기/ })
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle)
  fireEvent.change(within(dialog()).getByRole('textbox', { name: '페이지 JSON' }), { target: { value: text } })
}

function titleInput(): HTMLInputElement {
  return within(dialog()).getByRole('textbox', { name: '가져올 페이지 제목' }) as HTMLInputElement
}

function importButton(): HTMLButtonElement {
  return within(dialog()).getByRole('button', { name: '가져오기' }) as HTMLButtonElement
}

/** 하단 바. 통지가 서는 자리다. */
function footer(): HTMLElement {
  return screen.getByRole('contentinfo', { name: '하단 바' })
}

/**
 * 단축키가 붙은 상자. 트리 · 줄 행동 · 트리의 실패 줄을 함께 감싼다. **가져오기 상자는 그 밖이다**(형제) — 상자는 DOM 으로는 트리 영역
 * 안이라(`ShellDialog`가 그 자리에 그려지고 top layer 로 뜬다) 영역의 글자에는 상자 글자가 섞인다.
 */
function keyBox(): HTMLElement {
  const box = treeRegion().querySelector('.wb-shell-tree-keys')
  if (box === null) throw new Error('단축키 상자를 찾지 못했습니다')
  return box as HTMLElement
}

interface Download {
  fileName: string
  text: string
  clicks: number
}

/** 내려받기를 대역으로 잡는 장치 — 근거는 이 파일 머리말 «내려받기를 어떻게 재는가». */
async function withDownloadCapture(run: () => void): Promise<Download> {
  const url = URL as unknown as Record<string, unknown>
  const hadCreate = 'createObjectURL' in url
  const hadRevoke = 'revokeObjectURL' in url
  const originalCreate = url.createObjectURL
  const originalRevoke = url.revokeObjectURL

  const blobs = new Map<string, Blob>()
  let clicks = 0
  let fileName = ''
  let href = ''

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement
    if (target.tagName !== 'A') return
    clicks += 1
    fileName = (target as HTMLAnchorElement).getAttribute('download') ?? ''
    href = (target as HTMLAnchorElement).getAttribute('href') ?? ''
    event.preventDefault()
  }

  try {
    url.createObjectURL = (blob: Blob): string => {
      const made = `blob:probe/${blobs.size}`
      blobs.set(made, blob)
      return made
    }
    url.revokeObjectURL = (): void => {}
    document.addEventListener('click', onClick, true)
    run()
    // 내보내기는 조회 둘을 기다린 뒤에 앵커를 만든다.
    await waitFor(() => expect(clicks).toBe(1))
  } finally {
    document.removeEventListener('click', onClick, true)
    if (hadCreate) url.createObjectURL = originalCreate
    else delete url.createObjectURL
    if (hadRevoke) url.revokeObjectURL = originalRevoke
    else delete url.revokeObjectURL
  }

  const blob = blobs.get(href)
  const text =
    blob === undefined
      ? ''
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsText(blob)
        })

  return { fileName, text, clicks }
}

describe('상자의 키가 트리 단축키로 새지 않는다', () => {
  /**
   * **상자 안의 단추에서 친 `Delete`.** 입력 칸이 아니라 `isTypingSurface`가 거르지 않는다 — 막는 것은 상자가 단축키 상자 **밖**(형제)에
   * 선다는 자리 하나다(`src/panels/menu-tree.tsx`의 `outside`). 대상 메뉴를 **지울 수 있는** 빈 메뉴로 고른다 — 자식이 있는 메뉴면
   * `abilities.remove`가 거짓이라 자리가 어디든 확인이 안 걸려 이 케이스가 아무것도 재지 않는다.
   */
  it('상자 안 단추의 Delete 가 뒤에 고른 메뉴의 삭제 확인을 걸지 않는다', async () => {
    const api = await open()
    openImport('주문관리')

    const toggle = within(dialog()).getByRole('button', { name: /JSON 직접 붙여 넣기/ })
    fireEvent.keyDown(toggle, { key: 'Delete', bubbles: true })
    fireEvent.keyDown(toggle, { key: 'Backspace', bubbles: true })

    expect(screen.queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
    expect(api.deleteMenu).not.toHaveBeenCalled()
  })

  it('제목 칸의 Backspace가 메뉴 삭제 확인을 걸지 않고 글자도 지워진다', async () => {
    const api = await open()
    openImport('주문관리')

    const event = fireEvent.keyDown(titleInput(), { key: 'Backspace', bubbles: true })

    expect(screen.queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
    // **`preventDefault`가 걸리지 않았다** — 걸리면 글자가 안 지워진다.
    expect(event).toBe(true)
    expect(api.deleteMenu).not.toHaveBeenCalled()
  })

  it('상자 밖 트리 상자의 Backspace 는 단축키가 그대로 걸린다 — 음성 대조', async () => {
    // 위 둘의 대상(«주문관리» — 고른 빈 메뉴)이 실제로 지울 수 있는 판인지를 같은 판에서 본다.
    await open()
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '주문관리' }))

    fireEvent.keyDown(keyBox(), { key: 'Backspace' })

    expect(screen.getByRole('button', { name: '정말 삭제합니까?' })).toBeDefined()
  })
})

describe('여는 길 — 메뉴 줄 `+` · 대상 메뉴', () => {
  it('«JSON 에서 가져오기…»가 그 줄의 메뉴를 대상으로 상자를 연다 — 제목이 대상을 말한다', async () => {
    await open()
    openImport('주문관리')

    expect(screen.getByRole('dialog', { name: '페이지 가져오기 — 주문관리 메뉴로' })).toBeDefined()
    // 줄 행동을 연 줄이 고른 줄이 된다(`pick`) — 상자를 연 메뉴가 고른 메뉴다.
    expect(within(treeRegion()).getByRole('button', { name: '주문관리' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('파일 칸 · 붙여 넣기(접힘) · 제목 · 취소 · 가져오기가 있고, 넣을 것이 없으면 가져오기가 꺼진다', async () => {
    await open()
    openImport()

    expect(within(dialog()).getByLabelText('페이지 파일')).toBeDefined()
    expect(within(dialog()).getByRole('button', { name: /JSON 직접 붙여 넣기/ }).getAttribute('aria-expanded')).toBe('false')
    // **붙여 넣기 칸은 펴기 전에는 DOM 에 없다** — 파일이 주된 길이다.
    expect(within(dialog()).queryByRole('textbox', { name: '페이지 JSON' })).toBeNull()
    expect(titleInput().placeholder).toBe('비우면 파일의 제목을 씁니다')
    expect(within(dialog()).getByRole('button', { name: '취소' })).toBeDefined()
    expect(importButton().disabled).toBe(true)
  })

  it('«취소»가 상자를 닫는다', async () => {
    await open()
    openImport()

    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('조작이 나가 있는 동안 항목이 꺼진다 — «페이지 추가»와 같은 판정', async () => {
    // **트리 조작 하나를 붙잡아 둔다** — 메뉴 만들기가 답하지 않는 동안 `busy`다.
    let answer: (() => void) | undefined
    await open({
      createMenu: vi.fn(
        () =>
          new Promise((resolve) => {
            answer = () => resolve({ id: 'm-new', title: '새', parentId: 'm-member', sortOrder: 0 })
          }),
      ),
    } as Partial<ApiClient>)
    chooseRowAction(treeRegion(), '하위 메뉴', rowNamed(treeRegion(), '회원관리'))
    const input = within(treeRegion()).getByRole('textbox', { name: '이름' })
    fireEvent.change(input, { target: { value: '새' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const item = rowAction(treeRegion(), 'JSON 에서 가져오기…', rowNamed(treeRegion(), '회원관리'))
    expect(item.getAttribute('aria-disabled')).toBe('true')
    answer?.()
  })
})

describe('미리보기', () => {
  it('읽은 것을 말한다 — 제목·노드 수·코멘트 수 · 제목 칸의 자리표가 파일의 제목이다', async () => {
    await open()
    paste(JSON.stringify(file()))

    const status = within(dialog()).getByRole('status').textContent ?? ''
    expect(status).toContain('가져온 목록')
    expect(status).toContain('노드 2개')
    expect(status).toContain('코멘트 1개')
    expect(titleInput().placeholder).toBe('가져온 목록')
    expect(importButton().disabled).toBe(false)
  })

  it('끊긴 코멘트를 세어 미리 말한다', async () => {
    await open()
    paste(JSON.stringify(file({ comments: [{ nodeId: 'file_gone', body: '가' }] })))

    expect(dialog().textContent).toContain('코멘트 1개는 이 파일의 트리에 없는 노드를 가리킵니다')
  })

  it('끊긴 것이 없으면 그 문장을 그리지 않는다 — 음성 대조', async () => {
    // **이 줄이 없으면 "끊긴 수 = 코멘트 수"로 세는 변이가 살아남는다.**
    await open()
    paste(JSON.stringify(file()))

    expect(dialog().textContent).not.toContain('이 파일의 트리에 없는 노드를 가리킵니다')
  })

  it('layoutRef를 쓰지 않는다고 미리 말한다', async () => {
    await open()
    paste(JSON.stringify(file({ page: { title: '가져온 목록', layoutRef: 'admin-lnb' } })))

    expect(dialog().textContent).toContain('admin-lnb')
    expect(dialog().textContent).toContain('쓰지 않습니다')
  })
})

/** `Field`는 `variantFrom: 'control'`이라 노드가 든 `variant`가 버려지고 `ignored-variant`(warning)가 난다. 서버는 그것으로 막지 않는다. */
function warnedFile(): PageJson {
  return file({
    schema: {
      version: 1,
      root: {
        id: 'file_root',
        type: 'Page',
        children: [{ id: 'file_field', type: 'Field', props: { label: '이름', control: 'text' }, variant: 'x' }],
      },
    },
    comments: [],
  })
}

describe('미리보기가 서버와 같은 게이트를 지난다', () => {
  /**
   * **이 부류를 막는다** — *"화면은 괜찮다고 했는데 저장이 거부됐다."* 아래 셋은 미리보기가
   * 서버의 게이트를 안 지나면 `ready`인데 서버가 400/422를 내는 자리다.
   */
  it('지원하지 않는 문서 버전을 미리 막는다 — 서버는 400이다', async () => {
    await open()
    paste(JSON.stringify(file({ schema: { version: 999, root: { id: 'file_root', type: 'Page' } } })))

    expect(within(dialog()).getByRole('alert').textContent).toContain('999')
    expect(importButton().disabled).toBe(true)
  })

  it('카탈로그에 없는 타입을 미리 막고 **파일의 노드 id**를 보인다 — 서버는 422다', async () => {
    await open()
    paste(
      JSON.stringify(
        file({
          schema: {
            version: 1,
            root: { id: 'file_root', type: 'Page', children: [{ id: 'file_odd', type: '없는타입' }] },
          },
          comments: [],
        }),
      ),
    )

    expect(within(dialog()).getByRole('alert')).toBeDefined()
    // 사용자에게 남는 것은 파일뿐이므로 파일에서 찾을 수 있는 id여야 한다.
    expect(dialog().textContent).toContain('file_odd')
    expect(importButton().disabled).toBe(true)
  })

  it('duplicate-id를 미리 막는다 — 프로브가 원리적으로 못 보던 축이다', async () => {
    await open()
    paste(
      JSON.stringify(
        file({
          schema: {
            version: 1,
            root: {
              id: 'file_root',
              type: 'Page',
              children: [
                { id: 'same', type: 'List' },
                { id: 'same', type: 'List' },
              ],
            },
          },
          comments: [],
        }),
      ),
    )

    expect(within(dialog()).getByRole('alert')).toBeDefined()
    expect(importButton().disabled).toBe(true)
  })

  it('경고만 있으면 막지 않는다 — 수만 먼저 말하고 목록은 접어 둔다', async () => {
    await open()
    paste(JSON.stringify(warnedFile()))

    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(importButton().disabled).toBe(false)
    const toggle = within(dialog()).getByRole('button', { name: '경고 1개(저장은 됩니다)' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(dialog()).queryByRole('list')).toBeNull()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(within(dialog()).getByRole('list')).toBeDefined()
  })

  /**
   * **넷을 하나씩 잰다.** 접두(*"보내 봐야 아는 것"*) 하나만 보면 뒤의 목록을 통째로 지워도 통과한다.
   * **목록을 여기 손으로 적는 것이 의도다** — 화면 쪽 상수에서 끌어오면 거기서 하나를 지울 때 이 케이스의 분모도 함께 줄어 **0 사망**이 된다.
   * 넷의 근거는 `previewPageJson`의 *"서버만 아는 것"* 표다.
   */
  it('서버만 아는 것 넷을 하나씩 말한다', async () => {
    await open()
    paste(JSON.stringify(file()))

    const shown = dialog().textContent ?? ''
    expect(shown).toContain('보내 봐야 아는 것')
    for (const known of ['대상 메뉴가 아직 있는지', 'NUL 문자', '본문 크기', '권한']) {
      expect(shown, known).toContain(known)
    }
  })

  it('막힌 파일에는 그 줄을 그리지 않는다 — 음성 대조', async () => {
    await open()
    paste('{ 이건 JSON이 아니다')

    expect(dialog().textContent ?? '').not.toContain('보내 봐야 아는 것')
  })
})

describe('읽기 실패를 갈라 말한다', () => {
  it('JSON이 아니면 그렇게 말한다', async () => {
    await open()
    paste('{ 이건 JSON이 아니다')

    expect(within(dialog()).getByRole('alert')).toBeDefined()
    expect(importButton().disabled).toBe(true)
  })

  it('테마 파일이면 **다른 파일을 고르라**고 말한다', async () => {
    await open()
    paste(JSON.stringify({ wireboundVersion: '1', theme: { meta: { id: 'admin' } } }))

    expect(within(dialog()).getByRole('alert')).toBeDefined()
    expect(dialog().textContent).toContain('page')
  })

  it('모르는 버전이면 그 값을 말한다', async () => {
    await open()
    paste(JSON.stringify({ ...file(), wireboundVersion: '9' }))

    expect(within(dialog()).getByRole('alert').textContent).toContain('9')
  })

  it('comments[]의 marker는 거절하고 파일의 자리를 보인다', async () => {
    await open()
    paste(JSON.stringify({ ...file(), comments: [{ marker: 1, nodeId: 'file_list', body: '가' }] }))

    expect(within(dialog()).getByRole('alert').textContent).toContain('marker')
    expect(dialog().textContent).toContain('comments.0.marker')
  })
})

describe('파일 칸', () => {
  function jsonFile(text: string, name = 'page.wirebound-page.json'): File {
    return new File([text], name, { type: 'application/json' })
  }

  it('눌러 고른 파일을 읽어 미리보기 · 고른 파일 이름을 보인다', async () => {
    await open()
    openImport()

    fireEvent.change(within(dialog()).getByLabelText('페이지 파일'), { target: { files: [jsonFile(JSON.stringify(file()))] } })

    await waitFor(() => expect(within(dialog()).getByRole('status').textContent).toContain('가져온 목록'))
    expect(dialog().textContent).toContain('고른 파일: page.wirebound-page.json')
  })

  /**
   * **OS 파일 끌어 놓기**(HTML5 `drop`의 `dataTransfer.files`). jsdom 의 `DragEvent`에는 `dataTransfer`가 없어 이벤트에 얹는다 — 재는 것은
   * 몸체가 그 파일을 읽는다는 것과 끌고 들어오면 칸이 강조된다는 것이다. 브라우저가 파일을 실제로 끌어 오는지는 재지 못한다.
   */
  it('끌어 놓은 파일을 읽고, 끌고 들어오면 칸을 강조한다', async () => {
    await open()
    openImport()
    const zone = within(dialog()).getByLabelText('페이지 파일').closest('label') as HTMLElement
    const transfer = { types: ['Files'], files: [jsonFile(JSON.stringify(file()))], dropEffect: 'none' }

    fireEvent.dragEnter(zone, { dataTransfer: transfer })
    expect(zone.className).toContain('wb-shell-pagejson-drop-over')
    fireEvent.dragOver(zone, { dataTransfer: transfer })
    fireEvent.drop(zone, { dataTransfer: transfer })

    expect(zone.className).not.toContain('wb-shell-pagejson-drop-over')
    await waitFor(() => expect(within(dialog()).getByRole('status').textContent).toContain('가져온 목록'))
  })

  /**
   * **나중에 고른 파일만 싣는다.** 앞 파일의 읽기가 늦게 끝나면(큰 파일 · 느린 디스크) 그 글자가 나중 파일을 덮어, 화면은 나중 파일의
   * 이름을 말하는데 앞 파일이 들어간다. 앞 파일의 `readAsText`를 붙잡아 두고 나중 파일이 읽힌 뒤에 푼다.
   */
  it('앞 파일의 읽기가 늦게 끝나도 나중에 고른 파일을 덮지 않는다', async () => {
    await open()
    openImport()
    const held: (() => void)[] = []
    const original = FileReader.prototype.readAsText
    const spy = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader, blob: Blob) {
      if (blob instanceof File && blob.name === 'slow.json') held.push(() => original.call(this, blob))
      else original.call(this, blob)
    })
    try {
      const input = within(dialog()).getByLabelText('페이지 파일')
      const slow = file({ page: { title: '앞 파일', description: null } })
      const fast = file({ page: { title: '나중 파일', description: null } })
      fireEvent.change(input, { target: { files: [jsonFile(JSON.stringify(slow), 'slow.json')] } })
      fireEvent.change(input, { target: { files: [jsonFile(JSON.stringify(fast), 'fast.json')] } })
      await waitFor(() => expect(within(dialog()).getByRole('status').textContent).toContain('나중 파일'))

      expect(held).toHaveLength(1)
      held[0]?.()
      // 붙잡았던 앞 파일의 `onload`가 돈 뒤까지 기다린다 — 결과가 보이는 것이 콜백이 돈 것은 아니다(CLAUDE.md «이벤트로 풀리는 상태»).
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(within(dialog()).getByRole('status').textContent).toContain('나중 파일')
      expect(dialog().textContent).toContain('고른 파일: fast.json')
    } finally {
      spy.mockRestore()
    }
  })

  it('파일이 아닌 것을 끌면 강조하지 않는다 — 음성 대조', async () => {
    await open()
    openImport()
    const zone = within(dialog()).getByLabelText('페이지 파일').closest('label') as HTMLElement

    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'], files: [] } })

    expect(zone.className).not.toContain('wb-shell-pagejson-drop-over')
  })
})

describe('파일 읽기가 실패하면 대기 글자가 남지 않는다', () => {
  /**
   * **읽을 수 없는 파일.** `readAsText`는 Blob이 아닌 것에 던지고, 그것이 `readTextFile`의
   * Promise를 거절시킨다 — 실브라우저에서 권한·삭제로 나는 거절과 같은 갈래로 들어온다.
   */
  function pickBrokenFile(): void {
    fireEvent.change(within(dialog()).getByLabelText('페이지 파일'), {
      target: { files: [{ name: 'broken.json' } as unknown as File] },
    })
  }

  it('앞에 읽힌 글자가 남아 있으면 안 된다 — 남으면 고르지도 않은 파일이 들어간다', async () => {
    await open()
    paste(JSON.stringify(file({ page: { title: '앞의 것', description: null } })))
    pickBrokenFile()

    await waitFor(() => {
      expect(within(dialog()).getByRole('textbox', { name: '페이지 JSON' })).toHaveProperty('value', '')
    })
    expect(importButton().disabled).toBe(true)
    expect(dialog().textContent).not.toContain('앞의 것')
  })

  it('**파일을 못 읽은 것**과 **그 안의 문서를 못 읽은 것**을 갈라 말한다', async () => {
    await open()
    openImport()

    pickBrokenFile()
    await waitFor(() => expect(within(dialog()).getAllByRole('alert').length).toBeGreaterThan(0))
    expect(dialog().textContent).toContain('파일을 읽지 못했습니다')
    expect(dialog().textContent).not.toContain('wirebound가 내보낸 페이지 파일이 아닙니다')

    paste(JSON.stringify({ hello: 1 }))
    expect(within(dialog()).getByRole('alert').textContent).toContain('wirebound가 내보낸 페이지 파일이 아닙니다')
  })
})

describe('가져오기', () => {
  it('상자의 대상 메뉴에 파일을 보내고, 성공하면 상자를 닫고 트리를 다시 받고 그 페이지로 옮긴다', async () => {
    const api = await open()
    paste(JSON.stringify(file()))

    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
    expect(api.importPage).toHaveBeenCalledWith('p-1', { menuNodeId: 'm-member', file: file() })
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe('/projects/p-1/pages/pg-new'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('제목을 적으면 그것을 싣고, 비우면 그 키를 만들지 않는다', async () => {
    const api = await open()
    paste(JSON.stringify(file()))
    fireEvent.change(titleInput(), { target: { value: '  회원 목록 (사본)  ' } })

    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
    expect(api.importPage).toHaveBeenCalledWith('p-1', { menuNodeId: 'm-member', file: file(), title: '회원 목록 (사본)' })
  })

  it('경고가 있는 파일도 보낸다 — 화면이 서버보다 엄격해지면 안 된다', async () => {
    const api = await open()
    paste(JSON.stringify(warnedFile()))

    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
  })

  it('보내는 동안 가져오기가 꺼지고 «가져오는 중…»을 말한다', async () => {
    let answer: (() => void) | undefined
    await open({
      importPage: vi.fn(
        () =>
          new Promise<PageImported>((resolve) => {
            answer = () => resolve(imported())
          }),
      ),
    })
    paste(JSON.stringify(file()))
    fireEvent.click(importButton())

    const sending = within(dialog()).getByRole('button', { name: '가져오는 중…' }) as HTMLButtonElement
    expect(sending.disabled).toBe(true)
    answer?.()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  /**
   * **서버 거절은 상자 안에 선다** — 상자를 닫지 않고 고른 글자 · 제목을 그대로 둔다. 트리의 실패 줄에는 서지 않는다(한 실패의 자리는
   * 하나다 — `TreeCommands.importFailure`). 대상 메뉴를 남이 지운 판이 이것이다(서버만 안다 — `SERVER_ONLY`).
   */
  it('서버가 거절하면 상자를 닫지 않고 글자 · 제목을 둔 채 이유를 보인다', async () => {
    const api = await open({
      importPage: vi.fn(async () => {
        throw new ApiError(404, 'not-found', '메뉴를 찾을 수 없습니다')
      }),
    })
    paste(JSON.stringify(file()))
    fireEvent.change(titleInput(), { target: { value: '사본' } })

    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(dialog().textContent).toContain('메뉴를 찾을 수 없습니다'))
    expect(within(dialog()).getByRole('textbox', { name: '페이지 JSON' })).toHaveProperty('value', JSON.stringify(file()))
    expect(titleInput().value).toBe('사본')
    // 트리의 실패 줄은 단축키 상자 안이다 — 상자는 그 밖(형제)이라 이 글자에 안 섞인다.
    expect(keyBox().textContent).not.toContain('메뉴를 찾을 수 없습니다')
    expect(screen.getByTestId('location-probe').textContent).toBe('/projects/p-1')
  })

  it('거절을 본 뒤 상자를 닫으면 그 이유가 트리로 옮겨 가지 않는다', async () => {
    await open({
      importPage: vi.fn(async () => {
        throw new ApiError(404, 'not-found', '메뉴를 찾을 수 없습니다')
      }),
    })
    paste(JSON.stringify(file()))
    fireEvent.click(importButton())
    await waitFor(() => expect(dialog().textContent).toContain('메뉴를 찾을 수 없습니다'))

    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }))

    expect(screen.queryByText(/메뉴를 찾을 수 없습니다/)).toBeNull()
  })

  it('보낸 뒤 상자를 닫았으면 거절이 트리의 실패 줄에 선다 — 말할 자리를 잃지 않는다', async () => {
    let refuse: (() => void) | undefined
    await open({
      importPage: vi.fn(
        () =>
          new Promise<PageImported>((_resolve, reject) => {
            refuse = () => reject(new ApiError(404, 'not-found', '메뉴를 찾을 수 없습니다'))
          }),
      ),
    })
    paste(JSON.stringify(file()))
    fireEvent.click(importButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }))

    refuse?.()

    await waitFor(() => expect(keyBox().textContent).toContain('메뉴를 찾을 수 없습니다'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('가져온 결과는 하단 바에 남는다', () => {
  it('고아가 된 코멘트와 쓰지 않은 layoutRef를 말한다', async () => {
    const api = await open({
      importPage: vi.fn(async () => imported({ comments: { inserted: 3, dangling: 2 }, ignoredLayoutRef: 'admin-lnb' })),
    })
    paste(JSON.stringify(file()))
    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(footer().textContent).toContain('가져왔습니다: 가져온 목록 — 코멘트 3개'))
    expect(footer().textContent).toContain('2개는 가리키던 노드가 파일에 없어')
    expect(footer().textContent).toContain('admin-lnb')
  })

  /**
   * **저절로 걷히지 않는다** — 고아 코멘트는 되돌릴 수 없는 상태라 읽기 전에 사라지면 안 된다. 가져오기가 곧바로 새 페이지로 옮기므로
   * 페이지 이동에 걷히면 서자마자 사라진다(`src/panels/page-json-notices.tsx`의 표).
   */
  it('페이지를 옮기고 모드를 바꿔도 남고, «닫기»가 걷는다', async () => {
    await open()
    paste(JSON.stringify(file()))
    fireEvent.click(importButton())
    await waitFor(() => expect(footer().textContent).toContain('가져왔습니다'))

    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe('/projects/p-1/pages/pg-list'))
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    expect(footer().textContent).toContain('가져왔습니다')

    fireEvent.click(within(footer()).getByRole('button', { name: '가져오기 결과 닫기' }))

    expect(footer().textContent).not.toContain('가져왔습니다')
  })

  it('다음 가져오기를 보내면 앞 결과가 걷힌다', async () => {
    let second: (() => void) | undefined
    let calls = 0
    await open({
      importPage: vi.fn(() => {
        calls += 1
        if (calls === 1) return Promise.resolve(imported())
        return new Promise<PageImported>((resolve) => {
          second = () => resolve(imported({ page: pageDetail('pg-two', '둘째') }))
        })
      }),
    })
    paste(JSON.stringify(file()))
    fireEvent.click(importButton())
    await waitFor(() => expect(footer().textContent).toContain('가져왔습니다: 가져온 목록'))

    paste(JSON.stringify(file()))
    fireEvent.click(importButton())

    expect(footer().textContent).not.toContain('가져왔습니다')
    second?.()
    await waitFor(() => expect(footer().textContent).toContain('가져왔습니다: 둘째'))
  })
})

describe('내보내기 — 페이지 줄 `…`', () => {
  it('**그 줄의** 페이지를 낸다 — 열린 페이지가 아니다', async () => {
    // 열린 페이지는 «회원 목록», 누르는 줄은 «회원 상세» — 둘을 가른다.
    const api = await open({}, '/projects/p-1/pages/pg-list')
    const item = rowAction(treeRegion(), 'JSON 내보내기', rowNamed(treeRegion(), '회원 상세'))

    const download = await withDownloadCapture(() => fireEvent.click(item))

    expect(api.getPage).toHaveBeenCalledWith('p-1', 'pg-detail')
    expect(api.listComments).toHaveBeenCalledWith('p-1', 'pg-detail')
    expect(download.fileName).toBe('회원-상세.wirebound-page.json')
    const parsed = JSON.parse(download.text) as PageJson
    expect(parsed.page.title).toBe('회원 상세')
  })

  it('서버의 페이지와 코멘트를 같은 순간에 읽어 파일로 낸다', async () => {
    await open({}, '/projects/p-1/pages/pg-list')
    const item = rowAction(treeRegion(), 'JSON 내보내기', rowNamed(treeRegion(), '회원 목록'))

    const download = await withDownloadCapture(() => fireEvent.click(item))

    expect(download.fileName).toBe('회원-목록.wirebound-page.json')
    const parsed = JSON.parse(download.text) as PageJson
    expect(parsed.wireboundVersion).toBe(WIREBOUND_PAGE_VERSION)
    expect(parsed.page).toEqual({ title: '회원 목록', description: '가입한 회원을 본다' })
    // **번호는 문서에 실려 나가고 코멘트에는 없다**(설계서 「페이지 JSON」).
    expect(parsed.schema.root.children?.[0]?.marker).toBe(1)
    expect(parsed.comments).toEqual([{ nodeId: 'n_00000000000b', body: '목록은 10개씩' }])
  })

  it('실패는 하단 바에 서고 «닫기»가 걷는다', async () => {
    await open({ listComments: vi.fn(async () => Promise.reject(new ApiError(500, 'internal', '서버 오류'))) })
    const item = rowAction(treeRegion(), 'JSON 내보내기', rowNamed(treeRegion(), '회원 목록'))

    fireEvent.click(item)

    await waitFor(() => expect(within(footer()).getByRole('alert').textContent).toContain('서버 오류'))
    fireEvent.click(within(footer()).getByRole('button', { name: '내보내기 실패 닫기' }))
    expect(within(footer()).queryByRole('alert')).toBeNull()
  })
})
