import { ONE_SELECTED_MESSAGE } from './component/catalog/input'
import { picksOneChoice } from './component/code-binding'
import { BODY_ZONE, placementsOf, type ComponentDef, type ComponentPlace } from './component/define'
import { checkNodeAction, isPageTargetAction, isTargetlessAction } from './interaction/check'
import { getComponent } from './component/registry'
import { aliasNote } from './display'
import { DocumentEnvelopeSchema, NODE_ID_PATTERN, PageEnvelopeSchema } from './envelope'
import { DEFAULT_VIEW_STATE, type LayoutDocument, type PageDocument, type WbNode } from './node'
import { walkNodes } from './tree'
import { zoneList, zonePointer } from './zones'
import { getKoreanErrorMap } from './locale'

export type ValidationCode =
  | 'unknown-type'
  | 'invalid-props'
  /** 몸통(`body` 구역)이 없는 타입이 `children`을 들었다. 경로는 `…/children`. */
  | 'children-not-allowed'
  /** 그 타입이 선언하지 않은 구역을 `zones`에 들었다. 경로는 `…/zones/<이름>`. */
  | 'zone-not-allowed'
  /** 구역이 받지 않는 타입의 노드가 그 구역에 섰다(`ZoneDef.accepts` — `Tabs` 몸통의 `TabPanel` 밖). 노드는 그 자식이다. */
  | 'zone-type-not-allowed'
  /** 설 자리가 정해진 타입이 그 밖에 섰다(`ComponentDef.placement` — `TabPanel` 이 `Tabs` 몸통 밖). 노드는 그 노드다. */
  | 'misplaced-component'
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
  /**
   * 뿌리가 아닌 자리에 `Page`가 섰다 — 깊이와 상관없다. `Page`는 페이지당 하나인 뿌리 노드다(설계서 「컴포넌트 카탈로그」). 노드는 그
   * `Page`다. 이 규칙을 들이기 전에 저장된 문서에 이미 선 중첩 `Page`는 저장 경계가 거절 사유로 세지 않는다(`excuseStandingNestedPages`).
   */
  | 'nested-page'
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
   * `switchTab`의 대상이 `TabPanel`이 아닐 때 하나뿐이다.
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
   * **편집이 목록에 없는 상태를 가리키는 보임을 새로 만들었다** — 목록에서 뺀 상태(편집 전에는 있던 id)를 보임이 아직 가리키거나, 편집이 목록 밖
   * 상태를 보임에 넣었다. 노드는 그 보임의 노드다. 문서 하나만 보고는 «새로»를 알 수 없어 `validatePage`는 이 코드를 안 낸다 — 저장 경계(편집
   * 파이프라인)가 편집 전후로 `checkViewStateRemoval`을 부른다. 편집 전부터 목록 밖이던 가리킴은 여기 안 온다(lint 의 `view-state-unknown`).
   */
  | 'state-cases-left'
  /**
   * 공통코드 참조(`WbNode.code`)가 그 타입의 선언(`ComponentDef.code`)과 안 맞는다 — 받지 않는 타입 · 선택 위젯의 `item` · 대표 글 타입의 `item`
   * 없음이나 `selected` · 하나 고르는 타입의 `selected` 둘 이상 · 겹친 값. 경로는 `…/code`. **표에 있는지는 여기서 안 본다** — 검증은 표를
   * 모른다(lint 의 `broken-code-ref`). 표에서 항목을 지워도 문서는 저장된다.
   */
  | 'invalid-code-ref'

/**
 * 이슈가 편집·저장을 **막는가**.
 *
 * - `error` — 막는다. 설계서 「정방향 흐름」의 서버 게이트가 거부한다.
 * - `warning` — 막지 않는다. 저장되고 응답에 실려 나간다.
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
  'zone-not-allowed': 'error',
  'zone-type-not-allowed': 'error',
  'misplaced-component': 'error',
  'ignored-variant': 'warning',
  'duplicate-id': 'error',
  'bad-root': 'error',
  'nested-page': 'error',
  'slot-count': 'error',
  'bad-document': 'error',
  'missing-interaction-target': 'warning',
  'invalid-interaction-target': 'warning',
  'invalid-interaction-prop': 'warning',
  'state-cases-left': 'error',
  'invalid-code-ref': 'error',
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
function makeIssue(code: ValidationCode, nodeId: string | null, path: string, message: string): ValidationIssue {
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
 * **`severity`를 가진 것이면 무엇이든 받는다 — 제네릭이다.** 제네릭인 것은 **입력의 타입뿐이고 판정은 하나다** —
 * `T`가 그대로 나가므로 부르는 쪽이 자기 이슈 타입(`ValidationIssue`의 좁힌 꼴 등)을 잃지 않는다.
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

/** 무시되는 `variant`를 알리는 문장. 말해야 하는 것 둘: **적은 값이 버려진다**는 것과 **무엇이 대신 쓰이는가**. */
function ignoredVariantMessage(def: ComponentDef, variant: string): string {
  return `${def.type}의 variant는 무시됩니다: ${variant} ` + `(${def.type}은 ${def.variantFrom} prop에서 변형을 파생합니다)`
}

