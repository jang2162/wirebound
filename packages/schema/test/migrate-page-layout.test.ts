/**
 * 판 6 → 7 — 페이지 문서에 레이아웃을 채운다(`migrate-page-layout.ts`). 판 6 의 화면이 안 바뀌는 값: 뿌리 `Popup` → `popup`, 그 밖 → `blank`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { legacyPageLayout, liftPageLayout } from '../src/migrate-page-layout'
import { CURRENT_DOCUMENT_VERSION, migratePageDocument } from '../src/migrate'
import type { PageDocument } from '../src/node'
import { validatePage } from '../src/validate'

beforeAll(() => installCatalog())

const v6Page: PageDocument = { version: 6, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Text' }] } }
const v6Popup: PageDocument = { version: 6, root: { id: 'n_pop', type: 'Popup', props: { title: '검색' }, children: [] } }

describe('판 6 → 7', () => {
  it('뿌리 Popup 은 popup · 뿌리 Page 는 blank — 판 7 문서가 검증을 지난다', () => {
    const popup = migratePageDocument(v6Popup)
    const page = migratePageDocument(v6Page)
    expect([popup.version, popup.layout, page.version, page.layout]).toEqual([7, 'popup', 7, 'blank'])
    expect([validatePage(popup), validatePage(page)]).toEqual([[], []])
  })

  it('나머지는 그대로다 — 뿌리 · 상태 목록', () => {
    const doc: PageDocument = { ...v6Page, viewStates: [{ id: 's_a', name: '열림' }] }
    const { layout, version, ...rest } = migratePageDocument(doc)
    expect([layout, version]).toEqual(['blank', CURRENT_DOCUMENT_VERSION])
    expect(rest).toEqual({ root: doc.root, viewStates: doc.viewStates })
  })

  it('판 5 문서는 판 6 을 지나 7 로 — 두 단계를 다 탄다', () => {
    const v5: PageDocument = {
      version: 5,
      root: { id: 'n_root', type: 'Page', children: [{ id: 'n_tr', type: 'Tree', props: { items: ['가', '나'], depth: 2 } }] },
    }
    const out = migratePageDocument(v5)
    expect(out.version).toBe(7)
    expect(out.layout).toBe('blank')
    // 판 5 → 6 이 돌았다 — 트리 항목이 계층이다(깊이 2 · 「나」 가 「가」 밑).
    expect(out.root.children?.[0]?.props?.['items']).toEqual([{ label: '가', open: true, children: [{ label: '나' }] }])
  })

  it('입력을 바꾸지 않는다', () => {
    const before = structuredClone(v6Popup)
    migratePageDocument(v6Popup)
    expect(v6Popup).toEqual(before)
  })

  it('판 6 으로 적힌 문서의 아는 layout 은 남기고, 모르는 값은 뿌리에서 다시 짓는다', () => {
    expect(liftPageLayout({ ...v6Page, layout: 'subpage' }).layout).toBe('subpage')
    expect(liftPageLayout({ ...v6Popup, layout: 'nope' as never }).layout).toBe('popup')
  })

  it('판 6 규칙은 뿌리 타입 하나를 본다 — 빈 입력도 blank', () => {
    expect([legacyPageLayout(v6Popup), legacyPageLayout(v6Page), legacyPageLayout(null), legacyPageLayout({})]).toEqual([
      'popup',
      'blank',
      'blank',
      'blank',
    ])
  })
})
