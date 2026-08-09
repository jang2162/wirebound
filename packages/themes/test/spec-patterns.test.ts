import { installCatalog, validatePage } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  PATTERN_CATEGORIES,
  PatternsSchema,
  SLOT_TYPES,
  checkPatterns,
} from '../src/spec/patterns'

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()

beforeAll(() => {
  installCatalog()
})

/** §6.6의 예시를 옮긴 것. `Grid.props.gap`만 뺐다 — 그 자리는 아래 주석에 적었다. */
const HERO_SPLIT = {
  name: '히어로 — 좌우 분할',
  slots: { title: 'text', body: 'text', cta: 'action', image: 'media' },
  schema: {
    type: 'Section',
    variant: 'hero',
    children: [
      {
        type: 'Grid',
        props: { columns: 2 },
        children: [
          {
            type: 'Flex',
            props: { direction: 'column' },
            children: [
              { type: 'Text', slot: 'title', props: { role: 'display' } },
              { type: 'Text', slot: 'body', props: { role: 'body' } },
              { type: 'Button', slot: 'cta', variant: 'primary' },
            ],
          },
          { type: 'Media', slot: 'image' },
        ],
      },
    ],
  },
}

describe('재라 #4 — validatePage를 재사용할 수 없다', () => {
  it('slot 필드가 붙은 노드는 봉투 검사에서 막힌다', () => {
    // `WbNodeSchema`가 `z.strictObject`라 `slot`이 인식되지 않는 키다. 그리고 봉투 이슈가
    // 나오면 `validatePage`가 **즉시 반환**하므로 트리 검증까지 가지도 않는다.
    const issues = validatePage({
      version: 1,
      root: { id: 'n_p', type: 'Page', children: [{ id: 'n_t', type: 'Text', slot: 'title' }] },
    } as never)
    expect(issues.map((i) => i.code)).toEqual(['bad-document'])
  })

  it('패턴 조각의 루트는 Page가 아니다', () => {
    const issues = validatePage({ version: 1, root: { id: 'n_s', type: 'Section' } } as never)
    expect(issues.map((i) => i.code)).toEqual(['bad-root'])
  })
})

