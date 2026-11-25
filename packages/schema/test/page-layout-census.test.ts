// @vitest-environment node
/**
 * **뿌리 타입을 «팝업인가» 의 판정으로 읽는 자리를 파일마다 센다.** 판 7 에서 판정은 문서의 `layout` 하나다(`new-page.ts` 의 `pageKindOf`) —
 * 뿌리 `Popup` 은 그 짝이고, 짝을 보는 검증(`validate.ts` 의 `layout-root-mismatch`)과 판 6 의 뜻을 읽는 얼린 규칙(`migrate-page-layout.ts`)
 * 만 뿌리 타입을 본다. 다른 자리가 뿌리 타입을 읽으면 «레이아웃은 팝업인데 뿌리는 Page» 인 검증 전 값에서 두 판정이 갈린다.
 *
 * **이 자가 이 축을 소유한다** — 판정 함수를 뿌리 타입으로 되돌리는 변조는 검증이 두 값을 짝으로 묶어 저장된 문서에서는 같은 답을 내므로 대부분의
 * 케이스에서 산다. 그것을 잡는 다른 자리는 검증 전 값을 넣는 `page-layout.test.ts` 의 `pageKindOf` 케이스 하나다.
 *
 * 세는 꼴(TypeScript AST — 주석 · 다른 글자는 안 센다):
 * - `'Popup'` 과 견주는(`===` · `!==` · `==` · `!=`) 식의 다른 쪽 글자에 `root` 가 든다(`doc.root.type` · `root?.type` · `row.root_type`).
 * - 글자(문자열 · 템플릿)에 SQL 의 뿌리 타입 고르기(`->'root'->>'type'`)가 든다.
 *
 * **세지 않는 것:** 노드를 걷는 자리의 `node.type === 'Popup'`(그 노드가 팝업 컴포넌트인가 — 페이지 판정이 아니다) · `db/migrations/`(얼린
 * 코드) · 테스트. 뿌리를 변수로 꺼낸 뒤 `x.type === 'Popup'` 으로 견주는 꼴은 이 자가 못 본다 — 그 꼴을 쓰지 않는다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const TOPS = ['packages', 'apps', 'system-themes']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'migrations'])

/**
 * 파일마다 센 수. 갈래: 짝 검사(`validate.ts`) · 판 6 규칙(`migrate-page-layout.ts`) · 메뉴 트리 응답(`repos/pages.ts` 의 SQL 고르기 ·
 * `services/menu-tree.ts` 의 `kind` — 문서를 통째로 싣지 않는 자리라 뿌리 타입 하나를 고른다).
 */
const ROOT_TYPE_READS: Record<string, number> = {
  'apps/api/src/repos/pages.ts': 1,
  'apps/api/src/services/menu-tree.ts': 1,
  'packages/schema/src/migrate-page-layout.ts': 1,
  'packages/schema/src/validate.ts': 1,
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(path)
    }
  }
  for (const top of TOPS) {
    for (const pkg of readdirSync(join(ROOT, top))) {
      const src = join(ROOT, top, pkg, 'src')
      try {
        if (statSync(src).isDirectory()) walk(src)
      } catch {
        // `src` 가 없는 패키지(설정만 든 것)는 건너뛴다.
      }
    }
  }
  return out
}

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
])
const SQL_ROOT_TYPE = /->\s*'root'\s*->>\s*'type'/

function rootTypeReads(source: string, fileName: string): number {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let count = 0
  const isPopup = (node: ts.Expression): boolean => ts.isStringLiteralLike(node) && node.text === 'Popup'
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && EQUALITY.has(node.operatorToken.kind)) {
      const other = isPopup(node.right) ? node.left : isPopup(node.left) ? node.right : null
      if (other !== null && /root/i.test(other.getText(file))) count += 1
    }
    if (
      (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&
      SQL_ROOT_TYPE.test(node.text)
    ) {
      count += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return count
}

describe('뿌리 타입을 판정으로 읽는 자리', () => {
  it('파일마다 센 수가 표와 같다 — 새 자리는 `pageKindOf` · `pageLayoutOf` 를 읽는다', () => {
    const files = sourceFiles()
    // 카나리아 — 훑기가 소스를 찾았다(경로가 틀리면 빈 목록 · 빈 표로 초록이다).
    expect(files.length).toBeGreaterThan(300)
    const counted: Record<string, number> = {}
    for (const path of files) {
      const reads = rootTypeReads(readFileSync(path, 'utf8'), path)
      if (reads > 0) counted[relative(ROOT, path).split('\\').join('/')] = reads
    }
    expect(counted).toEqual(ROOT_TYPE_READS)
  })

  it('자의 갈래 — 뿌리 견주기 · SQL 고르기는 세고, 노드 견주기 · 주석 · 다른 글은 안 센다', () => {
    const source = [
      "const a = doc.root.type === 'Popup'",
      "const b = 'Popup' !== doc?.root?.type",
      "const c = row.root_type === 'Popup'",
      "const d = sql`select schema->'root'->>'type' as t from pages`",
      "const e = node.type === 'Popup'",
      "// doc.root.type === 'Popup'",
      "const f = 'Popup'",
    ].join('\n')
    expect(rootTypeReads(source, 'probe.ts')).toBe(4)
  })
})
