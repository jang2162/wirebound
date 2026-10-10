import { installCatalog } from '@wirebound/schema'
import type { ThemeDefinition, View } from '@wirebound/theme-sdk'
import { NO_THEME } from '../src/no-theme'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderDocument } from '../src/render'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const DOC = { version: 1, root: { id: 'root', type: 'Page', children: [{ id: 'n_t00000001', type: 'Text', props: { content: '글' } }] } } as never
const noop = (() => null) as unknown as View

function themeWith(views: Record<string, View>): ThemeDefinition {
  return { manifest: NO_THEME.manifest, views }
}

describe('호스트 런타임의 뷰 키 경고(L-258)', () => {
  it('렌더러가 안 읽는 뷰 키(StateSwitch · 카탈로그에 없는 타입)를 한 번 알린다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const theme = themeWith({ Text: noop, StateSwitch: noop, Nope: noop })
    renderToStaticMarkup(renderDocument(DOC, { theme }))
    const lines = warn.mock.calls.map((call) => String(call[0]))
    expect(lines.filter((line) => line.includes('views.StateSwitch'))).toHaveLength(1)
    expect(lines.filter((line) => line.includes('views.Nope'))).toHaveLength(1)
    expect(lines.filter((line) => line.includes('views.Text'))).toEqual([])
  })

  it('같은 정의를 다시 그려도 다시 알리지 않는다 · 서버 manifest 를 끼운 사본도 한 번이다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const theme = themeWith({ StateSwitch: noop })
    renderToStaticMarkup(renderDocument(DOC, { theme }))
    renderToStaticMarkup(renderDocument(DOC, { theme }))
    renderToStaticMarkup(renderDocument(DOC, { theme: { ...theme, manifest: { ...theme.manifest } } }))
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('쓰이는 키만 있으면 알리지 않는다 · 테마가 없어도 알리지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderToStaticMarkup(renderDocument(DOC, { theme: themeWith({ Text: noop, Card: noop }) }))
    renderToStaticMarkup(renderDocument(DOC))
    expect(warn).not.toHaveBeenCalled()
  })
})
