/**
 * **`exportPptx`가 실은 것.**
 *
 * DOM 없이 돈다 — 슬라이드는 XML이고 `test-support`의 파서가 그것을 읽는다. 번들과 값을
 * 견주는 것은 `pptx-parity.test.tsx`이고, 소스를 세는 것은 `duplicate-census.test.ts`다.
 */
import { findAll, parseXml, textOf, type XmlElement } from '@wirebound/exporter/test-support'
import { describeNode, type PageDocument, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EMPTY_COMMENTS, EMPTY_DESCRIPTION, EMPTY_INTERACTIONS, panelLabel } from '../src/labels'
import { exportPptx, NO_SCREEN, type PptxPage, type PptxPart } from '../src/pptx/index'
import { SCREEN_BOX } from '../src/pptx/geometry'

/* ------------------------------------------------------------------- 표본 */

const BUTTON: WbNode = {
  id: 'n_000000000002',
  type: 'Button',
  props: { label: '검색' },
  marker: 1,
  interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_000000000003', prop: 'loading', value: true }] }],
}

const LIST: WbNode = { id: 'n_000000000003', type: 'List', props: {}, marker: 2 }

function documentOf(children: WbNode[]): PageDocument {
  return { version: 1, root: { id: 'n_000000000001', type: 'Page', children } }
}

/** **하나짜리로 재지 않는다**(전역 제약). 셋을 기본 표본으로 둔다. */
const PAGES: PptxPage[] = [
  {
    title: '관리자 · 회원 · 목록',
    document: documentOf([BUTTON, LIST]),
    description: '회원을 조건으로 찾는 화면',
    comments: [{ nodeId: 'n_000000000002', body: '검색 조건은 AND 결합', authorName: '장', createdAt: '2026-08-17' }],
  },
  { title: '관리자 · 회원 · 상세', document: documentOf([LIST]), comments: [] },
  {
    // **표식도 코멘트도 없는 페이지.** 빈 상태를 재려면 그런 페이지가 있어야 한다 —
    // 번호만 있고 코멘트가 없는 노드는 `marker-without-comment` 줄을 만들기 때문이다.
    title: '문서 · 소개',
    document: documentOf([{ id: 'n_000000000005', type: 'Text', props: { content: '안내' } }]),
    comments: [],
  },
  {
    title: '마케팅 · 랜딩',
    document: documentOf([{ id: 'n_000000000004', type: 'Text', props: { content: '문구' } }]),
    description: null,
    comments: [{ nodeId: 'n_000000000404', body: '사라진 노드에 달린 코멘트' }],
  },
]

/**
 * 1×1 투명 PNG. **진짜 바이트다** — 자리만 만들고 안 재면 이미지를 넣는 쪽(`apps/api`)이
 * 계약을 못 믿는다.
 */
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01,
  0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

/* --------------------------------------------------------------------- 자 */

function partText(parts: readonly PptxPart[], path: string): string {
  const part = parts.find((item) => item.path === path)
  if (part === undefined) throw new Error(`그런 파트가 없습니다: ${path}`)
  if (typeof part.content !== 'string') throw new Error(`글자 파트가 아닙니다: ${path}`)
  return part.content
}

function slide(parts: readonly PptxPart[], number: number): XmlElement {
  return parseXml(partText(parts, `ppt/slides/slide${number}.xml`))
}

function notes(parts: readonly PptxPart[], number: number): XmlElement {
  return parseXml(partText(parts, `ppt/notesSlides/notesSlide${number}.xml`))
}

/** 그 슬라이드가 실은 글자들. `a:t` 하나가 한 토막이다. */
function texts(root: XmlElement): string[] {
  return findAll(root, 'a:t').map(textOf)
}

/* ------------------------------------------------------------------ 케이스 */

