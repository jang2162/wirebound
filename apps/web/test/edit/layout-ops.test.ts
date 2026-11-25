/**
 * **레이아웃을 바꾸는 편집 묶음**(`src/edit/page-kind-ops.ts` 의 `layoutOps` — 설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md`
 * 「«페이지 정보» 탭의 «레이아웃»」 표). 빈 ↔ 서브페이지는 `/layout` 하나, 팝업 경계는 뿌리를 함께 바꾼다. 묶음은 늘 지금 레이아웃의 `test` 로
 * 시작한다 — 남이 먼저 바꿨으면 리베이스가 버린다(실브라우저 `build-test/layout-rebase.test.ts`).
 *
 * 묶음마다 `applyOps` 뒤 문서가 `validatePage` 를 지나는지도 본다 — 팝업 경계를 넘는 묶음이 한쪽만 바꾸면 `layout-root-mismatch` 다.
 */
import { applyOps, validatePage, type PageDocument, type PageLayout } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { layoutOps } from '../../src/edit/page-kind-ops'
import { pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

const PAGE: PageDocument = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-text', type: 'Text', props: { content: '본문' } }] })
const SUBPAGE: PageDocument = { ...PAGE, layout: 'subpage' }
const POPUP: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Popup',
  props: { title: '회원 상세' },
  children: [{ id: 'n-text', type: 'Text', props: { content: '본문' } }],
  zones: { footer: [{ id: 'n-save', type: 'Button', props: { label: '저장' } }] },
})

function applied(document: PageDocument, layout: PageLayout): PageDocument {
  const ops = layoutOps(document, layout, '회원 상세')
  if (ops === null) throw new Error('보낼 연산이 없습니다')
  const next = applyOps(document, ops)
  expect(validatePage(next)).toEqual([])
  return next
}

describe('layoutOps', () => {
  it('빈 → 서브페이지 · 서브페이지 → 빈은 `test /layout` + `replace /layout` 뿐이다', () => {
    expect(layoutOps(PAGE, 'subpage', '목록')).toEqual([
      { op: 'test', path: '/layout', value: 'blank' },
      { op: 'replace', path: '/layout', value: 'subpage' },
    ])
    expect(layoutOps(SUBPAGE, 'blank', '목록')).toEqual([
      { op: 'test', path: '/layout', value: 'subpage' },
      { op: 'replace', path: '/layout', value: 'blank' },
    ])
    expect(applied(PAGE, 'subpage')).toEqual(SUBPAGE)
  })

  it('서브페이지 → 팝업은 레이아웃 · 뿌리 타입의 test 뒤 뿌리를 갈아 끼운다', () => {
    expect(layoutOps(SUBPAGE, 'popup', '회원 상세')).toEqual([
      { op: 'test', path: '/layout', value: 'subpage' },
      { op: 'test', path: '/root/type', value: 'Page' },
      { op: 'replace', path: '/layout', value: 'popup' },
      { op: 'replace', path: '/root/type', value: 'Popup' },
      { op: 'add', path: '/root/props', value: { title: '회원 상세' } },
    ])
    const next = applied(SUBPAGE, 'popup')
    expect([next.layout, next.root.type, next.root.props]).toEqual(['popup', 'Popup', { title: '회원 상세' }])
  })

  it('팝업 → 서브페이지는 바닥을 몸통 끝으로 옮기고 뿌리를 Page 로', () => {
    expect(layoutOps(POPUP, 'subpage', '회원 상세')).toEqual([
      { op: 'test', path: '/layout', value: 'popup' },
      { op: 'test', path: '/root/type', value: 'Popup' },
      { op: 'replace', path: '/layout', value: 'subpage' },
      { op: 'move', from: '/root/zones/footer/0', path: '/root/children/-' },
      { op: 'remove', path: '/root/zones' },
      { op: 'remove', path: '/root/props' },
      { op: 'replace', path: '/root/type', value: 'Page' },
    ])
    const next = applied(POPUP, 'subpage')
    expect([next.layout, next.root.type, next.root.children?.map((child) => child.id)]).toEqual(['subpage', 'Page', ['n-text', 'n-save']])
  })

  it('같은 레이아웃이면 `null` — 보낼 것이 없다', () => {
    expect(layoutOps(PAGE, 'blank', '목록')).toBeNull()
    expect(layoutOps(SUBPAGE, 'subpage', '목록')).toBeNull()
    expect(layoutOps(POPUP, 'popup', '목록')).toBeNull()
  })

  it('남이 먼저 바꾼 문서에는 첫 test 가 맞지 않는다 — 빈 → 서브페이지 묶음을 서브페이지가 된 문서에 얹으면 던진다', () => {
    const ops = layoutOps(PAGE, 'subpage', '목록')!
    const theirs: PageDocument = { ...PAGE, layout: 'popup', root: { ...PAGE.root, type: 'Popup', props: { title: '남' } } }
    expect(() => applyOps(theirs, ops)).toThrow()
  })
})
