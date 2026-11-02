/**
 * 새 프로젝트의 이름·슬러그·설명을 묻는 인라인 폼(목록 위). **고치기는 여기가 아니다** — 설정 페이지의 «일반» 절이
 * 바뀐 키만 보낸다(`settings/general-section.tsx`).
 *
 * **`panels/tree-input.tsx`를 재사용하지 않는 근거:** 그쪽은 **필드가 하나**라 Enter·Esc·
 * blur를 입력 하나에 붙이면 끝이다. 여기는 셋이라 그 규칙이 필드마다 달라진다 — 특히 blur가
 * 그렇다(아래).
 *
 * **`<form>`으로 감싼다.** Enter 제출이 브라우저가 주는 동작이라 키 핸들러를 만들지 않아도
 * 된다. **Esc는 `<form>`에 없으므로 그것만 손으로 붙인다.**
 *
 * **blur로 닫지 않는다 — 이것이 `tree-input.tsx`와 갈리는 자리다.**
 * 그쪽은 *"Enter만 확정하고 Esc·blur는 취소다"*이고 근거는 *"undo가 없어 '취소하려고 다른 곳을
 * 눌렀는데 이름이 바뀌었다'가 복구 불가한 사고가 된다"*이다. **여기서는 그 규칙이 성립하지
 * 않는다:** 필드 사이를 옮기는 것이 blur이므로, blur에 닫으면 이름을 치고 슬러그로 가는 순간
 * 폼이 사라진다. **`tree-input.tsx`의 blur 규칙은 입력이 하나일 때의 규칙이다.**
 *
 * **`busy`를 받아 필드를 잠근다.** 요청이 나가 있는 동안 값이 바뀌면 사용자가 보낸 것과 화면에
 * 있는 것이 달라진다. **`tree-input.tsx`가 `disabled`를 걸지 않는 것과 반대인 이유는 그 자리가
 * 다르기 때문이다** — 그쪽은 제출하면서 입력이 DOM에서 사라지지만(요청 전에 `setEditing(null)`),
 * 이 폼은 **성공한 뒤에야 닫힌다**(실패하면 친 값을 남겨야 하므로). 즉 여기서는 "요청이 나가 있는
 * 동안 폼이 떠 있는" 상태가 실제로 만들어진다.
 *
 * **잠그면 포커스가 빠지므로 실패 뒤에 돌려준다.** 포커스가 선 칸에 `disabled` 를 걸면 브라우저가 포커스를 `body` 로 떨군다 — 실패(409 · 400 ·
 * 끊김)로 폼이 남아도 키보드 사람은 사이드바부터 다시 Tab 해야 한다. 그래서 보낸 순간 포커스가 있던 칸(Enter 를 친 칸 · 누른 «만들기»)을 적어
 * 두고, 잠금이 풀릴 때 포커스가 아직 빠진 채면 그 칸으로 돌린다. **`disabled` 대신 `readOnly` 로 잠그지 않는 근거:** `readOnly` 는 단추에 없어
 * «만들기» · «취소» 는 여전히 `disabled` 이고(마우스로 보낸 판은 그대로 빠진다), 읽기 전용 칸에서도 Enter 가 폼을 제출해 «잠긴 칸» 이 보내는
 * 길이 하나 더 선다. **포커스가 빠진 채일 때만 돌린다** — 요청 중에 사람이 다른 곳을 눌렀으면 그 자리를 뺏지 않는다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type { ProjectFormValues } from './use-project-commands'

export function ProjectForm(props: {
  submitLabel: string
  busy: boolean
  onSubmit: (values: ProjectFormValues) => void
  onCancel: () => void
}): ReactElement {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  // 빈 설명은 «설명 없음» 이다 — 키를 빼는 변환은 훅이 한다(`submitForm`).
  const [description, setDescription] = useState('')
  const first = useRef<HTMLInputElement>(null)

  /**
   * 첫 필드에 포커스를 준다.
   *
   * **`autoFocus`가 아니라 `ref` + `useEffect`인 이유.** `autoFocus`는 새 인스턴스가
   * 마운트될 때만 걸린다. 폼은 열 때마다 새로 마운트되므로(닫으면 DOM 에서 빠진다) **지금 두 구현은
   * 구별되지 않는다** — `autoFocus`로 바꿔도 이 저장소의 케이스가 하나도 죽지 않는다(jsdom에서 `autoFocus`가
   * 동작한다). `tree-input.tsx`가 같은 결론이고 근거도 같다.
   *
   * `ref`를 두는 근거는 **잰 것이 아니라 형태다**: 같은 인스턴스를 남기는 구현으로 바뀌는 순간
   * `autoFocus`는 조용히 안 걸리는데 `ref`는 그 변화를 이 파일 안에서 흡수한다.
   */
  useEffect(() => {
    first.current?.focus()
  }, [])

  /** 보낸 순간 포커스가 있던 폼 안의 요소(머리말 «잠그면 포커스가 빠지므로 …»). */
  const sentFrom = useRef<HTMLElement | null>(null)
  const wasBusy = useRef(props.busy)
  // **레이아웃 이펙트인 근거:** 칸이 풀리는 커밋과 같은 태스크에서 포커스를 돌려, «풀렸는데 포커스는 `body`» 인 프레임이 없게 한다.
  useLayoutEffect(() => {
    if (wasBusy.current && !props.busy) {
      const target = sentFrom.current
      sentFrom.current = null
      const active = target?.ownerDocument.activeElement
      if (target !== null && target.isConnected && (active === null || active === target.ownerDocument.body)) target.focus()
    }
    wasBusy.current = props.busy
  }, [props.busy])

  return (
    <form
      className="wb-shell-project-form"
      onSubmit={(event) => {
        // 기본 동작은 페이지 전체를 다시 부른다 — SPA에서는 그것이 앱을 통째로 버리는 것이다.
        event.preventDefault()
        const active = event.currentTarget.ownerDocument.activeElement
        sentFrom.current = active instanceof HTMLElement && event.currentTarget.contains(active) ? active : first.current
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
      <button className="wb-shell-project-action" type="button" disabled={props.busy} onClick={props.onCancel}>
        취소
      </button>
    </form>
  )
}
