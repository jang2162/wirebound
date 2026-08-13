/**
 * 스냅샷 화면(P6-1 D10). 주소는 `/projects/:projectId/snapshots`이고 **에디터 셸 밖이다** —
 * `routes/theme-editor.tsx`가 같은 꼴이고 근거도 같다: §9의 3분할에 이 화면이 들어갈 자리가
 * 없고, 주소가 있어야 공유·새로고침이 된다.
 *
 * ---
 *
 * # 복원 — **확인을 받고, 결과를 말한다**(P6-2 D11)
 *
 * P6-1은 *"없는 기능을 UI에 그려 두지 않는다"*며 복원 버튼을 두지 않았다. P6-2가 그 기능을
 * 만들었으므로 줄마다 버튼이 선다.
 *
 * **확인 단계를 둔다.** 되돌릴 수 없는 조작은 아니지만(서버가 복원 **직전** 상태를 스냅샷으로
 * 떠 준다) **프로젝트 전체가 바뀐다.** 확인은 그 줄 안에서 받는다 — `window.confirm`을 쓰지
 * 않는 이유는 그것이 브라우저 모달이라 케이스가 그 문장을 읽지 못하고, 무엇을 되돌리는지
 * (어느 태그인지)를 화면에 붙여 보여 줄 수도 없기 때문이다.
 *
 * **결과가 말할 것 넷:** 바뀐 페이지 수 · **그대로인 페이지 수** · 안전망 스냅샷의 태그 ·
 * 테마가 다르면 그 사실. 둘째가 빠지면 *"0개가 바뀌었습니다"*가 **아무 일도 안 일어난 것**과
 * **전부 그대로였던 것**을 구분하지 못한다.
 *
 * ---
 *
 * # 권한 — 읽기는 열고, 생성은 editor, 복원은 owner다
 *
 * §10이 스냅샷 **생성**을 editor에게 열고 **복원만 owner**로 두었다. 그래서 이 화면은
 * viewer에게도 목록을 보여 주고 **폼과 복원 버튼만 닫는다** — 막으면 viewer가 *"이 프로젝트에
 * 어떤 기록이 있는지"*조차 못 본다(테마 저작 화면이 같은 자리에서 같은 판단을 했다).
 *
 * **owner가 아니면 복원 버튼이 아예 없다 — 회색으로 만들어 두지 않는다**(D11). 비활성 버튼은
 * *"권한이 없다"*가 아니라 *"지금은 안 된다"*로 읽힌다.
 *
 * 판정은 여기서 하지 않는다 — `projectAbilities(project.role)`의 `createSnapshot`·
 * `restoreSnapshot` 둘을 본다(`test/role-access.test.ts`가 `.role`을 읽는 자리가 전부 그
 * 함수의 인자 자리인지 실행으로 센다). **그 둘은 값이 실제로 갈린다** — editor는 만들 수
 * 있고 되돌릴 수 없다.
 *
 * ---
 *
 * # 실패가 화면에 남는 방식 (계획서 T4)
 *
 * **두 409를 다른 문장으로 보여야 한다.** 사용자가 할 일이 다르기 때문이다 — 태그 중복은
 * *"이름을 바꾼다"*이고 지문 불일치는 *"그대로 다시 보낸다"*이다. 코드는 둘 다 `conflict`이라
 * **화면이 코드로는 가를 수 없고**, 서버가 문장을 갈라 준다. 그래서 이 화면은 문안을 다시
 * 쓰지 않고 **서버 문장을 그대로 그린다**(`api/failure.tsx`의 판단과 같다: *"화면이 문안을
 * 다시 쓰면 서버가 이유를 바꿔도 사용자는 옛 이유를 듣는다"*).
 *
 * **"실패했다고 말하는데 조작은 일어났다"의 화면판을 닫는다**(P5-1·P5-2·P5-3에서 여섯 형태가
 * 관측된 그 부류). 저장이 실패했을 때 이 화면이 지키는 것 셋:
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
 * # 일곱째 — **저장은 성공했는데 목록 재조회가 실패하는** 갈래
 *
 * 앞의 셋은 *"저장이 실패했을 때"*를 다룬다. 그 반대편이 하나 더 있었고 **리뷰가 찾았다.**
 *
 * 재현(가짜 `listSnapshots`를 두 번째 호출부터 500으로 두고 쟀다):
 *
 * ```
 * 화면 전문 = "스냅샷을 열지 못했습니다서버 오류가 발생했습니다설계서로 돌아가기"
 * role=status → []            ← "저장됨"이 사라졌다
 * role=alert  → ["서버 오류가 발생했습니다"]
 * ```
 *
 * **성공했는데 실패만 보인다.** 그러면 사용자는 같은 태그로 다시 시도하고 **409**를 받는데,
 * §4.5가 스냅샷을 지울 수 없게 했으므로 **그 태그는 영영 그 이름이다.** 되돌릴 수 없는
 * 자원에서 *"성공을 실패로 보이게 하는 것"*은 이월로 두기에 값이 너무 크다.
 *
 * **원인은 재조회가 화면 전체를 갈아엎는 것이었다.** 조회 이펙트가 무조건
 * `setState({status:'loading'})`으로 시작하고 실패하면 `{status:'failed'}`로 끝나, **이미
 * 그려져 있던 목록과 자식의 `notice`가 함께 사라졌다.**
 *
 * **고친 방식은 분기 하나다:** *"같은 프로젝트를 이미 그리고 있으면 재조회가 화면을 비우지도
 * 갈아엎지도 않는다."* 대신 `reloadFailure`를 세워 **저장 성공 알림과 나란히** 보인다.
 * 부수적으로 **성공 경로도 고쳐진다** — 앞 판은 재조회가 느리면 그 사이 화면이 `loading`으로
 * 떨어져 *"저장됨"*이 사라졌다(가짜가 마이크로태스크로 즉시 응답해 테스트에서 안 보였을
 * 뿐이다).
 *
 * **`signed-out`만 예외다.** 세션이 끊긴 것은 *"목록만 못 받았다"*가 아니므로 그때는 그대로
 * 로그인으로 보낸다 — 낡은 목록을 계속 보여 주면 사용자가 아직 로그인해 있다고 믿는다.
 *
 * > **복원이 이 구조를 그대로 쓴다(P6-2 D11).** 복원도 성공 뒤 목록을 다시 받아야 하고
 * > (프로젝트가 바뀌었고 안전망 스냅샷이 하나 생겼다), 그 재조회가 실패해도 **복원 성공
 * > 알림이 남아야 한다.** 복원은 저장보다 더 그렇다 — 사용자가 실패한 줄 알고 다시 누르면
 * > 이미 되돌아간 상태 위에 안전망 스냅샷이 하나 더 쌓이고, **스냅샷은 지울 수 없다**(§4.5).
 * > 같은 `onSaved`·`reloadFailure` 경로를 타므로 분기를 새로 만들지 않는다.
 */
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Link, useParams } from 'react-router'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ProjectDetail, RestoreResult, SnapshotSummary } from '../api/types'
import { projectAbilities } from '../projects/project-actions'

