/**
 * **프로젝트 설정** — `/projects/:projectId/settings`. 셸 밖 라우트다(`routes/account.tsx` 와 같은 자리): 설정은 캔버스 · 트리를 쓰지 않고,
 * 셸에 두면 편집 상태(스토어 · 잠금 · 룸)를 세운 채 폼 하나를 보게 된다. 에디터 `…` 의 «프로젝트 설정» 과 목록 줄의 «설정» 이 여기로 온다. 머리의 로고가 프로젝트 목록으로, 그 아래 «에디터로 돌아가기» 가 그 프로젝트의 에디터로 간다.
 *
 * 절은 **«일반»**(이름 · 슬러그 · 설명 — `settings/general-section.tsx`) · **«테마»**(지금 테마 요약 · 고르기 · 토큰 편집 · 미리보기 —
 * `settings/theme-section.tsx`) · **«멤버»**(`settings/members-section.tsx`) · **«위험 구역»**(프로젝트 삭제 · owner 만 — `settings/danger-section.tsx`)이다.
 * 화면 루트는 `.wb-shell-settings` 다 — 미리보기(갤러리 iframe)가 들어 목록 화면보다 넓다(`shell.css` 의 팔레트 블록).
 *
 * # 절 목차 — 왼쪽 세로 탭, 한 번에 한 절
 *
 * 절을 위아래로 다 늘어놓으면 «테마» 절(미리보기)이 화면 열 배 넘게 길어 «멤버» · «위험 구역» 이 그 밑에 묻힌다. 그래서 왼쪽에 세로 탭
 * 목록(`role="tablist"`)을 두고 고른 절 하나만 보인다. 창이 좁으면(< 900px) 목록이 위로 올라가 가로 줄이 된다(CSS).
 *
 * - **주소가 고른 절을 든다** — 질의 `?section=general|theme|members|danger`(없거나 모르는 값이면 «일반»). 탭을 고르면 `replace` 로
 *   주소만 바꾼다(뒤로 가기에 탭마다 기록을 안 쌓는다). 해시가 아니라 질의인 것은 라우터로 읽고 쓰고, 해시는 브라우저가 같은 id 의
 *   요소로 스크롤하기 때문이다.
 * - **키보드** — 고른 탭만 Tab 정지점이다(로빙 `tabIndex`). ↑↓(가로 줄일 때를 위해 ←→ 도) · Home · End 로 옮기면 그 절이 곧바로 열린다.
 * - **절은 넷 다 늘 그리고 안 고른 것은 `hidden`** — 탭을 바꿔도 저장 안 한 토큰 초안 · 칸에 친 값 · 열린 확인이 남는다(한 화면이던 때
 *   잃지 않던 것을 탭 전환이 잃게 하지 않는다). 조회도 지금처럼 화면을 열 때 절마다 한 번이다. 판(`tabpanel`)이 절(`<section>` —
 *   이름 «일반» · «테마» …)을 감싼다.
 *
 * 역할은 `getProject` 의 응답에서 읽는다. owner 가 아니면 칸이 읽기 전용이다 — 판정은 절마다 `projectAbilities` 로 한다.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ProjectView } from '../api/types'
import { GeneralSection } from '../settings/general-section'
import { DangerSection, dangerShown } from '../settings/danger-section'
import { MembersSection } from '../settings/members-section'
import { ThemeSection } from '../settings/theme-section'
import { shellIcon, type IconName } from '../shell/icons'
import { PageHead } from '../shell/page-head'

const LOAD_FAILURE = '프로젝트를 불러오지 못했습니다'

/** 절 넷 — 탭의 차례 · 주소의 값 · 글 · 그림. */
const SECTIONS = [
  { key: 'general', label: '일반', icon: 'projectSettings' },
  { key: 'theme', label: '테마', icon: 'themes' },
  { key: 'members', label: '멤버', icon: 'members' },
  { key: 'danger', label: '위험 구역', icon: 'warning' },
] as const satisfies readonly { key: string; label: string; icon: IconName }[]

type SectionKey = (typeof SECTIONS)[number]['key']

