/**
 * **테마 관리** — `/admin/themes`(spec `2026-09-27-code-themes-design.md` 「관리자 화면」). 인스턴스 관리자가 테마 패키지를 올리고 판을
 * 숨기거나 되살리고 스타터 템플릿을 받는다. 셸 밖 화면 머리 `…` 의 «테마 관리»(관리자에게만 — `shell/page-head.tsx`)로 온다.
 *
 * # 꼴 — 목록 + 상세 + 미리보기
 *
 * 위에 도구 줄(올리기 · 템플릿), 그 밑에 왼쪽 **테마 목록**(테마마다 이름 · id · 판 수 · 숨긴 판 수)과 오른쪽 **상세**(고른 테마의 판 줄 ·
 * 그 아래 고른 판의 **미리보기**)다. 창이 좁으면(< 900px) 목록이 위, 상세가 아래다. 화면 루트는 `.wb-shell-settings`(넓은 폭 · 팔레트).
 *
 * - **주소가 고른 것을 든다** — `?theme=<id>&version=<판>`. 없거나 모르는 테마면 첫 테마, 모르는 판이면 그 테마의 `latest`(숨기지 않은
 *   판의 최대 — 다 숨었으면 첫 판). 고르면 `replace` 로 주소만 바꾼다. 올리기가 성공하면 올린 판을 고른다.
 * - **미리보기는 프로젝트 설정의 미리보기와 같은 부품이다**(`settings/theme-preview.tsx` 의 `ThemePreview`) — 번들은 숨은 realm iframe 에
 *   번들 로더로 싣고(`theme/bundle-loader.ts`), 갤러리는 same-origin 캔버스 iframe 에 그린다. 관리자 화면 문서에 테마 코드를 싣는 길을
 *   따로 만들지 않는다. manifest 는 `getThemeManifest`, 토큰은 기본값이다. **숨긴 판도 미리 본다** — 서버가 숨긴 판의 manifest · 파일도
 *   낸다(`apps/api/src/routes/theme-packages.ts` 머리말).
 *
 * - **관리자가 아니면 조회하지 않고 한 줄로 말한다.** 판정은 세션 사용자의 `isInstanceAdmin`(`/me` · 로그인 응답 — 요청마다 DB 에서
 *   읽은 값)이다. 권한의 진실은 서버다 — 동작(업로드 · 숨김 · 템플릿)이 403 이면(그 사이 강등) 같은 문장으로 선다.
 * - **업로드는 파일을 그대로 보낸다**(`uploadThemePackage` — zip 바이트, JSON 아님). 10 MB(`WBTHEME_LIMITS.zipBytes`)를 넘는 파일은 보내기
 *   전에 막는다. 422 는 이슈를 줄마다(원래 manifest 코드까지) 보인다. 성공하면 목록을 다시 받는다.
 * - **숨김 · 되살림은 확인이 없다** — 되돌릴 수 있다. 숨긴 판은 새로 고를 수 없고 이미 고정한 프로젝트는 그대로 쓴다.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { WBTHEME_LIMITS } from '@wirebound/themes'
import { ApiError, type ApiErrorIssue } from '../api/client'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ThemePackageSummary, ThemePackageVersion, ThemeRef } from '../api/types'
import { saveBlob } from '../files/file-io'
import { useSessionUser } from '../session/session-context'
import { formatWhen } from '../account/tokens-section'
import { ThemePreview } from '../settings/theme-preview'
import { shellIcon } from '../shell/icons'
import { PageHead } from '../shell/page-head'

const ADMIN_ONLY = '인스턴스 관리자만 볼 수 있습니다'
const LOAD_FAILURE = '테마 목록을 불러오지 못했습니다'
const UPLOAD_FAILURE = '테마 패키지를 올리지 못했습니다'
const TOO_LARGE = '10 MB 를 넘습니다'
const DUPLICATE = '같은 판이 이미 있습니다'
const HIDE_FAILURE = '판을 바꾸지 못했습니다'
const TEMPLATE_FAILURE = '템플릿을 받지 못했습니다'
const TEMPLATE_FILE = 'wirebound-theme-starter.zip'
const PREVIEW_FAILURE = '미리보기를 불러오지 못했습니다'
/** 목록이 비었을 때 — 시스템 테마는 기동이 넣으므로 보통은 안 선다. */
const NO_THEMES = '올린 테마가 없습니다'

