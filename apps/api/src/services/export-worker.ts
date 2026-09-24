/**
 * **내보내기의 CPU 몫을 이벤트 루프 밖에서 돈다** — 워커 스레드 풀. 라우트(`routes/export.ts`)가 부른다.
 *
 * ---
 *
 * # 왜 루프 밖인가
 *
 * 조립 · 렌더 · 압축은 순수 CPU 이고 크기에 비례한다. 메인에서 돌면 그동안 **이 프로세스의 다른 요청이 전부 선다** —
 * 트랜잭션 안에서 다음 문장을 기다리던 옆 사람의 편집은 그 멈춤을 «트랜잭션 안의 쉼»으로 겪고, 그 쉼이 서버의
 * `idle_in_transaction_session_timeout`을 넘으면 서버가 그 세션을 끝낸다(→ 503 «모름» · 커밋 0 — `db/client.ts`의
 * `createPool` 머리말 «이 값들이 정당한 일을 끊는 판» 표). 워커로 옮기면 메인이 쥐는 것은 **DB 읽기와 메시지 복제**뿐이다.
 *
 * 잰 값(api 스크립트 · 500KB 페이지 72 장(36MB) HTML 내보내기 · 같은 api 에 ops PATCH 를 잇달아 · `/health` 20ms 간격 ·
 * `taskpolicy -b`로 CPU 를 늦춘 api)은 `db/client.ts`의 그 표가 갖는다 — 여기 두 벌로 적지 않는다.
 *
 * **작업을 잘게 쪼개 `setImmediate`로 양보하는 길을 고르지 않은 이유:** 멈춤의 몸통은 페이지 한 장의 렌더와 번들 전체의
 * 압축이다(같은 프로젝트를 모듈 스크립트로 단계마다 잰 값 · 보통 CPU: 수집 0.5s · 렌더 2.1s · 압축 1.1s). 페이지 단위로 쪼개도 한 조각이 **가장 큰 페이지 한 장**
 * 만큼 멈추고 그 크기에 상한이 없다 — 압축은 `fflate`의 동기 API 라 파일 단위로 쪼개도 같다. 그리고 CPU 를 여전히 메인이
 * 쓰므로 그 사이 다른 요청의 지연이 늘어난다. 워커는 조각 크기와 무관하게 메인을 비운다.
 *
 * # 메인이 쥐는 것 — 메시지를 한 장씩 복제한다
 *
 * `postMessage`는 보내는 쪽 스레드에서 값을 **동기로** 복제한다(구조화 복제). 36MB 문서를 한 메시지에 실으면 그 복제만으로
 * 메인이 0.2–0.4s 선다(`taskpolicy -b`). 그래서 페이지를 **한 장씩** 보내고 사이마다 `setImmediate`로 양보한다 — 멈춤이
 * 가장 큰 페이지 한 장의 복제로 묶인다. 돌아오는 것도 같다: 그릴 요청과 그린 그림은 한 장씩, 압축 바이트는 **옮긴다**
 * (`transfer` — 복제하지 않는다).
 *
 * **대가:** 같은 36MB 내보내기의 소요가 보통 CPU 에서 같은 스레드 3.3s 대 워커 4.2s(복제와 워커 쪽 되살리기) · api 프로세스
 * RSS 최고 1.7GB 대 2.1GB(문서가 워커 힙에 한 벌 더 있다). 작은 프로젝트는 워커가 따뜻하면 같다(html 10–30ms).
 *
 * **트랜잭션은 없다.** 내보내기의 읽기는 트랜잭션 밖 단문이고(`readExportRows`) 워커에 넘길 때 쥔 연결이 없다. 워커는 풀도
 * 트랜잭션도 갖지 않는다 — DB 를 모르는 값만 받는다.
 *
 * # 정한 것
 *
 * | 무엇 | 값 | 왜 |
 * |---|---|---|
 * | CPU 칸 | `EXPORT_WORKER_LIMIT`(2 · 코어가 둘 이하면 1) | 내보내기는 드물고 하나가 크다 — 위 «대가»의 메모리가 일마다 붙는다. 칸을 못 얻은 일은 **줄을 선다**(거절하지 않는다) |
 * | 그리기 칸 | `EXPORT_RENDER_LIMIT`(2) — **동시에 뜨는 브라우저 수**다 | 아래 «칸이 둘이다» |
 * | 워커 스레드 수 | CPU 칸 + 그리기 칸까지 | 아래 «칸이 둘이다» |
 * | 쉬는 워커 | `EXPORT_WORKER_IDLE_MS`(60s) 뒤 끝낸다 — **마지막 하나는 새 워커로 갈아 둔다** | 큰 일 뒤의 힙을 쥔 채 남지 않게. 갈아 둔 하나는 늘 따뜻해서, 띄우는 비용(작은 프로젝트의 첫 내보내기가 +0.1–0.3s — `apps/api` 를 띄운 뒤 첫 번 대 둘째 번)은 **프로세스가 뜬 뒤 처음 한 번만** 낸다 |
 * | 요청이 끊기면 | 줄에서 빼거나 **워커를 끝낸다**(`terminate`) | 받을 사람이 없는 일을 끝까지 돌지 않는다. 그리던 브라우저 일은 메인에 남아 끝나고 버려진다 |
 * | 큰 입력의 메모리 | 워커 힙은 V8 기본 한도다(메인과 같은 규칙) | 넘으면 **그 워커만** 죽고(`ERR_WORKER_OUT_OF_MEMORY`) 메인은 산다 → 500 |
 * | 워커가 죽으면 | 그 일은 `ExportWorkerError`(→ 500 · 원인은 로그) · 워커는 버리고 다음 일은 새로 띄운다 | 결과를 모르는 게 아니라 **안 만들어졌다** — 읽기뿐이라 다시 눌러도 안전하다 |
 * | 도메인 에러 | 워커가 갈래로 넘기고 여기서 같은 클래스로 되살린다 | 라우트의 `orFail`이 같은 스레드에서 던졌을 때와 같은 409 를 낸다 |
 *
 * # 칸이 둘이다 — CPU 와 그리기
 *
 * pptx 의 화면은 **메인이 브라우저로 그린다**(`renderFor`). 그동안 워커 스레드는 CPU 를 안 쓰고 답을 기다린다. 그 시간에
 * CPU 칸을 쥐고 있으면 pptx 둘이 그리는 동안(장마다 최대 10s — `screen-render-chromium.ts`의 `SCREEN_DEFAULTS`) 이 프로세스의
 * 다른 내보내기가 전부 줄을 선다 — 작은 html 미리보기까지. 그래서 칸을 가른다:
 *
 * 1. 일은 **CPU 칸**을 얻어 시작한다. 워커 스레드는 일에 붙어 일 상태(받은 행 · 조립 중인 값)를 끝까지 쥔다.
 * 2. 워커가 그려 달라면 **그리기 칸을 먼저 얻고, 그다음 CPU 칸을 내놓는다.** 그리는 동안 그 CPU 칸으로 다른 일이 돈다.
 * 3. 다 그렸으면 그리기 칸을 내놓고 **CPU 칸을 줄 맨 앞에서** 다시 얻은 뒤 그림을 넘긴다(슬라이드 조립 · 압축은 CPU 다).
 *
 * **그리기 칸을 기다리는 동안은 CPU 칸을 쥔다** — 내놓고 기다리면 그 칸으로 새 일이 들어와 워커가 또 뜨고, 그리기를
 * 기다리는 일(각자 워커 하나와 문서 한 벌)이 끝없이 쌓인다. 쥐고 기다리면 떠 있는 일이 CPU 칸 + 그리기 칸으로 묶인다.
 * 대가: pptx 가 그리기 칸 수보다 많이 동시에 그리려 하면 넘은 것이 CPU 칸을 쥔 채 서서 그동안 html 도 선다.
 * **다시 얻을 때 줄 맨 앞인 것**도 같은 까닭이다 — 뒤에 서면 그 사이 새 일이 칸을 얻어 떠 있는 일이 는다. 이미 자원을
 * 쥔 일을 먼저 끝낸다.
 *
 * 끊긴 일의 그리기는 메인에서 끝까지 돌고 버려지는데, **그동안 그리기 칸을 쥔다** — 브라우저가 떠 있는 동안이다.
 *
 * 잰 값(api 스크립트 · 500KB 페이지 72 장 프로젝트의 pptx 미리보기 둘을 진짜 Chromium 으로 돌리는 중에 페이지 한 장짜리 html
 * 미리보기 · 같은 기계 · 큰 둘은 각 9s 안팎):
 *
 * | 작은 것을 넣은 때 | 칸이 하나일 때 | 칸이 둘일 때 | 같은 스레드일 때 |
 * |---|---|---|---|
 * | 1.5s — 큰 둘이 아직 CPU 몫(`exportPage` × 72)을 도는 중 | 7.4s(큰 둘이 끝날 때 같이 끝남) | 1.4–1.7s(큰 둘이 그리기로 넘어가 칸을 내놓을 때까지) | 2.0s(루프 멈춤) |
 * | 4.5s — 큰 둘이 그리는 중 | 4.9–5.1s | 54–665ms(첫 번은 셋째 워커를 띄우는 비용) | — |
 *
 * # 워커가 싣는 코드는 메인과 같다
 *
 * 워커의 `execArgv`는 메인의 `--conditions`만 이어받고 tsx 로더를 싣는다(`workerExecArgv`). 그래서 `tsx src/main.ts`로 도는
 * api 에서는 둘 다 `packages/*`의 `dist`를, vitest(포크가 `--conditions development`로 뜬다)에서는 둘 다 소스를 본다 —
 * 워커만 낡은 `dist`를 도는 일이 없다. 운영 판(api 스크립트 · 같은 프로젝트를 같은 스레드와 워커로 내보냄)에서 html · pptx
 * 의 엔트리가 이름 · 순서 · 바이트까지 같았다.
 *
 * **vitest 에서는 변환기가 다르다** — 메인은 vite 가, 워커는 tsx 가 소스를 옮긴다. 함수의 `toString()`으로 만드는
 * `assets/runtime.js`만 그 하네스에서 글자가 갈린다(`test/export-worker.test.ts`가 그 하나만 갈리는 것을 잰다). tsx 는 tsconfig
 * 의 `include`에 든 파일에만 `jsx`를 걸어서 워커에 `apps/api/export-worker.tsconfig.json`을 준다(그 파일의 머리말).
 *
 * **워커는 모듈을 나눠 갖지 않는다** — 메인이 채운 레지스트리(컴포넌트 카탈로그)도 워커에서는 비어서 뜬다. 채우는 자리는
 * `export-worker-thread.ts`의 첫머리다.
 */
