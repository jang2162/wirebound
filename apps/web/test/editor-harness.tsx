/**
 * 캔버스·구조 트리·속성 패널 테스트의 공통 배선.
 *
 * 세 화면 모두 **`<App />`을 라우트째로 렌더해서** 본다. 셸을 떼어 내고 스토어를 직접
 * 쥐면 케이스가 짧아지지만, 그러면 조회가 실패한 화면 위에서도 단언이 통과한다(그 고장
 * 방식은 `routes/editor-shell.test.tsx` 머리말이 적는다). 그래서
 * `openPage()`는 **성공 대역에서만 나오는 것 둘**을 차례로 기다린다.
 *
 * 1. 프로젝트 이름(`getProject`가 성공해야 나온다)
 * 2. 문서 루트의 `data-wb-id`(`getPage`가 성공해 스토어에 실려야 나온다)
 *
 * 기다리는 일을 `findBy*`·`waitFor`로만 하는 것도 의도다. 두 함수는 RTL의
 * `asyncWrapper`를 지나므로 `test/setup.ts`가 얹은 `act` 한 칸을 함께 받는다 —
 * 직접 만든 폴링(`while` + `await Promise.resolve()`)으로 바꾸면 구독이 붙기 전에
 * 헬퍼가 돌아와 클릭이 조용히 무시되는 그 함정에 다시 빠진다(그 파일 주석 참고).
 *
 * **스토어를 보는 단언에 쓰는 `shellStore()`는 여기 없다.** `vi.mock`은 그것이 적힌
 * 파일에서만 호이스팅되므로(실측: 이 파일에 두고 테스트에서 import하면 import 순서에
 * 따라 mock이 늦게 걸려 셸이 진짜 `EditorStore`를 만든다), 필요한 테스트 파일이 각자
 * 갖는다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { CURRENT_DOCUMENT_VERSION, type PageDocument, type WbNode } from '@wirebound/schema'
import { App } from '../src/app'
import { ApiError, type ApiClient } from '../src/api/client'
import type { PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from '../src/api/types'
import type { RealtimeSetup } from '../src/realtime/context'
import type { TabChannel } from '../src/session/tab-channel'
import type { DraftStore } from '../src/panels/draft-store'
import { fakeApi, renderWithProviders } from './helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 성공한 `getProject`에서만 화면에 나오는 문자열. 셸이 떴다는 증거로 쓴다. */
export const PROJECT_NAME = '관리자 콘솔 설계서'

export const PROJECT_ID = 'p-1'
export const PAGE_ID = 'pg-1'
export const OTHER_PAGE_ID = 'pg-2'
export const OTHER_PAGE_TITLE = '회원 상세'

export const PROJECT_ROUTE = `/projects/${PROJECT_ID}`
export const PAGE_ROUTE = `${PROJECT_ROUTE}/pages/${PAGE_ID}`
export const OTHER_PAGE_ROUTE = `${PROJECT_ROUTE}/pages/${OTHER_PAGE_ID}`

/**
 * 서버가 준 `headSeq`. 서버의 `headSeq`가 스토어로 들어가는지는 `panels/menu-tree.test.tsx`의
 * `페이지를 누르면 스토어에 문서와 headSeq가 실린다`가 자기 픽스처로 본다.
 *
 * 첫 편집의 `baseSeq`가 이 값이어야 하므로 내보낸다 —
 * `test/edit/use-edit-commit.test.tsx`의 `baseSeq는 지금 headSeq다`가 이 값을 단언한다.
 */
export const HEAD_SEQ = 7

const PROJECT: ProjectDetail = {
  id: PROJECT_ID,
  name: PROJECT_NAME,
  slug: 'admin-console',
  description: '내부 운영 도구',
  role: 'owner',
}

