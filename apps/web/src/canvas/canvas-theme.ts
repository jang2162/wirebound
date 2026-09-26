import { ADMIN_V0, ADMIN_V0_CSS } from '@wirebound/system-theme-admin'
import { defaultViewsCss, type ThemeDefinition } from '@wirebound/theme-sdk'

/** 캔버스가 그리는 테마. 저장소 테마 하나로 고정이다 — 프로젝트의 `id@버전` 을 싣는 것은 A4 다. */
export const CANVAS_THEME: ThemeDefinition = ADMIN_V0

/** iframe 문서의 head 에 싣는 차례. SDK 기본 CSS 가 **먼저** 와야 같은 특이도에서 테마가 이긴다. */
export const CANVAS_STYLES: readonly { id: string; css: string }[] = Object.freeze([
  { id: 'base', css: defaultViewsCss() },
  { id: 'theme', css: ADMIN_V0_CSS },
])

/** 토큰의 기본값. 사이트의 토큰 편집은 A4 다. */
export function canvasTokens(theme: ThemeDefinition): Record<string, string | number> {
  return Object.fromEntries(Object.entries(theme.manifest.tokens.items).map(([key, decl]) => [key, decl.default]))
}
