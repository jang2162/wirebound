/**
 * **테마 관리** — `/admin/themes`(spec `2026-09-27-code-themes-design.md` 「관리자 화면」). 인스턴스 관리자가 테마 패키지를 올리고 판을
 * 숨기거나 되살리고 스타터 템플릿을 받는다. 프로젝트 목록 머리의 «테마 관리» 링크(관리자에게만)로 온다.
 *
 * 꼴은 «내 API 토큰»(`routes/tokens.tsx`)을 따른다 — 셸 밖 라우트 · 목록 화면의 팔레트 루트와 목록 꼴.
 *
 * - **관리자가 아니면 조회하지 않고 한 줄로 말한다.** 판정은 세션 사용자의 `isInstanceAdmin`(`/me` · 로그인 응답 — 요청마다 DB 에서
 *   읽은 값)이다. 권한의 진실은 서버다 — 동작(업로드 · 숨김 · 템플릿)이 403 이면(그 사이 강등) 같은 문장으로 선다.
 * - **업로드는 파일을 그대로 보낸다**(`uploadThemePackage` — zip 바이트, JSON 아님). 10 MB(`WBTHEME_LIMITS.zipBytes`)를 넘는 파일은 보내기
 *   전에 막는다. 422 는 이슈를 줄마다(원래 manifest 코드까지) 보인다. 성공하면 목록을 다시 받는다.
 * - **숨김 · 되살림은 확인이 없다** — 되돌릴 수 있다. 숨긴 판은 새로 고를 수 없고 이미 고정한 프로젝트는 그대로 쓴다.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { WBTHEME_LIMITS } from '@wirebound/themes'
import { ApiError, type ApiErrorIssue } from '../api/client'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ThemePackageSummary, ThemePackageVersion } from '../api/types'
import { saveBlob } from '../files/file-io'
import { useSessionUser } from '../session/session-context'
import { SessionMenu } from '../session/session-menu'
import { formatWhen } from '../account/tokens-section'

const ADMIN_ONLY = '인스턴스 관리자만 볼 수 있습니다'
const LOAD_FAILURE = '테마 목록을 불러오지 못했습니다'
const UPLOAD_FAILURE = '테마 패키지를 올리지 못했습니다'
const TOO_LARGE = '10 MB 를 넘습니다'
const DUPLICATE = '같은 판이 이미 있습니다'
const HIDE_FAILURE = '판을 바꾸지 못했습니다'
const TEMPLATE_FAILURE = '템플릿을 받지 못했습니다'
const TEMPLATE_FILE = 'wirebound-theme-starter.zip'

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

  return (
    <main className="wb-shell-project-list">
      <div className="wb-shell-project-head">
        <h1 className="wb-shell-project-list-title">테마 관리</h1>
        <SessionMenu />
      </div>
      <p className="wb-shell-tokens-lead">
        <Link className="wb-shell-tokens-back" to="/">
          프로젝트 목록
        </Link>
      </p>

      {!admin || forbidden ? (
        <p className="wb-shell-project-alert" role="alert">
          {ADMIN_ONLY}
        </p>
      ) : (
        <>
          <div className="wb-shell-admin-tools">
            <label className="wb-shell-admin-upload">
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
            <button className="wb-shell-project-action" type="button" disabled={busy} onClick={() => void template()}>
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
          {state.status === 'ready' &&
            state.packages.map((pkg) => (
              <section key={pkg.themeId} className="wb-shell-admin-theme" aria-label={pkg.themeId}>
                <h2 className="wb-shell-admin-theme-title">{`${pkg.name} (${pkg.themeId})`}</h2>
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
                        className="wb-shell-project-action"
                        type="button"
                        disabled={busy}
                        aria-label={`${row.themeId}@${row.version} ${row.hidden ? '되살림' : '숨김'}`}
                        onClick={() => void toggle(row)}
                      >
                        {row.hidden ? '되살림' : '숨김'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </>
      )}
    </main>
  )
}
