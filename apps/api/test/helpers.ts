import type { Writable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import { buildApp, type BuildAppOptions } from '../src/app'
import type { ApiConfig } from '../src/config'
import { loadConfig } from '../src/config'
import { DEFAULT_DB_TIME_LIMITS, createDb, createPool, type DbTimeLimits } from '../src/db/client'
import { seedUser } from '../src/db/seed-user'
import type { DbHandle } from '../src/db/tx'
import type { ProjectRole } from '../src/db/types'
import { resolveTestDatabaseUrlFrom } from './test-database-url'

/**
 * 테스트가 붙을 DB. **워크트리마다 다를 수 있다** — 규칙과 그 이유는
 * `test-database-url.ts`가 소유하고 `test-database-url.test.ts`가 잰다.
 */
export const TEST_DATABASE_URL = resolveTestDatabaseUrlFrom(process.env)

export interface TestContext {
  app: FastifyInstance
  db: DbHandle
}

let testDb: DbHandle | undefined

/**
 * 하네스 풀의 시간 제한 — **idle 제한은 싣지 않는다.** `withApi`는 케이스 전체를 트랜잭션 하나로 감싸므로 붐비는 기계(옆 워커 ·
 * load 160+)에서 케이스 사이의 쉼이 기본값 10s 를 넘으면 하네스가 거짓으로 죽는다(`createPool` 머리말 «이 값들이 정당한 일을
 * 끊는 판»과 같은 기전). 그 제한을 재는 케이스는 제 풀을 따로 만든다(`db-partition.test.ts`).
 */
const HARNESS_DB_TIME_LIMITS: DbTimeLimits = { ...DEFAULT_DB_TIME_LIMITS, idleInTransactionMs: 0 }

/** 테스트 전체가 공유하는 DB 핸들을 모듈 스코프에 지연 생성해 재사용한다. */
export function getTestDb(): DbHandle {
  if (!testDb) {
    testDb = createDb(createPool(TEST_DATABASE_URL, undefined, HARNESS_DB_TIME_LIMITS))
  }
  return testDb
}

/** `getTestDb()`가 만든 풀을 닫는다. 테스트 파일 하나가 끝날 때(`afterAll`) 한 번 부른다. */
export async function closeTestDb(): Promise<void> {
  if (testDb) {
    await testDb.destroy()
    testDb = undefined
  }
}

/** `PASSWORD_SCRYPT_N`을 1024로 낮춘 테스트용 `ApiConfig`.
 * 기본값(32768)은 scrypt 해시 한 번에 50ms 이상 걸려, 로그인이 등장하는
 * 테스트마다 그 비용이 누적되면 스위트 전체가 느려진다. */
export function testConfig(): ApiConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    PASSWORD_SCRYPT_N: '1024',
  })
}

/** 롤백 신호 전용 에러. `withApi` 밖으로 새어 나가지 않고 아래에서 삼켜진다. */
class Rollback extends Error {}

/**
 * `withApi`가 `buildApp`에 그대로 전달할 선택적 오버라이드.
 *
 * - `config`: 기본은 `testConfig()`다. `test/logging.test.ts`가 `logLevel: 'info'`로
 *   덮어써야 로그가 실제로 찍힌다(테스트 기본 `logLevel`은 `silent`라 그냥 두면
 *   아무것도 안 찍혀 로그 캡처 자체가 공허해진다).
 * - `loggerStream`: `buildApp`의 같은 이름 필드를 그대로 통과시킨다. 이 필드가
 *   존재하는 유일한 이유도 `test/logging.test.ts`다 — 실제 `buildApp` 파이프라인
 *   (쿠키 파싱·인증 훅 포함)을 그대로 돌리면서 로그만 메모리로 가로채기 위해서다.
 */
export interface WithApiOptions {
  config?: ApiConfig
  loggerStream?: Writable
  /**
   * `buildApp`의 같은 이름 필드를 그대로 통과시킨다. `test/token-route-census.test.ts`가
   * **하나의 앱에서** 라우트 목록과 요청을 함께 얻으려고 쓴다 — 앱을 둘 세우면
   * `app.requireAuth` 데코레이터가 서로 다른 함수 객체라 참조로 비교할 수 없다.
   */
  onRoute?: BuildAppOptions['onRoute']
  /**
   * `buildApp`의 같은 이름 필드를 그대로 통과시킨다(P10-2 D3). **위의 셋과 방향이
   * 반대다** — 생략이 운영이 아니라 **채우는 것이 운영**이고, 여기서 채우는 것은 진짜
   * 브라우저가 아니라 가짜다. 그 판정의 근거는 `src/services/screen-render.ts`에 있다.
   */
  screenRenderer?: BuildAppOptions['screenRenderer']
}

