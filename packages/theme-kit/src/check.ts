import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { childLists, installCatalog, walkNodes, WEIGHT_MAX, WEIGHT_MIN, type WbNode } from '@wirebound/schema'
import { renderDocument, unusedViewKeys } from '@wirebound/renderer'
import { galleryAssetUrl, galleryItemDocument, galleryItems, PLACEHOLDER_SET_PROPS, PLACEHOLDER_SET_SAMPLE } from '@wirebound/theme-gallery'
import { pairRows, placeholderVars, ThemeProvider, type ThemeDefinition, type ViewItem } from '@wirebound/theme-sdk'
import { installRuntime } from '@wirebound/theme-sdk/runtime'
import { tokenValues, tokenVar, type WbthemeFiles } from '@wirebound/themes'

export interface ThemeCheckError {
  /** 갤러리 칸의 컴포넌트. 번들 자체의 오류면 빈 글자. */
  type: string
  variant: string | undefined
  /** 표본의 이름(`GallerySample.label`). */
  label: string
  message: string
  /**
   * `fallback` — 칸에 선 `data-wb-error`. `console` — 그 칸을 그리는 동안 난 `console.error`. `bundle` — 번들을 못 실었다. `zone` — 내용이 든 구역을
   * 뷰가 안 그렸다(`missingZones`). `placeholder` — 자리표시자 뷰가 사람이 정한 그리기 값을 뿌리의 변수로 안 실었다(`placeholderDrops`). `pairs` — 폼 표
   * 뷰가 쌍 격자 계약(`cells` 조각 · 그 직계 칸과 빈 쌍 · 두 조각 · 빈 쌍 수)을 어겼다(`pairGridProblems`).
   */
  source: 'fallback' | 'console' | 'bundle' | 'zone' | 'placeholder' | 'pairs'
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
      return {
        items: 0,
        errors: [{ type: '', variant: undefined, label: '', message, source: 'bundle' }],
        unusedTokens,
        focusables: [],
      }
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
            createElement(ThemeProvider, {
              value: { tokens, window },
              children: renderDocument(galleryItemDocument(item), { theme, assetUrl: galleryAssetUrl }),
            }),
          )
        })
        await settle()
        for (const node of container.querySelectorAll('[data-wb-error]')) {
          errors.push({ ...at, message: node.getAttribute('data-wb-error') ?? '', source: 'fallback' })
        }
        for (const message of logged) errors.push({ ...at, message, source: 'console' })
        for (const message of missingZones(container, galleryItemDocument(item).root)) errors.push({ ...at, message, source: 'zone' })
        for (const message of pairGridProblems(container, galleryItemDocument(item).root)) errors.push({ ...at, message, source: 'pairs' })
        if (item.type === 'Placeholder' && item.sample.label === PLACEHOLDER_SET_SAMPLE) {
          for (const message of placeholderDrops(container, item.sample.node.id)) errors.push({ ...at, message, source: 'placeholder' })
        }
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
    return { items: items.length, errors, unusedTokens, focusables }
  })
}

/**
 * **내용이 든 구역을 뷰가 안 그렸다** — 그린 노드마다, 선언된 이름 붙은 구역에 노드가 있는데 그 노드의 요소 안에 그 노드의 구역 상자
 * (`[data-wb-zone=<이름>]` — 가장 가까운 노드 요소가 그 노드다)가 없으면 그 내용이 화면에서 사라진 것이다. SDK `Zone` 을 안 쓰는 뷰(구역 전의
 * SDK 로 짠 뷰)가 걸린다. 그 노드 자신이 안 그려졌으면(숨은 탭의 내용) 보지 않는다.
 */
function missingZones(container: Element, root: WbNode): string[] {
  const out: string[] = []
  for (const { node } of walkNodes(root)) {
    const element = container.querySelector(`[data-wb-id="${node.id}"]`)
    if (element === null) continue
    for (const { zone, pointer, list } of childLists(node)) {
      if (pointer === '/children' || list.length === 0) continue
      const drawn = [...element.querySelectorAll(`[data-wb-zone="${zone}"]`)].some(
        (box) => box.parentElement?.closest('[data-wb-id]') === element,
      )
      if (!drawn) out.push(`${node.type} 뷰가 내용이 든 구역 ${zone} 을 그리지 않았습니다 — SDK 의 Zone 으로 둡니다(노드 ${node.id})`)
    }
  }
  return out
}

