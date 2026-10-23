/**
 * 타입 이름에서 새 노드 하나를 만드는 곳. **순수 함수이고 React·DOM을 모른다.**
 *
 * **`{ id, type }`뿐인 것은 재서 정했다.** 카탈로그 전부가 `def.props.safeParse({})`를
 * 통과한다 — `.default()` 없는 필수 prop을 가진 컴포넌트가 없다(다시 재는 곳:
 * `test/edit/create-node.test.ts`의 `.default()가 없는 필수 prop을 가진 컴포넌트가 없다` —
 * 하나라도 생기면 거기서 죽는다). 그래서 props를 하나도 채우지 않아도 만든 노드가
 * `validatePage`를 지난다.
 *
 * **기본값을 문서에 굽지 않는 것은 그 자체로 의도다.** 검증도 렌더도 `props ?? {}`를
 * 스키마에 태워 기본값을 읽으므로, 문서에 값이 **없는 것**이 곧 "카탈로그를 따른다"는
 * 뜻이다. 만들 때 구워 넣으면 카탈로그가 기본값을 바꾼 뒤 옛 노드만 옛 값에 붙박인다.
 * 손으로 기본값 표를 두지 않는 것도 같은 이유다 — 그 표는 카탈로그와
 * 어긋나는 자리를 하나 더 만든다.
 *
 * **기본 내용은 넣는다** — 카탈로그 구역의 `initial`(검색폼 · 입력폼의 단추 둘 · 탭의 패널 둘)은 prop 기본값이 아니라 사람이 지우고 고칠
 * **내용**이라(설계 spec `2026-10-23-node-slots-design.md` 「2. 카탈로그 계약」) 만들 때 실제 노드로 든다. 그 노드도 이 함수로 짓는다(제 기본
 * 내용까지 · id 는 같은 생성기에서 — 제 id 다음 구역 차례로).
 *
 * 기본 내용이 없는 구역은 키를 안 만든다 — 빈 `children` · 빈 `zones` 를 두지 않는다. `insertNodeOps`가 그 배열 · 맵이
 * 없는 부모에 **배열째 넣는 갈래를 이미 갖는다**(그쪽 실측).
 *
 * **undo 왕복은 근거가 되지 못한다.** *"빈 배열을 미리 두면 undo 왕복 뒤 그 키가 문서에
 * 남아 원본과 달라진다"*는 틀린 근거다 — **두 판 모두 왕복이 자기 원본과 정확히 같다:**
 *
 * | 판 | ops | inverse | 왕복 == 원본 |
 * |---|---|---|---|
 * | `children` 키 없음(이 함수) | `add /…/children [새노드]` | `remove /…/children` | true |
 * | `children: []`을 미리 둔 판 | `add /…/children/0` | `remove /…/children/0` | true |
 *
 * **잔여물은 오히려 이 함수 쪽에 있다**: `children` 키가 없던 부모에 넣은 뒤 그 노드를
 * **undo가 아니라 `removeNodeOps`로** 지우면 `children: []`이 남아 원본과 달라진다.
 * **무해하다** — `children: []`이 붙은 노드는 `children`이 `none`인 타입이어도
 * `validatePage` 이슈가 0이다(실측).
 *
 * 그래서 근거는 하나다: **`insertNodeOps`가 갈래를 이미 갖고 문서를 최소로 유지한다.**
 * 잔여물이 이 함수 쪽에 있다는 것이 그 판단을 바꾸지는 않는다 — 어느 쪽을 골라도 왕복은
 * 같고 검증도 같으므로, 만들 때 덜 넣는 쪽을 고른다.
 */
import { BODY_ZONE, createNodeId, getComponent, type WbNode } from '@wirebound/schema'

/**
 * 타입 이름에서 새 노드 하나. 카탈로그에 없는 타입이면 `null`이다.
 *
 * id 생성기를 주입할 수 있다 — 테스트가 결정적인 id를 쓴다(스토어의 `nextOpId`와 같은
 * 이유). **카탈로그 조회가 먼저인 것은 실패한 호출이 id를 소비하지 않게 하기 위해서다**
 * (`EditorStore.applyEdit`이 적용 실패 시 id 발급을 미루는 것과 같은 판단).
 */
export function createNode(type: string, nextId: () => string = createNodeId): WbNode | null {
  const def = getComponent(type)
  if (def === undefined) return null

  const node: WbNode = { id: nextId(), type }
  for (const zone of def.zones) {
    const seeds = (zone.initial ?? []).flatMap((seed) => {
      const made = createNode(seed.type, nextId)
      if (made === null) return []
      return [seed.props === undefined ? made : { ...made, props: { ...seed.props } }]
    })
    if (seeds.length === 0) continue
    if (zone.name === BODY_ZONE) node.children = seeds
    else node.zones = { ...node.zones, [zone.name]: seeds }
  }
  return node
}
