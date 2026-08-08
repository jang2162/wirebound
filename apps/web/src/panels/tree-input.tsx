/**
 * 인라인 입력 하나. **만들기와 이름 변경이 같은 것을 쓴다**(D6) — 묻는 것이 제목 하나로
 * 같고, 용도마다 컴포넌트를 나누면 Enter·Esc·blur 규칙이 세 벌이 된다.
 *
 * **`window.prompt`를 쓰지 않는 근거(D6):** jsdom에 없어 모킹이 필요하고, 스타일도 접근성도
 * 다룰 수 없다.
 *
 * **Enter만 확정하고 Esc·blur는 취소다.** P2b-2의 속성 편집은 blur에도 커밋했는데
 * **그것은 undo가 받쳐 줬기 때문이다.** 이 경로에는 undo가 없어(D1) "취소하려고 다른 곳을
 * 눌렀는데 이름이 바뀌었다"가 복구 불가한 사고가 된다.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'

export function TreeInput(props: {
  label: string
  initial: string
  disabled: boolean
  onSubmit: (value: string) => void
  onCancel: () => void
}): ReactElement {
  const [value, setValue] = useState(props.initial)
  const box = useRef<HTMLInputElement>(null)

  /**
   * 포커스를 준다. **`autoFocus`가 아니라 `ref` + `useEffect`인 이유를 재고 적는다.**
   *
   * 계획서는 *"같은 입력이 용도만 바꿔 다시 열릴 때 `autoFocus`가 다시 걸리지 않는다"*를
   * 근거로 들었다. **그 조건은 이 구현에서 성립하지 않는다** — `MenuToolbar`가 이 컴포넌트에
   * `key={editing.kind}`를 주므로 용도가 바뀌면 React가 **새 인스턴스를 마운트**한다.
   * 마운트라면 `autoFocus`도 걸린다.
   *
   * **재 봤다:** `autoFocus`로 바꿔도 이 저장소의 케이스가 하나도 죽지 않는다(0 사망).
   * jsdom에서 `autoFocus`가 동작하기 때문이다.
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
      disabled={props.disabled}
      onChange={(event) => setValue(event.target.value)}
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
