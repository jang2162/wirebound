/**
 * 비밀번호 칸 + 칸 안 오른쪽의 «보기» 토글 — 로그인(`routes/login.tsx`)과 새 비밀번호 두 칸(`account/new-password-fields.tsx`)이 함께 쓴다.
 *
 * **토글의 이름은 «<칸 라벨> 보기» · «<칸 라벨> 숨기기» 로 바뀐다**(`aria-pressed` 를 함께 두지 않는다 — 이름과 누름 상태가 같은 사실을 두 번
 * 말한다). 칸 라벨을 이름에 넣는 것은 새 비밀번호 화면에 칸이 둘이라 «보기» 둘을 가를 수 없어서다. 그래서 Playwright `getByLabel('<칸 라벨>')`
 * (부분 일치)은 이 단추에도 맞는다 — 칸을 찾는 실브라우저 케이스는 `exact: true` 로 찾는다.
 *
 * **포인터로 누르면 포커스는 칸에 남는다** — 단추의 `mousedown` 기본 동작(포커스 옮김)을 막는다. 친 글을 확인하고 이어 치는 손이 칸을 다시
 * 누르지 않게 하려는 것이다. 키보드로 단추에 와서 누른 판은 포커스가 단추에 남는다(Tab 차례를 되돌리지 않는다).
 */
import { useState, type ReactElement } from 'react'

export function PasswordInput(props: {
  id: string
  /** 칸의 라벨 글 — 토글의 이름이 이것으로 선다. */
  label: string
  autoComplete: 'current-password' | 'new-password'
  value: string
  onChange: (value: string) => void
}): ReactElement {
  const [shown, setShown] = useState(false)
  return (
    <span className="wb-shell-password">
      <input
        className="wb-shell-login-input wb-shell-password-input"
        id={props.id}
        type={shown ? 'text' : 'password'}
        autoComplete={props.autoComplete}
        // 보이는 동안 맞춤법 검사 · 자동 고침이 비밀번호를 고치거나 사전으로 보내지 않게 한다.
        spellCheck={false}
        autoCapitalize="off"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <button
        type="button"
        className="wb-shell-password-toggle"
        aria-label={`${props.label} ${shown ? '숨기기' : '보기'}`}
        aria-controls={props.id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setShown((value) => !value)}
      >
        {shown ? '숨기기' : '보기'}
      </button>
    </span>
  )
}