describe('exportPptx — 페이지마다 슬라이드 한 장', () => {
  it('페이지가 없으면 던진다', () => {
    expect(() => exportPptx({ pages: [] })).toThrow('페이지가 없습니다')
  })

  it('페이지 수와 슬라이드 수가 같다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(parts.filter((part) => /^ppt\/slides\/slide\d+\.xml$/.test(part.path))).toHaveLength(PAGES.length)
  })

  it('슬라이드 순서가 페이지 순서다 — 제목으로 잰다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    const titles = PAGES.map((_page, index) => texts(slide(parts, index + 1))[0])
    expect(titles).toEqual(PAGES.map((page) => page.title))
  })

  it('번들이 부르는 이름을 그대로 쓴다 — 조상이 붙은 제목이 잘리지 않는다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(slide(parts, 1))).toContain('관리자 · 회원 · 목록')
  })

  it('오른쪽 칸의 절 제목이 설계서 「설계서 화면 구조」의 탭 이름과 같다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    const 실린것 = texts(slide(parts, 1))
    expect(실린것).toContain(panelLabel('comments'))
    expect(실린것).toContain(panelLabel('interactions'))
  })

  it('코멘트 본문과 작성자를 싣는다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    const 실린것 = texts(slide(parts, 1))
    expect(실린것).toContain('검색 조건은 AND 결합')
    expect(실린것).toContain('장 · 2026-08-17')
  })

  it('상호작용 문장을 싣는다 — 설계서 「자동 문장화」', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(slide(parts, 1)).some((text) => text.includes('클릭 시'))).toBe(true)
  })

  it('코멘트가 없으면 없다고 말한다 — 빈 자리로 두지 않는다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(slide(parts, 3))).toContain(EMPTY_COMMENTS)
  })

  it('상호작용이 없으면 없다고 말한다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(slide(parts, 3))).toContain(EMPTY_INTERACTIONS)
  })

  it('사라진 노드에 달린 코멘트도 버리지 않는다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(slide(parts, 4))).toContain('사라진 노드에 달린 코멘트')
  })

  it('번호만 있고 코멘트가 없는 노드도 줄을 갖는다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    // 두 번째 페이지는 `LIST`(marker 2)만 있고 코멘트가 없다.
    expect(texts(slide(parts, 2))).toContain(describeNode(LIST))
  })
})

describe('노트가 전문을 받는다', () => {
  it('슬라이드마다 노트가 하나씩 있다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(parts.filter((part) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(part.path))).toHaveLength(PAGES.length)
  })

  it('슬라이드에 실린 것이 노트에도 전부 있다 — 이중 적재', () => {
    const { parts } = exportPptx({ pages: PAGES })
    for (let number = 1; number <= PAGES.length; number += 1) {
      const 노트 = texts(notes(parts, number))
      for (const text of texts(slide(parts, number))) {
        // 화면 자리의 말은 노트에 안 싣는다 — 그것은 이미지 자리의 상태이지 설계서가 아니다.
        if (text === NO_SCREEN) continue
        expect(노트, `슬라이드 ${number} 의 "${text}"`).toContain(text)
      }
    }
  })

  it('페이지 설명은 노트에만 있다 — 슬라이드 오른쪽 칸을 밀어내지 않는다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(notes(parts, 1))).toContain('회원을 조건으로 찾는 화면')
    expect(texts(slide(parts, 1))).not.toContain('회원을 조건으로 찾는 화면')
    expect(texts(notes(parts, 1))).toContain(panelLabel('description'))
  })

  it('설명이 없으면 없다고 말한다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(notes(parts, 4))).toContain(EMPTY_DESCRIPTION)
  })
})

