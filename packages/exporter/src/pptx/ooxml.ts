/**
 * **OOXML 패키지의 뼈대**(D1·D5). 슬라이드 글자를 받아 **파트 목록**을 낸다.
 *
 * ```
 * [Content_Types].xml
 * _rels/.rels                       → ppt/presentation.xml
 * ppt/presentation.xml              슬라이드 목록 · 슬라이드 크기
 * ppt/_rels/presentation.xml.rels   → 마스터 · 슬라이드들
 * ppt/slideMasters/slideMaster1.xml → 레이아웃 · 테마
 * ppt/slideLayouts/slideLayout1.xml → 마스터
 * ppt/theme/theme1.xml
 * ppt/slides/slideN.xml             → 레이아웃
 * ```
 *
 * ---
 *
 * # D1 — zip을 모른다
 *
 * `exportBundle`과 같은 규칙이다(그 파일의 머리말). **pptx는 zip이지만 이 패키지가 그
 * 압축을 하지 않는다** — `apps/api`가 `fflate`로 이미 그것을 하고 있고, 여기서 또 하면
 * 압축하는 자리가 둘이 된다.
 *
 * **`BundleFile`을 쓰지 않고 `PptxPart`를 따로 둔다 — 판정이다.** 근거는 `PptxPart`의
 * 주석에 있다.
 *
 * # D5 — 파트가 여럿이고 관계가 물려 있다
 *
 * 어느 관계 하나가 없는 파트를 가리키면 **pptx는 그냥 안 열린다** — 어느 파트가 문제인지
 * 받는 쪽이 말해 주지 않는다. 그래서 **관계와 콘텐츠 타입을 만드는 자리를 하나로 둔다.**
 * 슬라이드가 몇 장이든 이 파일이 셋을 함께 늘린다: 파트 · `[Content_Types].xml`의
 * `Override` · `presentation.xml.rels`의 `Relationship`.
 *
 * **케이스가 그 셋의 닫힘을 잰다** — *"모든 관계의 타겟이 파트로 있는가"*와 *"모든 파트가
 * 콘텐츠 타입을 갖는가"*.
 */
import { NOTES_HEIGHT, NOTES_WIDTH, SLIDE_HEIGHT, SLIDE_WIDTH } from './geometry'
import { THEME_XML } from './theme'
import { XML_DECL, xmlAttr } from './xml'

/**
 * pptx 패키지 안의 파트 하나. **경로가 곧 zip 항목 이름이다**(뿌리 폴더가 없다).
 *
 * ---
 *
 * # `BundleFile`을 넓히지 않고 이 타입을 따로 둔다 (D1의 판정)
 *
 * 계획서 D1은 `BundleFile.content`를 바이너리까지 넓히는 것을 첫 파장으로 봤다. **넓혀
 * 보고 쟀다: `pnpm typecheck`가 34자리에서 죽고 그중 프로덕션은 하나뿐이다**(보고서 §1).
 * 나머지 33은 **`.content`를 문자열로 읽는 케이스**들이라, 고치는 일이 *"케이스를 고쳐
 * 넘기는 것"*이 된다.
 *
 * **값보다 뜻이 먼저다.** `BundleFile`은 §11.3 번들 **뿌리 기준의 산출물 파일**이고
 * (`wirebound-export-<슬러그>/` 아래로 들어간다) `PptxPart`는 **파일 하나의 안쪽**이다.
 * 같은 타입으로 두면 그 계약 문장이 한쪽에 대해 거짓이 되고, `ProjectBundle.files`에
 * pptx 파트를 실을 수 있는 길이 타입으로 열린다.
 *
 * **모양은 같다** — D1이 요구한 것은 *"순수 함수가 `경로 → 바이트`를 내고 압축은 부르는
 * 쪽이 한다"*이고 그것은 지켜진다.
 */
export interface PptxPart {
  path: string
  /**
   * XML 파트는 글자이고 이미지는 바이트다. **둘을 한 타입에 두는 이유**는 부르는 쪽이
   * 파트를 갈라 다루면 zip에 넣는 자리가 둘이 되기 때문이다.
   */
  content: string | Uint8Array
}

