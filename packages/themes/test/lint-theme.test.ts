import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, LINT_RULES, getComponent, installCatalog } from '@wirebound/schema'
import type { PageDocument, WbNode } from '@wirebound/schema'
import { lintThemes } from '../src/lint/index'
import type { LintThemeEntry } from '../src/lint/input'
import { systemTheme } from '../src/system/index'

beforeAll(() => {
  installCatalog()
})

let counter = 0
const nid = (): string => `n_${String(++counter).padStart(12, '0')}`

const doc = (children: WbNode[]): PageDocument => ({
  version: 1,
  root: { id: nid(), type: 'Page', children },
})

const meta = (id: string) => ({ id, name: id, version: '1.0.0' })

/** **테마 둘·페이지 둘로 잰다** — 하나짜리로 재면 자리가 0이 되어 섞여도 안 죽는다. */
function entries(over: Partial<LintThemeEntry>[]): LintThemeEntry[] {
  return over.map((entry, index) => ({
    id: `th${index + 1}`,
    document: { meta: meta(`th${index + 1}`) },
    ...entry,
  }))
}

const rulesOf = (issues: readonly { rule: string }[]): string[] => issues.map((issue) => issue.rule)

describe('resolveTheme의 판정을 규칙으로 나른다', () => {
  it('⑧ 컴포넌트 정의에 없는 structure·part·state 참조', () => {
    const issues = lintThemes({
      themes: entries([
        {
          document: {
            meta: meta('th1'),
            components: {
              Button: {
                structure: '없는구조',
                parts: { 없는조각: { padding: '1px' } },
                states: { 없는상태: { padding: '1px' } },
              },
            },
          },
        },
        {},
      ]),
    })

    const vocab = issues.filter((issue) => issue.rule === 'theme-vocabulary')
    expect(vocab.length).toBe(3)
    expect(vocab.every((issue) => issue.themeId === 'th1')).toBe(true)
    expect(vocab.every((issue) => issue.pageId === null)).toBe(true)
  })

  it('⑨ 존재하지 않는 토큰 참조 — severity를 그대로 나른다', () => {
    const issues = lintThemes({
      themes: entries([{ document: { meta: meta('th1'), tokens: { semantic: { primary: 'semantic.없는것' } } } }, {}]),
    }).filter((issue) => issue.rule === 'theme-token')

    expect(issues).toHaveLength(1)
    // `THEME_ISSUE_SEVERITY['unknown-token']`가 `error`다 — lint가 내리지 않는다.
    expect(issues[0]!.severity).toBe('error')
    expect(issues[0]!.path).toBe('tokens.semantic.primary')
  })

  it('⑩ 화이트리스트에 없는 스타일 프로퍼티', () => {
    const issues = lintThemes({
      themes: entries([{ document: { meta: meta('th1'), components: { Button: { base: { 없는프로퍼티: '1px' } } } } }, {}]),
    }).filter((issue) => issue.rule === 'theme-style-prop')

    expect(issues).toHaveLength(1)
    expect(issues[0]!.themeId).toBe('th1')
  })

  it('⑫ 패턴 slots 계약과 schema 불일치', () => {
    const issues = lintThemes({
      themes: entries([
        {
          document: {
            meta: meta('th1'),
            patterns: {
              'hero.basic': {
                name: '기본',
                slots: { 안쓰는슬롯: 'text' },
                schema: { type: 'Text', children: [{ type: 'Text', slot: '없는슬롯' }] },
              },
            },
          },
        },
        {},
      ]),
    }).filter((issue) => issue.rule === 'theme-pattern')

    expect(issues.length).toBeGreaterThan(1)
    expect(new Set(issues.map((issue) => issue.themeId))).toEqual(new Set(['th1']))
  })

  it('⑬ extends 대상이 없으면 base 없이 해석되어 bad-extends가 난다', () => {
    const issues = lintThemes({
      themes: entries([{ document: { meta: { ...meta('th1'), extends: 'system:nonexistent' } } }, {}]),
    }).filter((issue) => issue.rule === 'theme-extends')

    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('상속 대상')
  })

  it('⑬ 상속 깊이를 어기면 같은 규칙으로 난다', () => {
    const admin = systemTheme('system:admin')!
    const issues = lintThemes({
      themes: entries([
        {
          document: { meta: { ...meta('th1'), extends: 'system:admin' } },
          base: { ...admin, meta: { ...admin.meta, extends: 'system:portal' } },
        },
        {},
      ]),
    }).filter((issue) => issue.rule === 'theme-extends')

    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('상속 깊이')
  })

  it('설계서 「lint 규칙」 밖의 「테마 시스템」 판정도 버리지 않는다', () => {
    const issues = lintThemes({ themes: entries([{ document: { meta: meta('th1'), tokens: 42 } }, {}]) }).filter(
      (issue) => issue.rule === 'theme-other',
    )
    expect(issues.length).toBeGreaterThan(0)
  })

  it('멀쩡한 테마 둘은 이슈를 내지 않는다', () => {
    expect(
      lintThemes({
        themes: entries([
          { document: { meta: meta('th1'), tokens: { semantic: { primary: '#2563eb' } } } },
          { document: { meta: meta('th2'), components: { Button: { base: { padding: '4px' } } } } },
        ]),
      }),
    ).toEqual([])
  })
})

