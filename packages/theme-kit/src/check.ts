import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { THEMELESS_TYPES, getComponent, installCatalog } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'
import { galleryItemDocument, galleryItems } from '@wirebound/theme-gallery'
import { ThemeProvider, type ThemeDefinition, type ThemeManifest } from '@wirebound/theme-sdk'
import { installRuntime } from '@wirebound/theme-sdk/runtime'
import { tokenValues, tokenVar, type WbthemeFiles } from '@wirebound/themes'

export interface ThemeCheckError {
  /** 갤러리 칸의 컴포넌트. 번들 자체의 오류면 빈 글자. */
  type: string
  variant: string | undefined
  /** 표본의 이름(`GallerySample.label`). */
  label: string
  message: string
  /** `fallback` — 칸에 선 `data-wb-error`. `console` — 그 칸을 그리는 동안 난 `console.error`. `bundle` — 번들을 못 실었다. */
  source: 'fallback' | 'console' | 'bundle'
}

export interface UndeclaredPatternVariant {
  pattern: string
  /** 패턴 안의 노드 자리 — `schema` · `schema.children.1` 꼴. */
  path: string
  type: string
  variant: string
}

export interface ThemeCheckFocusable {
  /** 갤러리 칸의 컴포넌트 · variant · 표본 이름. */
  type: string
  variant: string | undefined
  label: string
  /** 그 요소의 여는 태그 — `<div tabindex="0">`. */
  element: string
}

export interface ThemeCheckReport {
  /** 그린 갤러리 칸의 수. */
  items: number
  errors: ThemeCheckError[]
  /** manifest 가 선언했는데 `theme.css` · `theme.js` 어디서도 안 쓰는 토큰 — 토큰 폼에 효과 없는 칸이 선다. */
  unusedTokens: string[]
  /** 패턴이 `components` 에 없는 variant 를 쓴 자리 — 패턴을 넣으면 그 노드가 선언 밖 variant 로 선다. */
  undeclaredVariantsUsedByPatterns: UndeclaredPatternVariant[]
  /**
   * 캔버스에서 누르면 단축키 · 노드 복사가 안 서게 하는 포커스 받는 요소 — 단추 · 링크 · 입력 칸이 아닌데 포커스를 받는 것(`tabindex` · `summary` ·
   * `controls` 를 켠 `video` · `audio` · `iframe`). **경고다 — `ok` 에 안 든다**(`formatCheckReport`). 에디터가 포커스 받은 요소를 입력 표면으로 보기 때문이다
   * (`apps/web/src/edit/editor-shortcuts.ts` 의 `shortcutsBlocked` · 테마 작성 안내 SKILL.md 「뷰 계약」). 닫힌 shadow 안은 못 본다.
   */
  focusables: ThemeCheckFocusable[]
}

/**
 * DOM 이 없으면(노드 · `wb-theme check`) jsdom 창을 세우고 그 창의 이름을 전역에 얹는다 — react-dom 이 `window` · `document` 와 그 창의 생성자
 * (`HTMLIFrameElement` 등)를 전역으로 찾는다. 얹은 이름만 끝에서 걷는다. 이미 DOM 이 있으면(vitest 의 jsdom 환경) 그 창을 쓴다.
 */
async function withDom<T>(run: () => Promise<T>): Promise<T> {
  if (typeof globalThis.document !== 'undefined') return run()
  const { JSDOM } = await import('jsdom')
  // 출처가 없으면(`about:blank`) `localStorage` 게터가 던진다 — 아래에서 창의 이름을 읽을 때 걸린다.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
  const target = globalThis as unknown as Record<string, unknown>
  const added: string[] = []
  for (const key of Object.getOwnPropertyNames(dom.window)) {
    if (key in target) continue
    target[key] = (dom.window as unknown as Record<string, unknown>)[key]
    added.push(key)
  }
  target.window = dom.window
  added.push('window')
  try {
    return await run()
  } finally {
    for (const key of added) delete target[key]
    dom.window.close()
  }
}

function messageOf(args: unknown[]): string {
  return args
    .map((arg) => (arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : String(arg)))
    .join(' ')
    .split('\n')[0]!
}

