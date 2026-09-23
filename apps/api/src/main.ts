import { buildApp } from './app'
import { loadConfig } from './config'
import { createDb, createPool } from './db/client'
import { describeDatabaseTarget } from './db/describe-target'
import { describeSchemaState, emptySchemaHint } from './db/describe-schema-state'
import { countExecutedMigrations } from './db/migrate'
import { chromiumScreenRenderer } from './services/screen-render-chromium'

/**
 * 실제 프로세스 진입점. `listen`을 부르는 것은 이 파일뿐이다 —
 * `buildApp`은 조립만 하고, 포트를 여는 책임은 여기 있다.
 *
 * DB 풀도 여기서 만든다 — `buildApp`은 풀을 만들지도 닫지도 않으므로,
 * 만든 쪽인 이 파일이 종료 시 `db.destroy()`로 책임지고 닫는다.
 *
 * **화면 이미지를 그리는 자를 채우는 자리도 여기뿐이다**(P10-2 D2·D3). `buildApp`이
 * 스스로 만들면 `pnpm test`의 케이스 전부가 진짜 브라우저를 띄운다 — 그 판정의 근거는
 * `services/screen-render.ts`의 머리말에 있고, **이 줄이 있다는 것을**
 * `test/screen-renderer-census.test.ts`가 소스에서 센다.
 *
 * **그래서 브라우저 실행 파일을 넘기는 자리도 여기뿐이다.** `chromiumScreenRenderer`는
 * `executablePath` 옵션을 처음부터 들고 있었는데 그것을 채우는 자가 없어 **바깥에서 닿을
 * 수 없었다** — `SCREEN_CHROMIUM_PATH`가 그 길이다(`config.ts`의 주석이 왜 필요한지 든다).
 */
async function main(): Promise<void> {
  const config = loadConfig()
  const pool = createPool(config.databaseUrl, undefined, config.dbTimeLimits)
  const db = createDb(pool)
  try {
    await listen(config, db)
  } catch (error) {
    // **빈 DB 로 죽은 것이면 그렇게 말한다**(2026-08-19 D3). 워크트리마다 컨테이너를 띄우면
    // **빈 볼륨으로 뜨는 것이 정상 경로**가 되는데, 원문은 `relation "themes" does not exist`
    // 라 사람이 *"설계서가 사라졌다"* 로 읽는다. 데이터는 다른 이름의 볼륨에 있다.
    // 문구를 만드는 자는 `describe-schema-state.ts` 이고 그쪽에 자가 있다 — 이 길은
    // 부팅이 실패해야만 지나므로 케이스가 여기 못 닿는다(같은 판정: `missing-database-hint.ts`).
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

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    app.log.info(`${signal} 수신 — 서버를 종료합니다`)
    await app.close()
    await db.destroy()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ host: config.host, port: config.port })
  // **어느 DB를 보는지 말한다**(2026-08-19 D4). 바로 위에서 fastify가 찍는 줄은 포트만
  // 말하므로, 워크트리를 여럿 띄운 사람이 터미널을 나란히 놓고 가를 수 있는 값이 없다.
  // 자격 문자열은 안 찍는다 — `describeDatabaseTarget`이 그것을 지킨다.
  //
  // **그 줄에 스키마 상태를 붙인다**(2026-08-19 D3). 워크트리마다 컨테이너를 띄우면
  // **빈 볼륨으로 뜨는 것이 정상 경로**가 되는데, 사람은 그것을 *"설계서가 사라졌다"* 로
  // 읽는다. 데이터는 다른 이름의 볼륨에 있다 — 그 갈림을 여기서 한 줄로 말한다.
  app.log.info(
    `이 서버가 보는 DB: ${describeDatabaseTarget(config.databaseUrl)} · ${describeSchemaState(
      await countExecutedMigrations(db),
    )}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
