/**
 * 화면 상태의 편집 — 나누기 · 풀기 · 가지 복사 · 상태 목록 편집 · 상태 삭제를 **JSON Patch 묶음 하나**로 짓는 순수 함수(설계 spec
 * `docs/superpowers/specs/2026-10-05-page-states-design.md` 「상태 삭제」 · 「영역 나누기 · 풀기」 · 「상태를 고른 채 편집」). 새 편집 종류를
 * 만들지 않는다 — 묶음 하나가 편집 하나라 지금 전송 길 · 잠금 판정(`lockConflictOfOps`) · 개인 되돌리기(묶음 하나 = 되돌리기 한 번)를
 * 그대로 탄다.
 *
 * **할 수 없으면 `null`이다 — 던지지 않는다.** 화면은 `null`을 «그 명령을 끈다»로 읽는다. 결과 묶음을 적용한 문서는 `validatePage`의
 * 오류가 늘지 않는다(그 판정은 케이스가 잰다 — `test/view-state-ops.test.ts`).
 *
 * **노드는 옮기고(`move`) 복사본만 넣는다(`add`).** 옮기면 노드 id · 코멘트 · 상호작용 대상이 그대로이고 이력(revision)에 노드 본문이
 * 실리지 않는다. 옮기는 노드가 남에게 잠겨 있으면 `move`의 `from`이 그 자리와 겹쳐 묶음째 막힌다 — 끌어 놓기와 같은 판정이다.
 */
import { isBlankAlias, hasRejectedAliasChar } from './alias'
import { DEFAULT_CASE, VIEW_STATE_NAME_MAX, VIEW_STATES_MAX, type PageDocument, type WbNode } from './node'
import { formatPointer, parsePointer } from './patch/pointer'
import type { PatchOp } from './patch/types'
import { stripMarkers } from './preset/builtin'
import { remapNodeIds, walkNodes } from './tree'

interface Placed {
  node: WbNode
  tokens: string[]
  parent: WbNode | null
  index: number
}

function place(doc: PageDocument, nodeId: string): Placed | null {
  for (const visit of walkNodes(doc.root)) {
    if (visit.node.id === nodeId) return { node: visit.node, tokens: parsePointer(visit.path), parent: visit.parent, index: visit.index }
  }
  return null
}

const at = (tokens: readonly string[], ...more: (string | number)[]): string => formatPointer([...tokens, ...more.map(String)])

function caseState(node: WbNode): unknown {
  return node.type === 'StateCase' ? node.props?.state : undefined
}

function hasState(doc: PageDocument, state: string): boolean {
  return (doc.viewStates ?? []).some((entry) => entry.id === state)
}

/**
 * 기본 가지의 내용을 새 id 로 복사한다 — 붙여넣기의 id 다시 짓기(`remapNodeIds` — 복사본 안을 가리키던 상호작용 대상도 따라간다)에
 * 번호(`marker`)를 걷는다. 번호는 코멘트의 자리이고 코멘트는 원본 노드에 달려 있다 — 복사본이 같은 번호를 들면 번호가 둘이 된다.
 * `mapping`은 원본 id → 복사 id 이고 감싼 가지 자신을 포함한다.
 */
function copyCase(source: WbNode, state: string, newId: () => string): { node: WbNode; mapping: Map<string, string> } {
  const shell: WbNode = { id: source.id, type: 'StateCase', props: { state }, children: stripMarkers(source.children ?? []) }
  const { root, mapping } = remapNodeIds(shell, newId)
  return { node: root, mapping }
}

/**
 * **상태별로 나누기** — 같은 부모의 이어진 형제 `nodeIds`를 `StateSwitch > StateCase(default)`로 감싼다. `viewState`가 기본이 아니면 그
 * 상태의 가지를 기본 가지의 복사로 함께 만든다.
 *
 * `null`인 판: 노드가 없음 · 비었음 · 뿌리 · 부모가 다름 · 이어지지 않음 · 상태 영역의 가지(`StateCase`)를 감쌈 · `viewState`가 목록에
 * 없음. 상태 영역 자체를 감싸는 것은 받는다(영역 안의 영역).
 */
