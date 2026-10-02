/**
 * 좌측 사이드바의 **폭**과 그 안 두 영역의 **세로 배분**, 그리고 우측 패널의 **폭**. 값과 한계와 보존이 여기 한
 * 자리에 있고, 손잡이 자체는 `shell/shell-resizer.tsx`, 배선은 `routes/editor.tsx`다.
 *
 * # 왜 이 파일이 있는가 — 잰 값
 *
 * 셸의 격자를 `264px minmax(0,1fr) 300px`으로 **좌우 고정**하고 좌측의 두 상자를
 * `.wb-shell-region { flex: 1 }`로 두면 **내용과 무관하게 정확히 반씩** 갖는다. 1440×900에서
 * 잰 값(Chrome): 사이드바 264px, 두 영역 각 424.75px. 메뉴 쪽은 내용이 눌려 세로로
 * 스크롤 중인데 구조 쪽은 대부분이 빈 공간이다.
 *
 * # 다섯 가지 판단
 *
 * ## 손잡이는 셋이다 — 좌측 폭, 두 영역 사이, 우측 폭
 *
 * 좌측에 하나만 두면 나머지 한쪽이 고쳐지지 않는다. 위 실측의 고장이 **둘**이기 때문이다:
 * 폭이 좁은 것과 배분이 내용과 무관한 것은 서로 다른 원인이고 한쪽을 고쳐도 다른 쪽이
 * 남는다. **우측 패널도 폭을 사람이 정한다**(기본 · 최소 300px — `PANEL_WIDTH_DEFAULT`) — 속성 · 상호작용 칸이 좁을 때 넓힐 길이다.
 *
 * ## 두 폭은 한 예산을 나눠 쓴다
 *
 * 좌측 · 우측의 최대는 **서로를 본다** — 창 폭에서 손잡이 둘 · 칸 사이 여백(`HANDLES_WIDTH`)과 캔버스 몫(`CANVAS_MIN_WIDTH`)을 떼고 남은
 * 것을 둘이 나눈다(`sideWidthMax` · `panelWidthMax`). 한쪽을 넓힐 때 다른 쪽의 **지금 폭**을 뺀다 — 한쪽을 고정값(옛 «우측 300»)으로
 * 가정하면 우측을 넓힌 채 좌측을 최대로 밀 때 캔버스가 0 이 된다.
 *
 * **창이 좁아지면 둘을 차례로 조인다 — 우측 먼저 최소까지, 그다음 좌측**(`fitWidths`). 좌측은 트리라 폭이 곧 읽을 줄의 길이이고, 우측
 * 패널은 최소(300)에서도 칸이 선다. 조이는 것은 **그리는 값**이다 — 저장값은 그대로 두고 창이 다시 넓어지면 돌아온다(아래 «클램프가 두 번»).
 *
 * ## `localStorage`에 기억한다
 *
 * 기억할지는 **잃는 것이 무엇인가**로 가른다 — 사람이 마우스로 힘들여 맞춘 폭이 새로고침마다 264px로 돌아가면 이 기능은
 * **기능이 아니라 성가심**이 된다. 한 번 누르면 되돌아오는 펼침(드물게 쓰는 칸의 접힘 따위)은 기억하지 않아도 되지만 폭은 그렇지
 * 않다.
 *
 * **실패는 전부 삼키고 기본값으로 간다.** 비공개 창·차단 설정·quota 초과에서
 * `localStorage`는 접근 자체가 던진다(`SecurityError`). 그래서 읽기도 쓰기도 `try`로 감싸고,
 * 실패하면 **이번 세션 동안만 사는 값**이 된다 — 화면은 그대로 돌아간다. 저장이 안 된다는
 * 것을 사용자에게 알리지 않는 것도 판단이다: 알려도 사용자가 할 수 있는 일이 없고, 셸의
 * `role="alert"` 자리는 *"방금 누른 것이 실패했다"*에 배정돼 있다.
 *
 * **읽어 온 값은 믿지 않는다.** 손으로 고칠 수 있는 자리이고 앞 판(배포)의 앱이 남긴 값일 수도 있다.
 * 숫자가 아니거나 범위 밖이면 그 필드만 버리고 기본값을 쓴다 — 통째로 버리지 않는 것은
 * 폭이 깨졌다고 배분까지 잃을 이유가 없기 때문이다.
 *
 * **설계서마다가 아니라 사람마다 하나다.** 이 값이 답하는 질문은 *"내 화면이 얼마나
 * 넓은가"*이지 *"이 설계서가 어떤 설계서인가"*가 아니다. 키에 프로젝트 id를 넣으면
 * 설계서를 옮길 때마다 폭이 튄다.
 *
 * ## 한계와 되돌리기 — 0px까지 줄지 않는다
 *
 * **최소 200px**(`SIDE_WIDTH_MIN`). **근거는 되잡기이지 내용이 아니다.** 0px까지 열어 두면
 * 손잡이가 창 끝에 붙어 되잡기가 어렵고, 사이드바가 사라진 것과 고장 난 것을 사용자가 가릴
 * 수 없다.
 *
 * **내용의 최소 폭은 상태마다 다르다 — 192px은 한 상태의 수다.** 192px(`scrollWidth` 192 ·
 * `clientWidth` 180)은 **프리셋 고르개가 열린 판의 구조 도구모음**에서 난다 — `<select>`와
 * 이름 입력이 UA 최소 폭 아래로 줄지 않기 때문이다. **기본 상태에는 그런 바닥이 없다**:
 * 도구모음이 `flex-wrap: wrap`이라 버튼이 한 줄씩 내려가고 글자도 안에서 접히므로
 * min-content가 **28.4px**이고, 구조 영역의 `scrollWidth`가 사이드바 140px에서도
 * `clientWidth`와 같다(실측, Chrome). 즉 *"내용의 최소 폭이 192px이므로 200"*은 **한
 * 상태에만 맞는 말이다.**
 *
 * **그래서 200px은 내용이 담긴다는 약속이 아니다.** 고르개가 열리고 도구모음에 상태줄까지
 * 선 최악(라틴 사용자명)이 **199px**이라 여유가 1px뿐이다 — 글자 하나·글꼴 하나에 넘는다.
 * **그래도 200을 올리지 않는다**: 넘었을 때 보이는 것이 **그 상자 안의 가로 스크롤**이고
 * (`.wb-shell-region`이 `overflow: auto`다) 셸의 격자는 넘치지 않으며, 좁힌 사람이 손잡이로
 * 되돌릴 수 있다. 막으려는 사고는 *"내용이 잘린다"*가 아니라 *"손잡이를 되잡을 수 없다"*이고
 * 그쪽에는 200px이 충분하다. **1px은 여유가 아니라 우연이다 — 그렇게 읽지 마라.**
 *
 * **최대는 창에서 계산한다**(`sideWidthMax` · `panelWidthMax`). 고정값을 두면 좁은 창에서 캔버스가 0이 되고
 * 격자가 통째로 넘친다 — 실측: 1440 창에서 사이드바를 1200px로 두면 캔버스 트랙이 0px가
 * 되고 셸의 `scrollWidth`가 1502로 벌어진다. 그래서 **캔버스에 남겨 둘 몫**(`CANVAS_MIN_WIDTH`)
 * 을 먼저 떼고 나머지를 준다.
 *
 * **되돌리는 길은 셋이다.** 손잡이를 두 번 누르면 기본값, `Home`·`End`가 양 끝, 화살표가
 * 한 칸이다. 하나로는 부족하다 — 손잡이를 창 끝까지 밀어 놓은 사람이 마우스로 그것을 다시
 * 잡기 어려운 상황이 이 기능의 가장 흔한 사고이고, 최소·최대를 둔 것 자체가 그 사고를
 * 막는 첫 겹이다.
 *
 * ## 키보드로도 된다
 *
 * 드래그 전용이면 키보드 사용자에게는 이 기능이 **없는 것과 같다.** `role="separator"` +
 * `aria-valuenow`/`valuemin`/`valuemax` + 화살표가 그 표준 모양이고(WAI-ARIA의 window
 * splitter), `tabindex`가 붙어 초점을 받는다. 자세한 것은 `shell/shell-resizer.tsx`.
 *
 * ## 두 영역 사이는 **비율**이다 — 픽셀이 아니다
 *
 * 픽셀로 고정하면 창 높이가 바뀔 때 어긋난다. 창을 키우면 늘어난 세로가 전부 한쪽으로
 * 가고, 줄이면 한쪽이 먼저 0이 된다. 비율은 그 둘을 다 피한다 — `flex: 1` 둘이 내는
 * 반반이 비율 0.5인 특수한 경우이므로, 비율이 더하는 것은 **그 값을 사람이 정할 수 있게
 * 하는 것**뿐이고 창 크기에 대한 성질은 같다.
 *
 * **드래그는 픽셀로 받아 비율로 바꾼다.** 사람이 잡고 움직이는 것은 픽셀이므로 손잡이는
 * 픽셀만 말하고(`shell-resizer.tsx`), 픽셀→비율 환산은 두 영역이 나눠 쓰는 세로를 아는
 * 이쪽에서 한다.
 *
 * **비율의 한계도 픽셀에서 나온다**(`clampRegionRatio`). 고정 비율(예: 0.15~0.85)로 막으면
 * 창이 낮을 때 한쪽이 몇 픽셀만 남고, 창이 높을 때는 필요 이상으로 막는다. 영역 하나가
 * 최소로 가질 세로를 픽셀로 정하고(`REGION_MIN_HEIGHT`) 그때그때 비율로 환산한다.
 *
 * **비율을 `flex-grow`에 그대로 실으면 손잡이가 포인터를 놓친다**(`regionGrow`). 상자의
 * 여백이 배분 밖에 남아 `세로 = 여백 + grow × 나눌 공간`이기 때문이다 — 실측: 여백 20px ·
 * 나눌 공간 802.5px에서 포인터를 200px 밀었는데 경계는 190.4px만 움직였다(802.5/842.5 =
 * 95.2%). 그래서 비율은 **사람이 보는 것**(상자 세로의 비)으로 두고, `flex-grow`로 나갈 때
 * 여백을 되돌린다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * 사이드바 기본 폭(px). **`shell.css`가 아니라 여기가 한 자리다** — 격자의 첫 트랙이
 * `auto`이고 폭은 `.wb-shell-side`에 인라인으로 붙으므로, 이 수가 CSS에 두 벌 적히지 않는다.
 *
 * **264px이다.** 폭을 넓히는 쪽으로 기본값을 옮기지 않는 근거는 실측이다 — 이 폭이
 * 좁아서 생긴 것처럼 보이는 프리셋 고르개의 찌그러짐은 **폭을 넓혀도 풀리지 않는다.** 사이드바를
 * 240→1040px으로 훑으며 잰 값에서 `<select>`의 폭은 단조롭게 자라지 않고 **톱니**를 그린다
 * (360px에서 77.1px까지 자랐다가 380px에서 3.6px로 떨어진다 — 고르개가 `flex-wrap` 상자라
 * 폭이 늘면 항목이 같은 줄로 올라오고, 그 줄의 `flex: 1` 항목이 남는 폭을 나눠 갖기
 * 때문이다). 옵션 글자 전체(실측 157.6px)를 담으려면 사이드바가 **800px쯤** 되어야 한다.
 * 즉 *"264px 사이드바 자체의 문제"*라는 판정은 **기전이 틀렸다** — 원인은 고르개
 * 자신의 `flex: 1` 공유이고, 폭은 실용 범위에서 그것을 고치지 못한다. 고르개를 근거로
 * 기본값을 올릴 수 없으므로, 다른 실측 근거가 없는 한 지금 값을 유지한다. 넓게 쓰고 싶은
 * 사람은 손잡이로 넓히고 그 값이 기억된다.
 */
