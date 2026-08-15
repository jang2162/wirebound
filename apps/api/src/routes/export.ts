/**
 * **내보내기 라우트**(설계 §11.3 · P8-4 T4). `app.ts`가 `/api/projects` prefix로 등록한다.
 *
 * | 라우트 | 무엇 | 최소 역할 |
 * |---|---|---|
 * | `GET /:projectId/export/preview` | 내려받기 **전에** 화면이 말할 것 | viewer |
 * | `GET /:projectId/export` | zip 그 자체 | viewer |
 *
 * HTTP·zod 검증만 다룬다 — SQL은 `repos/`가, 조립은 `services/export-bundle.ts`가,
 * 압축은 `services/export-zip.ts`가 한다(README "계층 규칙").
 *
 * ---
 *
 * # D4 — 권한은 viewer다
 *
 * §10에서 viewer는 *"조회 전용"*이다. 번들은 **viewer가 화면에서 볼 수 있는 것을 파일로
 * 받는 것**이므로 새 권한을 만들지 않는다. 재라 #5(*"번들이 화면보다 더 담는 것이
 * 없는가"*)를 세어 확인했다:
 *
 * | 번들이 담는 것 | viewer가 화면에서 보는가 |
 * |---|---|
 * | 페이지 문서 | 그렇다 — `GET .../pages/:id`가 viewer다 |
 * | 페이지 설명 | 그렇다 — 같은 응답에 있다 |
 * | 코멘트(본문·작성자 이름·작성 시각) | 그렇다 — `GET .../comments`가 viewer이고 같은 세 값을 낸다 |
 * | 테마 | 그렇다 — `GET .../theme`가 viewer다 |
 * | 메뉴·페이지 트리 | 그렇다 — `GET .../tree`가 viewer다 |
 * | 상호작용 문장 | 그렇다 — 문서 안의 `interactions`에서 만들어진다 |
 *
 * **더 담는 것이 없다.** 담지 **않는** 것은 있다 — revision 이력·스냅샷·멤버 목록·
 * 페이지 id 밖의 내부 식별자.
 *
 * # 잠금 census에 안 들어간다 (D4)
 *
 * `test/restore-lock-census.test.ts`가 세는 단위는 *"`projectGuard`가 걸린 **비-`GET`**
 * 라우트"*다. 내보내기는 **읽기**이고 `FOR UPDATE`는 읽기를 막지 않으므로 그 표의 물음
 * (*"복원 중에 막히는가"*)이 이 라우트에 대해 성립하지 않는다. 그래서 **그 표는 안 죽고,
 * 죽지 않는 것이 옳다.** 계획서 D4는 죽을 것으로 봤는데 그 예측이 거짓이다 —
 * 근거는 그 파일의 *"세는 단위"* 절이다.
 *
 * 대신 `test/permission-matrix.test.ts`는 **`GET`도 센다.** 그쪽 표에는 두 줄이 는다.
 *
 * # D7 — URL에 파일 이름을 쓰지 않는다
 *
 * 파일 이름은 안정한 열쇠가 아니다(P8-2 이월 §3 — `pageFileNames`가 충돌을 자리 순서로
 * 풀어서 페이지를 앞에 끼워 넣으면 뒤 이름들의 번호가 밀린다). 그것으로 URL을 만들면
 * 페이지를 하나 더할 때 남의 북마크가 깨진다. **사람이 읽는 이름은 `Content-Disposition`과
 * 미리보기 응답의 `fileName`에만 있다.**
 *
 * # 빈 프로젝트가 409인 이유
 *
 * 이 저장소에서 409는 *"요청은 옳은데 지금 상태가 그것을 허락하지 않는다"*이다(README의
 * 에러 표 — 자식이 있는 메뉴 삭제·쓰이고 있는 테마 삭제·기본 레이아웃이 없는 프로젝트의
 * 테마 고르기). 페이지를 하나 만들면 되는 **고쳐질 수 있는 상태**다. 404는 *"없다"*로
 * 끝나고 `projectGuard`가 outsider에게 이미 그것을 낸다.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { conflict, notFound } from '../errors'
import { parseParams } from '../http/parse'
import { findProjectById } from '../repos/projects'
import {
  EmptyProjectError,
  UnsupportedDocumentError,
  exportProjectBundle,
  type ProjectBundle,
} from '../services/export-bundle'
import { bundleFileName, bundleRootDirectory, zipBundle } from '../services/export-zip'

const ProjectIdParams = z.object({ projectId: z.uuid() })

/**
 * 두 라우트가 함께 지나는 자리. **`services`의 도메인 에러를 여기서 상태 코드로 옮긴다** —
 * 서비스는 HTTP를 모른다.
 */
