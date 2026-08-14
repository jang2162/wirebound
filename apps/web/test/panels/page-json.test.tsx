/**
 * 페이지 JSON 패널(§11.2 — P7-3 T5: D10·D11).
 *
 * **이 파일의 첫 하중은 D11이다** — 이 패널의 입력 칸이 메뉴 트리의 단축키 상자 **안**에
 * 있으므로, 거기서 친 `Backspace`가 **메뉴 삭제 확인**을 걸면 안 된다. P7-2 이월 §2가
 * 구조 트리에서 실측한 사고가 여기서 되풀이될 자리다.
 *
 * # 내려받기를 어떻게 재는가 — **절반은 대역이다**
 *
 * jsdom에 `URL.createObjectURL`이 없다(P4c-3이 쟀고 `files/file-io.ts`의 머리말에 표가
 * 있다). 아래 `withDownloadCapture`는 `theme-io-panel.test.ts`의 것과 **같은 장치**이고,
 * 재는 것도 같다 — Blob에 실린 글자·앵커의 `download` 이름·클릭 한 번. **재지 못하는
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
  ProjectDetail,
  SessionUser,
  TreeMenuNode,
} from '../../src/api/types'
import { App } from '../../src/app'
import { fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT: ProjectDetail = { id: 'p-1', name: '설계서', slug: 'proj', description: null, role: 'owner' }

function tree(): TreeMenuNode[] {
  return [
    {
      id: 'm-member',
      title: '회원관리',
      sortOrder: 0,
      pages: [{ id: 'pg-list', title: '회원 목록', sortOrder: 0 }],
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
  const getPage = vi.fn(async (_p: string, pageId: string) => pageDetail(pageId, '회원 목록'))
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
  await screen.findByText('회원관리')
  return { ...harness, rendered }
}

function panel(): HTMLElement {
  return screen.getByRole('region', { name: '페이지 JSON' })
}

function paste(text: string): void {
  fireEvent.change(within(panel()).getByRole('textbox', { name: '페이지 JSON' }), {
    target: { value: text },
  })
}

function titleInput(): HTMLInputElement {
  return within(panel()).getByRole('textbox', { name: '가져올 페이지 제목' }) as HTMLInputElement
}

function importButton(): HTMLButtonElement {
  return within(panel()).getByRole('button', { name: '페이지 가져오기' }) as HTMLButtonElement
}

/** 단축키가 붙은 상자. 트리·툴바·이 패널을 함께 감싼다. */
function keyBox(): HTMLElement {
  const box = screen.getByRole('region', { name: '메뉴·페이지 트리' }).querySelector('.wb-shell-tree-keys')
  if (box === null) throw new Error('단축키 상자를 찾지 못했습니다')
  return box as HTMLElement
}

interface Download {
  fileName: string
  text: string
  clicks: number
}

/** `theme-io-panel.test.ts`의 것과 같은 장치(그 파일의 머리말에 근거가 있다). */
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

describe('D11 — 이 패널의 키가 트리 단축키로 새지 않는다', () => {
  it('제목 칸의 Backspace가 메뉴 삭제 확인을 걸지 않고 글자도 지워진다', async () => {
    const api = await open()
    // **삭제가 실제로 가능한 메뉴를 고른다.** 자식이 있는 메뉴를 고르면 `abilities.remove`가
    // 거짓이라 가드가 없어도 확인이 안 걸리고 — 이 케이스가 아무것도 재지 않는다.
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('button', { name: '주문관리' }))

    const input = titleInput()
    const event = fireEvent.keyDown(input, { key: 'Backspace', bubbles: true })

    // ㉠ 삭제 확인이 걸리지 않았다.
    expect(within(panel()).queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
    expect(screen.queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
    // ㉡ **`preventDefault`가 걸리지 않았다** — 걸리면 글자가 안 지워진다. 그것이
    // "찾기 전에 거른다"는 순서가 지키는 것이다.
    expect(event).toBe(true)
    expect(api.deleteMenu).not.toHaveBeenCalled()
  })

  it('붙여 넣기 칸의 Delete도 같다', async () => {
    await open()
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('button', { name: '주문관리' }))

    const box = within(panel()).getByRole('textbox', { name: '페이지 JSON' })
    expect(fireEvent.keyDown(box, { key: 'Delete', bubbles: true })).toBe(true)
    expect(screen.queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
  })

  it('상자 안이지만 입력 칸이 아니면 단축키가 그대로 걸린다 — 음성 대조', async () => {
    await open()
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('button', { name: '주문관리' }))

    fireEvent.keyDown(keyBox(), { key: 'Backspace' })

    expect(screen.getByRole('button', { name: '정말 삭제합니까?' })).toBeDefined()
  })
})

