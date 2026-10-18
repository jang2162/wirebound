/**
 * **기본 모듈** — 제품이 소유하는 내장 노드 묶음 셋(설계 spec `2026-10-18-modules-states-layout-design.md` 「B2」 · 정본 설계서 「모듈」).
 * 하단 판 «모듈» 탭의 «기본 모듈» 묶음이 이 목록을 그대로 그린다(읽기 전용). 옛 내장 페이지 프리셋 셋의 내용이다.
 *
 * **제품이 소유하는 고정 목록이라 카탈로그 옆에 둔다** — 노드 묶음은 `WbNode` 트리이고 **테마와 무관하다**(테마를 바꿔도 그대로). `packages/themes`
 * 가 아닌 이유도 그것이고, `apps/web` 이 아닌 이유는 CLI · MCP 와 브라우저가 **둘 다** 이 목록을 볼 수 있어야 하기 때문이다. 서버는 이 목록을
 * 내지 않는다 — 프로젝트 모듈(`apps/api` 의 `modules` 테이블)과 갈래가 다르다.
 *
 * ---
 *
 * **`marker`가 없다.** 담으면 넣은 문서에 번호가 있는데 그것을 가리키는 코멘트 행이 없다(고아 marker).
 *
 * **id는 여기 적힌 그대로이고 넣기가 재발급한다**(`remapNodeIds`). 그래서 여기 있는 id는 `createNodeId()` 형식(`n_` + hex 12자)이 아니라
 * **읽을 수 있는 이름**이다 — `NODE_ID_PATTERN`이 그 형식을 강제하지 않고, 이 값들이 문서에 남지 않으므로 형식을 흉내 낼 이유가 없다. 묶음
 * 안에서만 유일하면 된다 — 넣기가 묶음 하나를 통째로 리매핑하므로 묶음 **사이**의 중복은 뜻을 갖지 않는다.
 *
 * ---
 *
 * **컴포넌트 이름을 가정하지 않는다.** 쓰는 이름은 카탈로그의 `type`과 하나씩 맞고(`SearchForm`·`List`·`Card`·`KeyValue`·`EntryForm`·`Field`·
 * `Button`·`Flex`), **props 규격이 그 모양을 낼 수 있다** — 특히 *"페이지네이션"*은 별도 컴포넌트가 아니라 `List.props.pagination`이고,
 * *"액션 버튼 그룹"*은 `Flex` 안의 `Button` 여럿이다. 그 대조를 케이스가 다시 잰다(`test/builtin-modules.test.ts`).
 *
 * **`Field`에는 `variant`를 적지 않는다.** 그 컴포넌트는 `variantFrom: 'control'`이라 노드가 든 `variant`가 **버려지고** `validatePage`가
 * `ignored-variant`(warning)를 낸다 — 기본 모듈이 경고를 달고 다니면 그것을 넣은 문서가 매번 경고를 낸다.
 */
import type { WbNode } from '../node'

/** 기본 모듈 하나 — 무엇을 넣는가뿐이다(프로젝트 모듈의 id · 만든 사람 같은 저장소의 값이 없다). */
export interface BuiltinModule {
  /** 목록에서 이 모듈을 지목하는 키. 기본 모듈 사이에서 유일하다. */
  key: 'search-list' | 'detail' | 'entry-form'
  name: string
  /** 넣으면 고른 자리의 형제가 될 것. */
  nodes: readonly WbNode[]
}

/**
 * **검색 + 목록형** — 설계서 「모듈」의 «기본 모듈»의 *"`SearchForm` + `List` + 페이지네이션"*.
 *
 * 검색 버튼을 `SearchForm` **안**에 두는 것은 그 컴포넌트가 `actions` 조각을 갖기
 * 때문이다(카탈로그의 `parts`) — 밖에 두면 테마가 그 자리를 겨냥할 수 없다.
 */
const SEARCH_LIST: BuiltinModule = {
  key: 'search-list',
  name: '검색 + 목록형',
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
        // 설계서 「모듈」의 «기본 모듈»이 이름으로 지목한 것. 별도 컴포넌트가 아니라 `List`의 prop이다.
        pagination: true,
      },
    },
  ],
}

/**
 * **상세 조회형** — 설계서 「모듈」의 «기본 모듈»의 *"`Card` + `KeyValue` + 액션 버튼 그룹"*.
 *
 * *"액션 버튼 그룹"*은 `Flex` 안의 `Button` 셋이다. 카탈로그에 버튼 묶음 전용 타입이
 * 없고, `Flex`가 그 배치를 표현하는 자리다.
 */
const DETAIL: BuiltinModule = {
  key: 'detail',
  name: '상세 조회형',
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
 * **등록/수정 폼형** — 설계서 「모듈」의 «기본 모듈»의 *"`EntryForm` + 필드 묶음 + 저장/취소"*.
 *
 * 저장·취소를 `EntryForm` **밖**에 두는 것은 `sectioned` 구조가 자식 하나마다 구획을
 * 만들기 때문이다(카탈로그 주석) — 버튼 묶음을 자식으로 넣으면 그 테마에서 버튼이
 * 구획 하나가 된다. `SearchForm`의 검색 버튼과 갈리는 이유가 이것이다.
 */
const ENTRY_FORM: BuiltinModule = {
  key: 'entry-form',
  name: '등록/수정 폼형',
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

/** 기본 모듈 전부. 목록의 순서가 곧 화면의 순서다. */
export const BUILTIN_MODULES: readonly BuiltinModule[] = [SEARCH_LIST, DETAIL, ENTRY_FORM]
