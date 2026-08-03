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
 * 트리 전체에 새 id를 발급한다. 가져오기·프리셋 적용·패턴 삽입에서 쓴다.
 * 트리 안을 가리키던 상호작용 target도 함께 바꾸고, 트리 밖 참조(`page:...`)는 그대로 둔다.
 */
export function remapNodeIds(
  root: WbNode,
  generate: () => string = createNodeId,
): { root: WbNode; mapping: Record<string, string> } {
  const mapping: Record<string, string> = {}
  for (const id of collectNodeIds(root)) {
    mapping[id] = generate()
  }
  return { root: rewrite(root, mapping), mapping }
}

function rewrite(node: WbNode, mapping: Record<string, string>): WbNode {
  const next: WbNode = { ...node, id: mapping[node.id] ?? node.id }

  if (node.interactions) {
    next.interactions = node.interactions.map((interaction) => ({
      ...interaction,
      actions: interaction.actions.map((action) =>
        'target' in action && mapping[action.target]
          ? { ...action, target: mapping[action.target]! }
          : { ...action },
      ),
    }))
  }

  if (node.children) {
    next.children = node.children.map((child) => rewrite(child, mapping))
  }

  return next
}
