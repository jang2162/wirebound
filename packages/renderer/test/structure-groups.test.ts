/**
 * **구조를 그룹 모듈 다섯으로 가른 경계를 지키는 케이스.**
 *
 * **그룹 모듈 다섯**(`structures/structure.tsx`·`data.tsx`·`input.tsx`·`action.tsx`·
 * `document.tsx`)이 자기 등록과 자기 CSS를 소유하고, `structures/index.ts`와
 * `structure-css.ts`는 그것들을 **모으기만** 한다. 모으는 쪽이 항목을 직접 가지면
 * (`DEFAULTS` 배열 하나 · 규칙 배열 하나) 구조를 병렬로 더하는 작업들이 그 배열
 * 하나에서 부딪힌다.
 *
 * 그래서 이 파일이 지키는 것은 셋이다.
 *
 * 1. **모으는 쪽이 아무것도 빠뜨리지 않는다** — 그룹이 가진 항목과 레지스트리가 일치한다.
 * 2. **경계가 겹치지 않는다** — 두 그룹이 같은 키를 갖지 않는다.
 * 3. **CSS 규칙의 순서가 그대로다** — *"시트 순서가 곧 우선순위"*이고
 *    (`structure-css.test.ts`의 캐스케이드 케이스들이 그 위에 얹혀 있다), 순서가
 *    바뀌면 그 판정이 조용히 달라진다.
 *
 * **이 파일의 단언은 "늘어나는 것"에 죽지 않게 썼다.** 그룹에 구조를 더할 때마다 이
 * 파일이 죽으면 병렬 작업이 서로를 막는다 — 그것이 가르기의 목적과 정반대다.
 * 그래서 수를 못박는 대신 **기준표(`p4b2-baseline.ts`)의 것이 그대로 남아 있는지**를 본다.
 */
import { describe, expect, it } from 'vitest'
import { structureBaseCss } from '../src/structure-css'
import { ACTION_ENTRIES, actionCssBlocks } from '../src/structures/action'
import { DATA_ENTRIES, dataCssBlocks } from '../src/structures/data'
import { DOCUMENT_ENTRIES, documentCssBlocks } from '../src/structures/document'
import { installStructures } from '../src/structures/index'
import { INPUT_ENTRIES, inputCssBlocks } from '../src/structures/input'
import { listStructureKeys, resetStructures, type StructureEntry } from '../src/structures/registry'
import { STRUCTURE_ENTRIES, structureCssBlocks } from '../src/structures/structure'
import { GROUP_TYPES, PREP_IMPLEMENTED, PREP_IMPLEMENTED_KEYS } from './p4b2-baseline'

/**
 * 그룹 다섯. **순서가 `installStructures()`·`structureBaseCss()`가 모으는 순서와 같아야
 * 한다** — 아래 순서 케이스가 이 배열을 기준으로 재기 때문이다.
 */
const GROUPS: [name: string, entries: readonly StructureEntry[], blocks: () => string[]][] = [
  ['structure', STRUCTURE_ENTRIES, structureCssBlocks],
  ['data', DATA_ENTRIES, dataCssBlocks],
  ['input', INPUT_ENTRIES, inputCssBlocks],
  ['action', ACTION_ENTRIES, actionCssBlocks],
  ['document', DOCUMENT_ENTRIES, documentCssBlocks],
]

function keysOf(entries: readonly StructureEntry[]): string[] {
  return entries.map(([type, structure]) => `${type}:${structure}`)
}

describe('등록이 그룹 다섯으로 갈려 있다', () => {
  it('installStructures()가 다섯 그룹의 항목을 빠짐없이 등록한다', () => {
    resetStructures()
    installStructures()

    const registered = [...listStructureKeys()].sort()
    const declared = [...GROUPS.flatMap(([, entries]) => keysOf(entries))].sort()

    // 목록이 비면 아래 비교가 `[] === []`로 통과한다.
    expect(declared.length).toBeGreaterThan(0)
    expect(registered).toEqual(declared)
  })

  it('두 그룹이 같은 키를 갖지 않는다 — 경계가 겹치면 registerStructure가 던진다', () => {
    const owner = new Map<string, string>()
    const collisions: string[] = []

    for (const [name, entries] of GROUPS) {
      for (const key of keysOf(entries)) {
        const previous = owner.get(key)
        if (previous !== undefined) collisions.push(`${key}: ${previous} ↔ ${name}`)
        else owner.set(key, name)
      }
    }

    expect(owner.size).toBeGreaterThan(0)
    expect(collisions).toEqual([])
  })

  it('그룹이 가진 것을 하나도 잃지 않았다 — 기준표의 19개', () => {
    for (const [name, entries] of GROUPS) {
      const keys = new Set(keysOf(entries))
      const lost = PREP_IMPLEMENTED[name]!.filter((key) => !keys.has(key))
      expect(lost, name).toEqual([])
    }
    // 위 순회가 헛돌지 않는 것 — 목록 전체가 19다.
    expect(PREP_IMPLEMENTED_KEYS).toHaveLength(19)
  })

  it('그룹 경계가 카탈로그 파일의 경계와 같다', () => {
    // **워커 분배(`p4b2-baseline.ts`)가 이 경계에 기댄다.** 카탈로그 파일이 같은 경계로 갈려 있어야
    // `parts`를 넓혀야 할 때도 서로 안 겹친다. 여기서는 그 대응을 **컴포넌트 타입**으로
    // 고정한다 — 그룹이 남의 컴포넌트를 등록하기 시작하면 그 전제가 깨진다.
    for (const [name, entries] of GROUPS) {
      const types = [...new Set(entries.map(([type]) => type))].sort()
      expect(types, name).toEqual([...GROUP_TYPES[name]!].sort())
    }
  })

  it('installStructures()는 멱등하다', () => {
    // `catalog-setup`이 import만으로 부르고, 테스트 여럿이 beforeAll에서 또 부른다.
    // `registerStructure` 자체는 중복 등록에 던지므로 이 멱등이 유일한 방어다.
    resetStructures()
    installStructures()
    const first = listStructureKeys().length

    expect(() => installStructures()).not.toThrow()
    expect(listStructureKeys()).toHaveLength(first)
  })
})

