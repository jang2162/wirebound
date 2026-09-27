#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { BuildError, buildTheme } from './build'

const USAGE = `wb-theme build [--entry <경로>] [--out <디렉터리>]`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command === 'build') {
    const { values } = parseArgs({ args: rest, options: { entry: { type: 'string' }, out: { type: 'string' } } })
    const r = await buildTheme({ root: process.cwd(), entry: values.entry, outDir: values.out })
    console.log(`✓ ${r.file} (${r.bytes} 바이트 · theme.js ${r.themeJsBytes} 바이트)`)
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
