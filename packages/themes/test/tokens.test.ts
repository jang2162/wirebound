import { describe, expect, it } from 'vitest'
import { TokensSchema } from '../src/spec/tokens'
import { SPACE_MAX, resolveTokens } from '../src/resolve/tokens'

/** 이슈 코드만 뽑는다 — 문장은 계약이 아니다. */
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()

describe('TokensSchema', () => {
  it('설계 §6.3의 예시가 그대로 통과한다', () => {
    const parsed = TokensSchema.safeParse({
      palette: {
        'blue.500': '#3b82f6',
        'blue.600': '#2563eb',
        'gray.50': '#f9fafb',
        'gray.500': '#6b7280',
        'gray.900': '#111827',
      },
      semantic: {
        primary: 'palette.blue.600',
        primaryHover: 'palette.blue.500',
        text: 'palette.gray.900',
        textMuted: 'palette.gray.500',
        surface: '#ffffff',
        canvas: 'palette.gray.50',
        border: '#e5e7eb',
        danger: '#dc2626',
      },
      scale: {
        space: { unit: '4px' },
        radius: { sm: '4px', md: '6px', lg: '12px', full: '9999px' },
        shadow: { sm: '0 1px 2px rgba(0,0,0,.05)', lg: '0 10px 24px rgba(0,0,0,.12)' },
        typography: {
          family: { sans: 'Pretendard, sans-serif', serif: 'Noto Serif KR', mono: 'D2Coding' },
          display: { fontSize: '56px', lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.02em' },
          h1: { fontSize: '32px', lineHeight: 1.25, fontWeight: 700 },
          body: { fontSize: '14px', lineHeight: 1.5, fontWeight: 400 },
          caption: { fontSize: '12px', lineHeight: 1.4, fontWeight: 400 },
        },
        motion: { fast: '120ms', base: '200ms', easing: 'cubic-bezier(.4,0,.2,1)' },
      },
    })
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('세 층이 모두 선택이다 — 빈 tokens가 통과한다', () => {
    expect(TokensSchema.safeParse({}).success).toBe(true)
  })

  it('선언되지 않은 키는 그 자체로 실패다', () => {
    expect(TokensSchema.safeParse({ colors: {} }).success).toBe(false)
    expect(TokensSchema.safeParse({ scale: { size: {} } }).success).toBe(false)
  })

  it('scale.space는 unit 하나만 받는다 — 개별 간격을 나열하는 자리가 아니다', () => {
    expect(TokensSchema.safeParse({ scale: { space: { unit: '4px' } } }).success).toBe(true)
    expect(TokensSchema.safeParse({ scale: { space: { unit: '4px', 6: '24px' } } }).success).toBe(false)
    expect(TokensSchema.safeParse({ scale: { space: {} } }).success).toBe(false)
  })
})

describe('resolveTokens — 층별 규칙', () => {
  it('palette의 값이 참조면 이슈다 — 참조할 대상이 없는 층이다', () => {
    const { table, issues } = resolveTokens({ palette: { 'blue.500': 'semantic.primary' } })
    expect(codes(issues)).toEqual(['bad-token-value'])
    expect(table.has('palette.blue.500')).toBe(false)
  })

  it('semantic이 palette를 풀어 리터럴이 된다', () => {
    const { table, issues } = resolveTokens({
      palette: { 'blue.600': '#2563eb' },
      semantic: { primary: 'palette.blue.600' },
    })
    expect(issues).toEqual([])
    expect(table.get('semantic.primary')).toBe('#2563eb')
    expect(table.get('palette.blue.600')).toBe('#2563eb')
  })

  it('semantic의 리터럴은 그대로 남는다', () => {
    const { table, issues } = resolveTokens({ semantic: { surface: '#ffffff' } })
    expect(issues).toEqual([])
    expect(table.get('semantic.surface')).toBe('#ffffff')
  })

  it('palette가 비어도 semantic이 리터럴만 쓰면 성립한다', () => {
    const { table, issues } = resolveTokens({ semantic: { surface: '#ffffff', border: '#e5e7eb' } })
    expect(issues).toEqual([])
    expect(table.size).toBe(2)
  })

  it('semantic이 semantic을 가리키는 사슬이 풀린다', () => {
    // D3의 표는 semantic이 palette만 본다고 적었지만, 같은 D3의 산문이
    // "semantic 안에서만 순환이 가능하다"고 적어 semantic→semantic을 전제한다.
    // 산문 쪽을 택했다 — 표대로면 아래 순환 케이스가 성립할 수 없다.
    const { table, issues } = resolveTokens({
      palette: { 'blue.600': '#2563eb' },
      semantic: { primary: 'palette.blue.600', accent: 'semantic.primary' },
    })
    expect(issues).toEqual([])
    expect(table.get('semantic.accent')).toBe('#2563eb')
  })

  it('semantic이 스케일 층을 가리키면 이슈다 — 참조는 단방향이다', () => {
    const { issues } = resolveTokens({
      scale: { radius: { lg: '12px' } },
      semantic: { primary: 'radius.lg' },
    })
    expect(codes(issues)).toEqual(['bad-token-value'])
  })

  it('없는 palette 키를 가리키면 이슈이고 그 토큰은 표에 실리지 않는다', () => {
    const { table, issues } = resolveTokens({ semantic: { primary: 'palette.blue.600' } })
    expect(codes(issues)).toEqual(['unknown-token'])
    expect(table.has('semantic.primary')).toBe(false)
  })

  it('semantic 안의 순환(a → b → a)이 이슈다 — 스택이 터지지 않는다', () => {
    const { table, issues } = resolveTokens({
      semantic: { a: 'semantic.b', b: 'semantic.a' },
    })
    expect(issues.every((i) => i.code === 'circular-token')).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
    expect(table.has('semantic.a')).toBe(false)
    expect(table.has('semantic.b')).toBe(false)
  })

  it('자기 자신을 가리키는 것도 이슈다', () => {
    const { table, issues } = resolveTokens({ semantic: { a: 'semantic.a' } })
    expect(codes(issues)).toEqual(['circular-token'])
    expect(table.has('semantic.a')).toBe(false)
  })

  it('긴 순환에서도 스택이 터지지 않는다', () => {
    const semantic: Record<string, string> = {}
    for (let i = 0; i < 5000; i += 1) semantic[`k${i}`] = `semantic.k${(i + 1) % 5000}`
    const { issues } = resolveTokens({ semantic })
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every((i) => i.code === 'circular-token')).toBe(true)
  })

  it('이슈에 어느 자리인지가 실린다', () => {
    const { issues } = resolveTokens({ semantic: { primary: 'palette.missing' } })
    expect(issues[0]?.path).toBe('tokens.semantic.primary')
  })

  it('토큰 이름으로 선언될 수 없는 문자를 가리켜도 참조로 읽어 이슈를 낸다', () => {
    // 규격의 토큰 이름은 [A-Za-z0-9_.-]이므로 아래 이름은 선언 자체가 불가능하다.
    // 참조 판정을 그 문자 집합으로 좁히면 이 값이 리터럴로 조용히 통과한다.
    const { table, issues } = resolveTokens({ semantic: { primary: 'palette.없음' } })
    expect(codes(issues)).toEqual(['unknown-token'])
    expect(table.has('semantic.primary')).toBe(false)
  })
})

describe('resolveTokens — space 파생 (§6.3)', () => {
  it('unit 하나에서 배수가 파생된다', () => {
    const { table, issues } = resolveTokens({ scale: { space: { unit: '4px' } } })
    expect(issues).toEqual([])
    expect(table.get('space.1')).toBe('4px')
    expect(table.get('space.6')).toBe('24px')
  })

  it('경계 둘 — space.24가 있고 space.25가 없다', () => {
    // 24는 §6.3이 준 규격 상수이지 코드를 세어 얻은 수가 아니다. 그래서 여기 그대로 적는다.
    // SPACE_MAX를 그대로 쓰면 상한을 바꾸는 변이에 이 케이스가 눈을 감는다(재서 확인했다).
    expect(SPACE_MAX).toBe(24)
    const { table } = resolveTokens({ scale: { space: { unit: '4px' } } })
    expect(table.has('space.24')).toBe(true)
    expect(table.has('space.25')).toBe(false)
    // 0은 파생하지 않는다 — §6.3이 space.1부터 적었다.
    expect(table.has('space.0')).toBe(false)
  })

  it('px가 아닌 단위도 수치×배수다', () => {
    expect(resolveTokens({ scale: { space: { unit: '0.25rem' } } }).table.get('space.6')).toBe('1.5rem')
    expect(resolveTokens({ scale: { space: { unit: '1em' } } }).table.get('space.6')).toBe('6em')
  })

  it('부동소수 잔여가 값에 새지 않는다', () => {
    // 0.1 * 3은 자바스크립트에서 0.30000000000000004다.
    expect(resolveTokens({ scale: { space: { unit: '0.1rem' } } }).table.get('space.3')).toBe('0.3rem')
  })

  it('단위 없는 unit은 이슈다 — 파생 결과가 전부 무효 선언이 된다', () => {
    const { table, issues } = resolveTokens({ scale: { space: { unit: '4' } } })
    expect(codes(issues)).toEqual(['bad-token-value'])
    expect(table.has('space.6')).toBe(false)
  })

  it('단위의 대소문자를 가리지 않는다 — CSS가 가리지 않는다', () => {
    expect(resolveTokens({ scale: { space: { unit: '4PX' } } }).table.get('space.6')).toBe('24PX')
    expect(resolveTokens({ scale: { space: { unit: '0.25REM' } } }).table.get('space.6')).toBe('1.5REM')
    expect(resolveTokens({ scale: { space: { unit: '4Px' } } }).issues).toEqual([])
  })

  it('CSS 길이 단위가 아닌 것도 이슈다', () => {
    for (const unit of ['4dp', '4 px', 'calc(4px)', '', 'space.1']) {
      expect(codes(resolveTokens({ scale: { space: { unit } } }).issues), unit).toEqual([
        'bad-token-value',
      ])
    }
  })
})

describe('resolveTokens — scale 나머지', () => {
  it('radius·shadow·motion이 그대로 표에 실린다', () => {
    const { table, issues } = resolveTokens({
      scale: {
        radius: { lg: '12px' },
        shadow: { sm: '0 1px 2px rgba(0,0,0,.05)' },
        motion: { easing: 'cubic-bezier(.4,0,.2,1)' },
      },
    })
    expect(issues).toEqual([])
    expect(table.get('radius.lg')).toBe('12px')
    expect(table.get('shadow.sm')).toBe('0 1px 2px rgba(0,0,0,.05)')
    expect(table.get('motion.easing')).toBe('cubic-bezier(.4,0,.2,1)')
  })

  it('scale에 참조를 쓰면 이슈다 — 스케일은 리터럴 층이다', () => {
    const { issues } = resolveTokens({
      semantic: { primary: '#2563eb' },
      scale: { radius: { lg: 'semantic.primary' } },
    })
    expect(codes(issues)).toEqual(['bad-token-value'])
  })

  it('typography는 값이 객체이므로 평평하게 실린다', () => {
    const { table, issues } = resolveTokens({
      scale: {
        typography: {
          family: { sans: 'Pretendard, sans-serif' },
          h1: { fontSize: '32px', lineHeight: 1.25, fontWeight: 700 },
        },
      },
    })
    expect(issues).toEqual([])
    expect(table.get('typography.family.sans')).toBe('Pretendard, sans-serif')
    expect(table.get('typography.h1.fontSize')).toBe('32px')
    // 수는 문자열로 실린다 — 표의 값은 CSS에 그대로 나갈 리터럴이다.
    expect(table.get('typography.h1.lineHeight')).toBe('1.25')
    expect(table.get('typography.h1.fontWeight')).toBe('700')
    // 항목 이름 자체는 표의 키가 아니다.
    expect(table.has('typography.h1')).toBe(false)
  })
})

describe('resolveTokens — 이슈를 모아 낸다', () => {
  it('첫 이슈에서 멈추지 않는다', () => {
    // P4c의 저작 UI가 여러 오류를 한 번에 보여야 한다.
    const { issues } = resolveTokens({
      palette: { a: 'semantic.x' },
      semantic: { p: 'palette.없음', q: 'palette.없음2' },
      scale: { space: { unit: '4' } },
    })
    expect(issues.length).toBeGreaterThanOrEqual(4)
  })
})

describe('프로토타입 키 — 물려받은 멤버가 표에 실리지 않는다', () => {
  // 목록을 손으로 적지 않는다. 새는 이름은 런타임이 갖고 있다.
  const INHERITED = Object.getOwnPropertyNames(Object.prototype)

  it('semantic이 물려받은 이름을 가리키면 이슈다', () => {
    expect(INHERITED.length).toBeGreaterThan(0)
    for (const name of INHERITED) {
      const { table, issues } = resolveTokens({ semantic: { a: `semantic.${name}` } })
      expect(codes(issues), name).toEqual(['unknown-token'])
      expect(table.has('semantic.a'), name).toBe(false)
    }
  })

  it('표의 값은 언제나 문자열이다', () => {
    // 물려받은 멤버가 새면 함수 객체가 실린다 — 타입이 거짓말을 하게 된다.
    for (const name of INHERITED) {
      const { table } = resolveTokens({ semantic: { a: `semantic.${name}`, b: '#fff' } })
      for (const [key, value] of table) {
        expect(typeof value, `${name} → ${key}`).toBe('string')
      }
    }
  })

  it('물려받은 이름을 키로 선언하면 그대로 쓸 수 있다 — 과도 차단이 없다', () => {
    for (const name of INHERITED) {
      const { table, issues } = resolveTokens({
        semantic: { [name]: '#fff', a: `semantic.${name}` },
      })
      // `__proto__`는 객체에 자기 키로 남지 않는다 — 그 갈래는 아래 케이스가 따로 잰다.
      if (name === '__proto__') continue
      expect(codes(issues), name).toEqual([])
      expect(table.get('semantic.a'), name).toBe('#fff')
    }
  })

  it('__proto__는 키가 되지 못한다 — 심어서 확인한다', () => {
    // 리터럴에서도 zod 출력에서도 자기 키로 남지 않으므로, 그것을 가리키면 이슈여야 한다.
    const declared = { ['__proto__' as string]: '#fff' } as Record<string, string>
    expect(Object.hasOwn(declared, '__proto__')).toBe(true)
    const parsed = TokensSchema.safeParse({ semantic: JSON.parse('{"__proto__":"#fff"}') })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(Object.keys(parsed.data.semantic ?? {})).toEqual([])
  })
})

describe('토큰 층의 함수 (§6.8의 금지가 우회되지 않는다)', () => {
  it('§6.3이 쓰는 표기 함수는 통과한다', () => {
    const { table, issues } = resolveTokens({
      scale: {
        shadow: { sm: '0 1px 2px rgba(0,0,0,.05)' },
        motion: { easing: 'cubic-bezier(.4,0,.2,1)', step: 'steps(4, end)' },
      },
      semantic: { primary: 'hsl(220 90% 56%)', muted: 'RGB(1,2,3)' },
    })
    expect(issues).toEqual([])
    expect(table.get('shadow.sm')).toBe('0 1px 2px rgba(0,0,0,.05)')
    expect(table.get('semantic.muted')).toBe('RGB(1,2,3)')
  })

  it('계산·참조·외부 자원 함수는 어느 층에서든 이슈다', () => {
    const bad = ['calc(1px + 2px)', 'url(/a.png)', 'var(--x)', 'attr(data-x)', 'env(safe-area-inset-top)']
    for (const value of bad) {
      expect(codes(resolveTokens({ palette: { a: value } }).issues), `palette ${value}`).toEqual(['bad-token-value'])
      expect(codes(resolveTokens({ semantic: { a: value } }).issues), `semantic ${value}`).toEqual(['bad-token-value'])
      expect(codes(resolveTokens({ scale: { radius: { a: value } } }).issues), `radius ${value}`).toEqual(['bad-token-value'])
      expect(codes(resolveTokens({ scale: { shadow: { a: value } } }).issues), `shadow ${value}`).toEqual(['bad-token-value'])
      expect(codes(resolveTokens({ scale: { motion: { a: value } } }).issues), `motion ${value}`).toEqual(['bad-token-value'])
      expect(
        codes(resolveTokens({ scale: { typography: { h9: { fontSize: value } } } }).issues),
        `typography ${value}`,
      ).toEqual(['bad-token-value'])
    }
  })

  it('그라디언트는 토큰이 아니라 bgGradient가 받는 값이다', () => {
    expect(codes(resolveTokens({ palette: { a: 'linear-gradient(#fff,#000)' } }).issues)).toEqual([
      'bad-token-value',
    ])
  })

  it('토큰 층에서도 중첩과 이름 없는 괄호가 이슈다', () => {
    expect(codes(resolveTokens({ semantic: { a: 'rgba(calc(1px),0,0,1)' } }).issues)).toEqual([
      'bad-token-value',
    ])
    expect(codes(resolveTokens({ semantic: { a: 'rgba (0,0,0,1)' } }).issues)).toEqual([
      'bad-token-value',
    ])
  })

  it('이슈가 난 토큰은 표에 실리지 않는다 — 우회의 출발점이 사라진다', () => {
    const { table } = resolveTokens({
      palette: { evil: 'url(https://evil.example/x.png)' },
      semantic: { bad: 'palette.evil' },
    })
    expect(table.has('palette.evil')).toBe(false)
    expect(table.has('semantic.bad')).toBe(false)
  })
})
