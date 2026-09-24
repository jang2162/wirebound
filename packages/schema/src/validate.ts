import type { ComponentDef } from './component/define'
import { checkNodeAction, isPageTargetAction } from './interaction/check'
import { getComponent } from './component/registry'
import { DocumentEnvelopeSchema, NODE_ID_PATTERN } from './envelope'
import type { LayoutDocument, PageDocument, WbNode } from './node'
import { walkNodes } from './tree'
import { getKoreanErrorMap } from './locale'

export type ValidationCode =
  | 'unknown-type'
  | 'invalid-props'
  | 'children-not-allowed'
  | 'unknown-variant'
  /**
   * 노드가 `variant`를 들고 왔는데 그 컴포넌트는 **prop에서 변형을 파생한다**(`variantFrom`).
   * **작성자가 적은 값이 버려진다.**
   *
   * 이름이 `redundant-`가 아닌 이유: redundant는 *"있어도 그만"*으로 읽히는데 실제로는
   * **적은 값이 화면에 닿지 않는다.** 무엇이 대신 쓰이는지는 메시지가 말한다.
   */
  | 'ignored-variant'
  | 'duplicate-id'
  | 'bad-root'
  | 'slot-count'
  | 'bad-document'
  /**
   * 상호작용의 `target`이 가리키는 노드가 **문서에 없다**(설계서 「모델」(상호작용)의 *"타겟 존재 여부"*).
   *
   * **`navigate`·`openModal`은 여기 오지 않는다** — 그 둘의 `target`은 노드 id가 아니라
   * 페이지 경로(`"page:관리자/회원/상세"`)이고 그 페이지는 이 문서 안에 없다. 그
   * 판정과 근거는 `checkInteractions`의 머리말에 있다.
   */
  | 'missing-interaction-target'
  /**
   * 타겟 노드는 있는데 **그 액션을 받을 수 없는 종류**다. 지금 이것을 내는 자리는
   * `switchTab`의 대상이 `Tabs`가 아닐 때 하나뿐이다.
   *
   * `missing-interaction-target`과 갈라 둔 이유: 사용자가 할 일이 다르다. 없는 노드는
   * **타겟을 다시 고르거나 규칙을 지우는** 일이고, 종류가 안 맞는 것은 **액션 타입이
   * 잘못 골렸다**는 뜻이라 대개 규칙 쪽을 고친다.
   */
  | 'invalid-interaction-target'
  /**
   * `setProp`의 `prop`이 그 컴포넌트의 prop이 아니거나 `value`가 그 prop의 타입이 아니다
   * (설계서 「모델」(상호작용)의 *"prop 유효성"*).
   */
  | 'invalid-interaction-prop'

/**
 * 이슈가 편집·저장을 **막는가**.
 *
 * - `error` — 막는다. 설계서 「정방향 흐름」의 서버 게이트가 거부한다.
 * - `warning` — 막지 않는다. 저장되고 응답에 실려 나간다.
 *
 * **`themes`의 `ThemeIssue`가 이 타입을 그대로 쓴다**(`packages/themes/src/issue.ts`).
 * 코드 유니온은 일부러 갈라 두었지만(그쪽 주석 참고) severity는 갈라 둘 이유가 없다 —
 * 둘 다 같은 API 봉투에 실려 같은 클라이언트가 읽으므로, 값 집합이 갈리면 읽는 쪽이
 * 두 어휘를 알아야 한다.
 */
export type IssueSeverity = 'error' | 'warning'

