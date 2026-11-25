/**
 * 판 7 의 레이아웃 — 봉투(`PageEnvelopeSchema`) · 짝 검사(`layout-root-mismatch`) · 판정(`pageKindOf` · `pageLayoutOf`) · 새 문서(`newPageDocument`).
 *
 * **`pageKindOf` 가 뿌리 타입을 안 읽는지는 검증 전 값(레이아웃은 팝업인데 뿌리는 `Page`)으로만 갈린다** — 검증을 지난 문서에서는 두 값이 짝이라
 * 뿌리 타입으로 되돌린 판정도 같은 답을 낸다. 그 축은 아래 «판정» 케이스와 `page-layout-census.test.ts` 가 소유한다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { PageEnvelopeSchema } from '../src/envelope'
import { newPageDocument, pageKindOf, pageLayoutOf } from '../src/new-page'
import type { PageDocument } from '../src/node'
import { validatePage } from '../src/validate'

beforeAll(() => installCatalog())

const pageRoot = { id: 'n_root', type: 'Page', children: [] }
const popupRoot = { id: 'n_pop', type: 'Popup', props: { title: '팝업' }, children: [] }

describe('봉투 — 판 7 의 layout', () => {
  it('판 7 은 layout 이 없으면 거절한다', () => {
    const parsed = PageEnvelopeSchema.safeParse({ version: 7, root: pageRoot })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.path.join('/'))).toEqual(['layout'])
  })

  it('모르는 값은 판과 무관하게 거절한다', () => {
    expect(PageEnvelopeSchema.safeParse({ version: 7, layout: 'modal', root: pageRoot }).success).toBe(false)
    expect(PageEnvelopeSchema.safeParse({ version: 6, layout: 'modal', root: pageRoot }).success).toBe(false)
  })

  it('지금보다 높은 판은 이 키로 거절하지 않는다 — 읽는 자리가 «올릴 수 없다» 로 말한다', () => {
    expect(PageEnvelopeSchema.safeParse({ version: 99, root: pageRoot }).success).toBe(true)
  })

  it('셋은 받고, 판 6 이하는 키 없이 지난다', () => {
    const ok = (doc: unknown) => PageEnvelopeSchema.safeParse(doc).success
    expect([
      ok({ version: 7, layout: 'blank', root: pageRoot }),
      ok({ version: 7, layout: 'subpage', root: pageRoot }),
      ok({ version: 7, layout: 'popup', root: popupRoot }),
      ok({ version: 6, root: pageRoot }),
    ]).toEqual([true, true, true, true])
  })

  it('검증이 봉투 이슈로 말한다 — bad-document · /layout', () => {
    expect(validatePage({ version: 7, root: pageRoot } as PageDocument).map((issue) => `${issue.code}@${issue.path}`)).toEqual([
      'bad-document@/layout',
    ])
  })
})

describe('layout-root-mismatch', () => {
  const codes = (doc: PageDocument) => validatePage(doc).map((issue) => `${issue.code}@${issue.path}`)

  it('팝업 레이아웃 + 뿌리 Page', () => {
    expect(codes({ version: 7, layout: 'popup', root: pageRoot })).toEqual(['layout-root-mismatch@/layout'])
  })

  it('서브페이지 · 빈 레이아웃 + 뿌리 Popup', () => {
    expect(codes({ version: 7, layout: 'subpage', root: popupRoot })).toEqual(['layout-root-mismatch@/layout'])
    expect(codes({ version: 7, layout: 'blank', root: popupRoot })).toEqual(['layout-root-mismatch@/layout'])
  })

  it('짝이 맞으면 이슈가 없다 · 오류다(저장을 막는다)', () => {
    expect([codes({ version: 7, layout: 'popup', root: popupRoot }), codes({ version: 7, layout: 'subpage', root: pageRoot })]).toEqual([
      [],
      [],
    ])
    expect(validatePage({ version: 7, layout: 'popup', root: pageRoot })[0]?.severity).toBe('error')
  })
})

describe('판정 — layout 을 읽는다', () => {
  it('검증 전 값에서 뿌리 타입이 아니라 layout 을 따른다', () => {
    expect(pageKindOf({ layout: 'popup', root: { type: 'Page' } })).toBe('popup')
    expect(pageKindOf({ layout: 'subpage', root: { type: 'Popup' } })).toBe('page')
    expect(pageLayoutOf({ layout: 'subpage', root: { type: 'Popup' } })).toBe('subpage')
  })

  it('layout 이 없는(판 6 이하) 문서는 판 6 의 뜻으로 읽는다', () => {
    expect([
      pageKindOf({ root: { type: 'Popup' } }),
      pageKindOf({ root: { type: 'Page' } }),
      pageKindOf(null),
      pageLayoutOf({ layout: 'x', root: { type: 'Popup' } }),
    ]).toEqual(['popup', 'page', 'page', 'popup'])
  })
})

describe('newPageDocument', () => {
  let n = 0
  const ids = () => `n_${String((n += 1)).padStart(4, '0')}`

  it('레이아웃을 싣고 짝인 뿌리를 짓는다 — 셋 다 검증을 지난다', () => {
    const docs = (['blank', 'subpage', 'popup'] as const).map((layout) => newPageDocument(layout, '회원 검색', ids))
    expect(docs.map((doc) => [doc.layout, doc.root.type])).toEqual([
      ['blank', 'Page'],
      ['subpage', 'Page'],
      ['popup', 'Popup'],
    ])
    expect(docs.map((doc) => validatePage(doc))).toEqual([[], [], []])
    expect(docs[2]?.root.props).toEqual({ title: '회원 검색' })
  })
})
