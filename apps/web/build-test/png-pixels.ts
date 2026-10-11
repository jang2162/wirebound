/**
 * 화면 찍은 PNG(Chrome 의 `page.screenshot` — 8비트 · 비인터레이스)를 픽셀로 푼다 — 의존 없이 `node:zlib` 만 쓴다. 외곽선처럼 «그려졌나»를 화면 값으로
 * 재는 케이스가 쓴다. 다른 꼴(팔레트 · 16비트 · 인터레이스)은 던진다.
 */
import { inflateSync } from 'node:zlib'

export interface Pixels {
  width: number
  height: number
  at(x: number, y: number): [number, number, number]
}

export function decodePng(png: Buffer): Pixels {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 가 아니다')
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const data: Buffer[] = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body[8]
      const color = body[9]
      if (depth !== 8 || (color !== 2 && color !== 6) || body[12] !== 0)
        throw new Error(`지원하지 않는 PNG 꼴: depth ${depth} color ${color} interlace ${body[12]}`)
      channels = color === 6 ? 4 : 3
    } else if (type === 'IDAT') data.push(body)
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * channels
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x]!
      const left = x >= channels ? out[y * stride + x - channels]! : 0
      const up = y > 0 ? out[(y - 1) * stride + x]! : 0
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels]! : 0
      let predicted = 0
      if (filter === 1) predicted = left
      else if (filter === 2) predicted = up
      else if (filter === 3) predicted = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      } else if (filter !== 0) throw new Error(`PNG 필터 ${filter}`)
      out[y * stride + x] = (value + predicted) & 255
    }
  }
  return {
    width,
    height,
    at: (x, y) => {
      const i = y * stride + x * channels
      return [out[i]!, out[i + 1]!, out[i + 2]!]
    },
  }
}
