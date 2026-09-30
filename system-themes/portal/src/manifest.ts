import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 뼈대 판 — 토큰 · variant 는 아직 없다. 이름 · 설명은 옛 JSON 테마(`git show b2766e8c^:packages/themes/src/system/portal.ts` 의 `meta`)의 것이다. */
export const MANIFEST: ThemeManifest = {
  id: 'system-portal',
  name: '포털',
  description: '기관·사내 포털 테마. 선으로 구역을 나누고, 목록은 제목과 날짜 줄로, 분류는 접었다 편다.',
  version: '0.9.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
}
