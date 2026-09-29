/**
 * **읽은 행 → 산출물** — 내보내기의 CPU 몫 전부(조립 · 렌더 · 압축). 워커가 이것을 돈다(`export-worker-thread.ts`).
 *
 * DB 를 모르고 HTTP 도 모른다. 그리는 자(브라우저)만 바깥에서 받는다 — 메인이 쥐고 있어서다(`PptxScreenSource`).
 * 같은 스레드에서 불러도 같은 값을 낸다 — 워커에서 돈 산출물과 같은 스레드의 산출물을 `test/export-worker.test.ts`가
 * 견줘 잰다.
 */
import { buildProjectBundle } from './export-bundle'
import { buildProjectPptx, type PptxScreenSource } from './export-pptx'
import type { ExportRows } from './export-source'
import type { ExportJobResult, ExportJobSpec } from './export-worker-protocol'
import { zipBundle, zipParts } from './export-zip'
import type { ScreenBatch, ScreenJob } from './screen-render'

export async function runExportJob(
  spec: ExportJobSpec,
  rows: ExportRows,
  render: (job: ScreenJob) => Promise<ScreenBatch>,
): Promise<ExportJobResult> {
  if (spec.kind === 'html') {
    const bundle = buildProjectBundle(rows)
    return {
      kind: 'html',
      zip: spec.zipRoot === null ? null : zipBundle(bundle.files, spec.zipRoot),
      errors: bundle.errors,
      pages: bundle.pages,
      duplicateTargets: bundle.duplicateTargets,
      brokenLinks: bundle.brokenLinks,
      themeId: bundle.themeId,
      themeWarning: bundle.themeWarning,
    }
  }

  const screens: PptxScreenSource | undefined = spec.screens ? { render } : undefined
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
