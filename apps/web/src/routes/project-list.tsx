/**
 * 로그인 다음 화면. 내가 속한 프로젝트를 늘어놓고, 하나를 고르면 에디터로 들어간다.
 * **여기서 프로젝트를 만든다** — 이름 · 슬러그 · 설명을 고치고 프로젝트를 지우는 것은 줄의 «설정» 이 여는 설정 페이지다
 * (`routes/settings.tsx` — 삭제는 그 «위험 구역» 절).
 *
 * **조회·잠금·조작은 `projects/use-project-commands.tsx`가 갖는다.** 이 파일은 그 결과를
 * 그리기만 한다 — 판정이 컴포넌트 안에 흩어지면 케이스가 화면을 지나야만 재진다.
 */
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { SignedOut } from '../api/failure'
import { ProjectForm } from '../projects/project-form'
import { useProjectCommands } from '../projects/use-project-commands'
import { PageHead } from '../shell/page-head'
import type { ProjectDetail } from '../api/types'

/** 조회가 성공했는데 결과가 비어 있을 때의 안내. */
const EMPTY_NOTICE = '참여 중인 프로젝트가 없습니다'

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
    <main className="wb-shell-project-list">
      {/* **여기에도 앱에서 나가는 길이 있어야 한다.** 에디터 머리에만 두면 프로젝트를 하나
          열지 않고는 로그아웃할 수 없다. 머리 오른쪽 끝의 `…` 가 계정 설정 · (관리자) 테마 관리 · 로그아웃을 든다 — 셸 밖 화면이 함께 쓰는
          머리(`shell/page-head.tsx`)다. 로고는 없다 — 로고가 가는 곳이 이 화면이다. 세션 통지(전환 · 로그아웃 실패)는 그 머리 아래 한 줄이다.

          이 화면이 팔레트 루트 가운데 하나라(`shell.css`의 팔레트 블록에 `.wb-shell-project-list`가 있다) 그 안의
          `var(--wb-shell-*)`도 여기서 정의돼 있다 — 없으면 조용히 검게 나온다. */}
      <PageHead title="프로젝트" brand={false} />

      {/* **여는 버튼도 잠근다.** 실제로 막는 것은 훅의 `inFlight`이고, 이 `disabled`는
          그것을 화면에 보이게 한다 — 여는 쪽 하나라도 빠지면 그 버튼은 눌리는 것처럼 보이는데
          조용히 아무 일도 안 한다. */}
      <button
        className="wb-shell-project-create"
        type="button"
        disabled={commands.busy}
        onClick={commands.openCreate}
      >
        새 프로젝트
      </button>

      {/* 만들기 폼은 목록 **위**에 연다. */}
      {commands.form !== null && (
        <ProjectForm
          submitLabel="만들기"
          busy={commands.busy}
          onSubmit={commands.submitForm}
          onCancel={commands.closeForm}
        />
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
          <p className="wb-shell-project-notice">{EMPTY_NOTICE}</p>
        ) : (
          <ul className="wb-shell-project-items">
            {state.projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        ))}
    </main>
  )
}

/**
 * 목록의 한 줄 — 이름(에디터로) · 설명 · «설정». **역할로 가르는 것이 없다** — 줄마다 같은 둘이다(설정 페이지가 역할대로 열고 닫는다).
 */
function ProjectRow(props: { project: ProjectDetail }): ReactElement {
  const { project } = props

  return (
    <li className="wb-shell-project-item">
      {/* 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로 열거나
          주소를 공유할 수 있어야 한다. */}
      <Link className="wb-shell-project-name" to={`/projects/${project.id}`}>
        {project.name}
      </Link>
      {project.description !== null && (
        <p className="wb-shell-project-desc">{project.description}</p>
      )}

      {/* **설정은 모든 멤버에게 있다** — owner 가 아니면 설정 페이지가 읽기로만 보인다(지금 테마 · 토큰을 볼 수 있다).
          글자는 «설정» 하나이고 줄마다 갈리는 이름은 `aria-label` 이 싣는다. */}
      <Link className="wb-shell-project-settings" to={`/projects/${project.id}/settings`} aria-label={`${project.name} 설정`}>
        설정
      </Link>
    </li>
  )
}
