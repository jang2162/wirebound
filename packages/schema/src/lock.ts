/**
 * 소프트 잠금의 **판정 한 벌**(설계 §7.2).
 *
 * §7.2는 방어를 둘로 나눴다 — *"잠긴 노드는 다른 사용자 화면에 배지가 뜨고 선택이
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
import { parsePointer } from './patch/pointer'
import type { PatchOp } from './patch/types'
import { findNodePath } from './tree'

/**
 * 살아 있는 잠금 하나. **서버가 준 그대로다** — 만료 판정은 서버가 이미 했다.
 *
 * `userName`이 있는 것은 §7.2의 *"○○ 편집 중"* 배지 때문이다. 화면이 `userId`로 참가자
 * 목록을 다시 뒤지게 하면 그 목록이 낡았을 때(P3-2 이월 §2.5) **잠금이 조용히 사라진다** —
 * 이름을 잠금이 직접 나르면 그 일이 없다.
 */
export interface NodeLock {
  nodeId: string
  /** **연결이 아니라 사람이다**(P3-3 D3). 같은 사람의 다른 탭은 서로를 막지 않는다. */
  userId: string
  userName: string
}

export interface LockConflictInput {
  root: WbNode
  locks: readonly NodeLock[]
  /**
   * 문서 루트(`{version, root}`) 기준 JSON Pointer들. **편집이면 `lockPointers(ops)`이고
   * 선택이면 `findNodePath(root, nodeId)` 하나다** — 두 방어가 같은 함수에 다른 자리를
   * 넣는 것이 D7이 요구한 형태다.
   */
  pointers: readonly string[]
  /** 이 사람의 잠금은 부딪치지 않는다(D3). */
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

  for (const lock of input.locks) {
    if (lock.userId === input.viewerUserId) continue
    const lockPath = findNodePath(input.root, lock.nodeId)
    if (lockPath === undefined) continue
    const lockSegments = segmentsOf(lockPath)
    if (lockSegments === null) continue
    if (targets.some((target) => target !== null && overlaps(lockSegments, target))) return lock
  }

  return null
}

/**
 * `ops`가 건드리는 자리 전부.
 *
 * **`move`는 둘을 낸다.** 뽑는 자리(`from`)와 꽂는 자리(`path`)가 서로 다른 서브트리일 수
 * 있고, 어느 쪽이든 남의 잠금 안이면 그 편집은 남의 것을 건드린다.
 */
export function lockPointers(ops: readonly PatchOp[]): string[] {
  const pointers: string[] = []
  for (const op of ops) {
    if (op.op === 'move') pointers.push(op.from)
    pointers.push(op.path)
  }
  return pointers
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
