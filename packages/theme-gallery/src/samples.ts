import type { WbNode } from '@wirebound/schema'

export interface GallerySample {
  /** 무엇을 보이는 표본인지. «List — 컬럼 셋» 꼴. */
  label: string
  node: WbNode
}

const child = (id: string, content = `자식 ${id}`): WbNode => ({ id, type: 'Text', props: { content } })

/**
 * 카탈로그 컴포넌트마다 표본 노드. 갤러리가 manifest 가 선언한 variant 마다 한 번씩 그린다(`galleryItems`).
 *
 * **`variant` 를 적지 않는다** — 갤러리가 선언된 variant 를 붙인다. `variantFrom` 컴포넌트(`Text` · `Field` · `Divider`)는
 * 변형이 prop 에서 오므로 그 prop 을 바꾼 표본을 여럿 둔다. 표본은 스키마 검증을 지난다(`test/gallery.test.tsx`).
 */
export const GALLERY_SAMPLES: Readonly<Record<string, readonly GallerySample[]>> = {
  Page: [{ label: 'Page — 자식 둘', node: { id: 'page', type: 'Page', props: {}, children: [child('p1', '첫 줄'), child('p2', '둘째 줄')] } }],
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
      node: { id: 'flex2', type: 'Flex', props: { direction: 'column', align: 'center' }, children: [child('f1', '위'), child('f2', '아래')] },
    },
  ],
  Grid: [{ label: 'Grid — 3열', node: { id: 'grid', type: 'Grid', props: { columns: 3 }, children: [child('g1'), child('g2'), child('g3')] } }],
  Card: [
    { label: 'Card — 제목 · 부제', node: { id: 'card', type: 'Card', props: { title: '제목', subtitle: '부제' }, children: [child('c1')] } },
    { label: 'Card — 제목만', node: { id: 'card2', type: 'Card', props: { title: '제목' }, children: [child('c1')] } },
  ],
  Tabs: [{ label: 'Tabs — 셋 · 둘째 활성', node: { id: 'tabs', type: 'Tabs', props: { tabs: ['가', '나', '다'], active: 1 }, children: [child('t1')] } }],
  List: [
    { label: 'List — 컬럼 셋', node: { id: 'list', type: 'List', props: { items: 3, columns: ['이름', '상태', '날짜'], pagination: true } } },
    { label: 'List — 선택 · 비활성', node: { id: 'list2', type: 'List', props: { items: 2, columns: ['이름'], selectable: true, selected: true, disabled: true } } },
    { label: 'List — 로딩 · 빈 목록', node: { id: 'list3', type: 'List', props: { items: 2, columns: ['이름'], loading: true, empty: true } } },
  ],
  Tree: [{ label: 'Tree — 두 단계', node: { id: 'tree', type: 'Tree', props: { items: ['뿌리', '가지', '잎'], depth: 2 } } }],
  KeyValue: [
    { label: 'KeyValue — 쌍 둘 · 2열', node: { id: 'kv', type: 'KeyValue', props: { pairs: [{ key: '이름', value: '홍' }, { key: '나이', value: '3' }], columns: 2 } } },
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
      },
    },
    { label: 'SearchForm — 접힘', node: { id: 'sf2', type: 'SearchForm', props: { collapsed: true }, children: [{ id: 'sf-c', type: 'Field', props: { label: '검색어' } }] } },
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
      },
    },
  ],
  Field: [
    { label: 'Field — 글 · 필수', node: { id: 'field', type: 'Field', props: { label: '이름', control: 'text', placeholder: '입력', required: true } } },
    { label: 'Field — 고르개 · 잘못됨', node: { id: 'field2', type: 'Field', props: { label: '상태', control: 'select', invalid: true } } },
    { label: 'Field — 체크 · 비활성', node: { id: 'field3', type: 'Field', props: { label: '동의', control: 'checkbox', disabled: true } } },
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
  ],
  Media: [
    { label: 'Media — 캡션 · 4/3', node: { id: 'media', type: 'Media', props: { kind: 'video', caption: '설명', ratio: '4/3' } } },
    { label: 'Media — 1/1', node: { id: 'media2', type: 'Media', props: { ratio: '1/1' } } },
  ],
  Divider: [
    { label: 'Divider — 가로', node: { id: 'div', type: 'Divider', props: { direction: 'horizontal' } } },
    { label: 'Divider — 세로', node: { id: 'div2', type: 'Divider', props: { direction: 'vertical' } } },
  ],
  Placeholder: [{ label: 'Placeholder — 높이 120', node: { id: 'ph', type: 'Placeholder', props: { label: '광고', height: 120 } } }],
}
