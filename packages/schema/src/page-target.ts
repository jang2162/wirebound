/**
 * **페이지를 가리키는 상호작용 타겟**(설계서 「모델」(상호작용)의 `navigate`·`openModal`의 `target`)을 조립한다.
 *
 * **순수 함수라 순수 패키지에 산다.** `apps/api`에 두면 순수 패키지가 볼 수 없어
 * `wireb lint`·`wireb page get`·MCP가 각자 조립하게 되고, **두 벌이 갈리는 날 lint가
 * 멀쩡한 링크를 끊겼다고 말한다.**
 *
 * zod 외의 런타임 의존이 없고 문자열과 순서만 만든다 — CLAUDE.md의 `schema` 제약 안이다.
 *
 * ---
 *
 * # 왜 조립하나 — 저장된 문자열이 없다
 *
 * 「모델」의 타겟은 `"page:관리자/회원/상세"`꼴이고 설계서 「HTML 정적 번들」의 예시 파일 이름은
 * `관리자-회원-목록.html`이다. 둘 다 **메뉴 이름이 앞에 붙은 페이지 경로**로 읽힌다.
 * 그런데 `pages` 표에는 그 문자열이 없다(`apps/api`의 `db/types.ts` `PagesTable` — 타겟도,
 * 그것을 담을 자리도 없다. 타겟 문자열은 `pages.schema` 안에 **가리키는
 * 쪽**으로만 있다). **그래서 조상 메뉴의 이름과 페이지 제목을 이어 만든다.**
 *
 * # 자리를 하나로 두는 방식 — 한 번 도는 것이 순서이자 조상이다
 *
 * `targetedPages`가 내는 배열은 **번들에 실을 순서**이자 **페이지마다의 조상**이다. 둘을
 * 따로 계산하면 순서와 조상이 어긋나 *"남의 조상을 단 타겟"*이 생기는데, 그것은
 * `exportBundle`이 걸러 낼 수 없다 — 문자열이 그럴듯하기 때문이다.
 *
 * # 입력이 **평평한** 이유
 *
 * 입력을 중첩 트리(`apps/api`의 `TreeMenuNode[]`)로 받으면 **CLI·MCP가 평평한 스냅샷
 * payload에서 트리를 다시 조립해야 하고**, 그 조립이 두 벌째가 된다. 그래서 입력은
 * payload·lint 입력과 같은 **평평한 모양**이다.
 *
 * **`sortOrder`를 든 별도 입력형을 둔다.** `LintMenuNode`·`LintPage`를 재사용하면 안 된다 —
 * 그 둘은 `sortOrder`를 **일부러 뺐고**(`lint/input.ts`: *"어느 규칙도 보지 않으므로 없다"*)
 * 이 함수는 형제를 `sortOrder`로 다시 정렬한다. 그 정렬이 「HTML 정적 번들」의 *"번들의 좌측 트리가
 * 웹 앱과 동일하다"*를 지키는 자리다.
 *
 * # 고아와 순환을 **조용히 버린다** — `buildMenuTree`와 같은 계약이다
 *
 * 입력을 신뢰하지 않는다. 부모가 입력에 없는 메뉴 노드, 순환에 갇힌 노드, 소속 메뉴가
 * 입력에 없는 페이지는 **결과에 나타나지 않는다.** 루트로 승격시키지 않는다 — 그러면 남의
 * 조상이 붙은 타겟이 생긴다.
 *
 * **버려진 것을 부르는 쪽이 알아채야 한다.** `apps/api`의 `exportProjectBundle`이 낸 개수와
 * 입력 개수를 대조해 멈추는 것이 그 자리이고, **그 대조는 이 함수가 아니라 호출자가 한다** —
 * 여기서 던지면 *"어떤 배열이 들어와도 예외 없이 끝난다"*가 깨진다.
 *
 * # 겹치는 타겟을 조용히 두지 않는다
 *
 * 두 페이지가 같은 타겟을 들면 `exportBundle`이 **둘 다** 링크를 잃게 두고 런타임이
 * *"이 타겟을 가리키는 페이지가 번들에 둘 이상입니다"*라고 말한다.
 * 조립 규칙이 그 상태를 만들 수 있으므로(같은 메뉴 아래 같은 제목 · 제목에 든 `/`)
 * `duplicateTargets`가 그것을 값으로 낸다.
 *
 * **경로 구분자를 바꾸거나 이스케이프하지 않는다.** 검증은 타겟 형식을 강제하지 않고
 * (`validate.ts`의 `checkInteractions` 머리말), 저작 화면은 이 문자열을 **손으로 적는다.** 사람이 적을 수 없는 문자열을
 * 만들면 그 자리에서 링크가 끊긴다.
 */

/** 「모델」(상호작용)의 접두. **문장화도 이 상수를 쓴다**(`interaction/describe.ts`의 `pageName`). */
export const PAGE_TARGET_PREFIX = 'page:'

/** 타겟 문자열이 마디를 잇는 글자. 「모델」의 예가 이 글자다. */
const TARGET_SEPARATOR = '/'

