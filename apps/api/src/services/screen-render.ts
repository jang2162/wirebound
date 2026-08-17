/**
 * **화면 이미지를 그리는 이음매**(P10-2 T2 · D2·D3·D5·D8).
 *
 * `services/`는 SQL도 HTTP도 모른다. **이 파일은 브라우저도 모른다** — 그리는 것은
 * `screen-render-chromium.ts`이고 여기 있는 것은 **그 자리의 모양**뿐이다.
 *
 * ---
 *
 * # 왜 이음매인가 (D3)
 *
 * 게이트 넷을 매번 도는 저장소다. 브라우저를 단위 케이스에 넣으면 개발 루프가 매번
 * 느려지고 기계마다 결과가 갈린다. **그래서 `pnpm test`는 이 인터페이스의 가짜를 쓰고,
 * 진짜 브라우저는 그 밖(`pnpm test:build`)에서 돈다.**
 *
 * 이 저장소가 부수효과를 가르던 결을 그대로 따른다 — `CaptureHooks`(P6-1) ·
 * `loggerStream`·`onRoute`(P8-4·P9-2). **다만 그 셋과 방향이 반대다:** 저것들은 생략이
 * 운영이고 채우는 것이 테스트인데, 여기는 **채우는 것이 운영**이다. 그래서 채우는 자리가
 * `main.ts` 하나이고 `test/screen-renderer-census.test.ts`가 그것을 소스에서 센다 —
 * 안 그러면 *"이음매를 안 지나는 길"*이 배포에 생긴다.
 *
 * # 실패는 값이다 (D5)
 *
 * 페이지 N장을 그리다 하나가 죽어도(타임아웃·렌더 오류) **나머지는 살고 pptx는 나온다.**
 * 그래서 `render`는 던지지 않고 요청과 **같은 길이·같은 순서**의 결과를 낸다.
 *
 * **`screenless`와 갈린다.** `screenless`는 *"아무도 안 그렸다"*이고 여기 실패는
 * *"그리려다 죽었다"*다. 둘을 한 값에 접으면 화면이 거짓을 말한다(P10-1 이월 §2.3).
 *
 * # 화소는 바이트에서 읽는다 (D8)
 *
 * `exportPptx`의 `fitInto`는 화소가 0이나 NaN이면 **비율을 버리고 이미지를 늘린다.**
 * 곧 못 읽은 크기가 계약에 들어가면 슬라이드가 **조용히 찌그러진다.**
 *
 * 우리가 뷰포트를 정하므로 크기를 안다고 **추론**할 수 있지만 그것이 틀린다 — 화면 전체를
 * 찍으므로 높이는 내용이 정하고, 화소 배율이 곱해진다. **그래서 판정하지 않고 낸 바이트의
 * 머리를 읽는다**(`readPngSize`). 못 읽으면 그것은 성공이 아니라 실패다.
 */

/** 그릴 페이지 한 장. **`exportPage`가 낸 값을 그대로 담는다**(D2 — 새 HTML을 만들지 않는다). */
export interface ScreenRequest {
  /** 실패 목록에 실릴 이름. **`PptxPage.title`과 같은 이름이다**(조상 메뉴가 붙은 번들 이름). */
  title: string
  /** `exportPage().html` — 완전한 한 장이다. */
  html: string
  /** `exportPage().css` — 그 한 장이 기대는 시트. */
  css: string
}

/** 그린 결과 하나. **실패가 예외가 아니라 이 유니온의 한쪽이다**(D5). */
export type ScreenResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: string }

export interface ScreenBatch {
  /** **요청과 같은 길이·같은 순서다.** 부르는 쪽이 인덱스로 짝짓는다. */
  results: ScreenResult[]
  /**
   * 그린 기계에 한글 글꼴이 없었다(D4). 없으면 `null`이다.
   *
   * **페이지마다가 아니라 배치마다다** — 글꼴은 기계의 성질이지 페이지의 성질이 아니다.
   */
  fontWarning: string | null
}

/**
 * 페이지들을 그린다. **던지지 않는다** — 실패는 `ScreenResult`의 한쪽이다.
 *
 * 브라우저를 언제 띄우고 닫는지·몇 장을 동시에 그리는지·한 장을 얼마나 기다리는지는
 * **구현이 정한다**(D7). 이 인터페이스는 그 상태를 갖지 않는다.
 */
export interface ScreenRenderer {
  render(requests: readonly ScreenRequest[]): Promise<ScreenBatch>
}

/**
 * 한글 글꼴이 없는 기계에서 그렸을 때의 말(D4).
 *
 * **글자를 한 자리에만 둔다** — 미리보기가 말하는 것과 실패 이유가 갈리면 화면과 파일이
 * 다른 말을 한다(D6).
 */
export const NO_KOREAN_FONT =
  '이 서버에 한글 글꼴이 없어 화면 이미지를 그리지 않았습니다'

/**
 * `PptxScreen.fileName`이 될 이름.
 *
 * **`exportPptx`가 이 이름을 그대로 쓰지 않는다** — 패키지 안에서 `image<N>.png`로 다시
 * 붙인다(P10-1 이월 §2.1). 그래도 확장자는 검사하므로 `png`여야 한다.
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
 * PNG 바이트에서 화소 크기를 읽는다. **PNG가 아니거나 머리가 짧으면 `null`이다**(D8).
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
  return (
    (bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!
  ) >>> 0
}
