/**
 * **액션 하나가 실행 가능한가**를 판정하는 자리 **하나**.
 *
 * ## 왜 갈라 냈나 (P5-3 D3)
 *
 * P5-2가 이 판정을 `validate.ts`의 `checkInteractions` 안에 두었다. 그때는 소비자가
 * 하나였다 — 저장 게이트. **P5-3의 런타임이 둘째 소비자다:** 뷰 모드에서 버튼을 눌렀을 때
 * *"이 액션을 실행할 수 있는가"*는 검증기가 묻는 것과 **같은 물음**이다.
 *
 * **두 벌로 두면 갈린다.** 이 저장소에 이미 그 형태가 있다 — `사라진 노드`가
 * `apps/web`의 코멘트 탭과 `schema`의 문장화 두 곳에 있고 **오늘 글자가 같지만 대조하는
 * 케이스가 없다**(P5-2 이월 §8-6). 판정과 문장이 갈리면 사용자는 **같은 상태를 두 문제로**
 * 읽는다 — 저장할 때는 통과했는데 눌렀더니 다른 말이 나오는 식이다.
 *
 * 그래서 판정도 문장도 여기 하나이고, `validate.ts`와 `renderer`의 런타임이 **함께 부른다.**
 *
 * ## severity·경로·이슈 모양은 여기 없다
 *
 * 이 모듈이 아는 것은 *"무엇이 잘못됐고 뭐라고 말하는가"*뿐이다. `ValidationIssue`로
 * 감싸는 것(`nodeId`·`path`·severity)은 `validate.ts`가 하고, 런타임은 자기 모양
 * (`InteractionIssue`)으로 감싼다. **둘의 소비자가 다르기 때문이다** — 검증 이슈는 저장
 * 게이트와 API 봉투를 지나고, 런타임 이슈는 그 자리에서 화면이 읽는다.
 *
 * ## `navigate`·`openModal`이 갈라져 있는 이유 (D4)
 *
 * 그 둘의 `target`은 노드 id가 아니라 **페이지 경로**이고 그 페이지는 이 문서 안에 없다.
 * **검증기는 그 둘을 아예 보지 않는다**(P5-2 재라 #1: *"아무것도 안 한다"* — 형식을
 * 강제해도 그 페이지가 있다는 보장이 아니다). 런타임은 그보다 하나 더 알아야 한다 —
 * **타겟이 비어 있으면 이동할 곳이 없다.** 그 판정만 `checkPageAction`으로 따로 두고
 * **검증기는 그것을 부르지 않는다**: 부르면 재라 #1의 판정이 뒤집힌다.
 */
import { propSchema } from '../component/define'
import { getComponent } from '../component/registry'
import { getKoreanErrorMap } from '../locale'
import type { InteractionAction, WbNode } from '../node'
import type { ValidationCode } from '../validate'

/**
 * 이 모듈이 낼 수 있는 코드 셋. `ValidationCode`의 부분집합이다 — 그 유니온에 속하는지는
 * 아래 타입 선언이 컴파일 타임에 확인한다.
 */
export type InteractionIssueCode = Extract<
  ValidationCode,
  'missing-interaction-target' | 'invalid-interaction-target' | 'invalid-interaction-prop'
>

/** 액션 하나의 문제. 문제가 없으면 `null`이다 — *"모른다"*가 아니라 *"없다"*이다. */
export interface ActionProblem {
  code: InteractionIssueCode
  message: string
}

/** 타겟이 **이 문서의 노드**인 액션 셋. 렌더러가 실행하는 것도 이 셋이다(D4). */
export type NodeTargetAction = Extract<
  InteractionAction,
  { type: 'setProp' } | { type: 'setVisible' } | { type: 'switchTab' }
>

/** 타겟이 **페이지 경로**인 액션 둘. 렌더러 밖이다(D4). */
export type PageTargetAction = Extract<
  InteractionAction,
  { type: 'navigate' } | { type: 'openModal' }
>

/** 페이지 경로를 받는 둘인가. **판정을 한 곳에 둔다** — 두 소비자가 같은 선을 긋는다. */
export function isPageTargetAction(action: InteractionAction): action is PageTargetAction {
  return action.type === 'navigate' || action.type === 'openModal'
}

/**
 * 노드를 겨냥하는 액션 하나를 문서·카탈로그와 대조한다.
 *
 * **`setVisible`은 언제나 `null`이다** — 대조할 계약이 없다. `visible`이라는 prop도 상태도
 * 어느 컴포넌트에 없어서(P5-2 이월 §8-4) *"이 노드가 숨겨질 수 있는가"*를 선언할 자리가
 * §5.1에 없다. **없는 계약을 여기서 지어내지 않는다.**
 */
