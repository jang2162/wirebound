/**
 * **viewer 는 에디터 어디서도 쓰기를 내지 않는다**(설계서 「권한 모델」 — *"조회 전용 — 편집·코멘트 모두 불가"*).
 *
 * 이 파일은 훑기 도구만 갖는다 — 케이스는 `viewer-readonly-reach` · `-viewer` · `-demoted` · `-restored` 네 파일이 하나씩 갖는다. 훑기 한 번이 무거워 한 파일에 몰면 web 프로젝트의 벽시계가 그 파일 하나에 묶이므로 파일마다 한 케이스로 갈랐다.
 *
 * ## 무엇을 재는가 — 쓰기 **요청**이다, 버튼의 글자가 아니다
 *
 * 에디터를 viewer 로 그리고 **닿는 컨트롤을 전부 누르고 · 고르고 · 치고 · 제출하고, 키보드 단축키를 보낸 뒤**
 * 네트워크로 나간 쓰기를 센다. 버튼 이름 목록으로 재지 않는 것은 CLAUDE.md 의 «원문으로 재는 자는 뚫린다» 그대로다 —
 * 새 입구가 생기면 그것이 무엇이라 불리든 누르면 요청이 나가고, 그 요청을 여기서 센다.
 *
 * - **HTTP** — 진짜 `createHttpClient`에 가짜 `fetch`를 문다. **`GET` 이 아닌 요청은 전부 쓰기**로 적고 서버처럼
 *   403 으로 답한다. 메서드 이름 표로 가르지 않으므로 `ApiClient`에 쓰기가 늘어도 이 자가 따로 안 낡는다.
 *   **`/api/me/` 아래의 쓰기(개인 모듈)는 따로 적는다**(`personal`) — 설계서가 아니라 그 사람의 데이터라 viewer 도 낸다(설계 spec
 *   `2026-10-20-personal-modules-design.md` «사용자가 정한 것» 6). 경로 머리로 가르므로 `/api/me/` 밖의 새 쓰기는 그대로 `http` 에 든다.
 * - **WS** — 가짜 소켓이 보낸 프레임을 적는다. **`ping` 이 아닌 프레임은 전부 쓰기**다(`patch` · `lock` · `unlock` —
 *   서버가 셋 다 editor 게이트로 받는다: `apps/api/src/ws/protocol.ts`의 `MIN_ROLE_FOR_FRAME`).
 *
 * **대조가 이 자의 구분력이다.** 같은 훑기를 editor 로 돌리면 쓰기가 **입구마다** 나와야 한다(아래 `REACH` · `viewer-readonly-reach.test.tsx`). 그것이
 * 안 나오면 훑기가 그 입구에 닿지 못한 것이고, 그때 viewer 의 0 은 아무것도 말하지 않는다. 칸은 **요청의 모양**으로 가른다 —
 * 메서드 · 경로 · 본문의 키. 경로 하나를 한 칸으로 보면 한 경로에 선 입구 여럿 중 하나만 닿아도 칸이 산다
 * (`PATCH pages/:id`는 설명 저장 · 순서 옮기기가 함께 쓰고, `…/comments`는 달기 · 수정 · 삭제 · 재번호가 함께 쓴다).
 *
 * **대조가 입구 하나를 따로 증언하지 못하는 곳**(칸이 없거나 둘이 서로를 덮는다):
 *
 * - **구조 줄 행동 ↔ 구조 단축키** — 둘 다 `patch structure`를 낸다. 한쪽만 꺼도 칸이 산다. 가르지 않는다 —
 *   viewer 에게 **단축키** 축은 `viewer-readonly-viewer.test.tsx` 의 viewer 케이스가 소유하고(단축키 가드를 지운 변조가 여기서만 죽는다),
 *   **줄 행동**은 `viewer-entries.test.tsx`의 «구조 트리»가 소유한다(줄 행동째 없다).
 * - **메뉴 트리 단축키 ↔ 메뉴 줄 행동** — 둘 다 `menu` 경로로 쓴다. 한쪽만 꺼도 «메뉴 트리» 칸이 산다(editor 대조는 둘 다 닿는다 —
 *   단축키 쪽은 `handleKeyDown`에 탐침을 심어 센다). viewer 에게 **단축키** 축은 `viewer-readonly-viewer.test.tsx` 의 viewer 케이스가 소유한다.
 * - **페이지 이름 변경 · 페이지 추가** — editor 훑기가 **못 닿는다**(칸이 없다). 둘 다 줄 행동이 여는 «이름» 칸인데 그 칸은
 *   하나가 용도만 바꿔 서서(`menu-tree.tsx`의 `RowPanel` · `TreeInput`) 아래 `keyOf`로는 한 칸이다 — 처음 연 용도만
 *   친다(줄 행동으로 옮긴 뒤 어느 용도가 처음인지는 다시 재지 않았다 — 칸이 없는 것은 그대로다).
 *   viewer 에게 그 둘이 없다는 것은 `viewer-entries.test.tsx`의 «메뉴 트리»(줄 행동째 없다)가 소유한다.
 *
 * ## 사각 — 이 자가 닿지 못하는 것
 *
 * - **서버가 만들어야 서는 상태**: 409 충돌 화면(«내 글로 덮기»), 남이 쥔 잠금, «모름»·재전송 통지, 복원 통지.
 *   viewer 는 그 상태에 이르는 쓰기를 못 내므로 스스로는 못 닿는다(역할이 바뀐 **뒤** 새로고침 전의 화면은 `viewer-readonly-demoted.test.tsx` 의
 *   «실행 중에 내린 viewer» 케이스가 훑는다).
 * - **새로고침 뒤 되살아나는 칸**은 사각이 **아니다** — `viewer-readonly-restored.test.tsx` 의 케이스(«저장소에 editor 때의 초안 칸 다섯을 둔 채 …»)가
 *   소유한다. 다른 케이스들은 초안 저장소를 안 세워(`renderWithProviders`의 `draftStore` 생략) 저장소에서 되살아나는
 *   상태가 입력 공간 밖이고, 그 틈으로 강등된 사람의 수정 상자가 설 수 있다. 그 케이스는 editor 때 칸 다섯(`RESTORED_SLOTS`)을
 *   **화면으로** 채운 저장소 위에서 viewer 로 다시 연다. **칸 목록은 손으로 적은 것이다** — `slot(…, { save })`를 새로 달면 이 판은 그 칸을 안 채우므로 모른다(죽지도
 *   않는다). 새 칸을 달면 `fillDraftsAsEditor`에 그 칸을 채우는 한 걸음을 더하라.
 * - **끌기 · 포인터 제스처**: 손잡이(`ShellResizer`)는 폭만 바꾸고 저장소는 브라우저다. 뷰 모드 캔버스의 시연 제스처는
 *   문서를 안 바꾼다. 둘 다 누르기만 하고 끌지는 않는다.
 * - **에디터 밖으로 나가는 길**: 로고(«프로젝트 목록») · `…` 의 설정 링크는 따라가지 않는다
 *   (제 판정이 있다 — `projectAbilities`의 `rename`). 내려받기 버튼은 누른다 — `GET`이라 쓰기가 아니다. **로그아웃**(`POST /auth/logout`)은 누르지 않는다 —
 *   세션 쓰기지 설계서 쓰기가 아니고, 누르면 훑기가 끝난다.
 * - **고르는 상태는 다섯뿐**: 선택 없음 · 루트 · 자식 · 손자 · 메뉴(아래 `SELECTIONS`) × 두 모드. 그 밖의 노드 종류가
 *   여는 속성 위젯은 이 문서에 든 종류만큼이다.
 * - **키**: 아래 `KEYS` × `MODIFIERS` 만 보낸다. 그리고 한 `onKeyDown` 묶음마다 대표 대상 **하나와** 값을 치는 칸 하나에만
 *   보낸다 — 핸들러가 `event.target`의 **종류**만 본다는 전제다(`panels/typing-surface.ts`). 같은 묶음 안에서 대상의
 *   정체를 보는 핸들러가 생기면 이 전제가 깨진다. **대표는 문서 순서의 첫 원소라 DOM 구성에 따라 바뀐다** —
 *   메뉴 트리 묶음 안에 입력 칸이 서면(그 칸은 `isTypingSurface`가 단축키 앞에서 돌려보낸다) 그 칸이 대표가 되어 그 묶음의 키 축이
 *   **조용히** 빠진다. 가져오기 대화 상자가 그 묶음 **밖**에 서는 것(`panels/page-import-dialog.tsx` 머리말)도 그 축을 지킨다.
 *   다시 재는 법: `menu-tree.tsx`의 `handleKeyDown`에서 `SHORTCUTS.find` 뒤에 `console.log` 탐침을 심고 editor 대조를 돌려 그 줄을 센다
 *   (0 이면 대표가 바뀐 것이다). 대조는 그것을 증명하지 못한다 — 대표 고르기를 새로 짓지는 않는다(자를 한 판 더 짓는 거래다).
 * - **jsdom 값이다.** 포커스 · blur 순서는 실브라우저와 갈린다(CLAUDE.md) — 실브라우저 값은 이 파일이 갖지 않는다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect } from 'vitest'
import { CURRENT_DOCUMENT_VERSION, pageJsonText, toPageJson, type PageDocument } from '@wirebound/schema'
import { App } from '../../src/app'
import { createHttpClient } from '../../src/api/http-client'
import type { Comment, PageDetail, ProjectRole, SessionUser, SnapshotSummary, TreeMenuNode } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import { DRAFT_KEY_PREFIX, openDraftStore, type DraftStore } from '../../src/panels/draft-store'
import { clickAsBrowser } from '../click-as-browser'
import { renderWithProviders } from '../helpers'
import { adminThemeView } from '../theme-loader'
import { canvasQuery } from '../editor-harness'

const ME: SessionUser = { id: 'u-1', email: 'carol@example.com', name: '캐럴' }
const PROJECT_ID = 'p-1'
const PAGE_ID = 'pg-1'
const OTHER_PAGE_ID = 'pg-2'
const PROJECT_NAME = '관리자 콘솔 설계서'

/**
 * 속성 · 상호작용 · 코멘트가 **전부 무언가를 그리는** 문서다 — 규칙이 걸린 버튼, 속성이 있는 글, 자식을 담는 섹션.
 * 빈 문서면 패널이 «없습니다»만 그려 입구가 안 선다.
 */
