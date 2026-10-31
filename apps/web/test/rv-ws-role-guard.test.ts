/**
 * RV-WS 리뷰 항목 2 — `test/role-access.test.ts` 가 프로젝트 목록 때문에 넓힌 예외(«예외 둘째»)의 구분력. 두 케이스 다 지금 초록이다 — 성질은
 * 지켜져 있고, 가드가 못 잡는 꼴을 이 파일이 대신 잡는다(보고 `docs/superpowers/plans/2026-10-31-rv-ws-report.md` «2»).
 *
 * - 넓힌 예외는 **이름**(`item.role` · `q.role` · `DEFAULT_QUERY.role` · `query.role`)으로 걸러, 같은 이름으로 쓴 판정(`project-filter.ts` 의
 *   `item.role === 'owner'` 를 돌려주는 함수 · `project-list.tsx` 에서 `const query = project` 뒤 `query.role`)이 가드를 지난다. 그래서 여기서는
 *   두 파일의 `.role` 읽기를 **줄 글자째** 못박는다 — 새 줄이 생기면 죽는다.
 * - 가드의 정규식(`\.\s*role\b`)은 구조 분해(`const { role } = project`)와 대괄호 읽기를 못 본다. 이 트랙의 몫은 아니지만(기준 `20b398e2` 에서도
 *   같다) 넓힌 두 파일이 그 꼴로 판정을 들여도 가드가 초록이라 함께 센다.
 *
 * **이월(2026-10-31 사내 공용 운영) — R-2a.** 가드(`role-access.test.ts`)를 줄 글자 목록으로 못박는 고침은 이월이다 — 그동안 이 파일이 대신 잡는다.
 */
import { describe, expect, it } from 'vitest'
import { stripComments } from './store-access-guard'

const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function codeLines(path: string): string[] {
  const source = SOURCES[path]
  if (source === undefined) throw new Error(`소스가 없다: ${path}`)
  return stripComments(source)
    .split('\n')
    .map((line) => line.trim())
}

describe('RV-WS 항목 2 — 넓힌 `.role` 예외의 두 파일', () => {
  it('두 파일의 `.role` 읽기는 지금의 네 줄뿐이다(이름이 아니라 줄 글자로 센다)', () => {
    const reads = ['../src/projects/project-filter.ts', '../src/routes/project-list.tsx'].flatMap((path) =>
      codeLines(path)
        .filter((line) => /\.\s*role\b/.test(line))
        .map((line) => `${path}: ${line}`),
    )
    expect(reads).toEqual([
      "../src/projects/project-filter.ts: (q.role === 'all' || item.role === q.role) &&",
      "../src/projects/project-filter.ts: return ROLES.find((role) => role === item.role) ?? ''",
      "../src/projects/project-filter.ts: if (q.role !== DEFAULT_QUERY.role) params.set('role', q.role)",
      '../src/routes/project-list.tsx: value={query.role}',
    ])
  })

  it('구조 분해 · 대괄호로 역할을 읽는 자리는 http 관문의 꼴 검사 하나뿐이다', () => {
    // 카나리아 — 소스를 실제로 읽는다.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
    const found: string[] = []
    for (const path of Object.keys(SOURCES)) {
      for (const line of codeLines(path)) {
        const destructured = /\{[^{}]*\brole\b[^{}]*\}\s*=(?![=>])/.test(line) || /\(\s*\{[^{}]*\brole\b[^{}]*\}\s*:/.test(line)
        const bracket = /\[\s*['"`]role['"`]\s*\]/.test(line)
        if (destructured || bracket) found.push(`${path}: ${line}`)
      }
    }
    expect(found).toEqual(["../src/api/http-client.ts: typeof value['role'] === 'string'"])
  })
})
