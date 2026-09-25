/**
 * 누수 검사 — 셸 CSS가 캔버스 안으로 새지 않는지 본다. 규칙과 근거는 `../src/shell.css` 머리말에,
 * 규칙을 기계가 보는 형태는 `./shell-css-guard.ts`에 있다.
 *
 * **왜 테스트인가.** `shell.css` 주석에 `rg` 명령을 적어 두면 사람이 기억해서 돌려야 하는
 * 검사가 되고, 게다가 아래 심기 표의 위반 열넷이 **다 빠져나간다**(`shell-css-guard.ts`
 * 머리말). 테마 CSS가 이 경계 바로 안쪽을 그리므로 `pnpm test`가 계속 본다.
 *
 * 아래 **심기 표가 이 파일의 요점이다.** "검사가 0건을 낸다"는 검사가 일한다는 증거가
 * 아니다 — 위반을 하나씩 심어 **그 위반이 실제로 걸리는지**를 함께 잰다. 반대편(거짓 양성)은
 * `지금 트리에는 위반이 없다`와 음성 대조 표가 본다.
 */
import { describe, expect, it } from 'vitest'
// `?raw`는 vite가 파일 내용을 문자열로 넣어 준다. 경로가 어긋나면 여기서 죽는다 —
// 아래 `검사가 진짜 shell.css를 읽는다`가 내용까지 확인한다.
import shellCss from '../src/shell.css?raw'
import { findViolations, type CheckName } from './shell-css-guard'

/** 심은 위반과, 그것을 물어야 하는 검사. 앞의 열넷은 `rg` 명령으로 재면 "안 잡히는" 형태다. */
const PLANTED: { css: string; check: CheckName }[] = [
  // 상속 속성 — 선택자가 문서 노드를 겨냥하지 않아도 자식으로 물려 내려간다.
  { css: '.wb-shell-canvas-frame { font-weight: 700 }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-surface { font-style: italic }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-surface { list-style: square }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-frame { word-spacing: 4px }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-surface { text-shadow: 0 0 2px red }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-frame { direction: rtl }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-surface { pointer-events: none }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-frame { overflow-wrap: anywhere }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-frame { tab-size: 8 }', check: 'wrapper-property' },
  // `{` 앞에 공백이 없다. `rg` 정규식은 목록에 있는 `color`조차 이 형태에서 놓친다 —
  // 포맷에 매인다는 뜻이다.
  { css: '.wb-shell-canvas-surface{ color: red }', check: 'wrapper-property' },

  // 선택자 — 셸의 상자 안쪽을 겨냥하는 네 형태.
  { css: '.wb-shell-canvas-surface > div { color: red }', check: 'selector-combinator' },
  { css: '.wb-shell-canvas-surface * { color: red }', check: 'selector-combinator' },
  { css: '.wb-shell-canvas-surface :is(div) { color: red }', check: 'selector-function' },
  { css: '[data-wb-id] { color: red }', check: 'selector-prefix' },

  // `rg` 정규식으로도 잡히는 여섯. 파서가 그것을 놓치지 않는지 함께 본다.
  { css: 'div { color: red; }', check: 'selector-prefix' },
  { css: '.wb-shell-canvas-surface .planted { color: red; }', check: 'selector-combinator' },
  { css: '.wb-shell-canvas-frame { font-family: serif; }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-surface { color-scheme: dark; }', check: 'wrapper-property' },
  { css: '.wb-shell-canvas { font-size: 9px; }', check: 'wrapper-property' },
  { css: '.wb-shell { color: red; }', check: 'wrapper-property' },

  // 접두어 없는 커스텀 프로퍼티. 상속 속성이라 문서 안까지 내려간다 — 속성 이름 목록을
  // 훑는 `rg` 정규식은 `--*`를 아예 보지 못한다.
  { css: '.wb-shell { --leak: red; }', check: 'wrapper-variable' },

  // 감싸는 상자가 선택자의 **뒤쪽** 클래스여도 선언은 그 상자에 걸린다.
  { css: '.wb-shell-title.wb-shell-canvas-frame { font-weight: 700; }', check: 'wrapper-property' },

  // 포맷 — 콤마 나열과 줄바꿈. 감싸는 상자가 목록의 **둘째**에 있어도 선언은 그 상자에 걸린다.
  { css: '.wb-shell-title,\n.wb-shell-canvas-frame {\n  font-weight: 700;\n}', check: 'wrapper-property' },
  { css: '.wb-shell-canvas-surface\n  div {\n  color: red;\n}', check: 'selector-combinator' },

  // 접두어 없는 클래스. 테마가 같은 이름을 쓰면 규칙이 문서 노드에 걸린다.
  { css: '.planted { color: red; }', check: 'selector-prefix' },
  { css: '.wb-shell-canvas-surface.planted { position: static; }', check: 'selector-class' },

  // 검사가 읽지 못하는 형태를 조용히 지나가지 않는다.
  { css: '@font-face { font-family: x; src: url(x.woff2); }', check: 'unreadable' },

  // `@keyframes`를 건너뛰되 **그 뒤를 계속 읽는다.** 건너뛰기가 스캔을 멈추는 형태로
  // 구현되면 그 아래 전부가 검사 밖에 놓인다.
  {
    css: '@keyframes wb-shell-spin { from { opacity: 0 } }\n.wb-shell-canvas-frame { font-family: serif }',
    check: 'wrapper-property',
  },
]

