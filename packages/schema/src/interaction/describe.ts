/**
 * 상호작용 규칙을 **사람이 읽는 한 문장**으로 옮긴다 (설계 §8.2).
 *
 * ```
 * "① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다"
 * ```
 *
 * ## 왜 `schema`에 있는가 (계획 D3)
 *
 * §8.2: *"우측 패널, HTML 번들, PPTX 모두 이 문장을 싣는다."* 셋이 보려면 셋 다 의존하는
 * 곳에 있어야 한다 — `apps/web`에 두면 `exporter`(P8)가 못 쓰고, `renderer`에 두면 §8.3의
 * 상호작용 런타임과 한 덩어리가 되는데 **문장은 런타임이 아니다**(편집 모드에서도 보인다).
 * 그리고 **컴포넌트 이름·prop 라벨을 문장으로 옮길 재료가 카탈로그에 있고 그것을 `schema`가
 * 소유한다.**
 *
 * **zod 외의 런타임 의존을 갖지 않는다**(CLAUDE.md). 이 파일은 문자열 조립과 한글 코드
 * 계산뿐이라 그 제약 안에 있다.
 *
 * ## 무엇을 부르는 이름이 어디서 오는가 (재라 #3)
 *
 * 문장의 주어·목적어는 노드다. 노드를 부르는 이름은 **번호 + 라벨 + 컴포넌트 이름**으로
 * 만든다:
 *
 * | 조각 | 어디서 | 없으면 |
 * |---|---|---|
 * | `①` | 노드의 `marker` | **비운다** — 번호 없음은 정상 상태다(§4.3: *"없으면 코멘트 없음"*) |
 * | `검색` | 라벨성 prop (`COMPONENT_NOUNS`의 `labelProp`) | 비운다 |
 * | `버튼` | **카탈로그의 `def.label`** | **영문 타입 이름**을 쓴다 |
 *
 * ## 한국어 이름이 `ComponentDef`로 옮겨 갔다 (P10-3)
 *
 * **앞 판은 이 파일이 이름 표를 소유했고 근거는 *"§5.1의 계약은 테마 어휘를 정하는 자리이니
 * 문장의 낱말이 낄 곳이 아니다"*였다.** 그 전제는 **계약이 한 축뿐이라는 것**인데, 이름을
 * 필요로 하는 화면이 문장 하나가 아니게 되면서 거짓이 됐다 — 타입 고르개가 영문 18개를
 * `<select>` 하나에 내고 있었고, 그 화면도 같은 이름을 필요로 한다.
 *
 * **두 벌로 두지 않는 것이 요점이다.** 이 파일에 표를 남기고 고르개가 자기 표를 또 두면
 * `사라진 노드`가 네 곳에 있던 것과 같은 부류가 하나 는다. 그래서 `ComponentDef`에
 * **사람이 읽을 축**을 새로 세우고(테마 어휘와 갈라 적었다 — `define.ts`의 두 축 표),
 * 이 표의 이름은 **거기서 유도한다.**
 *
 * **`labelProp`은 옮기지 않았다.** 그것은 *"어느 prop이 노드마다 다른 이름을 담는가"*라는
 * **다른 축**이고, 문장에만 쓰인다(고르개는 노드가 없는 화면이다).
 *
 * **정적 객체인 것은 유지된다.** 카탈로그 배열을 모듈 로드 시점에 훑을 뿐이라
 * `installCatalog()`와 무관하다 — `packages/exporter`가 그것에 기댄다
 * (`test/pptx-catalog.test.ts`). 대조는 여전히 케이스가 센다
 * (`test/interaction-describe.test.ts`).
 *
 * ## `null`·모름을 접지 않는다 (P5-1 이월 §1)
 *
 * *"문서를 못 읽었다"*와 *"그 노드가 없다"*를 같은 값으로 접는 것이 이 저장소가 네 번 만난
 * 부류다. **여기서는 그 상태가 성립할 수 없다** — 문장화는 문서를 **인자로** 받으므로
 * 문서 없이는 부를 수 없고, 문서가 없을 때 부르는 쪽은 문장을 만들지 않는다.
 * 문서에 없는 타겟은 `사라진 노드`라고 **말한다**(코멘트 탭이 쓰는 말과 같다).
 * 비어 있는 페이지 경로도 `아직 정해지지 않은 페이지`라고 말한다 — 빈 문자열을 그대로
 * 흘리면 *"…로 이동합니다"*가 되어 **대상이 있는 것처럼 읽힌다.**
 */
