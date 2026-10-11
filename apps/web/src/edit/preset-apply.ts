/**
 * 프리셋을 페이지에 놓는 편집을 만드는 곳.
 *
 * **순수 함수이고 React·DOM·`fetch`를 모른다** — `./ops.ts`·`./pattern-insert.ts`와 같은
 * 층이다. **던지지 않는다**: 부르는 자리가 구조 트리의 명령(`panels/structure-toolbar.tsx`)이고 거기는 오류 경계 밖이라 던지면
 * 셸 전체가 흰 화면이 된다(`panels/structure-toolbar.tsx` 머리말).
 *
 * ---
 *
 * # 패턴 삽입과 갈리는 것 셋
 *
 * | | 패턴(`pattern-insert.ts`) | 프리셋(여기) |
 * |---|---|---|
 * | 무엇을 답하나 | *"어디에 꽂나"* | *"무엇을 치우고 놓나"* |
 * | op | `add` 여럿 | **`replace /root/children` 하나** |
 * | 판정 | 전개된 노드만 담은 **프로브** | **결과 문서 전체** |
 *
 * **프리셋은 페이지 통째라 자리 규칙이 없다.** 그래서 되돌리기의 모양도
 * 다르다 — **undo 하나가 페이지 전체를 되돌린다.**
 *
 * **판정은 결과 문서로 한다.** 패턴이 조각 프로브를 쓴 이유는 *"이미 깨진
 * 문서에서 멀쩡한 패턴이 영영 막힌다"*였는데, **프리셋은 그 이유가 성립하지 않는다** —
 * 적용하면 기존 children이 통째로 사라지므로 깨진 부분이 결과에 남지 않는다. 그 덕에
 * `duplicate-id` 축(조각 프로브가 **원리적으로** 못 보는 것)이 저절로 덮인다 — 따로 검사를
 * 두지 않고, 케이스가 그것을 잰다.
 *
 * ---
 *
 * # `replace`와 `add`가 갈린다
 *
 * op을 `{ op: 'replace', path: '/root/children' }` 하나로 두면 **root에 `children` 키가 없는
 * 문서에서 던진다:**
 *
 * | 문서의 root | `replace /root/children` | `add /root/children` |
 * |---|---|---|
 * | `children` 키가 **있다** | 된다 (역도 된다) | 된다 (역은 `replace 옛값`) |
 * | `children` 키가 **없다** | **`PatchError: 바꿀 키가 없습니다`** — `applyOp`도 `invertOps`도 던진다 | 된다 (역은 `remove`) |
 *
 * `applyOp`의 `replaceAt`이 `Object.hasOwn(record, key)`를 요구하고 `invertOps`의 `replace`
 * 갈래가 `getByPointer(...) === undefined`에서 던지기 때문이다(`packages/schema/src/patch/`).
 * **오늘 만들어지는 페이지의 root에는 `children: []`이 있으므로**(`routes/pages.ts`의 기본
 * 문서) 흔한 경로는 `replace`다. 그러나 `WbNodeSchema`는 `children`을 optional로 두고
 * `PUT .../schema`는 그런 문서를 받으므로, **키가 없는 문서가 저장될 수 있다.**
 *
 * **그래서 문서를 보고 op을 고른다.** 두 갈래 모두 편집 파이프라인의 4·5단계
 * (`invertOps` → `applyOps`)를 지나야 하고, 케이스가 그 왕복을 잰다.
 */
import {
  VIEW_STATES_MAX,
  partitionIssues,
  prepareNodesForPaste,
  validatePage,
  type DroppedCases,
  type PageDocument,
  type PatchOp,
  type ValidationIssue,
  type ViewState,
  type WbNode,
} from '@wirebound/schema'
import { isNodeLike } from './safe-walk'

