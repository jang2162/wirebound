/**
 * **앱의 모달 하나**(spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md` 「대화 상자」). 스냅샷 · 프로젝트 내보내기(셸이 그린다) ·
 * 페이지 가져오기 · 하위가 있는 메뉴의 삭제 확인(메뉴 트리가 그린다 — `panels/page-import-dialog.tsx` · `panels/menu-delete-dialog.tsx`)이
 * 에디터 위에서 이 안에 선다. 다른 확인(페이지 · 빈 메뉴 삭제 · 복원 · 토큰 폐기)은 모달이 아니라 그 자리의 인라인 확인이다 — 모달은 이
 * 하나만 쓴다.
 *
 * ## 상자 안의 키는 React 트리를 따라 버블된다 — 키 핸들러가 붙은 상자 안에 그리지 마라
 *
 * 모달은 뒤 화면의 누름 · 포커스를 막지만, 상자 안에서 난 React 합성 이벤트는 top layer 에 떠 있어도 **이 상자를 그린 컴포넌트의 조상
 * 핸들러**로 올라간다. 그 조상이 단축키를 받으면 상자 안 단추에서 친 키가 뒤 화면의 조작을 건다(Chrome — 메뉴 트리의 단축키 상자 안에
 * 그리면 상자 단추의 `Delete`가 고른 메뉴의 삭제 확인을 건다: `build-test/page-json-dialog.test.ts`). 그런 자리에서 열 때는 핸들러가
 * 붙은 상자의 **형제**로 그린다(`panels/menu-tree.tsx`의 `outside`).
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
 * «고르면 먼저 닫고 …») `…` 로 간다. 연 요소가 그 사이 사라졌으면(남이 대상 메뉴를 지움 · 셸째 내려감) `focusFallback` 이 고른 자리로 간다 — 안
 * 주면 포커스가 `body` 로 떨어진다. 셸째 내려가면 그 자리도 없어 `focus()` 는 아무것도 안 한다. 연 순간 포커스가 없었으면(`body`) 돌려주지 않는다.
 */
import { useEffect, useId, useLayoutEffect, useRef, type DragEvent, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { shellIcon } from './icons'

export function ShellDialog(props: {
  open: boolean
  /** 제목 — 대화 상자의 접근 이름이다(`aria-labelledby`). */
  title: string
  /** Escape · 닫기 단추. 부르는 쪽이 `open`을 거짓으로 내린다. */
  onClose: () => void
  /** 상자의 설명이 되는 요소의 id(`aria-describedby` — 띄어 여럿). 열릴 때 제목과 함께 읽힌다(`panels/menu-delete-dialog.tsx`). */
  describedBy?: string
  /**
   * 연 요소가 그 사이 사라졌을 때 포커스를 돌려줄 자리(머리말 «닫히면 연 요소로 포커스를 돌려준다»). 닫는 순간에 부른다 — `null` 이면 돌려주지
   * 않는다. 없으면 안 돌려준다.
   */
  focusFallback?: () => HTMLElement | null
  children: ReactNode
}): ReactElement | null {
  if (!props.open) return null
  return (
    <OpenDialog title={props.title} onClose={props.onClose} describedBy={props.describedBy} focusFallback={props.focusFallback}>
      {props.children}
    </OpenDialog>
  )
}

function OpenDialog(props: {
  title: string
  onClose: () => void
  describedBy: string | undefined
  focusFallback: (() => HTMLElement | null) | undefined
  children: ReactNode
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  /** `showModal`로 섰는가 — 아니면 Escape 를 키 이벤트로 받는다(머리말). */
  const modal = useRef(false)
  /** 한글을 조합하는 중인가(머리말 «한글 조합 중의 Escape …»). */
  const composing = useRef(false)
  /** 마지막 `onClose` — 인라인 화살표를 받아도 이펙트를 다시 돌리지 않는다(`use-popover-dismiss.ts`의 `latest`와 같은 까닭). */
  const latest = useRef(props.onClose)
  const fallback = useRef(props.focusFallback)
  useEffect(() => {
    latest.current = props.onClose
    fallback.current = props.focusFallback
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
      else if (opener !== null) fallback.current?.()?.focus()
    }
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    // 모달이면 브라우저의 `cancel`이 받는다 — 여기서도 받으면 한 번의 Escape 가 두 번 닫는다.
    if (modal.current) return
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || composing.current) return
    event.preventDefault()
    latest.current()
  }

  /**
   * **파일을 놓아도 브라우저가 열지 않는다** — 받지 않은 자리(상자 머리 · 배경막 · 몸체의 파일 칸 밖)에 놓인 파일을 브라우저가 열면(Chrome 새 탭 ·
   * Firefox · Safari 는 현재 탭을 옮겨 에디터를 떠난다) 모달에 든 사람이 입력을 잃는다. 안쪽이 이미 받은 이벤트(`defaultPrevented` — 가져오기
   * 상자의 파일 칸)는 그대로 둔다. 파일이 아닌 끌기(글자 · 링크)는 브라우저의 것이다.
   */
  function swallowFiles(event: DragEvent<HTMLDialogElement>): void {
    if (event.defaultPrevented || !event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    if (event.type === 'dragover') event.dataTransfer.dropEffect = 'none'
  }

  return (
    <dialog
      ref={ref}
      className="wb-shell-dialog"
      aria-labelledby={titleId}
      aria-describedby={props.describedBy}
      onKeyDown={onKeyDown}
      onDragOver={swallowFiles}
      onDrop={swallowFiles}
    >
      <div className="wb-shell-dialog-head">
        <h2 id={titleId} className="wb-shell-dialog-title">
          {props.title}
        </h2>
        {/* 아이콘만 남는 단추 — 이름 · `title` 은 아이콘을 얹기 전의 글 그대로(`shell/icons.ts` 머리말 «이름은 아이콘이 나르지 않는다»). */}
        <button type="button" className="wb-shell-dialog-close" aria-label="닫기" title="닫기" onClick={() => latest.current()}>
          {shellIcon('close', 16)}
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
