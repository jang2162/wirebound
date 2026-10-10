import type { ComponentDef } from './component/define'
import { checkNodeAction, isPageTargetAction } from './interaction/check'
import { getComponent } from './component/registry'
import { aliasNote } from './display'
import { DocumentEnvelopeSchema, NODE_ID_PATTERN, PageEnvelopeSchema } from './envelope'
import { DEFAULT_CASE, type LayoutDocument, type PageDocument, type WbNode } from './node'
import { walkNodes } from './tree'
import { getKoreanErrorMap } from './locale'

export type ValidationCode =
  | 'unknown-type'
  | 'invalid-props'
  | 'children-not-allowed'
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
   * 상태 영역(`StateSwitch`)의 기본 가지(`StateCase` · `props.state` 가 `default`)가 정확히 하나가 아니다. 렌더러는 그 상태의 가지가
   * 없으면 기본 가지를 그리므로, 없으면 그릴 것이 없고 둘이면 어느 것인지 정할 수 없다. 노드는 그 `StateSwitch`다.
   */
  | 'state-case-default'
  /** 한 상태 영역 안에서 같은 상태를 가리키는 가지가 둘 이상이다. 노드는 뒤에 선 가지다. */
  | 'state-case-duplicate'
  /** `StateCase`가 `StateSwitch`의 자식이 아닌 자리에 섰다. */
  | 'state-case-outside'
  /** `StateSwitch`의 자식이 `StateCase`가 아니다. */
  | 'state-switch-child'
  /**
   * **편집이 목록에서 뺀 상태(편집 전 목록에 있던 id)를 가리키는 가지가 편집 뒤 문서에 남았다.** 노드는 그 가지다. 문서 하나만 보고는 «뺐다»를
   * 알 수 없어 `validatePage`는 이 코드를 안 낸다 — 저장 경계(편집 파이프라인)가 편집 전후로 `checkViewStateRemoval`을 부른다. 편집 전부터
   * 목록 밖이던 가지는 여기 안 온다(lint 의 몫 — `checkStateRegion` 머리말).
   */
  | 'state-cases-left'

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
 */
export const ISSUE_SEVERITY: Record<ValidationCode, IssueSeverity> = {
  'unknown-type': 'error',
  'invalid-props': 'error',
  'children-not-allowed': 'error',
  'ignored-variant': 'warning',
  'duplicate-id': 'error',
  'bad-root': 'error',
  'slot-count': 'error',
  'bad-document': 'error',
  'missing-interaction-target': 'warning',
  'invalid-interaction-target': 'warning',
  'invalid-interaction-prop': 'warning',
  'state-case-default': 'error',
  'state-case-duplicate': 'error',
  'state-case-outside': 'error',
  'state-switch-child': 'error',
  'state-cases-left': 'error',
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
 * `apps/api`의 저장 게이트(`edit-pipeline` · `routes/pages.ts`),
 * `apps/web`의 삽입 판정까지 자리가 계속 는다 — 수를 적어 두면
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
 * 코드 유니온이 다른 이슈도 같은 `severity`를 든다 — `packages/themes`의 `ThemeIssue`(패턴 이슈)가 그렇다(평행 유니온을
 * 만들면 따로 썩어 코드를 일부러 갈라 두었다). `ValidationIssue[]`로 못박아
 * 두면 그쪽이 이 함수를 부를 수 없고, **선을 긋는 코드가 하나여야 한다**는 위 규칙이
 * 바로 그 자리에서 깨진다 — 그쪽이 자기 `filter`를 다시 쓰게 된다.
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
  const envelopeIssues = validateEnvelope(doc, PageEnvelopeSchema)
  if (envelopeIssues.length > 0) return envelopeIssues

  const issues = validateTree(doc.root)
  const slots = countSlots(doc.root)
  if (slots > 0) {
    issues.push(makeIssue('slot-count', null, '/root', `페이지에는 Slot을 둘 수 없습니다 (${slots}개 발견)`))
  }
  return issues
}

