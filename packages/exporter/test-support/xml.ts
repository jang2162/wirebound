/**
 * **케이스가 XML을 재는 자.**
 *
 * `unit` 프로젝트에는 DOM이 없다(루트 `vitest.config.ts` — jsdom은 `web`에만 걸린다).
 * 그래서 `DOMParser`를 못 쓴다. **자를 구현 파일에 두지 않는다**는 규칙대로 여기(test-support)에
 * 둔다 — 프로덕션은 이 파일을 부르지 않는다.
 *
 * ---
 *
 * # 무엇을 재고 무엇을 안 재나
 *
 * **잰다:** 태그가 짝을 이루는가 · 뿌리가 하나인가 · 속성이 따옴표로 닫히는가 ·
 * 텍스트에 날 `<`가 없는가 · `&`가 실체 참조로만 오는가 · **XML 1.0이 못 담는 글자가
 * 남아 있지 않은가.**
 *
 * **안 잰다:** 스키마(요소가 그 자리에 올 수 있는가) · 네임스페이스 선언 · DTD.
 * 그것을 재는 것은 **받는 쪽**이고, 이 저장소의 스모크가 그 자리다(보고서의 스모크 절).
 *
 * **곧 이 자는 *"우리가 만든 규칙에 우리가 맞춘 것"*의 아래쪽 절반이다.** 여기를 지나도
 * PowerPoint가 연다는 뜻이 아니다 — 여기서 죽으면 **확실히 안 열린다**는 뜻이다.
 */

export interface XmlElement {
  name: string
  attributes: Record<string, string>
  children: XmlElement[]
  /** 이 요소가 **직접** 가진 글자. 자식의 글자는 안 담는다. */
  text: string
}

/** XML 1.0이 담을 수 없는 글자. 프로덕션의 `xmlText`가 거르는 것과 같은 집합이다. */
const FORBIDDEN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/** 허용하는 실체 참조. 숫자 참조도 받는다. */
const ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/

/**
 * 글자를 읽어 뿌리 요소를 낸다. **틀리면 던진다** — 어디가 틀렸는지 문장에 담는다.
 */
export function parseXml(source: string): XmlElement {
  if (FORBIDDEN.test(source)) throw new Error('XML 1.0 이 담을 수 없는 글자가 있습니다')

  let at = 0
  const stack: XmlElement[] = []
  let root: XmlElement | null = null

  const fail = (message: string): never => {
    throw new Error(`${message} (위치 ${at})`)
  }

  while (at < source.length) {
    const next = source.indexOf('<', at)
    if (next === -1) {
      checkText(source.slice(at), fail)
      break
    }
    checkText(source.slice(at, next), fail)
    at = next

    if (source.startsWith('<?', at)) {
      const end = source.indexOf('?>', at)
      if (end === -1) fail('처리 지시가 안 닫혔습니다')
      at = end + 2
      continue
    }
    if (source.startsWith('<!--', at)) {
      const end = source.indexOf('-->', at)
      if (end === -1) fail('주석이 안 닫혔습니다')
      at = end + 3
      continue
    }
    if (source.startsWith('</', at)) {
      const end = source.indexOf('>', at)
      if (end === -1) fail('닫는 태그가 안 닫혔습니다')
      const name = source.slice(at + 2, end).trim()
      const open = stack.pop()
      if (open === undefined) fail(`짝 없는 닫는 태그입니다: ${name}`)
      else if (open.name !== name) fail(`태그 짝이 안 맞습니다: <${open.name}> 을 </${name}> 로 닫았습니다`)
      at = end + 1
      continue
    }

    const { element, selfClosing, end } = readTag(source, at, fail)
    const parent = stack[stack.length - 1]
    if (parent === undefined) {
      if (root !== null) fail('뿌리 요소가 둘입니다')
      root = element
    } else {
      parent.children.push(element)
    }
    if (!selfClosing) stack.push(element)
    at = end
  }

  if (stack.length > 0) fail(`안 닫힌 태그가 있습니다: <${stack[stack.length - 1]!.name}>`)
  if (root === null) throw new Error('뿌리 요소가 없습니다')
  return root

  function checkText(text: string, onFail: (message: string) => never): void {
    let index = 0
    while (index < text.length) {
      const character = text[index]!
      if (character === '&') {
        const match = ENTITY.exec(text.slice(index))
        if (match === null) onFail('실체 참조가 아닌 & 가 텍스트에 있습니다')
        index += match![0].length
        continue
      }
      if (character === '<') onFail('날 < 가 텍스트에 있습니다')
      const owner = stack[stack.length - 1]
      if (owner !== undefined) owner.text += character
      index += 1
    }
  }
}

/** 여는 태그 하나를 읽는다. */
function readTag(
  source: string,
  start: number,
  fail: (message: string) => never,
): { element: XmlElement; selfClosing: boolean; end: number } {
  let at = start + 1
  const nameEnd = findNameEnd(source, at)
  const name = source.slice(at, nameEnd)
  if (name.length === 0) fail('이름 없는 태그입니다')
  at = nameEnd

  const attributes: Record<string, string> = {}
  for (;;) {
    while (at < source.length && /\s/.test(source[at]!)) at += 1
    if (at >= source.length) fail('여는 태그가 안 닫혔습니다')
    if (source.startsWith('/>', at)) {
      return { element: { name, attributes, children: [], text: '' }, selfClosing: true, end: at + 2 }
    }
    if (source[at] === '>') {
      return { element: { name, attributes, children: [], text: '' }, selfClosing: false, end: at + 1 }
    }

    const keyEnd = findNameEnd(source, at)
    const key = source.slice(at, keyEnd)
    if (key.length === 0) fail('속성 이름이 없습니다')
    if (key in attributes) fail(`속성이 두 번 나옵니다: ${key}`)
    at = keyEnd
    if (source[at] !== '=') fail(`속성에 값이 없습니다: ${key}`)
    at += 1
    const quote = source[at]
    if (quote !== '"' && quote !== "'") fail(`속성 값이 따옴표로 안 감싸였습니다: ${key}`)
    const valueEnd = source.indexOf(quote, at + 1)
    if (valueEnd === -1) fail(`속성 값이 안 닫혔습니다: ${key}`)
    const value = source.slice(at + 1, valueEnd)
    if (value.includes('<')) fail(`속성 값에 날 < 가 있습니다: ${key}`)
    attributes[key] = decode(value)
    at = valueEnd + 1
  }
}

function findNameEnd(source: string, start: number): number {
  let at = start
  while (at < source.length && !/[\s/>=]/.test(source[at]!)) at += 1
  return at
}

function decode(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

/** 이름이 같은 자손 전부. **문서 순서다.** */
export function findAll(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = []
  for (const child of element.children) {
    if (child.name === name) found.push(child)
    found.push(...findAll(child, name))
  }
  return found
}

/** 그 요소와 자손이 가진 글자 전부를 이어 붙인다. */
export function textOf(element: XmlElement): string {
  return element.text + element.children.map(textOf).join('')
}
