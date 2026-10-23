// @vitest-environment jsdom
/**
 * **그림이 든 번들**(설계 spec `2026-10-24-compose-input-design.md` «10» 의 «HTML 번들») — 호출자가 넘긴 그림만 `assets/images/<id>.<ext>` 로 싣고,
 * 페이지마다 그 파일에서 본 상대 주소 표를 데이터에 싣는다. 런타임이 그 표로 그림 주소를 정한다 — 안 실린 id 는 «그림을 불러올 수 없음» 이다.
 *
 * 실브라우저 판(파일로 연 번들의 그림 `naturalWidth`)은 `apps/web/build-test/export-bundle-images.test.ts` 가 잰다.
 */
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { installRuntime, type RuntimeHandle } from '@wirebound/theme-sdk/runtime'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { boot, type BootResult } from '../src/browser/boot'
import { imagesSettled } from '../src/browser/ready'
import { exportBundle, type BundleImage } from '../src/bundle/index'

let runtime: RuntimeHandle
beforeAll(() => {
  installCatalog()
  runtime = installRuntime(window as unknown as typeof globalThis)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const HELD = 'a'.repeat(64)
const FOREIGN = 'b'.repeat(64)
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

const page = (label: string): PageDocument => ({
  version: 2,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_held', type: 'Placeholder', props: { label: `${label} 배너`, image: HELD } },
      { id: 'n_foreign', type: 'Placeholder', props: { label: `${label} 남의 것`, image: FOREIGN } },
    ],
  },
})

const images: BundleImage[] = [{ id: HELD, ext: 'png', bytes: BYTES }]

function bundle() {
  return exportBundle({ pages: [{ title: '첫 화면', document: page('첫') }], runtimeJs: '/* runtime */', images })
}

function dataOf(path: string): { images: Record<string, string> } {
  const html = String(bundle().files.find((file) => file.path === path)!.content)
  const json = new DOMParser().parseFromString(html, 'text/html').querySelector('script[type="application/json"]')?.textContent
  return JSON.parse(json ?? '{}')
}

let booted: BootResult | null = null
afterEach(() => {
  const mount = booted?.mount
  booted = null
  if (mount !== null && mount !== undefined) act(() => mount.unmount())
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('번들의 그림', () => {
  it('넘긴 그림만 assets/images/<id>.<ext> 로 · 바이트 그대로', () => {
    const files = bundle().files.filter((file) => file.path.startsWith('assets/images/'))
    expect(files.map((file) => file.path)).toEqual([`assets/images/${HELD}.png`])
    expect([...(files[0]!.content as Uint8Array)]).toEqual([...BYTES])
  })

  it('페이지마다 그 파일에서 본 상대 주소 — 안 넘긴 그림은 표에 없다', () => {
    expect(dataOf('index.html').images).toEqual({ [HELD]: `assets/images/${HELD}.png` })
    expect(dataOf(bundle().pagePaths[0]!).images).toEqual({ [HELD]: `../assets/images/${HELD}.png` })
  })

  it('런타임 — 실린 그림은 <img> · 안 실린 그림은 «그림을 불러올 수 없음»', async () => {
    const html = String(bundle().files.find((file) => file.path === bundle().pagePaths[0])!.content)
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    document.head.innerHTML = parsed.head.innerHTML
    document.body.innerHTML = parsed.body.innerHTML
    // jsdom 은 그림을 싣지 않아 `complete` 가 거짓인 채 `load` 가 안 온다 — 실린 판으로 세운다(기다림 자체는 아래 `imagesSettled` 가 잰다).
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete')
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true })
    try {
      await act(async () => {
        booted = await boot({ window, runtime, navigate: () => {} })
      })
    } finally {
      if (complete !== undefined) Object.defineProperty(HTMLImageElement.prototype, 'complete', complete)
    }
    expect(document.documentElement.hasAttribute('data-wb-ready')).toBe(true)
    const held = document.querySelector('[data-wb-id="n_held"] > [data-wb-part="image"]')
    expect(held?.getAttribute('src')).toBe(`../assets/images/${HELD}.png`)
    expect(held?.getAttribute('alt')).toBe('첫 배너')
    const foreign = document.querySelector('[data-wb-id="n_foreign"]')
    expect(foreign?.querySelector('[data-wb-part="image"]')).toBeNull()
    expect(foreign?.querySelector('[data-wb-part="image-missing"]')?.getAttribute('aria-label')).toBe('첫 남의 것')
  })
})

describe('imagesSettled — 준비 신호가 그림을 기다린다', () => {
  function pendingImage(): HTMLImageElement {
    const image = document.createElement('img')
    Object.defineProperty(image, 'complete', { value: false })
    document.body.append(image)
    return image
  }

  it('실리지 않은 그림은 load · error 까지 기다린다', async () => {
    const [a, b] = [pendingImage(), pendingImage()]
    let done = false
    const waiting = imagesSettled(document, 10_000).then(() => (done = true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    a.dispatchEvent(new Event('load'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(done).toBe(false)
    b.dispatchEvent(new Event('error'))
    await waiting
    expect(done).toBe(true)
  })

  it('끝나지 않는 그림은 한도에서 놓는다', async () => {
    pendingImage()
    const started = Date.now()
    await imagesSettled(document, 60)
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
  })
})
