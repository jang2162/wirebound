/**
 * 사이드바 폭·배분의 **값과 한계와 보존**. 판단의 근거는 `src/shell/sidebar-layout.ts`
 * 머리말에 있고, 여기는 그 판단이 코드에서 참인지 본다.
 *
 * ## 무엇을 재고 무엇을 못 재는가
 *
 * **jsdom에는 레이아웃이 없다.** 이 파일이 다루는 함수들은 그래서 전부 순수 함수이고,
 * 화면의 치수는 **인자로 준다**. 브라우저에서 잰 값(1440×900, Chrome)을 그
 * 인자로 쓰므로, 여기 통과하는 것은 *"그 치수에서 이 식이 이 답을 낸다"*이지
 * *"화면이 그렇게 그려진다"*가 아니다. **화면 쪽은 브라우저에서 재야 한다** —
 * `shell-css-picker.test.ts` 머리말이 같은 경계를 적고 있다.
 *
 * 실측으로 얻은 치수 셋이 이 파일의 상수다(`MEASURED`). 그 수가 어디서 왔는지는 각 상수의
 * 주석에 있다.
 */
import { describe, expect, it, vi } from 'vitest'
import shellCss from '../../src/shell.css?raw'
import {
  CANVAS_MIN_WIDTH,
  HANDLES_WIDTH,
  CANVAS_MIN_HEIGHT,
  PALETTE_HEIGHT_DEFAULT,
  PALETTE_HEIGHT_MIN,
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MIN,
  REGION_MIN_HEIGHT,
  REGION_RATIO_DEFAULT,
  SIDE_WIDTH_DEFAULT,
  SIDE_WIDTH_MIN,
  STORAGE_KEY,
  browserStorage,
  clampPanelWidth,
  clampRegionRatio,
  clampSideWidth,
  fitPaletteHeight,
  fitWidths,
  paletteHeightMax,
  panelWidthMax,
  readLayout,
  regionGrow,
  regionInset,
  regionRatioMin,
  sideWidthMax,
  writeLayout,
} from '../../src/shell/sidebar-layout'

/**
 * 1440×900 크롬에서 잰 값. **이 수들이 이 파일의 "화면"이다.**
 *
 * - `shared` — 두 영역이 나눠 쓰는 세로. 사이드바 850.5px에서 손잡이 6px과 칸 사이
 *   여백 2px(1px × 2)을 뺀 값이다.
 * - `inset` — 영역 하나가 배분 밖에서 갖는 세로. `.wb-shell-region`의 위아래 여백
 *   10px씩이다. 두 점(`flex-grow` 0.0854/0.9146 → 88.54/753.96px)에서 풀어 확인했다.
 * - `shellWidth` — 창 폭.
 */
const MEASURED = { shared: 842.5, inset: 20, shellWidth: 1440 }

describe('사이드바 폭의 한계', () => {
  it('최대는 창에서 손잡이 둘 · 여백 넷 · 캔버스 몫과 **우측의 지금 폭**을 뺀 것이다', () => {
    // 1440 − 16 − 320 − 300 = 804. 브라우저에서 이 폭까지 끌었을 때 캔버스가 320px 이상이고 셸의 가로 넘침이 0이다
    // (`build-test/editor-shell-layout.test.ts`).
    expect(sideWidthMax(MEASURED.shellWidth, PANEL_WIDTH_DEFAULT)).toBe(804)
    // 우측을 넓히면 좌측의 최대가 그만큼 준다 — 옛 «우측 300 고정» 가정이면 804 그대로라 캔버스가 120px 준다.
    expect(sideWidthMax(MEASURED.shellWidth, 420)).toBe(684)
  })

  it('창이 아주 좁으면 최대가 최소로 주저앉는다 — 뒤집히지 않는다', () => {
    // 640 − 16 − 320 − 300 = 4. 그대로 두면 `clamp(min=200, max=4)`이 되어 결과가 튄다.
    expect(sideWidthMax(640, PANEL_WIDTH_DEFAULT)).toBe(SIDE_WIDTH_MIN)
    expect(clampSideWidth(SIDE_WIDTH_DEFAULT, 640, PANEL_WIDTH_DEFAULT)).toBe(SIDE_WIDTH_MIN)
  })

  it('최소·최대 밖의 값은 잘린다', () => {
    // 브라우저에서 손잡이를 창 밖으로 밀었을 때 나온 두 값이다(-201 · 2196).
    expect(clampSideWidth(-201, MEASURED.shellWidth, PANEL_WIDTH_DEFAULT)).toBe(SIDE_WIDTH_MIN)
    expect(clampSideWidth(2196, MEASURED.shellWidth, PANEL_WIDTH_DEFAULT)).toBe(804)
    expect(clampSideWidth(420, MEASURED.shellWidth, PANEL_WIDTH_DEFAULT)).toBe(420)
  })
})

