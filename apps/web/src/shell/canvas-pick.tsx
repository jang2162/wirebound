/**
 * **캔버스에서 사람이 노드를 눌러 골랐다는 신호** — 우측 패널이 그것을 받아 «컴포넌트» 탭으로 옮긴다(`routes/editor.tsx`의 `RightPanel`).
 *
 * **스토어의 고름을 지켜보지 않는다.** 노드를 고르는 길은 여럿이다 — 캔버스 누름 · 구조 트리 줄 · 키보드 · 넣은 뒤 저절로 고름 · 되돌리기.
 * 탭을 옮기는 것은 «화면에서 누름» 하나뿐이라, `selectedNodeId`가 바뀔 때 옮기면 트리 줄을 눌러도 탭이 옮긴다(코멘트 탭에 머문 채 트리로
 * 노드를 골라 코멘트를 보는 길이 닫힌다). 그래서 누른 자리(`canvas/canvas.tsx`)가 직접 알린다.
 *
 * provider 가 없으면(캔버스만 세운 케이스) 알림은 아무 데도 안 간다.
 */
import { createContext, useContext, useEffect, useMemo, type ReactElement, type ReactNode } from 'react'

interface CanvasPick {
  tell: () => void
  listen: (listener: () => void) => () => void
}

const CanvasPickContext = createContext<CanvasPick | null>(null)

export function CanvasPickProvider(props: { children: ReactNode }): ReactElement {
  const value = useMemo<CanvasPick>(() => {
    const listeners = new Set<() => void>()
    return {
      tell: () => {
        for (const listener of listeners) listener()
      },
      listen: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }, [])
  return <CanvasPickContext.Provider value={value}>{props.children}</CanvasPickContext.Provider>
}

const NOBODY = (): void => {}

/** 캔버스가 «사람이 눌러 골랐다» 를 알리는 함수. */
export function useTellCanvasPick(): () => void {
  return useContext(CanvasPickContext)?.tell ?? NOBODY
}

/** 그 알림을 받는다 — `listener`는 안정된 함수로 준다(바뀔 때마다 다시 단다). */
export function useOnCanvasPick(listener: () => void): void {
  const pick = useContext(CanvasPickContext)
  useEffect(() => pick?.listen(listener), [pick, listener])
}
