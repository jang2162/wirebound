/**
 * **설계서 「상호작용」의 「실행」이 말하는 상호작용 런타임.** 뷰 모드에서 규칙이 *실제로 동작하는* 자리다.
 *
 * ## 왜 `renderer`가 소유하나
 *
 * 「실행」이 이름으로 지목했다 — *"뷰 모드 토글 시 `renderer`의 상호작용 런타임이 활성화되어
 * 실제로 동작한다."* 「HTML 정적 번들」이 그 이유를 적었다: *"`exporter`가 `renderer`를 서버에서 실행해
 * 정적 HTML을 만든다. **렌더러가 하나뿐이라 결과가 어긋날 수 없다.**"*
 *
 * **`apps/web`에 두면 정적 번들이 다른 런타임을 갖는다.** 그러면 웹 앱에서 눌러 본
 * 것과 내보낸 번들에서 눌리는 것이 갈리고, 그 어긋남은 설계서를 받아 보는 쪽에서만 보인다.
 *
 * ## 문서를 바꾸지 않는다 — 이 모듈의 핵심
 *
 * 뷰 모드에서 버튼을 눌러 `setProp`이 돌면 **그것은 시연이지 편집이 아니다.** 문서를
 * 건드리면 revision이 쌓이고 남의 화면이 바뀌고 undo 스택에 섞인다. 그래서 런타임이 드는
 * 것은 **문서 옆의 겹layer 하나**(`InteractionOverlay` — `nodeId → { prop: value }`)이고,
 * 렌더가 그것을 노드의 props **위에** 얹어 그린다. 문서는 한 글자도 안 바뀐다.
 *
 * **그 상태는 모드를 나가거나 페이지를 옮기면 사라진다.** 되돌리기 버튼이 아니라
 * **모드가 리셋이다** — 그 규칙을 지키는 자리는 겹layer를 드는 쪽(`apps/web`의 캔버스)이고,
 * 이 모듈은 **상태를 들지 않는다.** 순수 함수 하나(`runInteraction`)가 *"지금 겹layer가
 * 이것이고 여기를 눌렀으면 다음 겹layer는 이것이다"*를 낼 뿐이다.
 *
 * **상태를 안 드는 것이 「HTML 정적 번들」에도 필요하다** — 정적 번들에는 React가 없을 수 있고, 거기서도
 * 같은 함수로 같은 답이 나와야 한다.
 *
 * ## `navigate`·`openModal`은 실행하지 않고 알린다
 *
 * 둘의 타겟은 `"page:관리자/회원/상세"`이고 **다른 페이지**다. 렌더러는 페이지를 모른다 —
 * 문서 하나만 받는다. **그래서 요청으로 내보낸다**(`InteractionRequest`): 앱이 라우팅하고,
 * 정적 번들은 링크로 바꾼다. **경계를 그 자리에 둔다.**
 *
 * ## 깨진 규칙을 조용히 지나가지 않는다
 *
 * 끊긴 타겟·없는 prop·범위 밖 탭은 **예외가 아니라 예상된 상태다** — severity가 `warning`
 * 이라 문서에 남은 채 저장된다(`error`로 두면 타겟이 된 노드를 지우는 편집이 422가 된다).
 * 조용히 건너뛰면 *"눌렀는데 아무 일도 안 일어난다"*가 되고, 사용자는 그 화면에서 원인을
 * 찾을 길이 없다.
 *
 * **그래서 `InteractionResult.issues`로 낸다.** 판정과 문장은 이 모듈이 짓지 않는다 —
 * `schema`의 `interaction/check.ts`를 부른다. **저장 게이트가 쓰는 것과 같은 함수다**:
 * 저장할 때 통과한 규칙이 눌렀을 때 다른 말을 하는 일이 없다.
 */
import {
  checkNodeAction,
  checkPageAction,
  isPageTargetAction,
  type InteractionAction,
  type InteractionIssueCode,
  type InteractionTrigger,
  type WbNode,
} from '@wirebound/schema'