describe('이미지 자리', () => {
  it('이미지가 없으면 슬라이드가 그렇다고 말한다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(texts(slide(parts, 1))).toContain(NO_SCREEN)
  })

  it('이미지가 없으면 값도 그렇다고 말한다 — 부르는 쪽이 미리 알 수 있다', () => {
    expect(exportPptx({ pages: PAGES }).screenless).toEqual(PAGES.map((page) => page.title))
  })

  it('이미지가 없으면 매체 파트도 관계도 안 만든다', () => {
    const { parts } = exportPptx({ pages: PAGES })
    expect(parts.filter((part) => part.path.startsWith('ppt/media/'))).toEqual([])
    expect(partText(parts, 'ppt/slides/_rels/slide1.xml.rels')).not.toContain('image')
  })

  it('진짜 PNG 바이트를 넣으면 매체 파트로 실린다 — 바이트가 그대로다', () => {
    const { parts, screenless } = exportPptx({
      pages: [{ ...PAGES[0]!, screen: { fileName: '화면.png', bytes: PNG_1X1, width: 1600, height: 900 } }, PAGES[1]!],
    })
    const media = parts.filter((part) => part.path.startsWith('ppt/media/'))
    expect(media.map((part) => part.path)).toEqual(['ppt/media/image1.png'])
    expect(media[0]!.content).toEqual(PNG_1X1)
    expect(screenless).toEqual([PAGES[1]!.title])
  })

  it('이미지가 있으면 슬라이드가 그것을 관계로 가리키고 자리 말은 사라진다', () => {
    const { parts } = exportPptx({
      pages: [{ ...PAGES[0]!, screen: { fileName: '화면.png', bytes: PNG_1X1, width: 1600, height: 900 } }],
    })
    const embed = findAll(slide(parts, 1), 'a:blip')[0]!.attributes['r:embed']
    const rels = parseXml(partText(parts, 'ppt/slides/_rels/slide1.xml.rels'))
    const target = findAll(rels, 'Relationship').find((node) => node.attributes.Id === embed)
    expect(target?.attributes.Target).toBe('../media/image1.png')
    expect(texts(slide(parts, 1))).not.toContain(NO_SCREEN)
  })

  it('png 이 아니면 던진다 — 조용히 안 열리는 파일을 만들지 않는다', () => {
    expect(() =>
      exportPptx({
        pages: [{ ...PAGES[0]!, screen: { fileName: '화면.gif', bytes: PNG_1X1, width: 4, height: 4 } }],
      }),
    ).toThrow('담을 수 없는 이미지 형식')
  })

  it('페이지마다 다른 이름을 준다 — 같은 이름을 주면 한 그림이 둘을 덮는다', () => {
    const screen = { fileName: '화면.png', bytes: PNG_1X1, width: 8, height: 8 }
    const { parts } = exportPptx({
      pages: PAGES.map((page) => ({ ...page, screen })),
    })
    const media = parts.filter((part) => part.path.startsWith('ppt/media/')).map((part) => part.path)
    expect(new Set(media).size).toBe(PAGES.length)
  })

  it('비율을 지켜 자리 안에 넣는다 — 찌그러뜨리지 않는다', () => {
    const { parts } = exportPptx({
      pages: [{ ...PAGES[0]!, screen: { fileName: 'a.png', bytes: PNG_1X1, width: 1600, height: 900 } }],
    })
    const ext = findAll(findAll(slide(parts, 1), 'p:pic')[0]!, 'a:ext')[0]!
    const cx = Number(ext.attributes.cx)
    const cy = Number(ext.attributes.cy)
    expect(cx / cy).toBeCloseTo(1600 / 900, 3)
    expect(cx).toBeLessThanOrEqual(SCREEN_BOX.width)
    expect(cy).toBeLessThanOrEqual(SCREEN_BOX.height)
  })

  /**
   * **못 읽은 화소가 오면 비율을 버리고 자리를 그대로 쓴다 — 곧 이미지가 늘어난다.**
   *
   * **이것은 옳은 동작을 재는 것이 아니라 값을 못 읽었을 때 무슨 일이 나는지를 고정하는
   * 것이다** — 늘어난 목업을 보고 만드는 사람이 잘못된 비율을 만들기 때문에, 이 값을 이
   * 함수에 넣지 않는 것이 부르는 쪽의 몫이다(`apps/api` 쪽이 그것을 지킨다).
   */
  it.each([
    ['0', 0, 0],
    ['NaN', Number.NaN, Number.NaN],
    ['음수', -1, -1],
  ])('화소가 %s 이면 비율을 버리고 자리를 그대로 쓴다 — 이미지가 늘어난다', (_label, width, height) => {
    const { parts } = exportPptx({
      pages: [{ ...PAGES[0]!, screen: { fileName: 'a.png', bytes: PNG_1X1, width, height } }],
    })
    const pic = findAll(slide(parts, 1), 'p:pic')[0]!
    const ext = findAll(pic, 'a:ext')[0]!
    const off = findAll(pic, 'a:off')[0]!
    expect(Number(ext.attributes.cx)).toBe(SCREEN_BOX.width)
    expect(Number(ext.attributes.cy)).toBe(SCREEN_BOX.height)
    expect(Number(off.attributes.x)).toBe(SCREEN_BOX.x)
    expect(Number(off.attributes.y)).toBe(SCREEN_BOX.y)
  })
})

