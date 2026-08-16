// @vitest-environment node
/**
 * **§7.2가 나눈 두 방어가 판정을 나누지 않았다는 것을 소스에서 센다**(P3-3 D7).
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

const API_SRC = fileURLToPath(new URL('../../../api/src', import.meta.url))
const WEB_SRC = fileURLToPath(new URL('../../src', import.meta.url))
const SCHEMA_SRC = fileURLToPath(new URL('../../../../packages/schema/src', import.meta.url))

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

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

/** 판정을 부르는 자리. 선언은 세지 않는다. */
const CALLS_VERDICT = /\bfindLockConflict\(/
/** 판정을 **선언**하는 자리. */
const DECLARES_VERDICT = /export function findLockConflict\(/
/** 잠금 소유자를 비교하는 자리 — 이것이 흩어지면 D3이 자리 수만큼 다시 판정된다. */
const COMPARES_OWNER = /\buserId\s*[!=]==/

describe('판정은 한 벌이다 (D7)', () => {
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

  it('소유자 비교가 `packages/schema` 밖에 없다 (D3)', () => {
    // *"누구의 잠금이 뜻이 있는가"*가 앱에 또 생기면, 서버가 막는 것과 화면이 막는 것이
    // 사람 단위/연결 단위로 갈릴 수 있다. 그 비교는 `locksAgainst` 하나다.
    expect(filesMatching(SCHEMA_SRC, COMPARES_OWNER)).toEqual(['lock.ts'])
    expect(filesMatching(API_SRC, COMPARES_OWNER)).toEqual([])
    expect(filesMatching(WEB_SRC, COMPARES_OWNER)).toEqual([])
  })

  it('검사가 진짜로 무언가를 본다 — 음성 대조', () => {
    // 위 넷이 전부 `[]`를 기대하는 형태이므로, 정규식이 아무것도 안 맞아도 통과할 수 있다.
    // 실제로 맞는 것이 있다는 것을 여기서 본다.
    expect(filesMatching(SCHEMA_SRC, CALLS_VERDICT).length).toBeGreaterThan(0)
    expect(filesMatching(WEB_SRC, /\bfindNodePath\(/).length).toBeGreaterThan(0)
  })
})
