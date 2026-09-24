/**
 * **`exportBundle` — 설계서 「HTML 정적 번들」의 번들을 값으로 낸다.**
 *
 * ```
 * wirebound-export/
 *   index.html            트리 네비 + 뷰어 셸 (첫 페이지를 담는다)
 *   pages/….html          페이지마다 셸을 통째로
 *   assets/shell.css      뷰어 셸의 CSS
 *   assets/theme.css      구조 기본 CSS + 테마 컴파일 결과
 *   assets/runtime.js     상호작용 런타임 (`runtime/plan.ts`)
 * ```
 *
 * ---
 *
 * ## 파일 시스템을 모른다
 *
 * `exportPage`와 같은 규칙이다. 소비자마다 결과를 쓰는 자리가 다르다 — api(zip으로
 * 흘려보낸다) · 케이스(메모리에서 견준다). `fs`를 부르면 자리가 하나가 되고 케이스가 임시
 * 디렉터리를 만들어야 한다.
 *
 * ## `errors`를 삼키지 않는다
 *
 * `exportPage`가 그리지 못한 노드를 `errors`로 낸다. 번들은 그것을 **페이지 이름과 함께**
 * 모아 낸다. 폴백이 든 HTML도 눈으로는 그럴듯한 한 장이고 **번들은 그것을 남에게 전달한다** —
 * 여기서 값을 잃으면 호출자가 화면에서 그것을 말할 수 없다.
 *
 * ## `assets/shell.css`는 「HTML 정적 번들」의 목록에 없다 — 더한 것이고 근거가 있다
 *
 * 설계서의 예시는 `theme.css`와 `runtime.js`만 든다. 셸 CSS를 테마 CSS에 섞으면 `pageCss`의
 * 순서 계약(*"구조 기본 CSS → 테마"*)에 셸이 끼어들고, 페이지마다 `<style>`로 인라인하면
 * 페이지마다 셸을 통째로 싣는 중복(`bundle/shell.tsx` 머리말)이 CSS만큼 더 커진다.
 * **설계서의 목록은 예시이지 닫힌 목록이 아니다**(페이지도 둘만 적혀 있다).
 */
import type { NodeRenderError } from '@wirebound/renderer'
import type { PageDocument } from '@wirebound/schema'
import type { ResolvedTheme } from '@wirebound/themes'
import { DEFAULT_LANG, pageCss, renderHtmlDocument, renderPageTree } from '../page'
import { buildRuntimePlan, RUNTIME_JS, RUNTIME_JS_PATH, type RuntimePlan } from '../runtime/plan'
import { scriptJson } from '../script-json'
import { commentEntries, type BundleComment } from './comments'
import { bundleHref, pageFileNames } from './filename'
import { SHELL_CSS, SHELL_CSS_PATH } from './shell-css'
import { shellBody, shellHead, shellScripts, type ShellNavItem } from './shell'

/** 번들에 실을 페이지 하나. */
export interface BundlePage {
  /** `<title>`·좌측 트리의 이름이자 **파일 이름의 재료**다. */
  title: string
  /** 그릴 문서. `exportPage`와 같은 `PageDocument`다. */
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

export interface ExportBundleOptions {
  /** 페이지 목록. **순서가 곧 좌측 트리의 순서이고 파일 이름의 결정성이다.** */
  pages: readonly BundlePage[]
  /** 해석이 끝난 테마. 없는 것이 정상이다 — `exportPage`와 같은 계약이다. */
  theme?: ResolvedTheme | null
  /** `<html lang>`. 기본은 `'ko'`다. */
  lang?: string
}

/** 번들 안의 파일 하나. **경로는 번들 뿌리 기준의 상대 경로다.** */
export interface BundleFile {
  path: string
  content: string
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
}

const INDEX_PATH = 'index.html'
const PAGES_DIRECTORY = 'pages'
const THEME_CSS_PATH = 'assets/theme.css'

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

  const theme = options.theme ?? null
  const lang = options.lang ?? DEFAULT_LANG
  const paths = pageFileNames(pages.map((page) => page.title)).map(
    (name) => `${PAGES_DIRECTORY}/${name}`,
  )

