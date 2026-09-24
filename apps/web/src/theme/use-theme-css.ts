import { useLayoutEffect, useMemo } from 'react'
import { structureBaseCss } from '@wirebound/renderer'
import { compileTheme, resolveTheme, type ResolvedTheme } from '@wirebound/themes'
import { defaultThemeSource, type ThemeSource } from './theme-source'
/**
 * **테마 해석이 카탈로그를 읽는다.** `checkThemeComponents`가 `getComponent`로 컴포넌트
 * 선언을 찾아 `structures`·`parts`·`variants`·`states`를 대조하므로(설계서 「컴포넌트 정의 구조」의
 * 어휘), 설치 전에 부르면 **모든 컴포넌트가 `unknown-component`가 되어 테마가 통째로 이슈**가
 * 된다. 심어서 본 것이 아니라 실제 실패의 모양이다 — 이 import를 빼면 테마가 컴포넌트마다
 * 이슈를 내고 화면이 기본 스타일로 떨어진다.
 *
 * `catalog-setup`은 import만으로 설치가 끝난다(그 모듈의 주석 참고).
 */
import '../catalog-setup'

/**
 * `<style>` 둘의 이름. **순서가 계약이므로 이름으로 자리를 잡는다** — 매번 지웠다 새로
 * 만들면 순서가 뒤집힐 수 있고, 태그를 찾을 수 없으면 두 번째 렌더가 셋째 태그를 만든다.
 */
export const STRUCTURE_STYLE_ID = 'structure'
export const THEME_STYLE_ID = 'theme'

/**
 * 구조 기본 CSS와 컴파일된 테마 CSS를 `document.head`에 싣는다.
 *
 * ---
 *
 * **시트가 둘이고 순서가 고정이다.** 구조 기본 CSS가 먼저, 테마 CSS가 나중.
 * 같은 특이도에서 나중에 온 규칙이 이기므로 **이 순서가 곧 "테마가 이긴다"**이다
 * (그 캐스케이드는 `packages/renderer/test/structure-css.test.ts`가 계산된 스타일로 쟀다).
 * 한 장으로 합치지 않는 이유 둘: **테마가 없을 때 구조 기본 CSS만 남아야** 하고,
 * 재컴파일 대상이 뒤쪽뿐이다.
 *
 * **자리는 `document.head`다.** 캔버스 안에 넣어도 **범위가 좁아지지 않는다** — CSS는
 * 삽입 위치로 범위를 갖지 않는다. 캔버스 안쪽에 넣은 시트가 바깥 요소에 그대로 걸린다
 * (jsdom: `test/theme/use-theme-css.test.tsx` · 실제 브라우저에서도 같다).
 * 좁아지지 않을 바에는 내보낸 번들이 테마 CSS를 싣는 자리(설계서 「컴파일」)와 같은 곳이 낫다.
 *
 * **던지지 않는다.** `resolveTheme`이 **`error`를 내면** 테마 CSS를 비우고 구조 기본 CSS만
 * 남긴다 — 테마가 깨진 것과 화면이 사라지는 것은 다른 일이다. **경고만 있으면 CSS는
 * 그대로 나가고 콘솔에 남는다**(아래 `compileOnce`의 두 분기).
 *
 * > **`compileOnce`의 분기를 바꾸면 위 문장도 함께 고친다.** 본문(경고 분기)만 고치고
 * > 머리말을 두면 머리말이 조용히 거짓이 된다 — 여기서는 *"`error`를 내면"*과
 * > *"이슈를 내면"*이 그 갈림이다(`packages/themes/src/resolve/style.ts`도 같은 부류다).
 *
 * **`useLayoutEffect`인 이유:** `useEffect`로 넣으면 **한 프레임이 CSS 없이 그려진다.**
 * 레이아웃 이펙트는 브라우저가
 * 그리기 전에 도므로 그 한 프레임이 없다. 캔버스가 선택 아웃라인을 재는 데 이미
 * `useLayoutEffect`를 쓰고 있어(`canvas/canvas.tsx`) 같은 단계에 들어간다 — **주입이
 * 먼저 돌아야 자리를 제대로 잰다**는 뜻이고, 그래서 이 훅을 캔버스보다 위(`App`)가 아니라
 * 캔버스 안에서 먼저 부른다.
 */
