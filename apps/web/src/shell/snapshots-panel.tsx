/**
 * 스냅샷 팝오버. **에디터 셸 머리에 산다** — 내보내기 팝오버 옆이고 닫는 장치도 같다
 * (`shell/use-popover-dismiss.ts`).
 *
 * ---
 *
 * # 별도 라우트가 아니라 머리의 팝오버다 — 별도 라우트의 근거 둘이 서지 않는다
 *
 * 이 화면을 `/projects/:projectId/snapshots`라는 **셸 밖 별도 라우트**로 둘 근거는 둘이고,
 * 둘 다 서지 않는다.
 *
 * | 별도 라우트의 근거 | 지금 | 왜 |
 * |---|---|---|
 * | *"설계서 「설계서 화면 구조」의 3분할에 이 화면이 들어갈 자리가 없다"* | **자리는 3분할이 아니라 머리다** | 「설계서 화면 구조」는 좌·중·우 셋을 그리고 **머리에 무엇이 오는지는 말하지 않는다.** 머리에는 내보내기 · 모드/줌 도구가 산다 — *"이 프로젝트 전체를 다루는 것"*이고 스냅샷도 그 축이다 |
 * | *"주소가 있어야 공유·새로고침이 된다"* | **공유할 것이 없다** | 스냅샷 목록은 사람에게 링크로 건네는 화면이 아니다(설계서 한 장이 아니라 이 프로젝트의 기록이다). 그리고 그 주소는 **셸을 떠나야** 열린다 — 되돌린 뒤 설계서로 돌아오는 왕복이 조작마다 붙는다 |
 *
 * **결정한 것은 사용자다.** 두 갈래(주소를 남기고 팝오버를 더한다 / 주소를 없애고
 * 팝오버만 둔다) 중 뒤쪽이다 — 주소를 남기면 같은 화면이 두 자리에 살고, 그 둘이
 * 갈리는 날 어느 쪽이 맞는지 알 수 없다.
 *
 * **팝오버라서 생기는 몫이 하나 있다 — 복원 뒤 재동기화다.** 별도 라우트면
 * 되돌리고 설계서로 **돌아오는 길**에 셸이 자연히 다시 읽힌다. 팝오버는 에디터 **위에**
 * 뜨므로 그 길이 없고, 그래서 복원이 성공하면 `onRestored`로 셸에 알린다
 * (`routes/editor.tsx`의 `restoredToken`이 받는다).
 *
 * ---
 *
 * # 복원 — **확인을 받고, 결과를 말한다**
 *
 * 줄마다 복원 버튼이 선다.
 *
 * **확인 단계를 둔다.** 되돌릴 수 없는 조작은 아니지만(서버가 복원 **직전** 상태를 스냅샷으로
 * 떠 준다) **프로젝트 전체가 바뀐다.** 확인은 그 줄 안에서 받는다 — `window.confirm`을 쓰지
 * 않는 이유는 그것이 브라우저 모달이라 케이스가 그 문장을 읽지 못하고, 무엇을 되돌리는지
 * (어느 태그인지)를 화면에 붙여 보여 줄 수도 없기 때문이다.
 *
 * **결과가 말할 것 셋:** 바뀐 페이지 수 · **그대로인 페이지 수** · 안전망 스냅샷의 태그.
 * 둘째가 빠지면 *"0개가 바뀌었습니다"*가 **아무 일도 안 일어난 것**과
 * **전부 그대로였던 것**을 구분하지 못한다.
 *
 * ---
 *
 * # 권한 — 읽기는 열고, 생성은 editor, 복원은 owner다
 *
 * 설계서 「권한 모델」이 스냅샷 **생성**을 editor에게 열고 **복원만 owner**로 둔다. 그래서 이 화면은
 * viewer에게도 목록을 보여 주고 **폼과 복원 버튼만 닫는다** — 막으면 viewer가 *"이 프로젝트에
 * 어떤 기록이 있는지"*조차 못 본다.
 *
 * **셸의 토글도 역할로 감추지 않는다**(`routes/editor.tsx`) — 같은 이유다.
 *
 * **owner가 아니면 복원 버튼이 아예 없다 — 회색으로 만들어 두지 않는다.** 비활성 버튼은
 * *"권한이 없다"*가 아니라 *"지금은 안 된다"*로 읽힌다.
 *
 * 판정은 여기서 하지 않는다 — `projectAbilities(project.role)`의 `createSnapshot`·
 * `restoreSnapshot` 둘을 본다(`test/role-access.test.ts`가 `.role`을 읽는 자리가 전부 그
 * 함수의 인자 자리인지 실행으로 센다). **그 둘은 값이 실제로 갈린다** — editor는 만들 수
 * 있고 되돌릴 수 없다.
 *
 * ---
 *
 * # 실패가 화면에 남는 방식
 *
 * **두 409를 다른 문장으로 보여야 한다.** 사용자가 할 일이 다르기 때문이다 — 태그 중복은
 * *"이름을 바꾼다"*이고 지문 불일치는 *"그대로 다시 보낸다"*이다. 코드는 둘 다 `conflict`이라
 * **화면이 코드로는 가를 수 없고**, 서버가 문장을 갈라 준다. 그래서 이 화면은 문안을 다시
 * 쓰지 않고 **서버 문장을 그대로 그린다**(`api/failure.tsx`의 판단과 같다: *"화면이 문안을
 * 다시 쓰면 서버가 이유를 바꿔도 사용자는 옛 이유를 듣는다"*).
 *
 * **"실패했다고 말하는데 조작은 일어났다"의 화면판을 막는다.** 저장이 실패했을 때 이 화면이 지키는 것 셋:
 *
 * | 지키는 것 | 왜 |
 * |---|---|
 * | **목록을 다시 받지 않는다** | 실패한 저장이 목록에 새 줄을 만들 수 없다 |
 * | **폼을 비우지 않는다** | 비우면 성공한 것처럼 보이고, 다시 시도하려면 사용자가 다 타이핑해야 한다 |
 * | **앞의 성공 알림을 지운다** | 남아 있으면 *"저장됨"*과 오류가 함께 보인다 |
 *
 * 셋째가 요점이다 — 성공과 실패 표시를 **각각의 상태**로 두면 그 조합이 생긴다. 그래서
 * 아래 `notice`는 **하나이고 판별 유니온**이다.
 *
 * ---
 *
 * # **저장은 성공했는데 목록 재조회가 실패하는** 갈래
 *
 * 앞의 셋은 *"저장이 실패했을 때"*를 다룬다. 그 반대편이 하나 더 있다.
 *
 * 재조회가 화면 전체를 갈아엎으면(가짜 `listSnapshots`를 두 번째 호출부터 500으로 두고 잰다):
 *
 * ```
 * 화면 전문 = "스냅샷을 열지 못했습니다서버 오류가 발생했습니다설계서로 돌아가기"
 * role=status → []            ← "저장됨"이 사라졌다
 * role=alert  → ["서버 오류가 발생했습니다"]
 * ```
 *
 * **성공했는데 실패만 보인다.** 그러면 사용자는 같은 태그로 다시 시도하고 **409**를 받는데,
 * 설계서 「스냅샷」이 스냅샷을 지울 수 없게 하므로 **그 태그는 영영 그 이름이다.** 되돌릴 수 없는
 * 자원에서 *"성공을 실패로 보이게 하는 것"*은 미뤄 두기에 값이 너무 크다.
 *
 * **갈아엎는 꼴:** 조회 이펙트가 무조건 `setState({status:'loading'})`으로 시작하고 실패하면
 * `{status:'failed'}`로 끝나면, **이미 그려져 있던 목록과 자식의 `notice`가 함께 사라진다.**
 *
 * **막는 것은 분기 하나다:** *"같은 프로젝트를 이미 그리고 있으면 재조회가 화면을 비우지도
 * 갈아엎지도 않는다."* 대신 `reloadFailure`를 세워 **저장 성공 알림과 나란히** 보인다.
 * **성공 경로도 이 분기가 지킨다** — 없으면 재조회가 느릴 때 그 사이 화면이 `loading`으로
 * 떨어져 *"저장됨"*이 사라진다(가짜가 마이크로태스크로 즉시 응답하면 테스트에서 안 보인다).
 *
 * **`signed-out`만 예외다.** 세션이 끊긴 것은 *"목록만 못 받았다"*가 아니므로 그때는 그대로
 * 로그인으로 보낸다 — 낡은 목록을 계속 보여 주면 사용자가 아직 로그인해 있다고 믿는다.
 *
 * > **복원이 이 구조를 그대로 쓴다.** 복원도 성공 뒤 목록을 다시 받아야 하고
 * > (프로젝트가 바뀌었고 안전망 스냅샷이 하나 생겼다), 그 재조회가 실패해도 **복원 성공
 * > 알림이 남아야 한다.** 복원은 저장보다 더 그렇다 — 사용자가 실패한 줄 알고 다시 누르면
 * > 이미 되돌아간 상태 위에 안전망 스냅샷이 하나 더 쌓이고, **스냅샷은 지울 수 없다**(「스냅샷」).
 * > 같은 `onSaved`·`reloadFailure` 경로를 타므로 분기를 새로 만들지 않는다.
 */
