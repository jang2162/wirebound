/**
 * **페이지를 가리키는 상호작용 타겟을 조립하는 자리.**
 *
 * 함수가 `packages/schema`에 살므로 그것을 재는 자도 여기 둔다 — 이 저장소는 패키지마다
 * 자기 `test/`를 갖는다.
 *
 * ## 무엇을 재는가
 *
 * 설계서 「상호작용」의 「모델」이 말하는 타겟은 `"page:관리자/회원/상세"`꼴의 **페이지 경로**인데
 * `pages` 표에 그 문자열이 없다(컬럼은 `id·project_id·menu_node_id·title·description·
 * sort_order·schema_version·schema·head_seq` 아홉이다 — 다시 재는 곳: `apps/api/src/db/types.ts`의
 * `pages` 행 타입). 그래서 **조립한다.**
 *
 * **자리가 하나면 섞여도 안 죽는다** — 그래서 이 파일의 트리는 메뉴 둘·깊이 둘·페이지
 * 여럿이다. 페이지 하나짜리 트리로 재면 "제 조상"과 "남의 조상"이 같은 값이 되어
 * 조립이 통째로 뒤바뀌어도 통과한다.
 *
 * ## 트리로 적고 평평하게 넘긴다
 *
 * 입력은 평평하지만(`{ menu, pages }`) **픽스처는 트리로 적는다** — 조상 관계를
 * 눈으로 읽을 수 있어야 *"남의 조상"*을 재는 케이스가 뜻을 갖는다. `평평하게`가 그 사이를
 * 잇는다. **아래 두 케이스(*"형제 순서는 sortOrder다"*·*"하위 메뉴 형제 순서도 sortOrder다"*)를
 * 지우지 말 것** — 그 둘이 번들의 트리 네비가 웹 앱과 같다는 설계서 「HTML 정적 번들」의
 * 보증(좌측 트리 순서)을 지키는 자다.
 * 평평한 입력에서도 그 둘은 그대로 구분력을 갖는다: `sortOrder`를 배열 순서와 어긋나게
 * 주므로, 정렬을 빠뜨리면 배열 순서가 그대로 나와 죽는다.
 */
import { describe, expect, it } from 'vitest'
import { describePageTarget } from '../src/interaction/describe'
import {
  PAGE_TARGET_PREFIX,
  duplicateTargets,
  pageBundleTitle,
  pageTarget,
  pageTargetPath,
  targetedPages,
  type PageTargetInput,
} from '../src/page-target'

/** 픽스처를 적는 말. 실제 입력형이 아니다 — `평평하게`가 옮긴다. */
interface 트리노드 {
  id: string
  title: string
  sortOrder: number
  pages: { id: string; title: string; sortOrder: number }[]
  children: 트리노드[]
}

/** 메뉴 노드 하나를 짓는 지름길. `sortOrder`는 형제 안에서만 뜻이 있다. */
function menu(
  id: string,
  title: string,
  sortOrder: number,
  pages: { id: string; title: string; sortOrder: number }[],
  children: 트리노드[] = [],
): 트리노드 {
  return { id, title, sortOrder, pages, children }
}

/**
 * 트리 픽스처를 `targetedPages`의 평평한 입력으로 옮긴다.
 *
 * **배열 순서를 보존한다** — 뒤섞으면 위 두 케이스가 재려던 것(*"정렬이 배열 순서를
 * 이긴다"*)이 이 함수 안에서 미리 일어나 케이스가 공허해진다.
 */
