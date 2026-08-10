import type { Theme } from '../spec/theme'
import { ADMIN_THEME } from './admin'
import { COMMERCE_THEME } from './commerce'

/**
 * 내장 시스템 테마. §6.10의 표에서 *"wirebound 내장 · 읽기 전용 · 출발점"*인 층이다.
 *
 * **오늘 하나뿐이다**(D7). §6.10이 다섯(`admin`·`saas-marketing`·`portal`·`commerce`·`docs`)을
 * 열거하지만 나머지 넷은 P4b가 만든다 — 테마 엔진이 서는 것과 테마를 제작하는 것은 다른 일이다.
 */
const THEMES: Readonly<Record<string, Theme>> = {
  admin: ADMIN_THEME,
  commerce: COMMERCE_THEME,
}

/** 내장 테마의 id. `meta.id`와 같은 꼴이다 — 접두어 없는 이름. */
export const SYSTEM_THEME_IDS: readonly string[] = Object.keys(THEMES)

/**
 * 내장 테마 하나. 없으면 `undefined`다.
 *
 * **`system:` 접두어가 붙은 꼴도 받는다.** 문서 안에서 시스템 테마를 가리키는 문법은
 * `extends: "system:admin"`인데(`EXTENDS_PATTERN`) 테마 자신의 `meta.id`는 `admin`이다
 * — 두 꼴이 실재하므로 부르는 쪽마다 문자열을 자르게 두면 그 자르기가 여러 곳에 흩어진다.
 * 여기서 한 번만 다룬다.
 *
 * **`Object.create(null)`이 아니라 `own` 검사를 쓴다.** 평범한 객체 리터럴이므로
 * `systemTheme('constructor')` 같은 입력이 물려받은 값을 집어 온다 — 테마 id는 사용자·
 * 문서에서 오는 문자열이다(P4a-1이 프로토타입 키로 306조합을 잰 자리와 같은 부류).
 */
export function systemTheme(id: string): Theme | undefined {
  const name = id.startsWith('system:') ? id.slice('system:'.length) : id
  return Object.hasOwn(THEMES, name) ? THEMES[name] : undefined
}
