/**
 * **토큰 GUI(② W1).** ①이 자리를 만들었고 W1이 채웠다.
 *
 * 셋이 병렬로 일하므로 **각자 자기 케이스 파일에만 쓴다.** `test/routes/theme-editor.test.tsx`는
 * 라우트·권한·저장의 케이스 파일이고 ②가 열면 셋이 같은 파일에서 부딪힌다 — ①의 P5가
 * 그 충돌을 회귀가 못 잡는다는 것을 밟아서 확인했다.
 *
 * ---
 *
 * **이 파일에서 값이 두 번 나오는 케이스 둘이 요점이다**(`§어휘`). 화면이 든 상수를
 * **엔진에서 다시 재서** 대조한다 — 브리프의 *"이름공간 드롭다운을 하드코딩하지 마라"*를
 * 지키는 방법이 `apps/web`에서는 그것뿐이기 때문이다(상수를 `themes`에 새로 내보내는 것은
 * 이 슬라이스의 범위 밖이다). **엔진이 하나라도 더 받거나 덜 받으면 그 케이스가 죽는다.**
 */
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  STYLE_PRIMITIVE_NAMESPACES,
  STYLE_PROPERTIES,
  TOKEN_NAMESPACES,
  resolveTokens,
  styleDeclarations,
  systemTheme,
  type Theme,
} from '@wirebound/themes'
import {
  SEMANTIC_NAMESPACES,
  TYPOGRAPHY_TEXT_KEYS,
  TokenEditor,
  effectiveTokens,
} from '../../src/theme/token-editor'
import { ThemeDraftStore } from '../../src/store/theme-draft-store'
import { ThemeDraftProvider } from '../../src/store/use-theme-draft'

function theme(tokens: Theme['tokens'], extra: Partial<Theme> = {}): Theme {
  return { meta: { id: 'brand', name: '브랜드', version: '1.0.0' }, tokens, ...extra }
}

function mount(
  document: Theme,
  options: { base?: Theme; locked?: boolean } = {},
): { store: ThemeDraftStore; view: ReturnType<typeof render> } {
  const store = new ThemeDraftStore()
  store.loadTheme('t1', document, { base: options.base ?? null })
  const view = render(
    <ThemeDraftProvider store={store}>
      <TokenEditor locked={options.locked ?? false} />
    </ThemeDraftProvider>,
  )
  return { store, view }
}

/** 값 입력 하나. **접근성 이름이 이슈의 `path`와 글자까지 같다**(그것이 계약이다). */
function field(view: ReturnType<typeof render>, path: string): HTMLInputElement {
  return view.getByLabelText(path) as HTMLInputElement
}

function rowOf(view: ReturnType<typeof render>, path: string): HTMLElement {
  const row = field(view, path).closest('.wb-shell-token-row')
  expect(row).not.toBeNull()
  return row as HTMLElement
}

