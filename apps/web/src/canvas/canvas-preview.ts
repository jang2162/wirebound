/**
 * **배치 미리보기** — 끄는 동안 놓을 자리가 서 있으면 캔버스 문서의 그 자리에 그 컴포넌트를 테마로 그려 반투명으로 끼운다(정본
 * `docs/superpowers/specs/2026-08-03-wirebound-design.md` 「설계서 화면 구조」 «끄는 동안 — 배치 미리보기»). 옆 노드가 실제로 밀린다.
 *
 * **스토어 문서는 안 바뀐다** — 캔버스가 스토어 문서 대신 이 사본(`previewDocument`)을 그릴 뿐이다. 서버 · 되돌리기 · 방송 · 구조 트리 ·
 * 속성 패널은 미리보기를 모른다. 사본은 렌더마다 지금 스토어 문서와 지금 보인 자리로 다시 지으므로 남의 편집이 오면 새 문서 위에 다시
 * 선다(옛 문서의 사본이 남지 않는다).
 *
 * | 끄는 것 | 사본 |
 * |---|---|
 * | 새 타입(목록 카드) | 보인 자리에 `{ id, type }` 노드 하나 — 넣을 때와 같은 꼴(`edit/create-node.ts`) |
 * | 노드(손잡이) | 그 노드 서브트리의 사본을 보인 자리에 — 원본은 제자리에 두고 화면에서 흐리게 한다(`applyPreviewLook`) |
 * | 모듈(«모듈» 탭 카드) | 묶음의 노드들(카드의 표본 — `edit/structure-drop.ts` 의 `Placing`)의 사본을 보인 자리에 차례로 |
 *
 * ## 미리보기 노드는 id 머리로 가른다
 *
 * 렌더러는 노드 루트에 `data-wb-id` 를 단다 — 선택 외곽선 · 번호 마커 · 손잡이 · 캔버스 판정(`./canvas-drop.ts`) · 누름이 모두 그 값으로
 * 노드를 찾는다. 사본이 원본 id 를 그대로 쓰면 그 조회가 둘을 잡는다. 그래서 미리보기 노드의 id 는 `PREVIEW_ID_PREFIX` 로 시작한다 —
 * **문서 id 의 꼴(`NODE_ID_PATTERN` — 영숫자 · `_` · `-`) 밖의 글자(`:`)라** 유효 문서의 id 와 겹칠 수 없다. 렌더러의 속성 계약
 * (`data-wb-*` 여섯 — `packages/renderer/src/render.tsx` 의 `handlersFor` 머리말 «일곱째 데이터 속성»)을 넓히지 않고 가르는 길이다.
 *
 * ## 반투명은 그린 뒤 인라인 스타일로 — 셸 CSS 를 문서에 넣지 않는다
 *
 * 캔버스 문서에는 셸 CSS 를 넣지 않는다(셸 겹이 문서 옆에 그린다 — `shell.css` 머리말). 미리보기는 문서 안의 노드라 옆에 그릴 수 없어,
 * 그린 뒤 미리보기 루트 · 옮기는 원본의 요소에 `opacity` 를 인라인으로 얹고 미리보기가 걷히면 원래 값으로 되돌린다(`applyPreviewLook`).
 * 노드 바깥에 상자를 하나 두르면 부모 뷰의 배치(그리드 칸 · 가로 무리)가 그 상자를 자식으로 읽어 모양이 달라진다.
 */