const DOC: PageDocument = {
  version: CURRENT_DOCUMENT_VERSION,
  root: {
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-card', type: 'Card', props: { title: '회원 정보' }, marker: 1 },
      {
        id: 'n-section',
        type: 'Section',
        children: [{ id: 'n-field', type: 'Field', props: { label: '이름', control: 'select', required: true } }],
      },
      {
        id: 'n-btn',
        type: 'Button',
        props: { label: '검색' },
        marker: 2,
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-card', value: false }] }],
      },
    ],
  },
}

const TREE: TreeMenuNode[] = [
  {
    id: 'mn-1',
    title: '회원관리',
    sortOrder: 1,
    pages: [
      { id: PAGE_ID, title: '회원 목록', sortOrder: 1 },
      { id: OTHER_PAGE_ID, title: '회원 상세', sortOrder: 2 },
    ],
    children: [{ id: 'mn-2', title: '등급', sortOrder: 1, pages: [], children: [] }],
  },
]

/** **하나는 내가 쓴 코멘트다** — 작성자에게만 서는 «수정»이 역할을 보는지 재려면 viewer 자신의 글이 있어야 한다. */
const COMMENTS: Comment[] = [
  {
    id: 'c-1',
    nodeId: 'n-card',
    body: '카드 문구 확인',
    authorId: ME.id,
    authorName: ME.name,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'c-2',
    nodeId: 'n-btn',
    body: '버튼 위치',
    authorId: 'u-2',
    authorName: '밥',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
]

const SNAPSHOTS: SnapshotSummary[] = [
  { id: 's-1', tag: 'v1', description: null, createdBy: 'u-2', createdByName: '밥', createdAt: '2026-09-01T00:00:00Z', payloadBytes: 10 },
]

function page(pageId: string): PageDetail {
  return {
    id: pageId,
    menuNodeId: 'mn-1',
    title: pageId === PAGE_ID ? '회원 목록' : '회원 상세',
    description: '회원을 찾는 화면',
    sortOrder: 1,
    schemaVersion: DOC.version,
    headSeq: 7,
    schema: DOC,
  }
}

/** 조회 — `GET` 경로(쿼리 제외) → 몸통. 없는 경로는 404 로 답하고 `unrouted`에 적는다. */
function reads(role: ProjectRole): Record<string, unknown> {
  const project = `/api/projects/${PROJECT_ID}`
  return {
    '/api/auth/me': ME,
    [project]: { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin-console', description: null, role, themeRev: 0 },
    [`${project}/tree`]: { menu: TREE, rev: 0 },
    [`${project}/pages/${PAGE_ID}`]: page(PAGE_ID),
    [`${project}/pages/${OTHER_PAGE_ID}`]: page(OTHER_PAGE_ID),
    [`${project}/pages/${PAGE_ID}/revisions`]: [],
    [`${project}/pages/${OTHER_PAGE_ID}/revisions`]: [],
    [`${project}/pages/${PAGE_ID}/comments`]: COMMENTS,
    [`${project}/pages/${OTHER_PAGE_ID}/comments`]: COMMENTS,
    [`${project}/modules`]: { modules: [] },
    // 개인 모듈(`/api/me/modules`) — 하단 판은 넣을 수 없는 판에도 서서 이 목록을 읽는다.
    '/api/me/modules': { modules: [] },
    [`${project}/snapshots`]: SNAPSHOTS,
    // 셸이 읽는 테마 바인딩 — 번들은 시험용 로더가 준다(`helpers.tsx`의 `bundleLoader`).
    [`${project}/theme`]: adminThemeView(),
  }
}

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(private readonly sink: string[]) {}
  send(data: string): void {
    this.sink.push(data)
    // **서버처럼 편집에 답한다** — 403 이다. 답이 없으면 편집 큐가 첫 패치의 답을 기다리며 멈춰(한 번에 하나) 뒤의
    // 편집이 안 나가고, 대조가 속성 한 자리에만 닿는다.
    const frame = JSON.parse(data) as { type: string; pageId?: string; clientOpId?: string }
    if (frame.type !== 'patch') return
    setTimeout(() => {
      this.onmessage?.({
        data: JSON.stringify({
          type: 'patch-error',
          projectId: PROJECT_ID,
          pageId: frame.pageId,
          clientOpId: frame.clientOpId,
          status: 403,
          code: 'forbidden',
          message: '편집 권한이 없습니다',
          issues: [],
        }),
      })
    }, 0)
  }
  close(): void {
    this.onclose?.()
  }
}

/** `GET` 이 아닌 HTTP 요청 하나 — **본문까지** 든다. 대조가 한 경로의 여러 입구를 본문의 키로 가른다(`REACH`). */
interface Write {
  method: string
  path: string
  /** 본문 JSON 의 최상위 키. 본문이 없거나 객체가 아니면 비었다. */
  keys: string[]
}

interface Wire {
  /** `METHOD 경로` — `GET` 이 아닌 HTTP 요청. */
  http: string[]
  /** 같은 요청 — 본문의 모양까지(`Write`). */
  writes: Write[]
  /** `ping` 이 아닌 WS 프레임의 `type`(+ 대상). */
  frames: string[]
  /** 가짜가 모르는 `GET` — 조회가 비어 입구가 안 섰을 수 있다는 신호다. */
  unrouted: string[]
  /** `METHOD 경로` — `/api/me/` 아래의 쓰기(개인 모듈). 프로젝트 쓰기가 아니다(머리말 «HTTP»). */
  personal: string[]
}

/** 본문의 최상위 키 — 요청의 **값**을 읽는다(글자를 훑지 않는다). */
function bodyKeys(body: BodyInit | null | undefined): string[] {
  if (typeof body !== 'string') return []
  try {
    const value: unknown = JSON.parse(body)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value).sort() : []
  } catch {
    return []
  }
}

