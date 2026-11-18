// @vitest-environment jsdom
/**
 * **화면 상태가 있는 페이지의 번들** — 설계서 「HTML 정적 번들」 의 «상태가 있는 페이지는 전환기와 상태마다의 화면을 담는다».
 *
 * 셸이 전환기(`select#wb-export-state` — 기본 + 목록 차례)를 싣고, 런타임이 고른 상태로 목업을 다시 그린다. 고른 상태는 주소 해시
 * (`#state=<id>`)에 실려 링크로 나뉜다 — 없는 id 는 기본이다. 상호작용 · 코멘트 탭은 상태마다 갈리지 않고 노드 이름에 상태를 붙인다.
 *
 * 실브라우저 판(파일로 연 번들의 전환)은 `apps/web/build-test/export-bundle.test.ts` 가 잰다.
 */
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { installRuntime, type RuntimeHandle } from '@wirebound/theme-sdk/runtime'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { boot, type BootResult } from '../src/browser/boot'
import { exportBundle } from '../src/bundle/index'

let runtime: RuntimeHandle
beforeAll(() => {
  installCatalog()
  runtime = installRuntime(window as unknown as typeof globalThis)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

/**
 * 상태 셋 — 비로그인 · 로그인 > 관리자(목록에서는 관리자가 앞이다 — 고르개는 트리 차례로 선다). 기본은 «보기»(관리자 · 로그인에서 숨김),
 * 관리자는 «승인»(상호작용 · 코멘트가 달림). 비로그인은 그 상태에 쓴 노드가 없다(기본과 같이 «보기»).
 */
const STATE_PAGE: PageDocument = {
  version: 2,
  viewStates: [
    { id: 's_admin', name: '관리자', parent: 's_login', description: '승인을 맡는 사람\n둘째 줄' },
    { id: 's_guest', name: '비로그인' },
    { id: 's_login', name: '로그인' },
  ],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_title', type: 'Text', props: { content: '회원 목록' } },
      { id: 'n_view', type: 'Button', props: { label: '보기' }, visibility: { mode: 'except', states: ['s_login'] } },
      {
        id: 'n_approve',
        type: 'Button',
        props: { label: '승인' },
        marker: 1,
        visibility: { mode: 'only', states: ['s_admin'] },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_title', value: false }] }],
      },
    ],
  },
}

function stateBundle(page: PageDocument = STATE_PAGE) {
  return exportBundle({
    pages: [{ title: '회원 목록', document: page, comments: [{ nodeId: 'n_approve', body: '관리자만' }] }],
    runtimeJs: '/* runtime */',
  })
}

function load(page: PageDocument = STATE_PAGE): void {
  const html = String(stateBundle(page).files.find((file) => file.path === 'pages/회원-목록.html')!.content)
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
}

let booted: BootResult | null = null

async function run(): Promise<void> {
  await act(async () => {
    booted = await boot({ window, runtime, navigate: () => {} })
  })
}

function select(): HTMLSelectElement {
  const found = document.querySelector<HTMLSelectElement>('select#wb-export-state')
  if (found === null) throw new Error('전환기가 없다')
  return found
}

function canvasText(): string {
  return document.querySelector('.wb-export-canvas')?.textContent ?? ''
}

