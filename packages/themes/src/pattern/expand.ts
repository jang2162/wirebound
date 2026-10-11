/**
 * 패턴 전개(설계서 「patterns — 테마가 소유한 구성 레시피」: *"패턴을 페이지에 넣으면 `schema`가 전개되고 노드 `id`가 새로 발급된다"*).
 *
 * **검증은 `spec/patterns.ts`가 하고 전개는 여기서 한다** — 여기서는 검증을 지난 템플릿을
 * 노드로 찍어 낸다.
 *
 * ---
 *
 * **왜 `themes`가 소유하는가.** `packages/schema`는 `ThemePattern`을 모르고, 알게 하면
 * `schema → themes` 역방향 의존이 된다. `apps/web`에 두면 exporter·CLI·MCP가 못 쓴다 —
 * 패턴 삽입은 에이전트가 할 일이기도 하다(설계서 「LLM 연계 (P9)」).
 *
 * **`remapNodeIds`를 쓰지 않는다.** 그 함수는 *"트리 안을 가리키던
 * 상호작용 `target`도 함께 바꾼다"*가 값어치인데, `PatternNode`는 **`id`도 `interactions`도
 * 받지 않는다**(`spec/patterns.ts`). 옮길 옛 id가 없으므로 리매핑할 대상 자체가 없고,
 * 그것을 쓰려면 없는 id를 지어 붙였다가 다시 바꾸는 왕복이 된다. **밀반입되어도 옮기지
 * 않는 것**은 아래 `expandNode`가 필드를 하나씩 골라 옮기기 때문이고, 케이스가 고정한다.
 *
 * **검증 결과를 던지지 않는다 — 예외가 하나 있다.**
 *
 * 잘못된 패턴은 `checkPatterns`와 같은 형식으로 `{ expanded, issues }`에 실어 낸다.
 * 부르는 쪽이 `apps/web`의 구조 툴바이고 그 자리는 오류 경계 밖이기 때문이다(`panels/
 * structure-toolbar.tsx` 머리말: 던지면 셸 전체가 흰 화면이다).
 *
 * **그러나 아래 `expandNode`의 `structuredClone`은 던질 수 있다.** 구조적 복제가 불가능한
 * 값(함수·심볼 등)이 `props`에 있으면 `DOMException`이다 — 실측한 문장은
 * `() => 1 could not be cloned.`이고, 그것이 이 함수 밖으로 그대로 나간다.
 *
 * **그 입력이 오는 경로는 0건이다.** 카탈로그의 **모든 컴포넌트 ×
 * 모든 prop**에 함수를 넣어 `def.props.safeParse`를 돌리면 **통과하는 것이 하나도 없다**
 * (`test/pattern-expand.test.ts`의 `structuredClone이 던지는 값은 카탈로그를 통과하지
 * 못한다`가 그것을 잰다 — 시도한 자리의 **수는 여기 적지 않는다.** 카탈로그가 늘면 그
 * 수만 조용히 낡고 케이스는 죽지 않기 때문이고, 케이스가 지키는 것은 *"분모가 0이
 * 아니다"*와 *"통과가 0건이다"* 둘이다). 패턴은 테마 패키지의 manifest(`patterns`)가 든 코드 상수다.
 *
 * **막지 않은 것은 막을 방법이 조용히 다른 값을 만드는 것뿐이기 때문이다.** 삼키면 그
 * 노드의 `props`가 사라지거나 반쪽이 되고, 그것은 *"꽂았는데 값이 없다"*로 나타나 원인을
 * 훨씬 늦게 만나게 한다. 케이스가 이 예외를 값으로 고정하므로, 누가 `try/catch`로 감싸면
 * 그 결정이 케이스의 죽음으로 드러난다.
 */
import { createNodeId, type WbNode } from '@wirebound/schema'
import { issue, type ThemeIssue } from '../issue'
import type { PatternNode, ThemePattern } from '../spec/patterns'

