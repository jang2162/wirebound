/**
 * 테마 경로의 노드 하나. 뷰를 React 컴포넌트로 그리고, 뷰 본문의 실패를 그 노드 자리에 가둔다.
 *
 * 뷰는 렌더러 밖에서 온 코드다(테마 패키지). 구조 경로와 달리 여기서는 **노드마다 경계를 둔다** — 뷰가 훅을 쓰므로
 * 컴포넌트로 그려야 하고, 그러면 예외가 렌더 중이 아니라 React 가 그 컴포넌트를 그릴 때 나서 `renderNodeIn` 의
 * 동기 흐름 밖이다. 경계가 없으면 뷰 하나의 버그가 캔버스 전체를 지운다.
 *
 * **뷰 계약 — 뷰는 첫 렌더에 `Root` 를 반환한다.** 마운트 뒤(이펙트 · 상태)에 가서야 `Root` 를 그리는 뷰는 누락으로 판정되어
 * 기본 뷰로 그려지고 `console.error` 로 경고가 난다 — 판정을 되돌려 다시 불러도 새로 마운트되어 또 첫 렌더에 `Root` 가 없다.
 */
import { Component, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import { NodeContext, type NodeBinding, type View, type ViewProps } from '@wirebound/theme-sdk'
import { FallbackNode } from './fallback'

interface BoundaryProps {
  nodeId: string
  /** 바뀌면 다시 그려 본다 — 편집으로 뷰가 던지지 않게 된 노드가 폴백에 갇히지 않게. */
  resetKey: unknown
  children: ReactNode
  fallbackChildren: ReactNode
}

class NodeBoundary extends Component<BoundaryProps, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    return { message: `테마 뷰가 던졌습니다: ${error instanceof Error ? error.message : String(error)}` }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.message !== null && prev.resetKey !== this.props.resetKey) this.setState({ message: null })
  }

  render() {
    if (this.state.message !== null) {
      return (
        <FallbackNode nodeId={this.props.nodeId} message={this.state.message}>
          {this.props.fallbackChildren}
        </FallbackNode>
      )
    }
    return this.props.children
  }
}

interface HostProps {
  view: View
  fallbackView: View
  binding: Omit<NodeBinding, 'markRootRendered'>
  viewProps: ViewProps
  nodeId: string
}

/**
 * 누락 판정을 되돌릴지 가르는 값 — 노드 **자신의** 입력(type · variant · states · props)이다. 문서의 값이라 JSON 으로 적힌다.
 *
 * 참조로 견주지 않는다: `viewProps` 는 문서를 그릴 때마다 새 객체이고 `props` 도 매번 새로 파싱돼, 형제만 고친 편집에서도
 * «바뀌었다» 가 되어 멀쩡히 누락인 뷰를 다시 불러 경고를 되풀이한다. `children` · `slot` 은 넣지 않는다 — 자손 편집마다 새
 * 엘리먼트라 같은 까닭으로 되풀이한다.
 */
function inputsKey(viewProps: ViewProps): string {
  return JSON.stringify([viewProps.type, viewProps.variant, viewProps.states, viewProps.props])
}

/**
 * `Root` 를 그렸는지 본다. 안 그렸으면 `data-wb-id` 가 없어 캔버스가 그 노드를 못 고르므로 기본 뷰로 다시 그린다 —
 * 호스트는 화면을 잃지 않는 쪽이다(작성 중에 던지는 판은 A2 의 `wb-theme dev` 가 맡는다).
 *
 * **판정은 노드의 입력이 바뀌면 되돌린다** — 편집으로 `Root` 를 그리게 된 뷰가 기본 뷰에 갇히지 않게 테마 뷰를 다시 불러 본다.
 * 입력이 그대로면(형제만 고친 편집) 다시 부르지 않는다(`inputsKey`).
 */
function Guarded(props: HostProps): ReactElement {
  const rendered = useRef(false)
  rendered.current = false
  /** 누락을 판정했을 때의 입력(`inputsKey`). 누락이 아니면 `null`. */
  const [missingAt, setMissingAt] = useState<string | null>(null)
  // 누락인 동안에만 값을 만든다 — 멀쩡한 노드마다 렌더 때 직렬화하지 않는다.
  const key = missingAt === null ? null : inputsKey(props.viewProps)
  // 렌더 중 상태 조정 — 이펙트로 되돌리면 입력이 바뀐 첫 커밋이 기본 뷰로 한 번 그려진다.
  if (missingAt !== null && key !== missingAt) setMissingAt(null)
  const missing = missingAt !== null && key === missingAt
  useLayoutEffect(() => {
    if (!missing && !rendered.current) {
      console.error(`${props.viewProps.type} 테마 뷰가 Root 를 그리지 않아 기본 뷰로 대신 그렸습니다 (노드 ${props.nodeId})`)
      setMissingAt(inputsKey(props.viewProps))
    }
  })
  const View = missing ? props.fallbackView : props.view
  const binding: NodeBinding = {
    ...props.binding,
    markRootRendered: () => {
      rendered.current = true
    },
  }
  return (
    <NodeContext.Provider value={binding}>
      <View {...props.viewProps} />
    </NodeContext.Provider>
  )
}

export function ViewHost(props: HostProps): ReactElement {
  return (
    <NodeBoundary nodeId={props.nodeId} resetKey={props.viewProps} fallbackChildren={props.viewProps.children}>
      <Guarded {...props} />
    </NodeBoundary>
  )
}
