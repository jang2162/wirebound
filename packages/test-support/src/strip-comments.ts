/**
 * **소스를 읽는 자가 주석을 걷는 자리 — TypeScript 파서가 걷는다.** 소스를 글자로 세는 자는 전부 이것을 지난다.
 *
 * 정규식으로 주석을 걷으면 두 쪽으로 틀린다. 줄 끝 `//` 주석을 안 걷으면 주석에 이름을 적기만 해도
 * 자가 빨강이 되고(거짓 빨강), 줄 주석 · 문자열 안의 `/*`를 블록 주석의 시작으로 읽으면 뒤따르는 JSDoc 의 끝까지
 * **코드째** 지워 진짜 위반이 초록으로 지나간다(거짓 초록 — `// 글롭 예: src/*` 한 줄이면 난다). 문자열을 아는
 * 손 렉서도 정규식 리터럴을 모르면 같은 자리에서 틀린다(`/x\/*` 가 블록 주석의 시작으로, `/a\/\//` 가 줄 주석으로
 * 읽힌다). 문자열 · 정규식 · 템플릿 리터럴 안의 `//`·`/*`까지 가리려면 결국 렉서가 필요하므로 손으로 짜지 않고
 * 실물을 쓴다: 파싱한 뒤 주석을 빼고 다시 찍는다.
 *
 * **원문의 모양을 지킨다** — 파서가 가른 토큰 사이의 주석 구간만 공백으로 바꾸고(줄바꿈은 남긴다) 나머지 글자는
 * 그대로 둔다. 들여쓰기 · 줄 번호 · 위치가 원문과 같아서 줄 모양에 거는 술어(`^ {2}(\w+)` 류)도, 줄 단위로 세는 자도
 * 그대로 선다. 다시 찍는 길(`createPrinter({ removeComments: true })`)은 들여쓰기를 4칸으로 · 여러 줄 인자를 한 줄로
 * 바꿔 그런 술어를 조용히 비게 해서 고르지 않았다.
 *
 * **JSX 텍스트는 주석이 아니다** — `<p>// 이것은 글자다</p>` 의 `//` 는 남는다. 그 토큰 앞은 트리비아가 아니라서
 * 구간을 그 자리에서 찾지 않는다.
 *
 * **`.tsx` 는 이름이 없어도 읽는다** — 두 번째 인자를 안 주면 `.ts` 로 먼저 읽고, 구문 오류면 `.tsx` 로 한 번 더
 * 읽는다. 둘 다 오류여야 던진다. 이름을 주면 그 확장자 하나로만 읽는다. **두 문법이 다 받는데 뜻이 갈리는 글자가
 * 있다** — `const a = <T>b // </T>` 는 `.ts` 로는 단언 + 줄 주석, `.tsx` 로는 JSX 요소다. 이름 없이 주면 `.ts` 쪽
 * 뜻(주석)으로 걷는다. JSX 텍스트를 주석으로 지우는 방향이라 코드가 사라지지는 않는다 — 확실히 하려면 이름을 준다.
 *
 * **구문 오류가 든 소스는 읽지 않고 던진다.** 파서는 오류를 건너뛰며 트리를 복구하는데, 그 복구가 **코드를
 * 지운다** — `@@@ process.exit(1)`은 빈 글자로, `const x = ) process.exit(1)`은 `process, exit`로 찍혀 술어가
 * 못 본다(실측). 그 소스는 `pnpm typecheck`가 따로 막지만, 자를 혼자 돌리면 거짓 초록이다. 판정은 `transpileModule`
 * 의 구문 진단이다 — 타입 오류는 여기서 보지 않는다.
 */
import ts from 'typescript'

export function stripComments(source: string, fileName?: string): string {
  const kinds = fileName === undefined ? [false, true] : [/\.tsx$/i.test(fileName)]
  let broken: ts.Diagnostic | undefined
  for (const jsx of kinds) {
    broken = syntaxError(source, jsx)
    if (broken === undefined) return blankComments(source, jsx)
  }
  throw new Error(
    `구문 오류가 든 소스는 주석을 걷지 않는다${fileName === undefined ? '' : `(${fileName})`}: ${ts.flattenDiagnosticMessageText(broken!.messageText, '\n')}`,
  )
}

function syntaxError(source: string, jsx: boolean): ts.Diagnostic | undefined {
  const [broken] =
    ts.transpileModule(source, {
      fileName: jsx ? 'source.tsx' : 'source.ts',
      reportDiagnostics: true,
      compilerOptions: jsx ? { jsx: ts.JsxEmit.Preserve } : {},
    }).diagnostics ?? []
  return broken
}

/** 토큰마다 그 앞의 트리비아(`node.pos` 부터)에서 주석 구간을 찾아 공백으로 바꾼다. 파일 끝 주석은 `EndOfFileToken` 앞에 있다. */
function blankComments(source: string, jsx: boolean): string {
  const file = ts.createSourceFile(
    jsx ? 'source.tsx' : 'source.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const ranges = new Map<number, number>()
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(file)
    if (children.length > 0) {
      for (const child of children) visit(child)
      return
    }
    if (node.kind === ts.SyntaxKind.JsxText || node.kind === ts.SyntaxKind.JsxTextAllWhiteSpaces) return
    // 같은 줄의 것은 앞 토큰의 trailing, 줄을 넘긴 것은 이 토큰의 leading 으로 나뉘어 나온다 — 둘 다 이 자리의 트리비아다.
    for (const range of [
      ...(ts.getTrailingCommentRanges(source, node.pos) ?? []),
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
    ]) {
      ranges.set(range.pos, range.end)
    }
  }
  visit(file)
  let out = ''
  let cursor = 0
  for (const [pos, end] of [...ranges].sort(([a], [b]) => a - b)) {
    if (pos < cursor) continue
    out += source.slice(cursor, pos) + source.slice(pos, end).replace(/[^\n]/g, ' ')
    cursor = end
  }
  return out + source.slice(cursor)
}
