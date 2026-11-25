/**
 * **읽는 명령 셋이 함께 쓰는 스냅샷 픽스처 하나.**
 *
 * `page get`·`lint`·`export`가 전부 `GET .../snapshot`을 지나므로 픽스처가 셋으로 갈리면
 * *"어느 하네스에서 잰 값인가"*가 매번 물음이 된다(`fake-io.ts`가 같은 이유로 하나다).
 *
 * **하나짜리로 재지 않는다.** 메뉴 둘·깊이 둘·페이지 셋이고 서로 다른 메뉴에 **같은 제목**이
 * 하나 있다 — 조상을 안 붙이는 조립은 그 자리에서 드러난다.
 *
 * **id가 uuid인 것이 요점이다.** `fetchSnapshot`이 `SnapshotPayloadSchema`로 검사하므로
 * (*"타입만 올리면 서버는 검사하고 CLI는 안 하는 상태가 된다"*) 아무 문자열이나 쓰면
 * 명령이 서기 전에 규격에서 죽는다.
 */
import type { SnapshotPayload } from '@wirebound/themes'

export const MENU_ADMIN = '10000000-0000-4000-8000-000000000001'
export const MENU_MEMBER = '10000000-0000-4000-8000-000000000002'
export const MENU_MARKETING = '10000000-0000-4000-8000-000000000003'

export const PAGE_LIST = '20000000-0000-4000-8000-000000000001'
export const PAGE_DETAIL = '20000000-0000-4000-8000-000000000002'
export const PAGE_LANDING = '20000000-0000-4000-8000-000000000003'

const COMMENT = '50000000-0000-4000-8000-000000000001'
const AUTHOR = '60000000-0000-4000-8000-000000000001'

/**
 * `관리자/회원/목록` 문서. **상호작용과 코멘트가 붙어 있다** — `page get`이 낼 셋 중
 * 둘이 여기서 온다.
 */
function 목록문서(): unknown {
  return {
    version: 5,
    root: {
      id: 'root',
      type: 'Page',
      children: [
        {
          id: 'btn',
          type: 'Button',
          marker: 1,
          props: { label: '검색' },
          interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'list', prop: 'loading', value: true }] }],
        },
        { id: 'list', type: 'DataGrid', marker: 2, props: {}, children: [{ id: 'list-col', type: 'GridColumn' }] },
      ],
    },
  }
}

function 빈문서(): unknown {
  return { version: 5, root: { id: 'root', type: 'Page', children: [] } }
}

/**
 * 트리:
 * ```
 * 관리자        (MENU_ADMIN)
 *   회원        (MENU_MEMBER)
 *     목록      (PAGE_LIST)
 *     상세      (PAGE_DETAIL)
 * 마케팅        (MENU_MARKETING)
 *   랜딩        (PAGE_LANDING)
 * ```
 */
export function snapshotPayload(over: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    payloadVersion: 3,
    capturedAt: '2026-08-16T00:00:00.000Z',
    menu: [
      { id: MENU_ADMIN, parentId: null, title: '관리자', sortOrder: 0 },
      { id: MENU_MEMBER, parentId: MENU_ADMIN, title: '회원', sortOrder: 0 },
      { id: MENU_MARKETING, parentId: null, title: '마케팅', sortOrder: 1 },
    ],
    pages: [
      page(PAGE_LIST, MENU_MEMBER, '목록', 0, 목록문서(), '회원 목록 화면'),
      page(PAGE_DETAIL, MENU_MEMBER, '상세', 1, 빈문서(), null),
      page(PAGE_LANDING, MENU_MARKETING, '랜딩', 0, 빈문서(), null),
    ],
    comments: [
      {
        id: COMMENT,
        pageId: PAGE_LIST,
        nodeId: 'list',
        body: '정렬 기준을 정해야 합니다',
        authorId: AUTHOR,
        authorName: '장병현',
        createdAt: '2026-08-16T01:00:00.000Z',
        updatedAt: '2026-08-16T01:00:00.000Z',
      },
    ],
    theme: { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#123456' } },
    ...over,
  }
}

export function page(
  id: string,
  menuNodeId: string,
  title: string,
  sortOrder: number,
  schema: unknown,
  description: string | null,
): SnapshotPayload['pages'][number] {
  return { id, menuNodeId, title, sortOrder, description, schemaVersion: 4, schema: schema as never, headSeq: 0 }
}

/**
 * 코멘트 없는 `DataGrid`가 든 페이지 하나를 더한다 — 규칙 ①이 `warning`을 낸다.
 *
 * **`packages/mcp`도 이것을 본다**(`@wirebound/cli/test-support`). `wireb lint`와 설계서 「MCP 도구」의
 * `validate`가 같은 함수를 부르므로 **같은 입력에 같은 값**이 나와야 하고, 픽스처가 두 벌이면
 * 그 대조가 *"어느 하네스에서 잰 값인가"*로 미끄러진다.
 */