import { CATALOG_DEFS } from '../component/catalog/index'
import { getComponent } from '../component/registry'
import type { AnyDocument, Interaction, InteractionAction, InteractionTrigger, WbNode } from '../node'
import { pageTargetPath } from '../page-target'
import { walkNodes } from '../tree'

/** 컴포넌트를 문장에서 부르는 이름과, 그 앞에 붙일 라벨을 담은 prop. */
export interface ComponentNoun {
  /** 문장에 쓰는 한국어 이름. `List` → `목록`. */
  name: string
  /**
   * 노드마다 다른 이름을 담는 prop. 값이 비어 있지 않은 문자열이면 `{값} {name}`이 된다.
   * 없는 컴포넌트가 대부분이다 — 그런 노드는 이름만으로 불린다.
   */
  labelProp?: string
}

/**
 * 노드마다 다른 이름을 담는 prop. **이름과 갈라 여기 남는 유일한 표다.**
 *
 * 카탈로그 타입 전부를 적지 않는다 — 그런 prop이 없는 컴포넌트가 절반이고, 없는 것이
 * 정상이다(그 노드는 이름만으로 불린다). **키가 카탈로그 안인지는 케이스가 센다.**
 */
const LABEL_PROPS: Record<string, string> = {
  Card: 'title',
  EntryForm: 'title',
  Field: 'label',
  Button: 'label',
  Link: 'label',
  Text: 'content',
  Media: 'caption',
  Placeholder: 'label',
}

/**
 * 카탈로그 19종의 한국어 이름.
 *
 * **이름은 카탈로그가 소유한다**(`def.label`). 이 객체는 그것에 `labelProp`을 얹어 문장이
 * 쓰기 좋은 모양으로 만든 것뿐이고, 표를 두 벌 두지 않는 것이 요점이다 — 근거는 파일
 * 머리말에 있다. **이름을 고치려면 카탈로그를 고쳐라**(`component/catalog/*.ts`).
 * 이름의 근거(§9·§8.2에서 빌려 온 셋 · `Placeholder`가 `영역`이 아닌 이유)도 그리로 갔다.
 *
 * **`CATALOG_DEFS`를 훑는다 — 레지스트리가 아니다.** 레지스트리는 `installCatalog()`가
 * 채우므로 모듈 로드 시점에 비어 있을 수 있고, 그러면 이 표가 조용히 비어 문장이 전부
 * 영문 타입명으로 떨어진다. 정적 배열이면 그 상태가 성립하지 않는다.
 */
export const COMPONENT_NOUNS: Record<string, ComponentNoun> = Object.fromEntries(
  CATALOG_DEFS.map((def) => {
    const labelProp = LABEL_PROPS[def.type]
    const noun: ComponentNoun = labelProp === undefined ? { name: def.label } : { name: def.label, labelProp }
    return [def.type, noun]
  }),
)

/** 트리거를 부르는 말. §8.2의 *"클릭 시"*·*"선택 시"*가 이 표의 표본이다. */
const TRIGGER_VERBS: Record<InteractionTrigger, string> = {
  click: '클릭',
  change: '변경',
  select: '선택',
  submit: '제출',
}

/**
 * 문서에 없는 타겟. **코멘트 탭의 `MISSING_NODE`와 같은 말이다** — 같은 상태다.
 *
 * **P9-3이 이름으로 내보냈다**(`MISSING_NODE_NAME`). `page-view.ts`가 *"그 노드가 문서에
 * 없는 코멘트"*를 같은 말로 불러야 하는데, 거기서 리터럴을 다시 적으면 이 말을 아는 자리가
 * 넷이 된다. 남은 사본 둘(`packages/exporter`의 `MISSING_NODE_LABEL` ·
 * `apps/web`의 `MISSING_NODE`)은 이 슬라이스 밖이다 — 이월에 적었다.
 */
