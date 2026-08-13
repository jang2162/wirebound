/**
 * 패턴 전개(§6.6: *"패턴을 페이지에 넣으면 `schema`가 전개되고 노드 `id`가 새로 발급된다"*).
 *
 * **`spec/patterns.ts`가 *"전개는 만들지 않는다(D7)"*고 미뤄 둔 자리가 여기다.** 검증은
 * 그쪽이 하고, 여기서는 검증을 지난 템플릿을 노드로 찍어 낸다.
 *
 * ---
 *
 * **왜 `themes`가 소유하는가**(P7-1 D1). `packages/schema`는 `ThemePattern`을 모르고, 알게
 * 하면 `schema → themes` 역방향 의존이 된다. `apps/web`에 두면 P8(exporter)·P9(MCP)가 못
 * 쓴다 — 패턴 삽입은 에이전트가 할 일이기도 하다(§12).
 *
 * **`remapNodeIds`를 쓰지 않는다**(재라 #5 — 재서 확인했다). 그 함수는 *"트리 안을 가리키던
 * 상호작용 `target`도 함께 바꾼다"*가 값어치인데, `PatternNode`는 **`id`도 `interactions`도
 * 받지 않는다**(`spec/patterns.ts`). 옮길 옛 id가 없으므로 리매핑할 대상 자체가 없고,
 * 그것을 쓰려면 없는 id를 지어 붙였다가 다시 바꾸는 왕복이 된다. **밀반입되어도 옮기지
 * 않는 것**은 아래 `expandNode`가 필드를 하나씩 골라 옮기기 때문이고, 케이스가 고정한다.
 *
 * **던지지 않는다.** `resolveTheme`과 같은 형식으로 `{ expanded, issues }`를 낸다 —
 * 부르는 쪽이 `apps/web`의 구조 툴바이고 그 자리는 오류 경계 밖이다(`panels/
 * structure-toolbar.tsx` 머리말: 던지면 셸 전체가 흰 화면이다).
 */
import { createNodeId, type WbNode } from '@wirebound/schema'
import { issue, type ThemeIssue } from '../issue'
import type { PatternNode, ThemePattern } from '../spec/patterns'

export interface ExpandedPattern {
  /**
   * 페이지에 꽂을 노드들. **오늘은 항상 하나다** — `ThemePattern.schema`가 노드 하나이기
   * 때문이고, 그 수는 케이스가 못박는다. 배열인 것은 삽입 쪽(D5)이 *"여럿이면 순서대로"*를
   * 다룰 수 있게 하려는 것이다.
   */
  nodes: WbNode[]
  /**
   * 슬롯 이름 → **새로 발급된 노드 id**.
   *
   * **값을 채우지 않는다**(D3). §6.6은 슬롯을 *"우측 속성 패널에서 채운다"*고만 했고,
   * **슬롯 값이 노드의 어느 `prop`에 들어가는지는 규격에 없다.** 여기서 대응표를 지으면
   * §16이 열어 둔 *"패턴 슬롯 타입 체계"*를 이 단계가 닫는 것이고, `spec/patterns.ts`가
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
 * (이름 규칙·카탈로그 대조·`unused-slot`)은 `checkPatterns`가 저장 경계에서 이미 한다
 * (`resolveTheme` → `apps/api`의 `assertResolvable`). 여기서 그것을 다시 하면 같은 판정이
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
 * 노드 하나를 옮긴다. **필드를 하나씩 골라 옮기는 것이 D2·D6의 구현이다** — 전개(`...node`)로
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
      issues.push(
        issue('unknown-slot', path, `slots에 선언되지 않은 슬롯입니다: ${template.slot}`),
      )
    } else if (!slots.has(template.slot)) {
      // **처음 만난 노드가 이긴다.** 한 슬롯 이름을 노드 둘이 쓰는 것을 `checkPatterns`가
      // 막지 않으므로(그쪽 주석) 전개가 어느 쪽을 고를지 정해야 한다. 규격에 없는 선택이라
      // 위에서 아래로 채우는 감각에 맞췄고, 케이스가 그 값을 고정한다.
      slots.set(template.slot, node.id)
    }
  }

  if (template.props !== undefined) node.props = template.props
  if (template.variant !== undefined) node.variant = template.variant
  if (template.children !== undefined) {
    node.children = template.children.map((child, index) =>
      expandNode(child, `${path}.children.${index}`, generate, declared, slots, issues),
    )
  }

  return node
}
