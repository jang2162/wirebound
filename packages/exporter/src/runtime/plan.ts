/**
 * **판정과 실행을 내보내기 시점으로 옮긴다.** 브라우저로 나가는 것은 *결과*다.
 *
 * ---
 *
 * ## 판정도 실행도 내보내기가 한다
 *
 * **런타임은 판정하지 않는다 — 내보내기가 판정하고 결과를 심는다.** 실행도 `runInteraction`이
 * 하되, **그 함수가 도는 시점이 브라우저가 아니라 내보내기다.** 근거 셋:
 *
 * **① `runInteraction`의 답은 지금 겹layer와 무관하다.** 그 함수가 겹layer를 *읽는* 자리는
 * 하나도 없다 — 받은 것을 얕게 복사해 **쓰기만** 한다(`write`). 판정도 `nodes`(문서)만 본다.
 * 그래서 *"빈 겹layer에서 한 번 돌려 얻은 쓰기 목록"*을 **지금 겹layer에 얹는 것**과
 * *"지금 겹layer를 넣고 그 함수를 부르는 것"*의 답이 같다. 이것은 추론이 아니라 케이스가
 * 무작위 겹layer로 잰다(`test/runtime-plan.test.tsx`).
 *
 * **② 그 함수를 브라우저로 가져가면 zod가 따라온다.** 판정(`checkNodeAction`)이 카탈로그의
 * zod 스키마로 값을 보기 때문이다 — `runInteraction` **하나만** 번들해도 자산이 수백 KB가
 * 된다(다시 재는 법: `runInteraction` 하나를 브라우저용으로 번들해 크기를 본다). 런타임에
 * 카탈로그를 싣지 않는 이유가 그대로 이쪽에도 걸린다.
 *
 * **③ 그리고 그것만으로는 *동작*하지 않는다.** 겹layer를 얻어도 정적 번들에는 그것을 다시
 * 그릴 React도 구조 구현체도 없다. 그리려면 렌더러를 통째로 실어야 하고, 그러면 ②가 몇
 * 배로 커진다. **대신 여기서 같은 렌더러로 미리 그려 둔다** — 설계서 「HTML 정적 번들」의 *"렌더러가 하나뿐이라
 * 결과가 어긋날 수 없다"*가 그대로 산다.
 *
 * **잃은 것을 적어 둔다.** *"브라우저에서 도는 코드가 웹 앱과 같은 함수"*는 참이 아니다.
 * 대신 **같은 함수가 만든 답**이 실린다. 그 둘이 어긋나지 않는 것을 지키는 자리는 위 ①의
 * 케이스이고, 그 케이스가 죽으면 이 판정이 무너진다.
 *
 * ## 상태를 미리 그리는 것이 왜 유한한가
 *
 * 액션이 넣는 값은 **문서에 적혀 있다**(설계서 「상호작용」 「모델」이 스크립트도 표현식도
 * 허용하지 않는다). 그래서 한
 * 노드가 가질 수 있는 겹layer 기록은 *"규칙마다 정해진 조각을 아무 순서로 겹친 것"*의
 * 닫힘이고, 값의 가짓수가 유한하므로 그 닫힘도 유한하다. 아래 `reachableRecords`가 그것을
 * 실제로 닫아 세고, **상한을 넘으면 그 사실을 화면이 말한다**(조용히 자르지 않는다).
 */
import {
  EMPTY_OVERLAY,
  NO_THEME,
  overlayProps,
  renderNode,
  runInteraction,
  VISIBLE_KEY,
  type InteractionOverlay,
  type NodeRenderError,
} from '@wirebound/renderer'
import type { InteractionTrigger, PageDocument, WbNode } from '@wirebound/schema'
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import { renderToStaticMarkup } from 'react-dom/server'
import { eachNode } from '../nodes'
import { installRegistries } from '../page'
import {
  installRuntime,
  type RuntimeEvent,
  type RuntimePlan,
  type RuntimeRecord,
  type RuntimeRequest,
} from './browser'

export type { RuntimeEvent, RuntimePlan } from './browser'

