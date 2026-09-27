/**
 * **감출 속성은 테마가 선언한다** — 노드의 variant 선언에 든 `hideProps` 칸을 속성 패널이 감춘다(`panels/property-panel.tsx`
 * 의 `visibleFields`). variant 는 렌더러가 그리는 것과 같은 함수로 구한다(`resolveVariant`) — 선언 밖이거나 없으면
 * `defaultVariant` 다.
 */
import { installCatalog, requireComponent } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { beforeAll, expect, it } from 'vitest'
import { visibleFields } from '../../src/panels/property-panel'

const manifest: ThemeManifest = {
  id: 't',
  name: 't',
  version: '0.0.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
  components: {
    List: {
      variants: [
        { id: 'table', label: '표' },
        { id: 'cards', label: '카드', hideProps: ['columns'] },
      ],
      defaultVariant: 'table',
    },
  },
}

beforeAll(() => installCatalog())

it('variant 선언의 hideProps 칸을 감춘다', () => {
  const def = requireComponent('List')
  const names = (variant?: string) =>
    visibleFields(def, { id: 'l', type: 'List', ...(variant ? { variant } : {}) }, {}, manifest).map((f) => f.prop)
  expect(names('cards')).not.toContain('columns')
  expect(names('table')).toContain('columns')
  expect(names()).toContain('columns') // defaultVariant 가 table
  // 선언 밖의 값은 defaultVariant 로 그려지므로 그 선언을 따른다.
  expect(names('없는값')).toContain('columns')
  // 양성 대조 — 감춘 칸 말고는 그대로다.
  expect(names('cards')).toContain('items')
})

it('variant 가 없거나 선언 밖이면 defaultVariant 의 hideProps 를 따른다', () => {
  const def = requireComponent('List')
  const cardsFirst: ThemeManifest = {
    ...manifest,
    components: { List: { ...manifest.components!.List!, defaultVariant: 'cards' } },
  }
  const names = (variant?: string) =>
    visibleFields(def, { id: 'l', type: 'List', ...(variant ? { variant } : {}) }, {}, cardsFirst).map((f) => f.prop)
  expect(names()).not.toContain('columns')
  expect(names('없는값')).not.toContain('columns')
  expect(names('table')).toContain('columns')
})