/**
 * 문서 **위에** 얹히는 런타임 상태. `nodeId → { prop: value }`.
 *
 * **`visible`은 예약된 키다.** `setVisible`이 여기 들어가는데, `visible`이라는 prop은
 * 카탈로그의 **어느 컴포넌트에도 없다**(자격을 선언할 자리가 설계서 「컴포넌트 정의 구조」의
 * 계약에 없다). 그래서 이 키만 props로 내려가지 않고 렌더가 따로 읽는다(`hiddenByOverlay`).
 *
 * **그 이름이 겹칠 수 없는 것은 우연이 아니라 판정이 지킨다:** `setProp { prop: 'visible' }`은
 * `invalid-interaction-prop`으로 걸려 **겹layer에 닿지 못한다**(어느 컴포넌트에도 그 prop이
 * 없으므로). 카탈로그에 `visible` prop이 생기는 날 이 예약은 깨진다 — 그때는 겹layer를
 * 두 표로 갈라야 한다.
 */
export type InteractionOverlay = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/** 겹layer가 비어 있는 상태. **참조를 고정한다** — 리셋마다 새 객체를 만들면 헛 렌더가 난다. */
export const EMPTY_OVERLAY: InteractionOverlay = Object.freeze({})

/** `setVisible`이 겹layer에 쓰는 예약 키. props로 내려가지 않는다(위 머리말). */
export const VISIBLE_KEY = 'visible'

/**
 * **렌더러 밖에서 처리할 요청.** 런타임은 이것을 *실행하지 않고 알린다.*
 *
 * `target`은 문서에 적힌 그대로다 — `page:` 접두를 벗기지 않는다. 벗기는 것은 그것이
 * 페이지 경로라는 **형식을 강제하는 일**이고, 그 형식은 강제하지 않는다.
 * 사람이 읽는 이름은 `describeInteraction`이 만든다.
 */
export interface InteractionRequest {
  type: 'navigate' | 'openModal'
  target: string
  /** 이 요청을 낸 규칙이 걸린 노드. 앱이 *"어느 버튼이 그랬나"*를 말할 수 있어야 한다. */
  sourceNodeId: string
}

/**
 * 실행하지 못한 액션 하나.
 *
 * **`NodeRenderError`와 같은 형식이다** — 앱이 배너로 알리는 자리가 같은 모양이면 화면이
 * 규칙을 하나만 알면 된다. 다만 **호출 시점이 다르고, 그것이 중요하다**(아래 `onEvent`).
 *
 * `path`는 편집 경로와 같다(`/…/interactions/{index}/actions/{actionIndex}`) — 저작 화면이
 * 그 규칙 줄을 찾아갈 수 있게 하려는 것이고, 검증 이슈의 `path`와도 같은 문법이다.
 */
export interface InteractionIssue {
  /** 규칙이 걸린 노드의 id. */
  nodeId: string
  /** 그 노드의 `interactions` 배열에서의 자리. */
  index: number
  /** 그 규칙의 `actions` 배열에서의 자리. */
  actionIndex: number
  code: InteractionIssueCode
  /** 한국어 메시지. **검증기가 내는 문장과 같다** — 같은 함수가 만든다. */
  message: string
}

/** 트리거 하나가 만든 결과 전부. */
export interface InteractionResult {
  /** 다음 겹layer. **아무것도 안 바뀌었으면 받은 것을 그대로 돌려준다**(참조가 같다). */
  overlay: InteractionOverlay
  /** 렌더러 밖에서 처리할 것. */
  requests: InteractionRequest[]
  /** 실행하지 못한 액션. */
  issues: InteractionIssue[]
  /** 이 트리거에 반응한 **규칙**의 수. 0이면 그 노드에 그 트리거의 규칙이 없었다. */
  matched: number
  /** 겹layer를 실제로 바꾼 **액션**의 수. `matched`가 0이 아닌데 이것이 0일 수 있다. */
  applied: number
}

