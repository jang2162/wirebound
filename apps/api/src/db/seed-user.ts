/**
 * **계정 시딩 — 마이그레이션이 다 올라간 뒤에 환경변수로 계정 하나를 만든다.**
 *
 * 공개 가입 라우트는 없다 — **계정을 만드는 길은 이것 하나다.** 이 파일이 하는 일은
 * **해시와 삽입**이고, **세션 발급**은 하지 않는다 — 시딩은 쿠키를 낼 상대가
 * 없다(HTTP 요청이 아니다). 그 계정으로 붙는 길은 `POST /api/auth/login`이다.
 *
 * **마이그레이션 파일 안에 넣지 않는다**. 마이그레이션은 스키마이고 계정은 데이터라,
 * `seed-user` 마이그레이션 같은 것을 만들면 `migrate:down`이 계정을 지우게 되고 롤백의 뜻이
 * 흐려진다. 그래서 시딩을 부르는 자는 `migrate.ts`의 **CLI 진입점**이지
 * `migrateToLatest`가 아니다 — `test/seed-user.test.ts`가 그 갈림을 잰다.
 *
 * **`src/db/` 에 있지만 `repos/users.ts`를 부른다.** 삽입 SQL과 유니크 위반 해석을
 * 두 벌로 만들지 않기 위해서다(그 파일이 제약 이름까지 맞춰 본다). 순환은 아니다 —
 * `repos/users.ts`가 보는 것은 `db/tx.ts`뿐이고 이 파일을 보지 않는다.
 */
import { z } from 'zod'
import { getKoreanErrorMap } from '@wirebound/schema'
import { hashPassword, DEFAULT_SCRYPT_PARAMS } from '../auth/password'
import { DisplayName, NormalizedEmail, RawPassword } from '../auth/credentials'
import { DuplicateEmailError, findUserByEmail, insertUser } from '../repos/users'
import type { DbHandle } from './tx'

/**
 * 시딩이 읽는 환경변수. **`src/config.ts`의 `EnvSchema`가 아니라 여기 있다** —
 * 이 값들을 읽는 자가 `migrate` CLI 하나뿐이고, 서버는 쓰지 않기 때문이다.
 * 서버가 안 쓰는 값 때문에 서버가 안 뜨면 그것대로 잘못이다(같은 판정:
 * `TEST_DATABASE_URL`을 `test/test-database-url.ts`가 따로 읽는다).
 *
 * **`.env.example`이 이 셋을 들고 있는지는 `test/env-example-census.test.ts`가 센다** —
 * 그 인구조사가 `EnvSchema`와 이 스키마 **둘 다**에서 키를 세므로, 새 키를 여기 열고
 * 템플릿에 안 적으면 거기서 죽는다.
 */
const SeedEnvSchema = z.object({
  SEED_USER_EMAIL: NormalizedEmail,
  SEED_USER_NAME: DisplayName.optional(),
  SEED_USER_PASSWORD: RawPassword,
})

/** 시딩을 켜는 값 둘. **이름은 없어도 된다**(이메일에서 만든다). */
const REQUIRED_KEYS = ['SEED_USER_EMAIL', 'SEED_USER_PASSWORD'] as const

/** 이름까지 포함한 전부. 하나라도 있으면 *"시딩할 뜻이 있다"*로 읽는다. */
const ALL_KEYS = ['SEED_USER_EMAIL', 'SEED_USER_NAME', 'SEED_USER_PASSWORD'] as const

/**
 * 시딩이 값 때문에 멈췄을 때 던진다. **`message`에 비밀번호를 담지 않는다** —
 * 이 메시지는 그대로 콘솔로 나간다.
 */
export class SeedUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedUserError'
  }
}

/** 시딩이 한 일. **셋 다 말한다** — 조용한 갈래를 두지 않는다. */
export type SeedUserOutcome =
  | { kind: 'skipped' }
  | { kind: 'created'; email: string }
  | { kind: 'already-exists'; email: string }

export interface SeedUserInput {
  email: string
  name: string
  password: string
}

/** 값이 비었는지. 공백만 든 값은 *"안 줬다"*와 같게 본다. */
function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== ''
}

/** zod 이슈를 `키: 사유` 줄로 옮긴다. **값을 싣지 않는다** — 실린 것은 키 이름과 사유뿐이다. */
function issueLines(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
}

/**
 * 환경변수를 읽는다. **없으면 `undefined`**(건너뛴다), **나쁘면 던진다.**
 *
 * *"하나만 준 것"*을 건너뛰기로 처리하지 않는다 — 비밀번호만 적고 이메일을 빠뜨린
 * 사람은 계정이 생겼다고 믿을 텐데 아무 일도 안 일어난다. 그 갈래는 실수이지
 * *"시딩을 안 하겠다"*가 아니다.
 */
export function readSeedUserEnv(env: NodeJS.ProcessEnv): SeedUserInput | undefined {
  const given = ALL_KEYS.filter((key) => present(env[key]))
  if (given.length === 0) {
    return undefined
  }

  const missing = REQUIRED_KEYS.filter((key) => !present(env[key]))
  if (missing.length > 0) {
    throw new SeedUserError(
      `계정 시딩에 필요한 환경변수가 없습니다: ${missing.join(' · ')}` +
        ` (지금 들어 있는 것: ${given.join(' · ')}). 시딩을 안 하려면 ${ALL_KEYS.join(' · ')} 를 모두 비운다.`,
    )
  }

  const parsed = SeedEnvSchema.safeParse(
    {
      SEED_USER_EMAIL: env.SEED_USER_EMAIL,
      SEED_USER_NAME: present(env.SEED_USER_NAME) ? env.SEED_USER_NAME : undefined,
      SEED_USER_PASSWORD: env.SEED_USER_PASSWORD,
    },
    { error: getKoreanErrorMap() },
  )
  if (!parsed.success) {
    throw new SeedUserError(`계정 시딩의 환경변수 값이 올바르지 않습니다 — ${issueLines(parsed.error)}`)
  }

  return {
    email: parsed.data.SEED_USER_EMAIL,
    name: parsed.data.SEED_USER_NAME ?? defaultNameFor(parsed.data.SEED_USER_EMAIL),
    password: parsed.data.SEED_USER_PASSWORD,
  }
}