type LoadState = { status: 'loading' } | { status: 'ready'; packages: ThemePackageSummary[] } | { status: 'failed'; failure: Failure }

/** 올린 결과 한 줄 — 알림 · 문장 · 이슈 목록 가운데 하나. */
type UploadOutcome = { kind: 'done'; text: string } | { kind: 'failed'; text: string } | { kind: 'issues'; issues: ApiErrorIssue[] }

function isForbidden(caught: unknown): boolean {
  return caught instanceof ApiError && caught.code === 'forbidden'
}

function messageOf(caught: unknown, fallback: string): string {
  const failure = toFailure(caught, fallback)
  return failure.kind === 'message' ? failure.message : fallback
}

/** 주소의 `?theme=` · `?version=` 에서 고른 테마 · 판(머리말 «주소가 고른 것을 든다»). 목록이 비면 `null`. */
function pickedOf(
  packages: readonly ThemePackageSummary[],
  themeId: string | null,
  version: string | null,
): { pkg: ThemePackageSummary; version: string } | null {
  const pkg = packages.find((p) => p.themeId === themeId) ?? packages[0]
  if (pkg === undefined) return null
  const known = pkg.versions.find((v) => v.version === version)
  return { pkg, version: known?.version ?? pkg.latest ?? pkg.versions[0]?.version ?? '' }
}

