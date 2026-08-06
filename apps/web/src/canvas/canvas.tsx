/**
 * 캔버스 안쪽 — 스토어의 문서를 렌더러로 그리고, 눌러서 노드를 고르고, 선택을 아웃라인으로
 * 보여 준다. 바깥 상자(뷰포트 폭·줌·조회 상태별 안내)는 `routes/editor.tsx`의
 * `CanvasFrame`이다.
 *
 * **문서는 스토어에서 읽는다.** 여기서 `getPage`를 부르지 않는 이유는 `CanvasFrame`의
 * 주석에 있다 — 요지는 "주소가 열린 페이지의 단일 진실"이고, 스토어의 문서는 지금 열려
 * 있는 페이지의 것이거나 비어 있다는 것이다. 그 성질 덕분에 여기서는 문서가 어느
 * 페이지의 것인지 다시 확인하지 않는다.
 *
 * **D7 — 이 파일이 그리는 것 중 문서 안쪽에 스타일을 주는 것은 없다.** 설계서 내용의
 * 외형은 P4a의 테마 CSS가 전담한다. 그래서 셸의 클래스가 붙는 것은 문서를 **감싸는**
 * 상자(`wb-shell-canvas-surface`)와 문서 **옆에** 그려지는 셸의 장치 둘
 * (`wb-shell-selection`·`wb-shell-canvas-error`)뿐이고, 셋 다 문서 노드를 겨냥하지
 * 않는다. 자세한 근거는 `shell.css` 머리말의 D7 절에 있다.
 */
