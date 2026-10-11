/**
 * **화면 이미지를 그리는 이음매.**
 *
 * `services/`는 SQL도 HTTP도 모른다. **이 파일은 브라우저도 모른다** — 그리는 것은
 * `screen-render-chromium.ts`이고 여기 있는 것은 **그 자리의 모양**뿐이다.
 *
 * ---
 *
 * # 왜 이음매인가
 *
 * 게이트 넷을 매번 도는 저장소다. 브라우저를 단위 케이스에 넣으면 개발 루프가 매번
 * 느려지고 기계마다 결과가 갈린다. **그래서 `pnpm test`는 이 인터페이스의 가짜를 쓰고,
 * 진짜 브라우저는 그 밖(`pnpm test:build`)에서 돈다.**
 *
 * 이 저장소가 부수효과를 가르는 결을 그대로 따른다 — `CaptureHooks` ·
 * `loggerStream`·`onRoute`. **다만 그 셋과 방향이 반대다:** 저것들은 생략이
 * 운영이고 채우는 것이 테스트인데, 여기는 **채우는 것이 운영**이다. 그래서 채우는 자리가
 * `main.ts` 하나이고 `test/screen-renderer-census.test.ts`가 그것을 소스에서 센다 —
 * 안 그러면 *"이음매를 안 지나는 길"*이 배포에 생긴다.
 *
 * # 실패는 값이다
 *
 * 페이지 N장을 그리다 하나가 죽어도(타임아웃·렌더 오류) **나머지는 살고 pptx는 나온다.**
 * 그래서 `render`는 던지지 않고 찍을 페이지와 **같은 길이·같은 순서**의 결과를 낸다.
 *
 * **`screenless`와 갈린다.** `screenless`는 *"아무도 안 그렸다"*이고 여기 실패는
 * *"그리려다 죽었다"*다. 둘을 한 값에 접으면 화면이 거짓을 말한다.
 *
 * # 화소는 바이트에서 읽는다
 *
 * `exportPptx`의 `fitInto`는 화소가 0이나 NaN이면 **비율을 버리고 이미지를 늘린다.**
 * 곧 못 읽은 크기가 계약에 들어가면 슬라이드가 **조용히 찌그러진다.**
 *
 * 우리가 뷰포트를 정하므로 크기를 안다고 **추론**할 수 있지만 그것이 틀린다 — 화면 전체를
 * 찍으므로 높이는 내용이 정하고, 화소 배율이 곱해진다. **그래서 판정하지 않고 낸 바이트의
 * 머리를 읽는다**(`readPngSize`). 못 읽으면 그것은 성공이 아니라 실패다.
 */

/**
 * 그릴 것 — **HTML 번들 그대로**(`@wirebound/exporter` 의 `exportBundle` 이 낸 파일 전부)와 찍을 페이지들. 새 HTML 을 만들지 않는다 —
 * 그리는 자가 번들의 페이지를 브라우저로 열어 번들 런타임이 그린 목업을 찍는다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`
 * 「PPTX」). 그래서 화면 · 번들 · PPTX 가 한 벌이다.
 */
export interface ScreenJob {
  /** 번들 뿌리 기준 경로 → 내용. 그리는 자는 파일 시스템을 안 쓰고 이것을 메모리에서 내준다. */
  files: ReadonlyMap<string, string | Uint8Array>
  /** 찍을 페이지 — **결과가 이 순서 · 이 길이다.** */
  pages: readonly ScreenPage[]
}

/** 찍을 페이지 한 장. */
export interface ScreenPage {
  /** 실패 목록에 실릴 이름. **`PptxPage.title`과 같은 이름이다**(조상 메뉴가 붙은 번들 이름). */
  title: string
  /** 번들 안의 경로(`pages/<이름>.html`). */
  path: string
}

/** 그린 결과 하나. **실패가 예외가 아니라 이 유니온의 한쪽이다**(머리말 「실패는 값이다」). */
export type ScreenResult = { ok: true; bytes: Uint8Array; width: number; height: number } | { ok: false; reason: string }

