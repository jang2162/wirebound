import { describe, expect, it } from 'vitest'
// 경로가 어긋나면 여기서 죽는다. 아래 `§6.8을 실제로 읽는다`가 내용까지 확인한다.
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { STYLE_PROPERTIES, cssVarName, styleDeclarations } from '../src/resolve/style'
import type { TokenTable } from '../src/resolve/tokens'

const TOKENS: TokenTable = new Map([
  ['semantic.primary', '#2563eb'],
  ['semantic.surface', '#ffffff'],
  ['space.6', '24px'],
  ['radius.lg', '12px'],
  ['shadow.sm', '0 1px 2px rgba(0,0,0,.05)'],
  ['typography.h3.fontSize', '20px'],
  ['typography.h3.lineHeight', '1.3'],
  ['typography.h3.fontWeight', '700'],
  ['typography.h3.letterSpacing', '-0.01em'],
  ['typography.body.fontSize', '14px'],
  ['typography.body.lineHeight', '1.5'],
  ['typography.body.fontWeight', '400'],
])

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()
const decl = (prop: string, value: unknown) => styleDeclarations(prop, value, TOKENS)

/**
 * §6.8의 코드 블록에서 프로퍼티 이름을 뽑는다.
 *
 * **손으로 옮긴 표가 그 절을 덮는지 기계가 보게 하려는 것이다.** 절이 늘거나 줄면
 * 아래 대조 케이스가 죽는다 — 사람이 기억해서 맞출 필요가 없다.
 */
function propertiesInSpec(): string[] {
  const section = designDoc.split('### 6.8 스타일 프로퍼티 화이트리스트')[1] ?? ''
  const block = section.split('```')[1] ?? ''
  return block
    .split('\n')
    // `색/배경:  bg, …`처럼 부류 이름이 앞에 붙는 줄과, 이어지는 줄(콜론 없음)을 함께 다룬다.
    .map((line) => (line.includes(':') ? line.slice(line.indexOf(':') + 1) : line))
    .join(',')
    .split(',')
    // `typography(스케일 참조)`의 괄호 주석을 떼어 낸다.
    .map((name) => name.replace(/\(.*?\)/g, '').trim())
    .filter((name) => name.length > 0)
}

describe('§6.8 대조', () => {
  it('§6.8을 실제로 읽는다', () => {
    // 파싱이 깨지면 목록이 비고, 빈 집합끼리는 아래 대조가 조용히 통과한다.
    // 그래서 절의 첫 항목과 마지막 항목을 카나리아로 둔다.
    const names = propertiesInSpec()
    expect(names[0]).toBe('bg')
    expect(names.at(-1)).toBe('transition')
  })

  it('화이트리스트가 §6.8과 정확히 같다', () => {
    const spec = [...propertiesInSpec()].sort()
    const table = Object.keys(STYLE_PROPERTIES).sort()
    expect(table).toEqual(spec)
  })
})

describe('styleDeclarations — 이름', () => {
  it('화이트리스트 밖의 이름은 이슈다', () => {
    for (const prop of ['content', 'cursor', 'backdropFilter', 'fontFamily', 'maxHeight']) {
      const { css, issues } = decl(prop, '1px')
      expect(codes(issues), prop).toEqual(['unknown-style-prop'])
      expect(css, prop).toEqual([])
    }
  })

  it('테마 어휘가 CSS 이름으로 바뀐다', () => {
    expect(decl('bg', '#fff').css).toEqual([['background', '#fff']])
    expect(decl('fg', '#111').css).toEqual([['color', '#111']])
    expect(decl('radius', '4px').css).toEqual([['border-radius', '4px']])
    expect(decl('direction', 'column').css).toEqual([['flex-direction', 'column']])
    expect(decl('align', 'center').css).toEqual([['align-items', 'center']])
    expect(decl('justify', 'space-between').css).toEqual([['justify-content', 'space-between']])
    expect(decl('shadow', '0 1px 2px #0001').css).toEqual([['box-shadow', '0 1px 2px #0001']])
    expect(decl('zIndex', 10).css).toEqual([['z-index', '10']])
  })

  it('X·Y 축약은 물리 프로퍼티 둘로 펼쳐진다', () => {
    expect(decl('paddingX', '8px').css).toEqual([
      ['padding-left', '8px'],
      ['padding-right', '8px'],
    ])
    expect(decl('marginY', '8px').css).toEqual([
      ['margin-top', '8px'],
      ['margin-bottom', '8px'],
    ])
  })
})

