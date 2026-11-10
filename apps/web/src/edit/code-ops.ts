/**
 * **공통코드 묶기 · 고르기 · 풀기의 편집 묶음**(정본 설계서 「페이지 스키마 노드」의 `code` · 속성 패널 `panels/code-binding.tsx`). 셋 다 기존 편집
 * 경로의 JSON Patch 한 묶음이다 — 표에는 revision 이 없지만 노드의 `code` 는 문서의 칸이라 되돌리기 · 잠금 · 리베이스를 그대로 탄다.
 *
 * | 묶음 | 연산 |
 * |---|---|
 * | 묶기 | `add …/code` + 대체 글 prop(대표 글이면 그 prop, 선택 위젯이면 `options`) — 묶을 때 표의 이름을 적어 둔다 |
 * | 고르기(선택 위젯) | `add …/code/selected` + `options` 의 대체 글 · `selected` 맞춤 |
 * | 풀기 | `remove …/code` + 그때 표에서 푼 이름으로 prop(끊긴 참조면 prop 그대로) |
 *
 * **전제는 노드 값 `test` 하나다**(`AGENTS.md` «전제를 칸 하나로 세우면 그 묶음이 읽어 베끼는 칸을 전부 센다») — 묶음은 노드의 props 를 읽어 대체 글을
 * 짓는다. 남이 그 사이 노드를 고쳤으면 리베이스가 노드 id 로 경로를 다시 지어도 `test` 가 어긋나 묶음째 버려진다(남의 고침을 말없이 걷지 않는다).
 */
import { resolveChoices, resolveLabel, type CodeIndex, type CodeRef, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { codeBindingOf } from '@wirebound/schema'
import { findNodePathSafely, findNodeSafely } from './safe-walk'

/** 대체 글 prop 하나를 쓰는 연산 — `props` 가 없으면 객체째 넣는다(`add` 는 있는 키를 바꾼다). */
function propOp(node: WbNode, nodePath: string, prop: string, value: unknown): PatchOp {
  return node.props === undefined
    ? { op: 'add', path: `${nodePath}/props`, value: { [prop]: value } }
    : { op: 'add', path: `${nodePath}/props/${prop}`, value }
}

function located(document: PageDocument, nodeId: string): { node: WbNode; path: string } | null {
  const path = findNodePathSafely(document.root, nodeId)
  const node = findNodeSafely(document.root, nodeId)
  return path === undefined || node === undefined ? null : { node, path }
}

const premise = (node: WbNode, path: string): PatchOp => ({ op: 'test', path, value: structuredClone(node) })

/**
 * 묶는다 — 대표 글 타입은 `{ group, item }`, 선택 위젯은 `{ group }`(고름 없음). 대체 글은 지금 표에서 푼 이름이다. 받지 않는 타입 · 표에 없는 그룹 ·
 * 항목이면 `null`(화면은 표에 있는 것만 고르게 한다).
 */
export function bindCodeOps(document: PageDocument, nodeId: string, index: CodeIndex, group: string, item?: string): PatchOp[] | null {
  const at = located(document, nodeId)
  if (at === null) return null
  const binding = codeBindingOf(at.node.type)
  if (binding === null || !index.has(group)) return null
  if (binding.kind === 'label') {
    if (item === undefined) return null
    const ref: CodeRef = { group, item }
    const label = resolveLabel(index, ref)
    if (label === null) return null
    return [
      premise(at.node, at.path),
      { op: 'add', path: `${at.path}/code`, value: ref },
      propOp(at.node, at.path, binding.prop, label.name),
    ]
  }
  const ref: CodeRef = { group }
  const choices = resolveChoices(index, ref)
  const ops: PatchOp[] = [premise(at.node, at.path), { op: 'add', path: `${at.path}/code`, value: ref }]
  // 사용 중 항목이 0 개면 대체 글을 안 바꾼다 — `options` 는 1 개 이상이어야 문서가 선다(검증의 `invalid-props`).
  if (choices.options.length > 0) ops.push(propOp(at.node, at.path, 'options', choices.options))
  return ops
}

/**
 * 묶인 선택 위젯에서 고른다 — `selected` 를 갈아 끼우고 `options` 의 대체 글을 같은 고름으로 맞춘다(둘이 어긋나면 `code.selected` 가 이긴다 — 그리기는
 * 표에서 다시 푼다). 묶이지 않았거나 그룹이 끊겼으면 `null`.
 */
export function pickCodeOps(document: PageDocument, nodeId: string, index: CodeIndex, selected: readonly string[]): PatchOp[] | null {
  const at = located(document, nodeId)
  if (at === null || at.node.code === undefined) return null
  const ref: CodeRef = { group: at.node.code.group, selected: [...selected] }
  const choices = resolveChoices(index, ref)
  if (choices.brokenGroup) return null
  const ops: PatchOp[] = [premise(at.node, at.path), { op: 'add', path: `${at.path}/code/selected`, value: [...selected] }]
  if (choices.options.length > 0) ops.push(propOp(at.node, at.path, 'options', choices.options))
  return ops
}

/**
 * 푼다 — `code` 를 지우고 **그때 표에서 푼 이름**을 prop 에 다시 적는다(묶을 때의 옛 이름이 다시 나타나지 않게). 끊긴 참조면 prop 의 대체 글이 그대로
 * 남는다. 묶이지 않은 노드면 `null`.
 */
export function unbindCodeOps(document: PageDocument, nodeId: string, index: CodeIndex | undefined): PatchOp[] | null {
  const at = located(document, nodeId)
  if (at === null || at.node.code === undefined) return null
  const binding = codeBindingOf(at.node.type)
  const ops: PatchOp[] = [premise(at.node, at.path), { op: 'remove', path: `${at.path}/code` }]
  if (binding === null || index === undefined) return ops
  if (binding.kind === 'label') {
    const label = resolveLabel(index, at.node.code)
    if (label !== null) ops.push(propOp(at.node, at.path, binding.prop, label.name))
    return ops
  }
  const choices = resolveChoices(index, at.node.code)
  if (!choices.brokenGroup && choices.options.length > 0) ops.push(propOp(at.node, at.path, 'options', choices.options))
  return ops
}