/**
 * 왜 놓지 못했는가. **`null`이 아니라 이유를 내는 것이 `patternInsert`와 같은 판단이다** —
 * 화면이 *"프리셋이 잘못됐다"*와 *"이 페이지에 놓을 수 없다"*를 갈라 말할 수 있어야 한다.
 *
 * | 값 | 무엇이 잘못됐나 | 되돌리는 것 |
 * |---|---|---|
 * | `'no-root'` | 문서의 root가 노드가 아니다(깨진 문서) | 없음 — 편집 0건 |
 * | `'broken-page'` | **root 자체가** 저장될 수 없는 상태다 — 프리셋과 무관하다 | 없음 — 편집 0건 |
 * | `'invalid'` | 놓고 나면 문서가 저장될 수 없다(`error` 이슈) | 없음 — 편집 0건 |
 *
 * **`'broken-page'`는 결과 문서 판정의 근거가 닿지 않는 경계다.** 결과 문서 전체를 판정하는
 * 근거는 *"교체하면 깨진 부분이 결과에 남지 않는다"*인데, **root는 교체 대상이 아니므로
 * 그 근거가 root에는 미치지 않는다.** 그래서 root가 깨진 문서에서는 멀쩡한 프리셋이
 * 막히고, 갈래를 가르지 않으면 **문장이 프리셋을 탓한다**(`루트는 Page여야 합니다`가
 * *"프리셋을 놓지 못했습니다"* 뒤에 붙는다). **판정 자체는 바꾸지 않는다 — 무엇 때문에
 * 막혔는지를 갈라 말할 뿐이다.**
 *
 * **성공 갈래가 되돌리는 것은 편집 하나다** — undo 하나가 페이지 전체를 되돌린다.
 *
 * **`'empty'`가 없다.** 빈 프리셋은 실패가 아니라 *"치우기"*라는 정상 조작이다.
 */
export type PresetApplyReason = 'no-root' | 'broken-page' | 'invalid'

export interface PresetApply {
  ops: PatchOp[]
  /**
   * 놓은 뒤 고를 노드. **첫 노드다.**
   *
   * 패턴 삽입의 슬롯 규칙(*"첫 슬롯"*)을 옮기지 않는다 — 프리셋은 *"어디를 먼저 고치나"*의
   * 답이 슬롯이 아니다. 위에서부터 읽는
   * 순서의 첫 노드가 사용자가 먼저 보는 것이다.
   *
   * **빈 프리셋이면 `null`이다** — 고를 것이 없다. 부르는 쪽이 선택을 그대로 두면 사라진
   * 노드를 가리키므로, 화면은 이 값이 `null`일 때 선택을 **비운다**(툴바가 그렇게 한다).
   */
  selectId: string | null
}

export interface PresetApplyResult {
  apply: PresetApply | null
  reason: PresetApplyReason | null
  /** `reason === 'invalid'`일 때만 비어 있지 않다. 화면이 그대로 보인다. */
  issues: ValidationIssue[]
  /**
   * 빼고 놓은 상태 가지 — 상태 id 는 **프리셋의 것**이다(통지가 프리셋의 목록으로 이름을 읽는다 — `droppedCasesNotice`). 실패 갈래는
   * 빈 목록이다.
   */
  droppedCases: DroppedCases[]
}

/**
 * 프리셋을 놓는 편집을 만든다. 만들지 못하면 `apply`가 `null`이고 `reason`이 왜인지 말한다.
 *
 * **`marker`를 여기서 버리지 않는다.** 버리는 자리는 **저장**이고(서버의
 * `POST .../presets`), 프리셋에 marker가 없으므로 이 경로가 그것을 다시 생각할 필요가
 * 없다. 케이스가 그 결정을 값으로 고정한다 — 여기서 몰래 버리기 시작하면 저장 쪽 규칙이
 * 느슨해져도 아무도 모른다.
 *
 * **값 공유를 끊는 것도 여기서 하지 않는다.** `remapNodeIds`의 계약이 그것을
 * 보장한다 — 규칙을 여기 한 번 더 두면 그 함수를 쓰는 다른 소비자(설계서 「페이지 JSON」의 가져오기)가
 * 여전히 공유를 물려받는다.
 *
 * `generate`는 케이스가 id를 결정적으로 만들기 위한 이음매다. 운영은 기본값
 * (`createNodeId`)을 쓴다.
 */