describe('우측 패널 폭의 한계', () => {
  it('최대는 창에서 고정 몫 · 캔버스 몫과 **좌측의 지금 폭**을 뺀 것이다', () => {
    // 1440 − 16 − 320 − 264 = 840.
    expect(panelWidthMax(MEASURED.shellWidth, SIDE_WIDTH_DEFAULT)).toBe(840)
    expect(panelWidthMax(MEASURED.shellWidth, 804)).toBe(PANEL_WIDTH_MIN)
  })

  it('최소 · 최대 밖의 값은 잘린다 — 최소는 기본값과 같은 300', () => {
    expect(PANEL_WIDTH_MIN).toBe(300)
    expect(clampPanelWidth(120, MEASURED.shellWidth, SIDE_WIDTH_DEFAULT)).toBe(PANEL_WIDTH_MIN)
    expect(clampPanelWidth(5000, MEASURED.shellWidth, SIDE_WIDTH_DEFAULT)).toBe(840)
    expect(clampPanelWidth(500, MEASURED.shellWidth, SIDE_WIDTH_DEFAULT)).toBe(500)
  })

  it('둘 다 최대로 밀어도 캔버스 몫이 남는다 — 두 최대가 서로를 본다', () => {
    const side = clampSideWidth(5000, MEASURED.shellWidth, PANEL_WIDTH_DEFAULT)
    const panel = clampPanelWidth(5000, MEASURED.shellWidth, side)
    expect(MEASURED.shellWidth - HANDLES_WIDTH - side - panel).toBe(CANVAS_MIN_WIDTH)
  })
})

/**
 * **창이 줄면 두 폭을 차례로 조인다 — 우측 먼저 최소까지, 그다음 좌측**(`fitWidths` · `src/shell/sidebar-layout.ts` 머리말 «두 폭은 한 예산을
 * 나눠 쓴다»).
 */
describe('창이 줄면 조이는 차례', () => {
  it('들어가면 그대로다', () => {
    expect(fitWidths(264, 300, 1440)).toEqual({ side: 264, panel: 300 })
  })

  it('넘치면 우측을 먼저 줄인다 — 좌측은 그대로', () => {
    // 예산 1024 − 16 − 320 = 688. 좌 300 + 우 500 = 800 → 112 넘침 → 우측 388.
    expect(fitWidths(300, 500, 1024)).toEqual({ side: 300, panel: 388 })
  })

  it('우측이 최소에 닿은 뒤에야 좌측을 줄인다', () => {
    // 예산 688. 좌 600 + 우 500 → 우측 300(최소) · 남은 넘침 212 → 좌측 388.
    expect(fitWidths(600, 500, 1024)).toEqual({ side: 388, panel: 300 })
  })

  it('둘 다 최소여도 넘치면 최소에서 멈춘다 — 격자가 넘친다', () => {
    expect(fitWidths(600, 600, 640)).toEqual({ side: SIDE_WIDTH_MIN, panel: PANEL_WIDTH_MIN })
  })

  it('최소 아래의 저장값은 최소로 읽는다', () => {
    expect(fitWidths(-5, 10, 1440)).toEqual({ side: SIDE_WIDTH_MIN, panel: PANEL_WIDTH_MIN })
  })
})

