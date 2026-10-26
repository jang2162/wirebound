/**
 * **`exportBundle` — 설계서 「HTML 정적 번들」의 번들을 값으로 낸다.**
 *
 * ```
 * wirebound-export/
 *   index.html            첫 페이지의 사본
 *   pages/….html          셸(여기서 그린다) + 빈 목업 자리 + 페이지 JSON + 스크립트
 *   assets/shell.css      뷰어 셸의 CSS
 *   assets/views.css      SDK 기본 뷰 CSS(`defaultViewsCss()`)
 *   assets/runtime.js     내보내기 런타임 — 목업을 브라우저에서 그린다(`src/browser/`)
 *   assets/theme/**       프로젝트 테마 패키지의 파일 그대로(theme.js · theme.css · assets/**) — 테마가 있을 때
 *   assets/tokens.css     프로젝트 토큰 값 → CSS 변수(`tokensCss`) — 테마가 있을 때
 *   assets/images/<id>.<ext>  페이지가 든 그림(자리표시자의 `image`) — 호출자가 그 프로젝트가 가진 것만 넘긴다
 * ```
 *
 * 페이지 머리의 문서 시트는 캔버스와 같은 차례다 — 기본 뷰 → 테마(`theme.css` link) → 토큰(spec 「캔버스 iframe」 의 «머리의 시트는
 * 셋이고 차례가 곧 겹침이다»). 패키지가 `theme.css` 를 안 실었으면 그 link 를 안 싣는다.
 *
 * ---
 *
 * ## 목업은 브라우저가 그린다 — 여기는 셸과 데이터만 낸다
 *
 * 목업은 테마 코드(뷰)로 그려지고 **테마 코드는 브라우저에서만 돈다**(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`
 * 「내보내기와 PPTX」). 그래서 페이지는 목업 자리를 비워 두고 페이지 JSON(`page-data.ts` 의 `ExportPageData`)을 싣는다 —
 * `runtime.js` 가 그것을 캔버스 미리보기와 같은 렌더러로 그린다. 셸(트리 · 설명 · 코멘트 · 상호작용 문장)은 이 패키지의 코드라
 * 지금처럼 여기서 그린다.
 *
 * ## 파일 시스템을 모른다
 *
 * 소비자마다 결과를 쓰는 자리가 다르다 — api(zip으로 흘려보낸다 · PPTX 의 Chromium 에 메모리로 내준다) · 케이스(메모리에서 견준다).
 * `fs`를 부르면 자리가 하나가 되고 케이스가 임시 디렉터리를 만들어야 한다. 런타임 글자(`runtimeJs`)도 그래서 호출자가 읽어 넘긴다.
 *
 * ## `errors` — 기본 뷰로도 못 그리는 노드
 *
 * 노드의 모양이 카탈로그에 안 맞으면 렌더러가 폴백 상자를 그리고 `onNodeError` 로 보고한다 — 그 판정은 엘리먼트를 지을 때
 * 동기로 끝나므로 그리지 않고도 센다(`structuralErrors`). 폴백이 든 번들도 눈으로는 그럴듯한 한 장이라 **페이지 이름과 함께**
 * 모아 낸다. 테마 뷰가 던지는 것은 브라우저에서만 난다 — 그것은 런타임이 상태 줄과 `data-wb-failed` 로 말한다(`browser/boot.tsx`).
 *
 * ## `assets/shell.css`는 「HTML 정적 번들」의 목록에 없다 — 더한 것이고 근거가 있다
 *
 * 셸 CSS를 문서 CSS에 섞으면 문서 시트의 차례(기본 뷰 → 테마 → 토큰)에 셸이 끼어든다. **설계서의 목록은 예시이지 닫힌 목록이
 * 아니다**(페이지도 둘만 적혀 있다).
 */
