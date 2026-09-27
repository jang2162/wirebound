/**
 * 프로젝트 목록의 조회·잠금·조작을 묶는다. **화면이 부르는 유일한 관문이다.**
 *
 * **`tree/use-tree-commands.tsx`와 같은 경로다:** 요청 하나 → 성공하면
 * 목록 재조회, 낙관 적용·undo 없음. 둘을 공유하지 않는 것은 보는 것이 다르기 때문이다 —
 * 그쪽은 트리와 선택을, 이쪽은 평평한 목록과 역할을 본다.
 *
 * **재조회로 가는 근거** — 되돌릴 것이 목록 하나뿐이라 undo가 없고 재조회가 곧
 * 수렴이다. **생성 응답을 목록에 꽂을 수는 있다:**
 * `POST /projects`가 `role`까지 실은 `ProjectDetail`을 낸다(`api/types.ts`의 표). 즉
 * **꽂지 않기로 하는 것**이다. 꽂으려면 목록의 정렬을
 * 화면이 알아야 하는데(서버는 `created_at` 오름차순으로 낸다) 그 규칙이
 * 서버와 화면 두 곳에 생기기 때문이다.
 *
 * ## 표면의 분류 — **여는 것도 잠근다**
 *
 * **여는 조작 하나가 잠기지 않으면** 사고가 난다: `busy` 중에 삭제 확인이 걸리고,
 * 잠금이 풀린 뒤 클릭 한 번에 지워진다. 그래서 표면을 셋으로 나눠 **어느 쪽인지 정해서 붙인다.**
 *
 * | 갈래 | 무엇 | 잠금 |
 * |---|---|---|
 * | **요청** | `submitForm` · `confirmDelete` | `run`이 `inFlight`로 막는다 |
 * | **여는 것** | `openCreate` · `openEdit` · `askDelete` | **각자 `inFlight`를 본다** |
 * | **닫는 것** | `closeForm` · `cancelDelete` | 막지 않는다 — 닫는 것은 잠금 중에도 안전하다 |
 *
 * **닫는 것을 잠그지 않는 근거:** 잠그면 요청이 나가 있는 동안 사용자가 폼을 못 닫는다.
 * 닫아도 나간 요청은 그대로 진행되고, 성공하면 재조회가 목록을 맞춘다.
 *
 * ## 오류 경계 밖이다
 *
 * 이 훅이 그리는 화면 위에 오류 경계가 없다(`apps/web/src`의 경계는 캔버스의
 * `CanvasBoundary` 하나다 — 다시 세는 법:
 * `rg -l getDerivedStateFromError apps/web/src`). **그래서 판정도 조립도 던지지 않아야 한다** —
 * `projects/project-actions.ts`가 같은 계약을 갖는 이유와 같다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import type { ProjectDetail } from '../api/types'

/** 서버가 이유를 주지 않은 **조회** 실패에 쓸 문장. */
const UNKNOWN_LOAD_FAILURE = '프로젝트 목록을 불러오지 못했습니다'

/**
 * 서버가 이유를 주지 않은 **조작** 실패에 쓸 문장. 조회와 다른 문장인 것이 요점이다 —
 * 둘이 같은 자리에 나오지 않으므로 사용자가 무엇이 실패했는지 가릴 수 있어야 한다.
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

/** 지금 열려 있는 폼. `project`가 `null`이면 만들기, 아니면 그 프로젝트의 수정이다. */
export interface ProjectFormState {
  project: ProjectDetail | null
}

/** 폼이 제출하는 값 셋. 서버가 받는 키와 같다(`ApiClient`의 본문). */
export interface ProjectFormValues {
  name: string
  slug: string
  description: string
}

export interface ProjectCommands {
  state: ProjectLoadState
  /** 조작이 나가 있는 동안 `true`. **버튼 표시용이다**(실제로 막는 것은 `ref`다 — `inFlight`). */
  busy: boolean
  /** 마지막 조작의 실패. **조회 실패(`state.failure`)와 다른 상태다.** */
  failure: Failure | null
  /** 열려 있는 폼. 닫혀 있으면 `null`. */
  form: ProjectFormState | null
  openCreate: () => void
  openEdit: (project: ProjectDetail) => void
  closeForm: () => void
  submitForm: (values: ProjectFormValues) => void
  /** 삭제 확인이 열린 프로젝트. 닫혀 있으면 `null`. **하나뿐이다.** */
  confirmingDelete: ProjectDetail | null
  askDelete: (project: ProjectDetail) => void
  cancelDelete: () => void
  confirmDelete: (project: ProjectDetail) => void
}

