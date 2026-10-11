/**
 * **배치 선 토글**(`src/canvas/layout-guides.tsx` · 설계서 「설계서 화면 구조」 «배치 선») — 머리의 단추 · 누름 상태 · 기억 · 편집 모드에서만 ·
 * 캔버스 셸 겹에 Flex · Grid 마다 선. 선이 노드 상자에 맞는지 · 모서리 글(그려진 배치로 읽음)은 jsdom 에 배치가 없어 실브라우저
 * (`build-test/layout-guides.test.ts`)가 잰다.
 */
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GUIDES_KEY } from '../../src/canvas/layout-guides'
import { openPage, pageDoc } from '../editor-harness'

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-row', type: 'Flex', props: { direction: 'row' }, children: [{ id: 'n-a', type: 'Text', props: { content: '가' } }] },
    { id: 'n-grid', type: 'Grid', props: { columns: 3 }, children: [{ id: 'n-b', type: 'Text', props: { content: '나' } }] },
    { id: 'n-text', type: 'Text', props: { content: '글' } },
  ],
})

afterEach(() => {
  window.localStorage.removeItem(GUIDES_KEY)
  vi.restoreAllMocks()
})

function toggle(): HTMLElement | null {
  return screen.queryByRole('button', { name: '배치 선' })
}

/** 캔버스 셸 겹에 그려진 배치 선 — 노드 id 차례. */
function guides(): string[] {
  return [...document.querySelectorAll('[data-wb-guide-for]')].map((guide) => guide.getAttribute('data-wb-guide-for') ?? '')
}

describe('배치 선', () => {
  it('머리의 단추는 끈 채 서고, 누르면 `aria-pressed` 와 함께 Flex · Grid 마다 선이 선다 — 다시 누르면 걷힌다', async () => {
    await openPage(DOC)
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false')
    expect(guides()).toEqual([])

    fireEvent.click(toggle()!)
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true')
    expect(guides()).toEqual(['n-row', 'n-grid'])
    expect([...document.querySelectorAll('[data-wb-guide-for]')].map((guide) => guide.getAttribute('data-wb-guide-kind'))).toEqual([
      'flex',
      'grid',
    ])
    // 셸 겹이다 — 캔버스 문서(iframe)에는 아무것도 안 넣는다.
    const frame = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
    expect(frame.contentDocument?.querySelectorAll('[data-wb-guide-for], .wb-shell-guide')).toHaveLength(0)

    fireEvent.click(toggle()!)
    expect(guides()).toEqual([])
  })

  it('켬은 브라우저에 기억한다 — 다시 연 셸이 켠 채 선다', async () => {
    window.localStorage.setItem(GUIDES_KEY, 'on')
    await openPage(DOC)
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true')
    expect(guides()).toEqual(['n-row', 'n-grid'])

    fireEvent.click(toggle()!)
    expect(window.localStorage.getItem(GUIDES_KEY)).toBeNull()
  })

  it('저장소를 못 읽으면 끈 채 서고, 눌러서 켜면 이 화면에서는 켜진다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('막힌 저장소')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('막힌 저장소')
    })
    await openPage(DOC)
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle()!)
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true')
    expect(guides()).toEqual(['n-row', 'n-grid'])
  })

  it('뷰 모드에는 단추도 선도 없다 — 편집 모드로 돌아오면 켠 채다', async () => {
    window.localStorage.setItem(GUIDES_KEY, 'on')
    await openPage(DOC)
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    expect(toggle()).toBeNull()
    expect(guides()).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
    expect(guides()).toEqual(['n-row', 'n-grid'])
  })
})
