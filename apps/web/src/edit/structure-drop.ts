/**
 * **놓을 자리 판정** — 끄는 것(옮길 노드 · 넣을 새 타입)을 포인터 밑 노드의 어느 띠에 놓으면 어디로 가는가(spec
 * `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「놓을 자리 판정」). 구조 트리 줄 · 캔버스 손잡이 · 컴포넌트 목록 카드가
 * 끌기 장치(`drag/use-pointer-drag.ts`)의 `onOver`에서 같은 이 함수를 부른다 — 트리 줄은 `panels/structure-tree.tsx`, 나머지는 경로 층
 * `drag/use-placement.ts`를 지난다. 놓으면 같은 자리로 `dropOps`가 편집을 짓는다.
 *
 * **순수 함수이고 던지지 않는다** — `./structure-actions.ts`와 같은 층 · 같은 계약이다(순회가 `walkSafely`를 지난다).
 *
 * | 포인터 밑 | 띠 | 결과 |
 * |---|---|---|
 * | 자식을 받는 컴포넌트(카탈로그가 몸통을 선언 · `acceptsChildren`) | 안 | 그 노드의 몸통 마지막 자식 |
 * | 자식을 안 받는 컴포넌트 | 안 | `null` |
 * | 부모가 자식을 안 받는 노드(검증 전 문서) | 앞 · 뒤 | `null` — 형제 자리는 그 부모 «안» 이다 |
 * | 뿌리 아닌 노드 | 앞 · 뒤 | 그 노드의 형제(그 앞 · 뒤) — 그 노드가 선 구역 안이다(구역 안 노드면 그 구역) |
 * | 뿌리 | 앞 · 뒤 | `null` — 뿌리는 형제가 없다 |
 * | 그 구역이 받지 않는 타입(탭 몸통의 `TabPanel` 밖) · 설 자리 밖의 타입(탭 몸통 밖의 `TabPanel`) | 어느 띠든 | `null` — 놓으면 검증이 거절한다 |
 * | 끄는 노드 자신 · 그 자손 | 어느 띠든 | `null` |
 * | 끄는 노드가 뿌리 | — | `null` — 뿌리는 옮기지 않는다 |
 *
 * **«안»이 묻는 것은 대상이다** — 새 타입이 무엇이든 대상이 자식을 받는지만 본다. 카탈로그에 «이 부모에는 이 타입만» 같은 규칙이 없다.
 *
 * **돌려주는 `index`는 «옮긴 뒤 그 부모 안 차례»다** — `moveNodeOps`가 인덱스를 «값을 뺀 배열» 기준으로 읽기 때문이다(`./ops.ts`의
 * `moveNodeOps` 머리말). 메뉴 트리의 판정(`tree/tree-drop.ts`)과 같은 뜻이라 같은 부모 안에서 뒤로 옮기면 자기 몫을 하나 당긴다. 새
 * 타입은 문서에 아직 없어 당길 몫이 없고 «제자리»도 없다 — 끼울 자리가 곧 `insertNodeOps`의 인덱스다.
 *
 * **남이 잡은 자리면 `null`이다** — 놓았을 때 낼 편집(옮기기는 `moveNodeOps`, 넣기는 `insertNodeOps`)을 지어 그 편집이 부딪치는 잠금을
 * 묻는다(`blockedBy` — 스토어의 `editBlockedBy`). 편집으로 묻는 것이 요점이다: 서버가 2차 방어로 묻는 것이 바로 그 편집이고
 * (`@wirebound/schema`의 `lockConflictOfOps`), 노드 **고르기**의 판정(`lockedBy`)으로 물으면 놓을 부모 아래 아무 노드의 잠금에도
 * 막힌다. 끄는 노드가 잠긴 자리 안에 있으면 뽑는 자리(`move`의 `from`)가 부딪쳐 어디에도 못 놓는다. **물음은 하나다** — `move`의
 * `path`는 `from`을 뺀 **뒤**의 좌표인데, 그 판정이 연산마다 좌표를 맞춰 잠긴 자리를 따라가므로(앞쪽 노드를 뒤쪽 형제의 잠긴 서브트리로
 * 옮기는 판 · 잠긴 노드 **뒤** 형제 앞으로 옮기는 판 둘 다) 옮기기 전 좌표로 다시 물을 일이 없다. 넣기의 물음에 싣는 노드는 판정용
 * 표본(`PROBE_ID`)이다 — 잠금은 경로로 가르므로 id 가 답을 바꾸지 않는다. 놓을 때 보내는 노드는 부르는 쪽이 `createNode`로 짓는다.
 *
 * **제자리면 `null`이다** — 보낼 편집이 없다.
 *
 * **`why` 를 주면 `null` 의 까닭을 한 번 부른다** — 끌기 진단 줄(`drag/drag-debug.ts`)에만 쓰고 답은 안 바꾼다. 꺼진 판은 안 준다.
 */
