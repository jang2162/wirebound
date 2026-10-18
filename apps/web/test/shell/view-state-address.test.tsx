/**
 * **화면 상태의 주소 `?state=<id>`**(설계서 「설계서 화면 구조」 «화면 상태» — 읽기) — 연 주소의 상태로 서고(없는 id 는 기본), 뷰 모드에서
 * 고르면 주소가 따라간다. 편집 모드는 읽기만 한다 — 주소를 안 고친다.
 */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { PAGE_ROUTE, canvasDocument, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

afterEach(cleanup)

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }

/** 기본 «보기»(관리자에서 숨김) · 관리자만 «승인». */
function doc(): PageDocument {
  return {
    ...pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-title', type: 'Text', props: { content: '회원' } },
        { id: 'n-view', type: 'Button', props: { label: '보기' }, visibility: { mode: 'except', states: ['s_admin'] } },
        { id: 'n-approve', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin'] } },
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
