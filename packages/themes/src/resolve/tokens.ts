import type { ThemeIssue } from '../issue'
import { issue } from '../issue'
import { own } from '../own'
import type { ThemeTokens } from '../spec/tokens'

/**
 * 참조가 쓸 수 있는 이름공간.
 *
 * **`scale.` 접두어는 참조 문법에 없다.** 규격 경로는 `tokens.scale.space.unit`인데
 * 참조는 `space.6`이다 — 설계 §6.3·6.4·6.5·6.11에서 값이 나오는 자리를 모아 아래에
 * 옮겼는데, **그중 `scale.`이 붙은 참조가 없다**. 그리고 §6.11이 방출하는 변수 이름이
 * `--wb-space-6`·`--wb-radius-lg`이지 `--wb-scale-space-6`이 아니다. 즉 `scale`은
 * **테마 문서 안의 묶음**이지 참조 경로의 마디가 아니고, 그 자식들(`space`·`radius`·
 * `shadow`·`typography`·`motion`)이 자기 이름을 이름공간으로 들어올린다.
 *
 * 대조한 예시(자리 → 값):
 * - §6.3 `semantic.primary` → `"palette.blue.600"` · `semantic.surface` → `"#ffffff"`(리터럴)
 * - §6.4 `container.gutter`·`grid.gap` → `"space.6"` · `section.paddingY` → `"space.20"`
 * - §6.5 `base.gap` → `"space.6"` · `parts.item.bg` → `"semantic.surface"` ·
 *        `parts.item.radius` → `"radius.lg"` · `parts.item.shadow` → `"shadow.sm"` ·
 *        `parts.title.typography` → `"h3"`(이름공간이 아예 없다 — resolve/style.ts를 보라) ·
 *        `states.selected.parts.item.borderWidth` → `"2px"`(리터럴)
 * - §6.11 `var(--wb-space-6)`·`var(--wb-semantic-surface)`·`var(--wb-radius-lg)`
 */
export const TOKEN_NAMESPACES = [
  'palette',
  'semantic',
  'space',
  'radius',
  'shadow',
  'typography',
  'motion',
] as const

export type TokenNamespace = (typeof TOKEN_NAMESPACES)[number]

/**
 * 값 통째가 참조인지 리터럴인지를 가르는 기준. 값 **안쪽**에 섞인 참조는
 * `resolve/style.ts`의 `EMBEDDED_REFERENCE`가 따로 본다 — 그쪽은 더 큰 문자열 속에서
 * 찾아야 해서 이름 문자 집합이 좁다.
 *
 * **리터럴이 우연히 이 모양이면 참조로 읽힌다** — 예를 들어 `"radius.lg"`를 리터럴로
 * 쓰려는 방법이 없다. 설계가 이스케이프 문법을 주지 않으므로 여기서 만들지 않는다.
 * 실제로 겹치는 CSS 리터럴은 관측하지 못했다(색은 `#`·`rgb(`으로, 길이는 수로,
 * 폰트 목록은 쉼표로 시작한다).
 *
 * 이름 쪽을 토큰 이름 문자 집합(`[A-Za-z0-9_.-]`)이 아니라 **공백 없는 아무 문자열**로
 * 넓힌 것은 오타를 잡기 위해서다. 좁게 두면 선언될 수 없는 이름(예: 한글)을 가리키는
 * 참조가 **참조로 인식되지 않아 리터럴로 조용히 통과한다** — 실제로 그 형태를 먼저
 * 짰다가 케이스가 이슈 0건을 내는 것을 보고 넓혔다.
 */
const REFERENCE = new RegExp(`^(${TOKEN_NAMESPACES.join('|')})\\.\\S+$`)

/** §6.3: `space.1` … `space.24`. */
export const SPACE_MAX = 24

/**
 * `space.unit`이 받는 형태. **수치 × 배수**로 파생하므로 수와 단위가 갈라져야 한다.
 *
 * `calc()`로 내지 않는 이유는 §6.8이 *"`calc()`나 임의 함수는 받지 않는다"*이기 때문이고,
 * 단위 없는 수를 받지 않는 이유는 `space.*`가 쓰이는 자리가 전부 길이(padding·gap·margin —
 * §6.8의 "간격" 부류)여서 단위 없는 파생 결과가 `padding: 24`처럼 무효한 선언이 되기
 * 때문이다. 조용히 통과시키면 화면에서만 드러난다.
 */
