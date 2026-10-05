import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * 옛 JSON 테마 `commerce`(`git show b2766e8c^:packages/themes/src/system/commerce.ts` — 머리말의 «무엇이 다른가» 표가 이 테마의
 * 성격이다)를 코드 테마로 옮긴 판. 이름 · 설명은 옛 `meta` 그대로다.
 *
 * **토큰은 사람이 고칠 만한 것만 선언한다** — 색 · 서체 · 모서리 · 그림자 · 밀도(간격 단위) · 콘텐츠 폭. 타이포 스케일의 나머지 ·
 * 움직임 · 섹션 여백은 `theme.css` 의 `:root` 상수다. 기본값은 `theme.css` 의 `:root` 가 내는 값과 같다(`test/commerce.test.ts`).
 *
 * **옛 구조 선택은 variant 로 옮겼다 — 옛 선택이 `defaultVariant` 다.** 옛 테마는 컴포넌트마다 구조 하나를 골라 «상품 격자와 줄 목록을
 * 한 문서에 둘 수 없다» 를 대가로 적었다(`List`). 이제 둘 다 variant 라 한 문서에 함께 둔다.
 */
export const MANIFEST: ThemeManifest = {
  id: 'system-commerce',
  name: '커머스',
  description: '상품 목록·상세 중심의 쇼핑몰 테마. 이미지가 먼저 오고 가격과 구매 액션이 강조된다.',
  version: '1.1.0',
  sdk: '^1.1.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'type', label: '글꼴' },
      { id: 'shape', label: '모양' },
      { id: 'layout', label: '배치' },
    ],
    items: {
      'semantic.primary': { type: 'color', label: '주색(구매 · 담기)', group: 'color', default: '#ea580c' },
      'semantic.primarySoft': { type: 'color', label: '주색(옅게)', group: 'color', default: '#fffbeb' },
      'semantic.surface': { type: 'color', label: '면', group: 'color', default: '#ffffff' },
      'semantic.canvas': { type: 'color', label: '바탕', group: 'color', default: '#fafaf9' },
      'semantic.border': { type: 'color', label: '테두리', group: 'color', default: '#e7e5e4' },
      'semantic.borderStrong': { type: 'color', label: '테두리(짙게)', group: 'color', default: '#d6d3d1' },
      'semantic.text': { type: 'color', label: '글자', group: 'color', default: '#1c1917' },
      'semantic.textMuted': { type: 'color', label: '글자(흐리게)', group: 'color', default: '#78716c' },
      'semantic.danger': { type: 'color', label: '위험', group: 'color', default: '#e11d48' },
      'semantic.price': { type: 'color', label: '가격', group: 'color', default: '#e11d48' },
      'typography.family.sans': {
        type: 'font',
        label: '글꼴',
        group: 'type',
        default: '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif',
      },
      'typography.body.fontSize': { type: 'length', label: '본문 글자 크기', group: 'type', default: '16px' },
      'typography.price.fontSize': { type: 'length', label: '가격 글자 크기', group: 'type', default: '20px' },
      'radius.sm': { type: 'length', label: '모서리(작게 — 입력)', group: 'shape', default: '6px' },
      'radius.md': { type: 'length', label: '모서리(중간 — 썸네일 · 속성 상자)', group: 'shape', default: '10px' },
      'radius.lg': { type: 'length', label: '모서리(크게 — 카드 · 폼)', group: 'shape', default: '16px' },
      'radius.pill': { type: 'length', label: '알약(버튼 · 탭)', group: 'shape', default: '999px' },
      'shadow.sm': { type: 'shadow', label: '그림자(카드 · 버튼)', group: 'shape', default: '0 1px 3px rgba(28,25,23,.06)' },
      'shadow.lg': { type: 'shadow', label: '그림자(강조 카드)', group: 'shape', default: '0 16px 40px rgba(28,25,23,.12)' },
      'space.unit': { type: 'length', label: '간격 단위(밀도)', group: 'layout', default: '4px' },
      'container.maxWidth': { type: 'length', label: '콘텐츠 폭', group: 'layout', default: '1200px' },
    },
  },
  /**
   * `Text` · `Field` · `Divider` 는 변형이 prop 에서 와 선언할 수 없다. `EntryForm` 은 옛 선택(`labelTop`)이 `labelLeft` 와 DOM 이
   * 같고 갈리는 모습(라벨이 위)을 `Field` 의 세로 쌓기가 만들어 고를 것이 없다 — 선언하지 않는다.
   *
   * `hideProps: ['columns']` — `List.columns` 는 표(`table`)만 읽는다. 이 테마는 표를 내지 않아 모든 variant 에서 감춘다.
   */
  components: {
    Section: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'hero', label: '히어로' },
        { id: 'muted', label: '면' },
      ],
      defaultVariant: 'default',
    },
    Card: {
      variants: [
        { id: 'mediaTop', label: '상품 카드(이미지 위)' },
        { id: 'featured', label: '강조 상품 카드' },
        { id: 'plain', label: '글 카드(이미지 없음)' },
      ],
      defaultVariant: 'mediaTop',
    },
    Tabs: {
      variants: [
        { id: 'pill', label: '알약' },
        { id: 'underline', label: '밑줄' },
      ],
      defaultVariant: 'pill',
    },
    List: {
      variants: [
        { id: 'mediaList', label: '미디어 줄(썸네일 옆 이름 · 가격)', hideProps: ['columns'] },
        { id: 'cardGrid', label: '상품 격자', hideProps: ['columns'] },
        { id: 'compact', label: '미디어 줄 — 촘촘', hideProps: ['columns'] },
        { id: 'featured', label: '미디어 줄 — 강조', hideProps: ['columns'] },
      ],
      defaultVariant: 'mediaList',
    },
    Tree: {
      variants: [
        { id: 'accordion', label: '아코디언(여닫힘)' },
        { id: 'indent', label: '들여쓰기' },
      ],
      defaultVariant: 'accordion',
    },
    KeyValue: {
      variants: [
        { id: 'cardGrid', label: '속성 상자 격자' },
        { id: 'table', label: '표' },
      ],
      defaultVariant: 'cardGrid',
    },
    SearchForm: {
      variants: [
        { id: 'collapsible', label: '접히는 필터' },
        { id: 'inline', label: '한 줄' },
      ],
      defaultVariant: 'collapsible',
    },
    Button: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'primary', label: '주(구매)' },
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
  /**
   * 옛 테마의 패턴 그대로 — 커머스의 대표 화면 «큰 이미지 옆에 이름 · 가격 · 담기». `Button` 의 `primary` 는 위 선언 안의 값이다
   * (선언 밖이면 `checkTheme` 의 `undeclaredVariantsUsedByPatterns` 가 잡는다).
   */
  patterns: {
    'content.product': {
      name: '상품 상세 — 이미지와 구매',
      slots: { image: 'media', title: 'text', price: 'text', cart: 'action' },
      schema: {
        type: 'Section',
        children: [
          {
            type: 'Grid',
            props: { columns: 2 },
            children: [
              { type: 'Media', slot: 'image', props: { kind: 'image', ratio: '1/1' } },
              {
                type: 'Flex',
                props: { direction: 'column' },
                children: [
                  { type: 'Text', slot: 'title', props: { role: 'h1' } },
                  { type: 'Text', slot: 'price', props: { role: 'h2' } },
                  { type: 'Button', slot: 'cart', variant: 'primary', props: { label: '장바구니 담기' } },
                ],
              },
            ],
          },
        ],
      },
    },
  },
}