/**
 * 노드 하나에서 트리거가 일어났을 때 무슨 일이 일어나는가.
 *
 * **순수 함수다.** 받은 겹layer를 고치지 않고 새 것을 낸다 — 같은 인자로 부르면 같은 답이
 * 나오고, 그래서 React의 렌더 밖(이벤트 핸들러)에서든 정적 번들에서든 같이 쓸 수 있다.
 *
 * ## 순서
 *
 * **배열 순서다.** 같은 `on`이 여럿이면 앞의 규칙부터, 규칙 안에서는 앞의 액션부터 돈다.
 * 같은 (노드, prop)을 두 액션이 건드리면 **뒤가 이긴다.** 근거는 셋이다:
 *
 * 1. 설계서 「상호작용」의 「모델」이 `actions`를 **배열**로 정했다. 배열의 뜻은 순서이고,
 *    그것 말고 우선순위를 정할 필드가 모델에 없다.
 * 2. **검증이 같은 `on`을 여럿 두는 것을 막지 않는다**(「모델」이 금지하지 않는다). 막지
 *    않는 이상 순서가 정해져 있어야 한다.
 * 3. 문장화가 규칙을 **배열 순서대로** 낸다(`listInteractionSentences`). 화면이 읽는
 *    순서와 도는 순서가 갈리면 설계서가 거짓말을 한다.
 *
 * ## 실패한 액션은 **그 액션만** 건너뛴다
 *
 * 액션 셋 중 하나가 깨져 있으면 나머지 둘은 그대로 돈다. 전부 멈추는 쪽도 답일 수 있는데
 * 고르지 않는다 — **되돌릴 것이 생기기 때문이다**(물음: *"이 갈래는 무엇을
 * 되돌리는가"*). 앞의 액션이 이미 겹layer를 바꾼 뒤에 셋째가 깨진 것을 알게 되므로, 멈추려면
 * 앞의 둘을 **되돌려야** 한다. 그런데 되돌린 결과는 *"눌렀는데 아무 일도 안 일어난다"*와
 * 화면에서 구분되지 않는다 — 위 머리말 「깨진 규칙을 조용히 지나가지 않는다」의 그 부류다.
 *
 * **그래서 일어난 것은 일어난 대로 두고, 일어나지 않은 것을 `issues`로 말한다.** 사용자가
 * 보는 화면이 *"둘은 됐고 하나는 안 됐다"*라는 사실과 어긋나지 않는 유일한 조합이다.
 */
export function runInteraction(
  root: WbNode | null | undefined,
  nodeId: string,
  trigger: InteractionTrigger,
  overlay: InteractionOverlay = EMPTY_OVERLAY,
): InteractionResult {
  const empty: InteractionResult = { overlay, requests: [], issues: [], matched: 0, applied: 0 }
  if (root === null || root === undefined) return empty

  const nodes = nodeIndex(root)
  const source = nodes.get(nodeId)
  if (source === undefined) return empty

  const interactions = Array.isArray(source.interactions) ? source.interactions : []
  const requests: InteractionRequest[] = []
  const issues: InteractionIssue[] = []
  // **겹layer는 마지막에 한 번만 갈아 끼운다** — 액션마다 새 객체를 만들면 아무것도
  // 바뀌지 않은 트리거에서도 참조가 달라져 화면이 헛일을 한다.
  let next: Record<string, Record<string, unknown>> | null = null
  let matched = 0
  let applied = 0

  const write = (target: string, prop: string, value: unknown): void => {
    next ??= { ...(overlay as Record<string, Record<string, unknown>>) }
    next[target] = { ...next[target], [prop]: value }
    applied += 1
  }

  for (const [index, interaction] of interactions.entries()) {
    if (interaction?.on !== trigger) continue
    matched += 1

    const actions: InteractionAction[] = Array.isArray(interaction.actions) ? interaction.actions : []
    for (const [actionIndex, action] of actions.entries()) {
      const report = (message: string, code: InteractionIssueCode): void => {
        issues.push({ nodeId, index, actionIndex, code, message })
      }

      if (isPageTargetAction(action)) {
        // **실행하지 않고 알린다.** 비어 있는 타겟만 여기서 갈라 말한다 — 그것은
        // *"아직 안 골랐다"*이지 이동이 아니다.
        const problem = checkPageAction(action)
        if (problem !== null) {
          report(problem.message, problem.code)
          continue
        }
        requests.push({ type: action.type, target: action.target, sourceNodeId: nodeId })
        continue
      }

      // **저장 게이트와 같은 함수다**(머리말 「깨진 규칙을 조용히 지나가지 않는다」). 여기서 다시 판정하지 않는다.
      const problem = checkNodeAction(nodes, action)
      if (problem !== null) {
        report(problem.message, problem.code)
        continue
      }

      switch (action.type) {
        case 'setProp':
          write(action.target, action.prop, action.value)
          break
        case 'setVisible':
          // 예약 키다(위 `InteractionOverlay`의 머리말). props로 내려가지 않는다.
          write(action.target, VISIBLE_KEY, action.value)
          break
        case 'switchTab':
          // `Tabs`의 활성 탭은 `props.active`이고 뷰가 그것을 읽는다. 겹layer가 그 자리를 덮으면
          // **뷰를 한 글자도 안 고치고** 탭이 바뀐다.
          write(action.target, 'active', action.tab)
          break
      }
    }
  }

  return { overlay: next ?? overlay, requests, issues, matched, applied }
}