function mount(role: ProjectRole, draftStore?: DraftStore): Wire {
  const wire: Wire = { http: [], writes: [], frames: [], unrouted: [], personal: [] }
  const table = reads(role)
  const json = (status: number, body: unknown): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.split('?')[0] ?? url
    if (method !== 'GET' && path.startsWith('/api/me/')) {
      wire.personal.push(`${method} ${path}`)
      return json(403, { code: 'forbidden', message: '이 작업을 수행할 권한이 없습니다' })
    }
    if (method !== 'GET') {
      wire.http.push(`${method} ${path}`)
      wire.writes.push({ method, path, keys: bodyKeys(init?.body) })
      return json(403, { code: 'forbidden', message: '이 작업을 수행할 권한이 없습니다' })
    }
    if (path in table) return json(200, table[path])
    // 내보내기 미리보기 — 갈래가 쿼리(`format`)로 갈린다.
    if (path === `/api/projects/${PROJECT_ID}/export/preview`) {
      const format = new URL(url, 'http://localhost').searchParams.get('format')
      const pages = [{ pageId: PAGE_ID, title: '회원 목록', path: '회원관리/회원 목록' }]
      return json(
        200,
        format === 'pptx'
          ? { format, pages, screenless: [], screenFailures: [], fontWarning: null, fileName: 'deck.pptx' }
          : {
              format: 'html',
              pages,
              duplicateTargets: [],
              brokenLinks: [],
              errors: [],
              themeId: null,
              themeWarning: null,
              fileName: 'site.zip',
            },
      )
    }
    // 내려받기 — 파일 그 자체. jsdom 에는 `URL.createObjectURL`이 없어 저장은 거기서 실패하지만 이 자가 세는 것은 쓰기다.
    if (path === `/api/projects/${PROJECT_ID}/export`) {
      return new Response(new Uint8Array([0x50, 0x4b]), { status: 200, headers: { 'content-type': 'application/zip' } })
    }
    wire.unrouted.push(path)
    return json(404, { code: 'not-found', message: '없습니다' })
  }

  const sent: string[] = []
  const sockets: FakeSocket[] = []
  const realtime: RealtimeSetup = {
    holder: createConnectionIdHolder(),
    channel: createEditChannel(),
    lockChannel: createLockChannel(),
    origin: 'http://localhost:5173',
    connection: {
      createSocket: () => {
        const socket = new FakeSocket(sent)
        sockets.push(socket)
        return socket
      },
      schedule: () => 0,
      cancel: () => {},
    },
  }

  renderWithProviders(<App />, {
    client: createHttpClient(fetchImpl),
    route: `/projects/${PROJECT_ID}/pages/${PAGE_ID}`,
    realtime,
    ...(draftStore === undefined ? {} : { draftStore }),
  })

  // 소켓이 열리고 서버가 «붙었다»고 답한 판 — 편집이 WS 로 나갈 수 있는 상태다.
  const open = (): void => {
    const socket = sockets.at(-1)
    if (socket === undefined) return
    act(() => {
      socket.onopen?.()
      socket.onmessage?.({
        data: JSON.stringify({ type: 'joined', projectId: PROJECT_ID, connectionId: 'conn-1', userId: ME.id }),
      })
    })
  }
  Object.defineProperty(wire, 'open', { value: open })
  // **실행 중에 내린다** — 서버가 역할을 viewer 로 바꾸고 그 사람의 연결에 `membership-changed`를 보낸 판.
  const demote = (): void => {
    const socket = sockets.at(-1)
    if (socket === undefined) return
    const key = `/api/projects/${PROJECT_ID}`
    table[key] = { ...(table[key] as object), role: 'viewer' }
    act(() => {
      socket.onmessage?.({ data: JSON.stringify({ type: 'membership-changed', projectId: PROJECT_ID }) })
    })
  }
  Object.defineProperty(wire, 'demote', { value: demote })
  Object.defineProperty(wire, 'frames', {
    get: () =>
      sent
        .map((raw) => JSON.parse(raw) as { type: string; nodeId?: string; ops?: { path?: string }[] })
        .filter((frame) => frame.type !== 'ping')
        .map((frame) => {
          if (frame.nodeId !== undefined) return `${frame.type} ${frame.nodeId}`
          if (frame.type !== 'patch' || !Array.isArray(frame.ops)) return frame.type
          // 패치는 **무엇을 고쳤는지**로 가른다 — 대조가 속성 · 상호작용 · 구조에 각각 닿았는지 보려고.
          const paths = frame.ops.map((op) => op.path ?? '')
          const kind = paths.some((path) => path.includes('/interactions'))
            ? 'interactions'
            : paths.some((path) => /\/props(\/|$)|\/variant$/.test(path))
              ? 'props'
              : 'structure'
          return `patch ${kind}`
        }),
  })
  return wire
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** 누를 수 있는 것 · 값을 받는 것. **꺼진 것은 뺀다** — 실브라우저도 꺼진 컨트롤에 클릭을 안 준다. */
const REACHABLE = [
  'button',
  'a[href]',
  'select',
  'input',
  'textarea',
  'form',
  '[contenteditable="true"]',
  '[role]',
  '[tabindex]',
  '[data-wb-id]',
].join(',')

