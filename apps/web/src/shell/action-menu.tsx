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
 * ## 포인터로 고른 뒤 한 더블클릭 간격 동안 오는 클릭 하나를 삼킨다
 *
 * 고르면 목록이 곧바로 닫혀 그 자리 밑의 요소가 드러난다. 더블클릭 · 연달아 두 번 누름의 **둘째 누름**이 그 요소로 간다 — 트리 줄의
 * `…` 는 아래 줄들 위에 떠, «삭제»를 두 번 누르면 둘째 누름이 밑의 페이지 줄을 눌러 그 페이지로 옮겨 가고 삭제 확인이 풀린다
 * (`build-test/tree-drag-review.test.ts` «삭제 항목의 둘째 누름 …»). 그래서 **포인터로** 고른 항목이면(`click` 의 `detail` ≥ 1) 그 뒤
 * `DOUBLE_CLICK_MS` 안에 **같은 자리**(`DOUBLE_CLICK_SLOP` 안)에 오는 `click` 하나를 붙잡는 단계에서 막는다 — 호스트 문서와 캔버스
 * iframe 의 문서 둘 다(목록이 캔버스 위에 떠 있을 수 있다 — 그 문서의 좌표는 iframe 상자만큼 옮겨 견준다). 끌기 장치의
 * `swallowNextClick`(`drag/use-pointer-drag.ts`)과 같은 꼴이다.
 *
 * **같은 자리만 본다** — 더블클릭 · 연타의 둘째 누름은 첫 누름 자리에 온다. 고른 항목이 연 대화 상자 · 확인 단추를 곧바로 **다른 자리에서**
 * 누르는 것은 뜻한 누름이라 막지 않는다 — 자리를 안 보고 시간만 보면 복원 확인처럼 곧바로 이어 누르는 판을 먹는다(`build-test/`
 * 의 복원 판들이 그 누름에서 멈춘다). **키보드로 고르면 삼키지 않는다** — 아래 «Enter · Space 를 직접 받는다»의 `click()` 은 `detail` 0 이고, 그 뒤의
 * 진짜 클릭을 먹을 까닭이 없다.
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
 *
 * ## 항목의 아이콘 — `icon` 에 lucide 컴포넌트를 준다
 *
 * 항목의 `icon`은 **컴포넌트**(`LucideIcon` — `lucide-react`)이지 그린 요소가 아니다. 크기 · 선 굵기 · 색을 이 부품이 정해 목록 안의 아이콘이
 * 한 모양이 된다 — 14px · 선 2 · 색은 글자색(`currentColor` — 끈 항목 · 위험 항목의 색을 그대로 받는다), 글자 앞 6px(`shell.css`의
 * `.wb-shell-action-menu-icon`). 아이콘은 `aria-hidden`이고 **이름은 글자가 든다** — 아이콘만으로 뜻을 나르지 않는다. 아이콘이 없는 항목은
 * 자리를 비워 두지 않는다(글자가 왼끝에서 시작한다).
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useCanvasDocument } from '../canvas/canvas-document'
import { usePopoverDismiss } from './use-popover-dismiss'
import { usePopoverSide } from './use-popover-side'

/** 포인터로 고른 뒤 둘째 누름으로 보고 삼키는 시간(ms) — 흔한 OS 의 더블클릭 간격(머리말 «포인터로 고른 뒤 …»). */
export const DOUBLE_CLICK_MS = 500
/** 둘째 누름으로 보는 거리(px) — 첫 누름 자리에서 이만큼 안이면 같은 자리다(손 떨림). */
export const DOUBLE_CLICK_SLOP = 8

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
  /** 마우스가 머물 때의 설명 — 끈 항목이 왜 꺼졌는지(트리 줄의 `…`). */
  title?: string
  /** 항목의 설명이 되는 요소의 id(`aria-describedby`) — 트리 아래 상태줄. */
  describedBy?: string
  /** 글자 앞의 아이콘 — lucide 컴포넌트(머리말 «항목의 아이콘»). */
  icon?: LucideIcon
}