import { isPopupDocument, renderDocument, type NodeRenderError } from '@wirebound/renderer'
import { imageIdsIn, installCatalog, isPageTargetAction, type PageDocument } from '@wirebound/schema'
import { defaultViewsCss, type ThemeManifest } from '@wirebound/theme-sdk'
import { tokensCss } from '@wirebound/themes'
import { eachNode } from '../nodes'
import { DEFAULT_LANG, renderHtmlDocument } from '../page'
import { IMAGES_DIRECTORY, RUNTIME_JS_PATH, THEME_DIRECTORY, type ExportMarker, type ExportPageData, type ExportPopup } from '../page-data'
import { scriptJson } from '../script-json'
import { commentEntries, type BundleComment } from './comments'
import { bundleHref, pageFileNames } from './filename'
import { SHELL_CSS, SHELL_CSS_PATH } from './shell-css'
import { shellBody, shellHead, shellScripts, type ShellNavItem } from './shell'

/** 번들에 실을 페이지 하나. */
export interface BundlePage {
  /** `<title>`·좌측 트리의 이름이자 **파일 이름의 재료**다. */
  title: string
  /** 그릴 문서. 페이지 문서다 — 레이아웃을 합성하지 않는다(캔버스가 그리는 것과 같다). */
  document: PageDocument
  /**
   * 설계서 「페이지 JSON」 봉투의 `page.description`. 우측 *"페이지 설명"* 탭이 그린다.
   * 없으면 탭이 **없다고 말한다** — 탭 자체는 설계서 「설계서 화면 구조」가 든다.
   */
  description?: string | null
  /**
   * 이 페이지의 코멘트. **어디서 오는지는 호출자가 정한다** — 출처가 셋이고 성질이 다르다
   * (`bundle/comments.ts` 머리말).
   */
  comments?: readonly BundleComment[]
  /**
   * 이 페이지를 가리키는 **상호작용 타겟**(설계서 「상호작용」 「모델」이 정한
   * `navigate`·`openModal`의 `target`).
   * 예: `'page:관리자/회원/상세'`.
   *
   * **없으면 이 페이지로 오는 링크가 안 생긴다** — 그것도 정상이다. 타겟은 페이지 경로이고
   * (검증기가 형식을 강제하지 않는다) 번들이 드는 것은 제목뿐이라, **어느
   * 문자열이 이 페이지를 가리키는지는 번들이 알 수 없다.** 제목으로 짐작하지 않는다 —
   * 짐작이 맞으면 링크가 되고 틀리면 조용히 아무 데도 안 가는데, 그 둘이 화면에서 같다.
   *
   * 링크가 안 생기면 **런타임이 그렇게 말한다** — 조용히 아무 일도 안 일어나지 않는다.
   */
  target?: string
}

/**
 * 번들에 실을 프로젝트 테마 — 프로젝트가 고정한 `테마@판` 의 패키지 파일과 저장한 토큰. **코드를 실행하지 않는다** — `themeJs` 는
 * 글자로 실어 브라우저가 돌린다(spec 「내보내기와 PPTX」 의 «테마 코드는 브라우저에서만 돈다»).
 */
export interface BundleTheme {
  ref: { themeId: string; version: string }
  /** 서버 manifest — 런타임이 번들 정의의 manifest 를 이것으로 바꿔 끼운다(`adoptManifest`). 토큰 CSS 도 이것으로 짓는다. */
  manifest: ThemeManifest
  /** 프로젝트가 저장한 토큰(기본값과 다른 것만). */
  tokens: Record<string, string | number>
  themeJs: string
  themeCss: string | null
  /** 패키지의 `assets/**` — 키는 패키지 안 경로(`assets/…`). `theme.css` 가 상대 경로로 가리키므로 그 모양 그대로 싣는다. */
  assets: readonly (readonly [string, Uint8Array])[]
}

export interface ExportBundleOptions {
  /** 페이지 목록. **순서가 곧 좌측 트리의 순서이고 파일 이름의 결정성이다.** */
  pages: readonly BundlePage[]
  /** 내보내기 런타임의 글자(`@wirebound/exporter/runtime.js` — 저장소 빌드가 짓는다). `assets/runtime.js` 에 그대로 싣는다. */
  runtimeJs: string
  /** 프로젝트 테마. 없으면(`null` · 생략) 모든 노드를 SDK 기본 뷰로 그린다. */
  theme?: BundleTheme | null
  /** `<html lang>`. 기본은 `'ko'`다. */
  lang?: string
  /**
   * 실을 그림 — `assets/images/<id>.<ext>`. **호출자가 그 프로젝트가 가진 그림만 넘긴다**(해시를 안다고 싣지 않는다 — 권한은 소유 행이 가른다).
   * 페이지가 들었는데 여기 없는 id 는 런타임이 «그림을 불러올 수 없음» 으로 그린다.
   */
  images?: readonly BundleImage[]
}

