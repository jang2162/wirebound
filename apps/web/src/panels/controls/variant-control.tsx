/**
 * 노드의 `variant`를 고르는 위젯. **조작 즉시 커밋한다** — `SelectControl`과 같은 이유로
 * 중간 상태가 없다.
 *
 * **`SelectControl`을 재사용하지 않은 이유는 빈 칸 하나다.** 그쪽은 값이 선택지에 **없을 때만**
 * 빈 `<option>`을 그린다 — props의 `select` 여덟 자리가 전부 zod enum이라 빈 문자열이
 * 유효한 값이 아니고, 항상 빈 칸을 두면 사용자가 그것을 골라 `invalid-props`를 만들 수 있다.
 *
 * **`variant`는 반대다.** 봉투 필드이고 `z.string().optional()`이라 **없는 것이 정상 상태**다
 * (설계서 「페이지 스키마 노드」). 빈 칸이 없으면 한 번 고른 변형에서 빠져나올 방법이 없다.
 */
import type { ReactElement } from 'react'
import { MIXED_PLACEHOLDER } from './text-control'

/** 기본 표현으로 되돌리는 선택지의 글자. 빈 `<option>`은 사용자가 무엇인지 알 수 없다. */
const CLEAR_LABEL = '(기본)'
/** «여러 값» 칸의 값 — 앞 공백을 든 글자라 테마가 선언하는 변형 id 와 겹칠 일이 없다고 보고 골랐다(겹치면 그 변형을 못 고른다). */
const MIXED_VALUE = ' mixed'

export interface VariantControlProps {
  /** 테마 manifest 의 variant 선언 그대로(`variantFieldOf`). 라벨을 보이고 id 를 적는다. */
  options: readonly { id: string; label: string }[]
  value: unknown
  id: string
  /** 남이 잠근 자리라 못 바꾸는가. `TextControlProps.disabled`와 같은 값이다. */
  disabled: boolean
  /** 빈 칸을 고르면 `null`이다 — 부르는 쪽이 그것을 `remove`로 옮긴다. */
  onCommit: (variant: string | null) => void
  /** 고른 노드들의 변형이 갈린다(일괄 편집) — «여러 값» 칸을 맨 앞에 보이고 그것을 고르는 것은 커밋이 아니다. */
  mixed?: boolean
}

export function VariantControl(props: VariantControlProps): ReactElement {
  const { options, value, id, disabled, onCommit } = props

  // 문서의 값이 선언된 변형에 없으면 빈 칸으로 둔다. 테마가 선언하지 않은 값을 든 문서가 그 경로이고, 그때 첫 선택지가
  // 골라진 것처럼 보이면 사용자가 건드리지도 않은 값이 정답처럼 뜬다. `SelectControl`과 같은 판단이다.
  const current =
    props.mixed === true ? MIXED_VALUE : typeof value === 'string' && options.some((option) => option.id === value) ? value : ''

  return (
    <select
      id={id}
      disabled={disabled}
      className="wb-shell-control"
      value={current}
      onChange={(event) => {
        if (event.target.value === MIXED_VALUE) return
        onCommit(event.target.value === '' ? null : event.target.value)
      }}
    >
      {props.mixed === true && <option value={MIXED_VALUE}>{MIXED_PLACEHOLDER}</option>}
      {/* **항상 있다.** 위 머리말의 이유이고, `SelectControl`과 갈리는 유일한 지점이다. */}
      <option value="">{CLEAR_LABEL}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