const MISSING_NODE = '사라진 노드'
export { MISSING_NODE as MISSING_NODE_NAME }
/**
 * **아직 타겟을 안 고른 액션.** *"사라진 노드"*와 갈라 말한다 — 저작 중에 액션을 막
 * 더한 상태이지 무엇이 없어진 것이 아니다. **이것이 P5-1 이월 §1의 부류를 이 자리에서
 * 닫는 방식이다**(`null`·미확정을 *"없다"*와 같은 말로 접지 않는다).
 */
const UNSET_NODE = '아직 고르지 않은 대상'
/** 아직 대상을 안 고른 `navigate`·`openModal`. */
const UNSET_PAGE = '아직 정해지지 않은 페이지'
/**
 * **아직 `prop`을 안 고른 `setProp`.** 앞 판은 라벨이 빈 문자열이라 문장이 통째로 깨졌다
 * (`목록이 로 바뀝니다`) — 미확정을 **아무 말도 하지 않는 것으로 접은** 형태다.
 */
const UNSET_PROP = '아직 고르지 않은 속성'
/** 뜻이 없는 탭 번호(음수·비정수). **번호로 읽어 주지 않는다** — `-2번째 탭`은 뜻이 없다. */
const BAD_TAB = '올바르지 않은 탭 번호'
/** 라벨을 문장에 실을 때의 상한. 넘으면 잘리고 `…`가 붙는다. */
const LABEL_MAX = 20

/** 문서 하나에서 뽑은 문장 한 줄. */
export interface InteractionSentence {
  /** 상호작용이 걸린 노드(트리거 쪽). */
  nodeId: string
  /** 그 노드의 `interactions` 배열에서의 자리. 편집 경로(`/…/interactions/{index}`)와 같다. */
  index: number
  on: InteractionTrigger
  text: string
}

/**
 * 상호작용 하나를 문장으로 만든다.
 *
 * `source`는 그 상호작용이 걸린 노드다. `document`는 **타겟을 찾기 위해** 받는다 —
 * 타겟의 타입을 알아야 이름과 prop 라벨이 나온다.
 */
export function describeInteraction(
  document: AnyDocument,
  source: WbNode,
  interaction: Interaction,
): string {
  const nodes = nodeIndex(document)
  return sentenceOf(nodes, source, interaction)
}

/**
 * 문서 전체의 상호작용을 노드 순서대로 낸다. **우측 패널과 내보내기가 이것을 쓴다** —
 * 둘이 각자 순회하면 순서가 갈릴 수 있다.
 */
export function listInteractionSentences(document: AnyDocument): InteractionSentence[] {
  const nodes = nodeIndex(document)
  const out: InteractionSentence[] = []

  for (const { node } of walkNodes(document.root)) {
    const interactions = node.interactions
    if (!Array.isArray(interactions)) continue
    for (const [index, interaction] of interactions.entries()) {
      out.push({ nodeId: node.id, index, on: interaction.on, text: sentenceOf(nodes, node, interaction) })
    }
  }
  return out
}

/** id → 노드. 문장 하나마다 문서를 다시 훑지 않게 한 번 만들어 돌려 쓴다. */
function nodeIndex(document: AnyDocument): Map<string, WbNode> {
  const nodes = new Map<string, WbNode>()
  for (const { node } of walkNodes(document.root)) nodes.set(node.id, node)
  return nodes
}

function sentenceOf(
  nodes: ReadonlyMap<string, WbNode>,
  source: WbNode,
  interaction: Interaction,
): string {
  const trigger = `${nodeName(source)} ${TRIGGER_VERBS[interaction.on] ?? interaction.on} 시`
  const actions = interaction.actions ?? []
  if (actions.length === 0) return `${trigger} 아무 일도 일어나지 않습니다`
  return `${trigger} ${actions.map((action) => actionClause(nodes, action)).join(', ')}`
}

/**
 * 타겟 노드를 부르는 이름. **셋을 가른다:** 고른 노드 · **아직 안 고름**(빈 타겟) ·
 * **사라진 노드**(문서에 없는 id). 가운데를 오른쪽과 같은 말로 접으면, 액션을 막 더한
 * 사용자가 *"사라진 노드"*라는 문장을 본다.
 */
