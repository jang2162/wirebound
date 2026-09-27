/**
 * **내보내기 라우트**(설계서 「HTML 정적 번들」). `app.ts`가 `/api/projects` prefix로 등록한다.
 *
 * | 라우트 | 무엇 | 최소 역할 |
 * |---|---|---|
 * | `GET /:projectId/export/preview[?format=]` | 내려받기 **전에** 화면이 말할 것 | viewer |
 * | `GET /:projectId/export[?format=]` | 파일 그 자체 (zip 또는 pptx) | viewer |
 *
 * HTTP·zod 검증만 다룬다 — SQL은 `repos/`가, 조립은 `services/export-bundle.ts`가,
 * 압축은 `services/export-zip.ts`가 한다(`apps/api/README.md` 「계층 규칙」 절). **조립과 압축은 워커 스레드에서 돈다** —
 * 여기서는 읽기만 하고 넘긴다(`services/export-worker.ts`).
 *
 * ---
 *
 * # **새 라우트가 아니라 `?format=`이다**
 *
 * 자원이 같다 — *"이 프로젝트의 내보내기"*이고 표현만 다르다. 판정의 근거 셋:
 *
 * | 무엇 | 값 |
 * |---|---|
 * | 라우트를 늘리면 | `permission-matrix.test.ts`·`actor-census.test.ts`의 라우트 표가 형식마다 자란다. 형식은 앞으로도 는다 |
 * | 파일 이름 | 이미 URL에 없다(아래 「URL에 파일 이름을 쓰지 않는다」) — 그러므로 경로로 형식을 가르는 이득이 없다 |
 * | `wireb export --format` | 이미 있는 인자이고 **한 줄로** 이어진다 |
 *
 * **모르는 값은 400이다.** 조용히 html로 떨어뜨리면 pptx를 부른 사람이 zip을 받고, 그
 * 상태는 파일을 열어 봐야 보인다.
 *
 * # 미리보기가 형식마다 **다른 것**을 말한다
 *
 * `duplicateTargets`·`brokenLinks`·`errors`·`themeId`는 **HTML 번들의 성질이다.** PPTX는
 * 페이지 사이 링크를 만들지 않고(설계서 「명시적으로 제외한 것 (YAGNI)」이 도형 변환을 뺐으므로 슬라이드는
 * 글자와 이미지뿐이다) 번들의 테마 칸(`themeId`)도 안 쓴다. **그 넷을 pptx 응답에 그대로 실으면 값이 있는데 그
 * 값이 아무것도 안 가리킨다.**
 *
 * 대신 pptx는 **셋**을 낸다:
 *
 * | 값 | 뜻 |
 * |---|---|
 * | `screenless` | **아무도 안 그렸다** — 그리는 자가 없었다 |
 * | `screenFailures` | **그리려다 죽었다** — 페이지 이름과 이유 |
 * | `fontWarning` | 그린 기계에 한글 글꼴이 없었다 |
 *
 * `format`을 응답에 **되싣는다** — 화면이 어느 갈래를 받았는지 키 유무로 짐작하지 않는다.
 *
 * # 미리보기와 내려받기가 **같은 판정**을 쓴다
 *
 * 둘 다 `exportProjectPptx`를 지나고 **같은 `screenRenderer`를 받는다.** 미리보기가 싼
 * 답을 따로 만들면 화면이 *"괜찮다"*고 한 다음 파일이 그림 없이 나오는 날이 온다 —
 * *"내려받기 버튼이 조용히 성공하면 안 된다"*(아래 미리보기 핸들러의 머리말)가 막는 자리가 그것이다.
 *
 * **대가는 미리보기가 내려받기만큼 무겁다는 것이다** — 미리보기도 페이지 N장을 그린다.
 *
 * # 권한은 viewer다
 *
 * 설계서 「권한 모델」에서 viewer는 *"조회 전용"*이다. 번들은 **viewer가 화면에서 볼 수 있는 것을 파일로
 * 받는 것**이므로 새 권한을 만들지 않는다. *"번들이 화면보다 더 담는 것이
 * 없는가"*를 세면:
 *
 * | 번들이 담는 것 | viewer가 화면에서 보는가 |
 * |---|---|
 * | 페이지 문서 | 그렇다 — `GET .../pages/:id`가 viewer다 |
 * | 페이지 설명 | 그렇다 — 같은 응답에 있다 |
 * | 코멘트(본문·작성자 이름·작성 시각) | 그렇다 — `GET .../comments`가 viewer이고 같은 세 값을 낸다 |
 * | 메뉴·페이지 트리 | 그렇다 — `GET .../tree`가 viewer다 |
 * | 상호작용 문장 | 그렇다 — 문서 안의 `interactions`에서 만들어진다 |
 *
 * **더 담는 것이 없다.** 담지 **않는** 것은 있다 — revision 이력·스냅샷·멤버 목록·
 * 페이지 id 밖의 내부 식별자.
 *
 * # 잠금 census에 안 들어간다
 *
 * `test/restore-lock-census.test.ts`가 세는 단위는 *"`projectGuard`가 걸린 **비-`GET`**
 * 라우트"*다. 내보내기는 **읽기**이고 `FOR UPDATE`는 읽기를 막지 않으므로 그 표의 물음
 * (*"복원 중에 막히는가"*)이 이 라우트에 대해 성립하지 않는다. 그래서 **내보내기 라우트가 늘어도
 * 그 표는 안 죽고, 죽지 않는 것이 옳다** — 근거는 그 파일의 *"세는 단위"* 절이다.
 *
 * 대신 `test/permission-matrix.test.ts`는 **`GET`도 센다.** 그쪽 표에는 이 두 줄이 있다.
 *
 * # URL에 파일 이름을 쓰지 않는다
 *
 * 파일 이름은 안정한 열쇠가 아니다(`pageFileNames`가 충돌을 자리 순서로
 * 풀어서 페이지를 앞에 끼워 넣으면 뒤 이름들의 번호가 밀린다). 그것으로 URL을 만들면
 * 페이지를 하나 더할 때 남의 북마크가 깨진다. **사람이 읽는 이름은 `Content-Disposition`과
 * 미리보기 응답의 `fileName`에만 있다.**
 *
 * # 빈 프로젝트가 409인 이유
 *
 * 이 저장소에서 409는 *"요청은 옳은데 지금 상태가 그것을 허락하지 않는다"*이다(`apps/api/README.md`
 * 「에러 형식」 절의 표 — 자식이 있는 메뉴 삭제). 페이지를 하나 만들면 되는 **고쳐질 수 있는 상태**다. 404는 *"없다"*로
 * 끝나고 `projectGuard`가 outsider에게 이미 그것을 낸다.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { conflict, notFound } from '../errors'
import { parseParams, parseQuery } from '../http/parse'
import { findProjectById } from '../repos/projects'
import { EmptyProjectError, UnsupportedDocumentError, readExportRows } from '../services/export-source'
import { ExportAbortedError, ExportWorkerPool, type ExportAdmission } from '../services/export-worker'
import type { HtmlJobResult, PptxJobResult } from '../services/export-worker-protocol'
import type { ScreenRenderer } from '../services/screen-render'
import {
  PPTX_CONTENT_TYPE,
  bundleFileName,
  bundleRootDirectory,
  pptxFileName,
} from '../services/export-zip'

const ProjectIdParams = z.object({ projectId: z.uuid() })

/**
 * **이 서버가 낼 수 있는 형식.** 표가 분모다 — 형식을 더하면 zod 검사·아래 `switch`·
 * `apps/api/README.md` 「내보내기」 절의 표가 함께 걸린다.
 *
 * **`packages/cli`의 `EXPORT_FORMATS`와 같은 목록이 아니다** — 그쪽은 *"이 `wireb`가
 * 파일로 쓸 줄 아는 형식"*이고 이쪽은 *"이 서버가 만들 줄 아는 형식"*이다. 서버가 형식을
 * 더해도 옛 `wireb`는 그것을 못 쓰는 것이 맞고, 그때 사람이 볼 곳은 `wireb`의 사용법이다.
 */