export const SIDE_WIDTH_DEFAULT = 264

/**
 * 사이드바 최소 폭(px). **근거는 되잡기다** — 내용이 담기는 폭이 아니다(머리말 「한계와 되돌리기」).
 * 넘치는 상태가 있고 그때 보이는 것은 그 상자 안의 가로 스크롤이다.
 */
export const SIDE_WIDTH_MIN = 200

/**
 * 사이드바가 아무리 넓어도 캔버스에 남겨 두는 폭(px). 설계서 미리보기가 가장 좁은
 * 뷰포트 프리셋(375px)에 못 미치더라도 **무엇이 그려지는지는 보여야 한다**는 선이다.
 */
export const CANVAS_MIN_WIDTH = 320

/**
 * 두 폭 말고 격자가 가로로 쓰는 고정 몫(px) — 손잡이 둘(6 × 2) + 칸 사이 여백 넷(1px × 4 — 칸 다섯 사이).
 * **`shell.css`의 `.wb-shell` 격자와 짝이다**(`test/shell/sidebar-layout.test.ts`가 그 짝을
 * CSS 원문과 대조한다 — 한쪽만 고치면 최대가 틀린 값이 된다).
 */
export const HANDLES_WIDTH = 6 * 2 + 1 * 4

/** 우측 패널 기본 폭(px) — 격자의 넷째 칸이 고정이던 때의 값 그대로다. 좌측과 같이 `.wb-shell-panel`의 인라인 `width`로 붙는다. */
export const PANEL_WIDTH_DEFAULT = 300

