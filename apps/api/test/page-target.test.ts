/**
 * **페이지를 가리키는 상호작용 타겟을 조립하는 자리**(P8-4 T1 · D3).
 *
 * 여기 있는 것은 순수 함수라 DB를 안 쓴다. `apps/api/test`에 두는 것은 그 함수가
 * `apps/api/src/services`에 살기 때문이다 — 이 저장소는 패키지마다 자기 `test/`를 갖는다.
 *
 * ## 무엇을 재는가
 *
 * §8.1의 타겟은 `"page:관리자/회원/상세"`꼴의 **페이지 경로**인데 `pages` 표에 그 문자열이
 * 없다(재라 #1을 재서 확인했다 — 컬럼은 `id·project_id·menu_node_id·title·description·
 * sort_order·schema_version·schema·head_seq` 아홉이다). 그래서 **조립한다.**
 *
 * **자리가 하나면 섞여도 안 죽는다** — 그래서 이 파일의 트리는 메뉴 둘·깊이 둘·페이지
 * 여럿이다. 페이지 하나짜리 트리로 재면 "제 조상"과 "남의 조상"이 같은 값이 되어
 * 조립이 통째로 뒤바뀌어도 통과한다.
 */
import { describe, expect, it } from 'vitest'
import type { TreeMenuNode } from '../src/services/menu-tree'
import { duplicateTargets, pageBundleTitle, pageTarget, targetedPages } from '../src/services/page-target'

/** 메뉴 노드 하나를 짓는 지름길. `sortOrder`는 형제 안에서만 뜻이 있다. */
function menu(
  id: string,
  title: string,
  sortOrder: number,
  pages: { id: string; title: string; sortOrder: number }[],
  children: TreeMenuNode[] = [],
): TreeMenuNode {
  return { id, title, sortOrder, pages, children }
}

/**
 * 메뉴 둘 · 깊이 둘 · 페이지 다섯.
 *
 * ```
 * 관리자          (m1)
 *   대시보드      (p1)
 *   회원          (m2)
 *     목록        (p2)
 *     상세        (p3)
 * 마케팅          (m3)
 *   랜딩          (p4)
 *   회원          (m4)
 *     목록        (p5)   ← m2/목록과 **제목이 같고 조상이 다르다**
 * ```
 */
function 트리(): TreeMenuNode[] {
  return [
    menu(
      'm1',
      '관리자',
      0,
      [{ id: 'p1', title: '대시보드', sortOrder: 0 }],
      [
        menu('m2', '회원', 0, [
          { id: 'p2', title: '목록', sortOrder: 0 },
          { id: 'p3', title: '상세', sortOrder: 1 },
        ]),
      ],
    ),
    menu(
      'm3',
      '마케팅',
      1,
      [{ id: 'p4', title: '랜딩', sortOrder: 0 }],
      [menu('m4', '회원', 0, [{ id: 'p5', title: '목록', sortOrder: 0 }])],
    ),
  ]
}

describe('pageTarget', () => {
  it('조상 메뉴와 페이지 제목을 이어 §8.1의 꼴을 만든다', () => {
    expect(pageTarget(['관리자', '회원'], '상세')).toBe('page:관리자/회원/상세')
  })

  it('메뉴 없이 붙은 페이지는 제목 하나가 경로다', () => {
    expect(pageTarget([], '상세')).toBe('page:상세')
  })

  /**
   * 제목은 `z.string().min(1)`이라 서버가 앞뒤 공백을 **안 걷는다**(`routes/pages.ts`의
   * `Title`). 걷지 않으면 화면에 `관리자`로 보이는 메뉴가 타겟에서는 ` 관리자 `가 되어
   * 사람이 적을 수 없는 문자열이 된다.
   */
  it('마디마다 앞뒤 공백을 걷는다', () => {
    expect(pageTarget(['  관리자  ', '회원 '], ' 상세')).toBe('page:관리자/회원/상세')
  })
})

describe('pageBundleTitle', () => {
  /**
   * **번들이 부르는 이름**(P8-2 이월 §2의 판정 ②). `<title>`·좌측 트리의 이름·파일 이름
   * 셋이 전부 이것이다. 조상을 안 붙이면 서로 다른 메뉴의 같은 제목이 트리에서 **똑같은
   * 두 줄**이 된다.
   */
  it('조상 메뉴와 페이지 제목을 공백으로 잇는다', () => {
    expect(pageBundleTitle(['관리자', '회원'], '상세')).toBe('관리자 회원 상세')
  })

  /**
   * **`/`로 이으면 안 된다.** 이 문자열은 파일 이름의 재료이고 `pageFileNames`가 위험한
   * 글자를 `-`로 접는다 — `/`를 쓰면 화면에는 `관리자/회원/목록`, 파일에는
   * `관리자-회원-목록`이 되어 **두 자리가 다르게 읽힌다.** 공백이면 파일에서만 `-`가 된다.
   */
  it('타겟의 구분자를 쓰지 않는다', () => {
    expect(pageBundleTitle(['관리자', '회원'], '상세')).not.toContain('/')
  })

  /**
   * **타겟과 같은 마디에서 나온다.** 마디를 만드는 자리가 둘이면 링크가 가리키는 것과
   * 화면에 보이는 것이 갈린다 — 여기서는 **같은 공백 걷기**를 두 함수가 함께 받는지로 잰다.
   */
  it('타겟과 같은 방식으로 마디를 다듬는다', () => {
    const menuPath = ['  관리자  ', '회원 ']
    const title = ' 상세'
    expect(pageTarget(menuPath, title)).toBe('page:관리자/회원/상세')
    expect(pageBundleTitle(menuPath, title)).toBe('관리자 회원 상세')
  })

  it('메뉴 없이 붙은 페이지는 제목 하나가 이름이다', () => {
    expect(pageBundleTitle([], '상세')).toBe('상세')
  })
})

