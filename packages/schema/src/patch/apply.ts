import { getByPointer, parsePointer, readMember } from './pointer'
import { PatchError, type PatchOp } from './types'

/** 연산 하나를 적용한 새 문서를 돌려준다. 입력은 변경하지 않는다. */
export function applyOp<T>(doc: T, op: PatchOp): T {
  return applyOps(doc, [op])
}

/**
 * 연산을 차례로 적용한 새 문서를 돌려준다. 입력 문서도 `ops`의 값도 변경하지 않는다.
 *
 * **문서를 한 번 복제하고 그 사본에 제자리로 적용한다.** 연산마다 문서 전체를 복제하면
 * 비용이 `ops 수 × 문서 크기`가 되고, 서버는 이 함수를 페이지 행 잠금을 쥔 트랜잭션 안에서
 * 부른다(`apps/api/src/services/edit-pipeline.ts`) — 그동안 이벤트 루프가 멈춘다.
 * 값과 재는 법은 `apps/api/README.md` 「편집 파이프라인」 절의 «적용 비용».
 *
 * - **원자적이다.** 도중에 던지면 사본째 버려지므로 반쯤 바뀐 문서가 밖으로 나가지 않는다.
 * - **넣는 값(`add`·`replace`의 `value`)은 복제해서 넣는다.** 뒤 연산이 그 값 안을 제자리로
 *   바꾸므로, 복제하지 않으면 호출자의 `ops`가 바뀐다 — 서버는 같은 `ops`를 revision 으로
 *   저장하고 방송하며, 웹은 보낼 편집으로 들고 있다. 그래서 결과는 `ops`의 값을 참조하지 않는다.
 * - **빈 목록이면 입력을 그대로(같은 참조) 돌려준다.** 복제하지 않는다.
 *
 * **JSON 문서(한 객체가 두 자리에 꽂힌 공유 참조가 없는 문서)에서** 결과가 연산마다 복제하는 단순 구현과 같다 — 문서 ·
 * 역연산 · 오류. `packages/schema/test/patch/equivalence.property.test.ts`가 무작위 JSON 문서와 ops 로 잰다. **공유 참조가
 * 있으면 갈린다** — `structuredClone`은 문서 안의 공유를 보존하고 `move`는 뺀 값을 복제 없이 옮기므로, 옮긴 값 안을 뒤 연산이
 * 바꾸면 다른 자리의 같은 객체도 바뀐다(단순 구현은 `move`마다 복제해 공유를 끊는다). 서버 문서는 jsonb 에서 오고 웹 문서는
 * `JSON` · 이 함수의 결과뿐이라 공유가 생기지 않는다 — 문서를 다른 길로 조립하는 자리가 생기면 그 자리가 공유를 끊는다.
 */
export function applyOps<T>(doc: T, ops: PatchOp[]): T {
  if (ops.length === 0) return doc
  const next = structuredClone(doc)
  for (const op of ops) applyOpInPlace(next, op)
  return next
}

/**
 * 연산 하나를 `doc`에 **제자리로** 적용한다. 패키지 밖에 내보내지 않는다.
 * 던지면 `doc`은 반쯤 바뀐 채 남으므로 부르는 쪽은 자기 사본에만 쓴다(`applyOps` · `invertOps`).
 */
export function applyOpInPlace(doc: unknown, op: PatchOp): void {
  switch (op.op) {
    case 'add':
      addAt(doc, op.path, structuredClone(op.value))
      break
    case 'remove':
      removeAt(doc, op.path)
      break
    case 'replace':
      replaceAt(doc, op.path, structuredClone(op.value))
      break
    case 'move': {
      if (getByPointer(doc, op.from) === undefined) {
        throw new PatchError(`옮길 값을 찾을 수 없습니다: ${op.from}`, op.from)
      }
      // 뺀 값은 문서에서 떨어져 나왔으므로 복제 없이 다시 넣는다.
      addAt(doc, op.path, removeAt(doc, op.from))
      break
    }
    case 'test':
      testAt(doc, op.path, op.value)
      break
  }
}

/** `test` — 그 자리의 값이 `value`와 JSON 으로 같지 않으면(없으면) 던진다. 문서는 안 바꾼다. */
export function testAt(doc: unknown, path: string, value: unknown): void {
  // 뿌리(`""`)는 다른 연산처럼 받지 않는다 — 문서 전체를 견줄 까닭이 없고, 받으면 이 연산만 경로 규칙이 갈린다.
  resolveSlot(doc, path)
  if (!jsonEqual(getByPointer(doc, path), value)) {
    throw new PatchError(`값이 기대와 다릅니다: ${path}`, path)
  }
}

/** JSON 값의 같음(RFC 6902 「test」) — 객체는 키 차례를 안 본다. `undefined`(없는 자리)는 어떤 값과도 같지 않다. */
function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return false
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left)) {
    const other = right as unknown[]
    return left.length === other.length && left.every((item, i) => jsonEqual(item, other[i]))
  }
  const leftKeys = Object.keys(left)
  const rightRecord = right as Record<string, unknown>
  if (leftKeys.length !== Object.keys(rightRecord).length) return false
  return leftKeys.every((key) => Object.hasOwn(rightRecord, key) && jsonEqual((left as Record<string, unknown>)[key], rightRecord[key]))
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

export function addAt(doc: unknown, path: string, value: unknown): void {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent, key, path, true), 0, value)
    return
  }
  ;(parent as Record<string, unknown>)[key] = value
}

/** 지운 값을 돌려준다. */
export function removeAt(doc: unknown, path: string): unknown {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    return parent.splice(arrayIndex(parent, key, path, false), 1)[0]
  }
  const record = parent as Record<string, unknown>
  if (!Object.hasOwn(record, key)) {
    throw new PatchError(`지울 키가 없습니다: ${path}`, path)
  }
  const value = record[key]
  delete record[key]
  return value
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
