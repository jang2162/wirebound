/**
 * **내 API 토큰** — 로그인한 사람이 만든 토큰(`wireb login`) 전부를 보고 거둔다. 계정 묶음(`session/session-menu.tsx`)의
 * 링크로 온다.
 *
 * ## 왜 셸 밖 라우트인가
 *
 * 토큰은 프로젝트마다 발급되지만 **거두는 사람이 보는 단위는 계정이다** — 옛 비밀번호가 새었으면 그 사람의 토큰 전부를
 * 거둬야 하고, 거기에는 **멤버가 아닌 프로젝트의 토큰**도 든다(그 프로젝트의 목록은 서버가 404 로 숨긴다 — 서버
 * `routes/tokens.ts`의 «내 토큰은 프로젝트를 가로지른다»). 한 프로젝트의 셸 머리 팝오버(`shell/snapshots-panel.tsx`)에
 * 두면 그 줄들이 들어갈 자리가 없다. 그래서 프로젝트 목록과 나란한 라우트이고, 그 화면의 팔레트 루트와 목록 꼴을 함께
 * 쓴다(`.wb-shell-project-list` — `shell.css`의 팔레트 블록).
 *
 * ## 폐기는 두 번 누른다
 *
 * 폐기는 되돌릴 수 없고 그 토큰을 쓰던 CI · 에이전트가 곧바로 401 을 받는다. 그래서 첫 누름은 그 줄에 확인을 열고, 확정은
 * 되돌릴 수 없는 것의 색(`.wb-shell-project-danger`)이다 — 프로젝트 목록의 `삭제` → `삭제 확정`과 같은 무게 가르기다.
 * 이름을 쳐서 확인하게 하지 않는 것은 잃는 것이 다르기 때문이다 — 토큰은 다시 발급하면 되고 프로젝트는 되살릴 수 없다.
 *
 * **더블클릭 한 번이 두 누름을 다 지나면 안 된다.** 첫 누름이 그린 단추가 그 좌표에 서면 둘째 누름이 그것을 누른다. 그래서
 * 두 겹으로 막는다 — 전부 폐기와 줄 하나 폐기에 같은 규칙이다.
 *
 * - **확정은 연타의 둘째 누름을 버린다**(`click`의 `detail > 1` — `confirmClick`). 키보드로 누른 `click`은 `detail`이 0 이라
 *   지난다.
 * - **확정은 묻던 단추 자리에 서지 않는다** — 다른 줄로 내려간다(`shell.css`의 «내 API 토큰» 블록 — 전부 폐기는 세로로 쌓고,
 *   줄 하나의 확정은 만든 때 줄 밑으로 보낸다). 그 자리에는 `취소`가 서거나, 좁은 폭에서 둘째 줄로 접혀 있던 긴 이름의
 *   `폐기`면 `취소`가 윗줄로 올라가 만든 때 줄이 선다. `detail`이 1 인 두 누름(따로 누른 두 번 · 합성 클릭)은 이 겹만 막는다.
 *
 * [Chrome] 두 폭(390 · 1280)에서 첫 누름 뒤 그 단추의 왼끝 · 가운데 · 오른끝에 확정이 없고, `dblclick`과 따로 누른 두 번
 * (80 · 250 · 500ms)이 DELETE 0 건이다. 두 겹은 각각 혼자 `dblclick`을 막는다 — 가드를 떼도 0, 배치를 확정이 먼저인 가로
 * 줄로 되돌려도 0(그때 따로 누른 두 번은 1). 다시 재는 법: 독립 헤드리스 Chrome 으로 `/tokens`를 열어 `elementFromPoint` ·
 * `mouse.dblclick` · `mouse.click` 두 번. jsdom 은 좌표가 없어 배치를 못 잰다 — `test/routes/tokens.test.tsx`는 `detail`만 잰다.
 *
 * **전부 폐기의 확정은 수를 말하지 않는다** — 받아 둔 목록의 수는 누르는 순간 서버의 «전부»와 다를 수 있다(그 사이 다른 탭 ·
 * `wireb login`이 발급한 것). 실제로 거둔 수는 서버의 `revoked`로 알림이 말한다.
 *
 * ## 성공 뒤에는 목록을 다시 받는다
 *
 * 지운 줄만 빼서 그리지 않는다 — 그 사이 다른 탭 · `wireb login`이 발급했거나 멤버 제거가 지운 것이 있으면 빼기만 한
 * 목록은 서버와 갈린다. 프로젝트 목록(`projects/use-project-commands.tsx`)과 같은 판단이다.
 *
 * **하나 폐기의 404 는 성공으로 친다** — 그 토큰이 이미 없다는 뜻이고(다른 탭의 폐기 · 멤버 제거 · 프로젝트 삭제), 폐기가
 * 이루려던 상태가 참이다. 로그아웃의 «세션이 이미 없다»(`session/session-menu.tsx`)와 같은 자리다.
 */
import { useCallback, useEffect, useState, type MouseEvent, type ReactElement } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { MyApiToken } from '../api/types'
import { SessionMenu } from '../session/session-menu'

const LOAD_FAILURE = '토큰 목록을 불러오지 못했습니다'
const REVOKE_FAILURE = '토큰을 폐기하지 못했습니다'
const EMPTY_NOTICE = '만든 API 토큰이 없습니다'

/** 만든 때 · 마지막 사용을 그리는 꼴. 브라우저의 시간대로 그린다 — 서버는 UTC ISO 문자열을 준다. */
const WHEN = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : WHEN.format(date)
}

/** 확정 단추의 `onClick` — 연타의 둘째 누름을 버린다(머리말 «더블클릭 한 번이 두 누름을 다 지나면 안 된다»). */
function confirmClick(action: () => void): (event: MouseEvent<HTMLButtonElement>) => void {
  return (event) => {
    if (event.detail > 1) return
    action()
  }
}