/**
 * `assets/runtime.js`의 내용. **함수 하나를 글자로 낸 것이다**(근거는 `browser.ts`의
 * 머리말).
 */
export const RUNTIME_JS = `;(${installRuntime.toString()})();\n`

/** 번들 안에서 런타임이 사는 자리. */
export const RUNTIME_JS_PATH = 'assets/runtime.js'

/** 데이터를 실은 `<script>`의 id. **`browser.ts`가 이 이름으로 찾는다.** */
export const RUNTIME_DATA_ID = 'wb-export-runtime-data'

/**
 * DOM 이벤트 하나가 도맡는 트리거.
 *
 * **`renderer`의 `DOM_EVENT`를 뒤집은 것과 같아야 한다** — 그쪽은 수출하지 않으므로 글자를
 * 옮겼고, **같은지는 케이스가 실제 렌더러를 눌러 잰다**(`test/runtime-plan.test.tsx`).
 * 옮긴 값이지 지어낸 값이 아니다.
 */
const DOM_TRIGGERS: Record<string, InteractionTrigger[]> = {
  click: ['click', 'select'],
  change: ['change'],
  submit: ['submit'],
}

/**
 * 페이지 하나가 미리 그려 둘 수 있는 판의 수.
 *
 * **상한이 필요한 이유는 곱이기 때문이다** — 한 노드를 여러 규칙이 서로 다른 prop으로
 * 겨누면 겹치는 조합이 곱으로 는다. 넘으면 **자르지 않고 그 페이지의 런타임을 통째로
 * 끈다**: 절반만 도는 상호작용은 *"눌렀는데 어떤 것은 되고 어떤 것은 안 된다"*가 되어
 * 읽는 사람이 문서 탓인지 도구 탓인지 알 수 없다. 끄면 번들은 **스크립트 없는 판**으로
 * 남고 그 사실을 화면이 말한다.
 */
const MAX_VARIANTS = 512

export interface RuntimePlanInput {
  page: PageDocument
  /** 그릴 테마. 없으면 SDK 기본 뷰다(`NO_THEME`) — 본 판(`renderPageTree`)과 같은 값을 받아야 판이 같다. */
  theme?: ThemeDefinition
  /**
   * `navigate`·`openModal`의 타겟 → 그 페이지의 번들 안 경로.
   *
   * **번들이 스스로 알 수 없다.** 타겟은 `"page:관리자/회원/상세"`처럼 **페이지 경로**이고
   * (검증기가 그 형식을 강제하지 않는다) 번들 입력이 드는 것은 제목뿐이다.
   * 그래서 호출자가 짝을 준다 — `exportBundle`은 `BundlePage.target`에서 만든다.
   *
   * **값이 `null`인 항목은 *"그 타겟을 가진 페이지가 둘 이상"*이다.** 없는 것과 갈라 두는
   * 이유는 읽는 사람이 할 일이 다르기 때문이다 — 없으면 그 페이지를 함께 내보내야 하고,
   * 둘 이상이면 **타겟을 짓는 쪽이 겹치게 만든 것**이다.
   */
  hrefs: ReadonlyMap<string, string | null>
  /**
   * 본 판을 그릴 때 이미 난 오류. **미리 그린 판의 것과 견주려고 받는다** — 같은 노드를
   * 두 번 세면 화면이 문제가 둘인 줄 안다.
   */
  baseErrors: readonly NodeRenderError[]
}

export interface RuntimePlanResult {
  plan: RuntimePlan
  /**
   * 미리 그리는 동안에만 난 렌더 오류. **본 판에서 이미 난 것은 빼고 낸다** — 같은 노드가
   * 두 번 세어지면 화면이 문제가 둘인 줄 안다.
   */
  errors: NodeRenderError[]
}

/**
 * 상태 열쇠. **`browser.ts`의 같은 이름 함수와 글자까지 같아야 한다.**
 *
 * `visible`은 넣지 않는다 — 그것은 *"그릴 판"*이 아니라 *"DOM에서 뺄지"*를 정하는 값이다.
 * 여기 오는 기록은 `drawable`이 이미 걸렀지만 **브라우저 쪽은 안 걸린 기록을 받는다** —
 * 그래서 두 함수가 같은 계약을 져야 하고, 그 계약을 `test/runtime-plan.test.tsx`가 든다.
 *
 * **패키지 밖으로 나가지 않는다** — `src/index.ts`가 수출하지 않는다.
 */
