/**
 * 카탈로그 prop 의 글 길이 상한 — 편집 칸이 서버보다 먼저 막는 한도(`apps/web/src/panels/property-panel.tsx` 의 `PropControl`). 정의의 zod 에서 읽는다 —
 * 칸이 한도를 글자로 옮겨 적으면 정의를 바꿀 때 칸만 낡아, 친 글이 422 → 다시 불러오기로 사라진다.
 */
import { z } from 'zod'
import type { ComponentDef } from './define'

/** 정의마다 한 번 짓는 JSON Schema(`input` 쪽 — 기본값이 붙은 prop 도 그 꼴 그대로다). */
const schemas = new WeakMap<object, JsonNode>()

interface JsonNode {
  type?: string
  maxLength?: number
  properties?: Record<string, JsonNode>
  items?: JsonNode
}

/**
 * 그 prop 안 한 자리의 글 상한. `path` 는 prop 이름 다음 `'[]'`(배열 원소) · 칸 이름을 잇는다 — `['maxSize']` · `['files', '[]', 'name']`. 글이 아니거나
 * 상한이 없으면 `undefined`.
 *
 * **단위는 UTF-16 이다** — zod `.max()` 가 `length` 로 센다(이모지 하나가 둘). 코드 포인트로 세는 한도(별칭 — `NODE_ALIAS_MAX`)와 다르다.
 */
export function propTextMax(def: ComponentDef | undefined, path: readonly string[]): number | undefined {
  if (def === undefined) return undefined
  let schema = schemas.get(def.props)
  if (schema === undefined) {
    schema = z.toJSONSchema(def.props, { io: 'input', unrepresentable: 'any' }) as JsonNode
    schemas.set(def.props, schema)
  }
  let at: JsonNode | undefined = schema
  for (const step of path) at = step === '[]' ? at?.items : at?.properties?.[step]
  return at?.type === 'string' ? at.maxLength : undefined
}