describe('targetedPages', () => {
  it('트리 순서대로 낸다 — 그 메뉴의 페이지가 먼저이고 하위 메뉴가 뒤다', () => {
    expect(targetedPages(트리()).map((page) => page.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('페이지마다 **제 조상**을 든다', () => {
    const byId = new Map(targetedPages(트리()).map((page) => [page.id, page.menuPath]))
    expect(byId.get('p1')).toEqual(['관리자'])
    expect(byId.get('p2')).toEqual(['관리자', '회원'])
    expect(byId.get('p3')).toEqual(['관리자', '회원'])
    expect(byId.get('p4')).toEqual(['마케팅'])
    expect(byId.get('p5')).toEqual(['마케팅', '회원'])
  })

  it('페이지마다 **제 번들 이름**을 든다 — 조상이 붙어 있다', () => {
    expect(targetedPages(트리()).map((page) => page.bundleTitle)).toEqual([
      '관리자 대시보드',
      '관리자 회원 목록',
      '관리자 회원 상세',
      '마케팅 랜딩',
      '마케팅 회원 목록',
    ])
  })

  /**
   * **이것이 B를 고른 이유다.** 제목만 쓰면 이 둘이 좌측 트리에서 똑같은 두 줄이 된다
   * (D8 스모크에서 실측했다 — `['목록','목록']`).
   */
  it('제목이 같아도 조상이 다르면 번들 이름이 다르다', () => {
    const names = targetedPages(트리())
      .filter((page) => page.title === '목록')
      .map((page) => page.bundleTitle)
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
  })

  it('페이지마다 **제 타겟**을 든다', () => {
    expect(targetedPages(트리()).map((page) => page.target)).toEqual([
      'page:관리자/대시보드',
      'page:관리자/회원/목록',
      'page:관리자/회원/상세',
      'page:마케팅/랜딩',
      'page:마케팅/회원/목록',
    ])
  })

  /**
   * **제목이 같아도 조상이 다르면 타겟이 다르다.** 이것이 조립 규칙을 제목 하나가 아니라
   * 경로로 잡은 이유다 — 제목만 쓰면 `목록`이 둘이라 **둘 다 링크를 잃는다**(사실 3).
   */
  it('제목이 같은 두 페이지가 조상으로 갈린다', () => {
    const targets = targetedPages(트리()).filter((page) => page.title === '목록')
    expect(targets).toHaveLength(2)
    expect(new Set(targets.map((page) => page.target)).size).toBe(2)
  })

  it('형제 순서는 sortOrder다 — 입력 배열 순서가 아니다', () => {
    const tree = [
      menu('m1', '관리자', 0, [
        { id: 'p2', title: '둘째', sortOrder: 1 },
        { id: 'p1', title: '첫째', sortOrder: 0 },
      ]),
    ]
    expect(targetedPages(tree).map((page) => page.id)).toEqual(['p1', 'p2'])
  })

  it('하위 메뉴 형제 순서도 sortOrder다', () => {
    const tree = [
      menu(
        'm1',
        '뿌리',
        0,
        [],
        [
          menu('m3', '둘째', 1, [{ id: 'p2', title: 'B', sortOrder: 0 }]),
          menu('m2', '첫째', 0, [{ id: 'p1', title: 'A', sortOrder: 0 }]),
        ],
      ),
    ]
    expect(targetedPages(tree).map((page) => page.id)).toEqual(['p1', 'p2'])
  })
})

describe('duplicateTargets', () => {
  /**
   * **조립 규칙을 정할 때 이것부터 본다**(D3.3). 같은 타겟을 든 페이지가 둘이면
   * `exportBundle`이 **둘 다** 링크를 잃게 두고 런타임이 그렇게 말한다.
   */
  it('같은 메뉴 아래 같은 제목이면 타겟이 겹친다', () => {
    const tree = [
      menu('m1', '관리자', 0, [
        { id: 'p1', title: '목록', sortOrder: 0 },
        { id: 'p2', title: '목록', sortOrder: 1 },
      ]),
    ]
    expect(duplicateTargets(targetedPages(tree))).toEqual(['page:관리자/목록'])
  })

  /**
   * **제목에 `/`가 들어가면 다른 조상의 페이지와 같아질 수 있다.** 경로 구분자를 강제로
   * 바꾸지 않는 것은 P5-2 재라 #1의 판정(형식을 강제하지 않는다) 때문이고, 대신 **겹치면
   * 말한다.**
   */
  it('제목에 든 슬래시가 하위 메뉴 경로와 부딪히면 겹친다', () => {
    const tree = [
      menu(
        'm1',
        '관리자',
        0,
        [{ id: 'p1', title: '회원/목록', sortOrder: 0 }],
        [menu('m2', '회원', 0, [{ id: 'p2', title: '목록', sortOrder: 0 }])],
      ),
    ]
    expect(duplicateTargets(targetedPages(tree))).toEqual(['page:관리자/회원/목록'])
  })

  it('겹치는 것이 없으면 빈 목록이다', () => {
    expect(duplicateTargets(targetedPages(트리()))).toEqual([])
  })

  it('같은 타겟이 셋이어도 한 번만 낸다', () => {
    const tree = [
      menu('m1', '관리자', 0, [
        { id: 'p1', title: '목록', sortOrder: 0 },
        { id: 'p2', title: '목록', sortOrder: 1 },
        { id: 'p3', title: '목록', sortOrder: 2 },
      ]),
    ]
    expect(duplicateTargets(targetedPages(tree))).toEqual(['page:관리자/목록'])
  })
})
