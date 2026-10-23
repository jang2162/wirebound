/**
 * **끄는 동안만 서는 빈 구역 칸**(설계 spec `2026-10-23-node-slots-design.md` Q2 (가)). 빈 이름 붙은 구역은 DOM 에 없다 — `<Zone>` 이 감싸는 요소째
 * 안 그린다(`packages/theme-sdk/src/zone.tsx`). 그래서 캔버스에서 그 자리에 놓을 길이 없다. 끄는 동안 끄는 것을 받을 수 있는 빈 구역마다 점선 칸
 * (구역 이름)을 렌더러의 `emptyZones`(`packages/renderer/src/render.tsx`)로 그 구역 자리에 넣고, 놓거나 그만두면 걷는다. 끌지 않을 때의 캔버스는
 * 내보낸 화면과 같다.
 *
 * | 무엇 | 칸이 서나 |
 * |---|---|
 * | 이름 붙은 구역(몸통 아님)이 **스토어 문서에서** 비었다 | 선다 — 몸통의 빈 자리는 노드 «안» 띠가 갖는다(`canvas-drop.ts`) |
 * | 끄는 것의 맨 위 타입이 그 구역에 설 수 없다(받는 타입 · 설 자리 — `fitRefusal`) | 안 선다 |
 * | 옮기는 노드의 서브트리 안 구역 | 안 선다 — 자기 안으로는 못 옮긴다 |
 * | 숨은 노드(상태 · 접힌 검색폼 · 지금 탭이 아닌 패널)의 구역 | 칸을 넣어도 뷰가 안 그린다 — 안 보인다 |
 *
 * **칸은 스토어 문서로 정한다 — 미리보기를 끼운 사본이 아니다.** 미리보기가 그 구역에 서면 사본에서는 구역이 비지 않지만 칸은 남는다(미리보기 뒤).
 * 판정은 미리보기를 숨긴 배치로 재므로(`drag/use-placement.ts` 머리말 «판정은 미리보기를 뺀 배치로») 칸이 남아야 미리보기가 서기 전과 같은 배치다 — 칸이
 * 사라지면 포인터 밑이 바뀌어 미리보기가 걷히고 다시 서는 떨림이 난다.
 *
 * **칸은 노드가 아니다** — `data-wb-id` 가 없고 판정은 칸의 표지(`EMPTY_ZONE_ATTR` · `EMPTY_ZONE_OF_ATTR`)로 찾는다(`canvas-drop.ts` 의 `canvasHitAt`). 렌더러의
 * 노드 속성 계약(`data-wb-*` 여섯)을 넓히지 않는다 — 칸은 에디터가 렌더러에 넘긴 그림이다. 모양은 인라인 style 이다(캔버스 문서에는 셸 CSS 가 없다 —
 * `canvas-preview.ts` 머리말 «반투명은 그린 뒤 인라인 스타일로»).
 */
import type { ReactElement } from 'react'
import { BODY_ZONE, zoneDefs, zoneList, type PageDocument, type WbNode } from '@wirebound/schema'
import { walkSafely } from '../edit/safe-walk'
import { fitRefusal, type Placing } from '../edit/structure-drop'

/** 칸의 구역 이름 표지. */
export const EMPTY_ZONE_ATTR = 'data-wb-empty-zone'
/** 칸이 든 노드(구역의 부모) id 표지. */
export const EMPTY_ZONE_OF_ATTR = 'data-wb-empty-zone-of'

/** 렌더러에 넘기는 빈 구역 칸 — `key` 는 노드 캐시의 열쇠에 든다(같은 끌기 동안 같다). */
export interface EmptyZones {
  key: string
  render: (nodeId: string, zone: string) => ReactElement | null
}

/** 끄는 것의 열쇠 — 칸 집합이 끄는 것(타입 · 옮기는 노드)에 따라 갈린다. */
function placingKey(placing: Placing): string {
  if (placing.kind === 'new') return `new:${placing.type}`
  if (placing.kind === 'module') return `module:${placing.key}`
  return `node:${placing.id}`
}

/**
 * 스토어 문서와 끄는 것으로 칸을 정한다(머리말의 표). 설 칸이 없으면 `null` — 렌더러에 아무것도 안 넘긴다(캐시 열쇠도 그대로다).
 */
export function emptyZonesFor(document: PageDocument, placing: Placing): EmptyZones | null {
  const types: unknown[] = placing.kind === 'new' ? [placing.type] : placing.kind === 'module' ? placing.nodes.map((node) => node.type) : []
  let movedSubtree: Set<string> | null = null
  if (placing.kind === 'node') {
    movedSubtree = new Set()
    for (const visit of walkSafely(document.root)) {
      if (visit.node.id === placing.id) {
        types.push(visit.node.type)
        for (const inner of walkSafely(visit.node)) movedSubtree.add(inner.node.id)
        break
      }
    }
    if (types.length === 0) return null
  }
  const slots = new Map<string, string>()
  for (const visit of walkSafely(document.root)) {
    const node: WbNode = visit.node
    if (typeof node.id !== 'string' || node.id === '' || movedSubtree?.has(node.id) === true) continue
    for (const def of zoneDefs(node.type)) {
      if (def.name === BODY_ZONE || zoneList(node, def.name).length > 0) continue
      if (types.some((type) => fitRefusal(node.type, def.name, type) !== null)) continue
      slots.set(`${node.id}\n${def.name}`, def.label)
    }
  }
  if (slots.size === 0) return null
  return {
    key: `${placingKey(placing)}\n${[...slots.keys()].sort().join('\n')}`,
    render: (nodeId, zone) => {
      const label = slots.get(`${nodeId}\n${zone}`)
      return label === undefined ? null : <EmptyZoneSlot nodeId={nodeId} zone={zone} label={label} />
    },
  }
}

/** 점선 칸 한 개 — 구역 이름을 든다. 줄 안(단추줄)에도 블록 안에도 서게 `inline-flex` 다. */
function EmptyZoneSlot(props: { nodeId: string; zone: string; label: string }): ReactElement {
  return (
    <span
      {...{ [EMPTY_ZONE_ATTR]: props.zone, [EMPTY_ZONE_OF_ATTR]: props.nodeId }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        minWidth: 64,
        minHeight: 24,
        padding: '2px 8px',
        border: '1px dashed #8a94a6',
        borderRadius: 4,
        background: 'rgba(47, 111, 237, 0.06)',
        color: '#5b6475',
        font: '11px/16px system-ui, sans-serif',
        whiteSpace: 'nowrap',
      }}
    >
      {props.label}
    </span>
  )
}