export function presetApply(
  document: PageDocument,
  nodes: readonly WbNode[],
  generate?: () => string,
  viewStates?: readonly ViewState[],
): PresetApplyResult {
  const root = document.root
  // **root가 노드가 아니면 놓을 자리가 없다.** `{...null}`이 던지지는 않지만 그렇게 만든
  // 문서는 봉투부터 깨져 있어 `'invalid'`로 뭉뚱그려지고, 그러면 화면이 *"프리셋이
  // 잘못됐다"*고 말하게 된다 — 잘못된 것은 문서다.
  if (!isNodeLike(root)) return { apply: null, reason: 'no-root', issues: [], droppedCases: [] }

  const states = mergeViewStates(document.viewStates, viewStates ?? [])
  const prepared = prepareNodesForPaste(
    states.rename.size === 0 ? nodes : nodes.map((node) => renameCaseStates(node, states.rename)),
    { ...KEEP_EVERY_TARGET, state: (id) => states.ids.has(id) },
    generate,
  )
  const placed = prepared.nodes
  const after: PageDocument = {
    version: document.version,
    ...(states.list === undefined ? {} : { viewStates: states.list }),
    root: { ...root, children: placed },
  }

  // **`error`만 본다.** `warning`은 편집 파이프라인도 막지 않으므로 여기서
  // 막으면 화면만 서버보다 엄격해진다 — 끊긴 상호작용 `target`이 그 자리다.
  const { errors } = partitionIssues(validatePage(after))
  if (errors.length > 0) {
    // **누구 탓인지 가른다.** 같은 문서에서 **children을 비운 판**이 이미
    // `error`를 내면 그것은 root의 문제이지 프리셋의 문제가 아니다 — 프리셋을 무엇으로
    // 바꿔도 그 이슈가 남는다. 이슈가 있을 때만 한 번 더 도므로 평소 비용이 없다.
    const pageOnly: PageDocument = { version: document.version, root: { ...root, children: [] } }
    const pageErrors = partitionIssues(validatePage(pageOnly)).errors
    if (pageErrors.length > 0) return { apply: null, reason: 'broken-page', issues: pageErrors, droppedCases: [] }
    return { apply: null, reason: 'invalid', issues: errors, droppedCases: [] }
  }

  return {
    // 목록을 먼저 잇는다 — 가지가 가리킬 상태가 같은 묶음 안에서 먼저 선다.
    apply: { ops: [...states.ops, childrenOp(root, placed)], selectId: placed[0]?.id ?? null },
    reason: null,
    issues: [],
    droppedCases: prepared.droppedCases,
  }
}

/**
 * **프리셋의 상태 목록을 페이지 목록에 잇는다**(설계 spec 「페이지 JSON · 프리셋 · 붙여넣기」 — 프리셋이 원본의 `viewStates` 를 싣는다).
 * 페이지의 목록은 지우지 않는다 — 프리셋은 뿌리의 `children` 만 갈아 끼우고, 목록에서 상태를 빼면 남의 상태 편집과 겹치고 가지가 남은
 * 상태면 저장이 막는다(`state-cases-left`).
 *
 * | 프리셋의 상태 | 페이지에 | 결과 |
 * |---|---|---|
 * | 같은 id | 있다 | 그 상태 그대로(이름은 페이지의 것) |
 * | 같은 이름 · 다른 id | 있다 | 가지를 페이지의 그 id 로 옮김(`rename`) — 같은 이름을 둘 둘 수 없다 |
 * | 둘 다 | 없다 | 목록 끝에 더함(목록이 없으면 배열째) |
 * | 더하면 `VIEW_STATES_MAX` 를 넘는다 | — | 안 더함 — 그 상태의 가지는 `prepareNodesForPaste` 가 빼고 센다 |
 *
 * 붙이기와 달리 이름으로 맞추는 것은 프리셋은 목록째 오기 때문이다 — 같은 이름을 더할 수 없으니 이름이 곧 같은 상태다. 붙이기는 상태 id
 * 로만 가른다(`shell/editor-keys.tsx` 의 `finishPaste`).
 */
