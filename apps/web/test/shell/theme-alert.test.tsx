/**
 * **캔버스가 테마를 못 읽으면 셸 머리가 한 줄로 말한다**(`canvas/canvas-theme-notice.tsx`). 조회가 던지면 캔버스는 구조 기본 CSS 로 그리는데,
 * 말하지 않으면 사람은 그것을 설계서의 모습으로 읽는다. 단추는 고르개와 같은 신호(`themeReloadToken`)로 다시 읽는다.
 *
 * 테마 고르개도 `getProjectTheme`을 부른다(끊는 신호 없이) — 흉내는 캔버스의 부름(`ReadOptions`를 싣는다)만 가른다.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { systemTheme } from '@wirebound/themes'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { ProjectTheme, RestoreResult } from '../../src/api/types'
import { THEME_FAILED_NOTICE } from '../../src/canvas/canvas-theme-notice'
import { OTHER_PAGE_ID, OTHER_PAGE_TITLE, openPage, pageDetail, pageDoc } from '../editor-harness'

const doc = (): PageDocument => pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text', props: {} }] })

const THEME: ProjectTheme = { themeId: 'sys-admin', theme: systemTheme('admin') ?? null, issues: [] }

/** 캔버스의 테마 조회만 `answers`의 차례대로 답한다(끝나면 마지막 것). */
function canvasTheme(answers: (() => Promise<ProjectTheme>)[]): { getProjectTheme: ApiClient['getProjectTheme']; calls: () => number } {
  let calls = 0
  return {
    getProjectTheme: vi.fn(async (_projectId: string, options?: unknown) => {
      if (options === undefined) return THEME
      calls += 1
      return answers[Math.min(calls, answers.length) - 1]!()
    }) as ApiClient['getProjectTheme'],
    calls: () => calls,
  }
}

const statusText = (): string =>
  screen
    .queryAllByRole('status')
    .map((node) => node.textContent ?? '')
    .join(' | ')

const failed = (): Promise<ProjectTheme> => Promise.reject(new TypeError('Failed to fetch'))

describe('테마를 못 읽은 캔버스', () => {
  it('조회가 실패하면 기본 스타일로 그린다고 말하고, 단추로 다시 읽으면 거둔다', async () => {
    const theme = canvasTheme([failed, async () => THEME])
    await openPage(doc(), { apiOverrides: { getProjectTheme: theme.getProjectTheme } })

    await waitFor(() => expect(statusText()).toContain(THEME_FAILED_NOTICE))

    fireEvent.click(screen.getByRole('button', { name: '테마 다시 불러오기' }))
    await waitFor(() => expect(theme.calls()).toBe(2))
    await act(async () => {})

    expect(statusText()).not.toContain(THEME_FAILED_NOTICE)
  })

  it('복원 뒤 다시 읽기의 테마 조회가 실패하면 말한다 — 입던 테마를 말없이 벗지 않는다', async () => {
    const theme = canvasTheme([async () => THEME, failed])
    const restore: RestoreResult = {
      summary: {
        menu: { created: 0, updated: 0, deleted: 0 },
        pages: { created: 0, metaUpdated: 0, schemaChanged: 0, schemaUnchanged: 1, deleted: 0 },
        comments: { created: 0, updated: 0, deleted: 0 },
        layouts: { themeRefChanged: 0 },
      },
      safetySnapshot: { id: 's-safe', tag: '복원 전' },
      themes: [],
    }
    await openPage(doc(), {
      apiOverrides: {
        getProjectTheme: theme.getProjectTheme,
        listSnapshots: async () => [
          { id: 's1', tag: 'v1', description: null, createdBy: 'u1', createdByName: '홍길동', createdAt: '2026-08-12T09:00:00.000Z', payloadBytes: 10 },
        ],
        restoreSnapshot: async () => restore,
      },
    })
    await waitFor(() => expect(theme.calls()).toBe(1))
    // 판 카나리아 — 처음에는 테마를 읽었다.
    expect(statusText()).not.toContain(THEME_FAILED_NOTICE)

    fireEvent.click(screen.getByRole('button', { name: '스냅샷' }))
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))
    await waitFor(() => expect(theme.calls()).toBe(2))

    await waitFor(() => expect(statusText()).toContain(THEME_FAILED_NOTICE))
  })

  it('서버가 테마를 고르지 않았다고 답하면 말하지 않는다 — 실패가 아니라 답이다', async () => {
    const theme = canvasTheme([async () => ({ themeId: null, theme: null, issues: [] })])
    await openPage(doc(), { apiOverrides: { getProjectTheme: theme.getProjectTheme } })
    await waitFor(() => expect(theme.calls()).toBe(1))
    await act(async () => {})

    expect(statusText()).not.toContain(THEME_FAILED_NOTICE)
  })

  it('캔버스가 내려가면 거둔다 — 테마로 그리는 것이 없다', async () => {
    const theme = canvasTheme([failed])
    // 둘째 페이지를 여는 조회는 답하지 않는다 — 캔버스 자리는 «불러오는 중»이다.
    await openPage(doc(), {
      apiOverrides: {
        getProjectTheme: theme.getProjectTheme,
        getPage: async (_projectId, pageId) => (pageId === OTHER_PAGE_ID ? new Promise<never>(() => {}) : pageDetail(pageId, doc())),
      },
    })
    await waitFor(() => expect(statusText()).toContain(THEME_FAILED_NOTICE))

    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await screen.findByText('페이지를 불러오는 중…')

    expect(statusText()).not.toContain(THEME_FAILED_NOTICE)
  })
})