function choose(value: string): void {
  act(() => {
    select().value = value
    select().dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  history.replaceState(null, '', '#')
})

afterEach(() => {
  const mount = booted?.mount
  booted = null
  if (mount !== null && mount !== undefined) act(() => mount.unmount())
})

describe('셸 — 상태가 있는 페이지', () => {
  it('전환기가 기본 + 트리 차례의 상태를 싣고(하위 상태는 들여 쓴다), 이름표가 붙는다', () => {
    load()
    const options = [...select().options].map((option) => [option.value, option.textContent])
    expect(options).toEqual([
      ['default', '기본'],
      ['s_guest', '비로그인'],
      ['s_login', '로그인'],
      ['s_admin', '\u00a0\u00a0관리자'],
    ])
    expect(select().value).toBe('default')
    const label = document.querySelector('label[for="wb-export-state"]')
    expect(label?.textContent).toBe('화면 상태')
  })

  it('첫 탭이 페이지 설명 아래 화면 상태를 트리 차례로 싣는다 — 이름 · 깊이 · 설명(없으면 이름만)', () => {
    load()
    const items = [...document.querySelectorAll('#wb-export-panel-description .wb-export-state-item')].map((item) => [
      item.querySelector('.wb-export-state-name')?.textContent,
      item.getAttribute('data-depth'),
      item.querySelector('.wb-export-state-description')?.textContent ?? null,
    ])
    expect(items).toEqual([
      ['비로그인', '0', null],
      ['로그인', '0', null],
      ['관리자', '1', '승인을 맡는 사람\n둘째 줄'],
    ])
    expect(document.querySelector('#wb-export-panel-description .wb-export-state-heading')?.textContent).toBe('화면 상태')
  })

  it('상태가 없는 페이지의 첫 탭에는 상태 목록이 없다', () => {
    const html = String(
      exportBundle({ pages: [{ title: '빈', document: { ...STATE_PAGE, viewStates: [] } }], runtimeJs: '/* runtime */' }).files.find(
        (file) => file.path === 'pages/빈.html',
      )!.content,
    )
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    // 판 카나리아 — 첫 탭은 섰다.
    expect(parsed.querySelector('#wb-export-panel-description')).not.toBeNull()
    expect(parsed.querySelector('.wb-export-state-info')).toBeNull()
  })

  it('상호작용 탭의 문장 · 코멘트 탭의 이름이 노드에 상태를 붙인다', () => {
    load()
    const interactions = [...document.querySelectorAll('#wb-export-panel-interactions .wb-export-entry')].map((entry) => entry.textContent)
    expect(interactions).toHaveLength(1)
    expect(interactions[0]).toContain("'승인 버튼'(관리자 상태)")
    const comment = document.querySelector('#wb-export-panel-comments .wb-export-entry-label')?.textContent ?? ''
    expect(comment).toContain('(관리자 상태)')
  })
})

describe('런타임 — 고른 상태로 그린다', () => {
  it('처음은 기본 · 관리자를 고르면 관리자의 노드 · 주소 해시가 따라간다', async () => {
    load()
    await run()
    expect(canvasText()).toContain('보기')
    expect(canvasText()).not.toContain('승인')

    choose('s_admin')
    expect(canvasText()).toContain('승인')
    expect(canvasText()).not.toContain('보기')
    expect(window.location.hash).toBe('#state=s_admin')

    choose('s_guest')
    // 비로그인에 쓴 노드가 없다 — 기본과 같다.
    expect(canvasText()).toContain('보기')
    expect(window.location.hash).toBe('#state=s_guest')

    choose('s_login')
    // 로그인은 «보기»를 숨기고(except) «승인»은 관리자에서만이다.
    expect(canvasText()).not.toContain('보기')
    expect(canvasText()).not.toContain('승인')

    choose('default')
    expect(canvasText()).toContain('보기')
    expect(window.location.hash).toBe('')
  })

  it('해시로 연 상태로 선다 — 전환기도 그 값이다', async () => {
    history.replaceState(null, '', '#state=s_admin')
    load()
    await run()
    expect(select().value).toBe('s_admin')
    expect(canvasText()).toContain('승인')
  })

  it('없는 id 의 해시는 기본이다', async () => {
    history.replaceState(null, '', '#state=s_nope')
    load()
    await run()
    expect(select().value).toBe('default')
    expect(canvasText()).toContain('보기')
    expect(canvasText()).not.toContain('승인')
  })

  it('해시가 바뀌면(주소를 고침 · 링크) 그 상태로 다시 그린다', async () => {
    load()
    await run()
    await act(async () => {
      history.replaceState(null, '', '#state=s_admin')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(select().value).toBe('s_admin')
    expect(canvasText()).toContain('승인')
  })

  it('번호 닻 해시(코멘트 토큰 링크)로 바뀌어도 고른 상태가 그대로다(RV-TK L1)', async () => {
    load()
    await run()
    choose('s_admin')
    await act(async () => {
      history.replaceState(null, '', '#wb-marker-n_approve')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(select().value).toBe('s_admin')
    expect(canvasText()).toContain('승인')
  })

  it('빈 조각(`…#` — 규칙 없는 링크의 기본 동작)으로 바뀌어도 고른 상태가 그대로다', async () => {
    load()
    await run()
    choose('s_admin')
    await act(async () => {
      history.replaceState(null, '', '#')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    // `emptyFragment` 는 판 카나리아 — 주소가 조각 없는 주소(아래 케이스)가 아니라 빈 조각이다.
    expect({ select: select().value, approve: canvasText().includes('승인'), emptyFragment: location.href.endsWith('#') }).toEqual({
      select: 's_admin',
      approve: true,
      emptyFragment: true,
    })
  })

  it('상태 해시가 빠지면(뒤로 가기) 기본이다', async () => {
    history.replaceState(null, '', '#state=s_admin')
    load()
    await run()
    expect(select().value).toBe('s_admin')
    await act(async () => {
      history.replaceState(null, '', location.pathname)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(select().value).toBe('default')
  })

  it('상태를 바꾸면 그 상태의 상호작용이 돈다 — 관리자의 단추가 제목을 숨긴다', async () => {
    load()
    await run()
    choose('s_admin')
    const button = document.querySelector('.wb-export-canvas [data-wb-id="n_approve"]')
    expect(button).not.toBeNull()
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(canvasText()).not.toContain('회원 목록')
  })

  it('코멘트 마커는 그 노드가 그려진 상태에서만 선다', async () => {
    load()
    await run()
    const marker = (): Element | null => document.querySelector('.wb-export-marker[data-wb-marker-for="n_approve"]')
    expect(marker()).toBeNull()
    choose('s_admin')
    expect(marker()).not.toBeNull()
    choose('default')
    expect(marker()).toBeNull()
  })
})

/** STATE_PAGE 에 «관리자로» 단추(`setViewState s_admin`)를 더한 문서 — 상호작용이 상태를 바꾸는 판. */
const SWITCH_PAGE: PageDocument = {
  ...STATE_PAGE,
  root: {
    ...STATE_PAGE.root,
    children: [
      ...(STATE_PAGE.root.children ?? []),
      {
        id: 'n_to_admin',
        type: 'Button',
        props: { label: '관리자로' },
        interactions: [{ on: 'click', actions: [{ type: 'setViewState', target: 's_admin' }] }],
      },
    ],
  },
}

function pressToAdmin(): void {
  const button = document.querySelector('.wb-export-canvas [data-wb-id="n_to_admin"]')
  if (button === null) throw new Error('«관리자로» 단추가 없다')
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('런타임 — 상호작용이 상태를 바꾸면', () => {
  it('전환기와 주소 해시가 따라간다', async () => {
    load(SWITCH_PAGE)
    await run()
    pressToAdmin()
    expect({ select: select().value, hash: window.location.hash, approve: canvasText().includes('승인') }).toEqual({
      select: 's_admin',
      hash: '#state=s_admin',
      approve: true,
    })
  })

  it('화면 모드(`#wb-screen`)에서는 해시를 안 덮는다 — 전환기만 따라간다(새로고침이 화면 모드로 다시 연다 · RV-VS L2)', async () => {
    history.replaceState(null, '', '#wb-screen')
    load(SWITCH_PAGE)
    await run()
    pressToAdmin()
    expect({ select: select().value, hash: window.location.hash, approve: canvasText().includes('승인') }).toEqual({
      select: 's_admin',
      hash: '#wb-screen',
      approve: true,
    })
  })
})

/**
 * 코멘트 토큰의 번들 주소(`#wb-marker-<nodeId>`)는 «코멘트» 탭 안의 줄을 가리킨다 — 탭은 라디오 + CSS 라 런타임이 그 탭을 골라야 줄이 보인다
 * (RV-TK M2). 굴러가 창 안에 서는지는 실브라우저 판(`apps/web/build-test/comment-token-bundle.test.ts`)이 잰다 — jsdom 에는 배치가 없다.
 */
describe('런타임 — 번호 닻 해시', () => {
  const checked = (): string | null => document.querySelector<HTMLInputElement>('input.wb-export-tab-radio:checked')?.id ?? null

  it('번호 닻 해시로 열면 «코멘트» 탭이 골라진다', async () => {
    history.replaceState(null, '', '#wb-marker-n_approve')
    load()
    await run()
    expect(booted?.failures).toEqual([])
    expect(checked()).toBe('wb-export-tab-comments')
  })

  it('해시가 번호 닻으로 바뀌면 «코멘트» 탭이 골라진다 — 다른 해시는 탭을 안 건드린다', async () => {
    load()
    await run()
    // 판 카나리아 — 처음은 첫 탭(설명)이다.
    expect(checked()).toBe('wb-export-tab-description')
    await act(async () => {
      history.replaceState(null, '', '#state=s_admin')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(checked()).toBe('wb-export-tab-description')
    await act(async () => {
      history.replaceState(null, '', '#wb-marker-n_approve')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(checked()).toBe('wb-export-tab-comments')
  })
})
