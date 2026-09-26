// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultStructure, installCatalog, listComponents, type WbNode } from '@wirebound/schema'
import { DEFAULT_VIEWS, defaultViewsCss, type ThemeDefinition, type ViewProps } from '@wirebound/theme-sdk'
import { installStructures, renderDocument, structureBaseCss } from '@wirebound/renderer'
import { SAMPLE_NODES } from './fixtures/sample-nodes'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 속성 순서를 이름순으로 맞춘다 — `Root` 는 노드 속성을 뒤에 펴 순서만 다르다. */
function normalize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const attrs = Array.from(el.attributes, (a) => [a.name, a.value] as const).sort(([a], [b]) => a.localeCompare(b))
    for (const [name] of attrs) el.removeAttribute(name)
    for (const [name, value] of attrs) el.setAttribute(name, value)
  }
  return doc.body.innerHTML
}

/**
 * 기본 뷰를 한 겹 감싸 불린 수를 센다. `theme` 옵션을 무시하는 렌더러는 두 번 다 구조 경로로 그려 DOM 이 늘 같다 —
 * 그 판을 초록으로 읽지 않게 테마 경로를 실제로 지났는지 수로 본다.
 */
let viewCalls = 0
const theme: ThemeDefinition = {
  manifest: { id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } },
  views: Object.fromEntries(
    Object.entries(DEFAULT_VIEWS).map(([type, View]) => [
      type,
      (props: ViewProps) => {
        viewCalls += 1
        return <View {...props} />
      },
    ]),
  ),
}

describe('기본 뷰는 기본 구조와 같은 DOM 을 낸다', () => {
  it('카탈로그의 모든 컴포넌트에 기본 뷰가 있다', () => {
    expect(Object.keys(DEFAULT_VIEWS).sort()).toEqual(listComponents().map((d) => d.type).sort())
  })

  it('표본이 카탈로그 19종을 다 덮는다', () => {
    const covered = new Set(Object.values(SAMPLE_NODES).map((n) => (n as { type: string }).type))
    expect([...covered].sort()).toEqual(listComponents().map((d) => d.type).sort())
  })

  for (const [label, node] of Object.entries(SAMPLE_NODES)) {
    it(label, () => {
      const doc = { root: node as WbNode } as never
      const old = renderToStaticMarkup(renderDocument(doc))
      const before = viewCalls
      const next = renderToStaticMarkup(renderDocument(doc, { theme }))
      expect(viewCalls).toBeGreaterThan(before)
      // 폴백으로 샌 표본은 두 경로가 같은 폴백을 내 초록이 된다 — 표본이 실제로 그려졌는지 먼저 본다.
      expect(old).not.toContain('data-wb-error')
      expect(normalize(next)).toBe(normalize(old))
    })
  }

  it('기본 CSS 는 기본 구조를 겨냥한 옛 규칙을 전부 싣는다', () => {
    const next = defaultViewsCss()
    let checked = 0
    for (const def of listComponents()) {
      const s = defaultStructure(def)
      const oldRules = structureBaseCss()
        .split('\n}')
        .filter((r) => r.includes(`[data-wb-component="${def.type}"]`) && (!r.includes('data-wb-structure=') || r.includes(`"${s}"`)))
      for (const rule of oldRules) {
        expect(next).toContain(rule.trim())
        checked += 1
      }
    }
    // 걸러낸 규칙이 0 이면 이 케이스는 아무것도 안 잰다.
    expect(checked).toBeGreaterThan(0)
  })
})