/** 우측 패널 최소 폭(px). 속성 패널의 라벨(96px)과 칸이 한 줄에 서는 폭이 기본값이라 그 아래로 줄이지 않는다. */
export const PANEL_WIDTH_MIN = 300

/** 두 영역의 기본 배분. 0.5는 `flex: 1` 둘이 내는 반반과 같다. */
export const REGION_RATIO_DEFAULT = 0.5

/**
 * 영역 하나가 최소로 가질 세로(px). **이것이 사는 이유는 0이 아니게 하는 것이다** —
 * 상자가 0px가 되면 사용자가 접은 것과 고장 난 것을 가릴 수 없고 손잡이도 되잡기 어렵다.
 *
 * **72px은 *"이름표와 한 줄이 보이는 높이"*가 아니다.** 이름표 블록
 * 42px(글자 14 + 아래 여백 8 + 상자의 위아래 여백 20)과 트리 한 줄 사이에 **도구모음이
 * 있다.**(트리 한 줄은 21~22.5px이다 — 갈리는 것은 글꼴이고,
 * 어느 쪽이든 아래 결론은 같다.) 실측(Chrome, 사이드바 264px): 도구모음이 여백까지 94px이고
 * `position: sticky; bottom: 0`이라 상자 바닥에 붙는다. 그래서 **72px에서는 상자가 잘린
 * 도구모음뿐이다** — 이름표도 트리도 그 아래에 가린다(`scrollHeight` 304 · `clientHeight` 72).
 * 이름표가 나오려면 **136px**, 트리 한 줄까지 나오려면 **157px**이 필요하다.
 *
 * **그래도 72px이다. 근거 셋이 전부 값이다.**
 *
 * 1. **약속을 지키려면 상수로는 못 쓴다.** 저 157px은 사이드바 264px의 수이고, 폭이 좁으면
 *    도구모음이 더 접혀 커진다 — 최소 폭 200px에서는 **184px**이다. 세로 하나로 *"한 줄이
 *    보인다"*를 약속할 수 없다.
 * 2. **올리면 손잡이가 죽는 창이 넓어진다.** 하한이 `sharedHeight`의 절반을 넘으면
 *    `regionRatioMin`이 0.5에서 만나 손잡이가 아무것도 못 한다. 72px이면 나눠 쓰는 세로
 *    144px 아래(창 높이 약 202px 아래)에서만 그렇고, 157px로 올리면 그 경계가 314px
 *    (창 높이 약 372px)로 올라간다.
 * 3. **잘려도 갇히지 않는다.** 상자가 `overflow: auto`라 스크롤로 닿고, 사람이 접은 것을
 *    사람이 손잡이로 되돌린다.
 *
 * 즉 이 수가 지키는 것은 *"무엇이 보인다"*가 아니라 *"0이 아니다"*이고, 72px은 그 자에서
 * 고른 값이다. **위 세 수(136·157·184)는 도구모음 아래 상태줄(`panels/toolbar-status.ts`)
 * 없이 잰 값이다 — 상태줄이 서면 그만큼 커진다. 약속을 두고 싶어지면 폭에 매인 값으로
 * 다시 세워야 한다.**
 */
