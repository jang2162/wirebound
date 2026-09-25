/**
 * **로그아웃하며 남긴 한 줄**(`useSignOutNotice`) — 로그인 화면이 그리고, 다시 로그인하면 지운다. 에디터가 무엇을 남기는지(`logoutLossNotice`)
 * 와 한도 뒤에 실제로 서는지는 `apps/web/build-test/editor-logout-edits.test.ts`의 «답이 한도 안에 안 오면 …»이 실브라우저로 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import type { PatchResult } from '../../src/api/types'
import { logoutLossNotice } from '../../src/routes/editor'
import { openPage, pageDoc } from '../editor-harness'
import { unauthenticatedError } from '../helpers'

const pair = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
    ],
  })

function statusText(): string {
  return screen
    .queryAllByRole('status')
    .map((element) => element.textContent ?? '')
    .join(' | ')
}

/** 셸을 열고 구조 트리의 «아래로»를 낸다 — `answer`가 풀리기 전까지 답이 없다(REST). */
async function editWaiting(options: { answer: Promise<never> | 'now' }) {
  const patchOps = vi.fn(
    (): Promise<PatchResult> =>
      options.answer === 'now' ? Promise.resolve({ seq: 8, revisionId: 'rev-8', inverse: [], schemaVersion: 1 }) : options.answer,
  )
  const login = vi.fn(async () => ({ id: 'u1', email: 'a@example.com', name: '홍길동' }))
  // 다시 로그인한 뒤 목록 조회가 401 이다 — 세션이 끊겨 로그인 화면으로 돌아간다(로그아웃이 아니다 — 남길 줄을 새로 안 정한다).
  await openPage(pair(), { apiOverrides: { patchOps, logout: async () => {}, login, listProjects: async () => Promise.reject(unauthenticatedError()) } })
  const tree = screen.getByRole('region', { name: '구조 트리' })
  fireEvent.click(within(tree).getByRole('button', { name: 'Text' }))
  fireEvent.click(within(within(tree).getByRole('group', { name: '구조 편집' })).getByRole('button', { name: '아래로' }))
  await act(async () => {})
  expect(patchOps).toHaveBeenCalledTimes(1)
}

describe('로그아웃하며 두고 간 편집', () => {
  it('한도 뒤에 나가면 로그인 화면이 그 편집을 말하고, 다시 로그인하면 지운다', async () => {
    await editWaiting({ answer: new Promise<never>(() => {}) })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
      await act(async () => {
        vi.advanceTimersByTime(3_000)
      })
    } finally {
      vi.useRealTimers()
    }
    await screen.findByLabelText('이메일')
    expect(statusText()).toBe(logoutLossNotice(1, 0))

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(screen.queryByLabelText('이메일')).toBeNull())
    // 목록 조회의 401 로 세션이 끊겨 로그인 화면으로 돌아온다 — 앞 세션의 줄이 남아 있으면 그것이 다시 선다.
    await screen.findByLabelText('이메일')

    expect(statusText()).toBe('')
  })

  it('답을 받고 나가면 로그인 화면이 아무 말도 안 한다', async () => {
    await editWaiting({ answer: 'now' })

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await screen.findByLabelText('이메일')

    expect(statusText()).toBe('')
  })
})

describe('logoutLossNotice', () => {
  it('두고 간 것이 없으면 말하지 않는다', () => {
    expect(logoutLossNotice(0, 0)).toBeNull()
  })

  it('보낸 편집은 «모름», 안 보낸 편집은 «저장되지 않았다»로 센다', () => {
    expect(logoutLossNotice(1, 0)).toBe('로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 다시 로그인해 그 페이지를 확인하세요.')
    expect(logoutLossNotice(1, 2)).toBe(
      '로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 보내지 않은 편집 2개는 저장되지 않았습니다. 다시 로그인해 그 페이지를 확인하세요.',
    )
    expect(logoutLossNotice(0, 2)).toBe('로그아웃하며 보내지 않은 편집 2개는 저장되지 않았습니다 — 다시 로그인해 그 페이지를 확인하세요.')
  })
})
