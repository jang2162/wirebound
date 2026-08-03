import { getByPointer, parsePointer, readMember } from './pointer'
import { PatchError, type PatchOp } from './types'

/** 연산 하나를 적용한 새 문서를 돌려준다. 입력은 변경하지 않는다. */
export function applyOp<T>(doc: T, op: PatchOp): T {
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

export function applyOps<T>(doc: T, ops: PatchOp[]): T {
  return ops.reduce<T>((acc, op) => applyOp(acc, op), doc)
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
