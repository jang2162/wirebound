/**
 * 화면 상태 목록의 편집 — 추가 · 이름 바꾸기 · 형제 안 옮기기 · 삭제를 **JSON Patch 묶음 하나**로 짓는 순수 함수(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C1」 · 「C3」의 상태 삭제). 새 편집 종류를 만들지 않는다 — 묶음 하나가
 * 편집 하나라 지금 전송 길 · 잠금 판정(`lockConflictOfOps`) · 개인 되돌리기(묶음 하나 = 되돌리기 한 번)를 그대로 탄다.
 *
 * **할 수 없으면 `null`이다 — 던지지 않는다.** 화면은 `null`을 «그 명령을 끈다»로 읽는다. 결과 묶음을 적용한 문서는 `validatePage`의
 * 오류가 늘지 않는다(그 판정은 케이스가 잰다 — `test/view-state-ops.test.ts`).
 */
import { isBlankAlias, hasRejectedAliasChar } from './alias'
import { VIEW_STATE_DEPTH_MAX, VIEW_STATE_NAME_MAX, VIEW_STATES_MAX, type PageDocument } from './node'
import type { PatchOp } from './patch/types'
import { walkNodes } from './tree'
import { guardViewStateOps } from './view-state-guard'
import { stateDescendants, stateLineage } from './visibility'

/**
 * 친 이름을 목록이 받는 모양으로 — 앞뒤 공백을 걷고, 받지 않는 글자 · 보이는 글자 없음 · 상한 넘음이면 `null`. 자르거나 고쳐 받지 않는다
 * (사람이 친 이름이 말없이 다른 이름이 되지 않게 — 화면이 이유를 말한다).
 */
function tidyName(name: string): string | null {
  const trimmed = name.trim()
  if (hasRejectedAliasChar(trimmed) || isBlankAlias(trimmed)) return null
  const length = [...trimmed].length
  return length >= 1 && length <= VIEW_STATE_NAME_MAX ? trimmed : null
}

/**
 * **상태 추가** — 목록의 끝에(그 부모의 마지막 자식이 된다). `parent` 가 `null` 이면 뿌리 상태. `null`인 판: 이름이 규칙 밖 · 이름이 겹침 ·
 * 이미 `VIEW_STATES_MAX`개 · 부모가 목록에 없음 · 부모 아래가 `VIEW_STATE_DEPTH_MAX` 를 넘음.
 *
 * 부모를 가리키면 그 자리의 id 를 `test`로 싣는다 — 남이 그 사이 부모를 지우면 묶음째 실패한다(없는 부모를 가리킨 목록은 봉투가 거절한다).
 */
export function addViewStateOps(doc: PageDocument, name: string, parent: string | null, newId: () => string): PatchOp[] | null {
  const tidy = tidyName(name)
  const states = doc.viewStates ?? []
  if (tidy === null || states.length >= VIEW_STATES_MAX || states.some((state) => state.name === tidy)) return null
  const at = parent === null ? -1 : states.findIndex((state) => state.id === parent)
  if (parent !== null && (at === -1 || stateLineage(states, parent).length + 1 > VIEW_STATE_DEPTH_MAX)) return null
  const state = parent === null ? { id: newId(), name: tidy } : { id: newId(), name: tidy, parent }
  if (doc.viewStates === undefined) return [{ op: 'add', path: '/viewStates', value: [state] }]
  const guard: PatchOp[] = parent === null ? [] : [{ op: 'test', path: `/viewStates/${at}/id`, value: parent }]
  return [...guard, { op: 'add', path: '/viewStates/-', value: state }]
}

/**
 * **이름 바꾸기** — id 는 그대로다. `null`인 판: 상태가 없음 · 이름이 규칙 밖 · 다른 상태와 겹침 · 이름이 그대로.
 *
 * 목록의 있는 자리를 고치는 묶음(이름 · 순서 · 삭제)은 그 자리의 id 를 `test`로 싣는다(`view-state-guard.ts`) — 남이 그 사이 순서를 바꾸거나 그
 * 상태를 빼면 묶음째 적용이 실패한다(다른 상태를 고치지 않는다).
 */
export function renameViewStateOps(doc: PageDocument, stateId: string, name: string): PatchOp[] | null {
  const tidy = tidyName(name)
  const states = doc.viewStates ?? []
  const index = states.findIndex((state) => state.id === stateId)
  if (tidy === null || index === -1 || states[index]!.name === tidy) return null
  if (states.some((state) => state.id !== stateId && state.name === tidy)) return null
  return guardViewStateOps(doc, [{ op: 'replace', path: `/viewStates/${index}/name`, value: tidy }])
}