import {
  BODY_ZONE,
  getComponent,
  placementsOf,
  zoneDefs,
  zoneList,
  type NodeLock,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import type { DropMiss } from '../drag/drag-debug'
import type { DropBand } from '../tree/tree-drop'
import { createNode } from './create-node'
import { insertNodeOps, moveNodeOps } from './ops'
import { walkSafely, type SafeVisit } from './safe-walk'
import { acceptsChildren, acceptsIn } from './structure-actions'

/** 놓을 자리. `placement`는 표시가 설 띠다. `zone` 은 부모의 그 구역이다 — 몸통이면 키가 없다. */
export interface StructureDrop {
  parentId: string
  zone?: string
  index: number
  placement: DropBand
}

/** 자리의 구역 — 키가 없으면 몸통. */
export function dropZoneOf(drop: StructureDrop): string {
  return drop.zone ?? BODY_ZONE
}

function drop(parentId: string, zone: string, index: number, placement: DropBand): StructureDrop {
  return zone === BODY_ZONE ? { parentId, index, placement } : { parentId, zone, index, placement }
}

/**
 * 끄는 것 — 옮길 노드(구조 트리 줄 · 캔버스 손잡이) · 넣을 새 타입(컴포넌트 목록 카드 — 프리셋 카드면 `preset` 이 그 키다) · 넣을 모듈 묶음(«모듈» 탭
 * 카드 — `palette/module-tab.tsx`). 프리셋은 받는 타입 · 설 자리 판정에 안 든다 — 판정은 타입이다(`createNode` 머리말).
 *
 * 모듈의 `nodes` 는 **미리보기 · 판정의 표본**이다 — 놓을 때 넣는 노드는 부르는 쪽이 서버에서 다시 읽어 새 id 로 짓는다
 * (`palette/module-tab.tsx` · `palette/module-insert.ts`). `key` 는 카드를 가르는 값이다(`personal:<id>` · `project:<id>`).
 */
export type Placing =
  | { kind: 'node'; id: string }
  | { kind: 'new'; type: string; preset?: string }
  | { kind: 'module'; key: string; nodes: readonly WbNode[] }

/** 넣기 판정에 싣는 노드의 id — 보내지 않는다(머리말 «남이 잡은 자리면»). */
const PROBE_ID = 'drop-probe'

export function structureDropTarget(
  document: PageDocument,
  placing: Placing,
  overId: string,
  band: DropBand,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
  why?: (reason: DropMiss) => void,
): StructureDrop | null {
  const over = findVisit(document, overId)
  if (over === null) return miss(why, 'target-not-in-document')

  let parent: WbNode
  let zone: string
  let insertAt: number
  if (band === 'inside') {
    // 노드의 «안» 은 몸통이다 — 몸통이 없는 노드(구역만 있는 목록)는 «안» 이 없다.
    if (!acceptsChildren(over.node)) return miss(why, 'not-container')
    parent = over.node
    zone = BODY_ZONE
    insertAt = Array.isArray(over.node.children) ? over.node.children.length : 0
  } else {
    if (over.parent === null) return miss(why, 'root-has-no-siblings')
    // 형제 자리는 부모의 그 구역 «안» 이다 — 부모가 그 구역에 자식을 안 받으면(검증 전 문서 · 카탈로그가 바뀐 옛 문서) 못 놓는다.
    zone = over.zone ?? BODY_ZONE
    if (!acceptsIn(over.parent, zone)) return miss(why, 'parent-not-container')
    parent = over.parent
    insertAt = band === 'before' ? over.index : over.index + 1
  }
  return placeIn(document, placing, parent, zone, insertAt, band, blockedBy, why, overId)
}

/**
 * **구역 하나의 끝** — 구조 트리에서 고른 구역 줄(`store/editor-store.ts` 의 `selectedZone`)에 넣을 때 · 끄는 동안 선 빈 구역 칸
 * (`canvas/canvas-drop.ts` 의 `zone` 자리)이나 트리의 구역 줄에 놓을 때의 자리다. 띠는 «안» 이다. 판정은 `structureDropTarget` 의 뒤 절반과 같다
 * — 받는 타입 · 설 자리 · 남의 잠금 · 자기 서브트리 · 제자리.
 */
export function zoneDropTarget(
  document: PageDocument,
  placing: Placing,
  parentId: string,
  zone: string,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
  why?: (reason: DropMiss) => void,
): StructureDrop | null {
  const parent = findVisit(document, parentId)
  if (parent === null) return miss(why, 'target-not-in-document')
  if (!acceptsIn(parent.node, zone)) return miss(why, 'not-container')
  return placeIn(document, placing, parent.node, zone, zoneList(parent.node, zone).length, 'inside', blockedBy, why)
}

/** 부모 · 구역 · 차례가 정해진 뒤의 판정 — 받는 타입 · 설 자리 · 넣기 · 옮기기(머리말의 표 아래 절반). `overId` 는 포인터 밑 노드다(구역 자리면 없다). */
function placeIn(
  document: PageDocument,
  placing: Placing,
  parent: WbNode,
  zone: string,
  insertAt: number,
  band: DropBand,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
  why: ((reason: DropMiss) => void) | undefined,
  overId?: string,
): StructureDrop | null {
  const parentId: unknown = parent.id
  if (typeof parentId !== 'string') return miss(why, 'target-not-in-document')
  // 받는 타입 · 설 자리는 검증(`zone-type-not-allowed` · `misplaced-component`)과 같은 규칙이다 — 여기서 안 거르면 미리보기가 서고 놓아도 편집이 없다.
  if (placedTypes(document, placing).some((type) => fitRefusal(parent.type, zone, type) !== null)) return miss(why, 'not-accepted')

  if (placing.kind === 'new' || placing.kind === 'module') {
    const probe = probeNode(placing)
    if (probe === null) return miss(why, 'unknown-type')
    const ops = insertNodeOps(document, parentId, insertAt, probe, zone)
    if (ops === null) return miss(why, 'ops-unbuildable')
    if (blockedBy(ops) !== null) return miss(why, 'locked')
    return drop(parentId, zone, insertAt, band)
  }

  const draggedId = placing.id
  if (draggedId === overId) return miss(why, 'self')
  const dragged = findVisit(document, draggedId)
  if (dragged === null || dragged.parent === null) return miss(why, 'target-not-in-document')
  if (contains(dragged.node, overId ?? parentId)) return miss(why, 'into-own-subtree')

  // 같은 줄(부모 · 구역)이어야 «제 몫을 하나 당긴다» — 같은 부모의 다른 구역으로 옮기면 뺀 배열이 다르다.
  const sameList = parentId === dragged.parent.id && zone === (dragged.zone ?? BODY_ZONE)
  const index = sameList && dragged.index < insertAt ? insertAt - 1 : insertAt
  if (sameList && index === dragged.index) return miss(why, 'same-place')

  const ops = moveNodeOps(document, draggedId, parentId, index, zone)
  if (ops === null) return miss(why, 'ops-unbuildable')
  if (blockedBy(ops) !== null) return miss(why, 'locked')
  return drop(parentId, zone, index, band)
}

/** 놓는 것의 맨 위 타입들 — 새 타입은 그것, 모듈은 묶음의 맨 위 노드들, 옮기기는 그 노드. 못 읽으면 `undefined`(판정이 지난다). */
function placedTypes(document: PageDocument, placing: Placing): unknown[] {
  if (placing.kind === 'new') return [placing.type]
  if (placing.kind === 'module') return placing.nodes.map((node) => node.type)
  return [findVisit(document, placing.id)?.node.type]
}

/**
 * **못 놓는 까닭 — 받는 타입 · 설 자리**(`fitRefusal` 의 문장). 포인터 밑 노드 · 띠로 판정이 `not-accepted` 를 낸 자리의 문장이다 — 끄는 동안
 * 못 놓는 자리에 이유를 보인다(`drag/drop-refusal.ts`). 그 까닭이 아니면(남의 잠금 · 자기 서브트리 · 자리 없음) `null` — 그 판은 지금처럼 말없이
 * 표시만 안 선다.
 */
export function dropRefusal(document: PageDocument, placing: Placing, overId: string, band: DropBand): string | null {
  const over = findVisit(document, overId)
  if (over === null) return null
  const parent = band === 'inside' ? over.node : over.parent
  if (parent === null) return null
  return refusalIn(document, placing, parent.type, band === 'inside' ? BODY_ZONE : (over.zone ?? BODY_ZONE))
}

/** 구역 자리(`zoneDropTarget`)에서 못 놓는 까닭 — `dropRefusal` 과 같은 문장. */
export function zoneDropRefusal(document: PageDocument, placing: Placing, parentId: string, zone: string): string | null {
  const parent = findVisit(document, parentId)
  return parent === null ? null : refusalIn(document, placing, parent.node.type, zone)
}

function refusalIn(document: PageDocument, placing: Placing, parentType: unknown, zone: string): string | null {
  for (const type of placedTypes(document, placing)) {
    const refusal = fitRefusal(parentType, zone, type)
    if (refusal !== null) return refusal
  }
  return null
}

/**
 * 넣기 판정에 싣는 표본 노드 — 새 타입은 그 타입, 모듈은 첫 노드의 타입(잠금은 경로로 가르므로 무엇을 싣든 답이 같다 — 머리말 «남이 잡은 자리면»).
 * 빈 모듈 · 모르는 타입이면 `null`.
 */
export function probeNode(placing: Exclude<Placing, { kind: 'node' }>, id = PROBE_ID): WbNode | null {
  // 기본 내용(검색폼의 단추 · 탭의 패널)도 짓는다 — 그 노드의 id 는 표본 id 뒤에 차례를 붙인다(겹치지 않게).
  let made = 0
  if (placing.kind === 'new') return createNode(placing.type, () => (made++ === 0 ? id : `${id}-${made - 1}`), placing.preset)
  const first = placing.nodes[0]
  return first === undefined ? null : { id, type: first.type }
}

/**
 * **그 타입의 노드가 그 부모의 그 구역에 설 수 없는 까닭** — 구역의 `accepts` 와 타입의 `placement` 둘 다(검증의 `zone-type-not-allowed` ·
 * `misplaced-component` 와 같은 규칙). 설 수 있으면 `null`. 문장은 카탈로그의 화면 이름으로 짓는다 — 몸통이면 부모 이름만(«탭에는 …»), 이름 붙은
 * 구역이면 부모 이름 + 구역 이름(«카드 바닥에는 …»). 놓기 · 하단 판 넣기 · 붙여넣기 · 모듈 넣기가 같은 문장을 낸다.
 */
export function fitRefusal(parentType: unknown, zone: string, type: unknown): string | null {
  if (typeof type !== 'string') return null
  const accepts = zoneDefs(parentType).find((def) => def.name === zone)?.accepts
  if (accepts !== undefined && !accepts.includes(type)) {
    return `${zonePlace(parentType, zone)}에는 ${accepts.map(componentLabel).join(' · ')}만 놓을 수 있습니다`
  }
  const places = placementsOf(getComponent(type))
  if (places.length > 0 && !places.some((place) => place.type === parentType && place.zone === zone)) {
    const label = componentLabel(type)
    const where = [...new Set(places.map((place) => zonePlace(place.type, place.zone)))].join(' · ')
    return `${label}${topicParticle(label)} ${where} 안에만 놓을 수 있습니다`
  }
  return null
}

/** 부모 타입의 그 구역을 부르는 말 — 몸통이면 부모 이름, 이름 붙은 구역이면 «부모 이름 구역 이름». */
function zonePlace(parentType: unknown, zone: string): string {
  const parent = componentLabel(parentType)
  if (zone === BODY_ZONE) return parent
  const label = zoneDefs(parentType).find((def) => def.name === zone)?.label ?? zone
  return `${parent} ${label}`
}

/** 카탈로그의 화면 이름 — 모르는 타입이면 타입 글자 그대로. */
function componentLabel(type: unknown): string {
  return typeof type === 'string' ? (getComponent(type)?.label ?? type) : String(type)
}

/** 은 · 는 — 마지막 글자가 받침 있는 한글이면 «은», 아니면 «는»(한글이 아닌 글자로 끝나면 받침 없는 쪽). */
function topicParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? '은' : '는'
}

