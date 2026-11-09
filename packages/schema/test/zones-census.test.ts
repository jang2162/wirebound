// @vitest-environment node
/**
 * **`childLists` 를 지나지 않고 `.children` · `.zones` 를 바로 읽는 자리를 파일마다 센다**(설계 spec `2026-10-23-node-slots-design.md`
 * 「구현 나누기」 — 노드를 걷는 자리는 `childLists` 하나를 지난다). 구역을 빠뜨린 손 순회는 구역 안 노드를 못 본다 — 잠금 · 보임 · 이름 · 복사가
 * 그 노드를 지나쳐도 오류가 안 난다. 그래서 그 자리를 글자가 아니라 **AST 로 세고**(TypeScript 파서 — 주석 · 문자열은 안 센다) 아래 표와 견준다.
 *
 * 새 자리가 생기거나 수가 바뀌면 여기서 죽는다. 그때 고르는 길은 둘이다 — 노드를 걷는 자리면 `childLists`(또는 `walkNodes`)를 지나게 고치고,
 * 노드가 아닌 `children`(메뉴 트리 · DOM · React 의 `props.children`)이거나 몸통만 보는 것이 뜻인 자리(«안» 놓기 · 들여쓰기는 몸통 — 설계
 * 「구조 트리」)면 표의 수를 고치고 갈래를 적는다.
 *
 * **세지 않는 것:** `props.children` · `….props.children`(React 의 자식), 구조 분해(`{ children }` — React 컴포넌트의 인자가 대부분이다),
 * `db/migrations/`(한 번 도는 얼린 코드). 구조 분해로 노드의 자식을 꺼내는 손 순회는 이 자가 못 본다 — 그 꼴을 쓰지 않는다.
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
 * 파일마다 바로 읽는 수. 갈래:
 * - **정본**: `zones.ts`(`childLists` 자신) · `tree.ts`(복사 — 두 줄을 함께 짓는다) · `validate.ts`(선언 밖 구역 · 몸통 없는 타입의 `children` 을 고르는 자리) ·
 *   `define.ts` · `catalog/index.ts` · `render.tsx` · `create-node.ts` · `new-page.ts`(카탈로그 정의의 `zones` — 노드가 아니다 · 새 노드를 짓는다) ·
 *   `zone.tsx`(`<Zone>` 이 그 구역 하나를 읽는다) · `preset.ts` · `catalog/index.ts` 의 `assertPresets`(프리셋 템플릿 — id 없는 노드 꼴이고 선언한 구역만 든다).
 * - **얼린 옮기기**: `migrate-document.ts`(판 1 → 2 — 판 1 에는 구역이 없다) · `migrate-tree-items.ts`(판 5 → 6 — 몸통과 구역을 다 걷고, 트리
 *   항목의 `children` 을 짓는다).
 * - **봉투의 뿌리**: `clipboard.ts`(감싼 뿌리의 몸통) · `paste-ops.ts`(문서 뿌리의 몸통 · 넣을 노드의 몸통).
 * - **몸통이 뜻**: `layout-guides.tsx`(몸통의 배치 안내) · `use-placement.ts` · `structure-drop.ts`(«안» = 몸통의 끝) · `structure-actions.ts` ·
 *   `structure-toolbar.tsx`(들여쓰기 = 앞 형제의 몸통) · `palette-add.ts` · `theme-kit/src/check.ts`(쌍 격자의 칸 = 몸통 둘 · 필드 조각의 DOM 직계 하나 ·
 *   팝업의 몸통 노드가 `body` 조각 안인가).
 * - **구역을 따로 본다**: `lock/structure.ts`(`sameStructure` 의 구역 견주기) · `canvas-preview.ts` · `anchored-ops.ts` · `exporter/src/nodes.ts`
 *   (`nodesOnly` — 깨진 줄을 몸통 · 구역마다 거른다) · `page-kind-ops.ts`(팝업 → 화면 — 뿌리의 몸통이 있는가 · 바닥 밖 구역이 남는가).
 * - **노드가 아니다**: 메뉴 트리(`repos/menu.ts` · `menu-tree.ts` · `http-client.ts` · `menu-tree.tsx` · `tree-actions.ts` · `use-tree-commands.tsx` ·
 *   `interaction-panel.tsx` 의 페이지 고르개) · 트리 항목(`catalog/data.ts` 의 `treeShape` · `tree-items-control.tsx` · `theme-sdk` 기본 뷰의 `TreeEntries`) · DOM(`canvas-drop.ts` ·
 *   `canvas-iframe.tsx`) · 뷰 인자(`view-host.tsx` 의 `viewProps.children`).
 */