/** 한 macrotask 를 넘긴다 — 뷰의 수동 이펙트(`useEffect`)가 돌고 그 상태 갱신이 그려질 틈. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0))

/**
 * `wb-theme check` — `.wbtheme` 를 공유 런타임으로 싣고(`installRuntime` → `new Function(themeJs)` → `take()`) 갤러리 칸마다 따로 그려 오류를 모은다.
 * 칸마다 따로 그리는 것은 `console.error` 를 그 칸에 매기려는 것이다. 뷰의 선언은 패키지의 manifest 로 바꿔 끼운다 — 호스트와 같다.
 *
 * **jsdom 값이다** — 레이아웃 · 계산된 스타일이 없어 가로 넘침 · 겹침은 못 잰다. 그것은 실 Chromium 으로 찍는 `wb-theme shots` 가 잰다.
 */
export async function checkTheme(files: WbthemeFiles): Promise<ThemeCheckReport> {
  const { manifest } = files
  const unusedTokens = findUnusedTokens(files)
  const undeclaredVariantsUsedByPatterns = findUndeclaredPatternVariants(manifest)
  return withDom(async () => {
    installCatalog()
    const handle = installRuntime(globalThis)
    let definition: ThemeDefinition | null = null
    let loadError: string | null = null
    try {
      new Function(files.themeJs)()
      definition = handle.take()
    } catch (error) {
      loadError = `theme.js 가 던졌습니다: ${(error as Error).message}`
    } finally {
      handle.uninstall()
    }
    if (definition === null) {
      const message = loadError ?? 'theme.js 가 테마를 등록하지 않았습니다'
      return { items: 0, errors: [{ type: '', variant: undefined, label: '', message, source: 'bundle' }], unusedTokens, undeclaredVariantsUsedByPatterns, focusables: [] }
    }
    const viewKeyErrors = findBadViewKeys(definition)
    const theme: ThemeDefinition = { ...definition, manifest }
    const tokens = tokenValues(manifest, {})
    const items = galleryItems(theme)
    const errors: ThemeCheckError[] = [...viewKeyErrors]
    const focusables: ThemeCheckFocusable[] = []

    // 붙잡은 동안 react 가 act 경고를 내지 않게 — vitest 의 testing-library 가 이 값을 켜 둔다.
    const flags = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const actBefore = flags.IS_REACT_ACT_ENVIRONMENT
    flags.IS_REACT_ACT_ENVIRONMENT = false
    const consoleError = console.error
    let logged: string[] = []
    console.error = (...args: unknown[]) => {
      logged.push(messageOf(args))
    }
    try {
      for (const item of items) {
        const at = { type: item.type, variant: item.variant, label: item.sample.label }
        const container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        logged = []
        flushSync(() => {
          root.render(
            createElement(ThemeProvider, { value: { tokens, window }, children: renderDocument(galleryItemDocument(item), { theme }) }),
          )
        })
        await settle()
        for (const node of container.querySelectorAll('[data-wb-error]')) {
          errors.push({ ...at, message: node.getAttribute('data-wb-error') ?? '', source: 'fallback' })
        }
        for (const message of logged) errors.push({ ...at, message, source: 'console' })
        for (const element of focusReceivers(container)) focusables.push({ ...at, element: openingTag(element) })
        root.unmount()
        container.remove()
        // 언마운트가 남긴 스케줄러의 일을 여기서 끝낸다 — DOM 전역을 걷은 뒤에 돌면 react-dom 이 `window` 를 못 찾아 던진다.
        await settle()
      }
    } finally {
      console.error = consoleError
      flags.IS_REACT_ACT_ENVIRONMENT = actBefore
    }
    return { items: items.length, errors, unusedTokens, undeclaredVariantsUsedByPatterns, focusables }
  })
}

/** 단추 · 링크 · 입력 칸 — 에디터가 단축키를 받거나(단추 · 링크) 입력 표면으로 따로 다루는(입력 칸) 포커스 받는 요소. 이들은 경고가 아니다. */
const EXPECTED_FOCUS = 'button, a[href], input, select, textarea, [contenteditable]'

