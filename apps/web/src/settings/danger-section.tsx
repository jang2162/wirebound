/**
 * 설정 페이지 맨 아래의 **«위험 구역»** 절 — 프로젝트 삭제(`DELETE /api/projects/:projectId`, owner — `projectAbilities(role).remove`).
 * owner 가 아니면 절째 없다 — 서버는 403 이고, 이 페이지에서 역할이 바뀌는 길은 다시 읽기뿐이다(`settings/members-section.tsx` 머리말).
 *
 * - **확인은 이름을 정확히 쳐야 열린다**(`settings/delete-confirm.tsx` — 그 머리말이 `trim` 하지 않는 까닭 · 함께 사라지는 것을 적는다).
 * - **지우면 프로젝트 목록으로 간다**(`replace` — 뒤로 가기가 지운 프로젝트의 설정으로 돌아오지 않게). 목록은 들어갈 때 다시 받는다.
 * - 실패는 서버 문장 그대로이고 확인은 열린 채 남는다 — 친 이름을 다시 칠 필요가 없다.
 */
import { useId, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ProjectView } from '../api/types'
import { projectAbilities } from '../projects/project-actions'
import { DeleteConfirm } from './delete-confirm'

const DELETE_FAILURE = '프로젝트를 지우지 못했습니다'

/**
 * 이 절이 서는가 — 설정 페이지의 절 목차가 «위험 구역» 탭을 둘지 이것으로 정한다(`routes/settings.tsx`). 판정은 아래 절과 같은
 * `projectAbilities(…).remove` 하나다 — 목차가 따로 판정하면 탭과 절이 갈린다.
 */
export function dangerShown(project: ProjectView): boolean {
  return projectAbilities(project.role).remove
}

export function DangerSection(props: { project: ProjectView }): ReactElement | null {
  const api = useApi()
  const navigate = useNavigate()
  const { project } = props
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const heading = useId()

  if (!dangerShown(project)) return null
  if (failure !== null && failure.kind === 'signed-out') return <SignedOut />

  async function remove(): Promise<void> {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      await api.deleteProject(project.id)
      navigate('/', { replace: true })
    } catch (caught) {
      setFailure(toFailure(caught, DELETE_FAILURE))
      setBusy(false)
    }
  }

  return (
    <section className="wb-shell-settings-section" aria-labelledby={heading}>
      <h2 className="wb-shell-settings-section-title" id={heading}>
        위험 구역
      </h2>
      {confirming ? (
        <DeleteConfirm project={project} busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirming(false)} />
      ) : (
        <button className="wb-shell-project-action" type="button" onClick={() => setConfirming(true)}>
          프로젝트 삭제
        </button>
      )}
      {failure !== null && failure.kind === 'message' && (
        <p className="wb-shell-project-alert" role="alert">
          {failure.message}
        </p>
      )}
    </section>
  )
}
