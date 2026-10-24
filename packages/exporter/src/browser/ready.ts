/**
 * **준비 신호** — 번들 페이지가 «다 그렸다» 를 `<html>` 의 속성으로 말한다. PPTX 의 Chromium 이 그것을 기다린 뒤 잰다
 * (`apps/api/src/services/screen-render-chromium.ts`).
 *
 * | 속성 | 뜻 |
 * |---|---|
 * | `data-wb-ready` | 첫 커밋 → 테마 시트(`theme.css` link)가 실림(실패도) → `document.fonts.ready` → 그림(`img`)이 다 실림(깨짐도) → 한 프레임이 지났다 |
 * | `data-wb-failed="<까닭>"` | 테마를 못 썼거나 테마 뷰가 던졌다 — 준비 신호도 선다(HTML 은 기본 뷰 · 오류 노드로 그대로 보인다) |
 *
 * **화면 모드는 속성이 아니라 클래스다**(`SCREEN_CLASS` — `#wb-screen` 으로 열렸다: 셸을 숨기고 목업만 남긴다). 셸 CSS 가 그것을 셀렉터로
 * 쓰는데 `[data-wb-…]` 는 테마의 어휘라 셸 CSS 가 쓰지 않는다(`bundle/shell-css.ts` 머리말의 둘째 규칙).
 */

export const READY_ATTRIBUTE = 'data-wb-ready'
export const FAILED_ATTRIBUTE = 'data-wb-failed'
export const SCREEN_CLASS = 'wb-export-screen'

/**
 * link 시트가 실렸거나(실패도) 창의 `load` 가 지났다. 머리의 시트는 뒤따르는 일반 스크립트를 막으므로(HTML 의 «script-blocking style
 * sheet») 런타임이 돌 때는 대개 이미 실려 있다 — 이미 실패한 link 는 이벤트를 다시 안 내므로 창의 `load`(모든 하위 자원이 끝났다)로도
 * 끝낸다.
 */
export function sheetSettled(link: HTMLLinkElement | null, win: Window): Promise<void> {
  if (link === null || link.sheet !== null || win.document.readyState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = (): void => {
      link.removeEventListener('load', done)
      link.removeEventListener('error', done)
      win.removeEventListener('load', done)
      resolve()
    }
    link.addEventListener('load', done)
    link.addEventListener('error', done)
    win.addEventListener('load', done)
  })
}

/** 문서의 글꼴이 다 실렸다. `document.fonts` 가 없는 환경(jsdom)은 곧바로 끝난다. */
export function fontsSettled(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  return fonts === undefined ? Promise.resolve() : fonts.ready.then(() => undefined)
}

/**
 * 그림을 기다리는 한도(ms). 실리지도 깨지지도 않는 요청(멈춘 파일 서버)이 준비 신호를 끝없이 잡지 않게 — 넘으면 그 그림 없이 선다. 화면 캡처 한 장의
 * 한도(`apps/api/src/services/screen-render-chromium.ts`)보다 짧다.
 */
export const IMAGE_SETTLE_MS = 5000

/**
 * 문서의 그림(`img` — 자리표시자의 그림)이 다 실렸다(깨진 것도 끝난 것이다 · 한도 `IMAGE_SETTLE_MS`). 크기를 안 정한 자리표시자는 그림이 실려야 크기가
 * 서므로, 그 전에 재면 PPTX 의 화면이 그림 없는 높이로 찍힌다. 깨진 그림은 뷰가 «그림을 불러올 수 없음» 표지로 바꾼다 — 그 커밋은 다음 프레임에
 * 선다(`nextFrame`).
 */
export function imagesSettled(doc: Document, limitMs: number = IMAGE_SETTLE_MS): Promise<void> {
  const pending = [...doc.images].filter((image) => !image.complete)
  if (pending.length === 0) return Promise.resolve()
  const settled = Promise.all(
    pending.map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
  const win = doc.defaultView
  if (win === null) return settled
  return Promise.race([settled, new Promise<void>((resolve) => win.setTimeout(resolve, limitMs))])
}

/** 한 프레임 뒤 — 마지막 레이아웃이 그려진 뒤에 신호를 세운다. */
export function nextFrame(win: Window): Promise<void> {
  return new Promise((resolve) => {
    if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(() => resolve())
    else win.setTimeout(resolve, 0)
  })
}
