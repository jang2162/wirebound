/**
 * 소프트 잠금의 **판정 한 벌**(설계서 「소프트 잠금」).
 *
 * 「소프트 잠금」은 방어를 둘로 나눴다 — *"잠긴 노드는 다른 사용자 화면에 배지가 뜨고 선택이
 * 차단된다(1차 방어)"*, *"서버는 patch 수신 시 잠금 소유자를 재확인한다(2차 방어)"*.
 * **나뉜 것은 방어이지 판정이 아니다.** 판정을 양쪽이 각자 쓰면 갈리고, 갈린 판정은 두
 * 방향으로 틀린다: 화면이 안 막는 것을 서버가 거절하면 사용자는 눌렀는데 아무 일도 안 나는
 * 것을 보고, 화면이 막는 것을 서버가 통과시키면 다른 클라이언트가 잠금을 지나간다.
 * (`partitionIssues`·`gatePageImport`가 같은 이유로 한 벌이다.)
 *
 * # 왜 `packages/schema`인가
 *
 * `apps/api`와 `apps/web`은 서로 import할 수 없고(`CLAUDE.md`의 의존 방향), 둘 다 이
 * 패키지에 의존한다 — **양쪽이 부를 수 있는 자리는 여기뿐이다.** 그리고 이 파일이 묻는 것은
 * 전송도 저장도 아닌 **노드 트리와 JSON Pointer의 관계**다(`tree.ts`·`patch/pointer.ts`가 이미
 * 그 어휘를 갖는다). 잠금의 **수명**(TTL·하트비트·연결 종료)은 여기 없다 — 그것은 서버가
 * 갖고, 이 파일은 살아 있다고 서버가 말한 것만 받는다.
 *
 * # 판정의 전부
 *
 * > 잠금이 가리키는 노드의 경로와 편집이 건드리는 경로가 **한쪽이 다른 쪽의 조상**이면
 * > 부딪친다. 소유자가 나 자신이면 부딪치지 않는다.
 *
 * 조상 관계를 **양방향**으로 보는 것이 요점이다. 잠긴 것의 안을 고치는 것(내려가는 쪽)만
 * 막으면 `PUT .../schema`가 내는 `replace /root`처럼 **잠긴 것을 통째로 없애는 편집**이
 * 지나간다.
 */
import type { WbNode } from './node'
import { addAt, applyOpInPlace, removeAt } from './patch/apply'
import { getByPointer, parsePointer, readMember } from './patch/pointer'
import { PatchError, type PatchOp } from './patch/types'
import { findNodePath } from './tree'
import { childLists } from './zones'

/**
 * 살아 있는 잠금 하나. **서버가 준 그대로다** — 만료 판정은 서버가 이미 했다.
 *
 * `userName`이 있는 것은 「소프트 잠금」의 *"○○ 편집 중"* 배지 때문이다. 화면이 `userId`로 참가자
 * 목록을 다시 뒤지게 하면 그 목록이 낡았을 때 **잠금이 조용히 사라진다** —
 * 이름을 잠금이 직접 나르면 그 일이 없다.
 */
export interface NodeLock {
  nodeId: string
  /** **연결이 아니라 사람이다.** 같은 사람의 다른 탭은 서로를 막지 않는다. */
  userId: string
  userName: string
}

export interface LockConflictInput {
  root: WbNode
  locks: readonly NodeLock[]
  /**
   * 문서 루트(`{version, root}`) 기준 JSON Pointer들 — **`root`의 좌표다.** **편집(`ops`)은 여기 넣지 않는다** — 편집의 포인터는 앞
   * 연산을 적용한 뒤 문서의 좌표라 `root`의 좌표와 어긋난다. 편집은 `lockConflictOfOps`가 연산마다 좌표를 맞춰 이 함수와 같은 겹침으로
   * 잰다. **노드를 고르는 판정도 여기 넣지 않는다** — 그것은 `selectionConflicts`다(이 함수는 남의 잠금마다 문서를 훑는다).
   */
  pointers: readonly string[]
  /** 이 사람의 잠금은 부딪치지 않는다(소유자는 사람이다 — `NodeLock.userId`). */
  viewerUserId: string
}

