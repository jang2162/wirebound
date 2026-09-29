/**
 * **토큰 편집기** — manifest 선언에서 자동으로 짓는 폼과 갤러리 미리보기(spec `2026-09-27-code-themes-design.md` 「토큰 편집」).
 *
 * - **초안은 화면 상태다.** 저장 전에는 서버 · 다른 사람에게 가지 않고 미리보기의 토큰 시트만 바꾼다(`settings/theme-preview.tsx`).
 * - **칸마다 사유를 곧바로 보인다** — `tokensCss` 의 이슈(서버가 저장 때 부르는 같은 함수)다. 사유가 있는 키는 미리보기에서 기본값으로
 *   선다. 사유가 하나라도 있으면 저장이 꺼지고 어느 칸인지 말한다 — 요청을 보내지 않는다.
 * - **저장은 기본값과 같은 값을 뺀 초안이다**(`PUT …/theme` 을 같은 `id@버전` · 쥔 `rev` 로). 서버도 기본값을 빼지만(api README
 *   「테마 패키지와 프로젝트 테마」) 여기서 빼야 «기본값으로» 가 본문에서 키를 지운다.
 * - **409** — 서버의 지금 값(`ApiError.current`)과 초안을 **다른 칸만** 나란히 보이고 고르게 한다: «서버 값으로»(초안 · `rev` 를 서버
 *   것으로) · «내 값으로 덮기»(서버 `rev` 로 다시 보낸다). 그 사이 남이 **판을 바꿨으면** 덮기가 판을 되돌려 버리므로 서버 값으로만 간다.
 * - **422** — `issues[].path` 가 `tokens.<키>` 면 그 칸에, `tokens`(전체 한도)면 저장 단추 옆에 선다.
 * - **바인딩이 바뀌어도 저장 안 한 초안은 남는다** — 옆 고르개의 저장 · 409 다시 읽기도 절의 바인딩을 바꾼다. 바탕(옛 서버 값)과 다른
 *   칸만 새 바탕 위에 얹고, 판이 바뀌었으면 `migrateTokens(옛 manifest, 새 manifest, 그 칸들)` 로 옮긴다(고르개가 서버 토큰을 옮기는 것과
 *   같은 함수). 옮기지 못한 칸이 있으면 그 수를 머리에 한 줄로 말한다 — 말없이 사라지지 않게. **제 저장 · «서버 값으로» 뒤에는** 초안이
 *   곧 서버 값이다(이 편집기가 바인딩을 넘긴 경우만 — `resetting`).
 * - owner 가 아니면 칸이 읽기 전용이고 저장 · «기본값으로» 가 없다 — 미리보기는 지금 값으로 선다.
 * - 저장하지 않은 초안을 두고 페이지를 떠나는 것은 막지 않는다.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ThemeManifest, TokenDecl } from '@wirebound/theme-sdk'
import { migrateTokens, tokensCss } from '@wirebound/themes'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import type { ProjectThemeView, ThemeRef } from '../api/types'
import { ThemePreview } from './theme-preview'
import { TokenField } from './token-field'

const SAVE_FAILURE = '토큰을 저장하지 못했습니다'
const STALE = '다른 사람이 먼저 저장했습니다 — 지금 값을 다시 읽었습니다'
const dropNotice = (count: number): string => `바꾼 판으로 옮기지 못한 토큰 ${count} 개의 초안을 버렸습니다`
/** 무리 없는 키 · 선언에 없는 무리를 모으는 자리. */
const OTHER_GROUP = '기타'

type Draft = Record<string, string | number>

/** 선언 차례대로 — 저장된 값이 있으면 그것, 없으면 기본값. */
function draftOf(manifest: ThemeManifest, tokens: Readonly<Draft>): Draft {
  return Object.fromEntries(
    Object.entries(manifest.tokens.items).map(([key, decl]) => [key, Object.hasOwn(tokens, key) ? tokens[key]! : decl.default]),
  )
}

/** 기본값과 다른 값만 — 저장 본문이자 미리보기의 토큰이다. */
function changedOnly(manifest: ThemeManifest, draft: Readonly<Draft>): Draft {
  return Object.fromEntries(Object.entries(draft).filter(([key, value]) => manifest.tokens.items[key]?.default !== value))
}

/** 값 하나의 사유 — `tokensCss` 이슈 문장에서 «— » 뒤의 까닭만. 기본값이면 보지 않는다(참조 기본값 `{…}` 은 값 문법이 아니다). */
function problemOf(manifest: ThemeManifest, key: string, decl: TokenDecl, value: string | number): string | null {
  if (value === decl.default) return null
  const issue = tokensCss(manifest, { [key]: value }).issues.find((i) => i.path === `values.${key}`)
  if (issue === undefined) return null
  const at = issue.message.indexOf(' — ')
  return at === -1 ? issue.message : issue.message.slice(at + 3)
}