describe('⑪ 노드가 쓰는 variant를 테마가 정의하지 않음 — 새로 짠 판정', () => {
  const themed = {
    meta: meta('th1'),
    components: { Button: { base: { padding: '4px' }, variants: { primary: { padding: '8px' } } } },
  }

  it('테마가 그 컴포넌트를 꾸미는데 그 변형이 없으면 낸다', () => {
    const danger: WbNode = { id: nid(), type: 'Button', variant: 'danger' }
    const primary: WbNode = { id: nid(), type: 'Button', variant: 'primary' }
    const issues = lintThemes({
      themes: entries([
        { document: themed, pages: [{ id: 'pg1', document: doc([danger, primary]) }] },
        {},
      ]),
    }).filter((issue) => issue.rule === 'theme-node-variant')

    expect(issues).toHaveLength(1)
    expect(issues[0]!.nodeId).toBe(danger.id)
    expect(issues[0]!.pageId).toBe('pg1')
    expect(issues[0]!.themeId).toBe('th1')
    expect(issues[0]!.severity).toBe('warning')
    expect(issues[0]!.message).toContain('danger')
  })

  it('테마가 그 컴포넌트를 아예 안 꾸미면 내지 않는다', () => {
    const link: WbNode = { id: nid(), type: 'Link', variant: 'muted' }
    const issues = lintThemes({
      themes: entries([{ document: themed, pages: [{ id: 'pg1', document: doc([link]) }] }, {}]),
    })
    expect(rulesOf(issues)).not.toContain('theme-node-variant')
  })

  it('페이지를 안 주면 돌지 않는다', () => {
    const issues = lintThemes({ themes: entries([{ document: themed }, {}]) })
    expect(rulesOf(issues)).not.toContain('theme-node-variant')
  })

  it('테마가 서지 않으면(오류가 있으면) 돌지 않는다 — 읽을 표가 없다', () => {
    const broken = { meta: meta('th1'), components: { Button: { base: { 없는프로퍼티: '1px' } } } }
    const node: WbNode = { id: nid(), type: 'Button', variant: 'danger' }
    const issues = lintThemes({
      themes: entries([{ document: broken, pages: [{ id: 'pg1', document: doc([node]) }] }, {}]),
    })
    expect(rulesOf(issues)).toContain('theme-style-prop')
    expect(rulesOf(issues)).not.toContain('theme-node-variant')
  })

  it('파생 변형(variantFrom)은 ⑪이 보지 않는다 — 못박아 둔다', () => {
    // `Field`는 `variantFrom: 'control'`이라 노드의 `variant`가 화면에 닿지 않는다.
    // 파생 규칙의 구현은 `renderer`에 있고 `themes`는 그것을 볼 수 없다(설계서 「각 패키지의
    // 책임과 의존」) — 여기 옮겨 적으면 두 벌이 된다. 그래서 **안 본다**를 케이스로 고정한다.
    const withVariantFrom = CATALOG_TYPES.filter((type) => getComponent(type)?.variantFrom !== undefined)
    expect(withVariantFrom.length).toBeGreaterThan(0)

    // 파생 쪽(`props.control`)도, 문서에 적힌 쪽(`variant`)도 ⑪을 내지 않는다.
    const derived: WbNode = { id: nid(), type: 'Field', props: { control: 'date' } }
    const written: WbNode = { id: nid(), type: 'Field', variant: 'date' }
    const issues = lintThemes({
      themes: entries([
        {
          document: { meta: meta('th1'), components: { Field: { variants: { text: { padding: '4px' } } } } },
          pages: [{ id: 'pg1', document: doc([derived, written]) }],
        },
        {},
      ]),
    })
    expect(rulesOf(issues)).not.toContain('theme-node-variant')
  })

  /**
   * 카탈로그가 이미 거부한 변형을 ⑪이 한 번 더 말하면 **한 노드의 같은 필드를 두 severity로**
   * 말하는 목록이 된다(`unknown-variant:error` + `theme-node-variant:warning`).
   * 고칠 곳이 다르지도 않다 — 둘 다 `variant` 한 글자다.
   */
  it('카탈로그가 거부한 변형은 보지 않는다 — validatePage가 이미 error로 말한다', () => {
    const bogus: WbNode = { id: nid(), type: 'Button', variant: '없는변형' }
    const issues = lintThemes({
      themes: entries([{ document: themed, pages: [{ id: 'pg1', document: doc([bogus]) }] }, {}]),
    })
    expect(rulesOf(issues)).not.toContain('theme-node-variant')
  })

  it('카탈로그가 아는 변형이면 그대로 낸다 — 위 케이스가 규칙을 통째로 끄지 않는다', () => {
    const known: WbNode = { id: nid(), type: 'Button', variant: 'danger' }
    const issues = lintThemes({
      themes: entries([{ document: themed, pages: [{ id: 'pg1', document: doc([known]) }] }, {}]),
    }).filter((issue) => issue.rule === 'theme-node-variant')
    expect(issues.map((issue) => issue.nodeId)).toEqual([known.id])
  })

  it('카탈로그에 없는 타입은 보지 않는다 — unknown-type이 이미 말한다', () => {
    const unknown: WbNode = { id: nid(), type: '없는타입', variant: 'danger' }
    const issues = lintThemes({
      themes: entries([{ document: themed, pages: [{ id: 'pg1', document: doc([unknown]) }] }, {}]),
    })
    expect(rulesOf(issues)).not.toContain('theme-node-variant')
  })
})

