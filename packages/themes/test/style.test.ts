import { describe, expect, it } from 'vitest'
// 경로가 어긋나면 여기서 죽는다. 아래 `「스타일 프로퍼티 화이트리스트」를 실제로 읽는다`가 내용까지 확인한다.
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import {
  STYLE_PROPERTIES,
  STYLE_PROPERTIES_BEYOND_SPEC,
  cssVarName,
  styleDeclarations,
} from '../src/resolve/style'
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
  // 설계서 「tokens — 3단 분리」의 `scale.typography.family`. `resolveTokens`가 다른 타이포 항목과 같은 규칙으로
  // 평평하게 편다(`typography.<항목>.<키>`) — 이 표에 있는 것이 그 결과다.
  ['typography.family.sans', 'Pretendard, sans-serif'],
  ['typography.family.mono', 'D2Coding, monospace'],
])

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()
const decl = (prop: string, value: unknown) => styleDeclarations(prop, value, TOKENS)

/**
 * 설계서 「스타일 프로퍼티 화이트리스트」의 코드 블록에서 프로퍼티 이름을 뽑는다.
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
  it('「스타일 프로퍼티 화이트리스트」를 실제로 읽는다', () => {
    // 파싱이 깨지면 목록이 비고, 빈 집합끼리는 아래 대조가 조용히 통과한다.
    // 그래서 절의 첫 항목과 마지막 항목을 카나리아로 둔다.
    const names = propertiesInSpec()
    expect(names[0]).toBe('bg')
    expect(names.at(-1)).toBe('transition')
  })

  it('「스타일 프로퍼티 화이트리스트」의 이름을 하나도 빠뜨리지 않는다', () => {
    const table = new Set(Object.keys(STYLE_PROPERTIES))

    expect(propertiesInSpec().filter((name) => !table.has(name))).toEqual([])
  })

  /**
   * **「스타일 프로퍼티 화이트리스트」를 넘어선 어휘는 등록해야 한다.**
   *
   * *"화이트리스트가 그 절과 정확히 같다"* 한 케이스로 두면 절에 **없는** 어휘를 더하는 순간
   * 죽는다. **설계서의 절은 그대로 두고** 대조를 둘로 가른다:
   * 위 케이스가 *"절의 이름이 빠지지 않았는가"*를 보고, 이 케이스가 *"절에 없는 것이 몰래
   * 들어오지 않았는가"*를 본다.
   *
   * **양방향이 유지된다는 것이 요점이다.** 하나로 두면 어휘를 더할 때 케이스를 지우게 되고,
   * 그러면 그 절과의 연결이 통째로 끊긴다. 갈라 두면 어휘를 더하는 사람이 `BEYOND_SPEC`에
   * 이름을 적고 **근거를 함께 남겨야** 한다.
   */
  it('「스타일 프로퍼티 화이트리스트」에 없는 어휘는 BEYOND_SPEC에 등록된 것뿐이다', () => {
    const spec = new Set(propertiesInSpec())
    const extra = Object.keys(STYLE_PROPERTIES).filter((name) => !spec.has(name))

    expect([...extra].sort()).toEqual([...STYLE_PROPERTIES_BEYOND_SPEC].sort())
  })

  it('BEYOND_SPEC에 「스타일 프로퍼티 화이트리스트」가 이미 가진 이름을 넣지 않는다', () => {
    // 반대 방향. 절에 있는 이름을 여기 적으면 **위 케이스가 그 이름을 봐주게 된다** —
    // 표에서 그 이름이 사라져도 조용해진다.
    const spec = new Set(propertiesInSpec())

    expect(STYLE_PROPERTIES_BEYOND_SPEC.filter((name) => spec.has(name))).toEqual([])
  })

  it('BEYOND_SPEC의 이름은 실제로 표에 있다', () => {
    const table = new Set(Object.keys(STYLE_PROPERTIES))

    expect(STYLE_PROPERTIES_BEYOND_SPEC.filter((name) => !table.has(name))).toEqual([])
  })
})