import {
  Component,
  useLayoutEffect,
  useRef,
  useState,
  type ErrorInfo,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { renderDocument, type NodeRenderError } from '@wirebound/renderer'
import type { PageDocument } from '@wirebound/schema'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'
// 카탈로그·구조 구현체가 없으면 모든 노드가 폴백으로 그려진다. 설치는 import만으로
// 끝난다 — 그 모듈의 주석 참고.
import '../catalog-setup'

/** 선택 아웃라인이 덮을 자리. 프레임의 배율을 걷어 낸 **문서 좌표계**의 값이다. */
interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 스토어의 문서를 그린다. **`CanvasFrame`의 `ready` 분기에서만 쓴다** — 조회 중·실패
 * 상태의 안내는 그쪽이 그린다.
 *
 * 문서가 없으면 아무것도 그리지 않는다. 그 상태(페이지 미선택·조회 중·조회 실패)를
 * 갈라 안내하는 것은 `CanvasFrame`의 몫이고, 여기서 또 문안을 내면 같은 자리에 두 개가
 * 겹친다.
 */
export function Canvas(): ReactElement | null {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다. 상태 객체 전체(`(s) => s`)를 고르면 어느 필드가 바뀌든
  // 다시 그린다 — `use-editor-store.tsx`의 주석 참고.
  const doc = useEditorStore(store, (s) => s.document)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const mode = useEditorStore(store, (s) => s.mode)
  const zoom = useEditorStore(store, (s) => s.zoom)
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)

  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  // 아웃라인은 편집 모드에만 있다(설계 §9 — 뷰 모드는 결과만 보여 준다). 선택 자체는
  // 남는다. 뷰 모드에서 선택을 지우면 모드를 오갈 때마다 고른 것이 사라진다.
  const outlinedNodeId = mode === 'edit' ? selectedNodeId : null

  /**
   * 선택된 노드의 자리를 재서 아웃라인 상자에 싣는다.
   *
   * `useLayoutEffect`인 것은 그려진 뒤 한 프레임 늦게 아웃라인이 따라붙는 것을 막기
   * 위해서다. **여기서 재는 것은 문서의 DOM이므로 이펙트 말고는 잴 자리가 없다** —
   * 렌더 중에는 아직 커밋되지 않았다.
   *
   * 값이 같으면 `prev`를 그대로 돌려준다. 매번 새 객체를 넣으면 상태가 바뀐 것으로
   * 보여 렌더 → 이펙트 → 렌더가 멈추지 않는다.
   */
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    const target =
      surface !== null && outlinedNodeId !== null ? findNodeElement(surface, outlinedNodeId) : null

    if (surface === null || target === null) {
      setBox(null)
      return
    }

    const next = measure(target, surface, zoom)
    setBox((prev) => (sameBox(prev, next) ? prev : next))
    // `doc`·`viewportWidth`가 의존성에 있는 것은 둘이 바뀌면 노드의 자리가 바뀌기
    // 때문이다. `zoom`은 자리를 바꾸지는 않지만 아래 계산이 그 값을 쓴다.
  }, [outlinedNodeId, doc, zoom, viewportWidth])

  if (doc === null) return null

  return (
    <div
      className="wb-shell-canvas-surface"
      ref={surfaceRef}
      // 노드마다 핸들러를 다는 대신 상자 하나에서 받는다. 렌더러가 만든 DOM에는 핸들러를
      // 끼워 넣을 자리가 없고(구조 구현체가 그리는 것은 평범한 태그다), 있더라도 노드
      // 수만큼 핸들러가 생긴다. 누른 자리에서 가장 가까운 노드를 찾는 일은
      // `nodeIdAt`이 한다.
      onClick={(event: MouseEvent<HTMLDivElement>) =>
        store.selectNode(nodeIdAt(event.target, event.currentTarget))
      }
    >
      <CanvasBoundary resetKey={doc}>
        <CanvasDocument doc={doc} />
      </CanvasBoundary>

      {/* 아웃라인은 문서 **옆에** 그린다. 노드에 클래스나 스타일을 얹으면 셸이 테마의
          자리를 침범하고(D7), 낙관적 패치가 노드를 갈아 끼울 때마다 다시 얹어야 한다.
          `pointer-events: none`이라 아래의 노드가 그대로 눌린다.

          조건이 둘인 것은 `box`만 보면 모드가 뷰로 바뀐 렌더와 그것을 지우는 레이아웃
          이펙트 사이에서 **id 없는 아웃라인**이 한 번 만들어지기 때문이다(레이아웃
          이펙트라 그려지기 전에 지워지지만, 만들지 않는 편이 낫다). */}
      {outlinedNodeId !== null && box !== null && (
        <div
          className="wb-shell-selection"
          data-wb-selected-id={outlinedNodeId}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
    </div>
  )
}

/**
 * 문서를 실제로 그리는 자리. `Canvas`에서 갈라 둔 이유는 **오류 경계 때문**이다.
 *
 * `renderDocument`는 구조 구현체를 그 자리에서 부른다(엘리먼트를 만드는 함수이지
 * 컴포넌트가 아니다). 그래서 그 호출이 `Canvas`의 렌더 본문에 있으면 경계보다 **위에서**
 * 던지는 셈이 되어 경계가 잡지 못한다. 호출을 경계 **안쪽 컴포넌트**로 내려야 잡힌다.
 */
function CanvasDocument(props: { doc: PageDocument }): ReactElement {
  /**
   * 렌더 중에 모은다. `onNodeError` 안에서 `setState`를 부르면 안 되고(렌더러 주석),
   * `renderDocument`가 돌아온 시점에는 트리 전체의 오류가 이미 이 배열에 들어 있다.
   * 렌더마다 새 배열이므로 StrictMode의 이중 렌더에서도 누적되지 않는다.
   */
  const errors: NodeRenderError[] = []
  const tree = renderDocument(props.doc, { onNodeError: (error) => errors.push(error) })

  return (
    <>
      {errors.length > 0 && (
        <div className="wb-shell-canvas-error" role="alert">
          <p className="wb-shell-canvas-error-title">
            노드 {errors.length}개를 그리지 못했습니다
          </p>
          <ul className="wb-shell-canvas-error-list">
            {/* 키가 인덱스인 것은 이 목록이 렌더마다 새로 만들어지고 상태를 갖는 자식이
                없기 때문이다. 노드 id는 키가 될 수 없다 — 모양 가드가 흡수한 폴백은
                id가 빈 문자열이라 서로 겹친다. */}
            {errors.map((error, index) => (
              <li key={index} className="wb-shell-canvas-error-item">
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {tree}
    </>
  )
}

/** 오류 경계의 상태. 메시지가 있으면 그 문장을 대신 그린다. */
interface BoundaryState {
  message: string | null
}

/**
 * 문서를 그리다 던진 예외를 잡는다.
 *
 * **렌더러는 노드가 잘못된 정도로는 던지지 않는다** — 폴백으로 흡수하고 `onNodeError`로
 * 알린다. 남아 있는 던지는 경로는 하나, **구조 구현체 본문의 예외**다. 렌더러가 그것을
 * 일부러 감싸지 않으므로(감싸면 진짜 버그가 "폴백이 떴네"로 위장된다) 잡는 일이 캔버스
 * 몫이라고 `packages/renderer/src/render.tsx`의 주석이 못박고 있다. 경계가 없으면 구조
 * 구현체 하나의 버그가 앱 트리 전체를 흰 화면으로 만든다.
 *
 * `resetKey`가 바뀌면 다시 그려 본다. 그러지 않으면 한 번 던진 뒤로는 다른 페이지를 열어도
 * 오류 문장이 남는다. 문서 객체의 동일성을 키로 쓰는 것은 스토어가 문서를 갈아 끼울 때만
 * 새 객체가 되기 때문이다(`editor-store.ts`).
 */
class CanvasBoundary extends Component<
  { resetKey: PageDocument; children: ReactNode },
  BoundaryState
> {
  override state: BoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 사용자에게는 문장 하나만 보이므로, 원인을 찾을 사람을 위해 콘솔에 남긴다.
    console.error('캔버스가 문서를 그리지 못했습니다', error, info.componentStack)
  }

  override componentDidUpdate(prev: { resetKey: PageDocument }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.message !== null) {
      this.setState({ message: null })
    }
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children

    return (
      <div className="wb-shell-canvas-error" role="alert">
        <p className="wb-shell-canvas-error-title">이 페이지를 그리지 못했습니다</p>
        <p className="wb-shell-canvas-error-item">{this.state.message}</p>
      </div>
    )
  }
}

/**
 * 누른 자리에서 가장 가까운 노드의 id. 노드 위가 아니면 `null`이다 — 빈 자리를 누르면
 * 선택이 풀린다.
 *
 * **빈 `data-wb-id`는 건너뛴다.** 렌더러의 모양 가드가 흡수한 폴백은 id를 문자열로 읽지
 * 못한 노드라 빈 문자열을 단다(`packages/renderer/src/fallback.tsx`). 그것을 그대로
 * 넣으면 스토어에는 선택이 있는데 가리키는 노드는 없는 상태가 된다.
 */
function nodeIdAt(target: EventTarget | null, surface: HTMLElement): string | null {
  let element = target instanceof Element ? target : null

  while (element !== null && surface.contains(element)) {
    const id = element.getAttribute('data-wb-id')
    if (id !== null && id !== '') return id
    element = element.parentElement
  }

  return null
}

/**
 * 캔버스 안에서 그 id를 가진 노드의 엘리먼트.
 *
 * `querySelector('[data-wb-id="…"]')`를 쓰지 않는 것은 id가 문서에서 온 임의의
 * 문자열이기 때문이다 — 따옴표나 역슬래시가 섞이면 셀렉터 문법이 깨진다.
 */
function findNodeElement(surface: HTMLElement, nodeId: string): HTMLElement | null {
  for (const element of surface.querySelectorAll<HTMLElement>('[data-wb-id]')) {
    if (element.getAttribute('data-wb-id') === nodeId) return element
  }
  return null
}

/**
 * 노드가 덮는 자리를 상자 좌표로 옮긴다.
 *
 * 두 사각형 모두 화면 좌표라 프레임의 `scale(zoom)`이 이미 곱해져 있다. 그래서 차를
 * `zoom`으로 나눠 **문서 좌표계**로 되돌린다 — 아웃라인은 프레임 안에 있어 같은 배율을
 * 한 번 더 받기 때문이다. 스크롤은 두 사각형에 똑같이 실리므로 차를 쓰면 상쇄된다.
 */
function measure(target: HTMLElement, surface: HTMLElement, zoom: number): Box {
  const node = target.getBoundingClientRect()
  const base = surface.getBoundingClientRect()

  return {
    left: (node.left - base.left) / zoom,
    top: (node.top - base.top) / zoom,
    width: node.width / zoom,
    height: node.height / zoom,
  }
}

function sameBox(a: Box | null, b: Box): boolean {
  return (
    a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
  )
}