/**
 * 뿌리에만 서는 타입 — 페이지의 «종류» 가 뿌리 타입이다(`Page` = 화면 · `Popup` = 팝업). 둘 다 뿌리 밖에 서면 `nested-page` 다. 레이아웃 뿌리는
 * `Page` 뿐이다(`validateLayout`).
 */
export const ROOT_TYPES: readonly string[] = ['Page', 'Popup']

/** 뿌리에만 서는 타입인가(`ROOT_TYPES`). 붙이기 · 팔레트 · 모듈 넣기가 뿌리를 거르는 자리도 이것을 본다. */
export function isRootType(type: unknown): boolean {
  return typeof type === 'string' && ROOT_TYPES.includes(type)
}

export function validatePage(doc: PageDocument): ValidationIssue[] {
  const envelopeIssues = validateEnvelope(doc, PageEnvelopeSchema)
  if (envelopeIssues.length > 0) return envelopeIssues

  const issues = validateTree(doc.root, ROOT_TYPES)
  // 뿌리가 숨으면 그 상태의 화면이 통째로 빈다 — 보임은 뿌리 아래 노드에만 둔다(속성 패널도 뿌리에는 칸을 안 세운다).
  if (doc.root.visibility !== undefined) {
    issues.push(makeIssue('bad-root', doc.root.id, '/root/visibility', '페이지 뿌리에는 상태 보임을 둘 수 없습니다'))
  }
  const slots = countSlots(doc.root)
  if (slots > 0) {
    issues.push(makeIssue('slot-count', null, '/root', `페이지에는 Slot을 둘 수 없습니다 (${slots}개 발견)`))
  }
  return issues
}

/**
 * **편집 전 문서에 이미 서 있던 중첩 `Page`의 `nested-page`를 걷는다** — 저장 경계(`apps/api`의 `services/edit-pipeline.ts` 6단계 · 웹의
 * 붙이기 판정)가 편집 뒤 이슈에 건다. 규칙을 들이기 전에 저장된 문서가 그 중첩과 **무관한** 편집(다른 노드의 글자)까지 422 로 막히지 않게
 * 하고, 새로 넣는 것만 막는다.
 *
 * **노드 id 로 가른다 — 경로가 아니다.** 앞 형제를 넣거나 빼는 편집은 그 `Page`의 경로를 밀어, 경로로 가르면 무관한 편집이 «새로 넣었다»가
 * 된다. id 는 한 문서 안에서 겹치지 않으므로(`duplicate-id`) 걷히는 중첩 `Page`의 수는 편집 전 수를 넘지 못한다 — 옮기기 · 고치기는 되고
 * 늘리기는 안 된다. 편집 전 문서의 봉투가 깨졌으면 걷을 것이 없다(트리를 못 걷는다).
 *
 * `nested-page`가 없으면 편집 전 문서를 검증하지 않는다 — 평소 편집에는 비용이 없다.
 */
export function excuseStandingNestedPages<T extends ValidationIssue>(before: PageDocument, issues: readonly T[]): T[] {
  if (!issues.some((issue) => issue.code === 'nested-page')) return [...issues]
  const standing = new Set(
    validatePage(before).flatMap((issue) => (issue.code === 'nested-page' && issue.nodeId !== null ? [issue.nodeId] : [])),
  )
  return issues.filter((issue) => !(issue.code === 'nested-page' && issue.nodeId !== null && standing.has(issue.nodeId)))
}

