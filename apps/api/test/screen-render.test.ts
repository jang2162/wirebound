/**
 * **그리는 이음매의 순수한 부분**.
 *
 * | 무엇 | 어디 |
 * |---|---|
 * | 바이트에서 화소를 읽는가 | 여기 |
 * | 그 값이 계약으로 흘러가는가 | `test/export-pptx-screens.test.ts` |
 * | 진짜 브라우저가 내는 바이트를 읽는가 | `apps/api/build-test/screen-chromium.test.ts` (`pnpm test:build`) |
 *
 * **여기는 브라우저를 안 띄운다.** 그것이 이음매를 둔 이유다.
 */
import { describe, expect, it } from 'vitest'
import { decideKoreanGlyphs, KOREAN_PROBE_FAILED, readPngSize, screenFileName } from '../src/services/screen-render'

/**
 * **진짜 1×1 PNG 바이트다.** `packages/exporter/test/pptx.test.ts`가 같은 것을 든다 —
 * 자리만 만들고 안 재면 계약을 못 믿는다.
 */
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01,
  0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

/** 머리만 바꾼 사본을 만든다 — 나머지 바이트는 진짜 PNG 그대로다. */
function withHeader(patch: (bytes: Uint8Array) => void): Uint8Array {
  const copy = Uint8Array.from(PNG_1X1)
  patch(copy)
  return copy
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff
  bytes[offset + 1] = (value >>> 16) & 0xff
  bytes[offset + 2] = (value >>> 8) & 0xff
  bytes[offset + 3] = value & 0xff
}

describe('readPngSize', () => {
  it('진짜 PNG 의 화소를 읽는다', () => {
    expect(readPngSize(PNG_1X1)).toEqual({ width: 1, height: 1 })
  })

  it('큰 값도 읽는다 — 권하는 화소가 2배·3배로 는다', () => {
    // 권하는 화소 셋(1배·2배·3배)을 그대로 심어 본다.
    for (const [width, height] of [
      [720, 552],
      [1440, 1104],
      [2160, 1656],
    ]) {
      const bytes = withHeader((copy) => {
        writeUint32(copy, 16, width!)
        writeUint32(copy, 20, height!)
      })
      expect(readPngSize(bytes)).toEqual({ width, height })
    }
  })

  it('서명이 다르면 null 이다 — jpeg 를 png 라고 우기지 않는다', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...PNG_1X1.subarray(4)])
    expect(readPngSize(jpeg)).toBeNull()
  })

  it('첫 청크가 IHDR 이 아니면 null 이다', () => {
    const bytes = withHeader((copy) => {
      copy[12] = 0x49
      copy[13] = 0x44
      copy[14] = 0x41
      copy[15] = 0x54
    })
    expect(readPngSize(bytes)).toBeNull()
  })

  it('머리가 잘렸으면 null 이다 — 짧은 바이트에서 쓰레기를 읽지 않는다', () => {
    expect(readPngSize(PNG_1X1.subarray(0, 20))).toBeNull()
    expect(readPngSize(new Uint8Array(0))).toBeNull()
  })

  /**
   * **여기가 이 파일의 핵심이다.** `fitInto`는 `!(width > 0)`에서 비율을 버리고 자리를 그대로
   * 쓰므로(`packages/exporter/test/pptx.test.ts`의 그 케이스가 값으로 든다) 0이 계약에
   * 들어가면 슬라이드가 **조용히 찌그러진다.** 그래서 0은 성공이 아니라 `null`이다.
   */
  it.each([
    ['폭', 0, 1],
    ['높이', 1, 0],
    ['둘 다', 0, 0],
  ])('%s 이 0 이면 null 이다 — 그 값이 fitInto 로 흘러가면 안 된다', (_label, width, height) => {
    const bytes = withHeader((copy) => {
      writeUint32(copy, 16, width!)
      writeUint32(copy, 20, height!)
    })
    expect(readPngSize(bytes)).toBeNull()
  })
})

describe('screenFileName', () => {
  it('png 다 — 계약이 그것뿐이다', () => {
    expect(screenFileName(0)).toBe('screen1.png')
    expect(screenFileName(9)).toBe('screen10.png')
  })

  it('페이지마다 다르다 — 같은 이름을 주면 한 그림이 둘을 덮는다', () => {
    const names = Array.from({ length: 20 }, (_unused, index) => screenFileName(index))
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('decideKoreanGlyphs — 두부 물음의 판정', () => {
  /**
   * **이 함수가 따로 있는 이유.** 판정을 브라우저 안에 두면 그 자리를 `return true`로
   * 갈아도 **`pnpm test`의 케이스가 전부 초록**이다 — 곧 *"글꼴이 없으면 조용히 성공하면
   * 안 된다"*를 지키는 자가 없다.
   *
   * 날 값을 걷는 것과 판정하는 것을 가르면 **판정은 브라우저 없이 잴 수 있다.**
   * 걷어 온 값 자체는 `build-test/screen-chromium.test.ts`가 잰다.
   */
  const 기준선이_선다 = { baselines: [10, 10, 10, 10], blank: 99 }

  it('한글이 기준선과 다르면 「있다」다', () => {
    expect(decideKoreanGlyphs({ ...기준선이_선다, hangul: 42 })).toBe('yes')
  })

  it('한글이 기준선과 같으면 「없다」다 — 두부다', () => {
    expect(decideKoreanGlyphs({ ...기준선이_선다, hangul: 10 })).toBe('no')
  })

  /**
   * ***"사용자 영역은 반드시 두부"*가 참이 아니다.** `U+F8FF`(macOS 의 Apple 로고)에는
   * **실제 글리프가 있다.** Nerd Font·Font Awesome 계열은 정확히 `U+E000` 부근을 쓰므로
   * 그런 글꼴이 깔린 기계에서는 기준선이 두부가 아니게 되고, 그때 판정자는 **한글이
   * 두부여도 「있다」로 답한다** — *"글꼴이 없으면 조용히 성공하면 안 된다"*가 막으려던 그 사고다.
   */
  it('기준선 후보가 서로 다르면 「못 물었다」다 — 「있다」로 답하지 않는다', () => {
    const 답 = decideKoreanGlyphs({ baselines: [10, 10, 77, 10], hangul: 42, blank: 99 })
    expect(답).not.toBe('yes')
    expect(답).not.toBe('no')
    expect(답).toMatchObject({ reason: expect.stringContaining(KOREAN_PROBE_FAILED) })
    if (typeof 답 !== 'string') expect(답.reason).toContain('사용자 영역')
  })

  it('후보가 둘 미만이면 「못 물었다」다 — 맞댈 것이 없다', () => {
    for (const baselines of [[], [10]]) {
      const 답 = decideKoreanGlyphs({ baselines, hangul: 42, blank: 99 })
      expect(답).toMatchObject({ reason: expect.stringContaining(KOREAN_PROBE_FAILED) })
    }
  })

  /**
   * **거짓 양성을 막는 자리다.** 캔버스가 아무것도 안 그렸으면 두부도 한글도 빈 화면이라
   * 값이 같아지고, 그러면 **멀쩡한 기계가 「글꼴이 없다」는 경고를 조용히 낸다.**
   * 그것이 두부를 못 잡는 것보다 나쁘다.
   */
  it('기준선이 빈 캔버스와 같으면 「못 물었다」다 — 「없다」로 답하지 않는다', () => {
    const 답 = decideKoreanGlyphs({ baselines: [99, 99], hangul: 99, blank: 99 })
    expect(답).not.toBe('no')
    expect(답).toMatchObject({ reason: expect.stringContaining('두부가 아무것도') })
  })
})