function targetName(nodes: ReadonlyMap<string, WbNode>, target: string): string {
  if (typeof target !== 'string' || target.trim().length === 0) return UNSET_NODE
  const node = nodes.get(target)
  return node === undefined ? MISSING_NODE : nodeName(node)
}

/** 액션 하나의 절. **5종이 모두 여기 있다** — 유니온이라 빠뜨리면 컴파일러가 잡는다. */
function actionClause(nodes: ReadonlyMap<string, WbNode>, action: InteractionAction): string {
  switch (action.type) {
    case 'setProp': {
      const target = nodes.get(action.target)
      const name = targetName(nodes, action.target)
      const known = typeof action.prop === 'string' && action.prop.trim().length > 0
      const label = known ? propLabel(target, action.prop) : UNSET_PROP
      // §8.2의 표본이 참인 경우다: *"② 목록이 로딩 상태로 바뀝니다"*.
      //
      // **속성이 미확정이면 그 형태를 못 쓴다.** `{라벨}로 바뀝니다`는 라벨이 **상태 이름**일
      // 때만 뜻이 통하는데(`로딩 상태`), 미확정이면 *"아직 고르지 않은 속성으로 바뀝니다"*가
      // 되어 무엇이 일어나는지 말하지 못한다. 그때는 거짓 쪽과 같은 형태를 쓴다.
      if (action.value === true) {
        return known
          ? `${name}${subjectParticle(name)} ${label}${directionParticle(label)} 바뀝니다`
          : `${name}의 ${label}${subjectParticle(label)} 켜집니다`
      }
      // 거짓은 대칭으로 적을 수 없다 — *"로딩 상태가 아니게 됩니다"*는 어색하고,
      // 카탈로그의 그 prop들은 전부 스위치라 **꺼진다**는 말이 그대로 맞다.
      if (action.value === false) return `${name}의 ${label}${subjectParticle(label)} 꺼집니다`
      const shown = showValue(action.value)
      // **조사는 따옴표가 아니라 값으로 계산한다.** `"회원"`의 마지막 글자는 `"`라
      // 한글 판정이 `null`이 되고, 그러면 `"회원"로`가 나온다(실측하고 고쳤다).
      const spoken = typeof action.value === 'string' ? action.value : shown
      return `${name}의 ${label}${subjectParticle(label)} ${shown}${directionParticle(spoken)} 바뀝니다`
    }
    case 'setVisible': {
      const name = targetName(nodes, action.target)
      return `${name}${subjectParticle(name)} ${action.value ? '보입니다' : '숨겨집니다'}`
    }
    case 'switchTab': {
      const target = nodes.get(action.target)
      const name = targetName(nodes, action.target)
      const tabName = tabLabel(target, action.tab)
      // **뜻이 없는 번호는 번호로 읽어 주지 않는다** — `tab: -3`을 `-2번째 탭`으로 내던
      // 자리다(리뷰가 찾았다). 검증도 같은 값을 `invalid-interaction-prop`으로 잡는다.
      const usable = typeof action.tab === 'number' && Number.isInteger(action.tab) && action.tab >= 0
      // 이름을 못 읽으면 번호로 말한다 — `tab`은 0부터이고 사람이 세는 것은 1부터다.
      const which = !usable ? BAD_TAB : tabName === null ? `${action.tab + 1}번째 탭` : `"${tabName}" 탭`
      // **조사를 계산한다.** 앞 판은 `으로`를 박아 두고 *"셋 다 `탭`으로 끝나므로 계산할
      // 필요가 없다"*고 적었는데, `올바르지 않은 탭 번호`가 생기면서 그 문장이 거짓이 됐다
      // (`번호`는 받침이 없어 `로`다 — 케이스가 `번호으로`를 잡았다).
      return `${name}${subjectParticle(name)} ${which}${directionParticle(which)} 바뀝니다`
    }
    case 'navigate':
      return `${pageName(action.target)}${directionParticle(pageName(action.target))} 이동합니다`
    case 'openModal': {
      const page = pageName(action.target)
      return `${page}${subjectParticle(page)} 모달로 열립니다`
    }
  }
}

