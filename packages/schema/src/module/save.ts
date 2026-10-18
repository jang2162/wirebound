/**
 * 모듈에 담을 노드를 짓는다(설계 spec `2026-10-18-modules-states-layout-design.md` 「B3. 모듈」).
 *
 * 모듈은 프로젝트의 모든 페이지에 넣는 노드 묶음이라, 그 묶음 밖을 가리키는 것은 넣는 페이지에서 뜻이 없다:
 *
 * | 걷는 것 | 까닭 |
 * |---|---|
 * | `marker` | 그 번호를 가리키는 코멘트 행은 저장한 페이지에 매달려 있다 — 따라가면 아무 데도 닿지 않는 번호다 |
| `visibility` | 상태는 페이지마다 따로다 — 모듈에는 상태가 없어, 넣은 노드는 넣는 페이지의 모든 상태에서 보인다(지금 고른 상태와 무관) |
 * | 묶음 밖 노드를 겨냥하는 액션 | 넣는 페이지에 그 노드가 없다. 붙여넣기(`prepareNodesForPaste`)와 같은 거름이다 |
 *
 * **페이지를 겨냥하는 액션(`navigate` · `openModal`)과 빈 대상은 남긴다** — 모듈은 프로젝트 단위라 그 페이지는 넣는 페이지에서도
 * 같은 프로젝트의 페이지다. 그 페이지가 지워졌으면 넣을 때 붙여넣기와 같은 거름이 뺀다.
 *
 * **저장하는 자리 둘(화면 «모듈로 저장…» 상자 · 서버 `POST …/modules`)이 이 함수 하나를 쓴다** — 화면은 뺀 수를 상자에 말하려고,
 * 서버는 화면을 지나지 않는 본문(MCP · CLI · 손으로 낸 요청)에도 같은 규칙이 걸리게 하려고 부른다.
 *
 * **id 는 그대로 둔다** — 재발급은 넣기가 한다(`remapNodeIds`). 저장에서 재발급하면 같은 모듈을 두 번 넣은 페이지가 같은 id 를 갖는다.
 */
import { isPageTargetAction } from '../interaction/check'
import type { Interaction, InteractionAction, WbNode } from '../node'
import { collectNodeIds, stripMarkers } from '../tree'

/** 모듈 이름의 글자 수 상한(스냅샷 태그와 같은 1 ~ 60자). 서버의 본문 검사와 화면의 이름 칸이 이 값을 읽는다. */
export const MODULE_NAME_MAX = 60

/** `moduleNodesForSave` 의 결과 — `droppedActions` 는 묶음 밖을 가리켜 뺀 액션 수다(상자가 말한다). */
export interface ModuleNodes {
  nodes: WbNode[]
  droppedActions: number
}

/**
 * 모듈에 담을 노드 — `marker` · `visibility` 를 걷고 묶음 밖 노드를 겨냥하는 액션을 뺀다(머리말 표). 액션이 다 빠진 상호작용은 상호작용째 빠지고,
 * 상호작용이 다 빠진 노드는 `interactions` 키가 없다(붙여넣기의 거름과 같은 꼴).
 *
 * **입력을 바꾸지 않고 입력과 값을 공유하지 않는다** — 깊은 복사는 `stripMarkers` 의 계약이다(그 머리말).
 */
export function moduleNodesForSave(nodes: readonly WbNode[]): ModuleNodes {
  const copied = stripMarkers(nodes)
  const inside = new Set(copied.flatMap((node) => collectNodeIds(node)))
  let droppedActions = 0

  const keep = (action: InteractionAction): boolean => {
    if (action.target.trim() === '') return true
    if (isPageTargetAction(action)) return true
    return inside.has(action.target)
  }

  const filter = (node: WbNode): WbNode => {
    delete node.visibility
    if (node.interactions !== undefined) {
      const interactions: Interaction[] = []
      for (const interaction of node.interactions) {
        const actions = interaction.actions.filter(keep)
        droppedActions += interaction.actions.length - actions.length
        if (actions.length === interaction.actions.length) interactions.push(interaction)
        else if (actions.length > 0) interactions.push({ ...interaction, actions })
      }
      if (interactions.length > 0 || node.interactions.length === 0) node.interactions = interactions
      else delete node.interactions
    }
    node.children?.forEach(filter)
    return node
  }

  return { nodes: copied.map(filter), droppedActions }
}

/** 노드 묶음의 노드 수 — 자손까지 센다(모듈 카드의 «노드 N개»). */
export function countModuleNodes(nodes: readonly WbNode[]): number {
  return nodes.reduce((sum, node) => sum + collectNodeIds(node).length, 0)
}
