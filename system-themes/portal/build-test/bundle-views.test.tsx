// @vitest-environment jsdom
/**
 * 저장소 빌드가 낸 `theme.js` 를 공유 런타임으로 싣고 뷰가 옛 구조의 DOM 을 내는지 본다. 소스 케이스(`test/views.test.tsx`)는
 * SDK 를 모듈로 가져오고, 번들은 그 import 가 `__wirebound_runtime__` 의 속성으로 바뀌어 있다 — 곁의 variant 가 부르는 기본 뷰
 * (`src/views/default-view.ts`)를 모듈을 싣는 순간 읽으므로, 런타임이 늦게 서거나 이름이 어긋나면 이 판에서만 드러난다.
 *
 * `checkTheme`(`wbtheme.test.ts`)는 오류가 없는지만 본다 — 번들의 뷰가 기본 뷰로 대신 그려져도 오류는 0 이다.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type WbNode } from '@wirebound/schema'
import { ThemeProvider, type ThemeDefinition } from '@wirebound/theme-sdk'
import { installRuntime } from '@wirebound/theme-sdk/runtime'
import { renderDocument } from '@wirebound/renderer'
import { readWbtheme } from '@wirebound/themes'
import { MANIFEST } from '../src/manifest'

const FILE = join(process.cwd(), 'system-themes/portal/dist', `${MANIFEST.id}-${MANIFEST.version}.wbtheme`)
let theme: ThemeDefinition
let uninstall: () => void

beforeAll(() => {
  installCatalog()
  execFileSync('pnpm', ['--filter', '@wirebound/system-theme-portal...', 'build'], { cwd: process.cwd(), stdio: 'pipe' })
  const { files } = readWbtheme(new Uint8Array(readFileSync(FILE)))
  const runtime = installRuntime(globalThis)
  uninstall = runtime.uninstall
  new Function(files!.themeJs)()
  const definition = runtime.take()
  if (definition === null) throw new Error('theme.js 가 테마를 등록하지 않았다')
  theme = { ...definition, manifest: files!.manifest }
}, 300_000)
afterAll(() => uninstall())
afterEach(() => cleanup())

function draw(node: WbNode): Element {
  const doc = { version: 1, root: { id: 'page', type: 'Page', props: {}, children: [node] } } as never
  const { container } = render(<ThemeProvider value={{ tokens: {}, window }}>{renderDocument(doc, { theme })}</ThemeProvider>)
  expect(container.querySelector('[data-wb-error]')).toBeNull()
  return container.querySelector(`[data-wb-id="${node.id}"]`)!
}

describe('번들의 뷰(공유 런타임)', () => {
  it.each([
    ['List', undefined, 'UL', 'stackedList'],
    ['List', 'table', 'TABLE', 'table'],
    ['Tree', undefined, 'UL', 'accordion'],
    ['Tree', 'indent', 'UL', 'indent'],
    ['KeyValue', undefined, 'DL', 'definitionList'],
    ['KeyValue', 'table', 'TABLE', 'table'],
    ['SearchForm', undefined, 'FORM', 'collapsible'],
    ['SearchForm', 'inline', 'FORM', 'inline'],
    ['EntryForm', undefined, 'FORM', 'sectioned'],
    ['EntryForm', 'labelLeft', 'FORM', 'labelLeft'],
  ] as const)('%s:%s → <%s data-wb-structure="%s">', (type, variant, tag, structure) => {
    const root = draw({ id: 'n', type, ...(variant === undefined ? {} : { variant }), props: {} } as WbNode)
    expect(root.tagName).toBe(tag)
    expect(root.getAttribute('data-wb-structure')).toBe(structure)
  })
})