/**
 * **그룹으로 가르기 전의 구조 기본 CSS 규칙 다섯 — 글자까지 이대로다.**
 *
 * 가르기 전후의 출력 대조는 다시 할 수 없으므로 **여기 규칙 본문을 적어 둔다.**
 *
 * **전체 문자열을 못박지 않는 이유:** 그룹에 규칙을 더할 때마다 이 케이스가 죽고,
 * 병렬 작업이 각자 이 상수를 고치면 **가르기가 없애려던 충돌이 이 파일에서 그대로
 * 되살아난다.** 그래서 **"이 다섯이 이 순서로 남아 있는가"**만 본다 — 캐스케이드가
 * 걸려 있는 것이 그 순서이지 전체 길이가 아니다(*"시트 순서가 곧 우선순위"*).
 */
const BASELINE_BLOCKS: [name: string, css: string][] = [
  [
    'Flex',
    `[data-wb-component="Flex"][data-wb-structure="default"] {
  display: flex;
  flex-direction: var(--wb-node-flex-direction, row);
  align-items: var(--wb-node-flex-align, stretch);
  justify-content: var(--wb-node-flex-justify, start);
  flex-wrap: var(--wb-node-flex-wrap, nowrap);
}`,
  ],
  [
    'Grid',
    `[data-wb-component="Grid"][data-wb-structure="default"] {
  display: grid;
  grid-template-columns: repeat(var(--wb-node-grid-columns, 1), 1fr);
}`,
  ],
  [
    // **셀렉터는 `:where(indent)`로 좁혀져 있다.** 본문은 가르기 전 그대로다.
    //
    // `accordion`은 들여쓰기를 **중첩**으로 내면서 단계 변수를 안 싣는다 — 셀렉터가 구조를
    // 안 가리면 `accordion`도 이 규칙을 받는다. `:where()`는 특이도를 안 올린다. 근거는
    // `structure-css-tools`의 `partRule` 주석(Chromium 실측표)에 있다.
    'Tree',
    `[data-wb-component="Tree"]:where([data-wb-structure="indent"]) [data-wb-part="node"] {
  padding-left: calc(var(--wb-node-tree-level, 0) * var(--wb-tree-indent, 16px));
}`,
  ],
  [
    'Media',
    `[data-wb-component="Media"] [data-wb-part="frame"] {
  aspect-ratio: var(--wb-node-media-ratio, 16/9);
}`,
  ],
  [
    'Placeholder',
    `[data-wb-component="Placeholder"][data-wb-structure="default"] {
  height: var(--wb-node-placeholder-height, 120px);
}`,
  ],
]

describe('구조 기본 CSS가 그룹 다섯으로 갈려 있다', () => {
  it('structureBaseCss()는 그룹 블록을 순서대로 이어 붙이기만 한다', () => {
    // 모으는 쪽이 자기 규칙을 몰래 끼워 넣으면 그 규칙은 **어느 그룹도 소유하지 않는다** —
    // 병렬 워커가 만질 수 없는 자리가 다시 생기는 것이다.
    const joined = GROUPS.flatMap(([, , blocks]) => blocks()).join('\n')
    expect(joined.length).toBeGreaterThan(0)
    expect(structureBaseCss()).toBe(joined)
  })

  it('기준 규칙 다섯이 글자까지 그대로 있다', () => {
    const css = structureBaseCss()
    const missing = BASELINE_BLOCKS.filter(([, block]) => !css.includes(block)).map(([name]) => name)
    expect(missing).toEqual([])
  })

  it('그 다섯의 순서가 그대로다 — 순서가 곧 우선순위다', () => {
    const css = structureBaseCss()
    const positions = BASELINE_BLOCKS.map(([name, block]) => [name, css.indexOf(block)] as const)

    // `includes` 케이스와 쌍이다. 하나라도 -1이면 아래 증가 검사가 뜻을 잃는다.
    expect(positions.filter(([, at]) => at < 0)).toEqual([])

    const outOfOrder = positions
      .filter(([, at], index) => index > 0 && at < positions[index - 1]![1])
      .map(([name]) => name)
    expect(outOfOrder).toEqual([])
  })

  it('그룹의 CSS는 자기 그룹의 컴포넌트만 겨냥한다', () => {
    // **그룹이 남의 컴포넌트에 규칙을 다는 것을 여기서 막는다.** 달아도 CSS는
    // 멀쩡히 나가므로 화면으로는 안 보이고, 그러면 그 컴포넌트의 그룹이 자기 규칙을
    // 다는 순간 두 규칙이 서로를 덮는다 — 순서에 따라 결과가 갈리는데 아무도 모른다.
    const offenders: string[] = []

    for (const [name, entries, blocks] of GROUPS) {
      const own = new Set(entries.map(([type]) => type))
      for (const block of blocks()) {
        for (const match of block.matchAll(/\[data-wb-component="([^"]+)"\]/g)) {
          if (!own.has(match[1]!)) offenders.push(`${name}: ${match[1]}`)
        }
      }
    }

    expect([...new Set(offenders)]).toEqual([])
  })
})
