/**
 * 로그인 다음 화면. 내가 속한 프로젝트를 카드 격자로 늘어놓고, 하나를 고르면 에디터로 들어간다(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * 「프로젝트 목록」). **여기서 프로젝트를 만든다** — 이름 · 슬러그 · 설명을 고치고 프로젝트를 지우는 것은 카드의 «설정» 이 여는 설정 페이지다
 * (`routes/settings.tsx` — 삭제는 그 «위험 구역» 절).
 *
 * - 위 줄: 검색(이름 · 슬러그 · 설명) · 역할 거름 · 정렬(기본 «최근 수정») · 수. 셋은 **주소 질의**(`?q=&role=&sort=`)에 둔다 — 에디터로 갔다가
 *   뒤로 가기로 돌아오면 남는다. 바꿀 때마다 `replace` 다(글자마다 기록을 쌓지 않는다). 거름 · 정렬 · 주소 규칙은 `projects/project-filter.ts`.
 * - **검색 글은 칸이 든다 — 주소는 싣기만 한다**(`ProjectCards` 의 `text`). `main.tsx` 의 `BrowserRouter` 는 위치 갱신을 전이(`startTransition`)로
 *   해, 칸의 `value` 를 주소에서 읽으면 입력 이벤트 뒤 React 가 칸을 아직 안 바뀐 주소 값으로 되돌린다 — 한글 조합이 걸음마다 굳고(«고객» →
 *   «ㄱ고곡고ㄱ개객객») 빠른 입력이 글자를 잃는다(Chrome · `build-test/rv-ws-workspace.test.ts` «검색 칸에 한글을 조합해 치면 …» — jsdom 의
 *   `fireEvent.change` 한 번은 이 판을 못 낸다). 앱 전체의 전이를 끄지 않는 것은 에디터의 페이지 전환까지 동기로 바뀌어서다. 역할 · 정렬은 고르는
 *   컨트롤이라 주소에서 읽은 채다 — 사람의 빠르기로는 안 잃는다(같은 파일 «역할 · 정렬 고르기» 가 잰다. 한 틱 안에 다른 둘을 고르면 앞 것을 잃는다).
 * - 카드: **카드 전체가 에디터로 가는 링크다**(이름 링크를 카드 상자만큼 늘인다 — 접근 이름 «<이름> 열기») · 역할 표지 · 슬러그 · 설명 · 멤버 수 ·
 *   최근 수정(상대 시각 — 정확한 시각은 `<time>` 의 `title`) · 아래 줄의 작은 보조 단추(공통코드 · 설정). 보조 단추는 링크 안이 아니라 형제다 —
 *   누를 수 있는 것 안에 누를 수 있는 것을 두지 않는다(늘인 링크 위로 올려 세운다).
 * - **격자 맨 앞은 «프로젝트 추가» 카드다**(`AddCard`) — 누르면 그 카드 자리가 만들기 폼이다. 목록을 불러오는 중 · 조회 실패 · 빈 목록 · 거른
 *   결과 0 에서도 선다 — 만드는 길이 이것 하나라, 목록을 못 받은 판에 숨으면 만들 길이 없다. 카드마다의 주색 «열기» 를 걷은 뒤로 화면의 강조된
 *   동작은 이 카드 하나다.
 * - 빈 목록(«참여 중인 프로젝트가 없습니다»)과 거른 결과 없음(«검색 결과가 없습니다»)은 다른 문장이다 — 앞엣것은 만들라는 안내, 뒤엣것은 거름을 풀라는 안내다.
 *   둘 다 격자(추가 카드) 밑에 선다.
 *
 * **조회·잠금·조작은 `projects/use-project-commands.tsx`가 갖는다.** 이 파일은 그 결과를
 * 그리기만 한다 — 판정이 컴포넌트 안에 흩어지면 케이스가 화면을 지나야만 재진다.
 */
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { SignedOut } from '../api/failure'
import type { ProjectListItem, ProjectRole } from '../api/types'
import { filterProjects, queryOf, relativeTime, roleBadge, searchOf, type ProjectQuery, type ProjectSort } from '../projects/project-filter'
import { ProjectForm } from '../projects/project-form'
import { useProjectCommands, type ProjectFormValues } from '../projects/use-project-commands'
import { shellIcon } from '../shell/icons'
import { WorkspaceLayout } from '../shell/workspace-layout'

