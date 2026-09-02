/**
 * **자기 줄을 달라는 것과, 줄이 없는 상자.** 고르개(`panels/type-picker.tsx`·
 * `pattern-picker.tsx`·`preset-picker.tsx`)가 좌측 패널 밖으로 밀려난 고장을 잡는 자리다.
 *
 * ## 무엇이 조용히 깨졌는가
 *
 * `flex-basis: 100%`는 **감싸는 상자에서만** *"내 줄을 하나 달라"*는 뜻이다. `nowrap` 상자에
 * 들어가면 줄이 하나뿐이라 같은 선언이 *"이 줄을 100%로 벌려라"*가 되고, **줄이 상자 밖으로
 * 터진다.** 선언은 유효하고 파싱도 되고 콘솔도 조용하다 — `shell.css`가 여러 번 만난
 * *"렌더는 되는데 틀린"* 부류다(`shell-css-palette.test.ts` 머리말의 `var()` 무효화와 같다).
 *
 * **실제로 그렇게 깨져 있었다.** `.wb-shell-picker`가 `display: flex`인데 `flex-wrap`이
 * 없었고(기본 `nowrap`), `.wb-shell-picker-notice`는 `flex-basis: 100%`였다. 그 짝이
 * 어긋난 것을 **프리셋 적용의 확인 단계**가 드러냈다 — 안내문과 `덮고 적용`·`적용 취소`가
 * 한 줄에 서면서 줄이 터졌다.
 *
 * 240px 툴바를 재현해 Chrome 152에서 잰 값(2026-09-02):
 *
 * | | 수정 전 | 수정 후 |
 * |---|---|---|
 * | `.wb-shell-picker` 폭 | **421px** | 240px |
 * | 사이드바(264px) 밖에서 시작하는 자식 | **4개**(`프리셋 이름`·이름 입력·`현재 페이지를 프리셋으로 저장`·`프리셋 취소`) | 0개 |
 * | `<select>` 폭 | **2px** | 205px |
 *
 * 감싸는 `.wb-shell-region`이 `overflow: auto`라 가로 스크롤로 닿기는 했다. **그래서 더
 * 나쁘다** — 오른쪽에 무언가 있다는 신호가 화면에 없다. 하필 그 화면이 D6의 안전장치라
 * *"덮는다"*는 확인을 안 보이는 버튼으로 받고 있었다.
 *
 * ## 그래서 무엇을 재는가
 *
 * **좌표가 아니라 짝을 잰다.** jsdom에는 레이아웃이 없어 위 표의 수를 여기서 다시 낼 수
 * 없다(`getBoundingClientRect`가 전부 0이다). 대신 위 고장을 만든 **두 선언의 관계**를 본다:
 *
 * > `flex-basis: 100%`로 자기 줄을 요구하는 것은, **감싸는 flex 상자** 안에 있어야 한다.
 *
 * 담김 관계(`OWN_LINE`)는 CSS에 없다 — 마크업에서 읽어 표로 적었고 각 줄이 그 자리를
 * 가리킨다. **그 표가 낡는 것을 4번이 막는다.**
 *
 * 1. **자기 줄을 요구하는 쪽이 정말 그렇게 선언돼 있다.** 표의 전제 절반이다.
 * 2. **담는 상자가 flex이고 감싼다.** 나머지 절반이자 이번에 고친 그 자리다.
 *    `.wb-shell-picker`에서 `flex-wrap: wrap`을 빼거나 `display`를 `block`으로 바꾸면 운다.
 * 3. **`display: flex`가 있으면 `flex-wrap`도 함께 적는다** — 고르개 상자에 한해서다.
 *    `nowrap`을 **고른** 것과 안 적은 것을 가르는 자리다(아래).
 * 4. **표가 완전하다.** `wb-shell-picker*` 클래스 중 자기 줄을 요구하는 것은 전부 표에
 *    있어야 한다. 새로 하나가 생기면 여기서 울고, 적는 사람이 담는 상자를 함께 적게 된다.
 *
 * **3번이 왜 필요한가.** 1·2번은 표에 오른 짝만 본다. 고르개 안에 `flex-basis: 100%`가
 * 없는 새 상자가 생기면 표에 오르지 않고, 그러면 그 상자가 `nowrap`이어도 아무도 안 운다 —
 * 이번 고장의 뿌리는 **`flex-wrap`을 안 적은 것**이지 `flex-basis`가 아니다. 3번은 그
 * 뿌리를 직접 문다. **`nowrap`을 적는 것은 막지 않는다** — 한 줄이 옳은 자리가 있을 수 있고,
 * 그때 이 검사가 요구하는 것은 *"고르개의 한 줄은 고른 것이어야 한다"*뿐이다.
 *
 * ## 이 검사가 보지 못하는 것 — 먼저 읽어라
 *
 * - **위 표의 수를 재지 못한다.** 폭도 좌표도 여기서는 전부 0이다. 이 파일이 잠그는 것은
 *   *"그 값이 나오게 하는 선언들이 짝을 이루고 있는가"*이지 *"그 값이 나오는가"*가 아니다.
 *   **브라우저에서 다시 재야 할 변경이면 이 초록을 근거로 삼지 마라.**
 * - **담김 관계는 사람이 읽은 것이다.** `OWN_LINE`의 `where`가 그 자리를 가리킨다.
 *   마크업이 바뀌어 짝이 달라져도(예: 안내문을 다른 상자로 옮김) 검사는 조용하다 —
 *   4번은 *"표에 있는가"*만 보지 *"표가 맞는가"*를 보지 못한다.
 * - **단축 속성을 펼치지 않는다.** `flex: 1 0 100%`는 `classDeclarations`가 `flex` 하나로
 *   담으므로 4번이 `flex-basis`로는 못 본다 — 그래서 **아래 `wantsOwnLine`이 단축형도 함께
 *   본다.** `shell.css`에 실제로 그 형태가 있다(`.wb-shell-snapshots-desc`, 고르개 밖이다).
 * - **`shell.css` 밖.** 인라인 `style`과 `use-theme-css.ts`의 시트는 읽지 않는다
 *   (`shell-css-guard.ts` 머리말이 그 목록을 갖는다).
 */