export interface ExpandedPattern {
  /**
   * 페이지에 꽂을 노드들. **항상 하나다** — `ThemePattern.schema`가 노드 하나이기
   * 때문이고, 그 수는 케이스가 못박는다. 배열인 것은 삽입 쪽이 *"여럿이면 순서대로"*를
   * 다룰 수 있게 하려는 것이다.
   */
  nodes: WbNode[]
  /**
   * 슬롯 이름 → **새로 발급된 노드 id**.
   *
   * **값을 채우지 않는다.** 「patterns — 테마가 소유한 구성 레시피」는 슬롯을 *"우측 속성
   * 패널에서 채운다"*고만 했고, **슬롯 값이 노드의 어느 `prop`에 들어가는지는 규격에 없다.**
   * 여기서 대응표를 지으면 설계서 「열린 질문 (구현 중 결정)」이 열어 둔 *"패턴 슬롯 타입
   * 체계"*를 이 단계가 닫는 것이고, `spec/patterns.ts`가
   * 같은 이유로 슬롯 타입과 노드 타입의 대조를 거부한 것과 정면으로 어긋난다.
   *
   * 저작 UI는 *"이 슬롯이 이 노드다"*를 알고 **이미 있는 속성 패널로** 채운다.
   */
  slots: Map<string, string>
}

/**
 * 패턴 하나를 노드로 전개한다. `issues`가 비어 있지 않으면 `expanded`는 `null`이다.
 *
 * **이슈를 내는 자리는 하나뿐이다 — 선언 안 된 슬롯 이름**(`unknown-slot`). 나머지 검증
 * (이름 규칙·카탈로그 대조·`unused-slot`)은 `checkPatterns`의 몫이다. 여기서 그것을 다시 하면 같은 판정이
 * 두 곳에 생긴다.
 *
 * **그런데 이 하나는 다시 본다.** `checkPatterns`도 `unknown-slot`을 내지만, 전개가 그것을
 * **조용히 무시하면** 슬롯 이름 오타 하나가 *"채울 칸이 안 보인다"*로만 나타난다 — 사용자는
 * 무엇이 잘못됐는지 알 수 없다. 값을 버리는 자리에서 말하는 것이 싸다.
 *
 * id 생성기를 주입할 수 있다 — `remapNodeIds`가 `generate`를 받는 것, `createNode`가
 * `nextId`를 받는 것과 같은 이유다. 안 그러면 케이스가 결과를 고정할 수 없다.
 */
export function expandPattern(
  pattern: ThemePattern,
  generate: () => string = createNodeId,
): { expanded: ExpandedPattern | null; issues: ThemeIssue[] } {
  const declared = new Set(Object.keys(pattern.slots ?? {}))
  const slots = new Map<string, string>()
  const issues: ThemeIssue[] = []

  const node = expandNode(pattern.schema, 'schema', generate, declared, slots, issues)

  if (issues.length > 0) return { expanded: null, issues }
  return { expanded: { nodes: [node], slots }, issues }
}

/**
 * 노드 하나를 옮긴다. **필드를 하나씩 골라 옮긴다** — 전개(`...node`)로
 * 베끼면 `slot`이 그대로 따라가 `WbNodeSchema`(strictObject)가 죽고, 밀반입된 `marker`·
 * `interactions`도 함께 실린다.
 *
 * `props`·`variant`·`children`은 **없으면 키를 만들지 않는다.** `createNode`가 같은 판단을
 * 적어 뒀다 — 문서에 값이 **없는 것**이 곧 *"카탈로그를 따른다"*는 뜻이다.
 */
