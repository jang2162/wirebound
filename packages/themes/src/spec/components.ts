import { defaultStructure, getComponent } from '@wirebound/schema'
import type { ComponentDef } from '@wirebound/schema'
import { z } from 'zod'
import type { ThemeIssue } from '../issue'
import { issue } from '../issue'
import { styleDeclarations, type PrimitiveTable } from '../resolve/style'
import type { TokenTable } from '../resolve/tokens'
import type { CssDeclaration, ResolvedComponent, ResolvedLayer } from '../resolved'
import { handleOverwriteMessage, overwrittenHandles } from './handles'

/** 스타일 어휘 → 값. 이름이 설계서 「스타일 프로퍼티 화이트리스트」 안인지는 zod가 아니라 `styleDeclarations`가 본다. */
const StyleMapSchema = z.record(z.string(), z.union([z.string(), z.number()]))

/**
 * `variants`·`states`·`responsive`의 항목 하나.
 *
 * `base`·`parts` 말고 **스타일 프로퍼티를 바로 쓰는 축약**을 받는다. 설계서 「components —
 * 구조 + 스킨」의
 * `states.disabled`가 `{ "opacity": 0.5 }`이고 `responsive.md`가 `{ "base": { … } }`이므로
 * 둘 다 받아야 예시가 통과한다. **모호하지 않은 근거는 두 키 집합이 서로 겹치지 않는다는
 * 것**이다 — `base`·`parts`는 「스타일 프로퍼티 화이트리스트」의 프로퍼티 이름이 아니다(`test/spec-components.test.ts`가
 * 그것을 잰다).
 */
const LayerSchema = z
  .object({
    base: StyleMapSchema.optional(),
    parts: z.record(z.string(), StyleMapSchema).optional(),
  })
  .catchall(z.union([z.string(), z.number()]))

export type ThemeStyleMap = Record<string, string | number>

export interface ThemeLayer {
  base?: ThemeStyleMap
  parts?: Record<string, ThemeStyleMap>
  [prop: string]: unknown
}

export interface ThemeComponent {
  /** 생략하면 `structures[0]`이 기본이다(`ComponentDef`의 주석: *"첫 번째가 기본 구조"*). */
  structure?: string
  base?: ThemeStyleMap
  parts?: Record<string, ThemeStyleMap>
  variants?: Record<string, ThemeLayer>
  states?: Record<string, ThemeLayer>
  /**
   * 브레이크포인트별 오버라이드. 「components — 구조 + 스킨」의 예시가 `base`만 보여 주므로 **`variants`·`states`를
   * 안쪽에 다시 받지 않는다** — 층을 겹치는 것은 설계가 주지 않은 확장이다.
   */
  responsive?: Record<string, ThemeLayer>
}

export const ComponentSchema: z.ZodType<ThemeComponent> = z.strictObject({
  structure: z.string().min(1).optional(),
  base: StyleMapSchema.optional(),
  parts: z.record(z.string(), StyleMapSchema).optional(),
  variants: z.record(z.string(), LayerSchema).optional(),
  states: z.record(z.string(), LayerSchema).optional(),
  responsive: z.record(z.string(), LayerSchema).optional(),
})

export const ComponentsSchema: z.ZodType<Record<string, ThemeComponent>> = z.record(
  z.string(),
  ComponentSchema,
)

/**
 * 테마의 `components`를 **카탈로그와 대조**한다.
 *
 * 대조 대상은 `schema`의 `ComponentDef`다 — `structures`·`parts`·`variants`·`states`를
 * **선언**하는 것이 거기이고(설계서 「컴포넌트 정의 구조」: *"여기 선언된 것이 곧 테마가 쓸 수 있는 어휘다"*),
 * 렌더러의 레지스트리는 그 선언을 구현할 뿐이다. 그래서 `themes`는 `renderer`를 보지 않고
 * 설계서 「각 패키지의 책임과 의존」의 의존 방향(`themes` → `schema`)이 지켜진다.
 *
 * **선언과 구현이 어긋나는 경우는 여기서 다루지 않는다.** 테마가 `cardGrid`를 골랐는데
 * 렌더러가 그 구조를 등록하지 않았다면 렌더 시점에 드러난다(`requireStructure`가 던진다).
 * 그 대조는 `renderer`를 볼 수 있는 쪽의 일이다.
 *
 * 카탈로그를 여기서 설치하지 않는다 — `schema`의 `validatePage`가 `getComponent`를 그냥
 * 부르는 것과 같은 자리다. 설치하지 않은 채 부르면 이름이 `unknown-component`로 떨어진다
 * (설치 전 `List`가 그랬고 설치 뒤 이슈 0이 되는 것을 쟀다).
 */