/**
 * 부딪치는 **첫 잠금**을 낸다. 없으면 `null`이다.
 *
 * **전부가 아니라 하나인 것은 부르는 쪽이 하나만 쓰기 때문이다** — 서버는 거절하면 그만이고,
 * 화면은 배지에 이름 하나를 그린다. `locks`의 순서를 서버가 정하므로 여럿이 부딪칠 때 어느
 * 것이 나오는지는 그 순서가 정한다.
 *
 * **가리키는 노드가 문서에 없는 잠금은 아무것도 막지 못한다.** 경로가 없으면 부딪칠 자리가
 * 없다 — 남이 그 노드를 지웠는데 잠금이 아직 남은 판이고, 그때 막으면 **이미 없는 것을
 * 지키느라 문서 전체가 막힌다.**
 */
export function findLockConflict(input: LockConflictInput): NodeLock | null {
  const targets = input.pointers.map(segmentsOf)

  for (const lock of locksAgainst(input.locks, input.viewerUserId)) {
    const lockPath = findNodePath(input.root, lock.nodeId)
    if (lockPath === undefined) continue
    const lockSegments = segmentsOf(lockPath)
    if (lockSegments === null) continue
    if (targets.some((target) => target !== null && overlaps(lockSegments, target))) return lock
  }

  return null
}

export interface SelectionConflictInput {
  root: WbNode
  locks: readonly NodeLock[]
  /** 고르려는 노드들 — **노드마다 그 서브트리를 통째로 claim 한다**(설계서 「소프트 잠금」). 서로는 견주지 않는다(같은 사람이다). */
  nodeIds: readonly string[]
  /** 이 사람의 잠금은 부딪치지 않는다(`locksAgainst`). */
  viewerUserId: string
}

/**
 * **이 노드들을 고를 수 있나** — 노드마다 부딪치는 **첫 잠금**(`nodeIds`와 같은 차례 · 없으면 `null`). 서버의 획득 판정(`apps/api`의
 * `lock/check.ts`의 `selectionVerdict` — 잠금 프레임의 집합 전부)과 화면의 1차 방어(`apps/web`의 `store/editor-store.ts`의
 * `lockedBy` — 노드 하나)가 **이 함수 하나**를 부른다.
 *
 * 겹침은 `findLockConflict`와 같다 — 고른 노드와 잠긴 노드 가운데 **한쪽이 다른 쪽의 조상이거나 같으면** 부딪친다. 여럿이 부딪치면
 * `locks`의 차례로 첫 것이다(배지가 그 이름을 그린다). 같은 id 가 문서에 둘이면 전위 순회의 **첫 자리**다(`findNodePath`와 같다). 가리키는
 * 노드가 문서에 없는 잠금은 아무것도 막지 못하고, 문서에 없는 노드는 막을 것이 없다.
 *
 * # 문서를 한 번만 돈다
 *
 * 노드마다 `findLockConflict`를 부르면 그 안에서 남의 잠금마다 `findNodePath`로 문서를 다시 훑는다 — 고른 수 × 남의 잠금 수 번의 훑기다.
 * 서버는 잠금 프레임(하트비트 — 웹은 편집마다 보낸다)마다 집합 전부를 이것으로 판정하고, 그 판정은 동기라 이벤트 루프와 페이지 행을 쥔다
 * (`apps/api`의 `ws/lock.ts`의 «판정과 잡기는 같은 틱이다»). 그래서 한 번 돌며 자리마다 번호(전위 순서)와 부모를 적고, 잠금을 그 자리에
 * 놓은 뒤 «서브트리 안의 가장 앞선 잠금»(뒤에서 앞으로 부모에 모음)과 «조상 사슬의 가장 앞선 잠금»(앞에서 뒤로 부모에서 물려받음)을
 * 한 번씩 짓는다 — 노드마다 그 둘의 앞선 쪽이 답이다. 문서 노드 수 + 잠금 수 + 고른 수에 비례한다. 옛 판정(노드마다 따로)과 답이 같은지는
 * `test/lock-selection-oracle.test.ts`가 무작위 판으로 잰다.
 *
 * **검증 전 문서에서 던지지 않는다** — 자식 줄 안의 노드가 아닌 원소(`null` 등)는 노드가 아니라 건너뛴다(화면은 검증 전 문서로 묻는다 —
 * `apps/web`의 `edit/safe-walk.ts`). 남의 잠금이 없거나 고른 것이 없으면 문서를 돌지 않는다.
 */
