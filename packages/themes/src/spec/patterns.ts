import { getComponent, getKoreanErrorMap, ignoredVariantMessage } from '@wirebound/schema'
import { z } from 'zod'
import type { ThemeIssue } from '../issue'
import { issue } from '../issue'

/**
 * 패턴 이름의 범주. 설계서 「patterns — 테마가 소유한 구성 레시피」에서 그대로 옮겼다(*"범주는 고정 목록이다"*).
 * 개수를 적지 않는다 — 목록이 바뀌면 이 배열이 바뀌지 저 문장이 바뀌지 않는다.
 */
export const PATTERN_CATEGORIES = [
  'header',
  'nav',
  'hero',
  'features',
  'content',
  'cta',
  'pricing',
  'testimonial',
  'footer',
  'auth',
  'empty',
  'error',
] as const

/**
 * 슬롯 타입. 「patterns — 테마가 소유한 구성 레시피」의 예시가 쓰는 셋이다.
 *
 * **설계서 「열린 질문 (구현 중 결정)」이 이 목록을 열어 뒀다** — *"패턴 슬롯 타입 체계 — `text`·`media`·`action` 정도로
 * 시작하되, 실제 패턴을 만들며 필요한 타입을 확정한다."* 지금 닫아 두는 것은 오타를
 * 막기 위해서이고, 늘어나는 자리는 여기다.
 */
export const SLOT_TYPES = ['text', 'media', 'action'] as const

/**
 * **슬롯 타입은 노드 타입과 대조하지 않는다.** `image` 슬롯을 `"media"`로 선언해 두고
 * `Text` 노드에 붙여도 이슈가 나지 않는다(재서 확인했다).
 *
 * 대조하지 않는 이유는 **설계가 타입과 컴포넌트의 대응을 주지 않기 때문**이다. 「patterns」는
 * 슬롯 타입을 예시로만 보이고, 「열린 질문」이 그 체계를 *"실제 패턴을 만들며 필요한 타입을
 * 확정한다"*로 열어 뒀다. 지금 대응표를 지어 넣으면 「열린 질문」이 열어 둔 것을 이 단계가
 * 닫는 것이다.
 *
 * 그래서 지금 `slots`의 타입은 **저작 UI(「patterns」: "우측 속성 패널에서 채운다")를 위한 선언**일
 * 뿐 검증에 쓰이지 않는다. 대응표가 정해지면 `checkNode`가 그것을 본다.
 */

export type SlotType = (typeof SLOT_TYPES)[number]

const PATTERN_NAME = new RegExp(`^(${PATTERN_CATEGORIES.join('|')})\\.[A-Za-z0-9_-]+$`)

/**
 * 패턴 템플릿의 노드. **`WbNode`와 두 가지가 다르다**(「patterns — 테마가 소유한 구성 레시피」):
 * - `slot`이 붙을 수 있다 — *"`slot` 필드는 패턴 템플릿에만 존재한다."*
 * - **`id`가 없다** — *"패턴을 페이지에 넣으면 `schema`가 전개되고 노드 `id`가 새로 발급된다."*
 *   그 절의 예시에도 `id`가 하나도 없다.
 *
 * `marker`·`interactions`도 받지 않는다. `marker`는 코멘트 번호(설계서 「설계서 화면 구조」의
 * 번호 마커)라 저작 중에 붙고,
 * `interactions`의 `target`은 노드 id를 가리키는데 템플릿에는 그 id가 없다.
 */
export interface PatternNode {
  type: string
  props?: Record<string, unknown>
  variant?: string
  slot?: string
  children?: PatternNode[]
}

