/**
 * `switch` control의 위젯. **조작 즉시 커밋한다.**
 *
 * 텍스트와 갈리는 이유는 중간 상태가 없기 때문이다 — 켜거나 끄거나 둘뿐이라 "아직 다 치지
 * 않았다"가 존재하지 않는다. 그래서 로컬 state를 들지 않고 **문서의 값을 그대로 비춘다.**
 *
 * **그 선택을 지키는 케이스가 셋 있다.** 로컬 state를 들게 하는 변이를 걸면 셋 다 죽는다:
 * `문서가 밖에서 바뀌면 스위치가 새 값을 비춘다`(`test/panels/property-panel.test.tsx`)
 * 와 `props가 없던 노드도 undo로 돌아간다`·`undo하면 속성 패널의 스위치도 되돌아간다`
 * (`test/edit/undo-redo.test.tsx`).
 *
 * 갈리는 자리는 **문서가 이 위젯 밑에서 바뀌는 순간**이고, 그 경로를 만든 것은 **undo다** —
 * `startUndo`·`ackEdit`이 `selectedNodeId`를 건드리지 않으므로 문서만 갈리고 위젯은 마운트된
 * 채 남는다(`store/editor-store.ts`).
 *
 * **재조회도 그 경로다.** `loadPage`는 **같은 페이지를 다시 싣는 경로에서는 선택을 건드리지
 * 않는다**(`store/editor-store.ts`의 `#selectionFor`) — 위젯이 사라지는 것이 아니라 마운트된
 * 채 문서만 갈린다. 실패 복구 뒤도 그렇다 —
 * `편집이 실패하면 재조회가 서버 값을 되비춘다 — 고르던 자리는 그대로다`가 그 자리를 잡는다.
 * 문서를 위젯 밑에서 바꾸는 경로를 새로 만들면 이 문단이 그 경로도 세는지 다시 본다.
 *
 * **값이 없는 것과 `false`가 화면에서 구분되지 않는다.** 체크박스에는 "값 없음"을 표현할
 * 자리가 없기 때문이다. 위젯 없이 `formatValue`로 그리면 `undefined`가 빈 칸이라 둘이 갈리고,
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
  /** 남이 잠근 자리라 못 바꾸는가. `TextControlProps.disabled`와 같은 값이다. */
  disabled: boolean
  onCommit: (value: boolean) => void
}

export function SwitchControl(props: SwitchControlProps): ReactElement {
  const { value, id, disabled, onCommit } = props
  // 값이 없거나 불리언이 아니면 꺼짐이다. 검증을 통과하지 못한 문서가 스토어에 실릴 수
  // 있으므로(재조회 전 창) `Boolean(value)`로 뭉뚱그리지 않고 타입을 본다 —
  // `'false'`나 `0`이 켜짐/꺼짐 어느 쪽으로 읽힐지가 우연에 달리지 않게 한다.
  const checked = value === true

  return (
    <input
      id={id}
      disabled={disabled}
      className="wb-shell-control"
      type="checkbox"
      checked={checked}
      onChange={(event) => onCommit(event.target.checked)}
    />
  )
}