import { availableParallelism } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, type ResourceLimits } from 'node:worker_threads'
import { EmptyProjectError, UnsupportedDocumentError, type ExportRows } from './export-source'
import type {
  ExportJobFailure,
  ExportJobResult,
  ExportJobSpec,
  FromWorker,
  HtmlJobResult,
  PptxJobResult,
  ToWorker,
} from './export-worker-protocol'
import { errorLine, type ScreenBatch, type ScreenRequest } from './screen-render'

/** CPU 칸 수 — 머리말의 표. 코어가 하나뿐인 기계에서는 하나다. */
export const EXPORT_WORKER_LIMIT = Math.max(1, Math.min(2, availableParallelism() - 1))

/** 그리기 칸 수 — 동시에 뜨는 브라우저 수다(머리말 «칸이 둘이다»). */
export const EXPORT_RENDER_LIMIT = 2

/** 쉬는 워커를 끝내기까지(ms) — 머리말의 표. */
export const EXPORT_WORKER_IDLE_MS = 60_000

/** 코멘트를 한 메시지에 몇 개씩 싣나. 코멘트 하나는 작다 — 페이지처럼 한 개씩 보낼 까닭이 없다. */
const COMMENTS_PER_MESSAGE = 1_000

/** 워커 스레드가 죽었다(예외 · 메모리 한도 · 뜻밖의 종료). **일은 안 만들어졌다** — 머리말의 표. */
export class ExportWorkerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ExportWorkerError'
  }
}