describe('미리보기', () => {
  it('읽은 것을 말한다 — 제목·노드 수·코멘트 수', async () => {
    await open()
    paste(JSON.stringify(file()))

    expect(within(panel()).getByRole('status').textContent).toContain('가져온 목록')
    expect(within(panel()).getByRole('status').textContent).toContain('노드 2개')
    expect(within(panel()).getByRole('status').textContent).toContain('코멘트 1개')
  })

  it('D5 — 끊긴 코멘트를 세어 미리 말한다', async () => {
    await open()
    paste(JSON.stringify(file({ comments: [{ nodeId: 'file_gone', body: '가' }] })))

    expect(panel().textContent).toContain('코멘트 1개는 이 파일의 트리에 없는 노드를 가리킵니다')
  })

  it('D4 — layoutRef를 쓰지 않는다고 미리 말한다', async () => {
    await open()
    paste(JSON.stringify(file({ page: { title: '가져온 목록', layoutRef: 'admin-lnb' } })))

    expect(panel().textContent).toContain('admin-lnb')
    expect(panel().textContent).toContain('쓰지 않습니다')
  })
})

describe('읽기 실패를 갈라 말한다', () => {
  it('JSON이 아니면 그렇게 말한다', async () => {
    await open()
    paste('{ 이건 JSON이 아니다')

    expect(within(panel()).getByRole('alert')).toBeDefined()
    expect(importButton().disabled).toBe(true)
  })

  it('테마 파일이면 **다른 파일을 고르라**고 말한다', async () => {
    await open()
    paste(JSON.stringify({ wireboundVersion: '1', theme: { meta: { id: 'admin' } } }))

    // 봉투 안쪽이 규격이 아닌 것이므로 **자리를 보인다**(D8).
    expect(within(panel()).getByRole('alert')).toBeDefined()
    expect(panel().textContent).toContain('page')
  })

  it('모르는 버전이면 그 값을 말한다', async () => {
    await open()
    paste(JSON.stringify({ ...file(), wireboundVersion: '9' }))

    expect(within(panel()).getByRole('alert').textContent).toContain('9')
  })

  it('D6·D8 — comments[]의 marker는 거절하고 파일의 자리를 보인다', async () => {
    await open()
    paste(JSON.stringify({ ...file(), comments: [{ marker: 1, nodeId: 'file_list', body: '가' }] }))

    expect(within(panel()).getByRole('alert').textContent).toContain('marker')
    // 사용자에게 남는 것은 파일뿐이므로 **어느 자리인지**를 보인다.
    expect(panel().textContent).toContain('comments.0.marker')
  })
})

describe('가져오기', () => {
  it('메뉴를 고르지 않으면 누를 수 없다', async () => {
    await open()
    paste(JSON.stringify(file()))

    // 주소에 페이지가 없으므로 선택도 없다 — `addPage`가 거짓이다.
    expect(importButton().disabled).toBe(true)
    expect(importButton().getAttribute('title')).toContain('메뉴')
  })

  it('고른 메뉴에 파일을 보내고, 성공하면 트리를 다시 받고 그 페이지로 옮긴다', async () => {
    const api = await open()
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('button', { name: '회원관리' }))
    paste(JSON.stringify(file()))

    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
    expect(api.importPage).toHaveBeenCalledWith('p-1', { menuNodeId: 'm-member', file: file() })
    // 재조회 — 처음 한 번 + 조작 뒤 한 번.
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe('/projects/p-1/pages/pg-new'))
  })

  it('제목을 적으면 그것을 싣고, 비우면 그 키를 만들지 않는다', async () => {
    const api = await open()
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('button', { name: '회원관리' }))
    paste(JSON.stringify(file()))
    fireEvent.change(titleInput(), { target: { value: '  회원 목록 (사본)  ' } })

    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
    expect(api.importPage).toHaveBeenCalledWith('p-1', {
      menuNodeId: 'm-member',
      file: file(),
      title: '회원 목록 (사본)',
    })
  })

  it('가져온 뒤 고아가 된 코멘트와 쓰지 않은 layoutRef를 말한다', async () => {
    const api = await open({
      importPage: vi.fn(async () =>
        imported({ comments: { inserted: 3, dangling: 2 }, ignoredLayoutRef: 'admin-lnb' }),
      ),
    })
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('button', { name: '회원관리' }))
    paste(JSON.stringify(file()))
    fireEvent.click(importButton())

    await waitFor(() => expect(api.importPage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(panel().textContent).toContain('코멘트 3개'))
    expect(panel().textContent).toContain('2개는 가리키던 노드가 파일에 없어')
    expect(panel().textContent).toContain('admin-lnb')
  })
})

