/**
 * **프로젝트 하나를 설계서 「로드맵」의 PPTX로 만든다.**
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다. **zip도 여기서 만들지 않는다**
 * (`export-zip.ts`) — `@wirebound/exporter`가 파트 목록을 내고 압축은 그쪽이 한다.
 *
 * ---
 *
 * # 수집을 `export-bundle.ts`와 나눠 쓴다
 *
 * 둘 다 `readExportRows` → `assembleExportSource`를 지난다(`export-source.ts`). 그래야 **같은 프로젝트를 같은 순서로 같은
 * 이름으로** 싣는다 — 두 파일을 나란히 열어 본 사람에게만 보이는 갈림을 막는 자리다.
 *
 * # 화면은 번들의 페이지다 — 테마는 거기서 온다
 *
 * **테마를 OOXML 색으로는 옮기지 않는다** — 설계서 「명시적으로 제외한 것 (YAGNI)」이 도형 변환을
 * 포기했으므로 `a:clrScheme`으로 옮길 이유가 없다.
 *
 * **화면은 HTML 번들의 페이지 그대로다** — 같은 번들(`projectBundle` — 프로젝트 테마의 패키지 · 토큰을 싣는다)을 지어 그 파일과
 * 페이지 경로를 그리는 자에게 넘기고, 그리는 자가 브라우저로 열어 번들 런타임이 그린 목업을 찍는다(spec
 * `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「PPTX」). api 는 테마 코드를 실행하지 않는다 — 브라우저가 돌린다.
 * 테마를 못 쓴 장(등록 없음 · 뷰가 던짐)은 찍지 않고 까닭이 `screenFailures` 에 간다.
 *
 * # 그리는 것은 이음매 뒤다
 *
 * `renderer`를 **안 주면 아무것도 안 그린다.** 그때 슬라이드는 `NO_SCREEN` 상자를 그리고
 * `screenless`가 그 페이지들을 낸다.
 *
 * **주는 자리는 `main.ts` 하나다**(`screen-render.ts`의 머리말). `pnpm test`는 가짜를 넣어
 * 재고 진짜 브라우저는 `pnpm test:build`가 잡는다.
 *
 * # `screenless`와 실패를 가른다
 *
 * | 값 | 뜻 |
 * |---|---|
 * | `screenless` | **아무도 안 그렸다** — 그리는 자가 없었다 |
 * | `screenFailures` | **그리려다 죽었다** — 이유가 붙는다 |
 *
 * **둘은 서로 겹치지 않는다.** `exportPptx`가 내는 *"이미지 없는 페이지"*의 합집합이 이
 * 둘이고, 이유가 있는 쪽을 덜어 낸 나머지가 `screenless`다. 한 값에 접으면 화면이
 * *"아직 안 만들었다"*와 *"만들려다 실패했다"*를 같은 말로 하게 된다.
 */
import { exportPptx, type PptxPage, type PptxPart, type PptxScreen } from '@wirebound/exporter'
import type { DbHandle } from '../db/tx'
import { projectBundle } from './export-bundle'
import { assembleExportSource, readExportRows, type ExportRows } from './export-source'
import { errorLine, screenFileName, type ScreenBatch, type ScreenJob, type ScreenRenderer } from './screen-render'

/** 화면 이미지를 못 그린 페이지 하나와 그 이유(머리말 「`screenless`와 실패를 가른다」). */
export interface ScreenFailure {
  /** 페이지의 번들 이름. **`pages[].title`·`screenless[]`와 같은 이름이다.** */
  title: string
  /** 사람이 읽을 한 줄. 브라우저가 낸 말이거나 이 서버가 정한 말이다. */
  reason: string
}

/** 미리보기와 내려받기가 함께 쓰는 값. */
export interface ProjectPptx {
  parts: PptxPart[]
  /** 슬라이드에 실린 페이지들. **번들의 `pages`와 같은 모양·같은 이름이다.** */
  pages: { id: string; title: string; target: string }[]
  /**
   * **아무도 그리지 않은** 페이지 이름들(머리말 「`screenless`와 실패를 가른다」).
   *
   * 그리는 자가 없으면 전부이고, 있으면 비고, 실패한 것은 여기 오지 않고
   * `screenFailures`로 간다.
   */
  screenless: string[]
  /** **그리려다 죽은** 페이지들. `screenless`와 겹치지 않는다. */
  screenFailures: ScreenFailure[]
  /**
   * 그린 기계에 한글 글꼴이 없었다. 없으면 `null`이다.
   *
   * **미리보기가 이것을 그대로 낸다** — 내려받기 버튼이 조용히 성공하면 안 된다.
   */
  fontWarning: string | null
}

