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
import type { TreeMenuNode } from '../api/types'
import { treeAbilities, treeSpot, type TreeAbilities, type TreeSelection } from './tree-actions'

/** 서버가 이유를 주지 않은 조회 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '메뉴를 불러오지 못했습니다'

/**
 * 서버가 이유를 주지 않은 **조작** 실패에 쓸 문장. 조회와 갈라 적는 것은 사용자가 방금 한
 * 일이 다르기 때문이다 — 조회는 화면이 스스로 한 것이고 조작은 사용자가 누른 것이다.
 */
const UNKNOWN_COMMAND_FAILURE = '요청을 처리하지 못했습니다'

/** 인라인 입력이 무엇을 위해 열려 있는지. 닫혀 있으면 `null`. */
export interface TreeEditing {
  kind: 'new-menu' | 'new-page' | 'rename'
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
}

export function useTreeCommands(props: {
  projectId: string
  pageId: string | undefined
}): TreeCommands {
  const api = useApi()
  // **이 단계가 앱의 첫 `useNavigate`다**(D8). 지금 앱의 이동은 전부 렌더 시점 판정이고
  // (`<Navigate>` 컴포넌트 — `api/failure.tsx`의 *"컴포넌트인 것이 요점이다"*), 그 관용구는
  // "이 상태면 저기로 간다"를 말한다. 여기 이동은 **비동기 조작이 끝난 뒤의 명령형 이동**이라
  // 그렇게 표현되지 않는다: 만들기가 성공한 그 순간에만 한 번 일어나고, 렌더가 다시 돌 때
  // 같은 판정을 되풀이하면 안 된다.
  const navigate = useNavigate()
  const { projectId, pageId } = props

  const [state, setState] = useState<TreeLoadState>({ status: 'loading' })
  const [picked, setPicked] = useState<TreeSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [editing, setEditing] = useState<TreeEditing | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

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
   * **실패해도 트리를 다시 받지 않는다.** 서버가 거절했다는 것은 트리가 그대로라는 뜻이고,
   * 재조회하면 사용자가 방금 본 실패 문장이 조회 상태에 덮인다.
   *
   * **`busy` 가드는 지금 0 사망이다 — 재 봤다.** 지우고 돌려도 이 파일의 케이스가 하나도
   * 죽지 않는다. 덮는 것은 **버튼의 `disabled`**다: `MenuToolbar`의 `ToolButton`에서 `busy`를
   * 빼면 `요청이 나가 있는 동안 툴바가 전부 비활성이다`가 죽는다(그쪽 변이는 1 사망).
   * 화면에서 `busy`인 채로 다시 부르려면 비활성 버튼을 눌러야 하는데 그 경로가 없어
   * **닫는 케이스를 만들지 못했다.**
   *
   * 그래도 남긴다. `StructureToolbar`의 `commitOps` 반환값 검사와 같은 자리다 — 지금
   * 통과하는 이유가 "위에서 `disabled`가 지켜지고 있어서"이므로, 그것이 벗겨지는 날 이것이
   * 마지막 방벽이다. **다음 웨이브의 키보드 단축키가 버튼을 지나지 않는다는 것은 계획서
   * Task 10 케이스 6을 읽은 것이지 잰 것이 아니다.**
   */
  async function run(send: () => Promise<void>, after?: () => void): Promise<void> {
    if (busy) return
    setBusy(true)
    setFailure(null)
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
    setFailure(null)
    // **다른 조작을 시작하면 확인이 풀린다**(D7의 셋째 조건).
    setConfirmingRemove(false)
    setEditing({ kind, initial: kind === 'rename' ? currentTitle() : '' })
  }

  /** 선택 대상의 지금 제목. 못 찾으면 빈 문자열 — 그러면 입력이 비어 열린다. */
  function currentTitle(): string {
    if (menu === null || selection === null) return ''
    if (selection.kind === 'menu') return findMenuTitle(menu, selection.id) ?? ''
    return findPageTitle(menu, selection.id) ?? ''
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
    if (editing === null || selection === null) return
    if (title === '') return

    const kind = editing.kind
    setEditing(null)

    if (kind === 'rename') {
      // **메뉴와 페이지가 다른 엔드포인트다.** 선택의 `kind`가 그것을 가른다.
      void run(async () => {
        if (selection.kind === 'menu') await api.updateMenu(projectId, selection.id, { title })
        else await api.updatePage(projectId, selection.id, { title })
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
   * 삭제를 실행한다(D7의 두 번째 클릭).
   *
   * **지우기 전에 자리를 먼저 읽는다** — 지운 뒤에는 그 노드가 트리에 없어 `treeSpot`이
   * `null`이고 부모를 알 길이 없다. `StructureToolbar`의 `removeSelected`가 같은 형태다.
   *
   * **메뉴를 지우면 선택이 부모로 간다.** 지운 것을 계속 가리키면 툴바가 사라진 항목에
   * 작동하는 상태가 되고, `treeAbilities`가 전부 `false`를 내므로 사용자는 아무것도 못 하는
   * 채로 자기 위치를 잃는다. 루트 메뉴였으면 갈 부모가 없어 `null`이다.
   *
   * **연 페이지를 지우면 프로젝트 루트로 `replace` 이동한다(D8).** `replace`인 것은 뒤로
   * 가기가 지워진 페이지로 돌아가면 404를 만나기 때문이다. **열지 않은 페이지를 지운
   * 경우에는 주소를 건드리지 않는다** — 보고 있던 것이 그대로 열려 있어야 한다.
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

    const target = selection.id
    const wasOpen = pageId === target
    void run(
      () => api.deletePage(projectId, target),
      () => {
        setPicked(null)
        if (wasOpen) navigate(`/projects/${projectId}`, { replace: true })
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
      // 확인을 걸면서 열려 있던 입력과 앞 실패를 함께 지운다 — 한 번에 하나만 진행한다.
      setFailure(null)
      setEditing(null)
      setConfirmingRemove(true)
    },
    confirmRemove,
    cancelRemove: () => setConfirmingRemove(false),
  }
}

/**
 * 메뉴 제목 하나. **순회가 `tree-actions.ts`가 아니라 여기 있는 것은 이것이 판정이 아니라
 * 표시용이기 때문이다** — 그 파일의 계약("던지지 않는다")이 필요한 자리가 아니다.
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
