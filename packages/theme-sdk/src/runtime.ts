import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as Sdk from './index'
import type { ThemeDefinition, ThemeManifest } from './types'

/**
 * 호스트가 세우고 `theme.js`(IIFE)가 읽는 전역의 이름. `wb-theme build` 가 `react` · `react/jsx-runtime` ·
 * `@wirebound/theme-sdk` import 를 이 전역의 속성(`react` · `jsxRuntime` · `sdk`)으로 바꿔 쓴다(spec 「`.wbtheme` 파일」의
 * «공유 런타임»).
 *
 * **테마와 호스트가 SDK 를 한 벌 나눠 쓰는 유일한 길이다.** 테마가 SDK 를 제 번들에 묶으면 그 `Root` 가 렌더러가 연
 * `NodeContext` 와 다른 사본을 읽어 «뷰 안에서만» 으로 던지고, 모든 노드가 기본 뷰로 그려진다 — 화면에는 오류가 없다.
 */
export const WB_RUNTIME_GLOBAL = '__wirebound_runtime__'

export interface WbRuntime {
  react: typeof React
  jsxRuntime: typeof JsxRuntime
  sdk: typeof Sdk
  sdkVersion: string
  register(def: ThemeDefinition): void
}

export interface RuntimeHandle {
  /**
   * `theme.js` 가 등록한 정의. 한 번 받으면 비운다 — 다음 적재가 앞 테마를 받지 않게.
   *
   * `script` 를 주면 **그 스크립트가 도는 동안 들어온 등록만** 받는다 — 스크립트 밖의 등록(늦게 미룬 것 · 다른 스크립트의 것)은 버리고
   * 경고한다. 안 주면 스크립트를 가리지 않는다(`new Function` 으로 부르는 판 — `currentScript` 가 없다).
   */
  take(script?: Element): ThemeDefinition | null
  uninstall(): void
}

const STRAY = '테마 번들 스크립트 밖에서 온 등록을 버렸습니다'

/**
 * 전역을 세운다. 호스트는 이것 → `theme.js` 를 `<script>` 로 싣기 → 그 `load` 에서 `take(그 스크립트)` 차례로 부른다.
 *
 * **등록을 그 스크립트에 매단다** — `register` 가 불린 순간의 `target.document.currentScript` 를 함께 적는다. 칸이 하나뿐이라 매달지
 * 않으면, 등록을 미룬(`setTimeout`) 번들의 정의가 칸에 남아 **다음 번들의 `load`** 가 제 것으로 받는다 — 등록하지 않는 번들이 앞 번들의
 * 뷰로 «성공» 한다(A4 리뷰 2b).
 */
export function installRuntime(target: typeof globalThis = globalThis): RuntimeHandle {
  let pending: { def: ThemeDefinition; script: Element | null } | null = null
  const runtime: WbRuntime = {
    react: React,
    jsxRuntime: JsxRuntime,
    sdk: Sdk,
    sdkVersion: Sdk.SDK_VERSION,
    register(def) {
      const script = (target as { document?: Document }).document?.currentScript ?? null
      if (pending !== null) console.warn(pending.script === script ? '테마가 두 번 등록됐습니다 — 뒤의 것을 씁니다' : STRAY)
      pending = { def, script }
    },
  }
  ;(target as unknown as Record<string, unknown>)[WB_RUNTIME_GLOBAL] = runtime
  return {
    take(script) {
      const held = pending
      pending = null
      if (held === null) return null
      if (script === undefined || held.script === script) return held.def
      console.warn(STRAY)
      return null
    },
    uninstall() {
      delete (target as unknown as Record<string, unknown>)[WB_RUNTIME_GLOBAL]
    },
  }
}

/**
 * **번들 정의에 서버 manifest 를 끼운다** — 뷰는 번들, 선언(variant · 토큰)은 서버 한 벌(spec 「캔버스 iframe」 의 «정의의
 * manifest 는 서버 것이다»). 업로드는 `theme.js` 를 실행하지 않아 번들 안 manifest 를 못 견주므로 싣는 쪽이 바꿔 끼운다.
 *
 * `components` 만 다르면 서버 것을 쓴다. `id` · 판이 다르면 다른 테마의 번들이다 — 까닭을 낸다. 에디터(`apps/web` 의 번들 로더)와
 * 내보낸 번들의 런타임(`packages/exporter/src/browser/boot.tsx`)이 이 함수 하나를 부른다.
 */
export function adoptManifest(
  definition: ThemeDefinition,
  manifest: ThemeManifest,
): { ok: true; definition: ThemeDefinition } | { ok: false; reason: string } {
  const bundled = definition.manifest as ThemeManifest | undefined
  if (bundled?.id !== manifest.id || bundled.version !== manifest.version) {
    const got = bundled === undefined ? '없음' : `${String(bundled.id)}@${String(bundled.version)}`
    return { ok: false, reason: `테마 번들이 다른 테마를 등록했습니다(${manifest.id}@${manifest.version} — 번들은 ${got})` }
  }
  return { ok: true, definition: { ...definition, manifest } }
}
