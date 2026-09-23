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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import { judgeMeta, metaConflict } from '../api/page-meta'
import type { PageImported, TreeMenuNode } from '../api/types'
import {
  flattenMenus,
  menuOutdentTarget,
  previousMenuSibling,
  treeAbilities,
  treeSpot,
  type TreeAbilities,
  type TreeSelection,
} from './tree-actions'

/** 서버가 이유를 주지 않은 조회 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '메뉴를 불러오지 못했습니다'

/**
 * 서버가 이유를 주지 않은 **조작** 실패에 쓸 문장. 조회와 갈라 적는 것은 사용자가 방금 한
 * 일이 다르기 때문이다 — 조회는 화면이 스스로 한 것이고 조작은 사용자가 누른 것이다.
 */
const UNKNOWN_COMMAND_FAILURE = '요청을 처리하지 못했습니다'

/** 인라인 입력이 무엇을 위해 열려 있는지. 닫혀 있으면 `null`. */
export interface TreeEditing {
  /**
   * **`new-root-menu`만 선택을 보지 않는다.** 나머지 셋은 고른 것에 붙는 조작이라 선택이
   * 없으면 성립하지 않는데(D5), 최상위 메뉴가 붙는 곳은 트리 자체다 — **빈 트리에는 고를
   * 것이 없고, 그것이 이 갈래가 있는 이유다**(`panels/menu-tree.tsx`의 빈 상태).
   */
  kind: 'new-menu' | 'new-root-menu' | 'new-page' | 'rename'
  /** 입력의 초기값. 이름 변경이면 지금 제목, 새로 만들기면 빈 문자열이다. */
  initial: string
}

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
  editing: TreeEditing | null
  openInput: (kind: TreeEditing['kind']) => void
  /** Enter로 확정. 빈 문자열이면 아무것도 하지 않는다(D6). */
  submitInput: (title: string) => void
  cancelInput: () => void
  /** 삭제 확인이 걸려 있으면 `true`(D7). */
  confirmingRemove: boolean
  askRemove: () => void
  confirmRemove: () => void
  cancelRemove: () => void
  /** 형제 사이에서 한 칸 옮긴다. `-1`이면 위로, `+1`이면 아래로. */
  move: (delta: -1 | 1) => void
  /** 한 단계 안으로 — 앞 형제 메뉴의 마지막 자식이 된다. */
  indent: () => void
  /** 한 단계 밖으로 — 부모의 다음 형제가 된다. */
  outdent: () => void
  /**
   * **파일 한 벌로 페이지를 만든다**(§11.2 — P7-3 T5). 고른 **메뉴** 밑에 붙는다.
   *
   * **`submitInput('new-page')`와 같은 잠금·재조회·이동을 지난다** — 가져오기도 트리를
   * 바꾸는 조작이고, 여기에 자기 잠금을 따로 두면 트리 조작 하나가 나가 있는 동안 가져오기가
   * 겹쳐 나간다(D2가 막는 그것).
   */
  importJson: (file: unknown, title?: string) => void
  /**
   * 마지막 가져오기의 결과. **`failure`와 다른 축이다** — 성공했는데도 **말해야 하는
   * 것**(고아가 된 코멘트 수 · 쓰지 않은 `layoutRef`)이 있기 때문이다. 다음 조작이
   * 시작되면 `null`이 된다.
   */
  imported: PageImported | null
  /**
   * **페이지 제목의 충돌**(이월 P — `api/page-meta.ts`). 이름 변경이 409 · `page-meta-changed`를 받았고 서버 값이
   * 내 제목도 아니면 선다 — 그 사람의 제목(`theirs`)과 내가 친 제목(`mine`)을 든다. 다음 조작 · 다른 선택에 풀린다.
   */
  conflict: TitleConflict | null
  /** «내 글로 덮기» — 그 사람의 제목을 새 바탕으로 내 제목을 다시 보낸다. */
  overwriteTitle: () => void
  /** «내 글 버리기» — 그 사람의 제목을 받는다(트리는 충돌 때 이미 다시 받았다). */
  discardTitle: () => void
  /** 소속 메뉴 목록이 열려 있으면 고를 수 있는 것들. 닫혀 있으면 `null`. */
  reparenting: { id: string; path: string }[] | null
  openReparent: () => void
  reparentTo: (menuId: string) => void
  cancelReparent: () => void
}

/** 이름 변경이 만난 제목 충돌 — `TreeCommands.conflict`. */
export interface TitleConflict {
  pageId: string
  /** 내가 친 제목. */
  mine: string
  /** 서버가 견준 그 사람의 제목 — «내 글로 덮기»의 새 바탕이다. */
  theirs: string
}

