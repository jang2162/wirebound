// @vitest-environment node
/**
 * **설계서 「소프트 잠금」이 나눈 두 방어가 판정을 나누지 않았다는 것을 소스에서 센다.**
 *
 * > 잠긴 노드는 다른 사용자 화면에 배지가 뜨고 **선택이 차단된다(1차 방어)**.
 * > 서버는 patch 수신 시 잠금 소유자를 **재확인한다(2차 방어)**.
 *
 * **나뉜 것은 자리이지 판정이 아니다.** 판정이 두 벌이면 두 방향으로 갈리고, 갈리는 것을
 * 실행으로 재기 어렵다 — 같은 문서·같은 잠금에서 양쪽이 다른 답을 내야 관측되는데 그 판을
 * 만들려면 두 앱을 한 프로세스에 세워야 한다. **그래서 소스에서 센다.**
 * (`test/realtime/protocol-parity.test.ts`가 프레임 이름에 대해 하는 것과 같은 형태다.)
 *
 * **`apps/api`를 이 파일이 읽는 것은 거울을 든 쪽이 여기이기 때문이다** — 그쪽 파일이
 * `apps/web`을 읽을 수는 없다(의존 방향). protocol parity가 같은 자리에 있다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'

const API_SRC = fileURLToPath(new URL('../../../api/src', import.meta.url))
const WEB_SRC = fileURLToPath(new URL('../../src', import.meta.url))
const SCHEMA_SRC = fileURLToPath(new URL('../../../../packages/schema/src', import.meta.url))

function sourceFiles(root: string, dir = root, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...sourceFiles(root, join(dir, entry.name), relative))
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(relative)
    }
  }
  return found
}

/** 그 패턴이 나오는 파일을 뿌리 기준 상대 경로로. 주석은 먼저 걷는다. */
function filesMatching(root: string, pattern: RegExp): string[] {
  return sourceFiles(root).filter((relative) =>
    new RegExp(pattern.source, pattern.flags).test(stripComments(readFileSync(join(root, relative), 'utf8'))),
  )
}

/**
 * 판정을 부르는 자리 — 노드를 고르는 판정(서버는 집합 전부 · 화면은 노드 하나). 선언은 세지 않는다. 이 판정은 문서를 한 번 돈다 —
 * 노드마다 `findLockConflict`(남의 잠금마다 문서를 훑는다)를 부르면 고른 수 × 남의 잠금 수 번의 훑기가 서버의 동기 구간에 선다
 * (`packages/schema/src/lock.ts`의 `selectionConflicts` «문서를 한 번만 돈다»).
 */