export function useProjectCommands(): ProjectCommands {
  const api = useApi()
  /**
   * **만든 프로젝트로 가는 이동이 명령형이다.** `<Navigate>` 컴포넌트는 "이 상태면 저기로
   * 간다"를 말하는데, 이 이동은 만들기가 성공한 그 순간에만 한 번 일어나야 하고 렌더가 다시
   * 돌 때 되풀이되면 안 된다(`tree/use-tree-commands.tsx`가 같은 근거로 같은 선택을 한다).
   */
  const navigate = useNavigate()
  const [state, setState] = useState<ProjectLoadState>({ status: 'loading' })
  /**
   * **잠금(`inFlight`)과 표시(`busy`)를 갈라 둔다.**
   *
   * `useState` 하나로 둘을 다 하면 **같은 렌더 클로저의 두 번째 호출을 막지 못한다.**
   * `run`이 매 렌더 새로 만들어지며 그 렌더의 `busy`를 닫으므로, 같은 tick의 두 번째 호출은
   * 여전히 `false`를 본다(`setBusy(true)`는 다음 렌더에야 보인다) — 한 렌더의 `commands`를
   * 붙잡고 같은 tick에 두 번 부르면 요청이 **2회** 나간다.
   *
   * **이 훅에서 따로 재는 케이스는 없다** — 같은 React 의미론이고 `tree/use-tree-commands.tsx`의
   * 케이스가 그것을 지킨다.
   */
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [form, setForm] = useState<ProjectFormState | null>(null)
  /**
   * **확인은 하나뿐이다.** 배열이 아니라 값 하나인 것이 요점이다 — 둘이 동시에 열리면
   * 사용자가 확인한 것과 지워지는 것이 달라진다. 다른 항목의 삭제를 시작하면 이 값이 그대로
   * 대체되므로 앞의 확인이 저절로 닫힌다.
   */
  const [confirmingDelete, setConfirmingDelete] = useState<ProjectDetail | null>(null)
  /**
   * 만든 프로젝트의 id를 `run`의 `after`까지 나르는 자리.
   *
   * **`useState`가 아니라 `ref`인 이유:** `after`는 `run`의 클로저 안에서 불리므로 그 사이의
   * `setState`를 보지 못한다. 그리고 이 값은 화면이 그리는 것이 아니라 **한 번 쓰고 버리는
   * 전달값**이라 렌더를 돌릴 이유가 없다.
   */
  const createdId = useRef<string | null>(null)

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
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다. 여기서 다시 판정하지 않는다.
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
   * 조작 하나를 보내고 **성공하면 목록을 다시 받는다. 재조회가 곧 수렴이다.**
   *
   * `after`는 재조회 **뒤에** 부른다 — 만든 프로젝트로 옮기는 것이 그 자리다. 실패하면
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

  /**
   * 만들기 폼을 연다. **조작이 나가 있으면 열지 않는다(머리말 «여는 것도 잠근다»).**
   *
   * 화면에서는 버튼이 비활성이라 이 경로가 없지만 **훅 API로는 열린다** — 그때 친 값은
   * 요청도 못 나가고 조용히 사라진다(`submitForm`이 `run`에 닿아도 `inFlight`가 서 있어
   * 되돌아온다).
   */
  function openCreate(): void {
    if (inFlight.current) return
    setFailure(null)
    // **다른 조작을 시작하면 확인이 닫힌다.** 열어 둔 채로 폼을 쓰면 확인이 어느 항목에
    // 붙어 있는지가 화면에서 흐려진다.
    setConfirmingDelete(null)
    setForm({ project: null })
  }

  /**
   * 수정 폼을 연다. **`openCreate`와 같은 잠금이고**, 다른 것은 초기값이 실린다는 것뿐이다.
   *
   * **폼 컴포넌트를 나누지 않고 `form.project`로 가른다.**
   * 묻는 것이 같고 다른 것은 초기값과 버튼 글자뿐이라, 나누면 `project-form.tsx`의 blur 규칙과 포커스 규칙이
   * 두 벌이 되고 한쪽만 고치는 자리가 생긴다 — `panels/tree-input.tsx`가 만들기와 이름 변경을
   * 한 컴포넌트로 둔 것과 같은 판단이다. **분기가 느는 값은 이 함수 하나와 `submitForm`의
   * `target === null` 하나뿐이다.**
   */
  function openEdit(project: ProjectDetail): void {
    if (inFlight.current) return
    setFailure(null)
    setConfirmingDelete(null)
    setForm({ project })
  }

  /**
   * 폼을 닫는다. **잠그지 않는다** — 닫는 것은 요청이 나가 있는 동안에도 안전하고, 잠그면
   * 사용자가 폼을 못 닫는다. 나간 요청은 그대로 진행되고 성공하면 재조회가 목록을 맞춘다.
   */
  function closeForm(): void {
    setForm(null)
  }

  /**
   * 폼을 제출한다.
   *
   * **이름·슬러그가 비면 보내지 않는다.** 서버의 `Name`이 `z.string().min(1)`이고 빈 슬러그도
   * 400이라(빈 슬러그가 형식 위반과 **같은 문장**을 낸다) 그 왕복을 만들지 않는다.
   * **폼을 닫지 않는 것이 요점이다:** 닫으면 사용자가 무엇이 잘못됐는지 모른 채 친 값을 잃는다.
   *
   * **슬러그 형식은 여기서 보지 않는다.** 서버가 400과 함께 문장을 주고, 규칙을 두 곳에
   * 두면 어긋난다. **그 문장은 `issues[]`에 온다** — `toFailure`가 그것을 쓴다(`api/failure.tsx`).
   *
   * **`description`이 빈 문자열이면 키를 만들지 않는다.** 폼의 빈 칸은 "설명 없음"이지
   * "빈 문자열인 설명"이 아니다. `undefined`로 넘기면 `declaredOnly`가 그 키를 지운다
   * (`api/http-client.ts` — 거르는 것은 `undefined` 하나뿐이라 `null`·`0`·`''`는 살아남는다).
   */
  function submitForm(values: ProjectFormValues): void {
    if (form === null) return
    if (values.name === '' || values.slug === '') return

    const body = {
      name: values.name,
      slug: values.slug,
      description: values.description === '' ? undefined : values.description,
    }

    const target = form.project
    if (target === null) {
      void run(
        async () => {
          const created = await api.createProject(body)
          createdId.current = created.id
        },
        () => {
          setForm(null)
          // **만든 프로젝트로 간다.** `id`가 빈 문자열이면 `/projects/`가 되고 화면이
          // 통째로 비는데, 그것은 `SHAPES.projectDetail`이 관문에서 막는다.
          const id = createdId.current
          if (id !== null) navigate(`/projects/${id}`)
        },
      )
      return
    }

    // **수정은 세 필드를 함께 보낸다 — 부분 갱신이 아니다.**
    //
    // **바꿨는지 비교하지 않는 근거:** 서버가 제목을 정규화하지 않으므로
    // (`' 가'`와 `'가'`가 다른 값이다) "같으니 보내지 않는다"로 막으면 사용자가 그 공백을
    // 지울 방법이 없어진다. **필드가 셋이라 비교는 셋 다 필요해지고, 셋이 다 같으면 빈 본문이
    // 되어 `updateBody`가 던진다** — 눌렀는데 아무 일도 안 나는 화면이 된다.
    //
    // **전체 갱신의 한계:** 설명을 지우면 `undefined`가 되어 그 키가 빠지므로
    // **"바꾸지 않는다"가 되고 옛 설명이 서버에 남는다.** 지우는 뜻을 보내려면 `null`이어야
    // 하는데, 폼이 "비움"과 "지움"을 가르지 못한다. 지우기는 없고,
    // 케이스가 그 사실을 고정해 둔다.
    void run(
      async () => {
        await api.updateProject(target.id, body)
      },
      () => {
        setForm(null)
      },
    )
  }

  /**
   * 삭제 확인을 연다. **`openCreate`와 같은 잠금이다 — 머리말의 사고가 정확히 이 자리다:**
   * 여는 조작 하나가 잠기지 않으면 `busy` 중에 확인이 걸리고, **잠금이 풀린 뒤 클릭 한 번에
   * 지워진다.**
   *
   * **열려 있던 폼을 함께 닫는다.** 다른 항목의 확인은 이 값이 대체되며 닫히고, **친
   * 이름도 함께 사라진다** — 확인이 그 항목의 `<li>` 안에 있어 항목을 옮기면 서브트리째
   * 언마운트되기 때문이다.
   */
  function askDelete(project: ProjectDetail): void {
    if (inFlight.current) return
    setFailure(null)
    setForm(null)
    setConfirmingDelete(project)
  }

  /** 확인을 닫는다. `closeForm`과 같은 이유로 잠그지 않는다. */
  function cancelDelete(): void {
    setConfirmingDelete(null)
  }

  /**
   * 삭제를 확정한다. **확인을 지나야만 닿는다** — 화면이 `confirmingDelete`일 때만 이 버튼을
   * 그리고, 그 버튼은 이름이 정확히 일치할 때만 활성이다.
   *
   * **여기서 이름을 다시 대조하지 않는다.** 대조는 화면이 하고(입력값을 그쪽이 갖는다) 이
   * 함수는 그 판정을 신뢰한다 — 훅이 입력값까지 들면 화면 상태가 두 곳에 생긴다.
   * **그래서 훅 API로 이 함수를 직접 부르면 확인 없이 지워진다** — 화면이 그리는 경로에는
   * 그 자리가 없다는 것을 적어 둔다.
   */
  function confirmDelete(project: ProjectDetail): void {
    void run(
      async () => {
        await api.deleteProject(project.id)
      },
      () => {
        setConfirmingDelete(null)
      },
    )
  }

  return {
    state,
    busy,
    failure,
    form,
    openCreate,
    openEdit,
    closeForm,
    submitForm,
    confirmingDelete,
    askDelete,
    cancelDelete,
    confirmDelete,
  }
}