describe('여러 줄 코멘트', () => {
  /**
   * **날 줄바꿈을 `a:t` 에 남기면 PowerPoint 가 공백도 없이 붙여 버린다** —
   * `첫째 줄둘째 줄셋째 줄`(PowerPoint 로 다시 재는 법은 `build-test/dist-pptx.test.ts`
   * 머리말). HTML 번들은 같은 글자를 `<p>` 안에 넣어 브라우저가 공백으로 접으므로 **두
   * 산출물이 같은 코멘트를 다르게 말하게 된다.**
   */
  const 여러줄 = exportPptx({
    pages: [
      {
        title: '관리자 · 회원 · 목록',
        document: documentOf([BUTTON, LIST]),
        description: '설명 첫 줄\n설명 둘째 줄',
        comments: [{ nodeId: 'n_000000000002', body: '첫째 줄\n둘째 줄\n셋째 줄' }],
      },
    ],
  })

  it('줄마다 문단을 만든다 — 한 a:t 에 붙이지 않는다', () => {
    const 실린것 = texts(slide(여러줄.parts, 1))
    expect(실린것).toContain('첫째 줄')
    expect(실린것).toContain('둘째 줄')
    expect(실린것).toContain('셋째 줄')
  })

  it('어느 a:t 에도 날 줄바꿈이 없다 — 슬라이드와 노트 둘 다', () => {
    for (let number = 1; number <= 여러줄.parts.filter((part) => /slide\d+\.xml$/.test(part.path)).length; number += 1) {
      for (const text of [...texts(slide(여러줄.parts, number)), ...texts(notes(여러줄.parts, number))]) {
        expect(text, JSON.stringify(text)).not.toContain('\n')
      }
    }
  })

  it('문단 수가 줄 수만큼 는다 — 값으로 잰다', () => {
    const 한줄 = exportPptx({
      pages: [
        {
          title: '관리자 · 회원 · 목록',
          document: documentOf([BUTTON, LIST]),
          comments: [{ nodeId: 'n_000000000002', body: '첫째 줄' }],
        },
      ],
    })
    const 센다 = (parts: readonly PptxPart[]): number => findAll(slide(parts, 1), 'a:p').length
    // 본문이 셋으로 갈리므로 문단이 **정확히 둘** 는다.
    expect(센다(여러줄.parts) - 센다(한줄.parts)).toBe(2)
  })

  it('노트의 설명도 줄마다 갈린다', () => {
    const 노트 = texts(notes(여러줄.parts, 1))
    expect(노트).toContain('설명 첫 줄')
    expect(노트).toContain('설명 둘째 줄')
  })

  /** `\r\n` 과 홀로 온 `\r` 도 가른다 — 붙여넣기로 들어오는 글자에 그 둘이 섞인다. */
  it('CRLF 와 CR 도 문단으로 가른다', () => {
    const { parts } = exportPptx({
      pages: [
        {
          title: '관리자 · 회원 · 목록',
          document: documentOf([LIST]),
          comments: [{ nodeId: 'n_000000000003', body: '가\r\n나\r다' }],
        },
      ],
    })
    const 실린것 = texts(slide(parts, 1))
    expect(실린것).toContain('가')
    expect(실린것).toContain('나')
    expect(실린것).toContain('다')
    for (const text of 실린것) expect(text).not.toContain('\r')
  })

  /** 빈 줄은 **빈 문단**으로 남는다 — 사람이 넣은 간격을 버리지 않는다. */
  it('빈 줄을 버리지 않는다', () => {
    const { parts } = exportPptx({
      pages: [
        {
          title: '관리자 · 회원 · 목록',
          document: documentOf([LIST]),
          comments: [{ nodeId: 'n_000000000003', body: '위\n\n아래' }],
        },
      ],
    })
    const xml = partText(parts, 'ppt/slides/slide1.xml')
    const 실린것 = texts(slide(parts, 1))
    expect(실린것).toContain('위')
    expect(실린것).toContain('아래')
    // 빈 문단은 토막 없이 `<a:p>…</a:p>` 다 — 글자 없는 `<a:t>` 를 안 만든다.
    expect(xml).not.toContain('<a:t></a:t>')
  })
})

describe('XML 로 못 담는 글자', () => {
  it('코멘트에 든 제어 문자를 걷는다 — 남기면 pptx 가 통째로 안 열린다', () => {
    const { parts } = exportPptx({
      pages: [
        {
          title: '관리자 · 회원 · 목록',
          document: documentOf([BUTTON, LIST]),
          comments: [{ nodeId: 'n_000000000002', body: `앞\u0000뒤\u0008\uD800` }],
        },
      ],
    })
    // **파서가 던지지 않는 것이 이 케이스의 요점이다.**
    expect(texts(slide(parts, 1))).toContain('앞뒤')
  })

  it('꺾쇠와 앰퍼샌드를 이스케이프한다', () => {
    const { parts } = exportPptx({
      pages: [
        {
          title: '<제목> & 그 밖',
          document: documentOf([LIST]),
          comments: [{ nodeId: 'n_000000000003', body: 'a < b && c' }],
        },
      ],
    })
    expect(partText(parts, 'ppt/slides/slide1.xml')).toContain('&lt;제목&gt; &amp; 그 밖')
    expect(texts(slide(parts, 1))).toContain('a < b && c')
  })
})

