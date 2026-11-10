/**
 * **구조 · 조각 · 변형은 테마가 선언한다 — 카탈로그에 없다.** 카탈로그가 드는 것은 노드의 계약(props · editor · states ·
 * zones · placement · bodyHost · reveal · variantFrom · code)과 사람이 읽을 것(label · description · group · summary)뿐이다. 변형 목록은 테마 manifest 의
 * `components[type].variants` 가 갖고, 스키마는 `node.variant` 를 판정하지 않는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../../src/component/catalog/index'
import { listComponents } from '../../src/component/registry'
import type { PageDocument, WbNode } from '../../src/node'
import { validatePage } from '../../src/validate'

beforeAll(() => {
  installCatalog()
})

function pageWith(node: WbNode): PageDocument {
  return { version: 1, root: { id: 'n_root00000001', type: 'Page', children: [node] } }
}

describe('카탈로그의 어휘', () => {
  it('카탈로그 정의에 구조 어휘가 없다', () => {
    const defs = listComponents()
    expect(defs.length).toBeGreaterThan(0)
    for (const def of defs) {
      expect(Object.keys(def).sort(), def.type).toEqual(
        [
          'zones',
          'description',
          'editor',
          'group',
          'label',
          'props',
          'states',
          'type',
          ...(def.variantFrom !== undefined ? ['variantFrom'] : []),
          ...(def.summary !== undefined ? ['summary'] : []),
          ...(def.placement !== undefined ? ['placement'] : []),
          ...(def.bodyHost !== undefined ? ['bodyHost'] : []),
          ...(def.reveal !== undefined ? ['reveal'] : []),
          ...(def.presets !== undefined ? ['presets'] : []),
          ...(def.code !== undefined ? ['code'] : []),
        ].sort(),
      )
      for (const field of def.editor) expect('visibleWhen' in field, `${def.type}.${field.prop}`).toBe(false)
    }
  })

  it('variant 는 스키마가 판정하지 않는다 — 아무 문자열이나 통과한다', () => {
    const issues = validatePage(pageWith({ id: 'n_button000001', type: 'Button', props: { label: 'x' }, variant: '처음-보는-값' }))
    expect(issues).toEqual([])
  })

  it('variantFrom 컴포넌트의 variant 는 여전히 ignored-variant 경고다', () => {
    const issues = validatePage(pageWith({ id: 'n_text00000001', type: 'Text', props: { content: 'x', role: 'h1' }, variant: 'x' }))
    expect(issues.map((issue) => issue.code)).toContain('ignored-variant')
  })
})