describe('styleDeclarations — 값', () => {
  it('토큰 참조가 var(--wb-…)로 나간다', () => {
    expect(decl('bg', 'semantic.surface').css).toEqual([['background', 'var(--wb-semantic-surface)']])
    expect(decl('padding', 'space.6').css).toEqual([['padding', 'var(--wb-space-6)']])
    expect(decl('radius', 'radius.lg').css).toEqual([['border-radius', 'var(--wb-radius-lg)']])
  })

  it('리터럴은 그대로 나간다', () => {
    expect(decl('bg', '#ffffff').css).toEqual([['background', '#ffffff']])
    expect(decl('borderWidth', '1px').css).toEqual([['border-width', '1px']])
    expect(decl('aspectRatio', '16/9').css).toEqual([['aspect-ratio', '16/9']])
    expect(decl('objectFit', 'cover').css).toEqual([['object-fit', 'cover']])
  })

  it('수가 통과한다', () => {
    expect(decl('opacity', 0.5).css).toEqual([['opacity', '0.5']])
    expect(decl('lineHeight', 1.5).css).toEqual([['line-height', '1.5']])
  })

  it('문자열도 수도 아닌 값은 이슈다', () => {
    for (const value of [true, null, undefined, {}, ['1px']]) {
      expect(codes(decl('width', value).issues), JSON.stringify(value)).toEqual(['bad-style-value'])
    }
  })

  it('없는 토큰을 가리키면 이슈이고 선언이 나가지 않는다', () => {
    const { css, issues } = decl('bg', 'semantic.없는것')
    expect(codes(issues)).toEqual(['unknown-token'])
    expect(css).toEqual([])
  })

  it('값 안쪽에 섞인 참조도 푼다', () => {
    expect(decl('transition', 'opacity space.6').css).toEqual([
      ['transition', 'opacity var(--wb-space-6)'],
    ])
  })
})

describe('styleDeclarations — 함수 (§6.8)', () => {
  it('임의 함수는 이슈다', () => {
    for (const value of ['calc(100% - 8px)', 'rgba(0,0,0,.5)', 'clamp(1rem, 2vw, 3rem)', 'var(--x)']) {
      const { css, issues } = decl('width', value)
      expect(codes(issues), value).toEqual(['bad-style-value'])
      expect(css, value).toEqual([])
    }
  })

  it('bgGradient는 그라디언트 함수 셋만 받는다', () => {
    for (const fn of ['linear-gradient', 'radial-gradient', 'conic-gradient']) {
      expect(decl('bgGradient', `${fn}(#fff, #000)`).issues, fn).toEqual([])
    }
    expect(codes(decl('bgGradient', 'url(/a.png)').issues)).toEqual(['bad-style-value'])
    expect(codes(decl('bgGradient', 'calc(1px)').issues)).toEqual(['bad-style-value'])
  })

  it('bgImage는 url()만 받는다', () => {
    expect(decl('bgImage', 'url(/hero.png)').css).toEqual([['background-image', 'url(/hero.png)']])
    expect(codes(decl('bgImage', 'linear-gradient(#fff, #000)').issues)).toEqual(['bad-style-value'])
  })

  it('허용된 함수 안쪽의 참조도 푼다', () => {
    expect(decl('bgGradient', 'linear-gradient(semantic.primary, semantic.surface)').css).toEqual([
      ['background-image', 'linear-gradient(var(--wb-semantic-primary), var(--wb-semantic-surface))'],
    ])
  })

  it('허용된 함수 안쪽의 없는 참조는 이슈다', () => {
    const { css, issues } = decl('bgGradient', 'linear-gradient(semantic.missing, #000)')
    expect(codes(issues)).toEqual(['unknown-token'])
    expect(css).toEqual([])
  })

  it('중첩 함수는 이슈다', () => {
    expect(codes(decl('bgImage', 'url(linear-gradient(#fff,#000))').issues)).toEqual([
      'bad-style-value',
    ])
    expect(codes(decl('bgGradient', 'linear-gradient(rgba(0,0,0,.5), #000)').issues)).toEqual([
      'bad-style-value',
    ])
  })

  it('안쪽 함수가 허용 목록 안이어도 중첩이면 이슈다', () => {
    // 위 케이스만으로는 중첩 검사를 지워도 죽지 않는다 — 안쪽 이름(`linear-gradient`·`rgba`)이
    // 그 프로퍼티의 허용 목록 밖이라 **이름 검사가 먼저 잡기** 때문이다(재서 확인했다).
    // 중첩 검사만이 잡는 입력은 안팎이 모두 허용 목록 안인 이 형태다.
    expect(codes(decl('bgGradient', 'linear-gradient(linear-gradient(#fff,#000), #000)').issues))
      .toEqual(['bad-style-value'])
    expect(codes(decl('bgImage', 'url(url(/a.png))').issues)).toEqual(['bad-style-value'])
  })

  it('괄호 앞에 함수 이름이 없으면 이슈다', () => {
    // 이름을 못 찾으면 `names`가 비어 함수 검사 자체를 건너뛴다 — §6.8의 금지가
    // 공백 하나로 지나갔다(재서 확인했다).
    for (const value of ['calc (1px)', '(1px)', 'calc\t(1px)', 'calc\n(1px)', '  (1px)  ']) {
      const { css, issues } = decl('width', value)
      expect(codes(issues), JSON.stringify(value)).toEqual(['bad-style-value'])
      expect(css, JSON.stringify(value)).toEqual([])
    }
  })

  it('함수 이름의 대소문자를 가리지 않는다 — CSS가 가리지 않는다', () => {
    expect(decl('bgImage', 'URL(/a.png)').issues).toEqual([])
    expect(decl('bgImage', 'Url(/a.png)').issues).toEqual([])
    expect(decl('bgGradient', 'LINEAR-GRADIENT(#fff,#000)').issues).toEqual([])
    // 금지 쪽도 같은 규칙을 받는다 — 대문자로 쓴다고 통과하지 않는다.
    expect(codes(decl('width', 'CALC(1px)').issues)).toEqual(['bad-style-value'])
    expect(codes(decl('bgGradient', 'URL(/a.png)').issues)).toEqual(['bad-style-value'])
  })

  it('괄호가 맞지 않으면 이슈다', () => {
    expect(codes(decl('bgImage', 'url(/a.png').issues)).toEqual(['bad-style-value'])
    expect(codes(decl('bgImage', '/a.png)').issues)).toEqual(['bad-style-value'])
  })
})