/**
 * 번들이 부르는 이름이 마디를 잇는 글자.
 *
 * **`/`가 아닌 이유:** 그 이름은 `<title>`·좌측 트리·파일 이름이 되는데, `pageFileNames`가
 * 위험한 글자를 `-`로 접으므로 `/`를 쓰면 `관리자-회원-목록`이 되고 화면에서는 `관리자/회원/목록`이
 * 되어 **두 자리가 다르게 읽힌다.** 공백이면 파일 이름에서만 `-`가 되고 화면은 자연스럽다
 * (「HTML 정적 번들」의 예시 파일 이름이 `관리자-회원-목록.html`이다).
 */
const TITLE_SEPARATOR = ' '

/** 메뉴 노드 하나. **평평하다** — `parentId`가 구조를 나른다(위 머리말). */
export interface TargetMenuNode {
  id: string
  parentId: string | null
  title: string
  /** 형제 안에서의 자리. **이 필드가 없으면 「HTML 정적 번들」의 순서 보증이 깨진다.** */
  sortOrder: number
}

/** 페이지 하나. 문서를 안 든다 — 이 함수가 만드는 것은 문자열과 순서뿐이다. */
export interface TargetPage {
  id: string
  menuNodeId: string
  title: string
  sortOrder: number
}

/** `targetedPages`가 받는 프로젝트 하나. 스냅샷 payload의 두 절과 같은 모양이다. */
export interface PageTargetInput {
  menu: readonly TargetMenuNode[]
  pages: readonly TargetPage[]
}

/** 트리 순서로 펼친 페이지 하나와 그것을 가리키는 타겟. */
export interface TargetedPage {
  id: string
  /** 사람이 저작 화면에서 준 제목. 조상이 안 붙어 있다. */
  title: string
  /** 조상 메뉴의 이름들. 뿌리가 앞이다. 메뉴 바로 밑이면 하나다. */
  menuPath: readonly string[]
  /** 이 페이지를 가리키는 「모델」(상호작용)의 타겟 문자열. */
  target: string
  /**
   * **번들이 부르는 이름.** `<title>`·좌측 트리의 이름·파일 이름 셋이 전부 이것이다
   * (`BundlePage.title`이 그 셋의 재료다).
   *
   * **셋이 같은 문자열이고 조상을 붙인다.** 조상을 안 붙이면 서로 다른 메뉴의 같은 제목이
   * 좌측 트리에서 **똑같은 두 줄**이 되어 읽는 사람이 구분할 수 없다(`관리자/회원/목록`과
   * `관리자/권한/목록`이 둘 다 *"목록"*이 된다).
   */
  bundleTitle: string
}

/**
 * 조상 메뉴 이름들과 페이지 제목을 이은 마디들.
 *
 * **타겟과 이름이 둘 다 여기서 나온다.** 경로를 만드는 자리가 둘이면 링크가 가리키는 것과
 * 화면에 보이는 것이 갈릴 수 있고, 그것이 이 저장소가 반복해서 닫아 온 자리다.
 *
 * **마디마다 앞뒤 공백을 걷는다.** 제목은 `z.string().min(1)`이라 서버가 공백을 안 걷고
 * (`routes/pages.ts`의 `Title`), 걷지 않으면 화면에 `관리자`로 보이는 메뉴가 타겟에서는
 * ` 관리자 `가 되어 **사람이 적을 수 없는 문자열**이 된다.
 */
function pathSegments(menuPath: readonly string[], title: string): string[] {
  return [...menuPath, title].map((segment) => segment.trim())
}

/** 조상 메뉴 이름들과 페이지 제목을 이어 「모델」(상호작용)의 타겟 문자열을 만든다. */
export function pageTarget(menuPath: readonly string[], title: string): string {
  return `${PAGE_TARGET_PREFIX}${pathSegments(menuPath, title).join(TARGET_SEPARATOR)}`
}

/**
 * 번들이 이 페이지를 부를 이름. `pageTarget`과 **같은 마디**를 쓰고 잇는 글자만 다르다.
 */
export function pageBundleTitle(menuPath: readonly string[], title: string): string {
  return pathSegments(menuPath, title).join(TITLE_SEPARATOR)
}

/**
 * 타겟 문자열에서 「모델」(상호작용)의 **경로**만 꺼낸다(`'page:관리자/회원/목록'` → `'관리자/회원/목록'`).
 *
 * 접두가 없으면 그대로 돌려준다 — 사람이 `wireb page get 관리자/회원/목록`처럼 접두 없이
 * 치는 것이 정상이고, 그 둘을 같은 자리에서 받아야 **접두를 아는 코드가 하나**로 남는다.
 */
export function pageTargetPath(target: string): string {
  const trimmed = typeof target === 'string' ? target.trim() : ''
  return trimmed.startsWith(PAGE_TARGET_PREFIX) ? trimmed.slice(PAGE_TARGET_PREFIX.length).trim() : trimmed
}

