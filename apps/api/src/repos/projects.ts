/**
 * 프로젝트 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `routes/projects.ts`는 이미 camelCase로 바뀐 객체만 주고받는다.
 */
import { DatabaseError } from 'pg'
import { sql } from 'kysely'
import { assertLocking } from '../db/locking'
import { assertNoNulBytes } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'
import { DEFAULT_LAYOUT_NAME, defaultLayoutDocument, insertLayout } from './layouts'
import { DEFAULT_THEME_ID, latestVisibleVersion } from './theme-packages'

export interface ProjectRecord {
  id: string
  name: string
  slug: string
  description: string | null
}

export interface ProjectWithRole extends ProjectRecord {
  role: ProjectRole
}

/** Postgres 유니크 위반 SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * `0002-projects-members` 마이그레이션이 `slug` 컬럼에 `.unique()`로 건 제약의 이름.
 * Postgres가 단일 컬럼 유니크 제약에 붙이는 기본 명명 규칙(`<table>_<column>_key`)을
 * 그대로 따른다 — 실제 DB에서 `\d projects`로 확인했다(`repos/users.ts`의
 * `USERS_EMAIL_UNIQUE_CONSTRAINT`와 같은 근거).
 */
const PROJECTS_SLUG_UNIQUE_CONSTRAINT = 'projects_slug_key'

/** 이름·설명의 NUL 을 거절할 때 문장이 부르는 이름(`db/nul-guard.ts`의 `NulByteError`). */
const PROJECT_TEXT = '프로젝트 이름·설명'

/** slug가 이미 다른 프로젝트에서 쓰이고 있을 때 `insertProject`/`updateProject`가 던진다. */
export class DuplicateSlugError extends Error {
  constructor() {
    super('이미 사용 중인 슬러그입니다')
    this.name = 'DuplicateSlugError'
  }
}

function isSlugUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === UNIQUE_VIOLATION && error.constraint === PROJECTS_SLUG_UNIQUE_CONSTRAINT
}

/**
 * 프로젝트를 만들고, 생성자를 owner로 넣고, **기본 레이아웃을 함께 만든다** —
 * 전부 같은 트랜잭션 안에서다.
 *
 * 셋 중 하나만 성공하는 상태가 생기면 안 된다. 주인 없는 프로젝트는 아무도 접근할 수
 * 없는 채로 영원히 남고(설계서 「권한 모델」), 레이아웃 없는 프로젝트에는
 * **레이아웃을 만들어 주는 다른 경로가 없다**(레이아웃을 만드는 라우트가 없다).
 *
 * ---
 *
 * **순환 참조를 여는 순서.** `projects.default_layout_id`와
 * `layouts.project_id`가 서로를 가리키므로 어느 쪽도 먼저 완성될 수 없다. 그래서
 * **세 문장**으로 닫는다:
 *
 * 1. `projects` INSERT — `default_layout_id`를 비워 둔다(그래서 그 컬럼이 nullable이다).
 * 2. `layouts` INSERT — 이제 `project_id`가 가리킬 행이 있다.
 * 3. `projects` UPDATE — `default_layout_id`를 채운다.
 *
 * 한 트랜잭션 안이므로 밖에서는 세 문장이 보이지 않는다. 이 순서가 아니면(레이아웃을
 * 먼저 만들려 하면) `project_id`의 NOT NULL FK를 만족시킬 수 없다.
 *
 * **이 함수는 여러 표를 함께 넣는다.** `project_members`와 기본 레이아웃이 그것이다 —
 * *"프로젝트가 만들어질 때 반드시 함께 서야 하는 것"*을 한 트랜잭션에 모으는 것이
 * 이 함수의 일이다. (`apps/api/README.md` 「계층 규칙」 절은 여러 repo를 조율하는 로직을
 * `services/`에 두라고 하는데, 이 함수는 그 예외다. 조율을 밖으로 빼면 "프로젝트 생성"이
 * 두 자리로 갈라져 한쪽만 부르는 경로가 생길 수 있어 여기 둔다.)
 *
 * 조회 후 삽입하지 않는다(`repos/users.ts`의 `insertUser`와 같은 이유) — slug
 * 유니크 위반은 삽입을 시도해 보고 그 실패로 감지한다. 이 실패가 이 함수를 호출한
 * 바깥 트랜잭션(실제 요청이든 테스트 하네스의 트랜잭션이든)을 오염시키지 않도록
 * `withTransaction`으로 감싼다(`src/db/tx.ts` 참고) — 감싸지 않으면 트랜잭션 전체가
 * aborted(`25P02`)로 빠져 이후 문장이 전부 실패한다.
 */
