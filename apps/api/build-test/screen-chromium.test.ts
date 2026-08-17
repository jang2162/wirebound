/**
 * **진짜 브라우저가 계약을 채우는가**(P10-2 T6 · D1·D3·D4·D7·D8).
 *
 * `pnpm test`는 이음매에 가짜를 넣어 재고(D3), **여기서 한 번은 진짜로 그린다** — 안 재면
 * P10-1 이월 §2.1의 계약(형식·화소·자리)이 맞는지 아무도 모른다.
 *
 * ---
 *
 * # 왜 `pnpm test:build` 인가
 *
 * 게이트 넷을 매번 도는 저장소다. 브라우저를 단위 케이스에 넣으면 개발 루프가 매번
 * 느려지고 기계마다 결과가 갈린다. `test:build`는 이미 *"무거운 것"*을 담는 자리이고
 * (`packages/exporter/build-test/`), **없으면 건너뛰고 그렇다고 말하는** 결도 거기 있다
 * (`dist-pptx.test.ts`가 macOS 파서 둘에 대해 같은 일을 한다).
 *
 * # 이 자가 못 잡는 것
 *
 * | 무엇 | 누가 잡나 |
 * |---|---|
 * | 브라우저가 없는 기계에서 무슨 일이 나는가 | **여기서 잰다**(아래 *"바이너리가 없으면"*) |
 * | 한글 글꼴이 **없는** 기계 | **아무도 안 잰다.** 이 기계는 macOS라 있다 — 이월이 그 갈림을 든다 |
 * | 받는 쪽(PowerPoint)이 그림을 그리는가 | **사람이 손으로**(P10-1 이월 §1.2의 절차) |
 */
import { existsSync } from 'node:fs'
import { exportPptx, exportPage, type PptxScreen } from '@wirebound/exporter'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { resolveTheme, systemTheme } from '@wirebound/themes'
import { chromium } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import { chromiumScreenRenderer } from '../src/services/screen-render-chromium'
import { readPngSize, type ScreenRequest } from '../src/services/screen-render'

installCatalog()

/** 이 기계에 브라우저가 있나. **없으면 건너뛰고 그렇다고 말한다.** */
function browserPath(): string | null {
  try {
    const path = chromium.executablePath()
    return existsSync(path) ? path : null
  } catch {
    return null
  }
}

const EXECUTABLE = browserPath()
const 있다 = EXECUTABLE !== null

if (!있다) {
  // eslint-disable-next-line no-console
  console.log('[P10-2 스모크] 이 기계에 Chromium 이 없어 건너뛴다 — `npx playwright install chromium`')
}

const theme = resolveTheme(systemTheme('admin')!).theme

/** 페이지 문서 하나. **한글이 들어 있다** — 두부가 되는지 재려면 그래야 한다. */
function doc(index: number, rows: number): PageDocument {
  return {
    version: 1,
    root: {
      id: `n_page_${index}`,
      type: 'Page',
      children: [
        { id: `n_head_${index}`, type: 'Heading', props: { text: `회원 목록 ${index}` } },
        { id: `n_btn_${index}`, type: 'Button', props: { label: '검색' } },
        ...Array.from({ length: rows }, (_unused, row) => ({
          id: `n_row_${index}_${row}`,
          type: 'Text',
          props: { text: `${row}번째 줄 — 한글 본문이 들어간다` },
        })),
      ],
    },
  } as unknown as PageDocument
}

function requestFor(index: number, rows: number): ScreenRequest {
  const title = `관리자 회원 목록${index}`
  const rendered = exportPage({ document: doc(index, rows), title, theme })
  return { title, html: rendered.html, css: rendered.css }
}

