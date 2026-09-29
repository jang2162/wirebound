/**
 * **내보내기 런타임 `assets/runtime.js` 의 진입** — vite 가 이 파일에서 IIFE 하나를 짓는다(`vite.runtime.config.ts`).
 *
 * 번들 페이지는 `runtime.js` → 테마 번들(`assets/theme/theme.js`) → 인라인 `__wirebound_export__.boot()` 차례로 싣는다(모두 일반
 * 스크립트 — `file://` 에서 외부 모듈 스크립트는 CORS 로 막힌다). 그래서 이 파일이 할 일은 둘이다:
 *
 * - **테마 번들보다 먼저 공유 런타임 전역(`__wirebound_runtime__`)을 세운다** — 테마는 react · jsx 런타임 · SDK 를 제 번들에 넣지 않고
 *   이 전역에서 읽는다(spec 「`.wbtheme` 파일」 의 «공유 런타임»). 주는 사본이 이 런타임이 묶은 것 한 벌이라 렌더러가 연 문맥과 뷰의
 *   `Root` 가 같은 SDK 를 본다.
 * - `boot` 를 전역에 건다(`EXPORT_GLOBAL`).
 */
import { installCatalog } from '@wirebound/schema'
import { installRuntime } from '@wirebound/theme-sdk/runtime'
import { EXPORT_GLOBAL } from '../page-data'
import { boot } from './boot'

installCatalog()
const runtime = installRuntime(window as unknown as typeof globalThis)
;(window as unknown as Record<string, unknown>)[EXPORT_GLOBAL] = {
  boot: () => boot({ window, runtime }),
}
