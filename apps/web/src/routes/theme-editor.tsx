/**
 * 테마 저작 화면. 주소는 `/projects/:projectId/themes/:themeId`이고
 * **에디터 셸 안이 아니다.**
 *
 * 근거 셋 — ㉠ 설계서 「설계서 화면 구조」의 3분할에 테마 편집이 들어갈 자리가 없고
 * ㉡ 갤러리와 캔버스가 *"화면 전체를 쓰는 미리보기"* 자리를 다투며 ㉢ 주소가 있어야
 * 공유·새로고침이 된다.
 *
 * ---
 *
 * # **좌우 2분할.** 왼쪽 편집 패널(탭 둘), 오른쪽 갤러리
 *
 * 셋(토큰·JSON·갤러리)을 탭으로 가르지 않고 **좌우로 둔다.**
 *
 * 1. **갤러리가 *"실시간으로 그린다"*는 것은 둘이 동시에 보여야 성립한다.** 갤러리를 탭으로 가르면
 *    입력과 결과가 같은 화면에 없어 그 성질이 사라진다 — 그러면 갤러리는 미리보기가 아니라
 *    "확인 화면"이 된다.
 * 2. **토큰 GUI와 JSON 에디터는 동시에 볼 이유가 약하다.** 둘은 **같은 초안의 다른 절**을
 *    편집한다(설계서 「tokens — 3단 분리」 vs `components`·`patterns`·`primitives`). 그래서 그 둘 **사이**는
 *    탭이다 — 나란히 두면 세로로 긴 폼 둘이 각자 절반 폭으로 좁아진다.
 * 3. **셸(「설계서 화면 구조」)이 이미 같은 골격이다** — 좌측에 편집 도구, 큰 자리에 미리보기.
 *
 * **이 파일이 그리는 것은 그 골격과 저장·이슈까지다.** 왼쪽 탭의 내용은 `TokenEditor`·`JsonEditor`,
 * 오른쪽 갤러리는 `ThemeGallery`가 채운다 — 여기 있는 것은 **자리와 배선**이다.
 *
 * ---
 *
 * # 권한 — 읽기는 열고 쓰기는 owner다
 *
 * 설계서 「권한 모델」은 *"테마 편집은 owner"*이고 서버가 그렇게 만들어져 있다: 읽기(`GET .../themes/:themeId`)는
 * **viewer 게이트**, 쓰기 둘은 **owner 게이트**. 화면도 그 선을 그대로 쓴다 —
 * **못 들어오게 하지 않고 읽기 전용으로 보여 준다.** 막으면 owner가 아닌 사람이 *"이
 * 프로젝트가 무엇을 입고 있는지"*조차 못 본다.
 *
 * 판정은 여기서 하지 않는다 — `projectAbilities(project.role).editTheme` 하나를 본다
 * (`test/role-access.test.ts`가 `.role`을 읽는 자리가 전부 그 함수의 인자 자리인지 실행으로
 * 센다).
 *
 * ---
 *
 * # 저장 안 한 변경을 들고 나갈 때 — **알리되 막지 않는다**
 *
 * - **알린다.** 제목 옆에 *"저장 안 함"*이 늘 보이고 저장 버튼이 활성이다.
 * - **막지 않는다.** react-router의 `useBlocker`는 **데이터 라우터**(`createBrowserRouter`)
 *   에서만 돌고 이 앱은 `<BrowserRouter>` + `<Routes>`다(`main.tsx`). 막으려면 라우터 구성을
 *   바꿔야 하고 그것은 이 화면 하나의 일보다 크다.
 * - **`beforeunload`도 안 건다.** 그것은 **탭을 닫는 것만** 잡고 앱 안 이동은 못 잡는다 —
 *   **반만 막는 것이 안 막는 것보다 나쁘다**(사용자가 막힌다고 믿게 된다).
 *
 * > **그러므로 이 라우트를 떠나면 초안이 사라진다.** 스토어가 라우트와 함께 살고 죽기
 * > 때문이다(아래 `storeRef`). 보존(localStorage 등)은 없다.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Theme } from '@wirebound/themes'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import { ApiError } from '../api/client'
import type { ProjectDetail, ThemeDetail } from '../api/types'
import { projectAbilities } from '../projects/project-actions'
import { ThemeDraftStore, isDirty } from '../store/theme-draft-store'
import { ThemeDraftProvider, useThemeDraft, useThemeDraftStore } from '../store/use-theme-draft'
import { resolveDraft, useDraftCss } from '../theme/draft-css'
import { ThemeIssueList, blocksSave } from '../theme/theme-issues'
import { TokenEditor } from '../theme/token-editor'
import { JsonEditor } from '../theme/json-editor'
import { ThemeGallery } from '../theme/theme-gallery'
import { ThemeIoPanel } from '../theme/theme-io-panel'

/** 조회가 이유 없이 실패했을 때. 셸 쪽(`설계서를 열지 못했습니다`)과 다른 문장이다. */
const UNKNOWN_FAILURE = '테마를 불러오지 못했습니다'
/** 조회 실패 화면의 제목. **테마 이름과 겹치면 안 된다** — 셸의 같은 자리와 같은 이유다. */
const FAILURE_TITLE = '테마를 열지 못했습니다'
/** 저장이 이유 없이 실패했을 때. */
const SAVE_FAILURE = '테마를 저장하지 못했습니다'

