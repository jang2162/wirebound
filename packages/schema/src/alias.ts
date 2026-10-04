/**
 * 별칭(`WbNode.alias`)으로 받지 않는 글자 — 봉투(`envelope.ts` 의 `WbNodeSchema`)와 화면의 다듬기(`tidyAlias` — 웹
 * `apps/web/src/edit/ops.ts` 의 `aliasOps` 가 부른다)가 함께 읽는 한 벌이다. 둘이 갈리면 화면이 보낸 값을 서버가 422 로
 * 돌려보내거나, 봉투가 막으려던 글자를 화면이 그대로 보낸다.
 *
 * 봉투는 어긋난 값을 **거절**하고 화면은 같은 표로 친 글을 **다듬는다** — 앞뒤 공백과 같은 결이다(봉투가 걷지 않는 까닭:
 * 걷어서 받으면 같은 문서가 입구에 따라 다르게 저장된다).
 *
 * | 글자 | 왜 막나 | 봉투 | 화면(`tidyAlias`) |
 * |---|---|---|---|
 * | C0 · DEL · C1(U+0080 ~ U+009F) · U+2028 · U+2029 | 줄을 바꾼다 · 터미널 출력을 제어한다(CLI `page get` 이 그대로 찍는다) | 거절 | 이어진 것을 공백 하나로 |
 * | 방향 제어(U+061C · U+200E · U+200F · U+202A ~ U+202E · U+2066 ~ U+2069) | 뒤따르는 글(남의 노드 이름)을 뒤집어 보인다 | 거절 | 뺀다 |
 * | 외짝 서로게이트 | Postgres `jsonb` 가 거절해 저장이 500 으로 죽는다 | 거절 | 뺀다 |
 * | 앞뒤 공백 | 같은 별칭이 공백만 달라 둘로 갈린다 | 거절 | 걷는다 |
 * | 보이는 글자 없음 — 공백과 폭 없는 글자(U+200B ~ U+200D · U+2060 · U+FEFF)뿐 | 줄 글에 빈 괄호 `타입 ()` 가 선다 | 거절 | 빈 값(지움) |
 * | 61자 이상(코드 포인트) | | 거절 | 60자에서 자른다 |
 *
 * **보지 않는 것:** 위 다섯 말고도 보이지 않는 글자(한글 채움 문자 U+3164 · 보이지 않는 연산자 U+2061 ~ U+2064 등)는 «보이는
 * 글자»로 센다. 폭 없는 글자가 보이는 글자 사이에 끼는 것(ZWJ 로 이은 이모지)은 받는다. 라벨 · 제목 같은 props 의 글은 이 표를
 * 거치지 않는다.
 */
import { NODE_ALIAS_MAX } from './node'

const LINE_BREAKING = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu
const HIDDEN_CONTROL = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\p{Cs}]/gu
const REJECTED = new RegExp(`${LINE_BREAKING.source}|${HIDDEN_CONTROL.source}`, 'u')
const INVISIBLE_ONLY = /^[\s\u200b-\u200d\u2060\ufeff]*$/u

/** 별칭으로 받지 않는 글자(머리말 표의 위 세 줄)가 하나라도 있는가. */
export function hasRejectedAliasChar(value: string): boolean {
  return REJECTED.test(value)
}

/** 보이는 글자가 없는가 — 공백과 폭 없는 글자뿐(빈 글 포함). */
export function isBlankAlias(value: string): boolean {
  return INVISIBLE_ONLY.test(value)
}

/** 친 글을 봉투가 받는 모양으로 다듬는다(머리말 표의 «화면» 칸). 빈 값이면 별칭을 지운다는 뜻이다. */
export function tidyAlias(value: string): string {
  const line = value.replace(HIDDEN_CONTROL, '').replace(LINE_BREAKING, ' ').trim()
  const cut = [...line].slice(0, NODE_ALIAS_MAX).join('').trim()
  return isBlankAlias(cut) ? '' : cut
}
