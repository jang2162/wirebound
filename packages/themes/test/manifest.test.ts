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
    DataGrid: {
      variants: [
        { id: 'table', label: '표' },
        { id: 'cards', label: '카드', hideProps: ['fixedColumns'] },
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
        m.components.Carousel = m.components.DataGrid
      }),
    ],
    [
      '걷은 상태 영역 — 카탈로그에 없다',
      'unknown-component',
      edit((m) => {
        m.components.StateSwitch = m.components.DataGrid
      }),
    ],
    [
      '걷은 상태 가지 — 카탈로그에 없다',
      'unknown-component',
      edit((m) => {
        m.components.StateCase = m.components.DataGrid
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
        m.components.DataGrid.variants.push({ id: 'table', label: '또' })
      }),
    ],
    [
      'defaultVariant 가 목록 밖',
      'default-variant-missing',
      edit((m) => {
        m.components.DataGrid.defaultVariant = 'grid'
      }),
    ],
    [
      'hideProps 가 그 컴포넌트의 prop 이 아니면',
      'unknown-hide-prop',
      edit((m) => {
        m.components.DataGrid.variants[1].hideProps = ['nope']
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
      m.components.DataGrid.defaultVariant = 'grid'
    })
    expect(codes(raw)).toEqual(expect.arrayContaining(['bad-version', 'default-variant-missing']))
  })

  it('이슈는 path 로 자리를 가리킨다', () => {
    const r = validateManifest(
      edit((m) => {
        m.components.DataGrid.variants[1].hideProps = ['nope']
      }),
    )
    expect(r.issues[0]!.path).toBe('components.DataGrid.variants.1.hideProps.0')
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

/**
 * **저장된 패키지를 다시 읽는 판(`stored`)** — 카탈로그에 기대는 검사(걷힌 타입 · 변형을 prop 에서 짓는 타입 · 없는 prop 감추기) 셋만 안 본다. 그 판은
 * 올린 때의 카탈로그로 검사를 지났다(기본테마 1.6.0 의 `List` — 문서 판 5 가 걷었다). 모양 · 판 · 토큰 검사는 그대로다.
 */
describe('validateManifest — 저장된 패키지(stored)', () => {
  const legacy = () => ({
    ...structuredClone(OK),
    components: {
      List: { variants: [{ id: 'table', label: '표', hideProps: ['columns'] }], defaultVariant: 'table' },
      Text: { variants: [{ id: 'big', label: '크게' }], defaultVariant: 'big' },
      DataGrid: { variants: [{ id: 'table', label: '표', hideProps: ['없는prop'] }], defaultVariant: 'table' },
    },
  })

  it('올리기 판은 셋을 거절하고 저장 판은 받는다', () => {
    expect(
      validateManifest(legacy())
        .issues.map((i) => i.code)
        .sort(),
    ).toEqual(['unknown-component', 'unknown-hide-prop', 'variant-from-component'])
    const stored = validateManifest(legacy(), { stored: true })
    expect(stored.issues).toEqual([])
    expect(stored.manifest).not.toBeNull()
  })

  it('걷힌 Slot 을 선언한 저장된 manifest 도 받는다 — 올리기 판은 거절한다', () => {
    const withSlot = { ...structuredClone(OK), components: { Slot: { variants: [{ id: 'wide', label: '넓게' }], defaultVariant: 'wide' } } }
    expect(validateManifest(withSlot).issues.map((i) => i.code)).toEqual(['unknown-component'])
    const stored = validateManifest(withSlot, { stored: true })
    expect([stored.issues, stored.manifest !== null]).toEqual([[], true])
  })

  it('저장 판도 카탈로그와 무관한 검사는 그대로다 — 판 · 기본 변형', () => {
    const broken = { ...legacy(), version: '1.0' }
    broken.components.DataGrid.defaultVariant = '없는'
    expect(
      validateManifest(broken, { stored: true })
        .issues.map((i) => i.code)
        .sort(),
    ).toEqual(['bad-version', 'default-variant-missing'])
  })
})
