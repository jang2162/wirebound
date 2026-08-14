import {
  renderDocument,
  structureBaseCss,
  type NodeRenderError,
} from '@wirebound/renderer'
import type { PageDocument } from '@wirebound/schema'
import { compileTheme, themeStructures, type ResolvedTheme } from '@wirebound/themes'
import { renderToStaticMarkup } from 'react-dom/server'

export interface ExportPageOptions {
  /**
   * 그릴 페이지 문서.
   *
   * **`AnyDocument`가 아니라 `PageDocument`인 것이 D3다.** `renderComposed(layout, page)`의
   * 결과는 `renderDocument(page)`와 **같지 않다** — `Slot`이 구멍이 아니라 그려지는 노드라
   * 합성이 노드 둘을 더한다(`packages/renderer/test/compose-identity.test.tsx`가 쟀고,
   * P4a-3 이월이 그것으로 D6을 반증했다). 그래서 캔버스는 페이지 문서만 그리고, 이 슬라이스가
   * 재려는 것이 *"화면과 같다"*이므로 여기도 같은 것을 그려야 한다.
   *
   * 레이아웃을 번들에 넣을지는 **P8-2가 셸을 만들 때 판정한다**(P7-3 이월 §5).
   */
  document: PageDocument
  /**
   * `<title>`에 실을 이름.
   *
   * **선택이 아니라 필수다 — 문서가 제목을 들지 않기 때문이다.** `PageDocument`는
   * `{ version, root }`뿐이고 제목은 `pages.title`(§4.2)과 §11.2 봉투의 `page.title`에
   * 산다. 즉 이 함수가 제목을 **만들어 낼 방법이 없다.**
   *
   * 기본값(`'무제'` 따위)을 두지 않는 것은 그러면 **호출자가 빠뜨린 것과 정말로 이름이
   * 없는 것이 같은 값**이 되기 때문이다. 필수로 두면 P8-2·P8-3이 어디서 제목을 얻을지를
   * 컴파일러가 묻는다.
   */
  title: string
  /**
   * 해석이 끝난 테마. **어디서 오는지는 호출자가 정한다**(D5).
   *
   * P6-2 이월 §3이 *"P8은 테마를 payload에서 읽어야 한다"*고 적었지만 그것은 **스냅샷을
   * 내보낼 때의 정책**이고, 라이브 페이지를 내보내면 라이브 테마가 맞다. 순수 패키지가 그
   * 정책을 가질 자리가 아니므로 값만 받는다 — 무엇을 넘길지는 P8-3의 라우트가 판정한다.
   *
   * **없는 것이 정상이다**(`layouts.theme_id`가 `NULL`을 받는다 — P6-1이 쟀다). 그때 CSS는
   * 구조 기본 CSS만이고 구조 선택은 카탈로그의 첫 구조다.
   */
  theme?: ResolvedTheme | null
  /** `<html lang>`. 기본은 `'ko'`다 — 이 도구의 카탈로그·문안이 한국어다. */
  lang?: string
}

export interface ExportedPage {
  /** 정적 HTML 한 장. */
  html: string
  /**
   * 이 페이지가 기대는 CSS 한 장. **파일로 쓰지 않는다**(D1) — §11.3의 `assets/theme.css`를
   * 만드는 것은 P8-2·P8-3이고, 링크로 걸지 인라인할지도 그쪽이 정한다.
   */
  css: string
  /**
   * 그리지 못한 노드. **캔버스가 배너로 알리는 것과 같은 값이다**(`canvas.tsx`의
   * `CanvasDocument`).
   *
   * 내는 이유: 번들은 *"화면에서는 됐는데 내보낸 것은 다르다"*를 만들 수 있는 자리이고
   * (P7-3 이월 §8.2), 폴백이 조용히 실린 HTML은 **눈으로는 그럴듯하다.** 값으로 내면
   * P8-3의 라우트가 그것을 말할 수 있다.
   */
  errors: NodeRenderError[]
}

/**
 * 페이지 문서 하나를 정적 HTML 한 장으로 만든다(§11.3).
 *
 * ---
 *
 * **D1 — 파일 시스템을 모른다.** 값을 낸다. 소비자가 셋인데(api 라우트 · CLI · 케이스)
 * `fs`를 부르면 자리가 하나가 되고, 케이스가 임시 디렉터리를 만들어야 한다.
 *
 * **D2 — `renderer`를 서버에서 실행한다.** §11.3의 문장 그대로다. `react-dom/server`의
 * `renderToStaticMarkup`을 쓰고 브라우저 API를 쓰지 않는다(`tsconfig.json`이 `DOM` lib을
 * 주지 않으므로 컴파일러가 그것을 지킨다).
 *
 * **`<html>`까지 React가 그린다.** `<head>`만 손으로 이어 붙이지 않는 이유는
 * **이스케이프를 두 벌 두지 않기 위해서다**(D8) — 제목과 `lang`은 사용자가 적은 문자열이고,
 * 우리가 따로 escape 함수를 쓰면 React의 것과 규칙이 갈린다. 무엇이 어떻게 이스케이프되는지는
 * `test/escape.test.ts`가 표로 잰다.
 *
 * `<!doctype html>`만 앞에 붙인다 — React가 그것을 내지 않는다.
 */
export function exportPage(options: ExportPageOptions): ExportedPage {
  const theme = options.theme ?? null
  const errors: NodeRenderError[] = []

  /**
   * **구조 선택을 화면과 같은 함수에서 얻는다**(P7-3 이월 §8.2 규칙 1). 이 함수는 P8-1이
   * `apps/web`에서 `packages/themes`로 옮긴 것이고, 캔버스도 같은 이름을 부른다 —
   * 사본을 두면 §11.3의 *"결과가 어긋날 수 없다"*가 바로 그 자리에서 거짓이 된다.
   */
  const tree = renderDocument(options.document, {
    structures: themeStructures(theme),
    onNodeError: (error) => errors.push(error),
  })

  const html = renderToStaticMarkup(
    <html lang={options.lang ?? DEFAULT_LANG}>
      <head>
        <meta charSet="utf-8" />
        <title>{options.title}</title>
      </head>
      <body>{tree}</body>
    </html>,
  )

  return { html: `${DOCTYPE}${html}`, css: pageCss(theme), errors }
}

const DOCTYPE = '<!doctype html>'

const DEFAULT_LANG = 'ko'

/**
 * 시트 **한 장**을 만든다. 순서는 구조 기본 CSS → 테마다.
 *
 * **그 순서가 곧 *"테마가 이긴다"*이다** — 같은 특이도에서 나중에 온 규칙이 이긴다
 * (`packages/renderer/test/structure-css.test.ts`가 계산된 스타일로 쟀다). 화면은 같은
 * 순서로 `<style>` **둘**을 건다(`apps/web/src/theme/use-theme-css.ts`의 D5). 여기서 한
 * 장으로 합치는 것은 §11.3이 `assets/theme.css` **하나**를 그리기 때문이고, 문서 순서가
 * 그대로 남으므로 캐스케이드는 같다.
 *
 * **테마가 없으면 구조 기본 CSS만이다 — 빈 문자열이 아니다.** 그것이 없으면 테마 없는
 * 프로젝트의 번들이 아무 스타일도 없이 나간다.
 */
function pageCss(theme: ResolvedTheme | null): string {
  const base = structureBaseCss()
  return theme === null ? base : `${base}\n${compileTheme(theme)}`
}