/**
 * 깊이가 충분히 깊으면 `safeParse`가 **`success: false`를 내는 것이 아니라 던진다**
 * (`RangeError` — zod의 재귀가 호출 스택을 쓴다).
 *
 * **경계가 되는 깊이는 여기 적지 않는다. 계약이 될 수 없기 때문이다.** 이분 탐색으로 재
 * 보니 같은 코드가 실행 환경마다 다른 값을 냈고(맨 `node`로 `dist`를 부를 때와 vitest
 * 안이 달랐다), **같은 프로세스에서 같은 측정을 한 번 더 돌리면 경계가 두 배 가까이
 * 올라갔다** — 앞선 실행이 스택을 데운다. 그래서 `schema`의 `WbNodeSchema`와 어느 쪽이
 * 먼저 죽는지도 측정 순서에 따라 뒤집혔다.
 *
 * 남는 성질은 하나다 — **깊이 상한은 이 패키지의 것이 아니라 그 순간 스택의 것이다.**
 * 저장소에 들어온 패턴에 상한이 필요해지면 여기서 잰 수를 옮겨 적지 말고, 쓰는 쪽이
 * 자기 환경에서 재서 여유 있게 잡아야 한다.
 */
export const PatternNodeSchema: z.ZodType<PatternNode> = z.strictObject({
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
  variant: z.string().optional(),
  slot: z.string().min(1).optional(),
  get children() {
    return z.array(PatternNodeSchema).optional()
  },
})

export interface ThemePattern {
  /** 사람이 읽는 이름. 패턴의 식별자는 `patterns`의 키다(`hero.split`). */
  name: string
  slots?: Record<string, SlotType>
  schema: PatternNode
}

export const PatternSchema: z.ZodType<ThemePattern> = z.strictObject({
  name: z.string().min(1),
  slots: z.record(z.string().min(1), z.enum(SLOT_TYPES)).optional(),
  schema: PatternNodeSchema,
})

export const PatternsSchema: z.ZodType<Record<string, ThemePattern>> = z.record(
  z.string(),
  PatternSchema,
)

/**
 * 패턴을 검증한다. **전개는 여기서 하지 않는다**(`pattern/expand.ts`) — 이름·슬롯 계약·`schema`
 * 조각의 정합성까지다.
 *
 * **`validatePage`를 재사용하지 않는다.** 재서 확인한 이유 둘:
 * 1. `WbNodeSchema`가 `z.strictObject`라 `slot`이 인식되지 않는 키다. 그리고 봉투 이슈가
 *    나오면 `validatePage`가 즉시 반환하므로 노드 단위 검증까지 가지도 않는다.
 * 2. 패턴 조각의 루트는 `Page`가 아니다 — `bad-root`가 난다.
 *
 * **`props`는 카탈로그의 zod로 검증한다.** 여기서 보지 않으면 잘못된 패턴이 규격을 통과해
 * 전개 시점이나 렌더 폴백에서야 드러난다 — 검증기를 늦은 쪽에 두는 것이다. 카탈로그가
 * 단일 진실이므로(설계서 「핵심 원칙」) 카탈로그와 어긋나는 예시는 예시 쪽이 틀린 것으로 본다.
 */
export function checkPatterns(patterns: Record<string, ThemePattern>): { issues: ThemeIssue[] } {
  const issues: ThemeIssue[] = []

  for (const [name, pattern] of Object.entries(patterns)) {
    const path = `patterns.${name}`

    if (!PATTERN_NAME.test(name)) {
      issues.push(
        issue(
          'bad-pattern-name',
          path,
          `패턴 이름은 <범주>.<변형>이고 범주는 고정 목록입니다: ${JSON.stringify(name)}`,
        ),
      )
    }

    const declared = new Set(Object.keys(pattern.slots ?? {}))
    const used = new Set<string>()
    checkNode(pattern.schema, `${path}.schema`, declared, used, issues)

    for (const slot of declared) {
      if (!used.has(slot)) {
        issues.push(
          issue('unused-slot', `${path}.slots.${slot}`, `schema가 쓰지 않는 슬롯입니다: ${slot}`),
        )
      }
    }
  }

  return { issues }
}

