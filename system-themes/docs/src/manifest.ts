import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * 문서 사이트 테마. 성격 — 좁은 읽기 폭 · 넓은 행간 · 서체 셋 · 선 하나로 가르는 면 — 과 그 근거는 `theme.css` 머리말이 갖는다.
 * 이름 · 설명 · 토큰 값 · 구조 선택은 옛 JSON 테마(`git show b2766e8c^:packages/themes/src/system/docs.ts` — 머리말의 «admin 과 갈리는
 * 네 자리» 표를 보려고 연다)의 것이다.
 *
 * **토큰은 사람이 고칠 만한 것만 낸다**(색 · 서체 · 읽기 폭 · 본문 크기 · 모서리 · 여백) — 제목 크기 · 간격 단계 · 전이 시간은
 * `theme.css` 의 `:root` 상수다. 기본값은 `theme.css` 의 `:root` 가 내는 값과 같다(`test/docs.test.ts` 가 대조한다).
 */
export const MANIFEST: ThemeManifest = {
  id: 'system-docs',
  name: '문서',
  description: '문서 사이트 테마. 좁은 읽기 폭과 넓은 행간, 좌측 내비와 코드·정의 목록 중심.',
  version: '1.0.0',
  sdk: '^1.0.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'type', label: '글꼴' },
      { id: 'layout', label: '폭과 여백' },
      { id: 'shape', label: '모양' },
    ],
    items: {
      'semantic.primary': { type: 'color', label: '주색', group: 'color', default: '#3451b2' },
      'semantic.primarySoft': { type: 'color', label: '주색(옅게)', group: 'color', default: '#eef2ff' },
      'semantic.surface': { type: 'color', label: '면', group: 'color', default: '#ffffff' },
      'semantic.canvas': { type: 'color', label: '바탕', group: 'color', default: '#f6f6f7' },
      'semantic.border': { type: 'color', label: '선', group: 'color', default: '#e2e2e3' },
      'semantic.borderStrong': { type: 'color', label: '선(짙게)', group: 'color', default: '#98989f' },
      'semantic.text': { type: 'color', label: '글자', group: 'color', default: '#1b1b1f' },
      'semantic.textMuted': { type: 'color', label: '글자(흐리게)', group: 'color', default: '#67676c' },
      'semantic.danger': { type: 'color', label: '위험', group: 'color', default: '#d1383d' },
      'semantic.notice': { type: 'color', label: '경고 상자', group: 'color', default: '#915930' },
      'semantic.noticeSoft': { type: 'color', label: '경고 상자(옅게)', group: 'color', default: '#fdf6e3' },
      // `canvas` 와 값이 가깝지만 이름이 다른 것이 요점이다 — 코드 배경만 어둡게 바꿀 수 있어야 한다.
      'semantic.code': { type: 'color', label: '코드 바탕', group: 'color', default: '#ebebef' },
      'semantic.codeText': { type: 'color', label: '코드 글자', group: 'color', default: '#3c3c43' },
      'typography.family.serif': {
        type: 'font',
        label: '본문 글꼴(세리프)',
        group: 'type',
        default: '"Noto Serif KR", "Nanum Myeongjo", Georgia, "Times New Roman", serif',
      },
      'typography.family.sans': {
        type: 'font',
        label: '제목 · UI 글꼴(산세리프)',
        group: 'type',
        default: 'Pretendard, "Noto Sans KR", system-ui, sans-serif',
      },
      'typography.family.mono': {
        type: 'font',
        label: '코드 글꼴(고정폭)',
        group: 'type',
        default: '"JetBrains Mono", D2Coding, ui-monospace, SFMono-Regular, Menlo, monospace',
      },
      'typography.body.fontSize': { type: 'length', label: '본문 크기', group: 'type', default: '17px' },
      'typography.body.lineHeight': { type: 'number', label: '본문 행간', group: 'type', default: 1.75 },
      'container.maxWidth': { type: 'length', label: '읽기 칼럼 폭', group: 'layout', default: '720px' },
      'section.paddingY': { type: 'length', label: '영역 위아래 여백', group: 'layout', default: '40px' },
      'radius.sm': { type: 'length', label: '모서리(작게)', group: 'shape', default: '3px' },
      'radius.md': { type: 'length', label: '모서리(중간)', group: 'shape', default: '6px' },
    },
  },
  /**
   * **옛 구조 선택이 `defaultVariant` 다** — variant 를 안 고른 노드는 옛 모습으로 선다. 옛 테마는 타입마다 구조를 하나만 골라 나머지
   * 모양을 한 문서에 둘 수 없었다. 이제 기본 뷰의 모양(`plain` · `table` · `indent`)이 variant 하나로 남는다.
   *
   * 옛 노드 variant 의 id(`Card` 의 `featured` · `List` 의 `compact` · `Button` 넷 · `Link` 의 `muted` · `Section` 둘)는 그대로 둔다 —
   * 다른 테마에서 그 값을 고른 노드가 이 테마로 와도 같은 뜻으로 선다.
   *
   * `Text` · `Field` · `Divider` 는 선언하지 않는다 — 변형이 prop(`role` · `control` · `direction`)에서 온다.
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
        { id: 'default', label: '참고 상자' },
        { id: 'featured', label: '경고 상자' },
        { id: 'plain', label: '보통 카드' },
      ],
      defaultVariant: 'default',
    },
    Tabs: {
      variants: [
        { id: 'enclosed', label: '뚜껑 탭' },
        { id: 'underline', label: '밑줄 탭' },
      ],
      defaultVariant: 'enclosed',
    },
    EntryForm: {
      variants: [
        { id: 'labelTop', label: '라벨 위' },
        { id: 'labelLeft', label: '라벨 왼쪽' },
      ],
      defaultVariant: 'labelTop',
    },
    List: {
      variants: [
        { id: 'default', label: '문서 목록', hideProps: ['columns'] },
        { id: 'compact', label: '문서 목록(촘촘)', hideProps: ['columns'] },
        { id: 'table', label: '표' },
      ],
      defaultVariant: 'default',
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
        { id: 'definition', label: '정의 목록', hideProps: ['columns'] },
        { id: 'table', label: '표' },
      ],
      defaultVariant: 'definition',
    },
    Button: {
      variants: [
        { id: 'default', label: '글자 버튼' },
        { id: 'primary', label: '주' },
        { id: 'secondary', label: '보조' },
        { id: 'danger', label: '위험' },
        { id: 'ghost', label: '흐리게' },
      ],
      defaultVariant: 'default',
    },
    Link: {
      variants: [
        { id: 'default', label: '본문 링크' },
        { id: 'muted', label: '흐리게' },
      ],
      defaultVariant: 'default',
    },
    Placeholder: {
      variants: [
        { id: 'code', label: '코드 블록' },
        { id: 'blank', label: '미정 영역' },
      ],
      defaultVariant: 'code',
    },
  },
}
