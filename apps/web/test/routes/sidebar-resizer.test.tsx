/**
 * **셸이 손잡이 둘을 실제로 배선했는가.** 손잡이 자체의 몸짓은
 * `test/shell/shell-resizer.test.tsx`, 값과 한계는 `test/shell/sidebar-layout.test.ts`가
 * 본다. 여기가 재는 것은 그 둘을 잇는 자리다 — 셸이 폭을 어디에 싣고, 배분을 언제 싣고
 * **언제 싣지 않는지**.
 *
 * ## 왜 "언제 싣지 않는지"가 케이스인가
 *
 * 뷰 모드에서는 좌측에 상자가 하나뿐이다. 그때도 `flex-grow: 0.5`를 실으면 **flex가 남는
 * 공간의 절반만 나눠 주므로** 좌측의 아래 절반이 빈칸이 된다 — 설계서 「설계서 화면 구조」의
 * *"뷰 모드에서는 접혀 메뉴 트리가 전체를 쓴다"*가 그렇게 깨진다. 브라우저에서 뷰 모드로 가면 그 상자가
 * 사이드바 전체(850.5px)를 갖는 것을 확인했고, 여기서는 **인라인 스타일이 아예 없는 것**으로
 * 그 성질을 잠근다.
 *
 * ## 이 검사가 보지 못하는 것
 *
 * - **치수.** jsdom에 레이아웃이 없어 폭도 세로도 전부 0이다. `width: 264px`이 **실렸는지**는
 *   보지만 그래서 264px로 **그려지는지**는 못 본다(브라우저에서 쟀다).
 * - **`aria-valuemax`의 값.** 창 폭에서 계산되는데 jsdom의 `innerWidth`는 1024 고정이라
 *   실제 화면의 수와 다르다. 그 계산은 `sidebar-layout.test.ts`가 순수 함수로 본다.
 *
 * ## 세로 배분은 치수를 심어야 돈다
 *
 * 치수를 안 심으면 위의 한계가 **배분 손잡이를 통째로 재지 못하게 만든다.** 나눠 쓰는 세로가
 * 0이면 `setRegionHeight`가 아무것도 안 하므로(`0`으로 나눌 수 없다) **화살표와 드래그가
 * 조용히 무동작이 되고 그래도 초록이다** — `Home`·`End`·`Enter`는 픽셀을 거치지 않아 돌므로
 * 구멍이 눈에 띄지도 않는다.
 *
 * `installSideMetrics()`가 그 구멍을 메운다: 브라우저에서 잰 치수를 좌측 상자에 심고
 * `resize`로 훅이 다시 재게 한다. **심는 것은 화면의 값이고 배선과 계산은 진짜다** —
 * 포인터가 셸을 지나 `flex-grow`에 닿기까지 이 파일이 끝까지 본다.
 * 같은 치수를 `test/shell/sidebar-metrics.test.tsx`가 훅 쪽에서 쓴다.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  REGION_MIN_HEIGHT,
  SIDE_WIDTH_DEFAULT,
  STORAGE_KEY,
  sideWidthMax,
  useSidebarLayout,
} from '../../src/shell/sidebar-layout'
import { installPointerEvents } from '../pointer-events'
import { PROJECT_NAME, openPage, pageDoc } from '../editor-harness'

installPointerEvents()

const DOC = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-list', type: 'List', props: {} }] })

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

function toEdit(): void {
  fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
}

/** 좌측 상자. `aria-label`로 찾는 것은 셸이 붙인 이름이 그것이기 때문이다. */
function sidebar(): HTMLElement {
  return screen.getByRole('navigation', { name: '메뉴와 구조' })
}

function menuRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function regionHandle(): HTMLElement {
  return screen.getByRole('separator', { name: '좌측 두 영역의 세로 배분' })
}

/**
 * 1440×900 크롬에서 잰 좌측의 치수. `shell.css`도 레이아웃도 없는 자리라
 * **`shell/sidebar-metrics.test.tsx`와 같은 수**를 심는다.
 */
const SIDE_HEIGHT = 850.5
const RESIZER_HEIGHT = 6
const ROW_GAP = 1
const REGION_PADDING = 10
/** `850.5 − 6 − 1×2`. */
const SHARED = 842.5
/** `10 × 2`. */
const INSET = 20

function stubHeight(el: HTMLElement, height: number): void {
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
}

/**
 * 잰 치수를 좌측 상자에 심고 훅이 다시 재게 한다. `resize`인 것은 훅이 그 리스너에서
 * `measure()`를 다시 돌리기 때문이다 — 치수를 심기만 하면 이미 잰 값이 그대로 남는다.
 */
function installSideMetrics(): void {
  const side = sidebar()
  stubHeight(side, SIDE_HEIGHT)
  side.style.rowGap = `${ROW_GAP}px`
  for (const region of [menuRegion(), structureRegion()]) {
    region.style.paddingTop = `${REGION_PADDING}px`
    region.style.paddingBottom = `${REGION_PADDING}px`
  }
  stubHeight(regionHandle(), RESIZER_HEIGHT)
  fireEvent(window, new Event('resize'))
}

