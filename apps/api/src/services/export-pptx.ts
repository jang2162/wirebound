/**
 * **프로젝트 하나를 §15의 PPTX로 만든다**(P10-1 T5 · D1·D2·D4).
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다. **zip도 여기서 만들지 않는다**
 * (`export-zip.ts`) — `@wirebound/exporter`가 파트 목록을 내고 압축은 그쪽이 한다.
 *
 * ---
 *
 * # 수집을 `export-bundle.ts`와 나눠 쓴다 (D4)
 *
 * 둘 다 `collectExportSource`를 지난다. 그래야 **같은 프로젝트를 같은 순서로 같은
 * 이름으로** 싣는다 — 두 파일을 나란히 열어 본 사람에게만 보이는 갈림을 막는 자리다.
 *
 * # 테마를 안 읽는다
 *
 * §2.1이 도형 변환을 **명시적으로 포기**했고 슬라이드에 실릴 화면은 래스터다(§2·§6.8) —
 * 그 이미지가 이미 테마 색을 담는다. 여기서 `currentProjectTheme`을 다시 읽어 OOXML의
 * `a:clrScheme`으로 옮기면 **같은 색이 두 자리에서 다르게** 나온다.
 *
 * # 화면 이미지를 만들지 않는다 (D2)
 *
 * 만드는 자리가 아직 정해지지 않았다(P10-2). **이 서비스는 이미지를 받는 자리를 갖되
 * 오늘은 아무도 그것을 안 채운다** — 채우는 날 `exportProjectPptx`의 인자가 늘고 그 밖은
 * 그대로다. 채워지지 않은 상태는 `screenless`가 값으로 말한다.
 */
import { exportPptx, type PptxPage, type PptxPart } from '@wirebound/exporter'
import type { DbHandle } from '../db/tx'
import { collectExportSource } from './export-source'

/** 미리보기와 내려받기가 함께 쓰는 값. */
export interface ProjectPptx {
  parts: PptxPart[]
  /** 슬라이드에 실린 페이지들. **번들의 `pages`와 같은 모양·같은 이름이다.** */
  pages: { id: string; title: string; target: string }[]
  /**
   * 화면 이미지가 실리지 않은 페이지 이름들(D2).
   *
   * **오늘은 보통 전부다.** 화면이 이것으로 *"이미지 없이 나갑니다"*를 내려받기 **전에**
   * 말한다 — 번들의 `errors`가 같은 자리에 있는 것과 같은 짝이다.
   */
  screenless: string[]
}

export async function exportProjectPptx(db: DbHandle, projectId: string): Promise<ProjectPptx> {
  const { ordered, documentById, commentsById, descriptionById } = await collectExportSource(
    db,
    projectId,
  )

  const pages: PptxPage[] = ordered.map((page) => ({
    /** **번들과 같은 이름이다**(`bundleTitle` — 조상 메뉴가 붙어 있다). D3. */
    title: page.bundleTitle,
    document: documentById.get(page.id)!,
    description: descriptionById.get(page.id) ?? null,
    comments: commentsById.get(page.id) ?? [],
  }))

  const { parts, screenless } = exportPptx({ pages })

  return {
    parts,
    pages: ordered.map((page) => ({ id: page.id, title: page.bundleTitle, target: page.target })),
    screenless,
  }
}
