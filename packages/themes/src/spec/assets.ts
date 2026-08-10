import { z } from 'zod'
import type { ThemeIssue } from '../issue'
import { rejectFunctions } from '../resolve/functions'

/**
 * §6.7의 *"내장 아이콘 세트 중 선택"*이 가리키는 목록.
 *
 * **이 목록은 손으로 적었다.** 아이콘 세트를 등록하는 코드가 없어 카탈로그 대조(Task 4가
 * `listComponents()`로 하는 것) 같은 것을 만들 수 없다. 대신 `test/spec-meta.test.ts`가
 * **§6.7 블록을 읽어 설계가 쓰는 세트 이름이 이 목록 안인지 본다** — 설계가 다른 세트를
 * 쓰기 시작하면 그 케이스가 죽는다. 처음에는 여기 *"설계 문서 전체에서 … 하나뿐"*이라고
 * 적었는데 기계가 지키지 않는 완결성 주장이었다.
 *
 * 자유 문자열로 두지 않은 이유: "내장"은 번들된 리소스를 뜻하므로, 세트가 늘 때 코드가
 * 함께 바뀌어야 한다. 열어 두면 오타가 통과해 렌더 시점까지 간다.
 */
export const ICON_SETS = ['lucide'] as const

/** §6.7. `Media`·`Placeholder`의 표현을 결정한다. */
export const PLACEHOLDER_STYLES = ['skeleton', 'blueprint', 'photo', 'solid'] as const

export interface ThemeFont {
  family: string
  src: string
  weights?: number[]
}

export interface ThemeAssets {
  fonts?: ThemeFont[]
  icons?: (typeof ICON_SETS)[number]
  placeholder?: { style: (typeof PLACEHOLDER_STYLES)[number] }
}

/**
 * `assets`는 **선언을 검증할 뿐 리소스를 가져오지 않는다.** `src`가 실제로 받아지는지,
 * 폰트 파일이 존재하는지는 이 패키지가 확인하지 않는다.
 *
 * **그래도 CSS 문법 검사는 지난다** — P4b-3부터 `src`·`family`가 `@font-face`로 나가므로
 * 아래 `checkAssets`가 탈출 문자와 함수를 본다. *"리소스를 안 가져온다"*와 *"문자열이
 * 안전하다"*는 다른 물음이다.
 *
 * `weights`를 선택으로 둔 것은 가중치를 선언하지 않은 폰트도 의미가 있기 때문이다
 * (브라우저가 합성한다). §6.7의 예시가 셋을 다 갖는 것은 예시가 그럴 뿐이다.
 */
export const AssetsSchema: z.ZodType<ThemeAssets> = z.strictObject({
  fonts: z
    .array(
      z.strictObject({
        family: z.string().min(1),
        src: z.string().min(1),
        weights: z.array(z.int().min(1).max(1000)).optional(),
      }),
    )
    .optional(),
  icons: z.enum(ICON_SETS).optional(),
  placeholder: z.strictObject({ style: z.enum(PLACEHOLDER_STYLES) }).optional(),
})

/**
 * `@font-face`의 `src`가 받는 함수 — **재라 #3의 답의 절반이다.**
 *
 * `spec/assets.ts`는 *"선언을 검증할 뿐 리소스를 가져오지 않는다"*고 적어 두었고 그것은
 * 그대로다. **바뀐 것은 이 값이 CSS로 나간다는 사실**이다(P4b-3 D5 — `compileTheme`이
 * `@font-face`를 낸다). 방출은 값을 **그대로 문자열에 붙이므로**(이 패키지는 CSS 파서를
 * 들이지 않는다) 검증하지 않으면 `src`가 선언과 블록을 끝내고 나갈 수 있다 —
 * `resolve/style.ts`의 `bgImage`가 이미 같은 부류를 다루고 있고 그것과 **같은 규칙**을 쓴다.
 *
 * 넷인 이유: `url()`·`local()`은 §6.7의 `src`가 가리키는 두 꼴이고, `format()`·`tech()`는
 * 그 뒤에 붙는 CSS Fonts 4의 서술자다(`url(x.woff2) format("woff2")`). 넷 다 **중첩되지
 * 않는 자리**에 오므로 `rejectFunctions`의 중첩 금지에 걸리지 않는다.
 *
 * **`;`가 `url()` 안에서만 통과하는 것이 여기서 쓰인다** — `url(data:font/woff2;base64,…)`가
 * 그것을 필요로 한다(`resolve/functions.ts`가 그 예외를 이미 적어 두었다).
 */
export const FONT_SRC_FUNCTIONS = ['url', 'local', 'format', 'tech'] as const

/**
 * `assets`가 CSS로 나갈 수 있는 값인지 본다. 통과하면 빈 배열이다.
 *
 * **`family`는 함수를 하나도 받지 않는다.** 그 자리에 오는 것은 폰트 이름이고
 * (`"Noto Serif KR"`처럼 따옴표가 필요할 수 있어 `rejectDangerousCharacters`가 따옴표를
 * 막지 않고 짝만 본다) 함수 호출이 올 자리가 아니다.
 *
 * **`icons`·`placeholder`는 검사하지 않는다** — 둘 다 `z.enum`이라 값이 닫혀 있고
 * CSS로 나가지 않는다(`placeholder.style`은 P4b-3이 컴파일하지 않는다 — D5).
 */
export function checkAssets(assets: ThemeAssets | undefined): ThemeIssue[] {
  if (assets?.fonts === undefined) return []

  const issues: ThemeIssue[] = []
  assets.fonts.forEach((font, index) => {
    const at = `assets.fonts.${index}`
    issues.push(...rejectFunctions(font.family, [], `${at}.family`, 'family'))
    issues.push(...rejectFunctions(font.src, [...FONT_SRC_FUNCTIONS], `${at}.src`, 'src'))
  })
  return issues
}
