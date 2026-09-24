/**
 * `apps/web/src`가 스토어의 **페이지 상태**를 `useOpenDocument`를 거치지 않고 읽는지 본다.
 * 규칙의 뜻과 근거는 `../src/store/use-editor-store.tsx`의 `useOpenPage` 주석에 있고
 * (`useOpenDocument`는 그 껍질이다), 여기 있는 것은 **그 규칙을 기계가 보는 형태**다. 심기 표는 `./store-access.test.ts`에 있다.
 *
 * **왜 소스 텍스트인가.** 이 규칙은 실행해서 잴 수 있는 것이 아니다 — 우회한 코드도 대개의
 * 케이스에서 정상으로 동작하고, 어긋나는 것은 주소가 바뀐 뒤 **커밋 하나** 동안뿐이다(그
 * 창을 보려면 `test/editor-harness.tsx`의 `CommitProbe` 같은 장치가 따로 필요하다). 즉
 * "우회를 썼다"는 사실 자체를 잡아야 하고, 그것이 남는 곳은 소스뿐이다. 이 저장소에 린트
 * 도구가 없는 것(설정 0, `scripts` 항목 0)이 이 형태를 고른 두 번째 이유다.
 *
 * **관문이 둘뿐이라는 것이 이 검사의 전제다.** 스토어 상태를 손에 넣는 길은
 * `useEditorStore(store, selector)`의 selector 인자와 `getState()` 호출 둘이다
 * (`../src/store/editor-store.ts`의 상태는 `#state` — private 필드라 밖에서 직접 닿을 수
 * 없다). 그래서 검사도 그 둘만 본다. 이름이 같은 다른 것(`api/types.ts`의 `headSeq`,
 * `main.tsx`의 전역 `document`)에 걸리지 않는 이유가 그것이다 — 관문 안에서만 이름을 본다.
 *
 * **걸렸으면 어디로 가야 하나.** `document`에는 `useOpenDocument`가 있다. **`headSeq`·
 * `openPageId`는 그 훅이 내주지 않는다** — 편집이 `headSeq`를 `baseSeq`로 쓰므로 그것을
 * 스토어에서 곧장 읽는 자리는 반드시 여기 걸린다. 그때 할 일은 가드를 우회하는 것이 아니라
 * `src/store/use-editor-store.tsx`의 관문을 쓰거나(문서와 `headSeq`를 함께 내주는 `useOpenPage`)
 * 거기에 같은 대조를 하는 관문을 하나 더 두는 것이다. 자세한 것은 아래 `fixHint`에 있고,
 * 위반 메시지가 그 파일을 가리킨다.
 *
 * **이 검사가 보지 못하는 것**(고의로 열어 둔 것이 아니라, 심어서 재보니 0건이던 것):
 *
 * - **한 문에서 끝나지 않는 형태.** 셋을 심어 재보니 셋 다 0건이다 — 상태를 변수에 담고
 *   다음 문에서 읽기(`const s = store.getState()` → `s.document`), selector를 변수로 빼서
 *   넘기기(`const pick = (s: EditorState) => s.document` → `useEditorStore(store, pick)`),
 *   상태를 함수 인자로 넘겨 그 안에서 읽기. 변수를 따라가려면 타입을 아는 도구가 필요하고,
 *   그것은 이 저장소에 없다.
 * - **`getState()`와 필드 사이에 무엇이 끼는 형태.** 넷을 심어 재보니 넷 다 0건이다 —
 *   `getState()?.document` · `getState()!.document` · `` getState()[`document`] `` ·
 *   `const { document: { root } } = getState()`(중첩 구조 분해). **앞 둘**은 심기 표가 잡는
 *   `getState().document`와 한 글자 차이고, 백틱 쪽은 심기 표의 `getState()['document']`에서
 *   따옴표만 바뀐 형태다. 원인은 아래 `checkGetState`의 정규식이
 *   `)` 바로 뒤의 `.`과 `'`·`"` 키만 보고, 구조 분해 쪽은 `\{([^{}]*)\}`라 중괄호가
 *   중첩되면 매칭되지 않는 것이다. **백틱은 리터럴이고 이름이 소스에 그대로 남는데도
 *   안 잡힌다** — 이것을 못 보는 이유는 "이름이 남지 않아서"가 아니라 정규식이 두 따옴표만
 *   열거해서다.
 * - **필드 이름을 값으로 만드는 형태.** `store.getState()[key]`(실측 0건). 이쪽은 이름이
 *   소스에 아예 남지 않으므로 텍스트 검사로 닿을 수 있는 형태가 아니다.
 * - **정규식 리터럴.** 주석 걷기가 `/`를 나눗셈으로 보므로 `/a\/\/b/` 같은 형태 뒤가
 *   잘못 읽힐 수 있다. 지금 `apps/web/src`에는 정규식 리터럴이 없어 **재지 못했다.**
 * - **제외한 파일 둘 안에서의 우회**(아래 `EXEMPT`). 그 둘은 규칙을 정의하는 곳이라
 *   대상에서 빼는데, 그래서 `use-editor-store.tsx`에 우회를 새로 심어도 조용하다.
 *   대신 그 파일 안에 우회 형태가 실제로 있다는 사실을 **양성 대조로** 쓴다.
 *
 * **이 목록이 사각의 전부라는 뜻이 아니다** — 심어서 잰 것만 적었다. 잡는 형태는 심기 표가
 * 열일곱 줄로 열거하는데, 마찬가지로 **그 표에 없는 형태가 안전하다는 뜻은 아니다.**
 * (`getState()` 쪽 정규식은 넓히지 않는다 — 지금 트리에 그 형태가 0건이라 지금 새는 것이
 * 없고, 넓히면 구분력을 새로 실증해야 한다.)
 *
 * **거짓 양성으로 남겨 둔 것**(전부 잰 값이다):
 *
 * - **selector 안의 이름이 스토어 필드가 아닐 때.** 페이지 필드와 같은 이름이 다른 것에
 *   붙어 있으면 **인라인 selector에서** 걸린다(변수로 빼면 위 사각 첫 줄이라 0건이다) —
 *   `(s) => s.undoStack.at(-1)?.document`,
 *   `(s) => s.pending.some((p) => p.headSeq < base)` 등 **다섯을 심어 다섯 다 걸리는 것을
 *   확인했다**(그 다섯이 부류의 전부라는 뜻은 아니다). 좁히는 판을 만들어 재봤고 **사각
 *   하나와 맞바꾸는 거래라 좁히지 않았다** — 수가 아니라 그 사각의 성질 때문이고, 근거는
 *   아래 `checkSelectors` 주석에 있다.
 * - **문자열·템플릿 리터럴 안의 우회 모양.** 실측: 템플릿 안의
 *   `${store.getState().document}`가 1건. 아래 `stripComments`가 문자열의 내용을 남기기
 *   때문인데, 그것은 `getState()['document']`의 이름을 살리려고 그런 것이고 여기서는 부수
 *   효과다. 템플릿 안의 그것은 진짜로 실행되는 코드이므로 잡히는 편이 맞고, 실행되지 않는
 *   문자열에 우회 모양을 적을 이유는 없다.
 */