/**
 * 코드마다 severity를 정하는 **표 하나**. 이슈를 만드는 자리는 이 표를 볼 뿐 값을 고르지 않는다.
 *
 * **`Record<ValidationCode, IssueSeverity>`인 것이 요점이다.** `ValidationCode`에 코드가
 * 늘면 이 표에 항목이 없어 **타입체크가 먼저 죽는다** — severity를 정하지 않은 코드가
 * 조용히 지나가는 경로가 없다. (severity를 `?:`로 두고 "없으면 error"로 보지 않고
 * **필수로 두고 표에서 파생시킨다** — 선택으로 두면 안 적은 자리가 조용히
 * error가 되는데, 그 안전한 기본값이 곧 "새 코드가 severity를 정하지 않았다"는 신호를
 * 지운다. 필수로 두면 컴파일러가 그 자리를 가리킨다.)
 *
 * **`warning`이 넷이다.** `ignored-variant`는 *"작성자가 적은 값이 버려진다"*는 알림이지
 * 문서를 무효로 만드는 사실이 아니다 — 그 값이 없어도 문서는 그대로 그려진다. 상호작용
 * 셋이 `warning`인 근거는 아래 따로 적는다. 나머지는 「정방향 흐름」이 막아야 한다고 정한 것이므로
 * 내리지 않는다.
 *
 * ---
 *
 * **상호작용 이슈 셋의 severity는 `warning`이다.** 축은 하나다:
 * ***"그 규칙이 저장을 막을 만큼 문서를 못 쓰게 만드는가."*** 근거 둘이고
 * **둘째가 결정적이다.**
 *
 * 1. **깨진 규칙이 있어도 편집 화면은 멀쩡하다.** 상호작용은 뷰 모드에서만 돈다(설계서 「실행」(상호작용)).
 *    끊긴 타겟이 편집 화면에 하는 일은 없다.
 * 2. **`error`로 두면 타겟이 된 노드를 지우는 편집이 서버에서 거부된다.** 상호작용은
 *    **다른 노드를 가리키는 참조**라 그 노드가 사라지는 순간 이슈가 되는데, 그 이슈를
 *    `error`로 두면 `edit-pipeline`의 6단계가 편집을 `invalid`로 되돌린다(422). 즉
 *    **노드를 지우려는 사용자가 자기 문서를 편집할 수 없게 된다** — 지우려면 그 노드를
 *    가리키는 상호작용을 먼저 전부 찾아 지워야 하는데, 화면에는 그것을 찾아 주는 장치가
 *    없다. 셋을 `error`로 바꾸면 `edit-pipeline`이 삭제 편집을
 *    `reason: 'invalid'`로 거부한다(`test/interaction-validate.test.ts`의
 *    `타겟이 된 노드를 지우는 편집이 막히지 않는다`가 그 성질을 고정한다 — 다시 재려면 그 케이스를 돌린다).
 *
 * **`unknown-variant`가 `error`인 것과 어긋나지 않는다.** 그쪽은 **그 노드 자신의 필드**가
 * 렌더러에 닿는 값이라 남의 생사에 따라 유효성이 바뀌지 않는다. *"저장을 막으면 다른
 * 정당한 편집이 함께 막힌다"*는 성질은 **참조**에만 있다.
 */
export const ISSUE_SEVERITY: Record<ValidationCode, IssueSeverity> = {
  'unknown-type': 'error',
  'invalid-props': 'error',
  'children-not-allowed': 'error',
  'unknown-variant': 'error',
  'ignored-variant': 'warning',
  'duplicate-id': 'error',
  'bad-root': 'error',
  'slot-count': 'error',
  'bad-document': 'error',
  'missing-interaction-target': 'warning',
  'invalid-interaction-target': 'warning',
  'invalid-interaction-prop': 'warning',
}

export interface ValidationIssue {
  code: ValidationCode
  /** `ISSUE_SEVERITY[code]`와 항상 같다 — 만드는 자리가 표에서 파생시킨다. */
  severity: IssueSeverity
  nodeId: string | null
  path: string
  message: string
}

/**
 * 이슈 하나를 만든다. **severity를 여기서 표에서 파생시킨다** — 호출자가 직접 고르면
 * 같은 코드가 자리마다 다른 severity를 달 수 있고, 그러면 표가 진실이 아니게 된다.
 */
function makeIssue(
  code: ValidationCode,
  nodeId: string | null,
  path: string,
  message: string,
): ValidationIssue {
  return { code, severity: ISSUE_SEVERITY[code], nodeId, path, message }
}