/** 조회가 성공했는데 결과가 비어 있을 때의 안내 — 빈 상태 상자의 제목. */
const EMPTY_NOTICE = '참여 중인 프로젝트가 없습니다'
/** 그 밑의 보조 글. */
const EMPTY_HINT = '«프로젝트 추가» 카드로 첫 프로젝트를 만드세요'
/** 목록은 있는데 거른 결과가 없을 때. */
const NO_MATCH = '검색 결과가 없습니다'
const NO_MATCH_HINT = '검색어나 역할 거름을 바꿔 보세요'

const ROLE_OPTIONS: readonly { value: ProjectRole | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'owner', label: 'owner' },
  { value: 'editor', label: 'editor' },
  { value: 'viewer', label: 'viewer' },
]
const SORT_OPTIONS: readonly { value: ProjectSort; label: string }[] = [
  { value: 'updated', label: '최근 수정' },
  { value: 'name', label: '이름' },
]

export function ProjectListRoute(): ReactElement {
  const commands = useProjectCommands()
  const { state } = commands

  // 세션이 끊겼으면 목록 대신 로그인이다. 화면 **전체**를 대신하는 것이라 아래 JSX보다
  // 앞에 둔다 — 아래 JSX 안에 `<SignedOut />`을 끼우면 실패한 커밋에 목록 **틀**이 함께
  // 그려진다(실측: `<main>`과 `<h1>프로젝트</h1>`).
  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />

  return (
    // **클래스 이름은 `.wb-shell-project-form`·`-field`·`-confirm`의 체계를 잇는다** —
    // 그 셋이 이 화면 안에서 열리므로 접두어가 갈리면 한 화면이 두 어휘로 쪼개진다.
    // 셸 밖의 라우트지만 스타일은 `src/shell.css` 한 파일에 있고 `wb-shell-` 접두어를
    // `test/shell-css.test.ts`가 기계로 지킨다.
    // 뼈대(`shell/workspace-layout.tsx`)의 사이드바가 계정 설정 · (관리자) 관리자 칸 · 로그아웃을 든다 — 프로젝트를 열지 않고도 앱에서 나갈 수 있다.
    <WorkspaceLayout title="프로젝트">
      <div className="wb-shell-project-list">
        {/* **조작 실패는 조회 실패와 다른 자리에 낸다**. 둘이 한 자리에 나오면 목록을
            못 받은 사실이 조작 실패 문장에 덮인다. */}
        {commands.failure !== null && commands.failure.kind === 'message' && (
          <p className="wb-shell-project-alert" role="alert">
            {commands.failure.message}
          </p>
        )}

        {state.status === 'loading' && (
          <p className="wb-shell-project-notice" role="status">
            불러오는 중…
          </p>
        )}
        {state.status === 'failed' && state.failure.kind === 'message' && (
          <p className="wb-shell-project-alert" role="alert">
            {state.failure.message}
          </p>
        )}
        <ProjectCards
          projects={state.status === 'ready' ? state.projects : null}
          add={
            <AddCard
              open={commands.form !== null}
              busy={commands.busy}
              onOpen={commands.openCreate}
              onSubmit={commands.submitForm}
              onCancel={commands.closeForm}
            />
          }
        />
      </div>
    </WorkspaceLayout>
  )
}

/**
 * 위 줄(검색 · 역할 · 정렬 · 수) · 카드 격자 · 빈 안내. `projects` 가 `null` 이면 목록을 아직 못 받은 것이다(불러오는 중 · 조회 실패). 위 줄은 목록이
 * 하나 이상일 때만 선다 — 빈 목록에는 거를 것이 없다.
 *
 * **격자(`<ul>`)는 상태와 무관하게 늘 같은 자리에 선다** — 추가 카드가 그 안에 있어, 상태마다 다른 자리에 그리면 불러오는 중에 연 폼이 목록이
 * 닿는 순간 새로 마운트되며 친 글을 잃는다(폼의 칸은 `ProjectForm` 의 상태다).
 *
 * **«지금» 은 화면이 설 때 한 번 잰다** — 상대 시각이 렌더마다 흔들리지 않게(검색어를 칠 때마다 «방금» 이 «1분 전» 으로 뛰는 판). 목록을 다시
 * 받으면(만들기 뒤) 이 상자가 그대로라 시각은 그때의 «지금» 으로 남는다 — 몇 분 어긋나도 상대 시각의 뜻은 그대로다.
 */
