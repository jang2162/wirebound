/**
 * 토큰 칸 하나 — manifest 선언의 타입마다 컨트롤이 갈린다(spec `2026-09-27-code-themes-design.md` 「토큰 편집」).
 *
 * | 타입 | 컨트롤 |
 * |---|---|
 * | `color` | 글 칸 + 값이 `#rrggbb` 일 때만 색 고르기(`<input type=color>` 는 그 꼴만 안다 — `rgb()` · 이름 · 알파를 받으면 검게 바꿔 버린다) |
 * | `length` | 수 + 단위(`px rem em % vh vw`). 그 꼴로 안 읽히는 값(`0` 은 읽는다)은 글 칸으로 선다 — 고칠 자리를 잃지 않게 |
 * | `number` | 수 칸. 빈 칸 · 수가 아닌 글자는 글자 그대로 두어 사유가 선다 |
 * | `font` | 글 칸 + 흔한 글꼴 목록(`<datalist>`) |
 * | `select` | 선택지 |
 * | `shadow` | 글 칸 |
 *
 * 값의 옳고 그름은 여기서 판정하지 않는다 — 편집기가 `tokensCss` 의 이슈(서버와 같은 함수)로 사유를 짓고 `problem` 으로 내린다.
 */
import { useId, type ReactElement } from 'react'
import type { TokenDecl } from '@wirebound/theme-sdk'

export const LENGTH_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw'] as const
const LENGTH = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%|vh|vw)$/
const HEX6 = /^#[0-9a-f]{6}$/i

/** 흔한 글꼴 이름 — 자유 입력이 기본이고 이것은 고르기 쉬우라는 목록이다. */
const FONT_SUGGESTIONS = [
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'Inter',
  'Pretendard',
  "'Noto Sans KR'",
  "'Apple SD Gothic Neo'",
  "'Malgun Gothic'",
]

export function TokenField(props: {
  tokenKey: string
  decl: TokenDecl
  value: string | number
  readOnly: boolean
  /** 칸의 사유(초안 검사 · 서버 422). 없으면 `null`. */
  problem: string | null
  onChange: (value: string | number) => void
  onReset: () => void
}): ReactElement {
  const id = useId()
  const { decl, value, readOnly } = props
  const text = String(value)
  return (
    <div className="wb-shell-settings-token">
      <label className="wb-shell-settings-label" htmlFor={id}>
        {decl.label}
      </label>
      <div className="wb-shell-settings-token-controls">
        <Control id={id} decl={decl} value={value} text={text} readOnly={readOnly} onChange={props.onChange} />
        {!readOnly && (
          <button className="wb-shell-project-action" type="button" onClick={props.onReset}>
            기본값으로
          </button>
        )}
      </div>
      {props.problem !== null && (
        <p className="wb-shell-settings-field-alert" role="alert">
          {props.problem}
        </p>
      )}
    </div>
  )
}

function Control(props: {
  id: string
  decl: TokenDecl
  value: string | number
  text: string
  readOnly: boolean
  onChange: (value: string | number) => void
}): ReactElement {
  const { id, decl, text, readOnly, onChange } = props
  const listId = useId()
  switch (decl.type) {
    case 'color':
      return (
        <>
          <input
            className="wb-shell-settings-input"
            id={id}
            type="text"
            value={text}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
          {HEX6.test(text) && (
            <input
              className="wb-shell-settings-color"
              type="color"
              aria-label={`${decl.label} 색 고르기`}
              value={text.toLowerCase()}
              disabled={readOnly}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </>
      )
    case 'length': {
      const parsed = LENGTH.exec(text)
      // 비운 수 칸(`''` + 단위)도 이 꼴로 둔다 — 글 칸으로 바뀌면 치던 칸이 사라진다.
      const unitOnly = /^(px|rem|em|%|vh|vw)$/.exec(text)
      const number = parsed?.[1] ?? (unitOnly !== null ? '' : text === '0' ? '0' : null)
      const unit = parsed?.[2] ?? unitOnly?.[1] ?? 'px'
      if (number === null) {
        return (
          <input
            className="wb-shell-settings-input"
            id={id}
            type="text"
            value={text}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
      return (
        <>
          <input
            className="wb-shell-settings-input"
            id={id}
            type="number"
            value={number}
            readOnly={readOnly}
            onChange={(e) => onChange(`${e.target.value}${unit}`)}
          />
          <select
            className="wb-shell-settings-unit"
            aria-label={`${decl.label} 단위`}
            value={unit}
            disabled={readOnly}
            onChange={(e) => onChange(`${number}${e.target.value}`)}
          >
            {LENGTH_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </>
      )
    }
    case 'number':
      return (
        <input
          className="wb-shell-settings-input"
          id={id}
          type="number"
          value={text}
          readOnly={readOnly}
          onChange={(e) => {
            const raw = e.target.value
            const parsed = Number(raw)
            onChange(raw.trim() !== '' && Number.isFinite(parsed) ? parsed : raw)
          }}
        />
      )
    case 'font':
      return (
        <>
          <input
            className="wb-shell-settings-input"
            id={id}
            type="text"
            list={listId}
            value={text}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
          <datalist id={listId}>
            {FONT_SUGGESTIONS.map((font) => (
              <option key={font} value={font} />
            ))}
          </datalist>
        </>
      )
    case 'select':
      return (
        <select className="wb-shell-settings-input" id={id} value={text} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
          {(decl.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case 'shadow':
      return (
        <input
          className="wb-shell-settings-input"
          id={id}
          type="text"
          value={text}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
