import { buildApp } from './app'
import { loadConfig } from './config'
import { createDb, createPool } from './db/client'

/**
 * 실제 프로세스 진입점. `listen`을 부르는 것은 이 파일뿐이다 —
 * `buildApp`은 조립만 하고, 포트를 여는 책임은 여기 있다.
 *
 * DB 풀도 여기서 만든다 — `buildApp`은 풀을 만들지도 닫지도 않으므로,
 * 만든 쪽인 이 파일이 종료 시 `db.destroy()`로 책임지고 닫는다.
 */
async function main(): Promise<void> {
  const config = loadConfig()
  const pool = createPool(config.databaseUrl)
  const db = createDb(pool)
  const app = await buildApp({ db, config })

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    app.log.info(`${signal} 수신 — 서버를 종료합니다`)
    await app.close()
    await db.destroy()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ host: config.host, port: config.port })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
