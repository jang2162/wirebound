/**
 * **상태 목록의 있는 자리를 고치는 연산 앞에 그 자리의 `id`를 `test`로 싣는다.**
 *
 * 상태 목록(`/viewStates`)은 번호로만 가리킬 수 있다. 내 묶음을 지은 뒤 남이 목록의 순서를 바꾸거나 항목을 빼면 같은 번호가 **다른 상태**를
 * 가리키고, 그 연산은 던지지 않고 얹힌다 — 판 번호만 새로 받아 같은 묶음을 다시 내는 클라이언트 · 서버가 지은 역연산을 그대로 내는 되돌리기가
 * 남의 상태를 빼거나 남의 상태 이름을 덮었다(`apps/api/test/view-states-anchor.test.ts`). `test`가 실리면 그 판은 적용 실패(서버 409
 * `conflict` — 다시 읽고 다시 짓는 길)다. 노드는 이 장치가 없다 — 웹의 리베이스 · 되돌리기가 노드 id 로 다시 짚는다(`apps/web`의
 * `store/anchored-ops.ts` — 상태도 그 표의 한 줄이다).
 *
 * | 연산이 가리키는 자리 | 싣는 `test` |
 * |---|---|
 * | 항목 하나(`/viewStates/<i>`)를 빼기 · 바꾸기 · 옮겨 오기(`move`의 `from`) | `/viewStates/<i>/id` = 그 항목의 id |
 * | 항목 안(`/viewStates/<i>/…`) — 연산 종류와 무관 | `/viewStates/<i>/id` = 그 항목의 id(옮겨 넣는 자리면 옮긴 뒤 문서에서 읽어 그 `move` 뒤에) |
 * | 목록째(`/viewStates`)를 빼기 · 바꾸기 · 옮겨 오기 · 있는 목록 위 `add`(바꾸기가 된다) | `/viewStates` = 그 목록 값 전부 |
 * | 넣는 자리(`add /viewStates/<i>` · `/viewStates/-` · `move`의 `path`) · 없는 목록을 만드는 `add` | 없음 — 남의 것을 가리키지 않는다 |
 *
 * **목록째 연산은 값 전부를 싣는다** — 목록을 처음 만든 편집의 되돌리기(`remove /viewStates`)가 그 사이 남이 더한 상태까지 지웠다. 없는 목록을
 * 만드는 `add`는 `test`로 «없음»을 말할 수 없어 싣지 않는다 — 웹의 리베이스는 그 전제(«목록이 없었다»)를 따로 본다(`anchored-ops.ts`의 «전제가
 * 바뀐 op»).
 *
 * `test`의 값은 **그 연산 직전의 문서**에서 읽는다 — 앞 연산이 목록을 바꾸면 뒤 연산의 `test`는 바뀐 목록의 것이다. 묶음이 이미 실은
 * `test`는 그대로 두고 다시 싣지 않는다(그 연산이 가리키는 남의 자리가 없다).
 */
import { applyOpInPlace } from './patch/apply'
import { getByPointer, parsePointer } from './patch/pointer'
import type { PatchOp } from './patch/types'

const LIST = 'viewStates'

/** 이 포인터가 상태 목록 안인가 — 글자로 먼저 거른다(목록을 안 건드리는 묶음은 문서를 복제하지 않는다). */
function inList(pointer: string): boolean {
  return pointer === `/${LIST}` || pointer.startsWith(`/${LIST}/`)
}

/**
 * `ops`(그 묶음이 설 문서 `doc` 위)의 상태 목록 연산마다 위 표의 `test`를 앞에 둔 묶음. 목록을 안 건드리면 `ops` 그대로다. 적용이 실패하는
 * 연산을 만나면 그 뒤는 그대로 둔다 — 그 묶음은 어차피 적용에서 던진다.
 */
export function guardViewStateOps(doc: unknown, ops: readonly PatchOp[]): PatchOp[] {
  if (!ops.some((op) => op.op !== 'test' && (inList(op.path) || (op.op === 'move' && inList(op.from))))) return [...ops]
  const current: unknown = structuredClone(doc)
  const out: PatchOp[] = []
  // 묶음이 이미 실은 `test`(바로 앞에 이어진 것)와 같은 것은 다시 싣지 않는다.
  const push = (guard: PatchOp | null) => {
    if (guard === null) return
    for (let j = out.length - 1; j >= 0 && out[j]!.op === 'test'; j -= 1) {
      const prior = out[j] as { path: string; value: unknown }
      if (prior.path === guard.path && JSON.stringify(prior.value) === JSON.stringify((guard as { value: unknown }).value)) return
    }
    out.push(guard)
  }
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i]!
    if (op.op === 'move') {
      push(guardAt(current, op.from, false))
      // 목록째에 옮겨 넣으면 있던 목록을 덮는다 — 옮기기 전에 그 목록을 잰다.
      if (op.path === `/${LIST}`) push(guardAt(current, op.path, true))
    } else if (op.op !== 'test') {
      push(guardAt(current, op.path, op.op === 'add'))
    }
    out.push(op)
    try {
      applyOpInPlace(current, op)
    } catch {
      return [...out, ...ops.slice(i + 1)]
    }
    // 옮겨 넣은 자리가 항목 **안**이면 그 항목은 옮긴 뒤 문서에서 읽고 옮긴 뒤에 싣는다 — 같은 목록에서 옮겨 오면 뺀 만큼 번호가 당겨진다.
    // 묶음은 원자적이라 뒤에 실린 `test`의 실패도 묶음째 실패다.
    if (op.op === 'move' && op.path !== `/${LIST}`) push(guardAt(current, op.path, true))
  }
  return out
}

/** 포인터 하나가 가리키는 **있는** 자리의 `test`(위 표). 없거나 넣는 자리면 `null`. */
function guardAt(doc: unknown, pointer: string, inserting: boolean): PatchOp | null {
  if (!inList(pointer)) return null
  let tokens: string[]
  try {
    tokens = parsePointer(pointer)
  } catch {
    return null
  }
  const list = getByPointer(doc, `/${LIST}`)
  if (tokens.length === 1) {
    // 목록째 — 있는 목록을 빼거나 덮는 연산(있는 목록 위 `add` · 옮겨 넣기는 덮기다). 없는 목록을 만드는 `add`는 `list`가 없어 빠진다.
    return list === undefined ? null : { op: 'test', path: `/${LIST}`, value: structuredClone(list) }
  }
  // 항목 자리에 넣는 연산(`add` · `move`의 `path`)은 남의 것을 가리키지 않는다 — 항목 **안**에 넣는 것은 그 항목을 가리킨다.
  if (tokens.length === 2 && inserting) return null
  if (!Array.isArray(list)) return null
  // 번호는 적용과 같은 규칙으로 읽는다(`patch/pointer.ts`의 `readMember` — `Number(token)`).
  const index = Number(tokens[1])
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return null
  const entry: unknown = list[index]
  if (entry === null || typeof entry !== 'object' || typeof (entry as { id?: unknown }).id !== 'string') return null
  return { op: 'test', path: `/${LIST}/${index}/id`, value: (entry as { id: string }).id }
}
