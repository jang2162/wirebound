/**
 * **내보내기 워커 스레드의 입구** — 메인이 `export-worker.ts`에서 띄운다. 이 파일을 메인에서 import 하지 않는다
 * (불러오는 순간 `parentPort`에 듣는 자를 단다).
 *
 * 한 번에 일 하나다 — 메인의 풀이 일이 끝나기 전에 다음 일을 주지 않는다. 메시지 모양은 `export-worker-protocol.ts`.
 */
import { parentPort } from 'node:worker_threads'
import { ensureCatalog } from '../schema-setup'
import { EmptyProjectError, UnsupportedDocumentError, type ExportRows } from './export-source'
import { runExportJob } from './export-job'
import type { ExportJobFailure, ExportJobSpec, FromWorker, ToWorker } from './export-worker-protocol'
import type { ScreenBatch, ScreenJob, ScreenResult } from './screen-render'

const port = parentPort
if (port === null) throw new Error('export-worker-thread 는 워커 스레드로만 띄운다(export-worker.ts)')

// **워커는 메인과 모듈을 나눠 갖지 않는다** — 컴포넌트 레지스트리도 비어서 뜬다. 메인과 같은 함수로 채운다(메인은 `buildApp`이
// 부른다).
ensureCatalog()

let spec: ExportJobSpec | null = null
let rows: ExportRows = emptyRows()
/** 메인에 그려 달라고 보낸 뒤 답을 모으는 자리. */
let pendingScreens: { results: ScreenResult[]; resolve(batch: ScreenBatch): void; reject(error: unknown): void } | null = null

function emptyRows(): ExportRows {
  return { menu: [], pages: [], comments: [], theme: null, themeWarning: null, images: [], codes: [] }
}

function send(message: FromWorker, transfer: ArrayBuffer[] = []): void {
  port!.postMessage(message, transfer)
}

/** 그려 달라는 요청 — 번들 파일 하나씩 · 찍을 페이지 하나씩 보내고 `render`로 닫는다(메인의 루프가 큰 메시지 하나를 복제하느라 멈추지 않게). */
function render(job: ScreenJob): Promise<ScreenBatch> {
  return new Promise((resolve, reject) => {
    pendingScreens = { results: [], resolve, reject }
    for (const [path, content] of job.files) send({ t: 'screen-file', path, content })
    for (const page of job.pages) send({ t: 'screen-page', page })
    send({ t: 'render' })
  })
}

function failureOf(error: unknown): ExportJobFailure {
  if (error instanceof EmptyProjectError) return { kind: 'empty' }
  if (error instanceof UnsupportedDocumentError) {
    return { kind: 'unsupported-document', pageTitle: error.pageTitle, reason: error.reason }
  }
  if (error instanceof Error) return { kind: 'error', name: error.name, message: error.message }
  return { kind: 'error', name: 'Error', message: String(error) }
}

async function run(job: ExportJobSpec, input: ExportRows): Promise<void> {
  try {
    const result = await runExportJob(job, input, render)
    // 압축 바이트는 이 워커가 만든 것이라 넘겨도 된다(fflate 가 새로 잡은 버퍼 — 남과 나눠 쓰지 않는다).
    send({ t: 'done', result }, result.zip === null ? [] : [result.zip.buffer as ArrayBuffer])
  } catch (error) {
    send({ t: 'failed', failure: failureOf(error) })
  }
}

port.on('message', (message: ToWorker) => {
  switch (message.t) {
    case 'job':
      spec = message.spec
      rows = emptyRows()
      send({ t: 'accepted' })
      return
    case 'rows':
      if (message.part === 'menu') rows.menu.push(...message.items)
      else if (message.part === 'pages') rows.pages.push(...message.items)
      else if (message.part === 'comments') rows.comments.push(...message.items)
      else if (message.part === 'images') rows.images.push(...message.items)
      else if (message.part === 'codes') rows.codes = message.items
      else {
        rows.theme = message.theme
        rows.themeWarning = message.warning
      }
      return
    case 'run': {
      const job = spec!
      const input = rows
      spec = null
      rows = emptyRows()
      void run(job, input)
      return
    }
    case 'screen':
      pendingScreens!.results[message.index] = message.result
      return
    case 'screens-done': {
      const pending = pendingScreens!
      pendingScreens = null
      pending.resolve({ results: pending.results, fontWarning: message.fontWarning })
      return
    }
    case 'screens-failed': {
      const pending = pendingScreens!
      pendingScreens = null
      pending.reject(message.error)
      return
    }
  }
})
