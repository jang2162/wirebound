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
/** 값 칸에 조각을 줄 세운 필드. */
const field = (id: string, label: string, pieces: WbNode[], extra: Record<string, unknown> = {}): WbNode => ({
  id,
  type: 'Field',
  props: { label, ...extra },
  children: pieces,
})
const input = (id: string, props: Record<string, unknown> = {}): WbNode => ({ id, type: 'Input', props })

/**
 * 끊을 자리가 없는 긴 낱말 — 관리자 화면의 이메일 · 주소는 흔히 이 꼴이다. 하이픈을 넣지 않는다 — 브라우저는 하이픈 뒤에서 줄을 바꿔
 * (`example-` 까지가 390 폭 본문에 들어간다) 넘침을 못 보인다.
 */
const LONG_WORD = 'hong.gildong.very.long.account@examplecompany.co.kr'

/**
 * 카탈로그 컴포넌트마다 표본 노드. 갤러리가 manifest 가 선언한 variant 마다 한 번씩 그린다(`galleryItems`).
 *
 * **`variant` 를 적지 않는다** — 갤러리가 선언된 variant 를 붙인다. `variantFrom` 컴포넌트(`Text` · `Divider`)는
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
          field('sf-a', '검색어', [input('sf-a1', { placeholder: '입력' })]),
          field('sf-b', '상태', [{ id: 'sf-b1', type: 'Select', props: {} }]),
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
        children: [field('sf-c', '검색어', [input('sf-c1')])],
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
          field('ef-a', '이름', [input('ef-a1', { placeholder: '입력' })], { required: true }),
          field('ef-b', '소개', [{ id: 'ef-b1', type: 'TextArea', props: {} }]),
        ],
        zones: { actions: [button('ef-save', '저장'), button('ef-cancel', '취소')] },
      },
    },
  ],
  Field: [
    {
      label: 'Field — 입력 · 필수',
      node: field('field', '이름', [input('field-i', { placeholder: '입력' })], { required: true }),
    },
    // 기간 — 날짜 ~ 날짜 + 단추 둘(설계서의 «[날짜]~[날짜][이전주][다음주]»).
    {
      label: 'Field — 기간 · 단추',
      node: field('field2', '기간', [
        { id: 'field2-from', type: 'DateInput', props: { value: '2026-10-01' } },
        { id: 'field2-to', type: 'Affix', props: { text: '~' } },
        { id: 'field2-until', type: 'DateInput', props: {} },
        button('field2-prev', '이전주'),
        button('field2-next', '다음주'),
      ]),
    },
    // 세그먼트 + 숫자 + 사이 글자(«[Y][N] + [입력]%») · 몫을 준 입력이 단추 앞까지 찬다(«[입력 몫 1][중복확인]»).
    {
      label: 'Field — 세그먼트 · 몫',
      node: field('field3', '합격 기준', [
        { id: 'field3-yn', type: 'RadioGroup', props: { options: [{ label: 'Y', selected: true }, { label: 'N' }] } },
        input('field3-n', { kind: 'number', size: 'short', value: '80' }),
        { id: 'field3-pct', type: 'Affix', props: { text: '%' } },
        { ...input('field3-id', { placeholder: '아이디' }), weight: 1 },
        button('field3-check', '중복확인'),
      ]),
    },
  ],
  Input: [
    { label: 'Input — 안내 · 보통', node: input('in', { placeholder: '입력하세요' }) },
    { label: 'Input — 숫자 · 짧게 · 값', node: input('in2', { kind: 'number', size: 'short', value: '42' }) },
    { label: 'Input — 비밀번호 · 길게', node: input('in3', { kind: 'password', size: 'long', value: 'secret' }) },
    { label: 'Input — 읽기 전용', node: input('in4', { value: '자동 계산된 값', readonly: true }) },
    { label: 'Input — 비활성 · 오류', node: input('in5', { placeholder: '입력', disabled: true, invalid: true }) },
  ],
  TextArea: [
    { label: 'TextArea — 안내 · 3줄', node: { id: 'ta', type: 'TextArea', props: { placeholder: '내용을 입력하세요' } } },
    {
      label: 'TextArea — 값 · 5줄 · 읽기 전용',
      node: { id: 'ta2', type: 'TextArea', props: { value: '적어 둔 글', rows: 5, readonly: true } },
    },
  ],
  Select: [
    { label: 'Select — 안내', node: { id: 'sel', type: 'Select', props: {} } },
    {
      label: 'Select — 고름 · 짧게 · 오류',
      node: {
        id: 'sel2',
        type: 'Select',
        props: { options: [{ label: '10' }, { label: '20', selected: true }], size: 'short', invalid: true },
      },
    },
  ],
  DateInput: [
    { label: 'DateInput — 안내', node: { id: 'date', type: 'DateInput', props: {} } },
    { label: 'DateInput — 값 · 비활성', node: { id: 'date2', type: 'DateInput', props: { value: '2026-10-24', disabled: true } } },
  ],
  TimeInput: [
    { label: 'TimeInput — 안내', node: { id: 'time', type: 'TimeInput', props: {} } },
    { label: 'TimeInput — 값 · 읽기 전용', node: { id: 'time2', type: 'TimeInput', props: { value: '09:30', readonly: true } } },
  ],
  CheckboxGroup: [
    {
      label: 'CheckboxGroup — 셋 · 둘 고름',
      node: {
        id: 'cbg',
        type: 'CheckboxGroup',
        props: { options: [{ label: '월', selected: true }, { label: '화' }, { label: '수', selected: true }] },
      },
    },
    { label: 'CheckboxGroup — 하나 · 비활성', node: { id: 'cbg2', type: 'CheckboxGroup', props: { disabled: true } } },
  ],
  RadioGroup: [
    {
      label: 'RadioGroup — Y 고름',
      node: { id: 'rg', type: 'RadioGroup', props: { options: [{ label: 'Y', selected: true }, { label: 'N' }] } },
    },
    {
      label: 'RadioGroup — 넷 · 안 고름',
      node: {
        id: 'rg2',
        type: 'RadioGroup',
        props: { options: [{ label: '전체' }, { label: '대기' }, { label: '진행' }, { label: '완료' }] },
      },
    },
  ],
  Chip: [
    { label: 'Chip — 지우기', node: { id: 'chip', type: 'Chip', props: { label: '만족도 설문' } } },
    {
      label: 'Chip — 지우기 없음 · 비활성',
      node: { id: 'chip2', type: 'Chip', props: { label: '고정', removable: false, disabled: true } },
    },
  ],
  Affix: [
    { label: 'Affix — 기본', node: { id: 'affix', type: 'Affix', props: { text: '부터' } } },
    { label: 'Affix — 흐리게', node: { id: 'affix2', type: 'Affix', props: { text: '(px)', tone: 'muted' } } },
    { label: 'Affix — 위험', node: { id: 'affix3', type: 'Affix', props: { text: '자동 계산되는 값입니다', tone: 'danger' } } },
    { label: 'Affix — 주색', node: { id: 'affix4', type: 'Affix', props: { text: '안내', tone: 'primary' } } },
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
  Placeholder: [{ label: 'Placeholder — 높이 120', node: { id: 'ph', type: 'Placeholder', props: { label: '광고', height: 120 } } }],
}