/** 요청이 끊겨 일을 버렸다. 받을 사람이 없다 — 라우트는 답하지 않는다. */
export class ExportAbortedError extends Error {
  constructor() {
    super('요청이 끊겨 내보내기를 멈췄습니다')
    this.name = 'ExportAbortedError'
  }
}

export interface ExportRunOptions {
  /** 끊기면 일을 버린다 — 머리말의 표. */
  signal?: AbortSignal
  /** pptx 의 화면을 그리는 자. 워커가 부르면 메인에서 돈다(브라우저를 메인이 쥔다). */
  render?: (requests: readonly ScreenRequest[]) => Promise<ScreenBatch>
}

export interface ExportWorkerPoolOptions {
  /** CPU 칸 수. */
  limit?: number
  /** 그리기 칸 수. */
  renderLimit?: number
  idleMs?: number
  /** 워커 하나의 힙 한도. 없으면 V8 기본이다 — 머리말의 표. 케이스가 한도를 좁혀 «워커만 죽는다»를 잰다. */
  resourceLimits?: ResourceLimits
}

/**
 * tsx 의 ESM 로더 — 워커가 `.ts`를 싣게 한다. 메인이 tsx 로 떠 있든(운영) vitest 로 떠 있든 같은 로더다. 처음 띄울 때
 * 찾는다 — 내보내기를 안 부르는 프로세스가 이것 때문에 못 뜨지 않게.
 */
