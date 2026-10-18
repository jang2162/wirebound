import { createContext, useContext, type ReactElement, type ReactNode, type SyntheticEvent } from 'react'

export interface NodeBinding {
  /** 루트에 펼 것 — `data-wb-*` 속성(문자열)과, 상호작용 런타임이 켜졌으면 `onClick`·`onChange`·`onSubmit`. */
  attrs: Readonly<Record<string, string | ((event: SyntheticEvent) => void) | undefined>>
  /**
   * 부모 안에서의 몫 — 렌더러가 부모를 보고 정한 값이다(`Flex` 면 노드의 `weight` 그대로, `Grid` · 열을 정한 `SearchForm` 이면 부모 열 수로
   * 자른 칸 수, 그 밖이면 없음). `Root` 가 `--wb-node-weight` 로 싣는다. 속성(`data-wb-*`)이 아니라 값으로 넘기는 까닭은 렌더러의
   * `render.tsx` 머리말(노드 속성 계약을 넓히지 않는다).
   */
  weight?: number
  /** 렌더러의 `ViewHost` 가 «Root 가 그려졌나» 를 보는 통로. */
  markRootRendered: () => void
}

export const NodeContext = createContext<NodeBinding | null>(null)

/**
 * 뷰가 그리는 노드의 입력 — `view()` 가 내리고 `Root` 가 prop 표지 · 상태의 접근성 속성(`./marks.ts`)을 지어 편다. `nodeId` 를 함께 싣는
 * 까닭: `view()` 를 거치지 않은 뷰(맨 함수)의 `Root` 는 부모 노드의 문맥을 읽게 된다 — `Root` 가 제 노드 id(`NodeBinding.attrs`)와
 * 견줘 다르면 안 편다.
 */
export interface ViewNode {
  nodeId: string
  type: string
  props: Readonly<Record<string, unknown>>
  states: readonly string[]
}

export const ViewNodeContext = createContext<ViewNode | null>(null)

export interface ThemeRuntimeValue {
  tokens: Readonly<Record<string, string | number>>
  /** 문서가 그려지는 창. 캔버스에서는 iframe 의 창이고 전역 `window` 와 다르다. */
  window: Window
}

const ThemeContext = createContext<ThemeRuntimeValue | null>(null)

export function ThemeProvider(props: { value: ThemeRuntimeValue; children: ReactNode }): ReactElement {
  return <ThemeContext.Provider value={props.value}>{props.children}</ThemeContext.Provider>
}

export function useToken(key: string): string | number | undefined {
  return useContext(ThemeContext)?.tokens[key]
}

export function useWindow(): Window {
  return useContext(ThemeContext)?.window ?? window
}