/** 검사 이름. 어느 규칙이 물었는지가 실패 메시지와 심기 표에 그대로 나온다. */
export type CheckName =
  | 'selector-page-field'
  | 'get-state-page-field'
  | 'whole-state-selector'
  | 'unreadable'

export interface Violation {
  check: CheckName
  /** 문제가 된 조각(공백을 한 칸으로 고른 형태). */
  snippet: string
  message: string
}

export interface FileViolation extends Violation {
  /** `scanSources`에 넘어온 키 그대로. */
  file: string
}

/**
 * **페이지와 함께 실리고 함께 비워지는 필드.** `loadPage`·`clearPage`가 이 셋을 한 번에
 * 움직인다(`../src/store/editor-store.ts`). 그래서 주소가 바뀐 뒤의 커밋 하나 동안 셋이
 * **함께** 앞 페이지의 값이고, 셋 다 주소와 대조한 뒤에 써야 한다.
 *
 * `selectedNodeId`도 같은 호출로 움직이지만 여기 넣지 않는다 — 그 값은 문서 안에서만
 * 뜻이 있어서 앞 페이지의 id가 남아도 `findNode`가 못 찾고 끝난다(`property-panel.tsx`).
 * 대조 없이 읽어도 앞 페이지의 **내용이 그려지지는** 않는다.
 *
 * **`baseDocument`**(리베이스의 바탕 — `editor-store.ts`)도 같은 호출로 실리고 비워지고,
 * 그리고 **더 위험하다**: 그것은 서버가 확인해 준 문서라 화면이 그리면 사용자가 방금 친
 * 값이 빠진 문서를 보게 된다. 지금 스토어 밖에서 그것을 읽는 자리는 없다.
 */
