import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 뼈대 판 — 토큰 · variant 는 아직 없다. 이름 · 설명은 옛 JSON 테마(`git show b2766e8c^:packages/themes/src/system/docs.ts` 의 `meta`)의 것이다. */
export const MANIFEST: ThemeManifest = {
  id: 'system-docs',
  name: '문서',
  description: '문서 사이트 테마. 좁은 읽기 폭과 넓은 행간, 좌측 내비와 코드·정의 목록 중심.',
  version: '0.9.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
}
