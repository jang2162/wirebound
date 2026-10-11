#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { readWbtheme } from '@wirebound/themes'
import { BuildError, buildTheme } from './build'
import { checkTheme, formatCheckReport } from './check'
import { DEFAULT_SHOT_WIDTHS, ShotsBrowserError, shotsProblems, takeShots } from './shots'
import { startDev } from './dev'
import { packTemplate } from './pack-template'

const USAGE = [
  'wb-theme dev [--entry <경로>] [--port <번호>]',
  'wb-theme build [--entry <경로>] [--out <디렉터리>]',
  'wb-theme check [--entry <경로>] [--file <.wbtheme>]',
  `wb-theme shots [--entry <경로>] [--out <디렉터리>] [--widths ${DEFAULT_SHOT_WIDTHS.join(',')}] [--browser <Chromium 경로>]`,
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
  if (command === 'check') {
    const { values } = parseArgs({ args: rest, options: { entry: { type: 'string' }, file: { type: 'string' } } })
    // `--file` 이 없으면 지금 소스를 임시 디렉터리로 빌드해 잰다 — 작성자의 `dist` 는 건드리지 않는다.
    const scratch = values.file === undefined ? mkdtempSync(join(tmpdir(), 'wb-theme-check-')) : null
    try {
      const file = values.file ?? (await buildTheme({ root: process.cwd(), entry: values.entry, outDir: scratch! })).file
      const { files, issues } = readWbtheme(new Uint8Array(readFileSync(file)))
      if (files === null) throw new BuildError(issues)
      const { ok, lines } = formatCheckReport(await checkTheme(files))
      for (const line of lines) (ok ? console.log : console.error)(line)
      return ok ? 0 : 1
    } finally {
      if (scratch !== null) rmSync(scratch, { recursive: true, force: true })
    }
  }
  if (command === 'shots') {
    const { values } = parseArgs({
      args: rest,
      options: { entry: { type: 'string' }, out: { type: 'string' }, widths: { type: 'string' }, browser: { type: 'string' } },
    })
    const widths = values.widths?.split(',').map((w) => Number(w.trim()))
    if (widths !== undefined && widths.some((w) => !Number.isInteger(w) || w <= 0))
      throw new Error(`--widths 는 쉼표로 가른 양의 정수입니다: ${values.widths}`)
    const outDir = values.out ?? 'shots'
    const report = await takeShots({ root: process.cwd(), entry: values.entry, outDir, widths, browserPath: values.browser })
    for (const w of report.widths) for (const png of w.pngs) console.log(`✓ ${join(outDir, png)}`)
    const problems = shotsProblems(report)
    for (const line of problems) console.error(line)
    console.log(`${problems.length === 0 ? '✓' : '✗'} ${join(outDir, 'report.json')} — 문제 ${problems.length} 건`)
    return problems.length === 0 ? 0 : 1
  }
  if (command === 'dev') {
    const { values } = parseArgs({ args: rest, options: { entry: { type: 'string' }, port: { type: 'string' } } })
    const server = await startDev({
      root: process.cwd(),
      entry: values.entry,
      port: values.port === undefined ? undefined : Number(values.port),
    })
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
    if (error instanceof ShotsBrowserError) {
      console.error(error.message)
    } else if (error instanceof BuildError) {
      for (const issue of error.issues) console.error(`✗ ${issue.path} — ${issue.message}`)
    } else {
      console.error(error instanceof Error ? error.message : error)
    }
    process.exit(1)
  },
)