/**
 * **편집이 목록에서 뺀 상태의 가지가 남았는가**(`state-cases-left`) — 저장 경계(`apps/api`의 `services/edit-pipeline.ts` 6단계)가 편집 전
 * 문서 `before`와 적용 뒤 문서 `after`로 부른다. «뺀 상태»는 `before`의 목록에 있고 `after`의 목록에 없는 id 다(빼기 · id 바꾸기 · 목록째
 * 빼거나 갈아 끼우기). 그 상태를 가리키는 `StateCase`가 `after`에 남았으면 가지마다 이슈 하나.
 *
 * **왜 오류인가** — 목록에서만 빼면 그 가지가 어느 상태에서도 안 그려지는데, 잠금 판정은 포인터 겹침이라 `/viewStates`는 가지 안 남의 잠금과
 * 안 겹쳐 지나간다(K1 리뷰 R2). 상태 삭제는 가지째 지우는 묶음(`removeViewStateOps` — 가지 `remove`가 잠금 판정을 탄다)으로만 한다.
 *
 * | 입구 | 목록 밖 가지 |
 * |---|---|
 * | 편집(REST · WS) · `PUT …/schema` · 스냅샷 복원 — 파이프라인을 탄다 | 편집이 **뺀** 상태의 가지면 오류(422). 편집 전부터 목록 밖이면 통과 |
 * | 페이지 JSON 가져오기 | 새 페이지(목록 없음)에 쓰므로 뺀 상태가 없다 — 통과(목록 밖 가지는 lint) |
 * | 붙여넣기 · 복제 · 프리셋 | 목록을 안 바꾼다 — 통과(목록 밖 가지는 lint) |
 * | 저장된 문서를 읽을 때(lint · `pageView`) | 오류가 아니다 — lint 경고(K3) |
 *
 * `after`의 봉투가 깨졌으면(`validatePage`가 `bad-document`만 내는 판) 부르지 않는다 — 트리를 걷지 못한다.
 */
