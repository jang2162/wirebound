/**
 * 로그인 다음 화면. 내가 속한 프로젝트를 늘어놓고, 하나를 고르면 에디터로 들어간다.
 * **여기서 프로젝트를 만들고 고치고 지운다**(P2b-5).
 *
 * **앞 판의 머리말은 *"읽기 전용이다 — P2b-1의 범위는 보는 것까지다"*였다.** 그 범위가
 * 이 단계로 끝났으므로 지웠다. **옛 근거를 남겨 두면 다음 사람이 그것을 지키려다 되돌린다**
 * (P2b-4의 D4가 같은 자리였다).
 *
 * **조회·잠금·조작은 `projects/use-project-commands.tsx`가 갖는다.** 이 파일은 그 결과를
 * 그리기만 한다 — 판정이 컴포넌트 안에 흩어지면 케이스가 화면을 지나야만 재진다.
 *
 * **삭제 확인은 Task 6이 붙인다.**
 */
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { SignedOut } from '../api/failure'
import { ProjectForm } from '../projects/project-form'
import { useProjectCommands } from '../projects/use-project-commands'

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
    <main>
      <h1>프로젝트</h1>

      {/* **여는 버튼도 잠근다(D2).** 실제로 막는 것은 훅의 `inFlight`이고, 이 `disabled`는
          그것을 화면에 보이게 한다 — P2b-4에서 여는 쪽 하나가 빠져 사고가 났다. */}
      <button type="button" disabled={commands.busy} onClick={commands.openCreate}>
        새 프로젝트
      </button>

      {/* 만들기 폼은 목록 **위**에 연다(D4). `key`가 있어야 만들기↔수정을 오갈 때 새
          인스턴스가 마운트되고 초기값이 다시 잡힌다. */}
      {commands.form !== null && commands.form.project === null && (
        <ProjectForm
          key="create"
          submitLabel="만들기"
          initial={null}
          busy={commands.busy}
          onSubmit={commands.submitForm}
          onCancel={commands.closeForm}
        />
      )}

      {/* **조작 실패는 조회 실패와 다른 자리에 낸다**(D8). 둘이 한 자리에 나오면 목록을
          못 받은 사실이 조작 실패 문장에 덮인다. */}
      {commands.failure !== null && commands.failure.kind === 'message' && (
        <p role="alert">{commands.failure.message}</p>
      )}

      {state.status === 'loading' && <p role="status">불러오는 중…</p>}
      {state.status === 'failed' && state.failure.kind === 'message' && (
        <p role="alert">{state.failure.message}</p>
      )}
      {state.status === 'ready' &&
        (state.projects.length === 0 ? (
          <p>{EMPTY_NOTICE}</p>
        ) : (
          <ul>
            {state.projects.map((project) => (
              <li key={project.id}>
                {/* 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로
                    열거나 주소를 공유할 수 있어야 한다. */}
                <Link to={`/projects/${project.id}`}>{project.name}</Link>
                {project.description !== null && <p>{project.description}</p>}
              </li>
            ))}
          </ul>
        ))}
    </main>
  )
}
