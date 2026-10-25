/**
 * **카드 «넣기» 단추(Enter)로 넣는 자리** — 고른 노드에 따라 새 노드(«컴포넌트» 탭) · 모듈 묶음(«모듈» 탭 — `./module-tab.tsx`)을 어디에 넣는가(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md`
 * 「끌기와 클릭」 · 계획 D6 — 카드 몸통의 누름은 넣지 않고 단추가 이 자리를 쓴다 · `./component-palette.tsx` 머리말 «카드»). 자리의 판정은
 * 끌어 놓기와 같은 함수다(`edit/structure-drop.ts` 의 `structureDropTarget` · `pageEndTarget`) — 단추는 «어느 대상의 어느 띠» 를 고를 뿐이다.
 *
 * | 고른 것 | 대상 · 띠 |
 * |---|---|
 * | 구조 트리의 구역 줄(`selectedZone`) | 그 구역의 끝(`zoneDropTarget`) |
 * | 없음 · 뿌리 | 페이지 끝(`pageEndTarget`) |
 * | 자식을 받는 컴포넌트 | 그 노드 «안»(끝) — 그 몸통이 넣을 것을 안 받으면 «뒤»(아래) |
 * | 잎(자식을 안 받음) | 그 노드 «뒤»(같은 부모) |
 *
 * **«안» 이 거절되면 «뒤»** — 몸통의 받는 타입 · 넣을 것의 설 자리(`fitRefusal`)에 걸리면 그 노드 바로 뒤로 물러선다(설계 spec
 * `docs/superpowers/specs/2026-10-25-grid-design.md` «8»). 열을 고르고 «열» · «열 묶음»(셀 틀이 받지만 열은 그리드 · 열 묶음에만 선다) · 행을 고르고
 * «행»(행 몸통은 칸만 받는다) · 탭을 고르고 글(탭 몸통은 탭 패널만 받는다)이 그 판이다. 몸통이 받는 것(셀 틀에 글)은 그대로 «안» 이다. 물러서는 것은
 * 그 까닭뿐이다 — 잠금 · 문서에 없음으로 «안» 이 막힌 판은 그대로 막힌다. 물러선 «뒤» 도 못 서면 «안» 의 까닭을 그대로 말한다.
 *
 * 고른 잎을 남이 잡았거나 판정이 `null` 이면 넣지 않고 이유 문장을 낸다. **문장은 새로 짓지 않는다** — 같은 판에서 화면이 이미 하는 말을 그대로 쓴다(두 벌이면
 * 한쪽만 고쳐진다):
 *
 * | 판 | 문장 |
 * |---|---|
 * | 고른 잎을 남이 잡음(`lockedBy`) | 구조 트리 줄 행동의 꺼진 항목이 드는 잠금 이유(`panels/toolbar-status.ts` 의 `lockedSelectionStatus`) |
 * | 넣을 부모가 자식을 안 받음(검증 전 문서 — 잎의 부모가 자식을 안 받는 타입) | `addInside` 판정의 설명(`panels/tree-row-actions.tsx` 의 `STRUCTURE_WHY_DISABLED.addInside`) |
 * | 그 구역이 그 타입을 안 받음 · 그 타입의 설 자리가 아님(탭 몸통 · 탭 패널) | 놓기와 같은 이유 문장(`edit/structure-drop.ts` 의 `fitRefusal`) |
 * | 지을 편집이 남의 잠금에 부딪힘(넣을 자리 바로 뒤 형제를 남이 잡음 · 고른 컨테이너 · 뿌리를 남이 잡음) | 속성 패널의 잠금 문장(`panels/property-panel.tsx` 의 `lockedNotice`) |
 * | 그 밖 — 고른 노드가 문서에 없음 | 꺼진 항목의 «문서에 없다» 이유(`NOT_IN_DOCUMENT_STATUS`) |
 *
 * **고른 노드의 잠금은 «그 뒤» 에 넣는 잎에만 먼저 본다.** 판정(서버와 같은 `lockConflictOfOps`)은 잠긴 노드 **뒤**에 넣기를 겹침으로 안
 * 세서 그 판만 따로 막는다. «안 끝» 에 넣는 판(뿌리 · 컨테이너)은 판정에 맡긴다 — `lockedBy` 는 고르기 판정이라 자손의 잠금도 막음으로
 * 세므로(`store/editor-store.ts` 의 `lockedBy`), 앞에 두면 페이지를 연 그대로(뿌리 선택) 남이 아무 노드를 고른 판에서 서버가 받는 페이지 끝
 * 넣기까지 거절한다(`build-test/palette-review.test.ts` «페이지를 연 그대로(뿌리 선택)»).
 *
 * **순수 함수이고 던지지 않는다**(`edit/structure-drop.ts` 와 같은 층).
 */
import { BODY_ZONE, zoneList, type NodeLock, type PageDocument, type PatchOp } from '@wirebound/schema'
import { insertNodeOps } from '../edit/ops'
import { findNodeSafely } from '../edit/safe-walk'
import { acceptsChildren, acceptsIn, nodeSpot } from '../edit/structure-actions'
import {
  pageEndTarget,
  probeNode,
  structureDropTarget,
  zoneDropRefusal,
  zoneDropTarget,
  type Placing,
  type StructureDrop,
} from '../edit/structure-drop'
import type { ZoneRef } from '../store/editor-store'
import { lockedNotice } from '../panels/property-panel'
import { lockedSelectionStatus, NOT_IN_DOCUMENT_STATUS } from '../panels/toolbar-status'
import { STRUCTURE_WHY_DISABLED } from '../panels/tree-row-actions'

