/**
 * **에디터가 쥔 프로젝트의 테마** — 고정한 `id@버전` · manifest · 토큰 · `rev` 와 번들의 정의. 셸(`routes/editor.tsx`)이 감싸고 캔버스 ·
 * 속성 패널 · 패턴 고르개가 읽는다.
 *
 * # 무엇이 이 값을 바꾸나
 *
 * | 입구 | 하는 일 |
 * |---|---|
 * | 첫 적재 | `getProjectTheme` → 로더가 번들을 싣는다. 싣는 동안 `loading` — 캔버스는 «테마를 불러오는 중…» 이다 |
 * | `theme-changed` 프레임(`applyFrame`) | `rev` 가 쥔 것 이하면 버린다. 판이 같으면 토큰 · `rev` 만 바꾼다(다시 읽지도 싣지도 않는다). 다르면 다시 읽는다 — manifest 가 필요하다 |
 * | 셸의 다시 읽기(`catchUp`) | 프로젝트의 `themeRev` 가 쥔 `rev` 보다 크면 다시 읽는다 — 끊긴 동안 놓친 프레임을 따라잡는다. 스냅샷 판 3 복원도 `theme-changed` 를 보내므로 같은 길이다 |
 * | «다시 불러오기»(`retry`) | 로더의 캐시를 걷고(`forget`) 다시 읽는다 |
 *
 * **다시 읽어 판이 바뀌면 새 정의가 설 때까지 옛 것을 그대로 둔다** — 판 · manifest · 토큰 · 정의를 한꺼번에 바꾼다. 따로 바꾸면 옛 뷰가
 * 새 테마 시트 · 토큰으로 그려지는 창이 선다. 빈 캔버스도 없다.
 *
 * **뒤로 가지 않는다** — 받은 답(프레임 · 다시 읽기)의 `rev` 가 쥔 것보다 작으면 버린다. 다시 읽기는 차례(`turn`)로 늦게 낸 것의 답만 받는다.
 *
 * **정의의 manifest 는 서버 것이다** — 번들이 실은 manifest 는 버린다(`withServerManifest` — 다른 테마를 등록했으면 `bundle-failed`).
 *
 * **번들이 실패해도 그린다** — `bundle-failed` 는 정의 대신 `{ manifest, views: {} }`(렌더러가 노드마다 SDK 기본 뷰로 떨어진다)이고 manifest 의
 * variant · 패턴 칸은 그대로 선다. 테마를 읽지 못했으면(`failed`) 앞에 쥔 것이 있으면 그것을, 없으면 테마 없음(`NO_THEME`)으로 그린다. 둘 다
 * 셸 머리에 한 줄로 알린다(`theme/theme-alert.tsx`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { ThemeDefinition, ThemeManifest } from '@wirebound/theme-sdk'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import type { ProjectThemeView, ThemeRef } from '../api/types'
import type { ServerFrame } from '../realtime/protocol'
import { useThemeBundleLoader } from './bundle-context'
import { withServerManifest } from './bundle-loader'

export type ThemeChangedFrame = Extract<ServerFrame, { type: 'theme-changed' }>

export interface ProjectThemeState {
  status: 'loading' | 'ready' | 'bundle-failed' | 'failed'
  ref: ThemeRef | null
  manifest: ThemeManifest | null
  tokens: Record<string, string | number>
  rev: number
  /** `bundle-failed` 이면 `{ manifest, views: {} }`. 테마를 한 번도 못 읽었으면 `null` — 그리는 쪽은 `NO_THEME` 으로 그린다. */
  definition: ThemeDefinition | null
  /** 정의가 그 판의 번들에서 왔는가 — 캔버스가 그 판의 `theme.css` 를 실을지 가른다. */
  bundled: boolean
  failure: string | null
}

export interface ProjectTheme extends ProjectThemeState {
  retry(): void
  catchUp(rev: number): void
  applyFrame(frame: ThemeChangedFrame): void
}

const INITIAL: ProjectThemeState = {
  status: 'loading',
  ref: null,
  manifest: null,
  tokens: {},
  rev: -1,
  definition: null,
  bundled: false,
  failure: null,
}

const UNBOUND = '프로젝트에 고정된 테마가 없습니다 — 서버가 다음 기동에 시스템 테마로 채웁니다'
const UNREAD = '테마를 읽지 못했습니다'

const ProjectThemeContext = createContext<ProjectTheme | null>(null)

const sameRef = (a: ThemeRef | null, b: ThemeRef | null): boolean =>
  a !== null && b !== null && a.themeId === b.themeId && a.version === b.version