/** 페이지 둘. 두 번째는 "다른 페이지로 옮기면 …" 케이스가 쓴다. */
const TREE: TreeMenuNode[] = [
  {
    id: 'mn-1',
    title: '회원관리',
    sortOrder: 1,
    pages: [
      { id: PAGE_ID, title: '회원 목록', sortOrder: 1 },
      { id: OTHER_PAGE_ID, title: OTHER_PAGE_TITLE, sortOrder: 2 },
    ],
    children: [],
  },
]

/** 문서 봉투. 버전은 스키마가 가진 현재 값을 그대로 쓴다 — 마이그레이션은 이 하네스의 몫이 아니다. */
export function pageDoc(root: WbNode): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root }
}

/** 서버가 낼 페이지 응답. 재조회를 세는 테스트가 자기 `getPage`를 만들 때도 쓴다. */
export function pageDetail(pageId: string, schema: PageDocument): PageDetail {
  return {
    id: pageId,
    menuNodeId: 'mn-1',
    title: pageId === PAGE_ID ? '회원 목록' : OTHER_PAGE_TITLE,
    description: null,
    sortOrder: 1,
    schemaVersion: schema.version,
    headSeq: HEAD_SEQ,
    schema,
  }
}

export interface EditorOptions {
  /** `pageId` → 문서. 여기 없는 페이지를 열면 가짜가 404로 답한다. */
  docs?: Record<string, PageDocument>
  /** 라우터의 시작 위치. 생략하면 `pg-1`이 열린 주소다. */
  route?: string
  /** 라우터 안에 함께 놓을 것(주소를 바꾸는 버튼 등). */
  children?: ReactNode
  /**
   * 가짜 `ApiClient`에 덮어씌울 메서드. 기본값 **뒤에** 펼쳐지므로 여기 준 것이 이긴다.
   *
   * 편집 테스트가 `patchOps`를 주입하는 자리이고, 재조회를 세는 테스트가
   * `getPage`를 감싸는 자리이기도 하다.
   */
  apiOverrides?: Partial<ApiClient>
  /** 실시간 연결 설정. 생략하면 `RealtimeProvider`가 없다(`helpers.tsx`의 그 필드). */
  realtime?: RealtimeSetup
  /** 탭 사이의 세션 소식 통로. 생략하면 다른 탭이 없다(`helpers.tsx`의 그 필드). */
  tabChannel?: TabChannel
  /** 초안의 사본. 생략하면 초안은 메모리에만 산다(`helpers.tsx`의 그 필드). */
  draftStore?: DraftStore
}

/** 셸을 렌더하기만 한다. 성공 대역을 기다리는 것은 호출자 몫이다. */
export function renderEditor(options: EditorOptions = {}): void {
  const docs = options.docs ?? {}

  renderWithProviders(
    <>
      <App />
      {options.children}
    </>,
    {
      client: fakeApi({
        me: async () => USER,
        getProject: async () => PROJECT,
        getTree: async () => TREE,
        getPage: async (_projectId, pageId) => {
          const schema = docs[pageId]
          // 스텁하지 않은 페이지를 여는 것은 테스트의 실수다. 빈 문서를 돌려주면 그 실수가
          // "문서가 없는 화면"으로 위장된다(`fakeApi`가 스텁 안 된 메서드에서 던지는 것과
          // 같은 이유).
          if (schema === undefined) {
            throw new ApiError(404, 'not-found', `가짜에 없는 페이지입니다: ${pageId}`)
          }
          return pageDetail(pageId, schema)
        },
        // 페이지를 열면 셸이 undo 스택을 복원하려고 부른다. 기본은 빈 목록이다 —
        // 스텁하지 않으면 `notStubbed`가 던지고, 그 예외는 복원 쪽 `catch`가 삼켜서
        // **아무 일도 안 일어난 것과 구별되지 않는다.**
        listMyRevisions: async () => [],
        ...options.apiOverrides,
      }),
      route: options.route ?? PAGE_ROUTE,
      ...(options.realtime === undefined ? {} : { realtime: options.realtime }),
      ...(options.tabChannel === undefined ? {} : { tabChannel: options.tabChannel }),
      ...(options.draftStore === undefined ? {} : { draftStore: options.draftStore }),
    },
  )
}