/**
 * **노드 묶음을 페이지 뿌리의 자식으로 놓으면 설 `nested-page`** — 프리셋 저장(`apps/api` 의 `routes/presets.ts`)이 새 프리셋에 건다.
 * 프리셋은 적용하면 뿌리의 자식이 되므로 맨 위 `Page`도 센다. 판정은 `validateTree` 의 것 그대로이고(빈 뿌리 `Page` 아래에 놓아 본다)
 * `nested-page` 만 낸다 — 다른 카탈로그 판정은 적용 때 결과 문서 전체로 한다. 경로는 묶음 기준이다(`/1/children/0`).
 */
export function nestedPagesUnderRoot(nodes: readonly WbNode[]): ValidationIssue[] {
  const probe: WbNode = { id: 'n_nestedprobe', type: 'Page', children: [...nodes] }
  return validateTree(probe, ROOT_TYPES)
    .filter((issue) => issue.code === 'nested-page')
    .map((issue) => ({ ...issue, path: issue.path.slice('/root/children'.length) }))
}

/**
 * **편집이 목록 밖 상태를 가리키는 보임을 새로 만들었는가**(`state-cases-left`) — 저장 경계(`apps/api`의 `services/edit-pipeline.ts` 6단계)가
 * 편집 전 문서 `before`와 적용 뒤 문서 `after`로 부른다. `after`의 노드마다 보임이 가리키는 목록 밖 상태(`unknownVisibilityStates`) 가운데,
 * `before`에서 **같은 노드 id 가 이미 목록 밖으로 가리키던 것**이 아니면 이슈다 — 목록에서 뺀 상태를 보임이 아직 가리키는 판(상태 빼기 · id
 * 바꾸기 · 목록째 갈아 끼우기)과 편집이 목록 밖 상태를 보임에 넣은 판 둘 다.
 *
 * **왜 오류인가** — 목록에서만 빼면 그 상태로 설계한 노드가 어느 상태에서도 안 선다(`only`) · 숨기려던 곳에서 선다(`except`). 잠금 판정은 포인터
 * 겹침이라 `/viewStates`는 남이 잡은 노드와 안 겹쳐 지나간다. 상태 삭제는 보임까지 함께 고치는 묶음(`removeViewStateOps` — 노드 `remove` ·
 * `replace`가 잠금 판정을 탄다)으로만 한다.
 *
 * | 입구 | 목록 밖 가리킴 |
 * |---|---|
 * | 편집(REST · WS) · `PUT …/schema` · 스냅샷 복원 — 파이프라인을 탄다 | 편집이 **새로 만든** 것이면 오류(422). 편집 전부터 같은 노드가 그랬으면 통과 |
 * | 페이지 JSON 가져오기 | 새 페이지에 쓰므로 편집 전 문서가 없다 — 통과(lint) |
 * | 저장된 문서를 읽을 때(lint · `pageView`) | 오류가 아니다 — lint 경고 |
 *
 * `after`의 봉투가 깨졌으면(`validatePage`가 `bad-document`만 내는 판) 부르지 않는다 — 트리를 걷지 못한다. `before`는 검증 전일 수 있어
 * 읽을 수 있는 만큼만 읽는다.
 */
export function checkViewStateRemoval(before: { root?: unknown; viewStates?: unknown }, after: PageDocument): ValidationIssue[] {
  const standing = new Map<string, Set<string>>()
  try {
    for (const entry of unknownVisibilityStates(before as PageDocument)) standing.set(entry.nodeId, new Set(entry.states))
  } catch {
    // 걸을 수 없는 편집 전 문서 — 서 있던 것이 없다고 읽는다(새로 만든 것으로 센다).
  }
  const issues: ValidationIssue[] = []
  for (const { nodeId, path, states } of unknownVisibilityStates(after)) {
    const fresh = states.filter((state) => !standing.get(nodeId)?.has(state))
    if (fresh.length === 0) continue
    issues.push(
      makeIssue(
        'state-cases-left',
        nodeId,
        path,
        `상태 보임이 목록에 없는 상태를 가리킵니다: ${fresh.join(', ')} — 상태 삭제는 그 상태를 가리키는 보임을 함께 고칩니다`,
      ),
    )
  }
  return issues
}

/**
 * **목록 밖 상태를 가리키는 보임** — 노드마다 보임의 `states` 중 페이지 목록에 없고 `DEFAULT_VIEW_STATE` 도 아닌 것(문서 차례). 문서 하나에서는
 * lint 경고(`view-state-unknown`)이고, 편집이 새로 만든 것은 저장 경계가 막는다(`checkViewStateRemoval`). 봉투가 깨진 문서는 부르지 않는다.
 */