const PAGE_FIELDS = new Set(['openPageId', 'document', 'baseDocument', 'headSeq'])

/**
 * 검사 대상이 아닌 파일. **규칙을 정의하는 곳 둘**이다 — 스토어 자신과, 대조가 들어 있는
 * React 바인딩. 경로의 **끝**으로 보는 것은 glob 키의 앞부분이 부르는 쪽마다 다르기
 * 때문이다.
 *
 * 이 목록을 늘리는 것은 규칙에 구멍을 내는 것이다. 늘려야 한다고 생각되면 먼저
 * `useOpenDocument`를 그 파일에서 쓸 수 없는 이유부터 적어라.
 */
const EXEMPT = ['src/store/editor-store.ts', 'src/store/use-editor-store.tsx']

export function isExempt(path: string): boolean {
  return EXEMPT.some((suffix) => path.endsWith(suffix))
}

/**
 * 걸렸을 때 **합법적으로 갈 수 있는 길**. 가드가 길을 지목하지 못하면 다음 사람은 가드를
 * 무력화한다.
 *
 * **`document`에는 그 길이 `useOpenDocument`다.** **`headSeq`·`openPageId`는 그 훅이 내주지
 * 않는다** — 반환 타입이 `PageDocument | null`이다. 편집이 `headSeq`를 `baseSeq`로 쓰므로
 * 그것을 스토어에서 곧장 읽는 자리는 반드시 여기 걸린다.
 *
 * 그때 할 일은 가드를 우회하는 것이 아니라 `src/store/use-editor-store.tsx`의 관문을 쓰거나
 * (문서와 `headSeq`를 함께 내주는 `useOpenPage`) 거기에 **같은 대조를 하는 관문을 하나 더
 * 두는 것**이다. 그 파일이 제외 대상인 이유가 그것이다 — 규칙을 정의하는 자리이므로 규칙을
 * 넓히는 것도 거기서 한다.
 */
function fixHint(name: string): string {
  return name === 'document'
    ? '주소와 대조하는 `useOpenDocument(pageId)`를 써라'
    : `\`useOpenDocument\`는 문서만 내준다 — \`${name}\`가 필요하면 \`src/store/use-editor-store.tsx\`에 같은 대조를 하는 관문을 더해라(그 파일이 이 검사의 제외 대상인 이유다)`
}

/**
 * 파일 여럿을 한 번에. 키는 파일 경로, 값은 그 소스 전문이다. 빈 배열이면 우회가 없다.
 *
 * **파일이 하나도 없어도 빈 배열이 나온다** — 그래서 이 함수의 결과만으로는 검사가 일을
 * 했는지 알 수 없다. 부르는 쪽이 대상 수를 함께 단언해야 한다(`store-access.test.ts`).
 */
export function scanSources(sources: Record<string, string>): FileViolation[] {
  const violations: FileViolation[] = []

  for (const [file, source] of Object.entries(sources)) {
    if (isExempt(file)) continue
    for (const violation of findViolations(source)) violations.push({ file, ...violation })
  }

  return violations
}

/** 소스 전문에서 우회를 찾는다. 빈 배열이면 우회가 없다. */
export function findViolations(source: string): Violation[] {
  const violations: Violation[] = []
  const code = stripComments(source)

  checkSelectors(code, violations)
  checkGetState(code, violations)

  return violations
}