export function splitIntoStatesOps(
  doc: PageDocument,
  nodeIds: string[],
  viewState: string | null,
  newId: () => string,
): PatchOp[] | null {
  if (nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length) return null
  const placed: Placed[] = []
  for (const id of nodeIds) {
    const found = place(doc, id)
    if (found === null || found.parent === null || found.node.type === 'StateCase') return null
    placed.push(found)
  }
  const parent = placed[0]!.parent
  if (placed.some((entry) => entry.parent !== parent)) return null
  const indexes = placed.map((entry) => entry.index).sort((a, b) => a - b)
  if (indexes.some((index, i) => index !== indexes[0]! + i)) return null
  const forState = viewState !== null && viewState !== DEFAULT_CASE ? viewState : null
  if (forState !== null && !hasState(doc, forState)) return null

  const parentTokens = placed[0]!.tokens.slice(0, -1)
  const first = indexes[0]!
  const sw = at(parentTokens, first)
  const ops: PatchOp[] = [
    { op: 'add', path: sw, value: { id: newId(), type: 'StateSwitch', children: [{ id: newId(), type: 'StateCase', props: { state: DEFAULT_CASE }, children: [] }] } },
  ]
  // 영역이 `first`에 섰으니 감쌀 형제는 한 칸 뒤에서 차례로 빠진다.
  for (let i = 0; i < indexes.length; i += 1) ops.push({ op: 'move', from: at(parentTokens, first + 1), path: at(parentTokens, first, 'children', 0, 'children', '-') })
  if (forState !== null) {
    const children = parent!.children!.slice(first, first + indexes.length)
    const { node } = copyCase({ id: 'wrap', type: 'StateCase', children }, forState, newId)
    ops.push({ op: 'add', path: at(parentTokens, first, 'children', '-'), value: node })
  }
  return ops
}

/**
 * **상태 나누기 풀기** — 기본 가지의 내용을 영역의 자리에 차례로 꺼내고 영역(다른 가지째)을 지운다. 다른 가지는 사라지므로 화면이 확인을
 * 받는다. `null`인 판: 영역이 없음 · `StateSwitch`가 아님 · 기본 가지가 정확히 하나가 아님.
 */
export function unsplitStatesOps(doc: PageDocument, switchId: string): PatchOp[] | null {
  const found = place(doc, switchId)
  if (found === null || found.parent === null || found.node.type !== 'StateSwitch') return null
  const cases = found.node.children ?? []
  const defaults = cases.flatMap((child, index) => (caseState(child) === DEFAULT_CASE ? [index] : []))
  if (defaults.length !== 1) return null
  const d = defaults[0]!
  const parentTokens = found.tokens.slice(0, -1)
  const ops: PatchOp[] = []
  const count = cases[d]!.children?.length ?? 0
  for (let j = 0; j < count; j += 1) {
    ops.push({ op: 'move', from: at(found.tokens, 'children', d, 'children', 0), path: at(parentTokens, found.index + 1 + j) })
  }
  ops.push({ op: 'remove', path: at(found.tokens) })
  return ops
}

/**
 * **가지 복사** — 영역 `switchId`에 `viewState`의 가지를 기본 가지의 복사로 더한다(영역의 끝에). `remap`은 기본 가지 노드 id → 복사 노드
 * id(가지 자신 포함). `null`인 판: 영역이 없음 · 기본 가지가 정확히 하나가 아님 · `viewState`가 기본이거나 목록에 없음 · 그 상태의 가지가
 * 이미 있음.
 */
