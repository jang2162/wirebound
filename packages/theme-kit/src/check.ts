import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  BODY_ZONE,
  buildLayoutNav,
  childLists,
  getComponent,
  installCatalog,
  PAGE_LAYOUTS,
  walkNodes,
  WEIGHT_MAX,
  WEIGHT_MIN,
  zoneList,
  type PageDocument,
  type PageLayout,
  type WbNode,
} from '@wirebound/schema'
import { LayoutFrame, renderDocument, unusedViewKeys } from '@wirebound/renderer'
import {
  EXAMPLE_MENU,
  EXAMPLE_PAGES,
  EXAMPLE_POPUP_ID,
  EXAMPLE_POPUPS,
  galleryAssetUrl,
  galleryItemDocument,
  galleryItems,
  PLACEHOLDER_SET_PROPS,
  PLACEHOLDER_SET_SAMPLE,
} from '@wirebound/theme-gallery'
import {
  defaultViewsCss,
  gridLayout,
  pairRows,
  placeholderVars,
  ThemeProvider,
  type ThemeDefinition,
  type ViewItem,
} from '@wirebound/theme-sdk'
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
   * 뷰가 쌍 격자 계약(`cells` 조각 · 그 직계 칸과 빈 쌍 · 두 조각 · 빈 쌍 수)을 어겼다(`pairGridProblems`). `grid` — 그리드의 표 계약(`dataGridProblems`).
   * `file` — 파일첨부 뷰가 목록 · 빈 목록 안내 · 한도 글 계약을 어겼다(`fileAttachProblems`). `popup` — 팝업 뷰가 덮개 층이 기대는
   * 조각(`close` · `body`)이나 대화 상자 이름을 어겼다(`popupProblems`). `layout` — 레이아웃 뷰가 틀 계약(내용 한 번 · 선언한 끌 수 있는 영역을
   * `LayoutRegion` 으로)을 어겼거나 던졌다(`layoutProblems`) — `type` 은 `layout:<레이아웃>` 이다.
   */
  source: 'fallback' | 'console' | 'bundle' | 'zone' | 'placeholder' | 'pairs' | 'grid' | 'file' | 'popup' | 'layout'
}

/** 레이아웃 뷰가 그린 영역 가운데 manifest 의 그 레이아웃 선언에 없는 것 — 호스트의 켬/끔 · «보기» 메뉴가 그 영역을 모른다. */
export interface ThemeCheckUndeclaredRegion {
  layout: PageLayout
  id: string
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
  /** **경고다 — `ok` 에 안 든다.** 선언 밖 영역(`ThemeCheckUndeclaredRegion`). */
  undeclaredRegions: ThemeCheckUndeclaredRegion[]
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
        undeclaredRegions: [],
      }
    }
    const viewKeyErrors = findBadViewKeys(definition)
    const theme: ThemeDefinition = { ...definition, manifest }
    const tokens = tokenValues(manifest, {})
    const items = galleryItems(theme)
    const errors: ThemeCheckError[] = [...viewKeyErrors]
    const focusables: ThemeCheckFocusable[] = []
    const undeclaredRegions: ThemeCheckUndeclaredRegion[] = []

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
        for (const message of dataGridProblems(container, galleryItemDocument(item).root)) errors.push({ ...at, message, source: 'grid' })
        for (const message of fileAttachProblems(container, galleryItemDocument(item).root)) errors.push({ ...at, message, source: 'file' })
        for (const message of popupProblems(container, galleryItemDocument(item).root)) errors.push({ ...at, message, source: 'popup' })
        if (item.type === 'Placeholder' && item.sample.label === PLACEHOLDER_SET_SAMPLE) {
          for (const message of placeholderDrops(container, item.sample.node.id)) errors.push({ ...at, message, source: 'placeholder' })
        }
        for (const element of focusReceivers(container)) focusables.push({ ...at, element: openingTag(element) })
        root.unmount()
        container.remove()
        // 언마운트가 남긴 스케줄러의 일을 여기서 끝낸다 — DOM 전역을 걷은 뒤에 돌면 react-dom 이 `window` 를 못 찾아 던진다.
        await settle()
      }
      for (const layout of PAGE_LAYOUTS) {
        if (theme.layouts?.[layout] === undefined && theme.manifest.layouts?.[layout] === undefined) continue
        const at = { type: `layout:${layout}`, variant: undefined, label: '레이아웃' }
        const draw = async (hidden: readonly string[]) => {
          const container = document.createElement('div')
          document.body.append(container)
          const root = createRoot(container)
          logged = []
          const doc = layoutSample(layout)
          flushSync(() => {
            root.render(
              createElement(ThemeProvider, {
                value: { tokens, window },
                children: createElement(LayoutFrame, {
                  theme,
                  layout,
                  title: doc.title,
                  nav: buildLayoutNav(EXAMPLE_MENU, { id: doc.id, title: doc.title }),
                  hiddenRegions: hidden,
                  children: renderDocument(doc.document, { theme, assetUrl: galleryAssetUrl }),
                }),
              }),
            )
          })
          await settle()
          const regions = [...container.querySelectorAll('[data-wb-layout-region]')].map((el) => el.getAttribute('data-wb-layout-region')!)
          const contents = container.querySelectorAll('[data-wb-layout-content]').length
          const fallback = container.querySelector('[data-wb-layout][data-wb-error]')?.getAttribute('data-wb-error') ?? null
          const said = logged
          root.unmount()
          container.remove()
          await settle()
          return { regions, contents, fallback, said }
        }
        const declared = theme.manifest.layouts?.[layout]?.regions ?? []
        const shown = await draw([])
        for (const message of layoutProblems(layout, declared, shown)) errors.push({ ...at, message, source: 'layout' })
        for (const message of shown.said) errors.push({ ...at, message, source: 'console' })
        const known = new Set(declared.map((region) => region.id))
        for (const id of new Set(shown.regions)) if (!known.has(id)) undeclaredRegions.push({ layout, id })
        for (const region of declared) {
          if (region.toggle === false || !shown.regions.includes(region.id)) continue
          const off = await draw([region.id])
          if (off.regions.includes(region.id)) {
            errors.push({
              ...at,
              message: `${layout} 레이아웃 뷰가 끈 영역 ${region.id} 을 그렸습니다 — 끌 수 있는 영역은 SDK 의 LayoutRegion 으로 감쌉니다`,
              source: 'layout',
            })
          }
        }
      }
    } finally {
      console.error = consoleError
      flags.IS_REACT_ACT_ENVIRONMENT = actBefore
    }
    return { items: items.length, errors, unusedTokens, focusables, undeclaredRegions }
  })
}