export interface ScreenBatch {
  /** **`ScreenJob.pages` 와 같은 길이·같은 순서다.** 부르는 쪽이 인덱스로 짝짓는다. */
  results: ScreenResult[]
  /**
   * 그린 기계에 한글 글꼴이 없었다. 없으면 `null`이다.
   *
   * **페이지마다가 아니라 배치마다다** — 글꼴은 기계의 성질이지 페이지의 성질이 아니다.
   */
  fontWarning: string | null
}

/**
 * 페이지들을 그린다. **던지지 않기로 되어 있다** — 실패는 `ScreenResult`의 한쪽이다.
 *
 * **그러나 타입은 그것을 강제하지 못한다.** 그래서 부르는 쪽(`export-pptx.ts`의
 * `drawScreens`)이 `try`로 감싼다 — 규율이 아니라 구조로 「실패는 값이다」를 세우는 자리다.
 * 감싸지 않으면 던지는 구현 하나에 라우트 둘이 500 이 된다.
 *
 * 브라우저를 언제 띄우고 닫는지·몇 장을 동시에 그리는지·한 장을 얼마나 기다리는지는
 * **구현이 정한다**(`screen-render-chromium.ts`의 「어디에 상태를 두나」). 이 인터페이스는 그 상태를 갖지 않는다.
 */
export interface ScreenRenderer {
  render(job: ScreenJob): Promise<ScreenBatch>
}

/**
 * 한글 글꼴이 없는 기계에서 그렸을 때의 말.
 *
 * **글자를 한 자리에만 둔다** — 미리보기가 말하는 것과 실패 이유가 갈리면 화면과 파일이
 * 다른 말을 한다.
 */
export const NO_KOREAN_FONT = '이 서버에 한글 글꼴이 없어 화면 이미지를 그리지 않았습니다'

/**
 * 두부 물음이 **브라우저에서 걷어 온 날 값**.
 *
 * **판정을 브라우저 안에 두지 않는 것이 이 타입의 존재 이유다.** `true`/`false`를
 * 브라우저가 정해서 내면 **그 판정을 재는 자를 게이트에 둘 수 없다** — 판정자를
 * `return true`로 갈아도 케이스가 전부 초록이다. 날 값만 받아 오면 판정은 순수 함수가 되고 `pnpm test`가 그것을 잰다.
 */
export interface KoreanGlyphSamples {
  /**
   * **두부 기준선 후보들**의 픽셀 해시. 사용자 영역(PUA) 코드포인트를 그린 것이다.
   *
   * **여럿인 것이 요점이다.** 하나만 쓰면 *"사용자 영역은 반드시 두부"*라는 전제에 기대는데
   * **그 전제가 기계에 달렸다** — `U+F8FF`(macOS 의 Apple 로고)에는 **실제 글리프가
   * 있고**, Nerd Font·Font Awesome 계열은 정확히
   * `U+E000` 부근을 쓴다. 후보들이 **서로 같을 때만** 기준선이 선다.
   */
  baselines: number[]
  /** 한글 두 글자의 픽셀 해시. */
  hangul: number
  /**
   * **아무것도 안 그린 캔버스**의 픽셀 해시.
   *
   * 이것이 없으면 *"캔버스가 아예 안 돌았다"*와 *"한글이 두부다"*가 같은 값이 된다 —
   * 그러면 멀쩡한 기계에서 조용히 거짓 경고가 뜬다. **그것이 두부를 못 잡는 것보다 나쁘다.**
   */
  blank: number
}

/** 두부 물음의 답 **셋**. 셋째를 둘째에 접으면 화면이 거짓을 말한다. */
export type KoreanGlyphVerdict = 'yes' | 'no' | { reason: string }

/** *"못 물었다"*의 머리말. 케이스와 이유 문자열이 이 한 자리를 나눠 쓴다. */
export const KOREAN_PROBE_FAILED = '한글 글꼴을 확인하지 못했습니다'