const EXPORT_FORMATS = ['html', 'pptx'] as const

type ExportFormat = (typeof EXPORT_FORMATS)[number]

/**
 * **pptx 파일 응답이 화면 이미지의 수를 머리에 싣는다** — 그리려다 실패한 장(`screenFailures`)과 아무도 안 그린 장
 * (`screenless`)의 수. 이유는 미리보기가 말하고 여기는 **수만** 싣는다(머리는 ByteString 이라 한국어 이유를 못 싣는다).
 *
 * 파일만 받는 쪽(`wireb export`)은 미리보기를 안 부르므로 그림이 빠진 pptx 를 **조용히 성공으로** 받는다. 그것을 말하게 하는
 * 길이 둘인데 — 클라이언트가 미리보기를 함께 부르면 브라우저를 두 번 띄우고(미리보기도 같은 판정으로 그린다), 본문에 이유를
 * 실으면 파일 형식이 바뀐다 — 머리는 **본문을 안 건드린다.** 늘 싣는다(0 도) — 받는 쪽이 «0 장»과 «이 머리를 모르는 서버»를
 * 가른다. `packages/cli/src/commands/export.ts`에 같은 글자가 있고 `test/export-pptx-screens.test.ts`가 두 소스를 맞댄다.
 */
export const SCREEN_FAILURES_HEADER = 'x-wb-screen-failures'
export const SCREENLESS_HEADER = 'x-wb-screenless'