export function forkCaseOps(
  doc: PageDocument,
  switchId: string,
  viewState: string,
  newId: () => string,
): { ops: PatchOp[]; remap: Map<string, string> } | null {
  const found = place(doc, switchId)
  if (found === null || found.node.type !== 'StateSwitch') return null
  if (viewState === DEFAULT_CASE || !hasState(doc, viewState)) return null
  const cases = found.node.children ?? []
  if (cases.some((child) => caseState(child) === viewState)) return null
  const defaults = cases.filter((child) => caseState(child) === DEFAULT_CASE)
  if (defaults.length !== 1) return null
  const { node, mapping } = copyCase(defaults[0]!, viewState, newId)
  return { ops: [{ op: 'add', path: at(found.tokens, 'children', '-'), value: node }], remap: mapping }
}

/**
 * **복사 + 편집** — 지금 상태(`viewState`)의 가지가 없는 영역에서 흐린 기본 가지 안을 고친 편집 `ops`를, 가지 복사(`forkCaseOps`) 뒤 새
 * 가지를 고치는 묶음으로 옮긴다. 기본 가지는 건드리지 않는다(계획 Review Focus 2).
 *
 * `ops`는 편집 **전** 문서 좌표로 기본 가지 **안**(그 가지의 `children` 아래)만 가리켜야 한다 — 포인터(`path` · `from`)가 그 밖인
 * 연산이 하나라도 있으면 `null`(그 편집은 영역 밖을 고치므로 모든 상태에 반영되는 평범한 편집이다). 새 가지는 기본 가지와 같은 모양이라 포인터의
 * 머리(기본 가지의 경로)만 새 가지의 경로로 바꾼다. 값 안의 상호작용 대상(`target`)이 복사된 노드면 복사 id 로 바꾼다.
 */
export function editInForkOps(
  doc: PageDocument,
  switchId: string,
  viewState: string,
  ops: PatchOp[],
  newId: () => string,
): { ops: PatchOp[]; remap: Map<string, string> } | null {
  const fork = forkCaseOps(doc, switchId, viewState, newId)
  if (fork === null || ops.length === 0) return null
  const sw = place(doc, switchId)!
  const cases = sw.node.children ?? []
  const d = cases.findIndex((child) => caseState(child) === DEFAULT_CASE)
  const from = [...sw.tokens, 'children', String(d)]
  const to = [...sw.tokens, 'children', String(cases.length)]
  const inside = (pointer: string): string[] | null => {
    let tokens: string[]
    try {
      tokens = parsePointer(pointer)
    } catch {
      return null
    }
    // 가지의 `children` 아래만 — 가지 자신의 필드(`props.state` 등)는 그 가지의 정체라 옮기지 않는다.
    if (tokens.length <= from.length + 1 || tokens[from.length] !== 'children' || from.some((token, i) => tokens[i] !== token)) return null
    return [...to, ...tokens.slice(from.length)]
  }
  const moved: PatchOp[] = []
  for (const op of ops) {
    const path = inside(op.path)
    if (path === null) return null
    if (op.op === 'move') {
      const source = inside(op.from)
      if (source === null) return null
      moved.push({ op: 'move', from: formatPointer(source), path: formatPointer(path) })
    } else if (op.op === 'remove') {
      moved.push({ op: 'remove', path: formatPointer(path) })
    } else {
      moved.push({ op: op.op, path: formatPointer(path), value: retarget(op.value, fork.remap) })
    }
  }
  return { ops: [...fork.ops, ...moved], remap: fork.remap }
}

/** 값 안의 상호작용 대상 · `target` 키의 노드 id 를 복사 id 로 바꾼 사본. 그 밖은 그대로 복사한다. */
function retarget(value: unknown, remap: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => retarget(item, remap))
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    out[key] = key === 'target' && typeof inner === 'string' ? (remap.get(inner) ?? inner) : retarget(inner, remap)
  }
  return out
}

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