function isOff(el: Element): boolean {
  return el.closest(':disabled') !== null || el.getAttribute('aria-disabled') === 'true'
}

/** 에디터 **밖**으로 나가는 것 · 세션을 끝내는 것(머리말 «사각»). */
function leaves(el: Element): boolean {
  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute('href') ?? ''
    return !href.startsWith(`/projects/${PROJECT_ID}/pages/`)
  }
  return el.textContent?.trim() === '로그아웃'
}

/** 같은 컨트롤을 두 번 누르지 않으려는 열쇠 — 태그 · 이름 · 조상의 꼴. 다시 그려져도 같은 값이다. */
function keyOf(el: Element): string {
  const chain: string[] = []
  for (let node: Element | null = el; node !== null && node !== document.body; node = node.parentElement) {
    chain.push(`${node.tagName}.${node.getAttribute('class') ?? ''}[${node.getAttribute('aria-label') ?? ''}]`)
  }
  const name = el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.id ?? ''
  const text = el.tagName === 'FORM' || el.getAttribute('role') === 'tabpanel' ? '' : (el.textContent ?? '').slice(0, 40)
  // 라디오 · 체크박스는 값으로 가른다 — 한 무리의 라디오는 이름이 같고 글이 없어(이름은 감싼 `<label>` 이 준다) 값을 안 보면 첫 하나만 눌린다
  // («모듈로 저장…» 의 «저장할 곳»).
  const choice = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') ? el.value : ''
  return `${chain.join('<')}|${name}|${text}|${el.getAttribute('data-wb-id') ?? ''}|${choice}`
}

