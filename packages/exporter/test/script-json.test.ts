// @vitest-environment jsdom
/**
 * **`scriptJson` — `<script>` 안에 값을 심는 규칙.**
 *
 * # 왜 규칙이 함수에 사나 — 분리자만 막는 스니펫은 `</script>`를 통과시킨다
 *
 * `JSON.stringify` 뒤에 U+2028·U+2029만 바꾸는 흔한 스니펫은 **`</script>`를 그대로
 * 통과**시킨다 — 아래 첫 절이 그것을 재현한다.
 *
 * **문서에 적은 규칙은 어떤 검사도 지키지 않고, 문서에 적은 코드는 다음 사람이 복사한다.**
 * 그래서 규칙을 문서가 아니라 **패키지의 함수**에 두고 이 파일이 그것을 잡는다(판정의
 * 근거는 `src/script-json.ts`의 머리말에 있다).
 *
 * # jsdom을 쓰는 이유
 *
 * *"이스케이프됐다"*와 *"파서가 스크립트를 안 끊는다"*는 다른 주장이고 뒤쪽이 지키려는
 * 것이다. 그래서 낸 리터럴을 실제로 `<script>`에 넣어 문서를 판다.
 */
import { describe, expect, it } from 'vitest'
import { scriptJson } from '../src/script-json'

const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

/** 소스에 `</script>`를 그대로 적지 않는다 — 이 파일 자신이 그 자리에서 끊길 이유가 없다. */
const CLOSING_TAG = '</scr' + 'ipt>'
const PAYLOAD = CLOSING_TAG + '<img src=x onerror=alert(1)>'

/** 리터럴을 `<script>`에 심은 문서. 뒤에 표지 하나를 두어 파싱이 어디까지 갔는지 본다. */
function embed(literal: string): Document {
  const html =
    '<!doctype html><html><head><title>x</title></head><body>' +
    '<script>window.wb = ' +
    literal +
    CLOSING_TAG +
    '<div id="mark"></div></body></html>'
  return new DOMParser().parseFromString(html, 'text/html')
}

/** **분리자만 막는 스니펫.** 무엇을 놓치는지 값으로 들기 위해 둔다. */
function oldSnippet(value: unknown): string {
  return JSON.stringify(value)!
    .replace(new RegExp(LINE_SEPARATOR, 'g'), '\\u2028')
    .replace(new RegExp(PARAGRAPH_SEPARATOR, 'g'), '\\u2029')
}

describe('분리자만 막는 스니펫이 무엇을 놓치나', () => {
  /**
   * **재현이다.** 그 코드를 그대로 쓰면 스크립트가 끊기고
   * 뒤따르는 글자가 **마크업**이 된다.
   */
  it('스크립트가 끊기고 img 하나가 onerror를 달고 생긴다', () => {
    const parsed = embed(oldSnippet({ note: PAYLOAD }))

    expect(parsed.querySelectorAll('img')).toHaveLength(1)
    expect(parsed.querySelector('img')?.getAttribute('onerror')).toBe('alert(1)')
    // 스크립트가 데이터 한가운데서 끝났다.
    expect(parsed.querySelector('script')?.textContent).toBe('window.wb = {"note":"')
  })

  /** 그 스니펫이 **막는 것**은 막을 필요가 없는 쪽이다(아래 ES2019 절). */
  it('그 스니펫이 실제로 바꾸던 것은 분리자뿐이다', () => {
    expect(oldSnippet({ note: '앞' + LINE_SEPARATOR + '뒤' })).toContain('u2028')
    expect(oldSnippet({ note: PAYLOAD })).toContain(CLOSING_TAG)
  })
})

