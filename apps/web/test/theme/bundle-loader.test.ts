/**
 * 번들 로더의 **경계**(jsdom). jsdom 은 `<script src>` 를 싣지 않는다 — 스크립트가 무엇을 하는지(등록 · 오류 · 늦음)는 이 파일이 `load` ·
 * `error` 이벤트를 쏘아 흉내 내고, 실제 적재 · 캐시는 실브라우저 판(`build-test/theme-canvas.test.ts`)이 잰다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import { WB_RUNTIME_GLOBAL, type WbRuntime } from '@wirebound/theme-sdk/runtime'
import { BUNDLE_DEADLINE_MS, createScriptBundleLoader, themeFileUrl } from '../../src/theme/bundle-loader'

const REF = { themeId: 'system-admin', version: '0.1.0' }
const OTHER = { themeId: 'acme', version: '1.0.0' }

const definition = (id: string): ThemeDefinition =>
  ({ manifest: { id, name: id, version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }, views: {} }) as ThemeDefinition

function realms(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>('iframe.wb-shell-bundle-realm')]
}

function scripts(): HTMLScriptElement[] {
  return realms().flatMap((realm) => [...realm.contentDocument!.querySelectorAll('script')])
}

function runtime(): WbRuntime {
  return (realms()[0]!.contentWindow as unknown as Record<string, WbRuntime>)[WB_RUNTIME_GLOBAL]!
}

/**
 * 스크립트가 돌아 등록한 판 — 실브라우저에서는 `theme.js` 가 `load` 이벤트 직전에 이것을 부른다. 도는 동안 realm 문서의
 * `currentScript` 가 그 스크립트다 — jsdom 은 `src` 스크립트를 돌리지 않으므로 그 값을 얹어 흉내 낸다.
 */
function runScript(script: HTMLScriptElement, def: ThemeDefinition | null): void {
  if (def !== null) {
    const doc = realms()[0]!.contentDocument!
    Object.defineProperty(doc, 'currentScript', { configurable: true, get: () => script })
    try {
      runtime().register(def)
    } finally {
      delete (doc as unknown as Record<string, unknown>)['currentScript']
    }
  }
  script.dispatchEvent(new Event('load'))
}

afterEach(() => {
  for (const realm of realms()) realm.remove()
  vi.useRealTimers()
})