import {
  BODY_ZONE,
  childLists,
  getComponent,
  mapChildLists,
  zoneList,
  zonePointer,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { walkSafely } from '../edit/safe-walk'
import { dropZoneOf, type Placing, type StructureDrop } from '../edit/structure-drop'
import '../catalog-setup'

/** 미리보기 노드 id 의 머리 — 머리말 «미리보기 노드는 id 머리로 가른다». */
export const PREVIEW_ID_PREFIX = 'wb:preview:'

/** 미리보기 흐림 — 끼운 사본 · 옮기는 원본. */
const PREVIEW_OPACITY = '0.55'
const MOVING_OPACITY = '0.3'

export function isPreviewId(id: string): boolean {
  return id.startsWith(PREVIEW_ID_PREFIX)
}

/** 미리보기 한 판 — 무엇을 · 어느 자리에(판정이 준 자리 그대로 — `edit/structure-drop.ts` 의 `StructureDrop`). */
export interface PlacementPreview {
  placing: Placing
  target: StructureDrop
  /** 판정이 읽은 부모의 배치 축 — 캔버스 표면이 `data-wb-preview-axis` 로 비춘다(`./canvas.tsx`). 없으면 세로. */
  axis?: 'x' | 'y'
}

/** 노드 서브트리를 미리보기 id 로 베낀다(몸통 · 구역 전부). */
function previewCopy(node: WbNode): WbNode {
  return prefixedCopy(node, PREVIEW_ID_PREFIX)
}

/** `id` 노드와 그 부모 · 구역 · 차례. 없으면 `null`. 노드가 아닌 것은 건너뛴다(검증 전 문서 — `walkSafely`). */
function locate(root: WbNode, id: string): { node: WbNode; parent: WbNode | null; zone: string; index: number } | null {
  for (const visit of walkSafely(root)) {
    if (visit.node.id === id) return { node: visit.node, parent: visit.parent, zone: visit.zone ?? BODY_ZONE, index: visit.index }
  }
  return null
}

/** 모듈 묶음의 `index` 째 노드 사본의 id 머리 — 묶음 안 노드 id 는 문서 노드와 겹칠 수 있어(같은 페이지에서 저장한 모듈) 차례를 함께 싣는다. */
function modulePrefix(index: number): string {
  return `${PREVIEW_ID_PREFIX}m${index}:`
}

/** 노드 서브트리를 미리보기 id 로 베낀다 — 머리를 준다. 몸통 · 구역 전부를 베낀다(구역을 빼면 미리보기 동안 그 안 노드가 사라진다). */
function prefixedCopy(node: WbNode, prefix: string): WbNode {
  return { ...mapChildLists(node, (child) => prefixedCopy(child, prefix)), id: `${prefix}${node.id}` }
}

/** 노드의 한 줄(`pointer` — `/children` · `/zones/<이름>`)을 `list` 로 바꾼 사본. */
function withList(node: WbNode, pointer: string, list: unknown[]): WbNode {
  if (pointer === '/children') return { ...node, children: list as WbNode[] }
  const name = pointer.slice('/zones/'.length)
  const zones = node.zones !== null && typeof node.zones === 'object' && !Array.isArray(node.zones) ? node.zones : {}
  return { ...node, zones: { ...zones, [name]: list as WbNode[] } }
}

/** `parentId` 의 그 구역 `index` 자리에 `inserted` 를 차례로 끼운 사본 — 지나는 길의 노드만 새 객체다. */
function withInserted(node: WbNode, parentId: string, zone: string, index: number, inserted: readonly WbNode[]): WbNode | null {
  if (node.id === parentId) {
    const list = zoneList(node, zone)
    const at = Math.max(0, Math.min(index, list.length))
    return withList(node, zonePointer(zone), [...list.slice(0, at), ...inserted, ...list.slice(at)])
  }
  for (const { pointer, list } of childLists(node)) {
    for (let i = 0; i < list.length; i += 1) {
      const child = list[i]
      if (typeof child !== 'object' || child === null) continue
      const next = withInserted(child as WbNode, parentId, zone, index, inserted)
      if (next !== null) return withList(node, pointer, [...list.slice(0, i), next, ...list.slice(i + 1)])
    }
  }
  return null
}

/**
 * 스토어 문서에 미리보기를 끼운 사본(머리말의 표). 못 끼우면(부모 · 옮길 노드가 문서에 없음 · 카탈로그에 없는 타입) `null` — 부르는 쪽은
 * 스토어 문서를 그대로 그린다.
 *
 * 옮기기의 `target.index` 는 «옮긴 뒤 그 부모 안 차례»다(`edit/structure-drop.ts` 머리말) — 원본이 남은 이 사본에서는 같은 부모 · 같은
 * 구역의 원본 뒤쪽 차례면 하나 민다.
 */
export function previewDocument(document: PageDocument, preview: PlacementPreview): PageDocument | null {
  const root = document.root as WbNode | undefined
  if (root === undefined || root === null) return null
  const { placing, target } = preview
  let inserted: WbNode[]
  let index = target.index
  if (placing.kind === 'new') {
    if (getComponent(placing.type) === undefined) return null
    inserted = [{ id: `${PREVIEW_ID_PREFIX}0`, type: placing.type }]
  } else if (placing.kind === 'module') {
    if (placing.nodes.length === 0) return null
    inserted = placing.nodes.map((node, at) => prefixedCopy(node, modulePrefix(at)))
  } else {
    const moving = locate(root, placing.id)
    if (moving === null || moving.parent === null) return null
    if (moving.parent.id === target.parentId && moving.zone === dropZoneOf(target) && moving.index <= index) index += 1
    inserted = [previewCopy(moving.node)]
  }
  const next = withInserted(root, target.parentId, dropZoneOf(target), index, inserted)
  return next === null ? null : { ...document, root: next }
}

/** 노드 요소 — `data-wb-id` 가 그 값인 첫 요소(`querySelector` 로 id 를 셀렉터에 넣지 않는다 — 문서 id 는 임의의 글자다). */
function elementOf(doc: Document, id: string): HTMLElement | null {
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-wb-id]'))) {
    if (element.getAttribute('data-wb-id') === id) return element
  }
  return null
}