export const REGION_MIN_HEIGHT = 72

/**
 * # 하단 판의 높이
 *
 * 하단 컴포넌트 판(`palette/component-palette.tsx`)의 높이와 열림도 여기 함께 기억한다 — 같은 저장 키 · 같은 «필드마다 따로 버림» ·
 * 같은 «싣는 자리 · 그리는 자리 두 번 조임» 이다. 따로 키를 두면 같은 장치가 두 벌이 된다. 판은 셸 그리드의 `palette` 줄(캔버스와 하단 바
 * 사이)이고 캔버스 줄(`minmax(0, 1fr)`)이 그만큼 준다.
 *
 * **한계는 창 높이에서 계산한다**(`paletteHeightMax`) — 창에서 머리 · 하단 바의 몫(`PALETTE_CHROME_RESERVE`)과 캔버스 몫
 * (`CANVAS_MIN_HEIGHT`)을 뗀다. 머리가 두 줄로 접히거나 통지가 하단 바를 키우면 그 몫이 더 커져 캔버스가 덜 남는다 — 그때도 캔버스 줄이
 * 0 이 될 뿐 셸이 넘치지는 않는다(`minmax(0, 1fr)`). 잰 값과 다시 재는 법은 `PALETTE_HEIGHT_DEFAULT` 의 주석.
 */

/**
 * 하단 판의 기본 높이(px) — 위쪽 손잡이 6 · 탭과 검색 줄 · 카드 줄(축소판 + 이름)이 다 보이는 높이.
 *
 * **잰 값**(Chrome · 창 폭 1440 · 사이드바 기본 · 통지 없음 · 머리 한 줄): 판을 열면 캔버스 칸이 판 높이만큼 준다(닫힌 판의 빈 줄도 칸
 * 사이 여백 1 을 쥐어 열고 닫음이 여백을 안 바꾼다) — 창 900 에서 캔버스 칸 809 → 609 · 창 700 에서 609 → 409. 최대(창 900 에서 564 · 700
 * 에서 364)에서 캔버스 칸은 245 다. 다시 재는 법:
 * `pnpm test:browser` 의 `apps/web/build-test/palette.test.ts` «판을 열면 캔버스 칸이 판 높이만큼 준다» 가 `[하단 판 높이]` 로그로 낸다.
 */
export const PALETTE_HEIGHT_DEFAULT = 200

/**
 * 하단 판의 최소 높이(px). **근거는 카드 줄이 보이는 것이다** — 손잡이 · 탭 줄 · 카드 이름 줄과 축소판 한 줄(작게)이 서는 높이다. 그 아래로
 * 줄이면 판이 탭 줄만 남아 «열렸는데 아무것도 없다» 로 보인다.
 */
export const PALETTE_HEIGHT_MIN = 140

/** 판이 아무리 높아도 캔버스 칸에 남겨 두는 높이(px) — 캔버스 칸의 위 · 아래 여백(24 × 2)을 빼고 문서가 한 화면의 몇 줄은 보이는 선. */
export const CANVAS_MIN_HEIGHT = 240

/**
 * 판의 최대를 계산할 때 창에서 떼는 머리 · 하단 바의 몫(px) — 머리 한 줄(48) · 하단 바 한 줄(40) · 칸 사이 여백 셋(1 × 3) = 91 을 올린
 * 값이다(`PALETTE_HEIGHT_DEFAULT` 의 실브라우저 판이 같은 로그에 두 높이를 낸다).
 */
export const PALETTE_CHROME_RESERVE = 96

/** 지금 창 높이에서 판이 가질 수 있는 최대(px). 최소보다 작아지지 않는다(`sideWidthMax` 와 같은 까닭). */
export function paletteHeightMax(windowHeight: number): number {
  return Math.max(PALETTE_HEIGHT_MIN, windowHeight - PALETTE_CHROME_RESERVE - CANVAS_MIN_HEIGHT)
}

/**
 * **화면에 쓸 판 높이** — 저장값을 지금 창에 맞춰 조인다. 없거나 0 이하면(옛 판 · 손으로 고친 값) 기본값이다 — 최소로 읽으면 깨진 값이
 * 사람이 고른 적 없는 가장 작은 판이 된다.
 */
export function fitPaletteHeight(stored: number | undefined, windowHeight: number): number {
  const wanted = stored === undefined || !(stored > 0) ? PALETTE_HEIGHT_DEFAULT : stored
  return clamp(wanted, PALETTE_HEIGHT_MIN, paletteHeightMax(windowHeight))
}

/** 화살표 한 칸(px). 드래그와 같은 단위다. */
export const RESIZE_STEP = 16

/** 보존 키. **설계서마다가 아니라 사람마다 하나다**(머리말 「`localStorage`에 기억한다」). */
export const STORAGE_KEY = 'wirebound.editor.sidebar'