/** 패키지에 넣을 슬라이드 하나. */
export interface SlideSource {
  /** `ppt/slides/slideN.xml`의 전문. */
  xml: string
  /**
   * `ppt/notesSlides/notesSlideN.xml`의 전문. **없는 것이 정상이다** — 노트가 없는
   * 슬라이드는 노트 파트도, 그 관계도 만들지 않는다.
   */
  notes?: string
  /**
   * 이 슬라이드가 쓰는 매체(오늘은 화면 이미지 하나). **경로는 패키지 안의 것이고**
   * `rId`는 이 파일이 붙인다 — 슬라이드가 자기 관계 번호를 지어내면 노트 관계와 부딪친다.
   */
  media?: SlideMedia
}

/** 슬라이드에 붙는 이미지 하나. */
export interface SlideMedia {
  /** `ppt/media/` 아래의 파일 이름. 확장자가 `[Content_Types].xml`의 `Default`를 고른다. */
  fileName: string
  bytes: Uint8Array
}

/**
 * 슬라이드가 자기 이미지를 가리킬 때 쓰는 관계 id. **고정이다.**
 *
 * 슬라이드의 관계는 `rId1`이 레이아웃, `rId2`가 노트, `rId3`이 이미지로 자리가 정해져
 * 있다. 슬라이드 글자를 만드는 쪽(`slide.ts`)과 관계를 만드는 쪽(이 파일)이 이 값을
 * 나눠 가지므로 **상수로 둔다** — 두 자리에 숫자를 적으면 갈린다.
 */
export const SLIDE_IMAGE_RID = 'rId3'

const MAIN_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

const REL_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const PML = 'application/vnd.openxmlformats-officedocument.presentationml'

/**
 * 확장자 → 콘텐츠 타입. **`[Content_Types].xml`의 `Default`가 되는 표다.**
 *
 * `png` 하나만 있다 — 이 슬라이스가 만드는 이미지 자리의 계약이 PNG이기 때문이다(D2·T4).
 * 다른 형식을 받으려면 **여기 한 줄**이고, 그 줄이 없으면 그 이미지를 담은 pptx가 안 열린다.
 */
const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
}

/** 그 파일 이름의 확장자(소문자). 없으면 빈 문자열. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/** 이 패키지가 담을 수 있는 매체 확장자들. 호출자가 미리 거절할 수 있게 낸다. */
export const MEDIA_EXTENSIONS: readonly string[] = Object.keys(MEDIA_TYPES)

function relationship(id: string, type: string, target: string): string {
  return `<Relationship Id="${id}" Type="${REL_BASE}/${type}" Target="${xmlAttr(target)}"/>`
}

function relationships(entries: readonly string[]): string {
  return `${XML_DECL}<Relationships ${REL_NS}>${entries.join('')}</Relationships>`
}

/** 빈 도형 트리. 마스터·레이아웃이 이것만으로 선다 — 자리 표시자를 두지 않는다(D3). */
const EMPTY_SP_TREE =
  '<p:spTree>' +
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  '</p:spTree>'

/**
 * `p:clrMap` — 스킴 색의 자리를 잇는다. **마스터가 이것 없이는 안 열린다.**
 * 값은 PowerPoint의 기본 매핑 그대로다.
 */
const CLR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
  'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" ' +
  'hlink="hlink" folHlink="folHlink"/>'

/**
 * 마스터의 바탕. **흰색을 못 박는다.**
 *
 * 안 적으면 받는 쪽이 자기 기본값으로 칠한다 — macOS QuickLook 이 회색으로 그리는 것을
 * 봤다(T2 실측). 설계서는 문서이지 발표 자료가 아니므로 바탕은 종이색이어야 하고,
 * **받는 쪽마다 다른 색이 나오는 것 자체가** 이 산출물이 피하려는 상태다.
 */
const WHITE_BACKGROUND =
  '<p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'

const SLIDE_MASTER_XML =
  XML_DECL +
  `<p:sldMaster ${MAIN_NS}>` +
  `<p:cSld>${WHITE_BACKGROUND}${EMPTY_SP_TREE}</p:cSld>` +
  CLR_MAP +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  '</p:sldMaster>'

