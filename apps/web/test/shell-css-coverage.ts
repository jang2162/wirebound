/**
 * **코드가 붙인 `wb-shell-*` 클래스에 `shell.css` 규칙이 있는가.** D7 검사(`shell-css.test.ts`)
 * 의 거울상이다 — 그쪽은 *"셸 규칙이 문서 노드까지 새는가"*를 보고, 이쪽은 *"규칙이 아예
 * 없어 조용히 무스타일이 되는가"*를 본다.
 *
 * **왜 조용한가.** `shell.css`는 D7 때문에 **요소 선택자를 쓰지 않는다** — 모든 규칙이
 * `.wb-shell-*` 클래스에 걸린다. 그래서 클래스 이름을 하나 오타 내거나 아예 안 붙이면
 * 그 자리는 브라우저 기본으로 그려지고 **아무것도 실패하지 않는다.** 렌더는 되고 테스트도
 * 통과한다. 이 검사가 붙기 전 저장소에 그런 클래스가 **28개** 있었다(상호작용 탭 전량,
 * 컬럼 편집기 전량, 코멘트 버튼 여섯, 다섯 위젯이 공유하는 `.wb-shell-control` 등).
 *
 * **방향은 코드 → CSS 한쪽뿐이다.** 반대(규칙은 있는데 안 쓰이는 죽은 규칙)는 **넣지
 * 않는다** — 그 수는 지금 0이고, 넣으면 규칙을 먼저 쓰고 마크업을 붙이는 개발 중간
 * 상태마다 검사가 물어 방해만 된다.
 *
 * ## 이 검사가 보지 못하는 것 (고의로 연 것이 아니라, 못 보는 것)
 *
 * - **`className`이 아닌 자리로 붙는 클래스.** 스캔의 닻이 `className` 이라는 낱말이므로
 *   `setAttribute('class', …)`·`classList.add(…)`·`class=`(순수 HTML)는 안 보인다.
 *   지금 `apps/web/src`에 그런 자리는 없다(검산: `grep -rn "classList\|setAttribute..class"
 *   apps/web/src`).
 *
 * - **값이 실행 시점에 만들어지는 클래스.** 문자열 리터럴만 읽으므로
 *   `` className={`wb-shell-${kind}`} `` 나 `className={base + '-active'}` 처럼 이름을
 *   조립하는 형태는 토큰이 이름 꼴을 벗어나 버려진다. 지금 그런 자리는 없고,
 *   **`className={props.className}`으로 넘겨받는 자리 둘**(`routes/editor.tsx`의
 *   `ShellRegion`, `theme/theme-issues.tsx`)은 **부르는 쪽의 리터럴을 이 검사가 잡으므로**
 *   덮인다.
 *
 * - **`className = 식` (JSX 속성이 아니라 대입).** `el.className = cond ? 'a' : 'b'` 는
 *   값이 `{`도 따옴표도 아닌데 닻이 `=` 라 버려진다. **일부러 그렇게 둔 것이고 근거는
 *   `readValue`의 머리말에 있다** — 여기까지 잘라 오게 하면 세미콜론 없는 이 저장소에서
 *   대입의 끝을 알 수 없어 무관한 줄의 리터럴을 삼킨다. 지금 저장소에 이 형태는 0건이다
 *   (검산: `grep -rnE '\.className\s*=' apps/web/src`).
 *
 * - **주석 안의 `className`을 실제 사용으로 센다.** 줄 주석·블록 주석·JSX 주석 셋 다
 *   스캐너가 코드와 구분하지 못한다. **거짓 양성이라 방향이 안전한 쪽이다** — 없는 사용을
 *   더 세는 것이므로 규칙이 있는데 없다고 말하지는 않는다. 반대로 **주석에 예시로 적은
 *   클래스에 규칙이 없으면 검사가 운다.** 지금 그런 자리는 0건이다 — **검산 명령을 `.ts`/
 *   `.tsx`로 좁혀야 문장과 맞는다**(좁히지 않으면 `shell.css` 주석 2건이 나오는데, 그 파일은
 *   스캐너가 읽지 않으므로 거짓 경보다):
 *   `grep -rn 'className' apps/web/src --include='*.ts' --include='*.tsx' | grep -E '^\S+: *(//|\*|\{/\*)'`
 *   테스트 `ALLOWED` 표의 `주석 안의 클래스 이름…` 케이스는 **`className` 자리가 아닌 것**
 *   만 재므로 이 형태를 덮지 않는다 — 그 사실을 여기 적어 둔다.
 *
 * - **문자열 리터럴 유니온 타입.** `className: 'wb-shell-a' | 'wb-shell-b'` 는 **타입 자리인데
 *   사용으로 센다.** 몇 개를 세는지는 **유니온의 첫 항이 무엇이냐로 갈린다**(실측):
 *
 *   | 형태 | 결과 | 왜 |
 *   |---|---|---|
 *   | `className: 'wb-shell-a' \| 'wb-shell-b'` | `['wb-shell-a']` | 값 첫 글자가 따옴표라 **따옴표 가지**로 가고 짝에서 끝난다 |
 *   | `className: Base \| 'wb-shell-a' \| 'wb-shell-b'` | 둘 다 | 첫 글자가 따옴표가 아니라 `readPropertyValue`가 `}`까지 잘라 온다 |
 *
 *   즉 "첫 멤버만"이 성질이 아니라 **가지 선택의 부수 효과**다. 어느 쪽이든 과잉 계수
 *   방향이라 안전하지만 정확하지는 않다. 저장소 0건
 *   (검산: `grep -rnE "className\??: *'[^']*' *\|" apps/web/src --include='*.ts' --include='*.tsx'`).
 *
 * - **JSX가 아닌 변수 선언.** `const className = 'wb-shell-x'` 도 센다. 닻이 `className` 이라는
 *   낱말이라 선언인지 속성인지 가리지 못한다 — **`className:` 가지가 생기기 전부터 있던
 *   성질이고 이번 수정이 만든 것이 아니다.** 저장소 0건
 *   (검산: `grep -rnE '(const|let|var) +className *=' apps/web/src --include='*.ts' --include='*.tsx'`).
 *
 * - **`id`·`htmlFor`로 쓰는 `wb-shell-…` 이름.** 이것은 못 보는 것이 아니라 **보면 안 되는
 *   것**이다. `wb-shell-preset-picker`·`wb-shell-preset-name`·`wb-shell-pattern-picker`·
 *   `wb-shell-picker-type` 넷이 그 형태이고(라벨이 `htmlFor`로 가리키는 입력의 id),
 *   D7은 id 선택자를 금지하므로 이들에 규칙이 있으면 **오히려 틀린 것이다.** 닻을
 *   `className`으로 좁힌 것이 이 넷을 자동으로 거른다.
 *
 * - **`shell.css` 밖의 스타일.** 인라인 `style`, `theme/use-theme-css.ts`가 `document.head`에
 *   붙이는 시트는 읽지 않는다. `shell-css-guard.ts` 머리말이 그 목록을 갖는다.
 *
 * - **오타의 방향.** *"코드에 있는데 CSS에 없다"*는 잡지만 그것이 오타인지 빠뜨린 규칙인지는
 *   모른다. 사람이 읽고 판단할 몫이다.
 *
 * - **중괄호 세기를 속이는 형태.** `className={…}`의 값은 중괄호를 세어 자르는데, 문자열
 *   안의 `{`·`}`를 건너뛰지 않는다. 클래스 이름을 만드는 식에 중괄호가 든 문자열이 오면
 *   그 자리부터 잘못 읽는다 — 오늘 그런 자리는 없다.
 */