type ListState = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'ready'; tokens: MyApiToken[] }

/** 열린 확인 — 줄 하나(`id`) 또는 전부. */
type Confirming = { kind: 'one'; id: string } | { kind: 'all' } | null

export function TokensRoute(): ReactElement {
  const api = useApi()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)
  /** 폐기의 실패. 조회 실패와 자리를 가른다 — 한 자리면 목록을 못 받은 사실이 폐기 실패에 덮인다. */
  const [failure, setFailure] = useState<Failure | null>(null)
  /** 마지막 폐기의 결과 한 문장 — 전부 폐기가 몇 개를 거뒀는지 말한다. */
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setState({ status: 'ready', tokens: await api.listMyTokens() })
    } catch (caught) {
      setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILURE) })
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  async function revoke(target: Exclude<Confirming, null>): Promise<void> {
    setBusy(true)
    setFailure(null)
    setNotice(null)
    try {
      if (target.kind === 'all') {
        const { revoked } = await api.revokeAllMyTokens()
        setNotice(`토큰 ${revoked}개를 폐기했습니다`)
      } else {
        try {
          await api.revokeMyToken(target.id)
        } catch (caught) {
          // 이미 없다 — 이루려던 상태다(머리말 «하나 폐기의 404»).
          if (!(caught instanceof ApiError && caught.status === 404)) throw caught
        }
        setNotice('토큰을 폐기했습니다')
      }
      setConfirming(null)
      await load()
    } catch (caught) {
      setFailure(toFailure(caught, REVOKE_FAILURE))
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />
  if (failure !== null && failure.kind === 'signed-out') return <SignedOut />

  const tokens = state.status === 'ready' ? state.tokens : []

  return (
    <main className="wb-shell-project-list">
      <div className="wb-shell-project-head">
        <h1 className="wb-shell-project-list-title">API 토큰</h1>
        <SessionMenu />
      </div>
      <p className="wb-shell-tokens-lead">
        <Link className="wb-shell-tokens-back" to="/">
          프로젝트 목록
        </Link>
      </p>
      <p className="wb-shell-tokens-note">
        이 계정으로 만든 토큰(<code>wireb login</code>) 전부입니다 — 멤버에서 빠진 프로젝트의 것도 보입니다. 비밀번호가 새었으면
        전부 폐기하세요. 폐기한 토큰을 쓰던 CLI · 에이전트는 곧바로 로그인이 풀립니다.
      </p>

      {tokens.length > 0 && (
        <div className="wb-shell-tokens-bulk">
          {confirming?.kind === 'all' ? (
            <>
              <button className="wb-shell-project-action" type="button" disabled={busy} onClick={() => setConfirming(null)}>
                취소
              </button>
              <button
                className="wb-shell-project-danger"
                type="button"
                disabled={busy}
                onClick={confirmClick(() => void revoke({ kind: 'all' }))}
              >
                토큰 전부 폐기 확정
              </button>
            </>
          ) : (
            <button className="wb-shell-project-action" type="button" disabled={busy} onClick={() => setConfirming({ kind: 'all' })}>
              전부 폐기
            </button>
          )}
        </div>
      )}

      {notice !== null && (
        <p className="wb-shell-project-notice" role="status">
          {notice}
        </p>
      )}
      {failure !== null && failure.kind === 'message' && (
        <p className="wb-shell-project-alert" role="alert">
          {failure.message}
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
        (tokens.length === 0 ? (
          <p className="wb-shell-project-notice">{EMPTY_NOTICE}</p>
        ) : (
          <ul className="wb-shell-project-items" aria-label="API 토큰">
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                busy={busy}
                confirming={confirming?.kind === 'one' && confirming.id === token.id}
                onAsk={() => setConfirming({ kind: 'one', id: token.id })}
                onCancel={() => setConfirming(null)}
                onConfirm={() => void revoke({ kind: 'one', id: token.id })}
              />
            ))}
          </ul>
        ))}
    </main>
  )
}

/**
 * 한 줄 — 이름 · 프로젝트 · 만든 때 · 마지막 사용. **멤버가 아닌 프로젝트는 이름 대신 그 사실과 id 를 적는다** — 서버가
 * 이름을 안 준다(머리말). 그 토큰은 지금 404 이지만 다시 멤버가 되면 살아나므로 거둘 대상이다.
 */
function TokenRow(props: {
  token: MyApiToken
  busy: boolean
  confirming: boolean
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  const { token, busy, confirming } = props
  return (
    <li className="wb-shell-project-item">
      <span className="wb-shell-tokens-name">{token.name}</span>
      <span className="wb-shell-tokens-project">
        {token.member && token.projectName !== null ? token.projectName : `멤버가 아닌 프로젝트 (${token.projectId})`}
      </span>
      <span className="wb-shell-tokens-meta">
        {`만든 때 ${formatWhen(token.createdAt)} · 마지막 사용 ${token.lastUsedAt === null ? '없음' : formatWhen(token.lastUsedAt)}`}
      </span>
      {confirming ? (
        <>
          <button className="wb-shell-project-action" type="button" disabled={busy} onClick={props.onCancel}>
            취소
          </button>
          <button className="wb-shell-project-danger wb-shell-tokens-confirm" type="button" disabled={busy} onClick={confirmClick(props.onConfirm)}>
            {`${token.name} 폐기 확정`}
          </button>
        </>
      ) : (
        <button className="wb-shell-project-action" type="button" disabled={busy} onClick={props.onAsk}>
          {`${token.name} 폐기`}
        </button>
      )}
    </li>
  )
}