describe('별칭 — PPTX 산출물로 잰다(L-126)', () => {
  /**
   * 번들(`alias.test.ts`)과 같은 표본이다 — 상호작용 문장 · 코멘트 줄의 노드 이름이 별칭이다. **코드가 `commentEntries` · `pageSentences` 를 부른다는 것이
   * 아니라 슬라이드 · 노트의 글자로 잰다.** 별칭이 없는 노드는 옛 이름(`describeNode`)이다.
   */
  const ALIASED = documentOf([
    {
      id: 'n_save',
      type: 'Button',
      alias: '저장 버튼',
      props: { label: '저장' },
      marker: 1,
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list', value: false }] }],
    },
    { id: 'n_list', type: 'List', alias: '회원 목록', props: {}, marker: 2 },
  ])

  it('상호작용 문장 · 코멘트 줄이 별칭으로 노드를 부른다 — 슬라이드와 노트 모두', () => {
    const { parts } = exportPptx({ pages: [{ title: '별칭', document: ALIASED, comments: [{ nodeId: 'n_list', body: '정렬' }] }] })
    for (const [label, root] of [
      ['슬라이드', slide(parts, 1)],
      ['노트', notes(parts, 1)],
    ] as const) {
      const lines = texts(root)
      expect(
        lines.some((line) => line.includes('저장 버튼 클릭 시') && line.includes('회원 목록이 숨겨집니다')),
        `${label}: ${lines.join(' | ')}`,
      ).toBe(true)
      expect(lines, label).toContain('② 회원 목록')
    }
  })

  it('판 카나리아 — 별칭을 걷으면 같은 자리가 옛 이름이다', () => {
    const plain = documentOf([
      { ...(ALIASED.root.children![0] as WbNode), alias: undefined },
      { ...(ALIASED.root.children![1] as WbNode), alias: undefined },
    ])
    const { parts } = exportPptx({ pages: [{ title: '별칭', document: plain, comments: [{ nodeId: 'n_list', body: '정렬' }] }] })
    const lines = texts(slide(parts, 1))
    expect(lines.join(' | ')).not.toContain('회원 목록')
    expect(lines).toContain(describeNode(plain.root.children![1] as WbNode))
  })
})

describe('화면 상태가 있는 페이지 — PPTX 는 기본 상태만 찍는다(L-120 · 사용자 결정 Q23)', () => {
  /**
   * 한 장이 페이지 하나다 — 상태마다 장을 내지 않는다. 화면 이미지는 호출자가 그린 한 장이고(`screen`), 이 함수는 상태를 모른다. 코멘트 · 상호작용
   * 글은 번들과 같은 함수가 짓는다(상태 가지 안 노드의 이름에 상태가 붙는다 — 설계서 «내보내기»). 값으로 적는다 — 슬라이드 수 = 페이지 수.
   */
  const STATED: PageDocument = {
    version: 1,
    viewStates: [{ id: 's_admin', name: '관리자' }],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        {
          id: 'n_sw',
          type: 'StateSwitch',
          children: [
            {
              id: 'n_cd',
              type: 'StateCase',
              props: { state: 'default' },
              children: [{ id: 'n_view', type: 'Button', props: { label: '보기' }, marker: 1 }],
            },
            {
              id: 'n_ca',
              type: 'StateCase',
              props: { state: 's_admin' },
              children: [
                {
                  id: 'n_approve',
                  type: 'Button',
                  props: { label: '승인' },
                  marker: 2,
                  interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_view', value: false }] }],
                },
              ],
            },
          ],
        },
      ],
    } as WbNode,
  }

  it('상태가 둘이어도 슬라이드는 페이지 하나에 한 장이다', () => {
    const { parts } = exportPptx({
      pages: [{ title: '상태', document: STATED, comments: [{ nodeId: 'n_approve', body: '권한 확인' }] }],
    })
    const slides = parts.filter((part) => /^ppt\/slides\/slide\d+\.xml$/.test(part.path))
    expect(slides).toHaveLength(1)
    // 코멘트 · 상호작용 글은 상태마다 갈리지 않는다 — 관리자 가지 안 노드의 이름에 상태가 붙는다.
    const lines = texts(slide(parts, 1))
    expect(lines).toContain('권한 확인')
    expect(lines.some((line) => line.includes('(관리자 상태)'))).toBe(true)
  })
})