/** 보존되는 값. 다 없을 수 있다 — 한쪽이 깨져도 다른 쪽은 산다. `panelWidth`가 없는 옛 저장값은 우측 기본값으로 읽는다. */
export interface StoredLayout {
  sideWidth?: number
  regionRatio?: number
  panelWidth?: number
  /** 하단 판의 높이(px)와 열림(머리말 «하단 판의 높이»). */
  paletteHeight?: number
  paletteOpen?: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 두 폭이 나눠 쓰는 가로(px) — 창에서 고정 몫과 캔버스 몫을 뗀 것. */
function widthBudget(shellWidth: number): number {
  return shellWidth - HANDLES_WIDTH - CANVAS_MIN_WIDTH
}

/**
 * 지금 창 · 지금 우측 폭에서 사이드바가 가질 수 있는 최대 폭(px).
 *
 * **최소보다 작아지지 않는다.** 창이 아주 좁으면 계산이 최소 아래로 내려가는데, 그때
 * `clampSideWidth`의 `min`과 `max`가 뒤집히면 결과가 튄다. 좁은 창에서는 최소를 지키고
 * 격자가 넘치게 두는 편이 낫다 — 그 상황에서 사이드바를 더 줄여도 캔버스는 여전히 못 쓴다.
 */
export function sideWidthMax(shellWidth: number, panelWidth: number): number {
  return Math.max(SIDE_WIDTH_MIN, widthBudget(shellWidth) - panelWidth)
}

/** 지금 창 · 지금 좌측 폭에서 우측 패널이 가질 수 있는 최대 폭(px). 최소보다 작아지지 않는다(`sideWidthMax`와 같은 까닭). */
export function panelWidthMax(shellWidth: number, sideWidth: number): number {
  return Math.max(PANEL_WIDTH_MIN, widthBudget(shellWidth) - sideWidth)
}

/** 사이드바 폭을 우측의 지금 폭에 맞춰 자른다. 손잡이가 싣는 값이다. */
export function clampSideWidth(width: number, shellWidth: number, panelWidth: number): number {
  return clamp(width, SIDE_WIDTH_MIN, sideWidthMax(shellWidth, panelWidth))
}

/** 우측 폭을 좌측의 지금 폭에 맞춰 자른다. 손잡이가 싣는 값이다. */
export function clampPanelWidth(width: number, shellWidth: number, sideWidth: number): number {
  return clamp(width, PANEL_WIDTH_MIN, panelWidthMax(shellWidth, sideWidth))
}

/**
 * **화면에 쓸 두 폭** — 저장값을 지금 창에 맞춰 조인다(머리말 «두 폭은 한 예산을 나눠 쓴다»). 넘치면 **우측을 먼저** 최소까지, 그래도 넘치면
 * 좌측을 최소까지 줄인다. 둘 다 최소인데도 넘치는 창(아주 좁은 창)은 격자가 넘치게 둔다 — `sideWidthMax`의 머리말.
 */
export function fitWidths(side: number, panel: number, shellWidth: number): { side: number; panel: number } {
  let fittedSide = Math.max(SIDE_WIDTH_MIN, side)
  let fittedPanel = Math.max(PANEL_WIDTH_MIN, panel)
  let over = fittedSide + fittedPanel - widthBudget(shellWidth)
  if (over > 0) {
    const cut = Math.min(over, fittedPanel - PANEL_WIDTH_MIN)
    fittedPanel -= cut
    over -= cut
  }
  if (over > 0) fittedSide -= Math.min(over, fittedSide - SIDE_WIDTH_MIN)
  return { side: fittedSide, panel: fittedPanel }
}

/**
 * 두 영역이 나눠 쓰는 세로가 `sharedHeight`일 때 쓸 수 있는 비율의 하한.
 *
 * **0.5를 넘지 않는다.** 상자가 `REGION_MIN_HEIGHT`의 두 배보다 낮으면 두 영역이 다
 * 최소를 가질 수 없는데, 그때 하한이 0.5를 넘으면 상한(`1 - min`)보다 커져 범위가 뒤집힌다.
 * 그 상황의 답은 반반이고, 0.5로 막으면 하한과 상한이 만나 저절로 그렇게 된다.
 */
export function regionRatioMin(sharedHeight: number): number {
  if (!(sharedHeight > 0)) return 0
  return Math.min(0.5, REGION_MIN_HEIGHT / sharedHeight)
}

/** 화면에 실제로 쓸 배분. 창 높이가 바뀌면 한계가 따라 바뀐다(머리말 「두 영역 사이는 **비율**이다」). */
export function clampRegionRatio(ratio: number, sharedHeight: number): number {
  const min = regionRatioMin(sharedHeight)
  return clamp(ratio, min, 1 - min)
}

/** 두 영역이 놓인 자리의 치수. 둘 다 화면에서 재서 온다 — CSS를 여기 두 벌 적지 않는다. */
export interface RegionMetrics {
  /** 두 영역이 나눠 쓰는 세로(px). 손잡이와 칸 사이 여백은 이미 빠져 있다. */
  shared: number
  /** 영역 하나가 배분 **밖에서** 갖는 세로(px) — 위아래 여백과 테두리다. */
  inset: number
}

/**
 * 상자가 배분 밖에서 갖는 세로(px). `flex-basis: 0`이 못 없애는 몫이다.
 *
 * **여백을 상수로 적지 않고 읽는 이유가 이것이다** — `shell.css`의 `.wb-shell-region`이
 * 여백을 바꾸면 이 환산이 저절로 따라온다. 상수로 두면 그날 손잡이가 조용히 어긋난다.
 */
export function regionInset(region: Element | null): number {
  if (region === null) return 0
  const style = getComputedStyle(region)
  const parts = [
    style.paddingTop,
    style.paddingBottom,
    style.borderTopWidth,
    style.borderBottomWidth,
  ].map((value) => parseFloat(value))
  return parts.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
}

/**
 * 사람이 보는 비율(상자 세로의 비)을 `flex-grow`로 바꾼다.
 *
 * `세로 = inset + grow × free`이고 `free = shared - inset × 2`이므로, `세로`가
 * `ratio × shared`가 되게 하는 `grow`는 `(ratio × shared - inset) ÷ free`다. 두 상자의
 * `grow` 합이 1이므로 세로의 합은 `inset × 2 + free = shared`로 그대로 맞는다.
 *
 * **잴 수 없으면 비율을 그대로 낸다.** 레이아웃이 없는 자리(jsdom)에서는 `free`가 0이고,
 * 그때 나누면 `Infinity`가 나와 배분이 통째로 깨진다. 비율을 그대로 쓰면 적어도 반반은
 * 반반으로 그려진다.
 */
export function regionGrow(ratio: number, metrics: RegionMetrics): number {
  const free = metrics.shared - metrics.inset * 2
  if (!(free > 0)) return ratio
  return clamp((ratio * metrics.shared - metrics.inset) / free, 0, 1)
}

/**
 * `localStorage`. **접근 자체가 던질 수 있다** — 비공개 창·사이트 데이터 차단에서
 * `globalThis.localStorage`를 읽는 것만으로 `SecurityError`가 난다. 못 쓰면 `null`이고,
 * 부르는 쪽은 그때 이번 세션 동안만 사는 값을 쓴다.
 */
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** 숫자로 쓸 수 있는 값만 통과시킨다. `NaN`·`Infinity`·문자열·`null`은 전부 버린다. */
function usableNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 저장된 값을 읽는다. **필드마다 따로 검증하고 따로 버린다**(머리말 「`localStorage`에 기억한다」) — 통째로 버리면
 * 폭이 깨졌다는 이유로 배분까지 잃는다.
 *
 * 범위 검사는 여기서 하지 않는다. 한계가 창 크기에 매여 있어 읽는 시점에는 아직 모르고,
 * 그리는 시점에 어차피 클램프를 지나기 때문이다 — 여기서 또 자르면 좁은 창에서 한 번 연
 * 것만으로 넓은 창의 값이 영구히 깎인다.
 */
export function readLayout(storage: Storage | null): StoredLayout {
  if (storage === null) return {}
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return {}
  }
  if (raw === null) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const record = parsed as Record<string, unknown>
  const sideWidth = usableNumber(record.sideWidth)
  const regionRatio = usableNumber(record.regionRatio)
  const panelWidth = usableNumber(record.panelWidth)
  const paletteHeight = usableNumber(record.paletteHeight)
  const paletteOpen = typeof record.paletteOpen === 'boolean' ? record.paletteOpen : undefined
  return {
    ...(sideWidth === undefined ? {} : { sideWidth }),
    ...(regionRatio === undefined ? {} : { regionRatio }),
    ...(panelWidth === undefined ? {} : { panelWidth }),
    ...(paletteHeight === undefined ? {} : { paletteHeight }),
    ...(paletteOpen === undefined ? {} : { paletteOpen }),
  }
}