export function checkThemeComponents(
  components: Record<string, ThemeComponent>,
  tokens: TokenTable,
  breakpoints: readonly string[],
  primitives: PrimitiveTable = new Set(),
): {
  structures: Map<string, string>
  resolved: Map<string, ResolvedComponent>
  issues: ThemeIssue[]
} {
  const structures = new Map<string, string>()
  const resolved = new Map<string, ResolvedComponent>()
  const issues: ThemeIssue[] = []

  for (const [type, spec] of Object.entries(components)) {
    const path = `components.${type}`
    const def = getComponent(type)
    if (!def) {
      issues.push(issue('unknown-component', path, `카탈로그에 없는 컴포넌트입니다: ${type}`))
      continue
    }

    if (spec.structure === undefined) {
      structures.set(type, defaultStructure(def))
    } else if (!def.structures.includes(spec.structure)) {
      issues.push(
        issue(
          'unknown-structure',
          `${path}.structure`,
          `${type}이 제공하지 않는 구조입니다: ${spec.structure}`,
        ),
      )
    } else {
      structures.set(type, spec.structure)
    }

    const base = checkStyleMap(spec.base, tokens, `${path}.base`, primitives, type, null)
    const parts = checkParts(spec.parts, def, tokens, `${path}.parts`, primitives)
    issues.push(...base.issues, ...parts.issues)

    const variants = checkNamedLayers(spec.variants, def, def.variants, 'unknown-variant', tokens, `${path}.variants`, '변형', primitives)
    const states = checkNamedLayers(spec.states, def, def.states, 'unknown-state', tokens, `${path}.states`, '상태', primitives)
    const responsive = checkNamedLayers(
      spec.responsive,
      def,
      breakpoints,
      'unknown-breakpoint',
      tokens,
      `${path}.responsive`,
      '브레이크포인트',
      primitives,
    )
    issues.push(...variants.issues, ...states.issues, ...responsive.issues)

    // 구조가 이슈였으면 이 컴포넌트는 해석되지 않은 것이다 — 반쯤 만든 것을 싣지 않는다.
    const structure = structures.get(type)
    if (structure !== undefined) {
      resolved.set(type, {
        structure,
        base: base.css,
        parts: parts.css,
        variants: variants.layers,
        states: states.layers,
        responsive: responsive.layers,
      })
    }
  }

  return { structures, resolved, issues }
}

function checkParts(
  parts: Record<string, ThemeStyleMap> | undefined,
  def: ComponentDef,
  tokens: TokenTable,
  path: string,
  primitives: PrimitiveTable,
): { css: Map<string, readonly CssDeclaration[]>; issues: ThemeIssue[] } {
  const css = new Map<string, readonly CssDeclaration[]>()
  const issues: ThemeIssue[] = []
  for (const [part, style] of Object.entries(parts ?? {})) {
    if (!def.parts.includes(part)) {
      issues.push(
        issue('unknown-part', `${path}.${part}`, `${def.type}이 선언하지 않은 조각입니다: ${part}`),
      )
      continue
    }
    const declared = checkStyleMap(style, tokens, `${path}.${part}`, primitives, def.type, part)
    issues.push(...declared.issues)
    css.set(part, declared.css)
  }
  return { css, issues }
}