const CALLS_VERDICT = /\bselectionConflicts\s*\(/
/** 판정을 **선언**하는 자리. */
const DECLARES_VERDICT = /export\s+function\s+selectionConflicts\s*\(/
/** 노드마다 따로 묻던 판정 — 앱이 부르지 않는다(위). */
const CALLS_POINTER_VERDICT = /\bfindLockConflict\s*\(/
/**
 * **편집**의 판정을 부르는 자리 — `lockConflictOfOps`는 연산마다 좌표를 맞춰 잠긴 자리를 따라간다(`packages/schema/src/lock.ts`). 편집을
 * 포인터로 모아 `findLockConflict`에 넣으면 앞 연산이 민 좌표를 편집 전 경로와 견줘 뚫린다(C2 리뷰 발견 1).
 */
const CALLS_OPS_VERDICT = /\blockConflictOfOps\s*\(/
const DECLARES_OPS_VERDICT = /export\s+function\s+lockConflictOfOps\s*\(/
/** 잠금 소유자를 비교하는 자리 — 이것이 흩어지면 *"잠금 소유자는 사람이다"*가 자리 수만큼 다시 판정된다. */
const COMPARES_OWNER = /\buserId\s*[!=]==/
/**
 * **살아 있는 잠금 목록을 손에 쥐는 자리**(서버).
 *
 * 판정을 하려면 목록이 있어야 하므로 **어떤 셋째 판정도 여기를 지난다.** 위의 두 정규식은
 * 지나가지 않는 판정을 못 본다 — `ws/lock.ts`에 `nodeId` 동등성으로 획득을 거절하는 판정을
 * 심으면 두 정규식은 **아무것도 죽이지 않는다**(그 변이는 판정만 늘리는 것이 아니라 **동작도
 * 바꾼다**). 이 명제가 그 구멍을 덮는다.
 */
const READS_LOCK_LIST = /\bliveIn\s*\(/
/** 목록을 *"내게 뜻이 있는 것"*으로 좁히는 자리. 이것이 복제되면 소유자 판정이 두 벌이 된다. */
const NARROWS_BY_OWNER = /\blocksAgainst\s*\(/
/** 화면이 스토어의 잠금 목록을 손에 쥐는 자리. `#state`가 private이라 selector 말고 길이 없다. */
const SELECTS_LOCK_LIST = /useEditorStore\s*\([^,]+,\s*\(\s*\w+\s*\)\s*=>\s*\w+\s*\.\s*locks\s*\)/

// 소스를 TypeScript 파서로 훑어 혼자 최대 4.2s 가 걸리는 케이스가 있다 — 기본 한도(5s)로는 붐비는 판(두 배 겹쳐 돌림)에서 일곱이 시간 초과로 빨강이다.
// 한도를 늘려도 훑기가 틀린 답을 내는 것은 그대로 잡힌다(시간 초과는 «돌았다»만 잰다).
describe('판정은 한 벌이다', { timeout: 60_000 }, () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 경로가 어긋나면 **빈 집합에서 아래가 전부 조용히 통과한다.**
    expect(sourceFiles(API_SRC).length).toBeGreaterThan(10)
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(10)
    expect(sourceFiles(SCHEMA_SRC).length).toBeGreaterThan(10)
  })

  it('선언은 `packages/schema`에 하나다 — 앱이 자기 것을 갖지 않는다', () => {
    expect(filesMatching(SCHEMA_SRC, DECLARES_VERDICT)).toEqual(['lock.ts'])
    expect(filesMatching(API_SRC, DECLARES_VERDICT)).toEqual([])
    expect(filesMatching(WEB_SRC, DECLARES_VERDICT)).toEqual([])
  })

  it('**양쪽이** 그것을 부른다 — 한쪽이 0이면 그 방어는 자기 판정을 쓰고 있다', () => {
    // 서버의 2차 방어(`lock/check.ts`)와 화면의 1차 방어(`store/editor-store.ts`)다.
    // **파일을 이름으로 못박는다** — 자리가 늘면 여기서 먼저 죽고, 그때 *"판정이 또 생겼나"*를
    // 사람이 본다.
    expect(filesMatching(API_SRC, CALLS_VERDICT)).toEqual(['lock/check.ts'])
    expect(filesMatching(WEB_SRC, CALLS_VERDICT)).toEqual(['store/editor-store.ts'])
  })

  it('노드마다 따로 묻는 판정(`findLockConflict`)을 앱이 부르지 않는다', () => {
    // 답은 같지만(`packages/schema/test/lock-selection-oracle.test.ts`) 남의 잠금마다 문서를 훑는다 — 서버의 집합 판정에 쓰면 하트비트
    // 하나가 이벤트 루프와 페이지 행을 초 단위로 쥔다(`apps/api/test/ws-lock-cost.test.ts`).
    expect(filesMatching(API_SRC, CALLS_POINTER_VERDICT)).toEqual([])
    expect(filesMatching(WEB_SRC, CALLS_POINTER_VERDICT)).toEqual([])
  })

  it('편집의 판정도 선언은 `packages/schema`에 하나이고 **양쪽이** 그것을 부른다', () => {
    // 서버: `lock/check.ts`의 `lockConflictError`(REST `PATCH …/ops` · WS `patch` · MCP · `PUT …/schema`). 화면: 스토어의 `#editConflict`
    // (끌어 놓기의 `editBlockedBy` · 되돌리기의 `#startFrom`). 화면이 편집을 다른 판정으로 물으면 화면이 받는 자리를 서버가 거절하거나
    // 그 반대다.
    expect(filesMatching(SCHEMA_SRC, DECLARES_OPS_VERDICT)).toEqual(['lock.ts'])
    expect(filesMatching(API_SRC, DECLARES_OPS_VERDICT)).toEqual([])
    expect(filesMatching(WEB_SRC, DECLARES_OPS_VERDICT)).toEqual([])
    expect(filesMatching(API_SRC, CALLS_OPS_VERDICT)).toEqual(['lock/check.ts'])
    expect(filesMatching(WEB_SRC, CALLS_OPS_VERDICT)).toEqual(['store/editor-store.ts'])
  })

  it('편집을 포인터로 바꿔 넣는 옛 길이 앱에 없다', () => {
    // 편집의 포인터를 모아 `findLockConflict`(포인터를 받는 판정)에 넣는 도우미(`lockPointers`)가 서면 좌표가 어긋나는 판정이 다시 선다.
    expect(filesMatching(SCHEMA_SRC, /\blockPointers\b/)).toEqual([])
    expect(filesMatching(API_SRC, /\blockPointers\b/)).toEqual([])
    expect(filesMatching(WEB_SRC, /\blockPointers\b/)).toEqual([])
  })

  it('소유자 비교가 `packages/schema` 밖에 없다', () => {
    // *"누구의 잠금이 뜻이 있는가"*가 앱에 또 생기면, 서버가 막는 것과 화면이 막는 것이
    // 사람 단위/연결 단위로 갈릴 수 있다. 그 비교는 `locksAgainst` 하나다.
    expect(filesMatching(SCHEMA_SRC, COMPARES_OWNER)).toEqual(['lock.ts'])
    // **`ws/notify.ts`는 잠금 소유자를 비교하지 않는다 — 판정한 예외다.** 그 줄은 멤버십이 바뀐 **그 사람의
    // 연결**을 고르는 비교다(`notifyMembershipChanged`). 그 파일에 잠금 판정이 설 수 없는 까닭은 아래 «목록을 읽는 자리는
    // 둘뿐»이 지킨다 — 소유자를 비교할 잠금 목록을 그 파일은 손에 쥐지 않는다. 비교를 글자에서 숨기는 우회(다른 연산자 ·
    // `Object.is`)로 맞추지 않는다 — 자를 속이는 것이지 뜻이 바뀌는 것이 아니다.
    expect(filesMatching(API_SRC, COMPARES_OWNER)).toEqual(['ws/notify.ts'])
    // **`settings/members-section.tsx`도 판정한 예외다** — 설정 페이지의 멤버 줄이 «이 줄이 나인가»(`member.userId === me`)를 본다(나를
    // 바꾸면 페이지가 역할을 다시 읽는다). 그 파일은 잠금 목록을 손에 쥐지 않는다(셸 밖 라우트 — 스토어 · 룸이 없다).
    expect(filesMatching(WEB_SRC, COMPARES_OWNER)).toEqual(['settings/members-section.tsx'])
  })

  it('**살아 있는 잠금 목록을 읽는 자리는 둘뿐이다** — 셋째 판정은 여기서 먼저 보인다', () => {
    // `lock/store.ts`는 그 함수를 **선언한** 자리라 뺀다. 나머지는 목록을 손에 쥐는
    // 자리이고, 오늘 그것은 둘이다 — **알리려고**(`ws/broadcast.ts`) 그리고
    // **판정하려고**(`lock/check.ts`). 셋째가 생기면 그것은 새 판정일 수 있으므로
    // 사람이 봐야 한다.
    const readers = filesMatching(API_SRC, READS_LOCK_LIST).filter((relative) => relative !== 'lock/store.ts')

    expect(readers).toEqual(['lock/check.ts', 'ws/broadcast.ts'])
  })

  it('목록을 좁히는 자리도 하나다 — 판정하는 파일이 `locksAgainst`를 부른다', () => {
    // 이 호출이 사라지면 그 파일이 소유자 판정을 **자기 손으로** 다시 쓴 것이다.
    // (`\buserId\s*[!=]==`를 피한 복제는 위 `COMPARES_OWNER`가 못 본다 — `!Object.is(...)`로
    // 쓴 복제가 그렇다.)
    expect(filesMatching(API_SRC, NARROWS_BY_OWNER)).toEqual(['lock/check.ts'])
  })

  it('화면이 잠금 목록을 손에 쥐는 자리도 하나다 — 판정은 스토어 안에서 끝난다', () => {
    // 스토어의 `#state`는 private이라 밖에서 목록을 얻는 길은 selector뿐이다. 오늘 그것은
    // **다시 그리려는 구독 하나**이고, 판정은 스토어의 `lockedBy` 안에서 끝난다.
    // 여기 줄이 늘면 화면 어딘가가 목록을 직접 들여다본다는 뜻이다.
    //
    // **그 하나는 패널이 아니라 훅이다.** 구조 트리(`panels/structure-tree.tsx`)와 속성 패널이
    // 둘 다 잠금을 보므로 **형제 둘 중 하나에 둘 수 없다** — 한쪽이 다른 쪽에 값을 내려 줄 수
    // 없다. `store/use-locked-by.ts`는 목록을 뒤지지 않고
    // `store.lockedBy`를 그대로 돌려주므로 **이 케이스가 세는 것(«판정이 몇 벌인가»)은
    // 그대로 하나다.** 자리가 「스토어의 React 바인딩」이라 잠금을 보는 화면이 더 생겨도
    // 늘지 않는다.
    expect(filesMatching(WEB_SRC, SELECTS_LOCK_LIST)).toEqual(['store/use-locked-by.ts'])
  })

  it('그 자리가 **판정을 새로 짓지 않는다** — 목록을 쥐는 파일이 곧 판정하는 파일은 아니다', () => {
    // 위 케이스는 *"목록을 쥐는 자리가 하나"*만 세므로, 그 하나가 **자기 손으로** 판정하기
    // 시작하면 조용히 통과한다.
    // `selectionConflicts`를 부르는 자리가 스토어 하나라는 것은 위에서 이미 세므로, 여기서는
    // 그 파일이 **문서를 뒤지는 코드를 갖지 않는다**는 것을 본다.
    //
    // # 이 자가 못 보는 것 — **혼자 믿지 마라**
    //
    // 토큰 셋을 피한 둘째 판정은 그대로 지나간다. `store.lockedBy`를 **남겨 둔 채** 그
    // 옆에 심으면 `toContain`도 통과한다. 표의 판정을 `store/use-locked-by.ts`에 심어서 잰 값이다:
    //
    // | 심은 둘째 판정 | 이 케이스 | **무엇이 잡았나** |
    // |---|---|---|
    // | `locks.find((l) => l.nodeId === nodeId)` | **안 죽음** | 행동 다섯 — `lock/props-lock.test.tsx`의 «내 잠금에는 안 막힌다»·«다른 페이지의 잠금은 안 막는다», `lock/soft-lock.test.tsx`의 «내가 잠근 것에는 안 뜬다»·«다른 페이지의 잠금은 이 화면에 안 뜬다»·«내 잠금은 나를 막지 않는다» |
    // | `for…of` + `store.getState()` + `userId !==` | **안 죽음** | **이 파일의 다른 케이스** — 위 «소유자 비교가 `packages/schema` 밖에 없다»(`COMPARES_OWNER`) |
    // | `.filter(`로, **오늘 답을 안 바꾸는 판** | **혼자 죽음** | (이 케이스 — 웹 전량에서 1 실패) |
    // | `.filter(`로, 답도 바꾸는 판 | 죽음 | 이 케이스 **와 위 다섯이 함께** |
    //
    // **마지막 두 줄이 이 케이스가 있는 이유다.** 답을 안 바꾸는 둘째 판정은 **어떤 행동
    // 케이스도 볼 수 없다** — 오늘은 같은 답을 내니까. 갈리는 것은 나중이고, 그것이 머리말이
    // *"갈리는 것을 실행으로 재기 어렵다 — 그래서 소스에서 센다"*로 적은 그 자리다.
    //
    // **그래서 자를 키우지 않는다.** 토큰을 피한 것마다 **다른 자**가 잡는다 — 자를 더할 때
    // 묻는 «이 자의 사각이 저 자의 사각과 겹치나»의 답이 **안 겹친다**이고, 겹치지 않는 동안은
    // 토큰을 더해도 느는 것이 없다. 이 부류의 자를 키우면 잡는 것은 안 늘고 거짓 초록만 는다.
    //
    // **다만 이 자를 혼자 믿지 마라.** 위 표의 «안 죽음» 둘이 지켜진 것은 여기가 아니라
    // 소유자 판정·페이지 필터의 **행동** 케이스들과 같은 파일의 `COMPARES_OWNER`다.
    const source = stripComments(readFileSync(join(WEB_SRC, 'store/use-locked-by.ts'), 'utf8'))

    expect(source).toMatch(/\bstore\s*\.\s*lockedBy\b/)
    expect(source).not.toMatch(/\bfindNodePath\s*\(|\blocksAgainst\s*\(|\.\s*filter\s*\(/)
  })

  it('검사가 진짜로 무언가를 본다 — 음성 대조', () => {
    // 위 넷이 전부 `[]`를 기대하는 형태이므로, 정규식이 아무것도 안 맞아도 통과할 수 있다.
    // 실제로 맞는 것이 있다는 것을 여기서 본다.
    expect(filesMatching(SCHEMA_SRC, CALLS_VERDICT).length).toBeGreaterThan(0)
    expect(filesMatching(SCHEMA_SRC, CALLS_OPS_VERDICT).length).toBeGreaterThan(0)
    expect(filesMatching(SCHEMA_SRC, CALLS_POINTER_VERDICT).length).toBeGreaterThan(0)
    // `findNodePath`는 화면이 더 부르지 않는다(노드를 고르는 판정이 노드 id 를 받는다) — 위 «판정을 새로 짓지 않는다»의 정규식이
    // 맞는 것이 있다는 것을 선언하는 쪽에서 본다.
    expect(filesMatching(SCHEMA_SRC, /\bfindNodePath\s*\(/).length).toBeGreaterThan(0)
  })

  /**
   * **`COMPARES_OWNER`는 반대 방향으로 무르다.**
   *
   * 그 정규식은 잠금과 무관한 `userId` 비교도 잡는다. *"내가 이 코멘트의 작성자인가"* 같은
   * 비교가 어느 파일에든 생기면 위 케이스가 **잠금과 상관없이** 빨개진다. 좁히지 않는 것은
   * 판정이다 — 좁히면 잠금 판정의 복제가 그 틈으로 새고, 그쪽이 더 비싸다. 대신 그때 무엇을
   * 봐야 하는지를 여기 적어 둔다: **걸린 자리가 잠금 목록을 손에 쥐는가**(위 두 케이스)를
   * 먼저 보라. 안 쥐면 그것은 잠금 판정이 아니고, 이 검사에 예외를 두면 된다.
   */
  it('무른 자리를 이름과 함께 남긴다 — 이 케이스는 위 규칙을 설명한다', () => {
    expect(COMPARES_OWNER.test('if (comment.authorUserId === me.id) return')).toBe(false)
    expect(COMPARES_OWNER.test('if (comment.userId === me.id) return')).toBe(true)
  })
})