export async function insertProject(
  db: DbHandle,
  ownerId: string,
  input: { name: string; slug: string; description: string | null },
): Promise<ProjectWithRole> {
  // 이름·설명의 NUL — 판정과 번역자는 `db/nul-guard.ts`의 `NulByteError`가 소유한다.
  assertNoNulBytes(PROJECT_TEXT, input.name, input.description)
  try {
    return await withTransaction(db, async (trx) => {
      // 새 프로젝트는 `system-admin` 의 최신판 · 빈 토큰으로 선다(spec 「데이터」). 판이 없으면(시딩 전) 비워 두고 다음 기동의
      // 채우기가 채운다(`services/system-themes.ts` 의 `backfillProjectThemes`).
      const themeVersion = await latestVisibleVersion(trx, DEFAULT_THEME_ID)

      // 1단계: 프로젝트. `default_layout_id`는 아직 비어 있다.
      const project = await trx
        .insertInto('projects')
        .values({
          name: input.name,
          slug: input.slug,
          description: input.description,
          theme_id: themeVersion === null ? null : DEFAULT_THEME_ID,
          theme_version: themeVersion,
        })
        .returning(['id', 'name', 'slug', 'description'])
        .executeTakeFirstOrThrow()

      await trx.insertInto('project_members').values({ project_id: project.id, user_id: ownerId, role: 'owner' }).execute()

      // 2단계: 기본 레이아웃. 문서는 `Page` 하나와 `Slot` 하나다 — 그릇의 최소본이다. **그 `schema`를 그리는 코드는
      // 없다** — `repos/layouts.ts`의 `defaultLayoutDocument` 주석 참고.
      const layout = await insertLayout(trx, {
        projectId: project.id,
        name: DEFAULT_LAYOUT_NAME,
        schema: defaultLayoutDocument(),
      })

      // 3단계: 순환을 닫는다.
      await trx.updateTable('projects').set({ default_layout_id: layout.id }).where('id', '=', project.id).execute()

      return { ...project, role: 'owner' as const }
    })
  } catch (error) {
    if (isSlugUniqueViolation(error)) {
      throw new DuplicateSlugError()
    }
    throw error
  }
}

/**
 * 사용자가 멤버인 프로젝트만 조회한다(`project_members`를 조인한다). 각 행에
 * 그 사용자 자신의 역할을 함께 싣는다 — `GET /api/projects` 응답이 메뉴를
 * 그리려면 role이 필요하다(설계서 「권한 모델」).
 */
export async function listProjectsForUser(db: DbHandle, userId: string): Promise<ProjectWithRole[]> {
  return db
    .selectFrom('projects')
    .innerJoin('project_members', 'project_members.project_id', 'projects.id')
    .where('project_members.user_id', '=', userId)
    .select(['projects.id', 'projects.name', 'projects.slug', 'projects.description', 'project_members.role'])
    .orderBy('projects.created_at', 'asc')
    .execute()
}

/**
 * id로 프로젝트 하나를 조회한다. 없으면 `null`이다.
 * 멤버십 확인은 이 함수의 일이 아니다 — 호출자(`projectGuard`)가 이미 확인했다고 가정한다.
 */
export async function findProjectById(db: DbHandle, projectId: string): Promise<ProjectRecord | null> {
  const row = await db.selectFrom('projects').select(['id', 'name', 'slug', 'description']).where('id', '=', projectId).executeTakeFirst()

  return row ?? null
}

/** 프로젝트가 고정한 테마(`0019-theme-packages`). 둘이 함께 `null` 이면 아직 고정 안 됨 — 기동 시딩이 채운다. */
export interface ProjectThemeBinding {
  themeId: string | null
  version: string | null
  /** 기본값과 다른 토큰 값만. */
  tokens: Record<string, string | number>
  rev: number
}

