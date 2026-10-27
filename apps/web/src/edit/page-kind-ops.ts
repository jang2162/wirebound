/**
 * **페이지의 종류를 바꾸는 편집 묶음**(페이지 정보 탭 «종류» — `panels/page-kind.tsx`). 종류는 문서 뿌리 타입이다(`Page` = 화면 ·
 * `Popup` = 팝업). 묶음 하나라 되돌리기 한 번에 돌아온다.
 *
 * | 바꿈 | 연산 |
 * |---|---|
 * | 화면 → 팝업 | 뿌리 타입을 `Popup` 으로 · props 를 `{ title: 페이지 이름 }` 으로. 몸통은 그대로 팝업의 «내용» 이다. 바닥은 안 만든다 — 지금 내용이 이미 단추를 들 수 있다 |
 * | 팝업 → 화면 | «바닥» 노드를 몸통 끝으로 차례대로 옮기고(지우지 않는다) 바닥 구역 · props 를 걷고 뿌리 타입을 `Page` 로 |
 *
 * **첫 연산은 뿌리 타입의 `test` 다** — 남이 먼저 종류를 바꿨으면 리베이스가 이 묶음을 버린다(바뀐 뿌리 위에 옛 판단으로 바꾸지 않는다). 뿌리를
 * 고치는 편집이라 남이 뿌리를 쥐었으면 잠금이 막는다(`EditorStore.editBlockedBy`).
 */
import { BODY_ZONE, pageKindOf, zoneList, type PageDocument, type PageKind, type PatchOp } from '@wirebound/schema'

/** 그 종류로 바꾸는 연산. 이미 그 종류면 `null` — 보낼 것이 없다. */
export function pageKindOps(document: PageDocument, kind: PageKind, title: string): PatchOp[] | null {
  const root = document.root
  if (pageKindOf(document) === kind) return null
  const ops: PatchOp[] = [{ op: 'test', path: '/root/type', value: root.type }]
  if (kind === 'popup') {
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
