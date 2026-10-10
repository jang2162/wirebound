/**
 * **사람이 쓴 이름을 글에 이어 붙일 때 방향을 가둔다.** 라벨 · 제목 · 탭 이름 · 컬럼 이름 같은 props 의 글은 방향 제어 글자(RLO 등)를
 * 막지 않는다(별칭은 입구가 막는다 — `./alias.ts`) — 그 글이 다른 이름과 이어 붙는 문장 · 줄 요약 · 고르개 항목에서 제어 글자 하나가 **뒤따르는
 * 다른 노드의 이름과 문장 끝까지** 뒤집어 보이게 한다. 요약 전체를 `<bdi>` 로 감싸도 그 안의 이름끼리는 안 갈리므로 **이름마다** 가둔다.
 *
 * 제어 글자가 없는 글은 **그대로 돌려준다** — 문장 · 요약의 글자가 보통 글에서는 한 글자도 안 바뀐다. 제어 글자가 있으면 첫 방향 격리
 * (U+2068) 와 끝 격리(U+2069) 로 감싼다.
 */

/** 방향 제어 글자 — 문자 집합 안쪽(대괄호 안). `./alias.ts` 가 이 한 벌로 별칭 입구의 표를 짓는다. */
export const BIDI_CONTROL_CLASS = '\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069'

const HAS_BIDI_CONTROL = new RegExp(`[${BIDI_CONTROL_CLASS}]`, 'u')
/** 격리 시작 · 끝(U+2066 ~ U+2069). 안쪽 글에 남기면 끝 격리(U+2069) 하나가 우리 격리를 일찍 닫는다. */
const ISOLATE_CONTROLS = /[\u2066-\u2069]/gu

export function isolateBidi(text: string): string {
  if (!HAS_BIDI_CONTROL.test(text)) return text
  return `\u2068${text.replace(ISOLATE_CONTROLS, '')}\u2069`
}