/** **기본은 `html`이다** — 형식 인자 없이 부르는 URL은 zip을 받는 것이 계약이다. */
const FormatQuery = z.object({ format: z.enum(EXPORT_FORMATS).default('html') })

/**
 * **`services`의 도메인 에러를 여기서 상태 코드로 옮긴다** — 서비스는 HTTP를 모른다.
 *
 * **네 라우트가 이 한 자리를 지난다**(형식 둘 × 미리보기·내려받기). 형식마다 따로 두면
 * 같은 상태가 형식에 따라 다른 코드로 나가고, 그 갈림은 빈 프로젝트를 만들어 봐야 보인다.
 */
async function orFail<T>(build: () => Promise<T>): Promise<T> {
  try {
    return await build()
  } catch (error) {
    if (error instanceof EmptyProjectError) {
      throw conflict('내보낼 페이지가 없습니다')
    }
    if (error instanceof UnsupportedDocumentError) {
      throw conflict(error.message)
    }
    throw error
  }
}

/**
 * **읽기는 여기(메인)서, 조립부터는 워커가** 한다 — `services/export-worker.ts`의 머리말. 읽기는 트랜잭션 밖 단문이라
 * 워커에 넘길 때 쥔 연결이 없다.
 *
 * `zipRoot`가 `null`이면 압축하지 않는다(미리보기).
 */
function buildHtmlOrFail(
  app: FastifyInstance,
  workers: ExportWorkerPool,
  request: FastifyRequest,
  projectId: string,
  zipRoot: string | null,
  signal: AbortSignal,
): Promise<HtmlJobResult> {
  return orFail(() =>
    admitted(workers, request, signal, async (admission) => {
      const rows = await readExportRows(app.db, projectId)
      return workers.runHtml(rows, { kind: 'html', zipRoot }, { signal, admission })
    }),
  )
}

/**
 * pptx 도 같다 — 다만 **그리기는 메인에 남는다**(브라우저를 메인이 쥔다). 워커가 그려 달라면 여기서 `renderer`를 부른다
 * (`services/export-pptx.ts`의 «그리는 것은 이음매 뒤다»).
 */
