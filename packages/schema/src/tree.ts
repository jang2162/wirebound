import { cloneJsonValue } from './clone'
import { createNodeId, type WbNode } from './node'

export interface NodeVisit {
  node: WbNode
  /** 문서 루트(`{ version, root }`) 기준 JSON Pointer */
  path: string
  parent: WbNode | null
  /** 부모의 children 안에서의 인덱스. 루트는 -1 */
  index: number
}

/** 깊이 우선 전위 순회로 모든 노드를 방문한다. */
export function* walkNodes(root: WbNode, basePath = '/root'): Generator<NodeVisit> {
  yield { node: root, path: basePath, parent: null, index: -1 }
  yield* walkChildren(root, basePath)
}

function* walkChildren(parent: WbNode, parentPath: string): Generator<NodeVisit> {
  const children = parent.children ?? []
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index]!
    const path = `${parentPath}/children/${index}`
    yield { node, path, parent, index }
    yield* walkChildren(node, path)
  }
}

export function findNode(root: WbNode, id: string): WbNode | undefined {
  for (const visit of walkNodes(root)) {
    if (visit.node.id === id) return visit.node
  }
  return undefined
}

export function findNodePath(root: WbNode, id: string): string | undefined {
  for (const visit of walkNodes(root)) {
    if (visit.node.id === id) return visit.path
  }
  return undefined
}

export function collectNodeIds(root: WbNode): string[] {
  return [...walkNodes(root)].map((visit) => visit.node.id)
}

/**
 * 트리 전체에 새 id를 발급한다. 가져오기·모듈 넣기 · 붙여넣기에서 쓴다.
 * 트리 안을 가리키던 상호작용 target도 함께 바꾸고, 트리 밖 참조(`page:...`)는 그대로 둔다.
 *
 * ---
 *
 * **돌려받은 트리는 `WbNode`가 선언한 키에 대해 입력과 값을 공유하지 않는다.**
 *
 * 그것이 계약이다. `{ ...node }`로 노드만 새로 만들면 `props`와 상호작용 액션의 `value`가
 * **입력과 같은 객체**로 남는다 — 그러면 결과 문서를 고칠 때 원본이 함께 바뀐다. 입력이
 * 오래 사는 객체일 때(화면이 쥔 모듈 목록, 초안 스토어) 그 공유가 프로세스 수명
 * 내내 남는다. *"무관한 테스트가 순서에 따라 깨진다"*로 나타난다.
 *
 * **선언되지 않은 키는 참조로 남는다.** `{ ...node }`가 그것을 그대로 옮기기 때문이다.
 * 그 키들은 봉투(`WbNodeSchema`가 strictObject다)가 저장 경계에서 거부하므로 문서에
 * 실릴 수 없고, **여기서 조용히 버리면 그 거부가 사라져** 사용자가 적은 것이 소리 없이
 * 없어진다. 그래서 계약의 범위를 선언된 키로 못박는다.
 */
export function remapNodeIds(root: WbNode, generate: () => string = createNodeId): { root: WbNode; mapping: Map<string, string> } {
  // 일반 객체를 쓰면 id가 `__proto__`인 노드에서 프로토타입을 읽어 오므로 Map을 쓴다.
  const mapping = new Map<string, string>()
  for (const id of collectNodeIds(root)) {
    mapping.set(id, generate())
  }
  return { root: rewrite(root, mapping), mapping }
}

