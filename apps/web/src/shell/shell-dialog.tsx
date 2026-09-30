/**
 * **앱의 모달 하나**(spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md` 「대화 상자」). 스냅샷 · 내보내기가 에디터 위에서 이 안에
 * 선다. 다른 확인(삭제 · 복원 · 토큰 폐기)은 모달이 아니라 그 자리의 인라인 확인이다 — 모달은 이 하나만 쓴다.
 *
 * ## `<dialog>` 의 `showModal()` 이다
 *
 * 포커스 가둠 · 뒤 화면의 `inert` · top layer 를 브라우저가 한다 — 손으로 짜면 캔버스 iframe(same-origin 문서)까지 가둬야 하는데 그 문서의
 * 포커스는 호스트 리스너가 못 본다(`canvas/canvas-document.tsx`). **`showModal` 이 없으면 `open` 속성으로 세운다** — jsdom 25 가 그렇다
 * (`HTMLDialogElement` 에 메서드가 없다). 그 갈래는 가둠 · `inert` 가 없는 겉모양이고, Escape 는 키 이벤트로 받는다(아래).
 *
 * **열려 있는 동안만 DOM 에 둔다.** 안의 몸체(`SnapshotsBody` · 내보내기 몸체)는 마운트가 곧 조회다 — 열 때마다 지금 목록 · 지금 미리보기를
 * 받는다(팝오버였을 때와 같은 규칙). 닫으면 확인 단계 · 폼 · 알림이 함께 초기화된다. 요소를 빼면 브라우저가 top layer 에서도 뺀다 — `close()`를
 * 따로 부르지 않는다.
 *
 * ## 닫는 길은 둘 — Escape 와 닫기 단추. 바깥(backdrop) 누름으로는 닫지 않는다
 *
 * 스냅샷 폼에 친 태그 · 설명을 잘못 누른 한 번에 잃지 않게 한다. 닫힘은 `open` 값이 정한다 — 브라우저가 Escape 에 내는 `cancel`의 기본 동작
 * (스스로 닫기)을 막고 `onClose`를 부른다. 막지 않으면 요소는 닫혔는데 `open`은 참인 판이 생긴다.
 *
 * **한글 조합 중의 Escape 로는 닫지 않는다.** 그 Escape 는 조합을 취소하는 키다 — 닫으면 몸체가 내려가 친 글이 통째로 사라진다
 * (`use-popover-dismiss.ts` 머리말 «`Escape`도 함께 닫는다» — 조합 중의 Escape 가 `isComposing: true` 로 온다). 모달의 `cancel`에는
 * `isComposing`이 없어 조합 구간을 `compositionstart` · `compositionend` 로 따로 든다.
 *
 * ## 닫히면 연 요소로 포커스를 돌려준다
 *
 * 연 순간의 `document.activeElement` 를 쥔다. `…` 메뉴의 항목에서 열었으면 메뉴가 먼저 닫히며 포커스를 `…` 로 돌려준 뒤라(`action-menu.tsx`
 * «고르면 먼저 닫고 …») `…` 로 간다. 연 요소가 그 사이 사라졌으면(셸째 내려감) 돌려주지 않는다.
 */
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'

export function ShellDialog(props: {
  open: boolean
  /** 제목 — 대화 상자의 접근 이름이다(`aria-labelledby`). */
  title: string
  /** Escape · 닫기 단추. 부르는 쪽이 `open`을 거짓으로 내린다. */
  onClose: () => void
  children: ReactNode
}): ReactElement | null {
  if (!props.open) return null
  return <OpenDialog title={props.title} onClose={props.onClose}>{props.children}</OpenDialog>
}

function OpenDialog(props: { title: string; onClose: () => void; children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  /** `showModal`로 섰는가 — 아니면 Escape 를 키 이벤트로 받는다(머리말). */
  const modal = useRef(false)
  /** 한글을 조합하는 중인가(머리말 «한글 조합 중의 Escape …»). */
  const composing = useRef(false)
  /** 마지막 `onClose` — 인라인 화살표를 받아도 이펙트를 다시 돌리지 않는다(`use-popover-dismiss.ts`의 `latest`와 같은 까닭). */
  const latest = useRef(props.onClose)
  useEffect(() => {
    latest.current = props.onClose
  })

  // 그리기 전에 세운다 — 첫 프레임에 뒤 화면 위로 비모달 상자가 한 번 보이지 않게 한다.
  useLayoutEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
      modal.current = true
    } else {
      dialog.setAttribute('open', '')
    }
    // 첫 포커스 — 브라우저의 `showModal`도 안의 첫 포커스 가능한 것에 준다. 없는 판(jsdom)과 같게 여기서 한 번 더 준다.
    if (!dialog.contains(document.activeElement)) firstFocusable(dialog)?.focus()

    const onCancel = (event: Event): void => {
      event.preventDefault()
      if (composing.current) return
      latest.current()
    }
    const onCompositionStart = (): void => {
      composing.current = true
    }
    const onCompositionEnd = (): void => {
      composing.current = false
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('compositionstart', onCompositionStart)
    dialog.addEventListener('compositionend', onCompositionEnd)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('compositionstart', onCompositionStart)
      dialog.removeEventListener('compositionend', onCompositionEnd)
      // **먼저 닫고 돌려준다.** 이 정리는 요소가 DOM 에서 빠지기 전에 돈다 — 모달이 떠 있는 동안 뒤 화면은 `inert`라 연 요소의 `focus()`가
      // 조용히 안 먹는다. `StrictMode`의 두 번째 마운트도 닫힌 상자에 `showModal`을 다시 부르게 된다(열린 비모달에 부르면 던진다).
      if (dialog.open) {
        if (modal.current) dialog.close()
        else dialog.removeAttribute('open')
      }
      if (opener !== null && opener.isConnected) opener.focus()
    }
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    // 모달이면 브라우저의 `cancel`이 받는다 — 여기서도 받으면 한 번의 Escape 가 두 번 닫는다.
    if (modal.current) return
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || composing.current) return
    event.preventDefault()
    latest.current()
  }

  return (
    <dialog ref={ref} className="wb-shell-dialog" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="wb-shell-dialog-head">
        <h2 id={titleId} className="wb-shell-dialog-title">
          {props.title}
        </h2>
        <button type="button" className="wb-shell-dialog-close" onClick={() => latest.current()}>
          닫기
        </button>
      </div>
      {props.children}
    </dialog>
  )
}

/** 안의 첫 포커스 가능한 것. 없으면 `null` — 상자 자체는 포커스를 받지 않는다. */
function firstFocusable(box: HTMLElement): HTMLElement | null {
  return box.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
}
