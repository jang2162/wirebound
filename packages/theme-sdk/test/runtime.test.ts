import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import * as Sdk from '@wirebound/theme-sdk'
import { installRuntime, WB_RUNTIME_GLOBAL } from '@wirebound/theme-sdk/runtime'

const def = Sdk.defineTheme({ manifest: { id: 't', name: 't', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }, views: {} })
let handle: ReturnType<typeof installRuntime> | null = null
afterEach(() => { handle?.uninstall(); handle = null; vi.restoreAllMocks() })

describe('installRuntime', () => {
  it('전역에 react · jsxRuntime · sdk · register 를 세운다 — sdk 는 이 패키지 자신이다', () => {
    handle = installRuntime()
    const rt = (globalThis as any)[WB_RUNTIME_GLOBAL]
    expect(rt.react).toBe(React)
    expect(rt.sdk.Root).toBe(Sdk.Root)
    expect(typeof rt.jsxRuntime.jsx).toBe('function')
    expect(rt.sdkVersion).toBe(Sdk.SDK_VERSION)
  })
  it('register 한 것을 take 로 받는다 — 한 번 받으면 비운다', () => {
    handle = installRuntime()
    ;(globalThis as any)[WB_RUNTIME_GLOBAL].register(def)
    expect(handle.take()).toBe(def)
    expect(handle.take()).toBeNull()
  })
  it('두 번 register 하면 뒤의 것이 이기고 경고한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    handle = installRuntime()
    const rt = (globalThis as any)[WB_RUNTIME_GLOBAL]
    const other = { ...def }
    rt.register(def); rt.register(other)
    expect(handle.take()).toBe(other)
    expect(warn).toHaveBeenCalledTimes(1)
  })
  it('uninstall 은 전역을 걷는다', () => {
    handle = installRuntime(); handle.uninstall(); handle = null
    expect(WB_RUNTIME_GLOBAL in globalThis).toBe(false)
  })
  it('일반 스크립트가 전역을 통해 등록한다 — theme.js 의 모양', () => {
    handle = installRuntime()
    new Function(`globalThis.${WB_RUNTIME_GLOBAL}.register(globalThis.${WB_RUNTIME_GLOBAL}.sdk.defineTheme({ manifest: { id: 's', name: 's', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }, views: {} }))`)()
    expect(handle.take()?.manifest.id).toBe('s')
  })
})

describe('defineManifest', () => {
  it('받은 manifest 를 그대로 돌려준다 — theme.config.ts 에 타입만 준다', () => {
    const m = { id: 'm', name: 'm', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }
    expect(Sdk.defineManifest(m)).toBe(m)
  })
})
