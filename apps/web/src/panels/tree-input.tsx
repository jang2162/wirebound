/**
 * 인라인 입력 하나. **만들기와 이름 변경이 같은 것을 쓴다** — 묻는 것이 제목 하나로
 * 같고, 용도마다 컴포넌트를 나누면 Enter·Esc·blur 규칙이 세 벌이 된다.
 *
 * **`window.prompt`를 쓰지 않는 근거:** jsdom에 없어 모킹이 필요하고, 스타일도 접근성도
 * 다룰 수 없다.
 *
 * **Enter만 확정하고 Esc·blur는 취소다.** 속성 편집은 blur에도 커밋하는데
 * **그것은 undo가 받쳐 주기 때문이다.** 이 경로에는 undo가 없어 "취소하려고 다른 곳을
 * 눌렀는데 이름이 바뀌었다"가 복구 불가한 사고가 된다.
 *
 * **`disabled`를 받지 않는다.** 조작이 나가 있는 동안 입력을 잠그는 `disabled={commands.busy}`는
 * **화면에서는** 만들어지지 않는 상태를 겨눈다: `submitInput`이 요청을 내기 전에
 * `setEditing(null)`을 하므로 요청이 나가는 동안 이 컴포넌트는 이미 DOM에 없고, 다른 조작으로
 * `busy`가 서면 툴바가 비활성이라 입력을 열 수 없다.
 *
 * **다만 훅 API로는 그 상태가 만들어진다.** `busy`가 선 채로 `openInput`을 부르면 입력이
 * 열리고, 거기서 `submitInput`을 하면 **요청이 나가지 않은 채 입력만 닫혀 친 제목이 조용히
 * 사라진다**.
 *
 * **그 자리를 막는 것은 이 컴포넌트가 아니라 훅이다** — `openInput`이 `busy`일 때 열지
 * 않는다(`use-tree-commands.tsx`). 입력을 비활성으로 그리는 것으로는 **이미 친 제목이
 * 사라지는 것**을 막지 못하기 때문이다. 그 범위를 재는 케이스는 `menu-crud.test.tsx`
 * 「조작이 나가 있는 동안에는 입력이 열리지 않는다」다.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'

export function TreeInput(props: {
  label: string
  initial: string
  onSubmit: (value: string) => void
  onCancel: () => void
  /** 칠 때마다 — 입력 밖에서 친 글을 들어야 하는 자리(구조 트리의 별칭 입력 — `./alias-edit.tsx`)가 받는다. */
  onEdit?: (value: string) => void
}): ReactElement {
  const [value, setValue] = useState(props.initial)
  const box = useRef<HTMLInputElement>(null)

  /**
   * 포커스를 준다. **`autoFocus`가 아니라 `ref` + `useEffect`인 이유.**
   *
   * *"같은 입력이 용도만 바꿔 다시 열릴 때 `autoFocus`가 다시 걸리지 않는다"*는 **이 구현에서
   * 성립하지 않는다** — 메뉴 트리(`panels/menu-tree.tsx`의 `RowPanel`)가 이 컴포넌트에 `key={editing.kind}`를 주므로 용도가
   * 바뀌면 React가 **새 인스턴스를 마운트**한다. 마운트라면 `autoFocus`도 걸린다. jsdom에서도
   * `autoFocus`가 동작하므로 `autoFocus`로 바꿔도 이 저장소의 케이스는 죽지 않는다.
   *
   * 그래서 `ref`를 두는 근거는 **잰 것이 아니라 형태다**: `autoFocus`는 마운트에만 걸리므로
   * "같은 인스턴스를 남기고 용도만 바꾸는" 구현으로 옮기는 순간 조용히 깨지는데, `ref`는
   * 그 변화를 이 파일 안에서 흡수한다. **지금 두 구현이 구별되지 않는다는 것을 적어 둔다.**
   */
  useEffect(() => {
    box.current?.focus()
  }, [])

  return (
    <input
      ref={box}
      className="wb-shell-tree-input"
      type="text"
      aria-label={props.label}
      value={value}
      onChange={(event) => {
        setValue(event.target.value)
        props.onEdit?.(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          // **여기서 빈 문자열을 거르지 않는다.** 무엇이 유효한 제목인지는 훅이 알고
          // (서버 계약이 근거다), 이 컴포넌트는 키를 뜻으로 옮기기만 한다.
          event.preventDefault()
          props.onSubmit(value)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          props.onCancel()
        }
      }}
      onBlur={props.onCancel}
    />
  )
}