export function unknownVisibilityStates(doc: PageDocument): { nodeId: string; path: string; states: string[] }[] {
  const known = new Set((doc.viewStates ?? []).map((state) => state.id))
  known.add(DEFAULT_VIEW_STATE)
  const out: { nodeId: string; path: string; states: string[] }[] = []
  for (const { node, path } of walkNodes(doc.root)) {
    const states = (node.visibility?.states ?? []).filter((state) => !known.has(state))
    if (states.length > 0) out.push({ nodeId: node.id, path: `${path}/visibility`, states })
  }
  return out
}

const LAYOUT_ROOT_TYPES: readonly string[] = ['Page']

export function validateLayout(doc: LayoutDocument): ValidationIssue[] {
  const envelopeIssues = validateEnvelope(doc, DocumentEnvelopeSchema)
  if (envelopeIssues.length > 0) return envelopeIssues

  const issues = validateTree(doc.root, LAYOUT_ROOT_TYPES)
  const slots = countSlots(doc.root)
  if (slots !== 1) {
    issues.push(makeIssue('slot-count', null, '/root', `레이아웃에는 Slot이 정확히 하나여야 합니다 (${slots}개 발견)`))
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

function validateTree(root: WbNode, rootTypes: readonly string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  /**
   * 지나온 노드를 id로 든다. **`Set`이 아니라 `Map`인 것은 상호작용 검사 때문이다** —
   * 타겟이 **있는지**만이 아니라 그 노드의 **타입**까지 봐야 `switchTab`의 대상이 `TabPanel`인지,
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

  if (!rootTypes.includes(root.type)) {
    issues.push(
      makeIssue(
        'bad-root',
        root.id,
        '/root',
        `루트는 ${rootTypes.join(' 또는 ')}${rootTypes.length > 1 ? '이어야' : '여야'} 합니다 (현재: ${root.type})`,
      ),
    )
  }

  for (const { node, path, parent, zone } of walkNodes(root)) {
    if (isRootType(node.type) && parent !== null) {
      issues.push(
        makeIssue('nested-page', node.id, path, `${node.type}는 루트에만 둘 수 있습니다 — 페이지 안에 ${node.type}를 넣을 수 없습니다`),
      )
    }
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

    issues.push(...checkZones(def, node, path))
    issues.push(...checkCodeRef(def, node, path))
    const places = placementsOf(def)
    if (places.length > 0 && !places.some((place) => parent !== null && parent.type === place.type && zone === place.zone)) {
      issues.push(makeIssue('misplaced-component', node.id, path, `${def.label}은 ${placementName(places)} 안에만 놓을 수 있습니다`))
    }

    /**
     * **`node.variant`의 값은 판정하지 않는다** — 고를 수 있는 변형은 테마 manifest 가 선언하고(`components[type].variants`)
     * 스키마는 테마를 모른다. manifest 에 없는 값은 렌더러가 그 테마의 `defaultVariant`로 그린다(`renderer`의
     * `resolveVariant`). 판정하는 것은 **값이 버려지는** 한 경우뿐이다 — `variantFrom`을 가진 컴포넌트는 `node.variant`를
     * 무엇이든 무시하므로 그 사실을 경고로 말한다.
     */
    if (node.variant !== undefined && def.variantFrom !== undefined) {
      issues.push(makeIssue('ignored-variant', node.id, `${path}/variant`, ignoredVariantMessage(def, node.variant)))
    }
  }

  for (const { node, path } of withInteractions) {
    issues.push(...checkInteractions(node, path, seen))
  }

  return issues
}

/** 노드의 공통코드 참조가 그 타입의 선언과 맞는가(`invalid-code-ref`). 봉투가 이미 키 · 값의 꼴을 봤다. */
function checkCodeRef(def: ComponentDef, node: WbNode, path: string): ValidationIssue[] {
  const ref = node.code
  if (ref === undefined) return []
  const issue = (message: string) => [makeIssue('invalid-code-ref', node.id, `${path}/code`, `${message}${aliasNote(node)}`)]
  const binding = def.code
  if (binding === undefined) return issue(`${def.label}은 공통코드에 묶을 수 없습니다`)
  if (binding.kind === 'choices') {
    if (ref.item !== undefined) return issue(`${def.label}은 그룹에 묶습니다 — 항목(item)을 둘 수 없습니다`)
    const selected = ref.selected ?? []
    if (new Set(selected).size !== selected.length) return issue('고른 코드값이 겹칩니다')
    if (picksOneChoice(def) && selected.length > 1) return issue(`${def.label}은 ${ONE_SELECTED_MESSAGE}`)
    return []
  }
  if (ref.item === undefined) return issue(`${def.label}은 항목 하나에 묶습니다 — 항목(item)이 없습니다`)
  if (ref.selected !== undefined) return issue(`${def.label}은 고른 값(selected)을 둘 수 없습니다`)
  return []
}

/**
 * 노드의 자식 줄이 그 타입의 구역 선언(`ComponentDef.zones`)과 맞는가 — 몸통이 없는 타입의 `children` · 선언 밖 구역 · 구역이 받지 않는 타입.
 * 이슈 경로는 그 구역(또는 그 자식)의 경로다.
 */
function checkZones(def: ComponentDef, node: WbNode, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!def.zones.some((zone) => zone.name === BODY_ZONE) && (node.children?.length ?? 0) > 0) {
    issues.push(makeIssue('children-not-allowed', node.id, `${path}/children`, `${node.type}은 자식을 담을 수 없습니다${aliasNote(node)}`))
  }
  for (const name of Object.keys(node.zones ?? {})) {
    if (def.zones.some((zone) => zone.name === name && name !== BODY_ZONE)) continue
    issues.push(
      makeIssue('zone-not-allowed', node.id, `${path}/zones/${name}`, `${node.type}에는 ${name} 구역이 없습니다${aliasNote(node)}`),
    )
  }
  for (const zone of def.zones) {
    if (zone.accepts === undefined) continue
    zoneList(node, zone.name).forEach((child, index) => {
      const type = (child as WbNode).type
      if (zone.accepts!.includes(type)) return
      issues.push(
        makeIssue(
          'zone-type-not-allowed',
          (child as WbNode).id,
          `${path}${zonePointer(zone.name)}/${index}`,
          `${def.label}에는 ${zone.accepts!.map(componentName).join(' · ')}만 넣을 수 있습니다 (현재: ${componentName(type)})`,
        ),
      )
    })
  }
  return issues
}