/** `null` 을 내며 그 까닭을 진단 줄에 알린다(`why` 가 없으면 — 꺼진 판 — 알리지 않는다). */
function miss(why: ((reason: DropMiss) => void) | undefined, reason: DropMiss): null {
  why?.(reason)
  return null
}

/**
 * **페이지 끝** — 뿌리의 마지막 자식 자리. 캔버스에서 노드가 없는 바탕에 놓을 때와(`canvas/canvas-drop.ts`의 `pageEnd`) 카드를 고른
 * 것 없이 눌렀을 때의 자리다. 뿌리 «안»과 같은 판정이다 — 뿌리가 잠겼으면 `null`, 뿌리의 마지막 자식을 옮기면 제자리라 `null`.
 */
export function pageEndTarget(
  document: PageDocument,
  placing: Placing,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
  why?: (reason: DropMiss) => void,
): StructureDrop | null {
  const rootId: unknown = document.root?.id
  if (typeof rootId !== 'string') return miss(why, 'no-root')
  return structureDropTarget(document, placing, rootId, 'inside', blockedBy, why)
}

/**
 * **같은 자리인가** — 보인 자리와 다시 물은 자리를 견준다. 끌기 장치의 «놓는 답은 보인 답이다»(`drag/use-pointer-drag.ts` 의 `sameDrop`
 * — 구조 트리 줄 끌기 · 캔버스 손잡이)와 경로 층의 보인 자리 다시 판정(`drag/use-placement.ts` 의 `holds`)이 같은 이 함수다.
 *
 * **부모와 구역만 견준다.** 띠 · 차례는 안 본다 — 놓을 때 부르는 쪽이 지금 문서로 그 자리를 다시 판정하므로(`drag/use-placement.ts` 의 `onDrop`)
 * 차례는 **지금 문서를 따라간다**. 남이 형제를 넣거나 빼 차례가 밀려도 · 넣은 칸이 포인터 밑으로 밀려 와 «안» 이 «그 칸 뒤» 로 바뀌어도(같은
 * 그리드 끝) 같은 부모 안의 자리라 표시도 놓기도 새 자리를 따라가고, 부모가 다르면(포인터 밑에 다른 상자가 온 판 · 보인 노드가 다른 부모로
 * 옮겨진 판) 다른 자리다 — 보인 상자가 아닌 곳으로 놓지 않는다.
 *
 * **대가:** 같은 부모 안에서는 사람이 본 차례와 놓는 차례가 다를 수 있다 — 끄는 사이 남이 그 부모의 형제를 넣거나 빼면 놓는 자리는 «뗀
 * 좌표 밑의 지금 자리»다. 표시는 캔버스가 다시 잴 때(`refresh`) 그 새 자리로 옮겨 가므로(트리 줄은 문서가 바뀔 때 — `panels/structure-tree.tsx`)
 * 포인터가 멈춰 있으면 보인 자리가 곧 놓는 자리다.
 */
