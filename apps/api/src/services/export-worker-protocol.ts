/**
 * **내보내기 워커와 메인이 주고받는 메시지** — 두 쪽이 이 모양 하나를 본다(`export-worker.ts` · `export-worker-thread.ts`).
 *
 * 값만 담는다 — 워커 경계는 구조화 복제라 함수·클래스 인스턴스가 못 넘는다(`Error`는 넘지만 이름과 글만 남는다). 그래서
 * 도메인 에러는 클래스가 아니라 `ExportJobFailure`의 갈래로 넘기고 메인이 같은 클래스로 되살린다.
 */
import type { BundleNodeError } from '@wirebound/exporter'
import type { BrokenLink, ExportedPageSummary } from './export-bundle'
import type { ScreenFailure } from './export-pptx'
import type { ExportRows } from './export-source'
import type { ScreenPage, ScreenResult } from './screen-render'

/**
 * 어떤 산출물을 만들지. `zipRoot`·`zip`이 없으면 **압축하지 않는다** — 미리보기가 그것이다. `screens`가 거짓이면 pptx 의
 * 화면을 그리지 않는다(메인에 그리는 자가 없다).
 */
export type ExportJobSpec = { kind: 'html'; zipRoot: string | null } | { kind: 'pptx'; screens: boolean; zip: boolean }

export type HtmlJobResult = {
  kind: 'html'
  zip: Uint8Array | null
  errors: BundleNodeError[]
  pages: ExportedPageSummary[]
  duplicateTargets: string[]
  brokenLinks: BrokenLink[]
  themeId: string | null
  themeWarning: string | null
}

export type PptxJobResult = {
  kind: 'pptx'
  zip: Uint8Array | null
  pages: ExportedPageSummary[]
  screenless: string[]
  screenFailures: ScreenFailure[]
  fontWarning: string | null
}

export type ExportJobResult = HtmlJobResult | PptxJobResult

/**
 * 조립이 던진 것. **도메인 에러 둘은 갈래로 넘긴다** — 메인이 같은 클래스로 되살려 라우트의 `orFail`이 같은 스레드에서
 * 던졌을 때와 같은 409 를 낸다. 나머지는 이름과 글만 넘기고 메인이 `Error`로 다시 던진다(→ 500).
 */
export type ExportJobFailure =
  | { kind: 'empty' }
  | { kind: 'unsupported-document'; pageTitle: string; reason: string }
  | { kind: 'error'; name: string; message: string }

/**
 * 메인 → 워커.
 *
 * 행은 **여러 메시지로 쪼개 보낸다**(`rows`) — 메시지 하나를 복제하는 동안 메인의 루프가 멈추므로, 페이지 한 장씩 보내면
 * 멈춤이 가장 큰 페이지 한 장의 복제 시간으로 묶인다. `run`이 오면 워커가 모은 행으로 일을 시작한다.
 */
export type ToWorker =
  | { t: 'job'; spec: ExportJobSpec }
  | { t: 'rows'; part: 'menu'; items: ExportRows['menu'] }
  | { t: 'rows'; part: 'pages'; items: ExportRows['pages'] }
  | { t: 'rows'; part: 'comments'; items: ExportRows['comments'] }
  /** 페이지가 든 그림의 바이트(`ExportRows.images`) — 한 장씩 온다(한 장이 파일 한도 5 MB 까지라 묶지 않는다). */
  | { t: 'rows'; part: 'images'; items: ExportRows['images'] }
  /** 프로젝트 테마 — 패키지 파일 · 토큰(`ExportRows.theme`). 행 뒤 `run` 앞에 한 번 온다. */
  | { t: 'rows'; part: 'theme'; theme: ExportRows['theme']; warning: ExportRows['themeWarning'] }
  | { t: 'run' }
  /** 그려 달라던 것의 답 — 한 장씩(`screen`) 오고 `screens-done`이 닫는다. */
  | { t: 'screen'; index: number; result: ScreenResult }
  | { t: 'screens-done'; fontWarning: string | null }
  | { t: 'screens-failed'; error: unknown }

/**
 * 워커 → 메인. 그려 달라는 요청도 번들 파일 하나씩(`screen-file`) · 찍을 페이지 하나씩(`screen-page`) 보내고 `render`가 닫는다. `accepted`는 `job`을 받자마자
 * 보낸다 — 메인이 «쉬는 동안 죽어 있던 워커»와 «이 일을 하다 죽은 워커»를 가른다(`export-worker.ts`).
 */
export type FromWorker =
  | { t: 'accepted' }
  | { t: 'screen-file'; path: string; content: string | Uint8Array }
  | { t: 'screen-page'; page: ScreenPage }
  | { t: 'render' }
  | { t: 'done'; result: ExportJobResult }
  | { t: 'failed'; failure: ExportJobFailure }
