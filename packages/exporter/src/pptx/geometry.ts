/**
 * **슬라이드 위의 자리들**(D3). §9의 3분할을 슬라이드 한 장에 옮긴 값이다.
 *
 * ```
 * ┌───────────────────────────────────────────────┐
 * │ 제목                                           │
 * ├──────────────────────────┬────────────────────┤
 * │                          │ 코멘트              │
 * │  화면 (이미지 자리)        │ ──────             │
 * │                          │ 상호작용            │
 * └──────────────────────────┴────────────────────┘
 * ```
 *
 * §11.3의 번들과 §9의 저작 화면이 *"왼쪽에 화면, 오른쪽에 코멘트·상호작용"*이므로 같은
 * 배치를 쓴다 — **같은 설계서를 보는 세 자리가 다른 배치로 읽히면 안 된다**(D3).
 * 좌측 트리는 옮기지 않는다: PPTX는 슬라이드 목록 자체가 그것이다.
 *
 * ---
 *
 * # 단위는 EMU다
 *
 * OOXML의 길이 단위는 **English Metric Unit**이고 1인치가 914400, 1포인트가 12700이다.
 * 정수라서 반올림 오차가 안 쌓이는 것이 이 단위의 존재 이유다.
 *
 * # 값을 여기 모아 둔다
 *
 * 파트를 만드는 파일에 흩어 두면 *"왼쪽 상자의 오른쪽 끝"*과 *"오른쪽 상자의 왼쪽 끝"*이
 * 서로 모르는 두 숫자가 되고, 그러면 둘이 겹치거나 벌어져도 아무도 못 본다. **케이스가
 * 이 표를 읽어 겹침과 넘침을 잰다.**
 */

/** 1인치. */
const INCH = 914400

/** 1포인트. 글자 크기(`sz`)는 100분의 1포인트이므로 그쪽과 단위가 다르다. */
export const POINT = 12700

/**
 * 슬라이드 크기. **16:9다** — 13.333in × 7.5in.
 *
 * 4:3은 오늘 새로 만드는 보고 자료의 모양이 아니다. §15의 P10이 *"보고용 산출물"*이라고
 * 적었고, 그것을 띄우는 화면과 빔프로젝터가 16:9다.
 */
export const SLIDE_WIDTH = 12192000
export const SLIDE_HEIGHT = 6858000

/** 노트 페이지 크기. 세로다 — PowerPoint의 기본값과 같다. */
export const NOTES_WIDTH = 6858000
export const NOTES_HEIGHT = 9144000

/** 슬라이드 가장자리 여백. */
const MARGIN = INCH / 2

/** 상자 하나. `a:off`와 `a:ext`가 되는 값이다. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** 제목 줄. 폭 전체를 쓴다. */
export const TITLE_BOX: Box = {
  x: MARGIN,
  y: 365760,
  width: SLIDE_WIDTH - MARGIN * 2,
  height: 640080,
}

/** 제목 아래 본문이 시작하는 자리. */
const BODY_Y = TITLE_BOX.y + TITLE_BOX.height + 137160
const BODY_HEIGHT = SLIDE_HEIGHT - BODY_Y - MARGIN

/** 좌우 사이 틈. */
const GAP = 274320

/**
 * **화면 이미지가 들어갈 자리**(D2·T4). 오늘은 비어 있고 그 상태를 슬라이드가 말한다.
 *
 * **이 상자가 P10-2와의 계약이다** — 이월이 이 값을 그대로 옮긴다.
 */
export const SCREEN_BOX: Box = { x: MARGIN, y: BODY_Y, width: 6858000, height: BODY_HEIGHT }

/** 코멘트와 상호작용 문장이 실리는 자리. */
export const PANEL_BOX: Box = {
  x: SCREEN_BOX.x + SCREEN_BOX.width + GAP,
  y: BODY_Y,
  width: SLIDE_WIDTH - MARGIN * 2 - SCREEN_BOX.width - GAP,
  height: BODY_HEIGHT,
}

/** 노트 페이지의 글 상자. 여백만 두고 나머지를 다 쓴다. */
export const NOTES_BOX: Box = {
  x: MARGIN,
  y: MARGIN,
  width: NOTES_WIDTH - MARGIN * 2,
  height: NOTES_HEIGHT - MARGIN * 2,
}