const LENGTH = /^(\d+\.?\d*|\.\d+)(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc)$/

/** 참조가 하나도 남지 않은 평평한 표. 키는 `semantic.primary`·`space.6` 같은 참조 경로다. */
export type TokenTable = ReadonlyMap<string, string>

/**
 * 타입 술어(`value is string`)로 두지 않는다. 이미 `string`인 값에 쓰면 **거짓 갈래가
 * `never`로 좁혀져** 그 뒤 문자열 연산이 컴파일되지 않는다(실제로 TS2339를 보고 고쳤다).
 */
export function isTokenReference(value: unknown): boolean {
  return typeof value === 'string' && REFERENCE.test(value)
}

interface RawEntry {
  value: string
  /** 이슈에 실을 테마 문서 안의 자리 */
  path: string
}

/**
 * 토큰을 해석해 평평한 표를 낸다. **던지지 않는다** — 이슈를 모아서 낸다.
 *
 * 층별 규칙(§6.3의 3단 분리, 계획 D3):
 * - `palette`는 원시값만. 참조할 대상이 없는 층이므로 참조가 오면 이슈다.
 * - `semantic`은 `palette.*`·`semantic.*` 또는 리터럴. **`semantic.*`을 받는 근거**는
 *   D3의 산문(*"`semantic` 안에서만 순환이 가능하고 … 그것을 잡아야 한다"*)이다 —
 *   같은 D3의 표는 `palette`만 적었지만, 표대로면 순환 자체가 성립할 수 없어 잡을 것이
 *   없어진다. 둘이 어긋나므로 케이스를 살리는 쪽을 택했다.
 * - `scale`은 리터럴만. `space.unit`만 파생의 씨앗이다.
 */
export function resolveTokens(tokens: ThemeTokens): { table: TokenTable; issues: ThemeIssue[] } {
  const issues: ThemeIssue[] = []
  const table = new Map<string, string>()

  const palette = collectLiteralLayer(tokens.palette, 'palette', 'tokens.palette', issues)
  for (const [key, entry] of palette) table.set(key, entry.value)

  for (const [key, value] of Object.entries(tokens.scale?.radius ?? {})) {
    putLiteral(table, issues, `radius.${key}`, value, `tokens.scale.radius.${key}`)
  }
  for (const [key, value] of Object.entries(tokens.scale?.shadow ?? {})) {
    putLiteral(table, issues, `shadow.${key}`, value, `tokens.scale.shadow.${key}`)
  }
  for (const [key, value] of Object.entries(tokens.scale?.motion ?? {})) {
    putLiteral(table, issues, `motion.${key}`, value, `tokens.scale.motion.${key}`)
  }
  for (const [entryName, entry] of Object.entries(tokens.scale?.typography ?? {})) {
    for (const [key, value] of Object.entries(entry)) {
      putLiteral(
        table,
        issues,
        `typography.${entryName}.${key}`,
        String(value),
        `tokens.scale.typography.${entryName}.${key}`,
      )
    }
  }

  deriveSpace(table, issues, tokens.scale?.space?.unit)
  resolveSemantic(table, issues, tokens.semantic ?? {})

  return { table, issues }
}

function collectLiteralLayer(
  layer: Record<string, string> | undefined,
  namespace: TokenNamespace,
  pathPrefix: string,
  issues: ThemeIssue[],
): Map<string, RawEntry> {
  const out = new Map<string, RawEntry>()
  for (const [key, value] of Object.entries(layer ?? {})) {
    const path = `${pathPrefix}.${key}`
    if (isTokenReference(value)) {
      issues.push(
        issue('bad-token-value', path, `${namespace}는 원시값만 받습니다 (참조: ${value})`),
      )
      continue
    }
    out.set(`${namespace}.${key}`, { value, path })
  }
  return out
}

function putLiteral(
  table: Map<string, string>,
  issues: ThemeIssue[],
  tokenPath: string,
  value: string,
  path: string,
): void {
  if (isTokenReference(value)) {
    issues.push(
      issue('bad-token-value', path, `스케일은 리터럴만 받습니다 (참조: ${value})`),
    )
    return
  }
  table.set(tokenPath, value)
}

