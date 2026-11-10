/**
 * **공통코드** — `/projects/:projectId/codes`(정본 설계서 「설계서 화면 구조」의 공통코드 화면). 셸 밖 라우트다 — 프로젝트 설정
 * (`routes/settings.tsx`)과 같은 까닭: 표는 캔버스 · 트리를 안 쓰고, 셸에 두면 편집 상태를 세운 채 표 하나를 보게 된다. 입구는 에디터 머리
 * `…` 의 «공통코드»(«프로젝트 설정» 앞)와 프로젝트 카드 메뉴다. 뼈대(`shell/workspace-layout.tsx`) 안에 서고 머리는 빵부스러기 «프로젝트 ›
 * <이름>» · 제목 «<이름> 공통코드» · 오른쪽 «에디터 열기»다.
 *
 * 몸은 `codes/codes-screen.tsx` — 왼쪽 그룹 목록 · 오른쪽 고른 그룹의 항목 표와 그 아래 사용처. 주소의 `?group=` 이 고른 그룹을, `?item=` 이
 * 사용처를 좁힐 항목을 든다. 역할은 `getProject` 의 응답에서 읽고 쓰기 입구는 `projectAbilities(…).editDesign`(editor 이상)으로 연다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ProjectView } from '../api/types'
import { CodesScreen } from '../codes/codes-screen'
import { projectAbilities } from '../projects/project-actions'
import { WorkspaceLayout } from '../shell/workspace-layout'

const LOAD_FAILURE = '프로젝트를 불러오지 못했습니다'

type LoadState = { status: 'loading' } | { status: 'ready'; project: ProjectView } | { status: 'failed'; failure: Failure }

export function CodesRoute(): ReactElement {
  const projectId = useParams().projectId ?? ''
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    const leave = new AbortController()
    setState({ status: 'loading' })
    api.getProject(projectId, { cancel: leave.signal }).then(
      (project) => {
        if (alive) setState({ status: 'ready', project })
      },
      (caught: unknown) => {
        if (alive) setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILURE) })
      },
    )
    return () => {
      alive = false
      leave.abort()
    }
  }, [api, projectId])

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />

  return (
    <WorkspaceLayout
      title={state.status === 'ready' ? `${state.project.name} 공통코드` : '공통코드'}
      crumbs={[
        { label: '프로젝트', to: '/' },
        ...(state.status === 'ready' ? [{ label: state.project.name, to: `/projects/${state.project.id}` }] : []),
      ]}
      actions={
        state.status === 'ready' ? (
          <Link className="wb-shell-settings-open" to={`/projects/${state.project.id}`}>
            에디터 열기
          </Link>
        ) : undefined
      }
    >
      <div className="wb-shell-settings">
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
        {state.status === 'ready' && (
          <CodesScreen key={state.project.id} projectId={state.project.id} canEdit={projectAbilities(state.project.role).editDesign} />
        )}
      </div>
    </WorkspaceLayout>
  )
}