const BINDING_COLUMNS = ['theme_id as themeId', 'theme_version as version', 'theme_tokens as tokens', 'theme_rev as rev'] as const

export async function findProjectTheme(db: DbHandle, projectId: string): Promise<ProjectThemeBinding | null> {
  const row = await db.selectFrom('projects').select(BINDING_COLUMNS).where('id', '=', projectId).executeTakeFirst()
  return row ?? null
}

/**
 * 바인딩을 바꾸고 `theme_rev` 를 1 올린다 — **`theme_rev` 가 `expectedRev` 일 때만**. 아니면(남이 먼저 저장했다 · 프로젝트가 지워졌다)
 * 아무것도 안 쓰고 `null` 이다. 조건을 갱신 문장에 두는 것이 요점이다 — 먼저 읽어 견주고 쓰면 그 사이의 저장을 조용히 덮는다.
 *
 * `UPDATE projects` 라 복원(`FOR UPDATE`) · 트리 쓰기(`FOR NO KEY UPDATE`)가 쥔 프로젝트 행 뒤에 선다. 복원이 먼저 커밋하면 복원이 올린
 * `theme_rev` 와 어긋나 `null` 이다.
 */
export async function updateProjectTheme(
  trx: DbHandle,
  projectId: string,
  input: { themeId: string; version: string; tokens: Record<string, string | number> },
  expectedRev: number,
): Promise<ProjectThemeBinding | null> {
  const row = await trx
    .updateTable('projects')
    .set((eb) => ({
      theme_id: input.themeId,
      theme_version: input.version,
      theme_tokens: JSON.stringify(input.tokens),
      theme_rev: eb('theme_rev', '+', 1),
      updated_at: sql<Date>`now()`,
    }))
    .where('id', '=', projectId)
    .where('theme_rev', '=', expectedRev)
    .returning(BINDING_COLUMNS)
    .executeTakeFirst()
  return row ?? null
}

/**
 * 판 3 스냅샷의 바인딩을 되돌린다(`services/restore.ts`의 `set-theme`). 값이 같아도 `theme_rev` 를 올린다 — 복원은 늘 `theme-changed`
 * 를 보내고, 받는 쪽은 번호로 새것을 가린다. 숨긴 판이어도 된다(숨김은 «새로 고르기» 만 막는다). 복원이 프로젝트 행을 `FOR UPDATE` 로
 * 쥐고 부른다.
 */
export async function restoreProjectTheme(
  trx: DbHandle,
  projectId: string,
  theme: { themeId: string; version: string; tokens: Record<string, string | number> },
): Promise<ProjectThemeBinding> {
  return trx
    .updateTable('projects')
    .set((eb) => ({
      theme_id: theme.themeId,
      theme_version: theme.version,
      theme_tokens: JSON.stringify(theme.tokens),
      theme_rev: eb('theme_rev', '+', 1),
      updated_at: sql<Date>`now()`,
    }))
    .where('id', '=', projectId)
    .returning(BINDING_COLUMNS)
    .executeTakeFirstOrThrow()
}

/**
 * 프로젝트 행을 `FOR UPDATE`로 잠근다. **프로젝트를 통째로 다루는 트랜잭션이 맨 먼저 잡는 잠금이다** — 부르는
 * 자리가 둘이다: 복원(`repos/snapshots.ts`의 `lockProjectForRestore`)과 프로젝트 삭제(`routes/projects.ts`).
 * 둘 다 이것을 **페이지보다 먼저** 잡는다. 한쪽이라도 페이지를 먼저 잡으면 «프로젝트 행을 쥐고 페이지를 기다림 ↔
 * 페이지를 쥐고 프로젝트 행을 기다림»이 된다(잰 값은 `routes/projects.ts`의 삭제 주석).
 *
 * `FOR UPDATE`여야 한다 — `FOR NO KEY UPDATE`는 FK 삽입이 부모 행에 거는 `FOR KEY SHARE`와 충돌하지 않아, 그 삽입을
 * 막지 못하고 그 대기를 뒤로 미룬다(복원은 그 삽입을 막는 것이 몫이다 — `lockProjectForRestore` 머리말).
 */