export interface ExportProjectPptxOptions {
  /** 화면 이미지를 그리는 자. **없으면 안 그린다**(위 머리말). */
  renderer?: ScreenRenderer
}

/**
 * 프로젝트의 pptx 를 값으로 만든다 — **같은 스레드에서** 읽고 조립한다. 라우트는 이것을 안 부른다 — 읽기와 그리기만
 * 메인에서 하고 조립부터는 워커가 한다(`export-worker.ts`). 조립은 둘 다 `buildProjectPptx` 하나를 지난다.
 */
export async function exportProjectPptx(db: DbHandle, projectId: string, options?: ExportProjectPptxOptions): Promise<ProjectPptx> {
  const rows = await readExportRows(db, projectId)
  const renderer = options?.renderer
  const screens: PptxScreenSource | undefined = renderer === undefined ? undefined : { render: (job) => renderer.render(job) }
  return buildProjectPptx(rows, screens)
}

/**
 * 화면을 그리는 자 — **메인 스레드에만 있다**(브라우저를 메인이 쥔다). 워커는 이것을 메시지로 흉내 낸다
 * (`export-worker-thread.ts`).
 */
export interface PptxScreenSource {
  render(job: ScreenJob): Promise<ScreenBatch>
}

/** 읽은 행으로 pptx 를 조립한다. **DB 를 모른다** — 워커에서도 같은 스레드에서도 이 함수 하나다. */
export async function buildProjectPptx(rows: ExportRows, screenSource: PptxScreenSource | undefined): Promise<ProjectPptx> {
  const source = assembleExportSource(rows)
  const { ordered, documentById, commentsById, descriptionById } = source

  const pages: PptxPage[] = ordered.map((page) => ({
    /** **번들과 같은 이름이다**(`bundleTitle` — 조상 메뉴가 붙어 있다). */
    title: page.bundleTitle,
    document: documentById.get(page.id)!,
    description: descriptionById.get(page.id) ?? null,
    comments: commentsById.get(page.id) ?? [],
  }))

  // 번들은 그릴 때만 짓는다(`drawScreens` 가 부른다) — 화면 없는 pptx 는 부르지 않는다.
  const { screens, failures, fontWarning } = await drawScreens(pages, screenSource, () => {
    const bundle = projectBundle(rows, source)
    return {
      files: new Map(bundle.files.map((file) => [file.path, file.content])),
      // 번들의 페이지 경로는 `pages` 와 같은 순서다(`ExportedBundle.pagePaths`) — 두 산출물이 같은 순회(`ordered`)를 지난다.
      pages: pages.map((page, index) => ({ title: page.title, path: bundle.pagePaths[index]! })),
    }
  })

  const { parts, screenless } = exportPptx({
    pages: pages.map((page, index) => ({ ...page, screen: screens[index] ?? null })),
  })

  const failed = new Set(failures.map((failure) => failure.title))
  return {
    parts,
    pages: ordered.map((page) => ({ id: page.id, title: page.bundleTitle, target: page.target })),
    // **이유가 있는 것은 덜어 낸다**(머리말 「`screenless`와 실패를 가른다」). 남는 것이 *"아무도 안 그렸다"*이다.
    screenless: screenless.filter((title) => !failed.has(title)),
    screenFailures: failures,
    fontWarning,
  }
}

interface DrawnScreens {
  /** 페이지와 같은 길이·같은 순서. 그린 것만 값이고 나머지는 `null`이다. */
  screens: (PptxScreen | null)[]
  failures: ScreenFailure[]
  fontWarning: string | null
}

