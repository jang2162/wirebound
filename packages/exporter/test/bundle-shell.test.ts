/**
 * **셸 CSS의 규율과 코멘트 줄 만들기**(T2 · D3·D4·D6).
 *
 * DOM 없이 돈다 — CSS는 글자로 훑고 코멘트 줄은 순수 함수다. 셸이 **그린 것**을 재는 것은
 * `bundle.test.tsx`이고 그 파일만 jsdom을 쓴다.
 */
import {
  describeInteraction,
  describeNode,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { commentEntries, MISSING_NODE_LABEL, type BundleComment } from '../src/bundle/comments'
import { SHELL_CSS, SHELL_PREFIX, SHELL_WRAPPERS } from '../src/bundle/shell-css'

/* ------------------------------------------------------------------ CSS 훑기 */

interface Rule {
  selectors: string[]
  properties: string[]
}

/**
 * 아주 작은 시트 파서. **`@media`도 중첩도 없다는 것을 전제로 한다** — 아래 첫 케이스가
 * 그 전제를 지킨다. 전제가 깨지면 이 자를 고치는 것이 맞고, 조용히 덜 훑는 것이 아니라
 * 그 케이스가 먼저 죽는다.
 */
function parseRules(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '')
  const rules: Rule[] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/gu
  let match = pattern.exec(withoutComments)
  while (match !== null) {
    rules.push({
      selectors: match[1]!.split(',').map((selector) => selector.trim()),
      properties: match[2]!
        .split(';')
        .map((declaration) => declaration.split(':')[0]!.trim())
        .filter((property) => property.length > 0),
    })
    match = pattern.exec(withoutComments)
  }
  return rules
}

const RULES = parseRules(SHELL_CSS)

describe('셸 CSS — 자가 실제로 시트를 읽는다', () => {
  it('규칙을 실제로 뽑는다', () => {
    // 카나리아. 파서가 빈 목록을 내면 아래 검사가 전부 공허하게 통과한다.
    expect(RULES.length).toBeGreaterThan(10)
    expect(RULES.flatMap((rule) => rule.selectors)).toContain('.wb-export-canvas')
    expect(RULES.flatMap((rule) => rule.properties)).toContain('grid-template-columns')
  })

  it('중첩도 @media도 쓰지 않는다 — 이 자가 그것을 못 읽는다', () => {
    expect(SHELL_CSS).not.toContain('@media')
    expect(SHELL_CSS).not.toContain('@supports')
  })
})

