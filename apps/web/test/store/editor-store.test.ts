// @vitest-environment node
/**
 * `EditorStore`의 계약 테스트. **React를 import하지 않고 DOM 없는 환경에서 돈다.**
 *
 * P2b-2가 이 스토어 위에 낙관적 적용·롤백·리베이스·pending 큐·undo/redo를 얹는다.
 * 그 로직을 브라우저 없이 단위 테스트할 수 있어야 하므로, 스토어가 React·DOM에
 * 손대지 않는 것이 이 파일의 전제다.
 *
 * 맨 윗줄의 환경 지정 주석이 그 전제를 실제로 강제한다 — 이 저장소의 `web` 프로젝트는
 * 기본이 jsdom이라(루트 `vitest.config.ts`) 그 줄이 없으면 DOM 전역이 있는 채로 돌고,
 * 스토어가 `document`를 만져도 이 파일은 초록으로 남는다. React 바인딩
 * (`use-editor-store.tsx`)의 테스트는 jsdom이 필요하므로 따로 있다.
 *
 * **그 지시자를 이 주석에 그대로 옮겨 적지 마라.** vitest는 파일 어디에 있든 그
 * 토큰을 찾는다(파일 끝 줄 주석으로도 먹히는 것을 실측했다). 산문에 한 번 더 적으면
 * 맨 윗줄을 지워도 환경이 그대로라, 아래 첫 테스트가 그 사고를 잡지 못한다.
 */
import {
  CURRENT_DOCUMENT_VERSION,
  type PageDocument,
  type PatchOp,
  type ValidationIssue,
} from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { EditorStore, VIEWPORT_PRESETS, type ViewportWidth } from '../../src/store/editor-store'

/** 페이지 문서 최소형. 스토어는 내용을 해석하지 않으므로 루트 id만 구분되면 된다. */
function doc(rootId: string): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: rootId, type: 'Container' } }
}

/**
 * 자식 하나를 둔 문서. **루트가 아닌 노드를 고를 수 있어야 하는 테스트가 쓴다** — 선택을
 * 보존하는지 보려면 루트와 구분되는 자리가 필요하다.
 */
function withChild(rootId: string, childId: string): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: { id: rootId, type: 'Container', children: [{ id: childId, type: 'Text', props: {} }] },
  }
}