/**
 * 이름을 안 줬을 때 쓰는 값 — 이메일의 로컬 파트다. **잘라 쓰지 않는다**:
 * 80자를 넘으면 그렇다고 말하고 멈춘다(조용히 자르면 사람이 안 정한 이름이 DB에 남는다).
 */
function defaultNameFor(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parsed = DisplayName.safeParse(local, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    throw new SeedUserError(
      `SEED_USER_NAME 이 없어 이메일에서 이름을 만들려 했지만 쓸 수 없습니다 — ${issueLines(parsed.error)}.` +
        ' SEED_USER_NAME 을 직접 준다.',
    )
  }
  return parsed.data
}

/**
 * **없으면 만들고, 이미 있으면 그대로 둔다**. 멱등이다.
 *
 * **비밀번호를 덮어쓰지 않는다.** `migrate`를 두 번 돌렸다고 남의 비밀번호가 바뀌면
 * 안 된다 — 그래서 이미 있는 이메일에는 해시를 계산조차 하지 않고 돌아선다.
 *
 * 삽입 직전의 조회는 경합에 대한 보장이 아니다(그 사이에 남이 넣을 수 있다). 그래서
 * `DuplicateEmailError`도 *"이미 있다"*로 받는다 — 둘이 같은 뜻이다.
 */
export async function seedUser(db: DbHandle, input: SeedUserInput, scryptN: number): Promise<SeedUserOutcome> {
  const validated = validateInput(input)

  const existing = await findUserByEmail(db, validated.email)
  if (existing) {
    return { kind: 'already-exists', email: validated.email }
  }

  const passwordHash = await hashPassword(validated.password, { ...DEFAULT_SCRYPT_PARAMS, N: scryptN })
  try {
    await insertUser(db, { email: validated.email, name: validated.name, passwordHash })
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return { kind: 'already-exists', email: validated.email }
    }
    throw error
  }
  return { kind: 'created', email: validated.email }
}

/** 환경변수를 안 지나는 호출자(테스트 픽스처)도 같은 게이트를 지나게 한다. */
function validateInput(input: SeedUserInput): SeedUserInput {
  const parsed = z
    .object({ email: NormalizedEmail, name: DisplayName, password: RawPassword })
    .safeParse(input, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    throw new SeedUserError(`계정 값이 올바르지 않습니다 — ${issueLines(parsed.error)}`)
  }
  return parsed.data
}

/** 환경변수를 읽어 시딩한다. **없으면 건너뛴다.** */
export async function seedUserFromEnv(
  db: DbHandle,
  env: NodeJS.ProcessEnv,
  scryptN: number,
): Promise<SeedUserOutcome> {
  const input = readSeedUserEnv(env)
  if (input === undefined) {
    return { kind: 'skipped' }
  }
  return seedUser(db, input, scryptN)
}

/**
 * 결과를 사람이 읽는 한 줄로. **이메일은 싣고 비밀번호는 안 싣는다**.
 *
 * 건너뛴 갈래도 한 줄을 낸다 — 개발자 대부분이 그 갈래인데, 아무 말도 없으면
 * *"계정이 생겼겠거니"* 하고 로그인 화면에서 막힌다.
 */
export function describeSeedOutcome(outcome: SeedUserOutcome): string {
  switch (outcome.kind) {
    case 'skipped':
      return `계정 시딩 건너뜀 — ${REQUIRED_KEYS.join('·')} 가 없습니다 (계정을 만들려면 그 둘을 준다)`
    case 'created':
      return `계정 시딩: 만들었습니다 — ${outcome.email}`
    case 'already-exists':
      return `계정 시딩: 이미 있어 그대로 둡니다 — ${outcome.email} (비밀번호를 덮어쓰지 않습니다)`
  }
}

/** 콘솔을 그대로 받지 않고 이음매로 받는다 — 케이스가 출력 전문을 읽어 비밀번호가 안 실리는지 잴 수 있다. */
export interface SeedReporter {
  log: (line: string) => void
  error: (line: string) => void
}

/**
 * **`migrate latest`가 마지막에 부르는 한 걸음.** 결과를 말하고, 실패면 `false`다.
 *
 * 실패 문장이 *"마이그레이션은 올렸다"*를 함께 말하는 것이 요점이다 — 이 지점은
 * 스키마가 이미 최신인 자리라, 그냥 *"실패"*라고만 하면 사람이 마이그레이션을 다시
 * 돌려야 하는지 알 수 없다.
 */
export async function runSeedStep(
  db: DbHandle,
  env: NodeJS.ProcessEnv,
  scryptN: number,
  report: SeedReporter,
): Promise<boolean> {
  try {
    report.log(describeSeedOutcome(await seedUserFromEnv(db, env, scryptN)))
    return true
  } catch (error) {
    const reason = error instanceof SeedUserError ? error.message : String(error)
    report.error(`계정 시딩 실패 — 마이그레이션은 올렸고 계정은 만들지 않았습니다. ${reason}`)
    return false
  }
}