export function useTreeCommands(props: {
  projectId: string
  pageId: string | undefined
  /** 오를 때마다 트리를 다시 받는다. 지금 올리는 것은 스냅샷 복원 하나다(아래 이펙트). */
  reloadToken: number
  /** 페이지의 제목을 고칠 수 있는가(`projectAbilities(role).editPageMeta` — 이월 M). 안 주면 열린다. */
  canEditPageMeta?: boolean
}): TreeCommands {
  const api = useApi()
  // **이 단계가 앱의 첫 `useNavigate`다**(D8). 지금 앱의 이동은 전부 렌더 시점 판정이고
  // (`<Navigate>` 컴포넌트 — `api/failure.tsx`의 *"컴포넌트인 것이 요점이다"*), 그 관용구는
  // "이 상태면 저기로 간다"를 말한다. 여기 이동은 **비동기 조작이 끝난 뒤의 명령형 이동**이라
  // 그렇게 표현되지 않는다: 만들기가 성공한 그 순간에만 한 번 일어나고, 렌더가 다시 돌 때
  // 같은 판정을 되풀이하면 안 된다.
  const navigate = useNavigate()
  const { projectId, pageId, reloadToken } = props

  const [state, setState] = useState<TreeLoadState>({ status: 'loading' })
  const [picked, setPicked] = useState<TreeSelection | null>(null)
  /**
   * **잠금(`inFlight`)과 표시(`busy`)를 갈라 둔다.**
   *
   * - `inFlight`는 **제어 플래그**다. 조작이 나가 있는 동안 두 번째 요청을 막는다.
   * - `busy`는 **관측 상태**다. 버튼을 비활성으로 그리려면 렌더가 그것을 봐야 한다.
   *
   * **잠금이 `ref`여야 하는 이유는 잰 것이다.** 앞 판은 `useState`의 `busy` 하나로 둘을 다
   * 했는데, `run`이 매 렌더 새로 만들어지고 `busy`를 **그 렌더의 값으로 닫으므로** 같은
   * 클로저에서 오는 두 번째 호출은 여전히 `false`를 본다(`setBusy(true)`는 다음 렌더에야
   * 보인다). 실측: 한 렌더의 `commands`를 붙잡고 같은 tick에 `submitInput`을 두 번 부르면
   * `createMenu`가 **2회** 나갔다. 렌더를 사이에 두면 1회다 — 즉 그 가드가 막던 것은
   * 버튼의 `disabled`가 이미 막는 부류뿐이었다.
   *
   * **`editor-store.ts`의 `#pumping`과 같은 부류이되 원인이 다르다.** 그쪽이 스토어로 간
   * 것은 `useEditCommit`을 부르는 자리가 **여럿**(지금 셋)이라 훅의 `ref`로도 부족했기
   * 때문이고(`maxInFlight`가 2가 됐다), 여기는 훅 인스턴스가 하나이므로 훅의 `ref`로 닫힌다.
   * 공통점은 "상태로는 동기 재진입을 막지 못한다"이다.
   */
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [conflict, setConflict] = useState<TitleConflict | null>(null)
  const [editing, setEditing] = useState<TreeEditing | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [pickingMenu, setPickingMenu] = useState(false)
  /**
   * 마지막 가져오기의 결과(P7-3). **`failure`와 다른 축이라 상태가 따로다** — 성공했는데도
   * 말해야 하는 것이 있고(고아가 된 코멘트 · 쓰지 않은 `layoutRef`), 그것을 `failure`에
   * 실으면 성공이 실패처럼 보인다.
   */
  const [imported, setImported] = useState<PageImported | null>(null)

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
  const abilities = treeAbilities(menu, selection, props.canEditPageMeta ?? true)

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
   * **바깥이 신호를 올리면 다시 받는다.** 오늘 올리는 것은 **스냅샷 복원**이다(셸의
   * `restoredToken`) — 복원은 페이지를 지우고 만들므로 이 목록 자체가 바뀐다.
   *
   * **`reload: true`다.** 위 이펙트와 갈리는 자리가 그것이고, 조작 뒤 재조회와 같은
   * 이유다 — 트리가 잠깐 사라지면 사용자가 방금 되돌린 결과를 확인할 자리가 흔들린다.
   *
   * **의존의 `load`가 바뀔 때는 돌지 않아야 한다.** `load`는 `projectId`가 바뀌면 새로
   * 만들어지는데, 그때는 위 이펙트가 이미 새 프로젝트의 트리를 받는다. 마지막으로 처리한
   * 신호를 ref로 들어 같은 신호에 두 번 돌지 않게 한다 — 셸의 재조회 이펙트가 같은 자리에서
   * 같은 장치를 쓰고, 근거도 같다(`routes/editor.tsx`).
   */
  const handledReload = useRef(0)
  useEffect(() => {
    if (reloadToken === 0 || handledReload.current === reloadToken) return
    handledReload.current = reloadToken

    let alive = true
    void load(() => alive, true)
    return () => {
      alive = false
    }
  }, [load, reloadToken])

  /**
   * 화면이 사라진 뒤의 `setState`를 막는다. **이펙트의 `alive` 플래그로는 안 되는 자리다** —
   * 조작은 버튼 클릭에서 시작해 `await` 뒤에 상태를 쓰므로, 그 사이에 화면이 사라졌는지를
   * 알 방법이 그 클로저에 없다.
   */
  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])

  /**
   * 조작 하나를 보내고 **성공하면 트리를 다시 받는다(D1). 재조회가 곧 수렴이다.**
   *
   * `after`는 재조회 **뒤에** 부른다 — 주소를 옮기는 것(D8)이 그 자리다. 실패하면 부르지
   * 않는다: 만들지 못한 페이지로 가면 안 된다.
   *
   * **실패해도 트리를 다시 받지 않는다.** 근거는 앞 문장 하나다 — 서버가 거절했다는 것은
   * 트리가 그대로라는 뜻이라 받아 봐야 같은 것이 온다.
   *
   * **앞 판은 여기에 "재조회하면 실패 문장이 조회 상태에 덮인다"를 덧붙였는데 조건이
   * 빠져 있었다.** 실패 뒤에도 재조회하도록 바꿔 재니 **재조회가 성공하면 실패 문장이 그대로
   * 보이고**(`getTree` 2회, 트리도 그려진다) **재조회까지 실패했을 때만** 덮인다.
   * `failure`와 `state`가 서로 다른 상태이고 `menu-tree.tsx`가 둘을 독립적으로 그리기
   * 때문이다 — `state`가 `failed`가 될 때만 조기 반환이 걸려 조작 실패 문장이 함께 사라진다.
   *
   * **재진입을 막는 것은 `inFlight`(ref)이지 `busy`(state)가 아니다** — 위 선언의 실측을
   * 보라.
   *
   * **웨이브 2에서 "화면 버튼으로는 이 경로를 만들 수 없다"고 적었고, 그 예측대로 Task 10의
   * 단축키가 그 방벽을 벗겼다 — 이제 잰 것이다.** 이 가드를 지우면 **2 사망**이다:
   * `조작 잠금 > 같은 tick에 두 번 확정해도 요청은 한 번이다`(훅을 직접 태우는 케이스)와
   * `메뉴 트리 단축키 > busy인 동안 단축키가 걸리지 않는다`(화면을 지나는 케이스). 단축키는
   * 버튼의 `disabled`를 지나지 않으므로 `busy`가 서 있어도 핸들러에 닿는다.
   */
  async function run(send: () => Promise<void>, after?: () => void): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    // **다음 조작이 시작되면 앞 충돌이 풀린다** — 실패 문장과 같은 자리다. «내 글로 덮기»도 여기를 지나고, 또
    // 부딪히면 `renamePage`가 새 값으로 다시 세운다.
    setConflict(null)
    try {
      await send()
      if (unmounted.current) return
      await load(() => !unmounted.current, true)
      if (unmounted.current) return
      after?.()
    } catch (caught) {
      if (unmounted.current) return
      setFailure(toFailure(caught, UNKNOWN_COMMAND_FAILURE))
    } finally {
      // **잠금은 언마운트 여부와 무관하게 푼다.** `ref`는 렌더와 상관없는 값이라 여기서
      // 놓치면 그 인스턴스가 영구히 잠긴다. 표시(`setBusy`)만 마운트 여부를 본다.
      //
      // **이 줄은 케이스가 지킨다 — 지우면 잠금이 영구히 걸려 `조작 잠금` 묶음과 "여는"
      // 가드를 재는 케이스들이 함께 죽는다.** 앞 판은 "1 사망"이라 적었는데 그 수는 그때의
      // 케이스 수였고 지금은 더 크다 — **수를 적으면 그 수가 틀린다**(웨이브 1의 F8과 같은
      // 부류라 갈래만 적는다). 잠금이지 영구 차단이 아니라는 것이 그 케이스들의 하중이다.
      inFlight.current = false
      if (!unmounted.current) setBusy(false)
    }
  }

  /**
   * 선택을 바꾼다. 메뉴를 누르면 그 메뉴가, 페이지를 누르면 `null`이 들어온다(D3) —
   * 후자는 "주소가 말하는 것으로 되돌아간다"는 뜻이다.
   *
   * **열려 있던 입력을 함께 닫는다.** 다른 것을 고른 뒤에도 입력이 남아 있으면 그 입력이
   * 어느 항목에 붙는지가 화면에서 사라진다.
   */
  function select(next: TreeSelection | null): void {
    setPicked(next)
    setEditing(null)
    // 충돌 통지의 «이 제목»이 가리키는 것이 선택이다 — 다른 것을 고르면 무엇의 충돌인지가 화면에서 사라진다.
    setConflict(null)
    setPickingMenu(false)
    // **삭제 확인이 함께 풀린다**(D7의 취소 조건 셋 중 하나) — 다른 항목에 대고 두 번째
    // 클릭이 되면 사용자가 확인한 것과 지워지는 것이 달라진다.
    setConfirmingRemove(false)
  }

  /**
   * 인라인 입력을 연다. 실패 문장을 함께 지운다 — 새 조작을 시작했다는 뜻이다.
   *
   * **이름 변경만 초기값을 채운다.** 바꾸려는 것을 지우고 다시 치게 하면 안 된다.
   */
  function openInput(kind: TreeEditing['kind']): void {
    // **조작이 나가 있으면 열지 않는다(D2의 잠금).** 화면에서는 툴바가 비활성이라 이 경로가
    // 없지만 훅 API로는 열리는데, 그때 친 제목은 **요청도 못 나가고 조용히 사라진다** —
    // `submitInput`이 `run`에 닿아도 `inFlight`가 서 있어 되돌아오기 때문이다(실측).
    // 입력을 비활성으로 그리는 것으로는 그것을 막지 못해 여기서 막는다.
    //
    // **다음 웨이브의 키보드 단축키가 버튼을 지나지 않으므로 이 자리가 그 방벽이다**(계획서
    // Task 10 케이스 6).
    if (inFlight.current) return
    setFailure(null)
    setConflict(null)
    // **다른 조작을 시작하면 확인이 풀린다**(D7의 셋째 조건).
    setConfirmingRemove(false)
    setPickingMenu(false)
    setEditing({ kind, initial: kind === 'rename' ? currentTitle() : '' })
  }

  /** 선택 대상의 지금 제목. 못 찾으면 빈 문자열 — 그러면 입력이 비어 열린다. */
  function currentTitle(): string {
    if (menu === null || selection === null) return ''
    if (selection.kind === 'menu') return findMenuTitle(menu, selection.id) ?? ''
    return findPageTitle(menu, selection.id) ?? ''
  }

  /**
   * **페이지 제목을 바탕과 함께 보낸다**(이월 P — `api/page-meta.ts`). 바탕은 입력이 열릴 때의 제목이다
   * (`editing.initial` — 트리가 마지막으로 받은 값). 서버가 409 · `page-meta-changed`면:
   *
   * - 그 사람의 제목이 **내 제목과 같으면**(`judgeMeta`의 `'mine'`) 원하던 상태다 — 성공처럼 끝낸다(트리를 다시 받는다).
   * - 아니면 **충돌**을 세운다(`conflict`) — 던지지 않으므로 `run`이 트리를 다시 받아 그 사람의 제목이 보인다.
   *
   * 그 밖의 실패는 던진다 — `run`이 실패 문장으로 옮긴다. **이 자리에는 시간 제한이 없다** — 트리 조작은 쓰기
   * 장부를 안 지나므로 «모름»이 없다(설명과 갈리는 자리 — 보고의 «남는 틈»).
   */
  async function renamePage(id: string, title: string, base: string): Promise<void> {
    try {
      await api.updatePage(projectId, id, { title, base: { title: base } })
    } catch (caught) {
      const clash = metaConflict(caught, 'title')
      if (clash === null) throw caught
      // 제목은 `null`이 아니다(서버의 `Title`) — 계약 밖 `null`이 오면 빈 제목으로 보인다.
      const theirs = clash.current ?? ''
      if (judgeMeta(theirs, title, base) === 'mine') return
      if (!unmounted.current) setConflict({ pageId: id, mine: title, theirs })
    }
  }

  /**
   * 입력을 확정한다. **빈 문자열이면 아무것도 하지 않고 입력을 열어 둔다**(D6) — 서버의
   * `Title`이 `z.string().min(1)`이라 400이 되는데 그 왕복을 만들지 않는다. 닫지 않는 것은
   * 닫으면 사용자가 무엇이 잘못됐는지 모른 채 입력을 잃기 때문이다.
   *
   * **제목 중복을 검사하지 않는다.** 서버에 유일성 제약이 없다 — 같은 제목의 메뉴를 형제로도
   * 자식으로도 만들 수 있다(웨이브 1 실측, `tree/tree-actions.ts`의 `flattenMenus` 주석).
   *
   * **값이 바뀌었는지도 비교하지 않는다(계획서 Task 5 케이스 5).** 서버가 제목을 정규화하는지
   * 재고 그 결과를 여기 적는다 — **정규화하지 않는다.** api 하네스 실측(임시 파일을 두고
   * 지웠다): `' 회원관리'`·`'회원관리 '`·`'  회원  관리  '`·`'\t회원관리\n'`을 `PATCH`로
   * 보내면 넷 다 200이고 **받은 값이 보낸 값과 글자까지 같다**(페이지도 같다). 그러므로
   * `' 회원관리'`와 `'회원관리'`는 서버에서 다른 값이고, 클라이언트가 "같으니 보내지 않는다"로
   * 막으면 **사용자가 그 공백을 지울 방법이 없어진다.**
   *
   * (부수 관찰: `'   '`처럼 공백만인 제목도 200이다 — `z.string().min(1)`이 길이만 본다.
   * 여기서 막지 않는 것은 D6이 정한 것이 빈 문자열 하나이기 때문이고, 그 밖의 정책을 이
   * 단계가 새로 만들지 않는다.)
   */
  function submitInput(title: string): void {
    if (editing === null) return
    if (title === '') return

    const kind = editing.kind

    // **최상위 메뉴는 선택을 보지 않는다 — 여기가 이 갈래의 전부다.** 아래 셋과 갈리는
    // 자리가 그것이고, 그래서 선택 가드보다 **위**에 선다.
    //
    // **빈 트리가 막다른 길이었다.** 메뉴 노드가 0개인 새 프로젝트
    // (`apps/api/src/repos/projects.ts`의 `insertProject`는 프로젝트·멤버·기본 레이아웃만
    // 만든다)에서는 고를 메뉴가 없어 `treeAbilities`가 아홉을 전부 끄고, 페이지는
    // `menuNodeId`가 필수라 페이지도 만들 수 없었다. **구멍은 화면에만 있었다** — 서버는
    // 처음부터 루트를 받는다(`apps/api/src/routes/menu.ts`의
    // `parentId: z.uuid().nullable().optional()` · `body.parentId ?? null`)고,
    // `api/http-client.ts`의 `createMenu`도 *"`parentId`는 `null`이어도 그대로 싣는다"*를
    // 이미 적고 있었다.
    //
    // **`title === ''` 가드보다는 아래다** — 빈 제목은 이 갈래에서도 나가지 않는다(D6).
    if (kind === 'new-root-menu') {
      setEditing(null)
      void run(async () => {
        await api.createMenu(projectId, { parentId: null, title })
      })
      return
    }

    // 나머지 셋은 고른 것에 붙는다.
    if (selection === null) return
    setEditing(null)

    if (kind === 'rename') {
      // **메뉴와 페이지가 다른 엔드포인트다.** 선택의 `kind`가 그것을 가른다. **페이지만 바탕을 싣는다** — 페이지
      // 제목은 페이지 메타의 충돌 모델 안이고(이월 P), 메뉴 제목은 밖이다(메뉴 라우트에 바탕이 없다).
      const base = editing.initial
      void run(async () => {
        if (selection.kind === 'menu') await api.updateMenu(projectId, selection.id, { title })
        else await renamePage(selection.id, title, base)
      })
      return
    }

    // 새로 만들기는 **메뉴를 고른 상태에서만** 열린다(D5의 판정) — 여기 오는 선택은 메뉴다.
    if (selection.kind !== 'menu') return
    const parentId = selection.id

    if (kind === 'new-menu') {
      void run(async () => {
        await api.createMenu(projectId, { parentId, title })
      })
      return
    }

    // **만든 페이지로 이동한다(D8).** 응답의 `id`가 주소에 들어간다 — 빈 문자열은
    // `SHAPES.pageDetail`이 이미 막았으므로(웨이브 1) 여기서 다시 보지 않는다.
    let created: string | null = null
    void run(
      async () => {
        const page = await api.createPage(projectId, { menuNodeId: parentId, title })
        created = page.id
      },
      () => {
        if (created !== null) navigate(`/projects/${projectId}/pages/${created}`)
      },
    )
  }

  /**
   * **파일 한 벌로 페이지를 만든다**(§11.2 — P7-3 T5).
   *
   * **`submitInput`의 `new-page` 갈래와 같은 모양이다** — `run`을 지나므로 잠금·재조회·
   * 이동이 그대로 따라온다. 그 셋을 여기서 다시 짜지 않는 것이 요점이다: 가져오기가 자기
   * 잠금을 가지면 트리 조작과 겹쳐 나가고(D2), 재조회를 빠뜨리면 만든 페이지가 트리에
   * 안 보인다.
   *
   * **`abilities.addPage`를 지난다.** 가져오기는 **페이지를 만드는 것**이므로 판정이
   * `페이지 추가`와 같다 — 메뉴를 고르지 않았으면 할 수 없다. 판정을 여기서 새로 짜면
   * 그 표가 두 벌이 된다(D5가 막는 것).
   *
   * **봉투를 여기서 읽지 않는다.** 화면이 미리보기를 그리느라 이미 읽었고(`parsePageJson`),
   * 여기서 다시 읽으면 같은 판정이 두 자리가 된다. 서버도 같은 함수를 쓴다.
   */
  function importJson(file: unknown, title?: string): void {
    if (selection === null || selection.kind !== 'menu') return
    if (!abilities.addPage) return
    const menuNodeId = selection.id

    setImported(null)
    let result: PageImported | null = null
    void run(
      async () => {
        result = await api.importPage(projectId, {
          menuNodeId,
          file,
          // **없으면 키를 만들지 않는다** — 서버가 `title`을 파일의 제목으로 대신한다.
          ...(title !== undefined && title !== '' ? { title } : {}),
        })
      },
      () => {
        if (result === null) return
        setImported(result)
        // **만든 페이지로 이동한다** — `submitInput`의 `new-page`와 같다. 빈 문자열 id는
        // `SHAPES.pageImported`가 이미 막았다.
        navigate(`/projects/${projectId}/pages/${result.page.id}`)
      },
    )
  }

  /**
   * 형제 사이에서 한 칸 옮긴다(Task 7). `delta`가 `-1`이면 위로, `+1`이면 아래로다.
   *
   * **목적지가 `index + delta`이고 방향 보정이 없는 것은 서버가 결과 배열 기준이기
   * 때문이다 — 잰 값이다**(계획서 "계획이 재지 않은 것" #1. api 하네스로 재고 임시 파일을
   * 지웠다):
   *
   * ```
   * 메뉴   [A:0 B:1 C:2] 에 PATCH {sortOrder: 2} (A)  →  [B:0 C:1 A:2]   결과 기준
   * 페이지 [A:0 B:1 C:2] 에 PATCH {sortOrder: 2} (A)  →  [B:0 C:1 A:2]   같다
   * 메뉴   [A:0 B:1 C:2] 에 PATCH {sortOrder: 0} (B)  →  [B:0 A:1 C:2]   반대 방향도 맞는다
   * ```
   *
   * **메뉴와 페이지를 각각 쟀다** — 서로 다른 저장소 함수를 지나므로(`repos/menu.ts` vs
   * `repos/pages.ts`) 한쪽만 재고 양쪽에 쓸 수 없었다. 값은 같았다.
   *
   * **`treeSpot.index`를 쓰지 `node.sortOrder`를 쓰지 않는다.** 그 인덱스는 `sortOrder`
   * 오름차순으로 정렬한 뒤의 자리이고(웨이브 1), 서버가 0부터 연속으로 재번호한다는 것은
   * **서버의 불변식이지 이 화면이 지킬 수 있는 것이 아니다.**
   * `sortOrder가 0부터 연속이 아닌 트리에서도 목적지가 맞는다`가 그것을 못박는다.
   *
   * **페이지는 `sortOrder` 하나만 싣는다** — `menuNodeId`가 섞여 나가면 사용자가 옮기지
   * 않은 소속까지 덮어쓴다(서버가 그 키를 받으므로 실수가 조용히 통과한다).
   *
   * **선택은 손대지 않는다.** id가 바뀌지 않으므로 저절로 따라간다 — 옮긴 뒤 다시 골라야
   * 하면 연속으로 두 칸 옮길 수 없다.
   */
  function move(delta: -1 | 1): void {
    if (menu === null || selection === null) return
    const spot = treeSpot(menu, selection)
    if (spot === null) return

    const target = selection.id
    const sortOrder = spot.index + delta
    // **범위 밖이면 되돌아온다.** `indent`·`outdent`는 목적지가 없을 때 그렇게 하는데
    // `move`만 그 가드가 없었다(리뷰가 잡았다) — 판정을 벗기고 첫째에서 `move(-1)`을 부르면
    // `sortOrder: -1`이 나가고 서버가 400을 낸다(`SortOrder`가 `z.int().min(0)`이다).
    //
    // 화면·단축키는 둘 다 `treeAbilities.moveUp`/`moveDown`을 지나므로 오늘 이 자리에
    // 닿지 않는다. 남기는 것은 그것이 벗겨졌을 때의 방벽이고, 훅을 직접 태우는 케이스가
    // 그것을 지킨다(`조작 잠금`의 형태와 같다).
    if (sortOrder < 0 || sortOrder >= spot.siblingCount) return
    void run(async () => {
      if (selection.kind === 'menu') await api.updateMenu(projectId, target, { sortOrder })
      else await api.updatePage(projectId, target, { sortOrder })
    })
  }

  /**
   * 한 단계 안으로 — **앞 형제 메뉴의 마지막 자식**이 된다(Task 8).
   *
   * **`sortOrder`를 주지 않는다 — 잰 값이다**(계획서 "계획이 재지 않은 것" #2. api 하네스로
   * 재고 임시 파일을 지웠다): `PATCH {parentId}`만 주면 **새 부모의 맨 뒤**로 간다.
   *
   * ```
   * M1(자식1:0 자식2:1) 에 M2를 PATCH {parentId: M1}  →  자식1:0 자식2:1 M2:2
   * ```
   *
   * 들여쓰기의 정의가 *"앞 형제의 **마지막** 자식"*(P2b-3의 정의를 그대로 쓴다)이므로 그
   * 기본 동작이 곧 목적지다 — 자리를 지목할 필요가 없다.
   *
   * **`previousMenuSibling`이 `null`이면 되돌아온다 — 그 가드는 0 사망이다.** 단축키가
   * 붙은 뒤 다시 쟀는데도 0이다(웨이브 안에서 두 번 쟀다). 덮는 것은 `treeAbilities.indent`
   * 이고, 그것이 버튼의 `disabled`와 **단축키의 판정 통과 둘 다**에 걸린다 — 단축키도
   * `if (!abilities[…]) return`을 지나기 때문이다(`panels/menu-tree.tsx`).
   * **P2b-3에서 구조 트리의 같은 자리가 같은 이유로 0 사망이었다.**
   *
   * **잠금 가드와 갈린 자리다.** 그쪽은 단축키가 `disabled`를 우회하면서 하중이 생겼는데
   * (2 사망), 판정은 단축키도 지나므로 우회로가 없다.
   *
   * 남기는 것은 그것이 벗겨졌을 때의 `TypeError` 방벽이기 때문이다 — `previous.id`를 읽는
   * 순간 던지고, 이 트리에는 오류 경계가 없다. **닫는 케이스는 만들지 못했다:** 판정을
   * 지나지 않고 이 함수에 닿는 경로가 화면에도 단축키에도 없다.
   */
  function indent(): void {
    if (menu === null || selection === null || selection.kind !== 'menu') return
    const previous = previousMenuSibling(menu, selection.id)
    if (previous === null) return

    const target = selection.id
    void run(async () => {
      await api.updateMenu(projectId, target, { parentId: previous.id })
    })
  }

  /**
   * 한 단계 밖으로 — **부모의 다음 형제**가 된다(Task 8).
   *
   * **여기는 `sortOrder`를 함께 준다.** `parentId`만 주면 맨 뒤로 가는데(위 실측) 내어쓰기는
   * 자리를 지목해야 하기 때문이다. **둘을 함께 주면 그 값이 새 부모의 형제 배열 기준으로
   * 삽입된다 — 그것도 쟀다:**
   *
   * ```
   * M1(자식1:0 자식2:1) 에 M3을 PATCH {parentId: M1, sortOrder: 1}  →  자식1:0 M3:1 자식2:2
   * ```
   *
   * **`menuOutdentTarget`이 조부모 id와 부모의 자리를 준다.** `index + 1`을 여기서 만드는
   * 것은 그 함수가 자리만 알려 주고 `sortOrder`를 만들지 않기로 했기 때문이다.
   *
   * **역방향이 항등이 아니다** — 내어썼다가 들여쓰면 제자리가 아니다(들여쓰기가 언제나
   * 마지막 자식으로 가므로). P2b-3에서 구조 트리가 같은 성질을 못박았고 여기서도 케이스로
   * 고정했다.
   */
  function outdent(): void {
    if (menu === null || selection === null || selection.kind !== 'menu') return
    const destination = menuOutdentTarget(menu, selection.id)
    if (destination === null) return

    const target = selection.id
    void run(async () => {
      await api.updateMenu(projectId, target, {
        parentId: destination.parentId,
        sortOrder: destination.index + 1,
      })
    })
  }

  /**
   * 소속 메뉴 목록을 연다(Task 9). **지금 소속을 목록에서 뺀다** — 고를 이유가 없다.
   *
   * 목록은 `flattenMenus`가 만든다(손목록을 두지 않는다). 지금 소속은 `treeSpot`이 준
   * `parentId`이고, 페이지의 그 값은 소속 메뉴 id다.
   */
  const reparenting: { id: string; path: string }[] | null = (() => {
    if (!pickingMenu || menu === null || selection === null || selection.kind !== 'page') return null
    const owner = treeSpot(menu, selection)?.parentId ?? null
    return flattenMenus(menu).filter((option) => option.id !== owner)
  })()

  /**
   * 고른 메뉴로 페이지를 옮긴다.
   *
   * **`sortOrder`를 주지 않는다 — 잰 값이다**(계획서 "계획이 재지 않은 것" #5. api 하네스로
   * 재고 임시 파일을 지웠다):
   *
   * ```
   * TO(T1:0 T2:1) 에 PATCH {menuNodeId: TO}               →  T1:0 T2:1 옮길것:2   (맨 뒤)
   * TO(T1:0 T2:1) 에 PATCH {menuNodeId: TO, sortOrder: 1} →  T1:0 옮길것:1 T2:2   (그 자리)
   * ```
   *
   * 옮기는 사람이 자리를 지목하지 않았으므로 맨 뒤가 맞다 — 지목하고 싶으면 옮긴 뒤
   * 위/아래로 옮기면 된다.
   *
   * **선택을 옮기지 않는다.** 페이지 선택은 주소에서만 오고(D3의 귀결) 이 조작은 주소를
   * 건드리지 않으므로, 옮긴 뒤에도 같은 페이지가 열린 채 선택으로 남는다 — **웨이브 2가
   * 지운 `wasOpen` 가지가 되살아나지 않는다.**
   */
  function reparentTo(menuId: string): void {
    if (selection === null || selection.kind !== 'page') return
    const target = selection.id
    setPickingMenu(false)
    void run(async () => {
      await api.updatePage(projectId, target, { menuNodeId: menuId })
    })
  }

  /**
   * 삭제를 실행한다(D7의 두 번째 클릭).
   *
   * **지우기 전에 자리를 먼저 읽는다** — 지운 뒤에는 그 노드가 트리에 없어 `treeSpot`이
   * `null`이고 부모를 알 길이 없다. `StructureToolbar`의 `removeSelected`가 같은 형태다.
   *
   * **메뉴를 지우면 선택이 부모로 간다.** 지운 것을 계속 가리키면 툴바가 사라진 항목에
   * 작동하는 상태가 되고, `treeAbilities`가 전부 `false`를 내므로 사용자는 아무것도 못 하는
   * 채로 자기 위치를 잃는다. 루트 메뉴였으면 갈 부모가 없어 `null`이다.
   *
   * **페이지를 지우면 프로젝트 루트로 `replace` 이동한다(D8).** `replace`인 것은 뒤로
   * 가기가 지워진 페이지로 돌아가면 404를 만나기 때문이다. **조건이 없는 이유는 아래
   * `deletePage` 갈래의 주석에 있다** — 지울 수 있는 페이지가 곧 열려 있는 페이지다.
   */
  function confirmRemove(): void {
    if (menu === null || selection === null) return
    // 자리를 **지금** 읽는다. `run`은 비동기라 그 안에서는 이미 늦다.
    const spot = treeSpot(menu, selection)
    setConfirmingRemove(false)

    if (selection.kind === 'menu') {
      const parentId = spot?.parentId ?? null
      const target = selection.id
      void run(
        () => api.deleteMenu(projectId, target),
        () => setPicked(parentId === null ? null : { kind: 'menu', id: parentId }),
      )
      return
    }

    // **페이지를 지우면 언제나 프로젝트 루트로 간다** — 조건이 없는 것이 D3의 귀결이다.
    // 페이지 선택은 주소에서만 오기 때문이다: `select`/`setPicked`를 부르는 자리를 전수로
    // 세니 `{kind:'menu'}`와 `null` 둘뿐이고(`apps/web/src` 실측), 그래서
    // `selection.kind === 'page'`이면 `picked === null`이고 곧 `selection.id === pageId`다.
    //
    // **앞 판은 여기 `wasOpen = pageId === target` 가지를 두고 "열지 않은 페이지를 지우면
    // 주소를 건드리지 않는다"고 적었는데, 그 조건은 거짓이 될 수 없었다** — 리뷰가 잡았고
    // `wasOpen`을 항상 `true`로 고정해도 0 사망인 것을 재현했다. 계획서 Task 7~10을 읽어도
    // 페이지 선택을 만드는 경로가 없다(Task 7은 *"선택은 그대로다"*, Task 9의 `reparent`는
    // 소속만 바꾸고 주소를 두므로 선택이 파생으로 따라온다).
    //
    // **그래서 지운다.** 웨이브 1에서 `previousMenuSibling`의 잉여 가드를 걷어낸 것과 같은
    // 판단이다. 다시 필요해지는 조건은 명확하다 — **누군가 `select({kind:'page', …})`를
    // 부르는 순간**이고, 그때 이 자리에 조건이 돌아와야 한다.
    const target = selection.id
    void run(
      () => api.deletePage(projectId, target),
      () => {
        setPicked(null)
        navigate(`/projects/${projectId}`, { replace: true })
      },
    )
  }

  return {
    state,
    selection,
    select,
    abilities,
    busy,
    failure,
    editing,
    openInput,
    submitInput,
    cancelInput: () => setEditing(null),
    confirmingRemove,
    askRemove: () => {
      // **조작이 나가 있으면 확인도 걸지 않는다(D2의 잠금).** 이것이 빠져 있었고 리뷰가
      // 잡았다 — `busy` 중 `Delete`가 확인을 걸면 그 확인이 **잠금이 풀린 뒤까지 살아남아**
      // 클릭 한 번에 삭제가 나간다(실측). D7의 두 번 누르기가 사실상 한 번이 되고 undo가 없다.
      //
      // **"여는" 셋이 같은 가드를 갖는다** — `openInput`·`openReparent`·여기. `cancel*`은
      // 반대로 **닫는** 것이라 잠금 중에도 열어 둔다: 취소를 막을 이유가 없다.
      if (inFlight.current) return
      // 확인을 걸면서 열려 있던 입력과 앞 실패를 함께 지운다 — 한 번에 하나만 진행한다.
      setFailure(null)
      setEditing(null)
      setConfirmingRemove(true)
    },
    confirmRemove,
    cancelRemove: () => setConfirmingRemove(false),
    move,
    indent,
    outdent,
    conflict,
    overwriteTitle: () => {
      if (conflict === null) return
      void run(() => renamePage(conflict.pageId, conflict.mine, conflict.theirs))
    },
    discardTitle: () => setConflict(null),
    reparenting,
    openReparent: () => {
      if (inFlight.current) return
      setFailure(null)
      setEditing(null)
      setConfirmingRemove(false)
      setPickingMenu(true)
    },
    reparentTo,
    cancelReparent: () => setPickingMenu(false),
    importJson,
    imported,
  }
}

