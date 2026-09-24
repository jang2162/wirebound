/**
 * **`exportPptx` — 페이지마다 슬라이드 한 장**(설계서 「로드맵」의 PPTX 내보내기).
 *
 * ```
 * [Content_Types].xml · _rels/… · ppt/presentation.xml
 * ppt/slides/slideN.xml        페이지 N (제목 · 화면 자리 · 코멘트 · 상호작용)
 * ppt/notesSlides/notesSlideN.xml  같은 것의 전문
 * ppt/media/…                  화면 이미지 (있을 때만)
 * ```
 *
 * ---
 *
 * ## 파일 시스템도 zip도 모른다
 *
 * `exportBundle`과 같은 규칙이다. **PPTX는 zip이지만 이 함수는 파트 목록을 낼 뿐이다** —
 * 압축은 `apps/api`가 `fflate`로 하고, 여기서 또 하면 자리가 둘이 된다.
 *
 * ## 이미지는 인자다. 없어도 나오지만 **조용하지 않다**
 *
 * 화면 이미지는 호출자가 그려서 넘긴다(`apps/api`가 브라우저로 그린다). 못 그려도 산출물이
 * 나와야 하는 이유는 **설계서 「자동 문장화」가 PPTX도 상호작용 문장을 싣는다고 적기
 * 때문**이다 — 이미지가 없어도 실을 것이 있다.
 *
 * **없다는 것을 두 자리가 말한다:**
 *
 * | 어디 | 무엇 | 누구에게 |
 * |---|---|---|
 * | 슬라이드 안 | 화면 자리에 *"화면 이미지가 실리지 않았습니다"* | **파일을 연 사람** |
 * | 돌려주는 값 | `screenless[]` — 이미지가 없는 페이지 이름들 | **부르는 쪽**(라우트가 미리 말할 수 있다) |
 *
 * 한 자리만 두면 안 된다. 값만 내면 파일을 받아 연 사람이 **빈 자리를 형식의 성질로 읽고**,
 * 슬라이드만 말하면 내려받기 전에 아무도 모른다. `exportBundle`이 `errors`를 값으로 내고
 * 미리보기 라우트가 그것을 화면에 올리는 것과 같은 짝이다.
 *
 * ## 배치는 설계서 「설계서 화면 구조」와 같다. 넘치는 글은 노트가 받는다
 *
 * 화면이 왼쪽, 코멘트와 상호작용이 오른쪽이다(`geometry.ts`). **슬라이드는 넘치면
 * 잘리므로 같은 글을 노트에 전문으로 다시 싣는다** — 잘려도 사라지지 않는다.
 *
 * **페이지 설명은 노트에만 싣는다.** 슬라이드는 *"화면 · 코멘트 · 상호작용"*
 * 셋이고, 설명은 문단이라 오른쪽 칸에 넣으면 코멘트를 밀어낸다. **버리지는
 * 않는다** — 노트가 전문을 받는 자리이므로 거기 있다.
 *
 * ## 카탈로그를 설치한다 — **안 하면 문장이 조용히 나빠진다**
 *
 * `exportPage`가 같은 자리에서 같은 판단을 한다(`page.tsx`의 `installRegistries` 머리말 —
 * *"카탈로그 설치를 번들의 계약으로 든다"*). **PPTX는 그 자리를 그냥 물려받지 못한다** —
 * 그리지 않으므로 `renderPageTree`를 안 지나기 때문이다.
 *
 * **안 부르면 무엇이 되는가**(`test/pptx-catalog.test.ts`가 잰다): 상호작용 문장이
 * *"② 목록이 **loading**로 바뀝니다"*가 된다. 카탈로그가 있으면 *"**로딩 상태**로
 * 바뀝니다"*다. **던지지도 않고 개수도 그대로라 조용히 나빠진다** — `packages/cli`의
 * `read/catalog.ts`가 `pageView`에 대해 같은 값을 재서 같은 말을 적어 두었다.
 *
 * ## 코멘트와 문장을 다시 짜지 않는다
 *
 * `commentEntries`(번들이 부르는 것)와 `pageSentences`(번들의 셸이 부르는 것)를 **그대로**
 * 부른다. 빈 상태의 말과 탭 이름도 `../labels`가 소유한다. `test/pptx-parity.test.tsx`가
 * 값으로, `test/duplicate-census.test.ts`가 소스로 그것을 지킨다.
 */