import { useEffect, useState, type FormEvent, type ReactElement, type RefObject } from 'react'
import { useApi } from '../api/context'
import { SignedOut, refusedBeforeCommit, toFailure, type Failure } from '../api/failure'
import type { ProjectDetail, RestoreResult, SnapshotSummary } from '../api/types'
import { projectAbilities } from '../projects/project-actions'
import { usePopoverDismiss } from './use-popover-dismiss'
import { usePopoverSide, type PopoverPlacement } from './use-popover-side'

/** 조회가 이유 없이 실패했을 때. 셸·테마 화면과 다른 문장이다 — 무엇을 못 불러왔는지가 다르다. */
const UNKNOWN_FAILURE = '스냅샷을 불러오지 못했습니다'
/** 조회 실패 화면의 제목. **태그와 겹치면 안 된다** — 셸의 같은 자리와 같은 이유다. */
const FAILURE_TITLE = '스냅샷을 열지 못했습니다'
/** 저장이 이유 없이 실패했을 때(서버가 `ApiError`를 주지 않은 경우). */
const SAVE_FAILURE = '스냅샷을 저장하지 못했습니다'
/** 복원이 이유 없이 실패했을 때. **저장과 다른 문장이다** — 무엇이 실패했는지가 다르다. */
const RESTORE_FAILURE = '복원하지 못했습니다'
/** 복원의 답을 잃었을 때 서버 문장 뒤에 붙인다(`runRestore`) — 복원됐을 수 있다. */
const RESTORE_UNANSWERED = '복원됐는지 알 수 없습니다. 화면 위 «다시 불러오기»로 지금 상태를 확인하세요.'
/**
 * **저장은 됐는데 목록만 못 받았을 때의 앞머리.** 이 문장이 없으면 화면이 *"실패"*만
 * 말하고, 사용자는 같은 태그로 다시 시도해 **409**를 받는다 — 그리고 스냅샷은 지울 수
 * 없으므로(설계서 「스냅샷」) 그 태그는 영영 그 이름이다(위 머리말 «저장은 성공했는데 …»).
 */
