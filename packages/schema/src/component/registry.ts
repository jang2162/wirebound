import type { ComponentDef } from './define'

const registry = new Map<string, ComponentDef>()

export function registerComponent(def: ComponentDef): void {
  if (registry.has(def.type)) {
    throw new Error(`이미 등록된 컴포넌트 타입: ${def.type}`)
  }
  /**
   * **이름이 겹치는 것은 `defineComponent`가 볼 수 없다** — 그 함수는 정의 **하나**만 본다.
   * 겹침은 레지스트리에 둘이 들어온 뒤에야 성립하므로 타입 중복과 같은 자리에서 본다.
   *
   * **고르개에서 구별되지 않는 항목 둘이 되는 것**이 이 검사가 막는 것이다. 타입이 달라
   * 동작은 갈리는데 화면의 글자가 같으면 사용자가 어느 쪽을 골랐는지 알 수 없다 —
   * 타입명은 겹칠 수 없어도 사람이 읽는 이름(`label`)은 겹칠 수 있어서 생기는 고장이다.
   */
  const clash = [...registry.values()].find((other) => other.label === def.label)
  if (clash) {
    throw new Error(`이미 쓰이는 컴포넌트 이름: ${def.label} (${clash.type} · ${def.type})`)
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

/** 테스트 전용. 프로덕션 코드에서 호출하지 않는다. */
export function resetRegistry(): void {
  registry.clear()
}