function isThemeView(value: unknown): value is ProjectThemeView {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['rev'] === 'number' && typeof v['tokens'] === 'object' && v['tokens'] !== null && typeof v['themeId'] === 'string'
}

/** 무리 차례 — manifest `tokens.groups` 차례, 그 뒤에 «기타». */
function groupsOf(manifest: ThemeManifest): { id: string; label: string; keys: string[] }[] {
  const declared = manifest.tokens.groups ?? []
  const known = new Set(declared.map((g) => g.id))
  const groups = declared.map((g) => ({ id: g.id, label: g.label, keys: [] as string[] }))
  const other = { id: '', label: OTHER_GROUP, keys: [] as string[] }
  for (const [key, decl] of Object.entries(manifest.tokens.items)) {
    const home = decl.group !== undefined && known.has(decl.group) ? groups.find((g) => g.id === decl.group)! : other
    home.keys.push(key)
  }
  return [...groups, other].filter((g) => g.keys.length > 0)
}

export function TokenEditor(props: {
  projectId: string
  /** 부르는 쪽이 판 · manifest 가 있는 바인딩만 넘긴다(`settings/theme-section.tsx`). */
  view: ProjectThemeView
  canEdit: boolean
  onSaved: (view: ProjectThemeView) => void
  onStale: () => void
}): ReactElement {
  const api = useApi()
  const { view, canEdit } = props
  const manifest = view.manifest!
  const ref: ThemeRef = useMemo(() => ({ themeId: view.themeId ?? '', version: view.version ?? '' }), [view.themeId, view.version])
  const [draft, setDraft] = useState<Draft>(() => draftOf(manifest, view.tokens))
  const [serverIssues, setServerIssues] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<ProjectThemeView | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dropped, setDropped] = useState<string | null>(null)
  const heading = useId()
  /** 초안이 얹혀 있던 바인딩 — 바뀐 뒤 «바탕과 다른 칸» 을 이것으로 가른다. */
  const held = useRef(view)
  /** 이 편집기가 바인딩을 넘겼다(제 저장 · «서버 값으로») — 다음 바인딩에서 초안이 서버 값으로 선다. */
  const resetting = useRef(false)

  // 바인딩이 바뀌면 초안이 새 바탕에서 다시 서되, 저장 안 한 칸은 옮겨 얹는다(머리말 «바인딩이 바뀌어도»).
  useEffect(() => {
    const before = held.current
    held.current = view
    setServerIssues({})
    setConflict(null)
    if (before === view || view.manifest === null) return
    const fresh = draftOf(view.manifest, view.tokens)
    if (resetting.current || before.manifest === null) {
      resetting.current = false
      setDropped(null)
      setDraft(fresh)
      return
    }
    const old = draftOf(before.manifest, before.tokens)
    const unsaved: Draft = Object.fromEntries(Object.entries(draft).filter(([key, value]) => old[key] !== value))
    const sameRef = before.themeId === view.themeId && before.version === view.version
    // 같은 판이면 칸이 그대로다 — 반쯤 친 값(검사에 걸리는 값)도 남긴다. 다른 판이면 새 선언에 맞는 것만 옮긴다.
    const moved = sameRef ? { tokens: unsaved, dropped: 0 } : migrateTokens(before.manifest, view.manifest, unsaved)
    setDropped(moved.dropped > 0 ? dropNotice(moved.dropped) : null)
    setDraft({ ...fresh, ...moved.tokens })
    // 초안(`draft`)은 바인딩이 바뀐 그 렌더의 값을 읽는다 — 의존에 넣으면 칠 때마다 돈다.
  }, [view])

  const baseline = useMemo(() => draftOf(manifest, view.tokens), [manifest, view.tokens])
  const body = useMemo(() => changedOnly(manifest, draft), [manifest, draft])
  const items = manifest.tokens.items
  const problems: Record<string, string> = {}
  for (const [key, decl] of Object.entries(items)) {
    const problem = serverIssues[key] ?? problemOf(manifest, key, decl, draft[key] ?? decl.default)
    if (problem !== null) problems[key] = problem
  }
  const troubled = Object.keys(problems)
  const changed = Object.keys(items).some((key) => draft[key] !== baseline[key])

  function edit(key: string, value: string | number): void {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setMessage(null)
    setServerIssues((prev) => {
      if (!Object.hasOwn(prev, key)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function send(tokens: Draft, rev: number): Promise<void> {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const saved = await api.putProjectTheme(props.projectId, { ...ref, tokens, rev })
      resetting.current = true
      props.onSaved(saved)
      setMessage('토큰을 저장했습니다')
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'conflict') {
        if (isThemeView(caught.current)) setConflict(caught.current)
        else {
          setMessage(STALE)
          props.onStale()
        }
      } else if (caught instanceof ApiError && caught.code === 'validation-failed' && caught.issues.length > 0) {
        const perKey: Record<string, string> = {}
        const rest: string[] = []
        for (const issue of caught.issues) {
          const key = issue.path.startsWith('tokens.') ? issue.path.slice('tokens.'.length) : null
          if (key !== null && Object.hasOwn(items, key)) perKey[key] = issue.message
          else rest.push(issue.message)
        }
        setServerIssues(perKey)
        if (rest.length > 0) setMessage(rest.join(' · '))
      } else {
        const failure = toFailure(caught, SAVE_FAILURE)
        setMessage(failure.kind === 'message' ? failure.message : SAVE_FAILURE)
      }
    } finally {
      setBusy(false)
    }
  }

  const groups = groupsOf(manifest)
  // 미리보기는 초안으로 선다 — 읽기 전용이면 초안이 곧 지금 값이다.
  return (
    <div className="wb-shell-settings-tokens" role="group" aria-labelledby={heading}>
      <div className="wb-shell-settings-token-form">
        <h3 className="wb-shell-settings-subtitle" id={heading}>
          토큰
        </h3>
        {dropped !== null && (
          <p className="wb-shell-project-notice" role="status">
            {dropped}
          </p>
        )}
        {groups.map((group) => (
          <fieldset key={group.id || OTHER_GROUP} className="wb-shell-settings-token-group">
            <legend className="wb-shell-settings-legend">{group.label}</legend>
            {group.keys.map((key) => (
              <TokenField
                key={key}
                tokenKey={key}
                decl={items[key]!}
                value={draft[key] ?? items[key]!.default}
                readOnly={!canEdit || busy}
                problem={problems[key] ?? null}
                onChange={(value) => edit(key, value)}
                onReset={() => edit(key, items[key]!.default)}
              />
            ))}
          </fieldset>
        ))}

        {conflict !== null && (
          <Conflict
            items={items}
            server={conflict}
            draft={draft}
            sameRef={conflict.themeId === ref.themeId && conflict.version === ref.version}
            busy={busy}
            onServer={() => {
              resetting.current = true
              props.onSaved(conflict)
            }}
            onMine={() => void send(body, conflict.rev)}
          />
        )}

        {canEdit && (
          <div className="wb-shell-settings-token-actions">
            <button className="wb-shell-project-action" type="button" disabled={busy} onClick={() => setDraft(draftOf(manifest, {}))}>
              전부 기본값으로
            </button>
            <button
              className="wb-shell-project-submit"
              type="button"
              disabled={busy || !changed || troubled.length > 0 || conflict !== null}
              onClick={() => void send(body, view.rev)}
            >
              토큰 저장
            </button>
          </div>
        )}
        {canEdit && troubled.length > 0 && (
          <p className="wb-shell-settings-field-alert">{`고칠 칸이 있습니다 — ${troubled.map((key) => items[key]!.label).join(', ')}`}</p>
        )}
        {message !== null && (
          <p className="wb-shell-project-notice" role="status">
            {message}
          </p>
        )}
      </div>
      <ThemePreview themeRef={ref} manifest={manifest} tokens={body} />
    </div>
  )
}

/** 409 — 서버 값과 내 초안을 다른 칸만 나란히. */
function Conflict(props: {
  items: ThemeManifest['tokens']['items']
  server: ProjectThemeView
  draft: Readonly<Draft>
  /** 서버의 판이 내 판과 같은가 — 다르면 덮기가 판을 되돌리므로 서버 값으로만 간다. */
  sameRef: boolean
  busy: boolean
  onServer: () => void
  onMine: () => void
}): ReactElement {
  const rows = Object.entries(props.items)
    .map(([key, decl]) => {
      const server = Object.hasOwn(props.server.tokens, key) ? props.server.tokens[key]! : decl.default
      const mine = props.draft[key] ?? decl.default
      return { key, label: decl.label, server, mine }
    })
    .filter((row) => row.server !== row.mine)
  return (
    <div className="wb-shell-settings-confirm" role="group" aria-label="서버 값과 내 값">
      <p className="wb-shell-settings-confirm-title">
        {props.sameRef
          ? '다른 사람이 먼저 저장했습니다 — 다른 칸만 나란히 봅니다'
          : `다른 사람이 테마를 ${props.server.themeId}@${props.server.version ?? ''} 으로 바꿨습니다 — 서버 값으로 다시 섭니다`}
      </p>
      {props.sameRef && (
        <table className="wb-shell-settings-conflict">
          <thead>
            <tr>
              <th scope="col">칸</th>
              <th scope="col">서버 값</th>
              <th scope="col">내 값</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{String(row.server)}</td>
                <td>{String(row.mine)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="wb-shell-settings-confirm-actions">
        <button className="wb-shell-project-action" type="button" disabled={props.busy} onClick={props.onServer}>
          서버 값으로
        </button>
        {props.sameRef && (
          <button className="wb-shell-project-submit" type="button" disabled={props.busy} onClick={props.onMine}>
            내 값으로 덮기
          </button>
        )}
      </div>
    </div>
  )
}