/**
 * `useEditorStore(store, selector)`의 인자를 본다.
 *
 * **selector 텍스트 안에서는 이름만으로 판정한다** — 그 이름이 무엇에 붙어 있는지 보지
 * 않는다. 이름만 보므로 구조 분해(`({ document }) => document`)·`as` 캐스팅·selector 안에서
 * 한 번 더 변수를 거치는 형태가 **인라인으로 쓰이는 한** 함께 걸린다(selector 자체를 밖으로
 * 빼면 이름이 관문 안에 없다 — 위 사각 목록 첫 줄).
 *
 * **그 값으로 오탐이 난다** — 페이지 필드와 **같은 이름이 스토어가 아닌 것에 붙어 있는**
 * **인라인** selector가 걸린다. 인라인이라는 단서가 붙는 것은, 같은 selector를 변수나 함수로
 * 빼서 넘기면 이름이 관문 안에 없어 **0건**이기 때문이다(실측: `const pick = (s) =>
 * s.undoStack.at(-1)?.document` 뒤의 `useEditorStore(store, pick)`도, 같은 것을 `function
 * pick(s) {…}`으로 쓴 판도 0건. 같은 것을 인라인으로 두면 각 1건이다). 그것은 위 사각
 * 목록 첫 줄이 이미 못박은 형태이고, 오탐과 사각이 같은 자리에서 갈린다.
 *
 * 심어서 잰 다섯(전부 `selector-page-field`):
 *
 * ```ts
 * (s) => s.undoStack.at(-1)?.document        // undo/redo가 쓰는 모양이다
 * (s) => s.snapshots.map((snap) => snap.document)
 * (s) => s.pending.filter((p) => p.openPageId === id)
 * (s) => s.pending.some((p) => p.headSeq < base)
 * (s) => s.lastResponse.headSeq
 * ```
 *
 * **다섯이 전부라는 뜻이 아니다** — 부류가 그렇다는 것이고, 심어서 잰 것만 적었다.
 *
 * **그래도 좁히지 않았다.** selector 파라미터의 첫 식별자를 뽑고 `(x as T)`를 걷은 뒤 그
 * 파라미터에 붙은 접근만 보는 판을 만들어 재봤다(구조 분해 목록은 그 안의 이름을 그대로
 * 본다). 결과: **위 다섯이 전부 통과**하고 잡아야 하는 아홉 형태와 음성 대조 셋은 그대로인데,
 * **사각이 하나 남는다** — `(s) => { const t = s; return t.document }`. selector 안에서 변수를
 * 한 번 거치는 형태이고, 값이 어디서 왔는지를 알아야 하므로 정규식으로 닫을 수 있는 종류가
 * 아니다. (`(s = init) => s.document`와 `(s) => (s as EditorState).document`는 그 판에서도
 * **잡힌다** — 파라미터 추출이 기본값 문법을 넘어야 그렇다.)
 *
 * **거래는 "오탐 다섯 ↔ 사각 하나"인데도 좁히지 않는 이유는 수가 아니라 성질이다.** 남는
 * 사각이 하필 이 검사의 **핵심 형태**(스토어의 `document`를 곧장 읽기) 위에 나고,
 * **오탐은 테스트가 실패해 사람이 읽고 판단하지만 사각은 아무 소리도 내지 않는다.**
 *
 * 걸렸는데 스토어의 페이지 필드를 읽는 것이 아니라면, 그 자리에 이 사실을 적고 넘어가라.
 * 스토어의 필드를 **읽는 것이 맞다면** 위 `fixHint`가 가리키는 길을 보라.
 *
 * (참고: `(s) => s.pendingByPage[s.openPageId ?? '']`도 걸리는데 **그쪽은 오탐이 아니다** —
 * 스토어의 `openPageId`를 주소와 대조 없이 읽고 있고, 그것이 이 검사의 대상이다.)
 *
 * `useEditorStoreInstance(`가 함께 걸리지 않는 것은 이름 뒤에 곧바로 `(`가 오는 형태만
 * 찾기 때문이다.
 */