describe('두 영역의 배분', () => {
  it('하한은 픽셀에서 나온다 — 창이 낮을수록 비율로는 커진다', () => {
    expect(regionRatioMin(MEASURED.shared)).toBeCloseTo(REGION_MIN_HEIGHT / MEASURED.shared, 10)
    // 창이 절반이면 같은 72px이 비율로는 두 배가 된다.
    expect(regionRatioMin(MEASURED.shared / 2)).toBeCloseTo(
      (REGION_MIN_HEIGHT * 2) / MEASURED.shared,
      10,
    )
  })

  it('상자가 최소의 두 배보다 낮으면 하한과 상한이 0.5에서 만난다', () => {
    const short = REGION_MIN_HEIGHT
    expect(regionRatioMin(short)).toBe(0.5)
    // 뒤집히지 않고 반반으로 수렴한다.
    expect(clampRegionRatio(0.1, short)).toBe(0.5)
    expect(clampRegionRatio(0.9, short)).toBe(0.5)
  })

  it('잴 수 없으면(레이아웃이 없으면) 자르지 않는다', () => {
    // jsdom·`display:none`에서 0이 온다. 여기서 0.5로 몰아 버리면 사람이 정한 값이
    // 화면이 뜨기도 전에 지워진다.
    expect(regionRatioMin(0)).toBe(0)
    expect(clampRegionRatio(0.2, 0)).toBe(0.2)
  })

  it('범위 밖은 하한·상한으로 잘린다', () => {
    const min = regionRatioMin(MEASURED.shared)
    expect(clampRegionRatio(-3, MEASURED.shared)).toBeCloseTo(min, 10)
    expect(clampRegionRatio(42, MEASURED.shared)).toBeCloseTo(1 - min, 10)
  })
})

describe('비율 → `flex-grow` 환산', () => {
  /** 화면이 그리는 세로. `regionGrow`가 되돌리려는 바로 그 식이다. */
  const rendered = (grow: number): number => MEASURED.inset + grow * (MEASURED.shared - MEASURED.inset * 2)

  it('여백을 되돌려 상자의 세로가 `비율 × 나눌 공간`이 된다', () => {
    // **이 케이스가 이 파일의 핵심이다.** 비율을 `flex-grow`에 그대로 실으면 여백 20px이
    // 배분 밖에 남아 경계가 포인터보다 4.8% 뒤처진다(브라우저 실측: 200px 밀었을 때
    // 190.4px). 보정이 있으면 같은 드래그가 정확히 200.0px을 움직인다.
    for (const ratio of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(rendered(regionGrow(ratio, MEASURED))).toBeCloseTo(ratio * MEASURED.shared, 6)
    }
  })

  it('두 상자의 세로 합이 나눠 쓰는 세로 그대로다', () => {
    const grow = regionGrow(0.3, MEASURED)
    expect(rendered(grow) + rendered(1 - grow)).toBeCloseTo(MEASURED.shared, 6)
  })

  it('하한에서 상자가 실제로 `REGION_MIN_HEIGHT`가 된다', () => {
    // 여백 보정이 없으면 이 값이 92px이 된다(20 + 72). 화면에서는 88.5px로 보인다(Chrome).
    const min = regionRatioMin(MEASURED.shared)
    expect(rendered(regionGrow(min, MEASURED))).toBeCloseTo(REGION_MIN_HEIGHT, 6)
  })

  it('잴 수 없으면 비율을 그대로 낸다 — `Infinity`를 싣지 않는다', () => {
    // 나눌 공간이 0이면 나눗셈이 `Infinity`가 되고 배분이 통째로 깨진다.
    expect(regionGrow(0.4, { shared: 0, inset: 0 })).toBe(0.4)
    expect(regionGrow(0.4, { shared: 30, inset: 20 })).toBe(0.4)
  })
})

describe('상자가 배분 밖에서 갖는 세로', () => {
  it('여백과 테두리를 더한다', () => {
    const box = document.createElement('div')
    box.style.padding = '10px 12px'
    box.style.borderTop = '2px solid black'
    document.body.append(box)
    // jsdom의 computed style은 인라인으로 준 것을 그대로 돌려준다.
    expect(regionInset(box)).toBe(22)
    box.remove()
  })

  it('상자가 없으면 0이다', () => {
    expect(regionInset(null)).toBe(0)
  })
})

