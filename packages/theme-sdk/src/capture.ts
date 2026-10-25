import { zeroRule } from './css-tools'

/**
 * **찍는 판의 시트** — 화면을 그림으로 찍는 도구(PPTX 의 화면 그림 · `wb-theme shots`)가 문서에 표지(`<html data-wb-capture>`)를 달며 함께
 * 싣는다. 스크롤 상자를 풀어 표 전체 폭으로 문서를 넓힌다(설계 Q2 — 그림이 그 폭으로 찍힌다). 층 안의 `!important` 라 테마가 층 밖에서
 * `!important` 로 덮어도 이긴다(층 안 중요 선언이 층 밖 중요 선언을 이긴다).
 *
 * 기본 뷰 CSS(`defaultViewsCss`)에 안 넣는 까닭: jsdom 의 CSS 파서는 `@layer` 를 못 읽어 그 시트를 통째로 버린다 — 에디터 · 번들의 jsdom
 * 판이 기본 뷰 규칙 없이 돈다(`apps/web/src/canvas/canvas-iframe.tsx` 의 `HOLD_CSS` 와 같은 사정). 하위 경로(`./capture`)로도 내는 까닭은 api
 * 화면 그리기(`apps/api/src/services/screen-render-chromium.ts`)가 react 를 끌고 오는 본 진입 없이 읽게다(`./version` 과 같은 꼴).
 */
export const CAPTURE_CSS = `@layer wb-capture {
${zeroRule('html[data-wb-capture] [data-wb-component="DataGrid"] > [data-wb-part="scroll"]', ['overflow: visible !important;', 'max-width: none !important;'])}
${zeroRule('html[data-wb-capture] [data-wb-component="DataGrid"]', ['max-width: none !important;'])}
${zeroRule('html[data-wb-capture] [data-wb-component="DataGrid"] [data-wb-fixed]', ['position: static !important;'])}
}`
