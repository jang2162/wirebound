/**
 * 타입 이름에서 새 노드 하나를 만드는 곳(D7). **순수 함수이고 React·DOM을 모른다.**
 *
 * **`{ id, type }`뿐인 것은 재서 정했다.** 계획서가 *"`.default()` 없는 필수 prop이 있는
 * 컴포넌트가 있는지 Task 4에서 재라"*로 남긴 자리인데, 카탈로그 전부가
 * `def.props.safeParse({})`를 통과한다(측정 시점의 카탈로그로 실패 0). 그래서 props를
 * 하나도 채우지 않아도 만든 노드가 `validatePage`를 지난다.
 *
 * **기본값을 문서에 굽지 않는 것은 그 자체로 의도다.** 검증도 렌더도 `props ?? {}`를
 * 스키마에 태워 기본값을 읽으므로, 문서에 값이 **없는 것**이 곧 "카탈로그를 따른다"는
 * 뜻이다. 만들 때 구워 넣으면 카탈로그가 기본값을 바꾼 뒤 옛 노드만 옛 값에 붙박인다.
 * 손으로 기본값 표를 두지 않는 것도 같은 이유다(D6와 같은 근거) — 그 표는 카탈로그와
 * 어긋나는 자리를 하나 더 만든다.
 *
 * `children`도 만들지 않는다. `many`인 타입도 마찬가지다 — `insertNodeOps`가 `children`
 * 키가 없는 부모에 **배열째 넣는 갈래를 이미 갖는다**(그쪽 실측). 빈 배열을 미리 두면
 * undo 왕복 뒤 그 키가 문서에 남아 원본과 달라진다.
 */
import { createNodeId, getComponent, type WbNode } from '@wirebound/schema'

/**
 * 타입 이름에서 새 노드 하나. 카탈로그에 없는 타입이면 `null`이다.
 *
 * id 생성기를 주입할 수 있다 — 테스트가 결정적인 id를 쓴다(스토어의 `nextOpId`와 같은
 * 이유). **카탈로그 조회가 먼저인 것은 실패한 호출이 id를 소비하지 않게 하기 위해서다**
 * (`EditorStore.applyEdit`이 적용 실패 시 id 발급을 미루는 것과 같은 판단).
 */
export function createNode(type: string, nextId: () => string = createNodeId): WbNode | null {
  if (getComponent(type) === undefined) return null

  return { id: nextId(), type }
}
