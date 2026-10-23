import type { WbNode } from '@wirebound/schema'

export interface GallerySample {
  /** 무엇을 보이는 표본인지. «List — 컬럼 셋» 꼴. */
  label: string
  node: WbNode
  /**
   * 표본이 설 자리가 정해진 타입(`TabPanel` — 탭 몸통에만 선다)이면 그 부모 — 표본을 그 몸통에 넣어 그린다(`galleryItemDocument`). variant 는
   * 표본 노드에 붙는다.
   */
  within?: WbNode
}

const child = (id: string, content = `자식 ${id}`): WbNode => ({ id, type: 'Text', props: { content } })
const button = (id: string, label: string): WbNode => ({ id, type: 'Button', props: { label } })

/**
 * 끊을 자리가 없는 긴 낱말 — 관리자 화면의 이메일 · 주소는 흔히 이 꼴이다. 하이픈을 넣지 않는다 — 브라우저는 하이픈 뒤에서 줄을 바꿔
 * (`example-` 까지가 390 폭 본문에 들어간다) 넘침을 못 보인다.
 */
const LONG_WORD = 'hong.gildong.very.long.account@examplecompany.co.kr'

/** 그리기 값을 정한 자리표시자 표본의 이름 — 테마가 그 값을 따르는지 재는 자가 이 이름으로 칸을 고른다. */
export const PLACEHOLDER_SET_SAMPLE = 'Placeholder — 정한 색 · 모서리 · 여백'

/** 그 표본의 props. 색은 테마 기본값과 겹치지 않게 골랐다 — 겹치면 테마가 변수를 무시해도 같은 색이 나와 자가 못 가른다. */
export const PLACEHOLDER_SET_PROPS = {
  label: '정한 값',
  width: 240,
  height: 64,
  background: '#fde047',
  border: 'solid',
  borderColor: '#dc2626',
  radius: 12,
  color: '#7c2d12',
  fontSize: 15,
  padding: 6,
} as const

/**
 * 카탈로그 컴포넌트마다 표본 노드. 갤러리가 manifest 가 선언한 variant 마다 한 번씩 그린다(`galleryItems`).
 *
 * **`variant` 를 적지 않는다** — 갤러리가 선언된 variant 를 붙인다. `variantFrom` 컴포넌트(`Text` · `Field` · `Divider`)는
 * 변형이 prop 에서 오므로 그 prop 을 바꾼 표본을 여럿 둔다. 표본은 스키마 검증을 지난다(`test/gallery.test.tsx`).
 */
