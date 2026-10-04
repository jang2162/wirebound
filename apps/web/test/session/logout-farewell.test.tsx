/**
 * **로그아웃하며 남긴 한 줄**(`useSignOutNotice`) — 로그인 화면이 그리고, 다시 로그인하면 지운다. 에디터가 무엇을 남기는지(`logoutLossNotice`)
 * 와 한도 뒤에 실제로 서는지는 `apps/web/build-test/editor-logout-edits.test.ts`의 «답이 한도 안에 안 오면 …»이 실브라우저로 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { ApiError } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { logoutLossNotice } from '../../src/routes/editor'
import { canvasQuery, chooseFromShellMenu, openPage, pageDetail, pageDoc } from '../editor-harness'
import { tabHub, unauthenticatedError, type TabHub } from '../helpers'
import { treeTool, structureRowName } from '../panels/tree-row'

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
  fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
  fireEvent.click(treeTool(tree, '아래로'))
  await act(async () => {})
  expect(patchOps).toHaveBeenCalledTimes(1)
}

describe('로그아웃하며 두고 간 편집', () => {
  it('한도 뒤에 나가면 로그인 화면이 그 편집을 말하고, 다시 로그인하면 지운다', async () => {
    await editWaiting({ answer: new Promise<never>(() => {}) })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      chooseFromShellMenu('로그아웃')
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

    chooseFromShellMenu('로그아웃')
    await screen.findByLabelText('이메일')

    expect(statusText()).toBe('')
  })
})

const CONFLICT = (): ApiError => new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)', [], true)

/**
 * 셸을 열고 «아래로»를 낸다(REST). 편집의 답은 `refuse`를 부를 때 409 로 온다. 편집 실패 수습의 조회(두 번째 `getPage`)는 `recoverHangs`면 안 온다.
 * `posting`이면 먼저 코멘트를 게시해 둔다 — 답이 안 와 번호 쓰기가 떠 있다(전송 루프가 409 뒤 그 답을 기다린다).
 */