describe('내보내기', () => {
  it('서버의 페이지와 코멘트를 같은 순간에 읽어 파일로 낸다', async () => {
    const api = await open({}, '/projects/p-1/pages/pg-list')
    const button = within(panel()).getByRole('button', { name: '페이지 내보내기' })

    const download = await withDownloadCapture(() => fireEvent.click(button))

    expect(api.getPage).toHaveBeenCalledWith('p-1', 'pg-list')
    expect(api.listComments).toHaveBeenCalledWith('p-1', 'pg-list')
    expect(download.fileName).toBe('회원-목록.wirebound-page.json')

    const parsed = JSON.parse(download.text) as PageJson
    expect(parsed.wireboundVersion).toBe(WIREBOUND_PAGE_VERSION)
    expect(parsed.page).toEqual({ title: '회원 목록', description: '가입한 회원을 본다' })
    // **번호는 문서에 실려 나가고 코멘트에는 없다**(D6).
    expect(parsed.schema.root.children?.[0]?.marker).toBe(1)
    expect(parsed.comments).toEqual([{ nodeId: 'n_00000000000b', body: '목록은 10개씩' }])
  })

  it('페이지를 열지 않았으면 누를 수 없다', async () => {
    await open()

    const button = within(panel()).getByRole('button', { name: '페이지 내보내기' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toContain('페이지를 열면')
  })
})

describe('파일 읽기가 실패하면 대기 글자가 남지 않는다 — P4c-3이 닫은 자리', () => {
  /**
   * **읽을 수 없는 파일.** `readAsText`는 Blob이 아닌 것에 던지고, 그것이 `readTextFile`의
   * Promise를 거절시킨다 — 실브라우저에서 권한·삭제로 나는 거절과 같은 갈래로 들어온다
   * (`theme-io-panel.test.ts`의 같은 장치).
   */
  function pickBrokenFile(): void {
    fireEvent.change(within(panel()).getByLabelText('페이지 파일'), {
      target: { files: [{ name: 'broken.json' } as unknown as File] },
    })
  }

  it('앞에 읽힌 글자가 남아 있으면 안 된다 — 남으면 고르지도 않은 파일이 들어간다', async () => {
    await open()
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('button', { name: '주문관리' }))

    paste(JSON.stringify(file({ page: { title: '앞의 것', description: null } })))
    pickBrokenFile()

    await waitFor(() => {
      expect(within(panel()).getByRole('textbox', { name: '페이지 JSON' })).toHaveProperty('value', '')
    })
    // **넣을 것이 없으므로 버튼도 꺼진다.**
    expect(importButton().disabled).toBe(true)
    expect(panel().textContent).not.toContain('앞의 것')
  })

  it('**파일을 못 읽은 것**과 **그 안의 문서를 못 읽은 것**을 갈라 말한다', async () => {
    await open()

    pickBrokenFile()
    await waitFor(() => expect(within(panel()).getAllByRole('alert').length).toBeGreaterThan(0))
    // 파일 자체가 실패한 갈래 — 봉투의 문장이 아니다.
    expect(panel().textContent).not.toContain('wirebound가 내보낸 페이지 파일이 아닙니다')

    // 같은 화면에서 **파일은 읽혔는데 내용이 봉투가 아닌** 갈래는 다른 문장을 낸다.
    paste(JSON.stringify({ hello: 1 }))
    expect(within(panel()).getByRole('alert').textContent).toContain(
      'wirebound가 내보낸 페이지 파일이 아닙니다',
    )
  })
})
