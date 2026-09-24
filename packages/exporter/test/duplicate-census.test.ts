/**
 * **두 벌이 되는 것을 막는다.**
 *
 * 설계서 「HTML 정적 번들」의 번들과 「로드맵」의 PPTX가 **같은 설계서를 말한다.** 코멘트 줄·상호작용 문장·빈 상태의
 * 말을 두 산출물이 각자 만들면 **오늘은 같은 값이 나오고** 한쪽만 고쳐진 날 갈린다.
 *
 * ---
 *
 * # 왜 값을 재는 케이스로는 못 보나
 *
 * 두 벌이 **오늘은 같은 값을 낸다.** 값을 재는 자(`pptx-parity.test.tsx`)는 복제가 값을
 * 바꾼 뒤에야 죽고, 그때는 이미 늦었다. **소스를 세는 것이 유일한 방법이다** —
 * `packages/cli/test/assembly-census.test.ts`·`test/io-boundary.test.ts`가 같은 부류다.
 *
 * # 분모는 `packages/exporter/src` 하나다
 *
 * 이 패키지 밖(`apps/web`의 우측 패널)은 자기 뿌리를 훑는 자가 따로 있어야 한다.
 * **뿌리가 여럿인 검사를 한 파일에 두지 않는다.**
 *
 * # 이름 목록이 분모다 — **한 겹 아래로 내려가는 길을 막는다**
 *
 * 이름을 케이스마다 하나씩 박아 두면 **한 겹 아래(`describeInteraction`)로 내려가 다시
 * 엮는 것이 안 보인다** — `pptx/index.ts`가 `walkNodes` + `describeInteraction`으로 문장을
 * 직접 만들어도 아무것도 안 죽는다.
 *
 * 그래서 아래 `PRIMITIVES` 를 **표**로 둔다 — `packages/cli/test/assembly-census.test.ts`의
 * `ASSEMBLY`와 같은 꼴이다. 원시를 하나 더하면 한 줄이고, 그 원시로 내려가 조립을 다시 짜면
 * **거기서 죽는다.**
 *
 * **표의 이름이 실재하는지도 잰다.** 오타 난 이름은 부르는 자리가 0이라 **조용히 통과한다** —
 * 그것이 이 부류 검사의 가장 흔한 실패다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_COMMENTS,
  EMPTY_DESCRIPTION,
  EMPTY_INTERACTIONS,
  MARKER_WITHOUT_COMMENT,
  PANEL_TABS,
} from '../src/labels'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function sourceFiles(dir: string = SRC, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...sourceFiles(join(dir, entry.name), relative))
    else if (/\.tsx?$/.test(entry.name)) found.push(relative)
  }
  return found
}

/** **주석은 안 센다.** 이름을 설명하는 머리말이 위반으로 잡히면 아무도 머리말을 안 쓴다. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const FILES = sourceFiles()
const BODIES = new Map(
  FILES.map((relative) => [relative, stripComments(readFileSync(join(SRC, relative), 'utf8'))]),
)

/**
 * 그 이름을 **부르는 자리** 전부. 파일 하나가 두 번 부르면 두 줄이다.
 *
 * **파일 이름만 세지 않는다.** `[파일…]`을 내는 자는 `sentences.ts` **안에** 두 번째
 * 문장화 함수를 심어도 목록이 여전히 `['sentences.ts']`라 아무것도 안 죽는다. 두 벌은
 * **다른 파일에서만** 생기는 것이 아니다.
 *
 * 정의한 자리(`function 이름(`)는 부름이 아니므로 뺀다.
 */
function callers(name: string): string[] {
  const call = new RegExp(`(?:^|[^\\w$.])${name}\\s*\\(`, 'g')
  const definition = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*[(<]`, 'g')
  const found: string[] = []
  for (const [relative, body] of BODIES) {
    const count = (body.replace(definition, '').match(call) ?? []).length
    for (let index = 0; index < count; index += 1) found.push(relative)
  }
  return found
}

/** 그 글자를 리터럴로 든 파일들. */
function literalHolders(text: string): string[] {
  return [...BODIES.entries()]
    .filter(([, body]) => body.includes(`'${text}'`) || body.includes(`\`${text}\``))
    .map(([relative]) => relative)
}

