/**
 * **견주기가 쓸 문서와 테마.**
 *
 * `dom-compare.ts`와 같은 이유로 여기 산다 — `packages/exporter`의 견주기와 `apps/web`의
 * 캔버스↔번들 견주기가 **같은 문서·같은 테마**를 써야 두 결과를 나란히 읽을 수 있다.
 */
import type { CodeTable, PageDocument, WbNode } from '@wirebound/schema'
import { defineTheme, Root, view, type ThemeDefinition, type ThemeManifest } from '@wirebound/theme-sdk'
import { createElement } from 'react'

/* ------------------------------------------------------------------ 문서 */

let nextId = 0

function id(): string {
  nextId += 1
  return `n_${String(nextId).padStart(12, '0')}`
}

/**
 * **카탈로그의 컴포넌트를 넓게 쓰는 문서**(*"문서 하나로 재지 마라"*).
 *
 * props를 기본값으로 두지 않는 것은 「노드 속성」의 여섯 속성 중 `data-wb-variant`·`data-wb-state`가
 * **기본 props에서는 안 나오기** 때문이다.
 */
export function broadFixture(): PageDocument {
  nextId = 0
  return {
    version: 6,
    root: {
      id: id(),
      type: 'Page',
      children: [
        {
          id: id(),
          type: 'Section',
          variant: 'hero',
          children: [
            { id: id(), type: 'Text', props: { content: '회원 <목록> & "관리"', role: 'h2' } },
            { id: id(), type: 'Text', props: { content: '본문 텍스트' } },
            { id: id(), type: 'Divider', props: { direction: 'vertical' } },
            { id: id(), type: 'Media', props: { caption: '스크린샷', kind: 'chart' } },
            { id: id(), type: 'Placeholder', props: { label: '미정', height: 200 } },
          ],
        },
        {
          id: id(),
          type: 'Flex',
          props: { direction: 'column', wrap: true },
          children: [
            { id: id(), type: 'Button', variant: 'primary', props: { label: '저장', loading: true } },
            { id: id(), type: 'Button', variant: 'danger', props: { label: '삭제', disabled: true } },
            { id: id(), type: 'Link', variant: 'muted', props: { label: '도움말', disabled: true } },
          ],
        },
        {
          id: id(),
          type: 'Grid',
          props: { columns: 3 },
          children: [
            {
              id: id(),
              type: 'Card',
              props: { title: '요약', subtitle: '부제' },
              children: [{ id: id(), type: 'KeyValue', props: { columns: 2 } }],
              zones: { headEnd: [{ id: id(), type: 'Button', props: { label: '수정' } }] },
            },
            {
              id: id(),
              type: 'Tabs',
              props: { active: 1 },
              children: [
                { id: id(), type: 'TabPanel', props: { label: '개요' } },
                {
                  id: id(),
                  type: 'TabPanel',
                  props: { label: '상세' },
                  // 펼친 항목 · 접힌 항목 · 맨 위 잎 — 중첩 목록과 접힌 자식을 안 그리는 갈래가 번들에 다 든다.
                  children: [
                    {
                      id: id(),
                      type: 'Tree',
                      props: {
                        selected: true,
                        items: [
                          { label: '회원', open: true, children: [{ label: '목록' }, { label: '휴면', children: [{ label: '해제' }] }] },
                          { label: '통계' },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: id(),
          type: 'SearchForm',
          children: [
            {
              id: id(),
              type: 'Field',
              props: { required: true, label: '등급' },
              children: [{ id: id(), type: 'Select', props: { invalid: true } }],
            },
          ],
          zones: {
            actions: [
              { id: id(), type: 'Button', props: { label: '초기화' } },
              { id: id(), type: 'Button', props: { label: '검색' } },
            ],
          },
        },
        {
          id: id(),
          type: 'EntryForm',
          props: { title: '등록' },
          // 폼 표 — 2열 · 끝 빈 쌍 · 전폭(몫 2) · 머리줄(제목 + 머리 오른쪽).
          children: [
            {
              id: id(),
              type: 'FormTable',
              props: { title: '기본 정보', columns: 2 },
              zones: { headEnd: [{ id: id(), type: 'Button', props: { label: '이력' } }] },
              children: [
                {
                  id: id(),
                  type: 'Field',
                  props: { label: '동의' },
                  children: [{ id: id(), type: 'CheckboxGroup', props: { disabled: true, options: [{ label: '동의', selected: true }] } }],
                },
                // 값 칸의 조각 — 기간(날짜 ~ 날짜) · 시간 · 세그먼트 · 몫을 준 입력 · 칩 · 여러 줄.
                {
                  id: id(),
                  type: 'Field',
                  props: { label: '기간', required: true },
                  children: [
                    { id: id(), type: 'DateInput', props: { value: '2026-10-01' } },
                    { id: id(), type: 'Affix', props: { text: '~', tone: 'muted' } },
                    { id: id(), type: 'DateInput', props: { readonly: true } },
                    { id: id(), type: 'TimeInput', props: { invalid: true } },
                  ],
                },
                {
                  id: id(),
                  type: 'Field',
                  props: { label: '기준' },
                  children: [
                    { id: id(), type: 'RadioGroup', props: { options: [{ label: 'Y', selected: true }, { label: 'N' }] } },
                    { id: id(), type: 'Input', weight: 1, props: { kind: 'number', size: 'short', value: '80' } },
                    // 공통코드에 묶인 노드 — 표(`FIXTURE_CODES`)를 주면 «설문 응답», 안 주면 대체 글 «설문»으로 선다.
                    { id: id(), type: 'Chip', props: { label: '설문' }, code: { group: 'MEMBER_KIND', item: 'SURVEY' } },
                  ],
                },
                {
                  id: id(),
                  type: 'Field',
                  weight: 2,
                  props: { label: '소개' },
                  children: [{ id: id(), type: 'TextArea', props: { rows: 4 } }],
                },
                {
                  id: id(),
                  type: 'Field',
                  weight: 2,
                  props: { label: '첨부' },
                  children: [
                    {
                      id: id(),
                      type: 'FileAttach',
                      props: {
                        files: [
                          { name: '통장사본.pdf', size: '2.1 MB' },
                          { name: '사업자등록증.png', size: '340 KB' },
                        ],
                        maxFiles: 5,
                      },
                      zones: { actions: [{ id: id(), type: 'Button', props: { label: '파일추가' } }] },
                    },
                  ],
                },
              ],
            },
          ],
          zones: { actions: [{ id: id(), type: 'Button', props: { label: '저장' } }] },
        },
        {
          id: id(),
          type: 'DataGrid',
          variant: 'compact',
          props: { select: 'check', fixedColumns: 1 },
          // 열 묶음 · 번호 열 · 셀 틀 · 되풀이 행 · 제 칸 합계 줄 · 생략 띠 · 바닥 페이지네이션 — 그리드 부품 여섯을 다 쓴다.
          children: [
            { id: id(), type: 'GridColumn', props: { label: 'No', numbering: 'desc', align: 'center' } },
            {
              id: id(),
              type: 'GridColumnGroup',
              props: { label: '회원' },
              children: [
                {
                  id: id(),
                  type: 'GridColumn',
                  props: { label: '이름' },
                  children: [{ id: id(), type: 'Text', props: { content: '홍길동' } }],
                },
                { id: id(), type: 'GridColumn', props: { label: '등급', sort: 'asc' }, children: [{ id: id(), type: 'Chip' }] },
              ],
            },
          ],
          zones: {
            headStart: [{ id: id(), type: 'Text', props: { content: '총 3건' } }],
            rows: [
              { id: id(), type: 'GridRow', props: { repeat: 2 } },
              { id: id(), type: 'GridRow', props: { kind: 'gap' } },
              {
                id: id(),
                type: 'GridRow',
                props: { kind: 'total' },
                children: [
                  { id: id(), type: 'GridCell', props: { span: 2 }, children: [{ id: id(), type: 'Text', props: { content: '합계' } }] },
                  { id: id(), type: 'GridCell' },
                ],
              },
            ],
            footer: [{ id: id(), type: 'Pagination', props: { total: 3 } }],
          },
        },
      ],
    },
  }
}

/**
 * **상태 보임이 든 문서.** 상태를 안 고른 그리기는 관리자에서만 보이는 노드를 DOM 에서 뺀다 — 화면과 번들이 그 판에서도 같은 DOM 을 내는지
 * 잰다.
 */
export function stateFixture(): PageDocument {
  nextId = 3000
  return {
    version: 6,
    viewStates: [{ id: 's_admin', name: '관리자' }],
    root: {
      id: id(),
      type: 'Page',
      children: [
        { id: id(), type: 'Button', props: { label: '보기' }, visibility: { mode: 'except', states: ['s_admin'] } },
        { id: id(), type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin'] } },
      ],
    },
  }
}

/** **팝업 페이지** — 팝업 레이아웃(`layout: 'popup'`)이고 뿌리가 그 짝 `Popup` 이며 몸통 · «바닥» 구역을 든다. «취소» 는 «팝업 닫기» 를 든다. */
export function popupFixture(): PageDocument {
  nextId = 4000
  return {
    version: 7,
    layout: 'popup',
    root: {
      id: id(),
      type: 'Popup',
      props: { title: '사용자 검색', size: 'small' },
      children: [{ id: id(), type: 'Text', props: { content: '이름으로 찾는다' } }],
      zones: {
        footer: [
          { id: id(), type: 'Button', props: { label: '취소' }, interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] },
          { id: id(), type: 'Button', props: { label: '선택' } },
        ],
      },
    },
  }
}

/** **서브페이지 장** — 서브페이지 레이아웃(`layout: 'subpage'`)의 화면. 틀(GNB · LNB · 브레드크럼브 · 제목)은 테마의 레이아웃 뷰가 그린다. */
export function subpageFixture(): PageDocument {
  nextId = 5000
  return {
    version: 7,
    layout: 'subpage',
    root: {
      id: id(),
      type: 'Page',
      children: [
        { id: id(), type: 'Text', props: { content: '회원을 찾는다' } },
        { id: id(), type: 'Button', props: { label: '검색' } },
      ],
    },
  }
}

/** «넓은 표본» 의 묶인 칩이 가리키는 표 — 그룹 하나 · 사용 항목 하나 · 사용 안 함 항목 하나. */
export const FIXTURE_CODES: CodeTable = [
  {
    key: 'MEMBER_KIND',
    name: '회원 구분',
    items: [
      { value: 'SURVEY', name: '설문 응답', active: true },
      { value: 'OLD', name: '휴면', active: false },
    ],
  },
]

/** 노드 하나를 `Page` 아래에 둔 문서. */
export function pageWith(node: WbNode): PageDocument {
  return { version: 6, root: { id: 'n_page', type: 'Page', children: [node] } }
}

/** 글 하나 — 작은 표본. */
export const SAMPLE_PAGE: PageDocument = pageWith({ id: 'n_text', type: 'Text', props: { content: '회원 목록' } })

/**
 * **폴백 상자를 그리게 하는 문서.** 렌더러가 노드를 못 그리는 갈래 넷을 한 문서에 담는다 —
 * 알 수 없는 타입 · props 검증 실패 · 노드가 객체가 아님 · `id`가 문자열이 아님.
 *
 * **유효한 페이지가 아니다**(그것이 요점이다). 번들이 폴백이 든 HTML을 내는 것은 실재하는
 * 상태이고(카탈로그가 늦게 바뀐 문서·낙관적 패치가 지나간 문서), **그 상자에는 인라인
 * `style`이 단축 속성(`font`)까지 실려 있어** 갈림 ㉠이 가장 세게 나타나는 자리다.
 */
export function brokenFixture(): PageDocument {
  nextId = 2000
  return {
    version: 1,
    root: {
      id: id(),
      type: 'Page',
      children: [
        { id: id(), type: '없는타입' },
        { id: id(), type: 'DataGrid', props: { 없는프롭: 1 } },
        null as unknown as WbNode,
        { id: 7 as unknown as string, type: 'Text' },
      ],
    },
  }
}

/* ------------------------------------------------------------------ 테마 */

/** 아무것도 선언하지 않은 manifest. 케이스가 뷰만 바꿔 테마를 짓는다. */
export const EMPTY_MANIFEST: ThemeManifest = {
  id: 'test',
  name: 'test',
  version: '0.0.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
}

/**
 * **기본 뷰와 다른 DOM 을 내는 테마.** 견주기가 *"테마를 넘겼다"*를 재려면 넘긴 테마가 그림을 바꿔야 한다 — 기본 뷰만 든 테마로
 * 재면 테마를 안 넘기는 변조가 같은 DOM 을 내 살아남는다.
 *
 * - `Button` · `Card` 는 테마 뷰다(태그 · 클래스가 기본 뷰와 다르다).
 * - `Section` 은 variant 를 선언한다 — 선언 밖의 variant 는 `defaultVariant` 로 그려진다(`broadFixture` 의 `hero` 는 선언 안,
 *   variant 없는 노드는 `plain`).
 */
export function markedTheme(): ThemeDefinition {
  return defineTheme({
    manifest: {
      ...EMPTY_MANIFEST,
      id: 'marked',
      components: {
        Section: {
          variants: [
            { id: 'plain', label: '평범' },
            { id: 'hero', label: '히어로' },
          ],
          defaultVariant: 'plain',
        },
      },
    },
    views: {
      Button: view(({ props }) => createElement(Root, { as: 'button', className: 'marked' }, String(props.label ?? ''))),
      Card: view(({ props, children }) =>
        createElement(Root, { as: 'section', className: 'marked' }, createElement('h3', null, String(props.title ?? '')), children),
      ),
    },
  })
}

/* ------------------------------------------------------------------ 세는 자 */

/**
 * 문서가 실제로 쓰는 컴포넌트 타입 — 몸통과 구역 전부를 돈다. 카탈로그를 안 보고 `zones` 의 배열을 다 걷는다 — 구역 안에 둔 카탈로그 밖 타입(오타)도
 * 세어야 «카탈로그 밖의 타입» 케이스가 그것을 잡는다.
 */
export function typesIn(document_: PageDocument): string[] {
  const seen = new Set<string>()
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const { type, children, zones } = node as { type?: unknown; children?: unknown; zones?: unknown }
    if (typeof type === 'string') seen.add(type)
    if (Array.isArray(children)) children.forEach(walk)
    if (zones !== null && typeof zones === 'object') for (const list of Object.values(zones)) if (Array.isArray(list)) list.forEach(walk)
  }
  walk(document_.root)
  return [...seen].sort()
}
