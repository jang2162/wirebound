/**
 * **코드가 붙인 클래스에 `shell.css` 규칙이 있는가.** 규칙을 기계가 보는 형태는
 * `./shell-css-coverage.ts`에 있고, **무엇을 못 보는지도 그 파일 머리말이 갖는다.**
 *
 * `shell-css.test.ts`와 짝이다. 그쪽은 *"셸 규칙이 캔버스 안으로 새는가"*(D7)를 보고
 * 이쪽은 *"규칙이 없어 조용히 무스타일이 되는가"*를 본다. 두 방향이 다 필요한 이유는
 * `shell.css`가 **요소 선택자를 쓰지 않기** 때문이다 — 클래스가 유일한 연결 고리라
 * 한쪽이 끊기면 아무것도 실패하지 않은 채 화면만 브라우저 기본이 된다.
 *
 * 아래 두 표가 이 파일의 요점이다. **"지금 트리에 빠진 것이 없다"는 검사가 일한다는
 * 증거가 아니다** — 규칙을 지운 소스를 심어 *걸리는지*, 대상이 아닌 것을 심어 *안 무는지*
 * 를 함께 잰다.
 */
import { describe, expect, it } from 'vitest'
import shellCss from '../src/shell.css?raw'
import { ruledClasses } from './shell-css-guard'
import { findUncoveredClasses, shellClassesInSource } from './shell-css-coverage'

/**
 * `apps/web/src`의 `.ts`·`.tsx` 전부를 **원문 문자열로** 든다.
 *
 * **`node:fs`로 읽지 않는 이유가 있다.** 이 프로젝트는 jsdom에서 돌고
 * (`vitest.config.ts`의 `web`), 거기서는 `import.meta.url`이 `file:` 이 아니라
 * `fileURLToPath`가 던진다(실측: `TypeError: The URL must be of scheme file`).
 * `process.cwd()`로 우회하면 **어디서 vitest를 띄웠느냐에 검사가 매인다.**
 * `import.meta.glob`은 vite가 **설정 파일 기준으로** 풀어 주므로 그 의존이 없고,
 * `shell.css?raw`가 이미 쓰는 것과 같은 기전이다.
 *
 * **`?raw`라 모듈이 실행되지 않는다** — `src` 전부를 import 하지만 부작용이 없다.
 */
