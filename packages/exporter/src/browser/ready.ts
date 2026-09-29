/**
 * **준비 신호** — 번들 페이지가 «다 그렸다» 를 `<html>` 의 속성으로 말한다. PPTX 의 Chromium 이 그것을 기다린 뒤 잰다
 * (`apps/api/src/services/screen-render-chromium.ts`).
 *
 * | 속성 | 뜻 |
 * |---|---|
 * | `data-wb-ready` | 첫 커밋 → 테마 시트(`theme.css` link)가 실림(실패도) → `document.fonts.ready` → 한 프레임이 지났다 |
 * | `data-wb-failed="<까닭>"` | 테마를 못 썼거나 테마 뷰가 던졌다 — 준비 신호도 선다(HTML 은 기본 뷰 · 오류 노드로 그대로 보인다) |
 * | `data-wb-screen` | `#wb-screen` 으로 열렸다 — 셸을 숨기고 목업만 남긴다(`bundle/shell-css.ts`) |
 */

export const READY_ATTRIBUTE = 'data-wb-ready'
export const FAILED_ATTRIBUTE = 'data-wb-failed'
export const SCREEN_ATTRIBUTE = 'data-wb-screen'

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

/** 한 프레임 뒤 — 마지막 레이아웃이 그려진 뒤에 신호를 세운다. */
export function nextFrame(win: Window): Promise<void> {
  return new Promise((resolve) => {
    if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(() => resolve())
    else win.setTimeout(resolve, 0)
  })
}
