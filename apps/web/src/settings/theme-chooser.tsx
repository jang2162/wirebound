/**
 * **테마 · 판 고르기**와 그 자리의 **인라인 확인**(spec `2026-09-27-code-themes-design.md` 「테마 바꾸기와 버전 올리기」). 모달이 아니다 —
 * 확인은 고르개 밑에 연다(`projects/delete-confirm.tsx` 와 같은 꼴).
 *
 * - 목록은 `listThemePackages()` 다. 숨긴 판은 관리자 응답에만 실리고 «숨김» 으로 고를 수 없다. **지금 고정한 판은 숨겼어도 선다** —
 *   비관리자 응답에 없으면 그 판을 «지금» 으로 넣는다(없으면 고르개가 지금 값을 못 비춘다).
 * - 다른 `id@버전` 을 고르면 확인이 열리고 `getThemeManifest` · `getThemeImpact` 를 함께 읽는다 — 토큰의 이어짐 · 버려짐 · 기본값 수와
 *   페이지별 «없는 variant» 수.
 * - «바꾸기» 는 `putProjectTheme` 에 `migrateTokens(지금 manifest, 새 manifest, 지금 토큰)` 을 싣는다 — 서버의 impact 가 같은 함수로
 *   센다(`@wirebound/themes`). `rev` 는 쥔 바인딩의 것이다: 그 사이 남이 저장했으면 409 이고 서버 값으로 다시 읽는다.
 */
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { migrateTokens } from '@wirebound/themes'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import type { ProjectThemeView, ThemeImpact, ThemePackageSummary, ThemeRef } from '../api/types'

const LIST_FAILURE = '테마 목록을 불러오지 못했습니다'
const PREPARE_FAILURE = '바꿀 판을 읽지 못했습니다'
const SAVE_FAILURE = '테마를 바꾸지 못했습니다'
const STALE = '다른 사람이 먼저 바꿨습니다 — 지금 값을 다시 읽었습니다'
const HIDDEN = '이 판은 숨겨져 고를 수 없습니다'

interface VersionOption {
  version: string
  label: string
  disabled: boolean
}

interface ThemeOption {
  themeId: string
  name: string
  versions: VersionOption[]
}

/** 고르개의 칸 — 목록에 지금 판을 얹고, 숨긴 판은 끈다(지금 판은 빼고). */
function themeOptions(packages: readonly ThemePackageSummary[], current: ThemeRef, currentName: string): ThemeOption[] {
  const themes: ThemeOption[] = packages.map((pkg) => ({
    themeId: pkg.themeId,
    name: pkg.name,
    versions: pkg.versions.map((v) => {
      const pinned = pkg.themeId === current.themeId && v.version === current.version
      const tags = [...(pinned ? ['지금'] : []), ...(v.hidden ? ['숨김'] : [])]
      return { version: v.version, label: tags.length === 0 ? v.version : `${v.version} (${tags.join(' · ')})`, disabled: v.hidden && !pinned }
    }),
  }))
  let mine = themes.find((theme) => theme.themeId === current.themeId)
  if (mine === undefined) {
    mine = { themeId: current.themeId, name: currentName, versions: [] }
    themes.push(mine)
  }
  if (!mine.versions.some((v) => v.version === current.version)) {
    mine.versions.push({ version: current.version, label: `${current.version} (지금)`, disabled: false })
  }
  return themes
}

type Prepared =
  | { status: 'loading' }
  | { status: 'ready'; manifest: ThemeManifest; impact: ThemeImpact }
  | { status: 'failed'; message: string }

