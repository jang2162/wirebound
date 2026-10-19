/**
 * 속성 패널의 고정 칸 **«상태 보임»**(설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C2」 · 「C3」) — 노드 봉투의
 * 필드(`visibility`)라 별칭 · 몫과 같은 층이다(카탈로그의 `editor` 가 아니라 패널이 정한다).
 *
 * | 고름 | 문서 |
 * |---|---|
 * | 없음 | `visibility` 없음 — 모든 상태에서 보인다 |
 * | 이 상태에서만 | `{ mode: 'only', states }` — 나열한 상태(와 그 하위 상태)에서만 보인다 |
 * | 이 상태에서 숨김 | `{ mode: 'except', states }` — 나열한 상태(와 그 하위 상태)에서 숨는다 |
 *
 * - **«없음»에서 다른 갈래로 옮기면 지금 고른 상태 하나로 시작한다**(기본이면 «기본») — 갈래 이름이 «이 상태»다. 갈래끼리 옮기면 상태는 그대로다.
 * - **상태 고르기는 트리 차례 · 여럿 · «기본» 포함**(`viewStateOrder` — 하위 상태는 들여 쓴다). 하나는 늘 골라 둔다 — 마지막 하나는 끈다(보임을
 *   걷으려면 «없음»). 문서에 적는 차례는 «기본» 다음 트리 차례다(고른 차례와 무관 — 같은 집합이 같은 값이 되게).
 * - **고칠 때마다 편집 하나다**(`visibilityOps` · 되돌리기 한 번).
 * - **상태가 없는 페이지에서는 칸 대신 한 줄**(`NO_STATES_NOTICE` — 상태는 메뉴 트리의 페이지 줄 `…` 에서 더한다).
 * - **뿌리에는 서지 않는다** — 뿌리는 숨을 수 없다(검증이 거절한다).
 */
import { useId, type ReactElement } from 'react'
import { DEFAULT_VIEW_STATE, viewStateName, viewStateOrder, type NodeVisibility, type ViewState } from '@wirebound/schema'

export const VISIBILITY_LABEL = '상태 보임'
export const VISIBILITY_MODE_LABELS = { none: '없음', only: '이 상태에서만', except: '이 상태에서 숨김' } as const
export const NO_STATES_NOTICE = '메뉴 트리에서 상태를 더하세요'
/** 마지막 하나 남은 상태 칸이 꺼진 까닭. */
export const LAST_STATE_REASON = '하나는 골라야 합니다 — 보임을 걷으려면 «없음»을 고르세요'
/** 지금 상태에서 숨은 노드를 고른 판의 한 줄 — 캔버스에 외곽선이 없는 까닭. */
export const HIDDEN_NOW_NOTICE = '지금 상태에서 숨어 있어 캔버스에 그리지 않습니다'

type Mode = keyof typeof VISIBILITY_MODE_LABELS

/** 읽은 보임 — 모양이 틀리면 «없음»(판정 `isVisibleIn` 이 그렇게 읽는다). */
function readVisibility(value: unknown): NodeVisibility | null {
  if (value === null || typeof value !== 'object') return null
  const { mode, states } = value as { mode?: unknown; states?: unknown }
  if ((mode !== 'only' && mode !== 'except') || !Array.isArray(states)) return null
  return { mode, states: states.filter((state): state is string => typeof state === 'string') }
}

/** 문서에 적는 차례 — «기본» 다음 트리 차례, 목록 밖 id 는 뒤에 그대로(남이 그 사이 지운 상태 — 서버가 거절해 말한다). */
export function orderStates(viewStates: readonly ViewState[], states: readonly string[]): string[] {
  const set = new Set(states)
  const order = [DEFAULT_VIEW_STATE, ...viewStateOrder(viewStates).map(({ state }) => state.id)]
  return [...order.filter((id) => set.has(id)), ...states.filter((id) => !order.includes(id))]
}

export function VisibilityField(props: {
  value: unknown
  viewStates: readonly ViewState[]
  /** 지금 고른 상태 — 기본이면 `null`. «없음»에서 옮길 때의 첫 상태다. */
  current: string | null
  /** 지금 상태에서 숨었는가 — 한 줄을 더한다. */
  hiddenNow: boolean
  disabled: boolean
  onCommit: (visibility: NodeVisibility | null) => void
}): ReactElement {
  const id = useId()
  const groupLabel = `${id}-states`
  const visibility = readVisibility(props.value)
  const mode: Mode = visibility === null ? 'none' : visibility.mode
  const picked = new Set(visibility?.states ?? [])
  const rows = [
    { id: DEFAULT_VIEW_STATE, name: viewStateName(props.viewStates, DEFAULT_VIEW_STATE), depth: 0 },
    ...viewStateOrder(props.viewStates).map(({ state, depth }) => ({ id: state.id, name: state.name, depth })),
  ]

  const setMode = (next: Mode): void => {
    if (next === mode) return
    if (next === 'none') return props.onCommit(null)
    const states = visibility?.states.length ? visibility.states : [props.current ?? DEFAULT_VIEW_STATE]
    props.onCommit({ mode: next, states: orderStates(props.viewStates, states) })
  }
  const toggle = (stateId: string, on: boolean): void => {
    if (visibility === null) return
    const states = on ? [...visibility.states, stateId] : visibility.states.filter((state) => state !== stateId)
    if (states.length === 0) return
    props.onCommit({ mode: visibility.mode, states: orderStates(props.viewStates, states) })
  }

  return (
    <div className="wb-shell-prop" data-wb-node-visibility="">
      <dt className="wb-shell-prop-label">
        <label id={`${id}-label`} htmlFor={id}>
          {VISIBILITY_LABEL}
        </label>
      </dt>
      <dd className="wb-shell-prop-value">
        {props.viewStates.length === 0 ? (
          <p className="wb-shell-visibility-note">{NO_STATES_NOTICE}</p>
        ) : (
          <>
            <select
              id={id}
              className="wb-shell-control"
              disabled={props.disabled}
              value={mode}
              onChange={(event) => setMode(event.target.value as Mode)}
            >
              {(Object.keys(VISIBILITY_MODE_LABELS) as Mode[]).map((key) => (
                <option key={key} value={key}>
                  {VISIBILITY_MODE_LABELS[key]}
                </option>
              ))}
            </select>
            {visibility !== null && (
              <fieldset className="wb-shell-visibility-states" aria-labelledby={groupLabel} disabled={props.disabled}>
                <legend id={groupLabel} className="wb-shell-visibility-legend">
                  {mode === 'only' ? '보이는 상태' : '숨는 상태'}
                </legend>
                {rows.map((row) => {
                  const checked = picked.has(row.id)
                  const last = checked && picked.size === 1
                  return (
                    <label key={row.id} className="wb-shell-visibility-state" style={{ paddingLeft: row.depth * 12 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        aria-disabled={last || undefined}
                        title={last ? LAST_STATE_REASON : undefined}
                        aria-description={last ? LAST_STATE_REASON : undefined}
                        // 마지막 하나를 빼는 누름은 `toggle` 이 거른다(빈 목록을 안 보낸다) — 여기서 한 번 더 거르지 않는다(겹 가드는 변조로 혼자 죽지 않았다).
                        onChange={(event) => toggle(row.id, event.target.checked)}
                      />
                      {row.name}
                    </label>
                  )
                })}
              </fieldset>
            )}
          </>
        )}
        {props.hiddenNow && <p className="wb-shell-visibility-note">{HIDDEN_NOW_NOTICE}</p>}
      </dd>
    </div>
  )
}
