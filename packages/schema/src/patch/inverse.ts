import { applyOp } from './apply'
import { formatPointer, getByPointer, parsePointer } from './pointer'
import { PatchError, type PatchOp } from './types'

/**
 * 연산 목록의 역연산을 만든다.
 * `doc`은 연산을 적용하기 **전** 문서여야 한다.
 * 돌려받은 목록을 적용 후 문서에 그대로 적용하면 원본으로 돌아간다.
 */
export function invertOps<T>(doc: T, ops: PatchOp[]): PatchOp[] {
  const inverses: PatchOp[] = []
  let current: T = doc

  for (const op of ops) {
    inverses.push(inverseOf(current, op))
    current = applyOp(current, op)
  }

  return inverses.reverse()
}

function inverseOf(doc: unknown, op: PatchOp): PatchOp {
  switch (op.op) {
    case 'add':
      return inverseOfAdd(doc, op)
    case 'remove': {
      const old = getByPointer(doc, op.path)
      if (old === undefined) {
        throw new PatchError(`지울 값을 찾을 수 없습니다: ${op.path}`, op.path)
      }
      return { op: 'add', path: op.path, value: structuredClone(old) }
    }
    case 'replace': {
      const old = getByPointer(doc, op.path)
      if (old === undefined) {
        throw new PatchError(`바꿀 값을 찾을 수 없습니다: ${op.path}`, op.path)
      }
      return { op: 'replace', path: op.path, value: structuredClone(old) }
    }
    case 'move':
      return { op: 'move', from: op.path, path: op.from }
  }
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

  if (parent !== null && typeof parent === 'object' && key in (parent as object)) {
    const old = (parent as Record<string, unknown>)[key]
    return { op: 'replace', path: op.path, value: structuredClone(old) }
  }

  return { op: 'remove', path: op.path }
}
