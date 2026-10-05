import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * system-portal — 기관·사내 포털. 옛 JSON 테마 `portal`(`git show b2766e8c^:packages/themes/src/system/portal.ts` — 머리말의
 * «무엇이 다른가» 셋이 이 테마의 성격이다)을 코드 테마로 옮긴 것이다. `admin` 과 밀도가 같고(간격 씨앗 4px) 다른 것은 셋이다:
 * 읽는 화면(목록은 제목 + 날짜 줄 · 본문 15/1.7 · 폭 1280px) · 선으로 나눔(1px 실선 · 2 ~ 3px 모서리 · 그림자 없음) · 접고 폄
 * (트리 아코디언 · 접히는 검색 · 구획 서식).
 *
 * **토큰은 사람이 고칠 만한 것만 낸다** — 색 · 글꼴 · 모서리 · 밀도 · 폭. 제목 단계의 크기 · 굵기와 간격 단계(`--wb-space-N`)는
 * `theme.css` 의 `:root` 상수다. 간격 단계는 `space.unit` 에 곱해 나오므로 밀도는 칸 하나로 바뀐다. 기본값은 `theme.css` 의 `:root`
 * 가 내는 값과 같다(`test/portal.test.ts`).
 *
 * **옛 `shadow` 토큰은 옮기지 않았다** — 옛 테마도 선언만 하고 컴포넌트가 한 번도 안 썼고, 안 쓰는 토큰은 폼에 내놓지 않는다
 * (`wb-theme check` 의 «안 쓰는 토큰»).
 */