/**
 * `pg-1`에 `doc`을 실어 셸을 열고 **성공 대역까지** 기다린다. 돌아온 시점에 문서는
 * 스토어에 있고 캔버스에 그려져 있다.
 */
export async function openPage(doc: PageDocument, options: EditorOptions = {}): Promise<void> {
  renderEditor({ ...options, docs: { [PAGE_ID]: doc, ...options.docs } })

  await screen.findByRole('heading', { name: PROJECT_NAME })
  await waitForNode(doc.root.id)
}

/** 캔버스에 그려진 노드의 엘리먼트. 폴백도 `data-wb-id`를 그대로 달고 있어 같이 잡힌다. */
export function nodeElement(nodeId: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-wb-id="${nodeId}"]`)
}

/** 있어야 하는 노드. 없으면 그 자리에서 요란하게 깨진다. */
export function requireNode(nodeId: string): HTMLElement {
  const element = nodeElement(nodeId)
  if (element === null) throw new Error(`캔버스에 노드가 없습니다: ${nodeId}`)
  return element
}

/** 노드가 캔버스에 나타날 때까지 기다린다. */
export async function waitForNode(nodeId: string): Promise<HTMLElement> {
  return waitFor(() => requireNode(nodeId))
}

/** 캔버스 프레임. 뷰포트 폭·줌이 실제 치수로 이어졌는지 보는 자리다. */
export function canvasFrame(): HTMLElement {
  const frame = screen
    .getByRole('main', { name: '캔버스' })
    .querySelector<HTMLElement>('.wb-shell-canvas-frame')
  if (frame === null) throw new Error('캔버스 프레임을 찾지 못했습니다')
  return frame
}

/**
 * 문서를 품은 상자. 노드가 없는 자리를 누르는 케이스가 쓴다. 클래스로 찾는 것은
 * `canvasFrame()`과 같은 이유다 — 이름을 붙일 까닭이 없는 요소이고, 클래스가 바뀌면
 * 여기서 `null`이 되어 요란하게 깨진다.
 */
export function canvasSurface(): HTMLElement {
  const surface = canvasFrame().querySelector<HTMLElement>('.wb-shell-canvas-surface')
  if (surface === null) throw new Error('캔버스 표면을 찾지 못했습니다')
  return surface
}

/**
 * 선택을 **사용자가 하듯** 푼다 — 캔버스의 빈 자리를 누른다(`canvas/canvas.tsx`의
 * `nodeIdAt`이 노드 밖에서는 `null`을 낸다).
 *
 * **페이지를 열면 스토어가 루트를 고른 채로 시작하므로**(`store/editor-store.ts`의
 * `#selectionFor` — 그러지 않으면 연 직후가 죽은 화면이다), *"고른 것이 없을 때"*를 재는
 * 케이스는 그 상태를 **손으로 만들어야 한다.** 그것이 사라진 상태가 아니라는 것이 요점이다:
 * 캔버스 빈 자리를 누르면 지금도 그대로 도달한다.
 *
 * **`store.selectNode(null)`을 직접 부르지 않는다.** 화면에서 도달할 수 없는 상태를 재면
 * 그 케이스는 사용자가 못 보는 것을 지키게 된다 — 여기서는 도달 경로까지 함께 지난다.
 * (편집 모드에서만 먹는다. 뷰 모드는 선택을 바꾸지 않는다 — `canvas.tsx`의 `onClick`.)
 */
export function deselect(): void {
  fireEvent.click(canvasSurface())
}

/** 선택 아웃라인. 어느 노드에 붙었는지는 `data-wb-selected-id`가 말한다. */
export function selectionOutline(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-wb-selected-id]')
}