/** 던지는 `localStorage`. 비공개 창·사이트 데이터 차단이 이렇게 군다. */
function hostileStorage(): Storage {
  return {
    getItem: () => {
      throw new DOMException('denied', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError')
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  }
}

describe('보존', () => {
  it('저장된 것이 없으면 빈 값이다 — 기본값은 부르는 쪽이 안다', () => {
    localStorage.clear()
    expect(readLayout(localStorage)).toEqual({})
  })

  it('싣고 읽으면 그대로다 — 우측 폭까지', () => {
    localStorage.clear()
    writeLayout(localStorage, { sideWidth: 420, regionRatio: 0.31, panelWidth: 380 })
    expect(readLayout(localStorage)).toEqual({ sideWidth: 420, regionRatio: 0.31, panelWidth: 380 })
  })

  /** **옛 저장값**(우측 폭이 없던 판의 앱이 남긴 것) — 키가 없으면 우측은 기본값으로 그린다. 좌측 · 배분은 그대로 산다. */
  it('`panelWidth`가 없는 옛 저장값은 우측 기본 300 으로 그린다', () => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sideWidth: 420, regionRatio: 0.31 }))
    const stored = readLayout(localStorage)
    expect(stored).toEqual({ sideWidth: 420, regionRatio: 0.31 })
    expect(fitWidths(stored.sideWidth ?? SIDE_WIDTH_DEFAULT, stored.panelWidth ?? PANEL_WIDTH_DEFAULT, 1440)).toEqual({
      side: 420,
      panel: PANEL_WIDTH_DEFAULT,
    })
  })

  it('깨진 값은 **필드마다** 버린다 — 한쪽 때문에 다른 쪽을 잃지 않는다', () => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sideWidth: '420px', regionRatio: 0.31 }))
    expect(readLayout(localStorage)).toEqual({ regionRatio: 0.31 })
  })

  it('숫자가 아닌 것은 통과하지 못한다', () => {
    localStorage.clear()
    // `NaN`·`Infinity`는 `JSON.stringify`에서 `null`로 나가므로 그 형태로도 재 둔다.
    // **읽는 쪽으로는 `Infinity`가 그대로 들어온다** — 다음 케이스가 그것이다.
    localStorage.setItem(STORAGE_KEY, '{"sideWidth":null,"regionRatio":true}')
    expect(readLayout(localStorage)).toEqual({})
  })

  it('`Infinity`는 통과하지 못한다 — JSON이 실제로 내는 값이다', () => {
    // **`typeof`만으로는 못 막는다.** `1e999`는 JSON의 평범한 숫자 리터럴이고
    // `JSON.parse`가 그것을 `Infinity`로 준다(실측) — `typeof`는 `'number'`다.
    // 지금은 하류의 클램프가 삼켜 무해하지만(`clampSideWidth(Infinity, 1440, 300)`는 804이다),
    // 검증을 두었으면 그것이 실제로 도는지는 재야 한다.
    localStorage.clear()
    expect(JSON.parse('{"sideWidth":1e999}').sideWidth).toBe(Infinity)
    localStorage.setItem(STORAGE_KEY, '{"sideWidth":1e999,"regionRatio":-1e999}')
    expect(readLayout(localStorage)).toEqual({})
  })

  it('JSON이 아니거나 객체가 아니면 통째로 버린다', () => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, '{ 이건 JSON 이 아니다')
    expect(readLayout(localStorage)).toEqual({})
    localStorage.setItem(STORAGE_KEY, '"문자열"')
    expect(readLayout(localStorage)).toEqual({})
    localStorage.setItem(STORAGE_KEY, 'null')
    expect(readLayout(localStorage)).toEqual({})
  })

  it('읽기가 던져도 터지지 않는다', () => {
    // 브라우저에서 실제로 난다: `about:blank`에서 `localStorage`를 읽으면
    // `SecurityError: Access is denied for this document`가 난다.
    expect(readLayout(hostileStorage())).toEqual({})
  })

  it('쓰기가 던져도 터지지 않는다 — 이번 세션의 값은 그대로 산다', () => {
    expect(() => writeLayout(hostileStorage(), { sideWidth: 420 })).not.toThrow()
  })

  it('저장소가 없으면 아무 일도 안 한다', () => {
    expect(readLayout(null)).toEqual({})
    expect(() => writeLayout(null, { sideWidth: 420 })).not.toThrow()
  })

  it('`localStorage` 접근 자체가 던지면 `null`이다', () => {
    const spy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    try {
      expect(browserStorage()).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})

/**
 * **CSS와 TS가 같은 격자를 보고 있는가.**
 *
 * 최대 폭은 `shell.css`의 격자에 매여 있는데(우측 패널 폭·손잡이 폭·칸 사이 여백) 그 수는
 * CSS에 있고 계산은 TS에 있다. 한쪽만 고치면 **아무것도 실패하지 않은 채** 최대가 틀린 값이
 * 된다 — 사이드바를 끝까지 끌면 캔버스가 계획보다 좁아지거나 격자가 넘친다.
 */
describe('`shell.css`와의 짝', () => {
  /** `.wb-shell` 규칙의 본문. 주석을 걷지 않아도 되는 것은 아래 값들이 한 줄에 있기 때문이다. */
  const shellRule = /\.wb-shell \{([\s\S]*?)\n\}/.exec(shellCss)?.[1] ?? ''

  it('격자의 좌 · 우 트랙이 `auto`다 — 두 폭을 코드가 정한다', () => {
    // 고정 `264px` · `300px`로 되돌리면 인라인 `width`가 무시되어 손잡이가 아무것도 못 한다.
    expect(shellRule).toMatch(/grid-template-columns:\s*auto\s+6px\s+minmax\(0, 1fr\)\s+6px\s+auto;/)
  })

  it('`HANDLES_WIDTH`가 격자의 고정 몫과 같다', () => {
    const columns = /grid-template-columns:\s*auto\s+(\d+)px\s+minmax\(0, 1fr\)\s+(\d+)px\s+auto;/.exec(shellRule)
    expect(columns).not.toBeNull()
    const [, sideHandle, panelHandle] = columns as RegExpExecArray
    const gap = /--wb-shell-gap:\s*(\d+)px/.exec(shellCss)?.[1]
    expect(gap).toBeDefined()
    // 칸이 다섯이므로 사이의 여백은 넷이다.
    expect(HANDLES_WIDTH).toBe(Number(sideHandle) + Number(panelHandle) + Number(gap) * 4)
  })

  it('두 영역 사이 손잡이가 `flex: none`이다 — 지우면 좁은 창에서 사라진다', () => {
    // 두 영역이 `flex-basis: 0`이라 일상 구간에서는 지워도 6px 그대로다. 그런데
    // 여백(위아래 10px씩)이 `flex-basis` 밖이라 기본 크기의 합이 48px이고, **그 아래로는
    // 줄일 것을 가진 항목이 손잡이뿐**이 된다 — 지우면 손잡이가 47px에서 5 · 46px에서 4 ·
    // 40px 아래로 0이 된다(Chrome에서 잰 값).
    // `.wb-shell-region`이 `flex-basis: 0`을 잃기만 해도 모든 크기에서 그렇게 된다
    // (850.5px에서 4.82px). 근거 전문은 `shell.css`의 그 규칙 위에 있다.
    expect(shellCss).toMatch(/\.wb-shell-region-resizer \{[^}]*\n  flex: none;/)
  })

  it('격자의 행 이름과 손잡이의 `grid-area`가 맞는다', () => {
    expect(shellRule).toMatch(/'side side-resizer canvas panel-resizer panel'/)
    expect(shellRule).toMatch(/'side side-resizer palette panel-resizer panel'/)
    expect(shellRule).toMatch(/'side side-resizer footer panel-resizer panel'/)
    expect(shellCss).toMatch(/\.wb-shell-side-resizer \{[^}]*grid-area: side-resizer;/)
    expect(shellCss).toMatch(/\.wb-shell-panel-resizer \{[^}]*grid-area: panel-resizer;/)
  })
})

/**
 * **하단 컴포넌트 판의 높이**(`src/shell/sidebar-layout.ts` 「하단 판의 높이」). 저장값은 사람이 고칠 수 있는 자리라 옛 판 · 깨진 값을
 * 기본값으로 읽고, 창보다 큰 값은 지금 창에 맞춰 조인다(저장값은 그대로).
 */
describe('하단 판의 높이', () => {
  it('저장값이 없으면 기본값이다', () => {
    expect(fitPaletteHeight(undefined, 900)).toBe(PALETTE_HEIGHT_DEFAULT)
  })

  it('옛 저장값(키 없음 · 음수 · 문자열)은 기본값으로 읽는다', () => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sideWidth: 420 }))
    expect(fitPaletteHeight(readLayout(localStorage).paletteHeight, 900)).toBe(PALETTE_HEIGHT_DEFAULT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ paletteHeight: -40 }))
    expect(fitPaletteHeight(readLayout(localStorage).paletteHeight, 900)).toBe(PALETTE_HEIGHT_DEFAULT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ paletteHeight: '240px', paletteOpen: 'yes' }))
    expect(readLayout(localStorage)).toEqual({})
    expect(fitPaletteHeight(readLayout(localStorage).paletteHeight, 900)).toBe(PALETTE_HEIGHT_DEFAULT)
  })

  it('창보다 큰 값은 지금 창의 최대로 조인다 · 최소 아래는 최소다', () => {
    expect(fitPaletteHeight(5000, 900)).toBe(paletteHeightMax(900))
    expect(paletteHeightMax(900)).toBeLessThan(900)
    expect(fitPaletteHeight(PALETTE_HEIGHT_MIN - 10, 900)).toBe(PALETTE_HEIGHT_MIN)
  })

  it('창이 아주 낮으면 최대가 최소로 주저앉는다 — 뒤집히지 않는다', () => {
    expect(paletteHeightMax(200)).toBe(PALETTE_HEIGHT_MIN)
    expect(fitPaletteHeight(PALETTE_HEIGHT_DEFAULT, 200)).toBe(PALETTE_HEIGHT_MIN)
  })

  it('캔버스 · 판이 나눠 쓰는 세로를 재면 최대는 그것에서 캔버스 몫을 뗀다 — 못 재면(0) 창에서 셈한다', () => {
    expect(paletteHeightMax(700, 520)).toBe(520 - CANVAS_MIN_HEIGHT)
    expect(paletteHeightMax(700, 300)).toBe(PALETTE_HEIGHT_MIN)
    expect(paletteHeightMax(700, 0)).toBe(paletteHeightMax(700))
    expect(fitPaletteHeight(5000, 700, 520)).toBe(520 - CANVAS_MIN_HEIGHT)
  })

  it('열림 · 높이를 싣고 읽으면 그대로다', () => {
    localStorage.clear()
    writeLayout(localStorage, { paletteHeight: 260, paletteOpen: true })
    expect(readLayout(localStorage)).toEqual({ paletteHeight: 260, paletteOpen: true })
  })
})

