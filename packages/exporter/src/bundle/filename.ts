/**
 * 번들 안의 **파일 이름과 상대 링크**.
 *
 * **순수 함수다 — 파일 시스템을 부르지 않는다.** 그래서 상한도 *"만들어 보고 실패하면
 * 줄인다"*가 아니라 **미리 정한 값**이다. 그 값을 어떻게 재서 정했는지는
 * `test/bundle-filename.test.ts`의 머리말에 있다.
 *
 * ---
 *
 * ## 이 파일이 답하는 다섯
 *
 * 1. 위험한 문자 → **구분자 하나로 접는다.**
 * 2. 길이 → **UTF-8 바이트로 자른다.** 코드 포인트 경계를 지킨다.
 * 3. 충돌 → **순번 접미사.** 대소문자·유니코드 정규화를 접어서 본다.
 * 4. 빈 이름·점·예약어 → 대체 이름과 밑줄.
 * 5. `file://`의 링크 → **퍼센트 인코딩.**
 */

/** 페이지 파일의 확장자. */
const EXTENSION = '.html'

/**
 * 이름 하나의 상한. **UTF-8 바이트다.**
 *
 * macOS·APFS는 UTF-16 코드유닛 255개까지 받아 한글 255자가 들어가지만, Linux의 ext4는
 * `NAME_MAX`가 바이트 255다. **번들을 만드는 기계와 쓰는 기계가 다를 수 있으므로**(api는
 * 서버에서 돌고 받는 쪽은 사람의 노트북이다) 더 엄한 쪽으로 자른다 — 그래야 같은
 * 입력이 어디서든 같은 이름을 낸다.
 *
 * **전체 경로의 상한은 여기서 다루지 않는다.** 번들을 어디에 푸는지는 호출자의
 * 것이고(Windows의 `MAX_PATH`가 그 자리에 걸린다), 이 함수는 **이름 한 마디**만 안다.
 */
const MAX_NAME_BYTES = 255

/**
 * 위험한 문자를 대신하는 글자. 설계서 「HTML 정적 번들」의 예시(`관리자-회원-목록.html`)가
 * 쓰는 것과 같다.
 */
const SEPARATOR = '-'

/** 남는 글자가 없을 때의 이름. */
const FALLBACK_STEM = '페이지'

/**
 * 이름에 남길 수 없는 글자.
 *
 * - `/`·`\` — 경로 구분자. 남으면 이름 하나가 디렉터리 둘이 된다.
 * - `:`·`*`·`?`·`"`·`<`·`>`·`|` — Windows가 막는다.
 * - 제어문자와 NUL — Postgres도 파일 시스템도 받지 않는다.
 * - 공백류 — 남겨도 되지만 URL에서 `%20`이 되고 셸에서 인용이 필요하다. 「HTML 정적 번들」의
 *   예시가 공백 없는 이름인 것도 이쪽이다.
 *
 * **구분자 자신도 이 목록에 있다.** 없으면 `회원 - 목록` 같은 제목이 `회원---목록`이 된다 —
 * 접는 것이 한 종류의 글자가 아니라 **이어진 덩어리**여야 결과가 하나로 모인다.
 */