export async function lockProjectRow(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectRow')
  await trx.selectFrom('projects').select('id').where('id', '=', projectId).forUpdate().execute()
}

/**
 * **트리 쓰기의 첫 잠금** — 프로젝트 행을 `FOR NO KEY UPDATE`로 잡는다. 형제의 `sort_order`를
 * 다시 매기는 쓰기는 **전부 이것을 맨 먼저** 잡는다: 메뉴 · 페이지의 생성 · 순서 이동 · 소속 이동 · 삭제
 * (`repos/menu.ts` · `repos/pages.ts`). 제목 · 설명만 바꾸는 쓰기는 안 잡는다 — 형제를 안 건드린다.
 *
 * **왜 형제 행이 아니라 프로젝트 행인가** — 이 잠금 없이 둘이 동시에 오면(같은 메뉴 · 실커밋 하네스):
 *
 * | 판 | 이 잠금이 없으면 |
 * |---|---|
 * | 페이지 맨 앞 → 맨 뒤 ∥ 맨 뒤 → 맨 앞 | 교착(`pg_stat_database.deadlocks`) · 500 |
 * | 메뉴(루트) 같은 판 | 〃 |
 * | 페이지 두 메뉴 사이 맞바꿈(가 → 나 ∥ 나 → 가) | 〃 |
 * | 페이지 순서 이동 ∥ 같은 메뉴의 페이지 삭제 | 〃 |
 * | 같은 메뉴에 페이지 생성 둘 | 교착은 없다 — 대신 **`sort_order`가 겹친다**(둘 다 형제 수를 세고 같은 자리에 넣는다) |
 *
 * 원인은 하나다 — 형제를 다시 매기는 `UPDATE … WHERE sort_order BETWEEN …`이 **범위의 행을 스캔 순서로** 잠그고, 옮기는
 * 행은 **맨 끝에** 따로 잠근다. 맨 앞 → 맨 뒤는 «1–5 를 잡고 0 을 기다리고», 맨 뒤 → 맨 앞은 «0–4 를 잡고 5 를
 * 기다린다». 두 메뉴 사이 이동은 «옛 형제 → 새 형제» 순이라 맞바꾸면 거꾸로 선다. 형제 행을 id 순으로 먼저 잡는 길은
 * **빈 형제**(아직 행이 없는 메뉴 — 생성 · 옮겨 넣기)를 못 잠그고, 옮기는 사이 소속이 바뀐 행을 놓친다. 그래서 형제
 * 무리 전부의 위에 있는 행 하나 — 프로젝트 행 — 를 먼저 잡는다. 트리 쓰기끼리는 **줄을 선다**(프로젝트 하나에
 * 하나씩). 대개 오래 걸리는 쓰기가 아니다(수 ms — `write-ledger.tsx`의 표). **가장 오래 쥐는 것은 가져오기다**(수백 ms) — 아래 «대가».
 *
 * **잠금 순서는 «프로젝트 행 → 메뉴 · 페이지 행 → 멤버 행(재확인)»이다** — 복원(`lockProjectForRestore`) · 프로젝트
 * 삭제(`routes/projects.ts`)와 같은 방향이다. 그 둘의 `FOR UPDATE`와는 충돌해 **기다린다**(고리가 아니다 — 그쪽도
 * 프로젝트 행이 먼저다).
 *
 * **`FOR NO KEY UPDATE`인 까닭** — FK 삽입(코멘트 · 스냅샷 · 초대 · 토큰)이 부모 행에 거는 `FOR KEY SHARE`와 충돌하지
 * 않는다. `FOR UPDATE`면 트리 쓰기 하나가 그 프로젝트의 모든 FK 삽입을 세운다. 프로젝트 수정(`UPDATE projects`)과는
 * 서로 기다린다.
 *
 * **대상이 없으면(그 사이 지워졌다 — 프로젝트 삭제의 `FOR UPDATE` 뒤에 섰다가 깨어났다) 던진다**(`ProjectGoneError` →
 * `http/error-handler.ts`가 404). «뒤의 조회가 `null`을 보고 404 가 된다»에 기대면 **루트 메뉴 생성은 뒤에 조회가
 * 없어** 형제 수를 세고 `INSERT` → FK 위반 500 이 된다. 그래서 여섯 자리가 이 한 규칙이다
 * (`test/tree-project-gone.test.ts` — 여섯 자리와 가져오기 전부 404).
 *
 * **대가 — 가져오기는 이것을 트랜잭션 끝까지 쥔다.** 가져오기(`services/page-import.ts`)는 한 트랜잭션에서 `insertPage`(여기서
 * 잡는다) → 본문 적용 → 댓글 삽입이라 그 전부가 이 잠금 안이고, 그동안 같은 프로젝트의 다른 트리 쓰기가 줄을 선다(제목 · 설명만
 * 바꾸는 쓰기는 안 기다린다). **그래서 댓글을 한 문장으로 넣는다**(`repos/comments.ts`의 `insertImportedComments`) — 행마다 넣으면
 * 잠금 안의 문장이 댓글 수의 두 배라, 댓글 12000 에 줄 선 쓰기가 14s 를 기다리고 그 줄이 풀(10)을 채우면 **무관한 조회도 5s 에
 * 503** 이 된다. 한 문장이면(진짜 api · 가져오기를 쏘고 40ms 뒤 같은 프로젝트의 다른 메뉴 순서 이동 · 루트 메뉴 생성):
 *
 * | 파일 | 가져오기 | 줄 선 쓰기 | 행마다 넣는 판의 가져오기 |
 * |---|---|---|---|
 * | 댓글 12000 · 노드 5(373KB) | 0.17–0.24s | 0.13–0.21s | 14s |
 * | 댓글 30000 · 노드 5(949KB — 본문 한도 1MiB 안에서 댓글이 가장 많은 꼴) | 0.4–0.5s | 0.4–0.47s | 43–70s |
 * | 댓글 16000 · 노드 12000(850KB) | 0.3s | 0.26s | — |
 *
 * 풀 10칸 판(위 가져오기 + 루트 메뉴 생성 10 + 다른 사람의 `GET /projects`)은 503 0 이다. 잠금 안에 남는 것은 문서 적용과 그 한
 * 문장이다(노드 12000 · 댓글 0 인 가져오기가 통째로 약 0.1s · 댓글 12000 의 그 문장만 psql 에서 약 0.16s — FK 검사가 행마다 돈다).
 * 문장 수가 댓글 수를 따라가지 않는 것은 `test/page-import.test.ts` «트리 잠금을 쥔 동안의 일이 댓글 수를 따라가지 않는다»가 잰다.
 *
 * **잠금을 끝으로 옮기지 않는다**: 페이지 행을 먼저 넣고 트리 잠금 · 자리 매기기를 댓글 뒤로 두면 줄 선 쓰기의 기다림은 수십 ms 로
 * 더 줄지만, **같은 메뉴의 삭제와 겹치면 5 판 중 5 가 교착**(가져오기 500 · `deadlocks` +5)이다 — 가져오기가 페이지 `INSERT`로
 * 메뉴 행에 `KEY SHARE`를 쥔 채 프로젝트 행을 기다리고, 메뉴 삭제는 프로젝트 행을 쥔 채 그 메뉴 행의 `DELETE`에서 가져오기를
 * 기다린다. 풀려면 메뉴 삭제가 메뉴 행을 프로젝트 행보다 먼저 잡아야 해 위 잠금 순서가 흔들린다(페이지를 메뉴 없이 넣는 길은
 * `pages.menu_node_id`가 `NOT NULL`이라 마이그레이션이다). 잠금을 앞에 두면 같은 겹침은 삭제 409 «하위 메뉴나 페이지가 있어» ·
 * 교착 0 이다.
 */