function buildPptxOrFail(
  app: FastifyInstance,
  workers: ExportWorkerPool,
  request: FastifyRequest,
  projectId: string,
  renderer: ScreenRenderer | undefined,
  zip: boolean,
  signal: AbortSignal,
): Promise<PptxJobResult> {
  return orFail(() =>
    admitted(workers, request, signal, async (admission) => {
      const rows = await readExportRows(app.db, projectId)
      return workers.runPptx(
        rows,
        { kind: 'pptx', screens: renderer !== undefined, zip },
        { signal, admission, ...(renderer === undefined ? {} : { render: (requests) => renderer.render(requests) }) },
      )
    }),
  )
}

/**
 * **읽기 전에 자리를 잡는다** — 떠 있는 일이 차면 `ExportBusyError`(→ 503)로 곧바로 거절해 36MB 를 읽지 않는다
 * (`services/export-worker.ts`의 «줄은 길이로 묶는다»). 일을 넘기기 전에 던지면 여기서 자리를 내놓는다.
 *
 * **자리의 임자는 요청한 사람이다**(같은 파일의 «한 사람이 줄을 다 쥐지 않는다») — 세션이면 그 사용자, 토큰이면 그 토큰의
 * 사용자다(`auth/plugin.ts`가 `currentUser`를 채운다). 토큰마다 세지 않는 것은 사람이 토큰을 더 만들어 한도를 넘지 않게다.
 */
async function admitted<T>(
  workers: ExportWorkerPool,
  request: FastifyRequest,
  signal: AbortSignal,
  build: (admission: ExportAdmission) => Promise<T>,
): Promise<T> {
  // `projectGuard`를 지난 요청이라 늘 있다 — 없으면 가드를 안 건 라우트가 부른 것이다(프로그래밍 오류).
  const person = request.currentUser?.id
  if (person === undefined) throw new Error('내보내기의 자리는 projectGuard 를 지난 요청에서만 잡는다')
  // **이미 끊겼으면 자리를 잡지 않는다** — 잡으면 행을 다 읽을 때까지 전체 자리를 쥔다(읽고 나서야 풀이 끊김을 본다).
  if (signal.aborted) throw new ExportAbortedError()
  const admission = workers.admit(person)
  // **끊긴 순간 사람 몫을 돌려준다**(`ExportAdmission`의 `leave`). 웹 패널은 형식을 바꾸면 앞 미리보기를 끊고 곧바로 새로
  // 부른다 — 끊긴 일이 행을 읽는 동안 사람 몫을 쥐면 빠르게 두 번 바꾼 셋째가 «내 내보내기» 503 이다
  // (`test/export-abort-slot.test.ts`). 전체 자리는 읽기가 끝나 `release`할 때까지 쥔다.
  const leave = (): void => admission.leave()
  signal.addEventListener('abort', leave, { once: true })
  try {
    return await build(admission)
  } finally {
    signal.removeEventListener('abort', leave)
    admission.release()
  }
}

/**
 * **요청이 끊기면 일을 버린다**(`services/export-worker.ts`의 표). 응답을 끝내기 전에 연결이 닫힌 것이 «끊김»이다 —
 * 다 보낸 뒤의 `close`는 아니다.
 */
function abortOnClientGone(request: FastifyRequest, reply: FastifyReply): AbortSignal {
  const controller = new AbortController()
  // 가드(`projectGuard`)가 DB 를 읽는 사이에 이미 끊겼으면 `close`는 지나갔다 — 기다려도 안 온다.
  if (request.raw.socket?.destroyed === true) {
    controller.abort()
    return controller.signal
  }
  reply.raw.once('close', () => {
    if (!reply.raw.writableFinished) controller.abort()
  })
  return controller.signal
}

/**
 * 끊긴 요청에는 **답하지 않는다** — 받을 사람이 없다. 오류 처리기로 보내면 «처리되지 않은 예외»로 적히고 닫힌 연결에
 * 500 을 쓰려 한다.
 */