import type { PageDocument } from '@wirebound/schema'
import { commentEntries, type BundleComment, type CommentEntry } from '../bundle/comments'
import {
  EMPTY_COMMENTS,
  EMPTY_DESCRIPTION,
  EMPTY_INTERACTIONS,
  MARKER_WITHOUT_COMMENT,
  panelLabel,
} from '../labels'
import { installRegistries } from '../page'
import { pageSentences } from '../sentences'
import { NOTES_BOX, PANEL_BOX, SCREEN_BOX, TITLE_BOX, type Box } from './geometry'
import {
  extensionOf,
  MEDIA_EXTENSIONS,
  pptxPackage,
  SLIDE_IMAGE_RID,
  type PptxPart,
  type SlideSource,
} from './ooxml'
import { image, notesXml, placeholder, pt, slideXml, textBox, type Line } from './slide'

/** 슬라이드 하나가 될 페이지. */
export interface PptxPage {
  /**
   * 슬라이드 제목이자 `screenless`에 실릴 이름.
   *
   * **번들과 같은 이름을 쓴다**(`TargetedPage.bundleTitle` — 조상 메뉴가 붙은 이름).
   * 맨 제목이면 서로 다른 메뉴의 같은 제목이 슬라이드 둘에서 `목록`·`목록`이 된다 —
   * **번들의 좌측 트리가 같은 이유로 그 이름을 쓴다.** 한 페이지를 두 이름으로
   * 부르면 같은 설계서의 두 산출물이 갈린다.
   */
  title: string
  document: PageDocument
  /** 설계서 「페이지 JSON」 봉투의 `page.description`. **노트에만 실린다**(머리말의 배치 절). */
  description?: string | null
  /** 이 페이지의 코멘트. 출처는 호출자가 정한다 — `BundlePage.comments`와 같은 계약이다. */
  comments?: readonly BundleComment[]
  /** 이 페이지의 화면 이미지. **없어도 산출물이 나온다**(머리말 「이미지는 인자다」 절). */
  screen?: PptxScreen | null
}

/**
 * 슬라이드에 실을 화면 이미지 하나. **이것이 화면을 그리는 호출자와의 계약이다.**
 *
 * 크기를 안 받는다 — 놓을 자리는 `SCREEN_BOX`로 정해져 있고 **그 안에 비율을 지켜
 * 들어간다**(`fitInto`). 이미지의 화소 크기를 알아야 비율을 지킬 수 있으므로 그것만 받는다.
 */
export interface PptxScreen {
  /** `png`만 받는다 — `[Content_Types].xml`이 아는 확장자가 그것뿐이다. */
  fileName: string
  bytes: Uint8Array
  /** 화소 단위. **비율을 지키는 데만 쓴다** — 슬라이드 위 크기는 자리가 정한다. */
  width: number
  height: number
}

export interface ExportPptxOptions {
  /** **순서가 곧 슬라이드 순서다.** */
  pages: readonly PptxPage[]
}

export interface ExportedPptx {
  parts: PptxPart[]
  /**
   * 화면 이미지가 실리지 않은 페이지들의 이름. **번들 순서다.**
   *
   * 부르는 쪽이 이것으로 *"이미지 없이 나갔다"*를 미리 말한다 — `exportBundle`의
   * `errors`와 같은 자리다(머리말 「이미지는 인자다」 절).
   */
  screenless: string[]
}