export function ProjectThemeProvider(props: { projectId: string; children: ReactNode }): ReactElement {
  const api = useApi()
  const loader = useThemeBundleLoader()
  const [state, setState] = useState<ProjectThemeState>(INITIAL)
  // 비동기 답이 읽는 지금 값. 렌더를 기다리지 않고 곧바로 고친다 — 한 틱에 프레임 둘이 오면 둘째가 첫째의 `rev` 를 봐야 한다.
  const current = useRef(state)
  const turn = useRef(0)
  /** 있다고 들은 가장 높은 `rev` — 읽는 중에 온 따라잡기 · 프레임이 그 읽기의 답보다 새것이면 한 번 더 읽는다. */
  const wanted = useRef(-1)
  const reading = useRef(false)
  const alive = useRef(true)
  /** 셸을 떠나면 끊는다 — 떠난 셸의 조회가 브라우저 연결을 쥐지 않게(`api/client.ts` 의 `ReadOptions.cancel`). */
  const leaving = useRef<AbortController | null>(null)

  const commit = useCallback((next: ProjectThemeState) => {
    current.current = next
    setState(next)
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    const mine = ++turn.current
    reading.current = true
    let view: ProjectThemeView
    try {
      const cancel = leaving.current?.signal
      view = await api.getProjectTheme(props.projectId, cancel === undefined ? undefined : { cancel })
    } catch (caught) {
      if (!alive.current || turn.current !== mine) return
      reading.current = false
      // 로그인이 풀린 것은 셸의 다른 조회가 로그인 화면으로 데려간다 — 여기서는 한 줄만 말한다.
      const failure = toFailure(caught, UNREAD)
      commit({ ...current.current, status: 'failed', failure: failure.kind === 'message' ? failure.message : UNREAD })
      return
    }
    if (!alive.current || turn.current !== mine) return
    const held = current.current
    if (view.rev < held.rev) {
      reading.current = false
      return
    }
    if (view.themeId === null || view.version === null || view.manifest === null) {
      reading.current = false
      commit({ ...held, status: 'failed', failure: UNBOUND })
      return
    }
    const ref: ThemeRef = { themeId: view.themeId, version: view.version }
    const manifest = view.manifest
    if (held.status === 'ready' && sameRef(held.ref, ref)) {
      reading.current = false
      commit({ ...held, manifest, tokens: view.tokens, rev: view.rev })
    } else {
      const result = withServerManifest(await loader.load(ref), manifest)
      if (!alive.current || turn.current !== mine) return
      reading.current = false
      // 싣는 동안 프레임이 더 새 `rev` 를 실었으면(같은 판의 토큰) 그 토큰을 잇는다 — 이 답은 그보다 옛것이다.
      const latest = current.current
      const tokens = latest.rev > view.rev && sameRef(latest.ref, ref) ? latest.tokens : view.tokens
      const rev = Math.max(latest.rev, view.rev)
      commit(
        result.status === 'ok'
          ? { status: 'ready', ref, manifest, tokens, rev, definition: result.definition, bundled: true, failure: null }
          : { status: 'bundle-failed', ref, manifest, tokens, rev, definition: { manifest, views: {} }, bundled: false, failure: result.reason },
      )
    }
    if (wanted.current > current.current.rev) {
      // 따라잡을 것이 남았다 — 한 번만 더 읽는다(서버가 같은 칸을 읽으므로 두 번째에는 선다).
      wanted.current = current.current.rev
      void reload()
    }
  }, [api, loader, props.projectId, commit])

  useEffect(() => {
    alive.current = true
    const leave = new AbortController()
    leaving.current = leave
    void reload()
    return () => {
      alive.current = false
      turn.current += 1
      leave.abort()
    }
  }, [reload])

  const catchUp = useCallback(
    (rev: number) => {
      if (rev <= current.current.rev) return
      wanted.current = Math.max(wanted.current, rev)
      // 읽는 중이면 그 답이 끝에서 한 번 더 읽는다(`reload` 의 끝). 첫 적재 전(`loading`)도 같다 — 셸의 이펙트가 공급자의 첫 적재
      // 이펙트보다 먼저 돌아(자식이 먼저다) 여기서 읽으면 첫 조회가 둘이 된다.
      if (!reading.current && current.current.status !== 'loading') void reload()
    },
    [reload],
  )

  const applyFrame = useCallback(
    (frame: ThemeChangedFrame) => {
      const held = current.current
      if (frame.rev <= held.rev) return
      const ref = { themeId: frame.themeId, version: frame.version }
      // 읽는 중이어도 곧바로 얹는다 — 그 읽기의 답이 이보다 옛것이면 `reload` 가 버린다(«뒤로 가지 않는다»).
      if (held.manifest !== null && sameRef(held.ref, ref)) {
        commit({ ...held, tokens: frame.tokens, rev: frame.rev })
        return
      }
      wanted.current = Math.max(wanted.current, frame.rev)
      void reload()
    },
    [reload, commit],
  )

  const retry = useCallback(() => {
    const held = current.current
    if (held.ref !== null) loader.forget(held.ref)
    void reload()
  }, [loader, reload])

  const value = useMemo<ProjectTheme>(() => ({ ...state, retry, catchUp, applyFrame }), [state, retry, catchUp, applyFrame])
  return <ProjectThemeContext.Provider value={value}>{props.children}</ProjectThemeContext.Provider>
}

export function useProjectTheme(): ProjectTheme {
  const theme = useContext(ProjectThemeContext)
  if (theme === null) throw new Error('ProjectThemeProvider 밖에서 useProjectTheme 을 불렀습니다 — 셸(routes/editor.tsx)이 감싼다')
  return theme
}

/** 공급자 없이 값을 건넨다 — 설정 페이지의 미리보기 · 시험용 공급자(`test/theme-loader.ts` 의 `withProjectTheme`)가 쓴다. */
export const ProjectThemeValueProvider = ProjectThemeContext.Provider