export function ActionMenu(props: {
  /** 단추의 접근 이름. 글자는 `…` 하나라 이름이 따로 있어야 한다. */
  label: string
  items: readonly ActionMenuItem[]
  /** 목록 위 머리(로그인한 사람의 이름). 없으면 안 그린다. */
  heading?: string
  /** 단추의 글자. 기본은 `…`(트리 줄의 `+` 가 바꾼다). */
  glyph?: string
  /**
   * 열 때 부른다 — 항목을 그리기 전에. 트리 줄의 `+` · `…` 가 여기서 그 줄을 고른다(`panels/tree-row-actions.tsx` — 명령은 **고른 줄**에
   * 대해 돌므로, 항목의 켜고 끔도 고른 뒤의 판정으로 그려져야 한다).
   */
  onOpen?: () => void
  /** 조밀한 단추 — 트리 줄 곁에 선다(줄 높이를 안 늘린다). */
  compact?: boolean
}): ReactElement {
  const [open, setOpen] = useState(false)
  /** 열 때 포커스를 줄 항목 — `'first'` · `'last'`. 목록이 그려진 뒤 이펙트가 옮긴다. */
  const [entry, setEntry] = useState<'first' | 'last'>('first')
  const toggleRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const canvasDocument = useCanvasDocument()

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
    props.onOpen?.()
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

  /**
   * 포인터로 골랐으면 뒤따를 둘째 누름을 삼킨다(머리말 «포인터로 고른 뒤 …»). `detail` 0 은 키보드(`click()`)다.
   */
  function guardFollowingClick(event: MouseEvent): void {
    if (event.detail < 1) return
    swallowFollowingClick(canvasDocument === null ? [window] : [window, canvasDocument], { x: event.clientX, y: event.clientY })
  }

  /** 항목을 골랐다 — 먼저 닫고 돌려준 뒤 부른다(머리말 «고르면 먼저 닫고 …»). */
  function choose(item: ActionMenuItem, event: MouseEvent): void {
    guardFollowingClick(event)
    close()
    item.onSelect?.()
  }

  return (
    <div className="wb-shell-action-menu" ref={rootRef}>
      <button
        type="button"
        ref={toggleRef}
        className={props.compact === true ? 'wb-shell-action-menu-toggle wb-shell-action-menu-compact' : 'wb-shell-action-menu-toggle'}
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
                    onClick={(event) => {
                      guardFollowingClick(event)
                      close()
                    }}
                  >
                    <ItemLabel item={item} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={item.danger === true ? 'wb-shell-action-menu-item wb-shell-action-menu-danger' : 'wb-shell-action-menu-item'}
                    aria-disabled={item.disabled === true ? true : undefined}
                    title={item.title}
                    aria-describedby={item.describedBy}
                    onClick={(event) => {
                      if (item.disabled === true) return
                      choose(item, event)
                    }}
                  >
                    <ItemLabel item={item} />
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

/** 항목의 글자 — 아이콘이 있으면 그 앞에 선다(머리말 «항목의 아이콘»). */
function ItemLabel(props: { item: ActionMenuItem }): ReactElement {
  const Icon = props.item.icon
  if (Icon === undefined) return <>{props.item.label}</>
  return (
    <>
      <Icon className="wb-shell-action-menu-icon" size={14} strokeWidth={2} aria-hidden="true" />
      {props.item.label}
    </>
  )
}

/**
 * `targets` 에서 다음 `DOUBLE_CLICK_MS` 안에 `at`(호스트 창 좌표)에서 `DOUBLE_CLICK_SLOP` 안에 오는 `click` 하나를 붙잡는 단계에서 막는다
 * — 하나를 막으면 모두에서 걷는다. 시간이 지나면 걷는다(다음 진짜 클릭은 산다). 다른 자리의 클릭은 막지도 걷지도 않는다.
 */
function swallowFollowingClick(targets: readonly EventTarget[], at: { x: number; y: number }): void {
  const swallow = (raw: Event): void => {
    const event = raw as globalThis.MouseEvent
    // 캔버스 iframe 문서의 좌표는 iframe 안의 것이다 — 그 상자만큼 옮겨 호스트 좌표로 견준다.
    const frame = event.view?.frameElement?.getBoundingClientRect()
    const x = event.clientX + (frame?.left ?? 0)
    const y = event.clientY + (frame?.top ?? 0)
    if (Math.hypot(x - at.x, y - at.y) > DOUBLE_CLICK_SLOP) return
    event.preventDefault()
    event.stopPropagation()
    release()
  }
  const release = (): void => {
    clearTimeout(timer)
    for (const target of targets) target.removeEventListener('click', swallow, true)
  }
  for (const target of targets) target.addEventListener('click', swallow, true)
  const timer = setTimeout(release, DOUBLE_CLICK_MS)
}

/** 목록 안의 켠 항목 — 화살표가 설 자리. 차례는 DOM 차례다. */
function enabledItems(box: HTMLElement | null): HTMLElement[] {
  if (box === null) return []
  return [...box.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
    (item) => item.getAttribute('aria-disabled') !== 'true',
  )
}
