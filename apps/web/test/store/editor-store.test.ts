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
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { EditorStore, VIEWPORT_PRESETS, type ViewportWidth } from '../../src/store/editor-store'

/** 페이지 문서 최소형. 스토어는 내용을 해석하지 않으므로 루트 id만 구분되면 된다. */
function doc(rootId: string): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: rootId, type: 'Container' } }
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

  it('loadPage는 문서와 headSeq를 함께 넣는다', () => {
    const store = new EditorStore()
    const page = doc('n_root')
    store.loadPage(page, 42)
    // `toBe`인 것은 의도다 — 스토어는 문서를 복사하지 않고 받은 객체를 그대로 들고
    // 있는다. 문서는 크고, 스토어는 그 내용을 해석하지 않는다.
    expect(store.getState().document).toBe(page)
    expect(store.getState().headSeq).toBe(42)
  })

  it('loadPage는 이전 선택을 지운다', () => {
    const store = new EditorStore()
    store.loadPage(doc('n_a'), 1)
    store.selectNode('n_only_in_page_a')
    store.loadPage(doc('n_b'), 2)
    // 노드 id는 문서 안에서만 뜻이 있다. 남으면 선택 표시가 없는 노드를 가리킨다.
    expect(store.getState().selectedNodeId).toBeNull()
  })

  it('clearPage는 문서·headSeq·선택을 비운다', () => {
    const store = new EditorStore()
    store.loadPage(doc('n_a'), 9)
    store.selectNode('n_a')

    store.clearPage()

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
    store.loadPage(doc('n_a'), 9)
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

    store.loadPage(doc('n_a'), 3)
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
    store.loadPage(doc('n_a'), 9)
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