/** 저장한다. **실패는 삼킨다**(머리말 「`localStorage`에 기억한다」) — quota·차단에서 던지고, 화면은 그대로 돈다. */
export function writeLayout(storage: Storage | null, layout: StoredLayout): void {
  if (storage === null) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // 저장되지 않았을 뿐이다. 이번 세션의 값은 살아 있다.
  }
}

export interface SidebarLayout {
  /** 두 영역을 담는 상자. 나눠 쓰는 세로를 여기서 잰다. */
  sideRef: RefObject<HTMLElement | null>
  /** 두 영역 사이의 손잡이. 배분의 대상이 아니라 배분 **전에** 떼는 몫이라 따로 잰다. */
  regionResizerRef: RefObject<HTMLDivElement | null>
  /** 화면에 쓸 폭(px). 저장된 값이 아니라 **클램프를 지난 값**이다. */
  sideWidth: number
  sideWidthMin: number
  sideWidthMax: number
  /** 지금 폭을 픽셀로 준다. 손잡이가 드래그를 시작할 때 부른다. */
  grabSideWidth: () => number
  setSideWidth: (width: number) => void
  resetSideWidth: () => void
  /** 화면에 쓸 배분. 첫 영역의 몫이다. **사람이 보는 비율**이지 `flex-grow`가 아니다. */
  regionRatio: number
  regionRatioMin: number
  /** 첫 영역에 실을 `flex-grow`. 둘째는 `1 - regionGrow`다(`regionGrow` 함수의 머리말). */
  regionGrow: number
  /** 첫 영역의 지금 높이(px). */
  grabRegionHeight: () => number
  /** 첫 영역의 목표 높이(px)를 비율로 바꿔 싣는다. */
  setRegionHeight: (height: number) => void
  /** 비율을 그대로 싣는다. `Home`·`End`가 쓴다 — 양 끝은 픽셀을 거칠 이유가 없다. */
  setRegionRatio: (ratio: number) => void
  resetRegionRatio: () => void
  /** 화면에 쓸 우측 폭(px). **클램프를 지난 값**이다(`fitWidths`). */
  panelWidth: number
  panelWidthMin: number
  panelWidthMax: number
  grabPanelWidth: () => number
  setPanelWidth: (width: number) => void
  resetPanelWidth: () => void
  /** 하단 판이 열렸다고 기억하는가 — 서는지는 셸이 편집 권한과 함께 가른다(기억은 그대로 둔다). */
  paletteOpen: boolean
  togglePalette: () => void
  /** 화면에 쓸 판 높이(px). **클램프를 지난 값**이다(`fitPaletteHeight`). */
  paletteHeight: number
  paletteHeightMin: number
  paletteHeightMax: number
  grabPaletteHeight: () => number
  setPaletteHeight: (height: number) => void
  resetPaletteHeight: () => void
}