function checkNamedLayers(
  layers: Record<string, ThemeLayer> | undefined,
  def: ComponentDef,
  declared: readonly string[],
  code: 'unknown-variant' | 'unknown-state' | 'unknown-breakpoint',
  tokens: TokenTable,
  path: string,
  label: string,
  primitives: PrimitiveTable,
): { layers: Map<string, ResolvedLayer>; issues: ThemeIssue[] } {
  const out = new Map<string, ResolvedLayer>()
  const issues: ThemeIssue[] = []
  for (const [name, layer] of Object.entries(layers ?? {})) {
    if (!declared.includes(name)) {
      const owner = code === 'unknown-breakpoint' ? 'primitives.breakpoints가' : `${def.type}이`
      issues.push(issue(code, `${path}.${name}`, `${owner} 선언하지 않은 ${label}입니다: ${name}`))
      continue
    }
    const resolvedLayer = checkLayer(layer, def, tokens, `${path}.${name}`, primitives)
    issues.push(...resolvedLayer.issues)
    out.set(name, { base: resolvedLayer.base, parts: resolvedLayer.parts })
  }
  return { layers: out, issues }
}

/** 층 하나. `base`·`parts` 밖의 키는 루트에 바로 쓴 스타일 프로퍼티로 본다. */
function checkLayer(
  layer: ThemeLayer,
  def: ComponentDef,
  tokens: TokenTable,
  path: string,
  primitives: PrimitiveTable,
): ResolvedLayer & { issues: ThemeIssue[] } {
  const issues: ThemeIssue[] = []
  const base: CssDeclaration[] = []

  // 중간 객체에 모았다가 넘기지 않는다. `key`가 `__proto__`이면 `shorthand[key] = …`이
  // 자기 키를 만들지 않고 조용히 사라져(값이 문자열이라 프로토타입 설정도 아니다) **검증도
  // 이슈도 없이 없어진다** — 심어서 그 갈래를 봤다. 항목마다 바로 넘기면 그 자리가 없다.
  for (const [key, value] of Object.entries(layer)) {
    if (key === 'base' || key === 'parts') continue
    const declared = styleDeclarations(key, value, tokens, `${path}.${key}`, primitives)
    issues.push(...declared.issues, ...handleIssues(def.type, null, key, `${path}.${key}`))
    base.push(...declared.css)
  }

  const explicit = checkStyleMap(layer.base, tokens, `${path}.base`, primitives, def.type, null)
  const parts = checkParts(layer.parts, def, tokens, `${path}.parts`, primitives)
  issues.push(...explicit.issues, ...parts.issues)
  base.push(...explicit.css)
  return { base, parts: parts.css, issues }
}

function checkStyleMap(
  style: ThemeStyleMap | undefined,
  tokens: TokenTable,
  path: string,
  primitives: PrimitiveTable,
  component: string,
  part: string | null,
): { css: CssDeclaration[]; issues: ThemeIssue[] } {
  const css: CssDeclaration[] = []
  const issues: ThemeIssue[] = []
  for (const [prop, value] of Object.entries(style ?? {})) {
    const declared = styleDeclarations(prop, value, tokens, `${path}.${prop}`, primitives)
    issues.push(...declared.issues, ...handleIssues(component, part, prop, `${path}.${prop}`))
    css.push(...declared.css)
  }
  return { css, issues }
}

/**
 * **노드 손잡이를 덮어쓰는지 본다**. 표와 판정은 `spec/handles.ts`가 소유한다.
 *
 * **값이 무엇인지는 보지 않는다.** 손잡이를 죽이는 것은 값이 아니라 **선언이 존재한다는
 * 사실**이다 — `flex-direction: var(--wb-node-flex-direction, row)`를 덮는 것은 뒤에 오는
 * 같은 프로퍼티의 아무 선언이고, 그 값이 우연히 같아도 노드의 prop은 더 이상 안 읽힌다.
 *
 * **`variants`·`states`·`responsive`에서도 낸다.** 그 층의 셀렉터는 속성이 하나 더 붙어도
 * 특이도가 같고(둘 다 (0,2,0)) 테마 시트가 뒤에 오므로 **그 층이 켜지는 순간 똑같이
 * 이긴다.** 층을 빼면 *"기본에는 안 적고 `hover`에만 적었다"*가 침묵으로 남는다.
 */
function handleIssues(
  component: string,
  part: string | null,
  prop: string,
  path: string,
): ThemeIssue[] {
  return overwrittenHandles(component, part, prop).map((handle) =>
    issue('node-handle-overwrite', path, handleOverwriteMessage(handle, prop)),
  )
}