/**
 * 이슈 목록을 **막는 것**과 **알릴 것**으로 가른다.
 *
 * **이 선을 긋는 코드는 이 함수 하나뿐이어야 한다** — `auth/roles.ts`의 `roleAtLeast`가
 * 역할 비교의 유일한 지점인 것과 같은 이유다. 부르는 곳이 각자 `filter`를 다시 쓰면
 * 한쪽만 고쳐지는 순간 갈린다.
 *
 * **부르는 자리를 여기 표로 적지 않는다.** 이 파일 자신의 `throwOnFirstIssue`(아래)부터
 * `apps/api`의 저장 게이트(`edit-pipeline` · `routes/pages.ts` · `routes/themes.ts`),
 * `packages/themes`의 해석, `apps/web`의 삽입 판정까지 자리가 계속 는다 — 수를 적어 두면
 * 자리가 늘 때 아무 테스트도 안 죽은 채 표만 낡는다. 그리고 **행 하나에 두 파일을 묶어 적으면
 * 행 수와 호출 지점 수가 갈려, 검산해도 빠진 것이 안 보인다.** 지금 자리는 다시 센다:
 * `grep -rn --include="*.ts" "partitionIssues(" packages apps`에서 `node_modules`·`dist`·
 * 주석·테스트 줄을 뺀 것이 실제 호출 지점이다(세는 단위는 호출 지점). 정의부는
 * `partitionIssues<T`라 이 패턴에 안 걸리고 재수출도 안 걸린다.
 *
 * 각 배열은 **원래 순서를 지킨다** — 첫 이슈가 근원인 경우가 흔하다.
 *
 * ---
 *
 * **`severity`를 가진 것이면 무엇이든 받는다 — 제네릭이다.**
 *
 * `packages/themes`의 `ThemeIssue`가 **코드 유니온을 일부러 갈라 두었기 때문**이다
 * (평행 유니온을 만들면 따로 썩는다). 그래서 `ValidationIssue[]`로 못박아
 * 두면 테마 쪽이 이 함수를 부를 수 없고, **선을 긋는 코드가 하나여야 한다**는 위 규칙이
 * 바로 그 자리에서 깨진다 — 테마 쪽이 자기 `filter`를 다시 쓰게 된다.
 *
 * 제네릭인 것은 **입력의 타입뿐이고 판정은 하나다.** `T`가 그대로 나가므로 부르는 쪽이
 * 자기 이슈 타입을 잃지 않는다(`ThemeIssue[]`를 넣으면 `ThemeIssue[]`가 나온다).
 */
export function partitionIssues<T extends { severity: IssueSeverity }>(
  issues: readonly T[],
): {
  errors: T[]
  warnings: T[]
} {
  const errors: T[] = []
  const warnings: T[] = []
  for (const issue of issues) {
    if (issue.severity === 'warning') warnings.push(issue)
    else errors.push(issue)
  }
  return { errors, warnings }
}

/**
 * 무시되는 `variant`를 알리는 문장. **검증 경로가 둘이라 여기 한 곳에서 만든다.**
 *
 * 페이지 문서는 `validatePage`가 보고 테마의 패턴 템플릿은 `checkPatterns`(themes)가
 * 보는데, 두 곳이 문장을 따로 쓰면 사용자가 **같은 문제를 다른 문제로 읽는다.**
 * 이슈 **코드**는 갈려 있다(여기는 전용 코드, 패턴 쪽은 catch-all `bad-pattern-node`) —
 * 그쪽에 평행한 유니온을 만들면 둘이 따로 썩기 때문이다. 갈리지 않게 묶는 것은 **문장**이고,
 * 두 문자열이 글자까지 같은 것을 `packages/themes/test/spec-patterns.test.ts`가 대조한다
 * (`fallback.test.tsx`가 `invalid-props`에 쓰는 것과 같은 방식이다).
 *
 * 문장이 말해야 하는 것 둘: **적은 값이 버려진다**는 것과 **무엇이 대신 쓰이는가**.
 */
export function ignoredVariantMessage(def: ComponentDef, variant: string): string {
  return (
    `${def.type}의 variant는 무시됩니다: ${variant} ` +
    `(${def.type}은 ${def.variantFrom} prop에서 변형을 파생합니다)`
  )
}