async function activate(el: Element): Promise<void> {
  if (el instanceof HTMLSelectElement) {
    for (const option of Array.from(el.options)) {
      if (!el.isConnected || isOff(el)) break
      if (option.value === el.value) continue
      fireEvent.change(el, { target: { value: option.value } })
      await settle()
    }
    return
  }
  if (el instanceof HTMLInputElement && el.type === 'file') {
    const text = pageJsonText(toPageJson({ page: { title: '가져온 페이지', description: null }, document: DOC, comments: [] }))
    const file = new File([text], 'page.json', { type: 'application/json' })
    fireEvent.change(el, { target: { files: [file] } })
    await settle()
    return
  }
  if (el instanceof HTMLFormElement) {
    fireEvent.submit(el)
    await settle()
    return
  }
  const typing =
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) || el instanceof HTMLTextAreaElement
  if (typing) {
    act(() => {
      el.focus()
    })
    // 비었으면 글을 넣고, 차 있으면 **공백 하나**만 붙인다 — 붙여 넣은 JSON 을 깨지 않으면서 «바뀜»은 만든다.
    fireEvent.change(el, { target: { value: el.value === '' ? '고침' : `${el.value} ` } })
    fireEvent.keyDown(el, { key: 'Enter', code: 'Enter' })
    act(() => {
      el.blur()
    })
    await settle()
    return
  }
  clickAsBrowser(el)
  await settle()
}

/**
 * 순서. **문서 순서로 앞의 것부터** 누르되, 폼 제출과 페이지 이동은 **남은 것이 없을 때** 한다 — 폼이 제 칸보다 앞에
 * 있어 먼저 제출하면 빈 글을 보내고, 이동은 그 페이지의 입구를 전부 새로 그린다.
 */
function tier(el: Element): number {
  if (el instanceof HTMLFormElement) return 1
  if (el instanceof HTMLAnchorElement) return 2
  return 0
}

/**
 * **대화 상자의 «닫기»는 누르지 않는다**(`shell/shell-dialog.tsx`). 상자가 열린 걸음에 상자 안 컨트롤이 함께 나타나고, 같은 걸음이면 문서
 * 순서로 고르므로 머리의 «닫기»가 몸체보다 먼저 눌려 그 안(스냅샷 폼 · 복원)에 한 번도 못 닿는다. 상자는 키 훑기의 Escape 가 닫는다.
 *
 * **행동 메뉴(머리의 `…` · 트리 제목 줄의 뿌리 `+` · 메뉴 줄의 `+`)는 항목이 다 눌릴 때까지 다시 연다**(`sweepControls`) — 항목 하나를
 * 고르면 목록이 닫혀, 한 번만 열면 뒤 항목(`…`의 «프로젝트 내보내기» · 줄 `+`의 «JSON 에서 가져오기…»)에 영영 못
 * 닿는다. **트리 줄의 `…`는 한 번씩만 연다** — 그 단추가 여는 순간 줄을 골라 선택을 옮기기 때문이다(`sweepControls`의 주석). 그래서 한 줄의
 * `…` 뒤 항목은 이 훑기의 사각이다 — 그 명령(위로 · 삭제 …)은 같은 줄의 다른 판 · 단축키가 닿고, 입구 칸(`REACH`)은 요청의 모양으로 센다.
 *
 * **대화 상자의 «취소»도 누르지 않는다** — «닫기»와 같은 까닭이다(가져오기 상자의 «취소»는 «가져오기»보다 문서 순서가 앞이다).
 */
function closesDialog(el: Element): boolean {
  return (
    el.closest('dialog') !== null && (el.classList.contains('wb-shell-dialog-close') || el.classList.contains('wb-shell-pagejson-cancel'))
  )
}

/** 모드는 바깥 고리(`sweepEditor`)가 정한다 — 훑기가 모드를 바꾸면 그 판의 나머지가 다른 모드를 훑는다. */
function switchesMode(el: Element): boolean {
  return el.closest('[role="group"][aria-label="모드"]') !== null
}

/**
 * 훑기는 문서 하나(`document.body`)를 모든 케이스가 나눠 쓴다 — 시간 초과로 버려진 케이스의 훑기는 멈추지 않고 돌아, 다음 케이스의 훑기와 같은 화면을
 * 동시에 눌러 «800 걸음 안에 끝나지 않았다» · 제목을 못 찾는 연쇄 실패를 낸다. 훑기마다 번호를 받고 새 훑기가 시작되면 앞 것은 걸음마다 멈춘다.
 */
let sweepSerial = 0
function stopIfStale(serial: number): void {
  if (serial !== sweepSerial) throw new Error('훑기가 멈췄다 — 새 훑기가 시작됐다(앞 케이스가 시간 초과로 버려졌다)')
}

