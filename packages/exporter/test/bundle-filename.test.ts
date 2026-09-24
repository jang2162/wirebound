/**
 * 번들 안의 **파일 이름과 링크.**
 *
 * **이 파일은 DOM 없이 돈다** — `unit` 프로젝트에 `environment`가 없다. 순수 함수이므로
 * 그것이 맞다.
 *
 * ---
 *
 * # 재서 정한 것 둘
 *
 * **㉮ 이름 길이의 상한은 인코딩마다 다르다.** 이 기계(macOS·APFS)에서 실제로 만들어 본
 * 값이 아래다 — 파일 하나를 만들고 지우며 이분 탐색했다.
 *
 * | 글자 | 최대 개수 | UTF-8 바이트 | UTF-16 코드유닛 |
 * |---|---|---|---|
 * | `a` | 255 | 255 | 255 |
 * | `가` | 255 | **765** | 255 |
 * | `😀` | 127 | 508 | **254** |
 *
 * 즉 **APFS는 UTF-16 코드유닛으로 센다.** 반면 Linux의 ext4는 `NAME_MAX`가 **바이트**
 * 255다(이 기계에서 잰 값이 아니다 — 옮겨 온 사실이다). 번들을 만드는 쪽과 쓰는 쪽이 다른
 * 기계일 수 있으므로(api는 서버에서 돈다) **더 엄한 쪽인 UTF-8 바이트로 자른다.**
 * 그래야 *"같은 입력이 같은 번들을 낸다"*가 기계를 건너서도 참이다.
 *
 * **㉯ `file://`에서 한글 파일명 링크가 열린다.** Chrome 헤드리스로 실제로 열어
 * 봤다. 그리고 **원시 한글 `href`와 퍼센트 인코딩한 `href`가 같은 URL로 해석된다**
 * (`a.href`를 읽어 견주니 같았다). 그래도 **퍼센트 인코딩을 하는 쪽을 골랐다** — 이름에
 * `#`·`?`가 남을 수 있고 그 둘은 원시로 적으면 **경로가 아니라 조각·질의가 된다.**
 * `#`·공백·`%`·`&`·`+`·`'`가 든 이름을 퍼센트 인코딩해 실제로 열리는 것도 재서 확인했다.
 */
import { describe, expect, it } from 'vitest'
import { bundleHref, pageFileName, pageFileNames } from '../src/bundle/filename'

/** 이름을 UTF-8 바이트로 센다. 상한이 바이트이므로 자도 바이트다. */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

describe('pageFileName — 한글을 유지한다', () => {
  it('설계서 「HTML 정적 번들」의 예시 이름을 낸다', () => {
    expect(pageFileName('관리자 회원 목록')).toBe('관리자-회원-목록.html')
  })

  it('한글을 인코딩하거나 로마자로 바꾸지 않는다', () => {
    expect(pageFileName('회원 목록')).toBe('회원-목록.html')
  })
})

describe('pageFileName — 위험한 문자', () => {
  /**
   * 분모를 손으로 든다. Windows가 막는 아홉과 제어문자·NUL이다. **구현에서 끌어오면
   * 목록을 줄여도 케이스가 함께 줄어든다.**
   */
  const DANGEROUS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', ' ', '\u0000', '\u001f']

  it.each(DANGEROUS)('%j를 이름에 남기지 않는다', (char) => {
    const name = pageFileName(`앞${char}뒤`)
    expect(name).toBe('앞-뒤.html')
    expect(name).not.toContain(char)
  })

  it('줄바꿈·탭도 구분자가 된다', () => {
    expect(pageFileName('앞\n뒤\t끝')).toBe('앞-뒤-끝.html')
  })

  it('구분자가 이어지면 하나로 접는다', () => {
    expect(pageFileName('앞///뒤')).toBe('앞-뒤.html')
    expect(pageFileName('  앞   뒤  ')).toBe('앞-뒤.html')
  })
})

