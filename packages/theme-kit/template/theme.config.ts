import { defineManifest } from '@wirebound/theme-sdk'

/**
 * 테마의 선언. `wb-theme build` 가 이것을 검증해 `manifest.json` 으로 뽑는다 — 규칙은 SKILL.md 「manifest」.
 * `src/index.tsx` 가 이 값을 `defineTheme` 에 넣는다.
 */
export default defineManifest({
  id: 'my-theme',
  name: '내 테마',
  description: '스타터 템플릿에서 시작한 테마',
  version: '0.1.0',
  sdk: '^1.6.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'type', label: '글꼴' },
      { id: 'shape', label: '모양' },
    ],
    items: {
      'color.primary': { type: 'color', label: '주색', group: 'color', default: '#2563eb' },
      'color.primaryHover': { type: 'color', label: '주색(호버)', group: 'color', default: '{color.primary}' },
      'color.text': { type: 'color', label: '글자색', group: 'color', default: '#0f172a' },
      'font.body': { type: 'font', label: '본문 글꼴', group: 'type', default: 'Pretendard, system-ui, sans-serif' },
      'radius.card': { type: 'length', label: '카드 모서리', group: 'shape', default: '8px' },
      density: { type: 'select', label: '밀도', options: ['compact', 'comfortable'], default: 'comfortable' },
    },
  },
  components: {
    List: {
      variants: [
        { id: 'table', label: '표' },
        { id: 'cards', label: '카드', hideProps: ['columns'] },
      ],
      defaultVariant: 'table',
    },
    Button: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'primary', label: '주' },
      ],
      defaultVariant: 'default',
    },
  },
})