describe.skipIf(!있다)('진짜 브라우저가 그린 PNG (D1·D8)', () => {
  it('계약이 요구하는 것을 낸다 — PNG 이고 화소를 읽을 수 있다', async () => {
    const renderer = chromiumScreenRenderer()
    // **하나짜리로 재지 않는다.** 셋이고 길이가 서로 다르다.
    const requests = [requestFor(1, 4), requestFor(2, 40), requestFor(3, 4)]
    const batch = await renderer.render(requests)

    expect(batch.results).toHaveLength(3)
    expect(batch.fontWarning).toBeNull()

    for (const result of batch.results) {
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      // 서명을 우리 파서가 아니라 바이트로 직접 본다.
      expect([...result.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(readPngSize(result.bytes)).toEqual({ width: result.width, height: result.height })
      // 뷰포트 720 × 배율 2배 — **폭은 정해져 있다.**
      expect(result.width).toBe(1440)
      expect(result.height).toBeGreaterThanOrEqual(1104)
    }

    /**
     * **긴 페이지가 더 높다.** 뷰포트만 찍으면 셋이 같은 높이일 것이고, 그러면 긴
     * 페이지의 아래가 잘린 채 목업이 나간다 — 그것이 `fullPage`를 켠 이유다.
     */
    const heights = batch.results.map((result) => (result.ok ? result.height : 0))
    expect(heights[1]!).toBeGreaterThan(heights[0]!)
    expect(heights[0]).toBe(heights[2])
  })

  it('한글이 두부가 아니다 (D4) — 이 기계에는 글꼴이 있다', async () => {
    const batch = await chromiumScreenRenderer().render([requestFor(1, 4)])
    expect(batch.fontWarning).toBeNull()
    expect(batch.results[0]!.ok).toBe(true)
  })

  it('그린 것이 pptx 의 매체로 그대로 실린다 — 계약이 이어진다', async () => {
    const requests = [requestFor(1, 6), requestFor(2, 6)]
    const batch = await chromiumScreenRenderer().render(requests)

    const screens: (PptxScreen | null)[] = batch.results.map((result, index) =>
      result.ok
        ? { fileName: `screen${index + 1}.png`, bytes: result.bytes, width: result.width, height: result.height }
        : null,
    )

    const { parts, screenless } = exportPptx({
      pages: requests.map((request, index) => ({
        title: request.title,
        document: doc(index + 1, 6),
        screen: screens[index] ?? null,
      })),
    })

    expect(screenless).toEqual([])
    const media = parts.filter((part) => part.path.startsWith('ppt/media/'))
    expect(media.map((part) => part.path)).toEqual(['ppt/media/image1.png', 'ppt/media/image2.png'])
    // **바이트가 그대로다** — 어딘가에서 다시 인코딩되면 여기서 죽는다.
    expect(media[0]!.content).toEqual(batch.results[0]!.ok ? batch.results[0]!.bytes : null)
  })

  /**
   * **진짜 타임아웃이 예외가 아니라 값이 되는가**(D5).
   *
   * **이 케이스가 실제로 결함을 찾았다.** 앞 판은 글꼴 물음이 던지면 그것이 `render` 밖으로
   * 새어 나가 **내보내기 하나가 통째로 500**이 되었다 — 가짜로는 못 보는 갈래다.
   * 1ms는 이 기계에서 어떤 페이지도 못 지키므로 글꼴 물음이 먼저 걸리고, 그때도 **결과는
   * 요청과 같은 길이로 나와야 한다.**
   */
  it('한 장도 못 그려도 던지지 않는다 (D5) — 타임아웃이 값이 된다', async () => {
    const requests = [requestFor(1, 4), requestFor(2, 4)]
    const batch = await chromiumScreenRenderer({ timeoutMs: 1 }).render(requests)

    expect(batch.results).toHaveLength(requests.length)
    expect(batch.results.map((result) => result.ok)).toEqual([false, false])
    for (const result of batch.results) {
      if (result.ok) continue
      expect(result.reason).toContain('Timeout')
    }
    /** **글꼴이 없다고 말하지 않는다** — 못 물은 것과 없는 것은 다르다. */
    expect(batch.fontWarning).toBeNull()
  })

  /**
   * **바깥으로 나가는 요청을 끊는가.**
   *
   * 테마의 `@font-face`·`url()`은 사용자가 적은 문자열이라(`themes/spec/assets.ts`) 서버가
   * 그것을 가져가면 프로젝트 멤버가 적은 주소로 **서버가 요청을 보내는 자리**가 된다.
   *
   * **재는 방법은 「기다리지 않는다」이다.** 라우팅되는 곳이 없는 주소를 걸어 두면 끊는
   * 쪽은 그대로 그리고, 안 끊는 쪽은 `load`를 기다리다 타임아웃으로 죽는다.
   *
   * **이 자의 한계:** 그 주소가 **빨리 거절되는** 망에서는 안 끊어도 통과한다 — 그때
   * 이 케이스는 조용히 이빨을 잃는다(초록이 되지 빨강이 되지 않는다). 이 기계에서는
   * 갈렸다(보고서 §6의 M13).
   */
  it('바깥 자원을 든 페이지도 그려진다 — 요청을 끊으므로 기다리지 않는다', async () => {
    const request: ScreenRequest = {
      title: '바깥 자원',
      html:
        '<!doctype html><html lang="ko"><head>' +
        '<link rel="stylesheet" href="http://10.255.255.1/x.css">' +
        '</head><body><h1>회원 목록</h1></body></html>',
      css: 'body { color: #111 }',
    }
    const batch = await chromiumScreenRenderer({ timeoutMs: 3000 }).render([request])
    expect(batch.results[0]!.ok).toBe(true)
  })

  it('상한을 넘은 장은 조용히 빠지지 않고 분모를 말한다 (D7)', async () => {
    const requests = [requestFor(1, 4), requestFor(2, 4), requestFor(3, 4)]
    const batch = await chromiumScreenRenderer({ maxPages: 2 }).render(requests)

    expect(batch.results.slice(0, 2).every((result) => result.ok)).toBe(true)
    const last = batch.results[2]!
    expect(last.ok).toBe(false)
    if (!last.ok) {
      expect(last.reason).toContain('2장')
      expect(last.reason).toContain('3장 중 3번째')
    }
  })
})

describe('바이너리가 없으면 (D5)', () => {
  /**
   * **배포에서 가장 있을 법한 사고다** — 이미지가 없는 컨테이너에 이 서버를 올린 상태.
   * 그때 내보내기가 통째로 500이 되면 pptx를 아예 못 받는다.
   */
  it('던지지 않고 전부 실패로 낸다 — pptx 는 여전히 나온다', async () => {
    const renderer = chromiumScreenRenderer({ executablePath: '/tmp/wirebound-no-such-chromium' })
    const batch = await renderer.render([requestFor(1, 4), requestFor(2, 4)])

    expect(batch.results.map((result) => result.ok)).toEqual([false, false])
    for (const result of batch.results) {
      if (result.ok) continue
      expect(result.reason).toContain('브라우저를 띄우지 못했습니다')
    }
    expect(batch.fontWarning).toBeNull()
  })
})
