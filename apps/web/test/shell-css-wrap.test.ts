/**
 * **고르개가 거는 말 두 칸이 긴 라틴 토막에서 상자를 안 터뜨리는가**(P10-2 이월 D).
 *
 * # 무엇이 깨져 있었나
 *
 * `.wb-shell-picker-notice`가 싣는 것 하나가 **사용자가 지은 프리셋 이름**이다
 * (`panels/preset-picker.tsx`의 `프리셋으로 저장했습니다: ${created.name}`). 서버 상한이
 * 1~60자이고 글자 종류에 제약이 없으므로 **공백 없는 라틴 60자가 오늘 그 칸에 들어온다.**
 * 그 칸은 `flex-basis: 100%`인 flex 항목이고 `min-width: auto`가 min-content로 풀리므로,
 * 끊을 수 없는 토막이 오면 항목이 그 폭까지 벌어지고 **줄이 상자 밖으로 나간다.**
 *
 * **실측(Chrome, 264px 사이드바 재현판·내용 폭 240px, 2026-09-03).** 형제인
 * `.wb-shell-picker-desc`와 **같은 수다**:
 *
 * | 값 | 칸 폭 | 넘침 | 상자 가로 스크롤 |
 * |---|---|---|---|
 * | 없음(`normal`) | **397.3px** | **157.3px** | **145px** |
 * | `break-word` | 397.3px | 157.3px | 145px |
 * | **`anywhere`** | **240px** | **0** | **0** |
 *
 * 한글은 전후가 같다(음절 단위로 이미 끊긴다).
 *
 * # 왜 값이 `anywhere`여야 하는가 — 이 파일이 재는 둘째 축
 *
 * `break-word`는 **min-content 크기를 바꾸지 않는다.** 끊을 수 없는 토막의 폭이 그대로
 * 남으므로 `min-width: auto`가 항목을 그 폭까지 벌리고, **선언은 붙는데 넘침은 한 픽셀도
 * 안 줄어든다**(위 표의 둘째 줄이 그 값이다). 셸의 다른 두 자리가 쓰는
 * `word-break: break-word`를 여기 그대로 옮기면 그렇게 된다. 같은 이유로 `anywhere`를
 * 고른 선례가 이미 있다 — `.wb-shell-snapshots-desc`(그쪽은 uuid다).
 *
 * # 형제 둘을 함께 잠그는 것이 첫째 축이다
 *
 * `-desc`는 **지금 도달 불가다**(설명 19개가 전부 한글이고 앞에 붙는 영문 타입명은 열 자
 * 안이다). 그래도 같은 값을 함께 거는 것이 판단이다 — 같은 형태의 두 칸에 다른 답을 두면
 * 다음 사람이 어느 쪽이 옳은지 알 수 없고, 앞 판이 정확히 그 상태에서 **둘을 묶어
 * *"도달 불가"*로 적어** 도달하는 쪽(`-notice`)까지 덮어 버렸다.
 *
 * # 자를 «원문»이 아니라 «값»으로 세웠다
 *
 * `?raw`로 원문을 읽는 형제 파일들(`./shell-css-picker.test.ts` 등)과 다르다. 여기서는
 * **문서에 실린 스타일시트를 지나 `getComputedStyle`로 읽는다** — 그러면 선언이 *실제로
 * 그 클래스에 걸리는지*까지 함께 재진다(원문 읽기는 어느 규칙 안에 있는지를 안 본다).
 * 5차가 자를 세 번 뒤집으며 남긴 규칙이 그것이다: **값이 있는 것은 값으로 잰다.**
 *
 * # 이 자가 못 보는 것 — 정직하게 적는다
 *
 * - **위 표의 수를 못 낸다.** jsdom에는 레이아웃이 없어 폭도 넘침도 여기서는 0이다. 이
 *   파일이 잠그는 것은 *"그 값이 그 칸에 걸린다"*이지 *"넘침이 0이 된다"*가 아니다.
 *   **브라우저에서 다시 재야 할 변경이면 이 초록을 근거로 삼지 마라.**
 * - **클래스와 컴포넌트의 짝은 안 본다.** 그 축은 그 칸을 그리는 쪽이 갖는다
 *   (`panels/type-picker.test.tsx`가 `classList.contains('wb-shell-picker-desc')`를 잰다).
 *   여기서는 클래스 이름을 손으로 든다.
 * - **jsdom의 캐스케이드는 브라우저의 것이 아니다.** 예컨대 선언을 `@media print` 안에
 *   넣어도 여기서는 걸릴 수 있다.
 */
