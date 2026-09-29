/**
 * **내보내기 런타임의 브라우저 표면** — 케이스와 웹의 견주기(`apps/web/test/canvas/bundle-parity.test.tsx`)가 jsdom 에서 번들과 같은
 * 진입을 부르게 낸다(패키지의 `exports["./browser"]`). 번들로 나가는 것은 `runtime.tsx` 가 지은 `dist/runtime.js` 다.
 */
export type { BootEnv, BootResult } from './boot'
export { boot, THEME_SHEET_SELECTOR } from './boot'
export type { ExportMount, ExportMountInput } from './mount'
export { ambiguousPage, EMPTY_RULE, missingPage, mountExportDocument } from './mount'
export { FAILED_ATTRIBUTE, READY_ATTRIBUTE, SCREEN_ATTRIBUTE } from './ready'
