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
import { DeleteConfirm } from '../projects/delete-confirm'
import { projectAbilities } from '../projects/project-actions'
import { ProjectForm } from '../projects/project-form'
import { useProjectCommands, type ProjectCommands } from '../projects/use-project-commands'
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
      <h1 className="wb-shell-project-list-title">프로젝트</h1>

      {/* **여는 버튼도 잠근다(D2).** 실제로 막는 것은 훅의 `inFlight`이고, 이 `disabled`는
          그것을 화면에 보이게 한다 — P2b-4에서 여는 쪽 하나가 빠져 사고가 났다. */}
      <button
        className="wb-shell-project-create"
        type="button"
        disabled={commands.busy}
        onClick={commands.openCreate}
      >
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
              <ProjectRow key={project.id} project={project} commands={commands} />
            ))}
          </ul>
        ))}
    </main>
  )
}

/**
 * 목록의 한 줄. **역할 판정을 여기서 다시 하지 않는다** — `projectAbilities` 하나가 그것을
 * 갖는다(D3). **`.role`을 읽는 자리가 이 한 곳이어야** 판정이 흩어지지 않는다.
 */
function ProjectRow(props: { project: ProjectDetail; commands: ProjectCommands }): ReactElement {
  const { project, commands } = props
  const abilities = projectAbilities(project.role)
  const editing = commands.form !== null && commands.form.project?.id === project.id
  const confirming = commands.confirmingDelete?.id === project.id

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

      {/* **`owner`가 아니면 버튼 자체가 없다**(D3) — `editor`·`viewer`는 `PATCH`·`DELETE`
          둘 다 403이다(웨이브 1 실측). 비활성으로 두지 않고 아예 그리지 않는 것은, 이 화면에서
          역할이 바뀌는 길이 없어 "지금은 못 하지만 곧 될 수도 있다"가 아니기 때문이다. */}
      {abilities.rename && (
        <button
          className="wb-shell-project-action"
          type="button"
          disabled={commands.busy}
          onClick={() => commands.openEdit(project)}
        >
          {`${project.name} 수정`}
        </button>
      )}

      {abilities.remove && (
        <button
          className="wb-shell-project-action"
          type="button"
          disabled={commands.busy}
          onClick={() => commands.askDelete(project)}
        >
          {`${project.name} 삭제`}
        </button>
      )}

      {/* 수정 폼은 **그 항목 자리에** 연다 — 만들기는 목록 위다(D4). */}
      {editing && (
        <ProjectForm
          key={`edit-${project.id}`}
          submitLabel="저장"
          initial={project}
          busy={commands.busy}
          onSubmit={commands.submitForm}
          onCancel={commands.closeForm}
        />
      )}
      {/* **`key`를 주지 않는다 — 재서 걷어냈다.** 앞 판은 *"`key`가 있어야 다른 항목으로
          옮길 때 친 이름이 사라진다"*고 적었는데 **그것은 거짓이다**: 각 `DeleteConfirm`은
          서로 다른 `<li>`(그쪽이 `key={project.id}`를 갖는다) 안에 있어, 항목을 옮기면
          그 서브트리째 언마운트된다. `key`를 지워도 **0 사망**이고 친 이름은 그대로 사라진다.
          **`<li>`의 `key`가 이미 하는 일을 한 겹 더 적은 것이었다.** */}
      {confirming && (
        <DeleteConfirm
          project={project}
          busy={commands.busy}
          onConfirm={() => commands.confirmDelete(project)}
          onCancel={commands.cancelDelete}
        />
      )}
    </li>
  )
}