function deriveSpace(
  table: Map<string, string>,
  issues: ThemeIssue[],
  unit: string | undefined,
): void {
  if (unit === undefined) return

  const matched = LENGTH.exec(unit)
  if (!matched) {
    issues.push(
      issue(
        'bad-token-value',
        'tokens.scale.space.unit',
        `간격 단위는 수와 CSS 길이 단위여야 합니다 (받은 값: ${JSON.stringify(unit)})`,
      ),
    )
    return
  }

  const size = Number(matched[1])
  const suffix = matched[2]!
  for (let step = 1; step <= SPACE_MAX; step += 1) {
    table.set(`space.${step}`, `${round(size * step)}${suffix}`)
  }
}

/** 부동소수 잔여를 없앤다 — `0.1 * 3`이 `0.30000000000000004`가 되는 부류다. */
function round(value: number): string {
  return String(Number(value.toFixed(4)))
}

/**
 * `semantic`을 푼다. 참조 사슬을 따라가되 방문 중인 것을 다시 만나면 순환이다.
 *
 * 재귀가 아니라 명시적 스택으로 도는 이유는 **사슬 길이가 테마 작성자의 입력에
 * 달려 있기 때문**이다. 재귀면 긴 사슬에서 호출 스택이 먼저 터져 이슈를 낼 기회가 없다.
 */
function resolveSemantic(
  table: Map<string, string>,
  issues: ThemeIssue[],
  semantic: Record<string, string>,
): void {
  const pathOf = (key: string) => `tokens.semantic.${key}`
  const done = new Set<string>()

  for (const start of Object.keys(semantic)) {
    if (done.has(start)) continue

    // 이번 사슬에서 지나온 semantic 키들. 끝에서 값을 얻으면 거꾸로 채운다.
    const chain: string[] = []
    const onChain = new Set<string>()
    let cursor: string | undefined = start
    let resolved: string | null = null

    while (cursor !== undefined) {
      if (onChain.has(cursor)) {
        for (const key of chain) {
          issues.push(issue('circular-token', pathOf(key), `토큰 참조가 순환합니다: ${key}`))
          done.add(key)
        }
        break
      }
      if (done.has(cursor)) {
        resolved = table.get(`semantic.${cursor}`) ?? null
        break
      }

      chain.push(cursor)
      onChain.add(cursor)

      // 타입을 명시한다. `cursor`가 루프 안에서 `name`으로 갱신되고 `name`이 다시
      // `value`(= `semantic[cursor]`)에서 나오므로, 추론에 맡기면 tsc가 순환으로 보고
      // TS7022(implicitly any)를 낸다 — 실제로 그 에러를 보고 붙였다.
      const value: string = own(semantic, cursor)!
      if (!isTokenReference(value)) {
        resolved = value
        break
      }

      const dot = value.indexOf('.')
      const namespace: string = value.slice(0, dot)
      const name: string = value.slice(dot + 1)

      if (namespace === 'semantic') {
        if (own(semantic, name) === undefined) {
          issues.push(issue('unknown-token', pathOf(cursor), `없는 토큰을 가리킵니다: ${value}`))
          markFailed(chain, done)
          break
        }
        cursor = name
        continue
      }

      if (namespace !== 'palette') {
        issues.push(
          issue(
            'bad-token-value',
            pathOf(cursor),
            `semantic은 palette·semantic만 가리킬 수 있습니다 (받은 참조: ${value})`,
          ),
        )
        markFailed(chain, done)
        break
      }

      const literal = table.get(value)
      if (literal === undefined) {
        issues.push(issue('unknown-token', pathOf(cursor), `없는 토큰을 가리킵니다: ${value}`))
        markFailed(chain, done)
        break
      }
      resolved = literal
      break
    }

    if (resolved !== null) {
      for (const key of chain) {
        table.set(`semantic.${key}`, resolved)
        done.add(key)
      }
    }
  }
}

/** 사슬 끝이 실패했으므로 지나온 키를 전부 미해결로 닫는다 — 같은 사슬을 다시 걷지 않는다. */
function markFailed(chain: string[], done: Set<string>): void {
  for (const key of chain) done.add(key)
}