function tsxEsmLoader(): string {
  return pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href
}

/**
 * 워커의 `execArgv` — 머리말 «워커가 싣는 코드는 메인과 같다». 메인의 `--conditions`(`-C`)만 이어받는다. 나머지 인자는
 * 워커가 거절하거나(`--inspect` 부류) 뜻이 없다(tsx 자신의 `--require`).
 */
export function workerExecArgv(parent: readonly string[] = process.execArgv): string[] {
  const out: string[] = []
  for (let i = 0; i < parent.length; i++) {
    const arg = parent[i]!
    if (arg === '--conditions' || arg === '-C') {
      const value = parent[i + 1]
      if (value !== undefined) out.push('--conditions', value)
      i++
    } else if (arg.startsWith('--conditions=')) {
      out.push(arg)
    }
  }
  return [...out, '--import', tsxEsmLoader()]
}

interface Slot {
  worker: Worker
  idleTimer: NodeJS.Timeout | null
}

/** 일 하나가 지금 CPU 칸을 쥐었나 — 그리는 동안 내놓았다가 다시 얻는다(머리말 «칸이 둘이다»). */
interface Job {
  cpu: boolean
}

interface GateWaiter {
  first: boolean
  resolve(): void
  reject(error: unknown): void
  detach(): void
}

/**
 * 수가 정해진 칸 — CPU 칸과 그리기 칸이 이것이다(머리말 «칸이 둘이다»). 줄은 먼저 온 순서이고, `first`로 선 것은 앞선
 * `first`의 뒤 · 나머지의 앞에 선다. 내놓은 칸은 줄의 맨 앞에게 **그대로 넘긴다** — 사이에 새로 온 것이 끼어들지 않는다.
 */
class Gate {
  private held = 0
  private readonly waiters: GateWaiter[] = []
  private closedWith: Error | null = null

  constructor(private readonly limit: number) {}

  get queued(): number {
    return this.waiters.length
  }

  /** 끊기면(`signal`) 줄에서 빠지고 `ExportAbortedError`다. */
  acquire(signal: AbortSignal | undefined, options?: { first?: boolean }): Promise<void> {
    if (this.closedWith !== null) return Promise.reject(this.closedWith)
    if (signal?.aborted) return Promise.reject(new ExportAbortedError())
    if (this.held < this.limit) {
      this.held++
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: GateWaiter = { first: options?.first === true, resolve, reject, detach: () => undefined }
      if (signal !== undefined) {
        const onAbort = (): void => {
          const at = this.waiters.indexOf(waiter)
          if (at >= 0) this.waiters.splice(at, 1)
          reject(new ExportAbortedError())
        }
        signal.addEventListener('abort', onAbort, { once: true })
        waiter.detach = () => signal.removeEventListener('abort', onAbort)
      }
      const at = waiter.first ? this.waiters.findIndex((other) => !other.first) : -1
      if (at >= 0) this.waiters.splice(at, 0, waiter)
      else this.waiters.push(waiter)
    })
  }

  release(): void {
    const next = this.waiters.shift()
    if (next === undefined) {
      this.held--
      return
    }
    next.detach()
    next.resolve()
  }

  close(error: Error): void {
    this.closedWith = error
    for (const waiter of this.waiters.splice(0)) {
      waiter.detach()
      waiter.reject(error)
    }
  }
}

