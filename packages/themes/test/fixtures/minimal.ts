import type { ThemePatch } from '../../src/resolve/merge'
import type { Theme } from '../../src/spec/theme'

/**
 * 테스트가 쓰는 최소 시스템 테마.
 *
 * **`src/`가 아니라 `test/fixtures/`에 둔다**(D8) — `src/`에 있으면 시스템 테마로 오인되고
 * 시스템 테마 5종을 만드는 P4b가 이것을 지우거나 덮어야 한다.
 *
 * "최소"는 §6.1의 여섯 절을 **한 항목씩** 갖는다는 뜻이다. 절을 하나라도 빼면 해석의
 * 그 갈래를 이 픽스처로 잴 수 없다.
 */
export const MINIMAL_THEME: Theme = {
  meta: { id: 'portal', name: '포털', version: '1.0.0' },
  tokens: {
    palette: { 'blue.600': '#2563eb', 'gray.50': '#f9fafb' },
    semantic: {
      primary: 'palette.blue.600',
      surface: '#ffffff',
      canvas: 'palette.gray.50',
      danger: '#dc2626',
    },
    scale: {
      space: { unit: '4px' },
      radius: { sm: '4px', lg: '12px' },
      shadow: { sm: '0 1px 2px rgba(0,0,0,.05)' },
      typography: {
        family: { sans: 'Pretendard, sans-serif' },
        h3: { fontSize: '20px', lineHeight: 1.3, fontWeight: 700 },
        body: { fontSize: '14px', lineHeight: 1.5, fontWeight: 400 },
      },
      motion: { base: '200ms' },
    },
  },
  primitives: {
    container: { maxWidth: '1200px', gutter: 'space.6' },
    grid: { columns: 12, gap: 'space.6' },
    section: { paddingY: 'space.20', paddingYCompact: 'space.10' },
    breakpoints: { md: 768, sm: 640 },
  },
  components: {
    List: {
      structure: 'cardGrid',
      base: { gap: 'space.6' },
      parts: {
        item: { bg: 'semantic.surface', radius: 'radius.lg', shadow: 'shadow.sm' },
        title: { typography: 'h3' },
      },
      variants: { featured: { parts: { item: { borderWidth: '2px' } } } },
      states: {
        selected: { parts: { item: { borderColor: 'semantic.primary' } } },
        disabled: { opacity: 0.5 },
      },
      responsive: { md: { base: { gap: 'space.4' } } },
    },
    Button: { structure: 'solid', base: { radius: 'radius.sm' } },
  },
  patterns: {
    'hero.split': {
      name: '히어로 — 좌우 분할',
      slots: { title: 'text' },
      schema: {
        type: 'Section',
        variant: 'hero',
        children: [{ type: 'Text', slot: 'title', props: { role: 'display' } }],
      },
    },
  },
  assets: {
    fonts: [{ family: 'Pretendard', src: 'https://example.test/pretendard.woff2' }],
    icons: 'lucide',
    placeholder: { style: 'skeleton' },
  },
}

/** §6.9가 말한 전형적인 파생 — *"`semantic` 색 몇 개와 `typography.family`만 덮어쓴다."* */
export const DERIVED_PATCH: ThemePatch = {
  meta: { id: 'acme-portal', name: 'ACME 포털', version: '2.0.0', extends: 'system:portal' },
  tokens: {
    semantic: { primary: '#111111', danger: null },
    scale: { typography: { family: { sans: 'Inter, sans-serif' } } },
  },
}
