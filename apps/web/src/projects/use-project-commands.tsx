/**
 * 프로젝트 목록의 조회·잠금·조작을 묶는다. **화면이 부르는 유일한 관문이다**(P2b-5 Task 3).
 *
 * **`tree/use-tree-commands.tsx`와 같은 경로다**(P2b-5 D1 = P2b-4 D1): 요청 하나 → 성공하면
 * 목록 재조회, 낙관 적용·undo 없음. 둘을 공유하지 않는 것은 보는 것이 다르기 때문이다 —
 * 그쪽은 트리와 선택을, 이쪽은 평평한 목록과 역할을 본다.
 *
 * **재조회로 가는 근거는 D1의 둘째다** — 되돌릴 것이 목록 하나뿐이라 undo가 없고 재조회가 곧
 * 수렴이다. **첫째 근거(*"생성 응답을 목록에 꽂을 수 없다"*)는 웨이브 1의 실측으로 반증됐다:**
 * `POST /projects`가 `role`까지 실은 `ProjectDetail`을 낸다(`api/types.ts`의 표). 즉 꽂을 수는
 * 있고 **꽂지 않기로 하는 것**이다. 그 판단이 이 파일에 있는 이유는, 꽂으려면 목록의 정렬을
 * 화면이 알아야 하는데(서버는 `created_at` 오름차순으로 낸다 — 웨이브 1에서 잰 값) 그 규칙이
 * 서버와 화면 두 곳에 생기기 때문이다.
 *
 * ## 표면의 분류 (D2 — **여는 것도 잠근다**)
 *
 * P2b-4에서 **여는 조작 하나가 잠기지 않아** 사고가 났다: `busy` 중에 삭제 확인이 걸리고,
 * 잠금이 풀린 뒤 클릭 한 번에 지워졌다. 그래서 표면을 셋으로 나눠 **어느 쪽인지 정해서 붙인다.**
 *
 * | 갈래 | 무엇 | 잠금 |
 * |---|---|---|
 * | **요청** | `submitForm` · `confirmDelete` | `run`이 `inFlight`로 막는다 |
 * | **여는 것** | `openCreate` · `openEdit` · `askDelete` | **각자 `inFlight`를 본다** |
 * | **닫는 것** | `closeForm` · `cancelDelete` | 막지 않는다 — 닫는 것은 잠금 중에도 안전하다 |
 *
 * **Task 3이 만드는 것은 `state`·`busy`·`failure`와 `run`까지다** — 위 표의 조작들은
 * Task 4·5·6이 각자 케이스와 함께 붙인다. `run`은 그때 처음 불린다.
 *
 * **닫는 것을 잠그지 않는 근거:** 잠그면 요청이 나가 있는 동안 사용자가 폼을 못 닫는다.
 * 닫아도 나간 요청은 그대로 진행되고, 성공하면 재조회가 목록을 맞춘다.
 *
 * ## 오류 경계 밖이다
 *
 * 이 훅이 그리는 화면 위에 오류 경계가 없다(`apps/web/src`에서 경계는 캔버스의
 * `CanvasBoundary` 하나뿐이라고 P2b-4가 셌다). **그래서 판정도 조립도 던지지 않아야 한다** —
 * `projects/project-actions.ts`가 같은 계약을 갖는 이유와 같다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import type { ProjectDetail } from '../api/types'

/** 서버가 이유를 주지 않은 **조회** 실패에 쓸 문장. */
const UNKNOWN_LOAD_FAILURE = '프로젝트 목록을 불러오지 못했습니다'

/**
 * 서버가 이유를 주지 않은 **조작** 실패에 쓸 문장. 조회와 다른 문장인 것이 요점이다 —
 * 둘이 같은 자리에 나오지 않으므로(D8) 사용자가 무엇이 실패했는지 가릴 수 있어야 한다.
 */
const UNKNOWN_COMMAND_FAILURE = '요청을 처리하지 못했습니다'

