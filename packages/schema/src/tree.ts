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
 * 트리 전체에 새 id를 발급한다. 가져오기·프리셋 적용에서 쓴다(패턴 전개는 **안 쓴다** —
 * `PatternNode`에 옛 id도 `interactions`도 없어 리매핑할 대상 자체가 없다. P7-1 이월 §5).
 * 트리 안을 가리키던 상호작용 target도 함께 바꾸고, 트리 밖 참조(`page:...`)는 그대로 둔다.
 *
 * ---
 *
 * **돌려받은 트리는 `WbNode`가 선언한 키에 대해 입력과 값을 공유하지 않는다.**
 *
 * 그것이 계약이고, **P7-2 리뷰가 반쪽이던 것을 잡아 여기까지 왔다.** 앞 판은
 * `{ ...node }`로 노드만 새로 만들어 `props`와 상호작용 액션의 `value`가 **입력과 같은
 * 객체**였다 — 그러면 결과 문서를 고칠 때 원본이 함께 바뀐다. 입력이 오래 사는 객체일 때
 * (내장 프리셋 같은 모듈 상수, 초안 스토어) 그 공유가 프로세스 수명 내내 남는다.
 * P7-1 리뷰가 `expandPattern`에서 실증한 것과 같은 부류이고, 그 이월이 *"무관한 테스트가
 * 순서에 따라 깨진다"*로 나타난다고 적었다.
 *
 * **선언되지 않은 키는 참조로 남는다.** `{ ...node }`가 그것을 그대로 옮기기 때문이다.
 * 그 키들은 봉투(`WbNodeSchema`가 strictObject다)가 저장 경계에서 거부하므로 문서에
 * 실릴 수 없고, **여기서 조용히 버리면 그 거부가 사라져** 사용자가 적은 것이 소리 없이
 * 없어진다. 그래서 계약의 범위를 선언된 키로 못박는다.
 */
export function remapNodeIds(
  root: WbNode,
  generate: () => string = createNodeId,
): { root: WbNode; mapping: Map<string, string> } {
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