const RELOAD_FAILURE_PREFIX = '저장은 됐지만 목록을 갱신하지 못했습니다'

/**
 * 조회 상태. 성공·실패를 판별 유니온으로 가르는 까닭 — `null`로 실패를 판정하면 응답 전과 실패가 같은 값이 되어 로딩 중에 오류 화면이
 * 깜빡인다.
 *
 * **프로젝트와 목록을 함께 받는다.** 프로젝트는 **역할** 때문에 필요하다(그것 없이는 폼을
 * 열지 말지 화면이 모른다).
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; project: ProjectDetail; snapshots: SnapshotSummary[] }
  | { status: 'failed'; failure: Failure }

/**
 * 저장 결과 알림. **하나이고 판별 유니온이다** — 성공과 실패를 각각의 상태로 두면
 * *"저장됨"*과 오류가 함께 보이는 조합이 생긴다(위 머리말).
 */
type Notice =
  | { kind: 'saved'; tag: string }
  | { kind: 'error'; message: string }
  /**
   * 복원이 성공했다. **`saved`와 같은 유니온에 두는 것이 요점이다** — 따로 두면 *"저장됨"*과
   * *"되돌렸습니다"*가 함께 보이는 조합이 생긴다(위 머리말의 셋째 줄과 같은 이유).
   */
  | { kind: 'restored'; tag: string; result: RestoreResult }