/**
 * 노드를 문장에서 부르는 이름. `① 검색 버튼` / `목록` / `Bogus`.
 *
 * **저작 UI의 타겟 목록이 이것을 쓴다** — 목록에서 고른 이름과 문장에 나오는 이름이
 * 갈리면 사용자가 둘을 잇지 못한다. 그래서 이름을 만드는 자리는 여기 하나다.
 */
export function describeNode(node: WbNode): string {
  return nodeName(node)
}

/**
 * 노드를 문장에서 부르는 이름. `① 검색 버튼` / `목록` / `Bogus`.
 *
 * **카탈로그에 없는 타입은 영문 타입 이름을 그대로 쓴다.** 그 노드는 화면에도 폴백으로
 * 그려지고 `unknown-type` 이슈가 따로 붙으므로, 문장이 그것을 숨기지 않는 편이 맞다.
 */
function nodeName(node: WbNode): string {
  const noun = COMPONENT_NOUNS[node.type]
  const base = noun?.name ?? (typeof node.type === 'string' ? node.type : '알 수 없는 노드')
  const label = noun?.labelProp === undefined ? undefined : readLabel(node, noun.labelProp)
  const named = label === undefined ? base : `${label} ${base}`
  const marker = markerOf(node)
  return marker === null ? named : `${marker} ${named}`
}

/** 라벨성 prop의 값. 문자열이 아니거나 비어 있으면 `undefined`다. */
function readLabel(node: WbNode, prop: string): string | undefined {
  const value = node.props?.[prop]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.length > LABEL_MAX ? `${trimmed.slice(0, LABEL_MAX)}…` : trimmed
}

/**
 * 번호 표기. **1~20은 원문자(`①`), 그 위는 `(21)`이다.**
 *
 * 유니코드에 ㉑(21~35)·㊱(36~50)도 있지만 **폰트 지원이 갈린다.** 이 문장은 화면·HTML
 * 번들·PPTX 셋이 함께 싣는데(§8.2) 글리프가 없으면 두부(□)가 되고, 51부터는 유니코드에
 * 아예 없어 어차피 폴백이 필요하다 — 경계를 20 하나로 두면 규칙이 하나다.
 *
 * **캔버스의 마커 오버레이는 원문자를 쓰지 않는다**(`apps/web`의 `canvas.tsx`가 숫자를
 * 그대로 그린다). 규격(§8.2·§9)이 원문자를 쓰므로 문장은 규격을 따르고, 그 어긋남은
 * 보고에 남긴다.
 */
function markerOf(node: WbNode): string | null {
  const marker = node.marker
  if (typeof marker !== 'number' || !Number.isInteger(marker) || marker < 1) return null
  if (marker <= 20) return String.fromCodePoint(0x2460 + marker - 1)
  return `(${marker})`
}

/**
 * prop을 문장에서 부르는 이름. **카탈로그의 `editor` 라벨을 쓴다** — §8.2의
 * *"로딩 상태"*가 `List`의 `{ prop: 'loading', label: '로딩 상태' }`에서 온 값이다.
 * `editor`에 없는 prop은 이름 그대로다(속성 패널에서도 도달할 수 없는 prop이다).
 */
function propLabel(target: WbNode | undefined, prop: string): string {
  if (target === undefined) return prop
  const def = getComponent(target.type)
  const field = def?.editor.find((item) => item.prop === prop)
  return field?.label ?? prop
}

/** `Tabs`의 `tabs` 배열에서 그 자리의 이름. 못 읽으면 `null`이다. */
function tabLabel(target: WbNode | undefined, index: number): string | null {
  const tabs = target?.props?.tabs
  if (!Array.isArray(tabs)) return null
  const name = tabs[index]
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null
}