export class ExportWorkerPool {
  private readonly cpu: Gate
  private readonly draw: Gate
  private readonly idleMs: number
  private readonly resourceLimits: ResourceLimits | undefined
  private readonly idle: Slot[] = []
  private readonly busy = new Set<Slot>()
  private closed = false

  constructor(options?: ExportWorkerPoolOptions) {
    this.cpu = new Gate(Math.max(1, options?.limit ?? EXPORT_WORKER_LIMIT))
    this.draw = new Gate(Math.max(1, options?.renderLimit ?? EXPORT_RENDER_LIMIT))
    this.idleMs = options?.idleMs ?? EXPORT_WORKER_IDLE_MS
    this.resourceLimits = options?.resourceLimits
  }

  /**
   * 떠 있는 워커 · 일에 붙은 워커(그리는 중인 일 포함) · CPU 칸을 기다리는 일. 케이스가 «끊기면 워커를 끝낸다»를 이것으로
   * 잰다.
   */
  get stats(): { threads: number; busy: number; queued: number } {
    return { threads: this.idle.length + this.busy.size, busy: this.busy.size, queued: this.cpu.queued }
  }

  async runHtml(
    rows: ExportRows,
    spec: Extract<ExportJobSpec, { kind: 'html' }>,
    options?: ExportRunOptions,
  ): Promise<HtmlJobResult> {
    return (await this.run(rows, spec, options)) as HtmlJobResult
  }

  async runPptx(
    rows: ExportRows,
    spec: Extract<ExportJobSpec, { kind: 'pptx' }>,
    options?: ExportRunOptions,
  ): Promise<PptxJobResult> {
    return (await this.run(rows, spec, options)) as PptxJobResult
  }

  /** 떠 있는 워커를 전부 끝낸다. 줄 선 일은 거절된다. */
  async close(): Promise<void> {
    this.closed = true
    const error = new ExportWorkerError('내보내기 워커 풀이 닫혔습니다')
    this.cpu.close(error)
    this.draw.close(error)
    const slots = [...this.idle.splice(0), ...this.busy]
    this.busy.clear()
    await Promise.all(slots.map((slot) => this.retire(slot)))
  }

  private async run(rows: ExportRows, spec: ExportJobSpec, options?: ExportRunOptions): Promise<ExportJobResult> {
    await this.cpu.acquire(options?.signal)
    const job: Job = { cpu: true }
    let healthy = false
    let slot: Slot | undefined
    try {
      slot = this.take()
      const result = await this.converse(slot.worker, job, rows, spec, options)
      healthy = true
      return result
    } catch (error) {
      // 도메인 에러는 워커가 멀쩡히 답한 것이다 — 그 워커를 다시 쓴다.
      healthy = error instanceof EmptyProjectError || error instanceof UnsupportedDocumentError || isFailedJob(error)
      throw error
    } finally {
      if (slot !== undefined) this.putBack(slot, healthy)
      if (job.cpu) {
        job.cpu = false
        this.cpu.release()
      }
    }
  }

  /** 일에 붙일 워커 — 쉬는 것이 있으면 그것, 없으면 새로 띄운다. 일하는 동안은 프로세스를 붙잡는다. */
  private take(): Slot {
    if (this.closed) throw new ExportWorkerError('내보내기 워커 풀이 닫혔습니다')
    const slot = this.idle.pop() ?? this.spawn()
    if (slot.idleTimer !== null) clearTimeout(slot.idleTimer)
    slot.idleTimer = null
    slot.worker.ref()
    this.busy.add(slot)
    return slot
  }

  private putBack(slot: Slot, healthy: boolean): void {
    this.busy.delete(slot)
    if (!healthy || this.closed) {
      void this.retire(slot)
      return
    }
    slot.worker.unref()
    slot.idleTimer = setTimeout(() => {
      const at = this.idle.indexOf(slot)
      if (at >= 0) this.idle.splice(at, 1)
      void this.retire(slot)
      // **마지막 하나는 새 것으로 갈아 둔다** — 머리말의 표 «쉬는 워커».
      if (!this.closed && this.idle.length + this.busy.size === 0) this.idle.push(this.spawn())
    }, this.idleMs)
    slot.idleTimer.unref()
    this.idle.push(slot)
  }

