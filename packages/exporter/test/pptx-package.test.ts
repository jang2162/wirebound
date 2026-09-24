/**
 * **패키지가 닫혀 있는가.**
 *
 * PPTX는 파트가 여럿이고 관계가 물려 있다. 어느 관계 하나가 없는 파트를 가리키면 받는
 * 쪽은 **그냥 안 연다** — 어느 파트가 문제인지 말해 주지 않는다. 그래서 여기서 **닫힘**을
 * 잰다: 모든 관계의 타겟이 파트로 있는가 · 모든 파트가 콘텐츠 타입을 갖는가 · 모든 XML이
 * 형태를 갖췄는가.
 *
 * **이 자는 아래쪽 절반이다**(`test-support/xml.ts`의 머리말). 여기를 지나도 PowerPoint가
 * 연다는 뜻이 아니고, 여기서 죽으면 **확실히 안 열린다**는 뜻이다. 위쪽 절반은 스모크다.
 */
import { findAll, parseXml, type XmlElement } from '@wirebound/exporter/test-support'
import { describe, expect, it } from 'vitest'
import { pptxPackage, type PptxPart } from '../src/pptx/ooxml'
import { notesXml, slideXml, textBox, pt } from '../src/pptx/slide'
import { NOTES_BOX, TITLE_BOX } from '../src/pptx/geometry'

/** **하나짜리로 재지 않는다**(전역 제약). 슬라이드 셋이 기본 표본이다. */
const TITLES = ['관리자 · 회원 · 목록', '관리자 · 회원 · 상세', '마케팅 · 랜딩']

function slide(title: string): string {
  return slideXml([
    textBox({ id: 2, name: '제목', box: TITLE_BOX, lines: [{ text: title, size: pt(24), bold: true }] }),
  ])
}

/**
 * 1×1 PNG 의 앞 열두 바이트. **내용을 안 본다** — 여기서 재는 것은 *"매체 파트가 있을 때
 * 패키지가 닫히는가"*이고 바이트 자체는 `test/pptx.test.ts` 가 든다.
 */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])

/**
 * **매체를 표본에 넣는다** — 그러지 않으면 `[Content_Types].xml` 의 `Default` 를 재는 자가
 * 설 수 없다. 분모가 *"매체가 없는 슬라이드만"* 이면 `png` 의 `Default` 를 빼도 우리
 * 케이스도, macOS 의 Spotlight·QuickLook 둘도 **전부 통과하는데** PowerPoint 는 거절한다.
 */
function build(options: { notes?: boolean; media?: boolean } = {}): PptxPart[] {
  return pptxPackage(
    TITLES.map((title, index) => ({
      xml: slide(title),
      notes: options.notes === true ? notesXml(NOTES_BOX, [{ text: `${title} 노트`, size: pt(11) }]) : undefined,
      // **전부에 넣지 않는다** — 매체가 있는 슬라이드와 없는 슬라이드가 섞인 것이 실제 모양이다.
      media: options.media === true && index === 0 ? { fileName: 'image1.png', bytes: PNG } : undefined,
    })),
  )
}

function textOfPart(parts: readonly PptxPart[], path: string): string {
  const part = parts.find((item) => item.path === path)
  if (part === undefined) throw new Error(`그런 파트가 없습니다: ${path}`)
  if (typeof part.content !== 'string') throw new Error(`글자 파트가 아닙니다: ${path}`)
  return part.content
}

/** 이 관계 파일이 든 타겟들을 **패키지 뿌리 기준 경로로** 되돌린다. */
function targetsOf(parts: readonly PptxPart[], relsPath: string): string[] {
  const document = parseXml(textOfPart(parts, relsPath))
  const base = relsPath.slice(0, relsPath.lastIndexOf('_rels/'))
  return findAll(document, 'Relationship').map((relationship) =>
    normalize(base + relationship.attributes.Target!),
  )
}