export function selectionConflicts(input: SelectionConflictInput): (NodeLock | null)[] {
  const against = locksAgainst(input.locks, input.viewerUserId)
  if (against.length === 0 || input.nodeIds.length === 0) return input.nodeIds.map(() => null)

  // 전위 순서의 자리마다 부모 자리 · 처음 나온 id 의 자리. 스택에 자식을 거꾸로 쌓아 `walkNodes`와 같은 차례로 돈다.
  const parent: number[] = []
  const firstAt = new Map<string, number>()
  const stack: { node: WbNode; up: number }[] = [{ node: input.root, up: -1 }]
  while (stack.length > 0) {
    const { node, up } = stack.pop()!
    const at = parent.length
    parent.push(up)
    if (!firstAt.has(node.id)) firstAt.set(node.id, at)
    // 자식 줄은 몸통과 구역 전부다(`childLists`) — 구역 안 노드가 빠지면 그 안의 남의 잠금을 고른 조상이 지난다.
    const lists = childLists(node)
    for (let l = lists.length - 1; l >= 0; l -= 1) {
      const list = lists[l]!.list
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const child: unknown = list[i]
        if (child !== null && typeof child === 'object') stack.push({ node: child as WbNode, up: at })
      }
    }
  }

  // 자리마다 «그 자리에 선 가장 앞선 잠금»의 차례 — `none`은 없음.
  const none = against.length
  const own = new Array<number>(parent.length).fill(none)
  against.forEach((lock, order) => {
    const at = firstAt.get(lock.nodeId)
    if (at !== undefined && order < own[at]!) own[at] = order
  })
  // 서브트리 안: 전위 순서에서 자식은 부모보다 뒤라, 뒤에서 앞으로 부모에 모은다. 조상 사슬: 앞에서 뒤로 부모에서 물려받는다.
  const inside = own.slice()
  for (let at = parent.length - 1; at > 0; at -= 1) {
    const up = parent[at]!
    if (inside[at]! < inside[up]!) inside[up] = inside[at]!
  }
  const above = own.slice()
  for (let at = 1; at < parent.length; at += 1) {
    const up = parent[at]!
    if (above[up]! < above[at]!) above[at] = above[up]!
  }

  return input.nodeIds.map((nodeId) => {
    const at = firstAt.get(nodeId)
    if (at === undefined) return null
    const order = Math.min(inside[at]!, above[at]!)
    return order === none ? null : against[order]!
  })
}

/**
 * 이 사람에게 **뜻이 있는** 잠금만(소유자는 사람이다).
 *
 * **`findLockConflict`가 안에서 이것을 쓴다.** 밖으로도 내는 것은 부르는 쪽이 *"볼 잠금이
 * 하나라도 있나"*를 먼저 물어 **문서 조회를 건너뛸 수 있게** 하기 위해서다(`apps/api`의
 * `lock/check.ts`). 그 자리에서 `userId`를 다시 비교하면 **누구의 잠금이 뜻이 있는가**가
 * 두 벌이 되고, 파일 머리말의 두 방향 틀림이 그 자리에서 다시 생긴다.
 */
export function locksAgainst(locks: readonly NodeLock[], viewerUserId: string): NodeLock[] {
  return locks.filter((lock) => lock.userId !== viewerUserId)
}

export interface OpsLockConflictInput {
  /** 편집 **전** 문서(`{version, root}`) — `ops`의 첫 연산이 선 문서다. 바꾸지 않는다. */
  document: { readonly root: WbNode }
  locks: readonly NodeLock[]
  ops: readonly PatchOp[]
  /** 이 사람의 잠금은 부딪치지 않는다(`locksAgainst`). */
  viewerUserId: string
}

