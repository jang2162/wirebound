/**
 * **셸 머리의 팝오버가 닫히는 방식**(`src/shell/use-popover-dismiss.ts`).
 *
 * 이 파일만 `<App />`을 안 쓰고 **최소 숙주**를 세운다. 재는 것이 화면 하나의 동작이
 * 아니라 **두 팝오버가 공유하는 장치**이기 때문이다 — 내보내기·스냅샷 어느 쪽으로 재도
 * 그 화면의 조회·권한이 함께 딸려 와, 무엇이 이 장치를 지키는 케이스인지 흐려진다.
 * 두 화면에 **붙어 있다**는 것은 각자의 파일이 잰다(`export-panel.test.tsx`·
 * `snapshots-panel.test.tsx`).
 *
 * ## 전역 리스너는 조용히 회귀한다
 *
 * 이 부류의 고장은 화면에 아무것도 안 남긴다 — 안 걸린 리스너도, 안 걷힌 리스너도
 * 렌더 결과가 같다. 그래서 아래 두 케이스가 `document`의 등록/해제를 **수로** 센다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePopoverDismiss } from '../../src/shell/use-popover-dismiss'

/**
 * 두 팝오버와 **같은 모양의** 최소 숙주. 요점은 **토글 버튼이 ref 상자 안에 있다**는
 * 것이다 — 실물 둘(`.wb-shell-export`·`.wb-shell-snapshots`)이 그 배치이고, 토글이
 * 두 번 처리되지 않는 근거가 그 배치 자체다.
 */
function Host(): ReactElement {
  const [open, setOpen] = useState(false)
  const ref = usePopoverDismiss(open, () => setOpen(false))

  return (
    <div>
      <div ref={ref}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          토글
        </button>
        {open && <button type="button">안쪽</button>}
      </div>
      <button type="button">바깥</button>
    </div>
  )
}

/** 열린 상태까지 간다. 여기까지가 아래 케이스들의 공통 전제다. */
function openHost(): void {
  render(<Host />)
  fireEvent.click(screen.getByRole('button', { name: '토글' }))
  expect(isOpen()).toBe(true)
}

function isOpen(): boolean {
  return screen.getByRole('button', { name: '토글' }).getAttribute('aria-expanded') === 'true'
}

describe('팝오버 닫기', () => {
  it('바깥을 누르면 닫힌다', () => {
    openHost()

    fireEvent.mouseDown(screen.getByRole('button', { name: '바깥' }))

    expect(isOpen()).toBe(false)
  })

  it('안쪽을 누르면 안 닫힌다', () => {
    openHost()

    fireEvent.mouseDown(screen.getByRole('button', { name: '안쪽' }))

    expect(isOpen()).toBe(true)
  })

  /**
   * **`click`이 아니라 `mousedown`인 근거를 재는 케이스다.**
   *
   * 안쪽에서 누른 채 밖으로 끌고 나가 떼면(목록에서 글자를 긁는 흔한 동작) 브라우저는
   * 두 요소의 **공통 조상**에서 `click`을 내고, 그 이벤트의 `target`은 팝오버 **밖**이다.
   * `click`으로 판정하는 구현은 그때 닫는다 — 사용자는 팝오버 안의 글자를 긁었을 뿐인데
   * 화면이 사라진다. `mousedown`은 **누른 자리**로 판정하므로 그 일이 없다.
   *
   * 반대편 손해(밖에서 눌러 안으로 끌고 와 떼면 닫힌다)는 받아들인다 — 그쪽은 사용자가
   * 이미 *"밖을 눌렀다"*이다.
   */
  it('안쪽에서 눌러 바깥에서 떼면 안 닫힌다 — 판정은 누른 자리다', () => {
    openHost()

    fireEvent.mouseDown(screen.getByRole('button', { name: '안쪽' }))
    fireEvent.click(screen.getByRole('button', { name: '바깥' }))

    expect(isOpen()).toBe(true)
  })

  /**
   * **토글은 두 번 처리되지 않는다.** 토글이 ref 상자 **안**이라 바깥 클릭 판정에 걸리지
   * 않고, 닫는 일은 토글 자신의 `onClick` 하나가 한다.
   *
   * 구분력: 토글을 상자 밖에 두면(또는 판정을 *"본문 안인가"*로 좁히면) `mousedown`이
   * 먼저 닫고 이어진 `click`이 다시 열어 **열린 채로 끝난다.**
   */
  it('토글을 누르면 닫힌다 — 바깥 클릭과 토글이 함께 처리되지 않는다', () => {
    openHost()

    const toggle = screen.getByRole('button', { name: '토글' })
    fireEvent.mouseDown(toggle)
    fireEvent.click(toggle)

    expect(isOpen()).toBe(false)
  })

  it('Escape로 닫힌다', () => {
    openHost()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(isOpen()).toBe(false)
  })

  it('다른 키로는 안 닫힌다 — 음성 대조', () => {
    openHost()

    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'a' })

    expect(isOpen()).toBe(true)
  })

  /**
   * **열려 있지 않으면 리스너를 걸지 않는다.** 셸 머리에 팝오버가 둘이므로, 닫힌 채로도
   * 거는 구현은 설계서를 여는 것만으로 `mousedown` 리스너를 둘 얹는다.
   */
  it('닫혀 있는 동안에는 리스너를 걸지 않는다', () => {
    const add = vi.spyOn(document, 'addEventListener')
    render(<Host />)

    expect(kinds(add)).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: '토글' }))
    expect(kinds(add)).toEqual(['mousedown', 'keydown'])

    add.mockRestore()
    cleanup()
  })

  /**
   * **언마운트 뒤에 리스너가 남지 않는다.** 남으면 사라진 화면의 `setState`를 부르고,
   * 팝오버를 여닫을 때마다 하나씩 쌓인다 — 화면에는 아무것도 안 보이는 고장이다.
   */
  it('열린 채로 사라져도 리스너가 남지 않는다', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')

    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: '토글' }))
    expect(kinds(add)).toEqual(['mousedown', 'keydown'])

    cleanup()

    // **건 것과 걷은 것이 같다.** 수만 세면 `mousedown`을 두 번 걷는 구현도 통과하므로
    // 종류까지 함께 본다.
    expect(kinds(remove)).toEqual(kinds(add))

    add.mockRestore()
    remove.mockRestore()
  })
})

/**
 * 스파이가 본 이벤트 이름들. 이 파일이 거는 둘만 남긴다 — jsdom·RTL이 거는 것이 섞인다.
 *
 * 인자를 `vi.spyOn`의 반환 타입으로 적지 않는 것은 `addEventListener`가 `Document`가 아니라
 * `EventTarget`에서 오는 메서드라 그 제네릭의 키 제약을 통과하지 못하기 때문이다(실측:
 * `TS2344`). 재는 것이 `calls`뿐이므로 그 모양만 요구한다.
 */
function kinds(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((call) => String(call[0]))
    .filter((name) => name === 'mousedown' || name === 'keydown')
}