/** `a/b/../c` 를 `a/c` 로. 관계의 타겟이 `../` 를 쓰므로 파트 경로와 맞대려면 필요하다. */
function normalize(path: string): string {
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

function relsPaths(parts: readonly PptxPart[]): string[] {
  return parts.map((part) => part.path).filter((path) => path.endsWith('.rels'))
}

function contentTypeDocument(parts: readonly PptxPart[]): XmlElement {
  return parseXml(textOfPart(parts, '[Content_Types].xml'))
}

describe('pptx 패키지', () => {
  it('슬라이드가 없으면 던진다 — 빈 pptx 를 내지 않는다', () => {
    expect(() => pptxPackage([])).toThrow('슬라이드가 없습니다')
  })

  it('XML 파트가 전부 형태를 갖췄다', () => {
    for (const part of build({ notes: true })) {
      if (typeof part.content !== 'string') continue
      expect(() => parseXml(part.content as string), part.path).not.toThrow()
    }
  })

  it('모든 관계의 타겟이 파트로 있다 — 닫힘', () => {
    const parts = build({ notes: true })
    const paths = new Set(parts.map((part) => part.path))
    const dangling: string[] = []
    for (const rels of relsPaths(parts)) {
      for (const target of targetsOf(parts, rels)) {
        if (!paths.has(target)) dangling.push(`${rels} → ${target}`)
      }
    }
    expect(dangling).toEqual([])
  })

  it('관계 파일이 가리키는 자리마다 실제로 하나씩 있다 — 분모가 파트 목록이다', () => {
    const parts = build({ notes: true })
    // `_rels/` 아래 파일은 자기 짝이 있어야 한다: `a/_rels/b.rels` ↔ `a/b`.
    const paths = new Set(parts.map((part) => part.path))
    for (const rels of relsPaths(parts)) {
      if (rels === '_rels/.rels') continue
      const owner = rels.replace('_rels/', '').replace(/\.rels$/, '')
      expect(paths.has(owner), `${rels} 의 짝`).toBe(true)
    }
  })

  it('모든 파트가 콘텐츠 타입을 갖는다 — Default 아니면 Override', () => {
    const parts = build({ notes: true })
    const types = contentTypeDocument(parts)
    const defaults = new Set(
      findAll(types, 'Default').map((node) => node.attributes.Extension!.toLowerCase()),
    )
    const overrides = new Set(
      findAll(types, 'Override').map((node) => node.attributes.PartName!.replace(/^\//, '')),
    )
    const uncovered = parts
      .map((part) => part.path)
      .filter((path) => path !== '[Content_Types].xml')
      .filter((path) => {
        const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
        if (overrides.has(path)) return false
        // XML 파트는 `Default`(application/xml)로 덮이지만 **프레젠테이션 파트는 아니다** —
        // 아래 케이스가 그 갈래를 따로 든다.
        return !defaults.has(extension)
      })
    expect(uncovered).toEqual([])
  })

  it('프레젠테이션 파트는 Override 를 갖는다 — Default 로는 안 열린다', () => {
    const parts = build({ notes: true })
    const overrides = new Set(
      findAll(contentTypeDocument(parts), 'Override').map((node) =>
        node.attributes.PartName!.replace(/^\//, ''),
      ),
    )
    const needsOverride = parts
      .map((part) => part.path)
      .filter(
        (path) =>
          path.endsWith('.xml') &&
          !path.includes('/_rels/') &&
          path !== '[Content_Types].xml' &&
          path.startsWith('ppt/'),
      )
    expect(needsOverride.filter((path) => !overrides.has(path))).toEqual([])
  })

  it('Override 가 없는 파트를 가리키지 않는다 — 반대 방향', () => {
    const parts = build({ notes: true })
    const paths = new Set(parts.map((part) => part.path))
    const overrides = findAll(contentTypeDocument(parts), 'Override').map((node) =>
      node.attributes.PartName!.replace(/^\//, ''),
    )
    expect(overrides.filter((path) => !paths.has(path))).toEqual([])
  })

  it('슬라이드 수와 sldIdLst 항목 수가 같다 — 페이지 하나에 슬라이드 하나', () => {
    const parts = build()
    const presentation = parseXml(textOfPart(parts, 'ppt/presentation.xml'))
    const ids = findAll(presentation, 'p:sldId')
    expect(ids).toHaveLength(TITLES.length)
    expect(parts.filter((part) => /^ppt\/slides\/slide\d+\.xml$/.test(part.path))).toHaveLength(
      TITLES.length,
    )
  })

  it('sldIdLst 의 r:id 가 presentation 관계의 슬라이드를 순서대로 가리킨다', () => {
    const parts = build()
    const presentation = parseXml(textOfPart(parts, 'ppt/presentation.xml'))
    const rels = parseXml(textOfPart(parts, 'ppt/_rels/presentation.xml.rels'))
    const byId = new Map(
      findAll(rels, 'Relationship').map((node) => [node.attributes.Id!, node.attributes.Target!]),
    )
    const targets = findAll(presentation, 'p:sldId').map((node) => byId.get(node.attributes['r:id']!))
    expect(targets).toEqual(TITLES.map((_title, index) => `slides/slide${index + 1}.xml`))
  })

  it('슬라이드 id 가 서로 다르고 256 이상이다 — 규격이 그 아래를 안 받는다', () => {
    const presentation = parseXml(textOfPart(build(), 'ppt/presentation.xml'))
    const ids = findAll(presentation, 'p:sldId').map((node) => Number(node.attributes.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(256)
  })

  it('노트가 없으면 노트 마스터도 노트 관계도 안 만든다', () => {
    const parts = build()
    expect(parts.map((part) => part.path).filter((path) => path.includes('notes'))).toEqual([])
    const presentation = textOfPart(parts, 'ppt/presentation.xml')
    expect(presentation).not.toContain('notesMasterIdLst')
  })

  it('노트가 있으면 노트 마스터가 서고 슬라이드마다 노트가 물린다', () => {
    const parts = build({ notes: true })
    expect(parts.filter((part) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(part.path))).toHaveLength(
      TITLES.length,
    )
    expect(textOfPart(parts, 'ppt/presentation.xml')).toContain('notesMasterIdLst')
    for (let index = 1; index <= TITLES.length; index += 1) {
      const targets = targetsOf(parts, `ppt/notesSlides/_rels/notesSlide${index}.xml.rels`)
      expect(targets).toContain(`ppt/slides/slide${index}.xml`)
      expect(targets).toContain('ppt/notesMasters/notesMaster1.xml')
    }
  })

  it('첫 관계가 presentation 을 가리킨다 — 여기가 틀리면 아무것도 안 열린다', () => {
    expect(targetsOf(build(), '_rels/.rels')).toEqual(['ppt/presentation.xml'])
  })

  it('마스터가 테마와 레이아웃을 갖는다 — 없으면 규격 위반이다', () => {
    const targets = targetsOf(build(), 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
    expect(targets).toContain('ppt/theme/theme1.xml')
    expect(targets).toContain('ppt/slideLayouts/slideLayout1.xml')
  })

  it('슬라이드 크기가 16:9 다', () => {
    const presentation = parseXml(textOfPart(build(), 'ppt/presentation.xml'))
    const size = findAll(presentation, 'p:sldSz')[0]!
    expect(Number(size.attributes.cx) / Number(size.attributes.cy)).toBeCloseTo(16 / 9, 5)
  })
})

/**
 * **파일이 열리는지를 재는 자들.**
 *
 * 위 절은 *"관계 → 파트"* 방향의 닫힘을 잰다. **그것만으로는 PowerPoint 가 거절하는 상태
 * 넷이 통과한다**(PowerPoint 로 다시 재는 법은 `build-test/dist-pptx.test.ts` 머리말).
 * 여기 있는 것들은 전부 *"이것이 어긋나면 파일이 통째로 안 열린다"* 부류다.
 *
 * **받는 쪽 둘로는 대신할 수 없다.** 매체 `Default` 는 Spotlight·QuickLook 둘 다 안 보고,
 * 나머지 둘은 QuickLook 이 **빨강이 아니라 상한에 걸린 정지**로 알린다.
 */
describe('파일이 열리는 조건', () => {
  /**
   * 테마 파트 하나를 두 마스터가 나눠 쓰면 PowerPoint 가 복구 대화상자를 띄운다. 파트를
   * 가르면 열린다.
   */
  it('마스터마다 테마 파트가 하나다 — 두 마스터가 같은 것을 가리키지 않는다', () => {
    const parts = build({ notes: true })
    const masters = parts
      .map((part) => part.path)
      .filter((path) => /^ppt\/(?:slide|notes)Masters\/_rels\/\w+\.xml\.rels$/.test(path))
    expect(masters.length).toBeGreaterThan(1)

    const themes = masters.map((rels) => {
      const own = targetsOf(parts, rels).filter((target) => target.startsWith('ppt/theme/'))
      expect(own, `${rels} 의 테마 관계`).toHaveLength(1)
      return own[0]!
    })
    expect(new Set(themes).size, `테마 파트: ${themes.join(' · ')}`).toBe(masters.length)
  })

  /** 테마 파트가 여럿이어도 **전부** `Override` 를 받는다 — 하나라도 빠지면 안 열린다. */
  it('테마 파트가 전부 콘텐츠 타입을 갖는다', () => {
    const parts = build({ notes: true })
    const overrides = new Set(
      findAll(contentTypeDocument(parts), 'Override').map((node) =>
        node.attributes.PartName!.replace(/^\//, ''),
      ),
    )
    const themes = parts.map((part) => part.path).filter((path) => path.startsWith('ppt/theme/'))
    expect(themes.length).toBeGreaterThan(1)
    expect(themes.filter((path) => !overrides.has(path))).toEqual([])
  })

  /**
   * 슬라이드가 레이아웃을 안 가리키면 PowerPoint 가 거절한다 — 위 절의 닫힘 검사는
   * 통과하고 QuickLook 은 매달린다.
   */
  it('슬라이드마다 레이아웃 관계가 정확히 하나다', () => {
    const parts = build({ notes: true, media: true })
    const slides = parts
      .map((part) => part.path)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    expect(slides).toHaveLength(TITLES.length)

    for (const path of slides) {
      const rels = path.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
      const layouts = targetsOf(parts, rels).filter((target) =>
        target.startsWith('ppt/slideLayouts/'),
      )
      expect(layouts, `${rels} 의 레이아웃 관계`).toHaveLength(1)
    }
  })

  /**
   * **반대 방향이다.** 위 절의 닫힘은 *"관계 → 파트"* 만 본다. `presentation.xml` 이
   * **관계에 없는 `r:id`** 를 들면(매달린 `r:id`) 그 검사는 통과하는데 PowerPoint 는
   * 거절한다.
   */
  it('presentation 이 든 r:id 가 전부 관계로 있다 — 매달린 것이 없다', () => {
    const parts = build({ notes: true, media: true })
    const presentation = parseXml(textOfPart(parts, 'ppt/presentation.xml'))
    const declared = new Set(
      findAll(parseXml(textOfPart(parts, 'ppt/_rels/presentation.xml.rels')), 'Relationship').map(
        (node) => node.attributes.Id!,
      ),
    )

    const used = collectRelationshipIds(presentation)
    // 카나리아 — 하나도 못 모으면 아래 단언이 공허하게 통과한다.
    expect(used.length).toBeGreaterThan(TITLES.length)
    expect(used.filter((id) => !declared.has(id))).toEqual([])
  })

  /** 슬라이드와 노트도 같은 방향으로 본다 — 매달린 `r:id` 는 어느 파트에서든 같은 결함이다. */
  it('슬라이드와 노트가 든 r:id 도 전부 관계로 있다', () => {
    const parts = build({ notes: true, media: true })
    const dangling: string[] = []
    for (const part of parts) {
      if (!/^ppt\/(?:slides|notesSlides)\/\w+\.xml$/.test(part.path)) continue
      const rels = part.path.replace(/\/(\w+\.xml)$/, '/_rels/$1.rels')
      const declared = new Set(
        findAll(parseXml(textOfPart(parts, rels)), 'Relationship').map((node) => node.attributes.Id!),
      )
      for (const id of collectRelationshipIds(parseXml(part.content as string))) {
        if (!declared.has(id)) dangling.push(`${part.path} → ${id}`)
      }
    }
    expect(dangling).toEqual([])
  })

  /**
   * **이 케이스 없이는 셋 중 아무도 못 보는 자리다.** `png` 의 `Default` 가 빠지면 나머지
   * 우리 케이스도, Spotlight 도, QuickLook 도 통과하는데 PowerPoint 는 거절한다.
   */
  it('매체가 있으면 그 확장자의 Default 가 있다', () => {
    const parts = build({ notes: true, media: true })
    const media = parts.map((part) => part.path).filter((path) => path.startsWith('ppt/media/'))
    // 카나리아 — 표본에 매체가 없으면 아래가 공허하게 통과한다.
    expect(media.length).toBeGreaterThan(0)

    const defaults = new Set(
      findAll(contentTypeDocument(parts), 'Default').map((node) =>
        node.attributes.Extension!.toLowerCase(),
      ),
    )
    for (const path of media) {
      const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
      expect(defaults, `${path} 의 Default`).toContain(extension)
    }
  })

  it('매체 파트의 바이트가 그대로 실린다', () => {
    const parts = build({ media: true })
    const media = parts.filter((part) => part.path.startsWith('ppt/media/'))
    expect(media).toHaveLength(1)
    expect(media[0]!.content).toEqual(PNG)
  })
})

/** 그 요소와 자손이 든 `r:id` 값 전부. **속성 이름으로 모은다** — 요소를 열거하지 않는다. */
function collectRelationshipIds(element: XmlElement): string[] {
  const found: string[] = []
  for (const [key, value] of Object.entries(element.attributes)) {
    if (key === 'r:id' || key === 'r:embed' || key === 'r:link') found.push(value)
  }
  for (const child of element.children) found.push(...collectRelationshipIds(child))
  return found
}