async function editRefusedLater(options: { recoverHangs: boolean; posting?: boolean }) {
  let refuse: () => void = () => {}
  const patchOps = vi.fn(
    (): Promise<PatchResult> =>
      new Promise<never>((_resolve, reject) => {
        refuse = () => reject(CONFLICT())
      }),
  )
  let loads = 0
  const doc = pair()
  await openPage(doc, {
    apiOverrides: {
      patchOps,
      logout: async () => {},
      listComments: async () => [],
      createComment: () => new Promise<never>(() => {}),
      getPage: async (_projectId, pageId) => {
        loads += 1
        if (loads >= 2 && options.recoverHangs) return new Promise<never>(() => {})
        return { ...pageDetail(pageId, doc), headSeq: loads >= 2 ? 8 : 7 }
      },
    },
  })
  if (options.posting === true) {
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    fireEvent.click(canvasQuery('[data-wb-id="n-b"]') as HTMLElement)
    fireEvent.change(await screen.findByLabelText('새 코멘트'), { target: { value: '새 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('tab', { name: '속성' }))
  }
  const tree = screen.getByRole('region', { name: '구조 트리' })
  fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
  fireEvent.click(treeTool(tree, '아래로'))
  await act(async () => {})
  expect(patchOps).toHaveBeenCalledTimes(1)
  return {
    refuse: async () => {
      refuse()
      await act(async () => {})
    },
    loads: () => loads,
  }
}

/** 가짜 시계로 로그아웃을 누르고 `beforeRefuse` ms 뒤 `then`을 부른 다음 한도(3s)까지 흘린다. 로그인 화면의 한 줄을 돌려준다. */
async function logoutThrough(then: () => Promise<void>, beforeRefuse: number): Promise<string> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    chooseFromShellMenu('로그아웃')
    await act(async () => {
      vi.advanceTimersByTime(beforeRefuse)
    })
    await then()
    await act(async () => {
      vi.advanceTimersByTime(3_000 - beforeRefuse)
    })
    await act(async () => {})
  } finally {
    vi.useRealTimers()
  }
  await screen.findByLabelText('이메일')
  return statusText()
}

/**
 * **로그아웃을 기다리는 동안 버린 편집도 센다**(`routes/editor.tsx`의 `settleEdits` · `EditorStore.discardTally`). 편집 실패 수습은 큐를 먼저 비우고
 * 판을 다시 읽은 **뒤에** 말한다 — 그 사이 셸이 내려가면 아무도 못 본다. 고치기 전에는 기다림 뒤의 큐만 세어 한 줄이 0 이었다(jsdom).
 */
describe('로그아웃을 기다리는 동안 버린 편집', () => {
  it('누른 뒤 거절돼 수습이 버린 편집을 말한다', async () => {
    const view = await editRefusedLater({ recoverHangs: false })

    const said = await logoutThrough(view.refuse, 500)

    // 판 카나리아 — 수습이 판을 다시 읽었다.
    expect(view.loads()).toBe(2)
    expect(said).toBe(logoutLossNotice(0, 0, 1))
  })

  it('누르기 전에 시작한 수습이 한도 안에 못 끝나면 그 수습이 버린 편집을 말한다', async () => {
    const view = await editRefusedLater({ recoverHangs: true })
    await view.refuse()
    expect(screen.queryAllByRole('alert').map((node) => node.textContent).join('')).toBe('')

    const said = await logoutThrough(async () => {}, 0)

    expect(said).toBe(logoutLossNotice(0, 0, 1))
  })

  it('수습이 끝나 화면이 말한 뒤에 누르면 다시 말하지 않는다', async () => {
    const view = await editRefusedLater({ recoverHangs: false })
    await view.refuse()
    expect(screen.getByRole('alert').textContent).toContain('편집 1개가 취소됐습니다')

    const said = await logoutThrough(async () => {}, 0)

    expect(said).toBe('')
  })

  /**
   * **큐에 남은 편집의 거절은 «저장되지 않았다»가 아니다**(`routes/editor.tsx`의 `settleEdits`). 전송 루프는 409 를 받고도 게시의 답을 기다리는
   * 동안 그 편집을 큐에 둔다 — 한도 뒤 답이 오면 리베이스가 옮겨 다시 내 커밋될 수 있다(Chrome `build-test/editor-post-between.test.ts`의
   * «로그아웃 한도 뒤 …»가 그 커밋까지 잰다). 한도에서는 «모름»이 참이다. 고치기 전에는 «거절된 편집 1개는 저장되지 않았습니다»였다.
   */
  it('번호 쓰기를 기다리는 동안 한도가 지나면 큐에 남은 거절된 편집을 «모름»으로 센다', async () => {
    const view = await editRefusedLater({ recoverHangs: false, posting: true })

    const said = await logoutThrough(view.refuse, 500)

    // 판 카나리아 — 수습으로 가지 않았다(게시의 답을 기다리는 중이었다).
    expect(view.loads()).toBe(1)
    expect(said).toBe(logoutLossNotice(1, 0))
  })

  /**
   * **큐에서 빠진 뒤에는 «거절»이다** — 게시의 답이 끝내 안 오면 번호 기다림 한도(`MARKER_FRAME_WAIT_MS`) 뒤 수습이 그 편집을 버린다(`failEdits`).
   * 그 버림이 로그아웃 한도 안에 오면 누계의 `refused` 로 센다.
   */
  it('번호 기다림 한도 뒤 수습이 로그아웃 한도 안에 버린 거절된 편집은 «저장되지 않았다»로 센다', async () => {
    const view = await editRefusedLater({ recoverHangs: false, posting: true })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await view.refuse()
      await act(async () => {
        vi.advanceTimersByTime(1_000)
      })
      // 판 카나리아 — 누를 때 아직 수습 전이다(번호를 기다린다).
      expect(view.loads()).toBe(1)
      chooseFromShellMenu('로그아웃')
      await act(async () => {
        vi.advanceTimersByTime(2_000)
      })
      await act(async () => {})
    } finally {
      vi.useRealTimers()
    }
    await screen.findByLabelText('이메일')

    // 판 카나리아 — 번호 기다림 한도 뒤 수습이 판을 다시 읽었다.
    expect(view.loads()).toBe(2)
    expect(statusText()).toBe(logoutLossNotice(0, 0, 1))
  })
})

