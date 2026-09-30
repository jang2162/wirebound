import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * 랜딩 · 제품 소개 사이트 테마. **`system-admin` 의 반대쪽 끝이다** — 그쪽이 좁은 여백 · 표 중심의 밀도라면 여기는 넓은 여백 · 큰
 * 타이포 · 카드와 그림 중심이다. 옛 JSON 테마(`git show b2766e8c^:packages/themes/src/system/saas-marketing.ts` — 머리말의 «무엇이
 * 다른가» 와 컴포넌트마다 고른 구조의 까닭)를 옮겼다.
 *
 * **토큰은 사람이 고칠 만한 것만 선언한다** — 색 · 서체 · 모서리 · 내용 폭과 섹션 리듬. 나머지(여백 눈금 · 그림자 · 제목 단계의
 * 줄 높이 · 움직임)는 `theme.css` 의 `:root` 상수다. 기본값은 그 `:root` 가 내는 값과 같다(`test/saas-marketing.test.ts`).
 *
 * **variant 는 두 축이다.** 옛 테마가 컴포넌트마다 **하나** 고르던 구조(`List:cardGrid` · `Tabs:pill` · `Tree:accordion` ·
 * `KeyValue:cardGrid` · `Media:illustration`)는 그 구조와 다른 하나를 variant 로 함께 선언하고 옛 선택을 `defaultVariant` 로 둔다 —
 * 한 문서에 카드 그리드와 표를 함께 둘 수 있다. 옛 테마의 노드 변형(`Section` 의 `hero` · `muted`, `Card` · `List` 의 `featured` 등)은
 * `system-admin` 과 같은 id 로 둔다 — 테마를 바꿔도 같은 뜻의 variant 가 이어진다.
 */
export const MANIFEST: ThemeManifest = {
  id: 'system-saas-marketing',
  name: '마케팅',
  description: '랜딩·제품 소개 사이트 테마. 넓은 여백과 큰 타이포, 카드 그리드와 이미지 중심의 구성을 갖는다.',
  version: '1.0.0',
  sdk: '^1.0.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'type', label: '서체' },
      { id: 'shape', label: '모양' },
      { id: 'layout', label: '폭 · 여백' },
    ],
    items: {
      'semantic.primary': { type: 'color', label: '주색', group: 'color', default: '#5b3df5' },
      'semantic.primarySoft': { type: 'color', label: '주색(옅게)', group: 'color', default: '#f0edff' },
      'semantic.accentSoft': { type: 'color', label: '보조색(옅게) — 히어로 배경', group: 'color', default: '#e4f8f5' },
      'semantic.surface': { type: 'color', label: '면', group: 'color', default: '#ffffff' },
      'semantic.canvas': { type: 'color', label: '바탕', group: 'color', default: '#f5f5fc' },
      'semantic.border': { type: 'color', label: '테두리', group: 'color', default: '#e7e7f1' },
      'semantic.borderStrong': { type: 'color', label: '테두리(짙게)', group: 'color', default: '#9d9db6' },
      'semantic.text': { type: 'color', label: '글자', group: 'color', default: '#0b0b14' },
      'semantic.textMuted': { type: 'color', label: '글자(흐리게)', group: 'color', default: '#5c5c78' },
      'semantic.textInverse': { type: 'color', label: '글자(주색 위)', group: 'color', default: '#ffffff' },
      'semantic.danger': { type: 'color', label: '위험', group: 'color', default: '#e5484d' },
      'typography.family.display': {
        type: 'font',
        label: '제목 서체',
        group: 'type',
        default: '"Wirebound Marketing Display", "Wirebound Marketing Sans", system-ui, sans-serif',
      },
      'typography.family.sans': {
        type: 'font',
        label: '본문 서체',
        group: 'type',
        default: '"Wirebound Marketing Sans", system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      },
      'typography.display.fontSize': { type: 'length', label: '가장 큰 제목 크기', group: 'type', default: '64px' },
      'typography.h1.fontSize': { type: 'length', label: '제목 1 크기', group: 'type', default: '48px' },
      'typography.body.fontSize': { type: 'length', label: '본문 크기', group: 'type', default: '18px' },
      'radius.sm': { type: 'length', label: '모서리(작게)', group: 'shape', default: '8px' },
      'radius.md': { type: 'length', label: '모서리(중간)', group: 'shape', default: '14px' },
      'radius.lg': { type: 'length', label: '모서리(크게)', group: 'shape', default: '24px' },
      'container.maxWidth': { type: 'length', label: '내용 폭', group: 'layout', default: '1200px' },
      'section.paddingY': { type: 'length', label: '섹션 세로 여백', group: 'layout', default: '80px' },
    },
  },
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
    Tabs: {
      variants: [
        { id: 'pill', label: '알약' },
        { id: 'underline', label: '밑줄' },
      ],
      defaultVariant: 'pill',
    },
    // 카드 셋은 `columns`(표의 머리)를 그리지 않는다 — 속성 패널이 감춘다.
    List: {
      variants: [
        { id: 'cards', label: '카드 그리드', hideProps: ['columns'] },
        { id: 'featured', label: '카드 그리드(강조)', hideProps: ['columns'] },
        { id: 'compact', label: '카드 그리드(촘촘)', hideProps: ['columns'] },
        { id: 'table', label: '표' },
      ],
      defaultVariant: 'cards',
    },
    Tree: {
      variants: [
        { id: 'accordion', label: '아코디언' },
        { id: 'indent', label: '들여쓰기' },
      ],
      defaultVariant: 'accordion',
    },
    KeyValue: {
      variants: [
        { id: 'tiles', label: '지표 타일' },
        { id: 'table', label: '표' },
      ],
      defaultVariant: 'tiles',
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
    Media: {
      variants: [
        { id: 'illustration', label: '그림' },
        { id: 'image', label: '사진' },
      ],
      defaultVariant: 'illustration',
    },
  },
}