/**
 * **폼 표의 쌍 격자 계약** — SDK 기본 CSS · 테마 CSS 는 폼 표 뿌리의 `cells` 조각을 격자로 깔고 그 **직계** 상자를 트랙에 놓는다. 그래서
 * ① `cells` 조각이 있다(이름을 바꾸면 격자가 아예 안 선다). ② 칸(몸통 자식)은 `cells` 의 직계다(감싸는 요소를 끼우면 그 요소가 트랙에 서고 칸의 몫 ·
 * subgrid 가 안 듣는다). ③ 칸에 선 `Field` 는 `label` · `value` 조각을 뿌리의 직계로 그린다(subgrid 가 두 조각을 쌍의 두 트랙에 놓는다). ④ 빈 쌍
 * (`filler` 조각 — 노드가 아니다)은 `cells` 의 직계이고 두 조각을 직계로 갖는다(라벨 칸 바탕 · 칸 선이 그 조각에 선다). ⑤ 빈 쌍 수가 칸 흐름
 * (`pairRows`)의 셈과 같다. ① 이 없으면 나머지는 안 본다 — 잴 자리가 없다. 갤러리 표본은 상태가 없어 몸통 자식이 다 보인다. 열을 정한 조회 폼은
 * 안 본다 — SDK 기본 CSS 가 그것을 쌍 격자로 깔지 않는다(쌍으로 꾸미는 테마가 제 `Field` 뷰와 함께 고른다).
 *
 * **jsdom 이라 DOM 꼴만 본다** — 꼴이 맞아도 CSS 가 격자를 다르게 깔면 못 본다. 그것은 `wb-theme shots` 의 `pairs` 가 실 Chromium 으로 잰다.
 */
function pairGridProblems(container: Element, root: WbNode): string[] {
  const out: string[] = []
  for (const { node } of walkNodes(root)) {
    if (node.type !== 'FormTable') continue
    const columns = (node.props as { columns?: unknown } | undefined)?.columns
    const element = container.querySelector(`[data-wb-id="${node.id}"]`)
    if (element === null) continue
    const width = typeof columns === 'number' ? columns : 1
    const owned = (selector: string) => [...element.querySelectorAll(selector)].filter((el) => el.closest('[data-wb-id]') === element)
    const cells = owned('[data-wb-part="cells"]')[0]
    if (cells === undefined) {
      out.push(`FormTable 뷰가 cells 조각을 그리지 않았습니다 — 쌍 격자는 그 조각의 직계 칸에 섭니다(노드 ${node.id})`)
      continue
    }
    const hasParts = (el: Element) => {
      const parts = [...el.children].map((part) => part.getAttribute('data-wb-part'))
      return parts.includes('label') && parts.includes('value')
    }
    for (const child of node.children ?? []) {
      const cell = element.querySelector(`[data-wb-id="${child.id}"]`)
      if (cell === null) continue
      if (cell.parentElement !== cells) {
        out.push(
          `FormTable 칸(노드 ${child.id})이 cells 조각의 직계가 아닙니다 — 감싸는 요소를 끼우면 쌍 격자가 그 칸을 트랙에 못 놓습니다(노드 ${node.id})`,
        )
      }
      if (child.type === 'Field' && !hasParts(cell)) {
        out.push(
          `${node.type} 안 Field(노드 ${child.id})가 label · value 조각을 뿌리의 직계로 안 그렸습니다 — 쌍 격자가 두 조각을 칸에 못 놓습니다`,
        )
      }
    }
    const fillers = owned('[data-wb-part="filler"]')
    const astray = fillers.filter((filler) => filler.parentElement !== cells).length
    if (astray > 0) {
      out.push(
        `FormTable 뷰가 빈 쌍 ${astray} 개를 cells 조각의 직계가 아닌 자리에 그렸습니다 — 빈 쌍은 cells 안 제 줄 끝 · 구멍 자리에 섭니다(노드 ${node.id})`,
      )
    }
    const bare = fillers.filter((filler) => !hasParts(filler)).length
    if (bare > 0) {
      out.push(
        `FormTable 뷰가 빈 쌍 ${bare} 개를 label · value 조각을 직계로 두지 않고 그렸습니다 — 두 조각이 있어야 라벨 칸 바탕 · 칸 선이 섭니다(노드 ${node.id})`,
      )
    }
    const items: ViewItem[] = (node.children ?? []).map((child, index) => {
      const weight = typeof child.weight === 'number' && child.weight >= WEIGHT_MIN && child.weight <= WEIGHT_MAX ? child.weight : 1
      return { nodeId: child.id, index, element: null, content: null, span: Math.min(weight, width) }
    })
    const want = pairRows(items, width).filter((cell) => cell.kind === 'filler').length
    const got = fillers.length
    if (got !== want)
      out.push(
        `FormTable 뷰가 빈 쌍(filler 조각)을 ${want} 개가 아니라 ${got} 개 그렸습니다 — pairRows(items, columns) 차례로 그립니다(노드 ${node.id})`,
      )
  }
  return out
}