/** **상태 추가** — 목록의 끝에. `null`인 판: 이름이 규칙 밖 · 이름이 겹침 · 이미 `VIEW_STATES_MAX`개. */
export function addViewStateOps(doc: PageDocument, name: string, newId: () => string): PatchOp[] | null {
  const tidy = tidyName(name)
  const states = doc.viewStates ?? []
  if (tidy === null || states.length >= VIEW_STATES_MAX || states.some((state) => state.name === tidy)) return null
  const state = { id: newId(), name: tidy }
  return doc.viewStates === undefined
    ? [{ op: 'add', path: '/viewStates', value: [state] }]
    : [{ op: 'add', path: '/viewStates/-', value: state }]
}

/** **이름 바꾸기** — id 는 그대로다. `null`인 판: 상태가 없음 · 이름이 규칙 밖 · 다른 상태와 겹침 · 이름이 그대로. */
export function renameViewStateOps(doc: PageDocument, stateId: string, name: string): PatchOp[] | null {
  const tidy = tidyName(name)
  const states = doc.viewStates ?? []
  const index = states.findIndex((state) => state.id === stateId)
  if (tidy === null || index === -1 || states[index]!.name === tidy) return null
  if (states.some((state) => state.id !== stateId && state.name === tidy)) return null
  return [{ op: 'replace', path: `/viewStates/${index}/name`, value: tidy }]
}

/** **순서 바꾸기** — `toIndex`(옮긴 뒤 목록의 자리). `null`인 판: 상태가 없음 · 자리가 범위 밖 · 자리가 그대로. */
export function moveViewStateOps(doc: PageDocument, stateId: string, toIndex: number): PatchOp[] | null {
  const states = doc.viewStates ?? []
  const index = states.findIndex((state) => state.id === stateId)
  if (index === -1 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= states.length || toIndex === index) return null
  return [{ op: 'move', from: `/viewStates/${index}`, path: `/viewStates/${toIndex}` }]
}

/**
 * **상태 삭제** — 그 상태를 가리키는 가지를 모두 지우고 목록에서 뺀다(편집 하나 — 되돌리기 한 번에 돌아온다). 화면의 확인 상자는
 * `removedCaseIds`(지우는 가지 — 지우는 가지 안에 든 같은 상태의 가지 포함)와 `removedNodeIds`(문서에서 사라지는 노드 전부 — 가지 자신과
 * 그 안 전부)로 수 · 목록을 짓는다. 둘은 묶음이 실제로 지우는 것과 같다(계획 Review Focus 4 — 케이스가 적용 전후 id 집합의 차로 잰다).
 * `null`인 판: 상태가 없음.
 *
 * 지우는 가지가 남에게 잠긴 노드를 품으면 그 `remove`가 잠긴 자리와 겹쳐 묶음째 막힌다(`lockConflictOfOps`).
 */
export function removeViewStateOps(
  doc: PageDocument,
  stateId: string,
): { ops: PatchOp[]; removedCaseIds: string[]; removedNodeIds: string[] } | null {
  const states = doc.viewStates ?? []
  const index = states.findIndex((state) => state.id === stateId)
  if (index === -1) return null

  const removedCaseIds: string[] = []
  const removedNodeIds: string[] = []
  const outer: string[] = []
  // 지우는 가지의 경로 — 그 아래(접두)는 이미 사라진다. 전위 순서라 조상이 먼저 온다.
  const gone: string[] = []
  for (const { node, path } of walkNodes(doc.root)) {
    const under = gone.some((prefix) => path.startsWith(`${prefix}/`))
    if (under) removedNodeIds.push(node.id)
    if (caseState(node) !== stateId) continue
    removedCaseIds.push(node.id)
    if (under) continue
    removedNodeIds.push(node.id)
    gone.push(path)
    outer.push(path)
  }
  // 전위 순서의 거꾸로 지운다 — 뒤의 것을 먼저 빼면 앞의 경로가 밀리지 않는다.
  const ops: PatchOp[] = outer.reverse().map((path) => ({ op: 'remove', path }))
  ops.push({ op: 'remove', path: `/viewStates/${index}` })
  return { ops, removedCaseIds, removedNodeIds }
}
