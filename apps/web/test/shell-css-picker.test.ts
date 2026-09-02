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
 * 없었고(기본 `nowrap`), `.wb-shell-picker-notice`는 `flex-basis: 100%`였다.
 *
 * 264px 사이드바를 재현해 고르개 여덟 상태를 Chrome 152에서 전후로 쟀다(2026-09-02):
 *
 * | 상태 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 프리셋 **기본** | 371px · 밖으로 2개 | 240px · 0개 |
 * | 프리셋 **저장 결과** | 388.9px · 밖으로 2개 | 240px · 0개 |
 * | 프리셋 **확인 단계** | 421.3px · 밖으로 5개 · `<select>` 2px | 240px · 0개 · `<select>` 204.9px |
 * | 패턴/프리셋 **안내문 갈래** | 안내문이 버튼에 눌려 183.6·177.2px | 안내문 240px 자기 줄, 버튼 아랫줄 |
 * | 타입·패턴 **목록** | 240px 한 줄 | **똑같다** |
 *
 * **넘친 것은 확인 단계만이 아니다** — 프리셋 고르개는 기본 상태에서 이미 371px였다.
 * 확인 단계는 가장 크게 벌린 방아쇠이지 유일한 원인이 아니다. 그리고 하필 그 화면이 D6의
 * 안전장치라 *"덮는다"*는 확인을 안 보이는 버튼으로 받고 있었다.
 *
 * 감싸는 `.wb-shell-region`이 `overflow: auto`라 가로 스크롤로 닿기는 했다. **그래서 더
 * 나쁘다** — 오른쪽에 무언가 있다는 신호가 화면에 없다.
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
 * 3. **고르개의 flex 상자는 감싼다** — 아니면 `ONE_LINE`에 *왜 한 줄이어야 하는지*가
 *    적혀 있어야 한다. 이 둘 말고 셋째 길은 없다. **3-b**가 그 면제가 낡지 않았는지 되본다.
 *    1·2번이 표에 오른 짝만 보는 데 비해 3번은 **범위 안의 모든 flex 상자**를 본다 —
 *    이번 고장의 뿌리는 `flex-wrap`이 없던 것이지 `flex-basis`가 아니었다.
 * 4. **표가 완전하다.** 범위 안에서 자기 줄을 요구하는 것은 전부 표에 있어야 한다.
 *    새로 하나가 생기면 여기서 울고, 적는 사람이 담는 상자를 함께 적게 된다.
 *
 * **범위는 접두어가 아니라 부류다**(`SCOPE`). 앞 판은 `'wb-shell-picker'` 접두어였고, 그래서
 * **똑같은 형태로 서 있던 `.wb-shell-menu-picker`가 검사 밖이었다** — 고친 인스턴스 하나만
 * 잠그고 부류는 열어 둔 상태였다. 그 상자에도 감싸기를 주고 범위를 넓혔다.
 *
 * **3번이 왜 필요한가.** 1·2번은 표에 오른 짝만 본다. 고르개 안에 `flex-basis: 100%`가
 * 없는 새 상자가 생기면 표에 오르지 않고, 그러면 그 상자가 `nowrap`이어도 아무도 안 운다 —
 * 이번 고장의 뿌리는 **`flex-wrap`을 안 적은 것**이지 `flex-basis`가 아니다. 3번은 그
 * 뿌리를 직접 문다.
 *
 * **한 줄인 것을 `flex-wrap: nowrap` 선언으로 말할 수는 없다 — `ONE_LINE`에 적어야 한다.**
 * 앞 판은 *"선언이 있기만 하면 통과"*였고, 실측이 그 구멍을 보였다: `.wb-shell-menu-picker`의
 * 감싸기를 `flex-flow: column nowrap`으로 바꿔도 **12케이스 전부 초록**이었다. 선언의
 * 있고 없음은 사람이 **골랐다는 것**을 뜻하지 *재 봤다는 것*을 뜻하지 않는다. 그래서 셋째
 * 길을 막고, 한 줄이 옳다는 주장은 근거를 적게 했다 — 그 표의 머리말이 *"재라"*고 말한다.
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

/**
 * 이 파일이 보는 범위 — **고르개라는 부류 전체다.**
 *
 * **앞 판은 `'wb-shell-picker'` 접두어였고 그것이 너무 좁았다.** 그때 이 범위에 든 flex
 * 상자는 `.wb-shell-picker` **하나**였다. 그 사이 `.wb-shell-menu-picker`가 **똑같은 형태로**
 * 서 있었는데(`display: flex` + 자기 `flex-basis: 100%` + 감싸기 없음) 접두어가 달라
 * 검사에 안 들어왔다 — 즉 검사가 **고친 인스턴스 하나만 잠그고 부류는 열어 둔 상태**였다.
 *
 * 이름에 `picker`가 든 것으로 넓히면 flex 상자가 다섯이 된다. 그중 셋은 아래
 * `ONE_LINE`이 받는다.
 */