import { describe, expect, it } from 'vitest'
import shellCss from '../src/shell.css?raw'
import { classDeclarations } from './shell-css-guard'

/** 이 파일이 보는 범위. 고르개 주변으로 한정한다 — 다른 자리의 같은 짝은 여기 몫이 아니다. */
const SCOPE = 'wb-shell-picker'

/**
 * **자기 줄을 요구하는 것 → 그것을 담는 flex 상자.** 담김 관계는 CSS에 없으므로 마크업에서
 * 읽어 적는다. 같은 클래스가 여러 상자에 담기면 **줄을 여러 개** 적는다 — 상자마다 따로
 * 감싸야 하기 때문이다.
 */
const OWN_LINE: { child: string; container: string; where: string }[] = [
  {
    // 고르개 자체. 툴바 안에서 줄을 통째로 차지한다 — 조작 버튼과 같은 줄에 두면 목록이 잘린다.
    child: 'wb-shell-picker',
    container: 'wb-shell-structure-toolbar',
    where: 'panels/structure-toolbar.tsx — `TypePicker`·`PatternPicker`·`PresetPicker` 셋 다 툴바 `<div>` 안이다',
  },
  {
    // 고르개가 거는 말. **이 짝이 어긋나 있던 것이 이번 고장이다.**
    child: 'wb-shell-picker-notice',
    container: 'wb-shell-picker',
    where: 'panels/preset-picker.tsx(조회 갈래·D6 확인 문장·저장 결과) · pattern-picker.tsx(조회 갈래)',
  },
  {
    // **같은 클래스인데 담기는 상자가 다른 자리.** 타입 고르개는 "고를 것이 없을 때"
    // 상자 없이 `<p>` 하나만 반환하므로 그 `<p>`의 부모가 툴바다.
    child: 'wb-shell-picker-notice',
    container: 'wb-shell-structure-toolbar',
    where: 'panels/type-picker.tsx:45 — `types.length === 0`이면 `<p>` 하나만 반환한다',
  },
]

/**
 * `it.each`가 제목에 그대로 박는 형태. **객체(`$child`)가 아니라 배열인 것이 요점이다** —
 * `$var`는 값을 pretty-format으로 찍어 문자열에 따옴표를 두르므로 제목이
 * ``.'wb-shell-picker'``가 된다. `%s`는 그대로 찍는다.
 *
 * **제목에 `%`를 쓰지 않는다.** 같은 printf 해석이 `flex-basis: 100%`의 `% `를 지정자로
 * 먹고, 그러면 남은 인자가 제목 뒤에 통째로 덧붙는다(실측: 표의 행이 그대로 찍혔다).
 * 그래서 **지정자 수와 인자 수를 맞춘다** — 셋을 다 쓰지 않아도 제목에는 셋을 적는다.
 */