export function validatePage(doc: PageDocument): ValidationIssue[] {
  const envelopeIssues = validateEnvelope(doc)
  if (envelopeIssues.length > 0) return envelopeIssues

  const issues = validateTree(doc.root)
  const slots = countSlots(doc.root)
  if (slots > 0) {
    issues.push(makeIssue('slot-count', null, '/root', `페이지에는 Slot을 둘 수 없습니다 (${slots}개 발견)`))
  }
  return issues
}

export function validateLayout(doc: LayoutDocument): ValidationIssue[] {
  const envelopeIssues = validateEnvelope(doc)
  if (envelopeIssues.length > 0) return envelopeIssues

  const issues = validateTree(doc.root)
  const slots = countSlots(doc.root)
  if (slots !== 1) {
    issues.push(
      makeIssue('slot-count', null, '/root', `레이아웃에는 Slot이 정확히 하나여야 합니다 (${slots}개 발견)`),
    )
  }
  return issues
}

/**
 * 문서 봉투(버전·루트 형태)를 검사한다. 트리 순회(`walkNodes`)보다 먼저 돌아야 한다 —
 * root가 null이거나 형태가 깨져 있으면 walkNodes가 그대로 터지기 때문이다.
 * 실패하면 봉투 이슈만 담아 즉시 반환하고, 노드 단위 검증은 시도하지 않는다.
 */
function validateEnvelope(doc: unknown): ValidationIssue[] {
  const parsed = DocumentEnvelopeSchema.safeParse(doc, { error: getKoreanErrorMap() })
  if (parsed.success) return []

  return parsed.error.issues.map((issue) =>
    makeIssue('bad-document', resolveNodeId(doc, issue.path), `/${issue.path.join('/')}`, issue.message),
  )
}

/**
 * zod 이슈 경로를 문서 루트부터 따라가며, 그 경로가 속한 노드의 id를 찾는다.
 *
 * - 이슈가 id 필드 자체를 가리키면(예: `/root/id`) 그 지점의 값은 반영하지 않는다 —
 *   그 값이 바로 이 이슈가 문제 삼는 대상이므로 검증되지 않은 채 새어 나가면 안 된다.
 * - 지나친 조상 노드의 id가 `NODE_ID_PATTERN`을 만족하지 않으면(문자열이 아니거나 패턴에
 *   맞지 않으면) 그 자체를 앵커로 쓰지 않는다. 뿐만 아니라 그 지점부터는 더 안쪽에서
 *   찾아낸 id도 신뢰하지 않는다 — 경로 위 한 지점의 정체성이 이미 깨졌다면, 그 밑에서
 *   찾은 id가 실제로 이 이슈를 가리키는 노드의 것인지 보장할 수 없기 때문이다.
 *
 * 알아낼 수 없으면 null.
 */
function resolveNodeId(doc: unknown, path: readonly PropertyKey[]): string | null {
  let current: unknown = doc
  let nodeId: string | null = null
  let poisoned = false

  for (const key of path) {
    if (current === null || typeof current !== 'object') break

    if (key !== 'id') {
      const id = (current as Record<PropertyKey, unknown>).id
      if (id !== undefined) {
        if (typeof id === 'string' && NODE_ID_PATTERN.test(id)) {
          if (!poisoned) nodeId = id
        } else {
          poisoned = true
        }
      }
    }

    current = (current as Record<PropertyKey, unknown>)[key]
  }

  return nodeId
}

export function assertValidPage(doc: PageDocument): void {
  throwOnFirstIssue(validatePage(doc))
}

/** `assertValidPage`와 대칭인 레이아웃 버전. */
export function assertValidLayout(doc: LayoutDocument): void {
  throwOnFirstIssue(validateLayout(doc))
}

/**
 * 이슈 목록의 첫 **오류**를 메시지로 만들어 던진다. 오류가 없으면 아무 일도 하지 않는다.
 *
 * **경고로는 던지지 않는다.** 여기가 설계서 「정방향 흐름」의 게이트와 다른 선을 쓰면 "저장되는 문서"와
 * "assert를 지나는 문서"가 서로 다른 집합이 된다 — 경고만 있는 문서는 저장되므로
 * (`partitionIssues`를 쓰는 `edit-pipeline` 6단계) assert도 통과시켜야 한다.
 */