/**
 * 조회 상태. 성공·실패를 판별 유니온으로 가르는 것은 `routes/editor.tsx`와 같은 이유다 —
 * `null`로 실패를 판정하면 응답 전과 실패가 같은 값이 되어 로딩 중에 오류 화면이 깜빡인다.
 *
 * **프로젝트와 테마를 함께 받는다.** 프로젝트는 **역할** 때문에 필요하다(그것 없이는 읽기
 * 전용인지 아닌지 화면이 모른다). 둘을 따로 그리지 않는 것은 어느 하나가 없으면 이 화면이
 * 할 수 있는 일이 없기 때문이다 — 셸이 조회를 자리마다 나눈 것과 반대 판단이고, 그쪽은
 * 하나가 실패해도 나머지가 쓸모 있기 때문이다.
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; project: ProjectDetail; detail: ThemeDetail }
  | { status: 'failed'; failure: Failure }

export function ThemeEditorRoute(): ReactElement {
  const params = useParams()
  const projectId = params.projectId ?? ''
  const themeId = params.themeId ?? ''
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  /**
   * 초안 스토어는 이 라우트가 사는 동안 하나다. `useMemo`가 아니라 ref인 것은 `useMemo`가
   * 캐시일 뿐 동일성 보장이 아니기 때문이다 — React가 값을 버리면 새 스토어가 생기고 그
   * 순간 초안이 조용히 사라진다(`routes/editor.tsx`의 `storeRef`와 같은 근거).
   */
  const storeRef = useRef<ThemeDraftStore | null>(null)
  if (storeRef.current === null) storeRef.current = new ThemeDraftStore()
  const store = storeRef.current

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다(이 저장소의 조회들이 쓰는 형식).
    let alive = true

    // **조회를 시작할 때 비운다.** 응답 뒤에 갈아 끼우면 조회가 도는 동안 주소는 새 테마인데
    // 스토어는 앞 테마의 초안을 들고 있다 — `routes/editor.tsx`가 `clearPage()`를 조회
    // **시작**에 두는 것과 같은 자리이고, 그쪽이 그 창을 실측으로 확인했다.
    store.clearTheme()
    setState({ status: 'loading' })

    async function load(): Promise<void> {
      try {
        // **둘을 함께 받는다.** 역할 없이는 읽기 전용 여부를 못 그리고, 테마 없이는 그릴
        // 것이 없다. `Promise.all`이라 왕복이 하나다(`theme-picker.tsx`와 같은 형식).
        const [project, detail] = await Promise.all([
          api.getProject(projectId),
          api.getTheme(projectId, themeId),
        ])
        if (!alive) return
        store.loadTheme(detail.id, detail.theme, {
          base: detail.base ?? null,
          // **시스템 테마는 읽기 전용이다**(설계서 「테마 관리」). 역할과 다른 축이다 —
          // `ThemeDraftState.readOnly`의 주석 참고.
          readOnly: detail.system,
        })
        setState({ status: 'ready', project, detail })
      } catch (caught) {
        if (!alive) return
        setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) })
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [api, projectId, themeId, store])

  if (state.status === 'loading') {
    return (
      <main className="wb-shell-notice">
        <p role="status">불러오는 중…</p>
      </main>
    )
  }

  if (state.status === 'failed') {
    // 세션이 끊겼으면 오류가 아니라 로그인이다(`api/failure.tsx`). 셸과 같은 판정이다.
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
    <ThemeDraftProvider store={store}>
      <ThemeEditor project={state.project} detail={state.detail} />
    </ThemeDraftProvider>
  )
}

