/**
 * 속성 패널의 고정 칸 **«상태 보임»**(설계서 「설계서 화면 구조」의 «화면 상태») — 노드 봉투의 필드(`visibility`)라 별칭 · 몫과 같은 층이다
 * (카탈로그의 `editor` 가 아니라 패널이 정한다).
 *
 * | 첫 줄(버튼 꼴 라디오) | 문서 |
 * |---|---|
 * | 비활성 | `visibility` 없음 — 모든 상태에서 보인다(기본값) |
 * | 숨김 | `{ mode: 'except', states }` — 켠 상태(와 그 하위 상태)에서 숨는다 |
 * | 표시 | `{ mode: 'only', states }` — 켠 상태(와 그 하위 상태)에서만 보인다 |
 *
 * - **«비활성»에서 다른 갈래로 옮기면 지금 고른 상태 하나로 시작한다**(기본이면 «기본»). 갈래끼리 옮기면 상태는 그대로다.
 * - **둘째 줄은 «숨김» · «표시»일 때만 서는 토글 단추 줄이다**(`aria-pressed` — 여럿을 켠다 · 라디오가 아니다). 차례는 «기본» 다음 트리 차례
 *   (`viewStateOrder`)이고 하위 상태는 이름 앞 표지(`›` 를 깊이만큼 — 접근 이름에는 안 든다)로 깊이를 보인다 — 단추가 줄을 바꿔 흐르므로
 *   들여 쓰기로는 깊이가 안 보인다. 하나는 늘 켜 둔다 — 마지막 하나는 끈다(보임을 걷으려면 «비활성»). 문서에 적는 차례는 «기본» 다음 트리
 *   차례다(켠 차례와 무관 — 같은 집합이 같은 값이 되게).
 * - **고칠 때마다 편집 하나다**(`visibilityOps` · 되돌리기 한 번).
 * - **상태가 없는 페이지에서는 칸 대신 한 줄**(`NO_STATES_NOTICE` — 상태는 우측 «페이지 정보» 탭에서 더한다).
 * - **뿌리에는 서지 않는다** — 뿌리는 숨을 수 없다(검증이 거절한다).
 */
import { useId, useRef, type KeyboardEvent, type ReactElement } from 'react'
import { DEFAULT_VIEW_STATE, viewStateName, viewStateOrder, type NodeVisibility, type ViewState } from '@wirebound/schema'
import { rovingStep } from '../palette/component-palette'

export const VISIBILITY_LABEL = '상태 보임'
/** 첫 줄의 차례 그대로다 — 기본값 «비활성»이 맨 앞. */
export const VISIBILITY_MODE_LABELS = { none: '비활성', except: '숨김', only: '표시' } as const
export const NO_STATES_NOTICE = '«페이지 정보» 탭에서 상태를 더하세요'
/** 마지막 하나 남은 상태 단추가 꺼진 까닭. */
export const LAST_STATE_REASON = '하나는 켜 두어야 합니다 — 보임을 걷으려면 «비활성»을 고르세요'
/** 지금 상태에서 숨은 노드를 고른 판의 한 줄 — 캔버스에 외곽선이 없는 까닭. */
export const HIDDEN_NOW_NOTICE = '지금 상태에서 숨어 있어 캔버스에 그리지 않습니다'
/** 하위 상태 이름 앞 표지 한 단. */
export const STATE_DEPTH_MARK = '›'

type Mode = keyof typeof VISIBILITY_MODE_LABELS
const MODES = Object.keys(VISIBILITY_MODE_LABELS) as Mode[]