/**
 * 닿는 컨트롤을 **하나씩** 누르고, 누를 때마다 다시 찾는다. **가장 늦게 나타난 것부터** 누른다(깊이 우선) — 눌러서
 * 열린 것(탭 본문 · 고르개 · 확인 · 팝오버)이 옆의 다른 입구보다 먼저 닿아야 그것이 닫히거나 바뀌기 전에 훑는다(문서
 * 순서로 누르면 탭 «코멘트»를 누른 뒤 바로 옆 탭 «상호작용»을 눌러 코멘트 본문에 한 번도 못 닿는다). 꺼져 있던 것
 * («저장»)은 켜진 뒤에 닿는다 — 꺼져 있는 동안은 «누른 것»으로 적지 않는다.
 */
async function sweepControls(serial: number): Promise<number> {
  const seen = new Set<string>()
  const appeared = new Map<string, number>()
  /** 행동 메뉴 단추(`aria-haspopup="menu"`)마다 연 목록의 항목 열쇠 — 안 누른 항목이 남았으면 그 단추를 다시 누른다. */
  const menuItems = new Map<string, string[]>()
  const exhausted = (key: string): boolean => (menuItems.get(key) ?? []).every((item) => seen.has(item))
  let pressed = 0
  for (let step = 0; step < 800; step += 1) {
    stopIfStale(serial)
    let pick: { el: Element; key: string; at: number } | undefined
    for (const el of Array.from(document.body.querySelectorAll(REACHABLE))) {
      if (leaves(el) || switchesMode(el) || closesDialog(el)) continue
      const key = keyOf(el)
      if (!appeared.has(key)) appeared.set(key, step)
      // **메뉴 단추는 항목이 다 눌릴 때까지 다시 연다** — 항목 하나를 고르면 목록이 닫혀, 한 번만 열면 뒤 항목(머리 `…`의
      // «프로젝트 내보내기» · 메뉴 줄 `+`의 «JSON 에서 가져오기…»)에 영영 못 닿는다. 열린 동안은 다시 누르지 않는다(누르면 닫힌다).
      // **트리 줄의 `…`는 빼고** — 그 단추도 열 때 그 줄을 골라 선택을 옮기고, 항목(위로 · 삭제 …)은 한 번씩 열린 판과 단축키가 닿는다.
      // 메뉴 줄 `+`는 다시 연다 — 그 항목이 연 입구(이름 칸 · 가져오기 상자)는 그 줄을 대상으로 서므로 선택을 옮겨도 잃는 것이 없고,
      // 셋째 항목(가져오기)이 다른 길로는 안 닿는다(`REACH`의 «페이지 가져오기»).
      const rowMore = el.closest('.wb-shell-tree-row-actions') !== null && (el.getAttribute('aria-label') ?? '').endsWith(' 더 보기')
      const reopen =
        el.getAttribute('aria-haspopup') === 'menu' && el.getAttribute('aria-expanded') !== 'true' && !rowMore && !exhausted(key)
      if (isOff(el) || (seen.has(key) && !reopen)) continue
      const at = appeared.get(key) ?? step
      const better = pick === undefined || tier(el) < tier(pick.el) || (tier(el) === tier(pick.el) && at > pick.at)
      if (better) pick = { el, key, at }
    }
    if (pick === undefined) return pressed
    seen.add(pick.key)
    pressed += 1
    await activate(pick.el)
    if (pick.el.getAttribute('aria-haspopup') === 'menu') {
      const list = document.getElementById(pick.el.getAttribute('aria-controls') ?? '')
      // 누를 수 있는 항목만 센다 — 끈 항목 · 에디터 밖으로 나가는 항목은 훑기가 안 누르므로 세면 단추가 끝없이 다시 열린다.
      if (list !== null) {
        const items = Array.from(list.querySelectorAll(REACHABLE)).filter((item) => !isOff(item) && !leaves(item))
        menuItems.set(pick.key, items.map(keyOf))
      }
    }
  }
  throw new Error('훑기가 800 걸음 안에 끝나지 않았다 — 누를 때마다 새 열쇠가 생기는 컨트롤이 있다')
}

const KEYS = ['Delete', 'Backspace', 'Enter', 'F2', 'Insert', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))
const MODIFIERS: Partial<Record<'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey', boolean>>[] = [
  {},
  { altKey: true },
  { altKey: true, shiftKey: true },
  { ctrlKey: true },
  { metaKey: true },
  { ctrlKey: true, shiftKey: true },
  { metaKey: true, shiftKey: true },
]

/** React 가 그 요소에 단 `onKeyDown`이 있는가 — DOM 에 남는 props 를 읽는다(값으로 잰다). */
function hasKeyHandler(el: Element): boolean {
  const propsKey = Object.keys(el).find((key) => key.startsWith('__reactProps$'))
  if (propsKey === undefined) return false
  const props = (el as unknown as Record<string, Record<string, unknown> | undefined>)[propsKey]
  return typeof props?.['onKeyDown'] === 'function' || typeof props?.['onKeyDownCapture'] === 'function'
}

/** 대상 하나가 지나는 키 핸들러 묶음. 같은 묶음이면 대표 하나에만 보낸다(머리말 «사각»). */
function handlerChain(el: Element): Element[] {
  const chain: Element[] = []
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    if (hasKeyHandler(node)) chain.push(node)
  }
  return chain
}

