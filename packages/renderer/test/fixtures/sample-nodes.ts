/**
 * 카탈로그 19종마다 props 를 기본값이 아닌 값으로 채운 노드. `default-view-parity.test.tsx` 가 옛 구조 경로와
 * 테마 경로(기본 뷰)의 DOM 을 견주는 입력이다 — 키는 무엇을 재는지 적는다.
 */
const child = (id: string) => ({ id, type: 'Text', props: { content: `자식 ${id}` } })

const ROLES = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'] as const
const CONTROLS = ['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'] as const

export const SAMPLE_NODES: Record<string, unknown> = {
  'Page — 자식 하나': { id: 'page', type: 'Page', props: {}, children: [child('c1')] },
  'Slot — 주입 없음': { id: 'slot', type: 'Slot', props: {} },
  'Section — compact · 자식 하나': { id: 'sec', type: 'Section', props: { compact: true }, children: [child('c1')] },
  'Flex — column · center · between · wrap': {
    id: 'flex',
    type: 'Flex',
    props: { direction: 'column', align: 'center', justify: 'between', wrap: true },
    children: [child('c1')],
  },
  'Grid — 3열': { id: 'grid', type: 'Grid', props: { columns: 3 }, children: [child('c1')] },
  'Card — 제목 · 부제': { id: 'card', type: 'Card', props: { title: '제목', subtitle: '부제' }, children: [child('c1')] },
  'Card — 부제 없음': { id: 'card2', type: 'Card', props: { title: '제목' }, children: [child('c1')] },
  'Tabs — 셋 · 둘째 활성': {
    id: 'tabs',
    type: 'Tabs',
    props: { tabs: ['가', '나', '다'], active: 1 },
    children: [child('c1')],
  },
  'List — columns 셋 · 상태 넷': {
    id: 'list',
    type: 'List',
    variant: 'featured',
    props: {
      items: 3,
      columns: ['이름', '상태', '날짜'],
      pagination: true,
      selectable: true,
      selected: true,
      disabled: true,
      loading: true,
      empty: true,
    },
  },
  'List — 페이지네이션 없음': { id: 'list2', type: 'List', props: { items: 2, columns: ['하나'], pagination: false } },
  'Tree — 두 단계 · 선택': {
    id: 'tree',
    type: 'Tree',
    props: { items: ['뿌리', '가지', '잎'], depth: 2, selected: true, disabled: true },
  },
  'KeyValue — 쌍 둘 · 2열': {
    id: 'kv',
    type: 'KeyValue',
    props: { pairs: [{ key: '이름', value: '홍' }, { key: '나이', value: '3' }], columns: 2 },
  },
  'SearchForm — 접힘 · 필드 자식': {
    id: 'sf',
    type: 'SearchForm',
    props: { collapsed: true },
    children: [{ id: 'sf-f', type: 'Field', props: { label: '검색어' } }],
  },
  'EntryForm — 제목 · 자식 하나': { id: 'ef', type: 'EntryForm', props: { title: '가입' }, children: [child('c1')] },
  'EntryForm — 제목 없음': { id: 'ef2', type: 'EntryForm', props: {}, children: [child('c1')] },
  ...Object.fromEntries(
    CONTROLS.map((control) => [
      `Field — control ${control}`,
      {
        id: `field-${control}`,
        type: 'Field',
        props: { label: '라벨', control, placeholder: control === 'text' ? '' : '입력', required: true, disabled: true, invalid: true },
      },
    ]),
  ),
  'Button — 비활성 · 로딩 · variant': {
    id: 'btn',
    type: 'Button',
    variant: 'danger',
    props: { label: '저장', disabled: true, loading: true },
  },
  'Link — target 있음': { id: 'link', type: 'Link', props: { label: '다음', target: 'p2', disabled: true } },
  'Link — target 없음': { id: 'link2', type: 'Link', props: { label: '제자리' } },
  ...Object.fromEntries(
    ROLES.map((role) => [`Text — role ${role}`, { id: `text-${role}`, type: 'Text', props: { content: `글 ${role}`, role } }]),
  ),
  'Media — 캡션 · 4/3': { id: 'media', type: 'Media', props: { kind: 'video', caption: '설명', ratio: '4/3' } },
  'Media — 캡션 없음': { id: 'media2', type: 'Media', props: { ratio: '1/1' } },
  'Divider — horizontal': { id: 'div-h', type: 'Divider', props: { direction: 'horizontal' } },
  'Divider — vertical': { id: 'div-v', type: 'Divider', props: { direction: 'vertical' } },
  'Placeholder — 높이 200': { id: 'ph', type: 'Placeholder', props: { label: '광고', height: 200 } },
}
