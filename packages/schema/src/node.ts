/** 상호작용 트리거. 설계서 「모델」(상호작용) */
export type InteractionTrigger = 'click' | 'change' | 'select' | 'submit'

/** 상호작용 액션. 고정 5종이며 스크립트는 허용하지 않는다. */
export type InteractionAction =
  | { type: 'setProp'; target: string; prop: string; value: unknown }
  | { type: 'setVisible'; target: string; value: boolean }
  | { type: 'switchTab'; target: string; tab: number }
  | { type: 'navigate'; target: string }
  | { type: 'openModal'; target: string }

export interface Interaction {
  on: InteractionTrigger
  actions: InteractionAction[]
}

/**
 * 페이지·레이아웃 스키마의 노드.
 * id는 생성 후 바뀌지 않으며 코멘트·상호작용·잠금·패치 경로의 공통 앵커다.
 */
export interface WbNode {
  id: string
  type: string
  props?: Record<string, unknown>
  variant?: string
  marker?: number
  interactions?: Interaction[]
  children?: WbNode[]
}

declare const documentKind: unique symbol

/**
 * 페이지 문서. 렌더링 시 레이아웃의 Slot 자리에 주입된다.
 *
 * `documentKind`는 컴파일 타임 전용 팬텀 프로퍼티다. 런타임 값이 없고
 * JSON 직렬화에도 나타나지 않는다. LayoutDocument와 뒤바뀌는 것을
 * 컴파일러가 잡게 하려고 존재한다.
 */
export interface PageDocument {
  version: number
  root: WbNode
  readonly [documentKind]?: 'page'
}

/** 레이아웃 문서. Slot 노드를 정확히 하나 품는다 (설계서 「레이아웃」). */
export interface LayoutDocument {
  version: number
  root: WbNode
  readonly [documentKind]?: 'layout'
}

/** 페이지와 레이아웃 양쪽을 받는 함수의 파라미터 타입. */
export type AnyDocument = PageDocument | LayoutDocument

const HEX = '0123456789abcdef'

/** `n_` + 소문자 hex 12자 형식의 노드 id를 만든다. */
export function createNodeId(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  let out = 'n_'
  for (const byte of bytes) {
    out += HEX[byte >> 4]! + HEX[byte & 0x0f]!
  }
  return out
}
