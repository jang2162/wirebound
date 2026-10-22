import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, resetRegistry } from '@wirebound/schema'
import { validateManifest } from '@wirebound/themes'

beforeAll(() => installCatalog())

const OK = {
  id: 'acme',
  name: 'ACME',
  version: '1.2.0',
  sdk: '^1.0.0',
  tokens: {
    groups: [{ id: 'color', label: '색' }],
    items: {
      'color.primary': { type: 'color', label: '주색', group: 'color', default: '#2563eb' },
      'color.hover': { type: 'color', label: '호버', default: '{color.primary}' },
      density: { type: 'select', label: '밀도', options: ['compact', 'comfortable'], default: 'comfortable' },
      'radius.card': { type: 'length', label: '모서리', default: '12px' },
    },
  },
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

const codes = (raw: unknown) => validateManifest(raw).issues.map((i) => i.code)
const edit = (f: (m: any) => void) => {
  const m = structuredClone(OK) as any
  f(m)
  return m
}

describe('validateManifest', () => {
  it('맞는 manifest 는 이슈 없이 돌려준다', () => {
    const r = validateManifest(OK)
    expect(r.issues).toEqual([])
    expect(r.manifest?.id).toBe('acme')
  })

  it.each([
    [
      '모양이 틀리면',
      'shape',
      edit((m) => {
        m.tokens = 3
      }),
    ],
    [
      '판이 x.y.z 가 아니면',
      'bad-version',
      edit((m) => {
        m.version = '1.2'
      }),
    ],
    [
      'sdk 범위가 셋 밖이면',
      'bad-sdk-range',
      edit((m) => {
        m.sdk = '>=1'
      }),
    ],
    [
      '없는 토큰을 참조하면',
      'unknown-token-ref',
      edit((m) => {
        m.tokens.items['color.hover'].default = '{color.brand}'
      }),
    ],
    [
      '타입이 다른 토큰을 참조하면',
      'token-ref-type',
      edit((m) => {
        m.tokens.items['color.hover'].default = '{radius.card}'
      }),
    ],
    [
      '참조가 돌면',
      'token-ref-cycle',
      edit((m) => {
        m.tokens.items['color.primary'].default = '{color.hover}'
      }),
    ],
    [
      '기본값이 타입에 안 맞으면',
      'token-default-type',
      edit((m) => {
        m.tokens.items['radius.card'].default = 'big'
      }),
    ],
    [
      'select 기본값이 선택지 밖이면',
      'token-select-default',
      edit((m) => {
        m.tokens.items.density.default = 'loose'
      }),
    ],
    [
      '카탈로그에 없는 컴포넌트',
      'unknown-component',
      edit((m) => {
        m.components.Carousel = m.components.List
      }),
    ],
    [
      '걷은 상태 영역 — 카탈로그에 없다',
      'unknown-component',
      edit((m) => {
        m.components.StateSwitch = m.components.List
      }),
    ],
    [
      '걷은 상태 가지 — 카탈로그에 없다',
      'unknown-component',
      edit((m) => {
        m.components.StateCase = m.components.List
      }),
    ],
    [
      'variantFrom 컴포넌트에 variants',
      'variant-from-component',
      edit((m) => {
        m.components.Text = { variants: [{ id: 'a', label: 'a' }], defaultVariant: 'a' }
      }),
    ],
    [
      'variant id 가 겹치면',
      'duplicate-variant',
      edit((m) => {
        m.components.List.variants.push({ id: 'table', label: '또' })
      }),
    ],
    [
      'defaultVariant 가 목록 밖',
      'default-variant-missing',
      edit((m) => {
        m.components.List.defaultVariant = 'grid'
      }),
    ],
    [
      'hideProps 가 그 컴포넌트의 prop 이 아니면',
      'unknown-hide-prop',
      edit((m) => {
        m.components.List.variants[1].hideProps = ['nope']
      }),
    ],
  ])('%s → %s', (_label, code, raw) => {
    const r = validateManifest(raw)
    expect(r.manifest).toBeNull()
    expect(codes(raw)).toContain(code)
  })

  it('첫 이슈에서 멈추지 않는다 — 여럿을 한 번에 말한다', () => {
    const raw = edit((m) => {
      m.version = 'x'
      m.components.List.defaultVariant = 'grid'
    })
    expect(codes(raw)).toEqual(expect.arrayContaining(['bad-version', 'default-variant-missing']))
  })

  it('이슈는 path 로 자리를 가리킨다', () => {
    const r = validateManifest(
      edit((m) => {
        m.components.List.variants[1].hideProps = ['nope']
      }),
    )
    expect(r.issues[0]!.path).toBe('components.List.variants.1.hideProps.0')
  })

  it('카탈로그를 안 깔아도 검증이 선다', () => {
    resetRegistry()
    try {
      expect(validateManifest(OK).issues).toEqual([])
    } finally {
      installCatalog()
    }
  })
})
