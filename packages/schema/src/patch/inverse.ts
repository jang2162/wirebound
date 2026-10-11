import { guardViewStateOps } from '../view-state-guard'
import { addAt, applyOpInPlace, removeAt } from './apply'
import { formatPointer, getByPointer, parsePointer } from './pointer'
import { PatchError, type PatchOp } from './types'

/**
 * 연산 목록의 역연산을 만든다.
 * `doc`은 연산을 적용하기 **전** 문서여야 한다.
 * 돌려받은 목록을 적용 후 문서에 그대로 적용하면 원본으로 돌아간다.
 *
 * **반환 배열의 길이는 입력과 다를 수 있다.** 기존 값을 덮어쓰는 `move`의 역패치는
 * `[replace 대상=옛값, add 출발지=옮긴값]` 두 연산이므로, 연산과 역연산 사이에 1:1
 * 인덱스 대응이 없다. revision 로그·undo UI·API 계층이 인덱스 대응을 가정해서는 안 된다.
 *
 * 덮어쓰기 `move`의 역패치는 옮긴 서브트리를 통째로 품으므로 해당 로그 항목이 원본보다
 * 커진다.
 *
 * 문서는 `applyOps`처럼 **한 번 복제한 사본**을 연산마다 제자리로 진행시킨다(까닭은 그 함수의
 * 독스트링). 입력 문서는 변경하지 않는다.
 *
 * **`test`는 역이 없다** — 문서를 바꾸지 않으므로 그 자리에서 재기만 하고(맞지 않으면 `applyOps`처럼 던진다) 역 묶음에는 싣지 않는다.
 * **역 묶음이 상태 목록의 있는 자리를 고치면 그 자리의 id 를 `test`로 싣는다**(`view-state-guard.ts`) — 되돌리기를 그 사이 남이 목록의
 * 순서를 바꾼 문서에 내면 같은 번호가 남의 상태를 가리킨다. 그래서 역 묶음의 길이는 위 «길이가 다를 수 있다»에 더해 그 `test` 수만큼 는다.
 */
export function invertOps<T>(doc: T, ops: PatchOp[]): PatchOp[] {
  if (ops.length === 0) return []

  // 연산 하나의 역이 여러 개일 수 있으므로 묶음으로 모은다.
  // 묶음 순서만 뒤집고 묶음 **안**의 순서는 그대로 둬야 역이 제대로 적용된다.
  const inverses: PatchOp[][] = []
  const current = structuredClone(doc)

  for (const op of ops) {
    if (op.op === 'move') {
      inverses.push(invertMoveInPlace(current, op))
      continue
    }
    if (op.op !== 'test') inverses.push([inverseOf(current, op)])
    applyOpInPlace(current, op)
  }

  // `current`는 이제 적용 뒤 문서 — 역 묶음이 설 문서다.
  return guardViewStateOps(current, inverses.reverse().flat())
}

/** `add`·`remove`·`replace`의 역. 문서를 읽기만 한다. */
function inverseOf(doc: unknown, op: Exclude<PatchOp, { op: 'move' | 'test' }>): PatchOp {
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
  }
}

/**
 * move의 역을 만들고 그 move를 `doc`에 **제자리로** 적용한다.
 *
 * 목적지가 비어 있으면 반대 방향 move 하나로 끝난다.
 * 하지만 목적지가 **값이 들어 있는 객체 키**면 add 단계(addAt)가 그 값을 덮어쓴다.
 * move 하나는 값 하나만 옮기므로 "노드를 제자리로"와 "덮인 값을 복원"을 함께 담을 수 없다.
 *
 * 그래서 이 경우만 두 연산으로 나눈다. 순서는 replace 먼저다 —
 * 옮긴 노드를 원래 자리(배열)에 먼저 넣으면 뒤 원소가 밀려 목적지 경로가 다른 노드를 가리킨다.
 *
 * **역을 만드는 일과 적용을 한 함수에 둔 까닭:** move는 remove 후 add이고 목적지 판단은 모두
 * **값을 뺀 뒤** 문서를 기준으로 한다. 뺀 문서를 따로 만들면 문서 전체를 한 번 더 복제해야
 * 하므로, 사본에서 실제로 빼고 판단한 뒤 그대로 넣는다. 던지는 순서(출발지 → 목적지 포인터 →
 * 옮길 값 → 목적지 경로)와 문장은 역을 먼저 만들고 `applyOp`을 부르던 순서와 같다.
 */
function invertMoveInPlace(doc: unknown, op: { op: 'move'; from: string; path: string }): PatchOp[] {
  const moved = removeAt(doc, op.from)
  const target = resolveMoveTarget(doc, op)
  const overwritten = overwrittenAt(doc, target)

  if (moved === undefined) {
    throw new PatchError(`옮길 값을 찾을 수 없습니다: ${op.from}`, op.from)
  }

  const inverse: PatchOp[] =
    overwritten === null
      ? [{ op: 'move', from: target, path: op.from }]
      : [
          { op: 'replace', path: target, value: structuredClone(overwritten.value) },
          // 옮긴 값은 사본에 다시 들어가 뒤 연산이 제자리로 바꿀 수 있으므로 복제해 둔다.
          { op: 'add', path: op.from, value: structuredClone(moved) },
        ]

  addAt(doc, op.path, moved)
  return inverse
}

/**
 * add 단계가 덮어쓸 값을 찾는다. 덮어쓰는 값이 없으면 null.
 * 배열 목적지는 splice로 끼워 넣으므로 덮어쓰는 값이 없다.
 * 값이 `undefined`인 키와 없는 키를 구분해야 하므로 값을 감싸서 돌려준다.
 */
function overwrittenAt(doc: unknown, path: string): { value: unknown } | null {
  const tokens = parsePointer(path)
  const key = tokens[tokens.length - 1]
  if (key === undefined) return null

  const parent = getByPointer(doc, formatPointer(tokens.slice(0, -1)))
  if (Array.isArray(parent) || parent === null || typeof parent !== 'object') return null
  if (!Object.hasOwn(parent, key)) return null

  return { value: (parent as Record<string, unknown>)[key] }
}

/**
 * move 목적지의 `-`를 실제 인덱스로 바꾼다.
 * RFC 6902의 move는 remove 후 add이므로 **값을 뺀 뒤** 문서(`afterRemove`)를 기준으로 잡는다.
 * 같은 배열이면 길이가 하나 줄어든 상태가, 다른 배열이면 원래 길이가 기준이다.
 */
function resolveMoveTarget(afterRemove: unknown, op: { op: 'move'; from: string; path: string }): string {
  const tokens = parsePointer(op.path)
  if (tokens[tokens.length - 1] !== '-') return op.path

  const parentTokens = tokens.slice(0, -1)
  const parent = getByPointer(afterRemove, formatPointer(parentTokens))

  // 배열이 아니면 `-`는 그냥 객체 키다. 그대로 둔다.
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