/**
 * 걸리면 **안 되는** 것들. 심기 표만 있으면 "무조건 위반이라고 하는 검사"도 전부 통과하므로
 * 반대편을 함께 잰다. 셋째 줄까지는 `shell.css` 머리말이 대상이 아니라고 적은 조각들이다.
 */
const ALLOWED: string[] = [
  // 문서의 **형제**라 상속으로 닿지 않는다. 자기 글자만 갖는다.
  '.wb-shell-canvas-error { font-family: serif; color: red; }',
  '.wb-shell-selection { cursor: pointer; }',
  // 셸이 직접 그리는 조각. 상속 속성을 걸어도 문서가 그 아래 오지 않는다.
  '.wb-shell-header { font-weight: 700; }',
  // 두기로 한 예외 — 접두어가 붙은 변수(`shell.css` 머리말 «상속되는 속성은 문서를 감싸는 상자에 걸지 않는다»의 «예외 — 커스텀 프로퍼티»).
  '.wb-shell { --wb-shell-planted: 1px; }',
  // 허용 목록 안의 속성은 포맷이 어떻든 통과한다.
  '.wb-shell-canvas-frame{background:#fff}',
  '.wb-shell-canvas-surface {\n  min-height: 100px;\n  position: relative;\n}',
  // 접두어 클래스로 시작하는 속성 선택자와 콤마 나열.
  ".wb-shell-mode[aria-pressed='true'] { color: red; }",
  '.wb-shell-title,\n.wb-shell-tools { color: red; }',
  // 안에 규칙을 품는 at-rule은 안으로 들어가서 본다.
  '@media (min-width: 800px) { .wb-shell-canvas-frame { margin: 0 auto; } }',
  // `@keyframes` 안의 `from`·`to`·`50%`는 선택자가 아니다. 규칙으로 세면 정당한 CSS가
  // `` `.wb-shell…`로 시작하지 않는다 ``로 막힌다(건너뛰지 않으면 아래 첫 줄이 2건을 낸다).
  '@keyframes wb-shell-spin { from { opacity: 0 } to { opacity: 1 } }',
  '@keyframes wb-shell-pulse { 0% { opacity: 0 } 50% { opacity: .5 } 100% { opacity: 1 } }',
  '@-webkit-keyframes wb-shell-spin { from { opacity: 0 } to { opacity: 1 } }',
  // `@media` 안에 든 것도 같다(건너뛰지 않으면 1건을 낸다).
  '@media (min-width: 900px) { @keyframes wb-shell-fade { from { opacity: 0 } to { opacity: 1 } } }',
]

describe('shell.css 누수 검사', () => {
  it('검사가 진짜 shell.css를 읽는다', () => {
    // 경로가 어긋나거나 파일이 비면 아래 표가 통째로 헛돈다. 실제 클래스 이름으로 확인한다.
    expect(shellCss).toContain('.wb-shell-canvas-surface {')
    expect(shellCss).toContain('.wb-shell-canvas-frame {')
  })

  it('지금 트리에는 위반이 없다', () => {
    // 실패하면 메시지에 어느 선택자의 무엇인지가 그대로 나온다.
    expect(findViolations(shellCss)).toEqual([])
  })

  describe('위반을 심으면 잡는다', () => {
    it.each(PLANTED)('$check ← $css', ({ css, check }) => {
      const violations = findViolations(`${shellCss}\n${css}\n`)
      expect(violations.map((violation) => violation.check)).toContain(check)
    })
  })

  describe('대상이 아닌 것은 물지 않는다', () => {
    it.each(ALLOWED)('%s', (css) => {
      expect(findViolations(`${shellCss}\n${css}\n`)).toEqual([])
    })
  })

  it('@media 안의 위반도 잡는다', () => {
    const violations = findViolations(
      `${shellCss}\n@media (min-width: 800px) { .wb-shell-canvas-frame { font-weight: 700; } }\n`,
    )
    expect(violations.map((violation) => violation.check)).toContain('wrapper-property')
  })
})