/** flex가 그리는 상자의 세로. 화면에서 이 수가 보인다. */
function drawnHeight(region: HTMLElement): number {
  return INSET + Number(region.style.flexGrow) * (SHARED - INSET * 2)
}

function menuHeight(): number {
  return drawnHeight(menuRegion())
}

/** 두 상자가 그려지는 세로의 합. **나눠 쓰는 세로 그대로여야 한다.** */
function drawnTotal(): number {
  return menuHeight() + drawnHeight(structureRegion())
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('셸이 손잡이를 낸다', () => {
  it('편집 모드에는 둘이다 — 폭 하나, 두 영역 사이 하나', async () => {
    await openPage(DOC)
    expect(screen.getByRole('separator', { name: '사이드바 폭' })).toBeTruthy()
    expect(screen.getByRole('separator', { name: '좌측 두 영역의 세로 배분' })).toBeTruthy()
  })

  it('뷰 모드에는 폭 하나뿐이다 — 나눌 상자가 하나면 나눌 것이 없다', async () => {
    await openPage(DOC)
    toView()
    await waitFor(() => expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull())
    expect(screen.getByRole('separator', { name: '사이드바 폭' })).toBeTruthy()
    expect(screen.queryByRole('separator', { name: '좌측 두 영역의 세로 배분' })).toBeNull()
  })
})

describe('폭을 어디에 싣는가', () => {
  it('사이드바의 인라인 `width`다 — 격자 트랙이 그것을 받는다', async () => {
    await openPage(DOC)
    expect(sidebar().style.width).toBe(`${SIDE_WIDTH_DEFAULT}px`)
  })

  it('저장된 폭으로 열린다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sideWidth: 320 }))
    await openPage(DOC)
    expect(sidebar().style.width).toBe('320px')
  })

  it('창보다 큰 값은 지금 창에 맞춰 줄어든다 — 저장된 값은 그대로 둔다', async () => {
    // jsdom의 창은 1024다. 저장된 1200은 그 창에서 그릴 수 없으므로 최대까지만 그린다.
    // **저장소를 되쓰지 않는 것이 요점이다** — 되쓰면 좁은 화면에서 한 번 연 것만으로
    // 넓은 화면의 폭이 영구히 깎인다(브라우저에서 1440→900→1440으로 왕복해 확인했다).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sideWidth: 1200 }))
    await openPage(DOC)
    expect(sidebar().style.width).toBe(`${sideWidthMax(window.innerWidth)}px`)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ sideWidth: 1200 })
  })

  it('저장된 값이 깨져 있어도 화면은 뜨고 기본값을 쓴다', async () => {
    localStorage.setItem(STORAGE_KEY, '{ 이건 JSON 이 아니다')
    await openPage(DOC)
    expect(await screen.findByRole('heading', { name: PROJECT_NAME })).toBeTruthy()
    expect(sidebar().style.width).toBe(`${SIDE_WIDTH_DEFAULT}px`)
  })
})

describe('배분을 언제 싣는가', () => {
  it('편집 모드에서는 두 상자에 `flex-grow`가 실린다', async () => {
    await openPage(DOC)
    const menu = menuRegion()
    const structure = structureRegion()
    expect(menu.style.flexGrow).not.toBe('')
    expect(structure.style.flexGrow).not.toBe('')
    // 기본은 반반이다. jsdom에는 레이아웃이 없어 여백 보정이 0이므로 비율이 그대로 온다.
    expect(Number(menu.style.flexGrow) + Number(structure.style.flexGrow)).toBeCloseTo(1, 10)
  })

  it('뷰 모드에서는 아예 싣지 않는다 — 남은 상자가 좌측 전체를 쓴다', async () => {
    // **이 케이스가 이 파일의 핵심이다.** `flex-grow: 0.5`를 그대로 두면 좌측의 절반이
    // 빈칸이 된다(flex는 grow 합이 1보다 작으면 그만큼만 나눠 준다).
    await openPage(DOC)
    toView()
    await waitFor(() => expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull())
    expect(menuRegion().style.flexGrow).toBe('')
  })

  it('편집으로 돌아오면 다시 실린다', async () => {
    await openPage(DOC)
    toView()
    await waitFor(() => expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull())
    toEdit()
    await screen.findByRole('region', { name: '구조 트리' })
    expect(menuRegion().style.flexGrow).not.toBe('')
  })
})

