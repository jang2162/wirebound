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
 * 3. **의미** — `resolveTheme(theme, base)`가 **`error`를 내면 422**, `issues`에
 *    `ThemeIssue[]`를 **경고까지 함께** 싣는다. **경고만 있으면 저장되고** 성공 응답의
 *    `warnings`에 실린다(아래 `assertResolvable`).
 *    **2026-08-11(P4c-1 수정 웨이브 F6): 이 줄이 *"이슈를 내면 422"*였고 거짓이 됐다** —
 *    같은 파일 아래에서는 기준을 고쳐 놓고 이 머리말만 낡아 있었다.
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
 * **어느 라우트가 경고를 싣는가 — 전수로 세고 판정했다** (P4c-1 재라 #4).
 *
 * 이 파일의 라우트는 일곱이고 **테마 문서를 해석(`resolveTheme`)하는 것은 둘뿐이다** —
 * `POST /:projectId/themes`와 `PUT /:projectId/themes/:themeId`. 그 둘이 `warnings`를
 * 싣는다. `test/theme-warnings.test.ts`가 이 파일의 소스를 훑어 그 수를 센다
 * (P4a-3이 *"형제 가드를 지나지 않은 자리"*를 여섯 번 찾고 **다섯을 닫은 뒤 여섯째가
 * 나왔다** — 손으로 센 수는 그렇게 틀린다).
 *
 * **나머지 다섯에 왜 안 싣는가.**
 *
 * | 라우트 | 판정 |
 * |---|---|
 * | `GET /:projectId/themes` · `DELETE …/:themeId` | 테마 문서를 해석하지 않는다. 실을 것이 없다 |
 * | `GET …/themes/:themeId` (상세) | **소비자가 스스로 잴 수 있다.** 응답이 파생 문서와 `base`를 **둘 다** 싣는다(`toDetailResponse`) — 저작 UI가 `resolveTheme(theme, base)`를 그대로 부를 수 있다. 서버가 한 번 더 해석해 실으면 두 결과가 갈릴 자리가 생긴다 |
 * | `GET /:projectId/theme` · `PUT /:projectId/theme` | 같은 이유이고 근거가 더 세다 — **소비자(캔버스)가 이미 자기가 해석한다**(`apps/web`의 `use-theme-css.ts`). 그 파일 주석이 *"두 번 해석하면 비용만이 아니라 두 결과가 갈릴 수 있는 자리가 생긴다"*고 적어 두었다. 대신 그쪽이 **경고를 삼키지 않도록** 고쳤다(P4c-1) — 앞서는 `theme === null`일 때만 콘솔에 남겼다 |
 *
 * **그래서 재라 #7의 답은 *"응답에 실려 오는 것까지"*다.** 화면 표시는 P4c-2의 몫이다.
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
import { partitionIssues } from '@wirebound/schema'
import {
  ThemePatchSchema,
  mergeTheme,
  resolveTheme,
  systemTheme,
  themeIssue,
  type Theme,
  type ThemeIssue,
  type ThemePatch,
} from '@wirebound/themes'
import { projectGuard } from '../auth/roles'
import { badRequest, conflict, forbidden, notFound, validationFailed } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { withWarnings } from '../http/warnings'
import { findDefaultLayout, updateLayoutTheme } from '../repos/layouts'
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

/**
 * 고르개의 본문. **`themeId`가 없는 것과 `null`인 것을 가른다** — `null`은
 * *"테마를 벗긴다"*는 지시이고, 키 자체를 빼는 것은 무엇을 원하는지 말하지 않은 것이다.
 * `z.strictObject`라 선언되지 않은 키는 그 자체로 400이고, `optional()`을 붙이지 않았으므로
 * 키를 빼는 것도 400이다.
 */
const ChooseThemeBody = z.strictObject({ themeId: z.uuid().nullable() })

/** Postgres 유니크 위반 SQLSTATE. `repos/projects.ts`와 같은 값이다. */
const UNIQUE_VIOLATION = '23505'
/** Postgres 외래키 위반 SQLSTATE. `layouts.theme_id`의 RESTRICT가 이것을 낸다. */
const FOREIGN_KEY_VIOLATION = '23503'

function hasSqlState(error: unknown, state: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === state
}

function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, UNIQUE_VIOLATION)
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
      // **`themeIssue`를 쓴다 — 객체 리터럴로 짓지 않는다.** 리터럴은 `severity`를 손으로
      // 박게 되고, 그러면 바로 아래 `assertResolvable`의 주석(*"오늘 테마의 이슈는 전부
      // `error`다(`THEME_ISSUE_SEVERITY`)"*)이 **이 함수가 만드는 이슈에 대해서는 거짓**이
      // 된다. 실제로 그렇게 짰다가 리뷰가 잡았고, `'warning'`으로 바꿔도 api 599케이스가
      // 전부 통과했다(구분력 0). 팩토리를 지나면 `code`와 `severity`가 어긋날 자리 자체가 없다.
      missing: themeIssue(
        'bad-extends',
        'meta.extends',
        `상속 대상 시스템 테마를 찾을 수 없습니다: ${ref}`,
      ),
    }
  }
  return { base, missing: null }
}