function expandNode(
  template: PatternNode,
  path: string,
  generate: () => string,
  declared: ReadonlySet<string>,
  slots: Map<string, string>,
  issues: ThemeIssue[],
): WbNode {
  // **id를 먼저 발급한다.** 그래야 아래 슬롯 매핑이 이 노드를 가리킬 수 있고, 자식보다
  // 부모가 먼저 번호를 받는다(전위 순회 — 케이스가 그 순서를 고정한다).
  const node: WbNode = { id: generate(), type: template.type }

  if (template.slot !== undefined) {
    if (!declared.has(template.slot)) {
      issues.push(issue('unknown-slot', path, `slots에 선언되지 않은 슬롯입니다: ${template.slot}`))
    } else if (!slots.has(template.slot)) {
      // **처음 만난 노드가 이긴다.** 한 슬롯 이름을 노드 둘이 쓰는 것을 `checkPatterns`가
      // 막지 않으므로(그쪽 주석) 전개가 어느 쪽을 고를지 정해야 한다. 규격에 없는 선택이라
      // 위에서 아래로 채우는 감각에 맞췄고, 케이스가 그 값을 고정한다.
      slots.set(template.slot, node.id)
    }
  }

  /**
   * **`props`는 깊은 복사로 넘긴다.**
   *
   * 참조로 넘기면 전개된 노드의 props를 고치는 순간 **템플릿이 함께 바뀐다.** 테마
   * manifest 는 모듈 상수라 그 오염이 프로세스가 사는 동안 남고, 다음에 같은 패턴을 꽂는
   * 사람이 남이 고친 값을 받는다. **이 부류의 증상은 "무관한 테스트가 순서에 따라 깨진다"로 나타난다** —
   * 앞 케이스가 오염시킨 상수를 뒤 케이스가 읽는다.
   *
   * > **죽는 케이스의 수를 여기 적지 않는다.** 수는 분모가 움직일 때마다 낡고, 낡아도
   * > 아무 케이스가 죽지 않는다. 남는 것은 **성질**뿐이다.
   * > (재려면: 아래 `structuredClone`을 참조 대입으로 바꾸고
   * > `pnpm vitest run packages/themes/test/pattern-expand.test.ts`.)
   *
   * **얕은 복사(`{ ...props }`)로는 부족하다.** 카탈로그에 **기본값이 객체나 배열인 prop이
   * 넷** 있고(`KeyValue.pairs`·`List.columns`·`Tabs.tabs`·`Tree.items`) 얕은 복사는 그
   * 값의 참조를 그대로 남긴다. **그 목록은 케이스가 만든다** —
   * `얕은 복사가 못 끊는 prop을 카탈로그가 넷 갖는다`가 카탈로그를 훑어 세므로, 컴포넌트가
   * 늘면 그 케이스가 죽지 이 문장이 조용히 낡지 않는다. **넷 중 `KeyValue.pairs`만 두 겹**
   * (배열 안에 객체)이고, 그래서 *"두 겹 아래까지 끊긴다"*가 지어낸 모양이 아니다.
   *
   * > **이 목록을 `grep -n 'z.array'`로 세지 않는다.** grep은 어느 컴포넌트의 prop인지
   * > 말해 주지 않고, 그 침묵을 줄 번호에서 추측해 메우면 카탈로그에 없는 컴포넌트나
   * > 배열이 아닌 prop을 적게 된다.
   *
   * **이것이 지금 잠재인 이유:** `apps/web`은 편집을 JSON Patch로만 하고(`edit/ops.ts`)
   * `applyOps`가 문서를 통째로 `structuredClone`한 뒤 바꾸므로 전개된 노드를 제자리에서
   * 만지는 경로가 없다. **그 전제에 기대지 않는다** — 제자리에서 만지는 경로가 생기면 이
   * 복사가 유일한 방어선이다.
   *
   * **이 호출이 던질 수 있다는 것과 그 입력이 오지 않는다는 것**은 파일 머리말에 있다.
   */
  if (template.props !== undefined) node.props = structuredClone(template.props)
  if (template.variant !== undefined) node.variant = template.variant
  if (template.children !== undefined) {
    node.children = template.children.map((child, index) =>
      expandNode(child, `${path}.children.${index}`, generate, declared, slots, issues),
    )
  }

  return node
}