function checkSelectors(code: string, violations: Violation[]): void {
  const call = /\buseEditorStore\s*\(/g
  let match: RegExpExecArray | null

  while ((match = call.exec(code)) !== null) {
    const open = match.index + match[0].length - 1
    const close = matchParen(code, open)

    if (close === -1) {
      violations.push({
        check: 'unreadable',
        snippet: normalize(code.slice(match.index, match.index + 60)),
        message: '닫히지 않은 호출이라 selector를 읽지 못한다',
      })
      return
    }

    const args = splitTop(code.slice(open + 1, close), ',')
    // 인자가 하나뿐인 형태(전개 등)는 전체를 본다 — 놓치는 쪽보다 낫다.
    const selector = args[1] ?? args[0] ?? ''

    for (const name of identifiers(selector)) {
      if (PAGE_FIELDS.has(name)) {
        violations.push({
          check: 'selector-page-field',
          snippet: normalize(selector),
          message: `\`${name}\`를 스토어에서 곧장 고른다 — ${fixHint(name)}`,
        })
      }
    }

    if (isWholeState(selector)) {
      violations.push({
        check: 'whole-state-selector',
        snippet: normalize(selector),
        message:
          '상태 객체 전체를 고르면 페이지 필드를 어디서든 읽을 수 있어 대조가 무력해진다 — 필드 하나씩 골라라',
      })
    }
  }
}

/**
 * `getState()`로 상태를 직접 읽는 자리를 본다. 세 형태를 각각 본다 — 뒤에 붙는 프로퍼티
 * 접근 둘(`.document`·`['document']`)과 앞의 구조 분해(`const { document } = …`).
 *
 * **`getState()` 자체를 막지는 않는다.** `mode`·`zoom`처럼 페이지에 매이지 않은 값을
 * 그렇게 읽는 것은 대조할 주소가 없어 이 규칙의 대상이 아니다.
 */
function checkGetState(code: string, violations: Violation[]): void {
  const chained = /getState\s*\(\s*\)\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*(['"])([^'"]*)\2\s*\])/g
  let match: RegExpExecArray | null

  while ((match = chained.exec(code)) !== null) {
    const name = match[1] ?? match[3] ?? ''
    if (PAGE_FIELDS.has(name)) {
      violations.push({
        check: 'get-state-page-field',
        snippet: normalize(match[0]),
        message: `\`${name}\`를 스토어에서 곧장 읽는다 — ${fixHint(name)}`,
      })
    }
  }

  // 구조 분해. `{}` 안에 개행이 있어도 한 덩어리로 잡히도록 중괄호로만 경계를 잡는다.
  const destructured = /\{([^{}]*)\}\s*=\s*[^=]*?getState\s*\(\s*\)/g
  while ((match = destructured.exec(code)) !== null) {
    for (const name of identifiers(match[1] ?? '')) {
      if (PAGE_FIELDS.has(name)) {
        violations.push({
          check: 'get-state-page-field',
          snippet: normalize(match[0]),
          message: `\`${name}\`를 스토어에서 곧장 꺼낸다 — ${fixHint(name)}`,
        })
      }
    }
  }
}

/**
 * 상태 객체를 그대로 돌려주는 selector인가(`(s) => s`). 타입 주석과 괄호 생략을 함께 본다.
 *
 * 그 형태는 참조 안정성 자체를 재는 테스트에만 있어야 한다(`use-editor-store.tsx` 머리말).
 * 여기서 막는 이유는 다른데, **위 두 검사를 우회하는 길**이기 때문이다 — 상태 전체를
 * 받아 두면 페이지 필드를 관문 밖에서 읽을 수 있다.
 */
function isWholeState(selector: string): boolean {
  const match = /^\(?\s*([A-Za-z_$][\w$]*)\s*(?::[\s\S]*?)?\)?\s*=>\s*([A-Za-z_$][\w$]*)\s*$/.exec(
    normalize(selector),
  )
  return match !== null && match[1] === match[2]
}

/**
 * 주석을 걷는다. **문자열은 남긴다** — 지우면 `getState()['document']`의 이름까지 사라진다.
 * 문자열을 인식하기는 하므로 그 안의 `//`가 주석으로 읽히지는 않는다(`'http://…'`).
 *
 * 걷은 자리를 공백으로 채우는 것은 앞뒤 토큰이 붙어 새 이름이 생기는 것을 막기 위해서다.
 *
 * **`role-access.test.ts`도 이것을 쓴다** — 소스에서 무언가를 세는 검사는 **주석을 걷지 않으면
 * 자기 자신을 센다**. 그래서 export 한다.
 */
export function stripComments(source: string): string {
  let out = ''
  let index = 0

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        out += ' '
        index += 1
      }
      continue
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      while (index < stop) {
        out += source[index] === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char
      out += char
      index += 1
      while (index < source.length) {
        const inner = source[index]
        out += inner
        index += 1
        if (inner === '\\' && index < source.length) {
          out += source[index]
          index += 1
          continue
        }
        if (inner === quote) break
      }
      continue
    }

    out += char
    index += 1
  }

  return out
}

/** `open`의 `(`와 짝이 되는 `)`의 위치. 없으면 `-1`이다. */
function matchParen(code: string, open: number): number {
  let depth = 0

  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '(') depth += 1
    else if (code[index] === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

/** 괄호·중괄호·대괄호·따옴표 안을 건너뛰며 `separator`로 가른다. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let buffer = ''

  for (const char of text) {
    if (quote !== null) {
      buffer += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      buffer += char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1

    if (char === separator && depth === 0) {
      parts.push(buffer)
      buffer = ''
      continue
    }
    buffer += char
  }

  parts.push(buffer)
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

/** 텍스트에 나오는 식별자 전부. 문자열 리터럴 안은 그대로 두므로 그 안의 이름도 나온다. */
function identifiers(text: string): string[] {
  return [...text.matchAll(/[A-Za-z_$][\w$]*/g)].map((match) => match[0])
}

/** 여러 줄에 걸친 조각을 한 줄로 — 실패 메시지에 그대로 나오는 값이다. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