/**
 * **자리표시자 뷰가 정한 그리기 값을 안 실었다** — 그 표본(`PLACEHOLDER_SET_PROPS`)의 뿌리 inline `style` 에 `placeholderVars` 가 내는 변수가
 * 같은 값으로 있는지 본다. 제 뷰로 그리며 props 를 버리는 테마가 걸린다.
 *
 * **계산된 색은 여기서 못 잰다** — jsdom 은 특이도를 안 보고(문서 차례만) `var()` 를 안 풀어 계산 값이 `var(--x, …)` 글자 그대로다. 테마 CSS 가
 * 변수를 무시하고 덮는 판은 실 Chromium 으로 그리는 `wb-theme shots` 가 잰다(`./shots.ts` 의 `placeholderColors`).
 */
function placeholderDrops(container: Element, nodeId: string): string[] {
  const element = container.querySelector<HTMLElement>(`[data-wb-id="${nodeId}"]`)
  if (element === null) return [`Placeholder 표본(노드 ${nodeId})이 그려지지 않았습니다`]
  const out: string[] = []
  for (const [name, want] of Object.entries(placeholderVars(PLACEHOLDER_SET_PROPS) as Record<string, string>)) {
    const got = element.style.getPropertyValue(name).trim()
    if (got !== want) {
      out.push(
        `Placeholder 뷰가 정한 값을 뿌리에 싣지 않았습니다 — ${name} 가 ${want} 가 아니라 ${got === '' ? '(없음)' : got} 입니다. placeholderVars(props) 를 Root 의 style 로 둡니다`,
      )
    }
  }
  return out
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
  const attributes = [...element.attributes].filter(
    (attribute) => attribute.name === 'tabindex' || attribute.name === 'role' || attribute.name === 'controls',
  )
  return `<${element.localName}${attributes.map((attribute) => ` ${attribute.name}${attribute.value === '' ? '' : `="${attribute.value}"`}`).join('')}>`
}

/**
 * **뷰 키가 읽히는 자리가 없는 것** — 렌더러는 `views[노드 타입]` 만 읽는다. 카탈로그에 없는 키는 부를 노드가 없어 조용히 버려지고 «뷰를
 * 짰는데 안 쓰인다» 로만 나타난다(manifest 는 같은 선언을 거절한다).
 * `install` 된 카탈로그에서 읽으므로 `installCatalog()` 뒤에 부른다.
 */
function findBadViewKeys(definition: ThemeDefinition): ThemeCheckError[] {
  return unusedViewKeys(definition.views).map(({ key, message }) => ({
    type: key,
    variant: undefined,
    label: '',
    message,
    source: 'bundle',
  }))
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
  for (let grew = true; grew;) {
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

/**
 * 보고를 사람이 읽을 줄로 — `wb-theme check` 가 찍는다. `ok` 는 둘(오류 · 안 쓰는 토큰)이 다 비었을 때만 참이다. **포커스 받는 요소는
 * 경고 줄(`⚠`)이라 `ok` 에 안 든다** — 같은 컴포넌트 · variant · 요소는 한 줄로 묶고 칸 수를 적는다.
 */
export function formatCheckReport(report: ThemeCheckReport): { ok: boolean; lines: string[] } {
  const lines: string[] = [`갤러리 칸 ${report.items} 개`]
  for (const error of report.errors) {
    const at =
      error.source === 'bundle' ? '번들' : `${error.type}${error.variant === undefined ? '' : ` · ${error.variant}`} — ${error.label}`
    lines.push(`✗ [${error.source}] ${at}: ${error.message}`)
  }
  for (const key of report.unusedTokens)
    lines.push(`✗ 안 쓰는 토큰: ${key} — theme.css · 뷰 어디서도 var(${tokenVar(key)}) · useToken 으로 안 읽는다`)
  const warned = new Map<string, number>()
  for (const found of report.focusables) {
    const key = `${found.type}${found.variant === undefined ? '' : ` · ${found.variant}`}: ${found.element}`
    warned.set(key, (warned.get(key) ?? 0) + 1)
  }
  for (const [key, cells] of warned) {
    lines.push(`⚠ 포커스 받는 요소 ${key} (${cells} 칸) — 캔버스에서 누른 뒤 단축키 · 노드 복사가 안 섭니다. 단추 · 링크만 쓰세요`)
  }
  const ok = report.errors.length === 0 && report.unusedTokens.length === 0
  lines.push(ok ? '✓ 오류 없음' : `✗ 오류 ${report.errors.length} · 안 쓰는 토큰 ${report.unusedTokens.length}`)
  return { ok, lines }
}
