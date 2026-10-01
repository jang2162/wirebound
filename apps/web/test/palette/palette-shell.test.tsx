/**
 * **하단 컴포넌트 판의 열고 접기**(`src/palette/component-palette.tsx` · 토글은 `src/routes/editor.tsx` 의 하단 바) — spec
 * `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「열고 접기」.
 *
 * 셸을 라우트째 띄워 실물 길로 잰다(토글을 눌러 판을 연다 · 모드 단추 · 역할은 `getProject` 의 답). 높이 · 캔버스가 주는 것은 jsdom 이
 * 못 잰다 — 실브라우저 판은 `build-test/palette.test.ts`.
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRole, ProjectView } from '../../src/api/types'
import { STORAGE_KEY } from '../../src/shell/sidebar-layout'
import { PROJECT_ID, PROJECT_NAME, openPage, pageDoc } from '../editor-harness'

const DOC: PageDocument = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text', props: {} }] })

function project(role: ProjectRole): ProjectView {
  return { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin', description: null, role, themeRev: 0 }
}

function footer(): HTMLElement {
  return screen.getByRole('contentinfo', { name: '하단 바' })
}

function toggle(): HTMLElement | null {
  return within(footer()).queryByRole('button', { name: '컴포넌트' })
}

function palette(): HTMLElement | null {
  return screen.queryByRole('region', { name: '컴포넌트 목록' })
}

function setMode(name: '편집 모드' | '뷰 모드'): void {
  fireEvent.click(within(screen.getByRole('group', { name: '모드' })).getByRole('button', { name }))
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('하단 판 — 열고 접기', () => {
  it('편집 모드 · editor: 하단 바의 «컴포넌트» 가 판을 열고 닫는다', async () => {
    await openPage(DOC, { apiOverrides: { getProject: async () => project('editor') } })
    const button = toggle()
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    expect(palette()).toBeNull()

    fireEvent.click(button as HTMLElement)
    const opened = palette()
    expect(opened).not.toBeNull()
    expect(button?.getAttribute('aria-expanded')).toBe('true')
    // 단추가 무엇을 여는지 — 판의 id 를 가리킨다.
    expect(button?.getAttribute('aria-controls')).toBe(opened?.id)

    fireEvent.click(button as HTMLElement)
    expect(palette()).toBeNull()
    expect(button?.getAttribute('aria-expanded')).toBe('false')
  })

  it('viewer 에게는 토글 · 판이 없다 — 열어 둔 기억이 있어도', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ paletteOpen: true }))
    await openPage(DOC, { apiOverrides: { getProject: async () => project('viewer') } })
    expect(toggle()).toBeNull()
    expect(palette()).toBeNull()
  })

  it('뷰 모드에서는 토글 · 판이 없고, 편집 모드로 돌아오면 기억한 열림대로 선다', async () => {
    await openPage(DOC, { apiOverrides: { getProject: async () => project('editor') } })
    fireEvent.click(toggle() as HTMLElement)
    expect(palette()).not.toBeNull()

    setMode('뷰 모드')
    await act(async () => {})
    expect(toggle()).toBeNull()
    expect(palette()).toBeNull()

    setMode('편집 모드')
    await act(async () => {})
    expect(palette()).not.toBeNull()
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true')
  })

  it('열림은 기억한다 — 다시 열면 열린 채 선다', async () => {
    await openPage(DOC, { apiOverrides: { getProject: async () => project('editor') } })
    fireEvent.click(toggle() as HTMLElement)
    await act(async () => {})
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ paletteOpen: true })
  })

  it('판 위쪽 손잡이가 높이를 나른다 — 위 화살표가 키운다', async () => {
    await openPage(DOC, { apiOverrides: { getProject: async () => project('editor') } })
    fireEvent.click(toggle() as HTMLElement)
    const handle = within(palette() as HTMLElement).getByRole('separator', { name: '컴포넌트 목록 높이' })
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal')
    const before = Number(handle.getAttribute('aria-valuenow'))
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 16)
    expect((palette() as HTMLElement).style.height).toBe(`${before + 16}px`)
  })
})
