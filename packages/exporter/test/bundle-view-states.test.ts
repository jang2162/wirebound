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

/** 관리자 · 비로그인 두 상태. 영역 하나 — 기본은 «보기», 관리자는 «승인»(상호작용 · 코멘트가 달림), 비로그인 가지는 없다(기본으로 그린다). */
const STATE_PAGE: PageDocument = {
  version: 1,
  viewStates: [
    { id: 's_admin', name: '관리자' },
    { id: 's_guest', name: '비로그인' },
  ],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_title', type: 'Text', props: { content: '회원 목록' } },
      {
        id: 'n_switch',
        type: 'StateSwitch',
        children: [
          { id: 'n_case_d', type: 'StateCase', props: { state: 'default' }, children: [{ id: 'n_view', type: 'Button', props: { label: '보기' } }] },
          {
            id: 'n_case_a',
            type: 'StateCase',
            props: { state: 's_admin' },
            children: [
              {
                id: 'n_approve',
                type: 'Button',
                props: { label: '승인' },
                marker: 1,
                interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_title', value: false }] }],
              },
            ],
          },
        ],
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
  it('전환기가 기본 + 목록 차례의 상태를 싣고, 이름표가 붙는다', () => {
    load()
    const options = [...select().options].map((option) => [option.value, option.textContent])
    expect(options).toEqual([
      ['default', '기본'],
      ['s_admin', '관리자'],
      ['s_guest', '비로그인'],
    ])
    expect(select().value).toBe('default')
    const label = document.querySelector('label[for="wb-export-state"]')
    expect(label?.textContent).toBe('화면 상태')
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
  it('처음은 기본 가지 · 관리자를 고르면 관리자 가지 · 주소 해시가 따라간다', async () => {
    load()
    await run()
    expect(canvasText()).toContain('보기')
    expect(canvasText()).not.toContain('승인')

    choose('s_admin')
    expect(canvasText()).toContain('승인')
    expect(canvasText()).not.toContain('보기')
    expect(window.location.hash).toBe('#state=s_admin')

    choose('s_guest')
    // 비로그인 가지가 없다 — 기본을 그린다.
    expect(canvasText()).toContain('보기')
    expect(window.location.hash).toBe('#state=s_guest')

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

  it('상태를 바꾸면 그 상태의 상호작용이 돈다 — 관리자 가지의 단추가 제목을 숨긴다', async () => {
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