function mergeViewStates(
  current: unknown,
  incoming: readonly ViewState[],
): { list: ViewState[] | undefined; ops: PatchOp[]; ids: Set<string>; rename: Map<string, string> } {
  const existing = Array.isArray(current) ? (current as ViewState[]) : undefined
  const ids = new Set((existing ?? []).map((state) => state.id))
  const byName = statesByName(existing)
  const rename = new Map<string, string>()
  const added: ViewState[] = []
  for (const state of incoming) {
    if (ids.has(state.id)) continue
    const named = byName.get(state.name)
    if (named !== undefined) {
      rename.set(state.id, named)
      continue
    }
    if (ids.size >= VIEW_STATES_MAX) continue
    added.push({ id: state.id, name: state.name })
    ids.add(state.id)
    byName.set(state.name, state.id)
  }
  if (added.length === 0) return { list: existing, ops: [], ids, rename }
  if (existing === undefined) return { list: added, ops: [{ op: 'add', path: '/viewStates', value: added }], ids, rename }
  return { list: [...existing, ...added], ops: added.map((state) => ({ op: 'add', path: '/viewStates/-', value: state })), ids, rename }
}

/**
 * **상태를 이름으로 맞추는 자 — 프리셋과 붙여넣기가 함께 쓴다**(두 벌로 짓지 않는다). 이름은 글자 그대로 견준다 — 상태 상자가 이름을 앞뒤 공백을 뗀 채
 * 받고 같은 이름을 거절하는 것(`shell/view-states-dialog.tsx`)과 같은 규칙이라 대소문자도 다른 이름이다.
 */
function statesByName(list: readonly ViewState[] | undefined): Map<string, string> {
  return new Map((list ?? []).map((state) => [state.name, state.id]))
}

/**
 * **붙이는 페이지에 같은 이름의 상태가 있으면 그 id 로 가지를 옮기는 표**(출처 id → 페이지 id). 같은 id 는 그대로라 표에 안 든다. 이름이 페이지에 없는
 * 상태는 표에 없다 — 그 가지는 `prepareNodesForPaste` 가 빼고 센다. 프리셋의 `mergeViewStates` 가 같은 이름을 같은 규칙으로 맞춘다.
 */
export function renameStatesByName(current: unknown, incoming: readonly ViewState[] | undefined): Map<string, string> {
  const existing = Array.isArray(current) ? (current as ViewState[]) : undefined
  const ids = new Set((existing ?? []).map((state) => state.id))
  const byName = statesByName(existing)
  const rename = new Map<string, string>()
  for (const state of incoming ?? []) {
    const named = ids.has(state.id) ? undefined : byName.get(state.name)
    if (named !== undefined) rename.set(state.id, named)
  }
  return rename
}

/** 상태 가지의 `state` 를 표대로 바꾼 사본(`mergeViewStates` 의 `rename`). 입력을 바꾸지 않는다. */
export function renameCaseStates(node: WbNode, rename: ReadonlyMap<string, string>): WbNode {
  const state = node.type === 'StateCase' ? node.props?.state : undefined
  const next: WbNode =
    typeof state === 'string' && rename.has(state) ? { ...node, props: { ...node.props, state: rename.get(state)! } } : { ...node }
  if (Array.isArray(node.children)) next.children = node.children.map((child) => renameCaseStates(child, rename))
  return next
}

/**
 * 트리 전체에 새 id를 발급한다(설계서 「페이지 프리셋」 — *"프리셋 적용 시 노드 `id`를 새로 발급한다"*) — `presetApply` 가
 * `prepareNodesForPaste` 를 부른다. 한 번에 짓는 까닭 · 임시 뿌리가 `generate` 를 하나 받아 가는 것 · 값 공유를 끊는 계약은 그 함수의
 * 머리말이 갖는다. 프리셋은 페이지 통째라 «밖을 가리키는 대상»을 거르지 않는다(노드 · 페이지 keep 이 늘 참) — 상태 가지만 페이지의 목록으로
 * 거른다(`mergeViewStates`).
 */
