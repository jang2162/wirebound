#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { BuildError, buildTheme } from './build'
import { startDev } from './dev'
import { packTemplate } from './pack-template'

const USAGE = [
  'wb-theme dev [--entry <경로>] [--port <번호>]',
  'wb-theme build [--entry <경로>] [--out <디렉터리>]',
  'wb-theme pack-template [--out <파일>]   (저장소 안에서만)',
].join('\n  ')

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command === 'build') {
    const { values } = parseArgs({ args: rest, options: { entry: { type: 'string' }, out: { type: 'string' } } })
    const r = await buildTheme({ root: process.cwd(), entry: values.entry, outDir: values.out })
    console.log(`✓ ${r.file} (${r.bytes} 바이트 · theme.js ${r.themeJsBytes} 바이트)`)
    return 0
  }
  if (command === 'dev') {
    const { values } = parseArgs({ args: rest, options: { entry: { type: 'string' }, port: { type: 'string' } } })
    const server = await startDev({ root: process.cwd(), entry: values.entry, port: values.port === undefined ? undefined : Number(values.port) })
    console.log(`갤러리: ${server.url}`)
    // 서버가 떠 있는 동안 돌아오지 않는다 — Ctrl-C 로 끝낸다.
    return new Promise<number>((done) => {
      const stop = () => void server.close().then(() => done(0))
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    })
  }
  if (command === 'pack-template') {
    const { values } = parseArgs({ args: rest, options: { out: { type: 'string' } } })
    const r = await packTemplate({ outFile: values.out })
    console.log(`✓ ${r.file} (${r.bytes} 바이트 · ${r.tarballs.map((t) => `${t.name} ${t.bytes} 바이트`).join(' · ')})`)
    return 0
  }
  console.error(`쓰는 법:\n  ${USAGE}`)
  return 1
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof BuildError) {
      for (const issue of error.issues) console.error(`✗ ${issue.path} — ${issue.message}`)
    } else {
      console.error(error instanceof Error ? error.message : error)
    }
    process.exit(1)
  },
)