const SCOPE = /picker/

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
  {
    // 소속 메뉴 고르개. **오늘 자식에 `flex-basis: 100%`가 없어 안 터진다** — 그래서
    // 아래 2번이 무는 것은 이 상자가 **자기** 줄을 받는 쪽이다(툴바가 감싸야 한다).
    child: 'wb-shell-menu-picker',
    container: 'wb-shell-menu-toolbar',
    where: 'panels/menu-toolbar.tsx:139 — `MenuPicker`가 메뉴 툴바 `<div>` 안이다',
  },
]

/**
 * **감싸지 않아도 되는 것이 확인된 flex 상자.** 아래 3번은 *감싸거나, 여기 근거가 있거나*
 * 둘 중 하나를 요구한다.
 *
 * **판정 기준은 "한 줄이 예쁜가"가 아니라 원래 고장의 기전이 성립하는가다.** 그 기전은
 * 이것 하나다:
 *
 * > **줄어들 수 없는 자식들의 min-content 폭 합이 담기는 자리보다 크다.**
 *
 * `.wb-shell-picker`가 그랬다 — 프리셋 기본 상태의 자식 일곱 중 다섯이 auto 폭이고
 * 그 합이 240을 넘었다(371px). 감싸기가 그것을 고친 이유는 넘치는 것을 **다음 줄로**
 * 보내기 때문이다. **자식이 전부 줄어들 수 있으면 애초에 넘칠 것이 없고, 그때 감싸기는
 * 아무것도 하지 않는다** — 아래 셋이 그 경우이고, 셋 다 감싸기를 줘 보고 확인했다.
 *
 * **앞 판의 근거 셋은 전부 틀렸고 하나는 반증됐다.** `menu-picker-label`에 *"나뉘면 라벨이
 * 자기 select와 갈린다"*고 적었는데 리뷰가 감싸기를 줘 보니 **아무 변화가 없었다.** 나머지
 * 둘은 `shell.css` 주석의 *"셸 머리의 `flex-wrap`이 자리를 만들어 준다"*를 인용했는데,
 * **그것이 바로 이 커밋이 폐기한 부모-자식 혼동이다** — 부모가 감싼다는 것은 그 상자가
 * *자기 줄*을 받는다는 뜻이지 그 **안**이 안 넘친다는 뜻이 아니다. 결론은 셋 다 맞았지만
 * 근거가 셋 다 다른 말을 하고 있었다.
 *
 * **CSS를 고쳐 `flex-wrap: nowrap`을 적는 길은 택하지 않았다.** 셋 다 이번 고장과 무관한
 * 자리이고(고르개 밖이다) 손대면 이 라운드가 잠그려는 것과 다른 것을 바꾸게 된다.
 *
 * **여기 이름을 더하는 것은 "검사를 끄는 것"이다.** 더하기 전에 **그 상자에 감싸기를 줘
 * 보고 정말 아무것도 안 바뀌는지 브라우저에서 재라.** 이 표는 잰 것을 적는 자리이지 초록을
 * 만드는 자리가 아니다 — 위의 반증이 정확히 그렇게 들어온 줄이었다.
 */