/**
 * 메뉴와 페이지를 **화면과 같은 순서**로 펼쳐 페이지마다 조상과 타겟을 붙인다.
 *
 * 순서는 `apps/web`의 좌측 트리와 같다: 형제는 `sortOrder` 오름차순이고, 한 메뉴 안에서는
 * **그 메뉴의 페이지가 먼저이고 하위 메뉴가 뒤다**(`panels/menu-tree.tsx`가 그렇게 그린다).
 * 번들의 좌측 트리가 웹 앱과 다른 순서로 서면 「HTML 정적 번들」의 *"웹 앱과 동일하다"*가 그 자리에서
 * 거짓이 된다.
 *
 * **입력 배열의 순서에 기대지 않는다** — 어떤 배열이 들어와도 같은 답을 내야 한다.
 */
export function targetedPages(input: PageTargetInput): TargetedPage[] {
  const byParent = new Map<string | null, TargetMenuNode[]>()
  const known = new Set(input.menu.map((node) => node.id))
  for (const node of input.menu) {
    // 부모가 입력에 없으면 **뿌리로 올리지 않는다** — 남의 조상이 붙는 것을 막는다.
    const parent = node.parentId === null || known.has(node.parentId) ? node.parentId : undefined
    if (parent === undefined) continue
    const siblings = byParent.get(parent)
    if (siblings === undefined) byParent.set(parent, [node])
    else siblings.push(node)
  }

  const pagesByMenu = new Map<string, TargetPage[]>()
  for (const page of input.pages) {
    const siblings = pagesByMenu.get(page.menuNodeId)
    if (siblings === undefined) pagesByMenu.set(page.menuNodeId, [page])
    else siblings.push(page)
  }

  const found: TargetedPage[] = []
  // 순환은 여기서 멈춘다. 재귀가 부모 사슬을 타지 않고 **각 노드를 한 번씩만** 지나므로
  // 순환에 갇힌 노드는 어느 뿌리에서도 닿지 않아 결과에 안 나타난다.
  const visited = new Set<string>()

  const visit = (parentId: string | null, ancestors: readonly string[]): void => {
    for (const node of sorted(byParent.get(parentId))) {
      if (visited.has(node.id)) continue
      visited.add(node.id)
      const menuPath = [...ancestors, node.title.trim()]
      for (const page of sorted(pagesByMenu.get(node.id))) {
        found.push({
          id: page.id,
          title: page.title,
          menuPath,
          target: pageTarget(menuPath, page.title),
          bundleTitle: pageBundleTitle(menuPath, page.title),
        })
      }
      visit(node.id, menuPath)
    }
  }

  visit(null, [])
  return found
}

/** 형제를 `sortOrder`로 세운다. 입력 배열을 건드리지 않는다. */
function sorted<T extends { sortOrder: number }>(items: readonly T[] | undefined): T[] {
  return items === undefined ? [] : [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * 사람이 친 경로로 페이지를 고른다. **맞는 것 전부**를 낸다 — 0개·1개·둘 이상이 서로 다른
 * 상태이고 부르는 쪽이 그것을 갈라 말해야 한다.
 *
 * **접두를 붙여 쳐도 되고 안 붙여도 된다**(`pageTargetPath`가 둘을 같은 자리에서 받는다).
 * 마디마다 앞뒤 공백을 걷는다 — 타겟을 만드는 쪽이 그렇게 하므로 대조하는 쪽도 같아야
 * `wireb page get "관리자 / 회원 / 목록"`이 맞는다.
 *
 * **둘 이상이 나오는 것은 정상 상태다.** 같은 메뉴 아래 같은 제목이거나 제목에 `/`가 들면
 * 타겟이 겹치고(`duplicateTargets`가 그 판정을 든다), 그때 하나를 골라 주면 **어느 쪽인지
 * 아무도 모른 채** 지나간다.
 */
export function matchPageTargets(pages: readonly TargetedPage[], input: string): TargetedPage[] {
  const wanted = normalizePath(input)
  if (wanted.length === 0) return []
  return pages.filter((page) => normalizePath(page.target) === wanted)
}

/** 접두를 벗기고 마디마다 공백을 걷는다. */
function normalizePath(value: string): string {
  return pageTargetPath(value)
    .split(TARGET_SEPARATOR)
    .map((segment) => segment.trim())
    .join(TARGET_SEPARATOR)
}

/**
 * 둘 이상의 페이지가 든 타겟. **첫 등장 순서**로 낸다.
 *
 * 여기 이름이 오르면 그 타겟을 겨눈 링크는 번들 어디에도 안 생긴다 — 먼저 온 것을
 * 이기게 두면 조용히 첫 페이지로 가고, 그것은 읽는 사람이 알아챌 방법이 없다.
 */
export function duplicateTargets(pages: readonly TargetedPage[]): string[] {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const page of pages) {
    if (seen.has(page.target)) duplicated.add(page.target)
    seen.add(page.target)
  }
  return [...duplicated]
}