/** 번들에 실을 그림 하나. */
export interface BundleImage {
  id: string
  /** 파일 이름의 확장자(`png` · `jpg` · `webp` · `gif` · `svg`). */
  ext: string
  bytes: Uint8Array
}

/** 번들 안의 파일 하나. **경로는 번들 뿌리 기준의 상대 경로다.** */
export interface BundleFile {
  path: string
  content: string | Uint8Array
}

/** 그리지 못한 노드 하나. **어느 페이지의 것인지 함께 든다.** */
export interface BundleNodeError {
  /** 그 페이지의 번들 안 경로. */
  path: string
  /** 그 페이지의 제목. 경로는 잘리거나 순번이 붙어 제목과 다를 수 있다. */
  title: string
  error: NodeRenderError
}

export interface ExportedBundle {
  files: BundleFile[]
  errors: BundleNodeError[]
  /** 페이지마다 번들 안 경로 — `pages` 와 같은 순서(`index.html` 은 첫 페이지의 사본이라 따로 없다). */
  pagePaths: string[]
}

const INDEX_PATH = 'index.html'
const PAGES_DIRECTORY = 'pages'
const VIEWS_CSS_PATH = 'assets/views.css'
const TOKENS_CSS_PATH = 'assets/tokens.css'
const THEME_JS_PATH = `${THEME_DIRECTORY}/theme.js`
const THEME_CSS_PATH = `${THEME_DIRECTORY}/theme.css`

/**
 * 번들 하나를 만든다.
 *
 * **페이지가 하나도 없으면 던진다.** 빈 번들을 내면 받는 사람이 그것을 푼 뒤에야 비었다는
 * 것을 안다 — *"페이지 여럿을 오가며 본다"*가 이 산출물의 존재 이유이고 0개는 그 대상이
 * 아니다. 빈 프로젝트를 무엇으로 말할지는 **화면의 판정**이므로 순수 패키지는 그
 * 상태를 값으로 위장하지 않고 호출자에게 되돌린다.
 */
export function exportBundle(options: ExportBundleOptions): ExportedBundle {
  const pages = options.pages
  if (pages.length === 0) throw new Error('번들에 실을 페이지가 없습니다')

  const lang = options.lang ?? DEFAULT_LANG
  const paths = pageFileNames(pages.map((page) => page.title)).map((name) => `${PAGES_DIRECTORY}/${name}`)

  /**
   * **상호작용 타겟 → 번들 안의 경로.** 자리마다 다른 상대 링크로 바꾸는 것은 `pageHtml` 이 한다.
   *
   * **먼저 온 것을 이기게 두지 않는다.** 둘 이상이면 `null`이고, 그러면 링크가 안 생기며 런타임이 *"둘 이상"*이라고 말한다 —
   * 조용히 첫 페이지로 가면 읽는 사람이 그것을 알아챌 방법이 없다.
   */
  const targets = new Map<string, string | null>()
  for (const [index, page] of pages.entries()) {
    if (page.target === undefined) continue
    targets.set(page.target, targets.has(page.target) ? null : paths[index]!)
  }
  /** 타겟 → 팝업 페이지의 문서 — 그 타겟을 든 페이지가 하나이고 뿌리가 `Popup` 일 때만(`ExportPageData.popups`). */
  const popupDocs = new Map<string, PageDocument>()
  for (const [index, page] of pages.entries()) {
    if (page.target !== undefined && targets.get(page.target) === paths[index] && isPopupDocument(page.document)) {
      popupDocs.set(page.target, page.document)
    }
  }

  const errors = pages.flatMap((page, index) =>
    structuralErrors(page.document).map((error) => ({ path: paths[index]!, title: page.title, error })),
  )

  const files: BundleFile[] = [
    { path: INDEX_PATH, content: pageHtml(options, paths, targets, popupDocs, 0, INDEX_PATH, lang) },
    ...pages.map((_page, index) => ({
      path: paths[index]!,
      content: pageHtml(options, paths, targets, popupDocs, index, paths[index]!, lang),
    })),
    { path: SHELL_CSS_PATH, content: SHELL_CSS },
    { path: VIEWS_CSS_PATH, content: defaultViewsCss() },
    { path: RUNTIME_JS_PATH, content: options.runtimeJs },
    ...themeFiles(options.theme ?? null),
    ...(options.images ?? []).map((image) => ({ path: imagePath(image), content: image.bytes })),
  ]

  return { files, errors, pagePaths: paths }
}