export async function lockProjectTree(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectTree')
  const rows = await trx.selectFrom('projects').select('id').where('id', '=', projectId).forNoKeyUpdate().execute()
  if (rows.length === 0) throw new ProjectGoneError()
}

/**
 * **자기 행만 쓰는 쓰기의 첫 잠금** — 프로젝트 행을 `FOR KEY SHARE`로 잡는다. 부르는 자리: 코멘트 수정(`routes/comments.ts`
 * — 코멘트 행) · FK 삽입 넷(스냅샷 · 초대 · 모듈 · 토큰 생성).
 *
 * **FK 삽입 넷은 권한이 아니라 봉투 때문이다.** 삽입의 FK 도 같은 `KEY SHARE`를 걸지만 그것은 프로젝트 삭제 뒤에 섰다가
 * 깨면 23503 — 봉투 없는 500 이다. 이것으로 먼저 잡으면 0 행 → 404(트리 쓰기와 같은 답).
 *
 * **왜 — 커밋 순간의 재확인이 잠금 순서를 요구한다.** 코멘트 수정은 프로젝트 행을 안 잡고 자기 행만 잡는다(그 행은 복원이
 * `lockProjectForRestore`로 잠근다 — 그래서 복원 뒤에 선다). 그 뒤에 재확인(`auth/roles.ts`의 `recheckProjectRole` — 멤버 행
 * `FOR SHARE`)을 붙이면 «자기 행 → 멤버 행» 순이 되는데, 프로젝트 삭제는 «프로젝트 행 → 페이지 → CASCADE(멤버 행 → … →
 * 레이아웃 · 코멘트 행)» 순이다 — 삭제가 멤버 행을 지운 채 이 쓰기의 행을 기다리고, 이 쓰기는 그 멤버 행을 기다린다.
 * 잰 값(쓰기를 자기 행 뒤 · 재확인 앞에 세워 둔 채 삭제를 쏜다 — 5 판씩): **교착 5/5 · 삭제 500**(코멘트). 이것을
 * 먼저 잡으면 삭제는 프로젝트 행에서 기다리고 **교착 0/5 · 삭제 204**. 순서가 «프로젝트 행 → 자기 행 → 멤버 행»이 된다 —
 * 트리 쓰기(`lockProjectTree`) · FK 삽입(부모 행 `KEY SHARE`)과 같은 방향이다.
 *
 * **`KEY SHARE`인 까닭** — 복원 · 프로젝트 삭제의 `FOR UPDATE`와 부딪힌다. 트리 쓰기의 `NO KEY UPDATE` · 다른 `KEY SHARE`와는
 * 안 부딪혀 같은 프로젝트의 코멘트 수정이 트리 쓰기 뒤에 줄을 서지 않는다. **프로젝트 수정은
 * 갈린다** — 이름 · 설명만 바꾸면 `NO KEY UPDATE`라 안 부딪히고, **`slug`(UNIQUE)를 바꾸면 키 갱신이라 `FOR UPDATE`여서
 * 부딪힌다**(그 수정을 쥔 채 스냅샷 · 토큰 발급을 보내면 섰다가 풀린 뒤 201). 그 대기는 이것에서 나므로
 * 뒤의 재확인이 그 뒤의 역할로 판정한다 — 권한 구멍이 아니라 기다림의 폭이다.
 * 코멘트 삭제의 `lockProjectForBurial`(`repos/comments.ts`)과 같은 모드다 — 그쪽은 0 행이면 조용히 지나가는 계약이라(뒤의
 * 페이지 잠금이 404 를 낸다) 합치지 않는다.
 *
 * **대상이 없으면(그 사이 지워졌다) 던진다**(`ProjectGoneError` → 404) — 위 «FK 삽입 넷은…»의 봉투 없는 500 을 여기서 끊는다.
 */
