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

export const LAYOUT = '30000000-0000-4000-8000-000000000001'
const COMMENT = '50000000-0000-4000-8000-000000000001'
const AUTHOR = '60000000-0000-4000-8000-000000000001'

/**
 * `관리자/회원/목록` 문서. **상호작용과 코멘트가 붙어 있다** — `page get`이 낼 셋 중
 * 둘이 여기서 온다.
 */
function 목록문서(): unknown {
  return {
    version: 1,
    root: {
      id: 'root',
      type: 'Page',
      children: [
        {
          id: 'btn',
          type: 'Button',
          marker: 1,
          props: { label: '검색' },
          interactions: [
            { on: 'click', actions: [{ type: 'setProp', target: 'list', prop: 'loading', value: true }] },
          ],
        },
        { id: 'list', type: 'List', marker: 2, props: {} },
      ],
    },
  }
}

function 빈문서(): unknown {
  return { version: 1, root: { id: 'root', type: 'Page', children: [] } }
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
    payloadVersion: 2,
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
    layouts: [{ id: LAYOUT, name: '기본', schema: 빈문서() as never }],
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
  return { id, menuNodeId, title, sortOrder, description, schemaVersion: 1, schema: schema as never, headSeq: 0 }
}

/**
 * 코멘트 없는 `List`가 든 페이지 하나를 더한다 — 규칙 ①이 `warning`을 낸다.
 *
 * **`packages/mcp`도 이것을 본다**(`@wirebound/cli/test-support`). `wireb lint`와 설계서 「MCP 도구」의
 * `validate`가 같은 함수를 부르므로 **같은 입력에 같은 값**이 나와야 하고, 픽스처가 두 벌이면
 * 그 대조가 *"어느 하네스에서 잰 값인가"*로 미끄러진다.
 */
export function 경고가_있는_프로젝트(): SnapshotPayload {
  const payload = snapshotPayload()
  payload.pages.push(
    page('20000000-0000-4000-8000-000000000009', MENU_MEMBER, '경고', 9, {
      version: 1,
      root: { id: 'root', type: 'Page', children: [{ id: 'lonely', type: 'List' }] },
    }, null),
  )
  return payload
}

/** 봉투가 깨진 문서 하나 — `document-invalid`가 `error`다. */
export function 오류가_있는_프로젝트(): SnapshotPayload {
  const payload = snapshotPayload()
  payload.pages.push(
    page('20000000-0000-4000-8000-00000000000e', MENU_MEMBER, '오류', 8, {
      version: 1,
      root: { id: 'bad', type: '없는컴포넌트' },
    }, null),
  )
  return payload
}