function imagePath(image: BundleImage): string {
  return `${IMAGES_DIRECTORY}/${image.id}.${image.ext}`
}

/** 이 문서가 든 그림 가운데 번들에 실린 것 → **이 파일에서 본** 상대 경로(`ExportPageData.images`). */
function imageHrefs(page: PageDocument, images: readonly BundleImage[], at: string): Record<string, string> {
  const byId = new Map(images.map((image) => [image.id, image]))
  const out: Record<string, string> = {}
  for (const id of imageIdsIn([page.root])) {
    const image = byId.get(id)
    if (image !== undefined) out[id] = bundleHref(at, imagePath(image))
  }
  return out
}

/** 테마 패키지의 파일 그대로 · 토큰 CSS. 테마가 없으면 하나도 안 싣는다. */
function themeFiles(theme: BundleTheme | null): BundleFile[] {
  if (theme === null) return []
  return [
    { path: THEME_JS_PATH, content: theme.themeJs },
    ...(theme.themeCss === null ? [] : [{ path: THEME_CSS_PATH, content: theme.themeCss }]),
    ...theme.assets.map(([path, bytes]) => ({ path: `${THEME_DIRECTORY}/${path}`, content: bytes })),
    { path: TOKENS_CSS_PATH, content: tokensCss(theme.manifest, theme.tokens).css },
  ]
}

/**
 * 기본 뷰로도 못 그리는 노드(머리말의 `errors`). 엘리먼트만 짓고 그리지 않는다 — 판정이 짓는 동안 동기로 끝난다(렌더러의
 * `onNodeError`). **카탈로그를 스스로 설치한다** — 멱등이고 이미 등록된 것을 건너뛴다(`packages/schema` 의 `installCatalog`).
 */
function structuralErrors(page: PageDocument): NodeRenderError[] {
  installCatalog()
  const errors: NodeRenderError[] = []
  renderDocument(page, { onNodeError: (error) => errors.push(error) })
  return errors
}

/**
 * 이 문서가 겨누는 타겟 → **이 파일에서 본** 상대 경로(`ExportPageData.hrefs`). 겨누지 않는 타겟은 싣지 않는다 — 페이지마다 번들
 * 전체의 표를 실으면 크기가 페이지 수의 제곱이 된다.
 */
function hrefsFor(page: PageDocument, targets: ReadonlyMap<string, string | null>, at: string): Record<string, string | null> {
  const hrefs: Record<string, string | null> = {}
  for (const target of pageTargetsIn(page, false)) {
    if (!targets.has(target)) continue
    const path = targets.get(target)!
    hrefs[target] = path === null ? null : bundleHref(at, path)
  }
  return hrefs
}

/** 문서가 겨누는 페이지 타겟(`navigate` · `openModal`) — `modalOnly` 면 «팝업 열기» 만. 문서 차례 · 겹침 없음. */
function pageTargetsIn(page: PageDocument, modalOnly: boolean): string[] {
  const found = new Set<string>()
  for (const node of eachNode(page.root)) {
    for (const interaction of Array.isArray(node.interactions) ? node.interactions : []) {
      for (const action of Array.isArray(interaction?.actions) ? interaction.actions : []) {
        if (action === null || typeof action !== 'object' || !isPageTargetAction(action) || typeof action.target !== 'string') continue
        if (modalOnly && action.type !== 'openModal') continue
        found.add(action.target)
      }
    }
  }
  return [...found]
}