export function stateKey(record: RuntimeRecord): string {
  const keys = Object.keys(record).filter((key) => key !== VISIBLE_KEY)
  keys.sort()
  return keys.length === 0 ? '' : JSON.stringify(keys.map((key) => [key, record[key]]))
}

/**
 * 페이지 액션 하나를 링크로 푼다. **문장도 여기서 짓는다.**
 *
 * 갈래가 셋이고 **셋이 서로 다른 일을 뜻한다:**
 *
 * | 갈래 | 무엇을 하나 |
 * |---|---|
 * | 그 타겟을 가진 페이지가 **하나** | 링크가 된다 |
 * | **없다** | 그 페이지를 함께 내보내야 한다 |
 * | **둘 이상** | 타겟을 짓는 쪽이 겹치게 만들었다 |
 *
 * **셋째를 첫째로 접으면 조용히 엉뚱한 페이지로 간다** — 먼저 온 것만 담으면
 * (`!targets.has(...)`) 그렇게 된다. `BundlePage.target`이 거부한 *"제목으로 짐작하기"*보다
 * 나쁘다 —
 * 그쪽은 조용히 아무 데도 안 가는 것이고 이쪽은 **조용히 남의 페이지로 간다.**
 */
function resolveRequest(
  hrefs: ReadonlyMap<string, string | null>,
  type: string,
  target: string,
): RuntimeRequest {
  const found = hrefs.get(target)
  if (typeof found === 'string') return { type, target, href: found, problem: null }
  return {
    type,
    target,
    href: null,
    problem: hrefs.has(target)
      ? `이 타겟을 가리키는 페이지가 번들에 둘 이상입니다: ${target}`
      : `이 번들에 없는 페이지입니다: ${target}`,
  }
}

/** 겹layer 기록에서 `visible`을 뺀 것. 빈 것이면 그릴 판이 없다. */
function drawable(record: RuntimeRecord): RuntimeRecord {
  const out: RuntimeRecord = {}
  for (const [key, value] of Object.entries(record)) {
    if (key !== VISIBLE_KEY) out[key] = value
  }
  return out
}

/**
 * 조각들을 아무 순서로 겹쳐 닿을 수 있는 기록 전부. **빈 기록은 넣지 않는다** — 그것은
 * 원본 HTML이라 이미 페이지에 있다.
 *
 * 상한을 넘으면 `null`이다.
 */
function reachableRecords(effects: readonly RuntimeRecord[], budget: number): RuntimeRecord[] | null {
  const seen = new Map<string, RuntimeRecord>([['', {}]])
  let frontier: RuntimeRecord[] = [{}]
  while (frontier.length > 0) {
    const next: RuntimeRecord[] = []
    for (const state of frontier) {
      for (const effect of effects) {
        const merged = { ...state, ...effect }
        const key = stateKey(merged)
        if (seen.has(key)) continue
        if (seen.size > budget) return null
        seen.set(key, merged)
        next.push(merged)
      }
    }
    frontier = next
  }
  seen.delete('')
  return [...seen.values()]
}

/**
 * 페이지 하나의 계획을 만든다.
 *
 * **여기서 `runInteraction`이 돈다.** 카탈로그가 설치된 Node에서, 저장 게이트가 쓰는 것과
 * 같은 판정으로. 브라우저로 나가는 것은 그 답이다(머리말).
 */
