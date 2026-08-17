/**
 * **슬라이드 한 장의 글자**(D3).
 *
 * 자리 표시자를 쓰지 않고 **글 상자를 직접 놓는다.** 레이아웃에서 상속하면 슬라이드가
 * 안 열릴 때 원인이 *"슬라이드 · 레이아웃 · 마스터"* 셋으로 늘어난다 — D5가 막는 부류다.
 *
 * ---
 *
 * # 글자는 문단이고 문단은 줄이 아니다
 *
 * OOXML의 `a:p`는 **문단**이고 그 안의 `a:r`이 같은 서식을 가진 토막이다. 줄바꿈을 `\n`
 * 으로 넣을 수 없다 — 그 글자는 XML 텍스트로 살아남지만 PowerPoint가 **한 줄로 그린다.**
 * 그래서 줄마다 `a:p`를 만든다.
 */
import type { Box } from './geometry'
import { POINT } from './geometry'
import { XML_DECL, xmlAttr, xmlText } from './xml'

const MAIN_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

/** 문단 하나. 서식은 문단마다 다르다 — 코멘트 제목 줄과 본문 줄이 같지 않다. */
export interface Line {
  text: string
  /** 100분의 1포인트. `sz` 속성이 그 단위다. */
  size: number
  bold?: boolean
  /** `RRGGBB`. 없으면 상속한다. */
  color?: string
  /** 문단 앞의 들여쓰기 단계. 글머리표는 안 쓴다 — 목록 기호는 우리가 글자로 붙인다. */
  indent?: number
  /** 이 문단 위에 둘 빈 공간(100분의 1포인트). 절과 절 사이를 벌린다. */
  spaceBefore?: number
}

/** 글자 크기를 포인트로 적는다. `sz`가 100분의 1포인트이므로 여기서 한 번만 곱한다. */
export function pt(points: number): number {
  return Math.round(points * 100)
}

/** 도형 하나의 `a:xfrm`. */
function transform(box: Box): string {
  return (
    '<a:xfrm>' +
    `<a:off x="${box.x}" y="${box.y}"/>` +
    `<a:ext cx="${box.width}" cy="${box.height}"/>` +
    '</a:xfrm>'
  )
}

function paragraph(line: Line): string {
  const properties: string[] = []
  if (line.indent !== undefined && line.indent > 0) {
    properties.push(`marL="${line.indent * 8 * POINT}" indent="0"`)
  }
  const spacing =
    line.spaceBefore === undefined
      ? ''
      : `<a:spcBef><a:spcPts val="${line.spaceBefore}"/></a:spcBef>`
  const run: string[] = [`sz="${line.size}"`, 'lang="ko-KR" dirty="0"']
  if (line.bold === true) run.push('b="1"')
  const fill = line.color === undefined ? '' : `<a:solidFill><a:srgbClr val="${xmlAttr(line.color)}"/></a:solidFill>`

  return (
    '<a:p>' +
    `<a:pPr ${properties.join(' ')}><a:buNone/>${spacing}</a:pPr>` +
    `<a:r><a:rPr ${run.join(' ')}>${fill}</a:rPr><a:t>${xmlText(line.text)}</a:t></a:r>` +
    '</a:p>'
  )
}

/**
 * 글 상자 하나.
 *
 * **`normAutofit`을 쓴다** — 넘치는 글을 PowerPoint가 줄여서 담는다. 그래도 넘치면
 * 잘리고, **잘려도 사라지지 않게 하는 것이 노트의 몫이다**(D3).
 */
export function textBox(options: {
  id: number
  name: string
  box: Box
  lines: readonly Line[]
}): string {
  return (
    '<p:sp>' +
    `<p:nvSpPr><p:cNvPr id="${options.id}" name="${xmlAttr(options.name)}"/>` +
    '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    `<p:spPr>${transform(options.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    '<p:txBody>' +
    '<a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr>' +
    '<a:lstStyle/>' +
    (options.lines.length === 0 ? '<a:p/>' : options.lines.map(paragraph).join('')) +
    '</p:txBody>' +
    '</p:sp>'
  )
}

/** 슬라이드 하나의 전문. 도형 글자들을 받아 감싼다. */
export function slideXml(shapes: readonly string[]): string {
  return (
    XML_DECL +
    `<p:sld ${MAIN_NS}>` +
    '<p:cSld><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    shapes.join('') +
    '</p:spTree></p:cSld>' +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
    '</p:sld>'
  )
}

/** 노트 슬라이드 하나의 전문. **본문 자리 표시자여야 PowerPoint의 노트 창에 뜬다.** */
export function notesXml(box: Box, lines: readonly Line[]): string {
  return (
    XML_DECL +
    `<p:notes ${MAIN_NS}>` +
    '<p:cSld><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    '<p:sp>' +
    '<p:nvSpPr><p:cNvPr id="2" name="노트"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    `<p:spPr>${transform(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    '<p:txBody>' +
    '<a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>' +
    (lines.length === 0 ? '<a:p/>' : lines.map(paragraph).join('')) +
    '</p:txBody>' +
    '</p:sp>' +
    '</p:spTree></p:cSld>' +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
    '</p:notes>'
  )
}
