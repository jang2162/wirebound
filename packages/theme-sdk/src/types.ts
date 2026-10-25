import type { ComponentType, ReactNode } from 'react'

export type Placement = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'start' | 'end'

/** 코멘트 번호 마커의 자리. 기준 상자는 `<Focus>` 가 있으면 그것, 없으면 뷰의 루트다. */
export interface MarkerSpec {
  placement?: Placement
  /** `[x, y]` CSS px. */
  offset?: readonly [number, number]
}

export type TokenType = 'color' | 'length' | 'number' | 'font' | 'shadow' | 'select'

export interface TokenDecl {
  type: TokenType
  label: string
  group?: string
  default: string | number
  options?: readonly string[]
}

export interface VariantDecl {
  id: string
  label: string
  hideProps?: readonly string[]
}

export interface ComponentDecl {
  variants: readonly VariantDecl[]
  defaultVariant: string
}

export interface ThemeManifest {
  id: string
  name: string
  description?: string
  version: string
  sdk: string
  preview?: string
  tokens: {
    groups?: readonly { id: string; label: string }[]
    items: Readonly<Record<string, TokenDecl>>
  }
  components?: Readonly<Record<string, ComponentDecl>>
}

export interface ViewProps<P extends Record<string, unknown> = Record<string, unknown>> {
  nodeId: string
  type: string
  props: P
  states: readonly string[]
  variant: string | undefined
  /** 몸통 구역(`body`)을 그린 것. 몸통을 부모에게 맡기는 타입(`TabPanel`)이면 `null` 이다. */
  children: ReactNode
  /**
   * 이름 붙은 구역마다 그린 것(카탈로그의 구역 선언 — `headEnd` · `actions` …). 빈 구역(보이는 자식이 없는 구역)은 `null`. **뷰는 직접 두지
   * 않고 `<Zone name>` 으로 둔다** — `Zone` 이 `data-wb-zone` 을 펴고 빈 구역은 감싸는 요소째 안 그린다.
   */
  zones: Readonly<Record<string, ReactNode>>
  /** 몸통의 자식을 하나씩 — 탭처럼 자식마다 머리와 내용을 가르는 뷰가 쓴다. 지금 보이는 자식만 든다(문서 차례). */
  items: readonly ViewItem[]
  /**
   * 이름 붙은 구역의 자식을 하나씩(SDK 1.7.0) — `items` 가 몸통의 것이듯 구역마다 보이는 자식만 문서 차례로 든다. 선언된 구역은 비어도 빈 목록이다.
   * 그리드 뷰가 «행» 구역의 행 props · 칸으로 배치를 셈한다(`gridLayout`). 구역을 그대로 두는 뷰는 `zones` 를 `<Zone>` 으로 둔다.
   */
  zoneItems: Readonly<Record<string, readonly ViewItem[]>>
  slot: ReactNode
  /**
   * 값 칸의 입력 조각이면 그 필드의 이름과 필수 — 렌더러가 `Field` 몸통의 입력 조각에만 싣는다(아니면 없다). 입력 칸만 훑는 보조 기술은 묶음
   * (`group`)의 이름을 지나지 않으므로 조각 뷰는 이것을 제 접근 이름 · `aria-required` 로 편다(SDK 기본 뷰가 그렇게 한다).
   */
  field?: ViewField
}

/** 값 칸 조각이 받는 필드 이름(`ViewProps.field`). */
export interface ViewField {
  /** 조각의 접근 이름 — 그 필드의 입력 조각이 하나면 라벨, 여럿이면 라벨 + 별칭(없으면 차례 — 1부터). 같은 필드의 조각끼리 갈린다. */
  name: string
  /** 그 필드가 필수인가(`Field.required`). */
  required: boolean
}

/** 자식 하나(`ViewProps.items` · `zoneItems`). */
export interface ViewItem {
  nodeId: string
  /** 그 자식의 타입(SDK 1.7.0). */
  type: string
  /** 그 자식이 선 배열(몸통 · 구역)의 자리 — 숨은 형제도 센다(`Tabs.active` 와 같은 축). */
  index: number
  /**
   * 그 자식의 props — 검증을 지나 기본값을 채운 값이고 겹layer · 펼쳐 보이기가 덮은 값이다(그 자식의 뷰가 받는 것과 같다). 규격에 안 맞는 자식(폴백)이면
   * 빈 객체(SDK 1.7.0).
   */
  props: Readonly<Record<string, unknown>>
  /** 그 자식을 그린 것(그 노드의 뿌리 요소). */
  element: ReactNode
  /** 그 자식의 몸통을 그린 것 — 자식이 제 몸통을 부모에게 맡기는 타입(`TabPanel`)일 때만, 아니면 `null`. */
  content: ReactNode
  /**
   * 그 자식의 몸통 자식(보이는 것만 · 문서 차례 — SDK 1.7.0). 열 묶음 › 열 › 셀 틀 · 행 › 칸처럼 손자의 props 로 배치를 셈하는 뷰가 쓴다. 몸통을
   * 부모에게 맡긴 자식이면 손자의 `element` 는 `content` 안의 그것과 같다. 읽을 때 짓는다.
   */
  items: readonly ViewItem[]
  /**
   * 그 자식(과 맡긴 몸통)을 **사본**으로 다시 그린 것(SDK 1.7.0) — 되풀이 행의 둘째 줄부터. 사본은 `data-wb-id` 대신 `data-wb-copy-of`(원본 id)를
   * 싣고, 뷰가 받는 `nodeId` 는 `<원본 id>~<열쇠>` 라 뷰가 짓는 HTML `id` 가 안 겹친다. 노드 속성 · 표지 · 상태 · 상호작용은 원본과 같다.
   * `row` 는 그 사본이 선 줄(1 부터) — 사본 안 입력 조각의 접근 이름에 « (n행)» 이 붙는다. 사본 안에서 다시 부르면 열쇠가 이어 붙는다.
   */
  copy(row: number): { element: ReactNode; content: ReactNode }
  /**
   * 그 자식이 덮는 칸 수 — 부모가 칸을 세는 배치(`Grid` · `FormTable` · 열을 정한 `SearchForm`)일 때만 있다. 몫(`WbNode.weight`)을 부모 열 수로
   * 자른 값이고 몫이 없으면 1 이다. 폼 표 뷰는 이것으로 줄을 지어 빈 쌍을 끼운다(`pairRows`).
   */
  span?: number
}

export type View = ComponentType<ViewProps>

export interface ThemeDefinition {
  manifest: ThemeManifest
  views: Readonly<Partial<Record<string, View>>>
}