export function buildRuntimePlan(input: RuntimePlanInput): RuntimePlanResult {
  installRegistries()
  const root = input.page.root as WbNode
  const theme = input.theme ?? NO_THEME

  const nodes = new Map<string, WbNode>()
  for (const node of eachNode(root)) {
    if (typeof node.id === 'string' && !nodes.has(node.id)) nodes.set(node.id, node)
  }

  const events: RuntimeEvent[] = []
  /** nodeId → 그 노드에 얹힐 수 있는 조각들. 판을 미리 그릴 재료다. */
  const effects = new Map<string, RuntimeRecord[]>()

  for (const [nodeId, node] of nodes) {
    const interactions = Array.isArray(node.interactions) ? node.interactions : []
    if (interactions.length === 0) continue

    for (const [dom, triggers] of Object.entries(DOM_TRIGGERS)) {
      const rules: number[] = []
      const requests: RuntimeRequest[] = []
      const issues: RuntimeEvent['issues'] = []
      // **트리거를 이어 돌린다** — 앞 트리거가 만든 겹layer 위에서 뒤가 돌아야 순서가 한
      // 벌로 남는다(`renderer`의 `fire`가 같은 것을 한다).
      let overlay: InteractionOverlay = EMPTY_OVERLAY

      for (const trigger of triggers) {
        const result = runInteraction(root, nodeId, trigger, overlay)
        if (result.matched === 0) continue
        overlay = result.overlay
        for (const [index, interaction] of interactions.entries()) {
          if (interaction?.on === trigger) rules.push(index)
        }
        for (const request of result.requests) {
          requests.push(resolveRequest(input.hrefs, request.type, request.target))
        }
        for (const issue of result.issues) {
          issues.push({ index: issue.index, actionIndex: issue.actionIndex, message: issue.message })
        }
      }

      if (rules.length === 0) continue

      const writes: RuntimeEvent['writes'] = []
      for (const [target, record] of Object.entries(overlay)) {
        const list = effects.get(target)
        const piece = drawable(record)
        if (Object.keys(piece).length > 0) {
          if (list === undefined) effects.set(target, [piece])
          else list.push(piece)
        }
        for (const [prop, value] of Object.entries(record)) writes.push({ target, prop, value })
      }

      events.push({ nodeId, dom, writes, requests, issues, rules })
    }
  }

  const seenErrors = new Set(input.baseErrors.map((error) => `${error.nodeId} ${error.message}`))
  const errors: NodeRenderError[] = []
  const variants: Record<string, Record<string, string>> = {}
  let budget = MAX_VARIANTS

  for (const [nodeId, pieces] of effects) {
    const node = nodes.get(nodeId)
    if (node === undefined) continue
    const records = reachableRecords(pieces, budget)
    if (records === null) {
      return {
        plan: {
          events: [],
          variants: {},
          disabled: '상호작용 상태가 너무 많아 이 번들에서는 실행되지 않습니다',
        },
        errors: [],
      }
    }
    budget -= records.length

    const table: Record<string, string> = {}
    for (const record of records) {
      table[stateKey(record)] = renderVariant(node, record, theme, seenErrors, errors)
    }
    variants[nodeId] = table
  }

  return { plan: { events, variants, disabled: null }, errors }
}

/**
 * 노드 하나를 겹layer가 얹힌 상태로 그린다. **문서 전체를 그릴 때와 같은 길이다** —
 * `overlayProps`가 props를 덮고, 그 뒤는 `renderNode`가 평소대로 한다.
 *
 * **오류를 세어 낸다.** 판정이 이미 값의 계약을 봤으므로 여기서 새 오류가 나면 안 되는데,
 * *"나면 안 된다"*를 조용히 믿으면 난 오류가 아무 데도 남지 않는다. 본 판에 없던 것만
 * 골라 낸다.
 */
function renderVariant(
  node: WbNode,
  record: RuntimeRecord,
  theme: ThemeDefinition,
  seenErrors: Set<string>,
  errors: NodeRenderError[],
): string {
  const overlay: InteractionOverlay = { [node.id]: record }
  const overlaid = { ...node, props: overlayProps(overlay, node.id, node.props) }
  const seen: NodeRenderError[] = []
  const tree = renderNode(overlaid as WbNode, {
    theme,
    onNodeError: (error) => seen.push(error),
  })
  const html = renderToStaticMarkup(tree)
  for (const error of seen) {
    const key = `${error.nodeId} ${error.message}`
    if (seenErrors.has(key)) continue
    seenErrors.add(key)
    errors.push(error)
  }
  return html
}