function rewrite(node: WbNode, mapping: Map<string, string>): WbNode {
  const next: WbNode = { ...node, id: mapping.get(node.id) ?? node.id }

  // `props`는 봉투가 내용을 정하지 않는 임의 JSON이다 — 얕게 옮기면 입력과 같은 객체가 된다.
  if (node.props !== undefined) next.props = cloneJsonValue(node.props)
  // 보임의 `states` 도 배열이라 얕게 두면 입력과 같은 배열이 된다.
  if (node.visibility !== undefined) next.visibility = { mode: node.visibility.mode, states: [...node.visibility.states] }

  if (node.interactions) {
    next.interactions = node.interactions.map((interaction) => ({
      ...interaction,
      actions: interaction.actions.map((action) => {
        const mapped = 'target' in action ? mapping.get(action.target) : undefined
        const copied = mapped ? { ...action, target: mapped } : { ...action }
        // **`setProp.value`도 임의 JSON이다** — `props`와 같은 이유로 깊이 복사한다.
        // `'value' in`으로 보는 것은 값이 `undefined`인 키와 없는 키를 가르기 위해서다.
        if ('value' in copied) copied.value = cloneJsonValue(copied.value)
        return copied
      }),
    }))
  }

  if (node.children) {
    next.children = node.children.map((child) => rewrite(child, mapping))
  }

  return next
}

/**
 * 노드에서 `marker`(코멘트 번호)를 버린 사본 — 모듈 저장(`module/save.ts`) · 붙여넣기 · 복제 · 상태 가지 복사가 쓴다.
 *
 * **노드를 페이지 밖으로 나르는 자리가 이 함수를 지나야 한다.** 번호를 든 채 나르면 그것을 가리키는 코멘트 행이 없다 — 코멘트는
 * `page_id`·`node_id`로 매달려 있으므로, 번호만 따라가면 **아무 데도 닿지 않는 번호**가 된다.
 *
 * **`marker`만 지운다.** `interactions`는 남긴다 — 트리 안을 가리키는 `target`은
 * `remapNodeIds`가 함께 바꾼다. 묶음 밖을 가리키는 것을 거르는 것은 부르는 쪽이다(모듈 저장은 `moduleNodesForSave`, 붙여넣기는
 * `prepareNodesForPaste`).
 *
 * **깊은 복사를 겸한다.** 저장 경계가 받은 값을 그대로 들고 있으면 부르는 쪽이 나중에
 * 그 트리를 만졌을 때 저장된 것이 함께 바뀐다. 임의 JSON을 복사하는 규칙은 `./clone.ts` 하나가
 * 갖는다(`structuredClone`을 왜 안 쓰는지도 거기 있다).
 *
 * **`WbNode`가 아닌 키는 옮기지 않는다.** `remapNodeIds`가 `{ ...node }`로 그것을 남기는
 * 것과 갈리는 자리다 — 이쪽은 **저장할 값을 만드는 함수**라 선언되지 않은 키를 담으면
 * 봉투가 거부할 값을 DB에 넣게 된다.
 */
export function stripMarkers(nodes: readonly WbNode[]): WbNode[] {
  return nodes.map((node) => copyNode(node))
}

function copyNode(node: WbNode): WbNode {
  const next: WbNode = { id: node.id, type: node.type }
  if (node.alias !== undefined) next.alias = node.alias
  if (node.props !== undefined) next.props = cloneJsonValue(node.props)
  if (node.variant !== undefined) next.variant = node.variant
  if (node.weight !== undefined) next.weight = node.weight
  // 보임은 옮긴다 — 붙여넣기 · 복제가 이 복사를 지난다. 걷는 것은 모듈 저장(`module/save.ts`)의 몫이다.
  if (node.visibility !== undefined) next.visibility = { mode: node.visibility.mode, states: [...node.visibility.states] }
  if (node.interactions !== undefined) {
    next.interactions = node.interactions.map((interaction) => ({
      on: interaction.on,
      actions: interaction.actions.map((action) => {
        const copied = { ...action }
        // `props`와 같은 이유로 깊이 복사한다(`../clone.ts`) — 얕게 두면 `value`의 객체를 저장된 것과 공유한다.
        if ('value' in copied) copied.value = cloneJsonValue(copied.value)
        return copied
      }),
    }))
  }
  if (node.children !== undefined) {
    next.children = node.children.map((child) => copyNode(child))
  }
  return next
}
