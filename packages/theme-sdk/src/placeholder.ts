import type { CSSProperties } from 'react'
import { nodeVar } from './css-tools'

/**
 * 자리표시자의 그리기 값 → 노드 변수(`--wb-node-placeholder-<이름>`). 정한 값만 싣는다 — 안 실은 변수는 기본 CSS 가 뿌리마다 `initial` 로 끊어
 * (`default-views/document.tsx` 의 `documentCssBlocks`) 바깥 자리표시자의 값이 안쪽에 물려지지 않는다. 길이 단위를 여기서 붙인다 — CSS 가 `calc(var(…) * 1px)` 로 붙이면 테마가
 * `300px` 을 줄 때 무효한 값이 된다. 제 뷰로 자리표시자를 그리는 테마도 이것을 뿌리에 싣는다(`wb-theme check` 가 잰다).
 *
 * **커스텀 프로퍼티만 싣는다** — inline 일반 선언은 모든 셀렉터를 이겨 테마의 몫(정하지 않은 값)까지 덮는다(`structure.tsx` 의 `vars`).
 */
export function placeholderVars(props: Readonly<Record<string, unknown>>): CSSProperties {
  const out: Record<string, string> = {}
  for (const [prop, name] of PLACEHOLDER_LENGTHS) {
    const value = props[prop]
    if (typeof value === 'number' && Number.isFinite(value)) out[nodeVar('placeholder', name)] = `${value}px`
  }
  for (const [prop, name] of PLACEHOLDER_COLORS) {
    const value = props[prop]
    if (typeof value === 'string' && COLOR.test(value)) out[nodeVar('placeholder', name)] = value
  }
  return out as CSSProperties
}

/**
 * 카탈로그 규격(`@wirebound/schema` 의 `PLACEHOLDER_COLOR`)과 같은 꼴. 렌더러는 검증을 지난 props 만 뷰에 주지만, 이 함수는 테마 뷰도 부르는
 * 공개 도구라 꼴 밖의 글자(`url(…)` · `;`)를 한 번 더 거른다.
 */
const COLOR = /^#[0-9a-f]{6}$/

/** 길이 prop → 변수 이름. */
const PLACEHOLDER_LENGTHS: readonly (readonly [string, string])[] = [
  ['width', 'width'],
  ['height', 'height'],
  ['radius', 'radius'],
  ['fontSize', 'font-size'],
  ['padding', 'padding'],
]

/** 색 prop → 변수 이름. */
const PLACEHOLDER_COLORS: readonly (readonly [string, string])[] = [
  ['background', 'background'],
  ['borderColor', 'border-color'],
  ['color', 'color'],
]

/** 자리표시자 변수 이름 전부 — 뿌리마다 끊는 규칙이 쓴다. */
export const PLACEHOLDER_VARS: readonly string[] = [...PLACEHOLDER_LENGTHS, ...PLACEHOLDER_COLORS].map(([, name]) =>
  nodeVar('placeholder', name),
)
