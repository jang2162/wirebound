/**
 * `readWbtheme` 의 중앙 디렉터리 판독기와 fflate `unzipSync` 가 **다른 것을 읽는** 판(A2 리뷰 — `docs/superpowers/plans/2026-09-27-a2-review.md`
 * 항목 1 · 4). 판독기가 «통과» 로 본 zip 에서 fflate 가 판독기가 안 본 항목 · 다른 크기를 풀면 검사를 비켜 간 것이 실린다.
 *
 * 성질로 단언한다 — 거절해도 되고, 통과했으면 실린 것이 판독기가 본 것과 같아야 한다.
 * zip 은 손으로 짓는다(fflate `zipSync` 는 이런 머리를 안 쓴다).
 */
import { strToU8 } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { readWbtheme, WBTHEME_LIMITS } from '@wirebound/themes'

beforeAll(() => installCatalog())

const MANIFEST = strToU8(JSON.stringify({ id: 'acme', name: 'ACME', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }))
const CHECKED = '/*checked*/'

interface Entry {
  name: string
  data: Uint8Array
  /** 중앙 디렉터리의 원래 크기 — 안 주면 `data` 길이. */
  usize?: number
  /** 다른 항목의 로컬 머리를 가리킨다(그 항목의 차례). */
  sameLocalAs?: number
}