/**
 * **순서 바꾸기 — 형제 안에서만.** `toIndex` 는 같은 부모의 자식들 가운데 옮긴 뒤의 자리다(«위로» 는 지금 자리 − 1). 목록에서는 그 자리의 형제 앞
 * (위로) · 뒤(아래로)로 옮긴다 — 형제 차례가 목록 차례다. `null`인 판: 상태가 없음 · 자리가 형제 범위 밖 · 자리가 그대로.
 */
export function moveViewStateOps(doc: PageDocument, stateId: string, toIndex: number): PatchOp[] | null {
  const states = doc.viewStates ?? []
  const index = states.findIndex((state) => state.id === stateId)
  if (index === -1) return null
  const siblings = states.flatMap((state, at) => (state.parent === states[index]!.parent ? [at] : []))
  const from = siblings.indexOf(index)
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= siblings.length || toIndex === from) return null
  // 빼고 넣는 `move` 는 빼기 전 목록의 그 형제 번호에 넣으면 아래로는 그 뒤 · 위로는 그 앞에 선다.
  return guardViewStateOps(doc, [{ op: 'move', from: `/viewStates/${index}`, path: `/viewStates/${siblings[toIndex]!}` }])
}

/**
 * **상태 삭제 — 하위 상태째.** 지우는 상태(`removedStateIds` — 그 상태와 하위 상태 전부 · 목록 차례)를 목록에서 빼고, 모든 노드 보임의 `states`
 * 에서 그 id 들을 뺀다. 그래서 빈 보임은:
 *
 * | 보임 | 뺀 뒤 | 노드 |
 * |---|---|---|
 * | `only` | 비었다 | **지운다**(`removedNodeIds` — 그 노드와 자손 전부) — 그 상태에서만 보이던 내용이다 |
 * | `except` | 비었다 | 보임을 걷는다(`clearedNodeIds`) — 숨기던 상태가 없어졌다 |
 * | 어느 쪽이든 | 남았다 | 남은 상태로 바꾼다(`trimmedNodeIds`) |
 *
 * 편집 하나 — 되돌리기 한 번에 돌아온다. 화면의 확인 상자는 이 집합들로 수 · 이름을 짓고, 집합은 묶음이 실제로 바꾸는 노드와 같다(계획 Review
 * Focus 4 — 케이스가 적용 전후의 차로 잰다). 지울 노드 · 고칠 노드가 남에게 잠겨 있으면 그 연산이 잠긴 자리와 겹쳐 묶음째 막힌다. `null`인 판:
 * 상태가 없음.
 */
export function removeViewStateOps(
  doc: PageDocument,
  stateId: string,
): { ops: PatchOp[]; removedStateIds: string[]; removedNodeIds: string[]; clearedNodeIds: string[]; trimmedNodeIds: string[] } | null {
  const states = doc.viewStates ?? []
  if (!states.some((state) => state.id === stateId)) return null
  const gone = new Set([stateId, ...stateDescendants(states, stateId)])
  const removedStateIds = states.flatMap((state) => (gone.has(state.id) ? [state.id] : []))

  const removedNodeIds: string[] = []
  const clearedNodeIds: string[] = []
  const trimmedNodeIds: string[] = []
  const nodeOps: PatchOp[] = []
  // 지우는 노드의 경로 — 그 아래(접두)는 함께 사라진다. 전위 차례라 조상이 먼저 온다.
  const removed: string[] = []
  for (const { node, path } of walkNodes(doc.root)) {
    if (removed.some((prefix) => path.startsWith(`${prefix}/`))) {
      removedNodeIds.push(node.id)
      continue
    }
    const visibility = node.visibility
    if (visibility === undefined || !visibility.states.some((state) => gone.has(state))) continue
    const left = visibility.states.filter((state) => !gone.has(state))
    if (left.length > 0) {
      trimmedNodeIds.push(node.id)
      nodeOps.push({ op: 'replace', path: `${path}/visibility/states`, value: left })
    } else if (visibility.mode === 'only') {
      removedNodeIds.push(node.id)
      removed.push(path)
      nodeOps.push({ op: 'remove', path })
    } else {
      clearedNodeIds.push(node.id)
      nodeOps.push({ op: 'remove', path: `${path}/visibility` })
    }
  }
  // 전위 차례의 거꾸로 낸다 — 뒤의 노드를 먼저 빼면 앞 노드의 경로가 밀리지 않는다.
  const listOps: PatchOp[] = states
    .flatMap((state, index) => (gone.has(state.id) ? [index] : []))
    .reverse()
    .map((index) => ({ op: 'remove', path: `/viewStates/${index}` }))
  return {
    ops: guardViewStateOps(doc, [...nodeOps.reverse(), ...listOps]),
    removedStateIds,
    removedNodeIds,
    clearedNodeIds,
    trimmedNodeIds,
  }
}