/**
 * 테스트 하나를 트랜잭션으로 감싸고 끝나면 롤백한다.
 * 앱은 그 트랜잭션 핸들을 db로 받으므로 커밋되는 것이 없다.
 *
 * Kysely의 `transaction().execute()`는 콜백이 정상 반환하면 커밋하므로, 롤백하려면
 * 던지는 수밖에 없다 — `fn`이 끝나면 항상 `Rollback`을 던지고, 그 트랜잭션을 감싼
 * `catch`가 `Rollback`만 골라 삼킨다. `fn`이 진짜 에러를 던졌다면 그 에러가 트랜잭션의
 * 롤백을 유발한 뒤 `Rollback`이 아니므로 그대로 다시 던져져 호출자에게 보인다.
 *
 * **이 `catch (error) { if (!(error instanceof Rollback)) throw error }` 줄이
 * api 테스트 스위트 전체가 의지하는 지점이다.** 여기가 언젠가
 * `catch {}`처럼 전부 삼키는 코드로 퇴행하면, `withApi` 안의 모든 `expect`가
 * 던지는 진짜 실패까지 조용히 삼켜져 스위트가 초록으로 보이면서 아무것도
 * 증명하지 못하게 된다. `db.test.ts`의 "테스트가 던진 진짜 에러는 그대로 밖으로
 * 나온다"가 이 성질 자체를 고정한다.
 *
 * **트랜잭션 오염에 주의.** `withApi`가 감싸는 것은 테스트 전체를 위한 하나의
 * Postgres 트랜잭션이다. 그 안에서 어떤 문장이든(제약 위반 등으로) 실패하면
 * Postgres가 트랜잭션 전체를 aborted 상태로 만들고, 이후 그 트랜잭션 위의 모든
 * 쿼리가 실제 내용과 무관하게 `25P02`로 실패한다. 그래서 이 태스크가 만드는 409
 * 경로(가입 시 중복 이메일 등, 전부 DB 제약 위반으로 구현된다) 같은 걸 테스트
 * 안에서 직접(=raw `db`로) 유발하면, 그 실패 자체를 잡아도 트랜잭션은 이미
 * 오염돼 있어 같은 테스트에서 그 뒤에 무언가를 더 확인하려는 시도가 전부
 * 무너진다. `withTransaction`(`src/db/tx.ts`)이 SAVEPOINT로 구간을 격리해
 * 이 문제를 푼다 — 제약 위반이 날 수 있는 조작은 raw `db`가 아니라 반드시
 * `withTransaction(db, fn)`을 통해 실행한다.
 *
 * `app.ready()`를 부르지 않는다. Fastify 5는 ready 이후 라우트 등록을 거부하는데,
 * 여러 테스트가 인증 훅 같은 것을 확인하려고 임시 라우트를 등록한다.
 * `inject()`가 첫 호출에서 알아서 ready를 태우므로 미리 부를 이유도 없다.
 *
 * `options`는 대부분의 호출자에게 필요 없다 — 생략하면 지금까지와 완전히 같게
 * `testConfig()`로 `buildApp`을 만든다. `test/logging.test.ts`만 `config`(로그 레벨을
 * `info`로)와 `loggerStream`(로그를 메모리로 캡처)을 넘긴다.
 */
