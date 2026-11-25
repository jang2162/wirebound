/**
 * **표시 옵션의 읽기 · 낙관 반영 · 마지막 값만 보냄 · 실패 되돌림**(`src/store/use-view-prefs.ts` 머리말의 표).
 *
 * 가짜 서버는 PUT 하나마다 답을 붙잡아 두고, 케이스가 놓는 차례로 **그 차례에 커밋한다**(서버 값이 그 PUT 의 본문이 된다) — 같은 사람의 겹친 PUT 이
 * 커밋 차례로 서는 서버(리뷰 `docs/superpowers/plans/2026-11-25-rv-vp-report.md` L1)를 흉내 낸다. 겹친 PUT 이 있으면 늦게 낸 것부터 놓는다 — 겹쳐
 * 보내는 판은 서버 끝 값이 앞 값으로 남는다.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiProvider } from '../../src/api/context'
import { ApiError } from '../../src/api/client'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'
import { useViewPrefs, VIEW_PREFS_FAILED, ViewPrefsProvider, type ViewPrefs } from '../../src/store/use-view-prefs'
import { fakeApi } from '../helpers'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 가짜 서버 — PUT 마다 답을 붙잡는다. `commit` 이 놓으면 그 본문이 서버 값이 된다. */
function fakeServer(initial: string[] = []) {
  const server = { value: initial }
  const puts: { body: string[]; answer: Deferred<string[]>; settled: boolean }[] = []
  let maxOpen = 0
  const read = deferred<string[]>()
  const api = fakeApi({
    getViewPrefs: () => read.promise,
    putViewPrefs: (_projectId, hiddenRegions) => {
      const answer = deferred<string[]>()
      puts.push({ body: [...hiddenRegions], answer, settled: false })
      maxOpen = Math.max(maxOpen, puts.filter((put) => !put.settled).length)
      return answer.promise
    },
  })
  return {
    api,
    server,
    puts,
    read,
    maxOpen: () => maxOpen,
    open: () => puts.filter((put) => !put.settled),
    /** 열린 PUT 하나를 커밋한다(서버 값 = 그 본문). */
    commit(put: (typeof puts)[number]) {
      put.settled = true
      server.value = put.body
      put.answer.resolve(put.body)
    },
    fail(put: (typeof puts)[number]) {
      put.settled = true
      put.answer.reject(new ApiError(500, 'internal', '서버 오류'))
    },
  }
}

let latest: ViewPrefs | null = null

function Probe(): null {
  const prefs = useViewPrefs()
  useEffect(() => {
    latest = prefs
  })
  return null
}

function Shown(): React.ReactElement {
  return <output data-testid="hidden">{useViewPrefs().hidden.join(',')}</output>
}

function mount(api: ReturnType<typeof fakeApi>): EditorStore {
  const store = new EditorStore()
  render(
    <ApiProvider client={api}>
      <EditorStoreProvider store={store}>
        <ViewPrefsProvider projectId="p-1">
          <Probe />
          <Shown />
        </ViewPrefsProvider>
      </EditorStoreProvider>
    </ApiProvider>,
  )
  return store
}

const shown = () => screen.getByTestId('hidden').textContent

/** 열린 PUT 이 없을 때까지 — 겹친 것이 있으면 **늦게 낸 것부터** 커밋한다(머리말). */
async function drain(server: ReturnType<typeof fakeServer>): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    const open = server.open()
    if (open.length === 0) return
    await act(async () => {
      for (const put of [...open].reverse()) server.commit(put)
    })
  }
  throw new Error('PUT 이 끝나지 않는다')
}

afterEach(() => {
  latest = null
})

describe('표시 옵션(use-view-prefs)', () => {
  it('읽기 전에는 다 켬 · GET 의 답이 오면 그 값', async () => {
    const server = fakeServer()
    mount(server.api)
    expect(shown()).toBe('')
    await act(async () => server.read.resolve(['subpage.gnb']))
    expect(shown()).toBe('subpage.gnb')
  })

  it('빠르게 세 번 바꾸면 화면은 곧바로 따르고, PUT 은 겹치지 않으며 서버 끝 값 = 화면 값이다', async () => {
    const server = fakeServer()
    mount(server.api)
    await act(async () => server.read.resolve([]))
    act(() => latest!.set(['subpage.gnb']))
    act(() => latest!.set([]))
    act(() => latest!.set(['subpage.lnb']))
    expect(shown(), '낙관 반영').toBe('subpage.lnb')
    await drain(server)
    expect({
      server: server.server.value,
      screen: shown(),
      maxOpen: server.maxOpen(),
      sent: server.puts.map((put) => put.body.join(',')),
    }).toEqual({
      server: ['subpage.lnb'],
      screen: 'subpage.lnb',
      maxOpen: 1,
      // 첫 값은 곧바로 나가고, 그 답을 기다리는 동안의 두 값은 마지막 것 하나로 접힌다.
      sent: ['subpage.gnb', 'subpage.lnb'],
    })
  })

  it('마지막 PUT 이 실패하면 서버가 받아 준 값으로 되돌리고 하단 바에 한 줄', async () => {
    const server = fakeServer()
    const store = mount(server.api)
    await act(async () => server.read.resolve(['subpage.gnb']))
    act(() => latest!.set([]))
    expect(shown()).toBe('')
    await act(async () => server.fail(server.open()[0]!))
    expect(shown()).toBe('subpage.gnb')
    expect(store.getState().editFailure).toEqual({ kind: 'message', message: VIEW_PREFS_FAILED })
  })

  it('앞 PUT 이 실패해도 그 사이 바꾼 값이 있으면 그것을 보내고, 되돌리지 않는다', async () => {
    const server = fakeServer()
    const store = mount(server.api)
    await act(async () => server.read.resolve([]))
    act(() => latest!.set(['subpage.gnb']))
    act(() => latest!.set(['subpage.title']))
    await act(async () => server.fail(server.open()[0]!))
    await waitFor(() => expect(server.open()).toHaveLength(1))
    await drain(server)
    expect({ server: server.server.value, screen: shown(), failure: store.getState().editFailure }).toEqual({
      server: ['subpage.title'],
      screen: 'subpage.title',
      failure: null,
    })
  })

  it('바꾼 뒤 온 GET 의 답은 버린다 — 사람이 고른 값이 이긴다', async () => {
    const server = fakeServer()
    mount(server.api)
    act(() => latest!.set(['subpage.title']))
    await act(async () => server.read.resolve(['subpage.gnb']))
    expect(shown()).toBe('subpage.title')
    await drain(server)
    expect(server.server.value).toEqual(['subpage.title'])
  })
})
