/**
 * **테마의 패턴 목록** — 캔버스가 그리는 테마의 manifest `patterns`(`theme/project-theme.tsx` 의 바인딩 manifest). 하단 판 «모듈» 탭의 «테마 패턴»
 * 묶음이 이 목록이다(`./module-tab.tsx`) — 캔버스와 같은 테마라야 넣은 패턴이 그 테마의 variant 로 그려진다.
 */
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { PatternsSchema, type ThemePattern } from '@wirebound/themes'

/** 패턴이 하나도 없는 테마일 때. 패턴이 없는 테마가 **정상**이고(`system-admin` 첫 판이 그렇다), 없다는 것과 고장난 것을 사용자가 갈라야 한다. */
export const EMPTY_NOTICE = '이 테마에는 패턴이 없습니다'

/**
 * manifest 의 패턴 선언이 규격(`PatternsSchema`)을 통과하지 못했을 때. 패턴 0개와 갈라 말한다 — 할 일이 «다른 테마를
 * 고르기»가 아니라 «테마를 고치기»다. A2 의 manifest 검증이 올리는 자리에서 막기 전까지는 여기가 그 판을 받는다.
 */
export const BROKEN_NOTICE = '테마의 패턴 선언을 읽지 못했습니다'

/** manifest 의 패턴을 목록으로 — 규격을 통과한 것만 낸다. 통과하지 못하면 목록이 비고 `broken` 이 선다. */
export function themePatterns(manifest: ThemeManifest): { entries: [string, ThemePattern][]; broken: string | null } {
  const parsed = PatternsSchema.safeParse(manifest.patterns ?? {})
  if (!parsed.success) return { entries: [], broken: BROKEN_NOTICE }
  return { entries: Object.entries(parsed.data), broken: null }
}
