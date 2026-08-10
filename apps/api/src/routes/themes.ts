/**
 * 테마 라우트: 목록·조회·생성·수정·삭제. `pageRoutes`와 같은 `/api/projects` prefix로
 * 등록한다(`app.ts`) — 파일은 갈리되 URL 네임스페이스는 공유한다.
 *
 * HTTP·zod 검증만 다룬다 — SQL은 `repos/themes.ts`, 테마 해석은 `@wirebound/themes`의
 * `resolveTheme`이다. **권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가 전담한다** —
 * 이 파일은 역할을 비교하지 않는다(README "계층 규칙").
 *
 * ---
 *
 * **검증 게이트가 `routes/pages.ts`의 §7.1 게이트와 같은 모양이다.** 순서가 규격이다:
 *
 * 1. **봉투** — `z.strictObject({ theme: ThemePatchSchema })`. 실패면 **400**.
 *    `ThemeSchema`가 아니라 `ThemePatchSchema`인 것이 요점이다: 파생 테마는 §6.9의
 *    삭제 지시(`null`)를 담을 수 있어 `ThemeSchema`가 거부한다. `ThemePatchSchema`는
 *    **절 이름과 `meta`만** 보고 절 안쪽을 `unknown`으로 통과시키므로 파생과 평범한
 *    테마를 **둘 다** 받는다 — `resolveTheme`의 `prepare`가 쓰는 것과 같은 규격이다.
 * 2. **상속 대상** — `meta.extends`가 있으면 그것이 가리키는 시스템 테마를 코드에서
 *    찾는다. 없으면 **422**(아래 "없는 상속 대상" 참고).
 * 3. **의미** — `resolveTheme(theme, base)`가 이슈를 내면 **422**, `issues`에 `ThemeIssue[]`를
 *    그대로 싣는다.
 *
 * 1과 3이 갈리는 이유는 페이지와 같다 — *"요청이 잘못됨"*(400)과 *"내용이 처리 불가함"*(422)은
 * 다른 성질이다(설계 §13). 1~3 중 어디서든 실패하면 저장에 도달하지 못한다.
 *
 * **없는 상속 대상은 400이 아니라 422다(Task 7에서 재서 정했다).** 형식은 이미 400이
 * 잡는다 — `MetaSchema`의 `EXTENDS_PATTERN`이 `system:<id>` 꼴이 아닌 값을 봉투에서
 * 거부한다. 여기 남는 것은 *"꼴은 맞는데 그런 테마가 없다"*이고, 그것은 `unknown-type`이
 * 페이지에서 422인 것과 같은 부류다(문법은 유효, 의미가 성립하지 않음).
 *
 * **깊이 2는 이 규칙에서 저절로 닫힌다(§6.9).** `EXTENDS_PATTERN`이 `system:` 접두어를
 * 요구하고 상속 대상을 **코드의 시스템 테마에서만** 찾으므로, 파생 테마를 가리키는
 * `extends`는 그런 시스템 테마가 없어 422가 된다. 규격 층(패턴)과 조회 층(코드)이
 * 각각 절반씩 막는 구조이고, `mergeTheme`의 `checkExtends`가 세 번째 방벽이다.
 *
 * ---
 *
 * **시스템 테마는 owner도 못 고친다(§6.10 — 읽기 전용).**
 *
 * 수정·삭제 대상이 `project_id IS NULL`이면 **403**이다. 404가 아닌 이유: 목록과 조회가
 * 그 테마를 이미 보여 주므로(어느 프로젝트에서나 고를 수 있다) 존재를 숨기는 것이
 * 성립하지 않는다. 반대로 **다른 프로젝트의 테마**는 404다 — 그쪽은 존재 자체를 숨기는
 * 설계 §10의 자리다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  ThemePatchSchema,
  resolveTheme,
  systemTheme,
  type Theme,
  type ThemeIssue,
} from '@wirebound/themes'
import { projectGuard } from '../auth/roles'
import { badRequest, conflict, forbidden, notFound, validationFailed } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  ThemeNulByteError,
  deleteTheme,
  findThemeById,
  insertTheme,
  listThemes,
  updateTheme,
  type ThemeRecord,
} from '../repos/themes'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const ThemeParams = z.object({ projectId: z.uuid(), themeId: z.uuid() })

/**
 * 생성·수정 본문. `PUT .../pages/:id/schema`의 `{ schema }`와 같은 관례로 `{ theme }` 하나다.
 * `z.strictObject`라 선언되지 않은 키는 그 자체로 400이다.
 */
