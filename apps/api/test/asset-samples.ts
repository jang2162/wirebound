/**
 * 그림 케이스의 표본 바이트 — 꼴마다 머리(크기가 든 자리)가 바른 최소 파일. PNG 는 브라우저가 실제로 그리는 판(`png`)이고, 나머지는 서버의 꼴
 * 가르기(`src/services/asset-format.ts`)를 재는 머리만이다(그리면 깨질 수 있다).
 */
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}

/** 그릴 수 있는 PNG(RGB 한 색). `seed` 가 색을 바꾼다 — 같은 크기의 다른 바이트(다른 해시)가 필요할 때. `pad` 는 끝에 붙이는 tEXt 바이트 수다(크기를 맞출 때). */
export function png(width: number, height: number, seed = 0, pad = 0): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set([(seed * 37) & 255, (seed * 91 + 64) & 255, 200], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw))]
  if (pad > 0) chunks.push(pngChunk('tEXt', Buffer.concat([Buffer.from('pad\0', 'latin1'), Buffer.alloc(pad, 0x61)])))
  chunks.push(pngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks])
}

/** `png` 에 tEXt 를 붙여 꼭 `total` 바이트로. */
export function pngOfSize(total: number, seed = 0): Buffer {
  const base = png(4, 4, seed)
  // tEXt 조각 하나 = 길이 4 + 형 4 + 'pad\0' 4 + 채움 + CRC 4.
  const pad = total - base.length - 16
  if (pad < 0) throw new Error(`${total} 바이트는 너무 작다(바탕 ${base.length})`)
  const out = png(4, 4, seed, pad)
  if (out.length !== total) throw new Error(`크기를 못 맞췄다 ${out.length} ≠ ${total}`)
  return out
}

export function gif(width: number, height: number): Buffer {
  const head = Buffer.alloc(13)
  head.write('GIF89a', 0, 'latin1')
  head.writeUInt16LE(width, 6)
  head.writeUInt16LE(height, 8)
  return Buffer.concat([head, Buffer.from([0x3b])])
}

/** SOI · APP0(JFIF) · SOF0 · EOI. */
export function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])
  const sof = Buffer.alloc(19)
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08])
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 3
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])])
}

function riff(chunk: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(20)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(12 + payload.length, 4)
  head.write('WEBP', 8, 'latin1')
  head.write(chunk, 12, 'latin1')
  head.writeUInt32LE(payload.length, 16)
  return Buffer.concat([head, payload])
}

export function webpLossy(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10)
  payload.set([0, 0, 0, 0x9d, 0x01, 0x2a])
  payload.writeUInt16LE(width, 6)
  payload.writeUInt16LE(height, 8)
  return riff('VP8 ', payload)
}

export function webpLossless(width: number, height: number): Buffer {
  const payload = Buffer.alloc(5)
  payload[0] = 0x2f
  payload.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1)
  return riff('VP8L', payload)
}

export function webpExtended(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10)
  payload.writeUIntLE(width - 1, 4, 3)
  payload.writeUIntLE(height - 1, 7, 3)
  return riff('VP8X', payload)
}

/** 스크립트가 든 SVG — 돌면 전역 표지(`window.__wbSvgRan`)를 세운다. 브라우저 케이스가 «돌았나» 를 그 값으로 잰다. */
export const SCRIPTED_SVG = Buffer.from(
  '<?xml version="1.0"?>\n<!-- 표본 -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" onload="window.__wbSvgRan = (window.__wbSvgRan || 0) + 1">' +
    '<script>window.__wbSvgRan = (window.__wbSvgRan || 0) + 1; try { parent.__wbSvgRan = 1 } catch (e) {}</script>' +
    '<rect width="120" height="80" fill="#2563eb"/></svg>',
  'utf8',
)

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
