/**
 * **화면 상태의 주소 `?state=<id>`**(설계서 「설계서 화면 구조」 «화면 상태») — 상태 화면을 링크로 나눈다.
 *
 * - **읽기:** 페이지를 열 때(셸의 `pageId` 가 바뀔 때) 한 번, 주소의 상태를 고른다(`useViewState` 의 `choose`). 두 모드 다 읽는다. 목록에
 *   없는 id 는 고른 값이 남아도 `state` 가 `null` — 기본으로 그린다(`shell/use-view-state.ts` 머리말).
 * - **쓰기:** 뷰 모드 · viewer 만(`writes` — 부르는 쪽이 정한다) — 고른 상태가 바뀌면 주소를 바꿔 쓴다(`replace` — 상태 전환은 이동이
 *   아니라 뒤로 가기가 그것을 하나씩 밟지 않는다). 기본이면 질의를 걷는다. 편집하는 사람의 편집 모드는 주소를 안 고친다 — 편집 화면의 주소는
 *   페이지를 가리키는 것이지 읽는 상태가 아니다. 편집 모드에서 고른 뒤 뷰 모드로 오면 그때 싣는다. viewer 는 편집 모드 단추를 눌러도
 *   편집할 수 없어 늘 읽는 화면이다 — 모드와 상관없이 쓴다.
 * - **문서가 실린 뒤에만 쓴다.** 실리기 전에는 목록이 비어 주소의 상태가 «없는 id» 로 읽혀, 쓰기가 연 주소의 질의를 걷어 버린다. 문서는
 *   읽기(페이지를 연 첫 커밋)보다 늦게 실려 쓰기는 늘 읽은 값 위에서 돈다.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useOpenDocument } from '../store/use-editor-store'
import { useViewState } from './use-view-state'

/** 주소의 질의 이름. */
export const STATE_QUERY = 'state'

export function useViewStateAddress(pageId: string | undefined, writes: boolean): void {
  const [params, setParams] = useSearchParams()
  const { state, choose } = useViewState(pageId)
  const loaded = useOpenDocument(pageId) !== null
  /** 주소를 읽은 페이지 — 그 페이지에서는 다시 안 읽는다(고른 뒤의 주소가 고른 값을 되돌리지 않게). */
  const [readFor, setReadFor] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (pageId === undefined || readFor === pageId) return
    const wanted = params.get(STATE_QUERY)
    if (wanted !== null && wanted !== '') choose(wanted)
    setReadFor(pageId)
  }, [pageId, readFor, params, choose])

  useEffect(() => {
    if (!writes || pageId === undefined || !loaded) return
    if ((params.get(STATE_QUERY) ?? null) === state) return
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (state === null) next.delete(STATE_QUERY)
        else next.set(STATE_QUERY, state)
        return next
      },
      { replace: true },
    )
  }, [writes, pageId, loaded, state, params, setParams])
}
