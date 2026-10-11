/**
 * `screen-chromium.test.ts` · `render-through-signal.ts` 가 그리는 자에게 넘길 것(`ScreenJob`)을 짓는 도우미 — **케이스 파일이 아니다.**
 *
 * - `bundled` — `exportBundle` 이 낸 번들 그대로(운영이 넘기는 것). 테마를 줄 수 있다 — 코드를 글자로 짓는 작은 테마(`inlineTheme`)나
 *   kit 으로 지은 패키지(`packageTheme`).
 * - `raw` — 번들 없이 HTML 한 장. 그리는 자의 재기 · 찍기 규칙(넓이 상한 · 글꼴 · 자람)을 테마 없이 잴 때 쓴다. 번들 런타임이 없으니
 *   준비 신호를 스스로 세운다.
 *
 * 한 잡에 여러 장을 담을 때 장마다 제 디렉터리(`b1/` · `r2/` …)에 둔다 — 번들의 링크가 상대 경로라 장마다 다른 테마 · 시트가 섞이지 않는다.
 */
import { exportBundle, type BundleTheme } from '@wirebound/exporter'
import type { PageDocument } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { readWbtheme } from '@wirebound/themes'
import { unzlibSync } from 'fflate'
import { readExportRuntime } from '../src/services/export-runtime'
import type { ScreenJob } from '../src/services/screen-render'

/** 잡의 장 하나 — 그 장의 파일들과 찍을 경로. */
export interface Entry {
  title: string
  path: string
  files: [string, string | Uint8Array][]
}

let serial = 0

/** 번들 한 장 — `exportBundle` 이 낸 파일 그대로를 제 디렉터리에 둔다. */
export function bundled(title: string, document: PageDocument, theme: BundleTheme | null = null): Entry {
  serial += 1
  const dir = `b${serial}`
  const bundle = exportBundle({ pages: [{ title, document }], runtimeJs: readExportRuntime(), theme })
  return {
    title,
    path: `${dir}/${bundle.pagePaths[0]!}`,
    files: bundle.files.map((file) => [`${dir}/${file.path}`, file.content]),
  }
}

/**
 * 번들 없는 HTML 한 장. `css` 는 머리의 `<style>` 로, 몸 끝에서 준비 신호를 세운다 — 그리는 자는 번들 런타임 대신 이것을 기다린다.
 * `html` 이 `</head>` · `</body>` 를 들면 그 앞에 끼운다.
 */
export function raw(title: string, html: string, css = ''): Entry {
  serial += 1
  const style = css === '' ? '' : `<style>${css}</style>`
  const ready = `<script>document.documentElement.setAttribute('data-wb-ready', '')</script>`
  let page = html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : html.replace('<body', `<head>${style}</head><body`)
  page = page.includes('</body>') ? page.replace('</body>', `${ready}</body>`) : `${page}${ready}`
  return { title, path: `r${serial}/page.html`, files: [[`r${serial}/page.html`, page]] }
}

/** 장들을 한 잡으로. 결과는 장의 차례다. */
export function jobOf(...entries: Entry[]): ScreenJob {
  const files = new Map<string, string | Uint8Array>()
  for (const entry of entries) for (const [path, content] of entry.files) files.set(path, content)
  return { files, pages: entries.map((entry) => ({ title: entry.title, path: entry.path })) }
}

/** 뷰 없는 manifest — 인라인 테마의 서버 manifest 이자 번들이 등록하는 manifest. */
export function manifestOf(id: string): ThemeManifest {
  return { id, name: id, version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } } as ThemeManifest
}

/**
 * 코드를 글자로 짓는 작은 테마 — `theme.js` 가 공유 런타임에서 SDK 를 받아 등록한다(kit 이 짓는 번들과 같은 길). `views` 는 `rt`
 * (공유 런타임)를 쓰는 글자이고, `before` 는 등록 전에 도는 글자다(바깥 요청 · 등록하지 않기 따위).
 */
export function inlineTheme(options: {
  id?: string
  themeCss?: string | null
  views?: string
  before?: string
  register?: boolean
  assets?: [string, Uint8Array][]
}): BundleTheme {
  const manifest = manifestOf(options.id ?? 'inline')
  const register =
    options.register === false
      ? ''
      : `rt.register(rt.sdk.defineTheme({ manifest: ${JSON.stringify(manifest)}, views: ${options.views ?? '{}'} }))`
  return {
    ref: { themeId: manifest.id, version: manifest.version },
    manifest,
    tokens: {},
    themeJs: `(() => { const rt = globalThis.__wirebound_runtime__; ${options.before ?? ''}; ${register} })()`,
    themeCss: options.themeCss ?? null,
    assets: options.assets ?? [],
  }
}

/** `.wbtheme` 바이트(kit 이 지은 것 · 시스템 테마)를 번들에 실을 테마로 — api 가 하는 것과 같다(`services/export-source.ts`). */
export function packageTheme(bytes: Uint8Array, tokens: Record<string, string | number> = {}): BundleTheme {
  const files = readWbtheme(bytes).files
  if (files === null) throw new Error('테마 패키지를 못 읽었다')
  return {
    ref: { themeId: files.manifest.id, version: files.manifest.version },
    manifest: files.manifest,
    tokens,
    themeJs: files.themeJs,
    themeCss: files.themeCss,
    assets: [...files.assets.entries()],
  }
}

/**
 * PNG 에서 그 색(RGB)과 정확히 같은 화소의 수. 화면 이미지에 **무엇이 그려졌나**를 값으로 잰다 — 바이트는 그릴 때마다 갈려 견줄 수
 * 없지만 화소는 결정적이다. 8비트 RGB · RGBA(비월 없음)만 읽는다 — Chromium 이 내는 꼴이다. 그 밖이면 던진다.
 */
export function countColor(png: Uint8Array, rgb: [number, number, number]): number {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const idat: Uint8Array[] = []
  while (offset < png.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      const [depth, colorType, , , interlace] = data.subarray(8, 13)
      if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6))
        throw new Error(`읽지 못하는 PNG 꼴: ${depth}/${colorType}/${interlace}`)
      channels = colorType === 6 ? 4 : 3
    } else if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of idat) {
    joined.set(part, at)
    at += part.length
  }
  const inflated = unzlibSync(joined)
  const stride = width * channels
  const previous = new Uint8Array(stride)
  const row = new Uint8Array(stride)
  let count = 0
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)]!
    const line = inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels]! : 0
      const up = previous[x]!
      const upLeft = x >= channels ? previous[x - channels]! : 0
      const value = line[x]!
      let out: number
      if (filter === 0) out = value
      else if (filter === 1) out = value + left
      else if (filter === 2) out = value + up
      else if (filter === 3) out = value + ((left + up) >> 1)
      else {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        out = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
      }
      row[x] = out & 0xff
    }
    for (let x = 0; x < stride; x += channels) {
      if (row[x] === rgb[0] && row[x + 1] === rgb[1] && row[x + 2] === rgb[2]) count += 1
    }
    previous.set(row)
  }
  return count
}
