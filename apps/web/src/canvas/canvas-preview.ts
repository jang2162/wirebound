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
import { getComponent, type PageDocument, type WbNode } from '@wirebound/schema'
import type { Placing, StructureDrop } from '../edit/structure-drop'
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

/** 노드 서브트리를 미리보기 id 로 베낀다. */
function previewCopy(node: WbNode): WbNode {
  const copy: WbNode = { ...node, id: `${PREVIEW_ID_PREFIX}${node.id}` }
  if (Array.isArray(node.children)) copy.children = node.children.map((child) => previewCopy(child as WbNode))
  return copy
}

/** `id` 노드와 그 부모 · 차례. 없으면 `null`. 노드가 아닌 것은 건너뛴다(검증 전 문서). */
function locate(root: WbNode, id: string): { node: WbNode; parent: WbNode | null; index: number } | null {
  const stack: { node: WbNode; parent: WbNode | null; index: number }[] = [{ node: root, parent: null, index: -1 }]
  while (stack.length > 0) {
    const visit = stack.pop()!
    if (visit.node.id === id) return visit
    const children = visit.node.children
    if (!Array.isArray(children)) continue
    children.forEach((child, index) => {
      if (typeof child === 'object' && child !== null) stack.push({ node: child as WbNode, parent: visit.node, index })
    })
  }
  return null
}

/** `parentId` 의 자식 `index` 자리에 `inserted` 를 끼운 사본 — 지나는 길의 노드만 새 객체다. */
function withInserted(node: WbNode, parentId: string, index: number, inserted: WbNode): WbNode | null {
  const children = Array.isArray(node.children) ? node.children : []
  if (node.id === parentId) {
    const at = Math.max(0, Math.min(index, children.length))
    return { ...node, children: [...children.slice(0, at), inserted, ...children.slice(at)] }
  }
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    if (typeof child !== 'object' || child === null) continue
    const next = withInserted(child as WbNode, parentId, index, inserted)
    if (next !== null) return { ...node, children: [...children.slice(0, i), next, ...children.slice(i + 1)] }
  }
  return null
}

/**
 * 스토어 문서에 미리보기를 끼운 사본(머리말의 표). 못 끼우면(부모 · 옮길 노드가 문서에 없음 · 카탈로그에 없는 타입) `null` — 부르는 쪽은
 * 스토어 문서를 그대로 그린다.
 *
 * 옮기기의 `target.index` 는 «옮긴 뒤 그 부모 안 차례»다(`edit/structure-drop.ts` 머리말) — 원본이 남은 이 사본에서는 같은 부모의
 * 원본 뒤쪽 차례면 하나 민다.
 */
export function previewDocument(document: PageDocument, preview: PlacementPreview): PageDocument | null {
  const root = document.root as WbNode | undefined
  if (root === undefined || root === null) return null
  const { placing, target } = preview
  let inserted: WbNode
  let index = target.index
  if (placing.kind === 'new') {
    if (getComponent(placing.type) === undefined) return null
    inserted = { id: `${PREVIEW_ID_PREFIX}0`, type: placing.type }
  } else {
    const moving = locate(root, placing.id)
    if (moving === null || moving.parent === null) return null
    if (moving.parent.id === target.parentId && moving.index <= index) index += 1
    inserted = previewCopy(moving.node)
  }
  const next = withInserted(root, target.parentId, index, inserted)
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
 */
export function applyPreviewLook(doc: Document, preview: PlacementPreview): () => void {
  const touched: { element: HTMLElement; opacity: string }[] = []
  const dim = (element: HTMLElement | null, opacity: string): void => {
    if (element === null) return
    touched.push({ element, opacity: element.style.opacity })
    element.style.opacity = opacity
  }
  const insertedId = preview.placing.kind === 'new' ? `${PREVIEW_ID_PREFIX}0` : `${PREVIEW_ID_PREFIX}${preview.placing.id}`
  dim(elementOf(doc, insertedId), PREVIEW_OPACITY)
  if (preview.placing.kind === 'node') dim(elementOf(doc, preview.placing.id), MOVING_OPACITY)
  return () => {
    for (const { element, opacity } of touched) element.style.opacity = opacity
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

