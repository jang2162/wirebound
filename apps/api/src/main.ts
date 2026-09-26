import { buildApp } from './app'
import { prepareUnlockSocket, unlockSocketDir, unlockSocketPath, UnlockSocketRefused } from './auth/unlock-socket'
import { loadConfig } from './config'
import { createDb, createPool, verifyDbTimeLimits } from './db/client'
import { describeDatabaseTarget } from './db/describe-target'
import { describeSchemaState, emptySchemaHint } from './db/describe-schema-state'
import { countExecutedMigrations } from './db/migrate'
import { assertSchemaVersion, SchemaVersionError } from './db/schema-version'
import { chromiumScreenRenderer } from './services/screen-render-chromium'
import { closeOnSignals } from './shutdown'

/**
 * 실제 프로세스 진입점. `listen`을 부르는 것은 이 파일뿐이다 —
 * `buildApp`은 조립만 하고, 포트를 여는 책임은 여기 있다.
 *
 * DB 풀도 여기서 만든다 — `buildApp`은 풀을 만들지도 닫지도 않으므로,
 * 만든 쪽인 이 파일이 종료 시 `db.destroy()`로 책임지고 닫는다.
 *
 * **화면 이미지를 그리는 자를 채우는 자리도 여기뿐이다**. `buildApp`이
 * 스스로 만들면 `pnpm test`의 케이스 전부가 진짜 브라우저를 띄운다 — 그 판정의 근거는
 * `services/screen-render.ts`의 머리말에 있고, **이 줄이 있다는 것을**
 * `test/screen-renderer-census.test.ts`가 소스에서 센다.
 *
 * **그래서 브라우저 실행 파일을 넘기는 자리도 여기뿐이다.** `chromiumScreenRenderer`의
 * `executablePath` 옵션은 여기서 채우지 않으면 **바깥에서 닿을 수 없다** —
 * `SCREEN_CHROMIUM_PATH`가 그 길이다(`config.ts`의 주석이 왜 필요한지 든다).
 */
async function main(): Promise<void> {
  const config = loadConfig()
  const pool = createPool(config.databaseUrl, undefined, config.dbTimeLimits)
  // 실은 시간 제한이 걸리는지 한 번 잰다 — 앞단이 거절하면 여기서 멈춘다(`db/client.ts`의 `verifyDbTimeLimits`).
  await verifyDbTimeLimits(pool, config.dbTimeLimits, (message) => console.warn(message))
  const db = createDb(pool)
  // **이 코드가 아는 마이그레이션과 견준다** — 뒤처졌으면 여기서 멈추고 한 줄로 말한다(`db/schema-version.ts`의 표).
  await assertSchemaVersion(db, config.databaseUrl, (message) => console.warn(message))
  try {
    await listen(config, db)
  } catch (error) {
    // **빈 DB 로 죽은 것이면 그렇게 말한다**. 워크트리마다 컨테이너를 띄우면
    // **빈 볼륨으로 뜨는 것이 정상 경로**가 되는데, 원문은 `relation "themes" does not exist`
    // 라 사람이 *"설계서가 사라졌다"* 로 읽는다. 데이터는 다른 이름의 볼륨에 있다.
    // 문구를 만드는 자는 `describe-schema-state.ts` 이고 그쪽에 자가 있다 — 이 길은
    // 부팅이 실패해야만 지나므로 케이스가 여기 못 닿는다(같은 판정: `missing-database-hint.ts`).
    // 빈 DB 는 대개 위 `assertSchemaVersion`이 먼저 멈춘다 — 여기는 그때 마이그레이션 표를 못 읽은 판이다.
    const hint = emptySchemaHint(await countExecutedMigrations(db), config.databaseUrl)
    if (hint === undefined) {
      throw error
    }
    throw new Error(hint, { cause: error })
  }
}

/** 조립하고 포트를 연다. **실패는 `main` 이 가려서 옮긴다.** */
async function listen(config: ReturnType<typeof loadConfig>, db: ReturnType<typeof createDb>): Promise<void> {
  const app = await buildApp({
    db,
    config,
    // **`SCREEN_CHROMIUM_PATH`가 비면 인자를 안 준다** — 그때 `playwright-core`가 자기
    // 캐시에서 찾는 것이 기본 길이다. 값이 있으면 그 실행 파일을 쓴다(`ApiConfig`의 주석).
    screenRenderer: chromiumScreenRenderer(
      config.screenChromiumPath === undefined ? undefined : { executablePath: config.screenChromiumPath },
    ),
  })

  // 신호 셋을 받아 도는 요청을 끝까지 답한 뒤 닫는다 — 한도와 그 까닭은 `shutdown.ts`의 머리말.
  closeOnSignals(app, db)
  const unlockSocket = prepareUnlockSocket(app)

  await app.listen({ host: config.host, port: config.port })
  // **로그인 막힘을 푸는 입구를 연다** — TCP 포트를 쥔 뒤라야 자리에 남은 소켓이 죽은 api 의 것이다(`auth/unlock-socket.ts`
  // 머리말 «여는 것은»). 못 열어도 api 는 그대로 뜬다 — 풀기만 못 한다.
  const socketDir = unlockSocketDir()
  const socketPath = unlockSocketPath(config.port, socketDir)
  try {
    await unlockSocket.open(socketPath, socketDir)
    app.log.info(`로그인 막힘을 푸는 입구: ${socketPath}`)
  } catch (error) {
    if (!(error instanceof UnlockSocketRefused)) throw error
    app.log.warn(`로그인 막힘을 푸는 입구를 안 엽니다 — ${error.message}. 막힌 로그인은 창이 지나거나 api 를 다시 띄워야 풀린다`)
  }
  // **어느 DB를 보는지 말한다**. 바로 위에서 fastify가 찍는 줄은 포트만
  // 말하므로, 워크트리를 여럿 띄운 사람이 터미널을 나란히 놓고 가를 수 있는 값이 없다.
  // 자격 문자열은 안 찍는다 — `describeDatabaseTarget`이 그것을 지킨다.
  //
  // **그 줄에 스키마 상태를 붙인다**. 워크트리마다 컨테이너를 띄우면
  // **빈 볼륨으로 뜨는 것이 정상 경로**가 되는데, 사람은 그것을 *"설계서가 사라졌다"* 로
  // 읽는다. 데이터는 다른 이름의 볼륨에 있다 — 그 갈림을 여기서 한 줄로 말한다.
  app.log.info(
    `이 서버가 보는 DB: ${describeDatabaseTarget(config.databaseUrl)} · ${describeSchemaState(
      await countExecutedMigrations(db),
    )}`,
  )
}

main().catch((error) => {
  // 스키마 판정은 사람이 할 일을 한 줄로 말한다 — 스택은 그 줄을 묻는다.
  console.error(error instanceof SchemaVersionError ? error.message : error)
  process.exit(1)
})
