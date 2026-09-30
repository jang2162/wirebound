/**
 * **행동 메뉴** — 단추 하나 뒤에 항목 목록을 여는 부품. 에디터 머리 · 프로젝트 목록 머리의 `…` 가 쓰고, 트리 줄의 `+` · `…` 도 이것을 쓴다
 * (설계서 spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md` 「`…` 메뉴」 · 「툴바 대신 노드별 `+` · `…`」).
 *
 * ## 역할은 `menu` · `menuitem` 이다
 *
 * 단추는 `aria-haspopup="menu"` · `aria-expanded`, 목록은 `role="menu"`, 항목은 `role="menuitem"`. 링크 항목은 `<Link>` 에 역할을 얹는다 —
 * **주소가 있는 이동**(계정 설정 · 프로젝트 설정)은 새 탭으로 열 수 있어야 한다(`routes/editor.tsx` 머리의 로고 링크와 같은 근거).
 *
 * **포커스는 항목 사이를 옮겨 다닌다**(roving) — 항목은 전부 `tabIndex=-1` 이고 화살표가 포커스를 옮긴다. Tab 한 번으로 메뉴를 빠져나가는 것이
 * `menu` 역할의 약속이다. 머리(`heading` — 로그인한 사람)는 목록 **밖**에 둔다: 항목이 아니므로 화살표가 거기 서면 안 된다.
 *
 * | 키 | 어디서 | 무엇 |
 * |---|---|---|
 * | 클릭 · Enter · Space | 단추 | 열고 첫 켠 항목에 포커스(Enter · Space 는 단추의 기본 동작이 클릭을 낸다) |
 * | ↓ · ↑ | 단추 | 열고 첫 · 끝 켠 항목에 포커스 |
 * | ↓ · ↑ · Home · End | 목록 | 켠 항목 사이를 옮긴다 — 끝에서 돈다 |
 * | Enter · Space | 목록 | 포커스 항목을 고른다 |
 * | Escape · 바깥 누름 | 어디든 | 닫는다 |
 *
 * **끈 항목(`disabled`)은 `aria-disabled` 로 남긴다 — 빼지 않는다.** 할 수 없는 일이 목록에 있다는 것 자체가 정보다(트리의 «들여쓰기»가 지금
 * 안 되는 판). 화살표는 그것을 건너뛰고, 눌러도 아무것도 안 한다. `disabled` 속성을 쓰지 않는 것은 그 속성이 포커스와 클릭 이벤트를 함께 막아
 * 보조 기술에 «있다»도 덜 전하기 때문이다.
 *
 * ## 닫히면 포커스를 단추로 돌려준다 — 포커스가 메뉴 안에 있었을 때만
 *
 * 항목을 고르거나 Escape 로 닫으면 포커스를 쥔 항목이 사라진다 — 돌려주지 않으면 포커스가 `body`로 떨어져 키보드 사용자가 머리부터 다시
 * 찾아간다. **바깥 누름은 다르다** — 그 누름이 누른 자리에 포커스를 준다(`mousedown`의 기본 동작이 이 훅의 리스너 뒤에 돈다). 그래서
 * «메뉴 안에 포커스가 있었으면 단추로»만 하고, 그 뒤 누른 자리가 포커스를 가져가게 둔다.
 *
 * **고르면 먼저 닫고 돌려준 뒤 부른다.** 고른 항목이 대화 상자를 열면(`ShellDialog`) 그 상자는 연 순간의 포커스를 «연 요소»로 쥔다 —
 * 순서를 바꾸면 사라진 항목을 쥐어 닫힐 때 돌아갈 곳이 없다.
 *
 * ## Enter · Space 를 직접 받는다
 *
 * 항목이 `<button>` · `<a>` 라 브라우저도 Enter(· 단추의 Space)에 클릭을 낸다. 그대로 두면 `<a>` 의 Space 는 스크롤이 된다. 그래서
 * 키 이벤트의 기본 동작을 막고 포커스 항목의 `click()` 을 부른다 — 링크면 라우터가 받고 단추면 `onSelect` 가 돈다. 한 길이라 두 번 돌지
 * 않는다.
 *
 * ## 바깥 누름 · 자리는 셸의 두 훅을 쓴다
 *
 * 닫기는 `use-popover-dismiss.ts`(캔버스 iframe 의 문서까지 듣는다 — 그 훅의 «캔버스 iframe 의 문서에도 건다»), 자리는 `use-popover-side.ts`
 * (머리가 접혀 단추가 왼쪽으로 가도 목록이 창 밖으로 안 나간다). **그 훅의 계약대로 단추까지 감싸는 상자에 건다.** Escape 는 그 훅도 받지만
 * 포커스를 돌려주려고 목록의 키 처리가 먼저 받는다 — 둘이 함께 닫아도 한 번 닫힌 상태에 한 번 더 닫는 것이라 결과가 같다.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Link } from 'react-router'
import { usePopoverDismiss } from './use-popover-dismiss'
import { usePopoverSide } from './use-popover-side'

export interface ActionMenuItem {
  /** 목록 안에서 갈리는 이름 — React `key`다. */
  key: string
  label: string
  /** 고르면 부른다. `to`가 있으면 쓰지 않는다. */
  onSelect?: () => void
  /** 링크 항목의 주소 — 있으면 `<Link>`로 그린다. */
  to?: string
  /** 할 수 없는 항목 — 목록에 남되 고를 수 없다(머리말). */
  disabled?: boolean
  /** 되돌리기 어려운 일(삭제) — 색만 바뀐다. */
  danger?: boolean
}