/** 조회가 이유 없이 실패했을 때. 셸·테마 화면과 다른 문장이다 — 무엇을 못 불러왔는지가 다르다. */
const UNKNOWN_FAILURE = '스냅샷을 불러오지 못했습니다'
/** 조회 실패 화면의 제목. **태그와 겹치면 안 된다** — 셸의 같은 자리와 같은 이유다. */
const FAILURE_TITLE = '스냅샷을 열지 못했습니다'
/** 저장이 이유 없이 실패했을 때(서버가 `ApiError`를 주지 않은 경우). */
const SAVE_FAILURE = '스냅샷을 저장하지 못했습니다'
/** 복원이 이유 없이 실패했을 때. **저장과 다른 문장이다** — 무엇이 실패했는지가 다르다. */
const RESTORE_FAILURE = '복원하지 못했습니다'
/**
 * **저장은 됐는데 목록만 못 받았을 때의 앞머리.** 이 문장이 없으면 화면이 *"실패"*만
 * 말하고, 사용자는 같은 태그로 다시 시도해 **409**를 받는다 — 그리고 스냅샷은 지울 수
 * 없으므로(§4.5) 그 태그는 영영 그 이름이다(아래 머리말의 일곱째).
 */
const RELOAD_FAILURE_PREFIX = '저장은 됐지만 목록을 갱신하지 못했습니다'

/**
 * 조회 상태. 성공·실패를 판별 유니온으로 가르는 것은 `routes/theme-editor.tsx`와 같은
 * 이유다 — `null`로 실패를 판정하면 응답 전과 실패가 같은 값이 되어 로딩 중에 오류 화면이
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

export function SnapshotsRoute(): ReactElement {
  const params = useParams()
  const projectId = params.projectId ?? ''
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
        // 것이 없다. `Promise.all`이라 왕복이 하나다(`theme-editor.tsx`와 같은 형식).
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

  if (state.status === 'loading') {
    return (
      <main className="wb-shell-notice">
        <p role="status">불러오는 중…</p>
      </main>
    )
  }

  if (state.status === 'failed') {
    // 세션이 끊겼으면 오류가 아니라 로그인이다(설계 D5). 셸·테마 화면과 같은 판정이다.
    if (state.failure.kind === 'signed-out') return <SignedOut />
    return (
      <main className="wb-shell-notice">
        <h1>{FAILURE_TITLE}</h1>
        <p role="alert">{state.failure.message}</p>
        <Link to={`/projects/${projectId}`}>설계서로 돌아가기</Link>
      </main>
    )
  }

  return (
    <SnapshotsScreen
      project={state.project}
      snapshots={state.snapshots}
      reloadFailure={reloadFailure}
      onSaved={() => setReloadToken((token) => token + 1)}
    />
  )
}

/**
 * 복원 결과. **D11이 요구한 넷을 한 자리에서 말한다.**
 *
 * `role="status"`다 — 실패가 아니므로 `alert`이 아니고, 그래도 스크린리더가 읽어야 한다
 * (프로젝트 전체가 방금 바뀌었다).
 *
 * **테마는 다를 때만 말한다.** 같을 때도 *"테마는 그대로입니다"*를 붙이면 매번 보이는 줄이
 * 되어 다를 때의 신호가 묻힌다 — 복원이 되돌리지 **않은** 것을 알리는 자리이기 때문이다.
 */