const ONE_LINE: { name: string; why: string }[] = [
  {
    name: 'wb-shell-menu-picker-label',
    why: '자식 둘이 다 줄어든다 — `<select>`에 `min-width: 0`, 라벨은 한국어 텍스트라 아무 데서나 끊긴다. 감싸기를 줘 봤고 아무것도 안 바뀌었다(리뷰 실측: 앞 판이 적은 "나뉘면 select와 갈린다"를 그 실측이 반증했다)',
  },
  {
    name: 'wb-shell-theme-picker',
    why: '같은 이유로 넘칠 것이 없다 — 자식이 라벨 텍스트와 `<select>`뿐이다. 감싸기를 줘 봐도 안 넘치고 높이만 21→32px로 늘었다(리뷰 실측: 자식에 `flex-basis: 100%`를 심어 본 판)',
  },
  {
    name: 'wb-shell-theme-picker-group',
    why: '같다 — 고르개와 편집 링크 둘 다 줄어든다. 다만 **`theme.meta.name`이 길면 이 줄이 실제로 넘친다** — 그것은 감싸기로 안 고쳐지고 원인이 다르다(P10-2 이월 §3.12 D)',
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

/** `flex-flow` 안에 올 수 있는 `flex-wrap` 값. 나머지 토막은 `flex-direction`이다. */
const WRAP_KEYWORDS = new Set(['wrap', 'nowrap', 'wrap-reverse'])

/**
 * **이 상자의 `flex-wrap` 값.** 안 적었으면 `undefined`다 — 기본값 `nowrap`과 **가르는 것이
 * 요점이라** 여기서 `'nowrap'`으로 채우지 않는다(3번이 그 차이를 문다).
 *
 * **`flex-flow: row wrap`도 함께 본다.** `classDeclarations`의 머리말이 *"부르는 쪽이 자기가
 * 보는 속성의 단축형을 알고 함께 물어야 한다"*는 규칙을 세웠는데, 앞 판은 `flex` 단축형만
 * 지키고 `flex-wrap` ↔ `flex-flow`에서 그것을 빠뜨렸다. 그래서 **뜻이 같은 CSS를 써도
 * 2·3번이 울었다**(리뷰 실측: `flex-flow: row wrap`으로 바꾸니 2 failed | 7 passed).
 *
 * 검사의 **안전한 방향으로 틀린 것**이었다 — 없는 위반을 부르는 쪽이라 고장을 놓치지는
 * 않았다. 그래도 막지 않고 고친 것은 **여기서 끝나기 때문이다**: 규칙은 이 파일이 이미
 * 세워 놨고 `wantsOwnLine`이 그 형태를 하고 있어, 같은 모양을 하나 더 두는 것으로 끝난다.
 * `classDeclarations` 쪽에서 단축형을 펼치려면 속성마다 문법을 아는 표가 필요하고 그 표가
 * 낡는 값이 훨씬 크다(그쪽 머리말이 그 판단을 갖는다).
 *
 * **둘 다 적혀 있으면 소스에서 뒤에 오는 것이 이긴다** — 캐스케이드가 그렇고,
 * `classDeclarations`가 `Map`의 삽입 순서로 소스 순서를 보존하므로 그대로 읽을 수 있다.
 * 오늘 `shell.css`에 `flex-flow`는 0건이다(검산: `grep -n 'flex-flow' apps/web/src/shell.css`).
 */
function resolvedWrap(className: string): string | undefined {
  let wrap: string | undefined
  for (const [property, value] of DECLARATIONS.get(className) ?? []) {
    if (property === 'flex-wrap') wrap = value
    else if (property === 'flex-flow') {
      wrap = value.split(/\s+/).find((token) => WRAP_KEYWORDS.has(token)) ?? wrap
    }
  }
  return wrap
}

/** 이 클래스가 flex 상자인가. `flex-basis`는 상자가 flex가 아니면 아무 뜻이 없다. */
function isFlexBox(className: string): boolean {
  return /^(inline-)?flex$/.test(declared(className, 'display') ?? '')
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
      expect(isFlexBox(container)).toBe(true)
      // 이번에 고친 그 자리. 빠지면 기본값이 `nowrap`이고, 그때 위 `flex-basis: 100%`는
      // 자기 줄이 아니라 **줄을 터뜨리는 값**이 된다.
      expect(resolvedWrap(container)).toBe('wrap')
    })
  })

  it('3 · 고르개의 flex 상자는 감싸거나, 한 줄인 근거가 적혀 있다', () => {
    // **`flex-wrap: nowrap`을 적는 것으로는 빠져나갈 수 없다.** 앞 판은 *"안 적는 것만
    // 막는다"*였는데, 그러면 `.wb-shell-menu-picker`의 감싸기를 `nowrap`으로 바꿔도 검사가
    // 조용했다(실측: 12 통과). 그것은 부류를 닫은 것이 아니라 **선언이 있는지만** 본 것이다.
    // 지금은 감싸든가 `ONE_LINE`에 근거를 적든가 둘 중 하나여야 한다.
    const excused = new Set(ONE_LINE.map((entry) => entry.name))
    const unwrapped = [...DECLARATIONS.keys()]
      .filter((name) => SCOPE.test(name) && isFlexBox(name))
      .filter((name) => resolvedWrap(name) !== 'wrap')
      .filter((name) => !excused.has(name))

    // 실패하면 이름이 그대로 나온다. 감싸야 하면 `flex-wrap: wrap`을 적고, 한 줄이 옳다면
    // 그것을 **재서 확인한 뒤** `ONE_LINE`에 근거와 함께 적어라.
    expect(unwrapped).toEqual([])
  })

  it('3-b · `ONE_LINE`의 면제는 아직 필요한 것만 남는다', () => {
    // 면제는 조용히 낡는다 — 그 클래스가 flex 상자를 그만두거나 감싸기를 갖게 되면 이 줄은
    // 아무것도 면제하지 않으면서 "여기는 한 줄이 옳다"고 계속 말한다. 그 죽은 줄을 문다.
    const stale = ONE_LINE.filter(
      (entry) => !isFlexBox(entry.name) || resolvedWrap(entry.name) === 'wrap',
    ).map((entry) => entry.name)

    expect(stale).toEqual([])
  })

  it('4 · 자기 줄을 요구하는 고르개 클래스는 전부 위 표에 있다', () => {
    const listed = new Set(OWN_LINE.map((entry) => entry.child))
    const unlisted = [...DECLARATIONS.keys()]
      .filter((name) => SCOPE.test(name))
      .filter((name) => wantsOwnLine(name))
      .filter((name) => !listed.has(name))

    // 실패하면 이름이 그대로 나온다. 표에 그 클래스를 담는 상자와 함께 더해라 —
    // 그러면 1·2번이 그 짝을 보기 시작한다.
    expect(unlisted).toEqual([])
  })
})