function ProjectCards(props: { projects: ProjectListItem[] | null; add: ReactElement }): ReactElement {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const fromAddress = queryOf(params)
  /** 검색 글 — 칸이 든다(파일 머리말 «검색 글은 칸이 든다»). 첫 값은 주소에서. */
  const [text, setText] = useState(fromAddress.text)
  /**
   * **주소가 칸 밖에서 바뀌면 칸이 따른다**(뒤로 · 앞으로 가기 · 질의 없는 `/` 로 가는 사이드바 «프로젝트»). 위치가 바뀔 때마다 주소의 글을
   * 칸에 넣는다 — 제 쓰기가 닿은 위치는 칸과 같은 글이라 아무것도 안 바꾼다. 늦게 닿은 제 쓰기가 더 친 칸을 되돌리는 판은 안 선다 — React 가 같은
   * 전이 줄의 위치 갱신을 묶어 마지막 것만 커밋한다(CPU 8배 · 15ms 간격 열 글자 — `build-test/rv-ws-workspace.test.ts` «검색 칸에 한글을 …»).
   */
  const [seenKey, setSeenKey] = useState(location.key)
  if (seenKey !== location.key) {
    setSeenKey(location.key)
    setText(fromAddress.text)
  }
  /** 한글 조합 중(`compositionstart` ~ `compositionend`)에는 주소를 안 고친다 — 자모가 주소에 실리지 않게. 끝나면 끝낸 글을 싣는다. */
  const composing = useRef(false)
  const query: ProjectQuery = { ...fromAddress, text }
  const all = props.projects ?? []
  const shown = filterProjects(all, query)
  const [now] = useState(() => Date.now())
  const base = useId()

  function change(next: Partial<ProjectQuery>): void {
    setParams(searchOf({ ...query, ...next }), { replace: true })
  }

  function type(value: string): void {
    setText(value)
    if (!composing.current) change({ text: value })
  }

  return (
    <>
      {all.length > 0 && (
        <div className="wb-shell-home-bar">
          <label className="wb-shell-home-filter wb-shell-home-search">
            <span className="wb-shell-home-filter-label">검색</span>
            <input
              className="wb-shell-project-input"
              type="search"
              placeholder="이름 · 슬러그 · 설명"
              value={text}
              onChange={(event) => type(event.target.value)}
              onCompositionStart={() => {
                composing.current = true
              }}
              onCompositionEnd={(event) => {
                composing.current = false
                type(event.currentTarget.value)
              }}
            />
          </label>
          <label className="wb-shell-home-filter" htmlFor={`${base}-role`}>
            <span className="wb-shell-home-filter-label">역할</span>
            <select
              id={`${base}-role`}
              className="wb-shell-project-input"
              value={query.role}
              onChange={(event) => change({ role: event.target.value as ProjectRole | 'all' })}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="wb-shell-home-filter" htmlFor={`${base}-sort`}>
            <span className="wb-shell-home-filter-label">정렬</span>
            <select
              id={`${base}-sort`}
              className="wb-shell-project-input"
              value={query.sort}
              onChange={(event) => change({ sort: event.target.value as ProjectSort })}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="wb-shell-home-count">
            {shown.length === all.length ? `프로젝트 ${all.length}개` : `프로젝트 ${all.length}개 중 ${shown.length}개`}
          </span>
        </div>
      )}

      <ul className="wb-shell-home-grid" aria-label="프로젝트">
        {props.add}
        {shown.map((project) => (
          <ProjectRow key={project.id} project={project} now={now} />
        ))}
      </ul>

      {props.projects !== null && all.length === 0 && (
        <div className="wb-shell-home-empty">
          {shellIcon('noProjects', 32, 'wb-shell-home-empty-icon')}
          <p className="wb-shell-project-notice">{EMPTY_NOTICE}</p>
          <p className="wb-shell-home-empty-hint">{EMPTY_HINT}</p>
        </div>
      )}
      {all.length > 0 && shown.length === 0 && (
        <div className="wb-shell-home-empty">
          <p className="wb-shell-project-notice">{NO_MATCH}</p>
          <p className="wb-shell-home-empty-hint">{NO_MATCH_HINT}</p>
        </div>
      )}
    </>
  )
}

/**
 * 격자 맨 앞의 «프로젝트 추가» 카드(파일 머리말). 닫힌 판은 카드 전체가 단추 하나이고, 연 판은 그 자리가 만들기 폼이다 — 여닫기 · 잠금은 훅의
 * `openCreate` · `closeForm` · `busy` 다(`projects/use-project-commands.tsx` 머리말 «여는 것도 잠근다»).
 *
 * **닫히면 포커스를 단추로 돌린다** — 폼이 단추 자리를 대신하므로, 취소 · Esc 로 폼이 DOM 에서 빠지면 포커스가 `body` 로 떨어져 키보드 사람이
 * 사이드바부터 다시 Tab 해야 한다.
 */
