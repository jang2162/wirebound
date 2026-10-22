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

function stateBundle() {
  return exportBundle({
    pages: [{ title: '회원 목록', document: STATE_PAGE, comments: [{ nodeId: 'n_approve', body: '관리자만' }] }],
    runtimeJs: '/* runtime */',
  })
}

function load(): void {
  const html = String(stateBundle().files.find((file) => file.path === 'pages/회원-목록.html')!.content)
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