/**
 * 게이트 2·3단계. **`error`가 있으면 422로 던지고, 경고는 통과시켜 돌려준다.**
 *
 * **저장하는 것은 해석 결과가 아니라 들어온 파생 테마 그대로다(계획서 D2).**
 * `resolveTheme`은 여기서 *"이 문서가 실제로 서는가"*를 묻는 데만 쓴다 — 병합 결과는
 * §4.5의 스냅샷이 저장할 것이고 이 슬라이스 밖이다.
 *
 * ---
 *
 * **2026-08-11(P4c-1 T2): 이 함수가 예고된 대로 고쳐졌다. 지우지 않고 남긴다.**
 *
 * P4b-3까지 여기 적혀 있던 것: *"`resolveTheme`은 **이슈가 하나라도** 있으면 `theme`을
 * `null`로 낸다(P4a-1의 D2). 그 규칙을 그대로 쓰는 근거는 재라 #3의 답이다 — 오늘
 * `themes`의 이슈는 전부 `error`다. **`themes`에 첫 `warning`이 생기는 날, 저 규칙과 이
 * 분기를 함께 고쳐야 한다:** 그때는 경고만 있는 테마가 저장돼야 하고 응답이 그 경고를
 * 실어야 한다(페이지 쪽 `withWarnings`가 그 형식이다)."*
 *
 * **오늘이 그 날이고, 둘을 함께 고쳤다.** 하나만 고치면 경고가 저장을 못 지난다:
 *
 * | 무엇만 고치면 | 무슨 일이 나는가 |
 * |---|---|
 * | `resolveTheme`만 | 여기서 `issues.length > 0`이 그대로라 **경고 하나가 422다.** `theme`이 `null`이 아닌데도 저장에 도달하지 못한다 |
 * | 여기만 | `resolveTheme`이 `theme: null`을 내지만 이 함수는 `issues`만 본다 — 저장은 지나가지만 **캔버스가 그 테마를 못 그린다**(`use-theme-css`가 `theme === null`에서 CSS를 비운다) |
 *
 * **선을 긋는 것은 `partitionIssues` 하나다** — `resolveTheme`이 쓰는 것과 같은 함수이고,
 * 그 머리말이 *"이 선을 긋는 코드는 이 함수 하나뿐이어야 한다"*고 못박아 두었다.
 */
function assertResolvable(theme: Theme): ThemeIssue[] {
  const { base, missing } = resolveBase(theme)
  if (missing !== null) themeValidationFailed([missing])

  const { issues } = resolveTheme(theme, base)
  const { errors, warnings } = partitionIssues(issues)
  if (errors.length > 0) themeValidationFailed(issues)
  return warnings
}

