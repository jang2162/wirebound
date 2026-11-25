/**
 * manifest `layouts` — 레이아웃마다 틀의 영역(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「manifest — `layouts`」). 모양은
 * `ManifestSchema`, 키 셋 · id 꼴 · 겹침 · 수는 `validateManifest` 가 이슈로 모은다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { LAYOUT_REGIONS_MAX, validateManifest } from '@wirebound/themes'

beforeAll(() => installCatalog())

const base = { id: 'acme', name: 'ACME', version: '1.0.0', sdk: '^1.10.0', tokens: { items: {} } }
const withLayouts = (layouts: unknown) => validateManifest({ ...base, layouts })
const codes = (layouts: unknown) => withLayouts(layouts).issues.map((issue) => [issue.code, issue.path])

const region = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: '영역', ...extra })

describe('manifest layouts', () => {
  it('없는 키는 그대로 받는다 — 앞 판 테마는 «선언한 영역 없음»', () => {
    const { manifest, issues } = validateManifest(base)
    expect(issues).toEqual([])
    expect(manifest?.layouts).toBeUndefined()
  })

  it('세 레이아웃의 선언을 받는다 · toggle 은 선택이다', () => {
    const layouts = {
      subpage: { regions: [region('gnb'), region('lnb'), region('breadcrumb', { toggle: false }), region('title')] },
      popup: { regions: [] },
      blank: { regions: [region('notice')] },
    }
    const { manifest, issues } = withLayouts(layouts)
    expect(issues).toEqual([])
    expect(manifest?.layouts).toEqual(layouts)
  })

  it('모르는 레이아웃 키는 이슈다', () => {
    expect(codes({ sidebar: { regions: [region('gnb')] }, subpage: { regions: [] } })).toEqual([['unknown-layout', 'layouts.sidebar']])
  })

  it('한 레이아웃 안에서 겹친 id 는 이슈다 — 다른 레이아웃의 같은 id 는 괜찮다', () => {
    expect(codes({ subpage: { regions: [region('gnb'), region('lnb'), region('gnb')] }, blank: { regions: [region('gnb')] } })).toEqual([
      ['duplicate-region', 'layouts.subpage.regions.2.id'],
    ])
  })

  it('꼴 밖 id 는 이슈다 — 대문자 시작 · 숫자 시작 · 빈 글자 · 33 자 · 점', () => {
    const bad = ['Gnb', '1gnb', '', `a${'b'.repeat(32)}`, 'gnb.top']
    expect(codes({ subpage: { regions: bad.map((id) => region(id)) } })).toEqual(
      bad.map((_, index) => ['bad-region-id', `layouts.subpage.regions.${index}.id`]),
    )
    expect(codes({ subpage: { regions: [region(`a${'b'.repeat(31)}`)] } })).toEqual([])
  })

  it(`영역이 ${LAYOUT_REGIONS_MAX} 개를 넘으면 이슈다 — ${LAYOUT_REGIONS_MAX} 개는 받는다`, () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => region(`r${i}`))
    expect(codes({ subpage: { regions: ids(LAYOUT_REGIONS_MAX) } })).toEqual([])
    expect(codes({ subpage: { regions: ids(LAYOUT_REGIONS_MAX + 1) } })).toEqual([['too-many-regions', 'layouts.subpage.regions']])
  })

  it('라벨 1–20 자 · 모르는 칸은 모양 이슈다', () => {
    expect(codes({ subpage: { regions: [{ id: 'gnb', label: '' }] } })).toEqual([['shape', 'layouts.subpage.regions.0.label']])
    expect(codes({ subpage: { regions: [{ id: 'gnb', label: '가'.repeat(21) }] } })).toEqual([['shape', 'layouts.subpage.regions.0.label']])
    expect(codes({ subpage: { regions: [{ id: 'gnb', label: '가'.repeat(20) }] } })).toEqual([])
    expect(codes({ subpage: { regions: [{ id: 'gnb', label: 'G', hidden: true }] } })).toEqual([['shape', 'layouts.subpage.regions.0']])
  })
})
