/**
 * **api 가 내보내기 런타임(`runtime.js`)을 기동 때 읽어 쥔다 — 없으면 멈춘다**(`src/services/export-runtime.ts`).
 *
 * 런타임은 `test/global-setup.ts` 가 이 실행에서 다시 빌드했다 — 여기서 읽는 글자는 지금 소스의 것이다.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { createDb, createPool } from '../src/db/client'
import type { DbHandle } from '../src/db/tx'
import { readExportRuntime } from '../src/services/export-runtime'
import { TEST_DATABASE_URL, testConfig } from './helpers'

let db: DbHandle
beforeAll(() => {
  db = createDb(createPool(TEST_DATABASE_URL))
})
afterAll(async () => {
  await db.destroy()
})

const PACKAGED = createRequire(import.meta.url).resolve('@wirebound/exporter/runtime.js')

describe('내보내기 런타임', () => {
  it('패키지가 낸 dist/runtime.js 를 그대로 읽는다 — 카나리아: 비어 있지 않은 IIFE', () => {
    expect(PACKAGED.endsWith('/packages/exporter/dist/runtime.js')).toBe(true)
    const text = readExportRuntime()
    expect(text).toBe(readFileSync(PACKAGED, 'utf8'))
    expect(text.length).toBeGreaterThan(100_000)
    expect(text.startsWith('(function(){')).toBe(true)
  })

  it('파일이 없으면 까닭(`pnpm build`)과 경로를 말하며 던진다', () => {
    const missing = join(tmpdir(), `wb-no-runtime-${process.pid}.js`)
    expect(() => readExportRuntime(missing)).toThrow(
      `내보내기 런타임이 없습니다(${missing}) — 저장소 뿌리에서 \`pnpm build\` 를 먼저 돌립니다`,
    )
  })

  it('없는 자리를 주면 buildApp 이 기동을 멈춘다', async () => {
    const missing = join(tmpdir(), `wb-no-runtime-${process.pid}.js`)
    // 섰으면 닫고 «섰다» 를 값으로 낸다 — 앱 인스턴스를 실패 문장에 찍지 않게.
    const outcome = await buildApp({ db, config: testConfig(), exportRuntimePath: missing }).then(
      async (app) => {
        await app.close()
        return '기동했다'
      },
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )
    expect(outcome).toBe(`내보내기 런타임이 없습니다(${missing}) — 저장소 뿌리에서 \`pnpm build\` 를 먼저 돌립니다`)
  })

  it('있으면 buildApp 이 선다 — 대조군', async () => {
    const app = await buildApp({ db, config: testConfig() })
    await app.close()
  })
})
