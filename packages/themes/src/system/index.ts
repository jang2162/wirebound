import type { Theme } from '../spec/theme'
import { ADMIN_THEME } from './admin'
import { SAAS_MARKETING_THEME } from './saas-marketing'
import { PORTAL_THEME } from './portal'
import { COMMERCE_THEME } from './commerce'
import { DOCS_THEME } from './docs'

/**
 * 내장 시스템 테마. 설계서 「테마 관리」의 표에서 *"wirebound 내장 · 읽기 전용 · 출발점"*인
 * 층이고, 그 표가 열거한 다섯(`admin`·`saas-marketing`·`portal`·`commerce`·`docs`)이 여기 있다.
 */
const THEMES: Readonly<Record<string, Theme>> = {
  admin: ADMIN_THEME,
  'saas-marketing': SAAS_MARKETING_THEME,
  portal: PORTAL_THEME,
  commerce: COMMERCE_THEME,
  docs: DOCS_THEME,
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
 * 문서에서 오는 문자열이다.
 */
export function systemTheme(id: string): Theme | undefined {
  const name = id.startsWith('system:') ? id.slice('system:'.length) : id
  return Object.hasOwn(THEMES, name) ? THEMES[name] : undefined
}