/**
 * 그 칸 안에서 **포커스를 받는데 단추 · 링크 · 입력 칸이 아닌 요소**. 마우스 누름이 포커스를 주는 것을 센다 — `tabindex="-1"` 도 눌러서 포커스를 받는다.
 * jsdom 값이라 레이아웃 · 숨김(`display: none`)은 못 가른다 — 속성으로만 본다.
 */
function focusReceivers(container: Element): Element[] {
  return [...container.querySelectorAll('[tabindex], summary, video[controls], audio[controls], iframe')].filter((element) => {
    if (element.matches(EXPECTED_FOCUS)) return false
    const tabindex = element.getAttribute('tabindex')
    return tabindex === null ? true : tabindex.trim() !== '' && Number.isInteger(Number(tabindex))
  })
}

function openingTag(element: Element): string {
  const attributes = [...element.attributes].filter((attribute) => attribute.name === 'tabindex' || attribute.name === 'role' || attribute.name === 'controls')
  return `<${element.localName}${attributes.map((attribute) => ` ${attribute.name}${attribute.value === '' ? '' : `="${attribute.value}"`}`).join('')}>`
}

/**
 * **뷰 키가 읽히는 자리가 없는 것** — 렌더러는 `views[노드 타입]` 만 읽는다. 상태 영역(`THEMELESS_TYPES`)은 렌더러가 직접 다뤄 뷰를 안 부르고,
 * 카탈로그에 없는 키는 부를 노드가 없다. 둘 다 조용히 버려져 «뷰를 짰는데 안 쓰인다» 로만 나타난다(manifest 는 같은 선언을 거절한다).
 * `install` 된 카탈로그에서 읽으므로 `installCatalog()` 뒤에 부른다.
 */
