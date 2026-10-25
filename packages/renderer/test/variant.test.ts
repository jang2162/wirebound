import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, requireComponent, type WbNode } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { resolveVariant } from '../src/variant'

beforeAll(() => installCatalog())
const manifest: ThemeManifest = {
  id: 't',
  name: 't',
  version: '0.0.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
  components: {
    DataGrid: {
      variants: [
        { id: 'table', label: '표' },
        { id: 'cards', label: '카드' },
      ],
      defaultVariant: 'table',
    },
  },
}
const list = (variant?: string) => ({ id: 'n', type: 'DataGrid', ...(variant ? { variant } : {}) }) as WbNode

describe('resolveVariant', () => {
  it('선언 안의 값은 그대로', () => expect(resolveVariant(requireComponent('DataGrid'), list('cards'), {}, manifest)).toBe('cards'))
  it('선언 밖의 값은 defaultVariant', () =>
    expect(resolveVariant(requireComponent('DataGrid'), list('featured'), {}, manifest)).toBe('table'))
  it('값이 없으면 defaultVariant', () => expect(resolveVariant(requireComponent('DataGrid'), list(), {}, manifest)).toBe('table'))
  it('선언이 없는 컴포넌트는 node.variant 그대로', () =>
    expect(resolveVariant(requireComponent('Button'), { id: 'b', type: 'Button', variant: 'danger' } as WbNode, {}, manifest)).toBe(
      'danger',
    ))
  it('variantFrom 은 prop 값이 이긴다', () =>
    expect(resolveVariant(requireComponent('Text'), { id: 't', type: 'Text', variant: 'x' } as WbNode, { role: 'h2' }, manifest)).toBe(
      'h2',
    ))
  it('variantFrom prop 이 문자열이 아니면 undefined', () =>
    expect(resolveVariant(requireComponent('Text'), { id: 't', type: 'Text' } as WbNode, { role: 3 }, manifest)).toBeUndefined())
  it('manifest 가 없으면 node.variant 그대로', () =>
    expect(resolveVariant(requireComponent('DataGrid'), list('featured'), {}, undefined)).toBe('featured'))
})