export const MANIFEST: ThemeManifest = {
  id: 'system-portal',
  name: '포털',
  description: '기관·사내 포털 테마. 선으로 구역을 나누고, 목록은 제목과 날짜 줄로, 분류는 접었다 편다.',
  version: '1.1.0',
  sdk: '^1.1.0',
  tokens: {
    groups: [
      { id: 'color', label: '색' },
      { id: 'type', label: '글꼴' },
      { id: 'shape', label: '모양' },
      { id: 'layout', label: '밀도 · 폭' },
    ],
    items: {
      // 채도를 낮춘 남색이 이 테마의 색이다 — 글이 오래 읽히는 화면이라 색이 앞으로 나오면 안 된다.
      'semantic.primary': { type: 'color', label: '주색', group: 'color', default: '#13497e' },
      'semantic.primaryStrong': { type: 'color', label: '주색(짙게)', group: 'color', default: '#0b2545' },
      'semantic.primarySoft': { type: 'color', label: '주색(옅게)', group: 'color', default: '#eff4fa' },
      'semantic.primaryLine': { type: 'color', label: '주색 선', group: 'color', default: '#dbe7f4' },
      'semantic.surface': { type: 'color', label: '면', group: 'color', default: '#ffffff' },
      // 카드 머리 띠 · 구획 머리글 · 동작 줄의 회색. `canvas` 와 가른다 — 같으면 흰 카드 위의 띠와 카드 밖 바탕이 한 색이 된다.
      'semantic.surfaceMuted': { type: 'color', label: '면(가라앉게)', group: 'color', default: '#eef2f6' },
      'semantic.canvas': { type: 'color', label: '바탕', group: 'color', default: '#f7f9fb' },
      'semantic.border': { type: 'color', label: '테두리', group: 'color', default: '#dde4ec' },
      'semantic.borderStrong': { type: 'color', label: '테두리(짙게)', group: 'color', default: '#93a1b3' },
      'semantic.divider': { type: 'color', label: '구분선', group: 'color', default: '#c6d0dc' },
      'semantic.text': { type: 'color', label: '글자', group: 'color', default: '#0b2545' },
      'semantic.textMuted': { type: 'color', label: '글자(흐리게)', group: 'color', default: '#48566a' },
      'semantic.textFaint': { type: 'color', label: '글자(옅게)', group: 'color', default: '#93a1b3' },
      'semantic.danger': { type: 'color', label: '위험', group: 'color', default: '#c0392b' },
      'semantic.dangerSoft': { type: 'color', label: '위험(옅게)', group: 'color', default: '#fdf2f1' },
      // 첫 항목은 `theme.css` 의 `@font-face` 이름이다 — 둘을 잇는 것은 이 글자 하나다(`test/portal.test.ts` «서체의 두 층»).
      'typography.family.sans': {
        type: 'font',
        label: '글꼴',
        group: 'type',
        default: '"Portal Sans", "Noto Sans KR", system-ui, sans-serif',
      },
      'typography.body.fontSize': { type: 'length', label: '본문 크기', group: 'type', default: '15px' },
      'typography.body.lineHeight': { type: 'number', label: '본문 행간', group: 'type', default: 1.7 },
      // 각지다 — `admin` 은 4 · 6 · 10, 여기는 2 · 3. 둥근 모서리는 구역에 안 쓴다.
      'radius.sm': { type: 'length', label: '모서리(작게)', group: 'shape', default: '2px' },
      'radius.md': { type: 'length', label: '모서리(중간)', group: 'shape', default: '3px' },
      // `admin` 과 같은 4px — 밀도가 실제로 비슷하다는 사실을 다른 수로 덮지 않는다.
      'space.unit': { type: 'length', label: '간격 단위', group: 'layout', default: '4px' },
      // `admin` 은 폭을 가두지 않는다. 좌측 분류 + 본문 2단이 들어가도 글줄이 길어지지 않는 폭이다.
      'container.maxWidth': { type: 'length', label: '본문 폭', group: 'layout', default: '1280px' },
    },
  },
  /**
   * 옛 테마가 고른 구조가 `defaultVariant` 이고, `admin` 이 고르는 구조를 곁에 둔다 — 한 문서에 둘 다 둘 수 있다. 옛 스킨 variant
   * (`hero` · `featured` · `compact` · `secondary` …)는 같은 id 로 남아 `system-admin` 에서 옮겨 온 노드의 variant 가 그대로 산다.
   *
   * 스킨 variant 는 옛 구조의 DOM 위에 선다(`List` 의 `featured` · `compact` 는 제목 · 날짜 줄이다) — variant 가 한 칸이라
   * «표 + 촘촘» 은 고를 수 없다.
   */
  components: {
    Section: {
      variants: [
        { id: 'default', label: '기본' },
        { id: 'hero', label: '표지 띠' },
        { id: 'muted', label: '가라앉게' },
      ],
      defaultVariant: 'default',
    },
    Card: {
      variants: [
        { id: 'bordered', label: '머리 띠 · 테두리' },
        { id: 'featured', label: '강조' },
        { id: 'plain', label: '띠 없음' },
      ],
      defaultVariant: 'bordered',
    },
    Tabs: {
      variants: [
        { id: 'enclosed', label: '박스 탭' },
        { id: 'underline', label: '밑줄 탭' },
      ],
      defaultVariant: 'enclosed',
    },
    List: {
      variants: [
        { id: 'stackedList', label: '제목 · 날짜 줄', hideProps: ['columns'] },
        { id: 'featured', label: '강조 줄', hideProps: ['columns'] },
        { id: 'compact', label: '촘촘한 줄', hideProps: ['columns'] },
        { id: 'table', label: '표' },
      ],
      defaultVariant: 'stackedList',
    },
    Tree: {
      variants: [
        { id: 'accordion', label: '접고 펴기' },
        { id: 'indent', label: '들여쓰기' },
      ],
      defaultVariant: 'accordion',
    },
    KeyValue: {
      variants: [
        { id: 'definitionList', label: '정의 목록', hideProps: ['columns'] },
        { id: 'table', label: '표' },
      ],
      defaultVariant: 'definitionList',
    },
    SearchForm: {
      variants: [
        { id: 'collapsible', label: '접히는 검색' },
        { id: 'inline', label: '한 줄 검색' },
      ],
      defaultVariant: 'collapsible',
    },
    EntryForm: {
      variants: [
        { id: 'sectioned', label: '구획 서식' },
        { id: 'labelLeft', label: '라벨 왼쪽' },
      ],
      defaultVariant: 'sectioned',
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
        { id: 'muted', label: '흐리게' },
      ],
      defaultVariant: 'default',
    },
  },
  /** 포털에서 가장 되풀이되는 페이지 «검색 + 목록». */
  patterns: {
    'content.noticeBoard': {
      name: '공지 목록',
      slots: { title: 'text', keyword: 'text' },
      schema: {
        type: 'Section',
        children: [
          { type: 'Text', props: { role: 'h2', content: '공지사항' }, slot: 'title' },
          {
            type: 'SearchForm',
            props: { collapsed: true },
            children: [{ type: 'Field', props: { label: '검색어', control: 'text' }, slot: 'keyword' }],
          },
          { type: 'List', props: { items: 10, pagination: true } },
        ],
      },
    },
  },
}
