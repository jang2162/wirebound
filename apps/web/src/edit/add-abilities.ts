/**
 * **`+` 의 «안에 추가» · «아래 추가» 를 남의 잠금 아래서 가른다**(트리 줄 `+` · 뿌리 `+`). 하단 판 카드의 «넣기»(`palette/palette-add.ts`)와 같은 물음이다 —
 * 「고른 것을 남이 잡았나」가 아니라 「그 자리에 넣는 **편집**이 남의 잠금에 부딪히나」(`blockedBy` — 스토어의 `editBlockedBy`, 서버의 2차 방어와 같은
 * 물음)로 가른다.
 *
 * | 항목 | 꺼지는 때 | 까닭 문장 |
 * |---|---|---|
 * | 안에 추가(컨테이너 · 뿌리) | 안 끝에 넣는 편집이 부딪힘 | 속성 패널의 잠금 문장(`lockedNotice`) |
 * | 아래 추가 | 고른 노드를 남이 잡음(`selectionLock` — 고르기 판정이라 자손의 잠금도 센다) · 바로 뒤에 넣는 편집이 부딪힘(잎의 바로 뒤 형제를 남이 잡음) | 앞은 «고를 수도 바꿀 수도 없습니다» · 뒤는 `lockedNotice` |
 *
 * **«안에 추가» 는 고른 노드의 잠금을 안 본다** — `selectionLock` 은 고르기 판정이라 페이지를 연 그대로(뿌리 선택) 남이 아무 노드를 잡아도 뿌리 «안
 * 끝» 을 막지만 서버는 그 넣기를 받는다(고치기 전: 뿌리 줄 `+` 의 세 항목이 전부 «밥님이 편집 중이라 고를 수도 바꿀 수도 없습니다» 로 꺼졌다 —
 * `build-test/palette-review.test.ts` «트리 줄 `+`»). 부딪히는지는 편집이 답한다. **«아래 추가» 는 고른 노드의 잠금을 먼저 본다** — 카드의 «넣기»가
 * 고른 잎의 잠금을 «그 뒤» 에 넣는 판에 먼저 보는 것과 같이 간다(`palette/palette-add.ts` 머리말).
 *
 * 구조 규칙(자식을 받나 · 루트인가 · 상태 영역 규칙)은 `structureAbilities` 가 잠금 없이 답한다 — 이 함수는 그 위에 잠금만 얹는다. **순수 함수이고
 * 던지지 않는다**(`./structure-actions.ts` 와 같은 층).
 */
import type { NodeLock, PageDocument, PatchOp } from '@wirebound/schema'
import { createNode } from './create-node'
import { insertNodeOps } from './ops'
import { findNodeSafely } from './safe-walk'
import { nodeSpot, structureAbilities } from './structure-actions'

/** 판정용 표본 노드의 id — 보내지 않는다(잠금은 경로로 가르므로 id 가 답을 안 바꾼다 — `./structure-drop.ts` 의 `PROBE_ID` 와 같은 까닭). */
const PROBE_ID = 'add-probe'

export interface AddAbilities {
  addInside: boolean
  addAfter: boolean
  /** «안에 추가» 를 끈 편집의 충돌 상대. 편집이 부딪혀 꺼진 것이 아니면 `null`. */
  insideBlockedBy: NodeLock | null
  /** «아래 추가» 를 끈 편집의 충돌 상대(고른 노드의 잠금으로 꺼진 것은 `null` — 그 문장은 `lockedSelectionStatus`). */
  afterBlockedBy: NodeLock | null
}

export function addAbilitiesUnderLock(
  document: PageDocument,
  nodeId: string,
  selectionLock: NodeLock | null,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): AddAbilities {
  const free = structureAbilities(document, nodeId)
  const out: AddAbilities = { addInside: free.addInside, addAfter: free.addAfter, insideBlockedBy: null, afterBlockedBy: null }
  const probe = createNode('Text', () => PROBE_ID)
  if (probe === null) return out

  if (free.addInside) {
    const node = findNodeSafely(document.root, nodeId)
    const ops = insertNodeOps(document, nodeId, Array.isArray(node?.children) ? node.children.length : 0, probe)
    const blocker = ops === null ? null : blockedBy(ops)
    if (blocker !== null) {
      out.addInside = false
      out.insideBlockedBy = blocker
    }
  }
  if (free.addAfter) {
    if (selectionLock !== null) {
      out.addAfter = false
      return out
    }
    const spot = nodeSpot(document, nodeId)
    const ops = spot === null ? null : insertNodeOps(document, spot.parentId, spot.index + 1, probe)
    const blocker = ops === null ? null : blockedBy(ops)
    if (blocker !== null) {
      out.addAfter = false
      out.afterBlockedBy = blocker
    }
  }
  return out
}
