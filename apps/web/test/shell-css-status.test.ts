/**
 * **빈 상태줄도 자리를 지킨다** — 도구모음 아래 상태줄(`panels/toolbar-status.ts`)의
 * `min-height`와 `line-height`의 짝.
 *
 * ## 무엇이 조용히 깨지는가
 *
 * 이 줄은 상태에 따라 문장이 있기도 없기도 하다(다 켜져 있으면 `''`다 — 회색이 없으면 할
 * 말이 없다). **`min-height`가 없으면 그때 요소가 0px로 접히고**, 툴바 높이가 선택마다
 * 달라진다. 툴바는 `position: sticky; bottom: 0`이라 그 차이가 그대로 **트리 높이의
 * 출렁임**이 된다 — 노드를 하나 고를 때마다 트리가 위아래로 튄다.
 *
 * 렌더는 되고 콘솔은 조용하다. `shell.css`가 여러 번 만난 *"렌더는 되는데 틀린"* 부류다
 * (`shell-css-palette.test.ts`의 `var()` 무효화 · `shell-css-picker.test.ts`의 `flex-basis`).
 *
 * ## 그래서 무엇을 재는가
 *
 * **높이가 아니라 짝을 잰다.** jsdom에는 레이아웃이 없어 `getBoundingClientRect`가 전부
 * 0이다(그 한계는 `shell-css-picker.test.ts` 머리말이 같은 말로 적고 있다). 대신 위 고장을
 * 막는 **두 선언의 관계**를 본다:
 *
 * > 글자가 없어도 **한 줄분**은 남는다 — `min-height`가 있고, 그 값이 `line-height`와 같다.
 *
 * 같아야 하는 이유는 *"한 줄분"*이 곧 그 값이기 때문이다. `min-height`가 더 크면 빈 줄이
 * 문장보다 두꺼워 자리가 흔들리고(반대 방향의 같은 고장), 더 작으면 접힌다.
 *
 * **브라우저에서 잰 값**(Chromium 151.0.7922.34, 셸 격자를 그대로 세워 264px 사이드바 ·
 * 뷰포트 1280×800):
 *
 * | 무엇 | 값 |
 * |---|---|
 * | 상태줄 한 줄 | **15.0px**(`font-size: 11px` · `line-height: 15px`) |
 * | 툴바(상태줄 없음 → 있음) | 89.0px → **108.0px**(+19.0 — 줄 15 + 툴바의 `gap` 4) |
 * | 트리가 보이는 세로(같은 비교) | 258.1px → **239.1px**(−19.0) |
 * | 트리 한 줄 | 22.0px — 그러니까 대가는 **한 행보다 조금 적다** |
 * | 문장 열의 폭 | 101.5~187.1px / 담기는 자리 240px — **열 다 한 줄이고 밖으로 0개** |
 *
 * 30자짜리 이름(`아주아주아주긴이름을가진사람님이 편집 중이라…`)을 넣으면 두 줄 30px이
 * 되고 툴바가 123px이 된다 — **가로로는 그때도 안 넘친다**(228.3 < 240). 자르지 않는 쪽을
 * 고른 값이 그것이다.
 *
 * **그 수는 여기서 다시 낼 수 없다** — 아래 검사가 잠그는 것은 선언의 짝이다.
 *
 * ## 이 검사가 보지 못하는 것
 *
 * - **그 값이 실제로 그렇게 그려지는지는 못 본다.** 폰트 메트릭·상속·다른 규칙의 캐스케이드가
 *   섞이면 결과가 달라진다. 잠그는 것은 *"그 값이 나오게 하는 선언이 짝을 이루는가"*다.
 * - **`gap`은 툴바가 갖는다.** 위 19px 중 4px이 그것인데, 그 값은 상태줄 규칙이 아니라
 *   `.wb-shell-*-toolbar`의 것이고 버튼 줄 사이에도 쓰인다 — 여기서 잠그지 않는다.
 * - **`shell.css` 밖**(인라인 `style`·테마 시트)은 안 읽는다.
 */
import { describe, expect, it } from 'vitest'
import shellCss from '../src/shell.css?raw'
import { classDeclarations } from './shell-css-guard'

/**
 * 상태줄 둘. **구조와 메뉴가 클래스를 나눠 갖는다** — 툴바 규칙 둘이 나뉜 것과 같은 이유다
 * (한쪽의 여백을 고칠 때 다른 쪽이 따라 움직이면 안 된다). 그래서 값도 **각각** 재야 한다.
 */
const STATUS_LINES = ['wb-shell-structure-status', 'wb-shell-menu-status'] as const

const DECLARATIONS = classDeclarations(shellCss)

function declared(className: string, property: string): string | undefined {
  return DECLARATIONS.get(className)?.get(property)
}

describe('상태줄은 글자가 없어도 자리를 지킨다', () => {
  it('검사가 진짜 shell.css의 상태줄 규칙을 읽는다', () => {
    // 경로가 어긋나거나 파서가 헛돌면 아래가 통째로 무의미해진다. 실물 값으로 확인한다.
    expect(shellCss).toContain('.wb-shell-structure-status {')
    expect(declared('wb-shell-structure-status', 'font-size')).toBe('11px')
  })

  it.each(STATUS_LINES)('`.%s` — 한 줄분이 `min-height`로 남는다', (name) => {
    const reserved = declared(name, 'min-height')
    const line = declared(name, 'line-height')

    // 없으면 빈 상태에서 0px로 접힌다.
    expect(reserved).toBeDefined()
    // 같아야 *"한 줄분"*이다 — 크면 빈 줄이 문장보다 두껍고, 작으면 접힌다.
    expect(reserved).toBe(line)
  })

  it.each(STATUS_LINES)('`.%s` — 문장이 길면 감싼다(자르지 않는다)', (name) => {
    // 이유를 잘라 버리면 이 줄을 만든 목적이 없어진다 — 긴 이름의 *"○○님이 편집 중"*이
    // 그 자리다. 두 줄이 되어 툴바가 커지는 쪽을 고른 것이고, 그래서 `min-height`이지
    // `height`가 아니다.
    expect(declared(name, 'height')).toBeUndefined()
    expect(declared(name, 'white-space')).toBeUndefined()
    expect(declared(name, 'text-overflow')).toBeUndefined()
  })

  it('두 상태줄이 같은 값을 든다 — 한쪽만 고치면 화면 반쪽이 다르게 흔들린다', () => {
    // 클래스를 나눈 것은 **따로 고칠 수 있게** 하려는 것이지 지금 달라도 된다는 뜻이 아니다.
    // 지금 둘은 같은 화면의 좌측에 위아래로 서 있다. `flex-basis`는 여기서 안 본다 — 그 값은 담는 상자와의 짝이고
    // (`./shell-css-picker.test.ts`), 두 줄이 담기는 자리가 다르다(메뉴의 줄은 트리 아래에 홀로 선다).
    const [structure, menu] = STATUS_LINES
    for (const property of ['min-height', 'line-height', 'font-size']) {
      expect([property, declared(structure, property)]).toEqual([property, declared(menu, property)])
    }
  })
})