  private spawn(): Slot {
    const worker = new Worker(new URL('./export-worker-thread.ts', import.meta.url), {
      execArgv: workerExecArgv(),
      env: { ...process.env, TSX_TSCONFIG_PATH: fileURLToPath(new URL('../../export-worker.tsconfig.json', import.meta.url)) },
      ...(this.resourceLimits === undefined ? {} : { resourceLimits: this.resourceLimits }),
    })
    // 쉬는 워커는 프로세스를 붙잡지 않는다 — 일하는 동안만 붙잡는다(`take` · `putBack`). 약속은 프로세스를 붙잡지 않는다.
    worker.unref()
    // **쉬는 동안 죽으면 그 자리를 비운다** — 안 비우면 다음 일이 죽은 워커를 꺼내고, 그 `exit`은 이미 지나가 `converse`가
    // 못 들어 그 일이 끝없이 기다린다. `exit`이 처리되기 전에 꺼낸 일은 `converse`가 뒤늦은 `exit`을 받아 `ExportWorkerError`다.
    // 일하는 동안의 죽음은 `converse`가 받는다.
    const slot: Slot = { worker, idleTimer: null }
    worker.on('error', () => undefined)
    worker.once('exit', () => {
      const at = this.idle.indexOf(slot)
      if (at >= 0) {
        this.idle.splice(at, 1)
        if (slot.idleTimer !== null) clearTimeout(slot.idleTimer)
      }
    })
    return slot
  }

  private async retire(slot: Slot): Promise<void> {
    if (slot.idleTimer !== null) clearTimeout(slot.idleTimer)
    slot.idleTimer = null
    await slot.worker.terminate()
  }

  /** 일 하나를 주고받는다 — 행을 한 장씩 보내고, 그려 달라면 그려 주고, 답을 받는다. */
  private converse(
    worker: Worker,
    job: Job,
    rows: ExportRows,
    spec: ExportJobSpec,
    options: ExportRunOptions | undefined,
  ): Promise<ExportJobResult> {
    const signal = options?.signal
    // 이 일이 끝났다(답 · 실패 · 끊김 · 죽음) — 칸을 기다리던 그리기 뒤처리도 이것으로 멈춘다.
    const ended = new AbortController()
    return new Promise<ExportJobResult>((resolve, reject) => {
      const requests: ScreenRequest[] = []

      const finish = (outcome: () => void): void => {
        if (ended.signal.aborted) return
        ended.abort()
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
        signal?.removeEventListener('abort', onAbort)
        outcome()
      }
      const onError = (error: unknown): void => {
        finish(() => reject(new ExportWorkerError(`내보내기 워커가 죽었습니다: ${errorLine(error)}`, { cause: error })))
      }
      const onExit = (code: number): void => {
        finish(() => reject(new ExportWorkerError(`내보내기 워커가 일하는 중에 끝났습니다(종료 코드 ${code})`)))
      }
      const onAbort = (): void => {
        // `putBack`이 이 워커를 버린다(healthy 가 아니다) — 받을 사람이 없는 일을 끝까지 돌지 않는다.
        finish(() => reject(new ExportAbortedError()))
      }
      const onMessage = (message: FromWorker): void => {
        switch (message.t) {
          case 'screen-request':
            requests.push(message.request)
            return
          case 'render':
            void this.renderFor(worker, job, requests.splice(0), options?.render, ended.signal)
            return
          case 'done':
            finish(() => resolve(message.result))
            return
          case 'failed':
            finish(() => reject(reviveFailure(message.failure)))
            return
        }
      }

      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) {
        onAbort()
        return
      }

      void this.feed(worker, rows, spec, () => ended.signal.aborted).catch((error: unknown) => {
        finish(() => reject(new ExportWorkerError(`내보내기 워커에 입력을 넘기지 못했습니다: ${errorLine(error)}`, { cause: error })))
      })
    })
  }

  /** 행을 **한 장씩** 보낸다 — 머리말 «메인이 쥐는 것». 끝났으면(끊김 · 죽음) 그만 보낸다. */
  private async feed(worker: Worker, rows: ExportRows, spec: ExportJobSpec, done: () => boolean): Promise<void> {
    const post = (message: ToWorker): void => worker.postMessage(message)
    post({ t: 'job', spec: cloneableSpec(spec) })
    post({ t: 'rows', part: 'menu', items: rows.menu })
    for (const page of rows.pages) {
      await yieldToLoop()
      if (done()) return
      post({ t: 'rows', part: 'pages', items: [page] })
    }
    for (let at = 0; at < rows.comments.length; at += COMMENTS_PER_MESSAGE) {
      await yieldToLoop()
      if (done()) return
      post({ t: 'rows', part: 'comments', items: rows.comments.slice(at, at + COMMENTS_PER_MESSAGE) })
    }
    if (done()) return
    post({ t: 'run' })
  }

  /**
   * 워커가 그려 달란 것을 메인에서 그리고 **한 장씩** 돌려준다. 그리는 동안은 CPU 칸을 내놓는다 — 머리말 «칸이 둘이다».
   * 그리는 자가 없으면 워커는 애초에 부르지 않는다.
   *
   * 칸을 얻고 난 뒤에는 늘 `ended`를 다시 본다 — 칸이 넘어온 뒤 이어서 돌기 전에 일이 끝났을 수 있고, 그때 `run`의
   * `finally`는 이미 지나갔다(`job.cpu`로 무엇을 돌려줄지 가른다).
   */
  private async renderFor(
    worker: Worker,
    job: Job,
    requests: ScreenRequest[],
    render: ExportRunOptions['render'],
    ended: AbortSignal,
  ): Promise<void> {
    if (render === undefined) {
      if (ended.aborted) return
      worker.postMessage({
        t: 'screens-failed',
        error: plainError(new Error('그리는 자가 없는데 워커가 그려 달라고 했습니다')),
      } satisfies ToWorker)
      return
    }
    try {
      await this.draw.acquire(ended)
    } catch {
      return
    }
    if (ended.aborted) {
      this.draw.release()
      return
    }
    job.cpu = false
    this.cpu.release()

    let batch: ScreenBatch | null = null
    let failure: unknown = null
    try {
      batch = await render(requests)
    } catch (error) {
      failure = error
    } finally {
      this.draw.release()
    }

    try {
      await this.cpu.acquire(ended, { first: true })
    } catch {
      return
    }
    if (ended.aborted) {
      this.cpu.release()
      return
    }
    job.cpu = true

    if (batch === null) {
      worker.postMessage({ t: 'screens-failed', error: plainError(failure) } satisfies ToWorker)
      return
    }
    for (const [index, result] of batch.results.entries()) {
      await yieldToLoop()
      if (ended.aborted) return
      worker.postMessage({ t: 'screen', index, result } satisfies ToWorker)
    }
    if (!ended.aborted) worker.postMessage({ t: 'screens-done', fontWarning: batch.fontWarning } satisfies ToWorker)
  }
}