/**
 * **기다리는 동안 다른 탭에서 사람이 바뀌면 로그아웃하지 않는다**(`session/session-menu.tsx` `useLogout`의 `run`) — 로그아웃 요청은 쿠키의 세션을 지운다. 기다림(한도
 * 3s) 사이에 다른 탭이 로그아웃하고 다른 사람으로 들어오면 쿠키는 그 사람의 것이라, 뒤따르는 로그아웃이 그 사람의 세션을 끊는다. 누를 때의
 * 세션 세대와 기다림 뒤의 세대가 같을 때만 낸다.
 */
describe('로그아웃을 기다리는 동안 다른 탭에서 사람이 바뀌면', () => {
  const BOB = { id: 'u-2', email: 'bob@example.com', name: '밥' }

  async function pressLogoutWhileWaiting(otherTab: (hub: TabHub) => Promise<void>) {
    const hub = tabHub()
    const logout = vi.fn(async () => {})
    await openPage(pair(), {
      tabChannel: hub.channel,
      apiOverrides: { patchOps: () => new Promise<never>(() => {}), logout, listProjects: async () => [] },
    })
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
    fireEvent.click(treeTool(tree, '아래로'))
    await act(async () => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      chooseFromShellMenu('로그아웃')
      await act(async () => {
        vi.advanceTimersByTime(1_000)
      })
      await otherTab(hub)
      await act(async () => {
        vi.advanceTimersByTime(2_000)
      })
      await act(async () => {})
    } finally {
      vi.useRealTimers()
    }
    await act(async () => {})
    return { logout, hub }
  }

  it('뒤따르는 로그아웃이 바뀐 사람의 세션을 끊지 않는다', async () => {
    const { logout, hub } = await pressLogoutWhileWaiting(async (other) => {
      await other.fromOtherTab({ kind: 'signed-out' })
      await other.fromOtherTab({ kind: 'signed-in', user: BOB })
    })

    expect(logout).not.toHaveBeenCalled()
    // 이 탭은 끝난 세션을 다시 알리지 않는다 — 알리면 밥의 탭이 제 세션을 끝낸 줄 안다.
    expect(hub.posted).toEqual([])
  })

  it('아무 일도 없었으면 한도 뒤에 그대로 로그아웃한다', async () => {
    const { logout, hub } = await pressLogoutWhileWaiting(async () => {})

    expect(logout).toHaveBeenCalledTimes(1)
    expect(hub.posted.map((news) => news.kind)).toEqual(['signed-out'])
  })
})

describe('logoutLossNotice', () => {
  it('두고 간 것이 없으면 말하지 않는다', () => {
    expect(logoutLossNotice(0, 0)).toBeNull()
  })

  it('거절된 편집은 안 보낸 편집과 함께 «저장되지 않았다»로 센다', () => {
    expect(logoutLossNotice(0, 0, 1)).toBe('로그아웃하며 거절된 편집 1개는 저장되지 않았습니다 — 다시 로그인해 그 페이지를 확인하세요.')
    expect(logoutLossNotice(1, 2, 1)).toBe(
      '로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 거절된 편집 1개와 보내지 않은 편집 2개는 저장되지 않았습니다. 다시 로그인해 그 페이지를 확인하세요.',
    )
  })

  it('보낸 편집은 «모름», 안 보낸 편집은 «저장되지 않았다»로 센다', () => {
    expect(logoutLossNotice(1, 0)).toBe('로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 다시 로그인해 그 페이지를 확인하세요.')
    expect(logoutLossNotice(1, 2)).toBe(
      '로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 보내지 않은 편집 2개는 저장되지 않았습니다. 다시 로그인해 그 페이지를 확인하세요.',
    )
    expect(logoutLossNotice(0, 2)).toBe('로그아웃하며 보내지 않은 편집 2개는 저장되지 않았습니다 — 다시 로그인해 그 페이지를 확인하세요.')
  })
})
