/**
 * **번들 페이지의 `<html>` 을 짓는 조각** — 번들(`bundle/index.ts`)과 PPTX(`pptx/index.ts`)가 함께 쓴다. 목업은 여기서 그리지 않는다 —
 * 번들 런타임이 브라우저에서 그린다(`browser/`).
 *
 * `renderToStaticMarkup` 으로 셸 마크업만 짓는다 — 브라우저 API 를 쓰지 않는다(`tsconfig.json`이 `DOM` lib을 주지 않으므로 컴파일러가
 * 그것을 지킨다).
 */
import { installCatalog } from '@wirebound/schema'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * 번들 페이지의 `<html>` 한 장을 짓는다(`bundle/index.ts`).
 *
 * `<head>`와 `<body>`를 둘 다 React가 그린다 — **이스케이프를 두 벌 두지 않기 위해서다.**
 * 제목·`lang`·링크의 `href`가 전부 사용자가 적은 값에서 오고, 우리가 따로
 * escape 함수를 쓰면 React의 것과 규칙이 갈린다. `test/escape.test.ts`가 그 표를 든다.
 */
export function renderHtmlDocument(parts: {
  lang: string
  title: string
  /** `<head>`에 더 얹을 것(시트 링크). */
  head: ReactNode
  body: ReactNode
}): string {
  const html = renderToStaticMarkup(
    <html lang={parts.lang}>
      <head>
        <meta charSet="utf-8" />
        <title>{parts.title}</title>
        {parts.head}
      </head>
      <body>{parts.body}</body>
    </html>,
  )
  return `${DOCTYPE}${html}`
}

const DOCTYPE = '<!doctype html>'

export const DEFAULT_LANG = 'ko'

/**
 * **카탈로그 설치를 번들의 계약으로 든다.**
 *
 * ---
 *
 * **확인이 아니라 설치를 고른 이유 셋.**
 *
 * 1. **멱등이고 이미 등록된 것을 건너뛴다**(`catalog/index.ts`).
 *    그래서 여기서 부르는 것이 **호출자가 등록한 것을 덮지 않는다** — 값을 잃을 위험이
 *    없는 쪽에서 잊을 수 있는 자리를 없앨 수 있다. `apps/web`의 `catalog-setup`과
 *    `apps/api`의 `schema-setup`도 이미 그 멱등성에 기대고 있다.
 * 2. **던지는 쪽을 골라도 새 정보가 없다.** 설치 없이 그리면 렌더러의 모양 가드가 노드마다
 *    폴백을 그리고 `errors`에 담는다 — 관찰값이 이미 시끄럽다(`test/catalog.test.ts`가 그
 *    값을 든다). 던지면 소비자 셋이 같은 두 줄을 각자 쓰게 될 뿐이다.
 * 3. **막으려는 것은 침묵이 아니라 산출물이다.** 폴백이 든 HTML도 **눈으로는 그럴듯한 한
 *    장**이고, 번들은 그것을 남에게 전달한다.
 *
 * **import 부작용으로 두지 않는다.** `apps/web`은 `catalog-setup` 모듈을 import하는 것만으로
 * 설치가 끝나게 두었는데(*"부르는 것을 잊을 수 있는 자리를 만들지 않기 위해서"*), 그쪽은
 * 앱이고 이쪽은 라이브러리다 — 패키지를 import했을 뿐인데 전역 레지스트리가 채워지면
 * 그 부작용을 호출자가 예상할 수 없다. 부르는 순간에 채우면 자리는 여전히 하나다.
 */
export function installRegistries(): void {
  installCatalog()
}