function 평평하게(tree: 트리노드[]): PageTargetInput {
  const menuNodes: PageTargetInput['menu'][number][] = []
  const pages: PageTargetInput['pages'][number][] = []
  const visit = (nodes: 트리노드[], parentId: string | null): void => {
    for (const node of nodes) {
      menuNodes.push({ id: node.id, parentId, title: node.title, sortOrder: node.sortOrder })
      for (const page of node.pages) {
        pages.push({ id: page.id, menuNodeId: node.id, title: page.title, sortOrder: page.sortOrder })
      }
      visit(node.children, node.id)
    }
  }
  visit(tree, null)
  return { menu: menuNodes, pages }
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
function 트리(): 트리노드[] {
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
  it('조상 메뉴와 페이지 제목을 이어 page: 타겟의 꼴을 만든다', () => {
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
   * **번들이 부르는 이름.** `<title>`·좌측 트리의 이름·파일 이름
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
    expect(targetedPages(평평하게(트리())).map((page) => page.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('페이지마다 **제 조상**을 든다', () => {
    const byId = new Map(targetedPages(평평하게(트리())).map((page) => [page.id, page.menuPath]))
    expect(byId.get('p1')).toEqual(['관리자'])
    expect(byId.get('p2')).toEqual(['관리자', '회원'])
    expect(byId.get('p3')).toEqual(['관리자', '회원'])
    expect(byId.get('p4')).toEqual(['마케팅'])
    expect(byId.get('p5')).toEqual(['마케팅', '회원'])
  })

  it('페이지마다 **제 번들 이름**을 든다 — 조상이 붙어 있다', () => {
    expect(targetedPages(평평하게(트리())).map((page) => page.bundleTitle)).toEqual([
      '관리자 대시보드',
      '관리자 회원 목록',
      '관리자 회원 상세',
      '마케팅 랜딩',
      '마케팅 회원 목록',
    ])
  })

  /**
   * **번들 이름에 조상을 잇는 이유가 이것이다.** 제목만 쓰면 이 둘이 좌측 트리에서
   * 똑같은 두 줄(`['목록','목록']`)이 된다.
   */
  it('제목이 같아도 조상이 다르면 번들 이름이 다르다', () => {
    const names = targetedPages(평평하게(트리()))
      .filter((page) => page.title === '목록')
      .map((page) => page.bundleTitle)
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
  })

  it('페이지마다 **제 타겟**을 든다', () => {
    expect(targetedPages(평평하게(트리())).map((page) => page.target)).toEqual([
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
    const targets = targetedPages(평평하게(트리())).filter((page) => page.title === '목록')
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
    expect(targetedPages(평평하게(tree)).map((page) => page.id)).toEqual(['p1', 'p2'])
  })

  it('하위 메뉴 형제 순서도 sortOrder다', () => {
    const tree = [
      menu(
        'm1',
        '뿌리',
        0,
        [],
        [menu('m3', '둘째', 1, [{ id: 'p2', title: 'B', sortOrder: 0 }]), menu('m2', '첫째', 0, [{ id: 'p1', title: 'A', sortOrder: 0 }])],
      ),
    ]
    expect(targetedPages(평평하게(tree)).map((page) => page.id)).toEqual(['p1', 'p2'])
  })
})

describe('duplicateTargets', () => {
  /**
   * **조립 규칙을 바꿀 때 이것부터 본다.** 같은 타겟을 든 페이지가 둘이면
   * `exportBundle`이 **둘 다** 링크를 잃게 두고 런타임이 그렇게 말한다.
   */
  it('같은 메뉴 아래 같은 제목이면 타겟이 겹친다', () => {
    const tree = [
      menu('m1', '관리자', 0, [
        { id: 'p1', title: '목록', sortOrder: 0 },
        { id: 'p2', title: '목록', sortOrder: 1 },
      ]),
    ]
    expect(duplicateTargets(targetedPages(평평하게(tree)))).toEqual(['page:관리자/목록'])
  })

  /**
   * **제목에 `/`가 들어가면 다른 조상의 페이지와 같아질 수 있다.** 경로 구분자를 강제로
   * 바꾸지 않는 것은 타겟의 형식을 강제하지 않는다는 판정(`interaction-validate.test.ts`의
   * `navigate·openModal의 타겟은 검사하지 않는다`) 때문이고, 대신 **겹치면
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
    expect(duplicateTargets(targetedPages(평평하게(tree)))).toEqual(['page:관리자/회원/목록'])
  })

  it('겹치는 것이 없으면 빈 목록이다', () => {
    expect(duplicateTargets(targetedPages(평평하게(트리())))).toEqual([])
  })

  it('같은 타겟이 셋이어도 한 번만 낸다', () => {
    const tree = [
      menu('m1', '관리자', 0, [
        { id: 'p1', title: '목록', sortOrder: 0 },
        { id: 'p2', title: '목록', sortOrder: 1 },
        { id: 'p3', title: '목록', sortOrder: 2 },
      ]),
    ]
    expect(duplicateTargets(targetedPages(평평하게(tree)))).toEqual(['page:관리자/목록'])
  })
})

/**
 * **고아와 순환을 버리는 것이 이 함수의 계약이다** — `buildMenuTree`와 같은 계약이다.
 * 입력이 평평하므로(`{ menu, pages }`) 트리를 짜며 걸러 줄 자리가 따로 없고, `targetedPages`가
 * 스스로 거른다.
 *
 * 조용히 버리는 것이 옳은 이유는 반대편이 더 나쁘기 때문이다 — 고아를 뿌리로 올리면
 * **남의 조상이 붙은 타겟**이 생기고, 그 문자열은 그럴듯해서 아무도 못 걸러 낸다.
 * 버려진 것을 알아채는 것은 호출자의 몫이다(`exportProjectBundle`이 개수를 대조한다).
 */
describe('고아와 순환', () => {
  it('부모가 입력에 없는 메뉴는 결과에 없다 — 뿌리로 올리지 않는다', () => {
    const found = targetedPages({
      menu: [
        { id: 'm1', parentId: null, title: '관리자', sortOrder: 0 },
        { id: 'm9', parentId: '없는메뉴', title: '고아', sortOrder: 1 },
      ],
      pages: [
        { id: 'p1', menuNodeId: 'm1', title: '목록', sortOrder: 0 },
        { id: 'p9', menuNodeId: 'm9', title: '버려짐', sortOrder: 0 },
      ],
    })
    expect(found.map((page) => page.id)).toEqual(['p1'])
    // 뿌리로 올렸다면 `page:고아/버려짐`이 나온다.
    expect(found.map((page) => page.target)).toEqual(['page:관리자/목록'])
  })

  it('소속 메뉴가 입력에 없는 페이지는 결과에 없다', () => {
    const found = targetedPages({
      menu: [{ id: 'm1', parentId: null, title: '관리자', sortOrder: 0 }],
      pages: [
        { id: 'p1', menuNodeId: 'm1', title: '목록', sortOrder: 0 },
        { id: 'p9', menuNodeId: 'm없음', title: '떠돌이', sortOrder: 0 },
      ],
    })
    expect(found.map((page) => page.id)).toEqual(['p1'])
  })

  it('순환에 갇힌 메뉴는 무한 루프 없이 빠진다', () => {
    const found = targetedPages({
      menu: [
        { id: 'a', parentId: 'b', title: 'A', sortOrder: 0 },
        { id: 'b', parentId: 'a', title: 'B', sortOrder: 0 },
        { id: 'm1', parentId: null, title: '관리자', sortOrder: 1 },
      ],
      pages: [
        { id: 'pa', menuNodeId: 'a', title: '갇힘', sortOrder: 0 },
        { id: 'p1', menuNodeId: 'm1', title: '목록', sortOrder: 0 },
      ],
    })
    expect(found.map((page) => page.id)).toEqual(['p1'])
  })
})

/**
 * **접두를 아는 자리가 하나다** — `PAGE_TARGET_PREFIX`.
 *
 * 문장화(`interaction/describe.ts`)가 `'page:'`를 스스로 인라인하면 접두를 아는 자리가
 * 여럿이 되고, 갈리는 날 문장이 `page:관리자/목록 페이지`가 된다.
 */
describe('pageTargetPath — 접두를 벗기는 자리', () => {
  it('조립한 타겟에서 경로만 돌려준다', () => {
    expect(pageTargetPath(pageTarget(['관리자', '회원'], '목록'))).toBe('관리자/회원/목록')
  })

  it('접두 없이 친 경로는 그대로다 — 사람이 치는 것이 그 모양이다', () => {
    expect(pageTargetPath('관리자/회원/목록')).toBe('관리자/회원/목록')
  })

  it('접두뿐이면 빈 경로다', () => {
    expect(pageTargetPath('page:')).toBe('')
    expect(pageTargetPath('   ')).toBe('')
  })

  /**
   * **접두 뒤의 공백을 걷는 것은 중복 방어가 아니다.**
   *
   * 이 `trim()`을 지워도 **대조 경로**에서는 아무것도 안 죽는다 — `matchPageTargets`가
   * 마디마다 다시 걷으므로 `page: 관리자/목록`도 여전히 맞는다. 그래서 *"아래에서 또
   * 걷힌다"*로 보고 지우기 쉬운 자리다.
   *
   * **문장화 경로는 다르다.** `describePageTarget`은 **문서에 적힌 글자를 그대로**
   * 받는다 — 타겟은 저작 화면에서 **사람이 손으로 적는 문자열**이고(이 파일의
   * 머리말이 그 판정을 적었다) 아무도 다시 걷어 주지 않는다. 실측(아래 케이스가 `있다`
   * 칸을 단언한다):
   *
   * | `trim()` | `describePageTarget('page: 관리자/회원/목록')` |
   * |---|---|
   * | 있다 | `'관리자/회원/목록 페이지'` |
   * | 없다 | `' 관리자/회원/목록 페이지'` ← 문장 가운데 공백이 둘이 된다 |
   *
   * 그 문장은 우측 패널·HTML 번들·PPTX 셋이 함께 싣는다(설계서 「자동 문장화」). **조용히 나빠지는 자리라
   * 자가 필요하다.**
   */
  it('접두 뒤의 공백을 걷는다 — 문장화가 그것을 다시 안 걷는다', () => {
    expect(pageTargetPath('page: 관리자/회원/목록')).toBe('관리자/회원/목록')
    expect(describePageTarget('page: 관리자/회원/목록')).toBe('관리자/회원/목록 페이지')
  })

  it('문장화가 같은 접두를 쓴다 — 자리가 셋이면 여기가 죽는다', () => {
    // `describePageTarget`을 여기서 부르는 것이 요점이다. 그 함수가 접두를 스스로
    // 인라인하고 있으면 이 대조는 통과하지만, 접두 상수를 고치는 순간 갈린다.
    expect(describePageTarget(pageTarget(['관리자'], '목록'))).toBe('관리자/목록 페이지')
    expect(describePageTarget(`${PAGE_TARGET_PREFIX}관리자/목록`)).toBe('관리자/목록 페이지')
  })
})