/**
 * 창 폭. **`.wb-shell`이 `position: fixed; inset: 0`이라 창 폭이 곧 셸 폭이다** — 요소를
 * 재려면 `ResizeObserver`가 필요한데 jsdom에 없어서 테스트가 통째로 갈린다.
 */
function windowWidth(): number {
  return typeof window === 'undefined' ? 0 : window.innerWidth
}

/** 창 높이 — 셸 높이와 같다(`windowWidth` 와 같은 까닭). */
function windowHeight(): number {
  return typeof window === 'undefined' ? 0 : window.innerHeight
}

/**
 * 사이드바의 폭·배분과 그 한계.
 *
 * **클램프가 두 번 걸리고 둘이 하는 일이 다르다.**
 *
 * - **싣는 자리**(`setSideWidth`·`setRegionHeight`) — *그때의* 창으로 자른다. 손잡이를 창
 *   밖까지 밀어도 저장되는 것은 화면에 보인 값이다. 이 클램프가 없으면 1440 창에서 끝까지
 *   민 사람의 저장값이 2196px가 되고(실측), 더 넓은 화면에서 열었을 때 **아무도 정한 적
 *   없는 폭**으로 펼쳐진다.
 * - **그리는 자리** — *지금* 창으로 다시 자른다. 좁은 창에서 열면 화면만 줄고 저장값은
 *   그대로다. **여기서 되싣지 않는 것이 요점이다** — 되실으면 노트북에서 한 번 연 것만으로
 *   넓은 화면의 폭이 영구히 깎인다.
 */