async function sweepKeys(serial: number): Promise<void> {
  const groups = new Map<string, Element>()
  const ids = new WeakMap<Element, number>()
  let next = 0
  const idOf = (el: Element): number => {
    let id = ids.get(el)
    if (id === undefined) {
      id = next += 1
      ids.set(el, id)
    }
    return id
  }
  const candidates = [document.body, ...Array.from(document.body.querySelectorAll(REACHABLE))]
  for (const el of candidates) {
    if (isOff(el) || leaves(el)) continue
    const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    const signature = `${typing ? 'typing' : 'plain'}:${handlerChain(el).map(idOf).join(',')}`
    if (!groups.has(signature)) groups.set(signature, el)
  }
  for (const target of groups.values()) {
    for (const modifiers of MODIFIERS) {
      stopIfStale(serial)
      for (const key of KEYS) {
        if (!target.isConnected) break
        fireEvent.keyDown(target, { key, code: key === ' ' ? 'Space' : key, ...modifiers })
      }
      for (const letter of LETTERS) {
        if (!target.isConnected) break
        fireEvent.keyDown(target, { key: letter.toLowerCase(), code: `Key${letter}`, ...modifiers })
      }
      await settle()
    }
  }
}

/** 훑기 전에 세우는 선택 — 선택마다 서는 입구가 다르다(속성 위젯 · 코멘트 폼 · 구조 트리의 고른 줄 · 메뉴 트리의 고른 줄). */
const SELECTIONS: { name: string; pick: () => void }[] = [
  { name: '선택 없음', pick: () => {} },
  { name: '루트', pick: () => clickNode('n-root') },
  { name: '자식', pick: () => clickNode('n-btn') },
  { name: '손자', pick: () => clickNode('n-field') },
  {
    name: '메뉴',
    pick: () => {
      const menu = screen.queryAllByRole('button', { name: '등급' })[0]
      if (menu !== undefined) clickAsBrowser(menu)
    },
  },
]

function clickNode(nodeId: string): void {
  const el = canvasQuery(`[data-wb-id="${nodeId}"]`)
  if (el !== null) fireEvent.click(el)
}

async function toMode(mode: '편집 모드' | '뷰 모드'): Promise<void> {
  const button = screen.getByRole('button', { name: mode })
  clickAsBrowser(button)
  await settle()
}

/** 두 모드 × 다섯 선택 — 판마다 다시 열어 앞 판이 연 것이 뒤 판을 가리지 않게 한다. */
async function opened(wire: Wire): Promise<void> {
  await screen.findByRole('heading', { name: PROJECT_NAME })
  await waitFor(() => expect(canvasQuery('[data-wb-id="n-root"]')).not.toBeNull())
  ;(wire as unknown as { open: () => void }).open()
  await settle()
}

/**
 * `live`면 **editor 로 열어 입구가 선 것을 본 뒤 실행 중에 viewer 로 내리고** 훑는다. 받는 쪽이 `canEdit`을 처음
 * 값으로 굳히면 새로 연 viewer 판은 못 보고(처음 값이 곧 viewer) 이 판만 본다.
 */
export async function sweepEditor(role: ProjectRole, draftStore?: DraftStore, live = false): Promise<Wire> {
  const serial = (sweepSerial += 1)
  const wire = mount(live ? 'editor' : role, draftStore)
  await opened(wire)
  if (live) {
    await toMode('편집 모드')
    await screen.findByRole('button', { name: '메뉴 트리에 추가' })
    ;(wire as unknown as { demote: () => void }).demote()
    // 표지는 셸의 통지다 — 자리 하나(메뉴 트리의 뿌리 `+`)를 표지로 삼으면 그 자리의 변조가 «내려가지 않았다»로 읽힌다(`viewer-entries`와 같다).
    await waitFor(() =>
      expect(screen.queryAllByRole('status').some((el) => (el.textContent ?? '').startsWith('편집 권한이 없어져'))).toBe(true),
    )
    await settle()
  }

  for (const mode of ['편집 모드', '뷰 모드'] as const) {
    for (const selection of SELECTIONS) {
      stopIfStale(serial)
      await toMode(mode)
      selection.pick()
      await settle()
      await sweepControls(serial)
      // 컨트롤 훑기가 모드를 바꿔 놓았을 수 있다 — 키는 그 판의 모드에서 보낸다.
      await toMode(mode)
      selection.pick()
      await settle()
      await sweepKeys(serial)
    }
  }
  return wire
}

afterEach(() => {
  window.sessionStorage.clear()
})

/**
 * editor 가 **입구마다** 쓰기를 내는가 — 훑기가 그 입구에 닿았다는 증거다. 하나라도 안 나오면 viewer 의 0 이 그 입구에
 * 대해 아무것도 말하지 않는다. 칸은 요청의 모양(메서드 · 경로 · 본문 키)으로 가른다(머리말).
 */
