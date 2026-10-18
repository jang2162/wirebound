import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * 기본값은 `theme.css` 의 `:root` 가 내는 값과 같다 — `test/admin.test.ts` 가 이름 · 값을 대조한다.
 *
 * 토큰은 사람이 고칠 만한 것(색 · 모서리 · 그림자 · 서체 · 글자 크기 · 간격 단위)만 선언하고 나머지(제목 크기 · 전이 · 칼럼 폭)는
 * `theme.css` 의 상수다 — 토큰 폼이 수십 칸이 되지 않게.
 */
export const MANIFEST: ThemeManifest = {
  id: 'system-admin',
  name: '관리자',
  description: '관리자 화면 기본 테마. 좁은 여백과 표 중심의 밀도를 갖는다.',
  version: '1.2.0',
  sdk: '^1.2.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'shape', label: '모양' },
      { id: 'type', label: '글자' },
      { id: 'density', label: '밀도' },
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
      'radius.sm': { type: 'length', label: '모서리(작게) — 입력칸 · 단추', group: 'shape', default: '4px' },
      'radius.md': { type: 'length', label: '모서리(중간) — 폼 · 그림', group: 'shape', default: '6px' },
      'radius.lg': { type: 'length', label: '모서리(크게) — 카드', group: 'shape', default: '10px' },
      'shadow.md': { type: 'shadow', label: '그림자(강조 카드)', group: 'shape', default: '0 4px 12px rgba(15,23,42,.1)' },
      'font.body': {
        type: 'font',
        label: '서체',
        group: 'type',
        default: 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
      },
      'typography.body.fontSize': { type: 'length', label: '본문 크기', group: 'type', default: '14px' },
      'space.unit': { type: 'length', label: '간격 단위 — 모든 여백이 이 값의 배수', group: 'density', default: '4px' },
    },
  },
  /**
   * 카탈로그가 variant 를 두던 다섯 컴포넌트 — 그 값을 쓰던 페이지가 속성 패널에서 같은 칸을 본다(`0.1.0` 과 같은 id 들이라 판을 올려도
   * 없어지는 variant 가 없다). `default` 는 variant 없는 노드의 자리다 — 선언에 없으면 variant 없는 노드가 `defaultVariant`(선언 안의 값,
   * 예컨대 `primary`)로 그려진다. `theme.css` 는 `default` 를 겨냥한 규칙이 없어 variant 없는 노드가 바탕 규칙 그대로 그려진다.
   * `Button` 의 `primary` 는 바탕(채운 주색 단추) 그대로다 — 이름이 곧 바탕의 뜻이라 따로 규칙을 두지 않는다.
   *
   * 옛 admin 이 고른 구조(`Section:contained` · `Card:plain` · `Tabs:underline` · `List:table` · `Tree:indent` · `KeyValue:table` ·
   * `SearchForm:inline` · `EntryForm:labelLeft` · `Field:outlined` · `Button:solid` · `Media:image`)는 전부 카탈로그의 첫 구조라 기본 뷰의
   * DOM 이 곧 그 구조다 — variant 로 옮길 다른 선택이 없다.
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
