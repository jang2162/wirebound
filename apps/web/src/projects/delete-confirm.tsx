/**
 * 프로젝트 삭제 확인. **프로젝트 이름을 정확히 입력해야 확정 버튼이 열린다**.
 *
 * **메뉴 삭제와 손해의 크기가 다르다.** 메뉴는 자식이 있으면 서버가 409로 막지만
 * (`하위 메뉴나 페이지가 있어 삭제할 수 없습니다`), **프로젝트는 아무것도 막지 않는다.**
 *
 * **딸린 행이 전부 함께 지워진다(`ON DELETE CASCADE`).** 메뉴(부모·자식)·페이지·멤버·
 * revision이 있는 프로젝트에 `DELETE`를 보내면 **204**이고, 그 뒤 네 표(`menu_nodes` ·
 * `pages` · `project_members` · `revisions`)에서 그 프로젝트의 행이 전부 **0**이 된다.
 * 다시 재는 자리: `apps/api/test/projects.test.ts`의 프로젝트 삭제 케이스들(메뉴·페이지·멤버 —
 * `revisions`는 그 케이스들이 재지 않는다).
 *
 * **문안에 수를 적지 않는다.** 무엇이 얼마나 딸려 있는지는 프로젝트마다 다르고, 화면은 그것을
 * 세지 않는다 — 부류로 적는다(*"수를 적으면 그 수가 틀린다"*).
 *
 * **모달을 쓰지 않는다.** 지금 앱에 모달 선례가 없어(`role="dialog"` · `<dialog` · `aria-modal`을
 * `apps/web/src`에서 찾으면 0) 모달을 쓰면 포커스 가두기·반환 포커스를 처음부터 만들게 된다.
 * 그 자리에 인라인 입력을 둔다.
 *
 * **입력을 `trim`하지 않는다 — 재서 정했다.** 서버는 이름을 정규화하지 않는다(실측:
 * `'  앞뒤 공백  '`으로 만들면 그대로 돌아온다). 즉 **공백만 다른 두 프로젝트가 함께 있을 수
 * 있고**, 입력을 다듬으면 `'가 '`와 `'가'` 중 어느 것을 확인한 것인지 갈리지 않는다. 확인의
 * 하중이 *"어느 것을 지우는지 안다"*이므로 정확히 일치로 둔다.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ProjectDetail } from '../api/types'

/** 무엇이 함께 사라지는지. **수를 적지 않고 부류로 적는다**(위 머리말). */
const CASCADE_NOTICE = '메뉴·페이지·편집 이력과 멤버가 함께 사라집니다. 되돌릴 수 없습니다.'

export function DeleteConfirm(props: {
  project: ProjectDetail
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}): ReactElement {
  const [typed, setTyped] = useState('')
  const box = useRef<HTMLInputElement>(null)

  // 열리면 바로 칠 수 있어야 한다. `project-form.tsx`와 같은 관용구이고 같은 근거다.
  useEffect(() => {
    box.current?.focus()
  }, [])

  return (
    <div
      className="wb-shell-project-confirm"
      onKeyDown={(event) => {
        // **Esc로 닫는다.** `<form>`이 아니라 `<div>`라 Enter 제출이 없다 — 확정은 버튼
        // 하나로만 간다. 이름을 다 치고 Enter를 누르는 순간 지워지는 것을 만들지 않는다.
        if (event.key !== 'Escape') return
        event.preventDefault()
        props.onCancel()
      }}
    >
      <p role="alert">{CASCADE_NOTICE}</p>
      <label className="wb-shell-project-field">
        삭제하려면 프로젝트 이름을 입력하세요
        <input
          className="wb-shell-project-input"
          ref={box}
          type="text"
          value={typed}
          disabled={props.busy}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      {/* **정확히 일치할 때만 활성이다.** 여기서 `trim`하지 않는 근거는 머리말에 있다. */}
      {/* **되돌릴 수 없는 유일한 버튼이라 이것만 붉다.** 목록의 `삭제`는 이 확인을 열 뿐이라
          흰 바탕을 쓴다 — 되돌릴 수 있는 것에 붉은색을 쓰면 진짜 붉은색의 뜻이 닳는다. */}
      <button
        className="wb-shell-project-danger"
        type="button"
        disabled={props.busy || typed !== props.project.name}
        onClick={props.onConfirm}
      >
        삭제 확정
      </button>
      <button
        className="wb-shell-project-action"
        type="button"
        disabled={props.busy}
        onClick={props.onCancel}
      >
        삭제 취소
      </button>
    </div>
  )
}
