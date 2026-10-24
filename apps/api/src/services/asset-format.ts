/**
 * **올린 그림의 꼴을 바이트로 가른다** — 설계 spec `2026-10-24-compose-input-design.md` «받는 꼴». 요청의 `Content-Type` · 파일 이름의 확장자를 믿지
 * 않는다: 머리 바이트가 PNG · JPEG · WebP · GIF 가운데 하나이거나 뿌리 요소가 `svg` 인 XML 이어야 한다. 크기는 머리에서 읽는다 — 네 비트맵 꼴은
 * 크기가 고정 자리(JPEG 는 SOF 조각)에 있어 새 런타임 의존이 안 든다. 이 함수가 정한 `mime` 이 읽기 응답의 `Content-Type` 이다.
 *
 * **SVG 는 뿌리만 본다** — 스크립트 · 바깥 자원을 걷지 않는다. 그 위험(같은 origin 에서 문서로 열리면 스크립트가 돈다)은 읽기 응답의 머리
 * (`Content-Security-Policy: … sandbox` · `nosniff`)가 막는다(`routes/assets.ts` 의 `ASSET_HEADERS`). `<!DOCTYPE` 은 거절한다 — 엔티티 정의를
 * 받는 자리라 뿌리를 가리는 데 쓸 수 있고, 그림에는 필요 없다.
 */

export type AssetMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml'

export interface AssetFormat {
  mime: AssetMime
  /** 번들 파일 이름의 확장자(`assets/images/<id>.<ext>`). */
  ext: 'png' | 'jpg' | 'webp' | 'gif' | 'svg'
  width: number
  height: number
}

const EXTENSIONS: Readonly<Record<AssetMime, AssetFormat['ext']>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/** 저장한 꼴 → 번들 파일 이름의 확장자. 모르는 꼴(이 함수 밖에서 넣은 행)은 `bin` — 브라우저가 이름이 아니라 바이트로 그린다. */
export function extensionOf(mime: string): string {
  return (EXTENSIONS as Record<string, string>)[mime] ?? 'bin'
}

/** 그림 한 변 · 넓이의 상한 — 화면 캡처 한 장의 넓이 상한(뷰포트 폭 × 8192)과 맞춘다(설계 «한도»). */
export const ASSET_MAX_SIDE = 8192
export const ASSET_MAX_AREA = 40_000_000

/** 크기를 모르는 SVG(viewBox · 수 너비 · 높이가 없음)의 크기 — 브라우저가 그런 그림에 주는 기본 크기다. */
const SVG_DEFAULT = { width: 300, height: 150 } as const

/** 받는 꼴 다섯의 이름 — 오류 문장이 그대로 쓴다. */
export const ASSET_FORMATS_LABEL = 'PNG · JPEG · WebP · GIF · SVG'

export type AssetFormatResult = { ok: true; format: AssetFormat } | { ok: false; reason: 'unsupported' | 'dimensions' }

export function detectAssetFormat(bytes: Uint8Array): AssetFormatResult {
  const format = bitmap(bytes) ?? svg(bytes)
  if (format === null) return { ok: false, reason: 'unsupported' }
  const { width, height } = format
  if (width < 1 || height < 1 || width > ASSET_MAX_SIDE || height > ASSET_MAX_SIDE || width * height > ASSET_MAX_AREA) {
    return { ok: false, reason: 'dimensions' }
  }
  return { ok: true, format }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0): boolean {
  if (bytes.length < at + prefix.length) return false
  return prefix.every((byte, index) => bytes[at + index] === byte)
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length))
}

function bitmap(bytes: Uint8Array): AssetFormat | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (startsWith(bytes, PNG_SIGNATURE)) {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
    return { mime: 'image/png', ext: 'png', width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes.length >= 10 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return { mime: 'image/gif', ext: 'gif', width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return jpeg(bytes, view)
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webp(bytes, view)
  return null
}

/** JPEG — 조각(`FF xx` + 길이)을 따라가 첫 SOF(`C0`–`CF` 가운데 `C4` · `C8` · `CC` 를 뺀 것)의 높이 · 너비를 읽는다. SOS 까지 없으면 아니다. */
function jpeg(bytes: Uint8Array, view: DataView): AssetFormat | null {
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]!
    if (marker === 0xff) {
      at += 1
      continue
    }
    // 길이 없는 표지 — 재시작(`D0`–`D7`) · `TEM`.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const length = view.getUint16(at + 2)
    if (length < 2) return null
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (at + 9 > bytes.length) return null
      return { mime: 'image/jpeg', ext: 'jpg', height: view.getUint16(at + 5), width: view.getUint16(at + 7) }
    }
    at += 2 + length
  }
  return null
}

/** WebP — 첫 조각이 `VP8 `(손실) · `VP8L`(무손실) · `VP8X`(확장) 가운데 하나다. */
function webp(bytes: Uint8Array, view: DataView): AssetFormat | null {
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8 ') {
    if (bytes.length < 30 || !startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null
    return { mime: 'image/webp', ext: 'webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null
    const bits = view.getUint32(21, true)
    return { mime: 'image/webp', ext: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    if (bytes.length < 30) return null
    const u24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)
    return { mime: 'image/webp', ext: 'webp', width: u24(24) + 1, height: u24(27) + 1 }
  }
  return null
}

/**
 * SVG — UTF-8 로 읽어(깨진 바이트면 아니다) 머리(BOM · XML 선언 · 처리 지시 · 주석 · 공백)를 지난 첫 요소의 이름이 `svg`(접두어가 있어도 지역 이름)인지
 * 본다. 크기는 `viewBox` 의 너비 · 높이, 없으면 수(`px` 단위까지)인 `width` · `height`, 그것도 없으면 `SVG_DEFAULT` 다. 올림한 정수.
 */
function svg(bytes: Uint8Array): AssetFormat | null {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  let at = text.startsWith('\uFEFF') ? 1 : 0
  for (;;) {
    while (at < text.length && /\s/.test(text[at]!)) at += 1
    if (text.startsWith('<?', at)) {
      const end = text.indexOf('?>', at + 2)
      if (end < 0) return null
      at = end + 2
    } else if (text.startsWith('<!--', at)) {
      const end = text.indexOf('-->', at + 4)
      if (end < 0) return null
      at = end + 3
    } else break
  }
  if (!text.startsWith('<', at) || text.startsWith('<!', at)) return null
  const tag = /^<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/.exec(text.slice(at))
  if (tag === null || tag[2] !== 'svg') return null
  const attrs = new Map<string, string>()
  for (const match of tag[3]!.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.set(match[1]!, match[2] ?? match[3] ?? '')
  const size = svgSize(attrs)
  return { mime: 'image/svg+xml', ext: 'svg', width: Math.ceil(size.width), height: Math.ceil(size.height) }
}

function svgSize(attrs: ReadonlyMap<string, string>): { width: number; height: number } {
  const box = attrs
    .get('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (box !== undefined && box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0)
    return { width: box[2]!, height: box[3]! }
  const length = (value: string | undefined) => {
    const parsed = value === undefined ? null : /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/.exec(value)
    return parsed === null ? null : Number(parsed[1])
  }
  const width = length(attrs.get('width'))
  const height = length(attrs.get('height'))
  if (width !== null && height !== null && width > 0 && height > 0) return { width, height }
  return SVG_DEFAULT
}