/** 슬라이드 안 도형 id는 1이 그룹이므로 2부터 쓴다. */
const FIRST_SHAPE_ID = 2

const TITLE_SIZE = pt(20)
const SECTION_SIZE = pt(12)
const ENTRY_SIZE = pt(10)
const META_SIZE = pt(9)
const NOTE_SIZE = pt(11)

/** 절 제목의 색. 본문과 갈라 보이기만 하면 되므로 테마의 `dk2`와 같은 값을 쓴다. */
const SECTION_COLOR = '1F2933'
/** 작성자·시각 같은 곁글. */
const META_COLOR = '6B7280'

/**
 * PPTX 하나를 값으로 만든다.
 *
 * **페이지가 하나도 없으면 던진다** — `exportBundle`과 같은 판단이다(그 함수의 머리말).
 */
export function exportPptx(options: ExportPptxOptions): ExportedPptx {
  const pages = options.pages
  if (pages.length === 0) throw new Error('pptx 에 실을 페이지가 없습니다')

  // **문장화보다 먼저다**(위 머리말). 멱등이라 호출자가 등록한 것을 덮지 않는다.
  installRegistries()

  const screenless: string[] = []
  const slides: SlideSource[] = pages.map((page, index) => {
    const entries = commentEntries(page.document, page.comments ?? [])
    const sentences = pageSentences(page.document).map((sentence) => sentence.text)
    const screen = page.screen ?? null
    if (screen === null) screenless.push(page.title)

    return {
      xml: slideXml([
        textBox({
          id: FIRST_SHAPE_ID,
          name: panelTitleName(page.title),
          box: TITLE_BOX,
          lines: [{ text: page.title, size: TITLE_SIZE, bold: true }],
        }),
        screen === null
          ? placeholder({ id: FIRST_SHAPE_ID + 1, box: SCREEN_BOX, text: NO_SCREEN, size: ENTRY_SIZE })
          : image({
              id: FIRST_SHAPE_ID + 1,
              name: '화면',
              relationshipId: SLIDE_IMAGE_RID,
              box: fitInto(SCREEN_BOX, screen),
            }),
        textBox({
          id: FIRST_SHAPE_ID + 2,
          name: '설계 노트',
          box: PANEL_BOX,
          lines: panelLines(entries, sentences),
        }),
      ]),
      notes: notesXml(NOTES_BOX, noteLines(page, entries, sentences)),
      media:
        screen === null ? undefined : { fileName: mediaName(screen, index), bytes: screen.bytes },
    }
  })

  return { parts: pptxPackage(slides), screenless }
}

/** 화면 이미지가 없을 때 그 자리가 말하는 것. */
export const NO_SCREEN = '화면 이미지가 실리지 않았습니다'

/** 도형 이름. 사람이 PowerPoint의 선택 창에서 보는 글자다. */
function panelTitleName(title: string): string {
  return `제목: ${title}`
}

/**
 * 이미지의 패키지 안 이름. **확장자를 검사한다** — 모르는 확장자는 `[Content_Types].xml`에
 * `Default`가 없어서 **그 pptx가 통째로 안 열린다.** 던지는 편이 낫다.
 *
 * **호출자가 준 이름을 그대로 쓰지 않는다.** 두 페이지가 같은 파일 이름을 주면 뒤엣것이
 * 앞엣것을 덮고 **슬라이드 둘이 같은 그림을 그린다** — 그 사고는 눈으로만 보인다.
 */
function mediaName(screen: PptxScreen, index: number): string {
  const extension = extensionOf(screen.fileName)
  if (!MEDIA_EXTENSIONS.includes(extension)) {
    throw new Error(
      `pptx 에 담을 수 없는 이미지 형식입니다: ${screen.fileName} (${MEDIA_EXTENSIONS.join('·')} 만 됩니다)`,
    )
  }
  return `image${index + 1}.${extension}`
}

