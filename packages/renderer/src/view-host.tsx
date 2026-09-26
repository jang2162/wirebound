/**
 * 테마 경로의 노드 하나. 뷰를 React 컴포넌트로 그리고, 뷰 본문의 실패를 그 노드 자리에 가둔다.
 *
 * 뷰는 렌더러 밖에서 온 코드다(테마 패키지). 구조 경로와 달리 여기서는 **노드마다 경계를 둔다** — 뷰가 훅을 쓰므로
 * 컴포넌트로 그려야 하고, 그러면 예외가 렌더 중이 아니라 React 가 그 컴포넌트를 그릴 때 나서 `renderNodeIn` 의
 * 동기 흐름 밖이다. 경계가 없으면 뷰 하나의 버그가 캔버스 전체를 지운다.
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
 * `Root` 를 그렸는지 본다. 안 그렸으면 `data-wb-id` 가 없어 캔버스가 그 노드를 못 고르므로 기본 뷰로 다시 그린다 —
 * 호스트는 화면을 잃지 않는 쪽이다(작성 중에 던지는 판은 A2 의 `wb-theme dev` 가 맡는다).
 */
function Guarded(props: HostProps): ReactElement {
  const rendered = useRef(false)
  rendered.current = false
  const [missing, setMissing] = useState(false)
  useLayoutEffect(() => {
    if (!missing && !rendered.current) {
      console.error(`${props.viewProps.type} 테마 뷰가 Root 를 그리지 않아 기본 뷰로 대신 그렸습니다 (노드 ${props.nodeId})`)
      setMissing(true)
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
