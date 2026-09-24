/**
 * **슬라이드 한 장의 글자.**
 *
 * 자리 표시자를 쓰지 않고 **글 상자를 직접 놓는다.** 레이아웃에서 상속하면 슬라이드가
 * 안 열릴 때 원인이 *"슬라이드 · 레이아웃 · 마스터"* 셋으로 늘어난다 — `ooxml.ts`의
 * 「파트가 여럿이고 관계가 물려 있다」가 막는 부류다.
 *
 * ---
 *
 * # 글자는 문단이고 문단은 줄이 아니다
 *
 * OOXML의 `a:p`는 **문단**이고 그 안의 `a:r`이 같은 서식을 가진 토막이다. 줄바꿈을 `\n`
 * 으로 넣을 수 없다 — 그 글자는 XML 텍스트로 살아남지만 PowerPoint가 **한 줄로 그린다.**
 * 그래서 줄마다 `a:p`를 만든다.
 *
 * **그 규칙을 이 파일이 강제한다 — 부르는 쪽에 맡기지 않는다.**
 *
 * `Line` 하나를 `a:p` 하나로 두면 **사람이 친 글자에는 그 규칙이 안 걸린다.**
 * 코멘트 본문은 사람이 치는 자유 입력이고(`apps/api`의 코멘트 라우트는 NUL만 막는다 — 줄바꿈은
 * 통과한다) 여러 줄인 것이 정상이다. PowerPoint로 읽으면 본문
 * `'첫째 줄\n둘째 줄\n셋째 줄'`이 **`첫째 줄둘째 줄셋째 줄`**로 나온다 — **공백조차 안
 * 남는다.** 같은 글자를 HTML 번들은 줄을 지켜 보인다(셸 CSS의 `.wb-export-entry-body`가
 * `white-space: pre-wrap`). 곧 여기서 가르지 않으면 **두 산출물이 같은 코멘트를 다르게
 * 말한다.**
 *
 * **부르는 쪽에서 가르면 자리가 는다.** `Line`을 만드는 자리가 지금 둘이고(오른쪽 칸·노트)
 * 하나를 빠뜨리면 그 갈래만 붙어 나온다. `paragraphs()`가 `Line` → `a:p` 사이 **하나뿐인
 * 목**이므로 여기서 가르면 새 자리가 생겨도 그대로 걸린다.
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

/**
 * 한 `Line`을 **문단들로** 가른다. 줄바꿈이 없으면 그대로 하나다.
 *
 * **`\r\n`과 홀로 온 `\r`도 가른다** — 붙여넣기로 들어오는 글자에 그 둘이 섞인다.
 *
 * **`spaceBefore`는 첫 문단만 갖는다.** 절과 절 사이를 벌리는 값이므로 한 코멘트의
 * 둘째·셋째 줄에까지 붙으면 그 안이 절만큼 벌어진다. `indent`는 전부 갖는다 — 같은 코멘트의
 * 본문이 계속되는 것이다.
 */
export function paragraphs(line: Line): Line[] {
  const segments = line.text.replace(/\r\n?/g, '\n').split('\n')
  if (segments.length === 1) return [line]
  return segments.map((text, index) =>
    index === 0 ? { ...line, text } : { ...line, text, spaceBefore: undefined },
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

  const pPr = `<a:pPr ${properties.join(' ')}><a:buNone/>${spacing}</a:pPr>`
  // **빈 문단은 토막을 안 만든다.** 사람이 코멘트에 빈 줄을 넣으면 여기로 오는데, 빈 `a:t`를
  // 실으면 PowerPoint가 글자 없는 토막을 들고 있게 된다 — 문단만 두면 빈 줄 그대로다.
  if (line.text.length === 0) return `<a:p>${pPr}</a:p>`

  return (
    '<a:p>' +
    pPr +
    `<a:r><a:rPr ${run.join(' ')}>${fill}</a:rPr><a:t>${xmlText(line.text)}</a:t></a:r>` +
    '</a:p>'
  )
}

/** `Line` 목록을 문단 글자로. **`paragraphs()`를 지나는 유일한 목이다**(위 머리말). */
function bodyOf(lines: readonly Line[]): string {
  if (lines.length === 0) return '<a:p/>'
  return lines.flatMap(paragraphs).map(paragraph).join('')
}

/**
 * 글 상자 하나.
 *
 * **`normAutofit`을 쓴다** — 넘치는 글을 PowerPoint가 줄여서 담는다. 그래도 넘치면
 * 잘리고, **잘려도 사라지지 않게 하는 것이 노트의 몫이다.**
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
    bodyOf(options.lines) +
    '</p:txBody>' +
    '</p:sp>'
  )
}

/**
 * **화면 이미지가 없는 자리.** 점선 상자 안에 가운데로 말한다.
 *
 * **빈 자리로 두지 않는다** — 아무것도 없으면 읽는 사람이 *"이미지가 원래 없는 형식"*으로
 * 읽고, 그러면 화면을 그리는 쪽이 그 자리를 채웠는지 아닌지도 눈으로 구분되지 않는다.
 */
export function placeholder(options: {
  id: number
  box: Box
  text: string
  size: number
}): string {
  return (
    '<p:sp>' +
    `<p:nvSpPr><p:cNvPr id="${options.id}" name="화면 자리"/>` +
    '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    `<p:spPr>${transform(options.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    '<a:solidFill><a:srgbClr val="F5F7FA"/></a:solidFill>' +
    '<a:ln w="12700"><a:solidFill><a:srgbClr val="9AA5B1"/></a:solidFill>' +
    '<a:prstDash val="dash"/></a:ln></p:spPr>' +
    '<p:txBody>' +
    '<a:bodyPr wrap="square" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>' +
    '<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>' +
    `<a:r><a:rPr sz="${options.size}" lang="ko-KR" dirty="0">` +
    '<a:solidFill><a:srgbClr val="6B7280"/></a:solidFill></a:rPr>' +
    `<a:t>${xmlText(options.text)}</a:t></a:r></a:p>` +
    '</p:txBody>' +
    '</p:sp>'
  )
}

/**
 * 그림 하나. **바이트는 여기 없다** — `r:embed`가 관계를 가리키고 그 관계와 매체 파트는
 * `ooxml.ts`가 만든다(`SLIDE_IMAGE_RID`).
 */
export function image(options: {
  id: number
  name: string
  relationshipId: string
  box: Box
}): string {
  return (
    '<p:pic>' +
    `<p:nvPicPr><p:cNvPr id="${options.id}" name="${xmlAttr(options.name)}"/>` +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
    `<p:blipFill><a:blip r:embed="${xmlAttr(options.relationshipId)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${transform(options.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    '</p:pic>'
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
    bodyOf(lines) +
    '</p:txBody>' +
    '</p:sp>' +
    '</p:spTree></p:cSld>' +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
    '</p:notes>'
  )
}
