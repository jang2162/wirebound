/**
 * 설정 페이지의 **«테마»** 절 — 위에서부터 **지금 테마 요약 카드**(이름 · `id@버전` · 새 버전 · 기본값과 다른 토큰 수) · **«테마 바꾸기»**
 * (`theme-chooser.tsx` — owner 만) · **«토큰»**(`token-editor.tsx` — 폼과 미리보기). 미리보기 상자는 창 높이에 묶여 안에서 스크롤한다
 * (`shell.css` 의 `.wb-shell-settings-preview`) — 그래서 절의 길이가 갤러리가 아니라 폼의 길이다.
 *
 * 절이 바인딩(`GET …/theme`)을 쥐고 두 자식이 그 값에서 시작한다. 한쪽이 저장하면(200) 그 응답이 곧 새 바인딩이고, 409 면 서버 값으로
 * 다시 읽는다 — 설정 페이지는 `theme-changed` 를 듣지 않는다(열어 둔 설정 페이지가 남의 저장을 곧바로 따라가는 것은 이 절의 일이 아니다 —
 * 409 로 만난다).
 *
 * 테마를 바꾸는 것 · 토큰을 고치는 것은 owner 다(`projectAbilities(role).chooseTheme`). 아니면 지금 값만 보이고 고르개가 없다 — 토큰
 * 편집기는 읽기 전용으로 선다.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { compareVersions } from '@wirebound/themes'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import type { ProjectThemeView, ProjectView } from '../api/types'
import { projectAbilities } from '../projects/project-actions'
import { shellIcon } from '../shell/icons'
import { ThemeChooser } from './theme-chooser'
import { TokenEditor } from './token-editor'

const LOAD_FAILURE = '테마를 불러오지 못했습니다'

type LoadState = { status: 'loading' } | { status: 'ready'; view: ProjectThemeView } | { status: 'failed'; message: string }

export function ThemeSection(props: { project: ProjectView }): ReactElement {
  const api = useApi()
  const projectId = props.project.id
  const canChoose = projectAbilities(props.project.role).chooseTheme
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const heading = useId()
  const leaving = useRef<AbortController | null>(null)
  const turn = useRef(0)

  /** 바인딩을 (다시) 읽는다 — 늦게 낸 것의 답만 받는다. */
  const reload = useCallback(async (): Promise<void> => {
    const mine = ++turn.current
    try {
      const cancel = leaving.current?.signal
      const view = await api.getProjectTheme(projectId, cancel === undefined ? undefined : { cancel })
      if (turn.current === mine) setState({ status: 'ready', view })
    } catch (caught) {
      if (turn.current !== mine) return
      const failure = toFailure(caught, LOAD_FAILURE)
      setState({ status: 'failed', message: failure.kind === 'message' ? failure.message : LOAD_FAILURE })
    }
  }, [api, projectId])

  useEffect(() => {
    const leave = new AbortController()
    leaving.current = leave
    void reload()
    return () => {
      turn.current += 1
      leave.abort()
    }
  }, [reload])

  const saved = useCallback((view: ProjectThemeView) => {
    turn.current += 1
    setState({ status: 'ready', view })
  }, [])

  return (
    <section className="wb-shell-settings-section" aria-labelledby={heading}>
      <h2 className="wb-shell-settings-section-title" id={heading}>
        테마
      </h2>
      {state.status === 'loading' && (
        <p className="wb-shell-project-notice" role="status">
          불러오는 중…
        </p>
      )}
      {state.status === 'failed' && (
        <p className="wb-shell-project-alert" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <CurrentTheme view={state.view} />
          {canChoose && state.view.themeId !== null && state.view.version !== null && (
            <div className="wb-shell-settings-block">
              <h3 className="wb-shell-settings-subtitle">테마 바꾸기</h3>
              <ThemeChooser projectId={projectId} view={state.view} onSaved={saved} onStale={() => void reload()} />
            </div>
          )}
          {state.view.themeId !== null && state.view.version !== null && state.view.manifest !== null && (
            <TokenEditor projectId={projectId} view={state.view} canEdit={canChoose} onSaved={saved} onStale={() => void reload()} />
          )}
        </>
      )}
    </section>
  )
}

/**
 * 지금 값 — 요약 카드. 첫 줄은 `이름 id@버전` 한 글이다(글자로 찾는 자리가 그 요소의 제 글 노드를 본다 — 둘로 가르면 못 찾는다 ·
 * `test/settings/theme-chooser.test.tsx`). 이름은 테마의 이름(숨기지 않은 최신판의 것 — 고르개의 테마 칸과 같다)이고, 고정한 판의
 * manifest 이름은 숨기지 않은 판이 없을 때만 그린다 — 판을 올리며 이름을 바꾼 테마에서 옛 판에 고정한 프로젝트가 옛 이름으로 서지 않게.
 * 같은 테마에 더 높은 숨기지 않은 판이 있으면 «새 버전», manifest 가 있으면 기본값과 다른 토큰 수(저장된 토큰은 기본값을 뺀 것이다 —
 * `token-editor.tsx` 머리말 «저장은 기본값과 같은 값을 뺀 초안»).
 */
function CurrentTheme(props: { view: ProjectThemeView }): ReactElement {
  const { view } = props
  if (view.themeId === null || view.version === null) {
    return <p className="wb-shell-settings-current">고정된 테마가 없습니다 — 서버가 다음 기동에 시스템 테마로 채웁니다</p>
  }
  const newer = view.latest !== null && compareVersions(view.latest, view.version) > 0
  const total = view.manifest === null ? null : Object.keys(view.manifest.tokens.items).length
  const changed = Object.keys(view.tokens).length
  return (
    <div className="wb-shell-settings-summary" role="group" aria-label="지금 테마">
      {shellIcon('themes', 20, 'wb-shell-settings-summary-icon')}
      <div className="wb-shell-settings-summary-body">
        <p className="wb-shell-settings-current">{`${view.latestName ?? view.manifest?.name ?? view.themeId} ${view.themeId}@${view.version}`}</p>
        <p className="wb-shell-settings-summary-meta">
          {total === null ? `바꾼 토큰 ${changed}개` : `바꾼 토큰 ${changed} / ${total}개`}
          {newer && <span className="wb-shell-settings-newer">{`새 버전 ${view.latest}`}</span>}
        </p>
      </div>
    </div>
  )
}
