import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 기본값은 `theme.css` 의 `:root` 가 내는 값과 같다 — `test/admin.test.ts` 가 이름을 대조한다. */
export const MANIFEST: ThemeManifest = {
  id: 'system-admin',
  name: '관리자',
  description: '관리자 화면용 기본 테마',
  version: '0.1.0',
  sdk: '^1.0.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'shape', label: '모양' },
    ],
    items: {
      'semantic.primary': { type: 'color', label: '주색', group: 'color', default: '#2563eb' },
      'semantic.primarySoft': { type: 'color', label: '주색(옅게)', group: 'color', default: '#eff6ff' },
      'semantic.surface': { type: 'color', label: '면', group: 'color', default: '#ffffff' },
      'semantic.canvas': { type: 'color', label: '바탕', group: 'color', default: '#f8fafc' },
      'semantic.border': { type: 'color', label: '테두리', group: 'color', default: '#e2e8f0' },
      'semantic.borderStrong': { type: 'color', label: '테두리(짙게)', group: 'color', default: '#94a3b8' },
      'semantic.text': { type: 'color', label: '글자', group: 'color', default: '#0f172a' },
      'semantic.textMuted': { type: 'color', label: '글자(흐리게)', group: 'color', default: '#475569' },
      'semantic.danger': { type: 'color', label: '위험', group: 'color', default: '#ef4444' },
      'radius.sm': { type: 'length', label: '모서리(작게)', group: 'shape', default: '4px' },
      'radius.md': { type: 'length', label: '모서리(중간)', group: 'shape', default: '6px' },
      'radius.lg': { type: 'length', label: '모서리(크게)', group: 'shape', default: '10px' },
    },
  },
  /**
   * 카탈로그가 variant 를 두던 다섯 컴포넌트 — 그 값을 쓰던 페이지가 속성 패널에서 같은 칸을 본다. `Button` 의 `default` 는
   * variant 없는 버튼의 자리다 — 선언에 없으면 variant 없는 버튼이 `defaultVariant`(선언 안의 값, 예컨대 `primary`)로 그려진다.
   * `theme.css` 는 `default` 를 겨냥한 규칙이 없어 variant 없는 노드가 바탕 규칙 그대로 그려진다(`test/admin.test.ts`).
   */
  components: {
    Section: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'hero', label: '히어로' },
        { id: 'muted', label: '옅게' },
      ],
      defaultVariant: 'default',
    },
    Card: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'featured', label: '강조' },
      ],
      defaultVariant: 'default',
    },
    List: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'featured', label: '강조' },
        { id: 'compact', label: '촘촘' },
      ],
      defaultVariant: 'default',
    },
    Button: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'primary', label: '주' },
        { id: 'secondary', label: '보조' },
        { id: 'danger', label: '위험' },
        { id: 'ghost', label: '투명' },
      ],
      defaultVariant: 'default',
    },
    Link: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'muted', label: '옅게' },
      ],
      defaultVariant: 'default',
    },
  },
}
