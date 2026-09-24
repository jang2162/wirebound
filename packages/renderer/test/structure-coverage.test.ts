/**
 * **카탈로그가 선언한 구조 중 구현이 없는 것.**
 *
 * 기준표(`p4b2-baseline.ts`)의 값: **선언 45 − 구현 19 = 미구현 26.** 지금은 미구현 0이다 —
 * 첫 케이스가 못박는다.
 *
 * ---
 *
 * **수를 못박는 자리는 둘뿐이다**(미구현 0 · 선언 45). 나머지는 이름으로 잰다.
 *
 * 여럿이 병렬로 구조를 만들 때 미구현 수를 못박으면 하나가 만들어질 때마다 케이스가
 * 죽어 **서로를 막는다** — 각자 자기 브랜치에서 이 파일을 고치고 병합에서 부딪힌다.
 *
 * 그래서 **"무엇이 비어 있는가"를 이름으로 재고, 그것이 기준표의 26 안에 있는지**를
 * 본다. **없던 구멍이 생기면**(카탈로그에 구조를 선언만 하고 구현을 안 했거나, 있던
 * 구현을 지웠거나) 그 이름이 실패 메시지에 그대로 나온다.
 */
import { CATALOG_TYPES, installCatalog, requireComponent } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { installStructures } from '../src/structures/index'
import { listStructureKeys } from '../src/structures/registry'
import {
  GROUP_TYPES,
  PREP_IMPLEMENTED_KEYS,
  PREP_MISSING,
  PREP_MISSING_KEYS,
  WORKER_GROUPS,
} from './p4b2-baseline'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 카탈로그가 선언한 `타입:구조` 전부. 45다 — 아래 `toHaveLength(45)`가 못박는다. */
function declared(): string[] {
  return CATALOG_TYPES.flatMap((type) =>
    requireComponent(type).structures.map((structure) => `${type}:${structure}`),
  )
}

/** **선언은 됐는데 구현이 없는 구조.** 비어 있어야 한다 — 첫 케이스. */
function unimplemented(): string[] {
  const implemented = new Set(listStructureKeys())
  return declared().filter((key) => !implemented.has(key))
}

describe('구현이 없는 구조', () => {
  /**
   * **선언 45 = 구현 45, 미구현 0을 못박는다.**
   *
   * 카탈로그가 구조를 더하면(구현 없이) 여기서 이름이 찍히며 죽고, 있던 구현을 지워도
   * 죽는다. 아래 케이스 넷도 둔다: 이 한 줄이 "0인가"만 보는 데 비해 그쪽은
   * **무엇이 어긋났는지**를 이름으로 말하기 때문이다.
   */
  it('미구현이 하나도 없다 — 선언 45가 전부 구현돼 있다', () => {
    expect(unimplemented()).toEqual([])
  })

  it('비어 있는 구조를 이름으로 말한다 — 기준표의 26 밖으로 늘지 않는다', () => {
    const known = new Set(PREP_MISSING_KEYS)
    const unexpected = unimplemented().filter((key) => !known.has(key))

    // 실패하면 이 배열에 **이름이** 찍힌다. 수만 재면 무엇이 남았는지 알 수 없다.
    expect(unexpected).toEqual([])
  })

  it('구현이 는 만큼 목록이 준다 — 26에서 늘지 않는다', () => {
    // 위 케이스는 **없던 이름**을 잡고, 이 케이스는 **수가 도로 느는 것**을 잡는다.
    // 둘은 갈린다: 있던 구현을 지우면 이름은 26 안에 있으면서 수만 는다.
    expect(unimplemented().length).toBeLessThanOrEqual(PREP_MISSING_KEYS.length)
  })

  it('구현 + 미구현 = 카탈로그가 선언한 것 전부', () => {
    const all = declared()
    // 카탈로그가 구조를 더하면 여기가 먼저 깨진다 — 그때는 그 구조의 구현을 정하는 것이
    // 먼저이지 이 수를 고치는 것이 아니다.
    expect(all).toHaveLength(45)
    expect(new Set(all).size, '같은 키가 두 번 선언됐다').toBe(all.length)

    expect(listStructureKeys().length + unimplemented().length).toBe(all.length)
  })

  it('등록된 구조는 전부 카탈로그가 선언한 것이다', () => {
    // 반대 방향. 이것이 없으면 위 산수가 "선언에 없는 구조를 등록"으로도 맞아떨어진다.
    const known = new Set(declared())
    expect(listStructureKeys().filter((key) => !known.has(key))).toEqual([])
  })
})

/**
 * **아래 케이스는 카탈로그와 기준표만 보고 잰다** — 레지스트리를 안 본다.
 * 그래서 구현이 늘어도 값이 안 변하고, **기준표의 분배가 카탈로그와 맞는지**를 지킨다.
 */
describe('26개를 워커 넷에게 나눈 표가 카탈로그와 맞는다', () => {
  it('미구현 26 = 선언 45 − 기준표의 구현 19', () => {
    const implemented = new Set(PREP_IMPLEMENTED_KEYS)
    expect(PREP_IMPLEMENTED_KEYS).toHaveLength(19)

    const computed = declared().filter((key) => !implemented.has(key))
    expect([...computed].sort()).toEqual([...PREP_MISSING_KEYS].sort())
    expect(PREP_MISSING_KEYS).toHaveLength(26)
  })

  it('워커별 분배가 9·6·6·5다', () => {
    // W1 구조 9 · W2 데이터 6 · W3 입력 6 · W4 액션·문서 5.
    const counts = Object.fromEntries(
      Object.entries(PREP_MISSING).map(([worker, keys]) => [worker, keys.length]),
    )
    expect(counts).toEqual({ W1: 9, W2: 6, W3: 6, W4: 5 })
  })

  it('워커가 맡은 구조는 전부 그 워커의 그룹 모듈에 속한다', () => {
    // **이것이 병렬이 성립하는 조건이다.** 어긋나면 두 워커가 같은 그룹 파일에 줄을
    // 더하게 되어 그룹으로 가른 것이 무의미해진다.
    const offenders: string[] = []

    for (const [worker, keys] of Object.entries(PREP_MISSING)) {
      const own = new Set(WORKER_GROUPS[worker]!.flatMap((group) => GROUP_TYPES[group]!))
      for (const key of keys) {
        const type = key.split(':')[0]!
        if (!own.has(type)) offenders.push(`${worker}: ${key}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('한 구조를 두 워커가 맡지 않는다', () => {
    expect(new Set(PREP_MISSING_KEYS).size).toBe(PREP_MISSING_KEYS.length)
  })
})
