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
import { getComponent, type PageDocument, type WbNode } from '@wirebound/schema'
import { nodeType } from '../panels/node-shape'
// **schema의 `walkNodes`를 쓰지 않는다** — `children` 배열 안의 `null` 원소에서 던진다
// (`./safe-walk.ts` 머리말에 실측). 이 파일의 계약이 "던지지 않는다"이므로 순회부터 갈았다.
import { isNodeLike, walkSafely, type SafeVisit } from './safe-walk'

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
 * 노드를 옮기는 편집도, 무관한 노드를 지우는 편집도 마찬가지다. **이슈를 0으로 만드는
 * 것은 그 노드를 문서에서 없애는 편집이다** — 그 노드를 직접 지우는 것뿐 아니라
 * **조상을 지우는 것도 0이 된다**(리뷰가 더 잰 것을 나도 재현했다). 어느 쪽이든 삭제가
 * 그 페이지를 다시 편집 가능하게 만드는 길이므로 자리로만 판정한다.
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

  // **이 `Array.isArray`를 지워도 지금은 0 사망이다**(리뷰 실측). 갈리는 것은
  // `children`이 **배열 유사 객체**(`{length:2,"0":…}`)일 때뿐인데, 그런 문서가 스토어에
  // 실리는 경로는 리뷰도 나도 재지 못했다. 지우지 않는 것은 `siblings.length`가 그대로
  // 판정에 쓰이기 때문이다 — 문자열이면 글자 수가 형제 수가 된다. **이월로 둔다.**
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

  // 위와 같은 이월이다 — 지워도 0 사망이고, 갈리는 입력의 도달 경로가 재지지 않았다.
  const siblings = Array.isArray(visit.parent.children) ? visit.parent.children : []

  return { parentId, index: visit.index, siblingCount: siblings.length }
}

/**
 * 문서에서 노드 하나의 방문 정보를 찾는다. 못 찾으면 `null`.
 *
 * **던지지 않는 책임은 `walkSafely`가 진다.** 처음에는 여기서 루트만 보는 가드를 들었는데,
 * 리뷰가 그것으로 덮이지 않는 입력을 찾았다 — **`children` 배열 안의 원소 자체가 노드가
 * 아닌 경우**다. 내가 처음 잰 여섯은 "노드의 필드가 깨진" 모양만 덮고 있었다.
 *
 * **소비자 쪽에서 건너뛰는 것으로는 닫히지 않는다는 것도 쟀다** — 그 이유와 실측은
 * `./safe-walk.ts` 머리말에 있다.
 *
 * 루트가 노드가 아닌 문서(`remove /root`가 만드는 것)도 `walkSafely`가 값으로 다룬다.
 * **그런 문서가 스토어에 실리는 경로는 재지 못했다** — 서버는 봉투를 검증하고
 * `removeNodeOps`가 `remove /root`를 막지만, 그 둘이 모든 경로를 덮는지는 재지 않았다.
 *
 * **`document`가 `undefined`면 여기가 아니라 호출자에서 던진다**(`document.root`를 읽는
 * 순간이다). 타입이 `PageDocument | null`이고 문서를 주는 유일한 관문
 * (`useOpenDocument`)이 `?? null`로 끝나므로 **지금 그 값이 오는 경로가 없다** — 리뷰가
 * 확인했고 나도 소스로 확인했다. 그래서 막지 않는다.
 */
function findVisit(document: PageDocument, nodeId: string): SafeVisit | null {
  for (const visit of walkSafely(document.root)) {
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
 *
 * **`unknown`을 받는 것은 앞 형제 때문이다.** 들여쓰기 판정은 형제 배열에서 원소를
 * 직접 꺼내는데, `walkSafely`가 걸러 주는 것은 **순회에 나오는 노드**이지 그 배열의
 * 다른 자리가 아니다. 그 자리가 `null`이면 `nodeType`이 던진다(실측 — 순회만 고쳤을 때
 * `Cannot read properties of null (reading 'type')`이 여기서 났다).
 */
function acceptsChildren(node: unknown): boolean {
  if (!isNodeLike(node)) return false

  const type = nodeType(node)
  if (type === null) return false
  if (getComponent(type)?.children !== 'many') return false

  return node.children === undefined || Array.isArray(node.children)
}