export async function lockProjectShared(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectShared')
  const rows = await trx.selectFrom('projects').select('id').where('id', '=', projectId).forKeyShare().execute()
  if (rows.length === 0) throw new ProjectGoneError()
}

/**
 * 트리 쓰기가 잠금을 기다리는 사이 프로젝트가 지워졌다(`lockProjectTree`). **HTTP 를 모르는 이 계층의 값이다** — 404 로
 * 옮기는 것은 `http/error-handler.ts`(`NulByteError`와 같은 자리)다. 라우트마다 잡지 않는 것은 여섯 자리가 한 규칙이어야
 * 해서다 — 한 자리가 빠지면 그 자리만 500 이다(뒤에 조회가 없는 루트 메뉴 생성이 그 꼴이다).
 */
export class ProjectGoneError extends Error {
  constructor() {
    super('프로젝트를 찾을 수 없습니다')
    this.name = 'ProjectGoneError'
  }
}

/**
 * 프로젝트를 갱신한다. `patch`에 있는 필드만 바뀐다 — 나머지는 기존 값을 유지한다.
 * 호출자(`routes/projects.ts`)가 이미 "적어도 하나는 있다"를 검증했다고 가정한다.
 *
 * slug를 바꿀 때 다른 프로젝트가 이미 그 slug를 쓰고 있으면 유니크 위반이 나므로,
 * `insertProject`와 같은 이유로 `withTransaction`에 감싸 그 실패를 격리한 뒤
 * `DuplicateSlugError`로 바꿔 던진다.
 *
 * `executeTakeFirst`를 쓴다(`OrThrow`가 아니다) — `projectGuard`의 권한 확인과 이
 * UPDATE 사이에 그 프로젝트가 삭제되는 경합이 나면 대상 행이 없어 정상적으로
 * 아무것도 갱신하지 못한다. 이때 `null`을 돌려준다: `GET /:projectId`
 * (`routes/projects.ts`)가 같은 경합을 `notFound()`로 다루는 것과 같은 취급이다 —
 * `OrThrow`로 던지게 두면 호출자가 잡지 않는 예외가 되어 500이 난다.
 */
