/**
 * 검증 **전** 문서를 견디는 트리 순회. `@wirebound/schema`의 `walkNodes`와 같은 일을
 * 하되, 자식 줄 안에 노드가 아닌 원소가 있어도 그것을 내지 않는다.
 *
 * **왜 필요한가.** `walkNodes`는 검증을 통과한 `WbNode`를 받는 계약이라 줄 안의 원소를 그대로 `yield`한다 — 원소가
 * `null`이면 방문마다 `.id`를 읽는 소비자가 `Cannot read properties of null (reading 'id')`로 던진다. 소비자가 그 방문을
 * 건너뛰게 하면 소비자마다 같은 가드가 는다. 그래서 순회 자체를 갈랐다. 검증 전 문서를 견디는 책임은 `apps/web` 쪽에
 * 있다 — `panels/node-shape.ts`가 같은 근거로 자기 가드를 든다.
 *
 * **자식 줄은 몸통과 구역 전부다**(`childLists` — 카탈로그의 구역 선언 차례). 구역을 빼면 그 안 노드가 잠금 판정 · 선택 · 구조
 * 트리에서 사라진다.
 *
 * **건너뛴 원소도 자리는 센다.** `index`와 `path`는 실제 배열 인덱스다 — 당기면 그 값으로
 * 만든 op이 다른 노드를 가리킨다.
 *
 * **이런 문서가 스토어에 실리는 경로는 재지 못했다.** 서버는 봉투를 검증하므로
 * (`WbNodeSchema`가 줄의 원소를 본다) 정상 경로로는 오지 않는다. 그래도 막는 것은
 * 여기서 던지면 셸 전체가 흰 화면이기 때문이다 — 구조 트리·속성 패널은 오류 경계 밖이다.
 */
import { childLists, type WbNode } from '@wirebound/schema'

export interface SafeVisit {
  node: WbNode
  /** 문서 루트(`{ version, root }`) 기준 JSON Pointer */
  path: string
  parent: WbNode | null
  /** 부모 안에서 선 구역(`body` · 구역 이름). 루트는 `null` */
  zone: string | null
  /** 그 구역 배열 안에서의 인덱스. 루트는 -1 */
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

  yield { node: root, path: basePath, parent: null, zone: null, index: -1 }
  yield* walkChildren(root, basePath)
}

function* walkChildren(parent: WbNode, parentPath: string): Generator<SafeVisit> {
  for (const { zone, pointer, list } of childLists(parent as unknown)) {
    for (let index = 0; index < list.length; index += 1) {
      const node = list[index]
      // 자리는 그대로 세고 이 원소만 건너뛴다. 인덱스를 당기면 경로가 어긋난다.
      if (!isNodeLike(node)) continue

      const path = `${parentPath}${pointer}/${index}`
      yield { node, path, parent, zone, index }
      yield* walkChildren(node, path)
    }
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