/**
 * **빈 레이아웃 하나**(`type="blank"`). 슬라이드가 자리 표시자를 안 쓰므로 레이아웃이
 * 담을 것이 없다 — 도형은 슬라이드가 직접 든다(D3의 배치가 슬라이드마다 같기 때문에
 * 레이아웃으로 올릴 이득이 있지만, 그러면 **자리 표시자 상속**이 걸려 슬라이드가 안 열릴
 * 때 원인이 한 겹 늘어난다. D5가 막는 부류다).
 */
const SLIDE_LAYOUT_XML =
  XML_DECL +
  `<p:sldLayout ${MAIN_NS} type="blank" preserve="1">` +
  `<p:cSld name="빈 화면">${EMPTY_SP_TREE}</p:cSld>` +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
  '</p:sldLayout>'

const NOTES_MASTER_XML =
  XML_DECL +
  `<p:notesMaster ${MAIN_NS}>` +
  `<p:cSld>${EMPTY_SP_TREE}</p:cSld>` +
  CLR_MAP +
  '</p:notesMaster>'

/**
 * 파트 목록을 만든다. **슬라이드 순서가 그대로 발표 순서다.**
 *
 * **슬라이드가 하나도 없으면 던진다.** `exportBundle`이 같은 자리에서 같은 판단을 한다 —
 * 빈 pptx를 내면 받는 사람이 그것을 연 뒤에야 비었다는 것을 안다.
 */
export function pptxPackage(slides: readonly SlideSource[]): PptxPart[] {
  if (slides.length === 0) throw new Error('pptx 에 실을 슬라이드가 없습니다')

  const hasNotes = slides.some((slide) => slide.notes !== undefined)
  const parts: PptxPart[] = []

  /** `presentation.xml`이 마스터를 `rId1`로, 노트 마스터를 `rId2`로, 슬라이드를 그 뒤로 든다. */
  const notesMasterRid = hasNotes ? 'rId2' : null
  const firstSlideRid = hasNotes ? 3 : 2
  const slideRid = (index: number): string => `rId${firstSlideRid + index}`

  parts.push({
    path: '_rels/.rels',
    content: relationships([relationship('rId1', 'officeDocument', 'ppt/presentation.xml')]),
  })

  parts.push({
    path: 'ppt/presentation.xml',
    content:
      XML_DECL +
      `<p:presentation ${MAIN_NS}>` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      (notesMasterRid === null
        ? ''
        : `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRid}"/></p:notesMasterIdLst>`) +
      '<p:sldIdLst>' +
      slides
        .map((_slide, index) => `<p:sldId id="${256 + index}" r:id="${slideRid(index)}"/>`)
        .join('') +
      '</p:sldIdLst>' +
      `<p:sldSz cx="${SLIDE_WIDTH}" cy="${SLIDE_HEIGHT}"/>` +
      `<p:notesSz cx="${NOTES_WIDTH}" cy="${NOTES_HEIGHT}"/>` +
      '</p:presentation>',
  })

  parts.push({
    path: 'ppt/_rels/presentation.xml.rels',
    content: relationships([
      relationship('rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'),
      ...(notesMasterRid === null
        ? []
        : [relationship(notesMasterRid, 'notesMaster', 'notesMasters/notesMaster1.xml')]),
      ...slides.map((_slide, index) =>
        relationship(slideRid(index), 'slide', `slides/slide${index + 1}.xml`),
      ),
    ]),
  })

  parts.push({ path: 'ppt/slideMasters/slideMaster1.xml', content: SLIDE_MASTER_XML })
  parts.push({
    path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    content: relationships([
      relationship('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'),
      relationship('rId2', 'theme', '../theme/theme1.xml'),
    ]),
  })

  parts.push({ path: 'ppt/slideLayouts/slideLayout1.xml', content: SLIDE_LAYOUT_XML })
  parts.push({
    path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    content: relationships([
      relationship('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml'),
    ]),
  })

  parts.push({ path: 'ppt/theme/theme1.xml', content: THEME_XML })

  if (hasNotes) {
    parts.push({ path: 'ppt/notesMasters/notesMaster1.xml', content: NOTES_MASTER_XML })
    parts.push({
      path: 'ppt/notesMasters/_rels/notesMaster1.xml.rels',
      // **테마 한 벌을 마스터 둘이 나눠 쓴다**(`theme.ts`의 머리말).
      content: relationships([relationship('rId1', 'theme', '../theme/theme1.xml')]),
    })
  }

  for (const [index, slide] of slides.entries()) {
    const number = index + 1
    parts.push({ path: `ppt/slides/slide${number}.xml`, content: slide.xml })
    parts.push({
      path: `ppt/slides/_rels/slide${number}.xml.rels`,
      content: relationships([
        relationship('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'),
        ...(slide.notes === undefined
          ? []
          : [relationship('rId2', 'notesSlide', `../notesSlides/notesSlide${number}.xml`)]),
        ...(slide.media === undefined
          ? []
          : [relationship(SLIDE_IMAGE_RID, 'image', `../media/${slide.media.fileName}`)]),
      ]),
    })

    if (slide.notes !== undefined) {
      parts.push({ path: `ppt/notesSlides/notesSlide${number}.xml`, content: slide.notes })
      parts.push({
        path: `ppt/notesSlides/_rels/notesSlide${number}.xml.rels`,
        content: relationships([
          relationship('rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'),
          relationship('rId2', 'slide', `../slides/slide${number}.xml`),
        ]),
      })
    }

    if (slide.media !== undefined) {
      parts.push({ path: `ppt/media/${slide.media.fileName}`, content: slide.media.bytes })
    }
  }

  parts.unshift({ path: '[Content_Types].xml', content: contentTypes(parts) })
  return parts
}

