/**
 * **진짜 브라우저가 계약을 채우는가.**
 *
 * `pnpm test`는 이음매(`src/services/screen-render.ts`)에 가짜를 넣어 재고, **여기서 한 번은
 * 진짜로 그린다** — 안 재면 그 이음매의 계약(PNG 형식 · 바이트에서 읽은 화소 · pptx 에 실리는
 * 자리)이 맞는지 아무도 모른다.
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
 * | 한글 글꼴이 **없는** 기계 | **아무도 안 잰다.** 이 자는 글꼴이 있는 기계(macOS)를 전제한다 |
 * | 받는 쪽(PowerPoint)이 그림을 그리는가 | **사람이 손으로** — `packages/exporter/build-test/dist-pptx.test.ts` 「진짜 자는 PowerPoint다」의 절차 |
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { exportPptx, exportPage, type PptxScreen } from '@wirebound/exporter'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { resolveTheme, systemTheme } from '@wirebound/themes'
import { chromium } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import { chromiumScreenRenderer, KOREAN_GLYPH_PROBE } from '../src/services/screen-render-chromium'
import {
  decideKoreanGlyphs,
  readPngSize,
  type KoreanGlyphSamples,
  type ScreenRequest,
} from '../src/services/screen-render'

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
  console.log('[screen-chromium 스모크] 이 기계에 Chromium 이 없어 건너뛴다 — `npx playwright install chromium`')
}

const theme = resolveTheme(systemTheme('admin')!).theme

/**
 * 페이지 문서 하나. **한글이 들어 있다** — 두부가 되는지 재려면 그래야 한다.
 *
 * **카탈로그에 있는 것만 쓴다** — `Heading` 타입은 없고(`Text` + `role`이다) `Text`의 prop은
 * `text`가 아니라 `content`다. 카탈로그에 없는 것을 쓰면 *"진짜 브라우저가 그린 PNG"*가
 * **오류 상자의 사진**이 되는데, 계약 쪽 측정(서명·폭·높이·타임아웃·상한·차단)은 내용과
 * 무관해 그대로 초록이다 — *"화면이 화면처럼 보인다"*만 조용히 무너진다.
 *
 * **아래 「스모크 픽스처가 진짜 화면인가」가 그것을 값으로 지킨다** — 픽스처가 낡으면 거기서 죽는다.
 */
