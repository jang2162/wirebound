// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installCatalog, listComponents, validateLayout, validatePage } from '@wirebound/schema'
import { defineTheme, Root, useToken, view } from '@wirebound/theme-sdk'
import { GALLERY_SAMPLES, galleryItemDocument, galleryItems, ThemeGallery } from '@wirebound/theme-gallery'

beforeAll(() => installCatalog())
// 이 저장소는 vitest `globals` 를 켜지 않아 RTL 이 스스로 정리를 걸지 못한다(`apps/web/test/setup.ts`).
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
/** 테마가 그리는 타입 — 카탈로그 전부다. */
const themed = (): string[] =>
  listComponents()
    .map((d) => d.type)
    .sort()
const manifest = {
  id: 't',
  name: 't',
  version: '1.0.0',
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

describe('갤러리', () => {
  it('표본이 카탈로그 전부를 덮는다', () => {
    expect(themed().length).toBeGreaterThan(15)
    expect(Object.keys(GALLERY_SAMPLES).sort()).toEqual(themed())
  })
  it('표본이 스키마 검증을 지난다 — 갤러리가 폴백을 그리지 않게', () => {
    for (const [type, samples] of Object.entries(GALLERY_SAMPLES)) {
      for (const sample of samples) {
        const { label, node } = sample
        // 칸이 그리는 문서 그대로 — 뿌리 타입(Page · Popup)은 감싸지 않는다(`galleryItemDocument`).
        const doc = galleryItemDocument({ type, variant: undefined, sample })
        // Slot 은 레이아웃에만 선다. 칸의 문서는 둘 다 Page 뿌리라 렌더러에는 같다.
        const validate = node.type === 'Slot' ? validateLayout : validatePage
        const errors = validate(doc as never).filter((i) => i.severity === 'error')
        expect(errors, `${type} / ${label}`).toEqual([])
      }
    }
  })
  it('선언된 variant 마다 한 번씩 — 선언이 없으면 한 번', () => {
    const items = galleryItems(defineTheme({ manifest, views: {} }))
    const list = items.filter((i) => i.type === 'DataGrid')
    expect(new Set(list.map((i) => i.variant))).toEqual(new Set(['table', 'cards']))
    expect(list).toHaveLength(2 * GALLERY_SAMPLES.DataGrid!.length)
    expect(items.filter((i) => i.type === 'Tabs').every((i) => i.variant === undefined)).toBe(true)
  })
  it('테마 뷰로 그리고 항목마다 이름표를 단다', () => {
    const DataGrid = view(({ variant }) => <Root as="section" className={`v-${variant}`} />)
    const { container, getAllByText } = render(<ThemeGallery theme={defineTheme({ manifest, views: { DataGrid } })} tokens={{}} />)
    expect(container.querySelector('.v-cards')).not.toBeNull()
    expect(getAllByText(/DataGrid · 카드/).length).toBeGreaterThan(0)
  })
  it('기본 뷰만으로 그려도 폴백이 없다 — 표본 전부가 그려진다', () => {
    const { container } = render(<ThemeGallery theme={defineTheme({ manifest, views: {} })} tokens={{}} />)
    expect(container.querySelector('[data-wb-error]')).toBeNull()
    const drawn = new Set([...container.querySelectorAll('[data-wb-component]')].map((el) => el.getAttribute('data-wb-component')))
    expect([...drawn].sort()).toEqual(themed())
  })
  it('뷰 하나가 던져도 다른 항목은 그린다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const DataGrid = view(() => {
      throw new Error('boom')
    })
    const { container } = render(<ThemeGallery theme={defineTheme({ manifest, views: { DataGrid } })} tokens={{}} />)
    expect(container.querySelector('[data-wb-error]')).not.toBeNull()
    expect(container.querySelector('[data-wb-component="Button"]')).not.toBeNull()
  })
  it('토큰을 useToken 으로 내준다', () => {
    const Button = view(() => <Root as="button">{String(useToken('density'))}</Root>)
    const { container } = render(<ThemeGallery theme={defineTheme({ manifest, views: { Button } })} tokens={{ density: 'compact' }} />)
    expect(container.querySelector('[data-wb-component="Button"]')!.textContent).toBe('compact')
  })
  it('겹쳐 보기를 켜면 항목마다 포커스 상자와 마커 점을 그린다', () => {
    const { container } = render(<ThemeGallery theme={defineTheme({ manifest, views: {} })} tokens={{}} showOverlay />)
    const items = container.querySelectorAll('[data-wb-gallery-item]')
    expect(container.querySelectorAll('[data-wb-gallery-focus]').length).toBe(items.length)
    expect(container.querySelectorAll('[data-wb-gallery-marker]').length).toBe(items.length)
  })
})
