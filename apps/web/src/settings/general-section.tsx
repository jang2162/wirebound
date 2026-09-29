/**
 * 설정 페이지의 **«일반»** 절 — 이름 · 슬러그 · 설명(`PATCH /api/projects/:projectId`, owner).
 *
 * - **바뀐 키만 보낸다.** 셋을 함께 보내면 설명을 비운 뜻(`null` — 지운다)과 안 건드린 뜻(키가 없다)이 갈리지 않는다. 비운 설명은
 *   `description: null` 이다. 바뀐 것이 없으면 저장 단추가 꺼진다 — 빈 본문은 서버가 400 으로 받는다(`updateBody`).
 * - **이름 · 슬러그를 비우면 보내지 않고 그렇다고 말한다** — 서버의 400 은 슬러그의 형식 · 길이 · 빈 값을 한 문장으로 말한다
 *   (`api/client.ts` 의 `createProject` 주석).
 * - **슬러그 409 는 슬러그 칸 옆에** — 무엇을 고칠지가 그 칸이다. 그 밖의 실패는 절 끝에 서버 문장 그대로다.
 * - owner 가 아니면(`projectAbilities(role).rename`) 칸이 읽기 전용이고 저장 단추가 없다 — 서버는 403 이다.
 */
import { useId, useState, type ReactElement } from 'react'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import type { ProjectDetail, ProjectView } from '../api/types'
import { projectAbilities } from '../projects/project-actions'

const SAVE_FAILURE = '설정을 저장하지 못했습니다'
const SLUG_TAKEN = '이미 쓰는 슬러그입니다'
const REQUIRED = '이름과 슬러그는 비울 수 없습니다'

export function GeneralSection(props: { project: ProjectView; onSaved: (project: ProjectDetail) => void }): ReactElement {
  const api = useApi()
  const { project } = props
  const canRename = projectAbilities(project.role).rename
  const [name, setName] = useState(project.name)
  const [slug, setSlug] = useState(project.slug)
  // 서버의 «설명 없음» 은 `null`, 칸의 그것은 빈 문자열이다 — 보낼 때 되돌린다(`changes`).
  const [description, setDescription] = useState(project.description ?? '')
  const [busy, setBusy] = useState(false)
  const [slugTaken, setSlugTaken] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const heading = useId()
  const ids = { name: useId(), slug: useId(), description: useId() }

  const changes: { name?: string; slug?: string; description?: string | null } = {}
  if (name !== project.name) changes.name = name
  if (slug !== project.slug) changes.slug = slug
  const described = description === '' ? null : description
  if (described !== project.description) changes.description = described
  const changed = Object.keys(changes).length > 0

  async function save(): Promise<void> {
    if (busy || !changed) return
    setSaved(false)
    setSlugTaken(false)
    if (name === '' || slug === '') {
      setFailure(REQUIRED)
      return
    }
    setFailure(null)
    setBusy(true)
    try {
      const updated = await api.updateProject(project.id, changes)
      props.onSaved(updated)
      setSaved(true)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'conflict') setSlugTaken(true)
      else {
        const read = toFailure(caught, SAVE_FAILURE)
        setFailure(read.kind === 'message' ? read.message : SAVE_FAILURE)
      }
    } finally {
      setBusy(false)
    }
  }

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value)
    setSaved(false)
  }

  return (
    <section className="wb-shell-settings-section" aria-labelledby={heading}>
      <h2 className="wb-shell-settings-section-title" id={heading}>
        일반
      </h2>
      <form
        className="wb-shell-settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field id={ids.name} label="이름" value={name} readOnly={!canRename} busy={busy} onChange={edit(setName)} />
        <Field id={ids.slug} label="슬러그" value={slug} readOnly={!canRename} busy={busy} onChange={edit(setSlug)}>
          {slugTaken && (
            <p className="wb-shell-settings-field-alert" role="alert">
              {SLUG_TAKEN}
            </p>
          )}
        </Field>
        <Field
          id={ids.description}
          label="설명"
          value={description}
          readOnly={!canRename}
          busy={busy}
          onChange={edit(setDescription)}
        />
        {canRename && (
          <button className="wb-shell-project-submit" type="submit" disabled={busy || !changed}>
            저장
          </button>
        )}
        {failure !== null && (
          <p className="wb-shell-project-alert" role="alert">
            {failure}
          </p>
        )}
        {saved && (
          <p className="wb-shell-project-notice" role="status">
            저장했습니다
          </p>
        )}
      </form>
    </section>
  )
}

function Field(props: {
  id: string
  label: string
  value: string
  readOnly: boolean
  busy: boolean
  onChange: (value: string) => void
  children?: ReactElement | false
}): ReactElement {
  return (
    <div className="wb-shell-settings-field">
      <label className="wb-shell-settings-label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        className="wb-shell-settings-input"
        id={props.id}
        type="text"
        value={props.value}
        readOnly={props.readOnly}
        disabled={props.busy}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.children}
    </div>
  )
}