/**
 * **이 프로젝트의 화면이 지금 써야 할 테마.** `GET /:projectId/theme`와
 * `PUT /:projectId/theme`가 **둘 다 이것을 부른다** — 응답이 같은 꼴인 것이 우연이
 * 아니라 구조다. 갈리면 고르개 UI가 PUT의 응답을 그대로 쓰지 못하고 한 번 더 조회한다.
 *
 * `theme`이 `null`인 경우가 셋이고 전부 정상이다: 기본 레이아웃이 없다(0007 이전
 * 프로젝트 — P4a-3 재라 #8), 레이아웃이 테마를 안 고름, 테마 행이 사라짐. 화면은 구조
 * 기본 CSS만으로 그려진다 — 이미 있는 경로다(`apps/web`의 `theme-source.ts`).
 *
 * ---
 *
 * **`themeId`를 함께 낸다 — P4b-3 ①이 더했다.**
 *
 * **고르개가 *"지금 무엇이 골라져 있는가"*를 알 방법이 없었다.** `theme`은 **합쳐진**
 * 문서라 파생이면 `meta.extends`가 지워져 있고, `meta.id`(=slug)로 목록과 맞대는 것은
 * **성립하지 않는다** — 시스템 테마와 프로젝트 테마가 같은 slug를 가질 수 있다
 * (`(project_id, slug)`가 유일성 단위다. `repos-themes.test.ts`가 `admin` 슬러그를
 * 프로젝트 쪽에도 만들어 그 경우를 이미 케이스로 들고 있다).
 *
 * **`theme`을 대신하지 않고 더한다.** 캔버스는 여전히 `theme` 하나만 읽고
 * (`ThemeSource`가 `() => Theme | null`로 남는다), 고르개만 `themeId`를 본다 —
 * *"그리는 쪽은 유래가 필요 없다"*는 이 엔드포인트의 구분이 그대로다.
 *
 * **`theme: null`이어도 `themeId`가 있을 수 있다** — 상속이 끊긴 파생을 고른 상태다
 * (재라 #5). 그때 고르개는 *"이것이 골라져 있는데 그릴 수 없다"*를 보여줄 수 있어야 한다.
 * 반대로 **테마 행 자체가 사라졌으면 `themeId`도 `null`이다** — 가리킬 것이 없다.
 */
