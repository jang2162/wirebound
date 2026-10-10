/**
 * **화면 상태의 주소 `?state=<id>`**(설계서 「설계서 화면 구조」 «화면 상태» — 읽기) — 연 주소의 상태로 서고(없는 id 는 기본), 뷰 모드에서
 * 고르면 주소가 따라간다. 편집 모드는 읽기만 한다 — 주소를 안 고친다.
 *
 * **영역 표지**(뷰 모드 — «상태에 따라 다름»)는 영역마다 서고, 누르면 그 영역의 가지 목록에서 상태를 고른다. 머리 전환기와 같은 값이다.
 * 자리(좌표)는 jsdom 이 못 잰다 — 실브라우저 판 `build-test/view-states-read.test.ts`.
 */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { PAGE_ROUTE, canvasDocument, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

afterEach(cleanup)

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }

/** 영역 하나 — 기본 «보기» · 관리자 «승인». 비로그인 가지는 없다. `extra` 는 영역 끝에 더할 가지. */
function doc(extra: PageDocument['root'][] = []): PageDocument {
  return {
    ...pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-title', type: 'Text', props: { content: '회원' } },
        {
          id: 'n-sw',
          type: 'StateSwitch',
          children: [
            { id: 'n-cd', type: 'StateCase', props: { state: 'default' }, children: [{ id: 'n-view', type: 'Button', props: { label: '보기' } }] },
            { id: 'n-ca', type: 'StateCase', props: { state: 's_admin' }, children: [{ id: 'n-approve', type: 'Button', props: { label: '승인' } }] },
            ...extra,
          ],
        },
      ],
    }),
    viewStates: [ADMIN, GUEST],
  }
}

/** 지금 주소의 질의 — 라우터 안에 놓아 DOM 에 적는다. */
function SearchProbe(): ReactElement {
  return <span data-testid="search-probe">{useLocation().search}</span>
}

function search(): string {
  return screen.getByTestId('search-probe').textContent ?? ''
}

function switcherName(): string {
  return screen.getByRole('button', { name: /^화면 상태:/ }).getAttribute('aria-label') ?? ''
}

function canvasText(): string {
  return canvasDocument().body.textContent ?? ''
}

async function open(route: string = PAGE_ROUTE, document: PageDocument = doc()): Promise<void> {
  await openPage(document, { route, children: <SearchProbe /> })
}

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

async function pickFromHead(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /^화면 상태:/ }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name }))
}

describe('?state= 읽기', () => {
  it('주소의 상태로 선다 — 머리 전환기 · 캔버스', async () => {
    await open(`${PAGE_ROUTE}?state=s_admin`)
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))
    expect(canvasText()).toContain('승인')
    expect(canvasText()).not.toContain('보기')
  })

  it('없는 id 는 기본이다', async () => {
    await open(`${PAGE_ROUTE}?state=s_nope`)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(switcherName()).toBe('화면 상태: 기본')
    expect(canvasText()).toContain('보기')
  })
})

describe('?state= 쓰기 — 뷰 모드만', () => {
  it('뷰 모드에서 고르면 주소가 따라가고, 기본이면 질의를 걷는다', async () => {
    await open()
    toView()
    await pickFromHead('관리자')
    await waitFor(() => expect(search()).toBe('?state=s_admin'))
    await pickFromHead('기본')
    await waitFor(() => expect(search()).toBe(''))
  })

  it('편집 모드는 주소를 안 고친다', async () => {
    await open()
    await pickFromHead('관리자')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))
    expect(search()).toBe('')
  })

  it('편집 모드에서 고른 뒤 뷰 모드로 가면 그 상태를 주소에 싣는다', async () => {
    await open()
    await pickFromHead('관리자')
    toView()
    await waitFor(() => expect(search()).toBe('?state=s_admin'))
  })
})

describe('영역 표지 — 뷰 모드', () => {
  // jsdom 은 배치가 없어 모든 상자가 0×0 이다 — 영역 표지는 그려진 자식의 상자로 서므로(`canvas/view-state-regions.ts` 의 `boxOf` 가 0×0 을 건너뛴다) 노드 요소에
  // 크기를 준다. 캔버스는 iframe 이라 그 창의 `Element`(호스트와 다른 영역)에 건다. 실브라우저 값은 `build-test/view-states-read.test.ts` ·
  // `build-test/n19-notices.test.ts` 가 잰다.
  const sizeCanvas = async (): Promise<void> => {
    await waitFor(() => canvasDocument())
    const proto = (canvasDocument().defaultView as unknown as { Element: typeof Element }).Element.prototype
    vi.spyOn(proto, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const sized = this.hasAttribute('data-wb-id')
      return { left: 8, top: 8, right: sized ? 128 : 8, bottom: sized ? 28 : 8, width: sized ? 120 : 0, height: sized ? 20 : 0, x: 8, y: 8, toJSON: () => ({}) } as DOMRect
    })
  }
  afterEach(() => vi.restoreAllMocks())

  const badge = (): HTMLElement | null => screen.queryByRole('button', { name: /^상태에 따라 다름/ })

  it('뷰 모드에서만 영역에 선다', async () => {
    await open()
    await sizeCanvas()
    expect(badge()).toBeNull()
    toView()
    await waitFor(() => expect(badge()).not.toBeNull())
  })

  it('누르면 그 영역의 가지 목록이 나오고, 고르면 상태가 바뀐다 — 머리 전환기 · 주소도', async () => {
    await open()
    await sizeCanvas()
    toView()
    await waitFor(() => expect(badge()).not.toBeNull())
    fireEvent.click(badge()!)
    const items = await screen.findAllByRole('menuitemradio')
    // 그 영역의 가지만 — 비로그인은 가지가 없다.
    expect(items.map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([
      ['기본', 'true'],
      ['관리자', 'false'],
    ])
    fireEvent.click(screen.getByRole('menuitemradio', { name: '관리자' }))
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))
    expect(canvasText()).toContain('승인')
    await waitFor(() => expect(search()).toBe('?state=s_admin'))
  })

  it('목록에 없는 상태의 가지는 목록에 안 싣는다 — 고를 수 없다', async () => {
    await open(PAGE_ROUTE, doc([{ id: 'n-cx', type: 'StateCase', props: { state: 's_gone' }, children: [{ id: 'n-gone', type: 'Text', props: { content: '사라진' } }] }]))
    await sizeCanvas()
    toView()
    await waitFor(() => expect(badge()).not.toBeNull())
    fireEvent.click(badge()!)
    const items = await screen.findAllByRole('menuitemradio')
    expect(items.map((item) => item.textContent)).toEqual(['기본', '관리자'])
  })
})