export const GALLERY_SAMPLES: Readonly<Record<string, readonly GallerySample[]>> = {
  Page: [
    { label: 'Page — 자식 둘', node: { id: 'page', type: 'Page', props: {}, children: [child('p1', '첫 줄'), child('p2', '둘째 줄')] } },
  ],
  Slot: [{ label: 'Slot — 주입 없음', node: { id: 'slot', type: 'Slot', props: {} } }],
  Section: [
    { label: 'Section — 자식 하나', node: { id: 'sec', type: 'Section', props: {}, children: [child('s1')] } },
    { label: 'Section — compact', node: { id: 'sec2', type: 'Section', props: { compact: true }, children: [child('s1')] } },
  ],
  Flex: [
    {
      label: 'Flex — 가로 · 사이 띄움',
      node: { id: 'flex', type: 'Flex', props: { justify: 'between' }, children: [child('f1', '왼쪽'), child('f2', '오른쪽')] },
    },
    {
      label: 'Flex — 세로 · 가운데',
      node: {
        id: 'flex2',
        type: 'Flex',
        props: { direction: 'column', align: 'center' },
        children: [child('f1', '위'), child('f2', '아래')],
      },
    },
  ],
  Grid: [
    { label: 'Grid — 3열', node: { id: 'grid', type: 'Grid', props: { columns: 3 }, children: [child('g1'), child('g2'), child('g3')] } },
  ],
  Card: [
    {
      label: 'Card — 제목 · 부제',
      node: { id: 'card', type: 'Card', props: { title: '제목', subtitle: '부제' }, children: [child('c1')] },
    },
    { label: 'Card — 제목만', node: { id: 'card2', type: 'Card', props: { title: '제목' }, children: [child('c1')] } },
    // 구역 넷 — 제목 옆 · 머리 오른쪽 · 몸통 · 바닥(`wb-theme check` 가 내용이 든 구역을 뷰가 그렸는지 잰다).
    {
      label: 'Card — 제목 옆 · 머리 오른쪽 · 바닥',
      node: {
        id: 'card3',
        type: 'Card',
        props: { title: '회원 정보' },
        children: [child('c1')],
        zones: { titleSide: [child('c-side', '필수')], headEnd: [button('c-edit', '수정')], footer: [button('c-list', '목록')] },
      },
    },
  ],
  Tabs: [
    {
      label: 'Tabs — 셋 · 둘째 활성',
      node: {
        id: 'tabs',
        type: 'Tabs',
        props: { active: 1 },
        children: [
          { id: 'tp1', type: 'TabPanel', props: { label: '가' }, children: [child('t1', '가의 내용')] },
          { id: 'tp2', type: 'TabPanel', props: { label: '나' }, children: [child('t2', '나의 내용')] },
          { id: 'tp3', type: 'TabPanel', props: { label: '다' }, children: [child('t3', '다의 내용')] },
        ],
      },
    },
  ],
  TabPanel: [
    {
      label: 'TabPanel — 탭 하나',
      node: { id: 'tabp', type: 'TabPanel', props: { label: '상세정보' }, children: [child('tp-c', '상세 내용')] },
      within: { id: 'tabp-host', type: 'Tabs', props: { active: 0 } },
    },
  ],
  List: [
    {
      label: 'List — 컬럼 셋',
      node: { id: 'list', type: 'List', props: { items: 3, columns: ['이름', '상태', '날짜'], pagination: true } },
    },
    {
      label: 'List — 선택 · 비활성',
      node: { id: 'list2', type: 'List', props: { items: 2, columns: ['이름'], selectable: true, selected: true, disabled: true } },
    },
    {
      label: 'List — 로딩 · 빈 목록',
      node: { id: 'list3', type: 'List', props: { items: 2, columns: ['이름'], loading: true, empty: true } },
    },
    {
      label: 'List — 결과 머리줄',
      node: {
        id: 'list4',
        type: 'List',
        props: { items: 2, columns: ['이름', '상태'] },
        zones: { headStart: [child('l-total', '검색결과 총 2건')], headEnd: [button('l-excel', '엑셀다운로드')] },
      },
    },
  ],
  Tree: [{ label: 'Tree — 두 단계', node: { id: 'tree', type: 'Tree', props: { items: ['뿌리', '가지', '잎'], depth: 2 } } }],
  KeyValue: [
    {
      label: 'KeyValue — 쌍 셋 · 2열 · 긴 값',
      node: {
        id: 'kv',
        type: 'KeyValue',
        props: {
          pairs: [
            { key: '이름', value: '홍' },
            { key: '나이', value: '3' },
            { key: '이메일', value: LONG_WORD },
          ],
          columns: 2,
        },
      },
    },
  ],
  SearchForm: [
    {
      label: 'SearchForm — 필드 둘',
      node: {
        id: 'sf',
        type: 'SearchForm',
        props: {},
        children: [
          { id: 'sf-a', type: 'Field', props: { label: '검색어' } },
          { id: 'sf-b', type: 'Field', props: { label: '상태', control: 'select' } },
        ],
        zones: { actions: [button('sf-reset', '초기화'), button('sf-go', '검색')] },
      },
    },
    {
      label: 'SearchForm — 접힘',
      node: {
        id: 'sf2',
        type: 'SearchForm',
        props: { collapsed: true },
        children: [{ id: 'sf-c', type: 'Field', props: { label: '검색어' } }],
      },
    },
  ],
  EntryForm: [
    {
      label: 'EntryForm — 제목 · 필드 둘',
      node: {
        id: 'ef',
        type: 'EntryForm',
        props: { title: '가입' },
        children: [
          { id: 'ef-a', type: 'Field', props: { label: '이름', required: true } },
          { id: 'ef-b', type: 'Field', props: { label: '소개', control: 'textarea' } },
        ],
        zones: { actions: [button('ef-save', '저장'), button('ef-cancel', '취소')] },
      },
    },
  ],
  Field: [
    {
      label: 'Field — 글 · 필수',
      node: { id: 'field', type: 'Field', props: { label: '이름', control: 'text', placeholder: '입력', required: true } },
    },
    { label: 'Field — 고르개 · 잘못됨', node: { id: 'field2', type: 'Field', props: { label: '상태', control: 'select', invalid: true } } },
    {
      label: 'Field — 체크 · 비활성',
      node: { id: 'field3', type: 'Field', props: { label: '동의', control: 'checkbox', disabled: true } },
    },
  ],
  Button: [
    { label: 'Button — 보통', node: { id: 'btn', type: 'Button', props: { label: '저장' } } },
    { label: 'Button — 비활성 · 로딩', node: { id: 'btn2', type: 'Button', props: { label: '저장', disabled: true, loading: true } } },
  ],
  Link: [{ label: 'Link — 이동', node: { id: 'link', type: 'Link', props: { label: '다음', target: 'p2' } } }],
  // 역할마다 크기 토큰이 따로 있다(`typography.display` · `typography.h1` …) — 표본에 없는 역할의 토큰은 설정 페이지의 미리보기에서 바꿔도 안 보인다.
  Text: [
    { label: 'Text — display', node: { id: 'text4', type: 'Text', props: { content: '가장 큰 제목', role: 'display' } } },
    { label: 'Text — h1', node: { id: 'text5', type: 'Text', props: { content: '큰 제목', role: 'h1' } } },
    { label: 'Text — h2', node: { id: 'text', type: 'Text', props: { content: '제목 글', role: 'h2' } } },
    { label: 'Text — body', node: { id: 'text2', type: 'Text', props: { content: '본문 글입니다.', role: 'body' } } },
    { label: 'Text — caption', node: { id: 'text3', type: 'Text', props: { content: '덧붙임', role: 'caption' } } },
    // 끊을 자리 없는 낱말 — 좁은 폭(`wb-theme shots` 의 390)에서 글자가 칸 밖으로 나가거나 잘려 숨는지를 이 칸이 보인다.
    { label: 'Text — 긴 낱말', node: { id: 'text6', type: 'Text', props: { content: `문의 ${LONG_WORD}`, role: 'body' } } },
  ],
  Media: [
    { label: 'Media — 캡션 · 4/3', node: { id: 'media', type: 'Media', props: { kind: 'video', caption: '설명', ratio: '4/3' } } },
    { label: 'Media — 1/1', node: { id: 'media2', type: 'Media', props: { ratio: '1/1' } } },
  ],
  Divider: [
    { label: 'Divider — 가로', node: { id: 'div', type: 'Divider', props: { direction: 'horizontal' } } },
    { label: 'Divider — 세로', node: { id: 'div2', type: 'Divider', props: { direction: 'vertical' } } },
  ],
  Placeholder: [
    { label: 'Placeholder — 높이 120', node: { id: 'ph', type: 'Placeholder', props: { label: '광고', height: 120 } } },
    // 정한 그리기 값을 테마가 따르는지 `wb-theme check` · `wb-theme shots` 가 이 표본으로 잰다(`PLACEHOLDER_SET_SAMPLE`).
    { label: PLACEHOLDER_SET_SAMPLE, node: { id: 'ph2', type: 'Placeholder', props: PLACEHOLDER_SET_PROPS } },
    {
      label: 'Placeholder — 칩(내용)',
      node: {
        id: 'ph3',
        type: 'Placeholder',
        props: { background: '#2563eb', color: '#ffffff', radius: 999, padding: 4, border: 'none' },
        children: [child('ph3a', '퀴즈'), child('ph3b', '×')],
      },
    },
  ],
}