import { afterEach, describe, expect, it } from 'vitest'
import '../src/shell.css'

/**
 * **긴 라틴 토막이 실릴 수 있는 «말 한 줄» 칸들.** 둘은 형태가 같다 —
 * `.wb-shell-picker` 안에서 `flex-basis: 100%`로 자기 줄을 받는 문장이다.
 */
const WRAPPING_BOXES = [
  {
    className: 'wb-shell-picker-notice',
    /** **오늘 도달한다.** 최대 60자, 글자 종류 제약 없음. */
    reach: 'panels/preset-picker.tsx — `프리셋으로 저장했습니다: ${created.name}`(사용자가 지은 이름)',
  },
  {
    className: 'wb-shell-picker-desc',
    /** 지금은 도달 불가다. 형제와 답을 맞추기 위해 함께 든다. */
    reach: 'panels/type-picker.tsx — 카탈로그의 설명 19개가 전부 한글이라 지금은 도달 불가',
  },
] as const

/** 그 클래스가 실제로 받는 `overflow-wrap`. 문서의 스타일시트를 지난 값이다. */
function overflowWrapOf(className: string): string {
  const box = document.createElement('p')
  box.className = className
  document.body.appendChild(box)
  return getComputedStyle(box).overflowWrap
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('고르개의 말 한 줄은 공백 없는 토막에서도 감싼다', () => {
  /**
   * **자가 진짜 스타일시트를 지나는지 먼저 본다.** `css: false`(기본값)면 vitest가 CSS
   * 임포트를 빈 것으로 바꾸고, 그러면 아래가 통째로 *"선언이 없다"*를 재게 된다 —
   * 같은 사고가 `shell-css.test.ts`에 실제로 있었다(그 파일 머리말).
   */
  it('카나리아 — 이 파일이 진짜 shell.css 를 지난다', () => {
    // 이 칸의 다른 선언 둘로 확인한다. 둘 다 이 이월과 무관한 값이라 같이 안 움직인다.
    const box = document.createElement('p')
    box.className = 'wb-shell-picker-notice'
    document.body.appendChild(box)
    const style = getComputedStyle(box)
    expect(style.fontSize).toBe('12px')
    expect(style.flexBasis).toBe('100%')
  })

  /**
   * **값의 축이다.** `break-word`는 min-content를 안 바꿔 이 자리에서 **넘침을 한 픽셀도
   * 못 줄인다**(머리말의 표 둘째 줄). 선언이 붙었다는 것이 재 봤다는 뜻은 아니다.
   *
   * 대상은 **오늘 도달하는 쪽**이다(사용자가 지은 프리셋 이름 최대 60자).
   */
  it('도달하는 칸이 `anywhere` 다 — `break-word` 는 이 자리에서 아무것도 안 한다', () => {
    expect(overflowWrapOf('wb-shell-picker-notice')).toBe('anywhere')
  })

  /**
   * **형제 축이다 — 이월이 *"하나만 고치지 마라"*고 적은 자리다.**
   *
   * `-desc`는 지금 도달 불가지만 형태가 같아, 답이 갈리면 다음 사람이 어느 쪽이 옳은지
   * 알 수 없다. **값을 글자로 다시 적지 않고 «형제와 같다»로 잰다** — 그러면 값을 바꿀 때
   * 위 케이스가 혼자 죽고(어느 축이 깨졌는지가 갈린다), 한쪽만 고치면 이 케이스가 혼자
   * 죽는다.
   */
  it('형제 칸도 같은 답이다 — 한쪽만 고치지 않는다', () => {
    expect(WRAPPING_BOXES.map((box) => box.className)).toHaveLength(2)
    expect(overflowWrapOf('wb-shell-picker-desc')).toBe(
      overflowWrapOf('wb-shell-picker-notice'),
    )
    // **둘이 «없음»으로 같아지는 것을 막는다** — 그러면 이 케이스가 아무것도 안 잰다.
    // 선언이 아예 없을 때 jsdom이 내는 값은 `'normal'`이 아니라 **빈 문자열**이다(쟀다).
    expect(['', 'normal']).not.toContain(overflowWrapOf('wb-shell-picker-desc'))
  })
})
