/**
 * **끊지 않는 읽기를 끊는다.** 조회 이펙트가 `ReadOptions.cancel`을 싣고 정리가 끊는다 — 셸의 프로젝트(`routes/editor.tsx` —
 * 첫 조회 · `reread`) · 트리(`tree/use-tree-commands.tsx`) · 세션 확인(`me`)이 그렇다.
 * 편집 수습의 `getPage`는 `test/edit/edit-recovery-leave.test.tsx`가 잰다.
 *
 * 정리가 끊지 않으면 프로젝트 · 트리 조회가 떠난 뒤에도 200 으로 끝난다(Chrome 에서 잰 고장 방식 — 조회를 4s 붙잡고 1s 에
 * 목록으로 떠나면 4.1s 에 끝난다).
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import type { ReadOptions } from '../../src/api/client'
import type { ProjectView } from '../../src/api/types'
import { PROJECT_ID, PROJECT_NAME, openPage, pageDoc } from '../editor-harness'
import { fakeApi, renderWithProviders } from '../helpers'

const DOC = pageDoc({ id: 'n-root', type: 'Page', children: [] })
const PROJECT: ProjectView = { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin', description: null, role: 'owner', themeRev: 0 }

async function leaveEditor(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록으로 돌아가기' }))
  await screen.findByRole('link', { name: PROJECT_NAME })
}

describe('떠나면 조회를 요청째 끊는다', () => {
  /** 혼자 죽는 변조: 셸의 프로젝트 이펙트가 정리에서 `leave.abort()`를 안 부른다. */
  it('셸의 프로젝트 조회 — 에디터를 떠나면 끊긴다', async () => {
    const cancels: (AbortSignal | undefined)[] = []
    await openPage(DOC, {
      apiOverrides: {
        getProject: async (_projectId: string, options?: ReadOptions) => {
          cancels.push(options?.cancel)
          return PROJECT
        },
        listProjects: async () => [PROJECT],
      },
    })
    expect(cancels.length).toBeGreaterThan(0)
    expect(cancels.every((signal) => signal?.aborted === false)).toBe(true)
    await leaveEditor()
    expect(cancels.every((signal) => signal?.aborted === true)).toBe(true)
  })

  /** 혼자 죽는 변조: 트리의 마운트 이펙트가 정리에서 `leave.abort()`를 안 부른다. */
  it('트리 조회 — 에디터를 떠나면 끊긴다', async () => {
    const cancels: (AbortSignal | undefined)[] = []
    await openPage(DOC, {
      apiOverrides: {
        getTree: async (_projectId: string, options?: ReadOptions) => {
          cancels.push(options?.cancel)
          return []
        },
        listProjects: async () => [PROJECT],
      },
    })
    expect(cancels.length).toBeGreaterThan(0)
    await leaveEditor()
    expect(cancels.every((signal) => signal?.aborted === true)).toBe(true)
  })

  /** 혼자 죽는 변조: 세션의 `me` 이펙트가 `cancel`을 안 싣는다. */
  it('세션 확인 — 세션 문맥이 내려가면 끊긴다', async () => {
    const cancels: (AbortSignal | undefined)[] = []
    renderWithProviders(<App />, {
      client: fakeApi({
        me: (options?: ReadOptions) => {
          cancels.push(options?.cancel)
          return new Promise(() => {})
        },
      }),
    })
    expect(cancels).toHaveLength(1)
    expect(cancels[0]?.aborted).toBe(false)
    cleanup()
    expect(cancels[0]?.aborted).toBe(true)
  })
})
