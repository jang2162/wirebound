/**
 * `checkTheme` — `.wbtheme` 를 공유 런타임으로 싣고 갤러리 칸(카탈로그 × 선언한 variant × 표본)을 하나씩 그려 오류를 모은다.
 *
 * **이 파일은 DOM 없는 환경(unit 프로젝트 · node)에서 돈다** — `wb-theme check` 가 도는 판과 같다. `checkTheme` 가 jsdom 창을 스스로 세우고
 * 끝나면 걷는지까지 본다. 번들(`themeJs`)은 손으로 쓴다 — `wb-theme build` 가 짓는 것과 같이 전역 런타임의 SDK · react 로 등록한다.
 */
import { describe, expect, it } from 'vitest'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import type { WbthemeFiles } from '@wirebound/themes'
import { checkTheme } from '@wirebound/theme-kit'
import { galleryItems } from '@wirebound/theme-gallery'
import { DEFAULT_VIEWS } from '@wirebound/theme-sdk'

const BASE: ThemeManifest = { id: 'probe', name: '탐침', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }

/** 전역 런타임으로 등록하는 번들. `views` 는 런타임의 `rt`(sdk · react · jsxRuntime)를 받는 식의 원문이다. */
function bundle(manifest: ThemeManifest, views = '{}'): string {
  return `(() => {
    const rt = globalThis.__wirebound_runtime__
    const { defineTheme, DEFAULT_VIEWS, Root, useToken } = rt.sdk
    const h = rt.react.createElement
    rt.register(defineTheme({ manifest: ${JSON.stringify(manifest)}, views: { ...DEFAULT_VIEWS, ...(${views}) } }))
  })()`
}

function files(manifest: ThemeManifest, opts: { views?: string; themeJs?: string; themeCss?: string | null } = {}): WbthemeFiles {
  return { manifest, themeJs: opts.themeJs ?? bundle(manifest, opts.views), themeCss: opts.themeCss ?? null, assets: new Map() }
}

describe('checkTheme', () => {
  it('기본 뷰 테마는 오류 0 — 갤러리 칸 전부를 그렸다 · 끝나면 DOM 전역을 걷는다', async () => {
    expect(typeof document).toBe('undefined')
    const report = await checkTheme(files(BASE))
    expect(report.errors).toEqual([])
    expect(report.items).toBe(galleryItems({ manifest: BASE, views: DEFAULT_VIEWS }).length)
    expect(report.items).toBeGreaterThan(0)
    expect(report.unusedTokens).toEqual([])
    expect(report.undeclaredVariantsUsedByPatterns).toEqual([])
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
  })

  it('던지는 뷰는 그 컴포넌트의 칸마다 폴백 오류로 선다 — 다른 컴포넌트는 깨끗하다', async () => {
    const manifest: ThemeManifest = {
      ...BASE,
      components: { Button: { variants: [{ id: 'primary', label: '주' }, { id: 'ghost', label: '투명' }], defaultVariant: 'primary' } },
    }
    const report = await checkTheme(files(manifest, { views: `{ Button: () => { throw new Error('단추가 터졌다') } }` }))
    const fallbacks = report.errors.filter((error) => error.source === 'fallback')
    const buttonItems = galleryItems({ manifest, views: DEFAULT_VIEWS }).filter((item) => item.type === 'Button')
    expect(fallbacks.map((error) => `${error.type}/${error.variant}/${error.label}`).sort()).toEqual(
      buttonItems.map((item) => `Button/${item.variant}/${item.sample.label}`).sort(),
    )
    expect(fallbacks.every((error) => error.message.includes('단추가 터졌다'))).toBe(true)
    expect(new Set(report.errors.map((error) => error.type))).toEqual(new Set(['Button']))
  })

  it('Root 를 안 그리는 뷰는 콘솔 오류로 선다', async () => {
    const report = await checkTheme(files(BASE, { views: `{ Card: () => h('div', null, '뿌리 없음') }` }))
    expect(report.errors.length).toBeGreaterThan(0)
    expect(report.errors.every((error) => error.type === 'Card' && error.source === 'console')).toBe(true)
    expect(report.errors[0]!.message).toContain('Root 를 그리지 않아')
  })

  it('번들이 등록하지 않으면 오류 하나로 끝난다', async () => {
    const report = await checkTheme(files(BASE, { themeJs: ';' }))
    expect(report.items).toBe(0)
    expect(report.errors).toEqual([expect.objectContaining({ type: '', source: 'bundle', message: expect.stringContaining('등록하지 않았습니다') })])
  })

  it('패턴이 선언 안 한 variant 를 쓰면 센다 — 선언한 것은 안 센다', async () => {
    const manifest: ThemeManifest = {
      ...BASE,
      components: { Button: { variants: [{ id: 'primary', label: '주' }], defaultVariant: 'primary' } },
      patterns: {
        'hero.split': {
          name: '나눈 히어로',
          schema: { type: 'Section', variant: 'wide', children: [{ type: 'Button', props: { label: '가' }, variant: 'primary' }, { type: 'Button', props: { label: '나' }, variant: 'huge' }] },
        },
      },
    }
    const report = await checkTheme(files(manifest))
    expect(report.undeclaredVariantsUsedByPatterns).toEqual([
      { pattern: 'hero.split', path: 'schema', type: 'Section', variant: 'wide' },
      { pattern: 'hero.split', path: 'schema.children.1', type: 'Button', variant: 'huge' },
    ])
  })

  it('CSS · 뷰 어디서도 안 쓰는 토큰을 센다 — :root 의 정의는 쓰임이 아니고, 쓰는 토큰의 기본값이 가리키는 토큰은 쓰임이다', async () => {
    const manifest: ThemeManifest = {
      ...BASE,
      tokens: {
        items: {
          'color.css': { type: 'color', label: '시트', default: '#111111' },
          'color.view': { type: 'color', label: '뷰', default: '#222222' },
          'color.alias': { type: 'color', label: '별칭', default: 'var(--wb-color-base)' },
          'color.base': { type: 'color', label: '바탕', default: '#333333' },
          'color.unused': { type: 'color', label: '안 씀', default: '#444444' },
          'color.css-prefix': { type: 'color', label: '이름이 겹침', default: '#555555' },
          // 안 쓰는 토큰의 기본값만 가리키는 토큰 — 번들에 실린 manifest 의 기본값 글자는 쓰임이 아니다.
          'color.lonely': { type: 'color', label: '외톨이', default: 'var(--wb-color-lonely-base)' },
          'color.lonely-base': { type: 'color', label: '외톨이 바탕', default: '#666666' },
        },
      },
    }
    const report = await checkTheme(
      files(manifest, {
        themeCss: ':root{--wb-color-unused:#444444;--wb-color-css-prefix:#555555}\n.a{color:var(--wb-color-css);border-color:var( --wb-color-alias )}',
        views: `{ Text: (props) => h(Root, null, String(useToken('color.view'))) }`,
      }),
    )
    expect(report.unusedTokens).toEqual(['color.unused', 'color.css-prefix', 'color.lonely', 'color.lonely-base'])
  })
})