export async function updateProject(
  db: DbHandle,
  projectId: string,
  patch: { name?: string; slug?: string; description?: string | null },
): Promise<ProjectRecord | null> {
  assertNoNulBytes(PROJECT_TEXT, patch.name, patch.description)
  try {
    const row = await withTransaction(db, (trx) =>
      trx
        .updateTable('projects')
        .set({ ...patch, updated_at: sql`now()` })
        .where('id', '=', projectId)
        .returning(['id', 'name', 'slug', 'description'])
        .executeTakeFirst(),
    )
    return row ?? null
  } catch (error) {
    if (isSlugUniqueViolation(error)) {
      throw new DuplicateSlugError()
    }
    throw error
  }
}

/**
 * 프로젝트를 지운다. `ON DELETE CASCADE`가 `project_members`·`menu_nodes`·`pages`를
 * 함께 지운다 — 이 함수는 그 사실을 알 필요 없이 `projects` 행 하나만 지우면 된다.
 *
 * `withTransaction`으로 감싼다. `menu_nodes.parent_id`·
 * `pages.menu_node_id`에 `ON DELETE RESTRICT` FK가 있다(`0003-menu-nodes`·
 * `0004-pages`). 이 DELETE 자체는 성공한다 — `menu_nodes`/`pages`는
 * `project_id`를 통해 CASCADE로 참조하므로, Postgres가 그 CASCADE로 큐에 넣은
 * 삭제들을 RESTRICT 제약 검사보다 먼저 처리해 실측으로도 매번 성공한다(중첩
 * 메뉴 트리·페이지가 있어도). 그래도 감싸는 이유는 `repos/`의 다른 쓰기 경로와
 * 같다 — 이 문장이 실패할 수 있는 경로(FK 제약)가 존재하는 이상, 세이브포인트
 * 없이 실패하면 호출자의 트랜잭션이 `25P02`로 오염된다는 사실 자체가 이 함수를
 * 예외로 둘 근거를 없앤다(`src/db/tx.ts` 참고).
 */
export async function deleteProject(db: DbHandle, projectId: string): Promise<void> {
  await withTransaction(db, async (trx) => {
    await trx.deleteFrom('projects').where('id', '=', projectId).execute()
    // **트리 판 번호는 CASCADE 가 안 데려간다** — FK 가 없다(`0020-project-menu-revs` 머리말 «잠금»). 이 줄을 쥔 트리 쓰기는 커밋만
    // 남았으므로 여기서 기다려도 고리가 없다.
    await trx.deleteFrom('project_menu_revs').where('project_id', '=', projectId).execute()
  })
}