export function sameDrop(a: StructureDrop, b: StructureDrop): boolean {
  return a.parentId === b.parentId && dropZoneOf(a) === dropZoneOf(b)
}

/**
 * 판정이 준 자리(`drop`)로 낼 편집. 옮기기는 `moveNodeOps`, 넣기는 `insertNodeOps` 에 부르는 쪽이 지은 `node` 를 싣는다 — 그 id 가
 * 보낸 뒤 고를 노드다. 새 타입인데 노드가 없거나 타입이 다르면 `null`이다(판정한 것과 다른 것을 넣지 않는다). **모듈은 `null`이다** — 그
 * 편집은 넣을 노드를 다시 지은 뒤 `palette/module-insert.ts` 가 짓는다(`Placing` 머리말).
 */
export function dropOps(document: PageDocument, placing: Placing, drop: StructureDrop, node?: WbNode): PatchOp[] | null {
  if (placing.kind === 'node') return moveNodeOps(document, placing.id, drop.parentId, drop.index, dropZoneOf(drop))
  if (placing.kind === 'module') return null
  if (node === undefined || node.type !== placing.type) return null
  return insertNodeOps(document, drop.parentId, drop.index, node, dropZoneOf(drop))
}

function findVisit(document: PageDocument, nodeId: string): SafeVisit | null {
  for (const visit of walkSafely(document.root)) {
    if (visit.node.id === nodeId) return visit
  }
  return null
}

/** `node`의 서브트리(자기 포함)에 `nodeId`가 있나. */
function contains(node: WbNode, nodeId: string): boolean {
  for (const visit of walkSafely(node)) {
    if (visit.node.id === nodeId) return true
  }
  return false
}