/** 레이아웃 뷰를 그려 볼 장 — 팝업은 예제 팝업, 그 밖은 예제의 첫 장(서브페이지)이다. 문서의 레이아웃 칸은 안 본다(틀이 레이아웃을 받는다). */
function layoutSample(layout: PageLayout): { id: string; title: string; document: PageDocument } {
  if (layout === 'popup') return { id: EXAMPLE_POPUP_ID, title: '주문 삭제', document: EXAMPLE_POPUPS[0]!.document }
  const first = EXAMPLE_PAGES[0]!
  return { id: first.id, title: first.title, document: first.document }
}

/**
 * **레이아웃 틀의 계약** — 모두 켠 판에서 ① 뷰가 던지지 않았다(던지면 렌더러가 기본으로 대신 그리고 틀에 `data-wb-error` 를 단다) ② 내용
 * 상자(`data-wb-layout-content`)가 정확히 하나다(안 두면 페이지가 안 보이고, 두 번 두면 노드 id 가 겹쳐 캔버스가 노드를 못 가른다) ③ 선언한 끌 수
 * 있는 영역이 `LayoutRegion` 으로 섰다(`data-wb-layout-region` 이 없으면 호스트가 끄지 못한다). «하나만 끈 판에 없다» 는 `checkTheme` 가 따로 그려 본다.
 *
 * **jsdom 이라 DOM 꼴만 본다** — 틀의 배치 규칙이 형제 구조로 가르는지(정본 「테마의 범위」)는 안 본다.
 */
function layoutProblems(
  layout: PageLayout,
  declared: readonly { id: string; toggle?: boolean }[],
  shown: { regions: string[]; contents: number; fallback: string | null },
): string[] {
  if (shown.fallback !== null) return [shown.fallback]
  const out: string[] = []
  if (shown.contents !== 1) {
    out.push(
      shown.contents === 0
        ? `${layout} 레이아웃 뷰가 페이지 내용(children)을 두지 않았습니다 — 정확히 한 번 둡니다`
        : `${layout} 레이아웃 뷰가 페이지 내용(children)을 ${shown.contents} 번 두었습니다 — 정확히 한 번 둡니다`,
    )
  }
  for (const region of declared) {
    if (region.toggle === false || shown.regions.includes(region.id)) continue
    out.push(`${layout} 레이아웃 뷰가 선언한 영역 ${region.id} 을 LayoutRegion 으로 그리지 않았습니다 — 호스트가 그 영역을 끄지 못합니다`)
  }
  return out
}

/**
 * **내용이 든 구역을 뷰가 안 그렸다** — 그린 노드마다, 선언된 이름 붙은 구역에 노드가 있는데 그 노드의 요소 안에 그 노드의 구역 상자
 * (`[data-wb-zone=<이름>]` — 가장 가까운 노드 요소가 그 노드다)가 없으면 그 내용이 화면에서 사라진 것이다. SDK `Zone` 을 안 쓰는 뷰(구역 전의
 * SDK 로 짠 뷰)가 걸린다. 그 노드 자신이 안 그려졌으면(숨은 탭의 내용) 보지 않는다 · 그 노드의 props 가 그 구역을 가리면(`ComponentDef.reveal` —
 * 빈 상태 그리드의 행) 보지 않는다.
 */