/** 읽은 보임 — 모양이 틀리면 «비활성»(판정 `isVisibleIn` 이 그렇게 읽는다). */
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
  /** 지금 고른 상태 — 기본이면 `null`. «비활성»에서 옮길 때의 첫 상태다. */
  current: string | null
  /** 지금 상태에서 숨었는가 — 한 줄을 더한다. */
  hiddenNow: boolean
  disabled: boolean
  onCommit: (visibility: NodeVisibility | null) => void
}): ReactElement {
  const id = useId()
  const labelId = `${id}-label`
  const visibility = readVisibility(props.value)
  const mode: Mode = visibility === null ? 'none' : visibility.mode
  const picked = new Set(visibility?.states ?? [])
  const rows = [
    { id: DEFAULT_VIEW_STATE, name: viewStateName(props.viewStates, DEFAULT_VIEW_STATE), depth: 0 },
    ...viewStateOrder(props.viewStates).map(({ state, depth }) => ({ id: state.id, name: state.name, depth })),
  ]
  const radios = useRef(new Map<Mode, HTMLButtonElement>())

  const setMode = (next: Mode): void => {
    if (next === mode) return
    if (next === 'none') return props.onCommit(null)
    const states = visibility?.states.length ? visibility.states : [props.current ?? DEFAULT_VIEW_STATE]
    props.onCommit({ mode: next, states: orderStates(props.viewStates, states) })
  }
  const toggle = (stateId: string): void => {
    if (visibility === null) return
    const states = picked.has(stateId) ? visibility.states.filter((state) => state !== stateId) : [...visibility.states, stateId]
    if (states.length === 0) return
    props.onCommit({ mode: visibility.mode, states: orderStates(props.viewStates, states) })
  }
  /** 라디오 줄의 ← → Home End — 옮긴 갈래를 고르고 포커스도 옮긴다(APG 라디오 묶음). */
  const moveMode = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const next = rovingStep(event.key, index, MODES.length)
    if (next === null) return
    event.preventDefault()
    const target = MODES[next]!
    radios.current.get(target)?.focus()
    setMode(target)
  }

  return (
    <div className="wb-shell-prop" data-wb-node-visibility="">
      <dt className="wb-shell-prop-label">
        <span id={labelId}>{VISIBILITY_LABEL}</span>
      </dt>
      <dd className="wb-shell-prop-value">
        {props.viewStates.length === 0 ? (
          <p className="wb-shell-visibility-note">{NO_STATES_NOTICE}</p>
        ) : (
          <>
            <div
              className="wb-shell-visibility-modes"
              role="radiogroup"
              aria-labelledby={labelId}
              aria-disabled={props.disabled || undefined}
            >
              {MODES.map((key, index) => (
                <button
                  key={key}
                  ref={(element) => {
                    if (element === null) radios.current.delete(key)
                    else radios.current.set(key, element)
                  }}
                  type="button"
                  role="radio"
                  className="wb-shell-visibility-mode"
                  aria-checked={mode === key}
                  tabIndex={mode === key ? 0 : -1}
                  disabled={props.disabled}
                  onClick={() => setMode(key)}
                  onKeyDown={(event) => moveMode(event, index)}
                >
                  {VISIBILITY_MODE_LABELS[key]}
                </button>
              ))}
            </div>
            {visibility !== null && (
              <div className="wb-shell-visibility-states" role="group" aria-label={mode === 'only' ? '보이는 상태' : '숨는 상태'}>
                {rows.map((row) => {
                  const on = picked.has(row.id)
                  const last = on && picked.size === 1
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className="wb-shell-visibility-state"
                      aria-pressed={on}
                      disabled={props.disabled}
                      aria-disabled={last || undefined}
                      title={last ? LAST_STATE_REASON : undefined}
                      aria-description={last ? LAST_STATE_REASON : undefined}
                      data-depth={row.depth}
                      // 마지막 하나를 끄는 누름은 `toggle` 이 거른다(빈 목록을 안 보낸다).
                      onClick={() => toggle(row.id)}
                    >
                      {row.depth > 0 && (
                        <span className="wb-shell-visibility-depth" aria-hidden="true">
                          {STATE_DEPTH_MARK.repeat(row.depth)}
                        </span>
                      )}
                      {row.name}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
        {props.hiddenNow && <p className="wb-shell-visibility-note">{HIDDEN_NOW_NOTICE}</p>}
      </dd>
    </div>
  )
}
