/**
 * **편집 실패의 수습(다시 받기)이 도는 동안 페이지를 떠나면**(`src/edit/use-edit-commit.tsx`의 `recover`).
 *
 * 수습의 `getPage`를 끊지도 거르지도 않으면, 그것이 도는 동안 옆 페이지로 가도 끝까지 내려받고(1MB 일 수 있다),
 * **늦게 온 답이 `loadPage`로 스토어를 앞 페이지로 되돌린다** — 주소는 옆 페이지인데 스토어의 열린 페이지는 앞 페이지다.
 *
 * 셸 없이 훅과 스토어만 세운다 — «떠남»은 스토어가 다른 페이지를 싣는 것이다(`loadPage` — 셸의 페이지 조회가 하는 일).
 */
import { act, render } from '@testing-library/react'
import { type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient, type ReadOptions } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import type { PageDetail } from '../../src/api/types'
import { useEditCommit } from '../../src/edit/use-edit-commit'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'
import { PROJECT_ID, pageDetail, pageDoc } from '../editor-harness'

const PAGE_A = 'pg-a'
const PAGE_B = 'pg-b'
const TEXT_ID = 'n-text'

function textDoc(content: string): ReturnType<typeof pageDoc> {
  return pageDoc({ id: 'n-root', type: 'Page', children: [{ id: TEXT_ID, type: 'Text', props: { content } }] })
}

const commitRef: { current: ((nodeId: string, prop: string, value: unknown) => void) | null } = { current: null }

function Driver(): ReactElement | null {
  commitRef.current = useEditCommit({ projectId: PROJECT_ID, pageId: PAGE_A }).commitProp
  return null
}

function setup() {
  const store = new EditorStore()
  store.loadPage(PAGE_A, textDoc('가의 글'), 3)
  const recovery: { cancel: AbortSignal | undefined; resolve: (page: PageDetail) => void } = { cancel: undefined, resolve: () => {} }
  const client = {
    patchOps: async () => {
      throw new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다')
    },
    getPage: (_projectId: string, pageId: string, options?: ReadOptions) =>
      new Promise<PageDetail>((resolve) => {
        recovery.cancel = options?.cancel
        recovery.resolve = () => resolve(pageDetail(pageId, textDoc('서버가 든 가의 글')))
      }),
  } as unknown as ApiClient
  render(
    <ApiProvider client={client}>
      <EditorStoreProvider store={store}>
        <Driver />
      </EditorStoreProvider>
    </ApiProvider>,
  )
  return { store, recovery }
}

describe('편집 실패의 수습 — 도는 동안 페이지를 떠나면', () => {
  /** 혼자 죽는 변조: `recover`의 «떠났으면 싣지 않는다»(`stillOpen`) 거름을 뗀다. */
  it('늦게 온 수습의 답이 스토어를 앞 페이지로 되돌리지 않는다', async () => {
    const { store, recovery } = setup()
    await act(async () => commitRef.current?.(TEXT_ID, 'content', '고친 글'))
    // 409 → 수습이 가의 `getPage`를 낸다(붙잡힘). 그 사이 나로 옮긴다.
    await act(async () => {})
    store.loadPage(PAGE_B, textDoc('나의 글'), 7)
    await act(async () => recovery.resolve(pageDetail(PAGE_A, textDoc('서버가 든 가의 글'))))
    await act(async () => {})
    expect(store.getState().openPageId).toBe(PAGE_B)
    expect(store.getState().headSeq).toBe(7)
  })

  /** 혼자 죽는 변조: `recover`가 `getPage`에 `cancel`을 싣지 않는다 · 떠날 때 끊지 않는다(구독을 뗀다). */
  it('떠나면 수습의 조회를 요청째 끊는다', async () => {
    const { store, recovery } = setup()
    await act(async () => commitRef.current?.(TEXT_ID, 'content', '고친 글'))
    await act(async () => {})
    expect(recovery.cancel?.aborted).toBe(false)
    store.loadPage(PAGE_B, textDoc('나의 글'), 7)
    expect(recovery.cancel?.aborted).toBe(true)
  })
})