/** 손으로 짓는 zip(stored). `total` 은 EOCD 의 전체 항목 수(e+10), `disk` 는 이 디스크의 항목 수(e+8). */
function build(entries: Entry[], eocd: { disk?: number; total?: number } = {}): Uint8Array {
  const chunks: Uint8Array[] = []
  let pos = 0
  const push = (u: Uint8Array) => { chunks.push(u); pos += u.length }
  const offsets: number[] = []
  entries.forEach((e) => {
    if (e.sameLocalAs !== undefined) { offsets.push(offsets[e.sameLocalAs]!); return }
    const name = strToU8(e.name)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(6, 0x800, true)
    h.setUint32(18, e.data.length, true); h.setUint32(22, e.data.length, true); h.setUint16(26, name.length, true)
    offsets.push(pos)
    push(new Uint8Array(h.buffer)); push(name); push(e.data)
  })
  const cdStart = pos
  entries.forEach((e, i) => {
    const name = strToU8(e.name)
    const h = new DataView(new ArrayBuffer(46))
    h.setUint32(0, 0x02014b50, true); h.setUint16(8, 0x800, true)
    h.setUint32(20, e.data.length, true); h.setUint32(24, e.usize ?? e.data.length, true)
    h.setUint16(28, name.length, true); h.setUint32(38, (0o100644 << 16) >>> 0, true); h.setUint32(42, offsets[i]!, true)
    push(new Uint8Array(h.buffer)); push(name)
  })
  const q = new DataView(new ArrayBuffer(22))
  q.setUint32(0, 0x06054b50, true)
  q.setUint16(8, eocd.disk ?? entries.length, true); q.setUint16(10, eocd.total ?? entries.length, true)
  q.setUint32(12, pos - cdStart, true); q.setUint32(16, cdStart, true)
  push(new Uint8Array(q.buffer))
  const out = new Uint8Array(pos)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

const base = (): Entry[] => [{ name: 'manifest.json', data: MANIFEST }, { name: 'theme.js', data: strToU8(CHECKED) }]

/** 판독기가 거절했으면 `'rejected'`, 통과했으면 실린 theme.js 와 자산 이름 · 실린 바이트 합. */
function loaded(bytes: Uint8Array) {
  const { files } = readWbtheme(bytes)
  if (files === null) return 'rejected' as const
  const assets = [...files.assets]
  return {
    themeJs: files.themeJs,
    assets: assets.map(([name]) => name),
    bytes: files.themeJs.length + (files.themeCss?.length ?? 0) + assets.reduce((n, [, d]) => n + d.length, 0),
  }
}

describe('readWbtheme — 판독기와 fflate 가 같은 것을 읽는다', () => {
  it('EOCD 의 «이 디스크의 항목 수» 가 «전체 항목 수» 보다 크면, 판독기가 안 본 항목이 실리지 않는다', () => {
    // 판독기는 e+10(전체)을, fflate 는 e+8(이 디스크)을 센다 — 셋째 theme.js 는 판독기가 안 본다.
    const r = loaded(build([...base(), { name: 'theme.js', data: strToU8('/*UNCHECKED*/') }], { disk: 3, total: 2 }))
    expect(r === 'rejected' ? r : r.themeJs).not.toBe('/*UNCHECKED*/')
  })

  it('같은 판에서 판독기가 안 본 허용 밖 경로가 자산으로 실리지 않는다', () => {
    const r = loaded(build([...base(), { name: 'assets/../../evil.html', data: strToU8('<script>') }], { disk: 3, total: 2 }))
    expect(r === 'rejected' ? [] : r.assets).not.toContain('assets/../../evil.html')
  })

  it('zip64 로케이터가 가리키는 다른 중앙 디렉터리의 항목이 실리지 않는다', () => {
    // 앞: fflate 가 볼 중앙 디렉터리(검사 안 된 theme.js · 밖 경로). 뒤: 판독기가 볼 선량한 zip. 끝에 zip64 EOCD + 로케이터 + EOCD.
    const evil = build([{ name: 'manifest.json', data: MANIFEST }, { name: 'theme.js', data: strToU8('/*ZIP64*/') }, { name: '../outside.txt', data: strToU8('x') }])
    const ev = new DataView(evil.buffer)
    const evEocd = evil.length - 22
    const evCount = ev.getUint16(evEocd + 10, true)
    const evOffset = ev.getUint32(evEocd + 16, true)
    const head = evil.subarray(0, evEocd)

    const good = build(base())
    const gv = new DataView(good.buffer)
    const gEocd = good.length - 22
    const gOffset = gv.getUint32(gEocd + 16, true)
    const gSize = gv.getUint32(gEocd + 12, true)
    const tail = good.slice(0, gEocd)
    const tv = new DataView(tail.buffer)
    for (let at = gOffset; at < gOffset + gSize; at += 46 + tv.getUint16(at + 28, true)) {
      tv.setUint32(at + 42, tv.getUint32(at + 42, true) + head.length, true)
    }

    const z64At = head.length + tail.length
    const out = new Uint8Array(z64At + 56 + 20 + 22)
    const v = new DataView(out.buffer)
    out.set(head, 0)
    out.set(tail, head.length)
    v.setUint32(z64At, 0x06064b50, true); v.setBigUint64(z64At + 4, 44n, true)
    v.setUint32(z64At + 32, evCount, true); v.setUint32(z64At + 48, evOffset, true)
    v.setUint32(z64At + 56, 0x07064b50, true); v.setUint32(z64At + 64, z64At, true)
    const e = z64At + 76
    v.setUint32(e, 0x06054b50, true); v.setUint16(e + 8, 2, true); v.setUint16(e + 10, 2, true)
    v.setUint32(e + 12, gSize, true); v.setUint32(e + 16, gOffset + head.length, true)

    const r = loaded(out)
    expect(r === 'rejected' ? r : r.themeJs).not.toBe('/*ZIP64*/')
  })

  it('stored 항목의 원래 크기를 0 으로 적어도 실린 바이트 합이 풀린 크기 상한을 안 넘는다', () => {
    // fflate 는 stored 항목을 중앙 디렉터리의 **압축 크기** 로 자르고 원래 크기는 안 본다. 판독기는 원래 크기만 더한다.
    // 9 MB 로컬 하나를 항목 여섯이 가리키면 판독기의 합은 0, 실리는 것은 54 MB 다(상한 50 MB).
    const blob = new Uint8Array(9 * 1024 * 1024)
    const entries: Entry[] = [...base(), { name: 'assets/a0.png', data: blob, usize: 0 }]
    for (let i = 1; i < 6; i++) entries.push({ name: `assets/a${i}.png`, data: blob, usize: 0, sameLocalAs: 2 })
    const r = loaded(build(entries))
    expect(r === 'rejected' ? 0 : r.bytes).toBeLessThanOrEqual(WBTHEME_LIMITS.unzippedBytes)
  })
})