describe('PatternsSchema', () => {
  it('설계 §6.6의 예시가 통과한다', () => {
    const parsed = PatternsSchema.safeParse({ 'hero.split': HERO_SPLIT })
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('name·schema가 필수다', () => {
    expect(PatternsSchema.safeParse({ 'hero.split': { schema: { type: 'Section' } } }).success)
      .toBe(false)
    expect(PatternsSchema.safeParse({ 'hero.split': { name: '가' } }).success).toBe(false)
  })

  it('slots는 선택이다 — 슬롯 없는 패턴이 있다', () => {
    expect(
      PatternsSchema.safeParse({ 'footer.simple': { name: '가', schema: { type: 'Section' } } })
        .success,
    ).toBe(true)
  })

  it('slots의 값은 슬롯 타입이어야 한다', () => {
    for (const type of SLOT_TYPES) {
      const spec = { name: '가', slots: { a: type }, schema: { type: 'Section', slot: 'a' } }
      expect(PatternsSchema.safeParse({ 'hero.x': spec }).success, type).toBe(true)
    }
    expect(
      PatternsSchema.safeParse({
        'hero.x': { name: '가', slots: { a: 'number' }, schema: { type: 'Section' } },
      }).success,
    ).toBe(false)
  })

  it('노드에 id를 쓸 수 없다 — 전개 시점에 발급된다(§6.6)', () => {
    expect(
      PatternsSchema.safeParse({
        'hero.x': { name: '가', schema: { type: 'Section', id: 'n_a' } },
      }).success,
    ).toBe(false)
  })

  it('노드에 marker·interactions를 쓸 수 없다', () => {
    for (const extra of [{ marker: 1 }, { interactions: [] }]) {
      expect(
        PatternsSchema.safeParse({
          'hero.x': { name: '가', schema: { type: 'Section', ...extra } },
        }).success,
        JSON.stringify(extra),
      ).toBe(false)
    }
  })
})

describe('checkPatterns — 이름 (§6.6)', () => {
  const check = (patterns: unknown) => checkPatterns(patterns as never)

  it('이름이 <범주>.<변형>이어야 한다', () => {
    expect(check({ 'hero.split': HERO_SPLIT }).issues).toEqual([])
    for (const name of ['hero', 'hero.split.wide', 'hero.', '.split', '']) {
      const spec = { ...HERO_SPLIT }
      expect(codes(check({ [name]: spec }).issues), JSON.stringify(name)).toContain(
        'bad-pattern-name',
      )
    }
  })

  it('범주가 §6.6의 고정 목록 안이어야 한다', () => {
    for (const category of PATTERN_CATEGORIES) {
      const issues = check({
        [`${category}.x`]: { name: '가', schema: { type: 'Section' } },
      }).issues
      expect(issues, category).toEqual([])
    }
    expect(codes(check({ 'banner.x': { name: '가', schema: { type: 'Section' } } }).issues))
      .toEqual(['bad-pattern-name'])
  })
})

describe('checkPatterns — 슬롯 양방향 대조', () => {
  const check = (patterns: unknown) => checkPatterns(patterns as never)

  it('schema의 slot이 slots에 선언된 이름이어야 한다', () => {
    // 선언된 `title`은 쓰이게 두어 `unused-slot`이 섞이지 않게 한다 — 두 방향을 따로 잰다.
    const issues = check({
      'hero.x': {
        name: '가',
        slots: { title: 'text' },
        schema: {
          type: 'Section',
          children: [
            { type: 'Text', slot: 'title' },
            { type: 'Text', slot: 'subtitle' },
          ],
        },
      },
    }).issues
    expect(codes(issues)).toEqual(['unknown-slot'])
  })

  it('slots에 선언됐는데 schema가 쓰지 않으면 이슈다', () => {
    const issues = check({
      'hero.x': {
        name: '가',
        slots: { title: 'text', body: 'text' },
        schema: { type: 'Section', children: [{ type: 'Text', slot: 'title' }] },
      },
    }).issues
    expect(codes(issues)).toEqual(['unused-slot'])
  })

  it('양쪽이 맞으면 이슈가 없다', () => {
    expect(check({ 'hero.split': HERO_SPLIT }).issues).toEqual([])
  })
})

describe('checkPatterns — schema 조각과 카탈로그 대조', () => {
  const check = (patterns: unknown) => checkPatterns(patterns as never)
  const wrap = (schema: unknown) => ({ 'hero.x': { name: '가', schema } })

  it('노드 타입이 카탈로그에 있어야 한다', () => {
    expect(codes(check(wrap({ type: 'Carousel' })).issues)).toEqual(['bad-pattern-node'])
  })

  it('props를 카탈로그의 zod로 검증한다', () => {
    // 판정: 카탈로그가 단일 진실이다(§3.2). 여기서 안 보면 잘못된 패턴이 전개 시점까지 간다.
    expect(check(wrap({ type: 'Grid', props: { columns: 2 } })).issues).toEqual([])
    expect(codes(check(wrap({ type: 'Grid', props: { columns: 0 } })).issues)).toEqual([
      'bad-pattern-node',
    ])
    expect(codes(check(wrap({ type: 'Grid', props: { gap: 'space.10' } })).issues)).toEqual([
      'bad-pattern-node',
    ])
  })

  it('variant가 그 컴포넌트의 것이어야 한다', () => {
    expect(check(wrap({ type: 'Section', variant: 'hero' })).issues).toEqual([])
    expect(codes(check(wrap({ type: 'Section', variant: 'jumbo' })).issues)).toEqual([
      'bad-pattern-node',
    ])
  })

  it('자식을 담을 수 없는 컴포넌트에 자식을 두면 이슈다', () => {
    expect(codes(check(wrap({ type: 'Text', children: [{ type: 'Text' }] })).issues)).toEqual([
      'bad-pattern-node',
    ])
  })

  it('Slot은 패턴에 둘 수 없다', () => {
    // 패턴은 페이지에 전개되는데, `validatePage`가 페이지 안의 Slot을 이슈로 낸다(실측).
    expect(codes(check(wrap({ type: 'Section', children: [{ type: 'Slot' }] })).issues)).toEqual([
      'bad-pattern-node',
    ])
  })

  it('이슈에 어느 노드인지가 실린다', () => {
    const { issues } = check(wrap({ type: 'Section', children: [{ type: 'Carousel' }] }))
    expect(issues[0]?.path).toBe('patterns.hero.x.schema.children.0')
  })

  it('첫 이슈에서 멈추지 않는다', () => {
    const { issues } = check(
      wrap({ type: 'Carousel', children: [{ type: 'Section', variant: 'jumbo' }] }),
    )
    expect(issues.length).toBeGreaterThanOrEqual(2)
  })
})
