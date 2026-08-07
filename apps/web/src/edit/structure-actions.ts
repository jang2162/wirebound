/**
 * 구조 조작을 **하기 전에** 할 수 있는지 판정하는 곳(D3). 화면은 이 결과로 버튼을
 * 비활성한다 — 보내 봐야 422를 받을 편집은 만들지 않는다(P2b-2의 D7과 같은 정신).
 *
 * **순수 함수이고 React·DOM을 모른다.** 판정이 컴포넌트 안에 흩어지면 케이스가 화면을
 * 지나야만 재지고, 툴바(Task 5)와 키보드 단축키(Task 8)가 각자 자기 조건을 갖게 된다.
 *
 * **던지지 않는 것이 이 파일의 계약이다.** 여기는 렌더 중에 불리고 구조 트리에는 오류
 * 경계가 없다 — `apps/web/src` 전체에서 경계는 캔버스의 `CanvasBoundary` 하나뿐이라,
 * 던지면 `.wb-shell`이 통째로 DOM에서 사라진다(`panels/node-shape.ts` 머리말의 실측).
 * 그래서 검증 전 문서에 들어올 수 있는 모양을 값으로 다룬다.
 */
import { getComponent, walkNodes, type NodeVisit, type PageDocument, type WbNode } from '@wirebound/schema'
import { nodeType } from '../panels/node-shape'

/** 선택 노드에 지금 할 수 있는 조작. 화면은 이것으로 버튼을 비활성한다. */
export interface StructureAbilities {
  addInside: boolean
  addAfter: boolean
  remove: boolean
  moveUp: boolean
  moveDown: boolean
  indent: boolean
  outdent: boolean
}

/** 선택 노드의 자리. 조작을 실행할 때 부모·인덱스가 필요하다. */
export interface NodeSpot {
  parentId: string
  index: number
  siblingCount: number
}

const NOTHING: StructureAbilities = {
  addInside: false,
  addAfter: false,
  remove: false,
  moveUp: false,
  moveDown: false,
  indent: false,
  outdent: false,
}

/**
 * 고른 노드가 없거나 문서에 없으면 전부 `false`다.
 *
 * **카탈로그를 보는 조작은 둘뿐이다 — `addInside`와 `indent`.** 나머지는 자리만 본다.
 * 계획서 D3은 표 아래에 *"카탈로그에 없는 타입·모양이 깨진 노드는 전부 불가"*라고
 * 적었지만, **그대로 하면 사용자가 그 노드를 치울 수단이 없어진다.** 실측: 카탈로그에
 * 없는 타입의 노드가 하나라도 있으면 `validatePage`가 `unknown-type`을 내고 편집
 * 파이프라인 6단계가 모든 편집을 `invalid`로 거절한다 — 다른 노드의 prop 편집도, 그
 * 노드를 옮기는 편집도 마찬가지고, **그 노드를 지우는 편집만 이슈가 0이 된다.** 삭제가
 * 그 페이지를 다시 편집 가능하게 만드는 유일한 길이므로 자리로만 판정한다.
 * (계획서의 케이스 표도 이쪽과 맞는다 — 케이스 12가 `안에 추가`만 지목한다.)
 */
export function structureAbilities(
  document: PageDocument | null,
  nodeId: string | null,
): StructureAbilities {
  if (document === null || nodeId === null) return NOTHING

  const visit = findVisit(document, nodeId)
  if (visit === null) return NOTHING

  const { node, parent, index } = visit
  const addInside = acceptsChildren(node)

  // 루트다. 지울 수도 옮길 수도 없고(문서가 통째로 깨진다 — `removeNodeOps`의 실측),
  // 형제가 없으니 순서·계층 이동도 갈 곳이 없다.
  if (parent === null) return { ...NOTHING, addInside }

  const siblings = Array.isArray(parent.children) ? parent.children : []
  const previous = index > 0 ? siblings[index - 1] : undefined

  return {
    addInside,
    addAfter: true,
    remove: true,
    moveUp: index > 0,
    moveDown: index < siblings.length - 1,
    // **앞 형제가 있고 그 형제가 자식을 담을 수 있을 때만이다**(D3의 핵심 제약).
    // 들여쓰기는 노드를 앞 형제 **안으로** 넣는 것이라 그 형제의 카탈로그를 본다.
    indent: previous !== undefined && acceptsChildren(previous),
    // 부모가 루트면 나갈 곳이 문서 밖이다. 부모의 부모가 있는지는 방문 정보에 없으므로
    // 루트 노드와 같은 것인지로 본다 — id 비교가 아니라 **참조 비교**인 것은 id가
    // 중복된 문서(검증 전에는 가능하다)에서도 갈리지 않기 위해서다.
    outdent: parent !== document.root,
  }
}

/**
 * 루트이거나 문서에 없으면 `null`.
 *
 * `parentId`가 문자열이 아니면 `null`인 것은, 이 값이 그대로 `moveNodeOps`·
 * `insertNodeOps`의 검색 키(`findNodePath`)가 되기 때문이다 — 문자열이 아니면 그 조회가
 * 아무것도 찾지 못하고, 호출자는 `NodeSpot.parentId: string`을 믿고 있다.
 */
export function nodeSpot(document: PageDocument, nodeId: string): NodeSpot | null {
  const visit = findVisit(document, nodeId)
  if (visit === null || visit.parent === null) return null

  const parentId = visit.parent.id
  if (typeof parentId !== 'string') return null

  const siblings = Array.isArray(visit.parent.children) ? visit.parent.children : []

  return { parentId, index: visit.index, siblingCount: siblings.length }
}

/**
 * 문서에서 노드 하나의 방문 정보를 찾는다. 못 찾으면 `null`.
 *
 * **`walkNodes`를 감싸는 것은 루트가 노드가 아닌 문서 때문이다.** `walkNodes`는 루트를
 * 먼저 낸 뒤 그 `children`을 읽으므로, 루트가 `null`이나 `undefined`면
 * `Cannot read properties of null (reading 'children')`으로 던진다(실측). 다른 깨진
 * 모양(`type`이 객체, `children`이 문자열·수·객체)은 던지지 않는 것도 함께 쟀다.
 *
 * **그런 문서가 스토어에 실리는 경로는 재지 못했다.** 서버는 봉투를 검증하고
 * `removeNodeOps`가 `remove /root`를 막지만, 그 둘이 모든 경로를 덮는지는 재지 않았다.
 * 던지면 셸이 통째로 사라지는 자리라 방어가 검사보다 싸다.
 */
function findVisit(document: PageDocument, nodeId: string): NodeVisit | null {
  const root: unknown = document.root
  if (root === null || typeof root !== 'object') return null

  for (const visit of walkNodes(root as WbNode)) {
    if (visit.node.id === nodeId) return visit
  }
  return null
}

/**
 * 이 노드 **안에** 다른 노드를 넣을 수 있는가.
 *
 * 카탈로그가 `many`여도 문서의 `children`이 배열이 아니면 넣을 수 없다 —
 * `insertNodeOps`가 그 경우를 `null`로 막으므로(깨진 문서를 조용히 덮지 않는다),
 * 여기서 열어 두면 눌러도 아무 일이 없는 버튼이 된다. `children`이 **없는** 것은
 * 다르다: `insertNodeOps`가 배열째 만들어 넣는다.
 */
function acceptsChildren(node: WbNode): boolean {
  const type = nodeType(node)
  if (type === null) return false
  if (getComponent(type)?.children !== 'many') return false

  return node.children === undefined || Array.isArray(node.children)
}
