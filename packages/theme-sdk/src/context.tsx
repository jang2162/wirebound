import { createContext, useContext, type ReactElement, type ReactNode, type SyntheticEvent } from 'react'

export interface NodeBinding {
  attrs: Record<string, string | undefined> &
    Partial<Record<'onClick' | 'onChange' | 'onSubmit', (event: SyntheticEvent) => void>>
  /** 렌더러의 `ViewHost` 가 «Root 가 그려졌나» 를 보는 통로. */
  markRootRendered: () => void
}

export const NodeContext = createContext<NodeBinding | null>(null)

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
