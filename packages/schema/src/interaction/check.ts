/**
 * **액션 하나가 실행 가능한가**를 판정하는 자리 **하나**.
 *
 * ## 왜 `validate.ts`에서 갈라 두나
 *
 * 소비자가 둘이다 — 저장 게이트(`validate.ts`의 `checkInteractions`)와 **렌더러의 런타임**.
 * 뷰 모드에서 버튼을 눌렀을 때 *"이 액션을 실행할 수 있는가"*는 검증기가 묻는 것과 **같은 물음**이다.
 *
 * **두 벌로 두면 갈린다.** 이 저장소에 이미 그 형태가 있다 — `사라진 노드`가
 * `apps/web`의 코멘트 탭과 `schema`의 문장화에 따로 적혀 있어, 글자가 같다는 것을 지키는 것이
 * 사람의 기억뿐이다. 판정과 문장이 갈리면 사용자는 **같은 상태를 두 문제로**
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
 * ## `navigate`·`openModal`이 갈라져 있는 이유
 *
 * 그 둘의 `target`은 노드 id가 아니라 **페이지 경로**이고 그 페이지는 이 문서 안에 없다.
 * **검증기는 그 둘을 아예 보지 않는다**(`validate.ts`의 `checkInteractions` 머리말 — 형식을
 * 강제해도 그 페이지가 있다는 보장이 아니다). 런타임은 그보다 하나 더 알아야 한다 —
 * **타겟이 비어 있으면 이동할 곳이 없다.** 그 판정만 `checkPageAction`으로 따로 두고
 * **검증기는 그것을 부르지 않는다**: 부르면 빈 페이지 타겟이 저장 경로에서 경고가 되기 시작한다.
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

/** 타겟이 **이 문서의 노드**인 액션 셋. 렌더러가 실행하는 것도 이 셋이다. */
export type NodeTargetAction = Extract<InteractionAction, { type: 'setProp' } | { type: 'setVisible' } | { type: 'switchTab' }>

/** 타겟이 **페이지 경로**인 액션 둘. 렌더러 밖이다. */
export type PageTargetAction = Extract<InteractionAction, { type: 'navigate' } | { type: 'openModal' }>

/** 페이지 경로를 받는 둘인가. **판정을 한 곳에 둔다** — 두 소비자가 같은 선을 긋는다. */
export function isPageTargetAction(action: InteractionAction): action is PageTargetAction {
  return action.type === 'navigate' || action.type === 'openModal'
}

/** 대상이 없는 액션 — 팝업 닫기(맨 위 팝업을 닫는다). 판정할 것이 없어 늘 맞다. */
export type TargetlessAction = Extract<InteractionAction, { type: 'closeModal' }>

/** 대상이 없는 액션인가. 대상을 거르는 자리(붙이기 · 모듈 저장 · 검증)가 이것으로 먼저 넘긴다. */
export function isTargetlessAction(action: InteractionAction): action is TargetlessAction {
  return action.type === 'closeModal'
}

/** 액션의 대상 글자 — 대상 없는 액션이면 `undefined`. */
export function actionTarget(action: InteractionAction): string | undefined {
  return isTargetlessAction(action) ? undefined : action.target
}

/**
 * 노드를 겨냥하는 액션 하나를 문서·카탈로그와 대조한다.
 *
 * **`setVisible`은 언제나 `null`이다** — 대조할 계약이 없다. `visible`이라는 prop도 상태도
 * 어느 컴포넌트에도 없어서 *"이 노드가 숨겨질 수 있는가"*를 선언할 자리가
 * 설계서 「컴포넌트 정의 구조」에 없다. **없는 계약을 여기서 지어내지 않는다.**
 */
export function checkNodeAction(nodes: ReadonlyMap<string, WbNode>, action: NodeTargetAction): ActionProblem | null {
  const target = nodes.get(action.target)
  if (target === undefined) {
    // **아직 안 고른 것과 사라진 것을 갈라 말한다.** 코드와 severity는 같지만(할 일이
    // 같다 — 타겟을 고른다) 문장이 다르다: 액션을 막 더한 사용자에게 *"문서에 없습니다"*
    // 라고 하면 무엇이 없어진 줄 안다. 문장화도 같은 구분을 한다
    // (`interaction/describe.ts`의 `targetName`).
    const empty = action.target.trim().length === 0
    return {
      code: 'missing-interaction-target',
      message: empty ? `${action.type}의 타겟을 아직 고르지 않았습니다` : `${action.type}의 타겟 노드가 문서에 없습니다: ${action.target}`,
    }
  }

  // 탭 바꾸기는 패널을 가리킨다 — 패널을 옮겨도 대상이 따라가고, 런타임이 그 패널의 부모 `Tabs`를 연다.
  if (action.type === 'switchTab') {
    if (target.type !== 'TabPanel') {
      return {
        code: 'invalid-interaction-target',
        message: `switchTab의 타겟은 TabPanel이어야 합니다 (현재: ${target.type})`,
      }
    }
    return null
  }

  if (action.type === 'setProp') {
    return checkPropValue(target, action.prop, action.value)
  }

  return null
}

/**
 * 페이지 경로를 받는 액션 하나. **비어 있는지만 본다.**
 *
 * **문서 안에서 더 볼 수 없다** — 형식(`page:` 접두)을 강제하는 것은 규격에
 * 없는 규칙을 만드는 것이고, 맞춰도 그 페이지가 있다는 보장이 아니다.
 *
 * **빈 타겟만 다른 것은 그것이 *"아직 안 골랐다"*이기 때문이다.** 이동할 곳이 없는 규칙을
 * 실행하면 *"눌렀는데 아무 일도 안 일어난다"*가 되고, 사용자는 미확정을 고장으로 읽는다.
 * 문장화도 같은 자리를 `아직 정해지지 않은 페이지`로
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
 * 액션이 넣으려는 값을 타겟 컴포넌트의 **그 prop 계약**과 대조한다(`setProp`).
 *
 * **값을 `def.props` 통째로 파싱하지 않는다** — 그러면 타겟 노드에 없는 **다른** prop
 * 때문에 실패가 난다. `propSchema`가 그 prop 하나만 떼어 준다.
 *
 * **카탈로그에 없는 타입은 판정하지 않는다.** 대조할 계약이 없고, *"알 수 없는 타입"*은
 * `unknown-type`이 이미 말한다 — 같은 사실을 두 이슈로 말하면 사용자는 문제가 둘인 줄 안다.
 */
function checkPropValue(target: WbNode, prop: string, value: unknown): ActionProblem | null {
  const label = `${target.type}.${prop}`
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
    message: `${label}에 넣을 수 없는 값입니다: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`,
  }
}