const UNSAFE = /[-/\\:*?"<>|\s\u0000-\u001f\u007f]+/gu

/**
 * Windows의 장치 이름. **확장자가 붙어도 예약이다** — `CON.html`을 못 만든다.
 * 대소문자를 가리지 않는다.
 */
const RESERVED_STEM = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu

/** 예약어를 피하는 방법. 이름을 바꾸지 않고 한 글자만 더한다. */
const RESERVED_ESCAPE = '_'

/**
 * UTF-8 바이트 수.
 *
 * **`TextEncoder`를 부르지 않는다.** 이 패키지의 `src`는 `tsconfig`가 `DOM` lib을 주지
 * 않아 그 전역이 **타입으로 보이지 않는다** — 그 설정은 브라우저 API를 쓰고도
 * 컴파일이 통과하는 것을 막으려고 일부러 그렇게 뒀다. 코드 포인트마다 자릿수를 세는 것은
 * 여섯 줄이고, 덤으로 **케이스가 `TextEncoder`로 재므로 자와 대상이 서로 다른 길**이 된다.
 */
function byteLength(value: string): number {
  let bytes = 0
  for (const char of value) {
    const code = char.codePointAt(0)!
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/**
 * 앞뒤에서 뜻 없는 글자를 턴다.
 *
 * **점을 터는 것이 요점이다.** 앞의 점은 유닉스에서 숨김 파일을 만들고(`.env.html`이
 * 목록에 안 보인다), 뒤의 점과 공백은 **Windows가 조용히 지운다** — 지워진 뒤에 다른
 * 이름과 같아지면 우리가 푼 충돌이 되살아난다.
 */
function trimEdges(value: string): string {
  return value.replace(/^[.\-\s]+/u, '').replace(/[.\-\s]+$/u, '')
}

/**
 * 바이트 상한에 맞춰 자른다. **코드 포인트 단위로 자른다** — 바이트로 자르면 UTF-8
 * 시퀀스가 쪼개지고, UTF-16 유닛으로 자르면 대리쌍이 쪼개져 홀로 남은 서로게이트가 이름에
 * 들어간다(그 값은 유효한 UTF-8로 인코딩되지 않는다).
 *
 * **앞을 남긴다.** 제목의 앞쪽이 그것을 알아보게 하는 부분이고, 뒤를 남기면 같은 메뉴
 * 아래의 페이지들이 앞을 잃어 서로 구분되지 않는다.
 */
function truncateToBytes(value: string, limit: number): string {
  if (byteLength(value) <= limit) return value
  let out = ''
  let used = 0
  for (const char of value) {
    const size = byteLength(char)
    if (used + size > limit) break
    out += char
    used += size
  }
  return out
}

/**
 * 제목 하나를 파일 이름으로. **충돌은 보지 않는다** — 그것은 `pageFileNames`의 일이다.
 *
 * **한글을 그대로 둔다**(「HTML 정적 번들」의 예시가 `관리자-회원-목록.html`이다). 로마자로
 * 옮기거나 퍼센트 인코딩하지 않는다 — 파일 목록을 사람이 읽는 것이 그 예시의 요점이고,
 * `file://`에서 한글 이름은 그대로 열린다(Chrome에서 쟀다).
 */
export function pageFileName(title: string): string {
  const stem = withoutReserved(baseStem(title))
  return `${stem}${EXTENSION}`
}

/**
 * 위험한 문자를 접고, 자르고, 앞뒤를 턴 줄기. 확장자와 예약어 처리는 뺀 것이다.
 *
 * **NFC로 맞추는 것이 첫 걸음이다.** 같은 글자를 NFC와 NFD 두 꼴로 적은 제목이 macOS에서는
 * 한 파일을 가리키고(APFS가 정규화를 안 가린다) Linux에서는 두 파일이 된다. 여기서 접으면
 * 두 기계에서 **같은 번들**이 나오고, 같아진 이름은 아래 충돌 풀이가 결정적으로 가른다.
 */
function baseStem(title: string): string {
  const folded = trimEdges(title.normalize('NFC').replace(UNSAFE, SEPARATOR))
  if (folded.length === 0) return FALLBACK_STEM
  const cut = trimEdges(truncateToBytes(folded, MAX_NAME_BYTES - byteLength(EXTENSION)))
  return cut.length === 0 ? FALLBACK_STEM : cut
}

function withoutReserved(stem: string): string {
  return RESERVED_STEM.test(stem) ? `${stem}${RESERVED_ESCAPE}` : stem
}

/**
 * 충돌을 볼 때 쓰는 열쇠. **대소문자와 유니코드 정규화를 접는다.**
 *
 * macOS와 Windows의 기본 파일 시스템은 대소문자를 가리지 않는다. 접지 않으면
 * `Members.html`과 `members.html`이 Linux에서만 두 파일이고 다른 데서는 하나가 다른 하나를
 * **덮는다** — 그 사고는 번들을 푼 뒤에야 보인다.
 */
function collisionKey(name: string): string {
  return name.normalize('NFC').toLowerCase()
}

/**
 * 줄기에 순번을 붙이되 바이트 상한을 지킨다. 줄기를 먼저 자르고 접미사를 붙인다.
 */
function withOrdinal(stem: string, ordinal: number): string {
  const suffix = `${SEPARATOR}${ordinal}${EXTENSION}`
  const room = MAX_NAME_BYTES - byteLength(suffix)
  const cut = trimEdges(truncateToBytes(stem, room))
  return `${cut.length === 0 ? FALLBACK_STEM : cut}${SEPARATOR}${ordinal}${EXTENSION}`
}

/**
 * 제목 목록을 **충돌 없는** 이름 목록으로. 자리가 그대로 맞는다.
 *
 * **결정적이다** — 같은 목록이 같은 이름들을 낸다. 앞에서부터 자리를 잡고, 이미 쓰인
 * 이름이면 `-2`·`-3`으로 옮긴다.
 *
 * **접미사가 자리를 따르는 대가는 안다.** 페이지 하나를 앞에 끼워 넣으면 뒤에서 부딪히던
 * 이름들의 번호가 밀린다 — 즉 **URL이 안정한 열쇠가 아니다.** id를 이름에 넣으면 안정해지지만
 * 「HTML 정적 번들」의 예시가 **사람이 읽는 이름**이고 id는 사람이 읽는 이름이 아니다. 링크의
 * 안정성이 필요해지는 자리(내려받기 URL 등)가 그때 판정한다.
 */
export function pageFileNames(titles: readonly string[]): string[] {
  const taken = new Set<string>()
  return titles.map((title) => {
    const stem = withoutReserved(baseStem(title))
    let candidate = `${stem}${EXTENSION}`
    for (let ordinal = 2; taken.has(collisionKey(candidate)); ordinal += 1) {
      candidate = withOrdinal(stem, ordinal)
    }
    taken.add(collisionKey(candidate))
    return candidate
  })
}

/**
 * 번들 안의 한 파일에서 다른 파일로 가는 **상대 링크**.
 *
 * `from`·`to`는 둘 다 번들 뿌리에서의 경로다(`index.html` · `pages/….html` ·
 * `assets/theme.css`). 결과는 `from`이 사는 디렉터리를 기준으로 한 URL이다.
 *
 * **마디마다 퍼센트 인코딩한다.** Chrome은 원시 한글 `href`를 같은 URL로 해석하지만
 * `#`과 `?`는 다르다 — 원시로 적으면 **경로가 아니라 조각·질의로**
 * 읽혀 파일에 닿지 않는다. 이름을 만드는 쪽이 그 둘을 막고 있어도 **링크가 스스로 안전한
 * 편이 낫다**: 이름 규칙이 느슨해지는 날 링크가 함께 깨지지 않는다.
 *
 * 구분자 `/`는 인코딩하지 않는다 — 그것이 경로 구조다.
 */
export function bundleHref(from: string, to: string): string {
  const fromDirectory = from.split('/').slice(0, -1)
  const toSegments = to.split('/')
  let shared = 0
  while (shared < fromDirectory.length && shared < toSegments.length - 1 && fromDirectory[shared] === toSegments[shared]) {
    shared += 1
  }
  const up = Array.from({ length: fromDirectory.length - shared }, () => '..')
  const down = toSegments.slice(shared).map((segment) => encodeURIComponent(segment))
  return [...up, ...down].join('/')
}