/**
 * 조회 상태. **`projects.length === 0`으로 빈 상태를 판정하지 않는다** — 응답이 오기 전에도
 * 목록은 비어 있으므로, 길이만 보면 로딩 중에 "없습니다"가 떴다가 사라진다.
 */
export type ProjectLoadState =
  | { status: 'loading' }
  | { status: 'ready'; projects: ProjectDetail[] }
  | { status: 'failed'; failure: Failure }

export interface ProjectCommands {
  state: ProjectLoadState
  /** 조작이 나가 있는 동안 `true`. **버튼 표시용이다**(D2 — 실제로 막는 것은 `ref`다). */
  busy: boolean
  /** 마지막 조작의 실패. **조회 실패(`state.failure`)와 다른 상태다**(D8). */
  failure: Failure | null
}

export function useProjectCommands(): ProjectCommands {
  const api = useApi()
  const [state, setState] = useState<ProjectLoadState>({ status: 'loading' })
  /**
   * **잠금(`inFlight`)과 표시(`busy`)를 갈라 둔다** — P2b-4의 실측이 근거다.
   *
   * `useState` 하나로 둘을 다 하면 **같은 렌더 클로저의 두 번째 호출을 막지 못한다.**
   * `run`이 매 렌더 새로 만들어지며 그 렌더의 `busy`를 닫으므로, 같은 tick의 두 번째 호출은
   * 여전히 `false`를 본다(`setBusy(true)`는 다음 렌더에야 보인다). 그쪽에서 잰 값:
   * 한 렌더의 `commands`를 붙잡고 같은 tick에 두 번 부르면 요청이 **2회** 나갔다.
   *
   * **여기서 다시 재지는 않았다** — 같은 React 의미론이고 그쪽 케이스가 이미 그것을 지킨다.
   * 이 훅에서도 같은 형태를 쓰는 이유가 그 실측이라는 것만 적어 둔다.
   */
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  /**
   * 목록을 받는다. `reload`가 `true`면 `loading`으로 되돌리지 않는다 — 조작 뒤의 재조회에서
   * 목록이 잠깐 사라지면 사용자가 방금 만든 것을 확인할 자리가 흔들린다.
   *
   * **`.then(ok, err)`이 아니라 try/catch인 것은 호출 자체가 그 자리에서 던질 수도 있기
   * 때문이다.** 그 예외는 이펙트 밖으로 새어 나가 앱 트리를 통째로 죽인다.
   */
  const load = useCallback(
    async (alive: () => boolean, reload: boolean): Promise<void> => {
      if (!reload) setState({ status: 'loading' })
      try {
        const projects = await api.listProjects()
        if (alive()) setState({ status: 'ready', projects })
      } catch (caught) {
        if (!alive()) return
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다(D5). 여기서 다시 판정하지 않는다.
        setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_LOAD_FAILURE) })
      }
    },
    [api],
  )

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다(`require-auth`와 같은 이유).
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
   * 조작 하나를 보내고 **성공하면 목록을 다시 받는다(D1). 재조회가 곧 수렴이다.**
   *
   * `after`는 재조회 **뒤에** 부른다 — 만든 프로젝트로 옮기는 것(D7)이 그 자리다. 실패하면
   * 부르지 않는다: 만들지 못한 프로젝트로 가면 안 된다.
   *
   * **실패해도 목록을 다시 받지 않는다.** 서버가 거절했다는 것은 목록이 그대로라는 뜻이라
   * 받아 봐야 같은 것이 온다.
   *
   * **재진입을 막는 것은 `inFlight`(ref)이지 `busy`(state)가 아니다.**
   */
  async function run(send: () => Promise<void>, after?: () => void): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
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
      // **잠금은 언마운트 여부와 무관하게 푼다.** `ref`는 렌더와 상관없는 값이라 여기서
      // 놓치면 그 인스턴스가 영구히 잠긴다. 표시(`setBusy`)만 마운트 여부를 본다.
      inFlight.current = false
      if (!unmounted.current) setBusy(false)
    }
  }

  return { state, busy, failure }
}
