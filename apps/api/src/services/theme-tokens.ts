/**
 * **바인딩 토큰의 검사 한 벌** — `PUT …/theme`(`routes/project-theme.ts`)과 판 3 복원(`services/restore.ts`)이 같은 함수를 지난다.
 * PUT 은 이슈가 하나라도 있으면 422 로 거절하고, 복원은 이슈가 난 키를 버리고(그 키는 기본값으로 선다) 나머지를 쓴다.
 *
 * 판 3 payload 의 토큰은 그 판의 manifest 로 PUT 을 지난 값이라(판 고정 manifest 는 안 바뀐다) 복원에서 걸리는 것은 손댄 payload ·
 * 다른 인스턴스에서 온 DB · 뒤에 조여진 규칙뿐이다 — 그래서 복원은 거절하지 않는다.
 */
import { tokensCss, type ThemeManifest } from '@wirebound/themes'

/**
 * 토큰 값 하나의 상한(글자 — UTF-16 단위). 여섯 타입의 정당한 값(색 · 길이 · 글꼴 목록 · 그림자)은 이보다 훨씬 짧다 — 상한은 한 값이
 * `:root` 블록 · 방송 프레임을 부풀리지 못하게 하는 자리다.
 */
export const TOKEN_VALUE_MAX = 200
/** 저장하는 토큰 JSON 전체의 상한(UTF-8 바이트). 바인딩은 `theme-changed` 프레임에 통째로 실린다. */
export const TOKENS_JSON_MAX = 16_384

export interface BindingTokenIssue {
  code: string
  /** `tokens.<키>` 또는 전체 한도면 `tokens`. */
  path: string
  message: string
  /** 이슈가 난 키. 전체 한도(`token-too-large`)는 한 키의 것이 아니라 `null`. */
  key: string | null
}

/**
 * 받은 토큰을 manifest 로 본다 — 이슈가 난 키를 빼고, 기본값과 같은 값을 뺀 `tokens` 와 이슈를 돌려준다. 뺀 뒤의 JSON 이 전체 한도를
 * 넘으면 `tokens` 는 `{}`(모두 기본값)이고 `token-too-large` 가 실린다.
 */
export function checkBindingTokens(
  manifest: ThemeManifest,
  tokens: Readonly<Record<string, string | number>>,
): { tokens: Record<string, string | number>; issues: BindingTokenIssue[] } {
  const issues: BindingTokenIssue[] = []
  const withinLength: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof value === 'string' && value.length > TOKEN_VALUE_MAX) {
      issues.push({ code: 'token-too-long', path: `tokens.${key}`, key, message: `토큰 값은 ${TOKEN_VALUE_MAX} 글자까지입니다(${value.length})` })
    } else {
      withinLength[key] = value
    }
  }

  const bad = new Set<string>()
  for (const issue of tokensCss(manifest, withinLength).issues) {
    const key = issue.path.replace(/^values\./, '')
    bad.add(key)
    issues.push({ code: issue.code, path: `tokens.${key}`, key, message: issue.message })
  }

  const items = manifest.tokens.items
  const kept = Object.fromEntries(
    Object.entries(withinLength).filter(([key, value]) => !bad.has(key) && value !== items[key]!.default),
  )
  const bytes = Buffer.byteLength(JSON.stringify(kept), 'utf8')
  if (bytes > TOKENS_JSON_MAX) {
    issues.push({ code: 'token-too-large', path: 'tokens', key: null, message: `토큰 전체는 ${TOKENS_JSON_MAX} 바이트까지입니다(${bytes})` })
    return { tokens: {}, issues }
  }
  return { tokens: kept, issues }
}