/**
 * **파트 목록에서 콘텐츠 타입을 만든다** — 목록을 손으로 다시 적지 않는다.
 *
 * 손으로 적으면 파트를 하나 더할 때 여기를 빠뜨릴 수 있고, **빠뜨린 pptx는 그냥 안 열린다.**
 * 여기서 유도하면 그 경로가 없다.
 */
function contentTypes(parts: readonly PptxPart[]): string {
  const extensions = new Set<string>(['rels'])
  const overrides: string[] = []

  for (const part of parts) {
    const extension = extensionOf(part.path)
    if (extension !== 'xml') {
      extensions.add(extension)
      continue
    }
    const type = overrideType(part.path)
    if (type === null) continue
    overrides.push(`<Override PartName="/${xmlAttr(part.path)}" ContentType="${type}"/>`)
  }

  const defaults = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    ...[...extensions]
      .filter((extension) => extension !== 'rels')
      .sort()
      .map((extension) => {
        const type = MEDIA_TYPES[extension]
        if (type === undefined) throw new Error(`pptx 에 담을 수 없는 확장자입니다: ${extension}`)
        return `<Default Extension="${extension}" ContentType="${type}"/>`
      }),
  ]

  return (
    XML_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    defaults.join('') +
    overrides.join('') +
    '</Types>'
  )
}

/**
 * 그 XML 파트의 콘텐츠 타입. `null`이면 `Default`(`application/xml`)로 족한 파트다 —
 * 오늘 그런 XML 파트는 없지만 **모르는 경로를 조용히 흘려보내지 않으려고** 갈래를 남긴다.
 */
function overrideType(path: string): string | null {
  if (path === 'ppt/presentation.xml') return `${PML}.presentation.main+xml`
  if (path.startsWith('ppt/slideMasters/')) return `${PML}.slideMaster+xml`
  if (path.startsWith('ppt/slideLayouts/')) return `${PML}.slideLayout+xml`
  if (path.startsWith('ppt/notesMasters/')) return `${PML}.notesMaster+xml`
  if (path.startsWith('ppt/notesSlides/')) return `${PML}.notesSlide+xml`
  if (path.startsWith('ppt/slides/')) return `${PML}.slide+xml`
  if (path === 'ppt/theme/theme1.xml') {
    return 'application/vnd.openxmlformats-officedocument.theme+xml'
  }
  return null
}
