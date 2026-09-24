/**
 * 구조 조작을 **하기 전에** 할 수 있는지 판정하는 곳. 화면은 이 결과로 버튼을
 * 비활성한다 — 보내 봐야 422를 받을 편집은 만들지 않는다(`edit/ops.ts`가 `null`로
 * 요청을 막는 것과 같은 정신).
 *
 * **순수 함수이고 React·DOM을 모른다.** 판정이 컴포넌트 안에 흩어지면 케이스가 화면을
 * 지나야만 재지고, 툴바와 키보드 단축키가 각자 자기 조건을 갖게 된다.
 *
 * **던지지 않는 것이 이 파일의 계약이다.** 여기는 렌더 중에 불리고 구조 트리에는 오류
 * 경계가 없다 — 에디터 셸 안의 경계는 캔버스의 `CanvasBoundary` 하나뿐이라,
 * 던지면 `.wb-shell`이 통째로 DOM에서 사라진다(`panels/node-shape.ts` 머리말의 실측).
 * 그래서 검증 전 문서에 들어올 수 있는 모양을 값으로 다룬다.
 */
import { getComponent, type NodeLock, type PageDocument, type WbNode } from '@wirebound/schema'
import { nodeType } from '../panels/node-shape'
// **schema의 `walkNodes`를 쓰지 않는다** — `children` 배열 안의 `null` 원소에서 던진다
// (`./safe-walk.ts` 머리말에 실측). 이 파일의 계약이 "던지지 않는다"이므로 순회부터 `walkSafely`를 쓴다.
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
 * *"카탈로그에 없는 타입·모양이 깨진 노드는 전부 불가"*로 판정하면 **사용자가 그 노드를
 * 치울 수단이 없어진다.** 실측: 카탈로그에
 * 없는 타입의 노드가 하나라도 있으면 `validatePage`가 `unknown-type`을 내고 편집
 * 파이프라인 6단계가 모든 편집을 `invalid`로 거절한다 — 다른 노드의 prop 편집도, 그
 * 노드를 옮기는 편집도, 무관한 노드를 지우는 편집도 마찬가지다. **이슈를 0으로 만드는
 * 것은 그 노드를 문서에서 없애는 편집이다** — 그 노드를 직접 지우는 것뿐 아니라
 * **조상을 지우는 것도 0이 된다**(실측). 어느 쪽이든 삭제가
 * 그 페이지를 다시 편집 가능하게 만드는 길이므로 자리로만 판정한다.
 *
 * # 남이 잠근 자리는 전부 `false`다 (설계서 「소프트 잠금」)
 *
 * **셋째 인자는 판정이 아니라 «판정의 결과»다.** 스토어의 `lockedBy`가
 * `@wirebound/schema`의 `findLockConflict`로 낸 값을 그대로 받는다 — 서버의 2차 방어가
 * 부르는 바로 그 함수다. 여기서 잠금을 **다시** 판정하면 화면에 판정이 두 벌이 되고,
 * 한쪽만 고쳐지면 둘이 조용히 갈린다(`test/lock/one-verdict.test.ts`가 `findLockConflict`를 부르는
 * 자리를 소스에서 센다 — `apps/web`에서 그것은 스토어 하나여야 한다).
 *
 * ## 왜 «전부»인가 — 서버는 그중 일부를 통과시킨다
 *
 * 진짜 `findLockConflict`를 서버 대역으로 놓고 잰 값이다. 문서는
 * `root > [a, box > [b1, b2], c]`이고 표의 «잠금»은 남의 것이다.
 *
 * | 고른 것 | 잠금 | 도구 | 나가는 포인터 | 서버 |
 * |---|---|---|---|---|
 * | 루트 | `b1` | `안에 추가` | `/root/children/3` | **통과** |
 * | `box` | `b1` | `안에 추가` | `/root/children/1/children/2` | **통과** |
 * | `box` | `b1` | `아래 추가` | `/root/children/2` | **통과** |
 * | `box` | `b1` | `삭제`·`위로`·`아래로` | `/root/children/1` | 423 |
 * | `box` | `box` | `안에 추가` | `/root/children/1/children/2` | 423 |
 * | `box` | `box` | `아래 추가` | `/root/children/2` | **통과** |
 *
 * 즉 **형제 자리를 건드리는 편집은 서버가 받는다** — `findLockConflict`는 편집이 실제로
 * 건드리는 자리만 보기 때문이다. 그런데도 전부 끄는 근거 둘:
 *
 * 1. **선택이 편집보다 엄격한 것은 대가로 받아들인 것이다**(`packages/schema/test/lock.test.ts`
 *    의 `선택이 편집보다 엄격하다` — *"남이 섹션 하나를 잡고 있는 동안 아무도 페이지 루트를
 *    못 고친다는 뜻이다. 이것은 구멍이 아니라 대가다"*). 도구를 켜 두면 이 자리가 그 대가를
 *    **피해 가는 구멍**이 된다: `setLocks`는 선택을 건드리지 않으므로 잠금이 도착하기 **전에**
 *    골라 둔 노드가 그대로 남고, 그 노드는 지금 다시 고를 수 없는데 도구는 살아 있게 된다.
 *    **무엇을 할 수 있는지가 «어떻게 그 자리에 도착했는지»에 달리면 안 된다** — 지금 그
 *    노드를 누르면 `selectNode`가 거부하는데, 앞서 눌러 둔 사람만 편집할 수 있게 된다.
 * 2. **끈 것 중 절반은 그냥 두면 423을 받는다.** 위 표의 423 줄들이 그것이고, 그때 화면은
 *    낙관적 적용을 붙였다가 재조회로 되돌리고 큐를 통째로 버린다 —
 *    *"보내 봐야 422를 받을 편집은 만들지 않는다"*(이 파일 머리말)가 막으려던 바로 그 모양이다.
 *
 * **막다른 길이 되지는 않는다.** 잠긴 서브트리 밖의 노드는 그대로 고를 수 있고, 거기서
 * `아래 추가`로 형제를 만들면 위 표의 «통과» 줄과 같은 편집이 나간다. 선택을 요구하지 않는
 * `패턴 넣기`·`프리셋`도 그대로다(그 둘은 판정 자체가 없다 — `panels/structure-toolbar.tsx`).
 *
 * ## 되돌리기는 여기와 다른 갈래를 골랐다 — 규칙이 다른 것이 아니라 단위가 다르다
 *
 * `store/editor-store.ts`의 `#startFrom`은 **서버가 423을 낼 것만** 막는다. 반대 규칙이
 * 아니라 **같은 규칙(«그 조작의 단위에 맞춘다»)을 다른 단위에 적용**한 것이다: 여기서는
 * 단위가 «고른 노드»라 서버(«편집이 건드리는 포인터»)보다 엄격할 수밖에 없어 그 대가를
 * 받아들였고, 되돌리기에는 **선택이 없어** 단위가 곧 `inverse` ops다 — 서버가 재는 그
 * 입력을 그대로 넣을 수 있으므로 엄격해질 이유가 없다. 그쪽 표에 실측이 있다.
 *
 * **기본값이 `null`인 것은 부르는 자리가 둘이기 때문이다.** 도구모음(`useStructureCommands`)은
 * 잠금을 **반드시** 넘기고(그쪽의 `selectedLock`이 필수 인자다), `edit/pattern-insert.ts`는
 * 넘기지 않는다 — 거기서 `addInside`를 묻는 것은 권한이 아니라 **자리 계산**이고(*"이 노드가
 * 자식을 받나"*), 패턴은 애초에 판정을 지나지 않는 조작이다. **잠금이 패턴에도 걸려야
 * 하는지는 이 함수가 답할 물음이 아니다** — 그 조작에는 끌 `ability`가 없다.
 */
export function structureAbilities(
  document: PageDocument | null,
  nodeId: string | null,
  lock: NodeLock | null = null,
): StructureAbilities {
  if (document === null || nodeId === null) return NOTHING
  // **남이 잠근 자리에서는 전부 `false`다**(위 머리말의 마지막 절). 잠금을 **판정하지
  // 않고** 판정의 결과를 받는 것이 요점이다 — 그 판정은 스토어의 `lockedBy` 하나가 한다.
  if (lock !== null) return NOTHING

  const visit = findVisit(document, nodeId)
  if (visit === null) return NOTHING

  const { node, parent, index } = visit
  const addInside = acceptsChildren(node)

  // 루트다. 지울 수도 옮길 수도 없고(문서가 통째로 깨진다 — `removeNodeOps`의 실측),
  // 형제가 없으니 순서·계층 이동도 갈 곳이 없다.
  if (parent === null) return { ...NOTHING, addInside }

  // **이 `Array.isArray`를 지워도 죽는 케이스가 없다**(실측). 갈리는 것은
  // `children`이 **배열 유사 객체**(`{length:2,"0":…}`)일 때뿐인데, 그런 문서가 스토어에
  // 실리는 경로는 재지 못했다. 지우지 않는 것은 `siblings.length`가 그대로
  // 판정에 쓰이기 때문이다 — 문자열이면 글자 수가 형제 수가 된다. **그 입력을 재는 케이스는
  // 없다** — 도달 경로가 확인되면 케이스를 세운다.
  const siblings = Array.isArray(parent.children) ? parent.children : []
  const previous = index > 0 ? siblings[index - 1] : undefined

  return {
    addInside,
    addAfter: true,
    remove: true,
    moveUp: index > 0,
    moveDown: index < siblings.length - 1,
    // **앞 형제가 있고 그 형제가 자식을 담을 수 있을 때만이다**(들여쓰기의 핵심 제약).
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

  // 위와 같은 자리다 — 지워도 죽는 케이스가 없고, 갈리는 입력의 도달 경로가 재지지 않았다.
  const siblings = Array.isArray(visit.parent.children) ? visit.parent.children : []

  return { parentId, index: visit.index, siblingCount: siblings.length }
}

/**
 * 문서에서 노드 하나의 방문 정보를 찾는다. 못 찾으면 `null`.
 *
 * **던지지 않는 책임은 `walkSafely`가 진다.** 여기서 루트만 보는 가드로는 덮이지 않는
 * 입력이 있다 — **`children` 배열 안의 원소 자체가 노드가 아닌 경우**다. "노드의 필드가
 * 깨진" 모양만 보는 가드는 그것을 놓친다.
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
 * (`useOpenDocument`)이 `?? null`로 끝나므로 **지금 그 값이 오는 경로가 없다**(소스로
 * 확인). 그래서 막지 않는다.
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
 * 다른 자리가 아니다. 그 자리가 `null`이면 `nodeType`이 던진다(실측 — 순회만 `walkSafely`로 두고
 * 여기서 `isNodeLike`를 빼면 `Cannot read properties of null (reading 'type')`이 여기서 난다).
 */
function acceptsChildren(node: unknown): boolean {
  if (!isNodeLike(node)) return false

  const type = nodeType(node)
  if (type === null) return false
  if (getComponent(type)?.children !== 'many') return false

  return node.children === undefined || Array.isArray(node.children)
}
