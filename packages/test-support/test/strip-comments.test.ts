/**
 * **`stripComments` 의 성질.** 소스를 글자로 세는 자가 전부 이것을 지나므로, 여기가 틀리면 그 자들이 한꺼번에
 * 거짓 초록이 된다 — 자마다 같은 성질을 다시 재지 않고 여기서 잰다. 자마다 잴 것은 «그 자가 이것을 지나는가»다.
 */
import { describe, expect, it } from 'vitest'
import { stripComments } from '../src/strip-comments'

/** 걷은 뒤에 `process.exit(` 가 남았는가 — 자들이 거는 술어와 같은 꼴(`\s*`)이다. */
const calls = (code: string): boolean => /\bprocess\.exit\s*\(/.test(code)

describe('주석만 걷는다 — 거짓 빨강 쪽', () => {
  it('줄 끝 주석 · 줄 머리 주석 · JSDoc 의 언급은 걷는다', () => {
    expect(calls(stripComments('const note = 0 // process.exit(1) 을 부르지 않는다'))).toBe(false)
    expect(calls(stripComments('// process.exit(1)\nconst a = 1'))).toBe(false)
    expect(calls(stripComments('/** process.exit(1) */\nconst a = 1'))).toBe(false)
    expect(calls(stripComments('/*! process.exit(1) */\n\nconst a = 1'))).toBe(false)
  })
})

describe('원문의 모양을 지킨다', () => {
  it('주석 자리만 공백이 되고 들여쓰기 · 줄 수 · 길이는 그대로다', () => {
    const source = 'interface A {\n  // 설명\n  run(x: number): void /* 끝 */\n}\n'
    const code = stripComments(source)
    expect(code).toHaveLength(source.length)
    expect(code.split('\n')).toHaveLength(source.split('\n').length)
    expect(code).toMatch(/^ {2}run\(/m)
    expect(code).not.toContain('설명')
  })

  it('JSX 텍스트의 `//` 는 주석이 아니다 — 글자로 남는다', () => {
    expect(stripComments('export const P = () => <p>// process.exit(1)</p>')).toContain('// process.exit(1)')
  })
})

describe('코드를 지우지 않는다 — 거짓 초록 쪽', () => {
  it('줄 주석 속 `/*` 가 뒤따르는 JSDoc 까지 코드를 삼키지 않는다', () => {
    expect(calls(stripComments('// 글롭 예: src/*\nprocess.exit(1)\n/** 끝 */\nconst after = 2'))).toBe(true)
  })

  it('문자열 속 `/*` 가 코드를 삼키지 않는다', () => {
    expect(calls(stripComments("const glob = 'src/*'\nprocess.exit(1)\n/** 끝 */"))).toBe(true)
  })

  it('정규식 리터럴 속 `\\/*` · `\\/\\/` 가 코드를 삼키지 않는다 — 문자열만 아는 렉서가 틀리는 자리', () => {
    expect(calls(stripComments('const re = /x\\/*/\nprocess.exit(1)\n/** 끝 */'))).toBe(true)
    expect(calls(stripComments("const hit = /a\\/\\//.test('') || process.exit(1)"))).toBe(true)
  })

  it('문자열 · 정규식 · 템플릿의 글자는 그대로 남긴다 — 따옴표도 원문 그대로다', () => {
    const code = stripComments("const url = 'https://x/*y'\nconst re = /a\\/\\/b/\nconst t = `// ${url} /* */`")
    expect(code).toContain("'https://x/*y'")
    expect(code).toContain('/a\\/\\/b/')
    expect(code).toContain('`// ${url} /* */`')
  })
})

describe('`.tsx`', () => {
  const JSX = 'export const View = () => <div data-wb-id="n">{/* process.exit(1) */}</div>'
  const ASSERTION = 'const n = <number>value\nprocess.exit(1)'

  it('이름이 없어도 JSX 를 읽고, JSX 안의 주석도 걷는다', () => {
    const code = stripComments(JSX)
    expect(code).toContain('data-wb-id="n"')
    expect(calls(code)).toBe(false)
  })

  it('이름이 없으면 `.tsx` 가 먼저다 — 두 문법이 다 받는 글자에서 JSX 식을 주석으로 지우지 않는다', () => {
    // `.ts` 로는 단언 + 줄 주석, `.tsx` 로는 JSX 텍스트 + 식이다 — `.ts` 쪽으로 걷으면 `{…}` 가 코드째 사라진다.
    expect(calls(stripComments('export const Z = () => <p>a // {process.exit(1)}</p>'))).toBe(true)
    // `<T>x` 단언이 든 `.ts` 는 `.tsx` 로 못 읽혀 `.ts` 로 넘어간다 — 던지지 않는다.
    expect(calls(stripComments(ASSERTION))).toBe(true)
    expect(stripComments('const a = <T>b // </T>', 'a.ts')).not.toContain('</T>')
  })

  it('이름을 주면 그 확장자로만 읽는다 — 틀린 이름은 던진다', () => {
    expect(calls(stripComments(JSX.replace('{/*', '{process.exit(1)/*'), 'view.tsx'))).toBe(true)
    expect(() => stripComments(JSX, 'view.ts')).toThrow(/구문 오류/)
    expect(() => stripComments(ASSERTION, 'view.tsx')).toThrow(/구문 오류/)
  })
})

/**
 * **구문 오류가 든 소스는 조용히 지나가지 않는다.** 파서의 복구가 코드를 지워 `process.`가 사라진다(헬퍼 머리말) —
 * 걷는 자리가 던져야 빨강이 된다.
 */
describe('구문 오류', () => {
  it('구문 오류가 든 소스는 읽지 않고 던진다 — 복구가 지운 호출을 초록으로 넘기지 않는다', () => {
    expect(() => stripComments('@@@ process.exit(1)')).toThrow(/구문 오류/)
    expect(() => stripComments('const x = ) process.exit(1)')).toThrow(/구문 오류/)
  })
})
