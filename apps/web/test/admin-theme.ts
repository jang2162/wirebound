/**
 * **web 단위 테스트의 하네스 테마 — 얼린 사본이다.** 기본 하네스(`test/theme-loader.ts`)가 새 프로젝트의 판 `system-admin@0.1.0` 에 이것을 준다.
 *
 * 실 system-admin(`@wirebound/system-theme-admin`)을 쓰지 않는 까닭: jsdom 판은 서버에 안 닿아 실 테마를 따라갈 까닭이 없고, system-admin 은
 * 제 디렉터리 안에서 판 · 토큰 · variant · 뷰를 고친다 — 그때마다 웹 케이스의 기대(variant 칸 · 기본 뷰 DOM)가 흔들린다. 뷰는 SDK 기본 뷰다.
 * 서버 시딩을 따라가야 하는 실브라우저 판(`build-test`)은 `apps/api/test/system-admin.ts` 가 실 manifest 에서 읽는다.
 */
import { DEFAULT_VIEWS, defineTheme, type ThemeManifest } from '@wirebound/theme-sdk'

const MANIFEST: ThemeManifest = {
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
  /** `Button` 의 `default` 는 variant 없는 버튼의 자리다 — 선언에 없으면 variant 없는 버튼이 `defaultVariant` 로 그려진다. */
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

export const ADMIN_FIXTURE = defineTheme({ manifest: MANIFEST, views: DEFAULT_VIEWS })