/**
 * **원시 → 그것을 부를 수 있는 자리.** 이 표가 분모다.
 *
 * | 원시 | 어디서 | 왜 |
 * |---|---|---|
 * | `listInteractionSentences` | `sentences.ts` | 견딤 규칙(`nodesOnly`)이 그 앞에 있어야 한다 |
 * | `describeInteraction` | **아무 데도** | 문장 하나를 직접 만드는 것이 곧 조립을 다시 짜는 것이다. 순서·견딤·묶음이 전부 `listInteractionSentences` 안에 있다 |
 * | `nodesOnly` | `sentences.ts` | 견딤을 딴 데서 다시 엮으면 규칙이 두 벌이 된다 |
 * | `commentEntries` | `bundle/index.ts` · `pptx/index.ts` | **부르는 쪽은 둘이어도 된다** — 그것이 소비자다 |
 * | `pageSentences` | `bundle/shell.tsx` · `pptx/index.ts` | 〃 |
 */
const PRIMITIVES: readonly (readonly [string, readonly string[]])[] = [
  ['listInteractionSentences', ['sentences.ts']],
  ['describeInteraction', []],
  ['nodesOnly', ['sentences.ts']],
  ['commentEntries', ['bundle/index.ts', 'pptx/index.ts']],
  ['pageSentences', ['bundle/shell.tsx', 'pptx/index.ts']],
]

/** `packages/schema`가 내는 이름들. **표의 오타를 잡는 자다.** */
const SCHEMA_EXPORTS = new Set(Object.keys(schema))

describe('만드는 자리가 하나다', () => {
  it('훑을 소스를 실제로 읽는다 — 카나리아', () => {
    expect(FILES.length).toBeGreaterThan(8)
    expect(FILES).toContain('pptx/index.ts')
    expect(FILES).toContain('bundle/shell.tsx')
  })

  /**
   * **표의 이름이 실재한다.** 오타 난 이름은 부르는 자리가 0이라 **조용히 통과한다** —
   * 이 부류 검사의 가장 흔한 실패이고, 그러면 그 줄은 아무것도 안 지킨다.
   *
   * `schema`가 내는 것은 그쪽 표면으로 보고, 우리 것은 `src/` 안에 정의가 있는지로 본다.
   */
  it('표의 원시가 전부 실재한다 — 오타면 그 줄이 아무것도 안 지킨다', () => {
    for (const [name] of PRIMITIVES) {
      const defined =
        SCHEMA_EXPORTS.has(name) ||
        [...BODIES.values()].some((body) => new RegExp(`function\\s+${name}\\s*[(<]`).test(body))
      expect(defined, name).toBe(true)
    }
  })

  /** 표에 든 자리가 실재하는 파일이다. 오타면 그 줄이 **늘 죽거나** 늘 통과한다. */
  it('표가 가리키는 파일이 전부 실재한다', () => {
    for (const [name, allowed] of PRIMITIVES) {
      for (const relative of allowed) expect(FILES, `${name} → ${relative}`).toContain(relative)
    }
  })

  /**
   * **원시마다 부를 수 있는 자리가 정해져 있다.**
   *
   * `[]`는 *"이 패키지에서 아무도 못 부른다"*다 — 그 원시로 내려가는 것이 곧 조립을 다시
   * 짜는 것이기 때문이다.
   */
  for (const [name, allowed] of PRIMITIVES) {
    const 어디 = allowed.length === 0 ? '아무 데도 없다' : `${allowed.join(' · ')} 뿐이다`
    it(`${name} 를 부르는 자리가 ${어디}`, () => {
      expect(callers(name).sort()).toEqual([...allowed].sort())
    })
  }
})

describe('같은 상태를 한 말로 부른다', () => {
  for (const text of [
    EMPTY_DESCRIPTION,
    EMPTY_COMMENTS,
    EMPTY_INTERACTIONS,
    MARKER_WITHOUT_COMMENT,
    ...PANEL_TABS.map((tab) => tab.label),
  ]) {
    it(`"${text}" 를 리터럴로 든 파일이 labels.ts 하나다`, () => {
      expect(literalHolders(text)).toEqual(['labels.ts'])
    })
  }

  /** 자가 진짜로 글자를 찾는지 — 없는 글자를 찾으면 빈 목록이어야 한다. */
  it('자가 없는 글자에는 아무것도 안 낸다 — 구분력', () => {
    expect(literalHolders('이 저장소에 없는 말')).toEqual([])
  })
})
