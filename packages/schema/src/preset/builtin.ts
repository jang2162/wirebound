/**
 * 내장 페이지 프리셋 3종(설계 §11.1). **제품이 소유하는 고정 목록이라 카탈로그 옆에 둔다**
 * (P7-2 D1) — 프리셋 문서는 `WbNode` 트리이고 **테마와 무관하다**(§11.1: *"테마를 바꿔도
 * 그대로"*). `packages/themes`가 아닌 이유도 그것이고, `apps/api`·`apps/web`이 아닌 이유는
 * P9(CLI·MCP)와 브라우저가 **둘 다** 이 목록을 봐야 하기 때문이다.
 *
 * ---
 *
 * **담는 것은 root의 `children`이지 문서 봉투가 아니다**(D2·D3). 적용은 root 자체를 바꾸지
 * 않는다 — root의 `id`·`type`·`props`는 **그 페이지의 것**이지 프리셋의 것이 아니다.
 *
 * **`marker`가 없다**(D4). 담으면 적용된 문서에 번호가 있는데 그것을 가리키는 코멘트 행이
 * 없다(P5-1이 이미 만난 고아 marker). 내장은 애초에 안 담고, 프로젝트 프리셋은 **저장
 * 시점에** 버린다(`stripMarkers`).
 *
 * **id는 여기 적힌 그대로 저장된 값이고 적용이 재발급한다**(§11.1 — *"프리셋 적용 시 노드
 * `id`를 새로 발급한다"*). 그래서 여기 있는 id는 `createNodeId()` 형식(`n_` + hex 12자)이
 * 아니라 **읽을 수 있는 이름**이다 — `NODE_ID_PATTERN`이 그 형식을 강제하지 않고(그
 * 주석이 §4.4의 `n_root`·`n_hdr`을 근거로 든다), 이 값들이 문서에 남지 않으므로 형식을
 * 흉내 낼 이유가 없다. 프리셋 안에서만 유일하면 된다 — 적용이 트리 하나를 통째로
 * 리매핑하므로 프리셋 **사이**의 중복은 뜻을 갖지 않는다.
 *
 * ---
 *
 * **컴포넌트 이름을 가정하지 않았다.** §11.1이 부르는 이름을 카탈로그의 `type`과 하나씩
 * 대조했고(`SearchForm`·`List`·`Card`·`KeyValue`·`EntryForm`·`Field`·`Button`·`Flex`가
 * 전부 있다), **props 규격이 §11.1의 모양을 낼 수 있는지도 확인했다**(재라 #3) — 특히
 * *"페이지네이션"*은 별도 컴포넌트가 아니라 `List.props.pagination`이고, *"액션 버튼
 * 그룹"*은 `Flex` 안의 `Button` 여럿이다. 그 대조를 케이스가 다시 잰다.
 *
 * **`Field`에는 `variant`를 적지 않는다.** 그 컴포넌트는 `variantFrom: 'control'`이라
 * 노드가 든 `variant`가 **버려지고** `validatePage`가 `ignored-variant`(warning)를 낸다 —
 * 내장 프리셋이 경고를 달고 다니면 그것을 적용한 문서가 매번 경고를 낸다.
 */
import { cloneJsonValue } from '../clone'
import type { WbNode } from '../node'

/**
 * 프리셋 하나. **프로젝트 프리셋(`presets` 테이블)과 같은 모양이 아니다** — 그쪽은
 * `id`·`createdAt` 같은 저장소의 값을 더 든다. 여기 있는 것은 *"무엇을 놓는가"* 뿐이다.
 */
export interface PagePreset {
  /** 목록·API에서 이 프리셋을 지목하는 키. 내장 사이에서 유일하다. */
  key: string
  name: string
  description: string
  /** 적용하면 root의 `children`이 될 것. 빈 배열이면 *"치우기"*다(D7). */
  nodes: readonly WbNode[]
}

/**
 * **검색 + 목록형** — §11.1의 *"`SearchForm` + `List` + 페이지네이션"*.
 *
 * 검색 버튼을 `SearchForm` **안**에 두는 것은 그 컴포넌트가 `actions` 조각을 갖기
 * 때문이다(카탈로그의 `parts`) — 밖에 두면 테마가 그 자리를 겨냥할 수 없다.
 */
const SEARCH_LIST: PagePreset = {
  key: 'search-list',
  name: '검색 + 목록형',
  description: '검색 조건을 위에 두고 결과를 목록으로 보이는 화면',
  nodes: [
    {
      id: 'sl_search',
      type: 'SearchForm',
      props: { collapsed: false },
      children: [
        {
          id: 'sl_keyword',
          type: 'Field',
          props: { label: '검색어', control: 'text', placeholder: '이름 또는 아이디' },
        },
        { id: 'sl_period', type: 'Field', props: { label: '등록일', control: 'dateRange' } },
        { id: 'sl_submit', type: 'Button', props: { label: '검색' }, variant: 'primary' },
      ],
    },
    {
      id: 'sl_list',
      type: 'List',
      props: {
        items: 10,
        columns: ['No', '아이디', '이름', '등록일'],
        // §11.1이 이름으로 지목한 것. 별도 컴포넌트가 아니라 `List`의 prop이다.
        pagination: true,
      },
    },
  ],
}

/**
 * **상세 조회형** — §11.1의 *"`Card` + `KeyValue` + 액션 버튼 그룹"*.
 *
 * *"액션 버튼 그룹"*은 `Flex` 안의 `Button` 셋이다. 카탈로그에 버튼 묶음 전용 타입이
 * 없고(19종을 대조했다), `Flex`가 그 배치를 표현하는 자리다.
 */