describe('createScriptBundleLoader', () => {
  it('숨은 적재 iframe 하나에 theme.js 를 싣고 등록한 정의를 받는다', async () => {
    const loader = createScriptBundleLoader(document)
    const pending = loader.load(REF)
    expect(realms()).toHaveLength(1)
    expect(realms()[0]!.getAttribute('aria-hidden')).toBe('true')
    const [script] = scripts()
    expect(script!.getAttribute('src')).toContain('/api/theme-packages/system-admin/0.1.0/files/theme.js')
    const def = definition('system-admin')
    runScript(script!, def)
    await expect(pending).resolves.toEqual({ status: 'ok', definition: def })
  })

  it('판이 달라도 적재 iframe 은 하나다', () => {
    const loader = createScriptBundleLoader(document)
    void loader.load(REF)
    void loader.load(OTHER)
    expect(realms()).toHaveLength(1)
    expect(scripts()).toHaveLength(2)
  })

  it('같은 판을 두 번 부르면 스크립트는 하나 — 진행 중 약속을 나눠 쓴다', async () => {
    const loader = createScriptBundleLoader(document)
    const first = loader.load(REF)
    const second = loader.load(REF)
    expect(scripts()).toHaveLength(1)
    runScript(scripts()[0]!, definition('system-admin'))
    expect(await first).toEqual(await second)
  })

  it('받은 정의는 캐시한다 — 다시 불러도 스크립트를 더 안 붙인다', async () => {
    const loader = createScriptBundleLoader(document)
    const pending = loader.load(REF)
    runScript(scripts()[0]!, definition('system-admin'))
    await pending
    await expect(loader.load(REF)).resolves.toMatchObject({ status: 'ok' })
    expect(scripts()).toHaveLength(1)
  })

  it('error 이벤트면 failed — 까닭 문장을 싣는다', async () => {
    const loader = createScriptBundleLoader(document)
    const pending = loader.load(REF)
    scripts()[0]!.dispatchEvent(new Event('error'))
    const result = await pending
    expect(result.status).toBe('failed')
    expect(result.status === 'failed' && result.reason).toBe('테마 번들을 받지 못했습니다(system-admin@0.1.0)')
  })

  it('load 뒤에 등록한 정의가 없으면 failed', async () => {
    const loader = createScriptBundleLoader(document)
    const pending = loader.load(REF)
    runScript(scripts()[0]!, null)
    expect(await pending).toEqual({ status: 'failed', reason: '테마 번들이 등록하지 않았습니다(system-admin@0.1.0)' })
  })

  it('한도를 넘기면 failed — 늦게 온 등록은 다음 적재에 새지 않는다', async () => {
    vi.useFakeTimers()
    const loader = createScriptBundleLoader(document)
    const pending = loader.load(REF)
    vi.advanceTimersByTime(BUNDLE_DEADLINE_MS)
    expect(await pending).toEqual({ status: 'failed', reason: '테마 번들이 10초 안에 오지 않았습니다(system-admin@0.1.0)' })
    // 늦게 돈 스크립트가 등록하고 load 를 쏜다 — 그 정의는 버려져야 한다.
    runScript(scripts()[0]!, definition('late'))
    const next = loader.load(OTHER)
    runScript(scripts()[1]!, null)
    expect(await next).toMatchObject({ status: 'failed' })
  })

  it('스크립트가 끝난 뒤 미룬 등록은 다음 적재의 정의가 되지 않는다 — 버리고 경고한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loader = createScriptBundleLoader(document)
    const late = loader.load(REF)
    runScript(scripts()[0]!, null)
    expect(await late).toMatchObject({ status: 'failed' })
    // `setTimeout(() => register(…))` — 어느 스크립트도 돌지 않을 때 온다.
    runtime().register(definition('late'))
    const silent = loader.load(OTHER)
    runScript(scripts()[1]!, null)
    expect(await silent).toEqual({ status: 'failed', reason: '테마 번들이 등록하지 않았습니다(acme@1.0.0)' })
    expect(warn.mock.calls).toEqual([['테마 번들 스크립트 밖에서 온 등록을 버렸습니다']])
    warn.mockRestore()
  })

  it('미룬 등록이 칸에 있어도 다음 스크립트가 등록하면 그 정의를 받는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loader = createScriptBundleLoader(document)
    const late = loader.load(REF)
    runScript(scripts()[0]!, null)
    await late
    runtime().register(definition('late'))
    const next = loader.load(OTHER)
    const own = definition('acme')
    runScript(scripts()[1]!, own)
    expect(await next).toEqual({ status: 'ok', definition: own })
    expect(warn.mock.calls).toEqual([['테마 번들 스크립트 밖에서 온 등록을 버렸습니다']])
    warn.mockRestore()
  })

  it('failed 는 캐시하지 않는다 — 다시 부르면 새 스크립트를 붙인다', async () => {
    const loader = createScriptBundleLoader(document)
    const first = loader.load(REF)
    scripts()[0]!.dispatchEvent(new Event('error'))
    await first
    const again = loader.load(REF)
    expect(scripts()).toHaveLength(2)
    runScript(scripts()[1]!, definition('system-admin'))
    await expect(again).resolves.toMatchObject({ status: 'ok' })
  })

  it('forget 뒤에는 ok 도 다시 싣는다', async () => {
    const loader = createScriptBundleLoader(document)
    const first = loader.load(REF)
    runScript(scripts()[0]!, definition('system-admin'))
    await first
    loader.forget(REF)
    void loader.load(REF)
    expect(scripts()).toHaveLength(2)
  })
})

describe('themeFileUrl', () => {
  it('판의 파일 주소 — 이름을 인코딩한다', () => {
    expect(themeFileUrl({ themeId: 'a b', version: '1.0.0+x' }, 'theme.css')).toBe('/api/theme-packages/a%20b/1.0.0%2Bx/files/theme.css')
  })
})