const KEEP_EVERY_TARGET = { node: () => true, page: () => true }

/**
 * `children`을 바꾸는 op 하나(**root 자체는 안 바꾼다**).
 *
 * `replace`와 `add`가 갈리는 이유는 파일 머리말의 표에 있다. **`Object.hasOwn`으로 보는
 * 것이 요점이다** — `root.children`이 `undefined`인 것과 키가 없는 것을 값으로는 가를 수
 * 없는데, 패치 엔진은 그 둘을 다르게 다룬다(`getByPointer`가 둘 다 `undefined`를 내지만
 * `replaceAt`은 `hasOwn`을 본다).
 */
function childrenOp(root: WbNode, placed: WbNode[]): PatchOp {
  const op = Object.hasOwn(root, 'children') ? 'replace' : 'add'
  return { op, path: '/root/children', value: placed }
}

/**
 * 실패를 사용자에게 말하는 문장. **순수 함수라 화면 없이 잰다.**
 *
 * **콜론 뒤가 빈 문장을 피한다.** 문장을
 * `${머리말} ${issues.map(...).join(' / ')}`로 만들면, 머리말이 콜론으로 끝나고
 * `issues`가 비면 **콜론 뒤가 빈 채로** 문장이 끝난다. 그 조립이 화면 안에 있으면 그
 * 갈래는 화면을 지나야만 도달해 케이스로 잴 수 없다.
 *
 * **여기서는 이유 목록을 붙이는 것 자체가 조건이다** — 비면 콜론도 없다. 그리고 이
 * 함수가 순수하므로 **빈 목록을 직접 넣어 잴 수 있다**(케이스가 그것을 잰다).
 *
 * `reason`이 `null`인(성공한) 결과를 넣으면 빈 문자열이다 — 부르는 쪽이 실패 갈래에서만
 * 부르므로 오늘 도달하지 않고, 던지지 않는 것이 이 층의 계약이다.
 */
export function presetFailureNotice(result: Omit<PresetApplyResult, 'droppedCases'>): string {
  if (result.reason === null) return ''
  if (result.reason === 'no-root') return BROKEN_DOCUMENT_NOTICE
  const head = result.reason === 'broken-page' ? BROKEN_PAGE_NOTICE : BROKEN_PRESET_NOTICE
  return withReasons(
    head,
    result.issues.map((issue) => issue.message),
  )
}

/**
 * *"문서가 깨졌다"* — 사용자가 할 일이 **프리셋을 고치는 것이 아니다.** 그래서 아래와
 * 갈라 적는다(패턴 삽입이 세운 구분과 같은 축이다).
 */
const BROKEN_DOCUMENT_NOTICE = '이 페이지의 문서를 읽지 못해 프리셋을 놓을 수 없습니다. 새로고침해 서버 상태를 확인하세요.'

/** *"프리셋이 잘못됐다"* — 뒤에 이유가 붙는다. 없으면 안 붙는다(위 머리말). */
const BROKEN_PRESET_NOTICE = '프리셋을 놓지 못했습니다'

/**
 * *"이 페이지가 먼저 잘못됐다"* — 사용자가 할 일이 **프리셋을 바꾸는 것이
 * 아니라 페이지를 고치는 것**이다. 이유는 그대로 싣는다: 무엇을 고쳐야 하는지가 거기 있다.
 */
const BROKEN_PAGE_NOTICE = '이 페이지를 먼저 고쳐야 프리셋을 놓을 수 있습니다'

/**
 * 머리말에 이유를 잇는다. **비면 구분자도 없다** — *"콜론 뒤가 빈 문장"*이
 * 성립하지 않는 형태다.
 */
function withReasons(head: string, reasons: string[]): string {
  return reasons.length === 0 ? `${head}.` : `${head}: ${reasons.join(' / ')}`
}
