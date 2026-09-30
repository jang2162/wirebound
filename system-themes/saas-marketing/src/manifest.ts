import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 뼈대 판 — 토큰 · variant 는 아직 없다. 이름 · 설명은 옛 JSON 테마(`git show b2766e8c^:packages/themes/src/system/saas-marketing.ts` 의 `meta`)의 것이다. */
export const MANIFEST: ThemeManifest = {
  id: 'system-saas-marketing',
  name: '마케팅',
  description: '랜딩·제품 소개 사이트 테마. 넓은 여백과 큰 타이포, 카드 그리드와 이미지 중심의 구성을 갖는다.',
  version: '0.9.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
}
