/**
 * **사람 글에 숨는 글자** — 제어(C0 · DEL · C1) · 방향 제어(LRM · RLM · ALM · 내장 · 덮어쓰기 · 격리) · 폭 없는 글자(ZWSP · ZWNJ · ZWJ · WJ ·
 * 보이지 않는 연산자 · BOM) · 줄 · 문단 구분자(U+2028 · U+2029). 화면에 안 보이거나 둘레 글의 차례를 바꾼다 — 이름에 들면 남의 이름과 같은
 * 글로 보이거나(«밥» 과 «밥» + ZWSP) 확인 상자의 문장을 뒤집는다(리뷰 `docs/superpowers/plans/2026-11-01-rv-ad-report.md` M1).
 *
 * **두 자리가 이 표 하나를 쓴다** — 이름 검사(`credentials.ts` 의 `DisplayName` · `routes/admin-invites.ts` 의 링크 이름)는 거절하고, 잠금 풀기
 * 명령(`unlock-login.ts` 의 `printable`)은 터미널에 찍기 전에 `\uXXXX` 꼴로 바꾼다. 같다는 것은 `test/hidden-chars.test.ts` 가 모든 BMP 글자로 잰다.
 *
 * ZWNJ · ZWJ 도 거절한다 — 페르시아어 이름 · 이모지 잇기에 쓰이지만, 한글 사이에서는 안 보여 같은 이름을 둘 짓는다(판단 — 보고
 * `2026-11-01-fx-ad-report.md` «결정»). 화면은 이미 든 이름을 따로 격리한다(`apps/web/src/shell/isolate.ts`).
 */
const RANGES = '\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2064\\u2066-\\u2069\\ufeff'

/** `text` 에 숨는 글자가 하나라도 있나. */
export function hasHiddenChar(text: string): boolean {
  return new RegExp(`[${RANGES}]`).test(text)
}

/** 숨는 글자를 `\uXXXX` 글로 바꾼다 — 보이는 글은 그대로다. */
export function escapeHiddenChars(text: string): string {
  return text.replace(new RegExp(`[${RANGES}]`, 'g'), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** 이름 칸이 숨는 글자를 거절할 때의 문장. */
export const HIDDEN_CHAR_IN_NAME = '이름에 보이지 않는 글자(제어 · 방향 제어 · 폭 없는 글자)를 쓸 수 없습니다'