describe('TokenEditor', () => {
  it('초안 스토어 문맥 안에서 그려진다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', { meta: { id: 'brand', name: '브랜드', version: '1.0.0' } })

    const view = render(
      <ThemeDraftProvider store={store}>
        <TokenEditor locked={false} />
      </ThemeDraftProvider>,
    )

    expect(view.container).toBeTruthy()
  })

  /* ── 어휘 — 화면이 든 상수를 엔진에서 다시 잰다 ─────────────────────────────── */

  it('SEMANTIC_NAMESPACES가 semantic 값이 실제로 받는 이름공간과 같다', () => {
    // 이름공간마다 **가리킬 대상이 실재하는** 문서를 만들어 `semantic.probe`가 그 값으로
    // 풀리는지 본다. 풀리면 참조로 받은 것이고, 아니면(그대로 남거나 이슈가 나면) 아니다.
    const name: Record<string, string> = {
      palette: 'x',
      semantic: 'target',
      space: '6',
      radius: 'r',
      shadow: 's',
      typography: 'h1.fontSize',
      motion: 'm',
      container: 'maxWidth',
      grid: 'gap',
      section: 'paddingY',
    }
    const accepted: string[] = []

    for (const namespace of [...TOKEN_NAMESPACES, ...STYLE_PRIMITIVE_NAMESPACES]) {
      const { table } = resolveTokens({
        palette: { x: '#111111' },
        semantic: { target: '#222222', probe: `${namespace}.${name[namespace]}` },
        scale: {
          space: { unit: '4px' },
          radius: { r: '2px' },
          shadow: { s: '0 0 0 #000' },
          motion: { m: '1ms' },
          typography: { h1: { fontSize: '10px' } },
        },
      })
      const resolved = table.get('semantic.probe')
      // 참조로 받았다면 값이 **가리킨 대상의 리터럴**이 되어 있다. 안 받았으면 적은 글자가
      // 그대로 남거나(리터럴로 실린다) 이슈가 나서 표에 없다.
      if (resolved !== undefined && resolved !== `${namespace}.${name[namespace]}`) {
        accepted.push(namespace)
      }
    }

    expect(accepted).toEqual([...SEMANTIC_NAMESPACES])
    // 브리프의 표(스타일 값 = 열)와 **다른 자리**라는 것이 이 단언의 뜻이다.
    expect(accepted).toHaveLength(2)
    expect(TOKEN_NAMESPACES).toHaveLength(7)
  })

  it('TYPOGRAPHY_TEXT_KEYS가 `typography:` 참조가 펼치는 키와 같다', () => {
    const expands: string[] = []

    for (const key of Object.keys(STYLE_PROPERTIES)) {
      const { table } = resolveTokens({ scale: { typography: { probe: { [key]: '10px' } } } })
      const { css } = styleDeclarations('typography', 'probe', table)
      if (css.length > 0) expands.push(key)
    }

    expect(expands.sort()).toEqual([...TYPOGRAPHY_TEXT_KEYS].sort())
  })

  /* ── D7 — 3단을 그대로 보인다 ──────────────────────────────────────────────── */

  it('세 층을 각각의 상자로 보이고 층마다 무엇을 받는지 적는다', () => {
    const { view } = mount(theme({ palette: { 'blue.600': '#2563eb' } }))

    const palette = view.getByLabelText('palette — 원시값')
    const semantic = view.getByLabelText('semantic — 의미')
    const scale = view.getByLabelText('scale — 치수·타이포·모션')

    // **`palette`를 스타일이 직접 가리킬 수 없다는 것이 화면에 있다**(D7).
    expect(palette.textContent).toContain('스타일은 palette를 직접 가리킬 수 없')
    expect(semantic.textContent).toContain('palette·semantic 참조 또는 리터럴')
    expect(scale.textContent).toContain('리터럴만')
  })

  it('가리키는 semantic이 없는 palette 항목은 스타일에서 쓸 수 없다고 말한다', () => {
    const { view } = mount(
      theme({
        palette: { 'blue.600': '#2563eb', 'gray.50': '#f9fafb' },
        semantic: { primary: 'palette.blue.600' },
      }),
    )

    expect(rowOf(view, 'tokens.palette.blue.600').textContent).toContain('semantic 1')
    expect(rowOf(view, 'tokens.palette.gray.50').textContent).toContain(
      'semantic 0 — 스타일에서 쓸 수 없습니다',
    )
  })

  it('semantic의 이름공간 드롭다운이 둘뿐이다', () => {
    // **semantic이 둘이어야 그 이름공간이 목록에 나온다** — 자기 자신은 빼므로(1칸 순환)
    // 항목이 하나뿐인 문서에서는 고를 대상이 없다. *"없는 이름을 제안하지 않는다"*가 그 규칙이다.
    const { view } = mount(
      theme({
        palette: { 'blue.600': '#2563eb' },
        semantic: { primary: 'palette.blue.600', primaryHover: 'semantic.primary' },
      }),
    )

    const select = view.getByLabelText('tokens.semantic.primary 이름공간') as HTMLSelectElement
    const options = [...select.options].map((option) => option.value)
    // 빈 값은 *"리터럴"*이다 — 이름공간이 아니다.
    expect(options.filter((value) => value !== '')).toEqual([...SEMANTIC_NAMESPACES])
  })

  it('이름공간에서 고르면 그 이름공간의 첫 토큰을 가리킨다', () => {
    const { store, view } = mount(
      theme({ palette: { 'blue.600': '#2563eb' }, semantic: { primary: '#ff00ff' } }),
    )

    fireEvent.change(view.getByLabelText('tokens.semantic.primary 이름공간'), {
      target: { value: 'palette' },
    })

    expect(store.getState().draft?.tokens?.semantic?.['primary']).toBe('palette.blue.600')
  })

  /* ── 재라 #4 — 텍스트 입력이 진실이다 ─────────────────────────────────────── */

  it('참조 값은 텍스트 입력에 그대로 있고 컬러 피커가 나오지 않는다', () => {
    const { view } = mount(
      theme({ palette: { 'blue.600': '#2563eb' }, semantic: { primary: 'palette.blue.600' } }),
    )

    // **`<input type="color">`가 진실이면 이 값이 `#000000`이 된다**(머리말의 실측 1).
    expect(field(view, 'tokens.semantic.primary').value).toBe('palette.blue.600')
    expect(view.queryByLabelText('tokens.semantic.primary 색 고르기')).toBeNull()
  })

  it('담을 수 있는 값일 때만 컬러 피커가 나온다', () => {
    const { view } = mount(
      theme({
        palette: { hex6: '#2563EB', short: '#abc', soft: 'rgba(0,0,0,.5)' },
      }),
    )

    const picker = view.getByLabelText('tokens.palette.hex6 색 고르기') as HTMLInputElement
    // 피커는 소문자만 담는다(실측 5). **문서의 값은 대문자 그대로다** — 그것이 텍스트 입력이
    // 진실이라는 뜻이고, 피커를 안 만지는 한 저장 버튼이 켜지지 않는다.
    expect(picker.value).toBe('#2563eb')
    expect(field(view, 'tokens.palette.hex6').value).toBe('#2563EB')

    // 3자리 hex와 `rgba()`는 피커가 담지 못한다(실측 2·3).
    expect(view.queryByLabelText('tokens.palette.short 색 고르기')).toBeNull()
    expect(view.queryByLabelText('tokens.palette.soft 색 고르기')).toBeNull()
  })

  it('색 견본은 엔진이 푼 값을 그린다 — 참조 글자가 아니라', () => {
    const { view } = mount(
      theme({ palette: { 'blue.600': '#2563eb' }, semantic: { primary: 'palette.blue.600' } }),
    )

    const swatch = rowOf(view, 'tokens.semantic.primary').querySelector('.wb-shell-token-swatch')
    expect((swatch as HTMLElement).style.background).toBe('rgb(37, 99, 235)')
  })

  /* ── 엔진이 침묵하는 자리 ─────────────────────────────────────────────────── */

  it('참조처럼 생긴 리터럴을 화면이 말한다 — 엔진은 이 층에서 아무 말도 안 한다', () => {
    // **원인 문장을 먼저 심어 관측한다.** 이 층에는 `suspicious-literal`이 없다.
    const { issues, table } = resolveTokens({ semantic: { primary: 'spce.4' } })
    expect(issues).toEqual([])
    expect(table.get('semantic.primary')).toBe('spce.4')

    const { view } = mount(theme({ semantic: { primary: 'spce.4', literal: 'rgba(0,0,0,.5)' } }))

    expect(rowOf(view, 'tokens.semantic.primary').textContent).toContain(
      '참조처럼 보이지만 리터럴로 실립니다',
    )
    // **멀쩡한 CSS 리터럴에는 안 붙는다** — 붙으면 소음이 된다.
    expect(rowOf(view, 'tokens.semantic.literal').textContent).not.toContain('참조처럼 보이지만')
  })

  /* ── 쓰기 — putSection 하나 ───────────────────────────────────────────────── */

  it('값을 고치면 tokens 절만 갈린다', () => {
    const components = { List: { base: { gap: 'space.6' } } }
    const { store, view } = mount(
      theme({ palette: { 'blue.600': '#2563eb' } }, { components }),
    )

    fireEvent.change(field(view, 'tokens.palette.blue.600'), { target: { value: '#ff0000' } })

    const draft = store.getState().draft
    expect(draft?.tokens?.palette).toEqual({ 'blue.600': '#ff0000' })
    // **다른 절은 참조까지 그대로다** — `putSection`이 그 절만 갈아 끼운다.
    expect(draft?.components).toBe(components)
  })

  it('토큰을 더하고 지운다 — 마지막 하나를 지우면 절이 사라진다', () => {
    const { store, view } = mount(theme({ palette: { 'blue.600': '#2563eb' } }))

    fireEvent.change(view.getByLabelText('semantic 토큰 추가'), { target: { value: 'primary' } })
    fireEvent.click(view.getByLabelText('semantic 추가'))
    expect(store.getState().draft?.tokens?.semantic).toEqual({ primary: 'palette.blue.600' })

    fireEvent.click(rowOf(view, 'tokens.semantic.primary').querySelector('button')!)
    expect(store.getState().draft?.tokens?.semantic).toBeUndefined()
  })

  /* ── 파생 — 상속된 토큰이 보이고, 쓰는 것은 이 테마의 절이다 ──────────────── */

  it('파생 테마는 상속된 토큰을 보이고 고친 것만 자기 절에 싣는다', () => {
    const base = systemTheme('admin') as Theme
    const draft = theme(
      { semantic: { primary: '#ff00ff' } },
      { meta: { id: 'brand', name: '브랜드', version: '1.0.0', extends: 'system:admin' } },
    )
    const { store, view } = mount(draft, { base })

    // 상속된 팔레트가 화면에 있다 — 자기 절만 그리면 이 줄이 없다.
    const inherited = Object.keys(base.tokens?.palette ?? {})[0]!
    const row = rowOf(view, `tokens.palette.${inherited}`)
    expect(row.textContent).toContain('상속')

    fireEvent.change(field(view, `tokens.palette.${inherited}`), { target: { value: '#010203' } })

    const tokens = store.getState().draft?.tokens
    // **이 테마의 절에는 고친 것 하나만 있다.** 병합 결과를 통째로 실으면 파생이 사라진다.
    expect(tokens?.palette).toEqual({ [inherited]: '#010203' })
    expect(tokens?.semantic).toEqual({ primary: '#ff00ff' })
    // **상속 대상은 안 더럽혀진다** — 시스템 테마는 모듈 상수다.
    expect(base.tokens?.palette?.[inherited]).not.toBe('#010203')
  })

  it('덮어쓴 값을 상속값으로 되돌린다', () => {
    const base = systemTheme('admin') as Theme
    const inherited = Object.keys(base.tokens?.palette ?? {})[0]!
    const draft = theme(
      { palette: { [inherited]: '#010203' } },
      { meta: { id: 'brand', name: '브랜드', version: '1.0.0', extends: 'system:admin' } },
    )
    const { store, view } = mount(draft, { base })

    expect(rowOf(view, `tokens.palette.${inherited}`).textContent).toContain('이 테마')
    fireEvent.click(view.getAllByRole('button', { name: '상속값으로', hidden: true })[0]!)

    // 절이 통째로 비었으므로 `tokens` 자체가 사라진다.
    expect(store.getState().draft?.tokens).toBeUndefined()
    // 그래도 화면에는 상속값이 그대로 보인다.
    expect(effectiveTokens(store.getState().draft!, base).palette?.[inherited]).toBe(
      base.tokens?.palette?.[inherited],
    )
  })

  /* ── 스케일 에디터 — 파생을 보인다 ───────────────────────────────────────── */

  it('space.unit 하나가 space.1~space.24를 낳는 것을 보인다', () => {
    const { store, view } = mount(theme({ scale: { space: { unit: '4px' } } }))

    const derived = view.getByLabelText('space.1~space.24')
    expect(derived.querySelectorAll('li')).toHaveLength(24)
    expect(derived.textContent).toContain('96px')

    fireEvent.change(field(view, 'tokens.scale.space.unit'), { target: { value: '8px' } })

    expect(store.getState().draft?.tokens?.scale?.space).toEqual({ unit: '8px' })
    // **값이 엔진의 것과 같다** — 화면이 곱셈을 다시 하지 않는다.
    const { table } = resolveTokens({ scale: { space: { unit: '8px' } } })
    expect(view.getByLabelText('space.1~space.24').textContent).toContain(table.get('space.24')!)
  })

  it('규격 밖 unit이면 파생되지 않았다고만 말한다 — 이유는 이슈 패널의 몫이다', () => {
    const { view } = mount(theme({ scale: { space: { unit: '4' } } }))

    expect(view.queryByLabelText('space.1~space.24')).toBeNull()
    expect(view.getByLabelText('space').textContent).toContain('파생되지 않았습니다')
  })

  /* ── 타이포 미리보기 ──────────────────────────────────────────────────────── */

  it('타이포 항목마다 실제 글자로 그리고 값이 스타일에 실린다', () => {
    const { view } = mount(
      theme({
        scale: {
          typography: {
            h1: { fontSize: '32px', lineHeight: 1.25, fontWeight: 700 },
            family: { sans: 'Pretendard, sans-serif' },
          },
        },
      }),
    )

    const h1 = view.getByLabelText('typography.h1')
    const sample = h1.querySelector('.wb-shell-token-sample') as HTMLElement
    expect(sample.textContent).not.toBe('')
    expect(sample.style.fontSize).toBe('32px')
    expect(sample.style.fontWeight).toBe('700')
    // **없는 키는 선언하지 않는다** — 엔진의 `TYPOGRAPHY_KEYS`와 같은 규칙이다.
    expect(sample.style.letterSpacing).toBe('')

    // `family`는 글자 스타일 항목이 아니다 — 그 사실을 화면이 말한다.
    const family = view.getByLabelText('typography.family')
    expect(family.textContent).toContain('가리킬 수 없습니다')
    expect((family.querySelector('.wb-shell-token-sample') as HTMLElement).style.fontFamily).toBe(
      'Pretendard, sans-serif',
    )
  })

  it('수였던 타이포 값은 수로 남는다', () => {
    const { store, view } = mount(
      theme({ scale: { typography: { h1: { fontSize: '32px', lineHeight: 1.25 } } } }),
    )

    fireEvent.change(field(view, 'tokens.scale.typography.h1.lineHeight'), {
      target: { value: '1.5' },
    })
    fireEvent.change(field(view, 'tokens.scale.typography.h1.fontSize'), {
      target: { value: '40px' },
    })

    const entry = store.getState().draft?.tokens?.scale?.typography?.['h1']
    expect(entry).toEqual({ fontSize: '40px', lineHeight: 1.5 })
  })

  /* ── 잠김 ─────────────────────────────────────────────────────────────────── */

  it('잠기면 값을 고칠 수 없고 더하기·되돌리기가 없다', () => {
    const { view } = mount(
      theme({
        palette: { 'blue.600': '#2563eb' },
        semantic: { primary: 'palette.blue.600' },
        scale: { space: { unit: '4px' } },
      }),
      { locked: true },
    )

    expect(field(view, 'tokens.palette.blue.600').disabled).toBe(true)
    expect(field(view, 'tokens.semantic.primary').disabled).toBe(true)
    expect(field(view, 'tokens.scale.space.unit').disabled).toBe(true)
    expect(view.queryByLabelText('palette 토큰 추가')).toBeNull()
    expect(view.queryByLabelText('tokens.semantic.primary 이름공간')).toBeNull()
    // 잠겨도 **보이는 것은 그대로다** — 읽기 전용으로 여는 것이 D2의 길이다.
    expect(view.getByLabelText('space.1~space.24')).toBeTruthy()
  })
})
