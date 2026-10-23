/**
 * `color` control의 위젯 — 견본 열둘 · `#rrggbb` 글 칸 · 고르개(`<input type="color">`) · «테마 기본»(지우기). 값의 꼴은 카탈로그가 정한다
 * (`@wirebound/schema` 의 `PLACEHOLDER_COLOR` — 소문자 `#rrggbb`). 이 위젯은 대문자 · `#` 없는 여섯 자리를 받아 그 꼴로 바꿔 보낸다.
 *
 * **커밋 시점이 둘이다.** 글 칸은 `TextControl` 과 같이 blur/Enter 에 한 번(초안 · `onLeave` 규칙도 같다), 견본 · 고르개 · 지우기는 곧바로다.
 * **고르개는 `input` 이 아니라 `change` 에 커밋한다** — Chrome 은 고르개를 끄는 동안 `input` 을 계속 내 React `onChange` 로 받으면 끌기 한
 * 번이 편집 수십 개(되돌리기 수십 칸)가 된다. 네이티브 `change` 는 고르개를 닫을 때 한 번 난다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { PLACEHOLDER_COLOR, type EditorField } from '@wirebound/schema'
import { MIXED_PLACEHOLDER } from './text-control'

export interface ColorControlProps {
  field: EditorField
  value: unknown
  id: string
  /** 남이 잠근 자리라 못 바꾸는가 — 글 칸 · 견본 · 고르개 · 지우기가 다 꺼진다. */
  disabled: boolean
  /** `''` 는 «테마 기본»(부르는 쪽이 prop 을 지운다 — `../property-panel.tsx` 의 `PropControl`). */
  onCommit: (value: string) => void
  mixed?: boolean
  onLeave?: (value: string) => void
}

/**
 * 견본 — 설계서에 자주 나오는 계열(파랑 · 노랑 · 빨강 · 초록 · 회색)의 짙은 색과 옅은 바탕. 칩 · 배지 · 경고 띠를 한 번에 고르게 짝으로 둔다.
 */
export const COLOR_SWATCHES: readonly string[] = [
  '#2563eb',
  '#dbeafe',
  '#eab308',
  '#fef9c3',
  '#dc2626',
  '#fee2e2',
  '#16a34a',
  '#dcfce7',
  '#475569',
  '#e2e8f0',
  '#111827',
  '#ffffff',
]

/** 친 글을 카탈로그의 꼴로 — 앞뒤 공백 · 대문자 · 빠진 `#` 를 받는다. 꼴 밖이면 `null`. 빈 글은 `''`(테마 기본). */
export function normalizeColor(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const lower = (trimmed.startsWith('#') ? trimmed : `#${trimmed}`).toLowerCase()
  return PLACEHOLDER_COLOR.test(lower) ? lower : null
}

export const COLOR_FORMAT_ERROR = '색은 #rrggbb 꼴로 적습니다(예: #2563eb)'

export function ColorControl(props: ColorControlProps): ReactElement {
  const { field, id, disabled, onCommit } = props
  const original = typeof props.value === 'string' ? props.value : ''
  const [draft, setDraft] = useState(original)
  const [seen, setSeen] = useState(original)
  const [error, setError] = useState(false)
  // 문서 값이 밖에서 바뀌면 초안을 버린다 — 까닭은 `./text-control.tsx` 의 같은 자리.
  if (original !== seen) {
    setSeen(original)
    setDraft(original)
    setError(false)
  }

  /** 글 칸의 커밋할 값 — 없으면 `null`. 안 바뀌었거나 꼴 밖이면 안 보낸다. */
  function pending(): string | null {
    const next = normalizeColor(draft)
    if (next === null || next === original) return null
    return next
  }

  function commitText(): void {
    if (normalizeColor(draft) === null) {
      setError(true)
      return
    }
    setError(false)
    const next = pending()
    if (next !== null) onCommit(next)
  }

  function pick(next: string): void {
    setError(false)
    setDraft(next)
    if (next !== original || props.mixed === true) onCommit(next)
  }

  const leave = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    leave.current = () => {
      const next = pending()
      if (next !== null) props.onLeave?.(next)
    }
  })
  useEffect(() => () => leave.current(), [])

  // 네이티브 `change` — 위 머리말의 «고르개는 `change` 에 커밋한다».
  const picker = useRef<HTMLInputElement>(null)
  const pickRef = useRef(pick)
  pickRef.current = pick
  useEffect(() => {
    const element = picker.current
    if (element === null) return
    const onChange = () => pickRef.current(element.value.toLowerCase())
    element.addEventListener('change', onChange)
    return () => element.removeEventListener('change', onChange)
  }, [])

  const shown = normalizeColor(draft)
  return (
    // 칸이 여럿이라 라벨(`htmlFor`)이 묶음을 가리킨다 — 목록 위젯(`./list-control.tsx`)과 같은 꼴.
    <div className="wb-shell-color" role="group" aria-labelledby={`${id}-label`} id={id}>
      <div className="wb-shell-color-row">
        <span
          className="wb-shell-color-chip"
          aria-hidden="true"
          data-empty={shown === null || shown === '' ? '' : undefined}
          style={shown === null || shown === '' ? undefined : { background: shown }}
        />
        <input
          type="text"
          aria-label={`${field.label} 값`}
          className="wb-shell-control wb-shell-color-text"
          disabled={disabled}
          value={draft}
          placeholder={props.mixed === true ? MIXED_PLACEHOLDER : '테마 기본'}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitText()
          }}
        />
        <input
          ref={picker}
          type="color"
          className="wb-shell-color-picker"
          aria-label={`${field.label} 고르기`}
          disabled={disabled}
          // 고르개는 빈 값을 못 든다 — 테마 기본이면 검정에서 연다.
          value={shown === null || shown === '' ? '#000000' : shown}
          onChange={() => {}}
        />
        <button
          type="button"
          className="wb-shell-color-clear"
          disabled={disabled || (original === '' && props.mixed !== true)}
          onClick={() => pick('')}
        >
          테마 기본
        </button>
      </div>
      <div className="wb-shell-color-swatches">
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="wb-shell-color-swatch"
            aria-label={swatch}
            title={swatch}
            aria-pressed={original === swatch}
            disabled={disabled}
            style={{ background: swatch }}
            onClick={() => pick(swatch)}
          />
        ))}
      </div>
      {error && (
        <p className="wb-shell-prop-why" role="alert">
          {COLOR_FORMAT_ERROR}
        </p>
      )}
    </div>
  )
}
