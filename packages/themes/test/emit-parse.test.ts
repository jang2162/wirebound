import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { styleDeclarations } from '../src/resolve/style'
import type { ResolvedTheme } from '../src/resolved'
import { MINIMAL_THEME } from './fixtures/minimal'

beforeAll(() => {
  installCatalog()
})

const QUOTE = String.fromCharCode(34)
const APOSTROPHE = String.fromCharCode(39)
const NEWLINE = String.fromCharCode(10)

/**
 * 검증을 **건너뛰고** 값을 그대로 방출한다. 가드가 무엇을 막는지 보려면 막히지 않은
 * 세계의 출력이 있어야 한다.
 */
function cssBypassingValidation(value: string): string {
  const { theme } = resolveTheme(MINIMAL_THEME)
  const resolved = theme as ResolvedTheme
  const list = resolved.components.get('List')!
  const parts = new Map(list.parts)
  parts.set('item', [['background', value]])
  return compileTheme({ ...resolved, components: new Map([['List', { ...list, parts }]]) })
}

/**
 * jsdom으로 방출된 CSS를 실제로 파싱해 스타일시트가 만들어지는지 본다.
 *
 * **jsdom은 이 패키지의 의존이 아니다** — 저장소 루트의 devDependency이고 여기서는
 * **테스트 안에서 동적 import로만** 쓴다(`src/`는 여전히 DOM을 모른다. `test/public-api.test.ts`가
 * 그 경계를 지킨다). **이 프로브가 없으면 아래 케이스가 무엇을 막는지 알 수 없다** —
 * "따옴표를 거부한다"는 규칙만 남고 그것이 왜 필요한지가 사라진다.
 */
async function ruleCount(css: string): Promise<number | 'sheet-missing'> {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head></html>`)
  const style = dom.window.document.querySelector('style')
  const sheet = (style as unknown as { sheet: { cssRules: { length: number } } | null } | null)?.sheet
  return sheet == null ? 'sheet-missing' : sheet.cssRules.length
}

describe('H2 — 짝이 맞지 않는 따옴표가 스타일시트를 통째로 못 쓰게 한다', () => {
  it('프로브가 정상 CSS에서는 규칙을 센다', async () => {
    // 카나리아. 이것이 없으면 아래 케이스가 "언제나 sheet-missing"이어도 통과한다.
    expect(await ruleCount(cssBypassingValidation('#fff'))).toBeGreaterThan(0)
  })

  it('가드를 지나쳤다면 시트가 만들어지지 않는다', async () => {
    for (const value of [`red${QUOTE}`, `red${APOSTROPHE}`, `a${QUOTE}b${QUOTE}c${QUOTE}`]) {
      expect(await ruleCount(cssBypassingValidation(value)), value).toBe('sheet-missing')
    }
  })

  it('짝이 맞으면 시트가 살아 있다 — 따옴표 자체를 막는 것이 아니다', async () => {
    for (const value of [`a${QUOTE}b${QUOTE}c`, `a${QUOTE}b${APOSTROPHE}c${QUOTE}d`]) {
      expect(await ruleCount(cssBypassingValidation(value)), value).toBeGreaterThan(0)
    }
  })

  it('그래서 가드가 홀수 따옴표를 이슈로 낸다', () => {
    const tokens = new Map<string, string>()
    const codes = (value: string) =>
      styleDeclarations('bg', value, tokens).issues.map((issue) => issue.code)
    expect(codes(`red${QUOTE}`)).toEqual(['bad-style-value'])
    expect(codes(`red${APOSTROPHE}`)).toEqual(['bad-style-value'])
    expect(codes(`a${QUOTE}b${QUOTE}c${QUOTE}`)).toEqual(['bad-style-value'])
    // 짝이 맞으면 통과한다 — 폰트 이름처럼 따옴표가 필요한 값이 있다.
    expect(codes(`a${QUOTE}b${QUOTE}c`)).toEqual([])
    expect(codes(`${QUOTE}Noto Serif KR${QUOTE}, serif`)).toEqual([])
    // **여는 따옴표는 같은 따옴표로만 닫힌다.** 문자열 안의 다른 따옴표는 그냥 글자다 —
    // 아무 따옴표로나 닫히게 세면 이 값이 짝이 안 맞는 것으로 잘못 걸린다.
    expect(codes(`a${QUOTE}b${APOSTROPHE}c${QUOTE}d`)).toEqual([])
    expect(codes(`${APOSTROPHE}a${QUOTE}b${APOSTROPHE}`)).toEqual([])
  })

  it('가드가 개행을 이슈로 낸다', () => {
    // 위 케이스는 가드를 **우회해서** 방출기의 줄 성질을 봤다. 가드 자체를 지나는 입력도
    // 함께 두어야 위험 문자 목록에서 개행을 빼는 변이가 죽는다(처음에 0 사망이었다).
    const tokens = new Map<string, string>()
    for (const control of [NEWLINE, String.fromCharCode(13), String.fromCharCode(12)]) {
      expect(
        styleDeclarations('bg', `red${control}color:blue`, tokens).issues.map((issue) => issue.code),
        JSON.stringify(control),
      ).toEqual(['bad-style-value'])
    }
    // 탭은 막지 않는다 — 깨지는 것을 관측하지 못했다.
    expect(styleDeclarations('bg', `red${String.fromCharCode(9)}blue`, tokens).issues).toEqual([])
  })

  it('개행은 방출기 자신의 줄 성질을 깬다', () => {
    // jsdom은 개행에 관대했다(규칙 수가 줄지 않았다). 그래서 근거는 파서가 아니라
    // **방출기가 선언마다 한 줄을 쓴다**는 성질이다 — 값에 개행이 있으면 세미콜론 없이
    // 끝나는 줄이 생긴다(아래에서 그것을 관측한다).
    const css = cssBypassingValidation(`red${NEWLINE}color:blue`)
    const broken = css
      .split(/[\n\r\f]/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.endsWith('{') && line !== '}' && !line.endsWith(';'))
    expect(broken).toEqual(['background: red'])
  })
})