function throwOnFirstIssue(issues: ValidationIssue[]): void {
  const first = partitionIssues(issues).errors[0]
  if (first) {
    throw new Error(`문서 검증 실패 [${first.code}] ${first.path}: ${first.message}`)
  }
}

function validateTree(root: WbNode): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  /**
   * 지나온 노드를 id로 든다. **`Set`이 아니라 `Map`인 것은 상호작용 검사 때문이다** —
   * 타겟이 **있는지**만이 아니라 그 노드의 **타입**까지 봐야 `switchTab`의 대상이 `Tabs`인지,
   * `setProp`의 prop이 그 컴포넌트의 것인지 판정할 수 있다. `duplicate-id` 쪽은 `has`만
   * 쓰므로 그대로다.
   */
  const seen = new Map<string, WbNode>()
  /**
   * 상호작용을 가진 노드. **순회 중에 판정할 수 없다** — 타겟이 문서 뒤쪽에 있으면
   * 아직 못 본 노드를 *"없다"*고 말하게 된다. 그래서 자리만 모아 두고 순회가 끝난 뒤
   * 같은 `seen`을 다시 쓴다 — `duplicate-id`가 이미 id를 모으고 있으므로 두 번째 모음을
   * 만들지 않는다.
   */
  const withInteractions: { node: WbNode; path: string }[] = []

  if (root.type !== 'Page') {
    issues.push(makeIssue('bad-root', root.id, '/root', `루트는 Page여야 합니다 (현재: ${root.type})`))
  }

  for (const { node, path } of walkNodes(root)) {
    if (seen.has(node.id)) {
      issues.push(makeIssue('duplicate-id', node.id, path, `id가 중복됩니다: ${node.id}`))
    }
    // 중복이면 나중 것이 남는다. `duplicate-id`가 이미 error라 그 문서는 저장되지 않으므로
    // 어느 쪽이 남는지가 다른 판정을 바꾸지 않는다.
    seen.set(node.id, node)
    if (Array.isArray(node.interactions) && node.interactions.length > 0) {
      withInteractions.push({ node, path })
    }

    const def = getComponent(node.type)
    if (!def) {
      issues.push(makeIssue('unknown-type', node.id, path, `알 수 없는 컴포넌트 타입: ${node.type}`))
      continue
    }

    const parsed = def.props.safeParse(node.props ?? {}, { error: getKoreanErrorMap() })
    if (!parsed.success) {
      issues.push(
        makeIssue(
          'invalid-props',
          node.id,
          `${path}/props`,
          `${node.type}의 props가 올바르지 않습니다: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')} ${issue.message}`)
            .join(', ')}`,
        ),
      )
    }

    if (def.children === 'none' && (node.children?.length ?? 0) > 0) {
      issues.push(
        makeIssue('children-not-allowed', node.id, `${path}/children`, `${node.type}은 자식을 담을 수 없습니다`),
      )
    }

    if (node.variant !== undefined) {
      if (def.variantFrom !== undefined) {
        /**
         * **`variantFrom`이 있으면 `unknown-variant`를 내지 않는다.** 그 컴포넌트에서는
         * `node.variant`가 선언된 값이든 아니든 **똑같이 무시되므로**, "정의되지 않았다"는
         * 문장이 원인을 잘못 가리킨다. 두 입력이 그것을 보여 준다: `unknown-variant`로 가르면
         * `variant:'없는변형'`은 **아무 영향 없는 값 때문에 문서가 무효**가 되고(거짓 양성),
         * `variant:'caption'`은 **이슈 0건으로 조용히 사라진다**(침묵). 그래서 둘 다 같은
         * 이슈 하나를 받고, 그 문장이 무슨 일이 일어나는지 말한다.
         */
        issues.push(
          makeIssue('ignored-variant', node.id, `${path}/variant`, ignoredVariantMessage(def, node.variant)),
        )
      } else if (!def.variants.includes(node.variant)) {
        issues.push(
          makeIssue(
            'unknown-variant',
            node.id,
            `${path}/variant`,
            `${node.type}에 정의되지 않은 variant입니다: ${node.variant}`,
          ),
        )
      }
    }
  }

  for (const { node, path } of withInteractions) {
    issues.push(...checkInteractions(node, path, seen))
  }

  return issues
}

/**
 * 노드 하나에 걸린 상호작용을 검사한다(설계서 「모델」(상호작용) — *"그래서 규칙을 정적으로 검증할 수
 * 있고(타겟 존재 여부, prop 유효성)"*).
 *
 * ---
 *
 * **`navigate`·`openModal`의 `target`은 검사하지 않는다.**
 *
 * 설계서의 예가 `"page:관리자/회원/상세"`다. **노드 id가 아니라 페이지 경로**이고 그 페이지는
 * **이 문서 안에 없다** — 검증기가 받는 것은 문서 하나이므로 여기서 풀 수 없다.
 * 근거는 둘이다:
 *
 * 1. **형식(`page:` 접두)을 강제하는 것은 규격에 없는 규칙을 만드는 것이다.** 설계서는 예를
 *    하나 보였을 뿐 형식을 정하지 않았고, 같은 저장소의 `Link.target`도 자유 문자열이다.
 * 2. **형식을 맞춰도 그 페이지가 있다는 보장이 아니다.** 즉 *"검증했다"*는 인상만 주고
 *    실제 끊김(지워진 페이지)은 그대로 지난다 — 프로젝트 전체를 보는 검사(`exporter`나
 *    설계서 「lint 규칙」의 lint가 그 자리다)가 할 일이다.
 *
 * **그래서 노드 id처럼 생긴 값을 줘도 노드로 보지 않는다.** 그 둘의 `target`은 노드 id
 * 공간이 아니므로 *"문서에 없는 노드"*라고 말하면 거짓 경고가 된다.
 *
 * ---
 *
 * **재지 않고 남긴 것 — `switchTab`의 `tab` 범위.** `tabs` 배열 길이 밖의 번호를 여기서
 * 막지 않는다. `Tabs.active`(같은 뜻의 값)가 카탈로그에서 `z.number().int().min(0)`뿐이라
 * **상한이 없기 때문이다** — 상호작용에만 상한을 두면 같은 값이 노드의 prop 자리에서는
 * 유효하고 액션 자리에서는 무효가 된다. 카탈로그가 상한을 정하는 것이 먼저다.
 *
 * ---
 *
 * **판정 자체는 `interaction/check.ts`에 있다.** 여기서 하는 일은 그 판정을
 * **이슈로 감싸는 것**뿐이다 — 경로·nodeId·severity가 붙는 자리가 여기이기 때문이다.
 * 갈라 둔 이유는 그 모듈의 머리말에 있다: **뷰 모드의 런타임이 같은 물음을 묻는다.**
 *
 * **`checkPageAction`은 여기서 부르지 않는다.** 부르면 위 «`target`은 검사하지 않는다»가 깨진다 —
 * 빈 페이지 타겟이 저장 경로에서 경고가 되기 시작한다. 런타임만 그것을 본다(그쪽은
 * *"눌렀는데 아무 일도 안 일어난다"*를 막아야 한다).
 */
function checkInteractions(
  node: WbNode,
  path: string,
  seen: ReadonlyMap<string, WbNode>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const interactions = node.interactions ?? []

  for (const [index, interaction] of interactions.entries()) {
    for (const [actionIndex, action] of (interaction.actions ?? []).entries()) {
      // 페이지 경로를 받는 둘은 여기서 끝난다(위 머리말).
      if (isPageTargetAction(action)) continue

      const problem = checkNodeAction(seen, action)
      if (problem === null) continue

      issues.push(
        makeIssue(
          problem.code,
          node.id,
          `${path}/interactions/${index}/actions/${actionIndex}`,
          problem.message,
        ),
      )
    }
  }

  return issues
}

function countSlots(root: WbNode): number {
  let count = 0
  for (const { node } of walkNodes(root)) {
    if (node.type === 'Slot') count += 1
  }
  return count
}