export function ActionMenu(props: {
  /** 단추의 접근 이름. 글자는 `…` 하나라 이름이 따로 있어야 한다. */
  label: string
  items: readonly ActionMenuItem[]
  /** 목록 위 머리(로그인한 사람의 이름). 없으면 안 그린다. */
  heading?: string
  /** 단추의 글자. 기본은 `…`(트리 줄의 `+` 가 바꾼다). */
  glyph?: string
}): ReactElement {
  const [open, setOpen] = useState(false)
  /** 열 때 포커스를 줄 항목 — `'first'` · `'last'`. 목록이 그려진 뒤 이펙트가 옮긴다. */
  const [entry, setEntry] = useState<'first' | 'last'>('first')
  const toggleRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  /**
   * **닫는다 — 포커스가 메뉴 안에 있었으면 단추로 돌려준다**(머리말). 목록이 아직 DOM 에 있는 동안 물어야 한다 — 닫은 뒤에는 포커스를 쥔 항목이
   * 이미 사라져 `body`다.
   */
  function close(): void {
    const box = listRef.current
    if (box !== null && box.contains(document.activeElement)) toggleRef.current?.focus()
    setOpen(false)
  }

  const rootRef = usePopoverDismiss(open, close)
  const { placement, bodyRef } = usePopoverSide(rootRef, open)

  useEffect(() => {
    if (!open) return
    const enabled = enabledItems(listRef.current)
    ;(entry === 'first' ? enabled[0] : enabled[enabled.length - 1])?.focus()
  }, [open, entry])

  function openAt(at: 'first' | 'last'): void {
    setEntry(at)
    setOpen(true)
  }

  function onToggleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    openAt(event.key === 'ArrowDown' ? 'first' : 'last')
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.nativeEvent.isComposing) return
    const enabled = enabledItems(listRef.current)
    const at = enabled.indexOf(document.activeElement as HTMLElement)
    const move = (index: number): void => {
      event.preventDefault()
      enabled[(index + enabled.length) % enabled.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        move(at + 1)
        return
      case 'ArrowUp':
        move(at === -1 ? -1 : at - 1)
        return
      case 'Home':
        move(0)
        return
      case 'End':
        move(-1)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.click()
        return
      case 'Escape':
        event.preventDefault()
        close()
        return
      case 'Tab':
        // 메뉴는 Tab 한 번으로 빠져나간다 — 닫고 포커스는 브라우저가 다음 자리로 옮기게 둔다.
        setOpen(false)
        return
    }
  }

  /** 항목을 골랐다 — 먼저 닫고 돌려준 뒤 부른다(머리말 «고르면 먼저 닫고 …»). */
  function choose(item: ActionMenuItem): void {
    close()
    item.onSelect?.()
  }

  return (
    <div className="wb-shell-action-menu" ref={rootRef}>
      <button
        type="button"
        ref={toggleRef}
        className="wb-shell-action-menu-toggle"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openAt('first'))}
        onKeyDown={onToggleKeyDown}
      >
        {props.glyph ?? '…'}
      </button>
      {open && (
        <div
          className="wb-shell-action-menu-body"
          ref={(element) => {
            listRef.current = element
            bodyRef.current = element
          }}
          data-side={placement.side}
          style={placement.style}
          onKeyDown={onListKeyDown}
        >
          {props.heading !== undefined && <p className="wb-shell-action-menu-heading">{props.heading}</p>}
          <ul className="wb-shell-action-menu-list" role="menu" id={listId} aria-label={props.label}>
            {props.items.map((item) => (
              <li key={item.key} className="wb-shell-action-menu-entry" role="none">
                {item.to !== undefined && item.disabled !== true ? (
                  <Link
                    role="menuitem"
                    tabIndex={-1}
                    className="wb-shell-action-menu-item"
                    to={item.to}
                    onClick={() => close()}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={item.danger === true ? 'wb-shell-action-menu-item wb-shell-action-menu-danger' : 'wb-shell-action-menu-item'}
                    aria-disabled={item.disabled === true ? true : undefined}
                    onClick={() => {
                      if (item.disabled === true) return
                      choose(item)
                    }}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** 목록 안의 켠 항목 — 화살표가 설 자리. 차례는 DOM 차례다. */
function enabledItems(box: HTMLElement | null): HTMLElement[] {
  if (box === null) return []
  return [...box.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
    (item) => item.getAttribute('aria-disabled') !== 'true',
  )
}