  /**
   * **페이지마다 한 번만 그린다.** `index.html`이 첫 페이지를 담지만 같은 트리를 다시
   * 쓴다 — 두 번 그리면 `errors`가 두 벌이 되어 **같은 노드가 두 번 세어진다.**
   */
  const rendered = pages.map((page) => renderPageTree(page.document, theme))

  /**
   * **상호작용 타겟 → 번들 안의 경로.** 자리마다 다른 상대 링크로 바꾸는 것은 아래
   * `localized`가 한다 — 계획은 페이지마다 **한 번만** 만든다(판을 미리 그리는 것이
   * 비싸고, 두 번 만들면 오류도 두 벌이 된다).
   */
  const targets = new Map<string, string | null>()
  for (const [index, page] of pages.entries()) {
    if (page.target === undefined) continue
    // **먼저 온 것을 이기게 두지 않는다.** 둘 이상이면 `null`이고, 그러면 링크가 안 생기며
    // 런타임이 *"둘 이상"*이라고 말한다 — 조용히 첫 페이지로 가면 읽는 사람이 그것을
    // 알아챌 방법이 없다.
    targets.set(page.target, targets.has(page.target) ? null : paths[index]!)
  }

  /** **판정과 실행이 여기서 일어난다.** 브라우저로 나가는 것은 그 답이다. */
  const plans = pages.map((page, index) =>
    buildRuntimePlan({
      page: page.document,
      theme,
      hrefs: targets,
      baseErrors: rendered[index]!.errors,
    }),
  )

  const errors = pages.flatMap((page, index) =>
    [...rendered[index]!.errors, ...plans[index]!.errors].map((error) => ({
      path: paths[index]!,
      title: page.title,
      error,
    })),
  )

  const files: BundleFile[] = [
    { path: INDEX_PATH, content: pageHtml(options, paths, rendered, plans, 0, INDEX_PATH, lang) },
    ...pages.map((_page, index) => ({
      path: paths[index]!,
      content: pageHtml(options, paths, rendered, plans, index, paths[index]!, lang),
    })),
    { path: SHELL_CSS_PATH, content: SHELL_CSS },
    { path: THEME_CSS_PATH, content: pageCss(theme) },
    { path: RUNTIME_JS_PATH, content: RUNTIME_JS },
  ]

  return { files, errors }
}

/**
 * 계획의 링크를 **이 파일에서 보는 상대 경로**로 바꾼다.
 *
 * 계획은 번들 뿌리 기준의 경로를 든다. `index.html`과 `pages/….html`이 같은 페이지를 다른
 * 자리에서 가리키므로 링크는 파일마다 다르다 — 시트 링크가 그런 것과 같다.
 */
function localized(plan: RuntimePlan, at: string): RuntimePlan {
  return {
    ...plan,
    events: plan.events.map((event) => ({
      ...event,
      requests: event.requests.map((request) => ({
        ...request,
        href: request.href === null ? null : bundleHref(at, request.href),
      })),
    })),
  }
}

/**
 * 파일 하나의 HTML. `at`이 이 파일이 사는 자리이고, 링크가 전부 거기서부터 계산된다 —
 * `index.html`과 `pages/….html`이 **같은 셸을 다른 자리에서** 그린다.
 */
function pageHtml(
  options: ExportBundleOptions,
  paths: readonly string[],
  rendered: readonly { tree: ReturnType<typeof renderPageTree>['tree'] }[],
  plans: readonly { plan: RuntimePlan }[],
  index: number,
  at: string,
  lang: string,
): string {
  const page = options.pages[index]!
  const nav: ShellNavItem[] = options.pages.map((item, position) => ({
    title: item.title,
    href: bundleHref(at, paths[position]!),
    current: position === index,
  }))
  return renderHtmlDocument({
    lang,
    title: page.title,
    /** **셸 → 테마 순서다.** 셸이 먼저이므로 같은 특이도에서 테마가 이긴다. */
    head: shellHead([bundleHref(at, SHELL_CSS_PATH), bundleHref(at, THEME_CSS_PATH)]),
    body: shellBody({
      nav,
      description: page.description ?? null,
      comments: commentEntries(page.document, page.comments ?? []),
      page: page.document,
      documentTree: rendered[index]!.tree,
      scripts: shellScripts({
        dataJson: scriptJson(localized(plans[index]!.plan, at)),
        runtimeHref: bundleHref(at, RUNTIME_JS_PATH),
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