/**
 * 화면 본체. **좌우 2분할이고 왼쪽 안이 탭 둘이다**(머리말 «좌우 2분할»).
 *
 * 편집기·갤러리가 드는 자리를 `data-wb-slot`으로 이름 지어 둔다 — 그 속성은 **셸의 것이지 문서의
 * 것이 아니다**(문서 노드는 `data-wb-component`를 쓴다. 렌더러만 그것을 낸다).
 */
function ThemeEditor(props: { project: ProjectDetail; detail: ThemeDetail }): ReactElement {
  const api = useApi()
  const navigate = useNavigate()
  const store = useThemeDraftStore()
  const draft = useThemeDraft(store, (s) => s.draft)
  const base = useThemeDraft(store, (s) => s.base)
  const readOnly = useThemeDraft(store, (s) => s.readOnly)

  const canEdit = projectAbilities(props.project.role).editTheme
  // **읽기 전용의 이유가 둘이고 화면이 그것을 갈라 말한다.** 시스템 테마는 파생을 만들 길이
  // 있고(`DeriveButton`) 권한이 모자란 것은 그 길도 없다 — 한 필드로 뭉치면 그 갈림이 사라진다.
  const locked = readOnly || !canEdit

  /**
   * **한 번만 해석해 셋이 나눠 쓴다** — 갤러리 CSS·구조 선택·이슈 목록. 각자 부르면 세
   * 결과가 갈릴 자리가 생긴다(`draft-css.ts`의 `resolveDraft` 주석).
   *
   * **`useMemo`를 안 쓴다.** 초안이 바뀔 때마다 다시 해석하는 것이 이 화면의 일이고
   * (*"입력마다 `resolveTheme`을 돌린다"*), 초안이 안 바뀌면 이 컴포넌트가 다시 그려질
   * 이유도 거의 없다. **비싸면 그때 재고 판단하라** — 먼저 재지 말고 단순하게 두고,
   * 느리면 그때 고친다.
   */
  const resolved = resolveDraft(draft, base)
  useDraftCss(resolved)

  return (
    <div className="wb-shell-theme">
      <header className="wb-shell-theme-header">
        {/* **제목은 서버가 준 이름이다 — 초안이 아니다.** 초안의 이름을 그리면 입력 한 글자마다
            제목이 흔들리고, *"내가 지금 어느 테마를 열어 두었나"*가 흐려진다. */}
        <h1 className="wb-shell-theme-title">{props.detail.theme.meta.name}</h1>
        <ThemeNameField locked={locked} />
        {/* 어디서 왔는지로 돌아가는 길. 이 화면은 셸 밖이라 좌측 트리가 없다. */}
        <Link className="wb-shell-theme-back" to={`/projects/${props.project.id}`}>
          설계서로 돌아가기
        </Link>
        <ReadOnlyNotice project={props.project} detail={props.detail} canEdit={canEdit} />
        <SaveTools projectId={props.project.id} locked={locked} issues={resolved.issues} />
        {/* **가져오기·내보내기·되돌리기.** **문서 전체에 대한 조작이라 저장 옆이다** —
            왼쪽 칸은 절 단위 편집이다(`theme-io-panel.tsx`의 머리말).

            **서버 호출은 여기서 준다** — 그 화면은 초안 스토어만 만진다. `DeriveButton`이
            같은 자리에서 `createTheme`을 부르는 것과 같은 배치이고, `test/api-consumers.test.ts`가
            *"테마 저작 셋은 이 파일에서만 불린다"*를 실행으로 지킨다. */}
        <ThemeIoPanel
          locked={locked}
          // **`locked`와 다른 축이다** — 시스템 테마를 연 owner는 초안을 못 고치지만
          // 새 테마는 만들 수 있다(`ReadOnlyNotice`가 `DeriveButton`을 그 조건으로 그린다).
          canCreate={canEdit}
          onImportAsNew={async (theme) => {
            const created = await api.createTheme(props.project.id, { theme })
            // **응답의 `id`가 주소다** — `DeriveButton`과 같다.
            void navigate(`/projects/${props.project.id}/themes/${created.id}`)
          }}
        />
      </header>

      <section className="wb-shell-theme-edit" aria-label="테마 편집">
        {/* 탭 둘(토큰 GUI / JSON 에디터)이 여기 들어온다. */}
        <div className="wb-shell-theme-panes" data-wb-slot="editors">
          <ThemeSlot name="토큰"><TokenEditor locked={locked} /></ThemeSlot>
          <ThemeSlot name="JSON"><JsonEditor locked={locked} /></ThemeSlot>
        </div>
        {/* **편집 중 이슈는 클라이언트가 계산한 것이다.** 서버가 판정한 것은 아래 저장
            응답 쪽이고, 둘을 같은 상자에 뭉치지 않는다 — 갈리면 그 자체가 결함이고, 뭉치면 갈린 것이 안 보인다. */}
        <ThemeIssueList title="편집 중 검증" issues={resolved.issues} />
        <ServerWarnings />
      </section>

      {/* **갤러리 자리**(`ThemeGallery`). 문서 노드가 여기 들어오므로 `shell.css`가 이
          상자에 상속되는 속성을 걸면 `shell.css` 머리말의 규칙(셸 규칙이 문서 안까지 닿지 않는다)이
          깨진다 — `test/shell-css-guard.ts`의 `WRAPPERS`에 이 클래스가 있는 이유다. */}
      <main className="wb-shell-theme-gallery" aria-label="테마 갤러리" data-wb-slot="gallery">
        <ThemeGallery resolved={resolved.resolved} />
      </main>
    </div>
  )
}