function sizeText(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AdminThemesRoute(): ReactElement {
  const api = useApi()
  const user = useSessionUser()
  const admin = user?.isInstanceAdmin === true
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [forbidden, setForbidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [upload, setUpload] = useState<UploadOutcome | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()

  /** 고른 테마 · 판을 주소에 적는다 — 다른 질의는 그대로 · 뒤로 가기 기록을 쌓지 않는다. */
  const pick = useCallback(
    (ref: ThemeRef): void => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('theme', ref.themeId)
          next.set('version', ref.version)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const load = useCallback(
    async (alive: () => boolean): Promise<void> => {
      try {
        const packages = await api.listThemePackages()
        if (alive()) setState({ status: 'ready', packages })
      } catch (caught) {
        if (alive()) setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILURE) })
      }
    },
    [api],
  )

  useEffect(() => {
    if (!admin) return
    let alive = true
    void load(() => alive)
    return () => {
      alive = false
    }
  }, [admin, load])

  async function send(file: File): Promise<void> {
    setNotice(null)
    // 서버의 상한과 같은 값이다 — 넘는 파일은 413 을 받으러 보내지 않는다.
    if (file.size > WBTHEME_LIMITS.zipBytes) {
      setUpload({ kind: 'failed', text: TOO_LARGE })
      return
    }
    setBusy(true)
    setUpload(null)
    try {
      const uploaded = await api.uploadThemePackage(file)
      setUpload({ kind: 'done', text: `${uploaded.themeId}@${uploaded.version} 을 올렸습니다` })
      await load(() => true)
      // 올린 판을 고른다 — 방금 올린 것을 곧바로 본다.
      pick({ themeId: uploaded.themeId, version: uploaded.version })
    } catch (caught) {
      if (isForbidden(caught)) setForbidden(true)
      else if (caught instanceof ApiError && caught.status === 413) setUpload({ kind: 'failed', text: TOO_LARGE })
      else if (caught instanceof ApiError && caught.code === 'conflict') setUpload({ kind: 'failed', text: DUPLICATE })
      else if (caught instanceof ApiError && caught.code === 'validation-failed' && caught.issues.length > 0) {
        setUpload({ kind: 'issues', issues: caught.issues })
      } else setUpload({ kind: 'failed', text: messageOf(caught, UPLOAD_FAILURE) })
    } finally {
      setBusy(false)
    }
  }

  async function toggle(row: ThemePackageVersion): Promise<void> {
    setBusy(true)
    setNotice(null)
    try {
      const updated = await api.setThemePackageHidden({ themeId: row.themeId, version: row.version }, !row.hidden)
      setState((prev) =>
        prev.status !== 'ready'
          ? prev
          : {
              status: 'ready',
              packages: prev.packages.map((pkg) => ({
                ...pkg,
                versions: pkg.versions.map((v) => (v.themeId === updated.themeId && v.version === updated.version ? updated : v)),
              })),
            },
      )
    } catch (caught) {
      if (isForbidden(caught)) setForbidden(true)
      else setNotice(messageOf(caught, HIDE_FAILURE))
    } finally {
      setBusy(false)
    }
  }

  async function template(): Promise<void> {
    setBusy(true)
    setNotice(null)
    try {
      saveBlob(await api.downloadThemeTemplate(), TEMPLATE_FILE)
    } catch (caught) {
      if (isForbidden(caught)) setForbidden(true)
      else setNotice(messageOf(caught, TEMPLATE_FAILURE))
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />

  const picked = state.status === 'ready' ? pickedOf(state.packages, params.get('theme'), params.get('version')) : null

  return (
    <main className="wb-shell-settings">
      {/* 머리 — 로고(프로젝트 목록으로) · 제목 · `…`(`shell/page-head.tsx`). */}
      <PageHead title="테마 관리" brand />

      {!admin || forbidden ? (
        <p className="wb-shell-project-alert" role="alert">
          {ADMIN_ONLY}
        </p>
      ) : (
        <>
          {/* 도구 줄 — 올리기(파일 칸은 눈에서만 감추고 라벨이 단추 꼴이다 — 접근 이름은 라벨 글 그대로) · 템플릿 받기. */}
          <div className="wb-shell-admin-tools">
            <label className="wb-shell-admin-upload" aria-disabled={busy}>
              {shellIcon('uploadTheme', 16)}
              테마 패키지 올리기
              <input
                className="wb-shell-admin-file"
                type="file"
                accept=".wbtheme,.zip"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  // 같은 파일을 다시 골라도 `change` 가 나게 비운다.
                  event.target.value = ''
                  if (file !== undefined) void send(file)
                }}
              />
            </label>
            <span className="wb-shell-admin-hint">.wbtheme · 10 MB 까지</span>
            <button className="wb-shell-admin-template" type="button" disabled={busy} onClick={() => void template()}>
              {shellIcon('themeTemplate', 16)}
              스타터 템플릿 받기
            </button>
          </div>

          {upload?.kind === 'done' && (
            <p className="wb-shell-project-notice" role="status">
              {upload.text}
            </p>
          )}
          {upload?.kind === 'failed' && (
            <p className="wb-shell-project-alert" role="alert">
              {upload.text}
            </p>
          )}
          {upload?.kind === 'issues' && (
            <ul className="wb-shell-admin-issues" aria-label="업로드를 거절한 까닭">
              {upload.issues.map((issue, index) => (
                <li key={index} className="wb-shell-admin-issue">
                  {`${issue.path} — ${issue.message}${issue.manifestCode === undefined ? '' : ` (${issue.manifestCode})`}`}
                </li>
              ))}
            </ul>
          )}
          {notice !== null && (
            <p className="wb-shell-project-alert" role="alert">
              {notice}
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
          {state.status === 'ready' && picked === null && <p className="wb-shell-project-notice">{NO_THEMES}</p>}
          {state.status === 'ready' && picked !== null && (
            <div className="wb-shell-admin-layout">
              <ThemeList packages={state.packages} selected={picked.pkg.themeId} onPick={pick} />
              <ThemeDetail
                pkg={picked.pkg}
                version={picked.version}
                busy={busy}
                onPreview={(version) => pick({ themeId: picked.pkg.themeId, version })}
                onToggle={(row) => void toggle(row)}
              />
            </div>
          )}
        </>
      )}
    </main>
  )
}

/** 왼쪽 테마 목록 — 테마마다 단추 하나(이름 · id · 판 수 · 숨긴 판 수). 고른 것은 `aria-current`. */
function ThemeList(props: { packages: readonly ThemePackageSummary[]; selected: string; onPick: (ref: ThemeRef) => void }): ReactElement {
  return (
    <ul className="wb-shell-admin-list" aria-label="테마 목록">
      {props.packages.map((pkg) => {
        const hidden = pkg.versions.filter((v) => v.hidden).length
        const first = pkg.latest ?? pkg.versions[0]?.version ?? ''
        return (
          <li key={pkg.themeId} className="wb-shell-admin-list-item">
            <button
              className="wb-shell-admin-pick"
              type="button"
              aria-current={pkg.themeId === props.selected ? 'true' : undefined}
              onClick={() => props.onPick({ themeId: pkg.themeId, version: first })}
            >
              <span className="wb-shell-admin-pick-name">{pkg.name}</span>
              <span className="wb-shell-admin-pick-meta">
                {`${pkg.themeId} · ${pkg.versions.length}판${hidden > 0 ? ` · 숨김 ${hidden}` : ''}`}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 오른쪽 상세 — 고른 테마의 판 줄과 고른 판의 미리보기. 영역 이름은 테마 id 다. */
function ThemeDetail(props: {
  pkg: ThemePackageSummary
  version: string
  busy: boolean
  onPreview: (version: string) => void
  onToggle: (row: ThemePackageVersion) => void
}): ReactElement {
  const { pkg } = props
  return (
    <section className="wb-shell-admin-theme" aria-label={pkg.themeId}>
      <h2 className="wb-shell-admin-theme-title">{`${pkg.name} (${pkg.themeId})`}</h2>
      {pkg.description !== null && <p className="wb-shell-admin-desc">{pkg.description}</p>}
      <ul className="wb-shell-project-items">
        {pkg.versions.map((row) => (
          <li key={row.version} className="wb-shell-project-item">
            <span className="wb-shell-tokens-name">{row.version}</span>
            <span className="wb-shell-tokens-project">{row.name}</span>
            {row.hidden && <span className="wb-shell-admin-hidden">숨김</span>}
            <span className="wb-shell-tokens-meta">
              {`${sizeText(row.size)} · 올린 때 ${formatWhen(row.uploadedAt)} · ${row.uploadedBy === null ? '시스템' : row.uploadedBy.name}`}
            </span>
            <button
              className="wb-shell-admin-preview-pick"
              type="button"
              aria-pressed={row.version === props.version}
              aria-label={`${row.themeId}@${row.version} 미리보기`}
              onClick={() => props.onPreview(row.version)}
            >
              {shellIcon('preview', 14)}
              미리보기
            </button>
            <button
              className="wb-shell-project-action"
              type="button"
              disabled={props.busy}
              aria-label={`${row.themeId}@${row.version} ${row.hidden ? '되살림' : '숨김'}`}
              onClick={() => props.onToggle(row)}
            >
              {row.hidden ? '되살림' : '숨김'}
            </button>
          </li>
        ))}
      </ul>
      <AdminPreview themeRef={{ themeId: pkg.themeId, version: props.version }} />
    </section>
  )
}

type ManifestState = { key: string; manifest: ThemeManifest } | { key: string; failure: string } | null

/** 고른 판의 미리보기 — manifest 를 읽어 설정 미리보기와 같은 부품(`ThemePreview`)에 기본값 토큰으로 넘긴다. */
function AdminPreview(props: { themeRef: ThemeRef }): ReactElement {
  const api = useApi()
  const { themeId, version } = props.themeRef
  const key = `${themeId}@${version}`
  const [state, setState] = useState<ManifestState>(null)

  useEffect(() => {
    const leave = new AbortController()
    let alive = true
    void (async () => {
      try {
        const manifest = await api.getThemeManifest({ themeId, version }, { cancel: leave.signal })
        if (alive) setState({ key, manifest })
      } catch (caught) {
        if (alive) setState({ key, failure: messageOf(caught, PREVIEW_FAILURE) })
      }
    })()
    return () => {
      alive = false
      leave.abort()
    }
  }, [api, themeId, version, key])

  return (
    <div className="wb-shell-admin-preview">
      <h3 className="wb-shell-settings-subtitle">{`미리보기 — ${key}`}</h3>
      {(state === null || state.key !== key) && (
        <p className="wb-shell-project-notice" role="status">
          미리보기를 불러오는 중…
        </p>
      )}
      {state !== null && state.key === key && 'failure' in state && (
        <p className="wb-shell-project-alert" role="alert">
          {state.failure}
        </p>
      )}
      {state !== null && state.key === key && 'manifest' in state && (
        <ThemePreview themeRef={{ themeId, version }} manifest={state.manifest} tokens={NO_TOKENS} />
      )}
    </div>
  )
}

/** 미리보기의 토큰 — 기본값(빈 초안). 렌더마다 새 객체면 미리보기가 시트를 다시 짓는다. */
const NO_TOKENS: Readonly<Record<string, string | number>> = {}