/**
 * 자리 안에 **비율을 지켜** 넣고 가운데에 둔다.
 *
 * 자리에 그냥 늘리면 화면이 찌그러진다 — 설계서의 목업이 찌그러지면 그것을 보고 만드는
 * 사람이 잘못된 비율을 만든다. **화소 크기가 이상하면 자리를 그대로 쓴다**(0이나 음수는
 * 비율을 만들 수 없다).
 */
function fitInto(box: Box, screen: PptxScreen): Box {
  if (!(screen.width > 0) || !(screen.height > 0)) return box
  const scale = Math.min(box.width / screen.width, box.height / screen.height)
  const width = Math.round(screen.width * scale)
  const height = Math.round(screen.height * scale)
  return {
    x: box.x + Math.round((box.width - width) / 2),
    y: box.y + Math.round((box.height - height) / 2),
    width,
    height,
  }
}

/** 코멘트 한 줄이 되는 문단들. **탭 하나가 절 하나다**(`labels.ts`의 머리말). */
function commentLines(entries: readonly CommentEntry[]): Line[] {
  if (entries.length === 0) return [{ text: EMPTY_COMMENTS, size: ENTRY_SIZE, color: META_COLOR }]
  return entries.flatMap((entry) => {
    const head: Line = { text: entry.label, size: ENTRY_SIZE, bold: true }
    if (entry.kind === 'marker-without-comment') {
      return [head, { text: MARKER_WITHOUT_COMMENT, size: META_SIZE, color: META_COLOR, indent: 1 }]
    }
    const meta = [entry.authorName, entry.createdAt].filter((part): part is string => part !== null)
    return [
      head,
      { text: entry.body, size: ENTRY_SIZE, indent: 1 },
      // **둘 다 없으면 줄 자체를 안 그린다** — 번들의 `CommentMeta`와 같은 규칙이다.
      ...(meta.length === 0
        ? []
        : [{ text: meta.join(' · '), size: META_SIZE, color: META_COLOR, indent: 1 }]),
    ]
  })
}

function sentenceLines(sentences: readonly string[]): Line[] {
  if (sentences.length === 0) {
    return [{ text: EMPTY_INTERACTIONS, size: ENTRY_SIZE, color: META_COLOR }]
  }
  return sentences.map((text) => ({ text, size: ENTRY_SIZE }))
}

function section(label: string, first: boolean): Line {
  return {
    text: label,
    size: SECTION_SIZE,
    bold: true,
    color: SECTION_COLOR,
    spaceBefore: first ? undefined : pt(10),
  }
}

/** 슬라이드 오른쪽 칸. */
function panelLines(entries: readonly CommentEntry[], sentences: readonly string[]): Line[] {
  return [
    section(panelLabel('comments'), true),
    ...commentLines(entries),
    section(panelLabel('interactions'), false),
    ...sentenceLines(sentences),
  ]
}

/**
 * 노트 전문.
 *
 * **슬라이드에 실린 것을 전부 다시 싣고 페이지 설명을 더한다.** 슬라이드 쪽은 자리에
 * 맞춰 줄어들거나 잘리지만 노트는 스크롤되므로, 잘려도 여기 남는다.
 */
function noteLines(
  page: PptxPage,
  entries: readonly CommentEntry[],
  sentences: readonly string[],
): Line[] {
  const description = page.description ?? null
  return [
    { text: page.title, size: NOTE_SIZE, bold: true },
    section(panelLabel('description'), false),
    {
      text: description === null || description.trim().length === 0 ? EMPTY_DESCRIPTION : description,
      size: ENTRY_SIZE,
      color: description === null ? META_COLOR : undefined,
    },
    section(panelLabel('comments'), false),
    ...commentLines(entries),
    section(panelLabel('interactions'), false),
    ...sentenceLines(sentences),
  ]
}

export type { PptxPart } from './ooxml'
