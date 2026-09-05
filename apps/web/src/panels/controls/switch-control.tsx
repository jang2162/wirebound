/**
 * `switch` control의 위젯. **조작 즉시 커밋한다**(D5).
 *
 * 텍스트와 갈리는 이유는 중간 상태가 없기 때문이다 — 켜거나 끄거나 둘뿐이라 "아직 다 치지
 * 않았다"가 존재하지 않는다. 그래서 로컬 state를 들지 않고 **문서의 값을 그대로 비춘다.**
 *
 * **그 선택을 지키는 케이스가 셋 있다.** 로컬 state를 들게 하는 변이를 걸면 죽는다(실측
 * 3 사망): `문서가 밖에서 바뀌면 스위치가 새 값을 비춘다`(`test/panels/property-panel.test.tsx`)
 * 와 `props가 없던 노드도 undo로 돌아간다`·`undo하면 속성 패널의 스위치도 되돌아간다`
 * (`test/edit/undo-redo.test.tsx`).
 *
 * 갈리는 자리는 **문서가 이 위젯 밑에서 바뀌는 순간**이고, 그 경로를 만든 것은 **undo다** —
 * `startUndo`·`ackEdit`이 `selectedNodeId`를 건드리지 않으므로 문서만 갈리고 위젯은 마운트된
 * 채 남는다(`store/editor-store.ts`).
 *
 * **재조회도 이제 그 경로다.** 앞 판은 *"`loadPage`가 선택을 비워 위젯이 아예 사라진다"*고
 * 적었는데, `loadPage`가 **같은 페이지를 다시 싣는 경로에서는 선택을 건드리지 않게** 되면서
 * 그 문장이 낡았다(`store/editor-store.ts`의 `#selectionFor`). 실패 복구 뒤에도 위젯은
 * 마운트된 채 문서만 갈리므로 이 설계의 하중이 그만큼 늘었다 —
 * `편집이 실패하면 재조회가 서버 값을 되비춘다 — 고르던 자리는 그대로다`가 그 자리를 잡는다.
 *
 * **앞 판의 이 자리는 "이득을 재지 못했다 · 그런 경로가 없다"였고 그것은 undo가 생기기 전의
 * 값이었다.** 같은 커밋(`39070af`)이 그 경로를 만들면서 문장이 낡았다 — 자기 커밋이 만든
 * 변화를 자기 주석이 모르는 형태이고, 이 브랜치에서 반복된 결함이다.
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
  /** 남이 잠근 자리라 못 바꾸는가. `TextControlProps.disabled`와 같은 값이다. */
  disabled: boolean
  onCommit: (value: boolean) => void
}

export function SwitchControl(props: SwitchControlProps): ReactElement {
  const { value, id, disabled, onCommit } = props
  // 값이 없거나 불리언이 아니면 꺼짐이다. 검증을 통과하지 못한 문서가 스토어에 실릴 수
  // 있으므로(D4의 재조회 전 창) `Boolean(value)`로 뭉뚱그리지 않고 타입을 본다 —
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
