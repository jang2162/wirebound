/**
 * **두 벌이 되는 것을 막는다**(P10-1 D4).
 *
 * §11.3의 번들과 §15의 PPTX가 **같은 설계서를 말한다.** 코멘트 줄·상호작용 문장·빈 상태의
 * 말을 두 산출물이 각자 만들면 **오늘은 같은 값이 나오고** 한쪽만 고쳐진 날 갈린다.
 *
 * ---
 *
 * # 왜 값을 재는 케이스로는 못 보나
 *
 * 두 벌이 **오늘은 같은 값을 낸다.** 값을 재는 자(`pptx-parity.test.ts`)는 복제가 값을
 * 바꾼 뒤에야 죽고, 그때는 이미 늦었다. **소스를 세는 것이 유일한 방법이다** —
 * `packages/cli/test/assembly-census.test.ts`·`test/io-boundary.test.ts`가 같은 부류다.
 *
 * # 분모는 `packages/exporter/src` 하나다
 *
 * 이 패키지 밖(`apps/web`의 우측 패널)은 자기 뿌리를 훑는 자가 따로 있어야 한다.
 * **뿌리가 여럿인 검사를 한 파일에 두지 않는다**(P3-3 이월 §6.9가 이름 붙인 자리).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
 * **파일 이름만 세지 않는다 — 실측이 그 자를 반증했다.** 앞 판은 `[파일…]`을 냈고, 변이로
 * `sentences.ts` **안에** 두 번째 문장화 함수를 심었더니 **13건 중 0건이 죽었다**(목록이
 * 여전히 `['sentences.ts']`였다). 두 벌은 **다른 파일에서만** 생기는 것이 아니다.
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

describe('만드는 자리가 하나다 (D4)', () => {
  it('훑을 소스를 실제로 읽는다 — 카나리아', () => {
    expect(FILES.length).toBeGreaterThan(8)
    expect(FILES).toContain('pptx/index.ts')
    expect(FILES).toContain('bundle/shell.tsx')
  })

  /**
   * **문장화를 부르는 자리는 `sentences.ts` 하나다.** 번들의 셸도 PPTX도 그것을 지난다 —
   * 그래야 *"깨진 자식을 견디는 규칙"*이 한 벌로 남는다.
   */
  it('listInteractionSentences 를 부르는 자리가 하나다', () => {
    expect(callers('listInteractionSentences')).toEqual(['sentences.ts'])
  })

  /** 견딤이 그 한 자리에 있다. 딴 데서 `nodesOnly`로 다시 엮으면 규칙이 두 벌이 된다. */
  it('문장화 앞의 nodesOnly 가 그 한 자리에만 있다', () => {
    expect(callers('nodesOnly')).toEqual(['sentences.ts'])
  })

  /** 코멘트 줄을 만드는 자리도 하나다. 부르는 쪽은 둘이어도 된다 — 그것이 소비자다. */
  it('commentEntries 를 부르는 자리가 번들과 PPTX 둘뿐이다', () => {
    expect(callers('commentEntries').sort()).toEqual(['bundle/index.ts', 'pptx/index.ts'])
  })

  it('pageSentences 를 부르는 자리가 번들과 PPTX 둘뿐이다', () => {
    expect(callers('pageSentences').sort()).toEqual(['bundle/shell.tsx', 'pptx/index.ts'])
  })
})

describe('같은 상태를 한 말로 부른다 (D4)', () => {
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
