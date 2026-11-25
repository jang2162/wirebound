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
    },
  },
  components: {
    DataGrid: {
      variants: [
        { id: 'table', label: '표' },
        { id: 'cards', label: '카드', hideProps: ['fixedColumns'] },
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
  // 레이아웃 틀의 영역(SDK 1.10.0 — sdk 범위를 ^1.10.0 으로 올린다) — 끌 수 있는 영역은 에디터 «보기» 메뉴의 항목이 된다. 뷰는 src/index.tsx 의
  // defineTheme({ layouts: { subpage: … } }) 로 내고, 영역은 LayoutRegion 으로 감싼다 — SKILL.md 「레이아웃 뷰」.
  // layouts: {
  //   subpage: {
  //     regions: [
  //       { id: 'gnb', label: 'GNB' },
  //       { id: 'lnb', label: 'LNB' },
  //       { id: 'breadcrumb', label: '브레드크럼브' },
  //       { id: 'title', label: '페이지 제목' },
  //     ],
  //   },
  // },
})
