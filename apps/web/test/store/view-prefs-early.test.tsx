/**
 * **표시 옵션 — GET 의 답이 오기 전에 바꾼 판의 실패 되돌림**(`src/store/use-view-prefs.ts` 머리말의 표 «마지막으로 보낸 PUT 이 실패하면»).
 * 되돌릴 값은 «서버가 마지막으로 확인한 값» 이다 — 바꾼 뒤 온 GET 의 답도 그 값이고(화면에는 안 싣는다), GET 이 아직 안 왔으면 그 답을 기다려
 * 그 값으로 맞춘다. GET 보다 늦게 커밋된 PUT 이 있으면 그 PUT 의 값이 이긴다(리뷰 `docs/superpowers/plans/2026-11-25-rv-lc-report.md` L1).
 *
 * 가짜 서버 · 탐침은 `view-prefs.test.tsx` 의 것을 옮겼다(그 파일의 케이스와 한 `describe` 에 안 섞는다).
 */
import { act, render, screen } from '@testing-library/react'
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

afterEach(() => {
  latest = null
})

const FAILED = { kind: 'message', message: VIEW_PREFS_FAILED }

describe('표시 옵션 — GET 전에 바꾼 판의 실패 되돌림', () => {
  it('GET 의 답이 온 뒤 PUT 이 실패하면 그 답(서버 값)으로 되돌린다', async () => {
    const server = fakeServer(['subpage.gnb'])
    const store = mount(server.api)
    act(() => latest!.set(['subpage.lnb']))
    await act(async () => server.read.resolve(['subpage.gnb']))
    expect(shown(), '바꾼 뒤 온 GET 은 화면에 안 싣는다').toBe('subpage.lnb')
    await act(async () => server.fail(server.open()[0]!))
    expect({ screen: shown(), server: server.server.value.join(','), failure: store.getState().editFailure }).toEqual({
      screen: 'subpage.gnb',
      server: 'subpage.gnb',
      failure: FAILED,
    })
  })

  it('PUT 이 GET 의 답보다 먼저 실패하면 GET 의 답을 기다려 그 값으로 맞춘다', async () => {
    const server = fakeServer(['subpage.gnb'])
    const store = mount(server.api)
    act(() => latest!.set(['subpage.lnb']))
    await act(async () => server.fail(server.open()[0]!))
    expect(store.getState().editFailure, '실패는 곧바로 말한다').toEqual(FAILED)
    await act(async () => server.read.resolve(['subpage.gnb']))
    expect({ screen: shown(), server: server.server.value.join(',') }).toEqual({ screen: 'subpage.gnb', server: 'subpage.gnb' })
  })

  it('GET 보다 늦게 커밋된 PUT 이 있으면 늦게 온 GET 의 답이 아니라 그 PUT 의 값으로 되돌린다', async () => {
    const server = fakeServer(['subpage.gnb'])
    mount(server.api)
    act(() => latest!.set(['subpage.lnb']))
    await act(async () => server.commit(server.open()[0]!))
    // 서버가 PUT 앞에 읽은 판 — 답이 늦게 닿았다.
    await act(async () => server.read.resolve(['subpage.gnb']))
    act(() => latest!.set(['subpage.title']))
    await act(async () => server.fail(server.open()[0]!))
    expect({ screen: shown(), server: server.server.value.join(',') }).toEqual({ screen: 'subpage.lnb', server: 'subpage.lnb' })
  })
})
