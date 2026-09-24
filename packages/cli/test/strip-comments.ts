/**
 * **소스를 읽는 자가 주석을 걷는 자리 — TypeScript 파서가 걷는다.**
 *
 * 정규식으로 주석을 걷으면 두 쪽으로 틀린다. 줄 끝 `//` 주석을 안 걷으면 주석에 이름을 적기만 해도
 * 자가 빨강이 되고(거짓 빨강), 줄 주석 안의 `/*`를 블록 주석의 시작으로 읽으면 뒤따르는 JSDoc 의 끝까지
 * **코드째** 지워 진짜 위반이 초록으로 지나간다(거짓 초록 — `// 글롭 예: src/*` 한 줄이면 난다).
 * 문자열 · 정규식 · 템플릿 리터럴 안의 `//`·`/*`까지 가리려면 결국 렉서가 필요하므로 손으로 짜지 않고
 * 실물을 쓴다: 파싱한 뒤 주석을 빼고 다시 찍는다.
 *
 * **다시 찍은 글자는 원문과 모양이 다르다** — 들여쓰기 · 공백 · 세미콜론이 정규화된다(`io.fetch ('x')` →
 * `io.fetch('x')`). 따옴표는 원문 그대로다(`setParentNodes`가 원문 리터럴을 찾게 한다). 그래서 이 출력에
 * 거는 술어는 공백을 `\s*`로 받는 꼴이어야 하고, 줄 번호를 세면 안 된다.
 *
 * **못 걷는 것: 파일 맨 앞의 `/*!` 주석 가운데 뒤에 빈 줄이 오는 것.** 프린터가 떨어진 고정 주석으로 보고
 * 남긴다(실측 — 코드가 바로 붙으면 걷히고, 중간의 `/*!`도 걷힌다). 그 안의 글자는 거짓 빨강만 낼 수 있다 —
 * 코드를 지우는 방향이 아니다.
 *
 * **구문 오류가 든 소스는 읽지 않고 던진다.** 파서는 오류를 건너뛰며 트리를 복구하는데, 그 복구가 **코드를
 * 지운다** — `@@@ process.exit(1)`은 빈 글자로, `const x = ) process.exit(1)`은 `process, exit`로 찍혀 술어가
 * 못 본다(실측). 그 소스는 `pnpm typecheck`가 따로 막지만, 자를 혼자 돌리면 거짓 초록이다. 판정은 `transpileModule`
 * 의 구문 진단이다 — 타입 오류는 여기서 보지 않는다.
 */
import ts from 'typescript'

export function stripComments(source: string): string {
  const [broken] = ts.transpileModule(source, { fileName: 'source.ts', reportDiagnostics: true }).diagnostics ?? []
  if (broken !== undefined) {
    throw new Error(`구문 오류가 든 소스는 주석을 걷지 않는다: ${ts.flattenDiagnosticMessageText(broken.messageText, '\n')}`)
  }
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return ts.createPrinter({ removeComments: true }).printFile(file)
}
