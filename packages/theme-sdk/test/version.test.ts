import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { SDK_VERSION } from '@wirebound/theme-sdk'
it('package.json 판과 SDK_VERSION 이 같다', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  expect(pkg.version).toBe(SDK_VERSION)
})