describe('EditorStore', () => {
  it('DOM 없는 환경에서 돈다', () => {
    // 맨 윗줄의 환경 지정이 지워지면 여기서 잡힌다(실측). 그 줄이 없으면 스토어가
    // DOM 전역에 기대도 나머지 테스트가 전부 통과해 버린다.
    expect(typeof globalThis.document).toBe('undefined')
    expect(typeof globalThis.window).toBe('undefined')
  })

  it('초기 상태는 문서 없음·선택 없음·편집 모드다', () => {
    const state = new EditorStore().getState()
    // 문서가 없으면 열린 페이지도 없다. 이 둘이 갈라지면 읽는 쪽의 대조가 무의미해진다.
    expect(state.openPageId).toBeNull()
    expect(state.document).toBeNull()
    expect(state.headSeq).toBe(0)
    expect(state.selectedNodeId).toBeNull()
    expect(state.mode).toBe('edit')
  })

  it('기본 뷰포트는 1280이고 줌은 1이다', () => {
    const state = new EditorStore().getState()
    expect(state.viewportWidth).toBe(1280)
    expect(state.zoom).toBe(1)
  })

  it('loadPage는 페이지 id·문서·headSeq를 함께 넣는다', () => {
    const store = new EditorStore()
    const page = doc('n_root')
    store.loadPage('pg-1', page, 42)
    // `toBe`인 것은 의도다 — 스토어는 문서를 복사하지 않고 받은 객체를 그대로 들고
    // 있는다. 문서는 크고, 스토어는 그 내용을 해석하지 않는다.
    expect(store.getState().document).toBe(page)
    expect(store.getState().headSeq).toBe(42)
    // **셋이 한 번에 들어가야 한다.** 읽는 쪽은 이 id를 주소와 대조해 "이 문서가 지금
    // 열린 페이지의 것인가"를 판정한다(`store/use-editor-store.tsx`의 `useOpenDocument`).
    expect(store.getState().openPageId).toBe('pg-1')
  })

  it('loadPage는 openPageId를 문서와 함께 갈아 끼운다', () => {
    const store = new EditorStore()
    store.loadPage('pg-a', doc('n_a'), 1)
    const before = store.getState()

    store.loadPage('pg-b', doc('n_b'), 2)

    // 앞 페이지의 id가 남으면 읽는 쪽이 새 문서를 앞 페이지의 것으로 판정한다 — 대조가
    // 있으나 마나가 된다. 한 번의 교체로 셋이 함께 움직이는지 본다.
    expect(store.getState().openPageId).toBe('pg-b')
    expect(store.getState().document).not.toBe(before.document)
    expect(store.getState().headSeq).toBe(2)
  })

  /**
   * **페이지를 열면 루트가 고른 상태로 시작한다.**
   *
   * 앞 판은 여기서 선택을 `null`로 비웠고, 그래서 페이지를 연 직후가 **죽은 화면**이었다 —
   * 브라우저에서 잰 값: 구조 편집 도구 9개 중 7개가 꺼지고(`안에 추가`의 `title`이
   * *"자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다"*, `아래 추가`·`삭제`가
   * *"루트가 아닌 노드를 고르세요"*), 속성 패널은 *"노드를 고르면 속성이 보입니다"*만 그렸다.
   * 트리에서 루트를 한 번 누르면 그 자리에서 풀렸다 — **클릭 한 번으로 풀리는 것**이 곧
   * 스토어가 그 선택을 스스로 놓을 수 있다는 근거다.
   *
   * **`null`이 뜻하는 것이 갈리는 것이 이 묶음의 요점이다.** 페이지를 여는 것은 "아직 아무
   * 자리도 안 정했다"이고, 그때 정해 주는 것이 여기다. 반대로 페이지가 열려 있는 동안의
   * `null`은 **사용자가 놓은 것**이라(캔버스 빈 곳 클릭 → `selectNode(null)`) 재조회가
   * 덮으면 안 된다.
   */
  describe('페이지를 열면 루트가 고른 상태다', () => {
    it('loadPage는 문서 루트를 고른다', () => {
      const store = new EditorStore()
      store.loadPage('pg-1', doc('n_root'), 42)
      expect(store.getState().selectedNodeId).toBe('n_root')
    })

    it('페이지를 바꾸면 **새 문서의** 루트로 옮긴다', () => {
      const store = new EditorStore()
      store.loadPage('pg-a', doc('n_a'), 1)
      store.selectNode('n_only_in_page_a')

      store.loadPage('pg-b', doc('n_b'), 2)

      // 노드 id는 문서 안에서만 뜻이 있다. 앞 페이지의 id가 남으면 선택 표시가 존재하지
      // 않는 노드를 가리킨다 — 그것을 막는 것과 루트를 고르는 것이 한 판정이다.
      expect(store.getState().selectedNodeId).toBe('n_b')
    })

    it('`clearPage` 뒤에 **같은** 페이지를 다시 열어도 루트를 고른다', () => {
      const store = new EditorStore()
      store.loadPage('pg-a', withChild('n_root', 'n_a'), 1)
      // **루트가 아닌 자리를 고른다.** 앞 판은 여기서 `doc('n_a')`를 써 루트 id와 고른 id가
      // 같았고, 그래서 마지막 단언이 *"루트를 골랐다"*와 *"앞 선택이 남았다"*를 **가르지
      // 못했다** — 통과하는 이유가 둘 중 무엇인지 케이스가 말하지 못했다. 이제 갈린다:
      // 재조회 갈래로 새면 `n_a`(또는 `null`)이고, 여는 갈래라야 `n_root`다.
      store.selectNode('n_a')
      // 화면이 페이지를 여는 경로에서 실제로 하는 순서다 — 조회를 시작할 때 비우고
      // (`routes/editor.tsx`의 `CanvasFrame`), 응답이 오면 싣는다. 페이지 id가 그대로여도
      // 이것은 **여는** 경로이므로 루트로 시작해야 한다.
      store.clearPage()

      store.loadPage('pg-a', withChild('n_root', 'n_a'), 2)

      // **재는 것은 `pageId`만 보는 구현을 가르는 힘이다 — 심어서 확인했다.** 갈림을
      // *"마지막으로 실은 `pageId`"*를 따로 들고 그것만 비교하는 구현으로 바꾸면 이 케이스가
      // 죽는다(전량에서 2 사망: 이것과 아래 잠금 대조). 지금 구현이 통과하는 이유는
      // **`clearPage`가 `openPageId`를 문서·선택과 함께 비우기 때문**이고, 그 성질은
      // `clearPage는 openPageId·문서·headSeq·선택을 비운다`가 따로 지킨다.
      expect(store.getState().selectedNodeId).toBe('n_root')
    })

    it('남이 잠근 자리는 자동으로도 고르지 않는다 — 1차 방어를 우회하지 않는다', () => {
      const store = new EditorStore()
      store.setViewer('u_dahye')
      // 남이 페이지 안 어디든 잡고 있으면 **루트가 그 조상이라** 부딪친다(§7.2는 서브트리를
      // 잠근다). `selectNode`가 막는 것을 `loadPage`가 뒷문으로 통과시키면 판정이 두 벌이 된다.
      store.setLocks([{ pageId: 'pg-1', nodeId: 'n_a', userId: 'u_bora', userName: '보라' }])

      store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)

      expect(store.getState().selectedNodeId).toBeNull()
      // 대조: 그 잠금이 내 것이면 막히지 않는다(D3 — 소유자는 사람이다).
      store.setViewer('u_bora')
      store.clearPage()
      store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)
      expect(store.getState().selectedNodeId).toBe('n_root')
    })
  })

  /**
   * **같은 페이지를 다시 싣는 것은 자리를 뺏지 않는다.** `loadPage`를 지나는 길은 셋인데
   * (페이지 열기 · 재연결/복원 재조회 · 편집 실패 복구) 뒤의 둘은 **사용자가 아무것도 안
   * 했는데** 도는 것이다. 그때 선택을 루트로 옮기면 편집하던 사람의 자리를 뺏는다 —
   * 속성 패널이 다른 노드를 그리고, 다음 `안에 추가`가 엉뚱한 자리에 꽂힌다.
   *
   * 가르는 값은 **`openPageId`와 문서가 이미 그 페이지의 것인가**다. 화면은 페이지를 여는
   * 경로에서만 `clearPage()`를 먼저 부르므로(`routes/editor.tsx`), 그 둘이 남아 있다는 것이
   * 곧 "같은 페이지를 다시 싣는 중"이다.
   */
  describe('같은 페이지를 다시 실을 때', () => {
    it('보고 있던 자리를 그대로 둔다', () => {
      const store = new EditorStore()
      store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)
      store.selectNode('n_a')

      // 재연결·복원 재조회(`applyServerPage`)와 편집 실패 복구(`use-edit-commit.tsx`)가
      // 하는 것이 이것이다 — `clearPage` 없이 같은 페이지를 다시 싣는다.
      store.loadPage('pg-1', withChild('n_root', 'n_a'), 2)

      expect(store.getState().selectedNodeId).toBe('n_a')
    })

    it('명시적으로 푼 선택을 되살리지 않는다', () => {
      const store = new EditorStore()
      store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)
      // 캔버스 빈 곳을 누르면 이것이 나간다(`canvas/canvas.tsx`) — **사용자가 놓은 `null`**이다.
      store.selectNode(null)

      store.loadPage('pg-1', withChild('n_root', 'n_a'), 2)

      expect(store.getState().selectedNodeId).toBeNull()
    })

    it('그 사이 사라진 노드를 가리키면 놓는다', () => {
      const store = new EditorStore()
      store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)
      store.selectNode('n_a')

      // 남이 지웠거나 스냅샷 복원으로 문서가 통째로 갈린 판이다. 그대로 두면 선택이
      // **존재하지 않는 노드**를 가리키고, 그 위에서 만든 편집은 없는 경로를 건드린다.
      store.loadPage('pg-1', doc('n_root'), 2)

      // 루트로 옮기지 **않는다** — 사용자가 안 한 재조회가 자리를 옮기는 것은 여기서도 같다.
      expect(store.getState().selectedNodeId).toBeNull()
    })
  })

  it('clearPage는 openPageId·문서·headSeq·선택을 비운다', () => {
    const store = new EditorStore()
    store.loadPage('pg-a', doc('n_a'), 9)
    store.selectNode('n_a')

    store.clearPage()

    // 문서를 비웠는데 열린 페이지 id가 남으면, 읽는 쪽은 "그 페이지가 열려 있다"고 보면서
    // 그릴 문서를 못 받는다. 둘은 함께 움직여야 한다.
    expect(store.getState().openPageId).toBeNull()
    expect(store.getState().document).toBeNull()
    // `headSeq`를 함께 본다 — P2b-2가 그 값을 `baseSeq`로 쓰므로, 문서만 비우고 seq를
    // 남기면 열린 페이지 없이 편집 요청이 만들어진다.
    expect(store.getState().headSeq).toBe(0)
    // 노드 id는 문서 안에서만 뜻이 있다. 문서를 비웠는데 선택이 남으면 존재하지 않는
    // 노드를 가리킨다(`loadPage`가 선택을 지우는 것과 같은 이유다).
    expect(store.getState().selectedNodeId).toBeNull()
  })

  it('clearPage는 모드·줌·뷰포트 폭을 남긴다', () => {
    const store = new EditorStore()
    // 셋 다 초기값과 다르게 둔다. 초기값 그대로면 통째로 초기화하는 구현도 통과한다.
    store.loadPage('pg-a', doc('n_a'), 9)
    store.setMode('view')
    store.setZoom(2)
    store.setViewportWidth(375)

    store.clearPage()

    // 보기 설정은 페이지가 아니라 보는 사람에게 매인 값이다. 페이지를 닫았다고 되돌리면
    // 사용자가 맞춰 둔 화면이 이유 없이 초기화된다. **`reset`과 갈리는 자리가 여기다** —
    // 아래 `reset은 초기 상태로 돌린다`가 반대쪽을 지킨다.
    expect(store.getState().mode).toBe('view')
    expect(store.getState().zoom).toBe(2)
    expect(store.getState().viewportWidth).toBe(375)
  })

  it('clearPage는 이미 비어 있으면 알리지 않는다', () => {
    const store = new EditorStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const empty = store.getState()

    // 문서가 없는 상태에서 부르는 것은 변경이 아니다. 화면이 페이지를 열 때마다
    // 조회 시작 시점에 이것을 부르므로(`routes/editor.tsx`의 `CanvasFrame`), 여기서
    // 매번 알리면 스토어를 구독하는 쪽이 페이지마다 헛일을 한다.
    store.clearPage()
    expect(listener).not.toHaveBeenCalled()
    // 참조까지 본다 — 값이 같은 새 객체로 교체해도 `useSyncExternalStore`는 바뀐 것으로 본다.
    expect(store.getState()).toBe(empty)

    store.loadPage('pg-a', doc('n_a'), 3)
    store.clearPage()
    expect(listener).toHaveBeenCalledTimes(2)

    const cleared = store.getState()
    store.clearPage()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.getState()).toBe(cleared)
  })

  it('selectNode는 구독자에게 알린다', () => {
    const store = new EditorStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.selectNode('n_a')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('상태가 바뀌지 않으면 알리지 않는다', () => {
    const store = new EditorStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.selectNode('n_a')
    store.selectNode('n_a')
    expect(listener).toHaveBeenCalledTimes(1)

    // 나머지 setter도 같은 규칙을 따른다 — 초기값과 같은 값을 넣는 것은 변경이 아니다.
    store.setMode('edit')
    store.setZoom(1)
    store.setViewportWidth(1280)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('getState는 매번 같은 참조를 준다(변경 없으면)', () => {
    const store = new EditorStore()

    const first = store.getState()
    // 읽기만으로 새 객체가 생기면 `useSyncExternalStore`의 스냅샷이 매 렌더 달라져
    // 렌더가 멈추지 않는다. 이 단언이 그 성질을 고정한다.
    expect(store.getState()).toBe(first)

    store.selectNode('n_a')
    const second = store.getState()
    expect(second).not.toBe(first)
    expect(store.getState()).toBe(second)

    // 값이 같은 호출은 상태를 교체하지 않는다.
    store.selectNode('n_a')
    expect(store.getState()).toBe(second)
  })

  it('구독 해제하면 더 이상 안 알린다', () => {
    const store = new EditorStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.selectNode('n_a')
    unsubscribe()
    store.selectNode('n_b')
    expect(listener).toHaveBeenCalledTimes(1)
    // 해제하고도 상태 자체는 바뀐다 — 안 부르는 것은 알림뿐이다.
    expect(store.getState().selectedNodeId).toBe('n_b')
  })

  it('구독자가 여럿이면 전부 부른다', () => {
    const store = new EditorStore()
    const first = vi.fn()
    const second = vi.fn()
    store.subscribe(first)
    store.subscribe(second)
    store.setMode('view')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('setZoom은 0.25~2.0으로 클램프한다', () => {
    const store = new EditorStore()
    store.setZoom(0.1)
    expect(store.getState().zoom).toBe(0.25)
    store.setZoom(5)
    expect(store.getState().zoom).toBe(2)
    store.setZoom(0.5)
    expect(store.getState().zoom).toBe(0.5)
  })

  it('setZoom은 NaN을 무시한다', () => {
    const store = new EditorStore()
    store.setZoom(Number.NaN)
    // NaN은 `Math.min`·`Math.max`를 그대로 통과한다. 클램프만으로는 막히지 않는다.
    expect(store.getState().zoom).toBe(1)
  })

  it('setViewportWidth는 프리셋만 받는다', () => {
    const store = new EditorStore()
    for (const width of VIEWPORT_PRESETS) {
      store.setViewportWidth(width)
      expect(store.getState().viewportWidth).toBe(width)
    }

    store.setViewportWidth(768)
    const listener = vi.fn()
    store.subscribe(listener)
    // 런타임에는 타입이 없다. 프리셋 밖의 폭은 화면의 어떤 선택지와도 대응하지
    // 않으므로 무시하고 마지막 유효 값을 유지한다.
    store.setViewportWidth(999 as ViewportWidth)
    expect(store.getState().viewportWidth).toBe(768)
    expect(listener).not.toHaveBeenCalled()
  })

  it('reset은 초기 상태로 돌린다', () => {
    const store = new EditorStore()
    store.loadPage('pg-a', doc('n_a'), 9)
    store.selectNode('n_a')
    store.setMode('view')
    store.setViewportWidth(375)
    store.setZoom(2)

    store.reset()

    // 필드를 하나씩 세지 않고 새 스토어와 통째로 비교한다 — P2b-2가 상태에 필드를
    // 더했을 때 `reset`이 그것을 빠뜨리면 여기서 드러난다.
    expect(store.getState()).toEqual(new EditorStore().getState())
  })

  it('메서드를 인스턴스에서 떼어 내도 동작한다', () => {
    // React 바인딩이 `useSyncExternalStore(store.subscribe, () => selector(store.getState()))`
    // 형태로 바인딩 없이 넘긴다. 평범한 프로토타입 메서드면 `this`를 잃고 죽는다.
    const store = new EditorStore()
    const { getState, subscribe } = store
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    store.selectNode('n_a')

    expect(getState().selectedNodeId).toBe('n_a')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

/** 편집 하나. 내용은 `applyEdit`이 실제로 적용할 수 있는 것이어야 한다. */
const TITLE_OPS: PatchOp[] = [
  { op: 'add', path: '/root/props', value: { title: '새 제목' } },
]

/** `applyOps`가 던지는 ops. 없는 경로다 — D7의 신호를 만드는 값이다. */
const BROKEN_OPS: PatchOp[] = [
  { op: 'replace', path: '/root/children/9/props/title', value: 'x' },
]

/**
 * 서버가 준 ack. `inverse`는 서버가 만든 것이다(설계 §7.1).
 *
 * 기본값은 `TITLE_OPS`(통째 `add`)의 역인 `remove /root/props`다 — 웨이브 2가 잰 값이다.
 * undo가 만든 revision의 역은 그 반대이므로 케이스가 직접 준다.
 */
function ack(
  seq: number,
  inverse: PatchOp[] = [{ op: 'remove', path: '/root/props' }],
): { seq: number; revisionId: string; inverse: PatchOp[] } {
  return { seq, revisionId: `rev-${seq}`, inverse }
}

/**
 * 서버가 편집 응답에 실어 보내는 경고 하나(P5-3 D6). **저장은 성공했다** — severity가
 * `warning`인 이슈는 저장을 막지 않고 문서에 남는다(P5-2 재라 #2).
 */
const WARNING: ValidationIssue = {
  code: 'missing-interaction-target',
  severity: 'warning',
  nodeId: 'n_000000000001',
  path: '/root/interactions/0/actions/0',
  message: 'setProp의 타겟 노드가 문서에 없습니다: n_없음',
}

/** undo가 만든 revision의 `inverse` — 지워진 `props`를 도로 넣는다. */
const REDO_INVERSE: PatchOp[] = [{ op: 'add', path: '/root/props', value: { title: '새 제목' } }]

/** id를 순서대로 내주는 생성기. 스토어가 전역(`crypto.randomUUID`)에 기대지 않는다는 계약이다. */
function idSequence(): () => string {
  let n = 0
  return () => {
    n += 1
    return `op-${n}`
  }
}

describe('EditorStore의 편집 상태', () => {
  function loaded(): EditorStore {
    const store = new EditorStore({ nextOpId: idSequence() })
    store.loadPage('pg-1', doc('n_root'), 7)
    return store
  }

  it('초기 편집 상태는 비어 있다', () => {
    const state = new EditorStore().getState()
    expect(state.pending).toEqual([])
    expect(state.undoStack).toEqual([])
    expect(state.editStatus).toBe('idle')
  })

  it('편집을 적용하면 문서가 바뀌고 큐에 쌓인다', () => {
    const store = loaded()

    const clientOpId = store.applyEdit(TITLE_OPS)

    expect(clientOpId).toBe('op-1')
    // 낙관적 적용 — 서버에 묻기 전에 문서가 이미 바뀌어 있다.
    expect(store.getState().document?.root.props).toEqual({ title: '새 제목' })
    // `kind`는 ack가 어느 스택에 쌓을지를 가르는 표시다(Task 10).
    expect(store.getState().pending).toEqual([
      { clientOpId: 'op-1', ops: TITLE_OPS, baseSeq: 7, kind: 'edit' },
    ])
    // `headSeq`는 ack 전까지 그대로다 — 그것을 여기서 올리면 다음 편집이 아직 없는
    // revision을 `baseSeq`로 쓴다.
    expect(store.getState().headSeq).toBe(7)
  })

  it('적용할 수 없는 ops는 큐를 건드리지 않는다', () => {
    // D7 — `applyOps`가 던지는 것은 클라이언트가 만든 잘못된 ops다. 서버에 보내 봐야
    // 409/422를 받고 재조회 비용만 든다.
    const store = loaded()
    const before = store.getState()

    expect(store.applyEdit(BROKEN_OPS)).toBeNull()

    // 상태 객체 자체가 그대로여야 한다 — 문서만 되돌리고 `pending`을 건드린 구현을 잡는다.
    expect(store.getState()).toBe(before)
  })

  it('적용에 실패해도 clientOpId를 소비하지 않는다', () => {
    // 실패한 편집이 id를 먹으면 다음 편집의 id가 건너뛴다. 겉으로는 문제가 없지만
    // 생성기가 주입된 의미(결정적인 id)가 사라진다.
    const store = loaded()

    store.applyEdit(BROKEN_OPS)

    expect(store.applyEdit(TITLE_OPS)).toBe('op-1')
  })

  it('문서가 없으면 편집이 적용되지 않는다', () => {
    const store = new EditorStore({ nextOpId: idSequence() })

    expect(store.applyEdit(TITLE_OPS)).toBeNull()
    expect(store.getState().pending).toEqual([])
  })

  it('ack하면 headSeq가 오르고 undo 스택이 쌓인다', () => {
    const store = loaded()
    store.applyEdit(TITLE_OPS)

    store.ackEdit('op-1', ack(8))

    expect(store.getState().headSeq).toBe(8)
    expect(store.getState().pending).toEqual([])
    // **`inverse`는 서버가 준 그대로 쌓인다**(설계 §7.1). 클라이언트가 계산하지 않는다.
    expect(store.getState().undoStack).toEqual([
      { revisionId: 'rev-8', inverse: [{ op: 'remove', path: '/root/props' }] },
    ])
  })

  /**
   * **경고는 ack와 함께 움직인다**(P5-3 D6). 서버가 편집 응답에 실어 보내는
   * `warnings`가 여기로 들어오고, 그것을 그리는 자리는 셸 머리다
   * (`shell/edit-warnings.tsx`).
   */
  it('ack의 warnings가 상태로 들어간다', () => {
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    expect(store.getState().editWarnings).toEqual([])

    store.ackEdit('op-1', { ...ack(8), warnings: [WARNING] })

    expect(store.getState().editWarnings).toEqual([WARNING])
  })

  it('경고 없는 ack는 앞 경고를 지운다 — 쌓지 않는다', () => {
    // 서버가 보내는 것은 *"이 편집 뒤 문서에 남은 경고 전부"*다. 누적하면 이미 고친
    // 경고가 화면에 남는다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', { ...ack(8), warnings: [WARNING] })
    store.applyEdit(TITLE_OPS)

    store.ackEdit('op-2', ack(9))

    expect(store.getState().editWarnings).toEqual([])
  })

  it('페이지를 옮기면 경고가 사라진다', () => {
    // 문서가 갈렸으므로 앞 페이지의 경고는 지금 문서의 것이 아니다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', { ...ack(8), warnings: [WARNING] })

    store.clearPage()

    expect(store.getState().editWarnings).toEqual([])
  })

  it('모르는 clientOpId의 ack는 경고도 싣지 않는다', () => {
    // 늦게 도착한 응답의 경고가 지금 문서의 것으로 실리면, 이미 사라진 문제를 말하게 된다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)

    store.ackEdit('op-없음', { ...ack(8), warnings: [WARNING] })

    expect(store.getState().editWarnings).toEqual([])
  })

  it('모르는 clientOpId의 ack는 아무것도 바꾸지 않는다', () => {
    // 늦게 도착한 응답이 `headSeq`를 올리면 다음 편집의 `baseSeq`가 서버보다 앞선다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    const before = store.getState()

    store.ackEdit('op-없음', ack(8))

    expect(store.getState()).toBe(before)
  })

  it('두 편집을 순서대로 ack하면 headSeq가 이어진다', () => {
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.applyEdit([{ op: 'replace', path: '/root/props/title', value: '또 다른 제목' }])

    store.ackEdit('op-1', ack(8))
    expect(store.getState().pending.map((p) => p.clientOpId)).toEqual(['op-2'])
    expect(store.getState().headSeq).toBe(8)

    store.ackEdit('op-2', ack(9))
    expect(store.getState().headSeq).toBe(9)
    expect(store.getState().undoStack.map((r) => r.revisionId)).toEqual(['rev-8', 'rev-9'])
  })

  it('두 번째 편집은 첫 편집이 적용된 문서 위에 쌓인다', () => {
    // 큐가 쌓여 있어도 낙관적 적용은 즉시 일어난다 — 그러지 않으면 화면이 두 번째
    // 편집을 보여주지 못한 채 앞 요청을 기다리게 된다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.applyEdit([{ op: 'add', path: '/root/props/other', value: 1 }])

    expect(store.getState().document?.root.props).toEqual({ title: '새 제목', other: 1 })
  })

  it('실패하면 큐가 비고 상태가 recovering이 된다', () => {
    const store = loaded()
    store.applyEdit(TITLE_OPS)

    const dropped = store.failEdits()

    expect(dropped.map((p) => p.clientOpId)).toEqual(['op-1'])
    expect(store.getState().pending).toEqual([])
    expect(store.getState().editStatus).toBe('recovering')
  })

  it('실패해도 문서는 되돌리지 않는다', () => {
    // D4 — 롤백 경로는 재조회 하나뿐이다. 여기서 로컬 `inverse`로 되돌리면 클라이언트가
    // 낙관적으로 앞서 있는 만큼 서버와 어긋난다(설계 §7.1이 `inverse`를 서버가 만들게
    // 한 것과 같은 이유).
    const store = loaded()
    store.applyEdit(TITLE_OPS)

    store.failEdits()

    expect(store.getState().document?.root.props).toEqual({ title: '새 제목' })
  })

  it('pending은 새 배열로 교체된다', () => {
    // 스토어의 `#apply`가 참조 비교를 하므로, 제자리에서 `push`하면 구독자가 알림을
    // 받지 못한다.
    const store = loaded()
    const listener = vi.fn()
    store.subscribe(listener)

    store.applyEdit(TITLE_OPS)

    expect(listener).toHaveBeenCalled()
    const first = store.getState().pending
    store.applyEdit([{ op: 'add', path: '/root/props/other', value: 1 }])
    expect(store.getState().pending).not.toBe(first)
  })

  it('setEditStatus는 같은 값이면 알리지 않는다', () => {
    const store = loaded()
    store.setEditStatus('sending')
    const listener = vi.fn()
    store.subscribe(listener)

    store.setEditStatus('sending')

    expect(listener).not.toHaveBeenCalled()
  })

  it('clearPage는 편집 상태도 비운다', () => {
    // **이것을 빠뜨리면 페이지를 옮긴 뒤 앞 페이지의 pending이 새 페이지로 전송된다.**
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', ack(8))
    store.applyEdit([{ op: 'add', path: '/root/props/other', value: 1 }])
    store.setEditStatus('sending')

    store.clearPage()

    expect(store.getState().pending).toEqual([])
    expect(store.getState().undoStack).toEqual([])
    expect(store.getState().editStatus).toBe('idle')
  })

  it('기본 생성자는 인자 없이도 만들어진다', () => {
    // 앱은 인자 없이 만든다(`routes/editor.tsx`). 생성기가 필수가 되면 그 자리가 깨진다.
    // **`crypto.randomUUID`가 이 환경에 있는지는 이 케이스가 재는 것이 아니다** — 그것을
    // 부르는 것은 아래 `applyEdit`이고, 여기서 그것이 문자열을 내는 것까지 본다.
    const store = new EditorStore()
    store.loadPage('pg-1', doc('n_root'), 7)

    expect(typeof store.applyEdit(TITLE_OPS)).toBe('string')
  })

  it('편집을 내면 redo 스택이 비워진다', () => {
    // 표준 undo 의미론이다 — undo 뒤 새 편집을 하면 되돌아갈 미래가 없어진다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', ack(8))
    store.startUndo()
    store.ackEdit('op-2', ack(9, REDO_INVERSE))
    expect(store.getState().redoStack).toHaveLength(1)

    // undo가 `props`를 통째로 지웠으므로 다시 통째로 넣는 편집이라야 적용된다.
    store.applyEdit([{ op: 'add', path: '/root/props', value: { other: 1 } }])

    expect(store.getState().redoStack).toEqual([])
  })

  it('undo가 만든 revision은 redo 스택으로 간다', () => {
    // **ack 시점에 그것을 알려면 큐 항목에 표시가 있어야 한다.** undo가 만든 revision의
    // `inverse`는 원래 편집을 **다시** 적용하는 것이므로 undo 스택에 쌓으면 안 된다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', ack(8))

    const attempt = store.startUndo()
    expect(attempt.clientOpId).toBe('op-2')
    // 스택에서 이미 빠졌다 — 낙관적으로 적용했으므로.
    expect(store.getState().undoStack).toEqual([])

    store.ackEdit('op-2', ack(9, REDO_INVERSE))

    expect(store.getState().undoStack).toEqual([])
    expect(store.getState().redoStack.map((r) => r.revisionId)).toEqual(['rev-9'])
  })

  it('redo가 만든 revision은 다시 undo 스택으로 간다', () => {
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', ack(8))
    store.startUndo()
    store.ackEdit('op-2', ack(9, REDO_INVERSE))

    const attempt = store.startRedo()
    expect(attempt.clientOpId).toBe('op-3')
    store.ackEdit('op-3', ack(10))

    expect(store.getState().redoStack).toEqual([])
    expect(store.getState().undoStack.map((r) => r.revisionId)).toEqual(['rev-10'])
  })

  it('되돌릴 것이 없으면 startUndo가 아무것도 하지 않는다', () => {
    const store = loaded()
    const before = store.getState()

    expect(store.startUndo()).toEqual({ clientOpId: null, skipped: 0 })

    expect(store.getState()).toBe(before)
  })

  it('적용할 수 없는 inverse는 스택에서 빼고 다음으로 넘어간다', () => {
    // **설계 §7.3의 계약이다 — 에러가 아니라 정상 흐름이다.** 그 경로가 없으면 다른
    // 사람이 지운 노드를 undo할 때 스택 맨 위에 갇힌다.
    const store = loaded()
    // **인자는 최신이 앞이다**(서버 응답 순서). 그러므로 `rev-bad`가 스택 top이다.
    store.restoreUndoStack([
      { revisionId: 'rev-bad', inverse: [{ op: 'replace', path: '/root/children/9/props/x', value: 1 }] },
      { revisionId: 'rev-old', inverse: [{ op: 'add', path: '/root/props', value: { title: '옛' } }] },
    ])

    const attempt = store.startUndo()

    // 못 쓰는 것 하나를 건너뛰고 그 아래를 집었다.
    expect(attempt.skipped).toBe(1)
    expect(attempt.clientOpId).toBe('op-1')
    expect(store.getState().undoStack).toEqual([])
    expect(store.getState().document?.root.props).toEqual({ title: '옛' })
  })

  it('스택이 전부 적용 불가면 비우고 건너뛴 수를 알린다', () => {
    const store = loaded()
    store.restoreUndoStack([
      { revisionId: 'r1', inverse: [{ op: 'replace', path: '/root/children/8/props/x', value: 1 }] },
      { revisionId: 'r2', inverse: [{ op: 'replace', path: '/root/children/9/props/x', value: 1 }] },
    ])

    const attempt = store.startUndo()

    expect(attempt).toEqual({ clientOpId: null, skipped: 2 })
    // 갇히지 않도록 비운다 — 남겨 두면 다음 undo가 같은 항목을 또 시도한다.
    expect(store.getState().undoStack).toEqual([])
  })

  it('restoreUndoStack은 최신이 top이 되게 싣는다', () => {
    // 서버 응답은 `seq` 내림차순(최신이 앞)이고, 이 스토어의 스택은 **끝이 top**이다
    // (`ackEdit`이 `[...undoStack, ref]`로 쌓는다). 그래서 싣는 쪽이 뒤집는다 —
    // **계획서는 "뒤집지 마라"고 적었는데 그것은 스택을 "앞이 top"으로 두는 표현을
    // 전제한 말이다.** 여기서 재는 것은 배열 모양이 아니라 **어느 것이 먼저 undo되는가**다.
    const store = loaded()
    store.restoreUndoStack([
      { revisionId: 'rev-최신', inverse: [{ op: 'add', path: '/root/props', value: { title: '최신' } }] },
      { revisionId: 'rev-옛것', inverse: [{ op: 'add', path: '/root/props', value: { title: '옛것' } }] },
    ])

    store.startUndo()

    // 최신 것이 먼저 되돌아간다.
    expect(store.getState().document?.root.props).toEqual({ title: '최신' })
    expect(store.getState().pending[0]?.ops).toEqual([
      { op: 'add', path: '/root/props', value: { title: '최신' } },
    ])
  })

  it('restoreUndoStack은 redo 스택을 비운다', () => {
    // D10 — 복원한 항목은 redo를 갖지 않는다. redo 스택은 세션 안에서 undo를 눌러야 생긴다.
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', ack(8))
    store.startUndo()
    store.ackEdit('op-2', ack(9, REDO_INVERSE))
    expect(store.getState().redoStack).toHaveLength(1)

    store.restoreUndoStack([{ revisionId: 'r', inverse: [] }])

    expect(store.getState().redoStack).toEqual([])
  })

  it('loadPage는 redo 스택도 비운다', () => {
    const store = loaded()
    store.applyEdit(TITLE_OPS)
    store.ackEdit('op-1', ack(8))
    store.startUndo()
    store.ackEdit('op-2', ack(9, REDO_INVERSE))

    store.loadPage('pg-1', doc('n_root2'), 50)

    expect(store.getState().undoStack).toEqual([])
    expect(store.getState().redoStack).toEqual([])
  })

  it('펌프는 한 번에 하나만 돈다', () => {
    // **훅 인스턴스가 둘이어도 D6가 지켜져야 한다.** 실측: 펌프 가드가 훅의 ref에 있으면
    // `useEditCommit`을 두 번 부른 트리에서 `maxInFlight`가 2가 된다. 가드를 스토어에 두면
    // 인스턴스 수와 무관해진다 — undo/redo 버튼이 속성 패널과 다른 인스턴스를 쓰기 때문에
    // 이 자리가 실재하는 경로다.
    const store = loaded()

    expect(store.beginPump()).toBe(true)
    expect(store.beginPump()).toBe(false)

    store.endPump()
    expect(store.beginPump()).toBe(true)
  })
})

/**
 * **코멘트가 낸 문서 변화를 받는 자리**(P5-1, 계획서 D2).
 *
 * 코멘트를 달거나 지우거나 재번호하면 서버가 노드의 `marker`를 바꾸고 revision을 남긴다.
 * 그 변화는 `PATCH .../ops`의 ack가 아니라 코멘트 응답으로 오므로 `ackEdit`이 아니라
 * 이 메서드가 받는다.
 *
 * **재는 축이 하나다: 문서와 `headSeq`가 함께 움직이거나 둘 다 안 움직인다.**
 * 한쪽만 움직이면 *"화면에는 번호가 없는데 다음 편집은 번호가 있는 revision 위에서
 * 만들어지는"* 상태가 되고, 그 어긋남은 아무도 모르는 채 남는다.
 */
describe('EditorStore의 마커 반영', () => {
  /** `n_root` 아래 자식 하나를 둔 문서. 마커를 붙일 자리가 필요하다. */
  function withChild(): PageDocument {
    return {
      version: CURRENT_DOCUMENT_VERSION,
      root: { id: 'n_root', type: 'Container', children: [{ id: 'n_a', type: 'Text' }] },
    }
  }

  const ADD_MARKER: PatchOp[] = [{ op: 'add', path: '/root/children/0/marker', value: 1 }]

  it('ops를 문서에 얹고 headSeq를 올린다', () => {
    const store = new EditorStore()
    store.loadPage('pg-1', withChild(), 7)

    expect(store.applyMarkerChange('pg-1', { seq: 8, markerOps: ADD_MARKER })).toBe('applied')

    expect(store.getState().document?.root.children?.[0]?.marker).toBe(1)
    expect(store.getState().headSeq).toBe(8)
  })

  it('낙관적 편집을 지우지 않는다 — 문서를 통째로 갈아 끼우지 않는 이유다', () => {
    // **`loadPage`로 서버 문서를 놓으면 아직 보내지 않은 편집이 화면에서 사라진다.**
    // 여기서는 그 편집이 얹힌 문서 **위에** 마커만 더한다.
    const store = new EditorStore()
    store.loadPage('pg-1', withChild(), 7)
    store.applyEdit([{ op: 'add', path: '/root/children/0/props', value: { content: '타이핑 중' } }])

    store.applyMarkerChange('pg-1', { seq: 8, markerOps: ADD_MARKER })

    expect(store.getState().document?.root.children?.[0]?.props).toEqual({ content: '타이핑 중' })
    expect(store.getState().document?.root.children?.[0]?.marker).toBe(1)
    // 큐도 그대로다 — 보내지 않은 편집이 살아 있다.
    expect(store.getState().pending).toHaveLength(1)
  })

  it('undo 스택을 비우지 않는다 — 코멘트를 달 때마다 되돌리기가 사라지면 안 된다', () => {
    const store = new EditorStore()
    store.loadPage('pg-1', withChild(), 7)
    store.restoreUndoStack([{ revisionId: 'rev-1', inverse: [] }])

    store.applyMarkerChange('pg-1', { seq: 8, markerOps: ADD_MARKER })

    expect(store.getState().undoStack).toHaveLength(1)
  })

  it('다른 페이지가 열려 있으면 아무것도 안 한다', () => {
    // 옮긴 뒤 늦게 도착한 응답이다. `headSeq`를 건드리면 새 페이지의 편집이 남의
    // revision 번호 위에서 만들어진다(`ackEdit`의 늦은 ack 가드와 같은 자리).
    const store = new EditorStore()
    store.loadPage('pg-2', withChild(), 3)

    // **`'skipped'`다 — `'diverged'`가 아니다**(리뷰 ④). 그 화면은 이미 다른 페이지를
    // 보고 있으므로 말할 것이 없다.
    expect(store.applyMarkerChange('pg-1', { seq: 8, markerOps: ADD_MARKER })).toBe('skipped')
    expect(store.getState().headSeq).toBe(3)
    expect(store.getState().document?.root.children?.[0]?.marker).toBeUndefined()
  })

  it('ops를 적용할 수 없으면 headSeq도 안 올린다', () => {
    // **이 케이스가 이 메서드의 중심이다.** 보내지 않은 구조 편집이 그 노드를 이미
    // 지웠으면 경로가 없다. 그때 `headSeq`만 올리면 문서와 revision 번호가 조용히
    // 갈라진다 — 둘 다 안 움직이면 다음 편집이 409를 받고 복구가 페이지를 다시 받는다.
    const store = new EditorStore()
    store.loadPage('pg-1', withChild(), 7)
    store.applyEdit([{ op: 'remove', path: '/root/children/0' }])

    // **`'diverged'`다 — 화면이 이것을 말해야 한다**(리뷰 ④). 서버에는 번호가 있는데
    // 내 문서에는 없는 상태이고, 조용히 넘기면 아무도 그 어긋남을 모른다.
    expect(store.applyMarkerChange('pg-1', { seq: 8, markerOps: ADD_MARKER })).toBe('diverged')
    expect(store.getState().headSeq).toBe(7)
  })

  it('문서가 안 바뀐 요청은 headSeq도 안 건드린다', () => {
    // 이미 번호가 있는 노드에 코멘트를 더 달았거나, 마지막이 아닌 코멘트를 지웠거나,
    // 바꿀 것 없는 재번호다.
    //
    // **응답의 `seq`를 받아들이지 않는 것이 요점이다**(리뷰 ④의 곁가지). 그 값은 서버가
    // 요청을 받은 시점의 `head_seq`이고 **내 문서가 그 revision 위에 서 있다는 뜻이
    // 아니다.** 내가 뒤처져 있으면 그것을 받아 "나는 최신이다"라고 믿게 되고, 앞서
    // 있으면 값이 **내려간다** — 여기서는 내려가는 쪽을 잰다.
    const store = new EditorStore()
    store.loadPage('pg-1', withChild(), 7)

    expect(store.applyMarkerChange('pg-1', { seq: 3, markerOps: [] })).toBe('applied')
    expect(store.getState().headSeq).toBe(7)
  })

  it('문서가 없으면 아무것도 안 한다', () => {
    const store = new EditorStore()

    expect(store.applyMarkerChange('pg-1', { seq: 8, markerOps: ADD_MARKER })).toBe('skipped')
    expect(store.getState().headSeq).toBe(0)
  })

  /**
   * **번호를 바탕에도 남긴다**(P3-2 D3). 이 변경은 서버가 이미 기록한 것이므로, 바탕이
   * 그것을 모르면 **다음 리베이스가 번호 없는 문서 위에서 만들어져** 캔버스에서 번호가
   * 사라진다. 바탕은 스토어 밖에서 읽지 않으므로(`test/store-access-guard.ts`), 재는 것은
   * 그 값이 아니라 **다음 리베이스의 결과**다.
   */
  it('붙인 번호가 다음 리베이스 뒤에도 남는다 — 바탕에도 얹혔다는 뜻이다', () => {
    const store = new EditorStore()
    store.loadPage('pg-1', withChild(), 7)
    store.applyMarkerChange('pg-1', { seq: 8, markerOps: ADD_MARKER })

    store.applyRemoteChange('pg-1', {
      seq: 9,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_theirs', type: 'Text' } }],
      warnings: [],
    })

    expect(store.getState().document?.root.children?.[0]?.marker).toBe(1)
    expect(store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_a', 'n_theirs'])
  })
})

/**
 * **밖에서 온 루트 잠금은 그대로 존중한다 — `lockedBy`에 예외를 두지 않았다.**
 *
 * 화면은 루트로 잠금을 **보내지 않는다**(`realtime/use-node-lock.ts` — 루트 잠금은 페이지
 * 전체 잠금이고 §7.2의 서브트리 잠금이 뜻한 것이 아니다). 그래서 *"루트는 어차피 안
 * 잠기니 `lockedBy`도 예외로 두면 깔끔하다"*가 다음 사람에게 자연스러운 정리로 보인다.
 * **이 묶음이 그 정리를 막는 자리다.**
 *
 * **왜 막아야 하나.** `lockedBy`의 판정은 `@wirebound/schema`의 `findLockConflict`이고
 * **서버의 2차 방어가 부르는 바로 그 함수**다(`editor-store.ts`의 `lockedBy` 독블록).
 * 여기에만 예외를 두면 판정이 두 벌이 되어, 화면이 통과시킨 편집을 서버가 거절한다 —
 * 사용자는 값을 쳤는데 저장이 안 되고 **왜인지는 화면에 없다.**
 *
 * **그리고 루트 잠금은 실제로 도착할 수 있다.** 서버는 받은 것을 그대로 브로드캐스트하므로
 * (`apps/api/src/ws/lock.ts` — 루트 예외가 없다) 안 고친 탭·다른 클라이언트·옛 세션이 남긴
 * 것이 온다. **보내는 쪽을 고친 것이 받는 쪽의 계약을 바꾸지는 않는다.**
 *
 * **이 묶음이 서기 전에는 그 예외가 0 사망이었다** — 밖에서 온 루트 잠금을 쏘는 케이스가
 * 테스트 전체에 없었다(리뷰가 예외를 심어 보고 잡았다).
 */
describe('밖에서 온 루트 잠금 (§7.2 — 화면은 안 보내지만 받는다)', () => {
  const ROOT_LOCK = { pageId: 'pg-1', nodeId: 'n_root', userId: 'u_bora', userName: '보라' }

  it('이미 도착해 있으면 자동 선택도 막힌다 — 페이지 전체가 남의 것이다', () => {
    const store = new EditorStore()
    store.setViewer('u_dahye')
    store.setLocks([ROOT_LOCK])

    store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)

    // **판정이 그 잠금을 낸다.** 루트에 예외를 두면 이 줄이 먼저 죽는다.
    expect(store.lockedBy('n_root')).toMatchObject({ nodeId: 'n_root', userId: 'u_bora' })
    // 루트는 문서 전체의 조상이므로 자손도 전부 막힌다. **예외는 이 줄을 죽이지 않는다**
    // (자손의 경로가 잠금과 부딪치는 것은 그대로다) — 둘을 함께 두는 것이 요점이다.
    expect(store.lockedBy('n_a')).toMatchObject({ nodeId: 'n_root', userId: 'u_bora' })
    // 그래서 여는 경로의 루트 자동 선택도 막힌다(`#selectionFor`의 마지막 줄).
    expect(store.getState().selectedNodeId).toBeNull()

    // 손으로 눌러도 같다 — 막는 자리는 `selectNode` 하나다.
    store.selectNode('n_root')
    expect(store.getState().selectedNodeId).toBeNull()
    store.selectNode('n_a')
    expect(store.getState().selectedNodeId).toBeNull()
  })

  it('연 뒤에 도착해도 같다 — 고른 자리에서 움직이지 못한다', () => {
    const store = new EditorStore()
    store.setViewer('u_dahye')
    store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)
    expect(store.getState().selectedNodeId).toBe('n_root')

    store.setLocks([ROOT_LOCK])

    expect(store.lockedBy('n_root')).toMatchObject({ nodeId: 'n_root', userId: 'u_bora' })
    // 이미 고른 자리를 스토어가 되돌리지는 않는다(`setLocks`는 선택을 안 건드린다) — 대신
    // **어디로도 옮겨가지 못한다.** 그 상태가 화면에서 어떻게 보이는지는 이월에 적었다.
    store.selectNode('n_a')
    expect(store.getState().selectedNodeId).toBe('n_root')
  })

  it('내가 잡은 루트 잠금은 나를 막지 않는다 — 대조 (D3)', () => {
    const store = new EditorStore()
    store.setViewer('u_bora')
    store.setLocks([ROOT_LOCK])

    store.loadPage('pg-1', withChild('n_root', 'n_a'), 1)

    // 소유자가 나면 부딪치지 않으므로 자동 선택이 그대로 선다. 이 대조가 없으면
    // *"루트 잠금이 있으면 무조건 막는다"*는 구현도 위 둘을 통과한다.
    expect(store.lockedBy('n_root')).toBeNull()
    expect(store.getState().selectedNodeId).toBe('n_root')
  })
})
/**
 * **잠금 판정은 *"내가 누구인가"*를 모를 때 막는 쪽으로 기운다**(설계 §7.2 · P3-3 D3).
 *
 * 화면에서 `setViewer`는 이펙트라 **첫 렌더에 한 커밋 늦는다** — 그 창에서 `locks` 프레임이
 * 먼저 닿으면 `viewerUserId`가 아직 `null`이다. 그때 *"모르니까 통과시킨다"*로 두면 §7.2의
 * 1차 방어가 그 커밋 동안 통째로 사라지고, 사용자는 남이 편집 중인 노드를 고른다.
 *
 * **셸로는 이 갈래를 잴 수 없다** — `useNodeLock`이 언제나 `setViewer`를 부르므로 그 창이
 * 케이스로 재현되지 않는다(리뷰의 W5가 **0 사망**이던 이유다). 스토어를 직접 쥐면 잰다.
 */
describe('내가 누구인지 모를 때 (P3-3 D3)', () => {
  const LOCK = { pageId: 'pg-1', nodeId: 'n_a', userId: 'u_bora', userName: '보라' }

  function locked(): EditorStore {
    const store = new EditorStore()
    store.loadPage('pg-1', { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_a', type: 'Text', props: {} }] } }, 7)
    store.setLocks([LOCK])
    return store
  }

  it('`viewerUserId`가 없으면 **모든 잠금이 남의 것**이다 — 모르는 쪽에서는 막는다', () => {
    const store = locked()

    expect(store.getState().viewerUserId).toBeNull()
    expect(store.lockedBy('n_a')).toMatchObject({ nodeId: 'n_a', userId: 'u_bora', userName: '보라' })
    store.selectNode('n_a')
    // **막혔다는 것은 "선택이 없다"가 아니라 "옮겨가지 않았다"이다.** 잠금이 걸리기 전에
    // `loadPage`가 루트를 골라 두었으므로(위 `페이지를 열면 루트가 고른 상태다`) 그 자리가
    // 그대로 남는다 — `null`로 단언하면 이 테스트가 재는 것이 **거절**이 아니라 초기값이 된다.
    expect(store.getState().selectedNodeId).toBe('n_root')
  })

  it('누구인지 알게 되면 자기 잠금은 안 막는다 — 대조', () => {
    const store = locked()

    store.setViewer('u_bora')

    expect(store.lockedBy('n_a')).toBeNull()
    store.selectNode('n_a')
    expect(store.getState().selectedNodeId).toBe('n_a')
  })

  it('누구인지 알아도 **남의** 잠금은 막는다 — 대조의 대조', () => {
    const store = locked()

    store.setViewer('u_dahye')

    store.selectNode('n_a')
    // 위와 같은 이유로 루트가 남는다 — 재는 것은 `n_a`로 **옮겨가지 않았다**는 사실이다.
    expect(store.getState().selectedNodeId).toBe('n_root')
  })
})
