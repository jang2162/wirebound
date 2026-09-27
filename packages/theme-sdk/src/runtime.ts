import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as Sdk from './index'
import type { ThemeDefinition } from './types'

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
  /** `theme.js` 가 등록한 정의. 한 번 받으면 비운다 — 다음 적재가 앞 테마를 받지 않게. */
  take(): ThemeDefinition | null
  uninstall(): void
}

/** 전역을 세운다. 호스트는 이것 → `theme.js` 를 `<script>` 로 싣기 → `take()` 차례로 부른다. */
export function installRuntime(target: typeof globalThis = globalThis): RuntimeHandle {
  let pending: ThemeDefinition | null = null
  const runtime: WbRuntime = {
    react: React,
    jsxRuntime: JsxRuntime,
    sdk: Sdk,
    sdkVersion: Sdk.SDK_VERSION,
    register(def) {
      if (pending !== null) console.warn('테마가 두 번 등록됐습니다 — 뒤의 것을 씁니다')
      pending = def
    },
  }
  ;(target as unknown as Record<string, unknown>)[WB_RUNTIME_GLOBAL] = runtime
  return {
    take() {
      const def = pending
      pending = null
      return def
    },
    uninstall() {
      delete (target as unknown as Record<string, unknown>)[WB_RUNTIME_GLOBAL]
    },
  }
}
