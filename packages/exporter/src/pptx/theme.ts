/**
 * **테마 파트의 글자**(`ppt/theme/theme{1,2}.xml`).
 *
 * 마스터는 테마 관계를 **반드시** 갖는다(ECMA-376 — 마스터마다 테마 파트가 하나 붙는다).
 * 그래서 이 파일은 *"쓰고 싶어서"*가 아니라 **없으면 pptx가 안 열려서** 있다.
 *
 * ---
 *
 * # 설계서의 테마(「테마 시스템」)와 다른 것이다 — 이름이 같을 뿐이다
 *
 * 설계서의 테마는 **CSS로 화면과 HTML 번들을 칠한다.** 그 색을
 * OOXML의 `a:clrScheme`으로 옮기는 것은 *"도형 변환"*의 한 갈래이고 설계서 「명시적으로
 * 제외한 것」이 그것을 **제외한다.** 슬라이드에 실릴 화면은 **래스터 이미지**이므로(「확정된
 * 설계 결정」) 그 이미지가 이미 테마 색을 담고 있고, 여기서 다시 칠하면 **같은 색이 두 자리에서 다르게**
 * 나온다.
 *
 * 그러므로 이 테마는 **글자와 여백을 위한 중립 바탕**이다. 값의 근거는 그것 하나다.
 *
 * # 글자는 한 벌이고 파트는 마스터마다 하나다
 *
 * **파트 하나를 두 마스터가 나눠 쓰면 PowerPoint 가 막는다** —
 * 근거와 값은 `ooxml.ts` 의 `SLIDE_MASTER_THEME` 머리말에 있다.
 *
 * **여기서 내는 것은 글자 하나뿐이다.** 파트를 몇 개 만들지는 `ooxml.ts` 가 정하고, 그
 * 파트들이 **같은 상수를 쓰므로 색이 갈릴 길이 없다** — 갈리는 것은 파트 경로뿐이다.
 */
import { XML_DECL } from './xml'

/** 본문·제목이 쓸 글꼴. **`+mn-ea`가 한글을 고른다** — 라틴 글꼴만 두면 받는 쪽이 대체한다. */
const LATIN = 'Calibri'
const KOREAN = '맑은 고딕'

/** 색 하나. `a:clrScheme`의 열두 자리를 표로 둔다 — 조건이 아니라 목록이다. */
const SCHEME: readonly (readonly [string, string])[] = [
  ['dk1', '000000'],
  ['lt1', 'FFFFFF'],
  ['dk2', '1F2933'],
  ['lt2', 'F5F7FA'],
  ['accent1', '2F6FEB'],
  ['accent2', '0E9F6E'],
  ['accent3', 'D97706'],
  ['accent4', 'DC2626'],
  ['accent5', '7C3AED'],
  ['accent6', '0891B2'],
  ['hlink', '2F6FEB'],
  ['folHlink', '7C3AED'],
]

/**
 * `dk1`·`lt1`은 **시스템 색으로** 적는다. PowerPoint가 내는 파일이 그 모양이고
 * (참조 pptx에서 쟀다), 그래야 받는 쪽의 고대비 설정이 글자를 뒤집을 수 있다.
 */
function schemeColor([name, hex]: readonly [string, string]): string {
  if (name === 'dk1') return '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
  if (name === 'lt1') return '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
  return `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`
}

/** 채우기·선·효과 목록. 규격이 **각각 셋**을 요구한다 — 개수가 모자라면 안 열린다. */
const FILL_STYLES =
  '<a:fillStyleLst>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"><a:tint val="60000"/></a:schemeClr></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill>' +
  '</a:fillStyleLst>'

const LINE_STYLES =
  '<a:lnStyleLst>' +
  [6350, 12700, 19050]
    .map(
      (w) =>
        `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">` +
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
        '<a:prstDash val="solid"/></a:ln>',
    )
    .join('') +
  '</a:lnStyleLst>'

const EFFECT_STYLES =
  '<a:effectStyleLst>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) +
  '</a:effectStyleLst>'

const BG_FILL_STYLES =
  '<a:bgFillStyleLst>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
  '</a:bgFillStyleLst>'

function fontCollection(tag: 'majorFont' | 'minorFont'): string {
  return (
    `<a:${tag}>` +
    `<a:latin typeface="${LATIN}"/>` +
    `<a:ea typeface="${KOREAN}"/>` +
    '<a:cs typeface=""/>' +
    `</a:${tag}>`
  )
}

/** 테마 파트의 글자 전부. **인자가 없다** — 값이 하나뿐이고 그것이 위 머리말의 판정이다. */
export const THEME_XML: string =
  XML_DECL +
  '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="wirebound">' +
  '<a:themeElements>' +
  `<a:clrScheme name="wirebound">${SCHEME.map(schemeColor).join('')}</a:clrScheme>` +
  `<a:fontScheme name="wirebound">${fontCollection('majorFont')}${fontCollection('minorFont')}</a:fontScheme>` +
  `<a:fmtScheme name="wirebound">${FILL_STYLES}${LINE_STYLES}${EFFECT_STYLES}${BG_FILL_STYLES}</a:fmtScheme>` +
  '</a:themeElements>' +
  '<a:objectDefaults/>' +
  '<a:extraClrSchemeLst/>' +
  '</a:theme>'
