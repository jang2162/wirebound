/**
 * **훅이 화면에서 재는 것** — `useSidebarLayout`의 `measure()`와 그것이 만드는 배분.
 *
 * `sidebar-layout.test.ts`는 **순수 함수**를 본다: 치수를 인자로 주고 식이 무엇을 내는지
 * 잰다. 그 파일이 못 보는 것이 **치수 자체가 어디서 오는가**이고, 이 부류의 대표 고장이
 * 정확히 거기 있다 — `regionGrow`의 식은 맞는데 `measure()`가 여백을 0으로 넘기면
 * 손잡이가 포인터를 놓친다(브라우저 실측: 포인터 200px에 경계 190px대).
 *
 * ## 어떻게 재는가 — jsdom에 없는 것만 주입한다
 *
 * jsdom에는 레이아웃이 없어 `getBoundingClientRect()`가 전부 0이고 `shell.css`도 붙지
 * 않는다. 그래서 **브라우저에서 잰 값을 DOM에 실어 준다**: 상자의 세로는
 * `getBoundingClientRect`를 갈아 끼워 주고, 여백과 칸 사이 여백은 인라인 스타일로 준다
 * (jsdom의 computed style은 인라인으로 준 것을 그대로 돌려준다 —
 * `sidebar-layout.test.ts`의 `regionInset` 케이스가 같은 성질을 쓴다).
 *
 * **주입하는 것은 화면의 값이고 계산은 진짜다.** `measure()`도 `regionGrow`도 훅이 쓰는
 * 그대로 돈다. 그러므로 여기 통과하는 것은 *"이 치수의 화면에서 이 배분이 나온다"*이고,
 * *"브라우저가 그 치수를 낸다"*는 여전히 브라우저에서 잰 것이다(그 값이 `SCREEN`이다).
 *
 * **`rendered()`가 이 파일의 자다.** flex가 상자를 그리는 식(`inset + grow × 나눌 공간`)을
 * 테스트 쪽에 한 벌 세워 두고, 사람이 정한 높이가 그 식을 지나 **같은 수로 돌아오는지**
 * 본다. 그 왕복이 깨지는 것이 곧 손잡이가 포인터를 놓치는 것이다.
 */
import { act, render } from '@testing-library/react'
import type { ReactElement, RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSidebarLayout, type SidebarLayout } from '../../src/shell/sidebar-layout'

/** 화면에서 오는 치수. 전부 브라우저에서 잰 값이고 여기서는 DOM에 실어 준다. */
interface Screen {
  /** 좌측 상자의 세로. `getBoundingClientRect().height`로 온다. */
  sideHeight: number
  /** 같은 상자의 `clientHeight`. 브라우저가 정수로 반올림하는 쪽이다. */
  clientHeight?: number
  /** 두 영역 사이 손잡이의 세로. `null`이면 손잡이가 없다(뷰 모드). */
  resizerHeight: number | null
  /** 칸 사이 여백(`row-gap`). 상자 셋 사이에 둘이 든다. */
  rowGap: number
  /** 영역 하나의 위아래 여백 **한쪽**(px). 배분 밖에 남는 몫은 그 두 배다. */
  padding: number
  /** 감싸는 상자 자신의 여백. 여백을 **어느 상자에서** 읽는지 가르는 케이스만 준다. */
  sidePadding?: number
}

/**
 * 1440×900 크롬에서 잰 화면. `sidebar-layout.test.ts`의 `MEASURED`와 같은
 * 자리에서 왔고, 그 파일이 인자로 주는 것을 여기서는 **DOM에 실어** 훅이 직접 재게 한다.
 */
const SCREEN: Screen = { sideHeight: 850.5, resizerHeight: 6, rowGap: 1, padding: 10 }

/** 위 화면에서 `measure()`가 내야 하는 값. `850.5 − 6 − 1×2 = 842.5` · `10×2 = 20`. */
const SHARED = 842.5
const INSET = 20