/**
 * 메뉴 제목 하나. **`tree-actions.ts`의 `byOrder` 관문을 지나지 않는다** — 그 파일이 세운
 * "던지지 않는다" 계약 밖에서 배열을 직접 돈다.
 *
 * **그런데도 안전한 근거는 둘이고, 둘 다 잰 것이다.** 앞 판은 *"표시용이기 때문에 그 계약이
 * 필요한 자리가 아니다"*라고 적었는데 그것은 근거가 아니다 — 계약이 필요한지를 정하는 것은
 * "표시용인가"가 아니라 **"렌더에서 나쁜 값에 닿는가"**다(리뷰가 잡았다).
 *
 * 1. **관문이 세 배열을 이미 보장한다.** `SHAPES.treeEnvelope`가 `isTreeMenuNode`로 재귀
 *    검사하며 `pages`·`children`이 배열인지까지 본다(웨이브 1 실측). **`tree-actions.ts`가
 *    일부러 기대지 않기로 한 바로 그 보장이다** — 그쪽은 관문과 다른 커밋에서 바뀔 수 있어
 *    스스로 닫았고, 여기는 그 보장 위에 선다.
 * 2. **여기는 렌더가 아니라 이벤트 핸들러다.** `currentTitle()`은 `openInput`에서만 불리고
 *    그것은 버튼 클릭이다. 실측: 핸들러에서 던지면 `.wb-shell`이 **살아 있고** 예외가 밖으로
 *    새지도 않는다. 대조로 렌더에서 던지면 그 렌더가 통째로 실패한다.
 *
 * **던지는 입력은 찾지 못했다.** 관문을 지나는 깨진 모양 둘(중복 `id`, `pages` 원소가
 * `children`을 갖는 것)로 이름 변경을 열어 보니 둘 다 던지지 않았고 셸도 살아 있었다
 * (중복 `id`에서는 첫 일치의 제목이 초기값이 된다 — 그 값이 틀릴 수는 있어도 던지지 않는다).
 */
function findMenuTitle(nodes: TreeMenuNode[], menuId: string): string | null {
  for (const node of nodes) {
    if (node.id === menuId) return node.title
    const found = findMenuTitle(node.children, menuId)
    if (found !== null) return found
  }
  return null
}

function findPageTitle(nodes: TreeMenuNode[], pageId: string): string | null {
  for (const node of nodes) {
    for (const page of node.pages) {
      if (page.id === pageId) return page.title
    }
    const found = findPageTitle(node.children, pageId)
    if (found !== null) return found
  }
  return null
}