export function useThemeCss(source: ThemeSource = defaultThemeSource): ResolvedTheme | null {
  /**
   * **컴파일은 테마가 바뀔 때만 한다.** 매 렌더마다 문자열을 다시 만들면 `<style>`의
   * `textContent`가 매번 갈리고, 그때마다 브라우저가 시트를 다시 판다.
   *
   * `source`를 의존성으로 삼는다 — 인자 없이 부르면 모듈 상수(`defaultThemeSource`)라
   * 한 번만 돈다. 캔버스는 `useProjectTheme`의 값을 넘기므로 **부르는 쪽이 `source`를
   * 안정적으로 유지해야** 한다(그 계약은 `theme/use-project-theme.ts` 머리말).
   */
  const css = useMemo(() => compileOnce(source), [source])

  useLayoutEffect(() => {
    /**
     * 순서대로 만든다. `ensureStyle`이 **없는 태그만** 새로 붙이므로 태그가 **늘지 않고**,
     * 아래에 정리가 없으므로 **줄지도 않는다.** 두 방향을 다 지킨다 — 느는 쪽만 보면
     * 줄어드는 쪽의 결함(아래)을 놓친다.
     *
     * ---
     *
     * **정리에서 태그를 지우지 않는다.** `<style>`은 `document.head`의 **전역 공유
     * 자원**인데 이 훅은 **인스턴스마다** 돈다. 지우면 훅 하나가 언마운트될 때 **살아남은
     * 훅의 스타일까지** 사라지고, 살아남은 쪽은 `css` 의존이 안 바뀌어 이 이펙트를 다시
     * 돌지 않으므로 **영구히 스타일 없는 화면**이 된다(재는 법: 정리에서 지우게 하고 훅 둘을
     * 마운트한 뒤 하나만 언마운트하면 `document.head`의 두 태그가 **전부** 사라진다).
     *
     * **참조 계수 대신 남기는 쪽을 고른 이유:** 계수는 모듈 수준 상태라 HMR·테스트 간에
     * 새고, 이 자리에서 그것을 관리할 이유가 없다. 남겨 두는 비용은 **빈 값이 아니라
     * 낡은 값**인데, 그 낡음이 화면에 닿지 않는 근거가 둘이다.
     *
     * 1. **다음 마운트가 `textContent`를 새 값으로 덮는다**(아래 두 줄). 케이스가 지킨다
     *    (*"언마운트 뒤 다른 테마로 다시 마운트하면 …"*).
     * 2. **그 사이에 남은 CSS가 셸을 건드리지 않는다.**
     *
     * **2의 이유는 *"셀렉터가 맞을 요소가 없다"*가 아니다 — 그 말은 절반만 참이다.**
     * 컴포넌트 규칙(`[data-wb-component=…]` — 렌더러만 내는 속성)은 그 말이 맞지만
     * **`:root` 블록은 언제나 `html`에 맞는다.** 그 블록에는 시스템 테마마다 선언이
     * 수십 개씩 있다. 테마가 늘면 낡으므로 **수가 아니라 성질을 지킨다**(아래).
     *
     * **진짜 방벽은 셀렉터 불일치가 아니라 이름 분리**다:
     * 셸이 읽는 커스텀 프로퍼티는 **전부 `--wb-shell-*`**(예외 0)이고, 테마가 `:root`에
     * 싣는 선언 중 그 접두어를 쓰는 것은 **시스템 테마 다 0개다**. **교집합이
     * 비어 있어** `html`에 값이 얹혀도 읽는 쪽이 없다. `--wb-shell-` 접두어의
     * 분리가 여기서 한 번 더 값을 한다.
     *
     * **셸 쪽 개수는 여기 적지 않는다** — 그 수의 단일 출처는 `shell.css`의 팔레트 절이고
     * 검산 명령도 거기 있다. 같은 수를 두 곳이 들면 한쪽이 고쳐질 때 다른 쪽이 조용히 낡는다.
     */
    const structure = ensureStyle(STRUCTURE_STYLE_ID)
    const theme = ensureStyle(THEME_STYLE_ID)

    if (structure.textContent !== css.structure) structure.textContent = css.structure
    if (theme.textContent !== css.theme) theme.textContent = css.theme
  }, [css])

  return css.resolved
}