function quietWhenGone<R>(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<R>,
): (request: FastifyRequest, reply: FastifyReply) => Promise<R | FastifyReply> {
  return async (request, reply) => {
    try {
      return await handler(request, reply)
    } catch (error) {
      if (!(error instanceof ExportAbortedError)) throw error
      request.log.info('요청이 끊겨 내보내기를 멈췄다')
      reply.hijack()
      reply.raw.destroy()
      return reply
    }
  }
}

/**
 * 프로젝트의 슬러그. `projectGuard`가 이미 멤버십을 확인했으므로 여기서 `null`이 되는
 * 것은 **그 사이에 프로젝트가 지워진** 경우뿐이다.
 */
async function projectSlug(app: FastifyInstance, projectId: string): Promise<string> {
  const project = await findProjectById(app.db, projectId)
  if (!project) throw notFound('프로젝트를 찾을 수 없습니다')
  return project.slug
}

/**
 * `app.ts`가 `app.register(exportRoutes({…}), { prefix: '/api/projects' })`로 등록하는 팩토리.
 *
 * **`screenRenderer`를 안 주면 pptx가 이미지 없이 나간다** — `buildApp`의
 * 같은 이름 필드를 그대로 받는다. 근거는 그쪽 머리말에 있다.
 */
export function exportRoutes(options?: { screenRenderer?: ScreenRenderer; renderLimit?: number }) {
  const screenRenderer = options?.screenRenderer

  return async function plugin(app: FastifyInstance): Promise<void> {
    // **앱 하나에 풀 하나** — 앱이 닫히면 워커도 끝낸다. 워커는 처음 내보낼 때 뜬다(`services/export-worker.ts`).
    const workers = new ExportWorkerPool({ renderLimit: options?.renderLimit })
    app.addHook('onClose', () => workers.close())

    /**
     * **내려받기 버튼이 조용히 성공하면 안 된다.**
     *
     * 폴백이 든 HTML도 눈으로는 그럴듯한 한 장이고 **번들은 그것을 남에게 전달한다.**
     * 그래서 화면이 내려받기 **전에** 무엇이 실릴지와 무엇이 어긋났는지 볼 수 있어야 한다.
     *
     * **`pages[].target`을 함께 내는 것이 이 응답의 둘째 몫이다.** 저작 화면의
     * `navigate`·`openModal` 타겟은 **손으로 적는 자유 입력**이고(고르개가 없다)
     * 서버가 조립하는 문자열이 무엇인지 알 길이 여기밖에 없다.
     * 화면이 그 문자열을 보이면 저작하는 사람이 그것을 그대로 적을 수 있다.
     *
     * **런타임이 꺼진 페이지는 여기서 말하지 않는다.** 한 노드를 여러 규칙이 서로 다른
     * prop으로 겨누면 미리 그릴 판이 곱으로 늘고, 상한을 넘으면 그 페이지의 런타임이
     * 꺼진다. 그런데 그 사실이 `exportBundle`의 `errors`에 안 담기고,
     * 여기서 다시 세려면 **그 상한을 두 벌로 갖게 된다** — 그러면 둘이 갈리는 날 화면이
     * 거짓을 말한다. *"번들 자신이 말한다"* — 그 페이지의 상태
     * 줄에 이유가 뜬다.
     */
    app.get('/:projectId/export/preview', { preHandler: projectGuard('viewer') }, quietWhenGone(async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const { format } = parseQuery(FormatQuery, request.query)
      const signal = abortOnClientGone(request, reply)

      if (format === 'pptx') {
        const pptx = await buildPptxOrFail(app, workers, request, projectId, screenRenderer, false, signal)
        return {
          format,
          pages: pptx.pages,
          /**
           * **아무도 안 그린 페이지들.** 그리는 자가 없으면 전부다.
           * *"그리려다 실패했다"*는 아래 `screenFailures`로 간다 — 둘이 접히면 화면이
           * 거짓을 말한다.
           */
          screenless: pptx.screenless,
          /** **그리려다 죽은 페이지들과 그 이유.** 번들의 `errors`가 있는 자리다. */
          screenFailures: pptx.screenFailures,
          /** 그린 기계에 한글 글꼴이 없었다. 없으면 `null`이다. */
          fontWarning: pptx.fontWarning,
          fileName: pptxFileName(await projectSlug(app, projectId)),
        }
      }

      const bundle = await buildHtmlOrFail(app, workers, request, projectId, null, signal)

      return {
        format,
        pages: bundle.pages,
        duplicateTargets: bundle.duplicateTargets,
        brokenLinks: bundle.brokenLinks,
        // `errors[].error`는 `NodeRenderError`다 — 그대로 싣는다. 화면이 `title`로
        // 어느 페이지인지 말한다(경로는 잘리거나 순번이 붙어 제목과 다를 수 있다).
        errors: bundle.errors,
        themeId: bundle.themeId,
        /** 내려받을 때 붙을 이름. **화면이 이것을 지어내지 않는다** — 두 벌이면 갈린다. */
        fileName: bundleFileName(await projectSlug(app, projectId)),
      }
    }))

    /**
     * **zip 그 자체.**
     *
     * `Content-Disposition`의 이름은 슬러그에서 나오고 슬러그는 소문자·숫자·하이픈뿐이라
     * (`routes/projects.ts`의 형식 검사) 인용부호 안에 그대로 쓸 수 있다 — `filename*`의
     * 퍼센트 인코딩이 필요한 글자가 애초에 못 들어간다.
     *
     * **응답 크기에 서버 쪽 상한이 없다**(Fastify의 `bodyLimit`은
     * **요청** 쪽이고 응답에는 걸리지 않는다). 번들 전체가 페이지 수의 제곱이므로
     * 언젠가 이 자리가 물음이 된다.
     */
    app.get('/:projectId/export', { preHandler: projectGuard('viewer') }, quietWhenGone(async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const { format } = parseQuery(FormatQuery, request.query)
      const slug = await projectSlug(app, projectId)
      const signal = abortOnClientGone(request, reply)

      if (format === 'pptx') {
        // **뿌리 폴더가 없다** — 워커가 `zipParts`로 묶는다(`services/export-job.ts`). `[Content_Types].xml`이 패키지
        // 뿌리에 있어야 하고, 폴더 하나를 씌우면 받는 쪽이 그것을 못 찾아 **파일이 통째로 안 열린다.**
        const pptx = await buildPptxOrFail(app, workers, request, projectId, screenRenderer, true, signal)
        reply.header(SCREEN_FAILURES_HEADER, String(pptx.screenFailures.length))
        reply.header(SCREENLESS_HEADER, String(pptx.screenless.length))
        return sendFile(reply, pptx.zip!, PPTX_CONTENT_TYPE, pptxFileName(slug))
      }

      const bundle = await buildHtmlOrFail(app, workers, request, projectId, bundleRootDirectory(slug), signal)
      return sendFile(reply, bundle.zip!, 'application/zip', bundleFileName(slug))
    }))
  }
}

/**
 * 바이트 하나를 내려받기로 낸다.
 *
 * **이름은 슬러그에서 나오고** 슬러그는 소문자·숫자·하이픈뿐이라(`routes/projects.ts`의
 * 형식 검사) 인용부호 안에 그대로 쓸 수 있다 — `filename*`의 퍼센트 인코딩이 필요한 글자가
 * 애초에 못 들어간다.
 *
 * **형식마다 다시 적지 않는다** — 헤더 둘 중 하나를 빠뜨리면 브라우저가 파일을 열어
 * 보이거나 이름 없이 저장하고, 그 사고는 형식마다 따로 난다.
 */
function sendFile(
  reply: FastifyReply,
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
): Buffer {
  reply.header('content-type', contentType)
  reply.header('content-disposition', `attachment; filename="${fileName}"`)
  // 워커가 옮겨 준 버퍼를 그대로 감싼다 — 복제하지 않는다.
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}
