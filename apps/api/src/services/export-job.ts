/**
 * **읽은 행 → 산출물** — 내보내기의 CPU 몫 전부(조립 · 렌더 · 압축). 워커가 이것을 돈다(`export-worker-thread.ts`).
 *
 * DB 를 모르고 HTTP 도 모른다. 그리는 자(브라우저)만 바깥에서 받는다 — 메인이 쥐고 있어서다(`PptxScreenSource`).
 * 같은 스레드에서 불러도 같은 값을 낸다 — 워커로 옮긴 것이 산출물을 바꾸지 않았는지를 `test/export-worker.test.ts`가
 * 이 둘을 견줘 잰다.
 */
import { buildProjectBundle } from './export-bundle'
import { buildProjectPptx, type PptxScreenSource } from './export-pptx'
import type { ExportRows } from './export-source'
import type { ExportJobResult, ExportJobSpec } from './export-worker-protocol'
import { zipBundle, zipParts } from './export-zip'
import type { ScreenBatch, ScreenRequest } from './screen-render'

export async function runExportJob(
  spec: ExportJobSpec,
  rows: ExportRows,
  render: (requests: readonly ScreenRequest[]) => Promise<ScreenBatch>,
): Promise<ExportJobResult> {
  if (spec.kind === 'html') {
    const bundle = buildProjectBundle(rows, spec.theme)
    return {
      kind: 'html',
      zip: spec.zipRoot === null ? null : zipBundle(bundle.files, spec.zipRoot),
      errors: bundle.errors,
      pages: bundle.pages,
      duplicateTargets: bundle.duplicateTargets,
      brokenLinks: bundle.brokenLinks,
      themeId: bundle.themeId,
    }
  }

  const screens: PptxScreenSource | undefined =
    spec.screenTheme === null ? undefined : { theme: spec.screenTheme, render }
  const pptx = await buildProjectPptx(rows, screens)
  return {
    kind: 'pptx',
    // **뿌리 폴더가 없다** — `routes/export.ts`의 내려받기 주석.
    zip: spec.zip ? zipParts(pptx.parts) : null,
    pages: pptx.pages,
    screenless: pptx.screenless,
    screenFailures: pptx.screenFailures,
    fontWarning: pptx.fontWarning,
  }
}
