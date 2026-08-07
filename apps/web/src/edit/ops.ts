/**
 * 편집을 `PatchOp`로 옮기는 곳. **순수 함수이고 React·DOM·`fetch`를 모른다** —
 * `store/editor-store.ts`와 같은 이유로, 화면 없이 단위 테스트할 수 있어야 한다.
 *
 * 두 갈래가 산다 — prop 편집(`propOps`)과 구조 편집(`insertNodeOps`·`removeNodeOps`·
 * `moveNodeOps`). **파이프라인은 하나다:** 어느 쪽이든 만든 `ops`를 `useEditCommit`에
 * 넘기면 낙관적 적용·직렬 전송·실패 수렴·undo가 그대로 따라온다(P2b-2 이월 문서).
 *
 * **여기 있는 함수가 `null`을 내는 것은 전부 같은 뜻이다: 요청을 만들지 마라(D7).**
 * 던지지 않는 것도 같은 이유다 — 이 함수들은 렌더 도중에도 불릴 수 있고, 속성 패널과
 * 구조 트리는 오류 경계 밖이라 던지면 셸 전체가 흰 화면이 된다.
 */
import {
  findNodePath,
  getByPointer,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'

/**
 * 문서 루트 노드의 JSON Pointer. `walkNodes`의 `basePath` 기본값과 같은 값이고,
 * `findNodePath`가 루트에 대해 내는 경로가 이것이다 — 둘이 갈리면 아래 루트 판정이
 * 조용히 통과한다.
 */
const ROOT_PATH = '/root'

/**
 * 노드의 prop 하나를 바꾸는 op. 문서에서 노드 경로를 찾아 조립한다.
 * 그 노드가 문서에 없으면 `null`이다 — **요청을 보내지 않는 신호다**(D7).
 *
 * **갈래가 셋인 것은 `applyOps`가 그렇게 던지기 때문이다.** 소스(`packages/schema/src/
 * patch/apply.ts`)를 읽고 실측해 확정했다:
 *
 * | 노드 상태 | `replace /…/props/<prop>` | 그래서 쓰는 op |
 * |---|---|---|
 * | `props` 자체가 없다 | `resolveSlot`이 `parent`를 `undefined`로 만들어 `경로를 찾을 수 없습니다` | `add /…/props` 값 `{ [prop]: value }` |
 * | `props`는 있고 그 키가 없다 | `replaceAt`의 `Object.hasOwn`에 걸려 `바꿀 키가 없습니다` | `add /…/props/<prop>` |
 * | `props`에 그 키가 있다 | 통과한다 | `replace /…/props/<prop>` |
 *
 * 가운데 줄이 **계획서가 빠뜨린 갈래다.** 계획서는 "`props`가 없으면 통째 `add`, 있으면
 * `replace`" 두 갈래로 적었는데, 그러면 `props`는 있고 그 **키**만 없는 노드에서
 * `applyOps`가 던지고 D7이 요청을 막아 **값이 없던 prop을 처음 켜는 편집이 아예 나가지
 * 못한다.** 통째 `add`로 합치는 것도 답이 아니다 — 그러면 그 노드의 다른 prop이 지워진다.
 *
 * **op을 하나로 유지하는 것은 의도다.** 둘로 나누면 서버가 만들 `inverse`도 둘이 된다.
 * 서버는 `packages/schema`의 `invertOps`를 그대로 쓰므로(`apps/api/src/services/
 * edit-pipeline.ts`) 그 `inverse`를 여기서 재 둘 수 있고, 재 본 값은 각각
 * `remove /…/props` · `remove /…/props/<prop>` · `replace /…/props/<prop>(옛 값)` 하나씩이다
 * (`test/edit/ops.test.ts`의 `서버가 만들 inverse를 여기서 재 둔다`).
 */
export function propOps(
  document: PageDocument,
  nodeId: string,
  prop: string,
  value: unknown,
): PatchOp[] | null {
  const nodePath = findNodePath(document.root, nodeId)
  if (nodePath === undefined) return null

  const propsPath = `${nodePath}/props`
  const props = getByPointer(document, propsPath)

  // `props`가 아예 없으면 통째로 넣는다. `getByPointer`는 없는 키에 `undefined`를 주므로
  // 값이 `undefined`인 키와 구분되지 않지만, 문서 봉투가 그런 키를 허용하지 않는다.
  if (props === undefined) {
    return [{ op: 'add', path: propsPath, value: { [prop]: value } }]
  }

  // `props`가 객체가 아니면 이 문서는 이미 깨져 있다. 서버가 검증한 문서만 실리므로
  // 정상 경로에서는 오지 않지만, 여기서 `Object.hasOwn`을 부르면 던지므로 막아 둔다 —
  // **던지는 대신 `null`이다.** 이 함수의 `null`은 "요청을 보내지 마라"이고, 그것이
  // 깨진 문서에 대해서도 맞는 답이다.
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return null

  return Object.hasOwn(props, prop)
    ? [{ op: 'replace', path: `${propsPath}/${escapeToken(prop)}`, value }]
    : [{ op: 'add', path: `${propsPath}/${escapeToken(prop)}`, value }]
}

/**
 * 새 노드를 부모의 `children` 안 `index` 자리에 넣는 op. 넣을 수 없으면 `null`이다.
 *
 * **`children` 키가 없는 부모에는 배열째 넣는다 — `propOps`의 첫 갈래와 같은 성질이고
 * 실측했다.** `children`이 없는 노드에 `add /…/children/0`을 주면 `applyOps`의
 * `resolveSlot`이 마지막 토큰만 남기고 따라 내려가다 `parent`를 `undefined`로 만들어
 * `경로를 찾을 수 없습니다`로 던진다(실측). 그러면 D7이 요청을 막아 **빈 컨테이너에
 * 첫 자식을 넣는 편집이 아예 나가지 못한다.** 그 배열째 `add`의 `inverse`는
 * `[remove /…/children]` 하나다(실측) — undo가 키까지 지워 원본과 완전히 같아진다.
 *
 * `null`을 내는 자리 넷:
 *
 * | 조건 | 왜 |
 * |---|---|
 * | 부모가 문서에 없다 | 보낼 경로가 없다 |
 * | `children`이 없는데 `index`가 0이 아니다 | 배열을 통째로 놓는 것이라 "1번 자리"가 없다 |
 * | `index`가 `0…children.length` 밖이다 | `applyOps`가 `배열 인덱스가 범위를 벗어납니다`로 던진다(실측) |
 * | `children`이 배열도 `undefined`도 아니다 | 아래 참조 |
 *
 * 마지막 줄은 **깨진 문서를 조용히 덮지 않기 위해서다.** 실측: `children`이 문자열인
 * 노드에 배열째 `add`를 주면 던지지 않고 그 문자열을 배열로 갈아 끼운다(`addAt`이
 * 객체 부모에서는 키 할당이라서다). `propOps`가 `props`에 대해 내린 것과 같은 판단이다.
 */
export function insertNodeOps(
  document: PageDocument,
  parentId: string,
  index: number,
  node: WbNode,
): PatchOp[] | null {
  const parentPath = findNodePath(document.root, parentId)
  if (parentPath === undefined) return null

  const childrenPath = `${parentPath}/children`
  const children = getByPointer(document, childrenPath)

  if (children === undefined) {
    return index === 0 ? [{ op: 'add', path: childrenPath, value: [node] }] : null
  }
  if (!Array.isArray(children)) return null
  if (!Number.isInteger(index) || index < 0 || index > children.length) return null

  return [{ op: 'add', path: `${childrenPath}/${index}`, value: node }]
}

/**
 * 노드와 그 서브트리를 지우는 op. 루트이거나 문서에 없으면 `null`이다.
 *
 * **루트를 거르는 것은 `applyOps`가 막아 주지 않기 때문이다 — 실측했다.**
 * `remove /root`는 던지지 않고 문서에서 `root` 키를 지워 `{ version: 1 }`을 만든다
 * (`removeAt`의 객체 분기가 `Object.hasOwn`을 통과한다). 그러면 낙관적 적용이
 * **성공해** 큐에 들어가고, 화면은 루트 없는 문서를 그리게 된다. 서버는 봉투 검증에서
 * 거절하겠지만 그때는 이미 사용자가 빈 화면을 보고 난 뒤다.
 *
 * 서브트리는 따로 다루지 않는다 — 자식은 그 노드 **안에** 있으므로 노드를 지우면 함께
 * 간다. 그 `inverse`도 서브트리를 통째로 품은 `add` 하나다(실측).
 */
export function removeNodeOps(document: PageDocument, nodeId: string): PatchOp[] | null {
  const path = findNodePath(document.root, nodeId)
  if (path === undefined || path === ROOT_PATH) return null

  return [{ op: 'remove', path }]
}

/**
 * JSON Pointer의 토큰 이스케이프(RFC 6901). prop 이름에 `/`나 `~`가 들어가면 경로가
 * 다른 곳을 가리킨다. 카탈로그의 prop 이름에 그런 글자가 있는지는 **재지 않았다** —
 * 없더라도 이스케이프는 두 글자짜리 규칙이라 여기 두는 편이 싸다.
 */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}