const ThemeBody = z.strictObject({ theme: ThemePatchSchema })

/** Postgres 유니크 위반 SQLSTATE. `repos/projects.ts`와 같은 값이다. */
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}

/**
 * 응답 형태. **`system`을 내는 것이 요점이다** — 클라이언트가 "고칠 수 있는가"를
 * 판정하려면 소유자를 알아야 하는데, `projectId`를 그대로 흘리면 경로에 이미 있는 값을
 * 한 번 더 내는 셈이고 시스템 테마일 때 `null`이 무슨 뜻인지 읽는 쪽이 다시 해석해야 한다.
 */
function toResponse(record: ThemeRecord) {
  return {
    id: record.id,
    system: record.projectId === null,
    theme: record.theme,
    updatedAt: record.updatedAt,
  }
}

/**
 * 상세 조회의 응답. **파생 테마면 `base`를 함께 싣는다 — 재라 #6의 답이다.**
 *
 * `resolveTheme(document, base)`는 base 없이 파생 문서를 **해석 자체를 거부한다**
 * (`bad-extends`: *"상속을 선언한 문서를 해석하려면 상속 대상 테마가 필요합니다"*).
 * 즉 base를 빼고 내면 클라이언트가 **쓸 수 없는 것**을 받고 두 번째 요청을 강요당한다.
 * 서버는 이미 둘 다 갖고 있으므로 라운드트립 하나로 끝낸다.
 *
 * **base는 코드에서 온다**(D4). DB의 사본을 실으면 해석 결과가 동기화 시점에 따라 갈린다.
 *
 * **목록에는 싣지 않는다.** 파생 항목마다 시스템 테마 전문이 붙어 응답이 항목 수만큼
 * 부푼다 — 목록의 쓸모는 고르기이지 그리기가 아니다.
 *
 * 상속 대상이 코드에 없으면(동기화가 남긴 낡은 파생, 재라 #5) `base` 키가 없다.
 * 그 상태는 조회로 드러나야 하지 **조회를 실패시킬 일은 아니다** — 사용자가 고치려면
 * 먼저 볼 수 있어야 한다.
 */
function toDetailResponse(record: ThemeRecord) {
  const base = record.theme.meta.extends === undefined ? undefined : systemTheme(record.theme.meta.extends)
  return { ...toResponse(record), ...(base === undefined ? {} : { base }) }
}

/** `ThemeIssue[]`를 422로. `ApiErrorIssue`와 구조가 맞으므로 캐스트 없이 그대로 실린다. */
function themeValidationFailed(issues: ThemeIssue[]): never {
  throw validationFailed('테마 검증에 실패했습니다', issues)
}

/**
 * 상속 대상을 **코드에서** 찾는다(계획서 D4 — 코드가 진실이고 DB는 사본이다).
 *
 * DB의 `themes` 행을 보지 않는 이유: 그 행은 동기화가 만든 사본이고, 둘이 갈리면
 * 코드가 이긴다. 사본을 base로 쓰면 해석 결과가 **동기화가 언제 돌았는지에 따라**
 * 달라진다.
 */
function resolveBase(theme: Theme): { base: Theme | undefined; missing: ThemeIssue | null } {
  const ref = theme.meta.extends
  if (ref === undefined) return { base: undefined, missing: null }

  const base = systemTheme(ref)
  if (base === undefined) {
    return {
      base: undefined,
      missing: {
        code: 'bad-extends',
        severity: 'error',
        path: 'meta.extends',
        message: `상속 대상 시스템 테마를 찾을 수 없습니다: ${ref}`,
      },
    }
  }
  return { base, missing: null }
}

/**
 * 게이트 2·3단계. 통과하면 아무것도 하지 않고, 실패하면 422로 던진다.
 *
 * **저장하는 것은 해석 결과가 아니라 들어온 파생 테마 그대로다(계획서 D2).**
 * `resolveTheme`은 여기서 *"이 문서가 실제로 서는가"*를 묻는 데만 쓴다 — 병합 결과는
 * §4.5의 스냅샷이 저장할 것이고 이 슬라이스 밖이다.
 *
 * **`resolveTheme`은 이슈가 하나라도 있으면 `theme`을 `null`로 낸다**(P4a-1의 D2).
 * 그 규칙을 그대로 쓰는 근거는 재라 #3의 답이다 — **오늘 `themes`의 이슈는 전부
 * `error`다**(`THEME_ISSUE_SEVERITY`). `themes`에 첫 `warning`이 생기는 날, 저 규칙과
 * 이 분기를 **함께** 고쳐야 한다: 그때는 경고만 있는 테마가 저장돼야 하고 응답이 그
 * 경고를 실어야 한다(페이지 쪽 `withWarnings`가 그 형식이다).
 */
