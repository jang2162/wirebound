import type { CodeBinding, ComponentDef } from './define'
import { getComponent } from './registry'

/** 그 타입이 공통코드에 묶이는 꼴 — 모르는 타입 · 묶이지 않는 타입은 `null`. */
export function codeBindingOf(type: string): CodeBinding | null {
  return getComponent(type)?.code ?? null
}

/**
 * 선택지를 하나만 고르는 타입인가 — 선택지 칸의 `select` 선언(`EditorField.select`)이 정본이다(`Select` · `RadioGroup`). 묶인 선택 위젯의
 * `code.selected` 가 0 ~ 1 개여야 하는 근거이고, 속성 패널 공통코드 카드의 «고른 값»도 이것을 본다.
 */
export function picksOneChoice(def: ComponentDef): boolean {
  return def.editor.some((field) => field.prop === 'options' && field.select === 'one')
}