describe('styleDeclarations — 이름', () => {
  it('화이트리스트 밖의 이름은 이슈다', () => {
    // **`fontFamily`는 여기 없다** — 어휘다. 아래 `fontFamily` 절이 그 이유를 든다.
    for (const prop of ['content', 'cursor', 'backdropFilter', 'maxHeight']) {
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

  /**
   * **「assets」의 `assets.fonts`가 닿는 곳이 여기다.** 그 절이 폰트를 선언하게 해 두었으므로
   * 폰트를 **거는** 어휘가 없으면 *"선언은 있는데 쓸 길이 없는"* 상태가 된다.
   *
   * **값은 둘 다 받는다 — 토큰 참조와 리터럴.** 「tokens — 3단 분리」의 `scale.typography.family`가
   * `{ sans, serif, mono }`를 갖고 있고 `resolveTokens`가 그것을 `typography.family.sans`로
   * 편다. 그 토큰을 가리킬 프로퍼티가 이것이다.
   * 리터럴을 막지 않는 이유는 「스타일 프로퍼티 화이트리스트」가 값 규칙을 *"토큰 참조 또는 리터럴"*로 못박았고
   * 폰트 스택은 그 자체가 CSS 리터럴 관용구이기 때문이다.
   */
  describe('fontFamily (「스타일 프로퍼티 화이트리스트」에 없는 어휘)', () => {
    it('리터럴 폰트 스택이 그대로 나간다', () => {
      expect(decl('fontFamily', 'Pretendard, sans-serif').css).toEqual([
        ['font-family', 'Pretendard, sans-serif'],
      ])
    })

    it('typography.family 토큰을 가리킬 수 있다', () => {
      expect(decl('fontFamily', 'typography.family.sans').css).toEqual([
        ['font-family', 'var(--wb-typography-family-sans)'],
      ])
      expect(decl('fontFamily', 'typography.family.mono').css).toEqual([
        ['font-family', 'var(--wb-typography-family-mono)'],
      ])
    })

    it('없는 폰트 토큰을 가리키면 이슈다', () => {
      const { css, issues } = decl('fontFamily', 'typography.family.serif')
      expect(codes(issues)).toEqual(['unknown-token'])
      expect(css).toEqual([])
    })

    it('따옴표가 든 폰트 이름도 통과한다', () => {
      // `"Pretendard Variable", sans-serif`는 CSS의 정상 표기다. 함수도 참조도 아니다.
      expect(decl('fontFamily', '"Pretendard Variable", sans-serif').css).toEqual([
        ['font-family', '"Pretendard Variable", sans-serif'],
      ])
    })

    it('함수는 여전히 막는다', () => {
      // 어휘를 여는 것과 값 규칙을 넓히는 것은 다른 일이다.
      expect(codes(decl('fontFamily', 'var(--x)').issues)).toEqual(['bad-style-value'])
    })
  })

  /**
   * **「컴파일」의 예시가 요구한다** —
   * `[data-wb-component="List"][data-wb-structure="cardGrid"] { display: grid; gap: … }`.
   * 트랙 선언이 없으면 그 규칙이 만드는 것은 **1열 그리드**다. `List.columns`는
   * `visibleWhen: { structure: 'table' }`인 **컬럼 이름 목록**이지 열 수가 아니므로
   * 노드도 그것을 못 정한다.
   *
   * **어휘의 모양: `gridColumns: <양의 정수>` 하나.**
   *
   * `grid-template-columns`를 그대로 열면 「스타일 프로퍼티 화이트리스트」가 스스로 적은 제한 이유 둘이 **동시에**
   * 깨진다 — 임의 문자열이라 값을 검증할 수 없고(`repeat(auto-fill, minmax(…))`부터
   * `subgrid`까지), GUI 편집도 불가능하며, 그 자리가 곧 무제한 스타일 튜닝의 입구가 된다.
   * 수 하나는 정수 범위로 검증되고 숫자 입력 하나로 편집된다.
   *
   * **`auto-fill`/`minmax`를 표현하지 못하는 것을 알고 고른다.** 반응형 카드 그리드는
   * 「components — 구조 + 스킨」의 `responsive`가 브레이크포인트마다 다른 `gridColumns`를 주는 것으로 표현된다 —
   * 어휘를 넓히지 않고도 같은 화면에 닿는 길이 이미 있다.
   */
  describe('gridColumns (「스타일 프로퍼티 화이트리스트」에 없는 어휘)', () => {
    it('열 수가 repeat(N, 1fr)로 펼쳐진다', () => {
      expect(decl('gridColumns', 3).css).toEqual([['grid-template-columns', 'repeat(3, 1fr)']])
      expect(decl('gridColumns', 1).css).toEqual([['grid-template-columns', 'repeat(1, 1fr)']])
    })

    it('양의 정수가 아니면 이슈다', () => {
      // **검증할 수 있다는 것이 이 어휘를 고른 이유다**(「스타일 프로퍼티 화이트리스트」의 제한 이유 1).
      for (const value of [0, -1, 2.5, '3', 'space.6', '', true, null, {}, [3]]) {
        const { css, issues } = decl('gridColumns', value)
        expect(codes(issues), JSON.stringify(value)).toEqual(['bad-style-value'])
        expect(css, JSON.stringify(value)).toEqual([])
      }
    })

    it('임의 트랙 문자열을 받지 않는다 — 「스타일 프로퍼티 화이트리스트」의 제한 이유 둘이 걸린다', () => {
      for (const value of ['repeat(auto-fill, minmax(200px, 1fr))', '1fr 2fr', 'subgrid']) {
        expect(codes(decl('gridColumns', value).issues), value).toEqual(['bad-style-value'])
      }
    })

    it('이슈 문안이 무엇을 적어야 하는지 말한다', () => {
      const [first] = decl('gridColumns', '3').issues
      expect(first?.message).toContain('정수')
    })
  })

  /**
   * **커스텀 프로퍼티 채널.**
   *
   * 구조 기본 CSS가 `--wb-tree-indent`를 손잡이로 남기므로 테마가 그 이름에 값을 넣을 길이
   * 있어야 한다 — 채널이 없으면 손잡이는 이름뿐이다.
   *
   * **임의 커스텀 프로퍼티를 열지 않는다.** 열면 화이트리스트가 무의미해진다 —
   * 무엇이든 `--x`로 내보낼 수 있고, 그 값을 읽는 규칙이 저쪽에 있으면 화이트리스트를
   * 우회해 임의 스타일을 거는 길이 된다. **손잡이마다 별칭 어휘 하나**를 여는 쪽이 그
   * 제한을 지키면서 「스타일 프로퍼티 화이트리스트」의 관용구(camelCase 이름 → CSS 프로퍼티)를 그대로 쓴다.
   *
   * **값 규칙도 그대로다** — 토큰 참조와 리터럴, 함수 금지. 새 규칙을 만들지 않는다.
   */
  describe('treeIndent (「스타일 프로퍼티 화이트리스트」에 없는 어휘)', () => {
    it('구조 기본 CSS가 읽는 커스텀 프로퍼티로 나간다', () => {
      expect(decl('treeIndent', '8px').css).toEqual([['--wb-tree-indent', '8px']])
    })

    it('토큰 참조를 받는다', () => {
      expect(decl('treeIndent', 'space.6').css).toEqual([['--wb-tree-indent', 'var(--wb-space-6)']])
    })

    it('없는 토큰과 함수는 여전히 이슈다', () => {
      expect(codes(decl('treeIndent', 'space.없음').issues)).toEqual(['unknown-token'])
      expect(codes(decl('treeIndent', 'calc(1px * 2)').issues)).toEqual(['bad-style-value'])
    })

    it('임의 커스텀 프로퍼티는 열리지 않는다', () => {
      // **이것이 이 채널을 별칭으로 연 이유다.** 이름을 직접 적는 길이 있으면
      // 화이트리스트가 무의미해진다.
      for (const prop of ['--wb-tree-indent', '--x', '--wb-node-grid-columns']) {
        expect(codes(decl(prop, '8px').issues), prop).toEqual(['unknown-style-prop'])
      }
    })
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

describe('styleDeclarations — 함수 (「스타일 프로퍼티 화이트리스트」)', () => {
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
    // 이름을 못 찾으면 `names`가 비어 함수 검사 자체를 건너뛴다 — 함수 금지가
    // 공백 하나로 지나간다.
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

describe('styleDeclarations — typography (「components — 구조 + 스킨」의 parts.title)', () => {
  it('넷으로 펼쳐진다', () => {
    expect(decl('typography', 'h3').css).toEqual([
      ['font-size', 'var(--wb-typography-h3-fontSize)'],
      ['line-height', 'var(--wb-typography-h3-lineHeight)'],
      ['font-weight', 'var(--wb-typography-h3-fontWeight)'],
      ['letter-spacing', 'var(--wb-typography-h3-letterSpacing)'],
    ])
  })

  it('스케일 항목에 없는 것은 선언을 내지 않는다', () => {
    // 「tokens — 3단 분리」의 `body`가 letterSpacing을 갖지 않는다.
    const { css, issues } = decl('typography', 'body')
    expect(issues).toEqual([])
    expect(css.map(([name]) => name)).toEqual(['font-size', 'line-height', 'font-weight'])
  })

  it('문자열이 아닌 값은 이슈다 — 조용히 사라지지 않는다', () => {
    // 수 갈래가 `typography` 갈래보다 먼저 돌면 `STYLE_PROPERTIES.typography`가 빈 배열이라
    // 선언도 이슈도 없이 사라진다. "css가 비면 이슈가 있다"의 역이 깨지는 자리다.
    for (const value of [700, 0, true, null, {}]) {
      const { css, issues } = decl('typography', value)
      expect(codes(issues), JSON.stringify(value)).toEqual(['bad-style-value'])
      expect(css, JSON.stringify(value)).toEqual([])
    }
  })

  it('선언이 비면 이슈가 있다 — 화이트리스트 전체에서', () => {
    // 위 역이 다른 프로퍼티에서도 성립하는지 훑는다. 분모를 손으로 적지 않는다.
    for (const prop of Object.keys(STYLE_PROPERTIES)) {
      for (const value of ['h3', 1, '1px', 'nope', 'space.6']) {
        const { css, issues } = decl(prop, value)
        if (css.length === 0) expect(issues.length, `${prop} ← ${JSON.stringify(value)}`).toBeGreaterThan(0)
      }
    }
  })

  it('타이포 항목이 아닌 이름은 이슈다', () => {
    // `typography.family`는 항목이 있어도 타이포 키가 하나도 없다.
    expect(codes(decl('typography', 'family').issues)).toEqual(['unknown-token'])
    expect(codes(decl('typography', 'h9').issues)).toEqual(['unknown-token'])
  })

  it('이름공간을 붙여 쓰면 이슈다 — 「components — 구조 + 스킨」은 항목 이름만 적는다', () => {
    expect(codes(decl('typography', 'typography.h3').issues)).toEqual(['unknown-token'])
  })
})

describe('cssVarName', () => {
  it('경로의 점이 하이픈이 된다', () => {
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

  it('과도 차단이 없다 — 화이트리스트의 이름은 전부 선언을 낸다', () => {
    // 값 규칙이 특별한 어휘는 정상값을 따로 준다. **표를 손으로 유지하지 않는다** —
    // 여기 없는 이름은 `'1px'`을 받고, 그것이 이슈면 이 케이스가 죽는다.
    const SAMPLE: Record<string, unknown> = { typography: 'h3', gridColumns: 3 }

    for (const prop of Object.keys(STYLE_PROPERTIES)) {
      const value = SAMPLE[prop] ?? '1px'
      const result = decl(prop, value)
      expect(codes(result.issues), prop).toEqual([])
      expect(result.css.length, prop).toBeGreaterThan(0)
    }
  })
})

describe('스타일 값은 palette를 직접 가리키지 못한다', () => {
  const PALETTE: TokenTable = new Map([
    ['palette.blue.500', '#3b82f6'],
    ['semantic.primary', '#2563eb'],
    ['space.6', '24px'],
  ])
  const at = (prop: string, value: unknown) => styleDeclarations(prop, value, PALETTE)

  it('통째로 가리키면 이슈다', () => {
    const { css, issues } = at('bg', 'palette.blue.500')
    expect(codes(issues)).toEqual(['bad-style-value'])
    expect(css).toEqual([])
  })

  it('값 안쪽에 섞여도 이슈다', () => {
    expect(codes(at('shadow', '1px solid palette.blue.500').issues)).toEqual(['bad-style-value'])
    expect(codes(at('bgGradient', 'linear-gradient(palette.blue.500, #000)').issues)).toEqual([
      'bad-style-value',
    ])
  })

  it('이슈 문안이 무엇을 쓰라는지 말한다', () => {
    const [first] = at('bg', 'palette.blue.500').issues
    expect(first?.message).toContain('semantic')
  })

  it('과도 차단이 없다 — 나머지 이름공간은 그대로 통과한다', () => {
    expect(at('bg', 'semantic.primary').issues).toEqual([])
    expect(at('padding', 'space.6').issues).toEqual([])
    expect(at('transition', 'opacity space.6').issues).toEqual([])
    expect(at('bgGradient', 'linear-gradient(semantic.primary, #000)').issues).toEqual([])
  })

  it('리터럴 색은 그대로 쓸 수 있다 — 막는 것은 참조뿐이다', () => {
    expect(at('bg', '#3b82f6').css).toEqual([['background', '#3b82f6']])
  })
})

describe('참조 판정이 URL 안의 경로를 삼키지 않는다 (거짓 양성)', () => {
  const T: TokenTable = new Map([
    ['space.6', '24px'],
    ['semantic.primary', '#2563eb'],
    ['radius.lg', '12px'],
  ])

  /** 이름공간과 같은 마디를 가진 실제 URL들. 디자인 자산에서 드물지 않은 이름이다. */
  const URLS = [
    '/img/space.png',
    '/assets/shadow.svg',
    'https://cdn.example/typography.woff2',
    '/a/motion.gif',
    '/img/palette.jpg',
    '/img/semantic.webp',
    '/img/radius.png',
    'space.png',
    'radius.lg.png',
    '/my-palette.x/a.png',
    '/img/hero.png',
    'data:image/svg+xml;base64,AAA',
  ]

  it('url() 안의 경로는 참조로 읽지 않는다', () => {
    for (const target of URLS) {
      const { css, issues } = styleDeclarations('bgImage', `url(${target})`, T)
      expect(codes(issues), target).toEqual([])
      expect(css, target).toEqual([['background-image', `url(${target})`]])
    }
  })

  it('URL과 진짜 참조를 조합해도 각각 제 몫을 한다', () => {
    const REFS: Array<[string, string]> = [
      ['space.6', 'var(--wb-space-6)'],
      ['semantic.primary', 'var(--wb-semantic-primary)'],
      ['radius.lg', 'var(--wb-radius-lg)'],
    ]
    for (const target of URLS) {
      for (const [ref, expanded] of REFS) {
        // 그라디언트 안의 참조는 풀리고, 같은 값에 든 URL 문자열은 그대로다.
        const value = `linear-gradient(${ref}, #000)`
        const gradient = styleDeclarations('bgGradient', value, T)
        expect(codes(gradient.issues), value).toEqual([])
        expect(gradient.css[0]?.[1], value).toBe(`linear-gradient(${expanded}, #000)`)

        const image = styleDeclarations('bgImage', `url(${target})`, T)
        expect(codes(image.issues), `${target} × ${ref}`).toEqual([])
      }
    }
  })

  it('진짜 참조를 놓치지 않는다 — 반대 방향', () => {
    expect(decl('padding', 'space.6').css).toEqual([['padding', 'var(--wb-space-6)']])
    expect(decl('transition', 'opacity space.6').css).toEqual([
      ['transition', 'opacity var(--wb-space-6)'],
    ])
    expect(decl('shadow', '0 0 0 space.6 semantic.surface').css).toEqual([
      ['box-shadow', '0 0 0 var(--wb-space-6) var(--wb-semantic-surface)'],
    ])
    expect(codes(decl('padding', 'space.99').issues)).toEqual(['unknown-token'])
    expect(codes(decl('bgGradient', 'linear-gradient(semantic.missing, #000)').issues)).toEqual([
      'unknown-token',
    ])
  })

  it('경로 마디에 붙은 이름은 참조가 아니다 — url() 밖에서도 같다', () => {
    // `/`·`-` 뒤는 값 토큰의 경계가 아니다.
    expect(decl('transition', 'my-space.6').css).toEqual([['transition', 'my-space.6']])
    expect(decl('transition', 'a/space.6').css).toEqual([['transition', 'a/space.6']])
  })
})

describe('설계서 「primitives」·「components」·「patterns」의 값 자리에 palette 참조가 있는가 (palette 금지의 근거)', () => {
  const sectionBetween = (from: string, to: string) => {
    const after = designDoc.split(from)[1] ?? ''
    return after.split(to)[0] ?? ''
  }

  it('「tokens」에는 palette 참조가 있다 — 파싱이 살아 있는지 보는 카나리아', () => {
    expect(sectionBetween('### 6.3 tokens', '### 6.4')).toContain('"palette.')
  })

  it('「primitives」·「components」·「patterns」의 값 자리에는 없다', () => {
    // 있으면 스타일 층은 의미 계층만 본다는 규칙이 설계와 어긋나는 것이므로
    // `STYLE_FORBIDDEN_NAMESPACES`를 다시 판정해야 한다.
    for (const [from, to] of [
      ['### 6.4 primitives', '### 6.5'],
      ['### 6.5 components', '### 6.6'],
      ['### 6.6 patterns', '### 6.7'],
    ] as const) {
      expect(sectionBetween(from, to), from).not.toContain('"palette.')
    }
  })
})

describe('스타일 값이 CSS 블록을 깨고 나가지 못한다', () => {
  const BREAKS_OUT = [
    'red; } body{display:none',
    '#fff }',
    'a{b}',
    'red /* ',
    'red */ x',
    '</style>',
    '<b>',
    'red;color:blue',
    '\\7d body{color:red}',
  ]

  it('블록·주석·태그·이스케이프 문자가 오면 이슈다', () => {
    for (const value of BREAKS_OUT) {
      const { css, issues } = decl('bg', value)
      expect(codes(issues), value).toEqual(['bad-style-value'])
      expect(css, value).toEqual([])
    }
  })

  it('url() 안쪽의 세미콜론은 살아 있다 — data URI가 그것을 쓴다', () => {
    expect(decl('bgImage', 'url(data:image/svg+xml;base64,AAA)').issues).toEqual([])
    // 다만 괄호·꺾쇠는 url() 안쪽에서도 막는다 — 그 안에 `</style>`이 들어오면 같은 사고다.
    expect(codes(decl('bgImage', 'url(/a</style>.png)').issues)).toEqual(['bad-style-value'])
    expect(codes(decl('bgImage', 'url(/a}b.png)').issues)).toEqual(['bad-style-value'])
  })

  it('정상 값은 그대로 통과한다 — 과도 차단이 없다', () => {
    for (const [prop, value] of [
      ['bg', '#ffffff'],
      ['borderWidth', '1px'],
      ['aspectRatio', '16/9'],
      ['objectFit', 'cover'],
      ['transition', 'opacity 200ms'],
      ['shadow', '0 1px 2px #0001'],
      ['bgGradient', 'linear-gradient(#fff, #000)'],
    ] as const) {
      expect(codes(decl(prop, value).issues), `${prop}: ${value}`).toEqual([])
    }
  })
})