export function ThemeChooser(props: {
  projectId: string
  view: ProjectThemeView
  onSaved: (view: ProjectThemeView) => void
  /** 쥔 바인딩이 낡았다(409) — 절이 서버 값으로 다시 읽는다. */
  onStale: () => void
}): ReactElement {
  const api = useApi()
  const current: ThemeRef = { themeId: props.view.themeId ?? '', version: props.view.version ?? '' }
  const [packages, setPackages] = useState<ThemePackageSummary[] | null>(null)
  const [listFailure, setListFailure] = useState<string | null>(null)
  const [picked, setPicked] = useState<ThemeRef>(current)
  const [prepared, setPrepared] = useState<Prepared>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const ids = { theme: useId(), version: useId() }

  useEffect(() => {
    const leave = new AbortController()
    let alive = true
    void (async () => {
      try {
        const list = await api.listThemePackages({ cancel: leave.signal })
        if (alive) setPackages(list)
      } catch (caught) {
        if (!alive) return
        const failure = toFailure(caught, LIST_FAILURE)
        setListFailure(failure.kind === 'message' ? failure.message : LIST_FAILURE)
      }
    })()
    return () => {
      alive = false
      leave.abort()
    }
  }, [api])

  // 바인딩이 바뀌면(저장 · 다시 읽기) 고르개가 새 지금 값에서 선다.
  useEffect(() => {
    setPicked({ themeId: props.view.themeId ?? '', version: props.view.version ?? '' })
  }, [props.view])

  const themes = useMemo(
    () => (packages === null ? [] : themeOptions(packages, current, props.view.manifest?.name ?? current.themeId)),
    // `current` 는 `props.view` 에서 나온다 — 렌더마다 새 객체라 의존에 넣지 않는다.
    [packages, props.view],
  )
  const changing = picked.themeId !== current.themeId || picked.version !== current.version

  // 다른 판을 골랐으면 manifest · impact 를 함께 읽는다 — 고른 것이 또 바뀌면 앞 읽기의 답을 버린다.
  useEffect(() => {
    if (!changing) return
    const leave = new AbortController()
    let alive = true
    setPrepared({ status: 'loading' })
    void (async () => {
      try {
        const options = { cancel: leave.signal }
        const [manifest, impact] = await Promise.all([
          api.getThemeManifest(picked, options),
          api.getThemeImpact(props.projectId, picked, options),
        ])
        if (alive) setPrepared({ status: 'ready', manifest, impact })
      } catch (caught) {
        if (!alive) return
        const failure = toFailure(caught, PREPARE_FAILURE)
        setPrepared({ status: 'failed', message: failure.kind === 'message' ? failure.message : PREPARE_FAILURE })
      }
    })()
    return () => {
      alive = false
      leave.abort()
    }
  }, [api, props.projectId, picked.themeId, picked.version, changing])

  function pickTheme(themeId: string): void {
    setMessage(null)
    const theme = themes.find((t) => t.themeId === themeId)
    if (theme === undefined) return
    // 지금 테마로 돌아오면 지금 판, 다른 테마면 고를 수 있는 첫 판(목록은 높은 판부터다).
    const version =
      themeId === current.themeId ? current.version : (theme.versions.find((v) => !v.disabled)?.version ?? theme.versions[0]?.version ?? '')
    setPicked({ themeId, version })
  }

  function cancel(): void {
    setMessage(null)
    setPicked(current)
  }

  async function apply(manifest: ThemeManifest): Promise<void> {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const { tokens } = migrateTokens(props.view.manifest, manifest, props.view.tokens)
      const saved = await api.putProjectTheme(props.projectId, { ...picked, tokens, rev: props.view.rev })
      props.onSaved(saved)
      setMessage('테마를 바꿨습니다')
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'conflict') {
        setMessage(STALE)
        props.onStale()
      } else if (caught instanceof ApiError && caught.issues.some((issue) => issue.code === 'hidden-version')) {
        setMessage(HIDDEN)
      } else {
        const failure = toFailure(caught, SAVE_FAILURE)
        setMessage(failure.kind === 'message' ? failure.message : SAVE_FAILURE)
      }
    } finally {
      setBusy(false)
    }
  }

  if (listFailure !== null) {
    return (
      <p className="wb-shell-project-alert" role="alert">
        {listFailure}
      </p>
    )
  }
  if (packages === null) {
    return (
      <p className="wb-shell-project-notice" role="status">
        테마 목록을 불러오는 중…
      </p>
    )
  }

  const pickedTheme = themes.find((t) => t.themeId === picked.themeId)
  return (
    <div className="wb-shell-settings-chooser">
      <div className="wb-shell-settings-pick">
        <label className="wb-shell-settings-label" htmlFor={ids.theme}>
          테마
        </label>
        <select
          className="wb-shell-settings-input"
          id={ids.theme}
          value={picked.themeId}
          disabled={busy}
          onChange={(event) => pickTheme(event.target.value)}
        >
          {themes.map((theme) => (
            <option key={theme.themeId} value={theme.themeId}>
              {theme.name}
            </option>
          ))}
        </select>
      </div>
      <div className="wb-shell-settings-pick">
        <label className="wb-shell-settings-label" htmlFor={ids.version}>
          버전
        </label>
        <select
          className="wb-shell-settings-input"
          id={ids.version}
          value={picked.version}
          disabled={busy}
          onChange={(event) => {
            setMessage(null)
            setPicked({ themeId: picked.themeId, version: event.target.value })
          }}
        >
          {(pickedTheme?.versions ?? []).map((v) => (
            <option key={v.version} value={v.version} disabled={v.disabled}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {changing && (
        <div className="wb-shell-settings-confirm" role="group" aria-label="테마 바꾸기 확인">
          <p className="wb-shell-settings-confirm-title">{`${picked.themeId}@${picked.version} 으로 바꿉니다`}</p>
          {prepared.status === 'loading' && (
            <p className="wb-shell-project-notice" role="status">
              바꾸면 무엇이 달라지는지 읽는 중…
            </p>
          )}
          {prepared.status === 'failed' && (
            <p className="wb-shell-project-alert" role="alert">
              {prepared.message}
            </p>
          )}
          {prepared.status === 'ready' && (
            <>
              <p className="wb-shell-settings-confirm-line">{`이어짐 ${prepared.impact.tokens.kept} · 버려짐 ${prepared.impact.tokens.dropped} · 기본값 ${prepared.impact.tokens.defaulted}`}</p>
              {prepared.impact.variants.length > 0 && (
                <ul className="wb-shell-settings-confirm-list" aria-label="없는 variant 를 쓰는 페이지">
                  {prepared.impact.variants.map((page) => (
                    <li key={page.pageId} className="wb-shell-settings-confirm-item">
                      {`${page.title} — 없는 variant ${page.count}개`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="wb-shell-settings-confirm-actions">
            <button className="wb-shell-project-action" type="button" disabled={busy} onClick={cancel}>
              취소
            </button>
            <button
              className="wb-shell-project-submit"
              type="button"
              disabled={busy || prepared.status !== 'ready'}
              onClick={() => {
                if (prepared.status === 'ready') void apply(prepared.manifest)
              }}
            >
              바꾸기
            </button>
          </div>
        </div>
      )}
      {message !== null && (
        <p className="wb-shell-project-notice" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
