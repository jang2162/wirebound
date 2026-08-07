/**
 * 검증 **전** 문서를 견디는 트리 순회. `@wirebound/schema`의 `walkNodes`와 같은 일을
 * 하되, `children` 배열 안에 노드가 아닌 원소가 있어도 던지지 않는다.
 *
 * **왜 필요한가 — `walkNodes`가 던지는 자리가 있다(실측).** 그쪽은 `children`의 원소를
 * 그대로 `yield`하고 **그 직후 그 원소의 `children`을 읽는다.** 원소가 `null`이나
 * `undefined`면 거기서 `Cannot read properties of null (reading 'children')`으로 던진다.
 *
 * **오류 메시지는 소비 방식에 따라 갈린다 — 그것도 쟀다.** 위 값은 순회를 **끝까지**
 * 돌 때(`[...walkNodes(root)]`) 나온다. 소비자가 방문마다 `.id`를 읽는 형태면
 * `reading 'id'`가 먼저 난다. 리뷰가 `structure-actions.ts`의 옛 주석에서 이 둘이
 * 뒤바뀐 것을 잡았다 — **같은 입력이라도 무엇을 먼저 읽느냐로 메시지가 달라진다.**
 *
 * **소비자 쪽에서 건너뛰는 것으로는 닫히지 않는다.** `for (const v of walkNodes(root))`에
 * `if (v.node === null) continue`를 넣은 판을 재 봤는데 **같은 예외가 그대로 난다** —
 * 던지는 시점은 제너레이터가 다음 값을 만들 때이고, 그것이 소비자의 `continue`보다 앞이다.
 * 그래서 순회 자체를 갈아야 한다.
 *
 * **왜 `walkNodes`를 고치지 않는가.** 그쪽 계약은 검증을 통과한 `WbNode`를 받는 것이고
 * 소비자가 여럿이다(`validatePage`·`collectNodeIds`·렌더러). 검증 전 문서를 견디는 책임은
 * 이미 `apps/web` 쪽에 있다 — `panels/node-shape.ts`가 같은 근거로 자기 가드를 든다.
 *
 * **건너뛴 원소도 자리는 센다.** `index`와 `path`는 실제 배열 인덱스다 — 당기면 그 값으로
 * 만든 op이 다른 노드를 가리킨다.
 *
 * **이런 문서가 스토어에 실리는 경로는 재지 못했다.** 서버는 봉투를 검증하므로
 * (`WbNodeSchema`가 `children` 원소를 본다) 정상 경로로는 오지 않는다. 그래도 막는 것은
 * 여기서 던지면 셸 전체가 흰 화면이기 때문이다 — 구조 트리·속성 패널은 오류 경계 밖이다.
 */
import type { WbNode } from '@wirebound/schema'

export interface SafeVisit {
  node: WbNode
  /** 문서 루트(`{ version, root }`) 기준 JSON Pointer */
  path: string
  parent: WbNode | null
  /** 부모의 children 안에서의 인덱스. 루트는 -1 */
  index: number
}

/**
 * 깊이 우선 전위 순회. `walkNodes`와 같은 순서이고 같은 경로를 낸다 — 다른 것은
 * **노드가 아닌 것을 내지도, 그 안으로 내려가지도 않는다**는 점뿐이다.
 *
 * `root`를 `unknown`으로 받는 것은 문서의 `root`가 노드가 아닐 수도 있어서다
 * (`remove /root`가 만든 문서가 그렇다 — `edit/ops.ts`의 실측).
 */
export function* walkSafely(root: unknown, basePath = '/root'): Generator<SafeVisit> {
  if (!isNodeLike(root)) return

  yield { node: root, path: basePath, parent: null, index: -1 }
  yield* walkChildren(root, basePath)
}

function* walkChildren(parent: WbNode, parentPath: string): Generator<SafeVisit> {
  const children = parent.children
  if (!Array.isArray(children)) return

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index]
    // 자리는 그대로 세고 이 원소만 건너뛴다. 인덱스를 당기면 경로가 어긋난다.
    if (!isNodeLike(node)) continue

    const path = `${parentPath}/children/${index}`
    yield { node, path, parent, index }
    yield* walkChildren(node, path)
  }
}

/** 노드로 다룰 수 있는 값인가. 배열을 거르는 것은 그것이 노드일 수 없기 때문이다. */
export function isNodeLike(value: unknown): value is WbNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 문서에서 id로 노드를 찾는다. `findNode`의 안전판. */
export function findNodeSafely(root: unknown, id: string): WbNode | undefined {
  for (const visit of walkSafely(root)) {
    if (visit.node.id === id) return visit.node
  }
  return undefined
}

/** 문서에서 id로 노드의 경로를 찾는다. `findNodePath`의 안전판. */
export function findNodePathSafely(root: unknown, id: string): string | undefined {
  for (const visit of walkSafely(root)) {
    if (visit.node.id === id) return visit.path
  }
  return undefined
}