/**
 * 그린 미리보기에 모양을 얹는다 — 끼운 사본의 루트를 반투명으로, 옮기는 원본을 더 흐리게(머리말 «반투명은 그린 뒤 인라인 스타일로»).
 * 돌려준 함수가 얹은 값을 원래 값으로 되돌린다.
 *
 * ## 안 보이는 자리에 선 미리보기는 부모를 테두리로 보인다
 *
 * 테마가 자식 일부를 숨기면(활성 탭 밖의 패널 · 접힌 묶음) 그 자리에 끼운 미리보기도 숨어 상자가 0 × 0 이다 — 끄는 사람은 아무것도 안 보는 채 놓는다(실브라우저:
 * 활성 패널만 보이는 `Tabs` 의 첫 패널 «뒤» 가 `rect 0x0`). 그때는 미리보기가 들어갈 **부모**에 `accent` 테두리를 둘러 «이 안으로 들어간다» 를 보인다 —
 * 캔버스 위의 자리는 미리보기가 대신하므로(`drag/drop-indicator.tsx`) 안 숨는 자리에는 필요 없고, 숨은 자리에만 선다. 테두리는 안쪽으로 그려(`outline-offset`)
 * 문서의 배치를 안 민다. 미리보기가 걷히면 원래 값으로 돌아온다.
 */
export function applyPreviewLook(doc: Document, preview: PlacementPreview, accent: string): () => void {
  const touched: { element: HTMLElement; opacity: string }[] = []
  const dim = (element: HTMLElement | null, opacity: string): void => {
    if (element === null) return
    touched.push({ element, opacity: element.style.opacity })
    element.style.opacity = opacity
  }
  const { placing } = preview
  const insertedIds =
    placing.kind === 'new'
      ? [`${PREVIEW_ID_PREFIX}0`]
      : placing.kind === 'module'
        ? placing.nodes.map((node, at) => `${modulePrefix(at)}${node.id}`)
        : [`${PREVIEW_ID_PREFIX}${placing.id}`]
  const roots = insertedIds.map((id) => elementOf(doc, id))
  for (const root of roots) dim(root, PREVIEW_OPACITY)
  const inserted = roots[0] ?? null
  if (preview.placing.kind === 'node') dim(elementOf(doc, preview.placing.id), MOVING_OPACITY)

  let outlined: { element: HTMLElement; outline: string; offset: string } | null = null
  if (inserted !== null) {
    const box = inserted.getBoundingClientRect()
    const parent = box.width === 0 && box.height === 0 ? elementOf(doc, preview.target.parentId) : null
    if (parent !== null) {
      outlined = { element: parent, outline: parent.style.outline, offset: parent.style.outlineOffset }
      parent.style.outline = `2px solid ${accent}`
      parent.style.outlineOffset = '-2px'
    }
  }
  return () => {
    for (const { element, opacity } of touched) element.style.opacity = opacity
    if (outlined !== null) {
      outlined.element.style.outline = outlined.outline
      outlined.element.style.outlineOffset = outlined.offset
    }
  }
}

/**
 * 미리보기를 숨긴 채 `run` 을 부른다 — 판정이 미리보기를 뺀 배치로 잰다(`drag/use-placement.ts` 머리말 «판정은 미리보기를 뺀 배치로»).
 * 숨김(`display: none`)과 되돌림은 한 동기 구간 안이라 그 사이에 그려지는 판이 없다. 옮기는 원본은 숨기지 않는다 — 그것은 문서의 노드다.
 */
export function withoutPreview<T>(doc: Document | undefined, run: () => T): T {
  // 문서가 없으면(창을 흉내 낸 숙주 — 판정을 주입하는 jsdom 판) 숨길 것도 없다.
  if (doc === undefined || doc === null) return run()
  const hidden: { element: HTMLElement; display: string }[] = []
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-wb-id]'))) {
    if (!isPreviewId(element.getAttribute('data-wb-id') ?? '')) continue
    if (hidden.some((entry) => entry.element.contains(element))) continue
    hidden.push({ element, display: element.style.display })
    element.style.display = 'none'
  }
  try {
    return run()
  } finally {
    for (const { element, display } of hidden) element.style.display = display
  }
}
