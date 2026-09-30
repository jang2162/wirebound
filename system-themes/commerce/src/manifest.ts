import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 뼈대 판 — 토큰 · variant 는 아직 없다. 이름 · 설명은 옛 JSON 테마(`git show b2766e8c^:packages/themes/src/system/commerce.ts` 의 `meta`)의 것이다. */
export const MANIFEST: ThemeManifest = {
  id: 'system-commerce',
  name: '커머스',
  description: '상품 목록·상세 중심의 쇼핑몰 테마. 이미지가 먼저 오고 가격과 구매 액션이 강조된다.',
  version: '0.9.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
}
