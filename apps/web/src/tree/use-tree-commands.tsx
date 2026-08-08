/**
 * 메뉴 트리의 조회·선택·조작을 한 곳에 모은 훅(P2b-4 D10). **화면이 부르는 유일한 관문이다.**
 *
 * 조회가 컴포넌트 안에 있으면 툴바가 그것을 부를 길이 없다 — 조작이 끝나면 트리를 다시
 * 받아야 하는데(D1), 재조회 함수가 `MenuTree`의 `useEffect` 안에 갇혀 있기 때문이다.
 * `useStructureCommands` / `StructureToolbar`의 분리와 같은 모양이다.
 *
 * **낙관 적용을 하지 않는다(D1).** 요청 하나가 성공하면 트리를 통째로 다시 받는다. 근거는
 * 계획서에 셋이 있는데 그중 둘이 이 파일의 형태를 정한다 — 서버가 `sortOrder`를 재번호하고,
 * 생성 응답(`MenuNode`)에는 `pages`·`children`이 없어 트리에 그대로 꽂을 수 없다.
 *
 * **큐가 아니라 잠금이다(D2).** 조작이 나가 있는 동안 `busy`가 `true`이고 툴바 전체가
 * 비활성이다. 구조 편집의 직렬화(`store/edit-queue.ts`)와 다른 장치인 이유는 여기 요청끼리
 * 의존이 없기 때문이다 — 막아야 하는 것은 같은 버튼 연타와 "재조회 중에 또 조작"뿐이다.
 *
 * **잠금을 `useState`에 두는 것이 안전한 것은 이 훅의 인스턴스가 하나이기 때문이다.**
 * P2b-2에서 `useEditCommit`의 펌프 가드를 훅의 `ref`에 두었다가 인스턴스가 둘이 되자
 * `maxInFlight`가 2가 된 사고가 있었다. **세어 봤다: 이 훅을 부르는 자리는
 * `panels/menu-tree.tsx` 한 곳이고, 툴바는 그 결과를 prop으로 받는다.** 두 번째 호출자가
 * 생기면 잠금이 각자 것이 되므로, 그때는 잠금을 위로 올려야 한다.
 */
import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import type { TreeMenuNode } from '../api/types'
import { treeAbilities, type TreeAbilities, type TreeSelection } from './tree-actions'

/** 서버가 이유를 주지 않은 조회 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '메뉴를 불러오지 못했습니다'

/**
 * 조회 상태. 성공과 실패를 판별 유니온으로 가른다 — `menu.length === 0`으로 판정하면
 * 응답이 오기 전과 "메뉴가 없는 프로젝트"와 실패가 전부 같은 값이 된다.
 */
export type TreeLoadState =
  | { status: 'loading' }
  | { status: 'ready'; menu: TreeMenuNode[] }
  | { status: 'failed'; failure: Failure }

export interface TreeCommands {
  state: TreeLoadState
  selection: TreeSelection | null
  /** 메뉴를 고른다. `null`이면 "열린 페이지가 선택된 것"으로 되돌아간다(D3). */
  select: (selection: TreeSelection | null) => void
  abilities: TreeAbilities
  /** 조작이 하나 나가 있는 동안 `true`. 툴바 전체가 비활성이다(D2). */
  busy: boolean
  /** 마지막 조작의 실패. 다음 조작이 시작되면 `null`이 된다. */
  failure: Failure | null
}

export function useTreeCommands(props: {
  projectId: string
  pageId: string | undefined
}): TreeCommands {
  const api = useApi()
  const { projectId, pageId } = props

  const [state, setState] = useState<TreeLoadState>({ status: 'loading' })
  const [picked, setPicked] = useState<TreeSelection | null>(null)
  const [busy] = useState(false)
  const [failure] = useState<Failure | null>(null)

  /**
   * **선택은 파생값이다(D3).** `picked`가 `null`이면 주소가 말하는 페이지가 선택이다.
   *
   * 이펙트로 동기화하지 않는다. 그렇게 하면 주소가 바뀔 때마다 렌더가 한 번 더 돌고,
   * 그 사이에 "주소는 새 페이지인데 선택은 아직 옛 것"인 렌더가 낀다.
   *
   * **다만 그 창을 이 저장소의 테스트로는 재지 못했다.** 이 자리를
   * `useState` + `useEffect` 동기화로 바꿔 재니 **`--project web` 전량이 0 사망**이었다.
   * RTL의 `fireEvent`가 `act` 안에서 돌아 이펙트를 **동기적으로 flush**하므로, 클릭
   * 다음 줄에서 읽는 시점에는 이미 이펙트가 지나간 뒤다 — 계획서가 말한 "한 프레임"은
   * 실제 브라우저의 페인트 사이 창이고 jsdom에는 그 사이가 없다.
   *
   * 그래서 파생을 고르는 근거는 **잰 것이 아니라 형태다**: 상태가 하나 줄고, 주소와
   * 선택이 어긋날 수 있는 중간 상태 자체가 없다. 창의 크기는 재지 못했다.
   */
  const selection: TreeSelection | null =
    picked ?? (pageId !== undefined ? { kind: 'page', id: pageId } : null)

  const menu = state.status === 'ready' ? state.menu : null
  const abilities = treeAbilities(menu, selection)

  /**
   * 트리를 받는다. `reload`가 `true`면 `loading`으로 되돌리지 않는다 — 조작 뒤의 재조회에서
   * 트리가 잠깐 사라지면 사용자가 방금 만든 것을 확인할 자리가 흔들린다.
   *
   * **`alive` 플래그는 프로젝트가 바뀔 때를 위한 것이다**(`routes/require-auth.tsx`와 같은
   * 이유) — 응답이 오기 전에 화면이 바뀌면 결과를 버린다.
   *
   * **`.then(ok, err)`이 아니라 try/catch인 것은 호출 자체가 그 자리에서 던질 수도 있기
   * 때문이다.** 그 예외는 이펙트 밖으로 새어 나가 앱 트리를 통째로 죽인다.
   */
  const load = useCallback(
    async (alive: () => boolean, reload: boolean): Promise<void> => {
      if (!reload) setState({ status: 'loading' })
      try {
        const next = await api.getTree(projectId)
        if (alive()) setState({ status: 'ready', menu: next })
      } catch (caught) {
        if (!alive()) return
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다(D5). 여기서 다시 판정하지 않는다.
        setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) })
      }
    },
    [api, projectId],
  )

  useEffect(() => {
    let alive = true
    void load(() => alive, false)
    return () => {
      alive = false
    }
  }, [load])

  /**
   * 선택을 바꾼다. 메뉴를 누르면 그 메뉴가, 페이지를 누르면 `null`이 들어온다(D3) —
   * 후자는 "주소가 말하는 것으로 되돌아간다"는 뜻이다.
   */
  function select(next: TreeSelection | null): void {
    setPicked(next)
  }

  return {
    state,
    selection,
    select,
    abilities,
    busy,
    failure,
  }
}