export async function withApi(fn: (ctx: TestContext) => Promise<void>, options?: WithApiOptions): Promise<void> {
  const db = getTestDb()
  try {
    await db.transaction().execute(async (trx) => {
      const app = await buildApp({
        db: trx,
        config: options?.config ?? testConfig(),
        loggerStream: options?.loggerStream,
        onRoute: options?.onRoute,
        screenRenderer: options?.screenRenderer,
      })

      // fn과 app.close() 둘 다 던질 수 있다. finally 블록에서 던지면 try 블록의
      // 에러를 덮어써 버리므로(JS 표준 동작), fn의 에러를 직접 잡아두고 close의
      // 에러보다 우선한다 — fn이 실패했다면 그게 진짜 원인이고, close 실패는
      // 부수 효과일 뿐이다. fn이 성공했는데 close만 실패했다면 close의 에러가
      // 유일한 신호이므로 그대로 던진다.
      let fnError: unknown
      try {
        await fn({ app, db: trx })
      } catch (error) {
        fnError = error
      }
      try {
        await app.close()
      } catch (closeError) {
        if (fnError === undefined) throw closeError
      }
      if (fnError !== undefined) throw fnError

      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

/**
 * `withRealApi`가 여는 앱과 그 앱이 실제로 듣고 있는 포트.
 *
 * `TestContext`를 넓히므로 `(ctx: TestContext) => …`를 받던 기존 호출자는 그대로 통과한다.
 */
export interface RealApiContext extends TestContext {
  /** `127.0.0.1`의 포트. WebSocket 케이스가 여기로 붙는다. */
  port: number
}

export interface WithRealApiOptions {
  config?: ApiConfig
  /**
   * 부팅 **전에** 라우트를 더 얹는 이음매. `snapshots-concurrency.test.ts`의 프로브
   * 라우트가 이것을 쓴다 — Fastify 5는 부팅 뒤의 라우트 등록을 거부하는데
   * (`Root plugin has already booted`) 이 하네스는 `listen`으로 부팅까지 하기 때문이다.
   */
  register?: (app: FastifyInstance) => Promise<void>
  /** `buildApp`의 같은 이름 필드 — `WithApiOptions.loggerStream`과 같다. */
  loggerStream?: Writable
}

/**
 * 실커밋 하네스가 쓰는 청소. **`withApi`(롤백 하네스)를 쓰는 파일은 부르지 않는다.**
 *
 * `projects` 삭제가 `menu_nodes`·`pages`·`revisions`·`comments`·`snapshots`·`presets`·
 * 프로젝트 테마까지 CASCADE로 데려가고, `users` 삭제가 `sessions`를 데려간다.
 * **TRUNCATE가 아니다** — 그 명령은 테이블 전체에 ACCESS EXCLUSIVE 잠금을 잡으므로
 * 시스템 테마처럼 프로젝트에 매이지 않은 행까지 지우거나(`themes`), 같은 DB를 보는 다른
 * 커넥션을 이유 없이 세운다. 두 줄의 DELETE로 이 부류의 파일이 만드는 것이 전부 가고
 * 시스템 테마만 남는다는 것은 `real-api-harness.test.ts`가 실제로 세어 고정한다 —
 * 그 파일에 후보 셋을 가른 표도 있다.
 */
export async function resetRealData(): Promise<void> {
  const db = getTestDb()
  await db.deleteFrom('projects').execute()
  await db.deleteFrom('users').execute()
}

/**
 * **실제로 커밋하는 하네스.** `withApi`와 달리 앱을 트랜잭션이 아니라 **풀 핸들** 위에
 * 세우므로 요청마다 서로 다른 커넥션을 잡고 각자 커밋한다. 그리고 **진짜 포트를 연다** —
 * `inject()`는 소켓을 만들지 않아 WebSocket 업그레이드를 태울 수 없다.
 *
 * **두 벌을 만들지 않는다(P3-1 D1).** 앞선 슬라이스들이 같은 것을 파일마다 복사해 두었고
 * (`revisions-concurrency`·`comments-concurrency`·`restore-concurrency`·
 * `restore-lock-census`의 지역 `withRealApi`, `snapshots-concurrency`의 `withProbeApi`),
 * P3의 WS 케이스가 여섯 번째 사본을 만들 자리였다. 그 사본들이 갈리면 *"어느 하네스에서
 * 잰 값인가"*가 매번 물음이 된다.
 *
 * **`withApi`를 갈아엎지 않는다.** `db/tx.ts`가 P1 때 *"테스트마다 관련 테이블을
 * TRUNCATE하는 방식으로 격리 전략을 바꿔야 한다"*고 적었지만, 그 파일의 그 문단이 지금
 * 적고 있듯 실제로 선 것은 **두 번째 하네스**다.
 *
 * 청소는 호출자가 `resetRealData`를 `beforeEach`·`afterEach`에 걸어 한다 — 하네스가
 * 스스로 지우면 한 케이스가 하네스를 두 번 여는 시나리오(연결 둘)에서 중간에 판이 지워진다.
 */
export async function withRealApi(
  fn: (ctx: RealApiContext) => Promise<void>,
  options?: WithRealApiOptions,
): Promise<void> {
  const db = getTestDb()
  const app = await buildApp({ db, config: options?.config ?? testConfig(), loggerStream: options?.loggerStream })
  if (options?.register) {
    await options.register(app)
  }

  // 포트 0은 커널이 빈 포트를 고르게 한다. 고정 포트를 쓰면 같은 포크에서 앞 케이스의
  // 소켓이 TIME_WAIT으로 남아 있을 때 다음 케이스가 EADDRINUSE로 죽는다.
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('withRealApi: 포트를 열지 못했습니다')
  }

  try {
    await fn({ app, db, port: address.port })
  } finally {
    await app.close()
  }
}

/** 세션 쿠키 이름. 운영·테스트 설정 모두 기본값(`wb_session`)을 바꾸지 않으므로 여기서 고정한다. */
const SESSION_COOKIE_NAME = 'wb_session'

/** 토큰 원문을 `app.inject({ cookies })`에 바로 쓸 수 있는 객체로 만든다. */
export function authCookie(token: string): { wb_session: string } {
  return { [SESSION_COOKIE_NAME]: token }
}

export interface SignedUpUser {
  user: { id: string; email: string; name: string }
  cookie: { wb_session: string }
  password: string
}

/** `signup()`가 만드는 이메일이 테스트 간에 겹치지 않도록 매기는 모듈 스코프 카운터. */
let signupCounter = 0

/**
 * 사용자를 만들고 로그인 쿠키까지 돌려준다. 이메일 기본값은 호출마다 유일하게 만든다
 * (모듈 스코프 카운터) — `withApi`가 테스트마다 롤백하므로 파일 간 충돌은 없지만,
 * 한 테스트 안에서 여러 사용자를 만드는 경우가 흔해 그 안에서도 겹치면 안 된다.
 *
 * **이름이 `signup`인 채로 남는다. 가입 라우트는 없다**(2026-08-20 D1·D2). 앞서 이
 * 픽스처는 *"`/api/auth/signup`을 **실제로** 호출한다(직접 `insertUser`를 부르지 않는다) —
 * 그래야 비밀번호 해시·세션 발급까지 실제 라우트가 하는 그대로 거친다"*고 적고 있었다.
 * **그 근거는 살아 있고 부르는 자만 바뀌었다** — 오늘 계정을 만드는 프로덕션 경로는
 * `db/seed-user.ts`의 `seedUser`이고(마이그레이션 뒤에 `migrate`가 부르는 바로 그 함수),
 * 세션을 내는 프로덕션 경로는 `POST /api/auth/login`이다. **그래서 둘을 잇는다:**
 *
 * 1. `seedUser` — 비밀번호 해시와 삽입. 옛 라우트가 하던 그 일이고, 지금 운영에서도
 *    계정은 이 함수로만 생긴다.
 * 2. `POST /api/auth/login` — 세션 발급. **시딩은 쿠키를 안 낸다**(HTTP 요청이 아니다).
 *
 * **호출자 쪽 계약은 그대로다** — 돌려주는 것도 `{ user, cookie, password }` 셋이고,
 * 첫 `inject`가 Fastify 인스턴스를 부팅시키는 성질도 그대로다(`roles.test.ts`가 그 순서에
 * 기대고 있다). 그래서 이 함수를 쓰는 파일 쉰셋을 한 줄도 안 고쳤다.
 *
 * **scrypt 비용은 `testConfig()`의 값(1024)을 쓴다.** 운영 기본값(32768)이면 해시 한 번에
 * 50ms 이상이라 이 픽스처가 등장하는 케이스마다 그 비용이 쌓인다. 다른 `config`로
 * `withApi`를 연 케이스도 로그인은 그대로 된다 — 해시가 자기 파라미터를 동봉하기 때문이다.
 */
export async function signup(
  ctx: TestContext,
  overrides?: Partial<{ email: string; name: string; password: string }>,
): Promise<SignedUpUser> {
  signupCounter += 1
  const email = overrides?.email ?? `user${signupCounter}@example.com`
  const name = overrides?.name ?? `사용자${signupCounter}`
  const password = overrides?.password ?? 'password1234'

  const outcome = await seedUser(ctx.db, { email, name, password }, testConfig().passwordScryptN)
  if (outcome.kind !== 'created') {
    throw new Error(`signup 픽스처가 실패했습니다: 계정을 만들지 못했습니다 (${outcome.kind}: ${email})`)
  }

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  })

  if (res.statusCode !== 200) {
    throw new Error(`signup 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }

  const token = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME)?.value
  if (!token) {
    throw new Error('signup 픽스처가 실패했습니다: 응답에 세션 쿠키가 없습니다')
  }

  return {
    user: res.json(),
    cookie: authCookie(token),
    password,
  }
}

export interface CreatedProject {
  id: string
  name: string
  slug: string
}

/** `createProject()`가 만드는 slug가 테스트 간에 겹치지 않도록 매기는 모듈 스코프 카운터. */
let projectCounter = 0

/**
 * 주어진 쿠키의 사용자를 owner로 하는 프로젝트를 만든다. slug는 호출마다 유일하다.
 *
 * `/api/projects`를 실제로 호출한다(`signup`과 같은 이유) — 이 태스크가 검증하는
 * 생성 경로(트랜잭션·slug 유니크 처리 포함)를 그대로 거쳐야 이후 태스크의
 * 픽스처가 실제 API와 어긋나지 않는다.
 */
export async function createProject(
  ctx: TestContext,
  cookie: { wb_session: string },
  overrides?: Partial<{ name: string; slug: string }>,
): Promise<CreatedProject> {
  projectCounter += 1
  const name = overrides?.name ?? `프로젝트${projectCounter}`
  const slug = overrides?.slug ?? `project-${projectCounter}`

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/projects',
    cookies: cookie,
    payload: { name, slug },
  })

  if (res.statusCode !== 201) {
    throw new Error(`createProject 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }

  return res.json()
}

/**
 * 이미 있는 프로젝트에 사용자를 특정 역할로 넣는다 (API를 거치지 않는다).
 *
 * 멤버 초대 API가 아직 없는 태스크(이 태스크 포함)에서도 권한 시나리오를 세울 수
 * 있어야 하므로 DB에 직접 쓴다. 초대 API(`POST .../members`)가 생긴 뒤에도 그대로 둔다 —
 * 픽스처가 검사 대상 API에 의존하면 그 API가 깨졌을 때 무관한 테스트가 전부 무너진다.
 */
export async function addMember(
  ctx: TestContext,
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  await ctx.db
    .insertInto('project_members')
    .values({ project_id: projectId, user_id: userId, role })
    .execute()
}

export interface CreatedMenuNode {
  id: string
  projectId: string
  parentId: string | null
  title: string
  sortOrder: number
}

/** `createMenuNode()`가 만드는 title이 눈에 띄게 겹치지 않도록 매기는 모듈 스코프 카운터. */
let menuNodeCounter = 0

/**
 * 프로젝트에 메뉴 노드를 만든다. `POST /api/projects/:projectId/menu`를 실제로
 * 호출한다(`createProject`와 같은 이유) — 이 태스크가 검증하는 생성 경로
 * (형제 재번호·부모 검증 포함)를 그대로 거쳐야 이것을 쓰는 픽스처(`createPage`)가
 * 실제 API와 어긋나지 않는다.
 */
export async function createMenuNode(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  input?: Partial<{ parentId: string | null; title: string }>,
): Promise<CreatedMenuNode> {
  menuNodeCounter += 1
  const title = input?.title ?? `메뉴${menuNodeCounter}`
  const parentId = input?.parentId ?? null

  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/menu`,
    cookies: cookie,
    payload: { parentId, title },
  })

  if (res.statusCode !== 201) {
    throw new Error(`createMenuNode 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }

  return res.json()
}

export interface CreatedPage {
  id: string
  menuNodeId: string
  title: string
  description: string | null
  sortOrder: number
  schemaVersion: number
  schema: unknown
}

/** `createPage()`가 만드는 title이 눈에 띄게 겹치지 않도록 매기는 모듈 스코프 카운터. */
let pageCounter = 0

/**
 * 프로젝트의 메뉴 노드 밑에 페이지를 만든다. `POST /api/projects/:projectId/pages`를
 * 실제로 호출한다(`createMenuNode`와 같은 이유) — 이 태스크가 검증하는 생성 경로
 * (기본 스키마·정렬·카탈로그 게이트 포함)를 그대로 거쳐야 픽스처가 실제 API와
 * 어긋나지 않는다.
 */
export async function createPage(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  menuNodeId: string,
  input?: Partial<{ title: string; description: string }>,
): Promise<CreatedPage> {
  pageCounter += 1
  const title = input?.title ?? `페이지${pageCounter}`

  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/pages`,
    cookies: cookie,
    payload: {
      menuNodeId,
      title,
      ...(input?.description !== undefined ? { description: input.description } : {}),
    },
  })

  if (res.statusCode !== 201) {
    throw new Error(`createPage 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }

  return res.json()
}