function checkNode(
  node: PatternNode,
  path: string,
  declared: ReadonlySet<string>,
  used: Set<string>,
  issues: ThemeIssue[],
): void {
  if (node.slot !== undefined) {
    // 한 슬롯 이름을 노드 둘이 쓰는 것을 막지 않는다 — 「patterns」가 그 경우를 말하지 않았다.
    // 여기서 막으면 그 정하지 않은 것을 이 단계가 정하는 셈이 된다(전개는 처음 만난 노드를
    // 고른다 — `pattern/expand.ts`의 `expandNode`).
    used.add(node.slot)
    if (!declared.has(node.slot)) {
      issues.push(
        issue('unknown-slot', path, `slots에 선언되지 않은 슬롯입니다: ${node.slot}`),
      )
    }
  }

  const children = node.children ?? []
  const recurse = (): void => {
    children.forEach((child, index) => {
      checkNode(child, `${path}.children.${index}`, declared, used, issues)
    })
  }

  const def = getComponent(node.type)
  if (!def) {
    issues.push(
      issue('bad-pattern-node', path, `카탈로그에 없는 컴포넌트 타입: ${node.type}`),
    )
    // 자식은 계속 본다. 여기서 멈추면 **타입 오타 하나가 그 밑의 이슈를 가린다** —
    // `schema`의 `validateTree`도 알 수 없는 타입에서 `continue`할 뿐 순회를 멈추지 않는다.
    // (`test/spec-patterns.test.ts`의 `첫 이슈에서 멈추지 않는다`가 지킨다.)
    recurse()
    return
  }

  // 패턴은 페이지에 전개되므로, 페이지가 받지 못하는 것은 여기서 막는다.
  // `validatePage`가 페이지 안의 `Slot`을 이슈로 낸다(실측). 반대로 중첩 `Page`는
  // `validatePage`가 통과시키므로(같은 실측) 여기서도 막지 않는다 — 단일 진실보다
  // 엄격해지지 않는다.
  if (node.type === 'Slot') {
    issues.push(issue('bad-pattern-node', path, '패턴에는 Slot을 둘 수 없습니다'))
  }

  const parsed = def.props.safeParse(node.props ?? {}, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    issues.push(
      issue(
        'bad-pattern-node',
        `${path}.props`,
        `${node.type}의 props가 올바르지 않습니다: ${parsed.error.issues
          .map((entry) => `${entry.path.join('.')} ${entry.message}`)
          .join(', ')}`,
      ),
    )
  }

  if (node.variant !== undefined) {
    /**
     * **패턴 템플릿도 페이지 문서와 같은 침묵을 갖는다.** `variantFrom`이 있는 컴포넌트에
     * `variant`를 적으면 그 값은 렌더에서 무시된다 — 패턴은 노드를 찍어 내는 틀이므로
     * 그 침묵이 **찍어 낸 노드마다** 퍼진다.
     *
     * **코드는 `bad-pattern-node`를 그대로 쓴다.** `schema`의 `ignored-variant`에
     * 평행한 코드를 여기 만들면 유니온이 둘이 되어 따로 썩는다. **갈리지 않게 묶는 것은
     * 문장이고**, `ignoredVariantMessage`를 함께 부르는 것이 그 방법이다.
     */
    if (def.variantFrom !== undefined) {
      issues.push(
        issue('bad-pattern-node', `${path}.variant`, ignoredVariantMessage(def, node.variant)),
      )
    } else if (!def.variants.includes(node.variant)) {
      issues.push(
        issue(
          'bad-pattern-node',
          `${path}.variant`,
          `${node.type}에 정의되지 않은 variant입니다: ${node.variant}`,
        ),
      )
    }
  }

  if (def.children === 'none' && children.length > 0) {
    issues.push(
      issue('bad-pattern-node', `${path}.children`, `${node.type}은 자식을 담을 수 없습니다`),
    )
  }

  recurse()
}