/**
 * 이 노드에 얹을 props. 겹layer에 없으면 **받은 것을 그대로 돌려준다**(참조가 같다).
 *
 * **`visible`은 걷어 낸다** — props가 아니기 때문이다. 걷지 않으면 `z.strictObject`인
 * 카탈로그 스키마가 *"인식할 수 없는 키"*로 노드를 통째로 폴백으로 만든다(실측으로 정한
 * 것이 아니라 `strictObject`의 정의다 — 케이스가 그 값을 고정한다).
 */
export function overlayProps(
  overlay: InteractionOverlay | undefined,
  nodeId: string,
  props: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const override = overlay?.[nodeId]
  if (override === undefined) return props

  const merged: Record<string, unknown> = { ...props }
  for (const [key, value] of Object.entries(override)) {
    if (key === VISIBLE_KEY) continue
    merged[key] = value
  }
  return merged
}

/** 겹layer가 이 노드를 숨겼는가. `setVisible { value: false }`가 그 자리다. */
export function hiddenByOverlay(overlay: InteractionOverlay | undefined, nodeId: string): boolean {
  return overlay?.[nodeId]?.[VISIBLE_KEY] === false
}

/**
 * id → 노드.
 *
 * **`schema`의 `walkNodes`를 쓰지 않는다.** 그쪽은 `children` 배열의 원소를 그대로 내고
 * **그 직후 그 원소의 `children`을 읽어** 원소가 `null`이면 던진다(`apps/web/src/edit/
 * safe-walk.ts`의 실측). 이 렌더러가 받는 문서는 서버 검증 **전에** 낙관적 패치가 지나간
 * 것이라(설계서 「정방향 흐름」) 그 상태가 일시적으로 정상이고, `renderNode`의 모양 가드가 같은 이유로 있다.
 * **여기서 던지면 클릭 핸들러가 던지는 것이고**, 그것은 폴백으로 흡수되지 않는다.
 *
 * **같은 판정이 저장소에 세 벌 있다**(`schema`의 `walkNodes` · `apps/web`의
 * `walkSafely` · 여기). 묶으려면 `schema`가 견디는 순회를 함께 갖는 것이 맞는데, 그것은
 * 세 소비자의 계약을 바꾸는 일이라 따로 한다 — 그때까지 셋 중 하나의 판정을 바꾸면
 * 나머지 둘도 함께 봐야 한다.
 */
function nodeIndex(root: WbNode): Map<string, WbNode> {
  const nodes = new Map<string, WbNode>()
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const shaped = node as WbNode
    if (typeof shaped.id === 'string') nodes.set(shaped.id, shaped)
    const children = shaped.children
    if (!Array.isArray(children)) return
    for (const child of children) visit(child)
  }
  visit(root)
  return nodes
}