describe('pageFileName — 빈 이름·점·예약어', () => {
  it('남는 글자가 없으면 대체 이름을 쓴다', () => {
    expect(pageFileName('')).toBe('페이지.html')
    expect(pageFileName('///')).toBe('페이지.html')
    expect(pageFileName('   ')).toBe('페이지.html')
  })

  it('점으로 시작하지 않는다 — 숨김 파일이 되지 않는다', () => {
    expect(pageFileName('.env')).toBe('env.html')
    expect(pageFileName('..')).toBe('페이지.html')
    expect(pageFileName('.')).toBe('페이지.html')
  })

  it('점·공백으로 끝나지 않는다 — Windows가 조용히 지운다', () => {
    expect(pageFileName('보고서...')).toBe('보고서.html')
    expect(pageFileName('보고서 ')).toBe('보고서.html')
  })

  /**
   * Windows의 장치 이름은 **확장자가 붙어도 예약이다**(`CON.html`도 못 만든다).
   * 대소문자를 안 가린다.
   */
  const RESERVED = ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9', 'COM0']

  it.each(RESERVED)('%s를 그대로 쓰지 않는다', (word) => {
    const name = pageFileName(word)
    expect(name).not.toBe(`${word}.html`)
    expect(name).toBe(`${word}_.html`)
  })

  it('예약어를 품기만 한 이름은 건드리지 않는다', () => {
    expect(pageFileName('CONTENTS')).toBe('CONTENTS.html')
    expect(pageFileName('CON 목록')).toBe('CON-목록.html')
  })
})

describe('pageFileName — 길이 상한', () => {
  const LIMIT = 255

  it('한글 긴 제목을 UTF-8 바이트 상한 안으로 자른다', () => {
    const name = pageFileName('가'.repeat(400))
    expect(utf8Bytes(name)).toBeLessThanOrEqual(LIMIT)
    expect(name.endsWith('.html')).toBe(true)
  })

  it('앞을 남긴다 — 제목의 앞쪽이 그것을 알아보게 한다', () => {
    expect(pageFileName(`회원목록${'가'.repeat(400)}`).startsWith('회원목록가')).toBe(true)
  })

  /**
   * **코드 포인트 경계에서 자른다.** 바이트로 자르면 UTF-8 시퀀스가 쪼개지고,
   * UTF-16 유닛으로 자르면 대리쌍이 쪼개져 홀로 남은 서로게이트가 파일 이름에 들어간다.
   */
  it('BMP 밖 글자를 쪼개지 않는다', () => {
    const name = pageFileName('😀'.repeat(200))
    expect(utf8Bytes(name)).toBeLessThanOrEqual(LIMIT)
    // `u` 플래그가 붙어야 이 범위가 **홀로 남은** 서로게이트만 겨냥한다. 안 붙이면
    // 대리쌍의 두 유닛에도 각각 걸려 어떤 이모지 이름도 통과하지 못한다.
    expect(name).not.toMatch(/[\uD800-\uDFFF]/u)
    expect([...name].every((char) => char === '😀' || '.html'.includes(char))).toBe(true)
  })

  it('자르고 나서도 구분자로 끝나지 않는다', () => {
    const name = pageFileName(`${'가'.repeat(83)} 뒤`)
    expect(name.endsWith('-.html')).toBe(false)
  })
})

describe('pageFileName — 유니코드 정규화', () => {
  /**
   * **NFC로 맞춘다.** 같은 글자를 두 꼴로 적은 제목이 macOS에서는 같은 파일을 가리키고
   * (APFS가 정규화를 안 가린다) Linux에서는 다른 파일이 된다. 접어 두면 두 기계에서
   * **같은 번들**이 나온다 — 충돌은 아래 `pageFileNames`가 결정적으로 푼다.
   */
  it('NFD로 적은 한글이 NFC와 같은 이름이 된다', () => {
    const nfd = '회원'.normalize('NFD')
    expect(nfd).not.toBe('회원')
    expect(pageFileName(nfd)).toBe(pageFileName('회원'))
  })
})