describe('⑪ — 봉투가 깨진 페이지 문서에서 던지지 않는다', () => {
  const themed = {
    meta: meta('th1'),
    components: { Button: { base: { padding: '4px' }, variants: { primary: { padding: '8px' } } } },
  }
  const broken: { name: string; document: unknown }[] = [
    { name: 'root가 없다', document: { version: 1 } },
    { name: 'root가 null이다', document: { version: 1, root: null } },
    { name: '문서가 null이다', document: null },
  ]

  for (const { name, document } of broken) {
    it(`${name} — 던지지 않고 ⑪이 돌지 않는다`, () => {
      const issues = lintThemes({
        themes: entries([
          { document: themed, pages: [{ id: 'pg1', document: document as PageDocument }] },
          {},
        ]),
      })
      expect(issues).toEqual([])
    })
  }

  it('깨진 페이지가 같은 테마의 멀쩡한 페이지를 막지 않는다', () => {
    const danger: WbNode = { id: nid(), type: 'Button', variant: 'danger' }
    const issues = lintThemes({
      themes: entries([
        {
          document: themed,
          pages: [
            { id: 'pg1', document: { version: 1 } as unknown as PageDocument },
            { id: 'pg2', document: doc([danger]) },
          ],
        },
        {},
      ]),
    }).filter((issue) => issue.rule === 'theme-node-variant')

    expect(issues.map((issue) => issue.pageId)).toEqual(['pg2'])
  })
})

describe('표를 덮는다', () => {
  const owned = LINT_RULES.filter((rule) => rule.owner === 'themes')

  it('themes가 소유한 규칙이 하나도 빠짐없이 실제로 난다', () => {
    const node: WbNode = { id: nid(), type: 'Button', variant: 'danger' }
    const issues = lintThemes({
      themes: entries([
        {
          document: {
            meta: meta('th1'),
            tokens: { semantic: { primary: 'semantic.없는것' } },
            components: {
              Button: {
                structure: '없는구조',
                base: { 없는프로퍼티: '1px' },
                variants: { primary: { padding: '4px' } },
              },
            },
            patterns: { 'hero.basic': { name: '기본', slots: { 안쓰는슬롯: 'text' }, schema: { type: 'Text' } } },
          },
        },
        { document: { meta: { ...meta('th2'), extends: 'system:nonexistent' } } },
        { document: { meta: meta('th3'), tokens: 42 } },
        // **⑪은 서는 테마에서만 난다** — 위 th1은 오류가 있어 `theme`이 `null`이다.
        {
          document: {
            meta: meta('th4'),
            components: { Button: { base: { padding: '4px' }, variants: { primary: { padding: '8px' } } } },
          },
          pages: [{ id: 'pg1', document: doc([node]) }],
        },
      ]),
    })

    expect([...new Set(rulesOf(issues))].sort()).toEqual(owned.map((rule) => rule.id).sort())
  })
})