function findBadViewKeys(definition: ThemeDefinition): ThemeCheckError[] {
  const errors: ThemeCheckError[] = []
  for (const key of Object.keys(definition.views)) {
    const message = THEMELESS_TYPES.includes(key)
      ? `views.${key} 는 테마가 그리지 않는 타입의 뷰입니다 — 렌더러가 직접 다뤄 쓰이지 않습니다`
      : getComponent(key) === undefined
        ? `views.${key} 는 카탈로그에 없는 타입의 뷰입니다 — 쓰이지 않습니다`
        : null
    if (message !== null) errors.push({ type: key, variant: undefined, label: '', message, source: 'bundle' })
  }
  return errors
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 쓰임은 셋이다 — `theme.css` · `theme.js` 의 `var(--wb-…)`, `theme.js` 의 키 글자(`useToken('color.primary')` — 번들러가 글자를 그대로 둔다),
 * 쓰이는 토큰의 기본값이 `var(--wb-…)` 로 가리키는 토큰. `:root { --wb-…: … }` 의 정의는 쓰임이 아니다(`theme.css` 가 기본값을 적는 자리).
 *
 * **`theme.js` 에는 manifest 가 통째로 실린다**(`theme.config.ts` → `defineManifest`) — 토큰 키가 객체 키(`"color.x":`)로, 기본값이 글자로 든다.
 * 그대로 찾으면 모든 토큰이 «쓰임» 이다. 그래서 키 글자는 뒤에 `:` 가 오는 것(객체 키)을 빼고, 기본값 글자는 찾기 전에 걷는다.
 *
 * **글자로 찾는다** — 런타임에 조립한 이름(`useToken(\`color.${kind}\`)`)은 못 본다. 그런 뷰는 «안 씀» 으로 잘못 나온다(거짓 빨강).
 */
function findUnusedTokens(files: WbthemeFiles): string[] {
  const items = files.manifest.tokens.items
  const keys = Object.keys(items)
  let js = files.themeJs
  for (const decl of Object.values(items)) {
    const value = String(decl.default)
    if (value.includes('var(')) for (const quote of ['"', "'", '`']) js = js.split(`${quote}${value}${quote}`).join('""')
  }
  const text = `${files.themeCss ?? ''}\n${js}`
  const usesVar = (source: string, key: string) => new RegExp(`var\\(\\s*${escape(tokenVar(key))}\\s*[,)]`).test(source)
  const usesKey = (key: string) => new RegExp(`(['"\`])${escape(key)}\\1(?!\\s*:)`).test(js)
  const used = new Set(keys.filter((key) => usesVar(text, key) || usesKey(key)))
  // 기본값의 가리킴을 끝까지 따라간다.
  for (let grew = true; grew; ) {
    grew = false
    for (const key of keys) {
      if (used.has(key)) continue
      if ([...used].some((user) => usesVar(String(items[user]!.default), key))) {
        used.add(key)
        grew = true
      }
    }
  }
  return keys.filter((key) => !used.has(key))
}

interface PatternNodeLike {
  type?: unknown
  variant?: unknown
  children?: unknown
}

function findUndeclaredPatternVariants(manifest: ThemeManifest): UndeclaredPatternVariant[] {
  const found: UndeclaredPatternVariant[] = []
  const visit = (pattern: string, node: PatternNodeLike, path: string) => {
    if (typeof node.type === 'string' && typeof node.variant === 'string') {
      const declared = manifest.components?.[node.type]?.variants.some((v) => v.id === node.variant) ?? false
      if (!declared) found.push({ pattern, path, type: node.type, variant: node.variant })
    }
    if (Array.isArray(node.children)) node.children.forEach((child, index) => visit(pattern, child as PatternNodeLike, `${path}.children.${index}`))
  }
  for (const [name, pattern] of Object.entries(manifest.patterns ?? {})) {
    const schema = (pattern as { schema?: unknown } | null)?.schema
    if (schema !== null && typeof schema === 'object') visit(name, schema as PatternNodeLike, 'schema')
  }
  return found
}

/**
 * 보고를 사람이 읽을 줄로 — `wb-theme check` 가 찍는다. `ok` 는 셋(오류 · 안 쓰는 토큰 · 선언 밖 variant)이 다 비었을 때만 참이다. **포커스 받는 요소는
 * 경고 줄(`⚠`)이라 `ok` 에 안 든다** — 같은 컴포넌트 · variant · 요소는 한 줄로 묶고 칸 수를 적는다.
 */
export function formatCheckReport(report: ThemeCheckReport): { ok: boolean; lines: string[] } {
  const lines: string[] = [`갤러리 칸 ${report.items} 개`]
  for (const error of report.errors) {
    const at = error.source === 'bundle' ? '번들' : `${error.type}${error.variant === undefined ? '' : ` · ${error.variant}`} — ${error.label}`
    lines.push(`✗ [${error.source}] ${at}: ${error.message}`)
  }
  for (const key of report.unusedTokens) lines.push(`✗ 안 쓰는 토큰: ${key} — theme.css · 뷰 어디서도 var(${tokenVar(key)}) · useToken 으로 안 읽는다`)
  for (const found of report.undeclaredVariantsUsedByPatterns) {
    lines.push(`✗ 패턴 ${found.pattern} 의 ${found.path}: ${found.type} 의 variant "${found.variant}" 는 components 에 없다`)
  }
  const warned = new Map<string, number>()
  for (const found of report.focusables) {
    const key = `${found.type}${found.variant === undefined ? '' : ` · ${found.variant}`}: ${found.element}`
    warned.set(key, (warned.get(key) ?? 0) + 1)
  }
  for (const [key, cells] of warned) {
    lines.push(`⚠ 포커스 받는 요소 ${key} (${cells} 칸) — 캔버스에서 누른 뒤 단축키 · 노드 복사가 안 섭니다. 단추 · 링크만 쓰세요`)
  }
  const ok = report.errors.length === 0 && report.unusedTokens.length === 0 && report.undeclaredVariantsUsedByPatterns.length === 0
  lines.push(ok ? '✓ 오류 없음' : `✗ 오류 ${report.errors.length} · 안 쓰는 토큰 ${report.unusedTokens.length} · 선언 밖 variant ${report.undeclaredVariantsUsedByPatterns.length}`)
  return { ok, lines }
}