const ROWS = OWN_LINE.map((entry) => [entry.child, entry.container, entry.where] as const)

const DECLARATIONS = classDeclarations(shellCss)

/** 그 클래스의 선언 하나. 규칙이 없으면 `undefined`다 — 부르는 쪽이 그것을 구분해 읽는다. */
function declared(className: string, property: string): string | undefined {
  return DECLARATIONS.get(className)?.get(property)
}

/**
 * **자기 줄을 요구하는가.** `flex-basis: 100%` 그대로와 `flex` 단축형의 셋째 값 둘 다 본다 —
 * `classDeclarations`가 단축형을 펼치지 않으므로(그 머리말) 여기서 함께 물어야 한다.
 *
 * 단축형은 `flex: <grow> <shrink>? <basis>?`라 **마지막 토막이 길이면** 그것이 basis다.
 * 완전한 파서가 아니다: `flex: 100%`(basis 하나만 주는 형태)도 여기서 잡히는데 그것이
 * 의도다 — 결과가 같기 때문이다.
 */
function wantsOwnLine(className: string): boolean {
  if (declared(className, 'flex-basis') === '100%') return true
  const shorthand = declared(className, 'flex')
  if (shorthand === undefined) return false
  return shorthand.split(/\s+/).includes('100%')
}

describe('고르개는 감싼다 — `flex-basis: 100%`와 `flex-wrap`의 짝', () => {
  it('검사가 진짜 shell.css의 고르개 규칙을 읽는다', () => {
    // 경로가 어긋나거나 파서가 헛돌면 아래 표가 통째로 무의미해진다. 실물 값으로 확인한다.
    expect(shellCss).toContain('.wb-shell-picker {')
    expect(declared('wb-shell-picker', 'display')).toBe('flex')
    expect(declared('wb-shell-picker-action', 'cursor')).toBe('pointer')
  })

  describe('1 · 자기 줄을 요구하는 쪽', () => {
    it.each(ROWS)('`.%s` (담는 상자 `.%s`) — %s', (child) => {
      expect(wantsOwnLine(child)).toBe(true)
    })
  })

  describe('2 · 담는 상자는 감싸는 flex다', () => {
    it.each(ROWS)('`.%s`를 담는 `.%s` — %s', (_child, container) => {
      // `display`가 flex가 아니면 `flex-basis`가 아예 아무 뜻이 없다 — 먼저 본다.
      expect(declared(container, 'display')).toMatch(/^(inline-)?flex$/)
      // 이번에 고친 그 자리. 빠지면 기본값이 `nowrap`이고, 그때 위 `flex-basis: 100%`는
      // 자기 줄이 아니라 **줄을 터뜨리는 값**이 된다.
      expect(declared(container, 'flex-wrap')).toBe('wrap')
    })
  })

  it('3 · 고르개의 flex 상자는 flex-wrap 을 고른 채로 적는다', () => {
    // 값이 `nowrap`인 것을 막지 않는다 — 막는 것은 **안 적는 것**이다. 이번 고장의 뿌리가
    // 그것이었다: 아무도 한 줄을 고르지 않았는데 한 줄이 됐다.
    const missing = [...DECLARATIONS]
      .filter(([name, rule]) => name.startsWith(SCOPE) && /^(inline-)?flex$/.test(rule.get('display') ?? ''))
      .filter(([, rule]) => !rule.has('flex-wrap'))
      .map(([name]) => name)

    expect(missing).toEqual([])
  })

  it('4 · 자기 줄을 요구하는 고르개 클래스는 전부 위 표에 있다', () => {
    const listed = new Set(OWN_LINE.map((entry) => entry.child))
    const unlisted = [...DECLARATIONS.keys()]
      .filter((name) => name.startsWith(SCOPE))
      .filter((name) => wantsOwnLine(name))
      .filter((name) => !listed.has(name))

    // 실패하면 이름이 그대로 나온다. 표에 그 클래스를 담는 상자와 함께 더해라 —
    // 그러면 1·2번이 그 짝을 보기 시작한다.
    expect(unlisted).toEqual([])
  })
})