export function checkViewStateRemoval(before: { viewStates?: unknown }, after: PageDocument): ValidationIssue[] {
  const listed = (doc: { viewStates?: unknown }) =>
    new Set(Array.isArray(doc.viewStates) ? doc.viewStates.flatMap((entry: unknown) => (entry !== null && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string' ? [(entry as { id: string }).id] : [])) : [])
  const now = listed(after)
  const removed = [...listed(before)].filter((id) => !now.has(id))
  if (removed.length === 0) return []
  const gone = new Set(removed)
  const issues: ValidationIssue[] = []
  for (const { node, path } of walkNodes(after.root)) {
    const state = node.type === 'StateCase' ? node.props?.state : undefined
    if (typeof state !== 'string' || !gone.has(state)) continue
    issues.push(
      makeIssue('state-cases-left', node.id, path, `목록에서 뺀 상태를 가리키는 가지가 남아 있습니다: ${state} — 상태 삭제는 그 가지를 함께 지웁니다`),
    )
  }
  return issues
}

export function validateLayout(doc: LayoutDocument): ValidationIssue[] {
  const envelopeIssues = validateEnvelope(doc, DocumentEnvelopeSchema)
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
function validateEnvelope(doc: unknown, schema: typeof DocumentEnvelopeSchema): ValidationIssue[] {
  const parsed = schema.safeParse(doc, { error: getKoreanErrorMap() })
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
 * - 경로가 `root` 아래가 아니면(상태 목록 `/viewStates/…` · `/version`) null — 노드가 아니다.
 *
 * 알아낼 수 없으면 null.
 */
function resolveNodeId(doc: unknown, path: readonly PropertyKey[]): string | null {
  // 노드는 `root` 아래에만 있다 — 상태 목록의 항목(`{ id, name }`)도 `id`를 가져, 그 이슈가 상태 id 를 노드 id 로 실었다(K1 리뷰 R5).
  if (path[0] !== 'root') return null
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

  for (const { node, path, parent } of walkNodes(root)) {
    issues.push(...checkStateRegion(node, path, parent))
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
          `${node.type}의 props가 올바르지 않습니다${aliasNote(node)}: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')} ${issue.message}`)
            .join(', ')}`,
        ),
      )
    }

    if (def.children === 'none' && (node.children?.length ?? 0) > 0) {
      issues.push(
        makeIssue('children-not-allowed', node.id, `${path}/children`, `${node.type}은 자식을 담을 수 없습니다${aliasNote(node)}`),
      )
    }

    /**
     * **`node.variant`의 값은 판정하지 않는다** — 고를 수 있는 변형은 테마 manifest 가 선언하고(`components[type].variants`)
     * 스키마는 테마를 모른다. manifest 에 없는 값은 렌더러가 그 테마의 `defaultVariant`로 그린다(`renderer`의
     * `resolveVariant`). 판정하는 것은 **값이 버려지는** 한 경우뿐이다 — `variantFrom`을 가진 컴포넌트는 `node.variant`를
     * 무엇이든 무시하므로 그 사실을 경고로 말한다.
     */
    if (node.variant !== undefined && def.variantFrom !== undefined) {
      issues.push(
        makeIssue('ignored-variant', node.id, `${path}/variant`, ignoredVariantMessage(def, node.variant)),
      )
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

/**
 * 상태 영역의 구조 — `StateSwitch`의 자식은 `StateCase`만이고 기본 가지가 정확히 하나 · 상태마다 가지가 많아야 하나, `StateCase`는
 * `StateSwitch` 아래에만 선다. **가지가 가리키는 상태가 페이지 목록에 있는지는 여기서 보지 않는다** — 문서 하나에서는 lint 경고다(그
 * 가지는 그려지지 않을 뿐 문서를 못 쓰게 하지 않고, 오류로 두면 목록 밖 가지가 든 문서의 **무관한** 편집까지 막힌다 — 상호작용 이슈를
 * `warning`으로 둔 `ISSUE_SEVERITY` 머리말의 둘째 근거와 같다). 편집이 목록에서 **뺀** 상태의 가지는 저장 경계가 편집 전후로 따로 막는다
 * (`checkViewStateRemoval`). 그래서 레이아웃 · 클립보드의 임시 뿌리처럼 목록이 없는 문서도 같은 판정을 받는다.
 *
 * `state`가 문자열이 아닌 가지는 기본도 상태도 아닌 것으로 센다 — 그 모양은 `invalid-props`가 따로 말한다.
 */
function checkStateRegion(node: WbNode, path: string, parent: WbNode | null): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (node.type === 'StateCase' && parent?.type !== 'StateSwitch') {
    issues.push(makeIssue('state-case-outside', node.id, path, '상태 가지는 상태 영역 바로 아래에만 둘 수 있습니다'))
  }
  if (node.type !== 'StateSwitch') return issues

  const children = node.children ?? []
  let defaults = 0
  const states = new Set<string>()
  children.forEach((child, index) => {
    const childPath = `${path}/children/${index}`
    if (child.type !== 'StateCase') {
      issues.push(makeIssue('state-switch-child', child.id, childPath, `상태 영역에는 상태 가지만 둘 수 있습니다 (현재: ${child.type})`))
      return
    }
    const state = child.props?.state
    if (state === DEFAULT_CASE) defaults += 1
    else if (typeof state === 'string') {
      if (states.has(state)) {
        issues.push(makeIssue('state-case-duplicate', child.id, childPath, `한 상태 영역에 같은 상태의 가지가 둘입니다: ${state}`))
      }
      states.add(state)
    }
  })
  if (defaults !== 1) {
    issues.push(makeIssue('state-case-default', node.id, path, `상태 영역에는 기본 가지가 정확히 하나여야 합니다 (${defaults}개 발견)`))
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