async function currentTheme(
  app: FastifyInstance,
  projectId: string,
): Promise<{ themeId: string | null; theme: Theme | null; issues: (ThemeIssue | null)[] }> {
  const layout = await findDefaultLayout(app.db, projectId)
  if (!layout || layout.themeId === null) return { themeId: null, theme: null, issues: [] }

  const themeId = layout.themeId
  const record = await findThemeById(app.db, themeId)
  if (!record) return { themeId: null, theme: null, issues: [] }

  const stored = record.theme
  if (stored.meta.extends === undefined) return { themeId, theme: stored, issues: [] }

  const base = systemTheme(stored.meta.extends)
  if (base === undefined) {
    return { themeId, theme: null, issues: [resolveBase(stored).missing] }
  }

  const merged = mergeTheme(base, stored as ThemePatch)
  return { themeId, theme: merged.theme, issues: merged.issues }
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
    /**
     * **이 프로젝트의 화면이 지금 써야 할 테마.** 설계 §4.2의 사슬
     * `projects.default_layout_id → layouts.theme_id → themes`를 한 번에 따라간다.
     *
     * **`GET .../themes/:themeId`와 다른 것을 낸다 — 소비자가 다르기 때문이다.**
     *
     * | 엔드포인트 | 소비자 | 내는 것 |
     * |---|---|---|
     * | `.../themes/:themeId` | 저작 UI(P4c) | **파생 문서 그대로 + `base`** — 편집 대상은 사람이 적은 것이다 |
     * | `.../theme` (여기) | 캔버스·내보내기 | **홀로 서는 테마 하나** — 그리는 쪽은 유래가 필요 없다 |
     *
     * 그래서 파생 테마면 여기서 `mergeTheme`으로 합쳐 낸다. `resolveTheme(document, base)`가
     * base를 요구하므로, 합치지 않고 내면 받는 쪽이 base를 따로 얻어 두 인자를 맞춰야 한다 —
     * `ThemeSource`가 `() => Theme | null`인 이유가 사라진다.
     *
     * **합친 결과를 저장하지는 않는다(계획서 D2).** 읽을 때 계산할 뿐이고, 저장되는 것은
     * 파생 그대로다. 병합 결과가 저장될 자리는 §4.5의 스냅샷 하나뿐이고 아직 없다.
     * P4a-1이 `base+patch` 경로와 `merge 후 해석` 경로가 **같은 CSS**를 내는 것을 쟀으므로
     * 여기서 합쳐 내도 캔버스가 보는 결과는 같다.
     *
     * **`theme`이 `null`인 경우가 셋이고 전부 정상이다:** 기본 레이아웃이 없다(0007 이전
     * 프로젝트 — 재라 #8), 레이아웃이 테마를 안 고름(재라 #7), 테마 행이 사라짐. 화면은
     * 구조 기본 CSS만으로 그려진다 — 이미 있는 경로다(`apps/web`의 `theme-source.ts`).
     *
     * **해석 이슈를 여기서 422로 만들지 않는다.** 저장 경계가 이미 막았으므로 여기 오는
     * 것은 통과한 테마뿐이고, 그래도 이슈가 난다면(코드의 시스템 테마가 바뀌어 파생이
     * 끊긴 경우 — 재라 #5) **그리기를 막는 것보다 테마 없이 그리는 편이 낫다.**
     * `issues`를 함께 실어 클라이언트가 콘솔에 남길 수 있게 한다(P4a-2의 재라 #12 결정).
     */
    app.get('/:projectId/theme', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      return currentTheme(app, projectId)
    })

    /**
     * **이 프로젝트가 쓸 테마를 고른다**(P4b-3 계획서 D2). 기본 레이아웃의 `theme_id`
     * 하나를 바꾼다.
     *
     * **왜 이것이 필요한가.** 사슬 `projects.default_layout_id → layouts.theme_id →
     * themes` 중 **가운데를 바꾸는 수단이 없었다** — 파생 테마를 만들 수는 있는데 그것을
     * 화면에 거는 경로가 없어 DB를 직접 고쳐야 했다(P4a-3 이월의 *"테마를 화면에 거는
     * 경로가 없다"*). 시스템 테마가 하나뿐일 때는 고를 것이 없어 드러나지 않았다.
     *
     * **레이아웃 CRUD를 만들지 않는다.** P4a-3이 의도적으로 안 만든 자리이고(D7),
     * 고르개에 필요한 것은 그 테이블의 **한 필드**뿐이다. 레이아웃 자체의 관리는 §4.4의
     * 레이아웃 에디터가 할 일인데 그쪽은 UI가 아니라 **선택 모델부터** 정해야 한다.
     *
     * **owner 전용이다**(§10 — 테마 편집과 같은 등급). 페이지·메뉴가 editor까지 허용하는
     * 것과 다르다: 테마를 바꾸는 것은 그 프로젝트의 **모든 화면**을 한 번에 바꾼다.
     *
     * ---
     *
     * **응답이 `GET /:projectId/theme`와 같은 꼴이다.** 둘 다 `currentTheme()` 하나를
     * 부르므로 우연이 아니라 구조다 — 고르개 UI가 응답을 그대로 쓰고 다시 조회하지 않는다.
     *
     * **`null`을 받는다.** *"테마를 고르지 않았다"*는 이미 정상 상태다
     * (`layouts.theme_id`가 `NULL`을 받는다 — `0007-layouts.ts`). 화면은 그때 구조 기본
     * CSS만으로 그려지고, 고르개에 *"없음"*이 있어야 그 상태를 눈으로 확인할 수 있다.
     *
     * **목록 밖의 `themeId`는 404다.** `GET /:projectId/themes`가 이미 *"이 프로젝트에서
     * 고를 수 있는 것"*을 뜻하므로(`repos/themes.ts`의 `listThemes` 주석) 그 밖은 고를 수
     * 없다. 403이 아니라 404인 것은 남의 프로젝트 테마의 **존재를 숨기기** 위해서다
     * (설계 §10 — `requireWritableTheme`이 같은 판정을 한다).
     *
     * **기본 레이아웃이 없는 프로젝트는 409다(재라 #1).** 0007 이전에 만들어진 것이고
     * P4a-3 재라 #8이 *"만들어 주지 않는다"*로 닫았다. 그러면 이 라우트가 그 상태를
     * 소리 내야 한다.
     *
     * | 후보 | 왜 아닌가 |
     * |---|---|
     * | 404 | `projectGuard`가 outsider에게 이미 404를 낸다(§10). 같은 코드를 쓰면 owner가 받은 404가 *"내 프로젝트가 사라졌다"*로 읽힌다 |
     * | 422 | 본문은 흠이 없다. 422는 *"내용이 처리 불가"*이고 여기서 처리 불가한 것은 **서버 쪽 상태**다 |
     * | 레이아웃을 만들어 준다 | P4a-3 재라 #8을 뒤집는 판단이고, 그 근거(마이그레이션 시점에 만들 수 있는 것은 테마 없는 레이아웃뿐이라 관찰 결과가 같다)를 이 슬라이스가 반증하지 않았다 |
     *
     * **409인 이유:** 이 저장소에서 409는 *"요청은 옳은데 지금 상태가 그것을 허락하지
     * 않는다"*이다(자식이 있는 메뉴 삭제·쓰이고 있는 테마 삭제 — README의 에러 표).
     * 그리고 이 상태는 **고쳐질 수 있는 상태**다 — 404는 *"없다"*로 끝나지만 409는
     * *"지금은 안 된다"*를 말한다.
     *
     * **`GET`은 같은 상태에서 조용하다.** 없는 것을 읽는 것은 정상이고(`{theme:null}`
     * 세 갈래 중 하나다) 없는 것에 **쓰는** 것만 실패한다.
     */
    app.put('/:projectId/theme', { preHandler: projectGuard('owner') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const { themeId } = parseBody(ChooseThemeBody, request.body)

      const layout = await findDefaultLayout(app.db, projectId)
      if (!layout) throw conflict('이 프로젝트에는 기본 레이아웃이 없어 테마를 고를 수 없습니다')

      if (themeId !== null) {
        const record = await findThemeById(app.db, themeId)
        // `listThemes`의 술어와 같다 — 시스템 테마이거나 이 프로젝트의 것.
        if (!record || (record.projectId !== null && record.projectId !== projectId)) {
          throw notFound('테마를 찾을 수 없습니다')
        }
      }

      try {
        // 위 확인과 이 UPDATE 사이에 테마가 지워지는 경합. FK(0007)가 마지막 방벽이고
        // `updateTheme`의 같은 자리와 같은 취급이다 — 500이 아니라 404다.
        if (!(await updateLayoutTheme(app.db, layout.id, themeId))) {
          throw conflict('이 프로젝트에는 기본 레이아웃이 없어 테마를 고를 수 없습니다')
        }
      } catch (error) {
        if (hasSqlState(error, FOREIGN_KEY_VIOLATION)) throw notFound('테마를 찾을 수 없습니다')
        throw error
      }

      return currentTheme(app, projectId)
    })

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

      const warnings = assertResolvable(theme)

      let record
      try {
        record = await insertTheme(app.db, projectId, theme)
      } catch (error) {
        if (error instanceof ThemeNulByteError) throw badRequest(error.message)
        if (isUniqueViolation(error)) throw conflict('이미 사용 중인 테마 id입니다')
        throw error
      }

      reply.code(201)
      return withWarnings(toResponse(record), warnings)
    })

    app.put('/:projectId/themes/:themeId', { preHandler: projectGuard('owner') }, async (request) => {
      const { projectId, themeId } = parseParams(ThemeParams, request.params)
      const body = parseBody(ThemeBody, request.body)
      const theme = body.theme as Theme

      await requireWritableTheme(app, projectId, themeId)
      const warnings = assertResolvable(theme)

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
      return withWarnings(toResponse(record), warnings)
    })

    app.delete('/:projectId/themes/:themeId', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId, themeId } = parseParams(ThemeParams, request.params)
      await requireWritableTheme(app, projectId, themeId)

      try {
        if (!(await deleteTheme(app.db, themeId))) throw notFound('테마를 찾을 수 없습니다')
      } catch (error) {
        // `layouts.theme_id`가 `ON DELETE RESTRICT`다(0007) — 쓰이고 있는 테마는 지워지지
        // 않는다. `SET NULL`로 두면 **화면이 말없이 달라지므로**(테마가 사라져 구조 기본
        // CSS로 떨어진다) 실패하는 쪽을 골랐고, 여기서 그것을 409로 옮긴다.
        // 자식이 있는 메뉴 삭제가 409인 것과 같은 부류다(README의 에러 표).
        if (hasSqlState(error, FOREIGN_KEY_VIOLATION)) {
          throw conflict('이 테마를 쓰고 있는 레이아웃이 있어 지울 수 없습니다')
        }
        throw error
      }
      reply.code(204).send()
    })
  }
}