describe('pageFileNames — 충돌을 결정적으로 푼다', () => {
  it('같은 제목 셋이 서로 다른 이름을 받는다', () => {
    expect(pageFileNames(['회원 목록', '회원 목록', '회원 목록'])).toEqual([
      '회원-목록.html',
      '회원-목록-2.html',
      '회원-목록-3.html',
    ])
  })

  it('위험한 문자를 접은 뒤에 같아진 것도 충돌로 본다', () => {
    expect(pageFileNames(['a/b', 'a\\b'])).toEqual(['a-b.html', 'a-b-2.html'])
  })

  /**
   * **대소문자를 접어 충돌을 본다.** macOS·Windows의 기본 파일 시스템이 대소문자를
   * 안 가리므로, 안 접으면 Linux에서만 두 파일이고 다른 데서는 하나가 다른 하나를 덮는다.
   */
  it('대소문자만 다른 이름도 충돌로 본다', () => {
    expect(pageFileNames(['Members', 'members'])).toEqual(['Members.html', 'members-2.html'])
  })

  it('접미사가 이미 쓰인 이름과 또 부딪히면 다음 수로 간다', () => {
    expect(pageFileNames(['목록', '목록-2', '목록'])).toEqual([
      '목록.html',
      '목록-2.html',
      '목록-3.html',
    ])
  })

  it('접미사를 붙여도 바이트 상한을 넘지 않는다', () => {
    const title = '가'.repeat(400)
    const names = pageFileNames([title, title])
    expect(names[0]).not.toBe(names[1])
    for (const name of names) expect(utf8Bytes(name)).toBeLessThanOrEqual(255)
  })

  it('같은 입력이 같은 이름을 낸다', () => {
    const titles = ['회원 목록', '회원 목록', 'a/b', 'a:b', '']
    expect(pageFileNames(titles)).toEqual(pageFileNames(titles))
  })

  it('빈 목록이면 빈 목록이다', () => {
    expect(pageFileNames([])).toEqual([])
  })
})

describe('bundleHref — 번들 안의 상대 링크', () => {
  it('index.html에서 페이지와 자산으로', () => {
    expect(bundleHref('index.html', 'pages/회원-목록.html')).toBe(
      'pages/%ED%9A%8C%EC%9B%90-%EB%AA%A9%EB%A1%9D.html',
    )
    expect(bundleHref('index.html', 'assets/theme.css')).toBe('assets/theme.css')
  })

  it('pages/ 아래에서 자산으로 올라간다', () => {
    expect(bundleHref('pages/회원-목록.html', 'assets/theme.css')).toBe('../assets/theme.css')
  })

  it('같은 디렉터리의 페이지끼리는 이름만이다', () => {
    expect(bundleHref('pages/a.html', 'pages/b.html')).toBe('b.html')
  })

  it('자기 자신을 가리키면 이름만이다', () => {
    expect(bundleHref('pages/a.html', 'pages/a.html')).toBe('a.html')
  })

  /**
   * **퍼센트 인코딩이 요점이다.** `#`·`?`를 원시로 적으면 브라우저가 조각·질의로
   * 읽어 **파일에 닿지 않는다.** 아래 값은 Chrome이 실제로 그렇게 해석한 것과 같은 꼴이다.
   */
  it('경로에서 뜻을 갖는 글자를 인코딩한다', () => {
    expect(bundleHref('index.html', 'pages/a#b.html')).toBe('pages/a%23b.html')
    expect(bundleHref('index.html', 'pages/a b.html')).toBe('pages/a%20b.html')
    expect(bundleHref('index.html', 'pages/a%c.html')).toBe('pages/a%25c.html')
    expect(bundleHref('index.html', 'pages/a?b.html')).toBe('pages/a%3Fb.html')
  })

  it('디렉터리 구분자는 인코딩하지 않는다', () => {
    expect(bundleHref('index.html', 'pages/가.html')).toContain('pages/')
  })
})