export const REACH: { name: string; hit: (wire: Wire) => boolean }[] = [
  { name: '메뉴 트리(메뉴 CRUD · 순서)', hit: (w) => w.writes.some((r) => route(r)[0] === 'menu') },
  // **한 경로(`PATCH pages/:id`)에 입구가 넷이다** — 이름 변경 · 설명 저장 · 순서 옮기기 · 메뉴 옮기기. 경로로 재면 메뉴 트리의
  // 순서 옮기기가 설명 저장 대신 칸을 채운다. 본문의 키로 가른다. **이름 변경(`title`)은 칸이 없다** — 이
  // 훑기가 못 닿는다(머리말 «사각»).
  { name: '페이지 설명 저장', hit: (w) => w.writes.some((r) => isPagePatch(r) && r.keys.includes('description')) },
  { name: '페이지 가져오기', hit: (w) => w.writes.some((r) => r.method === 'POST' && same(route(r), ['pages', 'import'])) },
  // **코멘트는 입구가 넷이다** — 하나만 남아도 «코멘트»라는 한 칸은 산다. 두 페이지 어느 쪽이든.
  { name: '코멘트 달기', hit: (w) => w.writes.some((r) => r.method === 'POST' && commentRoute(r)?.length === 0) },
  { name: '코멘트 수정', hit: (w) => w.writes.some((r) => r.method === 'PATCH' && commentRoute(r)?.length === 1) },
  { name: '코멘트 삭제', hit: (w) => w.writes.some((r) => r.method === 'DELETE' && commentRoute(r)?.length === 1) },
  {
    name: '코멘트 재번호',
    hit: (w) => w.writes.some((r) => r.method === 'POST' && same(commentRoute(r) ?? [], ['renumber'])),
  },
  { name: '모듈 저장', hit: (w) => w.writes.some((r) => r.method === 'POST' && same(route(r), ['modules'])) },
  { name: '속성(패치)', hit: (w) => w.frames.includes('patch props') },
  { name: '상호작용(패치)', hit: (w) => w.frames.includes('patch interactions') },
  { name: '구조 편집(패치)', hit: (w) => w.frames.includes('patch structure') },
  { name: '노드 잠금', hit: (w) => w.frames.some((f) => f.startsWith('lock')) },
  { name: '스냅샷 저장', hit: (w) => w.writes.some((r) => r.method === 'POST' && same(route(r), ['snapshots'])) },
]

/** 이 프로젝트 **아래의** 경로 조각(`/api/projects/p-1/` 뒤). 그 밖의 경로면 `['']` — 어느 칸에도 안 맞는다. */
function route(write: Write): string[] {
  const base = `/api/projects/${PROJECT_ID}/`
  return write.path.startsWith(base) ? write.path.slice(base.length).split('/') : ['']
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i])
}

/** `PATCH pages/:id` — 페이지 메타 쓰기(이름 · 설명 · 순서 · 메뉴). */
function isPagePatch(write: Write): boolean {
  const parts = route(write)
  return write.method === 'PATCH' && parts.length === 2 && parts[0] === 'pages'
}

/** `pages/:id/comments` **뒤의** 조각. 코멘트 경로가 아니면 `undefined`. */
function commentRoute(write: Write): string[] | undefined {
  const parts = route(write)
  return parts[0] === 'pages' && parts[2] === 'comments' ? parts.slice(3) : undefined
}

/** 탭 하나의 저장소 — 새로고침은 **같은 저장소 위에 새 문서**다(`page-meta-conflict.test.tsx`의 것과 같은 작은 판). */
export class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>()
  get length(): number {
    return this.#items.size
  }
  clear(): void {
    this.#items.clear()
  }
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.#items.delete(key)
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, String(value))
  }
}

/** 저장소에서 되살아나는 칸 전부 — `slot(…, { save })`를 단 칸이다(`comment-panel.tsx` · `page-description.tsx`). */
export const RESTORED_SLOTS = [
  'comments/drafts',
  'comments/edit-draft',
  'comments/editing-id',
  'comments/post-keys',
  'page-description/draft',
]

/** 그 사람의 사본에 든 칸 이름. */
export function storedSlots(session: Storage): string[] {
  const raw = session.getItem(DRAFT_KEY_PREFIX + ME.id)
  if (raw === null) return []
  return Object.keys((JSON.parse(raw) as { slots: Record<string, unknown> }).slots).sort()
}

/**
 * **editor 때 칸 다섯을 전부 채운다 — 화면으로 친다.** 모양을 손으로 지어 심으면 칸의 모양이 바뀐 날 되살리기가 조용히
 * 칸을 버리고 이 판이 빈 저장소로 초록이 된다. 새 코멘트는 한 번 보내 둔다 — 거절(403) 뒤에도 같은 글이면 같은 키라
 * 멱등 키 칸(`comments/post-keys`)이 선다.
 */
export async function fillDraftsAsEditor(store: DraftStore): Promise<void> {
  const wire = mount('editor', store)
  await opened(wire)

  // 페이지 설명 — 뷰 모드의 탭.
  await toMode('뷰 모드')
  fireEvent.click(screen.getByRole('tab', { name: '페이지 설명' }))
  const description = (await screen.findByRole('textbox', { name: '페이지 설명' })) as HTMLTextAreaElement
  await waitFor(() => expect(description.value).toBe('회원을 찾는 화면'))
  fireEvent.change(description, { target: { value: '강등 전에 친 설명 초안' } })
  await settle()

  // 코멘트 — 편집 모드에서 카드를 골라 새 코멘트를 치고 보낸다(거절된다), 그리고 제 글을 고치기 시작한다.
  await toMode('편집 모드')
  clickNode('n-card')
  await settle()
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  const panel = screen.getByRole('tabpanel')
  const draft = (await within(panel).findByRole('textbox', { name: '새 코멘트' })) as HTMLTextAreaElement
  fireEvent.change(draft, { target: { value: '강등 전 새 코멘트 초안' } })
  fireEvent.click(within(panel).getByRole('button', { name: '코멘트 달기' }))
  await settle()
  await waitFor(() => expect((within(panel).getByRole('button', { name: '수정' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(within(panel).getByRole('button', { name: '수정' }))
  const edit = within(panel).getByRole('textbox', { name: '코멘트 수정' }) as HTMLTextAreaElement
  fireEvent.change(edit, { target: { value: '강등 전에 고치던 글' } })
  await settle()
}
