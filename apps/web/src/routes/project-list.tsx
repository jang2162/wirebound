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
 * - 카드: 이름(에디터로) · 역할 표지 · 슬러그 · 설명 · 멤버 수 · 최근 수정(상대 시각 — 정확한 시각은 `<time>` 의 `title`) · «설정».
 * - 빈 목록(«참여 중인 프로젝트가 없습니다»)과 거른 결과 없음(«검색 결과가 없습니다»)은 다른 문장이다 — 앞엣것은 만들라는 안내, 뒤엣것은 거름을 풀라는 안내다.
 *
 * **조회·잠금·조작은 `projects/use-project-commands.tsx`가 갖는다.** 이 파일은 그 결과를
 * 그리기만 한다 — 판정이 컴포넌트 안에 흩어지면 케이스가 화면을 지나야만 재진다.
 */
import { useId, useRef, useState, type ReactElement } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { SignedOut } from '../api/failure'
import type { ProjectListItem, ProjectRole } from '../api/types'
import { filterProjects, queryOf, relativeTime, roleBadge, searchOf, type ProjectQuery, type ProjectSort } from '../projects/project-filter'
import { ProjectForm } from '../projects/project-form'
import { useProjectCommands } from '../projects/use-project-commands'
import { shellIcon } from '../shell/icons'
import { WorkspaceLayout } from '../shell/workspace-layout'

/** 조회가 성공했는데 결과가 비어 있을 때의 안내 — 빈 상태 상자의 제목. */
const EMPTY_NOTICE = '참여 중인 프로젝트가 없습니다'
/** 그 밑의 보조 글. */
const EMPTY_HINT = '새 프로젝트를 만들어 시작하세요'
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
    <WorkspaceLayout
      title="프로젝트"
      actions={
        // **여는 버튼도 잠근다.** 실제로 막는 것은 훅의 `inFlight`이고, 이 `disabled`는
        // 그것을 화면에 보이게 한다 — 여는 쪽 하나라도 빠지면 그 버튼은 눌리는 것처럼 보이는데
        // 조용히 아무 일도 안 한다.
        <button className="wb-shell-project-create" type="button" disabled={commands.busy} onClick={commands.openCreate}>
          {shellIcon('add', 16, 'wb-shell-icon-lead')}
          새 프로젝트
        </button>
      }
    >
      <div className="wb-shell-project-list">
        {/* 만들기 폼은 목록 **위**에 연다. */}
        {commands.form !== null && (
          <ProjectForm submitLabel="만들기" busy={commands.busy} onSubmit={commands.submitForm} onCancel={commands.closeForm} />
        )}

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
        {state.status === 'ready' &&
          (state.projects.length === 0 ? (
            <div className="wb-shell-home-empty">
              {shellIcon('noProjects', 32, 'wb-shell-home-empty-icon')}
              <p className="wb-shell-project-notice">{EMPTY_NOTICE}</p>
              <p className="wb-shell-home-empty-hint">{EMPTY_HINT}</p>
            </div>
          ) : (
            <ProjectCards projects={state.projects} />
          ))}
      </div>
    </WorkspaceLayout>
  )
}

/**
 * 위 줄(검색 · 역할 · 정렬 · 수)과 카드 격자. 목록이 하나 이상일 때만 선다 — 빈 목록에는 거를 것이 없다.
 *
 * **«지금» 은 화면이 설 때 한 번 잰다** — 상대 시각이 렌더마다 흔들리지 않게(검색어를 칠 때마다 «방금» 이 «1분 전» 으로 뛰는 판). 목록을 다시
 * 받으면(만들기 뒤) 이 상자가 그대로라 시각은 그때의 «지금» 으로 남는다 — 몇 분 어긋나도 상대 시각의 뜻은 그대로다.
 */
function ProjectCards(props: { projects: ProjectListItem[] }): ReactElement {
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
  const shown = filterProjects(props.projects, query)
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
          {shown.length === props.projects.length
            ? `프로젝트 ${props.projects.length}개`
            : `프로젝트 ${props.projects.length}개 중 ${shown.length}개`}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="wb-shell-home-empty">
          <p className="wb-shell-project-notice">{NO_MATCH}</p>
          <p className="wb-shell-home-empty-hint">{NO_MATCH_HINT}</p>
        </div>
      ) : (
        <ul className="wb-shell-home-grid" aria-label="프로젝트">
          {shown.map((project) => (
            <ProjectRow key={project.id} project={project} now={now} />
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * 목록의 카드 하나 — 이름(에디터로) · 역할 표지 · 설명 · 슬러그 · 아래 줄에 멤버 수 · 최근 수정과 «설정». 역할 표지는 보이기만 한다 — 무엇을 열지는
 * 설정 페이지가 역할대로 정한다(`projects/project-filter.ts` 머리말).
 */
function ProjectRow(props: { project: ProjectListItem; now: number }): ReactElement {
  const { project } = props
  const badge = roleBadge(project)

  return (
    <li className="wb-shell-home-card">
      <div className="wb-shell-home-card-head">
        {/* 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로 열거나
            주소를 공유할 수 있어야 한다. 카드 전체를 링크로 만들지 않는다 — 안의 «설정» 링크와 겹친다. */}
        <Link className="wb-shell-home-name" to={`/projects/${project.id}`}>
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
        {/* **설정은 모든 멤버에게 있다** — owner 가 아니면 설정 페이지가 읽기로만 보인다(지금 테마 · 토큰을 볼 수 있다).
            글자는 «설정» 하나이고 카드마다 갈리는 이름은 `aria-label` 이 싣는다. */}
        <Link className="wb-shell-project-settings" to={`/projects/${project.id}/settings`} aria-label={`${project.name} 설정`}>
          {shellIcon('projectSettings', 14, 'wb-shell-icon-lead')}
          설정
        </Link>
      </div>
    </li>
  )
}
