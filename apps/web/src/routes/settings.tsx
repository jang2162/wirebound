/**
 * **프로젝트 설정** — `/projects/:projectId/settings`. 셸 밖 라우트다(`routes/tokens.tsx` 와 같은 자리): 설정은 캔버스 · 트리를 쓰지 않고,
 * 셸에 두면 편집 상태(스토어 · 잠금 · 룸)를 세운 채 폼 하나를 보게 된다. 에디터 머리의 «설정» 과 목록 줄의 «설정» 이 여기로 온다.
 *
 * 절은 **«일반»**(이름 · 슬러그 · 설명 — `settings/general-section.tsx`) · **«테마»**(고르기 · 토큰 편집 · 미리보기 — `settings/theme-section.tsx`) ·
 * **«멤버»**(`settings/members-section.tsx`)를 위아래로 둔다. 화면 루트는 `.wb-shell-settings` 다 — 미리보기(갤러리 iframe)가 들어 목록 화면보다 넓다(`shell.css` 의 팔레트 블록).
 *
 * 역할은 `getProject` 의 응답에서 읽는다. owner 가 아니면 칸이 읽기 전용이다 — 판정은 절마다 `projectAbilities` 로 한다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ProjectView } from '../api/types'
import { SessionMenu } from '../session/session-menu'
import { GeneralSection } from '../settings/general-section'
import { MembersSection } from '../settings/members-section'
import { ThemeSection } from '../settings/theme-section'

const LOAD_FAILURE = '프로젝트를 불러오지 못했습니다'

type LoadState = { status: 'loading' } | { status: 'ready'; project: ProjectView } | { status: 'failed'; failure: Failure }

export function SettingsRoute(): ReactElement {
  const projectId = useParams().projectId ?? ''
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  /** 오를 때마다 프로젝트를 다시 받는다 — 멤버 절이 나를 바꾼 뒤 역할을 다시 읽는 길(`settings/members-section.tsx` 머리말). */
  const [reread, setReread] = useState(0)

  useEffect(() => {
    let alive = true
    const leave = new AbortController()
    // 같은 프로젝트를 다시 받을 때는 지금 화면을 둔다 — «불러오는 중» 으로 비우면 절들이 내려갔다 다시 선다.
    setState((prev) => (prev.status === 'ready' && prev.project.id === projectId ? prev : { status: 'loading' }))
    async function load(): Promise<void> {
      try {
        const project = await api.getProject(projectId, { cancel: leave.signal })
        if (alive) setState({ status: 'ready', project })
      } catch (caught) {
        if (alive) setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILURE) })
      }
    }
    void load()
    return () => {
      alive = false
      leave.abort()
    }
  }, [api, projectId, reread])

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />

  return (
    <main className="wb-shell-settings">
      <div className="wb-shell-project-head">
        <h1 className="wb-shell-project-list-title">{state.status === 'ready' ? `${state.project.name} 설정` : '프로젝트 설정'}</h1>
        <SessionMenu />
      </div>
      <p className="wb-shell-settings-nav">
        {state.status === 'ready' && (
          <Link className="wb-shell-tokens-back" to={`/projects/${state.project.id}`}>
            편집기로
          </Link>
        )}
        <Link className="wb-shell-tokens-back" to="/">
          프로젝트 목록
        </Link>
      </p>

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
        <GeneralSection
          key={state.project.id}
          project={state.project}
          // 응답에는 `themeRev` 가 없다(`ProjectDetail`) — 쥔 값을 잇는다.
          onSaved={(updated) => setState((prev) => (prev.status === 'ready' ? { status: 'ready', project: { ...prev.project, ...updated } } : prev))}
        />
      )}
      {state.status === 'ready' && <ThemeSection key={`theme-${state.project.id}`} project={state.project} />}
      {state.status === 'ready' && (
        <MembersSection key={`members-${state.project.id}`} project={state.project} onSelfChanged={() => setReread((n) => n + 1)} />
      )}
    </main>
  )
}
