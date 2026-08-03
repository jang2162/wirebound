import { buildApp } from './app'
import { loadConfig } from './config'

/**
 * 실제 프로세스 진입점. `listen`을 부르는 것은 이 파일뿐이다 —
 * `buildApp`은 조립만 하고, 포트를 여는 책임은 여기 있다.
 */
async function main(): Promise<void> {
  const config = loadConfig()
  const app = await buildApp({ config })

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    app.log.info(`${signal} 수신 — 서버를 종료합니다`)
    await app.close()
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