async function buildOrFail(app: FastifyInstance, projectId: string): Promise<ProjectBundle> {
  try {
    return await exportProjectBundle(app.db, projectId)
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
 * 프로젝트의 슬러그. `projectGuard`가 이미 멤버십을 확인했으므로 여기서 `null`이 되는
 * 것은 **그 사이에 프로젝트가 지워진** 경우뿐이다.
 */
async function projectSlug(app: FastifyInstance, projectId: string): Promise<string> {
  const project = await findProjectById(app.db, projectId)
  if (!project) throw notFound('프로젝트를 찾을 수 없습니다')
  return project.slug
}

/** `app.ts`가 `app.register(exportRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function exportRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * **내려받기 버튼이 조용히 성공하면 안 된다**(D6 · P8-2 이월 §7).
     *
     * 폴백이 든 HTML도 눈으로는 그럴듯한 한 장이고 **번들은 그것을 남에게 전달한다.**
     * 그래서 화면이 내려받기 **전에** 무엇이 실릴지와 무엇이 어긋났는지 볼 수 있어야 한다.
     *
     * **`pages[].target`을 함께 내는 것이 이 응답의 둘째 몫이다.** 저작 화면의
     * `navigate`·`openModal` 타겟은 **손으로 적는 자유 입력**이고(재라 #2를 재서 확인했다 —
     * 고르개가 없다) 서버가 조립하는 문자열이 무엇인지 알 길이 오늘 여기밖에 없다.
     * 화면이 그 문자열을 보이면 저작하는 사람이 그것을 그대로 적을 수 있다.
     *
     * **런타임이 꺼진 페이지는 여기서 말하지 않는다.** 한 노드를 여러 규칙이 서로 다른
     * prop으로 겨누면 미리 그릴 판이 곱으로 늘고, 상한을 넘으면 그 페이지의 런타임이
     * 꺼진다(P8-3 이월 §9). 그런데 그 사실이 `exportBundle`의 `errors`에 안 담기고,
     * 여기서 다시 세려면 **그 상한을 두 벌로 갖게 된다** — 그러면 둘이 갈리는 날 화면이
     * 거짓을 말한다. P8-3이 *"번들 자신이 말한다"*로 닫은 그대로 둔다(그 페이지의 상태
     * 줄에 이유가 뜬다).
     */
    app.get('/:projectId/export/preview', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const bundle = await buildOrFail(app, projectId)

      return {
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
    })

    /**
     * **zip 그 자체.**
     *
     * `Content-Disposition`의 이름은 슬러그에서 나오고 슬러그는 소문자·숫자·하이픈뿐이라
     * (`routes/projects.ts`의 형식 검사) 인용부호 안에 그대로 쓸 수 있다 — `filename*`의
     * 퍼센트 인코딩이 필요한 글자가 애초에 못 들어간다.
     *
     * **응답 크기에 서버 쪽 상한이 없다**(재라 #6을 재서 확인했다 — Fastify의 `bodyLimit`은
     * **요청** 쪽이고 응답에는 걸리지 않는다). 번들 전체가 페이지 수의 제곱이므로
     * (P8-2 이월 §4) 언젠가 이 자리가 물음이 된다 — 이월에 적는다.
     */
    app.get('/:projectId/export', { preHandler: projectGuard('viewer') }, async (request, reply: FastifyReply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const slug = await projectSlug(app, projectId)
      const bundle = await buildOrFail(app, projectId)

      const zipped = zipBundle(bundle.files, bundleRootDirectory(slug))

      reply.header('content-type', 'application/zip')
      reply.header('content-disposition', `attachment; filename="${bundleFileName(slug)}"`)
      return Buffer.from(zipped)
    })
  }
}