/**
 * flex가 그리는 상자의 세로 — `regionGrow`가 되돌리려는 바로 그 식이다.
 * `sidebar-layout.test.ts`의 같은 이름 helper와 짝이고, 저쪽은 치수를 상수로 알고
 * 이쪽은 **훅이 잰 치수로** 같은 왕복을 본다.
 */
function rendered(grow: number, inset: number = INSET): number {
  return inset + grow * (SHARED - inset * 2)
}

interface Holder {
  current: SidebarLayout | null
}

function layoutOf(holder: Holder): SidebarLayout {
  if (holder.current === null) throw new Error('훅이 아직 돌지 않았다')
  return holder.current
}

/**
 * 잰 세로를 그 요소의 사실로 만든다. **`getBoundingClientRect`를 갈아 끼우는 것**은
 * jsdom이 0만 내주기 때문이고, `clientHeight`를 따로 심는 것은 그 둘이 갈리는 케이스가
 * 있기 때문이다(브라우저에서 851 vs 850.5).
 */
function attach<T extends HTMLElement>(
  target: RefObject<T | null>,
  height: number,
  clientHeight?: number,
): (el: T | null) => void {
  return (el) => {
    if (el !== null) {
      const rect = {
        x: 0,
        y: 0,
        width: 0,
        height,
        top: 0,
        right: 0,
        bottom: height,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect
      el.getBoundingClientRect = () => rect
      if (clientHeight !== undefined) {
        Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
      }
    }
    target.current = el
  }
}

/**
 * 좌측 상자의 모양만 세운다 — 영역 둘과 그 사이 손잡이. `routes/editor.tsx`가 내는
 * 자리 관계(**손잡이 앞의 형제가 첫 영역**)가 같아야 `measure()`가 같은 것을 읽는다.
 */
function Probe(props: { screen: Screen; out: Holder }): ReactElement {
  const layout = useSidebarLayout()
  props.out.current = layout
  const { screen } = props
  const pad = { paddingTop: `${screen.padding}px`, paddingBottom: `${screen.padding}px` }
  return (
    <nav
      ref={attach(layout.sideRef, screen.sideHeight, screen.clientHeight)}
      style={{
        rowGap: `${screen.rowGap}px`,
        ...(screen.sidePadding === undefined
          ? {}
          : { paddingTop: `${screen.sidePadding}px`, paddingBottom: `${screen.sidePadding}px` }),
      }}
    >
      <section style={pad} />
      {screen.resizerHeight !== null && (
        <div ref={attach(layout.regionResizerRef, screen.resizerHeight)} />
      )}
      <section style={pad} />
    </nav>
  )
}

/** 보존이 케이스 사이로 새지 않게 한다 — 훅이 첫 렌더에 `localStorage`를 읽는다. */
beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

/** `sideRef`가 아무 데도 안 붙은 자리 — 화면이 뜨기 전과 `display: none`이 그렇다. */
function BareProbe(props: { out: Holder }): ReactElement {
  const layout = useSidebarLayout()
  props.out.current = layout
  return <span />
}

function open(screen: Screen): Holder {
  const holder: Holder = { current: null }
  render(<Probe screen={screen} out={holder} />)
  return holder
}

describe('여백 보정 — 사람이 정한 높이가 그대로 그려진다', () => {
  it('**이 파일의 핵심이다.** 정한 높이가 flex를 지나 같은 수로 돌아온다', () => {
    // 보정이 없으면(`measure()`가 `inset: 0`을 내면) 이 왕복이 깨진다 — 300px을 정했는데
    // 화면은 305.76px을 그린다.
    const holder = open(SCREEN)
    for (const height of [100, 300, 421.25, 600, 750]) {
      act(() => layoutOf(holder).setRegionHeight(height))
      expect(rendered(layoutOf(holder).regionGrow)).toBeCloseTo(height, 6)
    }
  })

  it('포인터를 200px 밀면 경계도 200.0px 간다', () => {
    // 보정이 없으면 브라우저 실측이 190.4px이고, 이 치수에서 보정을 빼면 190.5px가
    // 나온다.
    const holder = open(SCREEN)
    const before = rendered(layoutOf(holder).regionGrow)
    const from = layoutOf(holder).grabRegionHeight()
    act(() => layoutOf(holder).setRegionHeight(from + 200))
    expect(rendered(layoutOf(holder).regionGrow) - before).toBeCloseTo(200, 6)
  })

  it('여백이 바뀌면 보정이 따라온다 — 상수로 적지 않은 근거다', () => {
    // `shell.css`의 `.wb-shell-region`이 여백을 고치면 환산이 저절로 맞는다. 상수로 두면
    // 여백이 바뀌는 순간 손잡이가 조용히 어긋난다.
    const holder = open({ ...SCREEN, padding: 16 })
    act(() => layoutOf(holder).setRegionHeight(300))
    expect(rendered(layoutOf(holder).regionGrow, 32)).toBeCloseTo(300, 6)
  })

  it('여백은 **첫 영역**의 것이다 — 감싸는 상자의 것이 아니다', () => {
    // `measure()`가 여백을 이름이 아니라 자리로 집는다(손잡이 앞의 형제 = 첫 영역).
    // 감싸는 상자를 읽으면 여기서 40px을 되돌려 300px이 나오지 않는다.
    const holder = open({ ...SCREEN, sidePadding: 20 })
    act(() => layoutOf(holder).setRegionHeight(300))
    expect(rendered(layoutOf(holder).regionGrow)).toBeCloseTo(300, 6)
  })
})

describe('나눠 쓰는 세로를 무엇에서 빼는가', () => {
  it('손잡이의 세로를 뺀다 — 그것은 배분의 대상이 아니라 배분 **전에** 떼는 몫이다', () => {
    // 850.5 − 40 − 2 = 808.5.
    const holder = open({ ...SCREEN, resizerHeight: 40 })
    expect(layoutOf(holder).grabRegionHeight()).toBeCloseTo(808.5 / 2, 6)
  })

  it('칸 사이 여백을 **둘** 뺀다 — 상자 셋 사이에 둘이 든다', () => {
    // 850.5 − 6 − 10×2 = 824.5. 하나만 빼면 834.5다.
    const holder = open({ ...SCREEN, rowGap: 10 })
    expect(layoutOf(holder).grabRegionHeight()).toBeCloseTo(824.5 / 2, 6)
  })

  it('손잡이가 없으면 상자 전체다 — 뷰 모드에서는 뺄 것이 없다', () => {
    const holder = open({ ...SCREEN, resizerHeight: null })
    expect(layoutOf(holder).grabRegionHeight()).toBeCloseTo(850.5 / 2, 6)
  })

  it('세로를 `getBoundingClientRect()`로 잰다 — `clientHeight`는 반올림된다', () => {
    // 실측: 같은 상자가 `clientHeight` 851 · `getBoundingClientRect().height` 850.5다.
    // `clientHeight`로 재면 나눠 쓰는 세로가 843이 되고 여기가 421.5로 나온다.
    const holder = open({ ...SCREEN, clientHeight: 851 })
    expect(layoutOf(holder).grabRegionHeight()).toBeCloseTo(SHARED / 2, 6)
  })

  it('잴 상자가 아예 없으면 0이다 — 화면이 뜨기 전에도 값이 성립한다', () => {
    // 여기서 0이 아닌 것을 내면 그 수가 첫 드래그의 출발점이 된다.
    const holder: Holder = { current: null }
    render(<BareProbe out={holder} />)
    expect(layoutOf(holder).grabRegionHeight()).toBe(0)
  })

  it('상자가 손잡이보다 낮으면 0이다 — 음수를 내지 않는다', () => {
    // 850.5가 아니라 4px인 자리(머리가 화면을 다 먹은 순간). 음수를 그대로 내면
    // `grabRegionHeight()`가 음수가 되고 드래그가 그 자리에서 출발한다.
    const holder = open({ ...SCREEN, sideHeight: 4 })
    expect(layoutOf(holder).grabRegionHeight()).toBe(0)
  })
})