export type PaletteAdd = { ok: true; target: StructureDrop } | { ok: false; reason: string }

export function paletteAddTarget(input: {
  document: PageDocument
  selectedNodeId: string | null
  /** 넣을 자리로 고른 구역(스토어의 `selectedZone`) — 있으면 고른 노드보다 앞선다(스토어가 둘을 함께 세우지 않는다). */
  selectedZone?: ZoneRef | null
  /** 넣을 것 — 새 타입 · 모듈 묶음. 노드 옮기기(`'node'`)는 단추 넣기가 아니다. */
  placing: Exclude<Placing, { kind: 'node' }>
  /** 지을 편집이 부딪히는 남의 잠금(스토어의 `editBlockedBy`). */
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null
  /** 그 노드를 막는 남의 잠금(스토어의 `lockedBy`). */
  lockedBy: (nodeId: string) => NodeLock | null
}): PaletteAdd {
  const { document, selectedNodeId: selected, placing } = input
  const zone = input.selectedZone ?? null
  if (zone !== null) {
    const target = zoneDropTarget(document, placing, zone.parentId, zone.zone, input.blockedBy)
    if (target !== null) return { ok: true, target }
    const parent = findNodeSafely(document.root, zone.parentId)
    return whyNot(
      document,
      placing,
      parent === undefined ? null : { parentId: zone.parentId, zone: zone.zone, index: zoneList(parent, zone.zone).length },
      input.blockedBy,
    )
  }
  const rootId: unknown = document.root?.id
  const atEnd = selected === null || selected === rootId
  const node = atEnd ? undefined : findNodeSafely(document.root, selected)
  const inside = node !== undefined && acceptsChildren(node)

  // 고른 잎을 남이 잡았으면 넣지 않는다 — 판정은 잠긴 노드 **뒤**에 넣기를 막지 않지만(서버도 받는다), `+` 가 그 판에 항목을 전부 끄는
  // 것과 같이 간다(`edit/structure-actions.ts` 의 `structureAbilities` — 잠금이면 전부 거짓). «안 끝» 은 판정에 맡긴다(머리말).
  if (selected !== null && node !== undefined && !inside) {
    const lock = input.lockedBy(selected)
    if (lock !== null) return { ok: false, reason: lockedSelectionStatus(lock.userName) }
  }

  const target = atEnd
    ? pageEndTarget(document, placing, input.blockedBy)
    : node === undefined
      ? null
      : structureDropTarget(document, placing, selected, inside ? 'inside' : 'after', input.blockedBy)
  if (target !== null) return { ok: true, target }

  // «안» 이 받는 타입 · 설 자리에 걸리면 «뒤» 로 물러선다(머리말 ««안» 이 거절되면 «뒤»») — 물러선 자리는 잎의 «뒤» 와 같은 판이라 고른 노드의 잠금을 먼저 본다.
  if (inside && selected !== null && zoneDropRefusal(document, placing, selected, BODY_ZONE) !== null) {
    const lock = input.lockedBy(selected)
    if (lock !== null) return { ok: false, reason: lockedSelectionStatus(lock.userName) }
    const after = structureDropTarget(document, placing, selected, 'after', input.blockedBy)
    if (after !== null) return { ok: true, target: after }
  }

  // 왜 못 넣나 — 머리말의 표 차례대로(고른 잎의 잠금은 위에서 봤다).
  const slot = atEnd
    ? typeof rootId === 'string'
      ? { parentId: rootId, zone: BODY_ZONE, index: childCount(document.root) }
      : null
    : node === undefined
      ? null
      : inside
        ? { parentId: selected, zone: BODY_ZONE, index: childCount(node) }
        : afterSlot(document, selected)
  return whyNot(document, placing, slot, input.blockedBy)
}

/** 판정이 `null` 을 낸 자리의 이유 문장 — 머리말의 표 차례대로(고른 잎의 잠금은 부르는 쪽이 먼저 봤다). */
function whyNot(
  document: PageDocument,
  placing: Exclude<Placing, { kind: 'node' }>,
  slot: { parentId: string; zone: string; index: number } | null,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): PaletteAdd {
  if (slot === null) return { ok: false, reason: NOT_IN_DOCUMENT_STATUS }
  if (!acceptsIn(findNodeSafely(document.root, slot.parentId), slot.zone)) return { ok: false, reason: STRUCTURE_WHY_DISABLED.addInside }
  const refusal = zoneDropRefusal(document, placing, slot.parentId, slot.zone)
  if (refusal !== null) return { ok: false, reason: refusal }
  const probe = probeNode(placing, 'palette-probe')
  const ops = probe === null ? null : insertNodeOps(document, slot.parentId, slot.index, probe, slot.zone)
  const blocker = ops === null ? null : blockedBy(ops)
  if (blocker !== null) return { ok: false, reason: lockedNotice(blocker.userName) }
  return { ok: false, reason: NOT_IN_DOCUMENT_STATUS }
}

function childCount(node: unknown): number {
  const children = (node as { children?: unknown } | null | undefined)?.children
  return Array.isArray(children) ? children.length : 0
}

/** 고른 노드 바로 뒤 — 그 노드가 선 구역 안이다. */
function afterSlot(document: PageDocument, nodeId: string): { parentId: string; zone: string; index: number } | null {
  const spot = nodeSpot(document, nodeId)
  return spot === null ? null : { parentId: spot.parentId, zone: spot.zone, index: spot.index + 1 }
}