/**
 * 페이지들의 화면 이미지를 그린다. **이 함수는 던지지 않는다** — 머리말 「`screenless`와 실패를 가른다」가 규율이 아니라
 * **구조**가 되는 자리다.
 *
 * **HTML 번들을 그대로 넘긴다**(`job` — 파일 전부와 찍을 페이지 경로) — 새 HTML을 만들면 화면·번들·PPTX가
 * 세 벌이 되고 설계서 「HTML 정적 번들」의 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*가 거짓이 된다.
 *
 * **화소가 0이면 그린 것으로 치지 않는다**. 이음매가 이미 걸러 내지만 여기서 한 번 더
 * 본다 — 이 함수가 `PptxScreen`을 **만드는** 자리이고, `fitInto`가 그 값을 믿는다.
 *
 * ---
 *
 * # 그리는 길에서 던지는 것을 전부 값으로 바꾼다
 *
 * **이 부류는 두 길로 샌다.** 글꼴 물음의 예외가 `render` 밖으로 새는 길, 그리고
 * **`render` 자체가 던지면 라우트 둘이 500이 되는 길**이다.
 *
 * 그래서 **화면을 그리는 길의 자리 둘을 한 `try` 안에 넣는다.** 둘 다 화면 없는 pptx 는
 * **부르지도 않는** 것이라, 감싸지 않으면 *"화면 때문에 pptx 전체를 잃는다"*가 생긴다.
 *
 * | 자리 | 화면 없는 pptx 도 부르나 |
 * |---|---|
 * | 그릴 것을 모으는 `job()`(번들 파일의 표) | **안 부른다** — 그리지 않으므로 부를 일이 없다 |
 * | `renderer.render` | **안 부른다** — 이음매의 타입은 *"던지지 않는다"*를 강제하지 못한다 |
 *
 * **한 덩어리로 감싼다 — 자리마다 나누지 않는다.** 나누면 갈래마다 이유가 달라져 보기에
 * 좋지만 **그 갈래를 재는 자를 못 만든다**(이 저장소에서 `job()`을
 * 던지게 만드는 길이 라우트 밖에 없다). **재지 못하는 갈래를 늘리지 않는 것이 이 저장소의
 * 결이다** — 대신 둘 다 *"화면을 그리지 못했습니다"* 하나로 모이고, 그 하나를
 * `export-pptx-screens.test.ts`가 죽인다.
 *
 * **대가를 적는다:** 그릴 것을 모으다 죽으면 **그 배치의 화면이 전부 빠진다.**
 * pptx 는 그래도 나온다 — 그것이 머리말 「`screenless`와 실패를 가른다」가 지키려는 것이다.
 *
 * **수집(`readExportRows` · `assembleExportSource`)은 여기 없다** — 화면과 무관하게 pptx 를 만드는 자리이고 도메인 에러를
 * 라우트가 상태 코드로 옮긴다(`routes/export.ts`의 `orFail`). 그 갈래는 이 `try`가 삼키지 않는다.
 */
async function drawScreens(pages: readonly PptxPage[], source: PptxScreenSource | undefined, job: () => ScreenJob): Promise<DrawnScreens> {
  const empty: DrawnScreens = { screens: pages.map(() => null), failures: [], fontWarning: null }
  if (source === undefined || pages.length === 0) return empty

  let batch: ScreenBatch
  try {
    batch = await source.render(job())
  } catch (error) {
    // **그리는 길이 던졌다.** 화면은 전부 잃지만 **pptx 는 나온다**.
    return allFailed(pages, `${SCREEN_PATH_FAILED}: ${errorLine(error)}`)
  }

  const screens: (PptxScreen | null)[] = []
  const failures: ScreenFailure[] = []
  for (const [index, page] of pages.entries()) {
    const result = batch.results[index]
    if (result === undefined) {
      failures.push({ title: page.title, reason: '그리는 자가 이 페이지의 결과를 내지 않았습니다' })
      screens.push(null)
      continue
    }
    if (!result.ok) {
      failures.push({ title: page.title, reason: result.reason })
      screens.push(null)
      continue
    }
    if (!(result.width > 0) || !(result.height > 0)) {
      failures.push({ title: page.title, reason: '그린 이미지의 화소를 읽지 못했습니다' })
      screens.push(null)
      continue
    }
    screens.push({
      fileName: screenFileName(index),
      bytes: result.bytes,
      width: result.width,
      height: result.height,
    })
  }

  return { screens, failures, fontWarning: batch.fontWarning }
}

/**
 * 그리는 길이 던졌을 때의 머리말.
 *
 * **글자를 한 자리에만 둔다** — 케이스와 이유 문자열이 이것을 나눠 쓴다.
 */
export const SCREEN_PATH_FAILED = '화면을 그리지 못했습니다'

/** 페이지 전부를 같은 이유로 실패시킨다. **pptx 는 그래도 나온다**. */
function allFailed(pages: readonly PptxPage[], reason: string): DrawnScreens {
  return {
    screens: pages.map(() => null),
    failures: pages.map((page) => ({ title: page.title, reason })),
    fontWarning: null,
  }
}