/**
 * 테마 이름(`meta.name`)을 고친다.
 *
 * **이름은 머리에 둔다** — 그것이 이 화면이 편집하는 대상의 정체이고, 토큰 GUI나
 * JSON 에디터 어느 쪽의 절도 아니기 때문이다. **`version`과 `meta.id`(slug)는 고치는 자리가 없다:**
 * 전자는 누가 언제 올리는지 규격이 정하지 않았고, 후자는 바꾸면 `(project_id, slug)`가
 * 움직여 409가 날 수 있어 *"이름 바꾸기"*와 손해의 모양이 다르다.
 */
function ThemeNameField(props: { locked: boolean }): ReactElement {
  const store = useThemeDraftStore()
  const draft = useThemeDraft(store, (s) => s.draft)
  if (draft === null) return <></>

  return (
    <label className="wb-shell-theme-field">
      테마 이름
      <input
        className="wb-shell-theme-input"
        value={draft.meta.name}
        disabled={props.locked}
        // **절 하나를 통째로 갈아 끼운다** — 스토어의 쓰기 문이 그것 하나다(`putSection`).
        onChange={(event) =>
          store.putSection('meta', { ...draft.meta, name: event.target.value })
        }
      />
    </label>
  )
}

/**
 * 왜 못 고치는지 말하고, **막다른 길로 만들지 않는다**(`DeriveButton`).
 *
 * 설계서 「권한 모델」: *"시스템 테마는 누구도 편집할 수 없으며, 수정이 필요하면 `extends`로 파생 테마를
 * 만든다."* 서버가 이미 막지만(`requireWritableTheme`) 화면은 그 다음 길을 준다.
 *
 * **파생의 파생은 없다**(설계서 「상속과 병합」 — 상속 깊이 1). **화면이 그 규칙을 반복하지 않고
 * `detail.system`으로 판정한다** — 시스템 테마가 아닌 것은 파생이거나 홀로 서는 것이고 둘 다
 * `extends`의 대상이 될 수 없다(`EXTENDS_PATTERN`이 `system:`만 받는다).
 */
function ReadOnlyNotice(props: {
  project: ProjectDetail
  detail: ThemeDetail
  canEdit: boolean
}): ReactElement | null {
  if (!props.detail.system) {
    if (props.canEdit) return null
    return (
      <p className="wb-shell-theme-readonly" role="status">
        이 프로젝트의 owner만 테마를 고칠 수 있습니다.
      </p>
    )
  }

  return (
    <div className="wb-shell-theme-readonly" role="status">
      <p>내장 테마는 고칠 수 없습니다.</p>
      {/* **owner가 아니면 파생도 못 만든다**(`POST .../themes`가 owner 게이트다). 눌러 봐야
          403인 버튼을 활성으로 두지 않는다 — 이 저장소의 관례다. */}
      {props.canEdit && <DeriveButton project={props.project} detail={props.detail} />}
    </div>
  )
}