/**
 * 걷어 온 날 값에서 답을 낸다. **브라우저를 모른다 — 그래서 `pnpm test`가 잰다.**
 *
 * | 보는 것 | 답 | 왜 |
 * |---|---|---|
 * | 기준선 후보가 둘 미만 | **못 물었다** | 맞댈 것이 없으면 *"기준선이 두부다"*를 확인할 수 없다 |
 * | 후보들이 서로 다르다 | **못 물었다** | 이 기계의 사용자 영역에 글리프가 있다 — 기준선이 두부가 아니다 |
 * | 기준선이 **빈 캔버스와 같다** | **못 물었다** | 아무것도 안 그려졌다. 그대로 두면 한글도 같아져 **거짓 경고**가 된다 |
 * | 한글이 기준선과 같다 | **없다** | 한글이 두부다 |
 * | 그 밖 | **있다** | |
 */
export function decideKoreanGlyphs(samples: KoreanGlyphSamples): KoreanGlyphVerdict {
  const baselines = samples.baselines
  if (baselines.length < 2) {
    return { reason: `${KOREAN_PROBE_FAILED}: 두부 기준선 후보가 ${baselines.length}개입니다` }
  }
  const baseline = baselines[0]!
  if (!baselines.every((value) => value === baseline)) {
    return { reason: `${KOREAN_PROBE_FAILED}: 이 기계의 사용자 영역에 글리프가 있어 두부 기준선을 세우지 못했습니다` }
  }
  if (baseline === samples.blank) {
    return { reason: `${KOREAN_PROBE_FAILED}: 두부가 아무것도 그리지 않았습니다` }
  }
  return samples.hangul === baseline ? 'no' : 'yes'
}

/**
 * 던져진 것의 첫 줄. **브라우저 오류는 여러 줄이라 그대로 실으면 응답이 길어진다.**
 *
 * **자리가 하나다** — 그리는 자와 조립하는 자가 같은 모양의 이유를 만든다.
 */
export function errorLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('\n')[0]!.trim()
}

/**
 * `PptxScreen.fileName`이 될 이름.
 *
 * **`exportPptx`가 이 이름을 그대로 쓰지 않는다** — 패키지 안에서 `image<N>.png`로 다시
 * 붙인다. 그래도 확장자는 검사하므로 `png`여야 한다.
 */
export function screenFileName(index: number): string {
  return `screen${index + 1}.png`
}

/** PNG 서명 여덟 바이트. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** `IHDR` 네 글자. 서명 바로 뒤 길이 넷을 건너뛰면 여기다. */
const IHDR_TAG = [0x49, 0x48, 0x44, 0x52]

/** `IHDR` 청크의 데이터가 시작하는 자리 — 폭 넷, 높이 넷이 빅엔디언으로 이어 붙는다. */
const IHDR_DATA_OFFSET = 16

/**
 * PNG 바이트에서 화소 크기를 읽는다. **PNG가 아니거나 머리가 짧으면 `null`이다**(머리말 「화소는 바이트에서 읽는다」).
 *
 * PNG는 서명 여덟 바이트 뒤에 청크가 오고 **첫 청크가 반드시 `IHDR`**이며 그 데이터의
 * 앞 여덟 바이트가 폭과 높이다(PNG 규격). 그래서 앞부분만 읽으면 되고 전체를 파싱하는
 * 라이브러리가 필요 없다.
 *
 * **`null`을 내는 것이 이 함수의 몫이다.** 0을 내면 그 값이 `fitInto`로 흘러 들어가
 * 비율을 버리게 되고, 던지면 한 장의 실패가 나머지를 죽인다.
 */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < IHDR_DATA_OFFSET + 8) return null
  for (const [index, expected] of PNG_SIGNATURE.entries()) {
    if (bytes[index] !== expected) return null
  }
  for (const [index, expected] of IHDR_TAG.entries()) {
    if (bytes[12 + index] !== expected) return null
  }
  const width = readUint32(bytes, IHDR_DATA_OFFSET)
  const height = readUint32(bytes, IHDR_DATA_OFFSET + 4)
  // 규격이 0을 금지하지만 그것을 믿지 않는다 — 믿으면 `fitInto`가 늘어난 이미지를 낸다.
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
}