/**
 * 캔버스에 그려져 있는 문서 **루트**의 id. 문서가 없으면 `null`이다.
 *
 * 첫 `[data-wb-id]`가 루트인 것은 렌더러가 문서를 위에서부터 그리기 때문이다. 오류 배너는
 * 이 속성을 달지 않으므로 배너가 떠 있어도 값이 흔들리지 않는다.
 */
export function canvasRootId(): string | null {
  const surface = document.body.querySelector('.wb-shell-canvas-surface')
  return surface?.querySelector('[data-wb-id]')?.getAttribute('data-wb-id') ?? null
}

/** 구조 트리가 지금 그리고 있는 노드 타입들. 트리가 없거나 비어 있으면 빈 배열이다. */
export function structureTypes(): string[] {
  const region = document.body.querySelector('.wb-shell-structure')
  if (region === null) return []
  return [...region.querySelectorAll('.wb-shell-structure-node, .wb-shell-structure-broken')].map(
    (row) => row.textContent ?? '',
  )
}

/** 속성 패널의 머리(선택 노드의 타입). 고른 것이 없으면 `null`이다. */
export function panelTitle(): string | null {
  return document.body.querySelector('.wb-shell-panel-title')?.textContent ?? null
}

/** 커밋 하나에서 본 것. `path`는 그 커밋의 주소이고 나머지 셋은 그때 DOM에 있던 내용이다. */
export interface CommitObservation {
  path: string
  canvasRootId: string | null
  structureTypes: string[]
  panelTitle: string | null
}

/**
 * **주소가 바뀐 커밋을 들여다보는 장치.**
 *
 * 왜 필요한가. 이 스위트의 단언은 전부 "완전히 가라앉은 트리"만 본다 — `findBy*`·`waitFor`가
 * RTL의 `asyncWrapper`를 지나며 이펙트를 다 흘리고 돌아오기 때문이다(`test/setup.ts`).
 * 그래서 **커밋 하나짜리 잘못된 중간 상태는 어떤 `expect`도 보지 못한다.** `pageId`가 바뀐
 * 뒤 첫 커밋이 정확히 그 상태다: 라우터는 새 페이지를 가리키는데 스토어는 아직 앞 페이지의
 * 문서를 들고 있다.
 *
 * 그 창을 여는 것이 이 컴포넌트다. `useLocation()`을 구독하므로 **주소가 바뀐 커밋마다**
 * 다시 그려지고, `useLayoutEffect`가 그 커밋의 DOM이 꽂힌 직후·passive effect가 돌기
 * 전에 화면을 읽어 `sink`에 적는다. 세 자리를 함께 읽는 것은 스토어의 문서를 읽는 화면이
 * 셋이기 때문이다(캔버스·구조 트리·속성 패널).
 *
 * **읽는 것은 DOM이지 스토어가 아니다.** 스토어를 읽으면 "스토어가 앞 페이지를 들고 있다"
 * 까지만 알 수 있고, 그것이 화면에 나왔는지는 알 수 없다. 이 장치가 잡아야 하는 것은
 * 뒤쪽이다.
 *
 * **재지 못하는 것:** 그 커밋이 브라우저에 실제로 **페인트되는지**는 이 장치로도 알 수 없다
 * (jsdom에 페인트가 없다). 그래서 커밋을 DOM에 꽂은 뒤 레이아웃 이펙트로 지우는 형태의
 * 수정은 이 장치에 **고쳐진 것으로 보이지 않는다**(실측으로 확인한 한계다).
 */
export function CommitProbe(props: { sink: CommitObservation[] }): null {
  const location = useLocation()
  const { sink } = props

  // 의존성 배열이 없다 — 이 컴포넌트가 다시 그려진 커밋마다 한 줄씩 적는다.
  useLayoutEffect(() => {
    sink.push({
      path: location.pathname,
      canvasRootId: canvasRootId(),
      structureTypes: structureTypes(),
      panelTitle: panelTitle(),
    })
  })

  return null
}
