import type { ThemeManifest } from '@wirebound/theme-sdk'
import { checkTokenValue } from './tokens'

export interface TokenMigration {
  /** 새 테마로 이어지는 값 — 기본값과 다른 값만 받았으면 그대로 기본값과 다른 값만 남는다. */
  tokens: Record<string, string | number>
  kept: number
  dropped: number
  /** 새 manifest 의 키 가운데 이어진 값이 없어 기본값으로 서는 수. */
  defaulted: number
}

/**
 * **테마를 바꿀 때 토큰을 잇는다**(spec `2026-09-27-code-themes-design.md` 「테마 바꾸기와 버전 올리기」). 키가 같고 타입이 같으면
 * 잇고, 이은 값을 새 manifest 로 검사해 이슈가 나면(`select` 의 없는 선택지 등) 버린다. 새 테마에 없는 키도 버린다.
 *
 * **설정 화면이 보낼 본문과 api 의 impact 수가 이 함수 하나를 부른다** — 두 벌이면 확인 창의 «이어짐 n» 과 실제로 보낸 값이
 * 갈린다. `from` 이 `null`(지금 바인딩의 manifest 를 모른다)이면 타입을 못 견주므로 키와 새 검사만 본다.
 */
export function migrateTokens(
  from: ThemeManifest | null,
  to: ThemeManifest,
  tokens: Readonly<Record<string, string | number>>,
): TokenMigration {
  const target = to.tokens.items
  const source = from?.tokens.items
  const kept: Record<string, string | number> = {}
  let dropped = 0
  for (const [key, value] of Object.entries(tokens)) {
    // 자기 속성만 본다 — `toString` 같은 키가 프로토타입의 함수를 선언으로 집지 않게(`checkTokens` 와 같은 판단).
    const decl = Object.hasOwn(target, key) ? target[key]! : undefined
    const sameType = source === undefined || (Object.hasOwn(source, key) && source[key]!.type === decl?.type)
    if (decl !== undefined && sameType && checkTokenValue(decl, value) === null) kept[key] = value
    else dropped += 1
  }
  const count = Object.keys(kept).length
  return { tokens: kept, kept: count, dropped, defaulted: Object.keys(target).length - count }
}