describe('사람이 정한 값이 남는다', () => {
  it('화살표 한 번이 화면과 저장소에 함께 간다', async () => {
    await openPage(DOC)
    fireEvent.keyDown(screen.getByRole('separator', { name: '사이드바 폭' }), { key: 'ArrowRight' })

    await waitFor(() => expect(sidebar().style.width).toBe(`${SIDE_WIDTH_DEFAULT + 16}px`))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      sideWidth: SIDE_WIDTH_DEFAULT + 16,
    })
  })

  it('창 밖까지 끌어도 저장되는 것은 화면에 보인 값이다', async () => {
    // **싣는 자리의 클램프가 없으면** 저장값이 포인터가 간 곳을 그대로 받는다 — 브라우저
    // 실측에서 1440 창의 오른쪽 끝까지 끌었을 때 2196px가 저장됐다. 그 값은 더 넓은
    // 화면에서 열렸을 때 **아무도 정한 적 없는 폭**으로 펼쳐진다.
    await openPage(DOC)
    const handle = screen.getByRole('separator', { name: '사이드바 폭' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 265, clientY: 400 })
    fireEvent.pointerMove(window, { clientX: 9000, clientY: 400 })
    fireEvent.pointerUp(window)

    const max = sideWidthMax(window.innerWidth)
    await waitFor(() => expect(sidebar().style.width).toBe(`${max}px`))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ sideWidth: max })
  })

  it('두 번 누르면 기본값으로 돌아온다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sideWidth: 420 }))
    await openPage(DOC)
    fireEvent.doubleClick(screen.getByRole('separator', { name: '사이드바 폭' }))
    await waitFor(() => expect(sidebar().style.width).toBe(`${SIDE_WIDTH_DEFAULT}px`))
  })

  it('아무것도 안 하면 아무것도 저장하지 않는다', async () => {
    // 열기만 한 것을 *"이 폭으로 정했다"*로 바꿔 놓으면 안 된다.
    await openPage(DOC)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('`StrictMode`에서도 저장하지 않는다 — 이펙트가 두 번 돌아도', () => {
    // **위 케이스만으로는 부족하다.** 이 스위트의 `render`는 `StrictMode`를 씌우지 않으므로,
    // 보존 가드를 *"첫 렌더면 건너뛴다"*로 바꿔도 위 케이스가 통과한다(`StrictMode`를 씌운
    // 이 케이스가 없으면 이 파일이 전부 초록이다). 그런데 앱(`src/main.tsx`)은 `StrictMode`이고, 개발에서 이펙트가 두 번
    // 돌면 두 번째가 가드를 지나 **아무도 아무것도 안 했는데 `{}`가 저장된다**(브라우저에서
    // 잰 고장 방식). 그래서 여기서만 `StrictMode`를 씌운다.
    render(
      <StrictMode>
        <LayoutProbe />
      </StrictMode>,
    )
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('배분 손잡이가 화면을 움직인다', () => {
  it('드래그가 민 만큼 경계가 간다 — 여백 보정이 배선 끝까지 이어져 있다', async () => {
    // **이 케이스가 배분의 여백 보정을 끝에서 끝까지 재는 자리다.** 포인터를 200px 밀면
    // 첫 영역이 421.25 → 621.25px다. 보정이 없으면 611.75px에서 멈춘다(브라우저 실측
    // 190.4px의 이 치수 판).
    await openPage(DOC)
    installSideMetrics()
    expect(menuHeight()).toBeCloseTo(SHARED / 2, 6)

    const handle = regionHandle()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 400 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 600 })
    fireEvent.pointerUp(window)

    await waitFor(() => expect(menuHeight()).toBeCloseTo(SHARED / 2 + 200, 6))
    // **둘째 상자도 보정된 값을 받아야 한다.** `1 - regionRatio`를 실으면 합이 843.26이
    // 되어 좌측이 그만큼 넘친다 — 첫 상자만 보고는 안 보이는 고장이다.
    expect(drawnTotal()).toBeCloseTo(SHARED, 6)
  })

  it('화살표 한 칸이 16px이다 — 화면과 저장소에 함께 간다', async () => {
    await openPage(DOC)
    installSideMetrics()
    const handle = regionHandle()
    expect(handle.getAttribute('aria-valuenow')).toBe('50')

    fireEvent.keyDown(handle, { key: 'ArrowDown' })

    // 421.25 + 16 = 437.25px. 842.5로 나누면 51.9%다.
    await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe('52'))
    expect(menuHeight()).toBeCloseTo(437.25, 6)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      regionRatio: 437.25 / SHARED,
    })

    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe('50'))
    expect(menuHeight()).toBeCloseTo(SHARED / 2, 6)
  })

  it('`Home`이 하한이고 거기서 상자가 정확히 최소 세로다', async () => {
    // **한계가 픽셀에서 나온다는 것이 여기서 화면으로 보인다.** 72 ÷ 842.5 = 8.5%이고,
    // 여백 보정이 없으면 이 자리의 상자가 92px(20 + 72)가 된다.
    await openPage(DOC)
    installSideMetrics()
    const handle = regionHandle()
    expect(handle.getAttribute('aria-valuemin')).toBe('9')
    expect(handle.getAttribute('aria-valuemax')).toBe('91')

    fireEvent.keyDown(handle, { key: 'Home' })

    await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe('9'))
    expect(menuHeight()).toBeCloseTo(REGION_MIN_HEIGHT, 6)
  })
})

/** 훅만 세우는 최소 화면. 셸 전체를 `StrictMode`로 씌우면 재려는 것 말고도 두 번 돈다. */
function LayoutProbe(): ReactElement {
  const layout = useSidebarLayout()
  return <span>{layout.sideWidth}</span>
}