describe('기본값', () => {
  it('폭은 264px 그대로다 — 지금 화면이 내던 값이다', () => {
    expect(SIDE_WIDTH_DEFAULT).toBe(264)
  })

  it('우측 폭은 300px 이다 — 격자의 넷째 칸이 고정이던 때의 값이다', () => {
    expect(PANEL_WIDTH_DEFAULT).toBe(300)
  })

  it('배분은 반반이다 — 지금 `flex: 1` 둘이 내던 값이다', () => {
    expect(REGION_RATIO_DEFAULT).toBe(0.5)
  })

  it('기본값이 최소·최대 안에 있다', () => {
    expect(clampSideWidth(SIDE_WIDTH_DEFAULT, MEASURED.shellWidth, PANEL_WIDTH_DEFAULT)).toBe(SIDE_WIDTH_DEFAULT)
    expect(clampPanelWidth(PANEL_WIDTH_DEFAULT, MEASURED.shellWidth, SIDE_WIDTH_DEFAULT)).toBe(PANEL_WIDTH_DEFAULT)
    expect(clampRegionRatio(REGION_RATIO_DEFAULT, MEASURED.shared)).toBe(REGION_RATIO_DEFAULT)
  })

  it('캔버스 몫이 가장 좁은 뷰포트 프리셋보다 작지 않게 잡혀 있지는 않다', () => {
    // 320px은 프리셋 375px보다 작다 — **의도한 것이고 그 근거가 상수 주석에 있다.**
    // 이 케이스는 그 수가 조용히 0이나 음수가 되는 것을 막는다.
    expect(CANVAS_MIN_WIDTH).toBeGreaterThan(0)
    expect(SIDE_WIDTH_MIN).toBeGreaterThan(0)
  })
})