const RAW = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** `[파일 이름, 원문]` 짝. 이름은 실패 메시지에만 쓰인다. */
const SOURCES: [string, string][] = Object.entries(RAW)
  .map(([path, source]): [string, string] => [path.replace(/^\.\.\/src\//, ''), source])
  .sort(([a], [b]) => (a < b ? -1 : 1))

const RULED = ruledClasses(shellCss)

/**
 * 규칙이 있어야 하는데 없는 소스. **`className`으로 붙는 네 형태를 하나씩 심는다** —
 * 특히 셋째(`className:` 객체 리터럴)가 이번 사고에서 `.wb-shell-control`을 통째로
 * 빠져나가게 한 형태다.
 */
const PLANTED: { label: string; source: string }[] = [
  { label: 'JSX 속성', source: `<div className="wb-shell-planted" />` },
  { label: '한 줄에 여럿', source: `<div className="wb-shell-panel wb-shell-planted" />` },
  {
    label: '객체 리터럴(`text-control.tsx`의 형태)',
    source: `const shared = { id, className: 'wb-shell-planted', value: draft }`,
  },
  { label: '중괄호 안의 리터럴', source: `<div className={'wb-shell-planted'} />` },
  { label: '백틱', source: '<div className={`wb-shell-planted`} />' },
  {
    label: '조건식의 **뒤쪽** 가지 — 첫 리터럴만 보고 끝내면 놓친다',
    source: `<div className={on ? 'wb-shell-panel' : 'wb-shell-planted'} />`,
  },
  { label: '따옴표 종류가 섞인 자리', source: `<div className='wb-shell-planted' />` },
  { label: '줄바꿈이 낀 자리', source: `<div\n  className="wb-shell-planted"\n/>` },

  // ── 리뷰가 뚫은 구멍(N1)을 고정하는 넷 ────────────────────────────────────────────
  // 앞 판은 `className:`의 값이 `{`·따옴표가 **아니면** 그 자리를 통째로 버렸다. JSX 속성은
  // 문법상 늘 둘 중 하나라 무사했지만 객체 속성은 아니다. 아래 셋이 그 가지를 밟는다.
  {
    label: '[N1] 객체 리터럴의 값이 조건식 — 리뷰가 실증한 형태',
    source: `const s = { className: on ? 'wb-shell-panel' : 'wb-shell-planted' }`,
  },
  {
    label: '[N1] 객체 리터럴의 값이 함수 호출',
    source: `const s = { id, className: cls('wb-shell-panel', 'wb-shell-planted'), value }`,
  },
  {
    label: '[N1] 객체 리터럴의 값이 논리 연산 — 뒤에 다른 속성이 이어진다',
    source: `const s = { className: on && 'wb-shell-planted', onBlur: commit }`,
  },
  {
    // 리뷰가 실제 파일(`text-control.tsx:85`)에 심었던 그 형태 그대로.
    label: '[N1] 리뷰가 심은 그 줄 — `isTextarea ? … : …`',
    source: `    className: isTextarea ? 'wb-shell-planted' : 'wb-shell-control',`,
  },

  // ── 리뷰가 "잡힌다"고 확인한 둘. 되돌아가지 않게 고정한다 ─────────────────────────
  {
    // 리뷰: 워커의 실증이 planted 를 늘 **맨 뒤**에 놓았다. 가운데도 잡히는지 못박는다.
    label: '[리뷰] 한 문자열 안 여러 클래스 중 **가운데** 토큰',
    source: `<div className="wb-shell-interaction wb-shell-planted wb-shell-panel-subtitle" />`,
  },
  {
    label: '[리뷰] 값이 문자열 이어붙이기여도 리터럴 조각은 읽는다',
    source: `const s = { className: 'wb-shell-planted' + suffix }`,
  },
]

/**
 * **값을 조립하는 형태는 못 본다** — `readValue`가 잘라 온 조각에 리터럴이 있어도 그것이
 * 최종 클래스 이름이 아니기 때문이다. 못 보는 것 목록의 한 줄을 케이스로 고정한다.
 * (`shell-css-coverage.ts` 머리말의 "값이 실행 시점에 만들어지는 클래스".)
 */
const NOT_SEEN: { label: string; source: string }[] = [
  {
    label: '이름을 조립하면 못 본다 — 템플릿 보간',
    source: 'const s = { className: `wb-shell-${kind}` }',
  },
  {
    label: '이름을 조립하면 못 본다 — 접두어 상수 + 조각',
    source: `const s = { className: PREFIX + 'planted' }`,
  },
  {
    // ★ **이 케이스가 `=` 가지를 안 넓힌 결정의 유일한 자물쇠다** (델타 리뷰 B2).
    //
    // 닻과 무관하게 fallback 을 넓힌 판에 이 소스를 먹이면 `["wb-shell-planted"]` 가 나온다
    // (지금 구현은 `[]`). 위 `ALLOWED` 의 JSX 케이스 셋은 두 구현에서 결과가 같아 이 결정을
    // 재지 못한다 — 그 사실은 그쪽 주석에 적었고, 근거 전문은 `shell-css-coverage.ts` 의
    // `readValue` 머리말에 있다.
    //
    // **그러므로 이 줄이 `[]` 를 내는 것은 "못 본다"인 동시에 "안 넓혔다"의 증거다.**
    // 나중에 대입까지 덮기로 한다면(줄바꿈을 종결자로 더하는 것이 이 저장소에 맞는 유일한
    // 수단이다) 이 케이스가 먼저 깨지고, 그때 그 결정을 다시 읽게 된다.
    label: '`className = 식` 대입은 못 본다 (JSX 속성이 아니다)',
    source: `element.className = on ? 'wb-shell-planted' : ''`,
  },
]

/**
 * 물면 **안 되는** 것들. 심기 표만 있으면 "무조건 위반이라고 하는 검사"도 전부 통과하므로
 * 반대편을 함께 잰다.
 */
const ALLOWED: { label: string; source: string }[] = [
  {
    // **이 넷이 진짜로 저장소에 있는 형태다**(`preset-picker`·`pattern-picker`·`type-picker`).
    // D7이 id 선택자를 금지하므로 여기에 규칙이 있으면 오히려 틀린 것이다.
    label: '`id`·`htmlFor`로 쓰는 이름은 클래스가 아니다',
    source: `<label htmlFor="wb-shell-preset-name" /><select id="wb-shell-preset-name" />`,
  },
  {
    // `theme/use-theme-css.ts`·`theme/draft-css.ts`가 접두어 문자열을 상수로 든다.
    label: '접두어 문자열 상수',
    source: `const SHELL_PREFIX = 'wb-shell-'\nif (name.startsWith('wb-shell-')) return`,
  },
  {
    label: '접두어가 없는 클래스는 이 검사의 대상이 아니다',
    source: `<div className="planted other-thing" />`,
  },
  {
    label: '규칙이 있는 클래스',
    source: `<div className="wb-shell-panel wb-shell-panel-title" />`,
  },
  {
    label: '주석 안의 클래스 이름도 `className` 자리가 아니면 안 센다',
    source: `// .wb-shell-planted 는 아직 없다\n<div className="wb-shell-panel" />`,
  },
  {
    label: '넘겨받는 `className`은 값이 리터럴이 아니다 — 부르는 쪽이 대신 걸린다',
    source: `<section className={props.className} />`,
  },
  // ── 아래 셋의 귀속을 바로잡는다 (델타 리뷰 B2) ──────────────────────────────────
  //
  // **이 셋은 `=` 결정도 `;` 종결자도 재지 못한다.** 세 구현(지금 것 / 닻과 무관하게 넓힌 것
  // / `;`를 종결자에서 뺀 것)에 셋을 다 먹여 봤고 **아홉 결과가 전부 같았다.** 즉 실패할 수
  // 없는 케이스다 — 앞 판은 이 자리에 *"`=` 가지를 안 넓힌 근거"*라고 적고 있었고 그것은
  // 틀렸다(애초에 `htmlFor` 삼킴이 일어나지 않는다. `shell-css-coverage.ts`의 `readValue`
  // 머리말에 그 자취를 남겼다).
  //
  // **`=` 결정을 잠그는 것은 아래 `NOT_SEEN` 3번이다.**
  //
  // 그래도 셋을 두는 값은 있다: `id`·`htmlFor` 로 쓰는 `wb-shell-…` 이름 넷을 클래스로 세지
  // 않는다는 성질(이 스캐너 설계의 요점이고 "32가 아니라 28"이 거기서 나왔다)이 **닻 정규식이
  // 넓어지는 어떤 변경에도** 지켜지는지를 본다. 재는 대상이 `=` 결정이 아니라 **닻의 좁기**다.
  {
    label: '[닻] JSX 속성 뒤에 `htmlFor` 로 온 `wb-shell-…` 이름은 클래스가 아니다',
    source: `<label className="wb-shell-picker-label" htmlFor="wb-shell-preset-name">이름</label>`,
  },
  {
    label: '[닻] `id` 가 앞에 와도 클래스로 세지 않는다',
    source: `<select id="wb-shell-picker-type" className="wb-shell-picker-select" />`,
  },
  {
    // 타입 자리(`routes/editor.tsx`·`theme/theme-issues.tsx`)에 실재하는 형태.
    label: '[닻] 타입 자리의 `className: string` 은 값에 리터럴이 없다',
    source: `function ShellRegion(props: { className: string; name: string }): ReactElement {}`,
  },
]

describe('shell.css 커버리지 — 코드가 붙인 클래스에 규칙이 있는가', () => {
  it('검사가 진짜 shell.css와 진짜 소스를 읽는다', () => {
    // 어느 한쪽이 비면 아래 표가 통째로 헛돈다. `shell-css.test.ts`의 카나리아와 같은 자리다.
    expect(RULED.has('wb-shell-canvas-surface')).toBe(true)
    expect(RULED.size).toBeGreaterThan(100)
    expect(SOURCES.length).toBeGreaterThan(30)
    expect(SOURCES.map(([file]) => file)).toContain('panels/controls/text-control.tsx')
  })

  it('지금 트리에는 규칙이 없는 클래스가 없다', () => {
    // 실패하면 메시지에 클래스 이름과 그것을 쓰는 파일이 그대로 나온다.
    expect(findUncoveredClasses(SOURCES, RULED)).toEqual([])
  })

  it('다섯 위젯이 공유하는 `.wb-shell-control`을 실제로 본다', () => {
    // **이 한 자리가 이번 사고의 최대 범위였다** — `text-control.tsx`가 `className:`으로
    // 붙이므로 `className=`만 보는 검사는 여기를 통째로 지나친다. 위 표의 심기가 그 형태를
    // 재지만, 진짜 파일에서도 그런지는 여기서 본다.
    const [, source] = SOURCES.find(([file]) => file === 'panels/controls/text-control.tsx') ?? []
    expect(source).toBeDefined()
    expect(shellClassesInSource(source ?? '')).toContain('wb-shell-control')
  })

  describe('규칙 없는 클래스를 심으면 잡는다', () => {
    it.each(PLANTED)('$label', ({ source }) => {
      const uncovered = findUncoveredClasses([['planted.tsx', source]], RULED)
      expect(uncovered.map((item) => item.className)).toContain('wb-shell-planted')
    })
  })

  describe('대상이 아닌 것은 물지 않는다', () => {
    it.each(ALLOWED)('$label', ({ source }) => {
      expect(findUncoveredClasses([['planted.tsx', source]], RULED)).toEqual([])
    })
  })

  describe('못 보는 것 — 이 표가 통과하는 것이 검사가 약하다는 증거다', () => {
    // **거꾸로 읽는 표다.** 위 두 표는 검사가 일한다는 증거이고, 이것은 **어디까지만
    // 일하는지**를 값으로 고정한다. 여기 있는 형태를 나중에 잡게 되면 이 케이스가 깨지고,
    // 그때 머리말의 "못 보는 것"에서 그 줄을 지우게 된다.
    it.each(NOT_SEEN)('$label', ({ source }) => {
      expect(shellClassesInSource(source)).toEqual([])
    })
  })

  it('CSS에서 규칙을 지우면 그 클래스가 걸린다', () => {
    // **반대 방향의 심기다.** 위 표는 소스를 건드리고 여기는 CSS를 건드린다 — 규칙 하나가
    // 사라지는 것이 실제 사고의 모양이기 때문이다(리팩터링 중에 규칙만 지워지는 것).
    const withoutRule = shellCss.replace(/\.wb-shell-panel-title\s*\{[^}]*\}/, '')
    expect(withoutRule).not.toBe(shellCss)

    const ruled = ruledClasses(withoutRule)
    expect(ruled.has('wb-shell-panel-title')).toBe(false)
    expect(findUncoveredClasses(SOURCES, ruled).map((item) => item.className)).toContain(
      'wb-shell-panel-title',
    )
  })

  it('안 쓰이는 규칙은 잡지 않는다 — 방향이 코드 → CSS 한쪽이다', () => {
    // 개발 중간에 규칙을 먼저 쓰고 마크업을 나중에 붙이는 것을 막지 않는다(머리말의 근거).
    const withExtra = `${shellCss}\n.wb-shell-not-used-yet { color: red }\n`
    expect(findUncoveredClasses(SOURCES, ruledClasses(withExtra))).toEqual([])
  })
})