/**
 * *"이 테마를 바탕으로 새 테마 만들기"*.
 *
 * **`{ meta: { id, name, extends } }`만 든 파생을 만든다** — 나머지 절은 비운다. 파생은
 * **덮어쓸 것만 적는 것**이 「상속과 병합」의 뜻이고, 시스템 테마 전문을 복사해 넣으면 그 순간부터
 * 원본이 고쳐져도 따라가지 않는다.
 *
 * **slug를 사용자가 정한다.** 충돌하면 서버가 409를 내고 **그 문안을 화면이 그대로
 * 보여 준다** — 규칙을 클라이언트가 다시 두지 않는 것은 `createProject`의 슬러그와 같은
 * 판단이다(두 곳에 두면 어긋난다 — `api/failure.tsx`의 `toFailure`).
 */
function DeriveButton(props: { project: ProjectDetail; detail: ThemeDetail }): ReactElement {
  const api = useApi()
  const navigate = useNavigate()
  const [slug, setSlug] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function derive(): Promise<void> {
    setBusy(true)
    setFailure(null)
    try {
      const created = await api.createTheme(props.project.id, {
        theme: {
          meta: {
            id: slug,
            name: `${props.detail.theme.meta.name} 파생`,
            version: '1.0.0',
            // **`meta.id`(slug)를 쓴다 — 행 id가 아니다.** `EXTENDS_PATTERN`이 받는 것은
            // 코드의 시스템 테마 이름이고, 서버는 그것을 `systemTheme()`으로 찾는다.
            extends: `system:${props.detail.theme.meta.id}`,
          },
        },
      })
      // **응답의 `id`가 주소다**(`SHAPES.themeDetail`이 빈 문자열을 막는 이유).
      void navigate(`/projects/${props.project.id}/themes/${created.id}`)
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : '새 테마를 만들지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wb-shell-theme-derive">
      <label className="wb-shell-theme-field">
        새 테마 id
        <input
          className="wb-shell-theme-input"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        />
      </label>
      {/* **빈 slug로는 못 누른다.** 서버가 400을 내지만(`meta.id`가 `[A-Za-z0-9_-]{1,64}`),
          형식 전체를 클라이언트가 다시 보지는 않는다 — 규칙을 두 곳에 두지 않는다. */}
      <button
        type="button"
        className="wb-shell-theme-action"
        disabled={busy || slug === ''}
        onClick={() => void derive()}
      >
        이 테마를 바탕으로 새 테마 만들기
      </button>
      {failure !== null && <p role="alert">{failure}</p>}
    </div>
  )
}

/**
 * 저장 버튼과 그 상태.
 *
 * **저장은 `PUT` 통째 교체다**(서버가 그렇게 만들어져 있다). 부분 갱신이 아니므로 초안의
 * 절이 하나 빠지면 **서버에서도 빠진다** — 그 사실이 *"초안 하나가 테마 문서 전체다"*를
 * 강제한다.
 *
 * **막는 조건 넷을 갈라 둔다:** 읽기 전용/권한(`locked`) · 저장할 것 없음(`beginSave`가
 * 판정한다) · `error` 있음(`blocksSave`) · **읽지 못한 JSON이 있음**(`beginSave`가
 * 함께 판정한다). 넷을 한 불린으로 합치면 **왜 못 누르는지**를 화면이 말할 수 없다.
 *
 * **넷째가 빠지면** 파싱 실패 중에도 버튼이 살아 있고 눌리면 **마지막으로 읽힌 값**이
 * 서버로 간다(`ThemeDraftState.unreadable`의 주석).
 */
function SaveTools(props: {
  projectId: string
  locked: boolean
  issues: Parameters<typeof blocksSave>[0]
}): ReactElement {
  const api = useApi()
  const store = useThemeDraftStore()
  const saveStatus = useThemeDraft(store, (s) => s.saveStatus)
  const failure = useThemeDraft(store, (s) => s.saveFailure)
  const dirty = useThemeDraft(store, isDirty)
  const blocked = blocksSave(props.issues)
  // **판정이 아니라 상태를 읽는다** — 막는 것은 `beginSave` 하나이고 화면은 *"왜"*만 말한다.
  const unreadable = useThemeDraft(store, (s) => s.unreadable)

  async function save(): Promise<void> {
    // **`beginSave`가 관문이다.** 겹친 저장·읽기 전용·저장할 것 없음을 스토어가 한 번에
    // 판정한다 — 화면이 그 셋을 다시 세면 규칙이 둘이 된다.
    if (!store.beginSave()) return
    const { openThemeId, draft } = store.getState()
    if (openThemeId === null || draft === null) return

    try {
      const saved = await api.updateTheme(props.projectId, openThemeId, { theme: draft })
      // **`warnings` 키가 없을 수 있다.** 스토어가 `[]`로 정규화한다.
      store.ackSave(saved.theme, saved.warnings)
    } catch (caught) {
      const failed = toFailure(caught, SAVE_FAILURE)
      store.failSave({
        kind: failed.kind,
        message: failed.kind === 'message' ? failed.message : SAVE_FAILURE,
        // **422의 이슈를 그대로 싣는다** — 저장이 막힐 때 무엇 때문인지 보여야 하는
        // 자리다. `ApiErrorIssue`는 `ThemeIssue`의 부분집합이 아니므로 캐스트가
        // 필요한데, 서버가 `ThemeIssue[]`를 그대로 실어 보낸다(`themeValidationFailed`).
        issues: caught instanceof ApiError ? (caught.issues as never[]) : [],
      })
    }
  }

  return (
    <div className="wb-shell-theme-save" role="group" aria-label="저장">
      {/* **저장 안 한 변경을 늘 보이게 한다**(머리말 «알리되 막지 않는다»). */}
      {dirty && !props.locked && (
        <span className="wb-shell-theme-dirty" role="status">
          저장 안 함
        </span>
      )}
      <button
        type="button"
        className="wb-shell-theme-action"
        disabled={
          props.locked || !dirty || blocked || unreadable.length > 0 || saveStatus === 'saving'
        }
        onClick={() => void save()}
      >
        {saveStatus === 'saving' ? '저장 중…' : '저장'}
      </button>
      {/* **왜 못 누르는지 말한다.** `error` 때문에 막힌 것은 이슈 목록이 이미 말하지만,
          버튼 옆에 이유가 없으면 사용자가 그 둘을 잇지 못한다. */}
      {blocked && !props.locked && (
        <span className="wb-shell-theme-blocked" role="status">
          오류를 고쳐야 저장할 수 있습니다
        </span>
      )}
      {/* **읽지 못한 절을 이름으로 말한다.** 상자가 넷이라 *"어딘가 잘못됐다"*로는
          어느 상자를 봐야 하는지 알 수 없다. 그 상자의 경보(*"JSON을 읽지 못했습니다"*)와
          짝이 되는 문장이다. */}
      {unreadable.length > 0 && !props.locked && (
        <span className="wb-shell-theme-blocked" role="status">
          읽지 못한 JSON이 있어 저장할 수 없습니다: {unreadable.join(', ')}
        </span>
      )}
      {failure !== null && failure.kind === 'signed-out' && <SignedOut />}
      {failure !== null && failure.kind === 'message' && (
        <div className="wb-shell-theme-save-failure">
          <p role="alert">{failure.message}</p>
          {/* **서버가 준 이슈다 — 클라이언트가 계산한 것과 다른 채널이다**(`ServerWarnings`). */}
          <ThemeIssueList title="서버가 거절한 이유" issues={failure.issues} />
          <button type="button" onClick={store.clearSaveFailure}>
            닫기
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 마지막 저장 응답의 `warnings`. **서버의 판정이고 편집 중 검증과 다른 채널이다** — 저장 응답은 쓰기 둘(`POST`·`PUT`)만
 * 싣고 경고가 없으면 키가 없으며, 읽기는 싣지 않아 편집 중 이슈는 클라이언트가 `resolveTheme`으로 계산한다
 * (`apps/api/README.md` 「테마 응답 형태」 절). 둘을 한 상자에 뭉치지 않는 까닭은 `theme/theme-issues.tsx`의 `ThemeIssueList`.
 *
 * **키가 없으면 빈 배열이다**(스토어가 정규화한다). 그래서 여기서 `undefined`를 다시 보지
 * 않는다 — 그 구분을 화면마다 하면 한 곳이 빠진다.
 */
function ServerWarnings(): ReactElement | null {
  const store = useThemeDraftStore()
  const warnings = useThemeDraft(store, (s) => s.serverWarnings)
  return <ThemeIssueList title="마지막 저장에 대한 서버의 판정" issues={warnings} />
}

/** 자리 이름이 붙은 상자. 내용은 `children`으로 받는다. */
export function ThemeSlot(props: { name: string; children?: ReactNode }): ReactElement {
  return (
    <section className="wb-shell-theme-slot" aria-label={props.name}>
      {props.children}
    </section>
  )
}
