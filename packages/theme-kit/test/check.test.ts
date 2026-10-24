/**
 * `checkTheme` — `.wbtheme` 를 공유 런타임으로 싣고 갤러리 칸(카탈로그 × 선언한 variant × 표본)을 하나씩 그려 오류를 모은다.
 *
 * **이 파일은 DOM 없는 환경(unit 프로젝트 · node)에서 돈다** — `wb-theme check` 가 도는 판과 같다. `checkTheme` 가 jsdom 창을 스스로 세우고
 * 끝나면 걷는지까지 본다. 번들(`themeJs`)은 손으로 쓴다 — `wb-theme build` 가 짓는 것과 같이 전역 런타임의 SDK · react 로 등록한다.
 */
import { describe, expect, it } from 'vitest'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import type { WbthemeFiles } from '@wirebound/themes'
import { checkTheme, formatCheckReport } from '@wirebound/theme-kit'
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
    expect(report.focusables).toEqual([])
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
  })

  it('내용이 든 구역을 안 그리는 뷰는 구역 오류로 선다 — Zone 을 쓰는 뷰는 깨끗하다', async () => {
    const without = await checkTheme(files(BASE, { views: `{ Card: ({ children }) => h(Root, null, children) }` }))
    const zone = without.errors.filter((error) => error.source === 'zone')
    expect(zone.map((error) => `${error.type}/${error.label}`)).toEqual([
      'Card/Card — 제목 옆 · 머리 오른쪽 · 바닥',
      'Card/Card — 제목 옆 · 머리 오른쪽 · 바닥',
      'Card/Card — 제목 옆 · 머리 오른쪽 · 바닥',
    ])
    expect(zone.map((error) => error.message)).toEqual(
      ['titleSide', 'headEnd', 'footer'].map(
        (name) => `Card 뷰가 내용이 든 구역 ${name} 을 그리지 않았습니다 — SDK 의 Zone 으로 둡니다(노드 card3)`,
      ),
    )
    expect(formatCheckReport(without).ok).toBe(false)
    const withZone = await checkTheme(
      files(BASE, {
        views: `{ Card: rt.sdk.view(({ children }) => h(Root, null, children, ['titleSide', 'headEnd', 'footer'].map((name) => h(rt.sdk.Zone, { key: name, name })))) }`,
      }),
    )
    expect(withZone.errors).toEqual([])
  })

  it('던지는 뷰는 그 컴포넌트의 칸마다 폴백 오류로 선다 — 다른 컴포넌트는 깨끗하다', async () => {
    const manifest: ThemeManifest = {
      ...BASE,
      components: {
        Link: {
          variants: [
            { id: 'primary', label: '주' },
            { id: 'ghost', label: '투명' },
          ],
          defaultVariant: 'primary',
        },
      },
    }
    const report = await checkTheme(files(manifest, { views: `{ Link: () => { throw new Error('링크가 터졌다') } }` }))
    const fallbacks = report.errors.filter((error) => error.source === 'fallback')
    const linkItems = galleryItems({ manifest, views: DEFAULT_VIEWS }).filter((item) => item.type === 'Link')
    expect(fallbacks.map((error) => `${error.type}/${error.variant}/${error.label}`).sort()).toEqual(
      linkItems.map((item) => `Link/${item.variant}/${item.sample.label}`).sort(),
    )
    expect(fallbacks.every((error) => error.message.includes('링크가 터졌다'))).toBe(true)
    expect(new Set(report.errors.map((error) => error.type))).toEqual(new Set(['Link']))
  })

  /**
   * 포커스 받는 요소 경고(L-046) — 에디터는 캔버스에서 단추 · 링크가 아닌 포커스 받은 요소를 입력 표면으로 보고 단축키 · 노드 복사를 안 받는다.
   * 기본 뷰 테마는 0 이고(첫 케이스의 `focusables`), `tabindex` · `summary` · `controls` 를 켠 `video` 를 그리는 뷰는 그 컴포넌트의 칸에 선다 — 경고라 `ok` 는 그대로다.
   */
  it('포커스 받는 요소는 경고로 선다 — tabindex · summary · controls 영상, 단추 · 링크 · 입력 칸은 아니다 · 종료 코드에 안 든다', async () => {
    const views = `{
      Placeholder: ({ props }) => h(Root, { style: rt.sdk.placeholderVars(props) }, h('div', { tabIndex: 0 }, '자리'), h('div', { tabIndex: -1 }, '눌러서 포커스'), h('div', { tabIndex: 'abc' }, '무효'), h('button', { type: 'button', tabIndex: 0 }, '단추'), h('a', { href: '#x', tabIndex: 0 }, '링크'), h('input', { 'aria-label': '칸', tabIndex: 0 })),
      Text: () => h(Root, null, h('details', null, h('summary', null, '접기'))),
      Media: () => h(Root, null, h('video', { controls: true }), h('audio', null)),
    }`
    const report = await checkTheme(files(BASE, { views }))
    expect(report.errors).toEqual([])
    const byType = new Map<string, Set<string>>()
    for (const found of report.focusables) byType.set(found.type, (byType.get(found.type) ?? new Set()).add(found.element))
    // 부모 컴포넌트의 칸(탭 · 목록 …)은 자식으로 이 뷰들을 품어 같은 요소가 거기서도 선다 — 뷰를 짠 세 타입의 칸만 본다.
    const own = Object.fromEntries(['Placeholder', 'Text', 'Media'].map((type) => [type, [...(byType.get(type) ?? [])].sort()]))
    expect(own).toEqual({
      Placeholder: ['<div tabindex="-1">', '<div tabindex="0">'],
      Text: ['<summary>'],
      Media: ['<video controls>'],
    })
    const { ok, lines } = formatCheckReport(report)
    expect(ok).toBe(true)
    expect(
      lines
        .filter((line) => line.startsWith('⚠'))
        .some((line) => line.includes('Placeholder') && line.includes('<div tabindex="0">') && line.includes('칸)')),
    ).toBe(true)
    expect(lines.at(-1)).toBe('✓ 오류 없음')
  })

  /**
   * 정한 그리기 값을 버리는 자리표시자 뷰 — 표본(`PLACEHOLDER_SET_PROPS`)의 값 여덟이 뿌리 변수로 안 서면 칸마다 오류다. `placeholderVars` 를 싣는
   * 뷰는 깨끗하다. 계산된 색(테마 CSS 가 변수를 덮는 판)은 jsdom 이 못 재 `wb-theme shots` 가 잰다(`../build-test/shots.test.ts`).
   */
  it('정한 그리기 값을 안 싣는 자리표시자 뷰는 오류로 선다 — placeholderVars 를 싣는 뷰는 깨끗하다', async () => {
    const dropping = await checkTheme(files(BASE, { views: `{ Placeholder: ({ props }) => h(Root, null, String(props.label)) }` }))
    const errors = dropping.errors.filter((error) => error.source === 'placeholder')
    expect(errors.map((error) => error.message.split(' 가 ')[0]!.split('— ')[1])).toEqual([
      '--wb-node-placeholder-width',
      '--wb-node-placeholder-height',
      '--wb-node-placeholder-radius',
      '--wb-node-placeholder-font-size',
      '--wb-node-placeholder-padding',
      '--wb-node-placeholder-background',
      '--wb-node-placeholder-border-color',
      '--wb-node-placeholder-color',
    ])
    expect(new Set(errors.map((error) => error.label))).toEqual(new Set(['Placeholder — 정한 색 · 모서리 · 여백']))
    expect(dropping.errors.filter((error) => error.source !== 'placeholder')).toEqual([])
    expect(formatCheckReport(dropping).ok).toBe(false)
    // 값 하나만 틀리게 싣는 뷰도 그 하나로 선다.
    const wrong = await checkTheme(
      files(BASE, {
        views: `{ Placeholder: ({ props }) => h(Root, { style: { ...rt.sdk.placeholderVars(props), '--wb-node-placeholder-background': '#000000' } }, String(props.label)) }`,
      }),
    )
    expect(wrong.errors.map((error) => error.message)).toEqual([
      'Placeholder 뷰가 정한 값을 뿌리에 싣지 않았습니다 — --wb-node-placeholder-background 가 #fde047 가 아니라 #000000 입니다. placeholderVars(props) 를 Root 의 style 로 둡니다',
    ])
    const keeping = await checkTheme(
      files(BASE, { views: `{ Placeholder: ({ props }) => h(Root, { style: rt.sdk.placeholderVars(props) }, String(props.label)) }` }),
    )
    expect(keeping.errors).toEqual([])
  })

  it('폼 표 칸의 Field 의 두 조각을 감싸는 Field 뷰는 오류로 선다 — 폼 표 밖의 필드 표본(열을 정한 조회 폼도)은 안 걸린다', async () => {
    const wrapped = await checkTheme(
      files(BASE, {
        views: `{ Field: ({ props, children }) => h(Root, null, h('div', null, h('label', { 'data-wb-part': 'label' }, String(props.label)), h('div', { 'data-wb-part': 'value' }, children))) }`,
      }),
    )
    const pairs = wrapped.errors.filter((error) => error.source === 'pairs')
    expect([...new Set(pairs.map((error) => `${error.type} · ${error.label}`))].sort()).toEqual([
      'EntryForm · EntryForm — 제목 · 폼 표',
      'FormTable · FormTable — 1쌍 다섯 줄',
      'FormTable · FormTable — 2열 · 전폭 · 빈 쌍',
      'FormTable · FormTable — 옆 칸(사진)',
      'FormTable · FormTable — 제목 · 머리 오른쪽',
    ])
    expect(pairs[0]!.message).toContain('label · value 조각을 뿌리의 직계로 안 그렸습니다')
    expect(wrapped.errors.filter((error) => error.source !== 'pairs')).toEqual([])
  })

  it('빈 쌍을 안 그리는 폼 표 뷰는 오류로 선다 — 빈 쌍이 서는 표본만', async () => {
    const report = await checkTheme(files(BASE, { views: `{ FormTable: ({ children }) => h(Root, null, children) }` }))
    const pairs = report.errors.filter((error) => error.source === 'pairs')
    expect(pairs.map((error) => [error.label, error.message])).toEqual([
      [
        'FormTable — 2열 · 전폭 · 빈 쌍',
        'FormTable 뷰가 빈 쌍(filler 조각)을 2 개가 아니라 0 개 그렸습니다 — pairRows(items, columns) 차례로 그립니다(노드 ft2)',
      ],
    ])
  })

  it('Root 를 안 그리는 뷰는 콘솔 오류로 선다', async () => {
    const report = await checkTheme(files(BASE, { views: `{ Card: () => h('div', null, '뿌리 없음') }` }))
    expect(report.errors.length).toBeGreaterThan(0)
    expect(report.errors.every((error) => error.type === 'Card' && error.source === 'console')).toBe(true)
    expect(report.errors[0]!.message).toContain('Root 를 그리지 않아')
  })

  it('걷은 상태 영역(StateSwitch)의 뷰 키는 카탈로그 밖 키로 선다 — 문장도 그 키를 말한다', async () => {
    const report = await checkTheme(files(BASE, { views: `{ StateSwitch: () => h('div', null, '무시된다') }` }))
    expect(report.errors.map((error) => [error.type, error.source, error.message])).toEqual([
      ['StateSwitch', 'bundle', expect.stringContaining('카탈로그에 없는')],
    ])
    expect(report.items).toBeGreaterThan(0)
    expect(formatCheckReport(report).lines).toContain(
      '✗ [bundle] 번들: views.StateSwitch 는 카탈로그에 없는 타입의 뷰입니다 — 쓰이지 않습니다',
    )
  })

  it('카탈로그에 없는 타입의 뷰 키는 오류로 선다 — 있는 타입의 뷰 키는 깨끗하다', async () => {
    const report = await checkTheme(files(BASE, { views: `{ Ghost: () => h('div', null, '없는 타입') }` }))
    expect(report.errors.map((error) => [error.type, error.source, error.message])).toEqual([
      ['Ghost', 'bundle', expect.stringContaining('카탈로그에 없는')],
    ])
    // 기본 뷰 테마(`views` 가 `DEFAULT_VIEWS` 전부)는 위 첫 케이스가 오류 0 으로 잰다.
  })

  it('번들이 등록하지 않으면 오류 하나로 끝난다', async () => {
    const report = await checkTheme(files(BASE, { themeJs: ';' }))
    expect(report.items).toBe(0)
    expect(report.errors).toEqual([
      expect.objectContaining({ type: '', source: 'bundle', message: expect.stringContaining('등록하지 않았습니다') }),
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
        themeCss:
          ':root{--wb-color-unused:#444444;--wb-color-css-prefix:#555555}\n.a{color:var(--wb-color-css);border-color:var( --wb-color-alias )}',
        views: `{ Text: (props) => h(Root, null, String(useToken('color.view'))) }`,
      }),
    )
    expect(report.unusedTokens).toEqual(['color.unused', 'color.css-prefix', 'color.lonely', 'color.lonely-base'])
  })
})