export function checkNodeAction(
  nodes: ReadonlyMap<string, WbNode>,
  action: NodeTargetAction,
): ActionProblem | null {
  const target = nodes.get(action.target)
  if (target === undefined) {
    // **아직 안 고른 것과 사라진 것을 갈라 말한다.** 코드와 severity는 같지만(할 일이
    // 같다 — 타겟을 고른다) 문장이 다르다: 액션을 막 더한 사용자에게 *"문서에 없습니다"*
    // 라고 하면 무엇이 없어진 줄 안다. 문장화도 같은 구분을 한다
    // (`interaction/describe.ts`의 `targetName`).
    const empty = action.target.trim().length === 0
    return {
      code: 'missing-interaction-target',
      message: empty
        ? `${action.type}의 타겟을 아직 고르지 않았습니다`
        : `${action.type}의 타겟 노드가 문서에 없습니다: ${action.target}`,
    }
  }

  if (action.type === 'switchTab') {
    if (target.type !== 'Tabs') {
      return {
        code: 'invalid-interaction-target',
        message: `switchTab의 타겟은 Tabs여야 합니다 (현재: ${target.type})`,
      }
    }
    // **`tab`은 `Tabs.active`와 같은 축의 값이므로 같은 규칙으로 본다**(P5-2 리뷰가 찾은
    // 비대칭). 규칙을 베껴 적지 않고 카탈로그의 zod를 그대로 쓴다 — 베끼면 둘이 따로 썩는다.
    // **상한은 여전히 없다**(카탈로그가 `min(0)`만 정했다).
    return checkPropValue(target, 'active', action.tab, 'switchTab의 탭 번호')
  }

  if (action.type === 'setProp') {
    return checkPropValue(target, action.prop, action.value)
  }

  return null
}

/**
 * 페이지 경로를 받는 액션 하나. **비어 있는지만 본다.**
 *
 * **문서 안에서 더 볼 수 없다**(P5-2 재라 #1) — 형식(`page:` 접두)을 강제하는 것은 규격에
 * 없는 규칙을 만드는 것이고, 맞춰도 그 페이지가 있다는 보장이 아니다.
 *
 * **빈 타겟만 다른 것은 그것이 *"아직 안 골랐다"*이기 때문이다.** 이동할 곳이 없는 규칙을
 * 실행하면 *"눌렀는데 아무 일도 안 일어난다"*가 되고, 그것이 이 저장소가 다섯 번 만난
 * 부류다(P5-1 이월 §1 · P5-2 이월 §1). 문장화도 같은 자리를 `아직 정해지지 않은 페이지`로
 * 갈라 말한다.
 */
export function checkPageAction(action: PageTargetAction): ActionProblem | null {
  if (action.target.trim().length > 0) return null
  return {
    code: 'missing-interaction-target',
    message: `${action.type}의 타겟을 아직 고르지 않았습니다`,
  }
}

/**
 * 액션이 넣으려는 값을 타겟 컴포넌트의 **그 prop 계약**과 대조한다.
 *
 * **`setProp`과 `switchTab`이 함께 쓴다.** `switchTab.tab`은 이름만 다를 뿐 `Tabs.active`에
 * 넣는 값이라 같은 규칙을 받아야 한다 — P5-2의 앞 판은 그 자리를 안 봤고, 같은 값(`-3`·`1.5`)이
 * **prop 자리에서는 `invalid-props`(error)인데 액션 자리에서는 이슈 0건**이었다(리뷰가 쟀다).
 *
 * `label`은 메시지에 쓸 이름이다. 사용자가 적은 것은 `tab`이지 `active`가 아니므로,
 * 그쪽은 *"switchTab의 탭 번호"*라고 불러야 무엇을 고쳐야 하는지가 맞는다.
 *
 * **값을 `def.props` 통째로 파싱하지 않는다** — 그러면 타겟 노드에 없는 **다른** prop
 * 때문에 실패가 난다. `propSchema`가 그 prop 하나만 떼어 준다.
 *
 * **카탈로그에 없는 타입은 판정하지 않는다.** 대조할 계약이 없고, *"알 수 없는 타입"*은
 * `unknown-type`이 이미 말한다 — 같은 사실을 두 이슈로 말하면 사용자는 문제가 둘인 줄 안다.
 */
function checkPropValue(
  target: WbNode,
  prop: string,
  value: unknown,
  label = `${target.type}.${prop}`,
): ActionProblem | null {
  const def = getComponent(target.type)
  if (!def) return null

  const schema = propSchema(def, prop)
  if (schema === undefined) {
    return {
      code: 'invalid-interaction-prop',
      message: `${target.type}에 없는 prop입니다: ${prop}`,
    }
  }

  const parsed = schema.safeParse(value, { error: getKoreanErrorMap() })
  if (parsed.success) return null

  return {
    code: 'invalid-interaction-prop',
    message: `${label}에 넣을 수 없는 값입니다: ${parsed.error.issues
      .map((issue) => issue.message)
      .join(', ')}`,
  }
}