export function useSidebarLayout(): SidebarLayout {
  const sideRef = useRef<HTMLElement | null>(null)
  const regionResizerRef = useRef<HTMLDivElement | null>(null)
  const storageRef = useRef<Storage | null>(null)
  if (storageRef.current === null) storageRef.current = browserStorage()

  // 첫 렌더에 한 번만 읽는다. 뒤로는 이 상태가 진실이다.
  const [stored, setStored] = useState<StoredLayout>(() => readLayout(storageRef.current))
  const [shellWidth, setShellWidth] = useState(windowWidth)
  const [shellHeight, setShellHeight] = useState(windowHeight)
  const [metrics, setMetrics] = useState<RegionMetrics>({ shared: 0, inset: 0 })

  /**
   * 두 영역의 치수 둘을 한 번에 잰다.
   *
   * **클래스로 찾지 않고 ref로 잰다.** `routes/editor.tsx`가 캔버스를 잴 때와 같은 근거다
   * (그 파일의 `canvasRef` 주석) — 클래스 이름은 `shell.css`의 것이고, 여기서 그 이름을
   * 조회하면 스타일을 고치다 계산이 조용히 틀리게 된다. 여백을 읽을 상자만 예외인데,
   * 그것도 이름이 아니라 **자리**로 집는다(손잡이 앞의 형제 = 첫 영역).
   *
   * **`clientHeight`가 아니라 `getBoundingClientRect()`다.** `clientHeight`는 정수로
   * 반올림돼 0.5px이 어긋난다(실측 851 vs 850.5) — 그 0.5가 환산에 그대로 실린다.
   *
   * **손잡이가 없으면 뺄 것도 없다.** 뷰 모드에서는 영역이 하나라 상자 전체가 그 영역의
   * 몫이다. **그 갈래의 `inset: 0`은 자리 채움이고 어떤 케이스도 그것을 재지 못한다** —
   * 그 상태에서 `regionGrow`를 화면에 싣는 곳이 없기 때문이다(`routes/editor.tsx`의
   * `split`). 재는 법: 그 자리만 진짜 여백으로 바꿔도 `--project web` 전량이 통과한다.
   * 값이 아니라 **읽는 곳이 없다는 사실**이 이 자리의 성질이다.
   */
  const measure = useCallback((): RegionMetrics => {
    const side = sideRef.current
    if (side === null) return { shared: 0, inset: 0 }
    const height = side.getBoundingClientRect().height
    const resizer = regionResizerRef.current
    if (resizer === null) return { shared: height, inset: 0 }
    const gap = parseFloat(getComputedStyle(side).rowGap)
    const gaps = Number.isFinite(gap) ? gap * 2 : 0
    const shared = Math.max(0, height - resizer.getBoundingClientRect().height - gaps)
    return { shared, inset: regionInset(side.firstElementChild) }
  }, [])

  /**
   * 창이 바뀌면 한계도 바뀐다. **레이아웃 이펙트**인 것은 첫 그림에서 이미 참인 값을 쓰기
   * 위해서다 — 한 프레임 동안 잘못된 한계로 그리면 손잡이의 `aria-valuemax`가 눈에 띄게
   * 튄다.
   */
  useLayoutEffect(() => {
    const sync = (): void => {
      setShellWidth(windowWidth())
      setShellHeight(windowHeight())
      setMetrics(measure())
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [measure])

  /**
   * **렌더마다 다시 잰다 — 의존 배열이 없다.** 나눠 쓰는 세로는 창 크기 말고도 바뀐다:
   * 편집↔뷰 모드가 손잡이를 넣고 빼고, 머리가 한 줄 접히면 상자의 세로가 바뀐다. 창
   * 리스너만으로는 그 순간을 놓쳐 드래그가 어긋난 배율로 움직인다.
   *
   * **값이 같으면 `setState`가 없어 무한 루프가 되지 않는다** — React는 같은 값으로 부른
   * `setState`를 리렌더로 잇지 않는다.
   */
  useLayoutEffect(() => {
    const next = measure()
    setMetrics((prev) => (prev.shared === next.shared && prev.inset === next.inset ? prev : next))
  })

  /**
   * 보존. **값이 실제로 달라졌을 때만 쓴다.**
   *
   * *"첫 렌더면 건너뛴다"*로는 부족하다 — `StrictMode`가 개발에서 이펙트를 두 번 돌리므로
   * 두 번째에 통과해 **아무도 아무것도 안 했는데 `{}`가 저장된다**(실측: 그렇게 두면 셸을
   * 처음 열기만 해도 `wirebound.editor.sidebar`에 `{}`가 생긴다). 마지막으로 쓴 것을 들고
   * 비교하면 첫 렌더도, 값이 왕복해 제자리로 온 경우도 함께 걸러진다.
   */
  const writtenRef = useRef(JSON.stringify(stored))
  useEffect(() => {
    const next = JSON.stringify(stored)
    if (next === writtenRef.current) return
    writtenRef.current = next
    writeLayout(storageRef.current, stored)
  }, [stored])

  const { side: sideWidth, panel: panelWidth } = fitWidths(
    stored.sideWidth ?? SIDE_WIDTH_DEFAULT,
    stored.panelWidth ?? PANEL_WIDTH_DEFAULT,
    shellWidth,
  )
  const regionRatio = clampRegionRatio(stored.regionRatio ?? REGION_RATIO_DEFAULT, metrics.shared)
  const paletteHeight = fitPaletteHeight(stored.paletteHeight, shellHeight)

  return {
    sideRef,
    regionResizerRef,
    sideWidth,
    sideWidthMin: SIDE_WIDTH_MIN,
    sideWidthMax: sideWidthMax(shellWidth, panelWidth),
    grabSideWidth: () => sideWidth,
    // 싣는 자리의 클램프는 **상대의 화면 폭**을 뺀다 — 저장값이 아니다. 조여진 상대를 기준으로 잘라야 손잡이가 화면에 보인 끝에서 멈춘다.
    setSideWidth: (width) =>
      setStored((prev) => ({ ...prev, sideWidth: clampSideWidth(width, shellWidth, panelWidth) })),
    resetSideWidth: () => setStored((prev) => ({ ...prev, sideWidth: SIDE_WIDTH_DEFAULT })),
    panelWidth,
    panelWidthMin: PANEL_WIDTH_MIN,
    panelWidthMax: panelWidthMax(shellWidth, sideWidth),
    grabPanelWidth: () => panelWidth,
    setPanelWidth: (width) =>
      setStored((prev) => ({ ...prev, panelWidth: clampPanelWidth(width, shellWidth, sideWidth) })),
    resetPanelWidth: () => setStored((prev) => ({ ...prev, panelWidth: PANEL_WIDTH_DEFAULT })),
    regionRatio,
    regionRatioMin: regionRatioMin(metrics.shared),
    regionGrow: regionGrow(regionRatio, metrics),
    grabRegionHeight: () => regionRatio * metrics.shared,
    setRegionHeight: (height) => {
      // 잴 수 없는 자리(레이아웃이 없는 곳)에서는 나눌 수가 없다. 아무것도 안 하는 편이
      // `NaN`이나 `Infinity`를 싣는 것보다 낫다 — 그 값은 클램프도 못 고친다.
      const shared = metrics.shared > 0 ? metrics.shared : measure().shared
      if (!(shared > 0)) return
      setStored((prev) => ({ ...prev, regionRatio: clampRegionRatio(height / shared, shared) }))
    },
    setRegionRatio: (ratio) =>
      setStored((prev) => ({ ...prev, regionRatio: clampRegionRatio(ratio, metrics.shared) })),
    resetRegionRatio: () => setStored((prev) => ({ ...prev, regionRatio: REGION_RATIO_DEFAULT })),
    paletteOpen: stored.paletteOpen === true,
    togglePalette: () => setStored((prev) => ({ ...prev, paletteOpen: prev.paletteOpen !== true })),
    paletteHeight,
    paletteHeightMin: PALETTE_HEIGHT_MIN,
    paletteHeightMax: paletteHeightMax(shellHeight),
    grabPaletteHeight: () => paletteHeight,
    setPaletteHeight: (height) =>
      setStored((prev) => ({ ...prev, paletteHeight: clamp(height, PALETTE_HEIGHT_MIN, paletteHeightMax(shellHeight)) })),
    resetPaletteHeight: () => setStored((prev) => ({ ...prev, paletteHeight: PALETTE_HEIGHT_DEFAULT })),
  }
}
