/**
 * **노드가 든 그림** — 자리표시자의 `image`(그림 id — 그 바이트의 sha256). 그림은 해시를 안다고 읽을 수 없어(정본 「그림」 — 소유 행이 가른다) 노드를
 * 다른 프로젝트 · 개인 몫으로 옮기는 자리(붙이기 · 모듈 저장 · 넣기 · 복사)가 그 id 를 모아 가져오고(`claim`), 못 가져온 것을 비운다. 번들이 실을
 * 그림을 모으는 것도 같은 함수다. 검증 전 값에서 던지지 않는다(`childLists`).
 */
import { ASSET_ID_PATTERN } from './component/catalog/document'
import type { WbNode } from './node'
import { childLists, mapChildLists } from './zones'

function imageOf(node: unknown): string | null {
  if (node === null || typeof node !== 'object') return null
  const shaped = node as { type?: unknown; props?: { image?: unknown } | null }
  const image = shaped.props?.image
  return shaped.type === 'Placeholder' && typeof image === 'string' && ASSET_ID_PATTERN.test(image) ? image : null
}

/** 노드들(과 그 자손)이 든 그림 id — 문서 차례 · 겹침 없이. */
export function imageIdsIn(nodes: readonly unknown[]): string[] {
  const out = new Set<string>()
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const image = imageOf(node)
    if (image !== null) out.add(image)
    for (const { list } of childLists(node)) for (const child of list) visit(child)
  }
  for (const node of nodes) visit(node)
  return [...out]
}

/** `ids` 의 그림을 비운 사본(`image` 키를 걷는다)과 비운 노드 수. 걷을 것이 없는 노드는 그대로 둔다. */
export function clearImages(nodes: readonly WbNode[], ids: ReadonlySet<string>): { nodes: WbNode[]; cleared: number } {
  let cleared = 0
  const copy = (node: WbNode): WbNode => {
    const image = imageOf(node)
    let next: WbNode = node
    if (image !== null && ids.has(image)) {
      const { image: _dropped, ...props } = node.props as Record<string, unknown>
      next = { ...node, props }
      cleared += 1
    }
    // 자식 줄(몸통 · 구역)은 `mapChildLists` 가 걷는다 — 바뀐 것이 없으면 같은 객체다.
    return mapChildLists(next, copy)
  }
  return { nodes: nodes.map(copy), cleared }
}
