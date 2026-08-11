import { useLayoutEffect, useMemo } from 'react'
import { structureBaseCss } from '@wirebound/renderer'
import { compileTheme, resolveTheme, type ResolvedTheme } from '@wirebound/themes'
import { defaultThemeSource, type ThemeSource } from './theme-source'
/**
 * **테마 해석이 카탈로그를 읽는다.** `checkThemeComponents`가 `getComponent`로 컴포넌트
 * 선언을 찾아 `structures`·`parts`·`variants`·`states`를 대조하므로(§5.1의 어휘),
 * 설치 전에 부르면 **모든 컴포넌트가 `unknown-component`가 되어 테마가 통째로 이슈**가
 * 된다. 심어서 본 것이 아니라 실제로 그렇게 실패했다 — 이 import를 빼면 이슈 17건이
 * 나고 화면이 기본 스타일로 떨어진다.
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
 * **D5 — 시트가 둘이고 순서가 고정이다.** 구조 기본 CSS가 먼저, 테마 CSS가 나중.
 * 같은 특이도에서 나중에 온 규칙이 이기므로 **이 순서가 곧 "테마가 이긴다"**이다
 * (그 캐스케이드는 `packages/renderer/test/structure-css.test.ts`가 계산된 스타일로 쟀다).
 * 한 장으로 합치지 않는 이유 둘: **테마가 없을 때 구조 기본 CSS만 남아야** 하고,
 * 재컴파일 대상이 뒤쪽뿐이다.
 *
 * **D6 — 자리는 `document.head`다.** 캔버스 안에 넣어도 **범위가 좁아지지 않는다**.
 * 계획서가 그 근거를 *"CSS는 삽입 위치로 범위를 갖지 않는다"*고만 적고 재지 않았기에
 * 쟀다 — 캔버스 안쪽에 넣은 시트가 바깥 요소에 그대로 걸리는 것을 jsdom에서 확인했고
 * (`test/theme/use-theme-css.test.tsx`), 실제 브라우저에서도 같았다(보고서에 적었다).
 * 좁아지지 않을 바에는 P5 내보내기가 넣을 자리(§6.11)와 같은 곳이 낫다.
 *
 * **던지지 않는다.** `resolveTheme`이 **`error`를 내면** 테마 CSS를 비우고 구조 기본 CSS만
 * 남긴다 — 테마가 깨진 것과 화면이 사라지는 것은 다른 일이고, 이 프로젝트는 그
 * *"빈 화면"* 부류를 반복해 겪었다. **경고만 있으면 CSS는 그대로 나가고 콘솔에 남는다**
 * (아래 `compile`의 두 분기).
 *
 * > **2026-08-11(P4c-1 수정 웨이브 F6 전수 훑기): 위 문장이 *"이슈를 내면"*이었고 거짓이
 * > 됐다.** 리뷰가 낸 다섯에는 없던 자리다 — **`resolve/style.ts`와 정확히 같은 부류**로,
 * > 같은 파일 **안쪽**(`compile`의 경고 분기)에는 P4c-1이 새 문장을 제대로 넣어 두고
 * > **머리말만 낡혀 두었다.** 파일 머리말이 함수 본문보다 늦게 고쳐지는 것이 이 저장소가
 * > 반복하는 모양이다.
 *
 * **`useLayoutEffect`인 이유:** `useEffect`로 넣으면 **한 프레임이 CSS 없이 그려진다**
 * (계획서가 *"계획이 재지 않은 것 #3"*으로 남긴 자리다). 레이아웃 이펙트는 브라우저가
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
   * `source`를 의존성으로 삼는다 — 오늘 그 값은 모듈 상수라 한 번만 돈다. P4a-3이
   * 이것을 저장소로 바꾸면 **부르는 쪽이 `source`를 안정적으로 유지해야** 한다.
   */
  const css = useMemo(() => compileOnce(source), [source])

  useLayoutEffect(() => {
    /**
     * 순서대로 만든다. `ensureStyle`이 **없는 태그만** 새로 붙이므로 태그가 **늘지 않고**,
     * 아래에 정리가 없으므로 **줄지도 않는다.** 두 방향을 다 적는 것은 앞서 이 자리에
     * 느는 쪽만 적어 두고 줄어드는 쪽에 결함을 남겼기 때문이다.
     *
     * ---
     *
     * **정리에서 태그를 지우지 않는다.** `<style>`은 `document.head`의 **전역 공유
     * 자원**인데 이 훅은 **인스턴스마다** 돈다. 지우면 훅 하나가 언마운트될 때 **살아남은
     * 훅의 스타일까지** 사라지고, 살아남은 쪽은 `css` 의존이 안 바뀌어 이 이펙트를 다시
     * 돌지 않으므로 **영구히 스타일 없는 화면**이 된다(재서 확인했다 — 훅 둘을 마운트하고
     * 하나만 언마운트하니 `document.head`의 두 태그가 **전부** 사라졌다).
     *
     * **참조 계수 대신 남기는 쪽을 고른 이유:** 계수는 모듈 수준 상태라 HMR·테스트 간에
     * 새고, 이 자리에서 그것을 관리할 이유가 없다. 남겨 두는 비용은 **빈 값이 아니라
     * 낡은 값**인데, 그 낡음이 화면에 닿지 않는 근거가 둘이다.
     *
     * 1. **다음 마운트가 `textContent`를 새 값으로 덮는다**(아래 두 줄). 케이스가 지킨다
     *    (*"언마운트 뒤 다른 테마로 다시 마운트하면 …"*).
     * 2. **그 사이에 남은 CSS가 셸을 건드리지 않는다.**
     *
     * **2의 이유를 앞서 *"셀렉터가 맞을 요소가 없다"*고 적었는데 절반만 참이었다.**
     * 컴포넌트 규칙(`[data-wb-component=…]` — 렌더러만 내는 속성)은 그 말이 맞지만
     * **`:root` 블록은 언제나 `html`에 맞는다.** 재보니 그 블록에 선언이 **82개** 있다.
     *
     * 결론은 그대로지만 **진짜 방벽은 셀렉터 불일치가 아니라 이름 분리**다:
     * 셸이 읽는 커스텀 프로퍼티는 **전부 `--wb-shell-*`**(`shell.css`에서 7종, 예외 0)이고
     * 테마가 `:root`에 싣는 82개 중 그 접두어를 쓰는 것은 **0개**다. **교집합이 비어 있어**
     * `html`에 값이 얹혀도 읽는 쪽이 없다. `--wb-shell-` 접두어를 세운 D7의 분리가
     * 여기서 한 번 더 값을 한다.
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
   * 해석 결과. **부르는 쪽이 구조 선택을 읽으려고 함께 낸다**(Task 9).
   *
   * 계획서는 이 훅의 시그니처를 `(): void`로 적었는데 **그대로 두면 해석을 두 번 하게
   * 된다** — 캔버스가 `themeStructures`에 넘길 `ResolvedTheme`을 따로 얻어야 하기 때문이다.
   * 두 번 해석하면 비용만이 아니라 **두 결과가 갈릴 수 있는 자리**가 생긴다(테마 소스가
   * 저장소가 되는 P4a-3에서 실재한다). 그래서 한 번 해석해 CSS와 구조 선택을 함께 낸다.
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
     * **재라 #12 — 이슈 폭포.** 토큰 하나가 깨지면 그것을 가리키는 스타일마다 이슈가
     * 따라 나온다(재서 확인했다: `palette` 참조 하나를 어긋내니 근원 1 + 그것에 기댄 5,
     * 모두 6건). 그래서 **사용자에게 전부 쏟지 않고 콘솔에만 남긴다** — 화면에 뿌리면
     * 근원 하나를 여섯 줄이 가린다.
     *
     * 조용히 삼키지도 않는다. 테마 CSS가 비어 화면이 눈에 띄게 달라지고, 원인을 찾을
     * 사람에게는 여기 남은 목록이 있다. 사용자용 표시는 저작 UI(P4c)의 몫이다.
     */
    console.error(
      `테마를 해석하지 못해 기본 스타일로 그립니다 (이슈 ${issues.length}건)`,
      issues.map((issue) => `${issue.path}: ${issue.message}`),
    )
    return { structure, theme: '', resolved: null }
  }

  /**
   * **경고만 있는 테마는 선다 — 그러나 삼키지 않는다** (P4c-1 T2).
   *
   * `resolveTheme`이 *"이슈가 하나라도 있으면 `null`"*에서 *"**`error`가** 있으면 `null`"*로
   * 바뀌었다(`themes`에 첫 `warning`이 생겼다). 위 분기만 있으면 경고가 붙은 테마는
   * `theme !== null`이라 **아무 데도 안 남는다** — 그 침묵이 바로 `suspicious-literal`과
   * `node-handle-overwrite`가 없애려던 것이다.
   *
   * `error`와 같은 채널(콘솔)을 쓰되 `warn`으로 낸다. 사용자용 표시는 저작 UI(P4c-2)의
   * 몫이라는 재라 #12의 판정은 그대로다 — **여기서 화면을 만들지 않는다.**
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