function AddCard(props: {
  open: boolean
  busy: boolean
  onOpen: () => void
  onSubmit: (values: ProjectFormValues) => void
  onCancel: () => void
}): ReactElement {
  const button = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(props.open)
  useEffect(() => {
    if (wasOpen.current && !props.open) button.current?.focus()
    wasOpen.current = props.open
  }, [props.open])

  return (
    <li className="wb-shell-home-card wb-shell-home-add" data-open={props.open}>
      {props.open ? (
        <ProjectForm submitLabel="만들기" busy={props.busy} onSubmit={props.onSubmit} onCancel={props.onCancel} />
      ) : (
        // **여는 단추도 잠근다** — 요청 중에는 폼이 이 자리를 대신하고 폼의 «취소» 도 잠겨 지금은 닿지 않는 판이지만, 폼을 요청 중에 닫을 길이
        // 생기면 이 단추가 눌리는 것처럼 보이면서 훅의 `inFlight` 에 막혀 조용히 아무 일도 안 한다.
        <button ref={button} className="wb-shell-home-add-button" type="button" disabled={props.busy} onClick={props.onOpen}>
          {shellIcon('add', 24)}
          프로젝트 추가
        </button>
      )}
    </li>
  )
}

/**
 * 목록의 카드 하나 — 카드 전체가 에디터로 가는 링크(이름 링크를 늘인다) · 역할 표지 · 설명 · 슬러그 · 아래 줄에 멤버 수 · 최근 수정, 그 밑에 보조
 * 단추(공통코드 · 설정). 역할 표지는 보이기만 한다 — 무엇을 열지는 설정 페이지가 역할대로 정한다(`projects/project-filter.ts` 머리말).
 */
function ProjectRow(props: { project: ProjectListItem; now: number }): ReactElement {
  const { project } = props
  const badge = roleBadge(project)

  return (
    <li className="wb-shell-home-card">
      <div className="wb-shell-home-card-head">
        {/* 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로 열거나 주소를 공유할 수 있어야 한다. **카드 전체를 이 링크로
            누른다** — 링크로 `<li>` 를 감싸지 않고 CSS 로 카드 상자만큼 늘인다(`.wb-shell-home-name::after`). 감싸면 안의 보조 단추(링크)가 링크
            안의 링크가 된다. 보이는 글은 이름이고 카드마다 갈리는 이름 «<이름> 열기» 는 `aria-label` 이 싣는다. */}
        <Link className="wb-shell-home-name" to={`/projects/${project.id}`} aria-label={`${project.name} 열기`}>
          {project.name}
        </Link>
        {badge !== '' && (
          <span className="wb-shell-home-role" data-role={badge}>
            {badge}
          </span>
        )}
      </div>
      <span className="wb-shell-home-slug">{project.slug}</span>
      {/* 설명이 없으면 자리째 없다 — 카드 안의 `<p>` 는 이것 하나다(`test/routes/project-list.test.tsx` «설명이 없는 프로젝트도»). */}
      {project.description !== null && <p className="wb-shell-home-desc">{project.description}</p>}

      <div className="wb-shell-home-foot">
        <span className="wb-shell-home-meta">
          {`멤버 ${project.memberCount}명 · `}
          <time className="wb-shell-home-time" dateTime={project.updatedAt} title={project.updatedAt}>
            {relativeTime(project.updatedAt, props.now)}
          </time>
        </span>
      </div>
      <div className="wb-shell-home-actions">
        {/* **설정은 모든 멤버에게 있다** — owner 가 아니면 설정 페이지가 읽기로만 보인다(지금 테마 · 토큰을 볼 수 있다). 톱니만 남은 단추라 이름은
            `aria-label` 과 `title` 이 같은 글로 든다(`shell/icons.ts` 머리말 «이름은 아이콘이 나르지 않는다»). */}
        {/* 공통코드 화면 — 설정과 같은 꼴의 아이콘 단추다(모든 멤버에게 — viewer 는 읽기로만 본다). */}
        <Link
          className="wb-shell-home-settings"
          to={`/projects/${project.id}/codes`}
          aria-label={`${project.name} 공통코드`}
          title={`${project.name} 공통코드`}
        >
          {shellIcon('codes', 16)}
        </Link>
        <Link
          className="wb-shell-home-settings"
          to={`/projects/${project.id}/settings`}
          aria-label={`${project.name} 설정`}
          title={`${project.name} 설정`}
        >
          {shellIcon('projectSettings', 16)}
        </Link>
      </div>
    </li>
  )
}