/**
 * 이 문서에서 «팝업 열기» 로 닿는 팝업 문서(`ExportPageData.popups`) — 팝업이 연 팝업까지 닫힌 셈으로, 타겟마다 한 벌. 이 문서 자신이 팝업이면
 * 그것도 다시 열 수 있다(제 타겟을 겨누면). 그림 경로는 여는 파일(`at`)에서 본 것이다.
 */
function popupsFor(
  page: PageDocument,
  popupDocs: ReadonlyMap<string, PageDocument>,
  images: readonly BundleImage[],
  at: string,
): Record<string, ExportPopup> {
  const out: Record<string, ExportPopup> = {}
  const queue = [page]
  for (let doc = queue.shift(); doc !== undefined; doc = queue.shift()) {
    for (const target of pageTargetsIn(doc, true)) {
      const popup = popupDocs.get(target)
      if (popup === undefined || target in out) continue
      const hrefs = imageHrefs(popup, images, at)
      out[target] = { document: popup, ...(Object.keys(hrefs).length === 0 ? {} : { images: hrefs }) }
      queue.push(popup)
    }
  }
  return out
}

/**
 * 파일 하나의 HTML. `at`이 이 파일이 사는 자리이고, 링크가 전부 거기서부터 계산된다 —
 * `index.html`과 `pages/….html`이 **같은 셸을 다른 자리에서** 그린다.
 */
function pageHtml(
  options: ExportBundleOptions,
  paths: readonly string[],
  targets: ReadonlyMap<string, string | null>,
  popupDocs: ReadonlyMap<string, PageDocument>,
  index: number,
  at: string,
  lang: string,
): string {
  const page = options.pages[index]!
  const nav: ShellNavItem[] = options.pages.map((item, position) => ({
    title: item.title,
    href: bundleHref(at, paths[position]!),
    current: position === index,
    popup: isPopupDocument(item.document),
  }))
  const comments = commentEntries(page.document, page.comments ?? [])
  const markers: ExportMarker[] = []
  for (const entry of comments) {
    if (entry.marker !== null) markers.push({ nodeId: entry.nodeId, marker: String(entry.marker) })
  }
  const theme = options.theme ?? null
  const images = imageHrefs(page.document, options.images ?? [], at)
  const popups = popupsFor(page.document, popupDocs, options.images ?? [], at)
  const data: ExportPageData = {
    document: page.document,
    title: page.title,
    target: page.target ?? null,
    themeRef: theme === null ? null : { themeId: theme.ref.themeId, version: theme.ref.version },
    manifest: theme === null ? null : theme.manifest,
    tokens: theme === null ? {} : theme.tokens,
    hrefs: hrefsFor(page.document, targets, at),
    markers,
    ...(Object.keys(images).length === 0 ? {} : { images }),
    ...(Object.keys(popups).length === 0 ? {} : { popups }),
  }
  return renderHtmlDocument({
    lang,
    title: page.title,
    /** **셸 → 문서 시트 차례다.** 문서 시트의 차례는 캔버스와 같다(기본 뷰 → 테마 → 토큰). */
    head: shellHead([
      { href: bundleHref(at, SHELL_CSS_PATH) },
      { href: bundleHref(at, VIEWS_CSS_PATH) },
      ...(theme === null || theme.themeCss === null ? [] : [{ href: bundleHref(at, THEME_CSS_PATH), sheet: 'theme' as const }]),
      ...(theme === null ? [] : [{ href: bundleHref(at, TOKENS_CSS_PATH) }]),
    ]),
    body: shellBody({
      nav,
      description: page.description ?? null,
      comments,
      page: page.document,
      scripts: shellScripts({
        dataJson: scriptJson(data),
        runtimeHref: bundleHref(at, RUNTIME_JS_PATH),
        themeHref: theme === null ? null : bundleHref(at, THEME_JS_PATH),
      }),
    }),
  })
}

/**
 * **`BundleComment`만 다시 낸다.** `BundlePage`가 그 타입을 들므로 호출자가 그것 없이는
 * 입력을 지을 수 없다. 나머지(파일 이름 함수·셸 CSS·코멘트 줄)는 **안에 둔다** — 소비자가
 * 없는데 표면에 내면 그것도 계약이 된다.
 */
export type { BundleComment } from './comments'