/** 주소의 `?section=` — 모르는 값 · 없음 · 지금 없는 절(owner 가 아닌 사람의 «위험 구역»)은 «일반». */
function sectionOf(value: string | null, shown: readonly SectionKey[]): SectionKey {
  return shown.find((key) => key === value) ?? 'general'
}

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
      {/* 머리 — 로고(프로젝트 목록으로) · 제목 · `…`(`shell/page-head.tsx`). 그 아래 «에디터로 돌아가기» 는 프로젝트를 받은 뒤에 선다 — 갈 주소가 그 응답의 것이다. */}
      <PageHead title={state.status === 'ready' ? `${state.project.name} 설정` : '프로젝트 설정'} brand />
      {state.status === 'ready' && (
        <p className="wb-shell-settings-nav">
          <Link className="wb-shell-tokens-back" to={`/projects/${state.project.id}`}>
            에디터로 돌아가기
          </Link>
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
      {state.status === 'ready' && (
        // «위험 구역» 은 owner 에게만 선다 — 절이 없는 사람에게는 탭도 없다(`dangerShown`).
        <SettingsTabs danger={dangerShown(state.project)}>
          {{
            general: (
              <GeneralSection
                key={state.project.id}
                project={state.project}
                // 응답에는 `themeRev` 가 없다(`ProjectDetail`) — 쥔 값을 잇는다.
                onSaved={(updated) =>
                  setState((prev) => (prev.status === 'ready' ? { status: 'ready', project: { ...prev.project, ...updated } } : prev))
                }
              />
            ),
            theme: <ThemeSection key={`theme-${state.project.id}`} project={state.project} />,
            members: (
              <MembersSection key={`members-${state.project.id}`} project={state.project} onSelfChanged={() => setReread((n) => n + 1)} />
            ),
            danger: <DangerSection key={`danger-${state.project.id}`} project={state.project} />,
          }}
        </SettingsTabs>
      )}
    </main>
  )
}

/** 왼쪽 세로 탭 + 판 넷(머리말 «절 목차»). 판은 넷 다 그리고 안 고른 것은 `hidden` 이다. */
function SettingsTabs(props: { danger: boolean; children: Record<SectionKey, ReactNode> }): ReactElement {
  const [params, setParams] = useSearchParams()
  const sections = SECTIONS.filter((section) => section.key !== 'danger' || props.danger)
  const selected = sectionOf(
    params.get('section'),
    sections.map((section) => section.key),
  )
  const base = useId()
  const tabs = useRef<Partial<Record<SectionKey, HTMLButtonElement | null>>>({})

  function choose(key: SectionKey, focus: boolean): void {
    // 다른 질의는 그대로 두고 `section` 만 바꾼다 — 탭마다 뒤로 가기 기록을 쌓지 않는다.
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('section', key)
        return next
      },
      { replace: true },
    )
    if (focus) tabs.current[key]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const at = sections.findIndex((section) => section.key === selected)
    const last = sections.length - 1
    const to =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (at + 1) % sections.length
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? (at + last) % sections.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (to === null) return
    event.preventDefault()
    choose(sections[to]!.key, true)
  }

  return (
    <div className="wb-shell-settings-layout">
      <div className="wb-shell-settings-tabs" role="tablist" aria-label="설정 절" aria-orientation="vertical" onKeyDown={onKeyDown}>
        {sections.map((section) => (
          <button
            key={section.key}
            ref={(element) => {
              tabs.current[section.key] = element
            }}
            className={section.key === 'danger' ? 'wb-shell-settings-tab wb-shell-settings-tab-danger' : 'wb-shell-settings-tab'}
            type="button"
            role="tab"
            id={`${base}-tab-${section.key}`}
            aria-selected={section.key === selected}
            aria-controls={`${base}-panel-${section.key}`}
            tabIndex={section.key === selected ? 0 : -1}
            onClick={() => choose(section.key, false)}
          >
            {shellIcon(section.icon, 16)}
            {section.label}
          </button>
        ))}
      </div>
      {sections.map((section) => (
        <div
          key={section.key}
          className="wb-shell-settings-panel"
          role="tabpanel"
          id={`${base}-panel-${section.key}`}
          aria-labelledby={`${base}-tab-${section.key}`}
          hidden={section.key !== selected}
        >
          {props.children[section.key]}
        </div>
      ))}
    </div>
  )
}