/**
 * 그 **편집**이 부딪치는 첫 잠금. 없으면 `null`이다 — 서버의 2차 방어(`apps/api`의 `lock/check.ts`)와 화면이 편집을 묻는 자리(`apps/web`의
 * `store/editor-store.ts` — 끌어 놓기 · 되돌리기)가 **이 함수 하나**를 부른다.
 *
 * # 좌표는 연산마다 다르다
 *
 * RFC 6902 의 포인터는 **앞 연산을 적용한 뒤 문서**의 좌표이고, `move`의 `path`는 `from`을 **뺀 뒤** 문서의 좌표다(`patch/apply.ts`의
 * `move`). 잠긴 노드의 경로는 편집 **전** 문서에서 찾으므로, 편집의 포인터를 그대로 견주면 앞쪽 형제를 빼거나 넣은 묶음에서 한 칸
 * 어긋난다 — 잠긴 서브트리를 건드리는 편집이 안 겹치는 포인터로 지나가고, 안 건드리는 편집이 겹치는 포인터로 막힌다
 * (`test/lock-shifted-pointers.test.ts`). **그래서 잠긴 노드의 자리를 연산마다 따라간다:**
 *
 * 1. 편집 전 문서에서 잠긴 노드마다 경로를 찾는다(가리키는 노드가 없는 잠금은 아무것도 막지 못한다 — `findLockConflict`와 같다).
 * 2. 연산마다 그 연산이 선 문서에서 포인터를 **적용과 같은 규칙으로** 읽는다(`canonicalAt`) — `move`는 `from`을 그 문서에서,
 *    `path`를 `from`을 뺀 문서에서. 잠긴 자리와 겹치면(한쪽이 다른 쪽의 조상이거나 같다 — `findLockConflict`와 같은 `overlaps`) 그 잠금을 낸다.
 * 3. 연산을 사본에 적용하고, 배열에 넣거나 뺀 자리보다 뒤에 선 잠긴 자리의 번호를 한 칸 민다(`shiftAfterRemove` · `shiftAfterAdd`).
 *
 * **노드 id 로 다시 찾지 않고 자리를 따라가는 것이 요점이다.** id 로 찾으면 앞 연산이 다른 노드의 `id`를 잠긴 노드의 id 로 바꾼
 * 묶음(`replace …/id` 뒤 `remove` 잠긴 노드)에서 잠금이 그 가짜를 가리켜 진짜를 지우는 연산이 지나간다. 자리를 따라가면 잠긴 노드를
 * 옮기거나 지우는 연산은 그 자리 자체와 겹친다.
 *
 * **포인터를 적용과 같은 규칙으로 읽는 것도 요점이다.** 배열의 번호는 `Number(token)`으로 읽혀(`patch/pointer.ts`의 `readMember` ·
 * `patch/apply.ts`의 `arrayIndex`) `/root/children/01`도 `/root/children/1`을 고친다. 글자로 견주면 그 편집이 잠긴 자리를 지난다.
 *
 * # 판정하지 않는 것
 *
 * **적용이 실패하는 연산에 닿으면 `null`이다**(없는 경로 · 범위 밖 번호 · 읽을 수 없는 포인터 · 뿌리 자체) — 그 앞의 연산이 부딪친
 * 잠금이 없을 때다. 그 편집은 파이프라인이 `patch-failed`로 거절하므로(`applyOps`가 같은 규칙으로 던진다) 잠금 충돌로 덮지 않는다
 * — 사용자가 **겪지 않은 실패**를 듣는다. 그 연산 자체가 잠긴 자리와 겹치면 적용 전에 낸다.
 *
 * **던지지 않는다.** 화면은 검증 전 문서로 묻는다(`children` 안의 `null` — `apps/web`의 `edit/safe-walk.ts`) — 잠긴 노드를 못 찾으면
 * `null`이다.
 */
export function lockConflictOfOps(input: OpsLockConflictInput): NodeLock | null {
  const against = locksAgainst(input.locks, input.viewerUserId)
  if (against.length === 0 || input.ops.length === 0) return null

  const held: { lock: NodeLock; at: string[] }[] = []
  try {
    for (const lock of against) {
      const path = findNodePath(input.document.root, lock.nodeId)
      if (path !== undefined) held.push({ lock, at: parsePointer(path) })
    }
  } catch {
    return null
  }
  if (held.length === 0) return null

  const hit = (at: Canonical): NodeLock | null => held.find((entry) => overlaps(entry.at, at.tokens))?.lock ?? null
  const doc: unknown = structuredClone(input.document)
  for (const op of input.ops) {
    try {
      if (op.op === 'move') {
        const from = canonicalAt(doc, op.from, false)
        const fromHit = hit(from)
        if (fromHit !== null) return fromHit
        if (getByPointer(doc, op.from) === undefined) throw new PatchError(`옮길 값을 찾을 수 없습니다: ${op.from}`, op.from)
        const moved = removeAt(doc, op.from)
        shiftAfterRemove(held, from)
        const to = canonicalAt(doc, op.path, true)
        const toHit = hit(to)
        if (toHit !== null) return toHit
        addAt(doc, op.path, moved)
        shiftAfterAdd(held, to)
        continue
      }
      // `test`는 문서를 안 바꾼다 — 잠긴 노드를 건드리지 않는다. 맞지 않으면 적용이 실패하므로 재기만 한다(아래 `catch` — 판정하지 않는 것).
      if (op.op === 'test') {
        applyOpInPlace(doc, op)
        continue
      }
      const at = canonicalAt(doc, op.path, op.op === 'add')
      const atHit = hit(at)
      if (atHit !== null) return atHit
      applyOpInPlace(doc, op)
      if (op.op === 'remove') shiftAfterRemove(held, at)
      if (op.op === 'add') shiftAfterAdd(held, at)
    } catch {
      return null
    }
  }
  return null
}

