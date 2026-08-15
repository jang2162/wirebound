/**
 * **페이지를 가리키는 상호작용 타겟**(§8.1의 `navigate`·`openModal`의 `target`)을 조립한다.
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `menu-tree.ts`와 같은 자리의 순수
 * 함수다. 이 파일이 만드는 것은 문자열과 순서뿐이다.
 *
 * ---
 *
 * # 왜 조립하나 — 저장된 문자열이 없다
 *
 * §8.1의 타겟은 `"page:관리자/회원/상세"`꼴이고 §11.3의 예시 파일 이름은
 * `관리자-회원-목록.html`이다. 둘 다 **메뉴 이름이 앞에 붙은 페이지 경로**로 읽힌다.
 * 그런데 `pages` 표에는 그 문자열이 없다(P8-4 재라 #1을 재서 확인했다 — 컬럼을 전부 열어
 * 봤고 타겟도, 그것을 담을 자리도 없다. 타겟 문자열은 `pages.schema` 안에 **가리키는
 * 쪽**으로만 있다). **그래서 조상 메뉴의 이름과 페이지 제목을 이어 만든다.**
 *
 * # 자리를 하나로 두는 방식 — 트리 한 번 도는 것이 순서이자 조상이다
 *
 * `targetedPages`가 내는 배열은 **번들에 실을 순서**이자 **페이지마다의 조상**이다. 둘을
 * 따로 계산하면 순서와 조상이 어긋나 *"남의 조상을 단 타겟"*이 생기는데, 그것은
 * `exportBundle`이 걸러 낼 수 없다 — 문자열이 그럴듯하기 때문이다.
 *
 * # 겹치는 타겟을 조용히 두지 않는다 (D3.3)
 *
 * 두 페이지가 같은 타겟을 들면 `exportBundle`이 **둘 다** 링크를 잃게 두고 런타임이
 * *"이 타겟을 가리키는 페이지가 번들에 둘 이상입니다"*라고 말한다(P8-3 이월 §3.4).
 * 조립 규칙이 그 상태를 만들 수 있으므로(같은 메뉴 아래 같은 제목 · 제목에 든 `/`)
 * `duplicateTargets`가 그것을 값으로 낸다 — 내려받기 화면이 **미리** 말할 수 있게.
 *
 * **경로 구분자를 바꾸거나 이스케이프하지 않는다.** P5-2 재라 #1이 타겟 형식을 강제하지
 * 않기로 판정했고, 저작 화면은 이 문자열을 **손으로 적는다**(재라 #2를 재서 확인했다 —
 * 고르개가 없다). 사람이 적을 수 없는 문자열을 만들면 그 자리에서 링크가 끊긴다.
 */
import type { TreeMenuNode } from './menu-tree'

/** §8.1의 접두. 렌더러도 문장화도 이 문자열을 안다(`packages/schema`의 `describePageTarget`). */
export const PAGE_TARGET_PREFIX = 'page:'

/** 타겟 문자열이 마디를 잇는 글자. §8.1의 예가 이 글자다. */
const TARGET_SEPARATOR = '/'

/**
 * 번들이 부르는 이름이 마디를 잇는 글자.
 *
 * **`/`가 아닌 이유:** 그 이름은 `<title>`·좌측 트리·파일 이름이 되는데, `pageFileNames`가
 * 위험한 글자를 `-`로 접으므로 `/`를 쓰면 `관리자-회원-목록`이 되고 화면에서는 `관리자/회원/목록`이
 * 되어 **두 자리가 다르게 읽힌다.** 공백이면 파일 이름에서만 `-`가 되고 화면은 자연스럽다
 * (§11.3의 예시 파일 이름이 `관리자-회원-목록.html`이다).
 */
const TITLE_SEPARATOR = ' '

/** 트리 순서로 펼친 페이지 하나와 그것을 가리키는 타겟. */
export interface TargetedPage {
  id: string
  /** 사람이 저작 화면에서 준 제목. 조상이 안 붙어 있다. */
  title: string
  /** 조상 메뉴의 이름들. 뿌리가 앞이다. 메뉴 바로 밑이면 하나다. */
  menuPath: readonly string[]
  /** 이 페이지를 가리키는 §8.1의 타겟 문자열. */
  target: string
  /**
   * **번들이 부르는 이름.** `<title>`·좌측 트리의 이름·파일 이름 셋이 전부 이것이다
   * (`BundlePage.title`이 그 셋의 재료다 — P8-2 이월 §1).
   *
   * P8-2 이월 §2가 넘긴 판정 ②(*"셋이 같은 문자열이어야 하는가"*)에 **그렇다**로 답한
   * 결과다. 근거는 실측이다: 조상을 안 붙이면 서로 다른 메뉴의 같은 제목이 좌측 트리에서
   * **똑같은 두 줄**이 되어 읽는 사람이 구분할 수 없다(`관리자/회원/목록`과
   * `관리자/권한/목록`이 둘 다 *"목록"*이었다).
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

/** 조상 메뉴 이름들과 페이지 제목을 이어 §8.1의 타겟 문자열을 만든다. */
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
 * 메뉴 트리를 **화면과 같은 순서**로 펼쳐 페이지마다 조상과 타겟을 붙인다.
 *
 * 순서는 `apps/web`의 좌측 트리와 같다: 형제는 `sortOrder` 오름차순이고, 한 메뉴 안에서는
 * **그 메뉴의 페이지가 먼저이고 하위 메뉴가 뒤다**(`panels/menu-tree.tsx`가 그렇게 그린다).
 * 번들의 좌측 트리가 웹 앱과 다른 순서로 서면 §11.3의 *"웹 앱과 동일하다"*가 그 자리에서
 * 거짓이 된다.
 *
 * `buildMenuTree`가 이미 `sortOrder`로 정렬해 주지만 여기서 다시 정렬한다 — 이 함수는
 * 어떤 `TreeMenuNode[]`를 받아도 같은 답을 내야 한다(그 함수와 같은 이유로 입력을
 * 신뢰하지 않는다).
 */
export function targetedPages(tree: readonly TreeMenuNode[]): TargetedPage[] {
  const found: TargetedPage[] = []

  const visit = (nodes: readonly TreeMenuNode[], ancestors: readonly string[]): void => {
    for (const node of [...nodes].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const menuPath = [...ancestors, node.title.trim()]
      for (const page of [...node.pages].sort((a, b) => a.sortOrder - b.sortOrder)) {
        found.push({
          id: page.id,
          title: page.title,
          menuPath,
          target: pageTarget(menuPath, page.title),
          bundleTitle: pageBundleTitle(menuPath, page.title),
        })
      }
      visit(node.children, menuPath)
    }
  }

  visit(tree, [])
  return found
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