interface CompiledCss {
  structure: string
  /** 해석이 실패했으면 빈 문자열이다. */
  theme: string
  /**
   * 해석 결과. **부르는 쪽이 구조 선택을 읽으려고 함께 낸다.**
   *
   * 이 훅의 시그니처를 `(): void`로 두면 **해석을 두 번 하게 된다** — 캔버스가
   * `themeStructures`에 넘길 `ResolvedTheme`을 따로 얻어야 하기 때문이다.
   * 두 번 해석하면 비용만이 아니라 **두 결과가 갈릴 수 있는 자리**가 생긴다(테마 소스가
   * 서버에서 오면 실재한다). 그래서 한 번 해석해 CSS와 구조 선택을 함께 낸다.
   */
  resolved: ResolvedTheme | null
}

function compileOnce(source: ThemeSource): CompiledCss {
  const structure = structureBaseCss()
  const document_ = source()
  if (document_ === null) return { structure, theme: '', resolved: null }

  const { theme, issues } = resolveTheme(document_)
  if (theme === null) {
    /**
     * **이슈 폭포.** 토큰 하나가 깨지면 그것을 가리키는 스타일마다 이슈가
     * 따라 나온다(재는 법: `palette` 참조 하나를 어긋내면 근원 1건에 그것에 기댄 스타일마다
     * 1건씩 붙는다). 그래서 **사용자에게 전부 쏟지 않고 콘솔에만 남긴다** — 화면에 뿌리면
     * 근원 하나를 뒤따른 줄들이 가린다.
     *
     * 조용히 삼키지도 않는다. 테마 CSS가 비어 화면이 눈에 띄게 달라지고, 원인을 찾을
     * 사람에게는 여기 남은 목록이 있다. 사용자용 표시는 저작 UI의 몫이다.
     */
    console.error(
      `테마를 해석하지 못해 기본 스타일로 그립니다 (이슈 ${issues.length}건)`,
      issues.map((issue) => `${issue.path}: ${issue.message}`),
    )
    return { structure, theme: '', resolved: null }
  }

  /**
   * **경고만 있는 테마는 선다 — 그러나 삼키지 않는다.**
   *
   * `resolveTheme`은 *"**`error`가** 있으면 `null`"*이다 — `warning`만 있으면 테마를 낸다.
   * 위 분기만 있으면 경고가 붙은 테마는
   * `theme !== null`이라 **아무 데도 안 남는다** — 그 침묵이 바로 `suspicious-literal`과
   * `node-handle-overwrite`가 없애려던 것이다.
   *
   * `error`와 같은 채널(콘솔)을 쓰되 `warn`으로 낸다. 사용자용 표시는 저작 UI의
   * 몫이라는 위 판정(이슈 폭포)은 경고에도 같다 — **여기서 화면을 만들지 않는다.**
   */
  if (issues.length > 0) {
    console.warn(
      `테마는 그렸지만 경고가 있습니다 (${issues.length}건)`,
      issues.map((issue) => `${issue.path}: ${issue.message}`),
    )
  }

  const resolved = theme as ResolvedTheme
  return { structure, theme: compileTheme(resolved), resolved }
}

/** 이름이 같은 태그가 있으면 그것을 쓰고, 없으면 `head` 끝에 새로 붙인다. */
function ensureStyle(id: string): HTMLStyleElement {
  const existing = document.head.querySelector<HTMLStyleElement>(`style[data-wb-style="${id}"]`)
  if (existing !== null) return existing

  const element = document.createElement('style')
  element.dataset.wbStyle = id
  document.head.append(element)
  return element
}