/** 포인터를 그 문서에서 **적용이 읽는 대로** 읽은 것 — 배열 번호는 `String(Number(token))`, 넣는 자리의 `-`는 배열 길이. */
interface Canonical {
  tokens: string[]
  /** 마지막 토큰이 배열 안의 번호인가 — 넣고 빼면 뒤 형제의 번호가 밀린다. */
  inArray: boolean
}

/**
 * `patch/apply.ts`의 `resolveSlot` · `arrayIndex`와 같은 길로 읽는다. **읽지 못한 토큰은 그대로 둔다** — 그 연산은 적용에서 던지므로
 * (`lockConflictOfOps`의 «판정하지 않는 것») 여기서는 겹침만 잰다.
 */
function canonicalAt(doc: unknown, pointer: string, inserting: boolean): Canonical {
  const tokens = parsePointer(pointer)
  const out: string[] = []
  let container: unknown = doc
  let inArray = false
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!
    const last = i === tokens.length - 1
    inArray = Array.isArray(container)
    let canonical = token
    if (Array.isArray(container)) {
      if (last && inserting && token === '-') canonical = String(container.length)
      else if (Number.isInteger(Number(token))) canonical = String(Number(token))
    }
    out.push(canonical)
    if (!last) container = container === null || container === undefined ? undefined : readMember(container, token)
  }
  return { tokens: out, inArray }
}

/** 배열에서 `at`을 뺐다 — 같은 배열에서 그 뒤에 선 잠긴 자리를 한 칸 당긴다. 겹친 자리는 여기 오기 전에 부딪쳤다. */
function shiftAfterRemove(held: { at: string[] }[], at: Canonical): void {
  shiftSiblings(held, at, -1)
}

/** 배열의 `at`에 넣었다 — 같은 배열에서 그 자리 이후에 선 잠긴 자리를 한 칸 민다. */
function shiftAfterAdd(held: { at: string[] }[], at: Canonical): void {
  shiftSiblings(held, at, 1)
}

function shiftSiblings(held: { at: string[] }[], at: Canonical, by: 1 | -1): void {
  if (!at.inArray || at.tokens.length === 0) return
  const depth = at.tokens.length - 1
  const index = Number(at.tokens[depth])
  for (const entry of held) {
    if (entry.at.length <= depth) continue
    if (!overlaps(entry.at.slice(0, depth), at.tokens.slice(0, depth))) continue
    const mine = Number(entry.at[depth])
    if (by === -1 ? mine > index : mine >= index) entry.at[depth] = String(mine + by)
  }
}

/**
 * 포인터를 세그먼트로. **읽을 수 없으면 `null`이다.**
 *
 * `parsePointer`가 던지는 것은 두 가지다 — `/`로 시작하지 않는 문자열과 프로토타입 오염
 * 토큰(`__proto__` 등). **둘 다 `applyOps`가 같은 파서로 거절하는 입력이므로**(`patch/apply.ts`)
 * 그런 편집은 잠금과 무관하게 `patch-failed`가 된다. 여기서 던지면 잠금 확인이 500이 되고,
 * 그것은 *"편집이 거절됐다"*가 아니라 *"서버가 깨졌다"*로 보인다.
 */
function segmentsOf(pointer: string): string[] | null {
  try {
    return parsePointer(pointer)
  } catch {
    return null
  }
}

/** 한쪽이 다른 쪽의 조상이거나 같은가. **세그먼트 단위다** — 문자열 접두사로 재면 `children/10`이 `children/1`의 안이 된다. */
function overlaps(a: readonly string[], b: readonly string[]): boolean {
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