const DETAIL: PagePreset = {
  key: 'detail',
  name: '상세 조회형',
  description: '항목 하나의 값을 키-값으로 보이고 아래에 조작 버튼을 두는 화면',
  nodes: [
    {
      id: 'dt_card',
      type: 'Card',
      props: { title: '기본 정보', subtitle: '' },
      children: [
        {
          id: 'dt_pairs',
          type: 'KeyValue',
          props: {
            pairs: [
              { key: '아이디', value: 'user01' },
              { key: '이름', value: '홍길동' },
              { key: '등록일', value: '2026-01-01' },
            ],
            columns: 1,
          },
        },
      ],
    },
    {
      id: 'dt_actions',
      type: 'Flex',
      props: { direction: 'row', justify: 'end', align: 'center', wrap: false },
      children: [
        { id: 'dt_edit', type: 'Button', props: { label: '수정' }, variant: 'primary' },
        { id: 'dt_delete', type: 'Button', props: { label: '삭제' }, variant: 'danger' },
        { id: 'dt_back', type: 'Button', props: { label: '목록' }, variant: 'secondary' },
      ],
    },
  ],
}

/**
 * **등록/수정 폼형** — §11.1의 *"`EntryForm` + 필드 묶음 + 저장/취소"*.
 *
 * 저장·취소를 `EntryForm` **밖**에 두는 것은 `sectioned` 구조가 자식 하나마다 구획을
 * 만들기 때문이다(카탈로그 주석) — 버튼 묶음을 자식으로 넣으면 그 테마에서 버튼이
 * 구획 하나가 된다. `SearchForm`의 검색 버튼과 갈리는 이유가 이것이다.
 */
const ENTRY_FORM: PagePreset = {
  key: 'entry-form',
  name: '등록/수정 폼형',
  description: '값을 입력받아 저장하는 화면',
  nodes: [
    {
      id: 'ef_form',
      type: 'EntryForm',
      props: { title: '기본 정보' },
      children: [
        { id: 'ef_name', type: 'Field', props: { label: '이름', control: 'text', required: true } },
        { id: 'ef_email', type: 'Field', props: { label: '이메일', control: 'text' } },
        { id: 'ef_kind', type: 'Field', props: { label: '구분', control: 'select' } },
        { id: 'ef_memo', type: 'Field', props: { label: '메모', control: 'textarea' } },
      ],
    },
    {
      id: 'ef_actions',
      type: 'Flex',
      props: { direction: 'row', justify: 'end', align: 'center', wrap: false },
      children: [
        { id: 'ef_save', type: 'Button', props: { label: '저장' }, variant: 'primary' },
        { id: 'ef_cancel', type: 'Button', props: { label: '취소' }, variant: 'secondary' },
      ],
    },
  ],
}

/** 내장 프리셋 전부(§11.1의 셋). 목록의 순서가 곧 화면의 순서다. */
export const BUILTIN_PRESETS: readonly PagePreset[] = [SEARCH_LIST, DETAIL, ENTRY_FORM]

/**
 * 프리셋에 담을 노드에서 `marker`를 버린다(D4·D7).
 *
 * **저장하는 자리가 이 함수를 지나야 한다.** 담아 두면 적용된 문서에 번호가 있는데 그것을
 * 가리키는 코멘트 행이 없다 — 코멘트는 `page_id`·`node_id`로 매달려 있고 프리셋은 페이지를
 * 건너 다니므로, 번호만 따라가면 **아무 데도 닿지 않는 번호**가 된다.
 *
 * **`marker`만 지운다.** `interactions`는 남긴다(D4) — 트리 안을 가리키는 `target`은
 * `remapNodeIds`가 함께 바꾸고, 트리 밖(`page:…`)을 가리키던 것이 끊기면 `validatePage`가
 * **warning**으로 말한다. 화면이 그것까지 막으면 서버보다 엄격해진다.
 *
 * **깊은 복사를 겸한다.** 저장 경계가 받은 값을 그대로 들고 있으면 부르는 쪽이 나중에
 * 그 트리를 만졌을 때 저장된 것이 함께 바뀐다 — `expandPattern`이 `structuredClone`으로
 * 닫은 것과 같은 부류다(P7-1 이월 §1). 임의 JSON을 복사하는 규칙은 `../clone.ts` 하나가
 * 갖는다(`structuredClone`을 왜 안 쓰는지도 거기 있다).
 *
 * **`WbNode`가 아닌 키는 옮기지 않는다.** `remapNodeIds`가 `{ ...node }`로 그것을 남기는
 * 것과 갈리는 자리다 — 이쪽은 **저장할 값을 만드는 함수**라 선언되지 않은 키를 담으면
 * 봉투가 거부할 값을 DB에 넣게 된다.
 */
export function stripMarkers(nodes: readonly WbNode[]): WbNode[] {
  return nodes.map((node) => copyNode(node))
}

function copyNode(node: WbNode): WbNode {
  const next: WbNode = { id: node.id, type: node.type }
  if (node.props !== undefined) next.props = cloneJsonValue(node.props)
  if (node.variant !== undefined) next.variant = node.variant
  if (node.interactions !== undefined) {
    next.interactions = node.interactions.map((interaction) => ({
      on: interaction.on,
      actions: interaction.actions.map((action) => {
        const copied = { ...action }
        // `props`와 같은 이유로 깊이 복사한다(`../clone.ts`) — 리뷰 (2)가 잡은 자리다.
        if ('value' in copied) copied.value = cloneJsonValue(copied.value)
        return copied
      }),
    }))
  }
  if (node.children !== undefined) {
    next.children = node.children.map((child) => copyNode(child))
  }
  return next
}