function doc(index: number, rows: number): PageDocument {
  return {
    version: 1,
    root: {
      id: `n_page_${index}`,
      type: 'Page',
      children: [
        { id: `n_head_${index}`, type: 'Text', props: { content: `회원 목록 ${index}`, role: 'h1' } },
        { id: `n_btn_${index}`, type: 'Button', props: { label: '검색' } },
        ...Array.from({ length: rows }, (_unused, row) => ({
          id: `n_row_${index}_${row}`,
          type: 'Text',
          props: { content: `${row}번째 줄 — 한글 본문이 들어간다`, role: 'body' },
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

describe.skipIf(!있다)('진짜 브라우저가 그린 PNG', () => {
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

  it('한글이 두부가 아니다 — 이 기계에는 글꼴이 있다', async () => {
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
   * **진짜 타임아웃이 예외가 아니라 값이 되는가.**
   *
   * 글꼴 물음이 던지면 그것이 `render` 밖으로 새어 나가 **내보내기 하나가 통째로 500**이
   * 된다 — 가짜로는 못 보는 갈래다. 1ms는 이 기계에서 어떤 페이지도 못 지키므로 글꼴 물음이
   * 먼저 걸리고, 그때도 **결과는 요청과 같은 길이로 나와야 한다.**
   */
  it('한 장도 못 그려도 던지지 않는다 — 타임아웃이 값이 된다', async () => {
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
   * 이 케이스는 조용히 이빨을 잃는다(초록이 되지 빨강이 되지 않는다). 이 기계에서 갈리는지는
   * `chromiumScreenRenderer`의 요청 차단을 지우고 이 케이스가 죽는지로 다시 잰다.
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

  it('상한을 넘은 장은 조용히 빠지지 않고 분모를 말한다', async () => {
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

describe('바이너리가 없으면', () => {
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

/* ------------------------------------------ 소스를 지워도 아무도 안 죽던 자리들 — 그 자 */

/** 이 기계에서 도는 playwright 브라우저 프로세스 수. **자를 여기 둔다 — 소스에 두지 않는다.** */
function playwrightProcesses(): number {
  const raw = execFileSync('/bin/sh', ['-c', "ps -eo command | grep -c '[m]s-playwright' || true"], {
    encoding: 'utf8',
  })
  return Number.parseInt(raw.trim(), 10) || 0
}

/** `render`가 도는 동안의 **최고** 프로세스 수와 끝난 뒤의 수. */
async function processWatch(
  requests: readonly ScreenRequest[],
  concurrency: number,
): Promise<{ peak: number; after: number }> {
  let peak = 0
  // **100ms 다.** `ps`를 부르는 값이 작지 않아 25ms 로 재면 이 케이스 하나가 20초를 먹는다
  // (실측). 재려는 것은 최고치의 **자릿수**이지 순간값이 아니다.
  const timer = setInterval(() => {
    const now = playwrightProcesses()
    if (now > peak) peak = now
  }, 100)
  try {
    await chromiumScreenRenderer({ concurrency }).render(requests)
  } finally {
    clearInterval(timer)
  }
  // 닫히는 데 잠깐 걸린다. **여기서 안 기다리면 원본도 빨갛다.**
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { peak, after: playwrightProcesses() }
}

describe.skipIf(!있다)('브라우저·페이지 수명', () => {
  /**
   * **`render`가 브라우저를 안 닫으면 좀비가 쌓인다.**
   *
   * `finally { await browser.close() }`를 지우면 `render()`가 돌아온 뒤에도 **프로세스가
   * 남고 노드가 안 끝난다.** 그런데 이 케이스 없이는 게이트가 아무 말도 안 한다 —
   * **프로세스가 vitest 워커와 함께 죽기 때문이다.**
   * 오래 도는 서버에서만 나는 증상이라 여기서 세는 수밖에 없다.
   */
  it('끝나면 프로세스가 시작값으로 돌아온다', async () => {
    const before = playwrightProcesses()
    const { after } = await processWatch([requestFor(1, 4), requestFor(2, 4)], 2)
    expect(after).toBe(before)
  })

  /**
   * **최고 프로세스 수는 동시성이 정한다 — 장 수가 아니다.**
   *
   * `renderOne`이 컨텍스트를 안 닫으면 열린 컨텍스트가 장마다 쌓여 **최고치가 장 수를
   * 따라간다**(다시 재는 법: `renderOne`의 `finally`에서 컨텍스트를 닫는 줄을 지우고 이 케이스의 두 `peak`를 본다).
   * 그래서 *"끝난 뒤 0"*으로는 이 갈래를 못 본다. 같은 동시성에서 **장 수만 네 배**로
   * 늘려 최고치를 맞대는 것이 그 자다.
   */
  it('장 수를 네 배로 늘려도 최고치가 거의 그대로다', async () => {
    const 적게 = await processWatch([requestFor(1, 4), requestFor(2, 4)], 2)
    const 많이 = await processWatch(
      Array.from({ length: 8 }, (_unused, index) => requestFor(index, 4)),
      2,
    )

    expect(많이.after).toBe(적게.after)
    // 여유를 둔다 — 재는 것은 *"장 수를 따라가지 않는다"*이지 정확한 수가 아니다.
    expect(많이.peak).toBeLessThanOrEqual(적게.peak + 2)
  })
})

describe.skipIf(!있다)('두부 판정자', () => {
  /** 판정자가 브라우저에서 걷어 오는 날 값. */
  async function samples(): Promise<KoreanGlyphSamples> {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><html lang="ko"><body></body></html>')
      return await page.evaluate<KoreanGlyphSamples>(KOREAN_GLYPH_PROBE)
    } finally {
      await browser.close()
    }
  }

  /**
   * **날 값이 판정을 지탱하는가.**
   *
   * 판정자를 `return true`로 갈아도 `pnpm test`는 초록이다 — 브라우저가 거기 없다. 그래서
   * 그 자리가 **날 값을 걷는 자**와 **순수한 판정자**로 갈려 있고, 판정자는
   * `test/screen-render.test.ts`가 잰다. 여기가 재는 것은 **걷어 온 값 자체**다.
   */
  it('기준선이 서고 한글이 그것과 다르다', async () => {
    const 값 = await samples()

    // 후보가 여럿이어야 *"기준선이 두부다"*를 확인할 수 있다 — 사용자 영역 코드포인트라도
    // 기계에 따라 글리프가 있다(macOS 의 `U+F8FF`). 하나만 재면 그 기계에서 조용히 틀린다.
    expect(값.baselines.length).toBeGreaterThanOrEqual(2)
    expect(new Set(값.baselines).size).toBe(1)
    // 두부가 실제로 무언가를 그렸다 — 안 그렸으면 한글도 같아져 **거짓 경고**가 된다.
    expect(값.baselines[0]).not.toBe(값.blank)
    // 이 기계에는 한글 글꼴이 있다.
    expect(값.hangul).not.toBe(값.baselines[0])
    expect(decideKoreanGlyphs(값)).toBe('yes')
  })

  /**
   * **걷어 온 값이 **전부** 진짜 측정인가.**
   *
   * 앞 케이스만 있으면 걷는 글자가 **상수를 되돌려도** 통과한다 — `hangul`·`blank`를
   * 상수로 바꿔도 앞 케이스는 안 죽는다. 한글 해시가 상수면 **글꼴이 없는 기계에서도
   * 「있다」로 답하고**, 그것이 이 판정자가 막으려는 바로 그 사고다.
   *
   * 그래서 **같은 페이지 안에서** 같은 캔버스 설정을 이 케이스가 따로 재서 **세 값을 전부**
   * 맞댄다. 자를 소스가 아니라 여기 둔다.
   */
  it('걷어 온 세 값을 따로 재도 같다 — 상수를 되돌리면 여기서 죽는다', async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><html lang="ko"><body></body></html>')

      const 걷은것 = await page.evaluate<KoreanGlyphSamples>(KOREAN_GLYPH_PROBE)
      const 따로 = await page.evaluate<KoreanGlyphSamples>(`(() => {
        function ink(text) {
          const canvas = document.createElement('canvas')
          canvas.width = 160
          canvas.height = 60
          const g = canvas.getContext('2d')
          g.fillStyle = '#fff'
          g.fillRect(0, 0, canvas.width, canvas.height)
          g.fillStyle = '#000'
          g.font = '32px sans-serif'
          g.textBaseline = 'top'
          g.fillText(text, 2, 2)
          const data = g.getImageData(0, 0, canvas.width, canvas.height).data
          let hash = 0
          for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + data[i]) | 0
          return hash
        }
        return {
          baselines: ['\\uE000\\uE001', '\\uE010\\uE011', '\\uE100\\uE101', '\\uE500\\uE501'].map(ink),
          hangul: ink('\\uD55C\\uAE00'),
          blank: ink(''),
        }
      })()`)

      expect(걷은것).toEqual(따로)
    } finally {
      await browser.close()
    }
  })

  /**
   * **거짓 양성 방향** — 멀쩡한 기계에서 조용한 경고가 뜨면 그것이 더 나쁘다.
   *
   * 그 사고는 *"이따금"*의 모양이므로 한 번으로는 못 본다. 게이트에는 다섯 번을 둔다 —
   * 더 세게 재려면 아래 횟수를 올려 돌린다.
   */
  it('다섯 번을 물어도 늘 「있다」다 — 조용한 거짓 경고가 없다', async () => {
    for (let 회 = 0; 회 < 5; 회 += 1) {
      const batch = await chromiumScreenRenderer().render([requestFor(회, 3)])
      expect(batch.fontWarning).toBeNull()
      expect(batch.results[0]!.ok).toBe(true)
    }
  })
})

describe.skipIf(!있다)('시트가 그림에 반영되나', () => {
  /**
   * **이 케이스가 없으면 `addStyleTag`를 지워도 아무도 안 죽는다.** 곧
   * *"슬라이드의 화면이 곧 그 테마다"*를 지키는 자가 없다.
   *
   * **바이트로는 못 잰다** — 같은 입력을 여러 번 그려도 바이트 수가 갈린다. **화소는
   * 결정적이다**(위 「계약이 요구하는 것을 낸다」의 1440 폭). 그래서 **자리를 바꾸는
   * 시트**를 얹어 높이가 따라 변하는지로 잰다.
   */
  it('시트가 자리를 바꾸면 그림의 높이가 따라 바뀐다', async () => {
    const 그대로 = requestFor(1, 4)
    const 여백 = { ...그대로, css: `${그대로.css}\nbody { padding-top: 800px }` }

    const batch = await chromiumScreenRenderer({ concurrency: 1 }).render([그대로, 여백])
    const [a, b] = batch.results
    expect(a!.ok).toBe(true)
    expect(b!.ok).toBe(true)
    if (!a!.ok || !b!.ok) return

    expect(a!.width).toBe(b!.width)
    // 800px 을 더했고 배율이 2배다 — 시트가 반영됐으면 `b`는 그것만으로 1600 화소를 넘는다. **차이로 재지 않는다** — `a`는 짧은
    // 문서라 뷰포트 높이(552 → 1104)에 눌려 있어, 차이는 내용 높이에 따라 800 × 2 보다 작다. 시트가 무시되면 `b`도 1104 다.
    expect(a!.height).toBeLessThan(1600)
    expect(b!.height).toBeGreaterThan(1600)
  })
})

describe('스모크 픽스처가 진짜 화면인가', () => {
  /**
   * **카탈로그에 없는 것을 쓴 픽스처는 오류 상자를 그린다**(위 `doc` 머리말). 그 상태에서도
   * 계약 측정은 전부 초록이다 — **내용과 무관한 것만 재기 때문이다.**
   *
   * **브라우저가 없어도 도는 케이스다** — 그리기 전 단계를 잰다.
   */
  it('픽스처가 폴백 없이 그려진다 — 그린 것이 진짜 화면이다', () => {
    const rendered = exportPage({ document: doc(1, 4), title: '관리자 회원 목록1', theme })
    expect(rendered.errors).toEqual([])
    expect(rendered.html).not.toContain('알 수 없는 컴포넌트')
    expect(rendered.html).not.toContain('올바르지 않습니다')
    expect(rendered.html).toContain('회원 목록 1')
  })
})

describe.skipIf(!있다)('바깥으로 나가는 요청 — 일곱 길 전부', () => {
  /**
   * **`page.route`는 그 페이지 하나에만 걸린다** — 차단을 페이지에 걸면 일곱 길 가운데
   * **`window.open`만 규칙 밖으로 나간다.** 그래서 차단은 컨텍스트에 건다.
   *
   * 지금 `exportPage`가 `<script>`를 안 내므로 도달할 길이 없다 — **그러나 그것이
   * 산문이면 `exportPage`가 바뀌는 날 조용히 열린다.** 그래서 이 케이스가 일곱 길을
   * **전부** 센다.
   */
  it('일곱 길 어느 것도 서버에 닿지 않는다', async () => {
    const hits: string[] = []
    const server: Server = createServer((request, response) => {
      hits.push(request.url ?? '')
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('x')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const base =
      typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : ''

    try {
      const html = [
        '<!doctype html><html lang="ko"><head>',
        `<link rel="stylesheet" href="${base}/link.css">`,
        `<style>@font-face { font-family: probe; src: url(${base}/font.woff2) }`,
        `body { background-image: url(${base}/bg.png) }</style>`,
        `<script src="${base}/script.js"></script>`,
        '</head><body><h1>회원 목록</h1>',
        `<img src="${base}/img.png" alt="">`,
        `<iframe src="${base}/frame.html"></iframe>`,
        `<script>fetch('${base}/fetch.json').catch(() => {});`,
        `window.open('${base}/popup.html');</script>`,
        '</body></html>',
      ].join('')

      const batch = await chromiumScreenRenderer({ timeoutMs: 5000 }).render([
        { title: '바깥 자원 일곱 길', html, css: 'body { color: #111 }' },
      ])
      expect(batch.results[0]!.ok).toBe(true)
      // 팝업이 뜨고 나가는 데 시간이 걸릴 수 있다. 그려진 뒤에도 잠깐 더 본다.
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(hits).toEqual([])
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