function assertResolvable(theme: Theme): void {
  const { base, missing } = resolveBase(theme)
  if (missing !== null) themeValidationFailed([missing])

  const { issues } = resolveTheme(theme, base)
  if (issues.length > 0) themeValidationFailed(issues)
}

/** 쓰기(수정·삭제) 대상 하나를 찾아 소유권을 판정한다. */
async function requireWritableTheme(
  app: FastifyInstance,
  projectId: string,
  themeId: string,
): Promise<ThemeRecord> {
  const record = await findThemeById(app.db, themeId)
  if (!record) throw notFound('테마를 찾을 수 없습니다')

  // 시스템 테마는 목록·조회로 이미 보이므로 존재를 숨길 것이 없다 — 읽기 전용이라는
  // 사실 자체를 말한다(§6.10).
  if (record.projectId === null) {
    throw forbidden('시스템 테마는 수정할 수 없습니다')
  }
  // 다른 프로젝트의 테마는 존재를 숨긴다(설계 §10).
  if (record.projectId !== projectId) throw notFound('테마를 찾을 수 없습니다')

  return record
}

/** `app.ts`가 `app.register(themeRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function themeRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/themes', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      // 시스템 테마가 함께 나온다 — 이 프로젝트에서 **고를 수 있는** 것이 목록의 뜻이다
      // (`repos/themes.ts`의 `listThemes` 주석).
      return (await listThemes(app.db, projectId)).map(toResponse)
    })

    app.get('/:projectId/themes/:themeId', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId, themeId } = parseParams(ThemeParams, request.params)
      const record = await findThemeById(app.db, themeId)
      // 시스템 테마(`projectId === null`)는 어느 프로젝트에서나 읽을 수 있다.
      if (!record || (record.projectId !== null && record.projectId !== projectId)) {
        throw notFound('테마를 찾을 수 없습니다')
      }
      return toDetailResponse(record)
    })

    app.post('/:projectId/themes', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(ThemeBody, request.body)
      const theme = body.theme as Theme

      assertResolvable(theme)

      let record
      try {
        record = await insertTheme(app.db, projectId, theme)
      } catch (error) {
        if (error instanceof ThemeNulByteError) throw badRequest(error.message)
        if (isUniqueViolation(error)) throw conflict('이미 사용 중인 테마 id입니다')
        throw error
      }

      reply.code(201)
      return toResponse(record)
    })

    app.put('/:projectId/themes/:themeId', { preHandler: projectGuard('owner') }, async (request) => {
      const { projectId, themeId } = parseParams(ThemeParams, request.params)
      const body = parseBody(ThemeBody, request.body)
      const theme = body.theme as Theme

      await requireWritableTheme(app, projectId, themeId)
      assertResolvable(theme)

      let record
      try {
        // **통째 교체다.** `updateTheme`이 절 다섯을 전부 쓰므로 없는 절은 실제로 비워진다
        // (`repos/themes.ts` 주석). `meta.id`를 바꾸면 slug도 바뀐다 — 그 자체를 막을 근거가
        // 없고, 충돌하면 아래 409가 말한다.
        record = await updateTheme(app.db, themeId, theme)
      } catch (error) {
        if (error instanceof ThemeNulByteError) throw badRequest(error.message)
        if (isUniqueViolation(error)) throw conflict('이미 사용 중인 테마 id입니다')
        throw error
      }

      // 위 확인과 이 UPDATE 사이에 지워지는 경합. `repos/projects.ts`의 `updateProject`와
      // 같은 취급이다 — 500이 아니라 404다.
      if (!record) throw notFound('테마를 찾을 수 없습니다')
      return toResponse(record)
    })

    app.delete('/:projectId/themes/:themeId', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId, themeId } = parseParams(ThemeParams, request.params)
      await requireWritableTheme(app, projectId, themeId)

      if (!(await deleteTheme(app.db, themeId))) throw notFound('테마를 찾을 수 없습니다')
      reply.code(204).send()
    })
  }
}