function RestoreNotice(props: { tag: string; result: RestoreResult }): ReactElement {
  const { pages } = props.result.summary
  const themesDiffer = props.result.themes.some((theme) => theme.differs)

  return (
    <div className="wb-shell-snapshots-restored" role="status">
      <p className="wb-shell-snapshots-restored-line">
        {props.tag}(으)로 되돌렸습니다. 페이지 {pages.schemaChanged}개가 바뀌고 {pages.schemaUnchanged}개는
        그대로입니다.
      </p>
      {/* **되돌리려면 이것** — 서버가 복원 직전 상태를 자동으로 얼려 준다(서버 D2). */}
      <p className="wb-shell-snapshots-restored-line">
        되돌리기 전 상태는 “{props.result.safetySnapshot.tag}”에 저장했습니다.
      </p>
      {themesDiffer ? (
        <p className="wb-shell-snapshots-restored-line">
          테마는 스냅샷 당시와 다릅니다. 복원은 테마 문서를 되돌리지 않습니다.
        </p>
      ) : null}
    </div>
  )
}

function SnapshotsScreen(props: {
  project: ProjectDetail
  snapshots: SnapshotSummary[]
  /** 저장은 됐는데 목록만 못 받았을 때의 서버 문장. 없으면 `null`. */
  reloadFailure: string | null
  onSaved: () => void
}): ReactElement {
  const api = useApi()
  const abilities = projectAbilities(props.project.role)

  const [tag, setTag] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  /** 확인을 기다리는 스냅샷의 id. `null`이면 아무것도 안 물어보고 있다(D11의 확인 단계). */
  const [confirming, setConfirming] = useState<string | null>(null)
  /** 지금 되돌리는 중인 스냅샷의 id. 두 번 눌리는 것을 막는다 — 스냅샷은 지울 수 없다(§4.5). */
  const [restoring, setRestoring] = useState<string | null>(null)

  async function runRestore(snapshot: SnapshotSummary): Promise<void> {
    if (restoring !== null) return

    // 저장과 같은 규칙 — **앞의 알림을 먼저 지운다**(위 머리말의 셋째 줄).
    setNotice(null)
    setConfirming(null)
    setRestoring(snapshot.id)
    try {
      const result = await api.restoreSnapshot(props.project.id, snapshot.id)
      setNotice({ kind: 'restored', tag: snapshot.tag, result })
      // **성공했을 때만** 목록을 다시 받는다. 프로젝트가 바뀌었고 안전망 스냅샷이 하나 생겼다.
      props.onSaved()
    } catch (caught) {
      const failure = toFailure(caught, RESTORE_FAILURE)
      // 저장 쪽과 같은 판단이다 — 세션이 끊긴 것은 다음 조회가 `SignedOut`으로 보낸다.
      // 그 밖에는 **서버 문장을 그대로 그린다**: 409 넷과 400 셋을 화면은 `code`로 가를 수 없다.
      setNotice({ kind: 'error', message: failure.kind === 'signed-out' ? RESTORE_FAILURE : failure.message })
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
    <main className="wb-shell-snapshots">
      <header className="wb-shell-snapshots-header">
        <h1 className="wb-shell-snapshots-title">스냅샷</h1>
        <Link className="wb-shell-snapshots-back" to={`/projects/${props.project.id}`}>
          설계서로 돌아가기
        </Link>
      </header>

      <section className="wb-shell-snapshots-form" aria-label="스냅샷 저장">
        {abilities.createSnapshot ? (
          <form onSubmit={(event) => void save(event)}>
            <label className="wb-shell-snapshots-field">
              <span>태그</span>
              <input
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
                name="description"
                value={description}
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <button type="submit" disabled={saving}>
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
          <ul>
            {props.snapshots.map((snapshot) => (
              <li key={snapshot.id} className="wb-shell-snapshots-row">
                <span className="wb-shell-snapshots-tag">{snapshot.tag}</span>
                <span className="wb-shell-snapshots-desc">{snapshot.description}</span>
                <span className="wb-shell-snapshots-author">{snapshot.createdByName}</span>
                <span className="wb-shell-snapshots-time">{snapshot.createdAt}</span>
                {/* **`payloadBytes`를 그대로 그린다**(§16의 보관 정책을 닫을 관측이다).
                    `toLocaleString`은 자릿수 구분만 하고 단위를 바꾸지 않는다 — KB로 접으면
                    작은 스냅샷들이 전부 `0KB`가 되어 관측이 사라진다. */}
                <span className="wb-shell-snapshots-bytes">{snapshot.payloadBytes.toLocaleString()}B</span>
                {/* **owner가 아니면 이 자리가 아예 비어 있다** — 회색 버튼을 두지 않는다(D11). */}
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