describe('scriptJson이 스크립트를 끊지 않는다', () => {
  it('같은 값을 심어도 img가 생기지 않는다', () => {
    const parsed = embed(scriptJson({ note: PAYLOAD }))

    expect(parsed.querySelectorAll('img')).toHaveLength(0)
    expect(parsed.querySelectorAll('script')).toHaveLength(1)
    expect(parsed.getElementById('mark')).not.toBeNull()
  })

  /**
   * **스크립트 본문이 통째로 남는다.** 위 케이스만 있으면 *"전부 지워도 img가 0개"*가
   * 통과한다 — 값이 살아 있다는 것을 따로 든다.
   */
  it('스크립트 본문이 잘리지 않는다', () => {
    const literal = scriptJson({ note: PAYLOAD })
    const parsed = embed(literal)

    expect(parsed.querySelector('script')?.textContent).toBe('window.wb = ' + literal)
  })

  /** **되읽으면 같은 값이다.** 이스케이프가 값을 바꾸면 번들의 데이터가 달라진다. */
  it('JSON.parse가 원래 값을 돌려준다', () => {
    const value = { note: PAYLOAD, nested: ['<!--', '<script', '<'] }
    expect(JSON.parse(scriptJson(value))).toEqual(value)
  })

  /**
   * **`<` 하나를 막으면 셋이 함께 닫힌다.** raw text 안에서 뜻을 갖는 자리가 그 셋이다.
   * 분모를 손으로 든다 — 구현에서 끌어오면 무엇을 빠뜨려도 기대값이 함께 준다.
   */
  it.each([['종료 태그', CLOSING_TAG], ['여는 태그', '<scr' + 'ipt>'], ['주석 시작', '<!--']])(
    '%s가 리터럴에 남지 않는다',
    (_name, dangerous) => {
      const literal = scriptJson({ note: '앞' + dangerous + '뒤' })

      expect(literal).not.toContain(dangerous)
      expect(literal).toContain('u003c')
      expect((JSON.parse(literal) as { note: string }).note).toBe('앞' + dangerous + '뒤')
    },
  )
})

describe('바꾸지 않는 것 — 재서 안 바꾸기로 한 둘', () => {
  /**
   * **U+2028·U+2029는 ES2019 이후 문자열 리터럴에서 합법이다.** 위 스니펫은 그것만
   * 막는다. 실측으로 그 전제를 든다 — 날 분리자를 넣은 리터럴이 그대로 파싱되고
   * 가운데 코드가 남는다.
   */
  it.each([
    ['U+2028', LINE_SEPARATOR, 0x2028],
    ['U+2029', PARAGRAPH_SEPARATOR, 0x2029],
  ])('%s는 문자열 리터럴에서 안 깨진다', (_name, character, code) => {
    const parsed = new Function('return "앞' + character + '뒤"')() as string

    expect(parsed).toHaveLength(3)
    expect(parsed.codePointAt(1)).toBe(code)
  })

  it('그래서 scriptJson이 분리자를 그대로 둔다', () => {
    const literal = scriptJson({ note: '앞' + LINE_SEPARATOR + '뒤' })

    expect(literal).toContain(LINE_SEPARATOR)
    expect(literal).not.toContain('u2028')
  })

  /**
   * **`&`는 raw text 안에서 문자 참조로 해석되지 않는다.** 바꾸면 오히려 값이 달라진다.
   */
  it('앰퍼샌드를 그대로 두고, 파서도 그것을 해석하지 않는다', () => {
    const literal = scriptJson({ note: '&amp;&lt;' })
    const parsed = embed(literal)

    expect(literal).toContain('&amp;')
    expect(parsed.querySelector('script')?.textContent).toContain('&amp;')
  })
})

describe('JSON이 아닌 값', () => {
  /**
   * **조용히 `null`로 바꾸지 않는다.** 부르는 쪽의 실수가 값의 변화로 위장되면 번들에
   * 실려 오래 산다.
   */
  it.each([['undefined', undefined], ['함수', () => 1], ['심볼', Symbol('x')]])(
    '%s를 주면 던진다',
    (_name, value) => {
      expect(() => scriptJson(value)).toThrow('JSON으로 만들 수 없는 값입니다')
    },
  )
})
