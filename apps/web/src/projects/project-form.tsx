/**
 * 프로젝트의 이름·슬러그·설명을 묻는 인라인 폼. **만들기와 수정이 같은 것을 쓴다.**
 *
 * **`panels/tree-input.tsx`를 재사용하지 않는 근거(D4):** 그쪽은 **필드가 하나**라 Enter·Esc·
 * blur를 입력 하나에 붙이면 끝이다. 여기는 셋이라 그 규칙이 필드마다 달라진다 — 특히 blur가
 * 그렇다(아래).
 *
 * **`<form>`으로 감싼다.** Enter 제출이 브라우저가 주는 동작이라 키 핸들러를 만들지 않아도
 * 된다. **Esc는 `<form>`에 없으므로 그것만 손으로 붙인다.**
 *
 * **blur로 닫지 않는다 — 이것이 `tree-input.tsx`와 갈리는 자리다.**
 * 그쪽은 *"Enter만 확정하고 Esc·blur는 취소다"*이고 근거는 *"undo가 없어 '취소하려고 다른 곳을
 * 눌렀는데 이름이 바뀌었다'가 복구 불가한 사고가 된다"*였다. **여기서는 그 규칙이 성립하지
 * 않는다:** 필드 사이를 옮기는 것이 blur이므로, blur에 닫으면 이름을 치고 슬러그로 가는 순간
 * 폼이 사라진다. **P2b-4의 D6은 입력이 하나일 때의 규칙이다.**
 *
 * **만들기와 수정을 한 컴포넌트로 두는 근거:** 묻는 것이 같고 다른 것은 초기값과 버튼 글자뿐이다.
 * 나누면 D4의 blur 규칙·포커스 규칙이 두 벌이 되고 한쪽만 고치는 자리가 생긴다 —
 * `tree-input.tsx`가 만들기와 이름 변경을 한 컴포넌트로 둔 것과 같은 판단이다.
 *
 * **`busy`를 받아 필드를 잠근다.** 요청이 나가 있는 동안 값이 바뀌면 사용자가 보낸 것과 화면에
 * 있는 것이 달라진다. **`tree-input.tsx`가 `disabled`를 걷어낸 것과 반대인 이유는 그 자리가
 * 다르기 때문이다** — 그쪽은 제출하면서 입력이 DOM에서 사라지지만(요청 전에 `setEditing(null)`),
 * 이 폼은 **성공한 뒤에야 닫힌다**(실패하면 친 값을 남겨야 하므로). 즉 여기서는 "요청이 나가 있는
 * 동안 폼이 떠 있는" 상태가 실제로 만들어진다.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ProjectDetail } from '../api/types'
import type { ProjectFormValues } from './use-project-commands'

export function ProjectForm(props: {
  /** 수정이면 그 프로젝트, 만들기면 `null`. 초기값이 여기서 나온다. */
  initial: ProjectDetail | null
  submitLabel: string
  busy: boolean
  onSubmit: (values: ProjectFormValues) => void
  onCancel: () => void
}): ReactElement {
  const [name, setName] = useState(props.initial?.name ?? '')
  const [slug, setSlug] = useState(props.initial?.slug ?? '')
  // **`description`이 `null`이면 빈 칸이다.** 서버의 "설명 없음"이 `null`이고 폼의 그것은
  // 빈 문자열이다 — 되돌리는 변환은 훅이 한다(`submitForm`).
  const [description, setDescription] = useState(props.initial?.description ?? '')
  const first = useRef<HTMLInputElement>(null)

  /**
   * 첫 필드에 포커스를 준다.
   *
   * **`autoFocus`가 아니라 `ref` + `useEffect`인 이유를 재고 적는다.** 계획서는
   * *"툴바가 `key`로 새 인스턴스를 만들면 `autoFocus`가 다시 걸린다"*를 근거로 들며 **이 폼은
   * 그렇지 않을 수 있다**고 했다. **재 봤다:** `routes/project-list.tsx`가 이 컴포넌트에
   * `key`를 준다(`"create"` / `` `edit-${id}` ``). 즉 만들기↔수정, 다른 항목의 수정으로 옮기면
   * **새 인스턴스가 마운트되고 `autoFocus`도 걸린다.**
   *
   * **그래서 지금 두 구현은 구별되지 않는다** — `autoFocus`로 바꿔도 이 저장소의 케이스가
   * 하나도 죽지 않는다(0 사망, jsdom에서 `autoFocus`가 동작한다). `tree-input.tsx`가 같은
   * 결론에 이르렀고 근거도 같다.
   *
   * `ref`를 두는 근거는 **잰 것이 아니라 형태다**: `key`를 떼는 순간(같은 인스턴스를 남기고
   * 초기값만 바꾸는 구현) `autoFocus`는 조용히 안 걸리는데 `ref`는 그 변화를 이 파일 안에서
   * 흡수한다.
   */
  useEffect(() => {
    first.current?.focus()
  }, [])

  return (
    <form
      className="wb-shell-project-form"
      onSubmit={(event) => {
        // 기본 동작은 페이지 전체를 다시 부른다 — SPA에서는 그것이 앱을 통째로 버리는 것이다.
        event.preventDefault()
        props.onSubmit({ name, slug, description })
      }}
      onKeyDown={(event) => {
        // **Esc는 `<form>`이 주지 않는다.** Enter와 달리 손으로 붙인다.
        if (event.key !== 'Escape') return
        event.preventDefault()
        props.onCancel()
      }}
    >
      <label className="wb-shell-project-field">
        이름
        <input
          className="wb-shell-project-input"
          ref={first}
          type="text"
          value={name}
          disabled={props.busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="wb-shell-project-field">
        슬러그
        <input
          className="wb-shell-project-input"
          type="text"
          value={slug}
          disabled={props.busy}
          onChange={(event) => setSlug(event.target.value)}
        />
      </label>
      <label className="wb-shell-project-field">
        설명
        <input
          className="wb-shell-project-input"
          type="text"
          value={description}
          disabled={props.busy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {/* **빈 필드를 여기서 막지 않는다.** 무엇이 유효한지는 훅이 알고(서버 계약이 근거다),
          이 컴포넌트는 값을 모아 넘기기만 한다 — `tree-input.tsx`가 같은 경계를 갖는다.
          `disabled`로 막지 않는 것은 **왜 안 되는지 보이지 않기 때문이다**: 비활성 버튼은
          이유를 말하지 않는다. */}
      {/* 이 폼의 주 동작이다 — 목록의 `새 프로젝트`·로그인의 `로그인`과 같은 무게를 받는다. */}
      <button className="wb-shell-project-submit" type="submit" disabled={props.busy}>
        {props.submitLabel}
      </button>
      <button
        className="wb-shell-project-action"
        type="button"
        disabled={props.busy}
        onClick={props.onCancel}
      >
        취소
      </button>
    </form>
  )
}
