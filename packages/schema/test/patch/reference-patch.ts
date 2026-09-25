/**
 * **연산마다 문서 전체를 복제하는 단순 구현** — `src/patch/apply.ts`·`inverse.ts`가 지켜야 할
 * 결과의 명세로 쓴다. 제품 코드는 이것을 부르지 않는다(`equivalence.property.test.ts`만 부른다).
 *
 * 연산마다 새 사본을 만들므로 원자성 · 입력 불변이 구조로 성립한다 — 그래서 명세가 된다.
 * 제품 구현은 사본 하나를 제자리로 진행시키므로 같은 성질을 따로 지켜야 하고, 그것을 이것과
 * 견줘 잰다. 본문은 제품 구현과 달리 고치지 않는다 — 고치면 명세가 움직인다.
 */
import { formatPointer, getByPointer, parsePointer, readMember } from '../../src/patch/pointer'
import { PatchError, type PatchOp } from '../../src/patch/types'

export function referenceApplyOp<T>(doc: T, op: PatchOp): T {
  const next = structuredClone(doc)

  switch (op.op) {
    case 'add':
      addAt(next, op.path, op.value)
      break
    case 'remove':
      removeAt(next, op.path)
      break
    case 'replace':
      replaceAt(next, op.path, op.value)
      break
    case 'move': {
      const value = getByPointer(next, op.from)
      if (value === undefined) {
        throw new PatchError(`옮길 값을 찾을 수 없습니다: ${op.from}`, op.from)
      }
      const moved = structuredClone(value)
      removeAt(next, op.from)
      addAt(next, op.path, moved)
      break
    }
  }

  return next
}

export function referenceApplyOps<T>(doc: T, ops: PatchOp[]): T {
  return ops.reduce<T>((acc, op) => referenceApplyOp(acc, op), doc)
}

interface Slot {
  parent: unknown
  key: string
}

function resolveSlot(doc: unknown, path: string): Slot {
  const tokens = parsePointer(path)
  const key = tokens.pop()
  if (key === undefined) {
    throw new PatchError('문서 루트에는 연산을 적용할 수 없습니다', path)
  }

  let parent: unknown = doc
  for (const token of tokens) {
    if (parent === null || parent === undefined) {
      throw new PatchError(`경로를 찾을 수 없습니다: ${path}`, path)
    }
    parent = readMember(parent, token)
  }

  if (parent === null || typeof parent !== 'object') {
    throw new PatchError(`경로를 찾을 수 없습니다: ${path}`, path)
  }

  return { parent, key }
}

function arrayIndex(array: unknown[], key: string, path: string, allowEnd: boolean): number {
  const index = key === '-' && allowEnd ? array.length : Number(key)
  const limit = allowEnd ? array.length : array.length - 1
  if (!Number.isInteger(index) || index < 0 || index > limit) {
    throw new PatchError(`배열 인덱스가 범위를 벗어납니다: ${path}`, path)
  }
  return index
}

function addAt(doc: unknown, path: string, value: unknown): void {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent, key, path, true), 0, value)
    return
  }
  ;(parent as Record<string, unknown>)[key] = value
}

function removeAt(doc: unknown, path: string): void {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent, key, path, false), 1)
    return
  }
  const record = parent as Record<string, unknown>
  if (!Object.hasOwn(record, key)) {
    throw new PatchError(`지울 키가 없습니다: ${path}`, path)
  }
  delete record[key]
}

function replaceAt(doc: unknown, path: string, value: unknown): void {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    parent[arrayIndex(parent, key, path, false)] = value
    return
  }
  const record = parent as Record<string, unknown>
  if (!Object.hasOwn(record, key)) {
    throw new PatchError(`바꿀 키가 없습니다: ${path}`, path)
  }
  record[key] = value
}

export function referenceInvertOps<T>(doc: T, ops: PatchOp[]): PatchOp[] {
  const inverses: PatchOp[][] = []
  let current: T = doc

  for (const op of ops) {
    inverses.push(inverseOf(current, op))
    current = referenceApplyOp(current, op)
  }

  return inverses.reverse().flat()
}

function inverseOf(doc: unknown, op: PatchOp): PatchOp[] {
  switch (op.op) {
    case 'add':
      return [inverseOfAdd(doc, op)]
    case 'remove': {
      const old = getByPointer(doc, op.path)
      if (old === undefined) {
        throw new PatchError(`지울 값을 찾을 수 없습니다: ${op.path}`, op.path)
      }
      return [{ op: 'add', path: op.path, value: structuredClone(old) }]
    }
    case 'replace': {
      const old = getByPointer(doc, op.path)
      if (old === undefined) {
        throw new PatchError(`바꿀 값을 찾을 수 없습니다: ${op.path}`, op.path)
      }
      return [{ op: 'replace', path: op.path, value: structuredClone(old) }]
    }
    case 'move':
      return inverseOfMove(doc, op)
  }
}

function inverseOfMove(doc: unknown, op: { op: 'move'; from: string; path: string }): PatchOp[] {
  const afterRemove = referenceApplyOp(doc, { op: 'remove', path: op.from })
  const target = resolveMoveTarget(afterRemove, op)
  const overwritten = overwrittenAt(afterRemove, target)

  if (overwritten === null) return [{ op: 'move', from: target, path: op.from }]

  const moved = getByPointer(doc, op.from)
  if (moved === undefined) {
    throw new PatchError(`옮길 값을 찾을 수 없습니다: ${op.from}`, op.from)
  }

  return [
    { op: 'replace', path: target, value: structuredClone(overwritten.value) },
    { op: 'add', path: op.from, value: structuredClone(moved) },
  ]
}

function overwrittenAt(doc: unknown, path: string): { value: unknown } | null {
  const tokens = parsePointer(path)
  const key = tokens[tokens.length - 1]
  if (key === undefined) return null

  const parent = getByPointer(doc, formatPointer(tokens.slice(0, -1)))
  if (Array.isArray(parent) || parent === null || typeof parent !== 'object') return null
  if (!Object.hasOwn(parent, key)) return null

  return { value: (parent as Record<string, unknown>)[key] }
}

function resolveMoveTarget(
  afterRemove: unknown,
  op: { op: 'move'; from: string; path: string },
): string {
  const tokens = parsePointer(op.path)
  if (tokens[tokens.length - 1] !== '-') return op.path

  const parentTokens = tokens.slice(0, -1)
  const parent = getByPointer(afterRemove, formatPointer(parentTokens))

  if (!Array.isArray(parent)) return op.path

  return formatPointer([...parentTokens, String(parent.length)])
}

function inverseOfAdd(doc: unknown, op: { op: 'add'; path: string; value: unknown }): PatchOp {
  const tokens = parsePointer(op.path)
  const key = tokens[tokens.length - 1]
  if (key === undefined) {
    throw new PatchError('문서 루트에는 add를 적용할 수 없습니다', op.path)
  }

  const parentTokens = tokens.slice(0, -1)
  const parent = getByPointer(doc, formatPointer(parentTokens))

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    return { op: 'remove', path: formatPointer([...parentTokens, String(index)]) }
  }

  if (parent !== null && typeof parent === 'object' && Object.hasOwn(parent, key)) {
    const old = (parent as Record<string, unknown>)[key]
    return { op: 'replace', path: op.path, value: structuredClone(old) }
  }

  return { op: 'remove', path: op.path }
}
