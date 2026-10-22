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
  children: ReactNode
  slot: ReactNode
}

export type View = ComponentType<ViewProps>

export interface ThemeDefinition {
  manifest: ThemeManifest
  views: Readonly<Partial<Record<string, View>>>
}
