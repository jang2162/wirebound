/**
 * **페이지의 레이아웃을 바꾸는 편집 묶음**(페이지 정보 탭 «레이아웃» — `panels/page-kind.tsx` · 설계
 * `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「«페이지 정보» 탭의 «레이아웃»」). 묶음 하나라 되돌리기 한 번에 돌아온다.
 *
 * | 바꿈 | 연산 |
 * |---|---|
 * | 빈 ↔ 서브페이지 | `test /layout` → `replace /layout` 뿐이다. 뿌리를 안 건드려 노드 잠금과 무관하다 |
 * | → 팝업 | `test /layout` · `test /root/type` → `replace /layout` · 뿌리 타입을 `Popup` 으로 · props 를 `{ title: 페이지 이름 }` 으로. 몸통은 그대로 팝업의 «내용» 이다. 바닥은 안 만든다 — 지금 내용이 이미 단추를 들 수 있다 |
 * | 팝업 → 빈 · 서브페이지 | `test /layout` · `test /root/type` → `replace /layout` · «바닥» 노드를 몸통 끝으로 차례대로 옮기고(지우지 않는다) 바닥 구역 · props 를 걷고 뿌리 타입을 `Page` 로 |
 *
 * **첫 연산은 지금 레이아웃의 `test` 다** — 남이 먼저 레이아웃을 바꿨으면 리베이스가 이 묶음을 버린다(바뀐 레이아웃 위에 옛 판단으로 바꾸지
 * 않는다). 팝업 경계를 넘는 바꿈은 `/layout` 과 뿌리를 한 묶음에서 바꾼다 — 판 7 에서 «팝업인가» 는 `layout` 이고 뿌리 `Popup` 은 그 짝이라
 * (`layout-root-mismatch`) 하나만 바꾸면 저장 경계가 거절한다. 뿌리를 고치는 편집이라 남이 뿌리를 쥐었으면 잠금이 막는다
 * (`EditorStore.editBlockedBy` — 화면은 그 단추를 끈다).
 */
import { BODY_ZONE, pageLayoutOf, zoneList, type PageDocument, type PageLayout, type PatchOp } from '@wirebound/schema'

/** 문서의 레이아웃 — 판 7 문서에는 늘 있다. 없으면(검증 전 문서) 판 6 → 7 단계와 같은 값이다(`pageLayoutOf` — 판정을 두 벌로 짓지 않는다). */
export function documentLayout(document: PageDocument): PageLayout {
  return pageLayoutOf(document)
}

/** 두 레이아웃 사이의 바꿈이 팝업 경계를 넘는가 — 넘으면 뿌리도 바꾼다(머리말의 표). */
export function crossesPopup(from: PageLayout, to: PageLayout): boolean {
  return (from === 'popup') !== (to === 'popup')
}

/** 그 레이아웃으로 바꾸는 연산. 이미 그 레이아웃이면 `null` — 보낼 것이 없다. */
export function layoutOps(document: PageDocument, layout: PageLayout, title: string): PatchOp[] | null {
  const root = document.root
  const current = documentLayout(document)
  if (current === layout) return null
  const stored = (document as { layout?: unknown }).layout !== undefined
  // 칸이 없는 문서(검증 전)에는 `test` 할 값이 없다 — 칸을 만든다.
  const ops: PatchOp[] = stored ? [{ op: 'test', path: '/layout', value: current }] : []
  if (!crossesPopup(current, layout)) {
    ops.push({ op: stored ? 'replace' : 'add', path: '/layout', value: layout })
    return ops
  }
  ops.push({ op: 'test', path: '/root/type', value: root.type })
  ops.push({ op: stored ? 'replace' : 'add', path: '/layout', value: layout })
  if (layout === 'popup') {
    ops.push({ op: 'replace', path: '/root/type', value: 'Popup' })
    ops.push({ op: root.props === undefined ? 'add' : 'replace', path: '/root/props', value: { title } })
    return ops
  }
  const footer = zoneList(root, 'footer')
  if (footer.length > 0 && !Array.isArray(root.children)) ops.push({ op: 'add', path: '/root/children', value: [] })
  for (let i = 0; i < footer.length; i += 1) ops.push({ op: 'move', from: '/root/zones/footer/0', path: '/root/children/-' })
  const zones = root.zones
  if (zones !== undefined) {
    const others = Object.keys(zones).filter((zone) => zone !== 'footer' && zone !== BODY_ZONE)
    if (others.length === 0) ops.push({ op: 'remove', path: '/root/zones' })
    else if ('footer' in zones) ops.push({ op: 'remove', path: '/root/zones/footer' })
  }
  if (root.props !== undefined) ops.push({ op: 'remove', path: '/root/props' })
  ops.push({ op: 'replace', path: '/root/type', value: 'Page' })
  return ops
}