/**
 * `navigate`·`openModal`의 타겟을 부르는 이름.
 *
 * §8.1의 예가 `"page:관리자/회원/상세"`다 — **노드 id가 아니라 페이지 경로**이고 그 페이지는
 * 이 문서 안에 없다. 접두를 벗기고 *"페이지"*를 붙여 그것이 페이지라는 것을 말한다.
 * **비어 있으면 그렇다고 말한다** — 빈 문자열을 그대로 흘리면 대상이 있는 것처럼 읽힌다.
 *
 * **P5-3이 내보냈다.** 뷰 모드의 런타임이 그 둘을 실행하지 않고 알리는데(D4), 그 알림도
 * 페이지를 이름으로 불러야 한다. 거기서 접두를 다시 벗기면 **같은 이름을 만드는 자리가
 * 둘**이 되고, 그것이 `사라진 노드`가 두 곳에 있는 것과 같은 부류다(P5-2 이월 §8-6).
 */
export function describePageTarget(target: string): string {
  return pageName(target)
}

/**
 * **접두를 여기서 벗기지 않는다**(P9-3 T2).
 *
 * 앞 판은 `'page:'` 리터럴을 **한 줄에 두 번** 인라인했다(`startsWith` · `slice`). 그때
 * 상수(`PAGE_TARGET_PREFIX`)는 `apps/api`에 살아 이 파일이 볼 수 없었고, P9-1 이월이
 * *"상수만 올리면 접두가 세 자리가 된다"*고 경고한 것이 이 자리다. 승격 뒤에는 벗기는
 * 자리도 `page-target.ts` 하나다.
 */
function pageName(target: string): string {
  const path = pageTargetPath(target)
  return path.length === 0 ? UNSET_PAGE : `${path} 페이지`
}

/** `setProp`의 값을 문장에 싣는 모양. 문자열은 따옴표로 감싸 낱말 경계를 보인다. */
function showValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return '없음'
  if (Array.isArray(value)) return `${value.length}개 항목`
  if (typeof value === 'object') return '객체'
  return String(value)
}

/**
 * 이/가. **한글이 아닌 글자로 끝나면 받침 없는 쪽(`가`)이다.**
 *
 * 숫자·라틴 문자의 한국어 발음은 읽는 사람에 따라 갈리고(`10`은 *"십"*·*"열"*), 맞히려면
 * 발음 표가 필요하다 — 문장화가 문자열 조립이라는 D3의 전제를 넘는다. **`이(가)` 같은
 * 이중 표기를 쓰지 않는 이유:** 문장이 읽기 어려워지고 §8.2의 표본에도 그런 형태가 없다.
 */
function subjectParticle(word: string): string {
  return finalConsonant(word) === true ? '이' : '가'
}

/** 로/으로. 받침이 없거나 `ㄹ`이면 `로`다. */
function directionParticle(word: string): string {
  const jong = jongseong(word)
  if (jong === null) return '로'
  return jong === 0 || jong === 8 ? '로' : '으로'
}

function finalConsonant(word: string): boolean | null {
  const jong = jongseong(word)
  return jong === null ? null : jong !== 0
}

/**
 * 아라비아 숫자로 끝나는 말의 종성. **숫자는 표로 정확히 다룬다** — 한자어 읽기가
 * 갈리지 않기 때문이다(`1`은 *"일"*, `10`은 *"십"*). 라틴 문자를 같은 방식으로 다루지
 * 않는 이유는 그쪽이 갈리기 때문이다(`List`는 *"리스트"*, `id`는 *"아이디"*).
 *
 * 값은 종성 인덱스다: 0 = 없음 · 1 = ㄱ · 8 = ㄹ · 16 = ㅁ · 21 = ㅇ.
 */
const DIGIT_JONGSEONG: Record<string, number> = {
  '0': 21, // 영
  '1': 8, // 일
  '2': 0, // 이
  '3': 16, // 삼
  '4': 0, // 사
  '5': 0, // 오
  '6': 1, // 육
  '7': 8, // 칠
  '8': 8, // 팔
  '9': 0, // 구
}

/**
 * 마지막 글자의 종성 인덱스. 한글 음절도 숫자도 아니면 `null`이다 — *"모른다"*이고,
 * 부르는 쪽이 그것을 받침 없음과 갈라 다룬다.
 */
function jongseong(word: string): number | null {
  const last = [...word].at(-1)
  if (last === undefined) return null
  const digit = DIGIT_JONGSEONG[last]
  if (digit !== undefined) return digit
  const code = last.codePointAt(0)
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return null
  return (code - 0xac00) % 28
}
