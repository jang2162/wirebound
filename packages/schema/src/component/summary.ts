/**
 * 카탈로그 `summary`(`define.ts`)가 쓰는 읽개. **값을 믿지 않는다** — 규격에 안 맞는 노드면 원본 props 가 오므로, 모양이
 * 틀린 값은 «없음»(`null`)으로 읽고 던지지 않는다. 구조 트리는 오류 경계 밖이라 여기서 던지면 셸이 통째로 사라진다
 * (`apps/web/src/panels/node-shape.ts` 머리말).
 */

/** `Text` 내용을 요약에 싣는 상한. 넘으면 자르고 `…` 를 붙인다. */
export const SUMMARY_TEXT_MAX = 20
/** 목록 값(`Tabs` 탭 이름 · `List` 컬럼)을 싣는 개수. 더 있으면 `…` 를 붙인다. */
export const SUMMARY_LIST_MAX = 3

const SEPARATOR = ' · '

/** 한 줄로 접은 글. 문자열이 아니거나 비면 `null`. 줄바꿈 · 연속 공백은 공백 하나다 — 요약은 한 줄이다. */
export function oneLine(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const line = value.replace(/\s+/g, ' ').trim()
  return line.length === 0 ? null : line
}

/** `oneLine` 을 `max` 글자(코드 포인트)에서 자른 것. */
export function clipped(value: unknown, max: number): string | null {
  const line = oneLine(value)
  if (line === null) return null
  const chars = [...line]
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : line
}

/** 글 배열의 앞 `SUMMARY_LIST_MAX` 개를 ` · ` 로 이은 것. 배열이 아니거나 글이 없으면 `null`. */
export function firstOf(values: unknown): string | null {
  if (!Array.isArray(values)) return null
  const lines = values.map(oneLine).filter((line): line is string => line !== null)
  if (lines.length === 0) return null
  const shown = lines.slice(0, SUMMARY_LIST_MAX)
  return lines.length > SUMMARY_LIST_MAX ? [...shown, '…'].join(SEPARATOR) : shown.join(SEPARATOR)
}

/** 조각들을 ` · ` 로 잇는다. 빈 조각은 건너뛰고, 다 비면 `null`. */
export function joined(...parts: (string | null)[]): string | null {
  const present = parts.filter((part): part is string => part !== null)
  return present.length === 0 ? null : present.join(SEPARATOR)
}

/** 정수면 그 값, 아니면 `null`. */
export function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/** 배열의 길이. 배열이 아니면 `null`. */
export function countOf(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null
}

/** 배치 방향(`row` · `horizontal` → 가로, `column` · `vertical` → 세로). 그 밖이면 `null`. */
export function axisWord(value: unknown): string | null {
  if (value === 'row' || value === 'horizontal') return '가로'
  if (value === 'column' || value === 'vertical') return '세로'
  return null
}