describe('셸 CSS — 문서에 못 닿는다 (D6)', () => {
  /**
   * **갈림 ㉢이 화면으로 보이는 것을 막는다.** 빈 `style` 속성은 `[style]` 셀렉터에
   * 매칭된다(P8-1 이월 §3의 실측). 캔버스에는 그 속성이 남고 번들에는 없으므로, 셸이
   * `[style]`을 하나 걸면 같은 노드가 두 경로에서 **다르게 보인다.**
   */
  it('[style] 셀렉터가 없다', () => {
    for (const rule of RULES) {
      for (const selector of rule.selectors) expect(selector).not.toContain('[style')
    }
  })

  /** §6.11의 여섯은 **테마의 어휘**다. 셸이 그것으로 적으면 셸이 문서를 꾸미게 된다. */
  it('data-wb-* 셀렉터가 없다', () => {
    for (const rule of RULES) {
      for (const selector of rule.selectors) expect(selector).not.toContain('[data-wb-')
    }
  })

  it('클래스와 id가 전부 셸의 접두어로 시작한다', () => {
    for (const rule of RULES) {
      for (const selector of rule.selectors) {
        for (const token of selector.match(/[.#][A-Za-z][\w-]*/gu) ?? []) {
          expect(token.slice(1), selector).toMatch(new RegExp(`^${SHELL_PREFIX}`, 'u'))
        }
      }
    }
  })

  it('요소 셀렉터는 html·body뿐이다', () => {
    const bare = RULES.flatMap((rule) => rule.selectors).filter(
      (selector) => !/^[.#]/u.test(selector),
    )
    expect([...new Set(bare)].sort()).toEqual(['body', 'html'])
  })
})

describe('셸 CSS — 감싸는 상자에 상속되는 속성을 걸지 않는다 (D6)', () => {
  /**
   * 문서를 감싸는 상자에 걸 수 있는 속성. **여기 없는 것은 전부 위반이다.** 전부 상속되지
   * 않는 속성이고, 새 속성이 필요하면 **상속되지 않는지 확인한 뒤** 여기 더한다 — 그
   * 확인을 사람이 한 번 하라는 것이 이 목록의 목적이다.
   *
   * `apps/web`이 자기 셸에 같은 규율을 세워 뒀다(`test/shell-css-guard.ts`). **그 코드를
   * 옮기지 않았다** — `packages/exporter`는 `apps/web`을 볼 수 없고, 자를 두 벌 두면
   * *"안 샌다"*의 뜻이 둘이 된다. 옮긴 것은 규율이지 구현이 아니다.
   */
  const WRAPPER_PROPERTIES = new Set([
    'display',
    'grid-template-columns',
    'grid-template-rows',
    'gap',
    'height',
    'min-height',
    'min-width',
    'max-width',
    'width',
    'margin',
    'padding',
    'background',
    'border',
    'border-radius',
    'box-shadow',
    'box-sizing',
    'overflow',
    'position',
    'inset',
  ])

  it('감싸는 상자를 실제로 찾는다', () => {
    // 카나리아. 이름이 바뀌어 하나도 못 찾으면 아래 검사가 공허해진다.
    const found = RULES.filter((rule) =>
      rule.selectors.some((selector) => (SHELL_WRAPPERS as readonly string[]).includes(selector)),
    )
    expect(found.length).toBeGreaterThan(0)
    expect(found.flatMap((rule) => rule.selectors)).toContain('.wb-export-canvas')
  })

  it('허용 목록 밖의 속성이 없다', () => {
    for (const rule of RULES) {
      if (!rule.selectors.some((s) => (SHELL_WRAPPERS as readonly string[]).includes(s))) continue
      for (const property of rule.properties) {
        expect(WRAPPER_PROPERTIES.has(property), `${rule.selectors.join(',')} → ${property}`).toBe(
          true,
        )
      }
    }
  })
})

describe('셸 CSS — 스크립트 없이 탭을 바꾼다 (D3 · 재라 #4)', () => {
  /**
   * **라디오 + `:checked ~`다.** `<details>`는 셋이 동시에 열릴 수 있어 §9의 그림과 다르다.
   * 브라우저에서 실제로 바뀌는지는 `docs/…-p8-2-report.md`가 잰 값을 든다.
   */
  it.each(['description', 'comments', 'interactions'])('%s 탭의 규칙이 있다', (tab) => {
    expect(SHELL_CSS).toContain(`#wb-export-tab-${tab}:checked ~ #wb-export-panel-${tab}`)
  })

  it('탭 본문의 기본이 감춤이다', () => {
    const panel = RULES.find((rule) => rule.selectors.includes('.wb-export-tabpanel'))
    expect(panel?.properties).toContain('display')
    expect(SHELL_CSS).toContain('.wb-export-tabpanel {\n  display: none;')
  })

  /** 라디오를 `display:none`으로 지우면 키보드로 탭을 옮길 수 없다. */
  it('라디오를 잘라내기로 숨긴다 — display:none이 아니다', () => {
    const radio = RULES.find((rule) => rule.selectors.includes('.wb-export-tab-radio'))
    expect(radio?.properties).toContain('clip-path')
    expect(radio?.properties).not.toContain('display')
  })

  it('스크립트를 시트로 부르지 않는다', () => {
    expect(SHELL_CSS).not.toContain('javascript:')
    expect(SHELL_CSS).not.toContain('url(')
  })
})

/* ------------------------------------------------------------- 코멘트 줄 (D4) */

function node(id: string, extra: Partial<WbNode> = {}): WbNode {
  return { id, type: 'Text', props: { content: id }, ...extra }
}

function documentOf(children: WbNode[]): PageDocument {
  return { version: 1, root: { id: 'n_000000000001', type: 'Page', children } }
}

const COMMENT: BundleComment = { nodeId: 'n_000000000002', body: '검색 조건은 AND 결합' }

describe('commentEntries — 번호와 코멘트를 맞춘다 (D4)', () => {
  it('번호가 붙은 노드의 코멘트를 그 이름으로 든다', () => {
    const page = documentOf([node('n_000000000002', { marker: 1 })])
    expect(commentEntries(page, [COMMENT])).toEqual([
      {
        kind: 'comment',
        nodeId: 'n_000000000002',
        label: describeNode(page.root.children![0]!),
        marker: 1,
        body: '검색 조건은 AND 결합',
        authorName: null,
        createdAt: null,
      },
    ])
  })

  /** **`describeNode`의 이름을 쓴다** — 상호작용 탭과 같은 말이어야 한다. */
  it('이름이 상호작용 문장이 쓰는 것과 같다', () => {
    const target = node('n_000000000002', { marker: 2, props: { content: '회원 목록' } })
    const [entry] = commentEntries(documentOf([target]), [COMMENT])
    expect(entry?.label).toBe(describeNode(target))
    expect(entry?.label).toContain('②')
  })

  it('번호가 없어도 코멘트는 그린다', () => {
    const [entry] = commentEntries(documentOf([node('n_000000000002')]), [COMMENT])
    expect(entry?.kind).toBe('comment')
    expect(entry?.marker).toBeNull()
  })

  /** 고아 마커 — 목업에 ①이 있는데 목록이 비면 읽는 사람이 자기가 못 찾은 줄로 읽는다. */
  it('번호만 있고 코멘트가 없으면 그 사실을 줄로 든다', () => {
    const page = documentOf([node('n_000000000002', { marker: 1 })])
    expect(commentEntries(page, [])).toEqual([
      {
        kind: 'marker-without-comment',
        nodeId: 'n_000000000002',
        label: describeNode(page.root.children![0]!),
        marker: 1,
      },
    ])
  })

  /**
   * **`schema`가 같은 상태를 부르는 말과 같은지 잰다.**
   *
   * `MISSING_NODE_LABEL`은 우리 쪽 상수이고 위 케이스들이 그것을 import해 견주므로,
   * **그 상수를 바꾸면 케이스가 함께 움직인다.** 그래서 여기서는 상수가 아니라
   * `schema`의 문장에서 그 말을 **꺼내** 견준다 — 두 탭이 같은 노드를 다르게 부르는 날
   * 여기가 죽는다.
   */
  it('사라진 노드를 부르는 말이 상호작용 문장의 것과 같다', () => {
    const source: WbNode = { id: 'n_000000000002', type: 'Button', props: { label: '검색' } }
    const sentence = describeInteraction(documentOf([source]), source, {
      on: 'click',
      actions: [{ type: 'setProp', target: 'n_000000000099', prop: 'loading', value: true }],
    })
    expect(sentence).toContain(MISSING_NODE_LABEL)
  })

  /** 고아 코멘트 — 노드가 사라진 상태. **버리지 않고 그 말을 쓴다.** */
  it('가리키는 노드가 없는 코멘트를 사라진 노드로 든다', () => {
    const entries = commentEntries(documentOf([node('n_000000000009')]), [COMMENT])
    expect(entries).toEqual([
      {
        kind: 'comment',
        nodeId: 'n_000000000002',
        label: MISSING_NODE_LABEL,
        marker: null,
        body: '검색 조건은 AND 결합',
        authorName: null,
        createdAt: null,
      },
    ])
  })

  it('번호가 아닌 값은 번호로 치지 않는다', () => {
    for (const marker of [0, -1, 1.5]) {
      const page = documentOf([node('n_000000000002', { marker })])
      expect(commentEntries(page, []), String(marker)).toEqual([])
      const [entry] = commentEntries(page, [COMMENT])
      expect(entry?.marker, String(marker)).toBeNull()
    }
  })

  it('문서 순서로 낸다 — 고아 코멘트가 뒤다', () => {
    const page = documentOf([
      node('n_000000000002', { marker: 2 }),
      node('n_000000000003', { marker: 1 }),
    ])
    const entries = commentEntries(page, [
      { nodeId: 'n_000000000099', body: '고아' },
      { nodeId: 'n_000000000003', body: '둘째' },
      { nodeId: 'n_000000000002', body: '첫째' },
    ])
    expect(entries.map((entry) => entry.nodeId)).toEqual([
      'n_000000000002',
      'n_000000000003',
      'n_000000000099',
    ])
  })

  it('한 노드에 여러 코멘트가 입력 순서로 붙는다', () => {
    const page = documentOf([node('n_000000000002')])
    const entries = commentEntries(page, [
      { nodeId: 'n_000000000002', body: '먼저' },
      { nodeId: 'n_000000000002', body: '나중' },
    ])
    expect(entries.map((entry) => (entry.kind === 'comment' ? entry.body : null))).toEqual([
      '먼저',
      '나중',
    ])
  })

  it('작성자·시각은 온 것만 든다', () => {
    const page = documentOf([node('n_000000000002')])
    const [entry] = commentEntries(page, [
      { nodeId: 'n_000000000002', body: '본문', authorName: '장병현' },
    ])
    expect(entry).toMatchObject({ authorName: '장병현', createdAt: null })
  })

  /**
   * **노드가 아닌 것이 트리에 있어도 던지지 않는다.** 렌더 경로는 그 노드를 폴백으로
   * 그리고 `errors`에 담으므로(`brokenFixture`가 그 상태다), 코멘트 목록만 던지면 **그린
   * 페이지가 번들에서 통째로 사라진다.**
   */
  it('노드가 아닌 자식이 있어도 던지지 않는다', () => {
    const page = documentOf([null as unknown as WbNode, node('n_000000000002', { marker: 1 })])
    expect(() => commentEntries(page, [])).not.toThrow()
    expect(commentEntries(page, [])).toHaveLength(1)
  })
})