/** 클래스 이름으로 쓸 수 있는 꼴. 템플릿 리터럴의 `${…}` 조각을 여기서 걸러낸다. */
const IDENT = /^[A-Za-z0-9_-]+$/

/**
 * `className=` 또는 `className:` — JSX 속성과 객체 리터럴 둘 다 잡는다.
 * **어느 쪽이었는지를 기억한다**(포획 그룹) — 값을 어디까지 읽을지가 그것으로 갈린다.
 */
const CLASS_ANCHOR = /\bclassName\s*([=:])\s*/g

/** 값 안의 문자열 리터럴. 홑·겹따옴표와 백틱을 같게 다룬다. */
const STRING_LITERAL = /(['"`])([^'"`]*)\1/g

/** 셸의 클래스인가. 루트(`wb-shell`) 자신도 클래스다. */
function isShellClass(token: string): boolean {
  return token === 'wb-shell' || token.startsWith('wb-shell-')
}

/**
 * 소스 하나에서 `className`으로 붙는 `wb-shell-*` 클래스 이름 전부(중복 포함).
 *
 * **`className=` 뿐 아니라 `className:` 도 닻으로 쓴다.** `panels/controls/text-control.tsx`가
 * 공통 속성을 객체(`const shared = { className: 'wb-shell-control', … }`)로 만들어 펼치기
 * 때문이다 — **이 한 자리를 놓치면 다섯 위젯이 공유하는 `.wb-shell-control`이 검사를
 * 통째로 빠져나간다.** 그것이 이번 사고에서 가장 넓게 퍼진 하나였다.
 *
 * **값이 `{…}`면 그 안의 문자열 리터럴을 전부 읽는다.** 조건식(`{a ? 'x' : 'y'}`)이나
 * 여러 조각을 잇는 형태에서 첫 리터럴만 보고 끝내지 않기 위해서다.
 *
 * **`className:`의 값이 식일 때도 읽는다 — 앞 판은 여기를 통째로 버렸다.** 그때
 * `readValue`는 값이 `{`·따옴표가 **아니면** `null`을 냈는데, JSX 속성의 값은 문법상 늘
 * 둘 중 하나라 무사했지만 객체 리터럴의 값은 그렇지 않다. 그래서
 * `{ className: on ? 'wb-shell-a' : 'wb-shell-b' }`가 스캔에서 사라졌고, 규칙 없는 클래스가
 * 트리에 앉아 있는데 검사가 **19/19 통과**했다(리뷰가 실증했다). 머리말이 `className:`을
 * 요점으로 강조하면서 그 절반만 다루고 있었던 것이 결함의 본질이다.
 */
export function shellClassesInSource(source: string): string[] {
  const found: string[] = []
  const anchor = new RegExp(CLASS_ANCHOR.source, 'g')
  let match: RegExpExecArray | null

  while ((match = anchor.exec(source)) !== null) {
    const value = readValue(source, match.index + match[0].length, match[1] ?? '=')
    if (value === null) continue

    for (const literal of stringLiterals(value)) {
      for (const token of literal.split(/\s+/)) {
        if (IDENT.test(token) && isShellClass(token)) found.push(token)
      }
    }
  }

  return found
}

/**
 * 규칙이 없는 클래스. 빈 배열이면 커버리지가 온전하다.
 *
 * `sources`는 `[파일 이름, 원문]` 짝이다 — 파일 이름은 실패 메시지에만 쓰인다. 파일을
 * 읽는 것은 이 함수가 하지 않는다(테스트가 심은 소스로도 돌릴 수 있어야 한다).
 */
export function findUncoveredClasses(
  sources: Iterable<readonly [string, string]>,
  ruled: ReadonlySet<string>,
): { className: string; files: string[] }[] {
  const used = new Map<string, Set<string>>()

  for (const [file, source] of sources) {
    for (const className of shellClassesInSource(source)) {
      const files = used.get(className) ?? new Set<string>()
      files.add(file)
      used.set(className, files)
    }
  }

  const uncovered: { className: string; files: string[] }[] = []
  for (const [className, files] of [...used].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!ruled.has(className)) uncovered.push({ className, files: [...files].sort() })
  }
  return uncovered
}

/**
 * `className` 뒤의 값. **어디서 끝나는지가 닻의 종류로 갈린다.**
 *
 * | 값의 첫 글자 | 끝 | 근거 |
 * |---|---|---|
 * | `{` | 짝이 되는 `}` | 정확하다 |
 * | 따옴표 | 짝이 되는 따옴표 | 정확하다 |
 * | 그 밖 + 닻이 `:` | 그 객체의 다음 최상위 `,`·`;`·`}` | 객체 속성의 값은 거기서 끝난다 |
 * | 그 밖 + 닻이 `=` | `null` | 아래 |
 *
 * **`=`와 `:`를 한 규칙으로 다루지 않는다. 근거는 "넓히면 JSX가 깨진다"가 아니다.**
 *
 * JSX 문법상 속성 값은 **항상** `{…}`이거나 따옴표 문자열이다. 그러므로 값의 첫 글자가
 * 이미 위 두 가지 중 하나에 걸리고, **`=` 닻의 fallback 가지는 정상 JSX에서 도달하지
 * 않는다.** 도달하지 않는 가지는 뒤따르는 속성을 삼킬 수도, 거짓 양성을 만들 수도 없다.
 *
 * **도달하는 유일한 형태는 JSX가 아니라 대입문이고, 거기서 넓히면 실제로 위험하다.**
 * 이 저장소는 세미콜론을 쓰지 않으므로 대입의 끝을 알 방법이 없다 — 스캔이 감싼 블록의
 * `}`까지 흘러 **무관한 줄의 리터럴을 삼킨다.** 실측(닻과 무관하게 넓힌 판을 만들어 재봤다):
 *
 * ```
 * function f() {
 *   el.className = on ? 'wb-shell-x' : ''
 *   const other = 'wb-shell-swallowed'
 * }
 *   지금 구현 : []
 *   넓힌 구현 : ["wb-shell-swallowed", "wb-shell-x"]   ← 다음 줄이 딸려 온다
 * ```
 *
 * 오늘 그 형태는 저장소에 0건이다(검산: `grep -rnE '\.className\s*=' apps/web/src`).
 * 그래도 안 넓히는 것은, 넓혀서 얻는 것이 **0**이고(JSX에서 도달하지 않으므로) 잃는 것이
 * 위 과잉 계수이기 때문이다.
 *
 * **이 결정을 잠그는 케이스는 `shell-css-coverage.test.ts`의 `NOT_SEEN` 3번**
 * (`element.className = 식`)이다. 넓히는 순간 그것만 깨진다 — `ALLOWED`의 JSX 케이스들은
 * 두 구현에서 결과가 같아 이 결정을 재지 못한다(그쪽 주석에 실측을 적었다).
 *
 * > **앞 판은 여기에 *"넓히면 `<label htmlFor="…">` 같은 뒤 속성까지 삼킨다"*고 적고
 * > 있었고 그것은 거짓이었다.** 넓힌 판을 실제로 만들어 그 줄을 먹여 보면 두 구현의 결과가
 * > 같다(`apps/web/src` 전수 대조도 차이 0건). 바로 위 문단의 *"JSX 속성 값은 늘 `{…}`이거나
 * > 따옴표다"*와 **서로 모순인 서사를 나란히 적어 두고 있었던 것**이다. 결론은 옳았고 근거만
 * > 틀렸다. 지우기만 하면 다음 사람이 같은 서사를 다시 만들 것이라 자취를 남긴다.
 *
 * 잘라 온 조각이 `'a'`처럼 리터럴 하나든 `on ? 'a' : 'b'`처럼 식이든 상관없이
 * `stringLiterals`가 같은 꼴로 다시 읽는다.
 */
function readValue(source: string, at: number, separator: string): string | null {
  const char = source[at]
  if (char === undefined) return null

  if (char === '{') {
    const end = matchBrace(source, at)
    return end === -1 ? null : source.slice(at + 1, end)
  }
  if (char === '"' || char === "'" || char === '`') {
    const end = source.indexOf(char, at + 1)
    // 따옴표 안을 그대로 넘긴다 — 아래 `stringLiterals`가 같은 꼴로 다시 읽는다.
    return end === -1 ? null : source.slice(at, end + 1)
  }
  // `className = 식` (JSX 속성이 아니라 대입)도 여기로 온다. 지금 저장소에 0건이고,
  // 그 형태는 아래 머리말의 "못 보는 것"에 적혀 있다.
  return separator === ':' ? readPropertyValue(source, at) : null
}

/**
 * 객체 속성 값의 끝까지. 따옴표·괄호·대괄호·중괄호 안을 건너뛰며 **최상위** `,`·`;`·`}`를
 * 찾는다.
 *
 * **`;`도 끝으로 보는 것은 방어이지 무엇을 재는 장치가 아니다.** 타입 자리
 * (`props: { className: string; name: string }` — `routes/editor.tsx`·`theme/theme-issues.tsx`에
 * 실재한다)에서 `,`만 보면 뒤 속성까지 삼키는데, **삼켜도 오늘은 결과가 같다**: 그 조각에
 * 문자열 리터럴이 없기 때문이다. 실측으로도 `;`를 종결자에서 빼면 `ALLOWED`·`NOT_SEEN`의
 * 어느 케이스도 결과가 바뀌지 않는다.
 *
 * 그러므로 **`;`가 무엇을 잡는다고 적지 마라.** 하는 일은 잘라 오는 조각을 짧게 유지해
 * 과잉 계수의 여지를 줄이는 것뿐이고, 그것이 값싸고 해롭지 않아서 남긴다.
 */
function readPropertyValue(source: string, at: number): string {
  let depth = 0
  let quote: string | null = null

  for (let index = at; index < source.length; index += 1) {
    const char = source[index]

    if (quote !== null) {
      // 이스케이프한 따옴표가 리터럴을 끝내면 안 된다.
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      depth += 1
      continue
    }
    if (char === ')' || char === ']') {
      depth -= 1
      continue
    }
    if (char === '}') {
      // 감싼 객체가 여기서 닫힌다 — 값도 거기서 끝이다.
      if (depth === 0) return source.slice(at, index)
      depth -= 1
      continue
    }
    if (depth === 0 && (char === ',' || char === ';')) return source.slice(at, index)
  }

  return source.slice(at)
}

/**
 * `open`의 `{`와 짝이 되는 `}`. 없으면 `-1`이다.
 *
 * **`shell-css-guard.ts`의 같은 이름 함수와 알고리즘이 같지만 갈라 둔다.** 그쪽은 CSS
 * 블록을 자르고 이쪽은 JS 식을 자른다 — 한쪽이 문자열·주석을 건너뛰게 되는 날 다른 쪽이
 * 딸려 가면 안 된다. 공유하는 것은 **CSS 쪽 절반**(`ruledClasses`)이지 이 유틸이 아니다.
 */
function matchBrace(source: string, open: number): number {
  let depth = 0

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

/** 값 안의 문자열 리터럴 내용들. */
function stringLiterals(value: string): string[] {
  const out: string[] = []
  const pattern = new RegExp(STRING_LITERAL.source, 'g')
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) out.push(match[2] ?? '')
  return out
}
