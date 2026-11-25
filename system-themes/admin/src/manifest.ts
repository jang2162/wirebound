import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * 기본값은 `theme.css` 의 `:root` 가 내는 값과 같다 — `test/admin.test.ts` 가 이름 · 값을 대조한다.
 *
 * 토큰은 사람이 고칠 만한 것(색 · 모서리 · 그림자 · 서체 · 글자 크기 · 간격 단위)만 선언하고 나머지(제목 크기 · 전이 · 칼럼 폭)는
 * `theme.css` 의 상수다 — 토큰 폼이 수십 칸이 되지 않게.
 *
 * **판을 올리며 더한 토큰이 옛 키가 칠하던 자리를 나눠 가지면 기본값은 그 옛 키의 참조(`{semantic.text}`)다** — 옛 판에서 옛 키를 덮은 프로젝트가
 * 판을 올리면 덮은 값은 옛 키에만 옮겨지고(`migrateTokens`) 새 키는 기본값으로 선다. 리터럴이면 그 자리만 덮은 팔레트를 벗어난다(어두운 바탕에 짙은
 * 라벨 글). `semantic.borderFaint` 는 표 세로선뿐이라 글이 묻히지 않아 리터럴로 둔다 — `{semantic.border}` 면 기본 화면의 세로선이 가로선만큼 짙다.
 */
export const MANIFEST: ThemeManifest = {
  id: 'system-admin',
  name: '기본테마',
  description: '관리자 화면 기본 테마. 회색 선의 표 격자와 파란 주색을 쓴다.',
  version: '2.2.0',
  sdk: '^1.10.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'shape', label: '모양' },
      { id: 'type', label: '글자' },
      { id: 'density', label: '밀도' },
    ],
    items: {
      'semantic.primary': { type: 'color', label: '주색', group: 'color', default: '#0a78d8' },
      'semantic.primarySoft': { type: 'color', label: '주색(옅게)', group: 'color', default: '#d8e9fa' },
      'semantic.surface': { type: 'color', label: '면', group: 'color', default: '#ffffff' },
      'semantic.canvas': { type: 'color', label: '바탕 — 라벨 칸 · 옅은 구역', group: 'color', default: '#f3f4f6' },
      'semantic.header': { type: 'color', label: '머리 바탕 — 표 머리 · 팝업 제목줄', group: 'color', default: '{semantic.canvas}' },
      'semantic.border': { type: 'color', label: '테두리', group: 'color', default: '#cccccc' },
      'semantic.borderStrong': { type: 'color', label: '테두리(짙게)', group: 'color', default: '#666666' },
      'semantic.borderFaint': { type: 'color', label: '테두리(옅게) — 표 세로선', group: 'color', default: '#e8eaee' },
      'semantic.text': { type: 'color', label: '글자', group: 'color', default: '#333333' },
      'semantic.textStrong': { type: 'color', label: '글자(짙게) — 제목 · 라벨', group: 'color', default: '{semantic.text}' },
      'semantic.textMuted': { type: 'color', label: '글자(흐리게)', group: 'color', default: '#666666' },
      'semantic.danger': { type: 'color', label: '위험', group: 'color', default: '#f04a3b' },
      'radius.sm': { type: 'length', label: '모서리(작게) — 입력칸 · 단추', group: 'shape', default: '4px' },
      'radius.md': { type: 'length', label: '모서리(중간) — 폼 · 그림', group: 'shape', default: '4px' },
      'radius.lg': { type: 'length', label: '모서리(크게) — 카드', group: 'shape', default: '4px' },
      'shadow.md': {
        type: 'shadow',
        label: '그림자(강조 카드)',
        group: 'shape',
        default: '0 1px 2px rgba(20,30,50,.06), 0 1px 1px rgba(20,30,50,.04)',
      },
      'font.body': {
        type: 'font',
        label: '서체',
        group: 'type',
        default:
          '"Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif',
      },
      'typography.body.fontSize': { type: 'length', label: '본문 크기', group: 'type', default: '13px' },
      'space.unit': { type: 'length', label: '간격 단위 — 모든 여백이 이 값의 배수', group: 'density', default: '4px' },
    },
  },
  /**
   * 카탈로그가 variant 를 두던 다섯 컴포넌트 — 그 값을 쓰던 페이지가 속성 패널에서 같은 칸을 본다(`0.1.0` 과 같은 id 들이라 판을 올려도
   * 없어지는 variant 가 없다). `default` 는 variant 없는 노드의 자리다 — 선언에 없으면 variant 없는 노드가 `defaultVariant`(선언 안의 값,
   * 예컨대 `primary`)로 그려진다. `theme.css` 는 `default` 를 겨냥한 규칙이 없어 variant 없는 노드가 바탕 규칙 그대로 그려진다.
   *
   * 옛 admin 이 고른 구조(`Section:contained` · `Card:plain` · `Tabs:underline` · `Tree:indent` · `KeyValue:table` ·
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
        // «소제목 + 오른쪽 단추» 줄 — 제목 · 머리 오른쪽 구역 · 몸통을 상자 없이 쓴다.
        { id: 'borderless', label: '테두리 없음' },
      ],
      defaultVariant: 'default',
    },
    // 옛 `List` 의 변형 그대로 — `0032` 가 `List` 노드를 같은 변형 이름의 `DataGrid` 로 옮긴다.
    DataGrid: {
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
    // 세그먼트가 기본이다 — 설계서의 단일 선택 대부분이 세그먼트이고 라디오는 표 안 선택 열에 몰려 있다(설계 spec `2026-10-24-compose-input-design.md` Q1).
    RadioGroup: {
      variants: [
        { id: 'segment', label: '세그먼트' },
        { id: 'radio', label: '라디오' },
      ],
      defaultVariant: 'segment',
    },
    CheckboxGroup: {
      variants: [
        { id: 'checkbox', label: '체크박스' },
        { id: 'chip', label: '칩' },
      ],
      defaultVariant: 'checkbox',
    },
  },
  /**
   * 서브페이지 틀의 영역 넷 — 다 끌 수 있다(에디터 «보기» 메뉴). 뷰는 `src/views/layout-subpage.tsx` 가 같은 id 로 `LayoutRegion` 을 둔다.
   */
  layouts: {
    subpage: {
      regions: [
        { id: 'gnb', label: 'GNB' },
        { id: 'lnb', label: 'LNB' },
        { id: 'breadcrumb', label: '브레드크럼브' },
        { id: 'title', label: '페이지 제목' },
      ],
    },
  },
}