function missingZones(container: Element, root: WbNode): string[] {
  const out: string[] = []
  for (const { node } of walkNodes(root)) {
    const element = container.querySelector(`[data-wb-id="${node.id}"]`)
    if (element === null) continue
    const def = getComponent(node.type)
    const parsed = def?.props.safeParse(node.props ?? {})
    const props = parsed?.success === true ? (parsed.data as Record<string, unknown>) : null
    for (const { zone, pointer, list } of childLists(node)) {
      if (pointer === '/children' || list.length === 0) continue
      // 그 노드의 props 가 이 구역을 가리는 판(빈 상태의 그리드 행)은 안 본다 — `reveal` 이 그 구역을 펼친 props 를 따로 내면 지금은 가려진 것이다.
      if (props !== null && def?.reveal !== undefined) {
        const open = def.reveal(props, { zone, index: 0 })
        if (Object.keys(open).some((key) => !Object.is(open[key], props[key]))) continue
      }
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
      return { ...shimItem(child, index), span: Math.min(weight, width) }
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

/** 노드 하나를 배치 셈(`pairRows` · `gridLayout`)에 넘길 `ViewItem` 으로 — props 는 카탈로그의 기본값을 채운 값, 자식은 몸통. 그린 것은 없다. */
function shimItem(node: WbNode, index: number): ViewItem {
  const parsed = getComponent(node.type)?.props.safeParse(node.props ?? {})
  return {
    nodeId: node.id,
    type: node.type,
    index,
    props: parsed?.success === true ? (parsed.data as Record<string, unknown>) : {},
    element: null,
    content: null,
    items: (zoneList(node, BODY_ZONE) as WbNode[]).map(shimItem),
    copy: () => ({ element: null, content: null }),
  }
}

/**
 * **그리드의 표 계약** — 행 · 열 뷰는 그리드 뷰가 내린 배치(`gridLayout`)를 읽어 칸을 그린다. 그래서 ① 머리 줄마다 칸 수 · `colspan` 합이 그 셈과
 * 같다 ② 몸 줄(행 노드 · 사본의 `tr`)마다 칸 수 · `colspan` 합이 그 셈과 같다(되풀이마다 · 선택 칸 포함) ③ 행 노드 · 셀 틀 노드가 `data-wb-id` 로
 * 한 번만 서고 나머지 줄은 `data-wb-copy-of` 다(원본을 줄마다 그리면 에디터가 같은 노드를 여럿으로 센다). ① ② 는 그리드가 제 표(`table`)를 그릴 때만
 * 본다 — 카드로 접는 테마는 표가 없다. 칸 하나를 빼거나 `colspan` 을 안 싣는 뷰 · `Root` 를 줄마다 그리는 뷰가 걸린다(빈 상태 · 불러오는 중은 ② · ③ 을
 * 안 본다 — 행 노드를 안 그리거나 셀 틀 대신 막대다). ④ 칸 수가 맞은 줄은 **칸 차례**도 본다 — 칸마다 든 노드(머리 칸은 열 · 열 묶음, 몸 칸은 제 칸 ·
 * 셀 틀의 첫 조각)가 그 셈의 차례와 같고, 노드가 없는 칸(선택 · 번호 · 빈 칸 · 생략 띠)에는 노드가 없다. 칸 수 · `colspan` 합은 그대로인 채 칸을 뒤집거나
 * 돌린 뷰가 걸린다(머리 칸과 몸 칸이 엇갈린다 — `docs/superpowers/plans/2026-10-25-rv-gr-report.md` M4). 칸에 노드가 없는 것(셀 틀을 안 그림)과 다른
 * 노드가 선 것(차례가 엇갈림)은 문장을 가른다.
 *
 * **jsdom 이라 DOM 꼴만 본다** — 칸이 실제 그 자리에 서는지(상자 좌표)는 실브라우저 판 `apps/web/build-test/data-grid.test.ts` 가 잰다.
 */
function dataGridProblems(container: Element, root: WbNode): string[] {
  const out: string[] = []
  for (const { node } of walkNodes(root)) {
    if (node.type !== 'DataGrid') continue
    const element = container.querySelector(`[data-wb-id="${node.id}"]`)
    if (element === null) continue
    const props = shimItem(node, 0).props
    const rows = (zoneList(node, 'rows') as WbNode[]).map(shimItem)
    const layout = gridLayout((zoneList(node, BODY_ZONE) as WbNode[]).map(shimItem), rows, props)
    const table = [...element.querySelectorAll('table')].find((one) => one.closest('[data-wb-id]') === element)
    const spanOf = (cells: HTMLCollectionOf<HTMLTableCellElement>) => Array.from(cells).reduce((sum, cell) => sum + cell.colSpan, 0)
    /** ④ — 칸마다 든 노드를 셈의 차례(`want` — 노드가 없는 칸이면 `null` · 이름은 칸 종류)와 견주어 첫 어긋남을 문장으로. */
    const orderProblem = (where: string, cells: HTMLCollectionOf<HTMLTableCellElement>, want: { id: string | null; kind: string }[]) => {
      for (const [at, expected] of want.entries()) {
        const got = nodeIn(cells[at]!)
        if (got === expected.id) continue
        const should = expected.id === null ? `노드가 없는 칸(${expected.kind})` : `노드 ${expected.id}(${expected.kind})`
        return got === null
          ? `${where}의 칸 ${at + 1} 에 노드가 없습니다 — gridLayout 차례로는 ${should}입니다(노드 ${node.id})`
          : `${where}의 칸 ${at + 1} 에 선 노드는 ${got} 입니다 — gridLayout 차례로는 ${should}입니다(노드 ${node.id})`
      }
      return null
    }
    const quiet = props.empty === true || props.loading === true
    if (table !== undefined) {
      const head = [...(table.tHead?.rows ?? [])]
      if (head.length !== layout.head.length)
        out.push(`DataGrid 뷰가 머리 줄을 ${layout.head.length} 개가 아니라 ${head.length} 개 그렸습니다(노드 ${node.id})`)
      layout.head.forEach((want, at) => {
        const got = head[at]
        if (got === undefined) return
        const wantSpan = want.reduce((sum, cell) => sum + cell.colSpan, 0)
        if (got.cells.length !== want.length || spanOf(got.cells) !== wantSpan) {
          out.push(
            `DataGrid 머리 줄 ${at + 1} 이 칸 ${got.cells.length} 개 · colspan 합 ${spanOf(got.cells)} 입니다 — gridLayout 셈은 ${want.length} 개 · ${wantSpan}(노드 ${node.id})`,
          )
          return
        }
        const order = orderProblem(
          `DataGrid 머리 줄 ${at + 1}`,
          got.cells,
          want.map((cell) => (cell.kind === 'select' ? { id: null, kind: 'select' } : { id: cell.item.nodeId, kind: cell.item.type })),
        )
        if (order !== null) out.push(order)
      })
      const body = [...table.tBodies].flatMap((tbody) => [...tbody.rows])
      if (!quiet) {
        if (body.length !== layout.lines.length)
          out.push(`DataGrid 뷰가 몸 줄을 ${layout.lines.length} 개가 아니라 ${body.length} 개 그렸습니다(노드 ${node.id})`)
        layout.lines.forEach((line, at) => {
          const got = body[at]
          if (got === undefined) return
          const want = line.cells.map((cell) => (cell.kind === 'own' || cell.kind === 'gap' ? cell.colSpan : 1))
          const wantSpan = want.reduce((sum, span) => sum + span, 0)
          if (got.cells.length !== want.length || spanOf(got.cells) !== wantSpan) {
            out.push(
              `DataGrid 몸 줄 ${at + 1}(행 ${line.row.nodeId})이 칸 ${got.cells.length} 개 · colspan 합 ${spanOf(got.cells)} 입니다 — gridLayout 셈은 ${want.length} 개 · ${wantSpan}(노드 ${node.id})`,
            )
            return
          }
          const order = orderProblem(
            `DataGrid 몸 줄 ${at + 1}(행 ${line.row.nodeId})`,
            got.cells,
            line.cells.map((cell) =>
              cell.kind === 'own'
                ? { id: cell.item.nodeId, kind: 'own' }
                : cell.kind === 'template'
                  ? { id: cell.leaf.item.items[0]?.nodeId ?? null, kind: 'template' }
                  : { id: null, kind: cell.kind },
            ),
          )
          if (order !== null) out.push(order)
        })
      }
    }
    if (quiet) continue
    const count = (selector: string) => element.querySelectorAll(selector).length
    for (const row of rows) {
      const lines = layout.linesOf.get(row.nodeId)?.length ?? 0
      const [ids, copies] = [count(`[data-wb-id="${row.nodeId}"]`), count(`[data-wb-copy-of="${row.nodeId}"]`)]
      if (lines > 0 && (ids !== 1 || copies !== lines - 1)) {
        out.push(
          `DataGrid 행(노드 ${row.nodeId})이 data-wb-id ${ids} 개 · 사본 ${copies} 개입니다 — 줄 ${lines} 개면 원본 1 · 사본 ${lines - 1}(Root copy)`,
        )
      }
    }
    for (const leaf of layout.leaves) {
      const template = leaf.item.items[0]
      if (template === undefined) continue
      const cells = layout.lines.flatMap((line) => line.cells).filter((cell) => cell.kind === 'template' && cell.leaf === leaf)
      if (cells.length === 0) continue
      const [ids, copies] = [count(`[data-wb-id="${template.nodeId}"]`), count(`[data-wb-copy-of="${template.nodeId}"]`)]
      if (ids !== 1 || copies !== cells.length - 1) {
        out.push(
          `DataGrid 셀 틀(노드 ${template.nodeId})이 data-wb-id ${ids} 개 · 사본 ${copies} 개입니다 — 셀 틀 칸 ${cells.length} 개면 원본 1 · 사본 ${cells.length - 1}(item.copy)`,
        )
      }
    }
  }
  return out
}

/**
 * **파일첨부의 목록 계약**(설계 spec `2026-10-26-popup-attach-repeat-design.md` «7» F1 ~ F4) — 테마 CSS 와 뒤 단계의 조각 기준 표지가 조각 이름을 겨냥한다.
 * ① F4 — `list` 조각이 `table` 하나이고 머리 칸이 `th scope="col"` 셋이다(보조 기술이 파일 이름 · 크기를 열 머리로 읽는다). ② F1 — `file` 조각(파일 한 줄)
 * 수가 `files` 길이와 같다. ③ F2 — 목록이 비면 `drop` 조각(빈 목록 안내) 하나 · 차면 0. ④ F3 — 한도가 있으면 `limit` 조각 하나 안에 개수(`limitCount` —
 * «{maxFiles}개»)와 크기(`limitSize` — `maxSize`) 조각이 그 값의 글로 서고, 없는 쪽 조각은 없다. 둘 다 없으면 `limit` 조각이 없다. 조각은 그 노드의 것만
 * 센다(가장 가까운 노드 요소가 그 노드다 — «단추» 구역의 단추 안은 안 센다).
 *
 * F1 은 자리도 본다 — `file` 조각은 `list` 표 몸통의 줄(`tbody > tr`)이다. 표 밖 형제로 선 줄은 수가 맞아도 열 머리와 안 이어져, 보조 기술이 이름 · 크기를
 * 열 머리로 못 읽는다. 조각 이름(SDK 뷰 머리말의 계약)도 그 자리에서 센다 — 파일 줄마다 `check` 칸 안 `checkbox` 하나와 `fileName` · `fileSize` 칸 하나씩
 * (글이 그 파일의 이름 · 크기), 머리 줄에 `checkHead` 칸 안 `checkbox` 하나, «단추» 구역에 내용이 있으면 목록 표 밖 `actions` 조각 하나(그 구역 상자이거나
 * 그것을 품는다). 줄 수가 틀리면(F1) 줄마다의 조각은 안 센다 — 몇째 줄이 어느 파일인지 모른다.
 *
 * **jsdom 이라 DOM 꼴만 본다** — 이름 칸이 좁은 칸 안에서 꺾이는지(넘침)는 `wb-theme shots` 가 실 Chromium 으로 잰다.
 */
function fileAttachProblems(container: Element, root: WbNode): string[] {
  const out: string[] = []
  for (const { node } of walkNodes(root)) {
    if (node.type !== 'FileAttach') continue
    const element = container.querySelector(`[data-wb-id="${node.id}"]`)
    if (element === null) continue
    const props = shimItem(node, 0).props
    const owned = (selector: string) => [...element.querySelectorAll(selector)].filter((el) => el.closest('[data-wb-id]') === element)
    const where = `(노드 ${node.id})`
    const lists = owned('[data-wb-part="list"]')
    const list = lists.length === 1 && lists[0]!.tagName === 'TABLE' ? lists[0]! : null
    if (list === null) {
      out.push(
        `FileAttach 뷰가 list 조각을 table 하나로 그리지 않았습니다 — ${lists.length} 개 · ${lists.map((el) => el.tagName.toLowerCase()).join(' · ') || '없음'}${where}`,
      )
    } else {
      const heads = [...list.querySelectorAll('thead > tr > *')]
      const good = heads.filter((cell) => cell.tagName === 'TH' && cell.getAttribute('scope') === 'col').length
      if (heads.length !== 3 || good !== 3) {
        out.push(`FileAttach 목록 머리 칸이 th scope="col" 셋이 아닙니다 — 칸 ${heads.length} 개 가운데 ${good} 개${where}`)
      }
    }
    const entries = filesOf(props.files)
    const files = entries.length
    const fileRows = owned('[data-wb-part="file"]')
    const rows = fileRows.length
    if (rows !== files) out.push(`FileAttach 뷰가 file 조각(파일 한 줄)을 ${files} 개가 아니라 ${rows} 개 그렸습니다${where}`)
    if (list !== null) {
      const astray = fileRows.filter(
        (row) => row.tagName !== 'TR' || row.parentElement?.tagName !== 'TBODY' || row.parentElement.parentElement !== list,
      )
      if (astray.length > 0) {
        out.push(
          `FileAttach 뷰가 file 조각 ${astray.length} 개를 list 표의 몸통 줄(tbody > tr) 밖에 그렸습니다 — ${astray.map((row) => row.tagName.toLowerCase()).join(' · ')}${where}`,
        )
      }
    }
    const textsOf = (scope: Element, part: string) =>
      [...scope.querySelectorAll(`[data-wb-part="${part}"]`)].map((el) => el.textContent ?? '')
    const checkboxIn = (scope: Element, cellPart: string) => {
      const cells = [...scope.querySelectorAll(`[data-wb-part="${cellPart}"]`)]
      return cells.length === 1 && cells[0]!.querySelectorAll('[data-wb-part="checkbox"]').length === 1
    }
    if (rows === files) {
      fileRows.forEach((row, index) => {
        const entry = entries[index]!
        for (const [part, want] of [
          ['fileName', entry.name],
          ['fileSize', entry.size],
        ] as const) {
          const got = textsOf(row, part)
          if (JSON.stringify(got) !== JSON.stringify([want])) {
            out.push(
              `FileAttach ${index + 1} 번째 파일 줄의 ${part} 조각이 ${JSON.stringify([want])} 가 아니라 ${JSON.stringify(got)} 입니다 — 파일 줄 안에 칸 하나${where}`,
            )
          }
        }
        if (!checkboxIn(row, 'check'))
          out.push(
            `FileAttach ${index + 1} 번째 파일 줄의 check 조각 안에 checkbox 조각이 하나가 아닙니다 — check 칸 하나에 그림 하나${where}`,
          )
      })
    }
    const headRow = list?.querySelector('thead > tr') ?? element
    if (!checkboxIn(headRow, 'checkHead'))
      out.push(`FileAttach 목록 머리 줄의 checkHead 조각 안에 checkbox 조각이 하나가 아닙니다 — checkHead 칸 하나에 그림 하나${where}`)
    if (zoneList(node, 'actions').length > 0) {
      const actions = owned('[data-wb-part="actions"]')
      const zone = (el: Element) => el.matches('[data-wb-zone="actions"]') || el.querySelector('[data-wb-zone="actions"]') !== null
      if (actions.length !== 1 || (list !== null && list.contains(actions[0]!)) || !zone(actions[0]!)) {
        out.push(
          `FileAttach 뷰가 actions 조각을 «단추» 구역을 품은 목록 표 밖 하나로 그리지 않았습니다 — ${actions.length} 개${actions.length === 1 && list?.contains(actions[0]!) ? ' · 목록 표 안' : ''}${where}`,
        )
      }
    }
    const drops = owned('[data-wb-part="drop"]').length
    const wantDrop = files === 0 ? 1 : 0
    if (drops !== wantDrop) {
      out.push(`FileAttach 뷰가 drop 조각(빈 목록 안내)을 ${wantDrop} 개가 아니라 ${drops} 개 그렸습니다 — 목록이 비었을 때만 하나${where}`)
    }
    const count = typeof props.maxFiles === 'number' && props.maxFiles > 0 ? `${props.maxFiles}개` : null
    const size = typeof props.maxSize === 'string' && props.maxSize.trim() !== '' ? props.maxSize : null
    const limits = owned('[data-wb-part="limit"]')
    if (count === null && size === null) {
      if (limits.length > 0) out.push(`FileAttach 뷰가 한도가 없는데 limit 조각을 ${limits.length} 개 그렸습니다${where}`)
      continue
    }
    if (limits.length !== 1) {
      out.push(`FileAttach 뷰가 limit 조각을 1 개가 아니라 ${limits.length} 개 그렸습니다${where}`)
      continue
    }
    for (const [part, want] of [
      ['limitCount', count],
      ['limitSize', size],
    ] as const) {
      const got = [...limits[0]!.querySelectorAll(`[data-wb-part="${part}"]`)].map((el) => el.textContent ?? '')
      const expected = want === null ? [] : [want]
      if (JSON.stringify(got) !== JSON.stringify(expected)) {
        out.push(
          `FileAttach 한도 글의 ${part} 조각이 ${JSON.stringify(expected)} 가 아니라 ${JSON.stringify(got)} 입니다 — limit 조각 안에 값 하나를 감쌉니다${where}`,
        )
      }
    }
  }
  return out
}

/**
 * **팝업의 조각 계약** — 덮개 층(`@wirebound/renderer` 의 `PopupLayer`)은 상자 안에서 `close` 조각을 찾아 ✖ 로 닫고, `body` 조각만 굴리며, 상자
 * 뿌리에 `aria-modal` 을 단다. 그래서 P1 `close` 조각이 정확히 하나 · `<button>` · 접근 이름이 있다. P2 뿌리가 `role="dialog"` 이고
 * `aria-labelledby` 가 가리키는 글이 `title` 이다. P3 `body` 조각이 하나이고 몸통 자식이 모두 그 안이다. P4 «바닥» 구역 자식은 `body` 밖이다 —
 * 안이면 몸통과 함께 굴러 단추가 안 보인다. P5 덮개 층 CSS 가 뿌리의 직계로 거는 조각(`popupDirectParts`)은 뿌리의 직계다 — 감싸는 요소 하나가
 * 끼면 P1 ~ P4 를 다 지나고도 층의 굴림 규칙이 안 걸려 몸통이 안 구른다.
 *
 * **jsdom 이라 DOM 꼴만 본다** — 덮개 위에서 몸통만 구르는지는 실브라우저 판 `apps/web/build-test/popup-layer.test.ts` 가 잰다.
 */
function popupProblems(container: Element, root: WbNode): string[] {
  const out: string[] = []
  for (const { node } of walkNodes(root)) {
    if (node.type !== 'Popup') continue
    const element = container.querySelector(`[data-wb-id="${node.id}"]`)
    if (element === null) continue
    const owned = (selector: string) => [...element.querySelectorAll(selector)].filter((el) => el.closest('[data-wb-id]') === element)
    const closes = owned('[data-wb-part="close"]')
    if (closes.length !== 1) {
      out.push(`Popup 뷰가 close 조각을 ${closes.length} 개 그렸습니다 — 하나여야 덮개 층이 그것으로 닫습니다(노드 ${node.id})`)
    } else if (closes[0]!.tagName !== 'BUTTON') {
      out.push(`Popup 의 close 조각이 <${closes[0]!.tagName.toLowerCase()}> 입니다 — <button> 이어야 키로 닫습니다(노드 ${node.id})`)
    } else if (accessibleName(closes[0]!) === '') {
      out.push(`Popup 의 close 조각에 접근 이름이 없습니다 — aria-label 이나 글을 둡니다(노드 ${node.id})`)
    }
    const title = String(shimItem(node, 0).props.title ?? '')
    if (element.getAttribute('role') !== 'dialog') {
      out.push(`Popup 뷰의 뿌리가 role="dialog" 가 아닙니다(노드 ${node.id})`)
    } else {
      const ids = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter((id) => id !== '')
      const named = ids
        .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim()
      if (ids.length === 0) out.push(`Popup 뷰의 뿌리에 aria-labelledby 가 없습니다 — 대화 상자의 이름은 제목이 짓습니다(노드 ${node.id})`)
      else if (named !== title)
        out.push(`Popup 뷰의 aria-labelledby 가 가리키는 글이 «${named}» 입니다 — 제목 «${title}» 이어야 합니다(노드 ${node.id})`)
    }
    for (const part of popupDirectParts()) {
      if (owned(`[data-wb-part="${part}"]`).some((el) => el.parentElement !== element)) {
        out.push(`Popup 의 ${part} 조각이 뿌리의 직계가 아닙니다 — 덮개 층의 굴림 규칙이 직계에만 걸려 몸통이 안 구릅니다(노드 ${node.id})`)
      }
    }
    const bodies = owned('[data-wb-part="body"]')
    if (bodies.length !== 1) {
      out.push(`Popup 뷰가 body 조각을 ${bodies.length} 개 그렸습니다 — 덮개 층은 하나뿐인 그 조각만 굴립니다(노드 ${node.id})`)
      continue
    }
    const body = bodies[0]!
    for (const child of node.children ?? []) {
      const drawn = element.querySelector(`[data-wb-id="${child.id}"]`)
      if (drawn !== null && !body.contains(drawn)) {
        out.push(`Popup 몸통 노드 ${child.id} 가 body 조각 밖에 섰습니다 — 덮개 위에서 몸통과 함께 안 구릅니다(노드 ${node.id})`)
      }
    }
    for (const child of zoneList(node, 'footer') as WbNode[]) {
      const drawn = element.querySelector(`[data-wb-id="${child.id}"]`)
      if (drawn !== null && body.contains(drawn)) {
        out.push(`Popup 바닥 노드 ${child.id} 가 body 조각 안에 섰습니다 — 몸통과 함께 굴러 단추가 창 밖으로 갑니다(노드 ${node.id})`)
      }
    }
  }
  return out
}

/** 파일 목록(카탈로그 `FileEntrySchema`) — 모양이 틀린 원소는 빈 글로 읽는다(SDK `FileAttachView` 가 그리는 값과 같게). */
function filesOf(value: unknown): { name: string; size: string }[] {
  if (!Array.isArray(value)) return []
  return value.map((file) => {
    const raw = file !== null && typeof file === 'object' ? (file as { name?: unknown; size?: unknown }) : {}
    return { name: typeof raw.name === 'string' ? raw.name : '', size: typeof raw.size === 'string' ? raw.size : '' }
  })
}

let directParts: readonly string[] | null = null

/**
 * 덮개 층 CSS(SDK 기본 뷰 시트 — `structure.tsx` 의 층 규칙)가 `[data-wb-popup-frame] > [data-wb-component="Popup"] > [data-wb-part="…"]` 로 거는
 * 조각 이름. **시트의 셀렉터를 읽어 센다** — 층 규칙에 직계 조각이 늘면 P5 가 저절로 그것까지 잰다. 하나도 못 읽으면 던진다(규칙 꼴이 바뀌어
 * P5 가 아무것도 안 재는 판을 막는다).
 */
function popupDirectParts(): readonly string[] {
  if (directParts !== null) return directParts
  const found = new Set<string>()
  for (const match of defaultViewsCss().matchAll(
    /\[data-wb-popup-frame\]\s*>\s*\[data-wb-component="Popup"\]\s*>\s*\[data-wb-part="([^"]+)"\]/g,
  )) {
    found.add(match[1]!)
  }
  if (found.size === 0) throw new Error('SDK 기본 뷰 시트에서 덮개 층의 직계 조각 규칙을 못 읽었습니다 — P5 가 아무것도 안 잽니다')
  directParts = [...found]
  return directParts
}

/** 요소의 접근 이름 — `aria-label` · `aria-labelledby` · 글 차례로 본 것(jsdom 이라 간이 셈이다). */
function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label')?.trim()
  if (label) return label
  const ids = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter((id) => id !== '')
  const named = ids
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim()
  if (named !== '') return named
  return element.textContent?.trim() ?? ''
}

/** 칸에 든 노드 — 칸 자신(제 칸 · 머리 칸의 뿌리)이나 문서 차례로 첫 노드 자손(셀 틀 조각)의 id(원본 · 사본). 없으면 `null`. */
function nodeIn(cell: Element): string | null {
  const own = cell.getAttribute('data-wb-id') ?? cell.getAttribute('data-wb-copy-of')
  if (own !== null) return own
  const inner = cell.querySelector('[data-wb-id], [data-wb-copy-of]')
  return inner === null ? null : (inner.getAttribute('data-wb-id') ?? inner.getAttribute('data-wb-copy-of'))
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
 * **그림 조각** — 체크 표시를 그리는 자리(SDK `FileAttachView` 머리말 «체크는 그림이다»). 여기서는 입력 칸도 «기대한 포커스» 가 아니다: 값 칸의 입력 조각과
 * 달리 에디터가 따로 다루는 입력 표면이 아니라서, 그림 대신 `<input type="checkbox">` 를 그리면 누른 뒤 단축키만 막힌다. `EXPECTED_FOCUS` 에서 입력 칸을
 * 빼면 값 칸의 입력 조각 전부가 경고로 서므로 이 자리만 따로 센다.
 */
const PICTURE_PART = '[data-wb-component="FileAttach"] [data-wb-part="checkbox"]'

/**
 * 그 칸 안에서 **포커스를 받는데 단추 · 링크 · 입력 칸이 아닌 요소**와 **그림 조각 안의 포커스 받는 요소**(꺼진 입력 칸은 포커스를 안 받아 뺀다).
 * 마우스 누름이 포커스를 주는 것을 센다 — `tabindex="-1"` 도 눌러서 포커스를 받는다.
 * jsdom 값이라 레이아웃 · 숨김(`display: none`)은 못 가른다 — 속성으로만 본다.
 */
function focusReceivers(container: Element): Element[] {
  const others = [...container.querySelectorAll('[tabindex], summary, video[controls], audio[controls], iframe')].filter((element) => {
    if (element.matches(EXPECTED_FOCUS)) return false
    const tabindex = element.getAttribute('tabindex')
    return tabindex === null ? true : tabindex.trim() !== '' && Number.isInteger(Number(tabindex))
  })
  const pictures = [...container.querySelectorAll(`${PICTURE_PART}, ${PICTURE_PART} *`)].filter(
    (element) => element.matches(EXPECTED_FOCUS) && !element.matches(':disabled'),
  )
  return [...new Set([...others, ...pictures])]
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
 * 보고를 사람이 읽을 줄로 — `wb-theme check` 가 찍는다. `ok` 는 둘(오류 · 안 쓰는 토큰)이 다 비었을 때만 참이다. **포커스 받는 요소 · 선언 밖
 * 레이아웃 영역은 경고 줄(`⚠`)이라 `ok` 에 안 든다** — 같은 컴포넌트 · variant · 요소는 한 줄로 묶고 칸 수를 적는다.
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
  for (const found of report.undeclaredRegions) {
    lines.push(
      `⚠ 선언 밖 영역 ${found.layout} · ${found.id} — manifest 의 layouts.${found.layout}.regions 에 없어 «보기» 메뉴가 끄지 못합니다`,
    )
  }
  const ok = report.errors.length === 0 && report.unusedTokens.length === 0
  lines.push(ok ? '✓ 오류 없음' : `✗ 오류 ${report.errors.length} · 안 쓰는 토큰 ${report.unusedTokens.length}`)
  return { ok, lines }
}