export function 경고가_있는_프로젝트(): SnapshotPayload {
  const payload = snapshotPayload()
  payload.pages.push(
    page(
      '20000000-0000-4000-8000-000000000009',
      MENU_MEMBER,
      '경고',
      9,
      {
        version: 5,
        root: {
          id: 'root',
          type: 'Page',
          children: [{ id: 'lonely', type: 'DataGrid', children: [{ id: 'lonely-col', type: 'GridColumn' }] }],
        },
      },
      null,
    ),
  )
  return payload
}

/**
 * **화면 상태가 있는 페이지 하나**(«상태», 경로 `관리자/회원/상태`)를 더한다 — 상태 «관리자» · «비로그인», 보임을 든 단추 둘(«보기»는
 * `except [관리자]` · «승인»은 `only [관리자]` — 승인은 제목을 숨기는 상호작용을 든다). 비로그인을 가리키는 보임이 없어 lint 가
 * `view-state-unused`(info) 하나를 낸다 — 결함(`error` · `warning`)은 없다.
 *
 * `packages/mcp` 도 이것을 본다 — `get_page` 의 상태 필드 · `validate` 의 `infos`.
 */
export function 상태가_있는_프로젝트(): SnapshotPayload {
  const payload = snapshotPayload()
  payload.pages.push(
    page(
      '20000000-0000-4000-8000-00000000000a',
      MENU_MEMBER,
      '상태',
      10,
      {
        version: 5,
        viewStates: [
          { id: 's_admin', name: '관리자' },
          { id: 's_guest', name: '비로그인' },
        ],
        root: {
          id: 'st_root',
          type: 'Page',
          children: [
            { id: 'st_title', type: 'Text', props: { content: '회원' } },
            { id: 'st_view', type: 'Button', props: { label: '보기' }, visibility: { mode: 'except', states: ['s_admin'] } },
            {
              id: 'st_approve',
              type: 'Button',
              props: { label: '승인' },
              visibility: { mode: 'only', states: ['s_admin'] },
              interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'st_title', value: false }] }],
            },
          ],
        },
      },
      null,
    ),
  )
  return payload
}

/** 봉투가 깨진 문서 하나 — `document-invalid`가 `error`다. */
export function 오류가_있는_프로젝트(): SnapshotPayload {
  const payload = snapshotPayload()
  payload.pages.push(
    page(
      '20000000-0000-4000-8000-00000000000e',
      MENU_MEMBER,
      '오류',
      8,
      {
        version: 5,
        root: { id: 'bad', type: '없는컴포넌트' },
      },
      null,
    ),
  )
  return payload
}

/**
 * `GET .../theme` 의 응답(`apps/api`의 `routes/project-theme.ts`). 기본 manifest 는 `components` 를 선언하지 않는다 — 테마 규칙
 * (`theme-variant`)이 아무것도 안 낸다. `components` 를 주면 그 선언으로 돈다.
 *
 * `packages/mcp` 도 이것을 본다(`@wirebound/cli/test-support`) — `wireb lint` 와 `validate` 가 같은 입력을 받아야 한다.
 */
export function projectThemeResponse(components?: Record<string, unknown>): Record<string, unknown> {
  return {
    themeId: 'system-admin',
    version: '0.1.0',
    tokens: {},
    rev: 0,
    manifest: {
      id: 'system-admin',
      name: '관리자',
      version: '0.1.0',
      sdk: '^1.0.0',
      tokens: { items: {} },
      ...(components === undefined ? {} : { components }),
    },
    latest: '0.1.0',
  }
}

/** 이름만 다른 `DataGrid`(variant `grid`)가 든 페이지 하나를 더한다 — `table` · `cards` 를 선언한 테마에서 `theme-variant` 가 난다. */
export function 테마에_없는_variant_프로젝트(): SnapshotPayload {
  const payload = snapshotPayload()
  payload.pages.push(
    page(
      '20000000-0000-4000-8000-00000000000a',
      MENU_MEMBER,
      '그리드',
      10,
      {
        version: 5,
        root: { id: 'root', type: 'Page', children: [{ id: 'grid-list', type: 'DataGrid', variant: 'grid' }] },
      },
      null,
    ),
  )
  return payload
}

/** `DataGrid` 에 `table` · `cards` 를 선언한 테마. */
export const LIST_VARIANTS = {
  DataGrid: {
    variants: [
      { id: 'table', label: '테이블' },
      { id: 'cards', label: '카드' },
    ],
    defaultVariant: 'table',
  },
}