/**
 * **던져진 것을 워커로 넘길 수 있는 값으로** — 이름과 글만 남긴다. 받는 쪽(`drawScreens`)이 읽는 것은 글의 첫 줄뿐이고
 * (`errorLine`), 던져진 것이 복제 못 할 것(연결 · 함수)을 `cause`로 달고 있으면 `postMessage`가 통째로 거절한다.
 */
function plainError(error: unknown): Error {
  const plain = new Error(error instanceof Error ? error.message : String(error))
  if (error instanceof Error) plain.name = error.name
  return plain
}

function cloneableSpec(spec: ExportJobSpec): ExportJobSpec {
  if (spec.kind !== 'pptx' || spec.screenTheme === null || spec.screenTheme.ok) return spec
  return { ...spec, screenTheme: { ok: false, error: plainError(spec.screenTheme.error) } }
}

/** 워커가 넘긴 실패를 메인의 에러로 되살린다 — 도메인 에러는 **같은 클래스**다(`routes/export.ts`의 `orFail`). */
function reviveFailure(failure: ExportJobFailure): Error {
  switch (failure.kind) {
    case 'empty':
      return new EmptyProjectError()
    case 'unsupported-document':
      return new UnsupportedDocumentError(failure.pageTitle, failure.reason)
    case 'error': {
      const error = new Error(failure.message)
      error.name = failure.name
      FAILED_JOBS.add(error)
      return error
    }
  }
}

/** 워커가 멀쩡히 «던졌다»고 답한 에러 — 워커를 버릴 까닭이 없다. */
const FAILED_JOBS = new WeakSet<Error>()

function isFailedJob(error: unknown): boolean {
  return error instanceof Error && FAILED_JOBS.has(error)
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