describe('styleDeclarations — typography (§6.5의 parts.title)', () => {
  it('넷으로 펼쳐진다', () => {
    expect(decl('typography', 'h3').css).toEqual([
      ['font-size', 'var(--wb-typography-h3-fontSize)'],
      ['line-height', 'var(--wb-typography-h3-lineHeight)'],
      ['font-weight', 'var(--wb-typography-h3-fontWeight)'],
      ['letter-spacing', 'var(--wb-typography-h3-letterSpacing)'],
    ])
  })

  it('스케일 항목에 없는 것은 선언을 내지 않는다', () => {
    // §6.3의 `body`가 letterSpacing을 갖지 않는다.
    const { css, issues } = decl('typography', 'body')
    expect(issues).toEqual([])
    expect(css.map(([name]) => name)).toEqual(['font-size', 'line-height', 'font-weight'])
  })

  it('타이포 항목이 아닌 이름은 이슈다', () => {
    // `typography.family`는 항목이 있어도 타이포 키가 하나도 없다.
    expect(codes(decl('typography', 'family').issues)).toEqual(['unknown-token'])
    expect(codes(decl('typography', 'h9').issues)).toEqual(['unknown-token'])
  })

  it('이름공간을 붙여 쓰면 이슈다 — §6.5는 항목 이름만 적는다', () => {
    expect(codes(decl('typography', 'typography.h3').issues)).toEqual(['unknown-token'])
  })
})

describe('cssVarName', () => {
  it('경로의 점이 하이픈이 된다 (D6)', () => {
    expect(cssVarName('semantic.primary')).toBe('--wb-semantic-primary')
    expect(cssVarName('space.6')).toBe('--wb-space-6')
    expect(cssVarName('typography.h3.fontSize')).toBe('--wb-typography-h3-fontSize')
  })
})

describe('프로토타입 키 — 규격을 통과한 입력이 검증기를 죽이지 않는다', () => {
  // 목록을 손으로 적지 않는다. 새는 이름은 `STYLE_PROPERTIES`가 객체 리터럴이라
  // 프로토타입에서 물려받는 것들이고, 그 목록은 런타임이 갖고 있다.
  const INHERITED = Object.getOwnPropertyNames(Object.prototype)

  it('물려받은 이름은 던지지 않고 이슈가 된다', () => {
    expect(INHERITED.length).toBeGreaterThan(0)
    for (const name of INHERITED) {
      const result = decl(name, '1px')
      expect(codes(result.issues), name).toEqual(['unknown-style-prop'])
      expect(result.css, name).toEqual([])
    }
  })

  it('함수 allowlist 조회도 같은 자리다', () => {
    // `FUNCTION_ALLOWLIST[prop]`이 프로토타입을 타면 `includes`가 없어 죽는다.
    // `bgImage`가 아닌 이름으로 함수를 넣어 그 갈래를 지나가게 한다.
    for (const name of INHERITED) {
      expect(() => decl(name, 'url(/a.png)'), name).not.toThrow()
    }
  })

  it('과도 차단이 없다 — §6.8의 이름은 전부 선언을 낸다', () => {
    for (const prop of Object.keys(STYLE_PROPERTIES)) {
      const value = prop === 'typography' ? 'h3' : '1px'
      const result = decl(prop, value)
      expect(codes(result.issues), prop).toEqual([])
      expect(result.css.length, prop).toBeGreaterThan(0)
    }
  })
})