const DIRECT_READS: Record<string, number> = {
  'apps/api/src/lock/structure.ts': 2,
  'apps/api/src/repos/menu.ts': 1,
  'apps/api/src/services/menu-tree.ts': 1,
  'apps/web/src/api/http-client.ts': 1,
  'apps/web/src/canvas/canvas-drop.ts': 2,
  'apps/web/src/canvas/canvas-iframe.tsx': 1,
  'apps/web/src/canvas/canvas-preview.ts': 4,
  'apps/web/src/canvas/layout-guides.tsx': 4,
  'apps/web/src/drag/use-placement.ts': 2,
  'apps/web/src/edit/create-node.ts': 4,
  'apps/web/src/edit/page-kind-ops.ts': 2,
  'apps/web/src/edit/paste-ops.ts': 3,
  'apps/web/src/edit/structure-actions.ts': 3,
  'apps/web/src/edit/structure-drop.ts': 2,
  'apps/web/src/palette/palette-add.ts': 1,
  'apps/web/src/panels/interaction-panel.tsx': 1,
  'apps/web/src/panels/menu-tree.tsx': 5,
  'apps/web/src/panels/structure-toolbar.tsx': 1,
  'apps/web/src/store/anchored-ops.ts': 1,
  'apps/web/src/tree/tree-actions.ts': 6,
  'apps/web/src/tree/use-tree-commands.tsx': 2,
  'packages/exporter/src/nodes.ts': 6,
  'packages/renderer/src/render.tsx': 1,
  'packages/renderer/src/view-host.tsx': 1,
  'packages/schema/src/clipboard.ts': 2,
  'packages/schema/src/component/catalog/data.ts': 1,
  'packages/schema/src/component/catalog/index.ts': 7,
  'packages/schema/src/component/define.ts': 3,
  'packages/schema/src/component/preset.ts': 6,
  'packages/schema/src/migrate-document.ts': 20,
  'packages/schema/src/migrate-tree-items.ts': 7,
  'packages/schema/src/new-page.ts': 4,
  'packages/schema/src/tree.ts': 12,
  'packages/schema/src/validate.ts': 5,
  'packages/schema/src/zones.ts': 14,
  'packages/theme-kit/src/check.ts': 4,
  'packages/theme-sdk/src/default-views/data.tsx': 1,
  'packages/theme-sdk/src/zone.tsx': 1,
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

/** 그 소스에서 `X.children` · `X.zones` · `X['children']` · `X['zones']` 를 센다 — `X` 가 `props` 로 끝나면 React 의 자식이라 뺀다. */
function directReads(source: string, fileName: string): number {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let count = 0
  const visit = (node: ts.Node): void => {
    const name = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : null
    if ((name === 'children' || name === 'zones') && !/(^|\.)props$/.test((node as ts.PropertyAccessExpression).expression.getText(file)))
      count += 1
    ts.forEachChild(node, visit)
  }
  visit(file)
  return count
}

describe('childLists 를 안 지나는 직접 읽기', () => {
  it('파일마다 센 수가 표와 같다 — 새 자리는 `childLists` 를 지나거나 갈래를 적고 표에 든다', () => {
    const files = sourceFiles()
    // 카나리아 — 훑기가 소스를 찾았다(경로가 틀리면 빈 목록 · 빈 표로 초록이다).
    expect(files.length).toBeGreaterThan(300)
    const counted: Record<string, number> = {}
    for (const path of files) {
      const reads = directReads(readFileSync(path, 'utf8'), path)
      if (reads > 0) counted[relative(ROOT, path).split('\\').join('/')] = reads
    }
    expect(counted).toEqual(DIRECT_READS)
  })

  it('자의 갈래 — 노드 읽기 · 꺾쇠 읽기는 세고, React 의 자식 · 주석 · 문자열은 안 센다', () => {
    const source = [
      'const a = node.children',
      "const b = node['zones']",
      'const c = props.children',
      'const d = view.props.children',
      '// node.children',
      "const e = 'node.zones'",
    ].join('\n')
    expect(directReads(source, 'probe.ts')).toBe(2)
  })
})
