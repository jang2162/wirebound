// @vitest-environment jsdom
/**
 * 저장소 빌드가 낸 `theme.js` 를 공유 런타임으로 싣고 뷰가 제 DOM 을 내는지 본다 — 까닭 · 꼴은 `system-themes/portal/build-test/bundle-views.test.tsx`
 * 머리말. 조각 칸은 기본 뷰에 없는 `data-wb-part` 다 — `null` 이면 기본 뷰로 서는 곁의 variant 라 태그 · 구조만 본다.
 *
 * 관리자 화면은 뷰를 내지 않는다 — 아래 칸은 번들을 실은 판에서 SDK 기본 뷰가 props 로 내는 조각(`checkbox` · `skeleton` · `filler`)을 본다.
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

const FILE = join(process.cwd(), 'system-themes/admin/dist', `${MANIFEST.id}-${MANIFEST.version}.wbtheme`)
let theme: ThemeDefinition
let uninstall: () => void

beforeAll(() => {
  installCatalog()
  execFileSync('pnpm', ['--filter', '@wirebound/system-theme-admin...', 'build'], { cwd: process.cwd(), stdio: 'pipe' })
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
    ['List', undefined, { selectable: true }, 'TABLE', 'table', 'checkbox'],
    ['List', 'compact', { loading: true }, 'TABLE', 'table', 'skeleton'],
    ['List', 'featured', { selectable: true }, 'TABLE', 'table', 'checkbox'],
    ['KeyValue', undefined, { pairs: [{ key: '이름', value: '홍' }, { key: '나이', value: '3' }, { key: '등급', value: 'VIP' }], columns: 2 }, 'TABLE', 'table', 'filler'],
  ] as const)('%s:%s %j → <%s data-wb-structure="%s"> · 조각 %s', (type, variant, props, tag, structure, part) => {
    const root = draw({ id: 'n', type, ...(variant === undefined ? {} : { variant }), props } as WbNode)
    expect(root.tagName).toBe(tag)
    expect(root.getAttribute('data-wb-structure')).toBe(structure)
    if (part !== null) expect(root.querySelector(`[data-wb-part="${part}"]`)).not.toBeNull()
  })
})

/**
 * 번들의 테마 뷰도 prop 표지 · 상태의 접근성 속성을 싣는다 — 표지는 공유 런타임의 SDK(`view` · `Root`)가 펴므로 `theme.js` 를 다시 짓지 않아도
 * 호스트 SDK 판을 따른다. 테마 CSS 가 이 표지를 겨냥한다.
 */
describe('번들의 뷰 — prop 표지 · 접근성 속성', () => {
  it.each([
    ['Section', undefined, { compact: true }, 'data-wb-compact', ''],
    ['SearchForm', undefined, { collapsed: true }, 'data-wb-collapsed', ''],
    ['Field', undefined, { invalid: true, required: true }, 'aria-invalid', 'true'],
  ] as const)('%s:%s %j → %s="%s"', (type, variant, props, attr, value) => {
    const root = draw({ id: 'n', type, ...(variant === undefined ? {} : { variant }), props } as WbNode)
    expect(root.getAttribute(attr)).toBe(value)
  })
})
