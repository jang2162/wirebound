/**
 * `switch` control의 위젯. **조작 즉시 커밋한다**(D5).
 *
 * 텍스트와 갈리는 이유는 중간 상태가 없기 때문이다 — 켜거나 끄거나 둘뿐이라 "아직 다 치지
 * 않았다"가 존재하지 않는다. 그래서 로컬 state를 들지 않고 **문서의 값을 그대로 비춘다.**
 *
 * **그 선택의 이득은 재지 못했다.** 로컬 state를 들게 하는 변이를 걸어 봤더니 죽는 케이스가
 * **0개**였다. 갈릴 만한 자리는 "문서가 이 위젯 밑에서 바뀌는 순간"인데 오늘 그런 경로가
 * 없다 — 실패한 편집의 재조회는 `loadPage`를 지나며 `selectedNodeId`를 비우므로 위젯이 아예
 * 사라지고(`편집이 실패하면 재조회가 선택을 지운다`가 그 사실을 고정한다), 노드를 옮기면
 * `key`가 어차피 다시 만든다. **즉 둘 중 어느 쪽이어도 오늘은 같게 동작한다** — 문서를
 * 비추는 쪽을 고른 것은 상태가 하나뿐인 편이 단순해서다.
 *
 * **값이 없는 것과 `false`가 화면에서 구분되지 않는다.** 체크박스에는 "값 없음"을 표현할
 * 자리가 없기 때문이다. 앞 판에서는 `formatValue(undefined)`가 빈 칸을 그려 둘이 갈렸고,
 * `property-panel.tsx`의 `formatValue` 주석이 그 구분을 의도로 적고 있다. **문서 안에서는
 * 그 구분이 그대로다** — 값이 없던 prop을 켜면 `replace`가 아니라 `add`가 나가고
 * (`edit/ops.ts`의 세 갈래), `값이 없던 prop을 켜면 true가 들어간다`가 그것을 지킨다.
 * 화면에서도 갈라 보여야 한다면 그때 필요한 것은 `indeterminate`인데, **그 판을 만들어
 * 재보지는 않았다.**
 */
import type { ReactElement } from 'react'
import type { EditorField } from '@wirebound/schema'

export interface SwitchControlProps {
  field: EditorField
  value: unknown
  id: string
  onCommit: (value: boolean) => void
}

export function SwitchControl(props: SwitchControlProps): ReactElement {
  const { value, id, onCommit } = props
  // 값이 없거나 불리언이 아니면 꺼짐이다. 검증을 통과하지 못한 문서가 스토어에 실릴 수
  // 있으므로(D4의 재조회 전 창) `Boolean(value)`로 뭉뚱그리지 않고 타입을 본다 —
  // `'false'`나 `0`이 켜짐/꺼짐 어느 쪽으로 읽힐지가 우연에 달리지 않게 한다.
  const checked = value === true

  return (
    <input
      id={id}
      className="wb-shell-control"
      type="checkbox"
      checked={checked}
      onChange={(event) => onCommit(event.target.checked)}
    />
  )
}
