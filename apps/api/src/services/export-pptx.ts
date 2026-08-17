/**
 * **프로젝트 하나를 §15의 PPTX로 만든다**(P10-1 T5 · P10-2 T3·T4).
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다. **zip도 여기서 만들지 않는다**
 * (`export-zip.ts`) — `@wirebound/exporter`가 파트 목록을 내고 압축은 그쪽이 한다.
 *
 * ---
 *
 * # 수집을 `export-bundle.ts`와 나눠 쓴다 (P10-1 D4)
 *
 * 둘 다 `collectExportSource`를 지난다. 그래야 **같은 프로젝트를 같은 순서로 같은
 * 이름으로** 싣는다 — 두 파일을 나란히 열어 본 사람에게만 보이는 갈림을 막는 자리다.
 *
 * # 테마를 **래스터를 위해** 읽는다 (P10-2 D1·D2)
 *
 * **앞 판은 테마를 안 읽었고 그것이 옳았다** — §2.1이 도형 변환을 명시적으로 포기했으므로
 * `a:clrScheme`으로 옮길 이유가 없었다. 그 이유는 지금도 그대로다.
 *
 * **그런데 그때의 머리말이 든 근거가 이 슬라이스를 가리키고 있었다:** *"슬라이드에 실릴
 * 화면은 래스터이고 그 이미지가 이미 테마 색을 담는다."* 그 이미지를 만드는 것이 여기이므로
 * **그리는 입력으로서의 테마는 읽어야 한다.** 읽는 사슬은 번들과 같은 하나다
 * (`currentProjectTheme` → `asResolvedTheme`) — 두 산출물이 다른 테마를 싣지 않는다.
 *
 * # 그리는 것은 이음매 뒤다 (D2·D3)
 *
 * `renderer`를 **안 주면 아무것도 안 그린다.** 그때 슬라이드는 `NO_SCREEN` 상자를 그리고
 * `screenless`가 그 페이지들을 낸다 — P10-1이 만든 그대로다.
 *
 * **주는 자리는 `main.ts` 하나다**(`screen-render.ts`의 머리말). `pnpm test`는 가짜를 넣어
 * 재고 진짜 브라우저는 `pnpm test:build`가 잡는다.
 *
 * # `screenless`와 실패를 가른다 (D5)
 *
 * | 값 | 뜻 |
 * |---|---|
 * | `screenless` | **아무도 안 그렸다** — 그리는 자가 없었다 |
 * | `screenFailures` | **그리려다 죽었다** — 이유가 붙는다 |
 *
 * **둘은 서로 겹치지 않는다.** `exportPptx`가 내는 *"이미지 없는 페이지"*의 합집합이 이
 * 둘이고, 이유가 있는 쪽을 덜어 낸 나머지가 `screenless`다. 한 값에 접으면 화면이
 * *"아직 안 만들었다"*와 *"만들려다 실패했다"*를 같은 말로 하게 된다(P10-1 이월 §2.3).
 */
import { exportPage, exportPptx, type PptxPage, type PptxPart, type PptxScreen } from '@wirebound/exporter'
import type { DbHandle } from '../db/tx'
import { collectExportSource } from './export-source'
import { asResolvedTheme, currentProjectTheme } from './project-theme'
import { screenFileName, type ScreenRenderer, type ScreenRequest } from './screen-render'

/** 화면 이미지를 못 그린 페이지 하나와 그 이유(D5). */
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
   * **아무도 그리지 않은** 페이지 이름들(D5).
   *
   * 그리는 자가 없으면 전부이고, 있으면 비고, 실패한 것은 여기 오지 않고
   * `screenFailures`로 간다.
   */
  screenless: string[]
  /** **그리려다 죽은** 페이지들(D5). `screenless`와 겹치지 않는다. */
  screenFailures: ScreenFailure[]
  /**
   * 그린 기계에 한글 글꼴이 없었다(D4). 없으면 `null`이다.
   *
   * **미리보기가 이것을 그대로 낸다** — 내려받기 버튼이 조용히 성공하면 안 된다(D6).
   */
  fontWarning: string | null
}

export interface ExportProjectPptxOptions {
  /** 화면 이미지를 그리는 자. **없으면 안 그린다**(위 머리말). */
  renderer?: ScreenRenderer
}

export async function exportProjectPptx(
  db: DbHandle,
  projectId: string,
  options?: ExportProjectPptxOptions,
): Promise<ProjectPptx> {
  const { ordered, documentById, commentsById, descriptionById } = await collectExportSource(
    db,
    projectId,
  )

  const pages: PptxPage[] = ordered.map((page) => ({
    /** **번들과 같은 이름이다**(`bundleTitle` — 조상 메뉴가 붙어 있다). P10-1 D3. */
    title: page.bundleTitle,
    document: documentById.get(page.id)!,
    description: descriptionById.get(page.id) ?? null,
    comments: commentsById.get(page.id) ?? [],
  }))

  const { screens, failures, fontWarning } = await drawScreens(db, projectId, pages, options?.renderer)

  const { parts, screenless } = exportPptx({
    pages: pages.map((page, index) => ({ ...page, screen: screens[index] ?? null })),
  })

  const failed = new Set(failures.map((failure) => failure.title))
  return {
    parts,
    pages: ordered.map((page) => ({ id: page.id, title: page.bundleTitle, target: page.target })),
    // **이유가 있는 것은 덜어 낸다**(D5). 남는 것이 *"아무도 안 그렸다"*이다.
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
 * 페이지들의 화면 이미지를 그린다.
 *
 * **`exportPage`가 낸 HTML을 그대로 넘긴다**(D2) — 새 HTML을 만들면 화면·번들·PPTX가
 * 세 벌이 되고 §11.3의 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*가 거짓이 된다.
 *
 * **화소가 0이면 그린 것으로 치지 않는다**(D8). 이음매가 이미 걸러 내지만 여기서 한 번 더
 * 본다 — 이 함수가 `PptxScreen`을 **만드는** 자리이고, `fitInto`가 그 값을 믿는다.
 */
async function drawScreens(
  db: DbHandle,
  projectId: string,
  pages: readonly PptxPage[],
  renderer: ScreenRenderer | undefined,
): Promise<DrawnScreens> {
  const empty: DrawnScreens = { screens: pages.map(() => null), failures: [], fontWarning: null }
  if (renderer === undefined || pages.length === 0) return empty

  const { theme } = await currentProjectTheme(db, projectId)
  const resolved = asResolvedTheme(theme)

  const requests: ScreenRequest[] = pages.map((page) => {
    const rendered = exportPage({ document: page.document, title: page.title, theme: resolved })
    return { title: page.title, html: rendered.html, css: rendered.css }
  })

  const batch = await renderer.render(requests)

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
