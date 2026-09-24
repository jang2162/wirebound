/**
 * **번들 파일들을 압축 하나로 묶는 자리.**
 *
 * ## 자리마다 제 것 — zip 엔트리 → 그 파일의 내용
 *
 * **이름과 내용이 어긋나도 눈으로는 그럴듯하다** — 압축을 푼
 * 사람은 `pages/관리자-회원-목록.html`을 열고 거기 다른 페이지가 그려져 있어도
 * *"내가 잘못 눌렀나"*로 읽는다. 그래서 **여러 엔트리를 넣고 하나씩 되꺼내 견준다.**
 * 엔트리 하나로 재면 섞일 자리 자체가 없다.
 *
 * ## 한글 이름이 살아남는가
 *
 * 설계서 「HTML 정적 번들」의 예시 파일 이름이 `관리자-회원-목록.html`이고 `pageFileNames`가
 * 한글을 유지한다. zip은 이름 인코딩을 **플래그로** 말하는 형식이라, UTF-8 플래그를
 * 안 세우면 받는 쪽이 CP437로 읽어 이름이 깨진다. 여기서 그 플래그를 직접 잰다.
 */
import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import {
  PPTX_CONTENT_TYPE,
  bundleFileName,
  bundleRootDirectory,
  pptxFileName,
  zipBundle,
  zipParts,
} from '../src/services/export-zip'

/** 서로 다른 글자를 담은 엔트리 넷. **하나짜리로 재지 않는다.** */
const FILES = [
  { path: 'index.html', content: '<html>첫 페이지</html>' },
  { path: 'pages/관리자-회원-목록.html', content: '<html>목록 페이지 본문</html>' },
  { path: 'pages/관리자-회원-상세.html', content: '<html>상세 페이지 본문</html>' },
  { path: 'assets/theme.css', content: '.wb { color: red }' },
]

describe('zipBundle', () => {
  it('엔트리마다 제 내용을 담는다', () => {
    const zipped = zipBundle(FILES, 'wirebound-export-one')
    const back = unzipSync(zipped)

    for (const file of FILES) {
      expect(strFromU8(back[`wirebound-export-one/${file.path}`]!), file.path).toBe(file.content)
    }
  })

  /** **카나리아.** 넷이 우연히 같은 글자면 위 검사가 섞여도 통과한다. */
  it('넣은 넷이 서로 다른 글자다', () => {
    expect(new Set(FILES.map((file) => file.content)).size).toBe(4)
  })

  it('넣은 것만 담는다 — 더도 덜도 아니다', () => {
    const zipped = zipBundle(FILES, 'wirebound-export-one')
    expect(Object.keys(unzipSync(zipped)).sort()).toEqual(
      FILES.map((file) => `wirebound-export-one/${file.path}`).sort(),
    )
  })

  /**
   * **뿌리 폴더가 있어야 한다.** 없으면 압축을 푼 자리에 파일이 흩뿌려지고, 두 설계서를
   * 같은 폴더에 풀면 서로를 덮어쓴다. 설계서 「HTML 정적 번들」의 트리도 `wirebound-export/`로 시작한다.
   */
  it('모든 엔트리가 뿌리 폴더 밑이다', () => {
    const zipped = zipBundle(FILES, 'wirebound-export-one')
    for (const name of Object.keys(unzipSync(zipped))) {
      expect(name.startsWith('wirebound-export-one/')).toBe(true)
    }
  })

  /**
   * zip은 이름 인코딩을 **general purpose bit flag의 11번 비트**로 말한다. 세우지 않으면
   * 받는 쪽이 CP437로 읽어 한글 이름이 깨진다 — 그러면 `index.html`의 링크가 가리키는
   * 파일이 디스크에 없다.
   *
   * **엔트리마다 따로 본다.** 플래그는 파일마다 있고 `fflate`는 이름에 ASCII 밖 글자가
   * 있을 때만 세운다 — 첫 엔트리 하나만 보면 ASCII 이름인 `index.html`의 플래그를 재게 된다.
   * ASCII 이름에 안 세우는 것은 규격대로다.
   */
  it('ASCII 밖 이름을 든 엔트리마다 UTF-8 플래그가 선다', () => {
    const 엔트리 = centralDirectory(zipBundle(FILES, 'wirebound-export-one'))
    expect(엔트리.length).toBe(FILES.length)

    const 한글 = 엔트리.filter((entry) => !isAscii(entry.name))
    expect(한글.length).toBe(2)
    for (const entry of 한글) {
      expect(entry.flag & 0x800, entry.name).not.toBe(0)
    }
  })

  it('한글 이름이 그대로 되나온다', () => {
    const zipped = zipBundle(FILES, 'wirebound-export-one')
    expect(Object.keys(unzipSync(zipped))).toContain('wirebound-export-one/pages/관리자-회원-목록.html')
  })

  /**
   * **압축이 실제로 줄이는가.** 번들은 페이지마다 셸을 통째로 갖고 좌측 트리가 페이지
   * **전부**를 들어 거의 같은 글자가 반복된다 — *"압축이 잘 먹을 것"*은 재기 전에는 짐작이다.
   *
   * **모양을 실제 번들대로 만든다.** 페이지마다 나머지 전부를 가리키는 트리가 들어가야
   * 페이지마다 전체 트리를 싣는 대가(*"번들 전체가 페이지 수의 제곱"*)가 재현되고, 그것이
   * 압축이 물어뜯는 살이다. 잘게 쪼갠 파일 여럿으로 재면 엔트리마다의 머리말이 이겨
   * **오히려 커진다.**
   *
   * **수를 여기 적지 않는다.** 성질만 잰다.
   */
  it('되풀이가 많은 번들을 원본보다 작게 만든다', () => {
    const 페이지수 = 40
    const 트리 = Array.from(
      { length: 페이지수 },
      (_, index) =>
        `<li class="wb-export-nav-item"><a href="관리자-회원-페이지-${index}.html">관리자 회원 페이지 ${index}</a></li>`,
    ).join('')
    const 반복 = Array.from({ length: 페이지수 }, (_, index) => ({
      path: `pages/관리자-회원-페이지-${index}.html`,
      content: `<html><body><nav class="wb-export-nav"><ul>${트리}</ul></nav><main>페이지 ${index}</main></body></html>`,
    }))

    const raw = 반복.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0)
    expect(zipBundle(반복, 'wirebound-export-one').byteLength).toBeLessThan(raw)
  })
})

