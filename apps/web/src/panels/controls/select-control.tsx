/**
 * `select` control의 위젯. **조작 즉시 커밋한다** — 스위치와 같은 이유로 중간 상태가 없다.
 *
 * 선택지는 **카탈로그의 `EditorField.options`가 진실이다.** 화면이 목록을 따로 들면 카탈로그가
 * 값을 더할 때 여기가 따라오지 않아, 문서에는 있는데 고를 수 없는 값이 생긴다.
 */
import type { ReactElement } from 'react'
import type { EditorField } from '@wirebound/schema'

export interface SelectControlProps {
  field: EditorField
  value: unknown
  id: string
  /** 남이 잠근 자리라 못 바꾸는가. `TextControlProps.disabled`와 같은 값이다. */
  disabled: boolean
  onCommit: (value: string) => void
}

/**
 * `options`가 없거나 빈 `select`는 **그리지 않는다**(`null`을 낸다).
 *
 * 카탈로그의 실수를 화면이 흡수하지 않기 위해서다 — 빈 `<select>`는 고를 것이 없는데도
 * 편집할 수 있는 것처럼 보이고, 사용자는 왜 아무것도 안 되는지 묻게 된다. 부르는 쪽이
 * `null`을 받으면 `formatValue`가 그린 글자로 되돌아간다(`../property-panel.tsx`).
 *
 * **지금 카탈로그에 그런 자리는 없다** — `select` 자리가 전부 `options`를 갖는다(다시 재는 법:
 * `packages/schema/src/component/catalog`에서 `control: 'select'`를 찾아 `options` 없는 것을 센다).
 * 그래도 두는 것은 카탈로그가 데이터라
 * 컴파일러가 그 짝을 강제하지 않기 때문이다(`EditorField.options`는 `?`다).
 */
export function SelectControl(props: SelectControlProps): ReactElement | null {
  const { field, value, id, disabled, onCommit } = props
  const options = field.options
  if (options === undefined || options.length === 0) return null

  // 문서의 값이 선택지에 없으면 빈 칸으로 둔다. `<select>`는 값이 없는 상태를 표현할
  // 수단이 없어 첫 선택지가 골라진 것처럼 보이는데, 그러면 사용자가 건드리지도 않은
  // 값이 화면에 정답처럼 뜬다.
  const current = typeof value === 'string' && options.includes(value) ? value : ''

  return (
    <select
      id={id}
      disabled={disabled}
      className="wb-shell-control"
      value={current}
      onChange={(event) => onCommit(event.target.value)}
    >
      {current === '' && <option value="" />}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
