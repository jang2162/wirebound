import type { WbNode } from '@wirebound/schema'
import type { ReactElement, ReactNode } from 'react'
import type { WbAttrs } from '../attrs'

export interface StructureContext {
  node: WbNode
  /** 기본값이 채워진 props */
  props: Record<string, unknown>
  attrs: WbAttrs
  part: (name: string) => { 'data-wb-part': string }
  /** 이미 렌더된 자식들 */
  children: ReactNode
  /** Slot 구조가 쓰는 주입 내용 */
  slot: ReactNode
}

export type StructureRenderer = (ctx: StructureContext) => ReactElement

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
