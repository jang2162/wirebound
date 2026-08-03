import type { ComponentDef } from './define'

const registry = new Map<string, ComponentDef>()

export function registerComponent(def: ComponentDef): void {
  if (registry.has(def.type)) {
    throw new Error(`이미 등록된 컴포넌트 타입: ${def.type}`)
  }
  registry.set(def.type, def)
}

export function getComponent(type: string): ComponentDef | undefined {
  return registry.get(type)
}

export function requireComponent(type: string): ComponentDef {
  const def = registry.get(type)
  if (!def) throw new Error(`알 수 없는 컴포넌트 타입: ${type}`)
  return def
}

export function listComponents(): ComponentDef[] {
  return [...registry.values()]
}

export function defaultStructure(def: ComponentDef): string {
  return def.structures[0]!
}

/** 테스트 전용. 프로덕션 코드에서 호출하지 않는다. */
export function resetRegistry(): void {
  registry.clear()
}