/**
 * 셸 머리의 토글과 그 아래 팝오버.
 *
 * **본문은 열려 있는 동안만 마운트된다.** 그래서 열 때마다 목록을 다시 받고(`ExportPanel`과
 * 같은 판단 — 이 화면이 말하는 것은 전부 *"지금 무엇이 있는가"*다), **닫으면 확인 단계·폼·
 * 알림이 함께 초기화된다.**
 *
 * **복원 확인 중에 바깥을 눌러도 특례를 두지 않는다.** 그냥 닫히고 확인이 풀린다 — 예외를
 * 두면 *"언제 닫히는가"*가 화면마다 달라지고, 그 규칙을 사용자가 외워야 한다. 확인은
 * 되돌릴 수 없는 조작을 막는 장치인데 **닫히는 쪽이 안전한 방향**이기도 하다.
 */
export function SnapshotsPanel(props: {
  projectId: string
  /**
   * **복원을 보낸다** — 그 요청에 실은 복원 id(`x-wb-restore-id`)를 넘긴다(`EditorStore.beginOwnRestore`). 셸이 답이 오기 전에 온 그 id 의
   * 신호를 답까지 미룬다. 보낸 뒤에는 아래 셋 가운데 하나를 반드시 부른다 — 같은 복원 id 로.
   */
  onRestoreSent: (clientRestoreId: string) => void
  /**
   * 복원이 성공했다. 셸이 이것을 받아 문서와 트리를 다시 읽는다(위 머리말). 그 복원의 안전망 스냅샷 id 를 넘긴다 — 셸이 되돌아오는 내 복원의
   * 신호를 알아본다(`EditorStore.ownRestoreAnswered`).
   */
  onRestored: (clientRestoreId: string, safetySnapshotId: string) => void
  /** **커밋 전에 거절됐다**(4xx · 봉투 있는 500) — 복원이 안 됐다(`EditorStore.ownRestoreRefused`). */
  onRestoreRefused: (clientRestoreId: string) => void
  /**
   * **복원의 답을 잃었다** — 서버가 복원했는지 모른다(`EditorStore.markRestoreUnanswered`). 셸이 «복원됐는지 모릅니다 — 다시 불러오기»를 세운다.
   * 커밋 전에 거절된 실패는 여기가 아니라 위 `onRestoreRefused`다 — 복원이 안 됐다.
   */
  onRestoreUnanswered: (clientRestoreId: string) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  /** **토글까지 감싸는 상자에 건다** — 그 배치가 훅의 계약이다(`use-popover-dismiss.ts`). */
  const rootRef = usePopoverDismiss(open, () => setOpen(false))
  /** 머리가 접혀 상자가 화면 밖으로 나가면 붙일 쪽을 바꾸거나 끌어온다(`use-popover-side.ts`). */
  const { placement, bodyRef } = usePopoverSide(rootRef, open)

  return (
    <div className="wb-shell-snapshots" ref={rootRef}>
      <button
        type="button"
        className="wb-shell-snapshots-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        스냅샷
      </button>
      {open && (
        <SnapshotsBody
          projectId={props.projectId}
          onRestoreSent={props.onRestoreSent}
          onRestored={props.onRestored}
          onRestoreRefused={props.onRestoreRefused}
          onRestoreUnanswered={props.onRestoreUnanswered}
          placement={placement}
          bodyRef={bodyRef}
        />
      )}
    </div>
  )
}

/** 조회와 그 실패를 든다. 열려 있는 동안만 산다 — 마운트가 곧 조회다(위 머리말). */
function SnapshotsBody(props: {
  projectId: string
  onRestoreSent: (clientRestoreId: string) => void
  onRestored: (clientRestoreId: string, safetySnapshotId: string) => void
  onRestoreRefused: (clientRestoreId: string) => void
  onRestoreUnanswered: (clientRestoreId: string) => void
  /** 붙일 자리와 잴 상자 — 토글을 감싼 쪽이 고른다(`use-popover-side.ts`). */
  placement: PopoverPlacement
  bodyRef: RefObject<HTMLDivElement | null>
}): ReactElement {
  const { projectId } = props
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  /** 목록을 다시 받게 하는 값. 저장이 **성공했을 때만** 올린다. */
  const [reloadToken, setReloadToken] = useState(0)
  /**
   * **저장은 됐는데 목록만 못 받았을 때의 문장.** `null`이면 그런 일이 없었다는 뜻이다.
   * 위 머리말의 일곱째가 이 상태의 존재 이유다.
   */
  const [reloadFailure, setReloadFailure] = useState<string | null>(null)

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다(이 저장소의 조회들이 쓰는 형식).
    let alive = true

    // **이미 같은 프로젝트를 그리고 있으면 비우지 않는다**(머리말의 일곱째). 프로젝트가
    // 바뀌는 것은 다른 화면이므로 그때는 비운다 — `prev.project.id`를 보는 것이 그 갈림이다.
    setState((prev) => (prev.status === 'ready' && prev.project.id === projectId ? prev : { status: 'loading' }))
    setReloadFailure(null)

    async function load(): Promise<void> {
      try {
        // **둘을 함께 받는다.** 역할 없이는 폼을 열지 말지 못 정하고, 목록 없이는 그릴
        // 것이 없다. `Promise.all`이라 왕복이 하나다.
        const [project, snapshots] = await Promise.all([api.getProject(projectId), api.listSnapshots(projectId)])
        if (!alive) return
        setState({ status: 'ready', project, snapshots })
        setReloadFailure(null)
      } catch (caught) {
        if (!alive) return
        const failure = toFailure(caught, UNKNOWN_FAILURE)

        // 세션이 끊긴 것은 *"목록만 못 받았다"*가 아니다 — 낡은 목록을 계속 보여 주면
        // 사용자가 아직 로그인해 있다고 믿는다.
        if (failure.kind === 'signed-out') {
          setState({ status: 'failed', failure })
          return
        }

        // **이미 그리고 있던 화면은 갈아엎지 않는다.** 첫 조회가 실패한 경우에만 오류 화면이다.
        setState((prev) => (prev.status === 'ready' ? prev : { status: 'failed', failure }))
        setReloadFailure(failure.message)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [api, projectId, reloadToken])

  /**
   * **`.wb-shell-notice`를 쓰지 않는다.** 그것은 셸에 이르지 못한 **화면 전체**의 자리이고
   * (조회 중·조회 실패), 여기는 셸이 이미 떠 있는 위의 작은 상자다. 셋을 한 상자 안에서
   * 갈아 끼우는 것이 `ExportPanel`과 같은 모양이다.
   *
   * **`<main>`도 `<h1>`도 아니다.** 별도 라우트였을 때는 이것이 그 화면의 랜드마크였지만,
   * 팝오버 안에서는 문서에 랜드마크가 둘이 되고 제목이 셸의 프로젝트 이름과 경쟁한다.
   * 이름은 토글 버튼의 글자가 나른다.
   */
  return (
    <div
      className="wb-shell-snapshots-body"
      role="group"
      aria-label="스냅샷"
      ref={props.bodyRef}
      data-side={props.placement.side}
      style={props.placement.style}
    >
      {state.status === 'loading' && <p role="status">불러오는 중…</p>}
      {state.status === 'failed' &&
        // 세션이 끊겼으면 오류가 아니라 로그인이다(`api/failure.tsx`). 셸·테마 화면과 같은 판정이다.
        (state.failure.kind === 'signed-out' ? (
          <SignedOut />
        ) : (
          <>
            {/* **제목을 남긴다.** *"목록을 통째로 못 받았다"*와 *"저장이 실패했다"*는 다른
                사실인데, 서버 문장만 있으면 둘이 같은 모양으로 보인다. */}
            <p className="wb-shell-snapshots-failure">{FAILURE_TITLE}</p>
            <p role="alert">{state.failure.message}</p>
          </>
        ))}
      {state.status === 'ready' && (
        <SnapshotsScreen
          project={state.project}
          snapshots={state.snapshots}
          reloadFailure={reloadFailure}
          onSaved={() => setReloadToken((token) => token + 1)}
          onRestoreSent={props.onRestoreSent}
          onRestored={props.onRestored}
          onRestoreRefused={props.onRestoreRefused}
          onRestoreUnanswered={props.onRestoreUnanswered}
        />
      )}
    </div>
  )
}

/**
 * 복원 결과. **머리말 «복원»의 «결과가 말할 것 셋»을 한 자리에서 말한다.**
 *
 * `role="status"`다 — 실패가 아니므로 `alert`이 아니고, 그래도 스크린리더가 읽어야 한다
 * (프로젝트 전체가 방금 바뀌었다).
 */
function RestoreNotice(props: { tag: string; result: RestoreResult }): ReactElement {
  const { pages } = props.result.summary

  return (
    <div className="wb-shell-snapshots-restored" role="status">
      <p className="wb-shell-snapshots-restored-line">
        {props.tag}(으)로 되돌렸습니다. 페이지 {pages.schemaChanged}개가 바뀌고 {pages.schemaUnchanged}개는
        그대로입니다.
      </p>
      {/* **되돌리려면 이것** — 서버가 복원 직전 상태를 자동으로 얼려 준다. */}
      <p className="wb-shell-snapshots-restored-line">
        되돌리기 전 상태는 “{props.result.safetySnapshot.tag}”에 저장했습니다.
      </p>
    </div>
  )
}

function SnapshotsScreen(props: {
  project: ProjectDetail
  snapshots: SnapshotSummary[]
  /** 저장은 됐는데 목록만 못 받았을 때의 서버 문장. 없으면 `null`. */
  reloadFailure: string | null
  onSaved: () => void
  /** 복원을 보낸다(`SnapshotsPanel`의 같은 이름). */
  onRestoreSent: (clientRestoreId: string) => void
  /** 복원이 성공했다. **`onSaved`와 갈라 둔다** — 아래 `runRestore`의 주석. */
  onRestored: (clientRestoreId: string, safetySnapshotId: string) => void
  /** 커밋 전에 거절됐다(`SnapshotsPanel`의 같은 이름). */
  onRestoreRefused: (clientRestoreId: string) => void
  /** 복원의 답을 잃었다(`SnapshotsPanel`의 같은 이름). */
  onRestoreUnanswered: (clientRestoreId: string) => void
}): ReactElement {
  const api = useApi()
  const abilities = projectAbilities(props.project.role)

  const [tag, setTag] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  /** 확인을 기다리는 스냅샷의 id. `null`이면 아무것도 안 물어보고 있다(머리말 «복원»의 확인 단계). */
  const [confirming, setConfirming] = useState<string | null>(null)
  /** 지금 되돌리는 중인 스냅샷의 id. 두 번 눌리는 것을 막는다 — 스냅샷은 지울 수 없다(「스냅샷」). */
  const [restoring, setRestoring] = useState<string | null>(null)

  async function runRestore(snapshot: SnapshotSummary): Promise<void> {
    if (restoring !== null) return

    // 저장과 같은 규칙 — **앞의 알림을 먼저 지운다**(위 머리말의 셋째 줄).
    setNotice(null)
    setConfirming(null)
    setRestoring(snapshot.id)
    // **이 복원의 id** — 서버가 그 신호에 되돌려 준다(`x-wb-restore-id`). 답이 오기 전 · 답을 잃은 뒤의 신호를 셸이 알아본다.
    const clientRestoreId = crypto.randomUUID()
    props.onRestoreSent(clientRestoreId)
    try {
      const result = await api.restoreSnapshot(props.project.id, snapshot.id, { clientRestoreId })
      setNotice({ kind: 'restored', tag: snapshot.tag, result })
      // **성공했을 때만** 목록을 다시 받는다. 프로젝트가 바뀌었고 안전망 스냅샷이 하나 생겼다.
      props.onSaved()
      /**
       * **셸에도 알린다 — 팝오버라서 지는 몫이다**(머리말). 별도 라우트면 되돌리고
       * 설계서로 돌아오는 길에 셸이 자연히 다시 읽히지만, 팝오버는 에디터 **위에** 뜨므로
       * 그 길이 없다. 안 알리면 **되돌렸는데 캔버스는 옛 문서를 그대로 보인다.**
       *
       * **`onSaved`에 얹지 않는다.** 저장은 이 목록만 바꾸고 복원은 **프로젝트 전체**를
       * 바꾼다 — 한 신호로 접으면 스냅샷을 하나 만들 때마다 셸이 문서와 트리를 다시 읽는다.
       */
      props.onRestored(clientRestoreId, result.safetySnapshot.id)
    } catch (caught) {
      const failure = toFailure(caught, RESTORE_FAILURE)
      // 저장 쪽과 같은 판단이다 — 세션이 끊긴 것은 다음 조회가 `SignedOut`으로 보낸다.
      // 그 밖에는 **서버 문장을 그대로 그린다**: 409 넷과 400 셋을 화면은 `code`로 가를 수 없다.
      const message = failure.kind === 'signed-out' ? RESTORE_FAILURE : failure.message
      // **커밋 전에 거절됐는지 모르면 복원됐을 수 있다**(`refusedBeforeCommit`) — 답만 잃었으면 서버는 복원했거나 아직 하는 중이다.
      // 셸이 «복원됐는지 모릅니다 — 다시 불러오기»를 세우고(그 신호가 뒤에 오면 다시 세운다), 여기서도 그렇다고 말한다.
      const unanswered = failure.kind !== 'signed-out' && !refusedBeforeCommit(caught)
      setNotice({ kind: 'error', message: unanswered ? `${message} — ${RESTORE_UNANSWERED}` : message })
      if (unanswered) props.onRestoreUnanswered(clientRestoreId)
      else props.onRestoreRefused(clientRestoreId)
    } finally {
      setRestoring(null)
    }
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (saving) return

    // **앞의 알림을 먼저 지운다.** 남겨 두면 이번 저장이 실패했을 때 앞의 *"저장됨"*이
    // 오류와 함께 보인다(위 머리말의 셋째 줄).
    setNotice(null)
    setSaving(true)
    try {
      await api.createSnapshot(props.project.id, {
        // **빈 설명은 키를 만들지 않는다.** `''`를 보내면 *"설명이 빈 문자열"*이 되고
        // `null`(적지 않음)과 갈린다 — 서버가 둘을 다르게 저장한다.
        tag,
        ...(description === '' ? {} : { description }),
      })
      setNotice({ kind: 'saved', tag })
      // **성공했을 때만** 폼을 비우고 목록을 다시 받는다.
      setTag('')
      setDescription('')
      props.onSaved()
    } catch (caught) {
      const failure = toFailure(caught, SAVE_FAILURE)
      // 세션이 끊긴 것은 이 화면이 다룰 일이 아니다 — 다음 조회가 `SignedOut`으로 보낸다.
      // 여기서는 서버 문장을 그대로 그린다(두 409를 가르는 것이 그 문장이다).
      setNotice({
        kind: 'error',
        message: failure.kind === 'signed-out' ? SAVE_FAILURE : failure.message,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="wb-shell-snapshots-form" aria-label="스냅샷 저장">
        {abilities.createSnapshot ? (
          /* **`<form>`·`<input>`·제출 버튼에 클래스가 붙어 있다.** `shell.css` 머리말의 규칙이 요소 선택자와 자손
             선택자를 막으므로 클래스가 없으면 이 셋의 폭을 정할 길이 아예 없다 — 520px
             팝오버에서 셋이 한 줄로 눌려 `태그` 입력과 `설명` 라벨이 붙는다. */
          <form className="wb-shell-snapshots-fields" onSubmit={(event) => void save(event)}>
            <label className="wb-shell-snapshots-field">
              <span>태그</span>
              <input
                className="wb-shell-snapshots-input"
                name="tag"
                value={tag}
                maxLength={60}
                required
                onChange={(event) => setTag(event.target.value)}
              />
            </label>
            <label className="wb-shell-snapshots-field">
              <span>설명</span>
              <input
                className="wb-shell-snapshots-input"
                name="description"
                value={description}
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <button type="submit" className="wb-shell-snapshots-save" disabled={saving}>
              지금 상태를 태그로 저장
            </button>
          </form>
        ) : (
          // **폼 자리에 이유를 적는다.** 빈자리로 두면 화면이 왜 다른지 말해 주지 않는다.
          <p className="wb-shell-snapshots-readonly">스냅샷을 만들 권한이 없습니다. 목록은 볼 수 있습니다.</p>
        )}

        {notice === null ? null : notice.kind === 'saved' ? (
          <p className="wb-shell-snapshots-saved" role="status">
            {notice.tag} 저장됨
          </p>
        ) : notice.kind === 'restored' ? (
          <RestoreNotice tag={notice.tag} result={notice.result} />
        ) : (
          <p className="wb-shell-snapshots-error" role="alert">
            {notice.message}
          </p>
        )}

        {/* **`notice`와 나란히 선다 — 대신하지 않는다**(머리말의 일곱째). 저장 성공과 목록
            갱신 실패는 **서로 다른 사실**이고, 하나로 접으면 둘 중 하나가 사라진다. */}
        {props.reloadFailure === null ? null : (
          <p className="wb-shell-snapshots-error" role="alert">
            {RELOAD_FAILURE_PREFIX}: {props.reloadFailure}
          </p>
        )}
      </section>

      <section className="wb-shell-snapshots-list" aria-label="스냅샷 목록">
        {props.snapshots.length === 0 ? (
          <p className="wb-shell-snapshots-empty">아직 스냅샷이 없습니다.</p>
        ) : (
          // **`<ul>`에도 클래스가 필요하다.** `shell.css` 머리말의 규칙이 자손 선택자를 막으므로
          // `.wb-shell-snapshots-list`에서 안쪽 `<ul>`을 겨냥할 수 없다 — 클래스가 없으면
          // `•`와 UA 기본 여백이 그대로 보인다.
          <ul className="wb-shell-snapshots-rows">
            {props.snapshots.map((snapshot) => (
              /* **칸 순서가 곧 레이아웃이다 — 설명이 맨 뒤다.**
                 줄은 `flex-wrap: wrap`이고 설명만 `flex-basis: 100%`라 **자기 줄을 통째로
                 쓴다**(`shell.css`). 설명을 앞으로 되돌리면 그 100%가 태그 **바로 뒤**에서
                 줄을 끊어, 태그 혼자 첫 줄에 남고 나머지가 셋째 줄로 밀린다.
                 읽는 순서로도 이쪽이 맞다 — 태그·만든 사람·시각·크기가 한 줄, 긴 설명이 그 아래다. */
              <li key={snapshot.id} className="wb-shell-snapshots-row">
                <span className="wb-shell-snapshots-tag">{snapshot.tag}</span>
                <span className="wb-shell-snapshots-author">{snapshot.createdByName}</span>
                <span className="wb-shell-snapshots-time">{snapshot.createdAt}</span>
                {/* **`payloadBytes`를 그대로 그린다**(설계서 「열린 질문」의 스냅샷 보관 정책을 닫을 관측이다).
                    `toLocaleString`은 자릿수 구분만 하고 단위를 바꾸지 않는다 — KB로 접으면
                    작은 스냅샷들이 전부 `0KB`가 되어 관측이 사라진다. */}
                <span className="wb-shell-snapshots-bytes">{snapshot.payloadBytes.toLocaleString()}B</span>
                {/* **owner가 아니면 이 자리가 아예 비어 있다** — 회색 버튼을 두지 않는다(머리말 «권한»). */}
                {abilities.restoreSnapshot ? (
                  confirming === snapshot.id ? (
                    <span className="wb-shell-snapshots-confirm">
                      {/* **무엇을 되돌리는지 문장에 태그가 들어간다.** 줄이 여럿인 목록에서
                          "정말 되돌립니까?"만으로는 어느 줄에 답하는지 알 수 없다. */}
                      <span role="alert">{snapshot.tag}(으)로 되돌립니다. 프로젝트 전체가 바뀝니다.</span>
                      <button type="button" disabled={restoring !== null} onClick={() => void runRestore(snapshot)}>
                        되돌린다
                      </button>
                      <button type="button" onClick={() => setConfirming(null)}>
                        취소
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="wb-shell-snapshots-restore"
                      disabled={restoring !== null}
                      onClick={() => setConfirming(snapshot.id)}
                    >
                      이 상태로 되돌리기
                    </button>
                  )
                ) : null}
                {/* **맨 뒤다**(위 주석). 안전망 스냅샷의 설명은 서버가 복원마다 만드는 긴
                    문자열이라(`"…"(으)로 복원하기 직전 상태 — 스냅샷 <uuid>`) 이 줄에서
                    가장 긴 칸이 되는 것이 예외가 아니라 보통이다. */}
                <span className="wb-shell-snapshots-desc">{snapshot.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