/** 이유 문장의 컴포넌트 이름 — 카탈로그의 `label`, 모르는 타입은 그대로. */
function componentName(type: string): string {
  return getComponent(type)?.label ?? type
}

/** 설 자리들을 부르는 말 — 부모 타입의 이름을 겹치지 않게 ` · ` 로 잇는다(«그리드 · 열 묶음»). */
function placementName(places: readonly ComponentPlace[]): string {
  return [...new Set(places.map((place) => componentName(place.type)))].join(' · ')
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
 * **판정 자체는 `interaction/check.ts`에 있다.** 여기서 하는 일은 그 판정을
 * **이슈로 감싸는 것**뿐이다 — 경로·nodeId·severity가 붙는 자리가 여기이기 때문이다.
 * 갈라 둔 이유는 그 모듈의 머리말에 있다: **뷰 모드의 런타임이 같은 물음을 묻는다.**
 *
 * **`checkPageAction`은 여기서 부르지 않는다.** 부르면 위 «`target`은 검사하지 않는다»가 깨진다 —
 * 빈 페이지 타겟이 저장 경로에서 경고가 되기 시작한다. 런타임만 그것을 본다(그쪽은
 * *"눌렀는데 아무 일도 안 일어난다"*를 막아야 한다).
 */
function checkInteractions(node: WbNode, path: string, seen: ReadonlyMap<string, WbNode>): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const interactions = node.interactions ?? []

  for (const [index, interaction] of interactions.entries()) {
    for (const [actionIndex, action] of (interaction.actions ?? []).entries()) {
      // 페이지 경로를 받는 둘은 여기서 끝난다(위 머리말). 팝업 닫기는 대상이 없다.
      if (isPageTargetAction(action) || isTargetlessAction(action)) continue

      const problem = checkNodeAction(seen, action)
      if (problem === null) continue

      issues.push(makeIssue(problem.code, node.id, `${path}/interactions/${index}/actions/${actionIndex}`, problem.message))
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
