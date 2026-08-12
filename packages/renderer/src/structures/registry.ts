import type { WbNode } from '@wirebound/schema'
import type { ReactElement, ReactNode } from 'react'
import type { WbAttrs, WbHandlers } from '../attrs'

export interface StructureContext {
  node: WbNode
  /** 기본값이 채워진 props */
  props: Record<string, unknown>
  /**
   * 노드 루트에 펼칠 것. **여섯 속성(§6.11)에 상호작용 핸들러가 얹힐 수 있다** — 뒤엣것은
   * 상호작용 런타임이 켜졌고 이 노드에 규칙이 있을 때만 있다(`attrs.ts`의 `WbHandlers`).
   * 구조 구현체는 둘을 가르지 않고 그대로 편다.
   */
  attrs: WbAttrs & WbHandlers
  part: (name: string) => { 'data-wb-part': string }
  /** 이미 렌더된 자식들 */
  children: ReactNode
  /** Slot 구조가 쓰는 주입 내용 */
  slot: ReactNode
}

export type StructureRenderer = (ctx: StructureContext) => ReactElement

/**
 * 그룹 모듈이 내보내는 등록 항목 하나.
 *
 * **타입이 여기 있는 이유:** 그룹 다섯이 이 모양을 함께 쓰는데, 그중 하나에 두면 나머지
 * 넷이 그 그룹을 import하게 되어 **경계가 없는 것과 같아진다**(P4b-2 ①이 가른 것이 바로
 * 그 경계다). 레지스트리는 다섯 모두가 이미 `StructureRenderer` 때문에 보는 자리다.
 */
export type StructureEntry = [type: string, structure: string, render: StructureRenderer]

const structures = new Map<string, StructureRenderer>()

function key(type: string, structure: string): string {
  return `${type}:${structure}`
}

export function registerStructure(
  type: string,
  structure: string,
  render: StructureRenderer,
): void {
  const id = key(type, structure)
  if (structures.has(id)) {
    throw new Error(`이미 등록된 구조: ${id}`)
  }
  structures.set(id, render)
}

export function getStructure(type: string, structure: string): StructureRenderer | undefined {
  return structures.get(key(type, structure))
}

export function requireStructure(type: string, structure: string): StructureRenderer {
  const render = structures.get(key(type, structure))
  if (!render) {
    throw new Error(`구현되지 않은 구조: ${key(type, structure)}`)
  }
  return render
}

export function listStructureKeys(): string[] {
  return [...structures.keys()]
}

/** 테스트 전용. 프로덕션 코드에서 호출하지 않는다. */
export function resetStructures(): void {
  structures.clear()
}