/** 이름이 ASCII 안에만 있는가. */
function isAscii(value: string): boolean {
  return [...value].every((char) => char.charCodeAt(0) < 0x80)
}

interface DirectoryEntry {
  name: string
  flag: number
}

/**
 * zip의 **중앙 디렉터리**를 읽어 엔트리마다 이름과 플래그를 낸다.
 *
 * 로컬 헤더를 앞에서부터 훑지 않는 이유: 압축된 본문 안에 헤더 서명(`PK\x03\x04`)과 같은
 * 바이트가 우연히 나올 수 있어 **훑기가 가짜 엔트리를 만든다.** 중앙 디렉터리는 끝의
 * EOCD가 자리와 개수를 알려 주므로 그 우연이 없다.
 */
function centralDirectory(zipped: Uint8Array): DirectoryEntry[] {
  const view = new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength)

  // EOCD(0x06054b50)를 끝에서 찾는다. 주석이 없으면 마지막 22바이트다.
  let eocd = -1
  for (let at = zipped.byteLength - 22; at >= 0; at -= 1) {
    if (view.getUint32(at, true) === 0x0605_4b50) {
      eocd = at
      break
    }
  }
  if (eocd < 0) throw new Error('EOCD를 찾지 못했습니다 — zip이 아닙니다')

  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)

  const decoder = new TextDecoder('utf-8')
  const entries: DirectoryEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(at, true) !== 0x0201_4b50) throw new Error('중앙 디렉터리 항목 서명이 아닙니다')
    const flag = view.getUint16(at + 8, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    entries.push({
      name: decoder.decode(zipped.subarray(at + 46, at + 46 + nameLength)),
      flag,
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

describe('bundleFileName', () => {
  it('슬러그가 든 zip 이름을 만든다', () => {
    expect(bundleFileName('admin-guide')).toBe('wirebound-export-admin-guide.zip')
  })

  /** 뿌리 폴더와 zip 이름의 줄기가 같아야 푼 폴더를 눈으로 짝지을 수 있다. */
  it('뿌리 폴더와 zip 이름의 줄기가 같다', () => {
    expect(bundleFileName('admin-guide')).toBe(`${bundleRootDirectory('admin-guide')}.zip`)
  })
})

/* ------------------------------------------------------------ pptx */

/**
 * **UTF-8 로 왕복할 수 없는 바이트.** 진짜 PNG 의 머리(`\x89PNG`)와 짝 없는 상위 바이트다 —
 * `strToU8(String(bytes))` 를 지나면 `U+FFFD` 가 되어 **바이트가 조용히 달라진다.**
 */
const RAW = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80])

describe('zipParts — pptx 는 뿌리 폴더가 없다', () => {
  it('경로를 그대로 항목 이름으로 쓴다', () => {
    const back = unzipSync(zipParts([{ path: '[Content_Types].xml', content: '<Types/>' }]))
    // **뿌리 폴더를 씌우면 받는 쪽이 이 파일을 못 찾아 pptx 가 통째로 안 열린다.**
    expect(Object.keys(back)).toEqual(['[Content_Types].xml'])
  })

  /**
   * **바이트를 글자로 왕복시키지 않는다.** 이미지 파트가 그 길로 가면 pptx 는 열리는데
   * 그림만 깨진다 — 눈으로만 보이는 실패다. **라우트 케이스가 이미지를 안 싣는 한 그쪽
   * 케이스로는 이 갈래가 안 눌린다** — 이 갈래를 변조해도 라우트 케이스는 안 죽는다.
   */
  it('바이트를 그대로 담는다 — 글자로 왕복시키지 않는다', () => {
    const back = unzipSync(zipParts([{ path: 'ppt/media/image1.png', content: RAW }]))
    expect(back['ppt/media/image1.png']).toEqual(RAW)
  })

  it('글자와 바이트를 한 압축에 섞어 담는다', () => {
    const back = unzipSync(
      zipParts([
        { path: 'ppt/slides/slide1.xml', content: '<p:sld/>' },
        { path: 'ppt/media/image1.png', content: RAW },
      ]),
    )
    expect(strFromU8(back['ppt/slides/slide1.xml']!)).toBe('<p:sld/>')
    expect(back['ppt/media/image1.png']).toEqual(RAW)
  })
})

describe('pptxFileName', () => {
  it('번들과 줄기가 같고 확장자로 갈린다', () => {
    expect(pptxFileName('admin-guide')).toBe('wirebound-export-admin-guide.pptx')
    expect(pptxFileName('admin-guide')).toBe(`${bundleRootDirectory('admin-guide')}.pptx`)
  })

  /** **MIME 을 한 자리에만 둔다** — 두 벌이면 헤더와 문서가 갈린다. */
  it('pptx 의 MIME 이 OOXML 프레젠테이션이다', () => {
    expect(PPTX_CONTENT_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    )
  })
})
