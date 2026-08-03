# P0 — 스키마 · 렌더러 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 페이지 스키마 JSON을 넣으면 화면이 그려지고, 편집을 JSON Patch로 적용·역적용할 수 있는 두 패키지(`schema`, `renderer`)를 완성한다.

**Architecture:** pnpm 모노레포에 의존 없는 `schema` 패키지(노드 타입·컴포넌트 카탈로그 계약·검증·패치)와 그 위에 얹히는 `renderer` 패키지(구조별 headless DOM)를 만든다. 정의와 구현을 패키지로 갈라, `schema`는 React를 모르고 `renderer`는 `(타입, 구조)` 키로 그리기 함수를 등록한다. 마지막에 두 패키지를 소비하는 playground 앱으로 눈으로 확인한다.

**Tech Stack:** TypeScript(strict, ESM) · pnpm workspace · zod · React 19 · vitest · fast-check · vite

**설계 문서:** `docs/superpowers/specs/2026-08-03-wirebound-design.md`

## Global Constraints

- Node.js 22 이상, pnpm 10 이상. 패키지 매니저는 pnpm만 쓴다.
- 모든 패키지는 ESM 전용이다 — `package.json`에 `"type": "module"`.
- `moduleResolution: "bundler"`를 쓴다. **상대 import에 확장자를 붙이지 않는다** (`'./node'`, `'../src/tree'`). 워크스페이스 패키지는 소스를 그대로 참조하므로 Node ESM 런타임을 거치지 않는다.
- TypeScript는 `strict: true`. 공개 API 시그니처에 `any`를 쓰지 않는다. 예외는 zod가 제공하는 `z.ZodTypeAny` 별칭 하나뿐이다 — 임의 zod 스키마를 담는 필드에 필요하다.
- **`packages/schema`는 `zod` 외의 런타임 의존을 갖지 않는다.** React·DOM API·Node 전용 API 금지. 브라우저와 Node 양쪽에서 동작해야 한다.
- 패키지 간 순환 의존 금지. 의존 방향은 `schema` ← `renderer` ← `playground` 한 방향뿐이다.
- 공개 API는 named export만 쓴다. `export default` 금지.
- 노드 id 형식은 `n_` + 소문자 hex 12자다. 예: `n_7f3a19c4b2e0`.
- 문서 버전 상수 `CURRENT_DOCUMENT_VERSION`은 1로 시작한다.
- 컴포넌트 카탈로그는 19종 고정이다 (설계 문서 §5).
- 커밋 메시지는 한국어로 쓰고 Conventional Commits 접두어(`feat:` `test:` `chore:` `refactor:`)를 붙인다.
- 각 태스크는 테스트가 통과한 상태로 끝난다. 실패하는 테스트를 남긴 채 다음 태스크로 넘어가지 않는다.

---

## 파일 구조

이 계획이 만드는 파일과 각자의 책임이다.

```
wirebound/
├── package.json                          워크스페이스 루트, 공통 스크립트
├── pnpm-workspace.yaml                   워크스페이스 범위 선언
├── tsconfig.base.json                    공통 컴파일러 옵션
├── vitest.config.ts                      전체 워크스페이스 테스트 설정
├── .gitignore
│
├── packages/schema/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                      공개 API 재export
│   │   ├── node.ts                       WbNode·문서 타입, id 생성
│   │   ├── tree.ts                       순회·탐색·id 리매핑
│   │   ├── component/
│   │   │   ├── define.ts                 ComponentDef 계약, defineComponent
│   │   │   ├── registry.ts               카탈로그 등록·조회
│   │   │   └── catalog/
│   │   │       ├── index.ts              19종 등록 진입점
│   │   │       ├── structure.ts          Page Slot Section Flex Grid Card Tabs
│   │   │       ├── data.ts               List Tree KeyValue
│   │   │       ├── input.ts              SearchForm EntryForm Field
│   │   │       ├── action.ts             Button Link
│   │   │       └── document.ts           Text Media Divider Placeholder
│   │   ├── validate.ts                   문서 검증 → 이슈 목록
│   │   ├── migrate.ts                    버전 마이그레이션 체인
│   │   └── patch/
│   │       ├── types.ts                  Op 타입, PatchError
│   │       ├── pointer.ts                JSON Pointer 파싱·조회
│   │       ├── apply.ts                  패치 적용
│   │       └── inverse.ts                역패치 생성
│   └── test/                             위 모듈과 1:1 대응하는 테스트
│
├── packages/renderer/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                      공개 API 재export
│   │   ├── attrs.ts                      data-wb-* 속성 계약
│   │   ├── structures/
│   │   │   ├── registry.ts               (타입, 구조) → 그리기 함수
│   │   │   ├── index.ts                  기본 구조 19종 등록 진입점
│   │   │   ├── structure.tsx             Page Slot Section Flex Grid Card Tabs
│   │   │   ├── data.tsx                  List Tree KeyValue
│   │   │   ├── input.tsx                 SearchForm EntryForm Field
│   │   │   ├── action.tsx                Button Link
│   │   │   └── document.tsx              Text Media Divider Placeholder
│   │   ├── render.tsx                    노드·문서 렌더링
│   │   └── compose.tsx                   레이아웃 + 페이지 합성
│   └── test/
│
└── apps/playground/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx                      부트스트랩
        ├── sample.ts                     샘플 레이아웃·페이지 문서
        └── debug.css                     구조 확인용 최소 스타일
```

**분리 기준**은 "함께 바뀌는 것끼리 둔다"다. 카탈로그를 그룹별 파일로 나눈 것은 컴포넌트를 추가·수정할 때 한 파일만 열면 되게 하기 위해서고, `renderer`의 구조 파일을 같은 그룹 이름으로 나눈 것은 카탈로그 파일과 짝을 이루게 하기 위해서다.

---

### Task 1: 모노레포 스캐폴드

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/src/index.ts`
- Test: `packages/schema/test/smoke.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `pnpm test`로 전체 패키지 테스트가 실행되는 워크스페이스. `@wirebound/schema` 패키지 이름.

- [ ] **Step 1: 워크스페이스 루트 파일 작성**

`package.json`:
```json
{
  "name": "wirebound",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --build --force"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // .ts 파일에서도 자동 JSX 런타임을 쓴다. renderer 테스트가 .tsx다.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.{ts,tsx}'],
  },
})
```

테스트는 루트 설정 하나로 전체 워크스페이스를 돈다. 패키지마다 vitest 설정을 두지 않는다.

`.gitignore` — 이미 저장소에 있다. 다음 내용인지 확인하고, 없는 항목만 추가한다:
```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
.worktrees/
.env.local
```

- [ ] **Step 2: schema 패키지 뼈대 작성**

`packages/schema/package.json`:
```json
{
  "name": "@wirebound/schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^4.0.0" }
}
```

`packages/schema/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src", "test"]
}
```

`packages/schema/src/index.ts`:
```ts
export const PACKAGE_NAME = '@wirebound/schema'
```

- [ ] **Step 3: 스모크 테스트 작성**

`packages/schema/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from '../src/index'

describe('워크스페이스 설정', () => {
  it('schema 패키지를 import할 수 있다', () => {
    expect(PACKAGE_NAME).toBe('@wirebound/schema')
  })
})
```

- [ ] **Step 4: 설치하고 테스트 실행**

```bash
pnpm install
pnpm test
```
Expected: 1 test passed

- [ ] **Step 5: 타입체크 실행**

```bash
pnpm typecheck
```
Expected: 에러 없이 종료

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "chore: pnpm 모노레포 스캐폴드와 schema 패키지 뼈대 추가"
```

---

### Task 2: 노드 타입과 트리 유틸

**Files:**
- Create: `packages/schema/src/node.ts`
- Create: `packages/schema/src/tree.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/node.test.ts`
- Test: `packages/schema/test/tree.test.ts`

**Interfaces:**
- Consumes: Task 1의 패키지 구조
- Produces:
  - `WbNode` — `{ id: string; type: string; props?: Record<string, unknown>; variant?: string; marker?: number; interactions?: Interaction[]; children?: WbNode[] }`
  - `PageDocument` — `{ version: number; root: WbNode }`
  - `LayoutDocument` — `{ version: number; root: WbNode }`
  - `Interaction` — `{ on: InteractionTrigger; actions: InteractionAction[] }`
  - `createNodeId(): string`
  - `walkNodes(root: WbNode): Iterable<NodeVisit>` — `NodeVisit`은 `{ node: WbNode; path: string; parent: WbNode | null; index: number }`
  - `findNode(root: WbNode, id: string): WbNode | undefined`
  - `findNodePath(root: WbNode, id: string): string | undefined` — JSON Pointer 문자열, 루트는 `/root`
  - `collectNodeIds(root: WbNode): string[]`
  - `remapNodeIds(root: WbNode, generate?: () => string): { root: WbNode; mapping: Record<string, string> }`

- [ ] **Step 1: 노드 타입 테스트 작성**

`packages/schema/test/node.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createNodeId } from '../src/node'

describe('createNodeId', () => {
  it('n_ 접두어와 소문자 hex 12자로 만든다', () => {
    expect(createNodeId()).toMatch(/^n_[0-9a-f]{12}$/)
  })

  it('호출할 때마다 다른 값을 만든다', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createNodeId()))
    expect(ids.size).toBe(500)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/node.test.ts
```
Expected: FAIL — `Cannot find module '../src/node.js'`

- [ ] **Step 3: node.ts 구현**

`packages/schema/src/node.ts`:
```ts
/** 상호작용 트리거. 설계 문서 §8.1 */
export type InteractionTrigger = 'click' | 'change' | 'select' | 'submit'

/** 상호작용 액션. 고정 5종이며 스크립트는 허용하지 않는다. */
export type InteractionAction =
  | { type: 'setProp'; target: string; prop: string; value: unknown }
  | { type: 'setVisible'; target: string; value: boolean }
  | { type: 'switchTab'; target: string; tab: number }
  | { type: 'navigate'; target: string }
  | { type: 'openModal'; target: string }

export interface Interaction {
  on: InteractionTrigger
  actions: InteractionAction[]
}

/**
 * 페이지·레이아웃 스키마의 노드.
 * id는 생성 후 바뀌지 않으며 코멘트·상호작용·잠금·패치 경로의 공통 앵커다.
 */
export interface WbNode {
  id: string
  type: string
  props?: Record<string, unknown>
  variant?: string
  marker?: number
  interactions?: Interaction[]
  children?: WbNode[]
}

export interface PageDocument {
  version: number
  root: WbNode
}

export interface LayoutDocument {
  version: number
  root: WbNode
}

const HEX = '0123456789abcdef'

/** `n_` + 소문자 hex 12자 형식의 노드 id를 만든다. */
export function createNodeId(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  let out = 'n_'
  for (const byte of bytes) {
    out += HEX[byte >> 4] + HEX[byte & 0x0f]
  }
  return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/node.test.ts
```
Expected: 2 passed

- [ ] **Step 5: 트리 유틸 테스트 작성**

`packages/schema/test/tree.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { WbNode } from '../src/node'
import {
  collectNodeIds,
  findNode,
  findNodePath,
  remapNodeIds,
  walkNodes,
} from '../src/tree'

function sample(): WbNode {
  return {
    id: 'n_000000000001',
    type: 'Page',
    children: [
      { id: 'n_000000000002', type: 'SearchForm', children: [
        { id: 'n_000000000003', type: 'Field', props: { label: '아이디' } },
      ] },
      { id: 'n_000000000004', type: 'List', props: { items: 10 } },
    ],
  }
}

describe('walkNodes', () => {
  it('깊이 우선으로 모든 노드를 방문한다', () => {
    const visited = [...walkNodes(sample())].map((v) => v.node.id)
    expect(visited).toEqual([
      'n_000000000001',
      'n_000000000002',
      'n_000000000003',
      'n_000000000004',
    ])
  })

  it('각 방문에 JSON Pointer 경로를 함께 준다', () => {
    const paths = [...walkNodes(sample())].map((v) => v.path)
    expect(paths).toEqual([
      '/root',
      '/root/children/0',
      '/root/children/0/children/0',
      '/root/children/1',
    ])
  })

  it('루트가 아닌 노드는 부모와 인덱스를 준다', () => {
    const visits = [...walkNodes(sample())]
    expect(visits[0]!.parent).toBeNull()
    expect(visits[0]!.index).toBe(-1)
    expect(visits[1]!.parent!.id).toBe('n_000000000001')
    expect(visits[1]!.index).toBe(0)
    expect(visits[3]!.index).toBe(1)
  })
})

describe('findNode / findNodePath', () => {
  it('id로 노드를 찾는다', () => {
    expect(findNode(sample(), 'n_000000000003')!.type).toBe('Field')
  })

  it('없는 id면 undefined를 준다', () => {
    expect(findNode(sample(), 'n_ffffffffffff')).toBeUndefined()
  })

  it('id로 경로를 찾는다', () => {
    expect(findNodePath(sample(), 'n_000000000004')).toBe('/root/children/1')
  })
})

describe('collectNodeIds', () => {
  it('트리의 모든 id를 순서대로 모은다', () => {
    expect(collectNodeIds(sample())).toEqual([
      'n_000000000001',
      'n_000000000002',
      'n_000000000003',
      'n_000000000004',
    ])
  })
})

describe('remapNodeIds', () => {
  it('모든 노드에 새 id를 발급한다', () => {
    let counter = 0
    const { root } = remapNodeIds(sample(), () => `n_new${String(counter++).padStart(9, '0')}`)
    expect(collectNodeIds(root)).toEqual([
      'n_new000000000',
      'n_new000000001',
      'n_new000000002',
      'n_new000000003',
    ])
  })

  it('옛 id에서 새 id로의 매핑을 함께 준다', () => {
    let counter = 0
    const { mapping } = remapNodeIds(sample(), () => `n_new${String(counter++).padStart(9, '0')}`)
    expect(mapping['n_000000000003']).toBe('n_new000000002')
  })

  it('원본 트리를 변경하지 않는다', () => {
    const original = sample()
    remapNodeIds(original, () => 'n_aaaaaaaaaaaa')
    expect(original.id).toBe('n_000000000001')
  })

  it('상호작용 target도 새 id로 바꾼다', () => {
    const tree: WbNode = {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'Button',
          interactions: [
            { on: 'click', actions: [{ type: 'setVisible', target: 'n_000000000003', value: false }] },
          ],
        },
        { id: 'n_000000000003', type: 'List' },
      ],
    }
    let counter = 0
    const { root } = remapNodeIds(tree, () => `n_new${String(counter++).padStart(9, '0')}`)
    const button = root.children![0]!
    const action = button.interactions![0]!.actions[0]!
    expect(action.type === 'setVisible' && action.target).toBe('n_new000000002')
  })

  it('트리 밖을 가리키는 target은 그대로 둔다', () => {
    const tree: WbNode = {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'Button',
          interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] }],
        },
      ],
    }
    const { root } = remapNodeIds(tree, () => 'n_aaaaaaaaaaaa')
    const action = root.children![0]!.interactions![0]!.actions[0]!
    expect(action.type === 'navigate' && action.target).toBe('page:관리자/회원/상세')
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/tree.test.ts
```
Expected: FAIL — `Cannot find module '../src/tree.js'`

- [ ] **Step 7: tree.ts 구현**

`packages/schema/src/tree.ts`:
```ts
import { createNodeId, type WbNode } from './node'

export interface NodeVisit {
  node: WbNode
  /** 문서 루트(`{ version, root }`) 기준 JSON Pointer */
  path: string
  parent: WbNode | null
  /** 부모의 children 안에서의 인덱스. 루트는 -1 */
  index: number
}

/** 깊이 우선 전위 순회로 모든 노드를 방문한다. */
export function* walkNodes(root: WbNode, basePath = '/root'): Generator<NodeVisit> {
  yield { node: root, path: basePath, parent: null, index: -1 }
  yield* walkChildren(root, basePath)
}

function* walkChildren(parent: WbNode, parentPath: string): Generator<NodeVisit> {
  const children = parent.children ?? []
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index]!
    const path = `${parentPath}/children/${index}`
    yield { node, path, parent, index }
    yield* walkChildren(node, path)
  }
}

export function findNode(root: WbNode, id: string): WbNode | undefined {
  for (const visit of walkNodes(root)) {
    if (visit.node.id === id) return visit.node
  }
  return undefined
}

export function findNodePath(root: WbNode, id: string): string | undefined {
  for (const visit of walkNodes(root)) {
    if (visit.node.id === id) return visit.path
  }
  return undefined
}

export function collectNodeIds(root: WbNode): string[] {
  return [...walkNodes(root)].map((visit) => visit.node.id)
}

/**
 * 트리 전체에 새 id를 발급한다. 가져오기·프리셋 적용·패턴 삽입에서 쓴다.
 * 트리 안을 가리키던 상호작용 target도 함께 바꾸고, 트리 밖 참조(`page:...`)는 그대로 둔다.
 */
export function remapNodeIds(
  root: WbNode,
  generate: () => string = createNodeId,
): { root: WbNode; mapping: Record<string, string> } {
  const mapping: Record<string, string> = {}
  for (const id of collectNodeIds(root)) {
    mapping[id] = generate()
  }
  return { root: rewrite(root, mapping), mapping }
}

function rewrite(node: WbNode, mapping: Record<string, string>): WbNode {
  const next: WbNode = { ...node, id: mapping[node.id] ?? node.id }

  if (node.interactions) {
    next.interactions = node.interactions.map((interaction) => ({
      ...interaction,
      actions: interaction.actions.map((action) =>
        'target' in action && mapping[action.target]
          ? { ...action, target: mapping[action.target]! }
          : { ...action },
      ),
    }))
  }

  if (node.children) {
    next.children = node.children.map((child) => rewrite(child, mapping))
  }

  return next
}
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/tree.test.ts
```
Expected: 11 passed

- [ ] **Step 9: 공개 API에 노출**

`packages/schema/src/index.ts` 전체를 다음으로 교체:
```ts
export const PACKAGE_NAME = '@wirebound/schema'

export type {
  Interaction,
  InteractionAction,
  InteractionTrigger,
  LayoutDocument,
  PageDocument,
  WbNode,
} from './node'
export { createNodeId } from './node'

export type { NodeVisit } from './tree'
export { collectNodeIds, findNode, findNodePath, remapNodeIds, walkNodes } from './tree'
```

- [ ] **Step 10: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "feat: 노드 타입과 트리 순회·id 리매핑 유틸 추가"
```

---

### Task 3: 컴포넌트 정의 계약과 레지스트리

**Files:**
- Create: `packages/schema/src/component/define.ts`
- Create: `packages/schema/src/component/registry.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/component/registry.test.ts`

**Interfaces:**
- Consumes: Task 2의 `WbNode`
- Produces:
  - `EditorControl` — `'text' | 'textarea' | 'number' | 'switch' | 'select' | 'stringList' | 'pairList'`
  - `EditorField` — `{ prop: string; control: EditorControl; label: string; options?: string[]; visibleWhen?: { structure: string } }`
  - `ComponentDef` — `{ type; props: z.ZodTypeAny; editor: EditorField[]; structures: string[]; parts: string[]; variants: string[]; states: string[]; children: 'none' | 'many' }`
  - `defineComponent(def: ComponentDef): ComponentDef`
  - `registerComponent(def: ComponentDef): void`
  - `getComponent(type: string): ComponentDef | undefined`
  - `requireComponent(type: string): ComponentDef` — 없으면 throw
  - `listComponents(): ComponentDef[]`
  - `defaultStructure(def: ComponentDef): string` — `structures[0]`
  - `resetRegistry(): void` — 테스트 전용

- [ ] **Step 1: 레지스트리 테스트 작성**

`packages/schema/test/component/registry.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent } from '../../src/component/define'
import {
  defaultStructure,
  getComponent,
  listComponents,
  registerComponent,
  requireComponent,
  resetRegistry,
} from '../../src/component/registry'

const Sample = defineComponent({
  type: 'Sample',
  props: z.object({ label: z.string() }),
  editor: [{ prop: 'label', control: 'text', label: '라벨' }],
  structures: ['plain', 'fancy'],
  parts: ['body'],
  variants: ['default'],
  states: ['disabled'],
  children: 'none',
})

describe('컴포넌트 레지스트리', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('등록한 컴포넌트를 타입으로 찾는다', () => {
    registerComponent(Sample)
    expect(getComponent('Sample')).toBe(Sample)
  })

  it('등록하지 않은 타입은 undefined를 준다', () => {
    expect(getComponent('Unknown')).toBeUndefined()
  })

  it('requireComponent는 없는 타입에 대해 던진다', () => {
    expect(() => requireComponent('Unknown')).toThrow('알 수 없는 컴포넌트 타입: Unknown')
  })

  it('같은 타입을 두 번 등록하면 던진다', () => {
    registerComponent(Sample)
    expect(() => registerComponent(Sample)).toThrow('이미 등록된 컴포넌트 타입: Sample')
  })

  it('등록 순서대로 목록을 준다', () => {
    const Other = defineComponent({ ...Sample, type: 'Other' })
    registerComponent(Sample)
    registerComponent(Other)
    expect(listComponents().map((d) => d.type)).toEqual(['Sample', 'Other'])
  })

  it('첫 번째 구조가 기본 구조다', () => {
    expect(defaultStructure(Sample)).toBe('plain')
  })
})

describe('defineComponent', () => {
  it('구조가 비어 있으면 던진다', () => {
    expect(() =>
      defineComponent({ ...Sample, type: 'Empty', structures: [] }),
    ).toThrow('Empty: structures는 최소 하나여야 합니다')
  })

  it('구조 이름이 중복이면 던진다', () => {
    expect(() =>
      defineComponent({ ...Sample, type: 'Dup', structures: ['a', 'a'] }),
    ).toThrow('Dup: structures에 중복이 있습니다')
  })

  it('editor가 가리키는 prop이 스키마에 없으면 던진다', () => {
    expect(() =>
      defineComponent({
        ...Sample,
        type: 'Bad',
        editor: [{ prop: 'missing', control: 'text', label: '없음' }],
      }),
    ).toThrow('Bad: editor가 스키마에 없는 prop을 가리킵니다: missing')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/component/registry.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: define.ts 구현**

`packages/schema/src/component/define.ts`:
```ts
import { z } from 'zod'

/** 속성 패널이 자동 생성할 입력 컨트롤 종류 */
export type EditorControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'switch'
  | 'select'
  | 'stringList'
  | 'pairList'

export interface EditorField {
  prop: string
  control: EditorControl
  label: string
  /** control이 'select'일 때 선택지 */
  options?: string[]
  /** 특정 구조에서만 보이는 속성 (예: 컬럼은 table 구조에서만 의미가 있다) */
  visibleWhen?: { structure: string }
}

/**
 * 컴포넌트의 계약. 여기 선언된 것이 테마가 쓸 수 있는 어휘 전부다.
 * 실제 DOM을 그리는 함수는 renderer 패키지가 (타입, 구조) 키로 등록한다.
 */
export interface ComponentDef {
  type: string
  props: z.ZodTypeAny
  editor: EditorField[]
  /** 첫 번째가 기본 구조 */
  structures: string[]
  parts: string[]
  variants: string[]
  /** 같은 이름의 prop이 true면 활성화되는 상태 */
  states: string[]
  children: 'none' | 'many'
}

/** 계약의 자체 정합성을 확인하고 그대로 돌려준다. */
export function defineComponent(def: ComponentDef): ComponentDef {
  const { type } = def

  if (def.structures.length === 0) {
    throw new Error(`${type}: structures는 최소 하나여야 합니다`)
  }
  assertUnique(type, 'structures', def.structures)
  assertUnique(type, 'parts', def.parts)
  assertUnique(type, 'variants', def.variants)
  assertUnique(type, 'states', def.states)

  const known = propKeys(def.props)
  for (const field of def.editor) {
    if (!known.has(field.prop)) {
      throw new Error(`${type}: editor가 스키마에 없는 prop을 가리킵니다: ${field.prop}`)
    }
    if (field.visibleWhen && !def.structures.includes(field.visibleWhen.structure)) {
      throw new Error(
        `${type}: editor의 visibleWhen이 없는 구조를 가리킵니다: ${field.visibleWhen.structure}`,
      )
    }
  }

  for (const state of def.states) {
    if (!known.has(state)) {
      throw new Error(`${type}: states와 같은 이름의 prop이 없습니다: ${state}`)
    }
  }

  return def
}

function assertUnique(type: string, field: string, values: string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${type}: ${field}에 중복이 있습니다`)
  }
}

/** zod 객체 스키마에서 최상위 prop 이름을 뽑는다. */
function propKeys(schema: z.ZodTypeAny): Set<string> {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape
  return new Set(shape ? Object.keys(shape) : [])
}
```

- [ ] **Step 4: registry.ts 구현**

`packages/schema/src/component/registry.ts`:
```ts
import type { ComponentDef } from './define'

const registry = new Map<string, ComponentDef>()

export function registerComponent(def: ComponentDef): void {
  if (registry.has(def.type)) {
    throw new Error(`이미 등록된 컴포넌트 타입: ${def.type}`)
  }
  registry.set(def.type, def)
}

export function getComponent(type: string): ComponentDef | undefined {
  return registry.get(type)
}

export function requireComponent(type: string): ComponentDef {
  const def = registry.get(type)
  if (!def) throw new Error(`알 수 없는 컴포넌트 타입: ${type}`)
  return def
}

export function listComponents(): ComponentDef[] {
  return [...registry.values()]
}

export function defaultStructure(def: ComponentDef): string {
  return def.structures[0]!
}

/** 테스트 전용. 프로덕션 코드에서 호출하지 않는다. */
export function resetRegistry(): void {
  registry.clear()
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/component/registry.test.ts
```
Expected: 9 passed

- [ ] **Step 6: 공개 API에 노출**

`packages/schema/src/index.ts` 끝에 추가:
```ts
export type { ComponentDef, EditorControl, EditorField } from './component/define'
export { defineComponent } from './component/define'
export {
  defaultStructure,
  getComponent,
  listComponents,
  registerComponent,
  requireComponent,
  resetRegistry,
} from './component/registry'
```

- [ ] **Step 7: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 컴포넌트 정의 계약과 레지스트리 추가"
```

---

### Task 4: 컴포넌트 카탈로그 19종

**Files:**
- Create: `packages/schema/src/component/catalog/structure.ts`
- Create: `packages/schema/src/component/catalog/data.ts`
- Create: `packages/schema/src/component/catalog/input.ts`
- Create: `packages/schema/src/component/catalog/action.ts`
- Create: `packages/schema/src/component/catalog/document.ts`
- Create: `packages/schema/src/component/catalog/index.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/component/catalog.test.ts`

**Interfaces:**
- Consumes: Task 3의 `defineComponent`, `registerComponent`, `listComponents`
- Produces:
  - `installCatalog(): void` — 19종을 레지스트리에 등록. 이미 설치돼 있으면 아무것도 하지 않는다.
  - `CATALOG_TYPES: readonly string[]` — 19개 타입 이름
  - 각 컴포넌트 정의 상수: `PageDef`, `SlotDef`, `SectionDef`, `FlexDef`, `GridDef`, `CardDef`, `TabsDef`, `ListDef`, `TreeDef`, `KeyValueDef`, `SearchFormDef`, `EntryFormDef`, `FieldDef`, `ButtonDef`, `LinkDef`, `TextDef`, `MediaDef`, `DividerDef`, `PlaceholderDef`

- [ ] **Step 1: 카탈로그 테스트 작성**

`packages/schema/test/component/catalog.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../../src/component/catalog/index'
import { getComponent, listComponents, resetRegistry } from '../../src/component/registry'

describe('컴포넌트 카탈로그', () => {
  beforeEach(() => {
    resetRegistry()
    installCatalog()
  })

  it('19종을 등록한다', () => {
    expect(listComponents()).toHaveLength(19)
  })

  it('CATALOG_TYPES와 등록 결과가 일치한다', () => {
    expect(listComponents().map((d) => d.type).sort()).toEqual([...CATALOG_TYPES].sort())
  })

  it('두 번 설치해도 중복 등록하지 않는다', () => {
    installCatalog()
    expect(listComponents()).toHaveLength(19)
  })

  it('모든 컴포넌트가 구조를 최소 하나 갖는다', () => {
    for (const def of listComponents()) {
      expect(def.structures.length, def.type).toBeGreaterThan(0)
    }
  })

  it('설계 문서에 적힌 구조 목록을 갖는다', () => {
    expect(getComponent('List')!.structures).toEqual([
      'table', 'cardGrid', 'stackedList', 'mediaList',
    ])
    expect(getComponent('Card')!.structures).toEqual([
      'plain', 'bordered', 'elevated', 'mediaTop', 'horizontal',
    ])
    expect(getComponent('Tabs')!.structures).toEqual([
      'underline', 'pill', 'enclosed', 'vertical',
    ])
    expect(getComponent('Field')!.structures).toEqual(['outlined', 'filled', 'underlined'])
    expect(getComponent('Section')!.structures).toEqual(['contained', 'fullBleed', 'splitBg'])
  })

  it('자식을 담는 컴포넌트만 children이 many다', () => {
    const containers = listComponents()
      .filter((d) => d.children === 'many')
      .map((d) => d.type)
      .sort()
    expect(containers).toEqual([
      'Card', 'EntryForm', 'Flex', 'Grid', 'Page', 'SearchForm', 'Section', 'Tabs',
    ])
  })

  it('Slot은 자식을 담지 않는다', () => {
    expect(getComponent('Slot')!.children).toBe('none')
  })

  it('props 스키마가 기본값을 채워 준다', () => {
    const parsed = getComponent('List')!.props.parse({})
    expect(parsed).toMatchObject({ items: 5, pagination: true, selectable: false })
  })

  it('알 수 없는 prop은 거부한다', () => {
    expect(() => getComponent('Button')!.props.parse({ label: '저장', bogus: 1 })).toThrow()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/component/catalog.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구조 그룹 정의**

`packages/schema/src/component/catalog/structure.ts`:
```ts
import { z } from 'zod'
import { defineComponent } from '../define'

export const PageDef = defineComponent({
  type: 'Page',
  props: z.strictObject({}),
  editor: [],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'many',
})

export const SlotDef = defineComponent({
  type: 'Slot',
  props: z.strictObject({}),
  editor: [],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none',
})

export const SectionDef = defineComponent({
  type: 'Section',
  props: z.strictObject({
    compact: z.boolean().default(false),
  }),
  editor: [{ prop: 'compact', control: 'switch', label: '좁은 여백' }],
  structures: ['contained', 'fullBleed', 'splitBg'],
  parts: ['inner'],
  variants: ['default', 'hero', 'muted'],
  states: [],
  children: 'many',
})

export const FlexDef = defineComponent({
  type: 'Flex',
  props: z.strictObject({
    direction: z.enum(['row', 'column']).default('row'),
    align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
    justify: z.enum(['start', 'center', 'end', 'between']).default('start'),
    wrap: z.boolean().default(false),
  }),
  editor: [
    { prop: 'direction', control: 'select', label: '방향', options: ['row', 'column'] },
    { prop: 'align', control: 'select', label: '교차축 정렬', options: ['start', 'center', 'end', 'stretch'] },
    { prop: 'justify', control: 'select', label: '주축 정렬', options: ['start', 'center', 'end', 'between'] },
    { prop: 'wrap', control: 'switch', label: '줄바꿈' },
  ],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'many',
})

export const GridDef = defineComponent({
  type: 'Grid',
  props: z.strictObject({
    columns: z.number().int().min(1).max(12).default(2),
  }),
  editor: [{ prop: 'columns', control: 'number', label: '열 수' }],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'many',
})

export const CardDef = defineComponent({
  type: 'Card',
  props: z.strictObject({
    title: z.string().default(''),
    subtitle: z.string().default(''),
  }),
  editor: [
    { prop: 'title', control: 'text', label: '제목' },
    { prop: 'subtitle', control: 'text', label: '부제' },
  ],
  structures: ['plain', 'bordered', 'elevated', 'mediaTop', 'horizontal'],
  parts: ['header', 'title', 'subtitle', 'body'],
  variants: ['default', 'featured'],
  states: [],
  children: 'many',
})

export const TabsDef = defineComponent({
  type: 'Tabs',
  props: z.strictObject({
    tabs: z.array(z.string()).default(['탭 1', '탭 2']),
    active: z.number().int().min(0).default(0),
  }),
  editor: [
    { prop: 'tabs', control: 'stringList', label: '탭 목록' },
    { prop: 'active', control: 'number', label: '활성 탭' },
  ],
  structures: ['underline', 'pill', 'enclosed', 'vertical'],
  parts: ['list', 'tab', 'panel'],
  variants: [],
  states: [],
  children: 'many',
})
```

- [ ] **Step 4: 데이터 그룹 정의**

`packages/schema/src/component/catalog/data.ts`:
```ts
import { z } from 'zod'
import { defineComponent } from '../define'

export const ListDef = defineComponent({
  type: 'List',
  props: z.strictObject({
    items: z.number().int().min(0).max(50).default(5),
    columns: z.array(z.string()).default(['컬럼 1', '컬럼 2']),
    pagination: z.boolean().default(true),
    selectable: z.boolean().default(false),
    selected: z.boolean().default(false),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
    empty: z.boolean().default(false),
  }),
  editor: [
    { prop: 'items', control: 'number', label: '항목 수' },
    { prop: 'columns', control: 'stringList', label: '컬럼', visibleWhen: { structure: 'table' } },
    { prop: 'pagination', control: 'switch', label: '페이지네이션' },
    { prop: 'selectable', control: 'switch', label: '선택 가능' },
    { prop: 'loading', control: 'switch', label: '로딩 상태' },
    { prop: 'empty', control: 'switch', label: '빈 상태' },
  ],
  structures: ['table', 'cardGrid', 'stackedList', 'mediaList'],
  parts: ['header', 'row', 'rowAlt', 'cell', 'item', 'media', 'title', 'meta', 'pagination'],
  variants: ['default', 'featured', 'compact'],
  states: ['selected', 'disabled', 'loading', 'empty'],
  children: 'none',
})

export const TreeDef = defineComponent({
  type: 'Tree',
  props: z.strictObject({
    items: z.array(z.string()).default(['항목 1', '항목 2']),
    depth: z.number().int().min(1).max(5).default(2),
    selected: z.boolean().default(false),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'items', control: 'stringList', label: '항목' },
    { prop: 'depth', control: 'number', label: '깊이' },
  ],
  structures: ['indent', 'accordion'],
  parts: ['node', 'label', 'toggle'],
  variants: [],
  states: ['selected', 'disabled'],
  children: 'none',
})

export const KeyValueDef = defineComponent({
  type: 'KeyValue',
  props: z.strictObject({
    pairs: z
      .array(z.strictObject({ key: z.string(), value: z.string() }))
      .default([{ key: '항목', value: '값' }]),
    columns: z.number().int().min(1).max(4).default(1),
  }),
  editor: [
    { prop: 'pairs', control: 'pairList', label: '키-값' },
    { prop: 'columns', control: 'number', label: '열 수' },
  ],
  structures: ['table', 'definitionList', 'cardGrid'],
  parts: ['row', 'key', 'value'],
  variants: [],
  states: [],
  children: 'none',
})
```

- [ ] **Step 5: 입력·액션·문서 그룹 정의**

`packages/schema/src/component/catalog/input.ts`:
```ts
import { z } from 'zod'
import { defineComponent } from '../define'

export const SearchFormDef = defineComponent({
  type: 'SearchForm',
  props: z.strictObject({
    collapsed: z.boolean().default(false),
  }),
  editor: [{ prop: 'collapsed', control: 'switch', label: '접힌 상태' }],
  structures: ['inline', 'stacked', 'collapsible'],
  parts: ['fields', 'actions'],
  variants: [],
  states: [],
  children: 'many',
})

export const EntryFormDef = defineComponent({
  type: 'EntryForm',
  props: z.strictObject({
    title: z.string().default(''),
  }),
  editor: [{ prop: 'title', control: 'text', label: '제목' }],
  structures: ['labelLeft', 'labelTop', 'sectioned'],
  parts: ['row', 'label', 'control', 'actions'],
  variants: [],
  states: [],
  children: 'many',
})

export const FieldDef = defineComponent({
  type: 'Field',
  props: z.strictObject({
    label: z.string().default('라벨'),
    control: z
      .enum(['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'])
      .default('text'),
    placeholder: z.string().default(''),
    required: z.boolean().default(false),
    disabled: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    {
      prop: 'control',
      control: 'select',
      label: '입력 종류',
      options: ['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'],
    },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'required', control: 'switch', label: '필수' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  structures: ['outlined', 'filled', 'underlined'],
  parts: ['label', 'control', 'help'],
  variants: [],
  states: ['required', 'disabled', 'invalid'],
  children: 'none',
})
```

`packages/schema/src/component/catalog/action.ts`:
```ts
import { z } from 'zod'
import { defineComponent } from '../define'

export const ButtonDef = defineComponent({
  type: 'Button',
  props: z.strictObject({
    label: z.string().default('버튼'),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'loading', control: 'switch', label: '로딩' },
  ],
  structures: ['solid', 'outline', 'text'],
  parts: ['label'],
  variants: ['primary', 'secondary', 'danger', 'ghost'],
  states: ['disabled', 'loading'],
  children: 'none',
})

export const LinkDef = defineComponent({
  type: 'Link',
  props: z.strictObject({
    label: z.string().default('링크'),
    target: z.string().default(''),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'target', control: 'text', label: '이동 대상' },
  ],
  structures: ['default'],
  parts: [],
  variants: ['default', 'muted'],
  states: ['disabled'],
  children: 'none',
})
```

`packages/schema/src/component/catalog/document.ts`:
```ts
import { z } from 'zod'
import { defineComponent } from '../define'

export const TextDef = defineComponent({
  type: 'Text',
  props: z.strictObject({
    content: z.string().default('텍스트'),
    role: z
      .enum(['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'])
      .default('body'),
  }),
  editor: [
    { prop: 'content', control: 'textarea', label: '내용' },
    {
      prop: 'role',
      control: 'select',
      label: '역할',
      options: ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'],
    },
  ],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none',
})

export const MediaDef = defineComponent({
  type: 'Media',
  props: z.strictObject({
    kind: z.enum(['image', 'video', 'illustration', 'chart']).default('image'),
    caption: z.string().default(''),
    ratio: z.enum(['16/9', '4/3', '1/1', '3/4']).default('16/9'),
  }),
  editor: [
    { prop: 'kind', control: 'select', label: '종류', options: ['image', 'video', 'illustration', 'chart'] },
    { prop: 'ratio', control: 'select', label: '비율', options: ['16/9', '4/3', '1/1', '3/4'] },
    { prop: 'caption', control: 'text', label: '설명' },
  ],
  structures: ['image', 'video', 'illustration', 'chart'],
  parts: ['frame', 'caption'],
  variants: [],
  states: [],
  children: 'none',
})

export const DividerDef = defineComponent({
  type: 'Divider',
  props: z.strictObject({
    direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  }),
  editor: [
    { prop: 'direction', control: 'select', label: '방향', options: ['horizontal', 'vertical'] },
  ],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none',
})

export const PlaceholderDef = defineComponent({
  type: 'Placeholder',
  props: z.strictObject({
    label: z.string().default('미정 영역'),
    height: z.number().int().min(20).max(1000).default(120),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'height', control: 'number', label: '높이(px)' },
  ],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none',
})
```

- [ ] **Step 6: 카탈로그 설치 진입점 작성**

`packages/schema/src/component/catalog/index.ts`:
```ts
import type { ComponentDef } from '../define'
import { getComponent, registerComponent } from '../registry'
import { ButtonDef, LinkDef } from './action'
import { KeyValueDef, ListDef, TreeDef } from './data'
import { DividerDef, MediaDef, PlaceholderDef, TextDef } from './document'
import { EntryFormDef, FieldDef, SearchFormDef } from './input'
import {
  CardDef, FlexDef, GridDef, PageDef, SectionDef, SlotDef, TabsDef,
} from './structure'

export * from './action'
export * from './data'
export * from './document'
export * from './input'
export * from './structure'

const ALL: ComponentDef[] = [
  PageDef, SlotDef, SectionDef, FlexDef, GridDef, CardDef, TabsDef,
  ListDef, TreeDef, KeyValueDef,
  SearchFormDef, EntryFormDef, FieldDef,
  ButtonDef, LinkDef,
  TextDef, MediaDef, DividerDef, PlaceholderDef,
]

export const CATALOG_TYPES: readonly string[] = ALL.map((def) => def.type)

/** 카탈로그를 레지스트리에 설치한다. 이미 설치돼 있으면 아무것도 하지 않는다. */
export function installCatalog(): void {
  for (const def of ALL) {
    if (!getComponent(def.type)) registerComponent(def)
  }
}
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/component/catalog.test.ts
```
Expected: 10 passed

- [ ] **Step 8: 공개 API에 노출**

`packages/schema/src/index.ts` 끝에 추가:
```ts
export { CATALOG_TYPES, installCatalog } from './component/catalog/index'
export * from './component/catalog/index'
```

- [ ] **Step 9: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: 컴포넌트 카탈로그 19종 정의"
```

---

### Task 5: 문서 검증

**Files:**
- Create: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/validate.test.ts`

**Interfaces:**
- Consumes: Task 2의 `walkNodes`·`PageDocument`, Task 3의 `getComponent`, Task 4의 `installCatalog`
- Produces:
  - `ValidationIssue` — `{ code: ValidationCode; nodeId: string | null; path: string; message: string }`
  - `ValidationCode` — `'unknown-type' | 'invalid-props' | 'children-not-allowed' | 'unknown-variant' | 'duplicate-id' | 'bad-root' | 'slot-count'`
  - `validatePage(doc: PageDocument): ValidationIssue[]`
  - `validateLayout(doc: LayoutDocument): ValidationIssue[]`
  - `assertValidPage(doc: PageDocument): void` — 이슈가 있으면 throw

- [ ] **Step 1: 검증 테스트 작성**

`packages/schema/test/validate.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { LayoutDocument, PageDocument } from '../src/node'
import { assertValidPage, validateLayout, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

function page(root: PageDocument['root']): PageDocument {
  return { version: 1, root }
}

describe('validatePage', () => {
  it('올바른 문서는 이슈가 없다', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'List', props: { items: 3 } }],
    })
    expect(validatePage(doc)).toEqual([])
  })

  it('루트가 Page가 아니면 bad-root', () => {
    const doc = page({ id: 'n_000000000001', type: 'Flex' })
    expect(validatePage(doc)[0]).toMatchObject({ code: 'bad-root', path: '/root' })
  })

  it('알 수 없는 타입은 unknown-type', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Nope' }],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'unknown-type', nodeId: 'n_000000000002' }),
    )
  })

  it('props가 스키마에 맞지 않으면 invalid-props', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'List', props: { items: -1 } }],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-props', nodeId: 'n_000000000002' }),
    )
  })

  it('자식을 담지 못하는 컴포넌트에 자식이 있으면 children-not-allowed', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'List',
          children: [{ id: 'n_000000000003', type: 'Text' }],
        },
      ],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'children-not-allowed', nodeId: 'n_000000000002' }),
    )
  })

  it('정의되지 않은 variant는 unknown-variant', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Button', variant: 'rainbow' }],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'unknown-variant', nodeId: 'n_000000000002' }),
    )
  })

  it('id가 중복되면 duplicate-id', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Text' },
        { id: 'n_000000000002', type: 'Text' },
      ],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'duplicate-id', nodeId: 'n_000000000002' }),
    )
  })

  it('페이지에 Slot이 있으면 slot-count', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Slot' }],
    })
    expect(validatePage(doc)).toContainEqual(expect.objectContaining({ code: 'slot-count' }))
  })
})

describe('validateLayout', () => {
  function layout(root: LayoutDocument['root']): LayoutDocument {
    return { version: 1, root }
  }

  it('Slot이 정확히 하나면 통과한다', () => {
    const doc = layout({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Slot' }],
    })
    expect(validateLayout(doc)).toEqual([])
  })

  it('Slot이 없으면 slot-count', () => {
    const doc = layout({ id: 'n_000000000001', type: 'Page' })
    expect(validateLayout(doc)).toContainEqual(expect.objectContaining({ code: 'slot-count' }))
  })

  it('Slot이 둘이면 slot-count', () => {
    const doc = layout({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Slot' },
        { id: 'n_000000000003', type: 'Slot' },
      ],
    })
    expect(validateLayout(doc)).toContainEqual(expect.objectContaining({ code: 'slot-count' }))
  })
})

describe('assertValidPage', () => {
  it('이슈가 있으면 첫 이슈 메시지로 던진다', () => {
    const doc = page({ id: 'n_000000000001', type: 'Flex' })
    expect(() => assertValidPage(doc)).toThrow(/bad-root/)
  })

  it('올바른 문서면 던지지 않는다', () => {
    const doc = page({ id: 'n_000000000001', type: 'Page' })
    expect(() => assertValidPage(doc)).not.toThrow()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/validate.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: validate.ts 구현**

`packages/schema/src/validate.ts`:
```ts
import { getComponent } from './component/registry'
import type { LayoutDocument, PageDocument, WbNode } from './node'
import { walkNodes } from './tree'

export type ValidationCode =
  | 'unknown-type'
  | 'invalid-props'
  | 'children-not-allowed'
  | 'unknown-variant'
  | 'duplicate-id'
  | 'bad-root'
  | 'slot-count'

export interface ValidationIssue {
  code: ValidationCode
  nodeId: string | null
  path: string
  message: string
}

export function validatePage(doc: PageDocument): ValidationIssue[] {
  const issues = validateTree(doc.root)
  const slots = countSlots(doc.root)
  if (slots > 0) {
    issues.push({
      code: 'slot-count',
      nodeId: null,
      path: '/root',
      message: `페이지에는 Slot을 둘 수 없습니다 (${slots}개 발견)`,
    })
  }
  return issues
}

export function validateLayout(doc: LayoutDocument): ValidationIssue[] {
  const issues = validateTree(doc.root)
  const slots = countSlots(doc.root)
  if (slots !== 1) {
    issues.push({
      code: 'slot-count',
      nodeId: null,
      path: '/root',
      message: `레이아웃에는 Slot이 정확히 하나여야 합니다 (${slots}개 발견)`,
    })
  }
  return issues
}

export function assertValidPage(doc: PageDocument): void {
  const issues = validatePage(doc)
  const first = issues[0]
  if (first) {
    throw new Error(`문서 검증 실패 [${first.code}] ${first.path}: ${first.message}`)
  }
}

function validateTree(root: WbNode): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  if (root.type !== 'Page') {
    issues.push({
      code: 'bad-root',
      nodeId: root.id,
      path: '/root',
      message: `루트는 Page여야 합니다 (현재: ${root.type})`,
    })
  }

  for (const { node, path } of walkNodes(root)) {
    if (seen.has(node.id)) {
      issues.push({
        code: 'duplicate-id',
        nodeId: node.id,
        path,
        message: `id가 중복됩니다: ${node.id}`,
      })
    }
    seen.add(node.id)

    const def = getComponent(node.type)
    if (!def) {
      issues.push({
        code: 'unknown-type',
        nodeId: node.id,
        path,
        message: `알 수 없는 컴포넌트 타입: ${node.type}`,
      })
      continue
    }

    const parsed = def.props.safeParse(node.props ?? {})
    if (!parsed.success) {
      issues.push({
        code: 'invalid-props',
        nodeId: node.id,
        path: `${path}/props`,
        message: `${node.type}의 props가 올바르지 않습니다: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join(', ')}`,
      })
    }

    if (def.children === 'none' && (node.children?.length ?? 0) > 0) {
      issues.push({
        code: 'children-not-allowed',
        nodeId: node.id,
        path: `${path}/children`,
        message: `${node.type}은 자식을 담을 수 없습니다`,
      })
    }

    if (node.variant !== undefined && !def.variants.includes(node.variant)) {
      issues.push({
        code: 'unknown-variant',
        nodeId: node.id,
        path: `${path}/variant`,
        message: `${node.type}에 정의되지 않은 variant입니다: ${node.variant}`,
      })
    }
  }

  return issues
}

function countSlots(root: WbNode): number {
  let count = 0
  for (const { node } of walkNodes(root)) {
    if (node.type === 'Slot') count += 1
  }
  return count
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/validate.test.ts
```
Expected: 13 passed

- [ ] **Step 5: 공개 API에 노출**

`packages/schema/src/index.ts` 끝에 추가:
```ts
export type { ValidationCode, ValidationIssue } from './validate'
export { assertValidPage, validateLayout, validatePage } from './validate'
```

- [ ] **Step 6: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 페이지·레이아웃 문서 검증 추가"
```

---

### Task 6: JSON Pointer와 패치 적용

**Files:**
- Create: `packages/schema/src/patch/types.ts`
- Create: `packages/schema/src/patch/pointer.ts`
- Create: `packages/schema/src/patch/apply.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/patch/pointer.test.ts`
- Test: `packages/schema/test/patch/apply.test.ts`

**Interfaces:**
- Consumes: 없음 (문서 구조에 독립적인 순수 유틸)
- Produces:
  - `PatchOp` — `{ op: 'add'; path: string; value: unknown } | { op: 'remove'; path: string } | { op: 'replace'; path: string; value: unknown } | { op: 'move'; from: string; path: string }`
  - `PatchError` — `Error` 하위 클래스, `path: string` 필드 보유
  - `parsePointer(pointer: string): string[]`
  - `formatPointer(tokens: string[]): string`
  - `getByPointer(doc: unknown, pointer: string): unknown`
  - `applyOp<T>(doc: T, op: PatchOp): T` — 새 객체를 돌려주고 입력을 변경하지 않는다
  - `applyOps<T>(doc: T, ops: PatchOp[]): T`

- [ ] **Step 1: 포인터 테스트 작성**

`packages/schema/test/patch/pointer.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatPointer, getByPointer, parsePointer } from '../../src/patch/pointer'

describe('parsePointer', () => {
  it('빈 문자열은 빈 배열이다', () => {
    expect(parsePointer('')).toEqual([])
  })

  it('슬래시로 토큰을 나눈다', () => {
    expect(parsePointer('/root/children/0')).toEqual(['root', 'children', '0'])
  })

  it('~1은 슬래시로, ~0은 물결로 되돌린다', () => {
    expect(parsePointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d'])
  })

  it('슬래시로 시작하지 않으면 던진다', () => {
    expect(() => parsePointer('root')).toThrow('잘못된 JSON Pointer: root')
  })
})

describe('formatPointer', () => {
  it('빈 배열은 빈 문자열이다', () => {
    expect(formatPointer([])).toBe('')
  })

  it('토큰을 슬래시로 잇는다', () => {
    expect(formatPointer(['root', 'children', '0'])).toBe('/root/children/0')
  })

  it('슬래시와 물결을 이스케이프한다', () => {
    expect(formatPointer(['a/b', 'c~d'])).toBe('/a~1b/c~0d')
  })

  it('parsePointer와 왕복한다', () => {
    const pointer = '/root/children/0/props/a~1b'
    expect(formatPointer(parsePointer(pointer))).toBe(pointer)
  })
})

describe('getByPointer', () => {
  const doc = { root: { children: [{ id: 'a' }, { id: 'b' }] } }

  it('중첩 값을 읽는다', () => {
    expect(getByPointer(doc, '/root/children/1/id')).toBe('b')
  })

  it('빈 포인터는 문서 전체다', () => {
    expect(getByPointer(doc, '')).toBe(doc)
  })

  it('없는 경로는 undefined다', () => {
    expect(getByPointer(doc, '/root/children/9/id')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/patch/pointer.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: types.ts와 pointer.ts 구현**

`packages/schema/src/patch/types.ts`:
```ts
/** RFC 6902의 부분집합. wirebound는 이 네 연산만 쓴다. */
export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }

export class PatchError extends Error {
  readonly path: string

  constructor(message: string, path: string) {
    super(message)
    this.name = 'PatchError'
    this.path = path
  }
}
```

`packages/schema/src/patch/pointer.ts`:
```ts
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new Error(`잘못된 JSON Pointer: ${pointer}`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
}

export function formatPointer(tokens: string[]): string {
  if (tokens.length === 0) return ''
  return `/${tokens
    .map((token) => String(token).replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/')}`
}

export function getByPointer(doc: unknown, pointer: string): unknown {
  let current: unknown = doc
  for (const token of parsePointer(pointer)) {
    if (current === null || current === undefined) return undefined
    current = Array.isArray(current)
      ? current[Number(token)]
      : (current as Record<string, unknown>)[token]
  }
  return current
}
```

- [ ] **Step 4: 포인터 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/patch/pointer.test.ts
```
Expected: 11 passed

- [ ] **Step 5: 패치 적용 테스트 작성**

`packages/schema/test/patch/apply.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyOp, applyOps } from '../../src/patch/apply'
import { PatchError } from '../../src/patch/types'

function doc() {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Text', props: { content: '가' } },
        { id: 'n_000000000003', type: 'Text', props: { content: '나' } },
      ],
    },
  }
}

describe('applyOp — replace', () => {
  it('객체 값을 바꾼다', () => {
    const next = applyOp(doc(), {
      op: 'replace',
      path: '/root/children/0/props/content',
      value: '다',
    })
    expect(next.root.children[0]!.props.content).toBe('다')
  })

  it('입력을 변경하지 않는다', () => {
    const original = doc()
    applyOp(original, { op: 'replace', path: '/root/children/0/props/content', value: '다' })
    expect(original.root.children[0]!.props.content).toBe('가')
  })

  it('없는 키를 바꾸려 하면 던진다', () => {
    expect(() =>
      applyOp(doc(), { op: 'replace', path: '/root/children/0/props/missing', value: 1 }),
    ).toThrow(PatchError)
  })
})

describe('applyOp — add', () => {
  it('배열 인덱스에 삽입한다', () => {
    const next = applyOp(doc(), {
      op: 'add',
      path: '/root/children/1',
      value: { id: 'n_000000000004', type: 'Divider' },
    })
    expect(next.root.children.map((c) => c.id)).toEqual([
      'n_000000000002',
      'n_000000000004',
      'n_000000000003',
    ])
  })

  it('- 는 배열 끝에 덧붙인다', () => {
    const next = applyOp(doc(), {
      op: 'add',
      path: '/root/children/-',
      value: { id: 'n_000000000004', type: 'Divider' },
    })
    expect(next.root.children).toHaveLength(3)
    expect(next.root.children[2]!.id).toBe('n_000000000004')
  })

  it('객체에 새 키를 넣는다', () => {
    const next = applyOp(doc(), { op: 'add', path: '/root/children/0/marker', value: 1 })
    expect(next.root.children[0]!.marker).toBe(1)
  })

  it('배열 범위를 벗어나면 던진다', () => {
    expect(() => applyOp(doc(), { op: 'add', path: '/root/children/9', value: {} })).toThrow(
      PatchError,
    )
  })
})

describe('applyOp — remove', () => {
  it('배열 요소를 지운다', () => {
    const next = applyOp(doc(), { op: 'remove', path: '/root/children/0' })
    expect(next.root.children.map((c) => c.id)).toEqual(['n_000000000003'])
  })

  it('객체 키를 지운다', () => {
    const next = applyOp(doc(), { op: 'remove', path: '/root/children/0/props/content' })
    expect(next.root.children[0]!.props).toEqual({})
  })

  it('없는 경로면 던진다', () => {
    expect(() => applyOp(doc(), { op: 'remove', path: '/root/children/9' })).toThrow(PatchError)
  })
})

describe('applyOp — move', () => {
  it('배열 안에서 자리를 옮긴다', () => {
    const next = applyOp(doc(), {
      op: 'move',
      from: '/root/children/0',
      path: '/root/children/1',
    })
    expect(next.root.children.map((c) => c.id)).toEqual([
      'n_000000000003',
      'n_000000000002',
    ])
  })

  it('없는 출발 경로면 던진다', () => {
    expect(() =>
      applyOp(doc(), { op: 'move', from: '/root/children/9', path: '/root/children/0' }),
    ).toThrow(PatchError)
  })
})

describe('applyOps', () => {
  it('연산을 순서대로 적용한다', () => {
    const next = applyOps(doc(), [
      { op: 'replace', path: '/root/children/0/props/content', value: '다' },
      { op: 'remove', path: '/root/children/1' },
    ])
    expect(next.root.children).toHaveLength(1)
    expect(next.root.children[0]!.props.content).toBe('다')
  })

  it('빈 목록이면 같은 내용을 돌려준다', () => {
    expect(applyOps(doc(), [])).toEqual(doc())
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/patch/apply.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 7: apply.ts 구현**

`packages/schema/src/patch/apply.ts`:
```ts
import { getByPointer, parsePointer } from './pointer'
import { PatchError, type PatchOp } from './types'

/** 연산 하나를 적용한 새 문서를 돌려준다. 입력은 변경하지 않는다. */
export function applyOp<T>(doc: T, op: PatchOp): T {
  const next = structuredClone(doc)

  switch (op.op) {
    case 'add':
      addAt(next, op.path, op.value)
      break
    case 'remove':
      removeAt(next, op.path)
      break
    case 'replace':
      replaceAt(next, op.path, op.value)
      break
    case 'move': {
      const value = getByPointer(next, op.from)
      if (value === undefined) {
        throw new PatchError(`옮길 값을 찾을 수 없습니다: ${op.from}`, op.from)
      }
      const moved = structuredClone(value)
      removeAt(next, op.from)
      addAt(next, op.path, moved)
      break
    }
  }

  return next
}

export function applyOps<T>(doc: T, ops: PatchOp[]): T {
  return ops.reduce<T>((acc, op) => applyOp(acc, op), doc)
}

interface Slot {
  parent: unknown
  key: string
}

function resolveSlot(doc: unknown, path: string): Slot {
  const tokens = parsePointer(path)
  const key = tokens.pop()
  if (key === undefined) {
    throw new PatchError('문서 루트에는 연산을 적용할 수 없습니다', path)
  }

  let parent: unknown = doc
  for (const token of tokens) {
    if (parent === null || parent === undefined) {
      throw new PatchError(`경로를 찾을 수 없습니다: ${path}`, path)
    }
    parent = Array.isArray(parent)
      ? parent[Number(token)]
      : (parent as Record<string, unknown>)[token]
  }

  if (parent === null || typeof parent !== 'object') {
    throw new PatchError(`경로를 찾을 수 없습니다: ${path}`, path)
  }

  return { parent, key }
}

function arrayIndex(array: unknown[], key: string, path: string, allowEnd: boolean): number {
  const index = key === '-' && allowEnd ? array.length : Number(key)
  const limit = allowEnd ? array.length : array.length - 1
  if (!Number.isInteger(index) || index < 0 || index > limit) {
    throw new PatchError(`배열 인덱스가 범위를 벗어납니다: ${path}`, path)
  }
  return index
}

function addAt(doc: unknown, path: string, value: unknown): void {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent, key, path, true), 0, value)
    return
  }
  ;(parent as Record<string, unknown>)[key] = value
}

function removeAt(doc: unknown, path: string): void {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent, key, path, false), 1)
    return
  }
  const record = parent as Record<string, unknown>
  if (!(key in record)) {
    throw new PatchError(`지울 키가 없습니다: ${path}`, path)
  }
  delete record[key]
}

function replaceAt(doc: unknown, path: string, value: unknown): void {
  const { parent, key } = resolveSlot(doc, path)
  if (Array.isArray(parent)) {
    parent[arrayIndex(parent, key, path, false)] = value
    return
  }
  const record = parent as Record<string, unknown>
  if (!(key in record)) {
    throw new PatchError(`바꿀 키가 없습니다: ${path}`, path)
  }
  record[key] = value
}
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/patch/apply.test.ts
```
Expected: 14 passed

- [ ] **Step 9: 공개 API에 노출**

`packages/schema/src/index.ts` 끝에 추가:
```ts
export type { PatchOp } from './patch/types'
export { PatchError } from './patch/types'
export { formatPointer, getByPointer, parsePointer } from './patch/pointer'
export { applyOp, applyOps } from './patch/apply'
```

- [ ] **Step 10: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "feat: JSON Pointer와 패치 적용 구현"
```

---

### Task 7: 역패치와 왕복 속성 테스트

이 태스크가 이력 시스템 전체의 안전망이다. undo·스냅샷 복원·MCP 편집이 모두 여기 의존한다.

**Files:**
- Create: `packages/schema/src/patch/inverse.ts`
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/schema/package.json` (fast-check 추가)
- Test: `packages/schema/test/patch/inverse.test.ts`
- Test: `packages/schema/test/patch/roundtrip.property.test.ts`

**Interfaces:**
- Consumes: Task 6의 `applyOp`·`applyOps`·`PatchOp`·`getByPointer`, Task 2의 `walkNodes`
- Produces:
  - `invertOps<T>(doc: T, ops: PatchOp[]): PatchOp[]` — `doc`은 **연산 적용 전** 문서다. 돌려받은 목록을 적용 후 문서에 적용하면 원본으로 돌아간다.

- [ ] **Step 1: fast-check 의존 추가**

`packages/schema/package.json`의 `dependencies` 아래에 추가:
```json
  "devDependencies": { "fast-check": "^3.23.0" }
```
그리고 설치:
```bash
pnpm install
```

- [ ] **Step 2: 역패치 단위 테스트 작성**

`packages/schema/test/patch/inverse.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyOps } from '../../src/patch/apply'
import { invertOps } from '../../src/patch/inverse'
import type { PatchOp } from '../../src/patch/types'

function doc() {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Text', props: { content: '가' } },
        { id: 'n_000000000003', type: 'Text', props: { content: '나' } },
      ],
    },
  }
}

function roundtrip(ops: PatchOp[]) {
  const before = doc()
  const after = applyOps(before, ops)
  const inverses = invertOps(before, ops)
  return applyOps(after, inverses)
}

describe('invertOps', () => {
  it('replace의 역은 옛 값으로의 replace다', () => {
    const ops: PatchOp[] = [
      { op: 'replace', path: '/root/children/0/props/content', value: '다' },
    ]
    expect(invertOps(doc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/props/content', value: '가' },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('배열 add의 역은 그 자리의 remove다', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/children/1', value: { id: 'n_000000000004', type: 'Divider' } },
    ]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'remove', path: '/root/children/1' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('- 로 덧붙인 add의 역은 마지막 인덱스의 remove다', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/children/-', value: { id: 'n_000000000004', type: 'Divider' } },
    ]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'remove', path: '/root/children/2' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('새 객체 키를 넣은 add의 역은 remove다', () => {
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/0/marker', value: 1 }]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'remove', path: '/root/children/0/marker' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('기존 객체 키를 덮어쓴 add의 역은 replace다', () => {
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/0/type', value: 'Divider' }]
    expect(invertOps(doc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/type', value: 'Text' },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('remove의 역은 옛 값의 add다', () => {
    const ops: PatchOp[] = [{ op: 'remove', path: '/root/children/0' }]
    expect(invertOps(doc(), ops)).toEqual([
      {
        op: 'add',
        path: '/root/children/0',
        value: { id: 'n_000000000002', type: 'Text', props: { content: '가' } },
      },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('move의 역은 반대 방향 move다', () => {
    const ops: PatchOp[] = [
      { op: 'move', from: '/root/children/0', path: '/root/children/1' },
    ]
    expect(invertOps(doc(), ops)).toEqual([
      { op: 'move', from: '/root/children/1', path: '/root/children/0' },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('여러 연산의 역은 역순으로 나온다', () => {
    const ops: PatchOp[] = [
      { op: 'replace', path: '/root/children/0/props/content', value: '다' },
      { op: 'remove', path: '/root/children/1' },
    ]
    const inverses = invertOps(doc(), ops)
    expect(inverses[0]!.op).toBe('add')
    expect(inverses[1]!.op).toBe('replace')
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('입력 문서를 변경하지 않는다', () => {
    const original = doc()
    invertOps(original, [{ op: 'remove', path: '/root/children/0' }])
    expect(original.root.children).toHaveLength(2)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/patch/inverse.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 4: inverse.ts 구현**

`packages/schema/src/patch/inverse.ts`:
```ts
import { applyOp } from './apply'
import { formatPointer, getByPointer, parsePointer } from './pointer'
import { PatchError, type PatchOp } from './types'

/**
 * 연산 목록의 역연산을 만든다.
 * `doc`은 연산을 적용하기 **전** 문서여야 한다.
 * 돌려받은 목록을 적용 후 문서에 그대로 적용하면 원본으로 돌아간다.
 */
export function invertOps<T>(doc: T, ops: PatchOp[]): PatchOp[] {
  const inverses: PatchOp[] = []
  let current: T = doc

  for (const op of ops) {
    inverses.push(inverseOf(current, op))
    current = applyOp(current, op)
  }

  return inverses.reverse()
}

function inverseOf(doc: unknown, op: PatchOp): PatchOp {
  switch (op.op) {
    case 'add':
      return inverseOfAdd(doc, op)
    case 'remove': {
      const old = getByPointer(doc, op.path)
      if (old === undefined) {
        throw new PatchError(`지울 값을 찾을 수 없습니다: ${op.path}`, op.path)
      }
      return { op: 'add', path: op.path, value: structuredClone(old) }
    }
    case 'replace': {
      const old = getByPointer(doc, op.path)
      if (old === undefined) {
        throw new PatchError(`바꿀 값을 찾을 수 없습니다: ${op.path}`, op.path)
      }
      return { op: 'replace', path: op.path, value: structuredClone(old) }
    }
    case 'move':
      return { op: 'move', from: op.path, path: op.from }
  }
}

function inverseOfAdd(doc: unknown, op: { op: 'add'; path: string; value: unknown }): PatchOp {
  const tokens = parsePointer(op.path)
  const key = tokens[tokens.length - 1]
  if (key === undefined) {
    throw new PatchError('문서 루트에는 add를 적용할 수 없습니다', op.path)
  }

  const parentTokens = tokens.slice(0, -1)
  const parent = getByPointer(doc, formatPointer(parentTokens))

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    return { op: 'remove', path: formatPointer([...parentTokens, String(index)]) }
  }

  if (parent !== null && typeof parent === 'object' && key in (parent as object)) {
    const old = (parent as Record<string, unknown>)[key]
    return { op: 'replace', path: op.path, value: structuredClone(old) }
  }

  return { op: 'remove', path: op.path }
}
```

- [ ] **Step 5: 단위 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/patch/inverse.test.ts
```
Expected: 9 passed

- [ ] **Step 6: 왕복 속성 테스트 작성**

`packages/schema/test/patch/roundtrip.property.test.ts`:
```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { PageDocument, WbNode } from '../../src/node'
import { applyOp, applyOps } from '../../src/patch/apply'
import { invertOps } from '../../src/patch/inverse'
import type { PatchOp } from '../../src/patch/types'
import { walkNodes } from '../../src/tree'

function seedDocument(): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'Card',
          props: { title: '카드', subtitle: '' },
          children: [
            { id: 'n_000000000003', type: 'Text', props: { content: '가', role: 'body' } },
            { id: 'n_000000000004', type: 'Text', props: { content: '나', role: 'body' } },
          ],
        },
        { id: 'n_000000000005', type: 'List', props: { items: 3, pagination: true } },
        { id: 'n_000000000006', type: 'Divider', props: { direction: 'horizontal' } },
      ],
    },
  }
}

let nextId = 100

/** 시드에서 현재 문서에 유효한 연산 하나를 고른다. 만들 수 없으면 null. */
function pickOp(doc: PageDocument, seed: number): PatchOp | null {
  const visits = [...walkNodes(doc.root)].filter((visit) => visit.parent !== null)
  if (visits.length === 0) return null

  const visit = visits[seed % visits.length]!
  const kind = Math.floor(seed / 7) % 4

  if (kind === 0) {
    // 자식 배열 끝에 새 노드를 덧붙인다
    const target = visit.parent!
    if (!target.children) return null
    return {
      op: 'add',
      path: `${parentPath(visit.path)}/-`,
      value: { id: `n_gen${String((nextId += 1)).padStart(9, '0')}`, type: 'Divider' },
    }
  }

  if (kind === 1) {
    return { op: 'remove', path: visit.path }
  }

  if (kind === 2) {
    return { op: 'replace', path: `${visit.path}/type`, value: 'Divider' }
  }

  // move: 형제가 둘 이상일 때만
  const siblings = visit.parent!.children ?? []
  if (siblings.length < 2) return null
  const targetIndex = (visit.index + 1) % siblings.length
  return {
    op: 'move',
    from: visit.path,
    path: `${parentPath(visit.path)}/${targetIndex}`,
  }
}

/** `/root/children/2` → `/root/children` */
function parentPath(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}

function hasNodes(root: WbNode): boolean {
  return (root.children?.length ?? 0) > 0
}

describe('패치 왕복 속성', () => {
  it('임의 편집 시퀀스를 적용한 뒤 역적용하면 원본과 같다', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 10_000 }), { minLength: 1, maxLength: 25 }), (seeds) => {
        const original = seedDocument()
        let current: PageDocument = original
        const ops: PatchOp[] = []

        for (const seed of seeds) {
          if (!hasNodes(current.root)) break
          const op = pickOp(current, seed)
          if (!op) continue
          let next: PageDocument
          try {
            next = applyOp(current, op)
          } catch {
            continue // 이 시드로는 유효하지 않은 연산 — 건너뛴다
          }
          ops.push(op)
          current = next
        }

        const inverses = invertOps(original, ops)
        const restored = applyOps(current, inverses)
        expect(restored).toEqual(original)
      }),
      { numRuns: 300 },
    )
  })

  it('빈 연산 목록의 역은 빈 목록이다', () => {
    expect(invertOps(seedDocument(), [])).toEqual([])
  })
})
```

- [ ] **Step 7: 속성 테스트 실행**

```bash
pnpm vitest run packages/schema/test/patch/roundtrip.property.test.ts
```
Expected: 2 passed (300회 반복)

실패하면 fast-check가 최소 반례 시퀀스를 출력한다. 그 시퀀스를 `inverse.test.ts`에 고정 테스트로 옮겨 적고 고친 뒤 다시 돌린다.

- [ ] **Step 8: 공개 API에 노출**

`packages/schema/src/index.ts` 끝에 추가:
```ts
export { invertOps } from './patch/inverse'
```

- [ ] **Step 9: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: 역패치 생성과 왕복 속성 테스트 추가"
```

---

### Task 8: 문서 버전 마이그레이션

**Files:**
- Create: `packages/schema/src/migrate.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/migrate.test.ts`

**Interfaces:**
- Consumes: Task 2의 `PageDocument`
- Produces:
  - `CURRENT_DOCUMENT_VERSION: number` — 현재 1
  - `Migration` — `{ from: number; to: number; migrate: (doc: PageDocument) => PageDocument }`
  - `MIGRATIONS: Migration[]` — 지금은 빈 배열
  - `migrateDocument(doc, migrations?, target?): PageDocument`

- [ ] **Step 1: 마이그레이션 테스트 작성**

`packages/schema/test/migrate.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  CURRENT_DOCUMENT_VERSION,
  MIGRATIONS,
  migrateDocument,
  type Migration,
} from '../src/migrate'
import type { PageDocument } from '../src/node'

function doc(version: number): PageDocument {
  return { version, root: { id: 'n_000000000001', type: 'Page' } }
}

const toV2: Migration = {
  from: 1,
  to: 2,
  migrate: (input) => ({
    ...input,
    root: { ...input.root, props: { ...(input.root.props ?? {}), migrated: true } },
  }),
}

describe('migrateDocument', () => {
  it('현재 버전이면 그대로 돌려준다', () => {
    expect(migrateDocument(doc(1))).toEqual(doc(1))
  })

  it('한 단계를 올린다', () => {
    const result = migrateDocument(doc(1), [toV2], 2)
    expect(result.version).toBe(2)
    expect(result.root.props).toEqual({ migrated: true })
  })

  it('여러 단계를 연달아 올린다', () => {
    const toV3: Migration = {
      from: 2,
      to: 3,
      migrate: (input) => ({ ...input, root: { ...input.root, marker: 1 } }),
    }
    const result = migrateDocument(doc(1), [toV2, toV3], 3)
    expect(result.version).toBe(3)
    expect(result.root.marker).toBe(1)
  })

  it('올릴 마이그레이션이 없으면 던진다', () => {
    expect(() => migrateDocument(doc(1), [], 2)).toThrow('버전 1에서 올릴 마이그레이션이 없습니다')
  })

  it('목표보다 높은 버전이면 던진다', () => {
    expect(() => migrateDocument(doc(5), [], 1)).toThrow('지원하지 않는 문서 버전: 5')
  })

  it('입력 문서를 변경하지 않는다', () => {
    const input = doc(1)
    migrateDocument(input, [toV2], 2)
    expect(input.version).toBe(1)
    expect(input.root.props).toBeUndefined()
  })
})

describe('상수', () => {
  it('현재 문서 버전은 1이다', () => {
    expect(CURRENT_DOCUMENT_VERSION).toBe(1)
  })

  it('아직 등록된 마이그레이션이 없다', () => {
    expect(MIGRATIONS).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/schema/test/migrate.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: migrate.ts 구현**

`packages/schema/src/migrate.ts`:
```ts
import type { PageDocument } from './node'

export const CURRENT_DOCUMENT_VERSION = 1

export interface Migration {
  from: number
  to: number
  migrate: (doc: PageDocument) => PageDocument
}

/**
 * 버전별 마이그레이션 체인.
 * 컴포넌트 props가 바뀌면 여기에 한 단계를 추가한다.
 */
export const MIGRATIONS: Migration[] = []

/** 문서를 목표 버전까지 올린다. 가져오기·스냅샷 복원·읽기가 모두 이 경로를 탄다. */
export function migrateDocument(
  doc: PageDocument,
  migrations: Migration[] = MIGRATIONS,
  target: number = CURRENT_DOCUMENT_VERSION,
): PageDocument {
  let current = structuredClone(doc)

  if (current.version > target) {
    throw new Error(`지원하지 않는 문서 버전: ${current.version}`)
  }

  while (current.version < target) {
    const step = migrations.find((migration) => migration.from === current.version)
    if (!step) {
      throw new Error(`버전 ${current.version}에서 올릴 마이그레이션이 없습니다`)
    }
    current = { ...step.migrate(current), version: step.to }
  }

  return current
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run packages/schema/test/migrate.test.ts
```
Expected: 8 passed

- [ ] **Step 5: 공개 API에 노출**

`packages/schema/src/index.ts` 끝에 추가:
```ts
export type { Migration } from './migrate'
export { CURRENT_DOCUMENT_VERSION, MIGRATIONS, migrateDocument } from './migrate'
```

- [ ] **Step 6: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 문서 버전 마이그레이션 체인 추가"
```

---

### Task 9: 렌더러 패키지와 속성 계약

**Files:**
- Create: `packages/renderer/package.json`
- Create: `packages/renderer/tsconfig.json`
- Create: `packages/renderer/src/attrs.ts`
- Create: `packages/renderer/src/structures/registry.ts`
- Create: `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/attrs.test.ts`
- Test: `packages/renderer/test/registry.test.ts`

**Interfaces:**
- Consumes: Task 2의 `WbNode`, Task 3의 `ComponentDef`·`requireComponent`
- Produces:
  - `WbAttrs` — `{ 'data-wb-id': string; 'data-wb-component': string; 'data-wb-structure': string; 'data-wb-variant'?: string; 'data-wb-state'?: string }`
  - `nodeAttrs(node: WbNode, def: ComponentDef, structure: string, props: Record<string, unknown>): WbAttrs`
  - `partAttrs(part: string): { 'data-wb-part': string }`
  - `activeStates(def: ComponentDef, props: Record<string, unknown>): string[]`
  - `StructureContext` — `{ node: WbNode; props: Record<string, unknown>; attrs: WbAttrs; part: (name: string) => { 'data-wb-part': string }; children: ReactNode; slot: ReactNode }`
  - `StructureRenderer` — `(ctx: StructureContext) => ReactElement`
  - `registerStructure(type: string, structure: string, render: StructureRenderer): void`
  - `getStructure(type: string, structure: string): StructureRenderer | undefined`
  - `requireStructure(type: string, structure: string): StructureRenderer`
  - `listStructureKeys(): string[]` — `"타입:구조"` 형식
  - `resetStructures(): void` — 테스트 전용

- [ ] **Step 1: 렌더러 패키지 뼈대 작성**

`packages/renderer/package.json`:
```json
{
  "name": "@wirebound/renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@wirebound/schema": "workspace:*",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

`packages/renderer/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "jsx": "react-jsx"
  },
  "include": ["src", "test"]
}
```

설치:
```bash
pnpm install
```

- [ ] **Step 2: 속성 계약 테스트 작성**

`packages/renderer/test/attrs.test.ts`:
```ts
import { ButtonDef, ListDef, TextDef } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { activeStates, nodeAttrs, partAttrs } from '../src/attrs'

describe('nodeAttrs', () => {
  it('id·컴포넌트·구조를 항상 낸다', () => {
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'Text' }, TextDef, 'default', {})
    expect(attrs).toEqual({
      'data-wb-id': 'n_000000000001',
      'data-wb-component': 'Text',
      'data-wb-structure': 'default',
    })
  })

  it('variant가 있으면 함께 낸다', () => {
    const attrs = nodeAttrs(
      { id: 'n_000000000001', type: 'Button', variant: 'primary' },
      ButtonDef,
      'solid',
      {},
    )
    expect(attrs['data-wb-variant']).toBe('primary')
  })

  it('활성 상태를 공백으로 이어 낸다', () => {
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'List' }, ListDef, 'table', {
      loading: true,
      empty: true,
      selected: false,
    })
    expect(attrs['data-wb-state']).toBe('loading empty')
  })

  it('활성 상태가 없으면 data-wb-state를 내지 않는다', () => {
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'List' }, ListDef, 'table', {})
    expect(attrs['data-wb-state']).toBeUndefined()
  })
})

describe('activeStates', () => {
  it('선언된 상태와 같은 이름의 prop이 true인 것만 고른다', () => {
    expect(activeStates(ListDef, { selected: true, disabled: false, bogus: true })).toEqual([
      'selected',
    ])
  })

  it('선언 순서를 지킨다', () => {
    expect(activeStates(ListDef, { empty: true, selected: true })).toEqual(['selected', 'empty'])
  })
})

describe('partAttrs', () => {
  it('조각 이름을 낸다', () => {
    expect(partAttrs('header')).toEqual({ 'data-wb-part': 'header' })
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
pnpm vitest run packages/renderer/test/attrs.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 4: attrs.ts 구현**

`packages/renderer/src/attrs.ts`:
```ts
import type { ComponentDef, WbNode } from '@wirebound/schema'

/** 렌더러와 테마 사이의 전체 계약. 설계 문서 §6.11 */
export interface WbAttrs {
  'data-wb-id': string
  'data-wb-component': string
  'data-wb-structure': string
  'data-wb-variant'?: string
  'data-wb-state'?: string
}

/** 선언된 상태 중 같은 이름의 prop이 true인 것을 선언 순서대로 고른다. */
export function activeStates(def: ComponentDef, props: Record<string, unknown>): string[] {
  return def.states.filter((state) => props[state] === true)
}

export function nodeAttrs(
  node: WbNode,
  def: ComponentDef,
  structure: string,
  props: Record<string, unknown>,
): WbAttrs {
  const attrs: WbAttrs = {
    'data-wb-id': node.id,
    'data-wb-component': node.type,
    'data-wb-structure': structure,
  }

  if (node.variant !== undefined) {
    attrs['data-wb-variant'] = node.variant
  }

  const states = activeStates(def, props)
  if (states.length > 0) {
    attrs['data-wb-state'] = states.join(' ')
  }

  return attrs
}

export function partAttrs(part: string): { 'data-wb-part': string } {
  return { 'data-wb-part': part }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm vitest run packages/renderer/test/attrs.test.ts
```
Expected: 7 passed

- [ ] **Step 6: 구조 레지스트리 테스트 작성**

`packages/renderer/test/registry.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getStructure,
  listStructureKeys,
  registerStructure,
  requireStructure,
  resetStructures,
} from '../src/structures/registry'

const dummy = () => null as never

describe('구조 레지스트리', () => {
  beforeEach(() => {
    resetStructures()
  })

  it('타입과 구조 조합으로 등록하고 찾는다', () => {
    registerStructure('List', 'table', dummy)
    expect(getStructure('List', 'table')).toBe(dummy)
  })

  it('다른 구조는 따로 관리된다', () => {
    registerStructure('List', 'table', dummy)
    expect(getStructure('List', 'cardGrid')).toBeUndefined()
  })

  it('같은 조합을 두 번 등록하면 던진다', () => {
    registerStructure('List', 'table', dummy)
    expect(() => registerStructure('List', 'table', dummy)).toThrow(
      '이미 등록된 구조: List:table',
    )
  })

  it('requireStructure는 없는 조합에 대해 던진다', () => {
    expect(() => requireStructure('List', 'table')).toThrow('구현되지 않은 구조: List:table')
  })

  it('등록된 키 목록을 준다', () => {
    registerStructure('List', 'table', dummy)
    registerStructure('Text', 'default', dummy)
    expect(listStructureKeys().sort()).toEqual(['List:table', 'Text:default'])
  })
})
```

- [ ] **Step 7: registry.ts 구현**

`packages/renderer/src/structures/registry.ts`:
```ts
import type { WbNode } from '@wirebound/schema'
import type { ReactElement, ReactNode } from 'react'
import type { WbAttrs } from '../attrs'

export interface StructureContext {
  node: WbNode
  /** 기본값이 채워진 props */
  props: Record<string, unknown>
  attrs: WbAttrs
  part: (name: string) => { 'data-wb-part': string }
  /** 이미 렌더된 자식들 */
  children: ReactNode
  /** Slot 구조가 쓰는 주입 내용 */
  slot: ReactNode
}

export type StructureRenderer = (ctx: StructureContext) => ReactElement

const structures = new Map<string, StructureRenderer>()

function key(type: string, structure: string): string {
  return `${type}:${structure}`
}

export function registerStructure(
  type: string,
  structure: string,
  render: StructureRenderer,
): void {
  const id = key(type, structure)
  if (structures.has(id)) {
    throw new Error(`이미 등록된 구조: ${id}`)
  }
  structures.set(id, render)
}

export function getStructure(type: string, structure: string): StructureRenderer | undefined {
  return structures.get(key(type, structure))
}

export function requireStructure(type: string, structure: string): StructureRenderer {
  const render = structures.get(key(type, structure))
  if (!render) {
    throw new Error(`구현되지 않은 구조: ${key(type, structure)}`)
  }
  return render
}

export function listStructureKeys(): string[] {
  return [...structures.keys()]
}

/** 테스트 전용. 프로덕션 코드에서 호출하지 않는다. */
export function resetStructures(): void {
  structures.clear()
}
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
pnpm vitest run packages/renderer/test/registry.test.ts
```
Expected: 5 passed

- [ ] **Step 9: 공개 API 작성**

`packages/renderer/src/index.ts`:
```ts
export type { WbAttrs } from './attrs'
export { activeStates, nodeAttrs, partAttrs } from './attrs'

export type { StructureContext, StructureRenderer } from './structures/registry'
export {
  getStructure,
  listStructureKeys,
  registerStructure,
  requireStructure,
  resetStructures,
} from './structures/registry'
```

- [ ] **Step 10: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "feat: 렌더러 패키지와 data-wb 속성 계약·구조 레지스트리 추가"
```

---

### Task 10: 렌더링 엔진

**Files:**
- Create: `packages/renderer/src/render.tsx`
- Modify: `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/render.test.tsx`

**Interfaces:**
- Consumes: Task 9의 `nodeAttrs`·`partAttrs`·`requireStructure`, Task 3~5의 `requireComponent`·`defaultStructure`
- Produces:
  - `RenderOptions` — `{ structures?: Record<string, string>; slot?: ReactNode }`
  - `renderNode(node: WbNode, options?: RenderOptions): ReactElement`
  - `renderDocument(doc: PageDocument, options?: RenderOptions): ReactElement`
  - `resolveStructure(type: string, options: RenderOptions): string`

- [ ] **Step 1: 렌더링 테스트 작성**

`packages/renderer/test/render.test.tsx`:
```tsx
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderDocument, renderNode, resolveStructure } from '../src/render'
import { registerStructure, resetStructures } from '../src/structures/registry'

beforeAll(() => {
  installCatalog()
  resetStructures()

  registerStructure('Page', 'default', ({ attrs, children }) => (
    <div {...attrs}>{children}</div>
  ))
  registerStructure('Text', 'default', ({ attrs, props }) => (
    <p {...attrs}>{String(props.content)}</p>
  ))
  registerStructure('List', 'table', ({ attrs, part }) => (
    <table {...attrs}>
      <thead {...part('header')} />
    </table>
  ))
  registerStructure('List', 'cardGrid', ({ attrs, part }) => (
    <div {...attrs}>
      <div {...part('item')} />
    </div>
  ))
  registerStructure('Slot', 'default', ({ attrs, slot }) => <div {...attrs}>{slot}</div>)
})

function markup(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

describe('renderNode', () => {
  it('기본 구조로 그린다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'Text', props: { content: '안녕' } }))
    expect(html).toContain('data-wb-component="Text"')
    expect(html).toContain('data-wb-structure="default"')
    expect(html).toContain('안녕')
  })

  it('props 기본값을 채워 넘긴다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'Text' }))
    expect(html).toContain('텍스트')
  })

  it('노드 id를 속성으로 낸다', () => {
    const html = markup(renderNode({ id: 'n_000000000042', type: 'Text' }))
    expect(html).toContain('data-wb-id="n_000000000042"')
  })

  it('자식을 재귀로 그린다', () => {
    const html = markup(
      renderNode({
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'Text', props: { content: '첫째' } },
          { id: 'n_000000000003', type: 'Text', props: { content: '둘째' } },
        ],
      }),
    )
    expect(html).toContain('첫째')
    expect(html).toContain('둘째')
  })

  it('options.structures로 구조를 바꾼다', () => {
    const node = { id: 'n_000000000001', type: 'List' }
    expect(markup(renderNode(node))).toContain('<table')
    expect(markup(renderNode(node, { structures: { List: 'cardGrid' } }))).toContain(
      'data-wb-structure="cardGrid"',
    )
  })

  it('조각에 data-wb-part를 붙인다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'List' }))
    expect(html).toContain('data-wb-part="header"')
  })

  it('알 수 없는 타입이면 던진다', () => {
    expect(() => renderNode({ id: 'n_000000000001', type: 'Nope' })).toThrow(
      '알 수 없는 컴포넌트 타입: Nope',
    )
  })

  it('구현이 없는 구조를 지정하면 던진다', () => {
    expect(() =>
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'mediaList' } }),
    ).toThrow('구현되지 않은 구조: List:mediaList')
  })

  it('카탈로그에 없는 구조를 지정하면 던진다', () => {
    expect(() =>
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'bogus' } }),
    ).toThrow('List에 없는 구조입니다: bogus')
  })
})

describe('renderDocument', () => {
  it('문서 루트를 그린다', () => {
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Text', props: { content: '본문' } }],
      },
    }
    expect(markup(renderDocument(doc))).toContain('본문')
  })
})

describe('resolveStructure', () => {
  it('지정이 없으면 첫 번째 구조를 쓴다', () => {
    expect(resolveStructure('List', {})).toBe('table')
  })

  it('지정이 있으면 그것을 쓴다', () => {
    expect(resolveStructure('List', { structures: { List: 'stackedList' } })).toBe('stackedList')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/renderer/test/render.test.tsx
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: render.tsx 구현**

`packages/renderer/src/render.tsx`:
```tsx
import {
  defaultStructure,
  requireComponent,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { nodeAttrs, partAttrs } from './attrs'
import { requireStructure } from './structures/registry'

export interface RenderOptions {
  /** 컴포넌트 타입 → 구조 이름. 테마가 제공한다. 없으면 카탈로그의 첫 구조를 쓴다. */
  structures?: Record<string, string>
  /** Slot 자리에 넣을 내용. compose가 채운다. */
  slot?: ReactNode
}

export function resolveStructure(type: string, options: RenderOptions): string {
  const def = requireComponent(type)
  const requested = options.structures?.[type]
  if (requested === undefined) return defaultStructure(def)
  if (!def.structures.includes(requested)) {
    throw new Error(`${type}에 없는 구조입니다: ${requested}`)
  }
  return requested
}

export function renderNode(node: WbNode, options: RenderOptions = {}): ReactElement {
  const def = requireComponent(node.type)
  const structure = resolveStructure(node.type, options)
  const render = requireStructure(node.type, structure)

  const props = def.props.parse(node.props ?? {}) as Record<string, unknown>

  const children: ReactNode =
    node.children && node.children.length > 0
      ? node.children.map((child) => (
          <Fragment key={child.id}>{renderNode(child, options)}</Fragment>
        ))
      : null

  return render({
    node,
    props,
    attrs: nodeAttrs(node, def, structure, props),
    part: partAttrs,
    children,
    slot: options.slot ?? null,
  })
}

export function renderDocument(doc: PageDocument, options: RenderOptions = {}): ReactElement {
  return renderNode(doc.root, options)
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run packages/renderer/test/render.test.tsx
```
Expected: 12 passed

- [ ] **Step 5: 공개 API에 노출**

`packages/renderer/src/index.ts` 끝에 추가:
```ts
export type { RenderOptions } from './render'
export { renderDocument, renderNode, resolveStructure } from './render'
```

- [ ] **Step 6: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 스키마 트리를 React 엘리먼트로 그리는 렌더링 엔진 추가"
```

---

### Task 11: 기본 구조 구현체 19종

**Files:**
- Create: `packages/renderer/src/structures/structure.tsx`
- Create: `packages/renderer/src/structures/data.tsx`
- Create: `packages/renderer/src/structures/input.tsx`
- Create: `packages/renderer/src/structures/action.tsx`
- Create: `packages/renderer/src/structures/document.tsx`
- Create: `packages/renderer/src/structures/index.ts`
- Modify: `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/structures.test.tsx`

각 컴포넌트의 **첫 번째(기본) 구조 하나씩만** 구현한다. 나머지 구조는 P4b에서 채운다.

**Interfaces:**
- Consumes: Task 9의 `registerStructure`·`StructureContext`
- Produces:
  - `installStructures(): void` — 기본 구조 19종을 등록. 이미 등록돼 있으면 건너뛴다.

- [ ] **Step 1: 구조 완전성 테스트 작성**

`packages/renderer/test/structures.test.tsx`:
```tsx
import { CATALOG_TYPES, defaultStructure, installCatalog, requireComponent } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { installStructures } from '../src/structures/index'
import { getStructure } from '../src/structures/registry'

beforeAll(() => {
  installCatalog()
  installStructures()
})

describe('기본 구조 구현체', () => {
  it('카탈로그의 모든 컴포넌트가 기본 구조 구현을 갖는다', () => {
    for (const type of CATALOG_TYPES) {
      const structure = defaultStructure(requireComponent(type))
      expect(getStructure(type, structure), `${type}:${structure}`).toBeDefined()
    }
  })

  it('모든 컴포넌트를 기본 props로 그릴 수 있다', () => {
    for (const type of CATALOG_TYPES) {
      const html = renderToStaticMarkup(renderNode({ id: 'n_000000000001', type }))
      expect(html, type).toContain(`data-wb-component="${type}"`)
    }
  })

  it('두 번 설치해도 던지지 않는다', () => {
    expect(() => installStructures()).not.toThrow()
  })
})

describe('개별 구조', () => {
  it('Text는 role을 그대로 내려보낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Text', props: { content: '제목', role: 'h1' } }),
    )
    expect(html).toContain('<h1')
    expect(html).toContain('제목')
  })

  it('List는 컬럼 수만큼 헤더 셀을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({
        id: 'n_000000000001',
        type: 'List',
        props: { columns: ['가', '나', '다'], items: 2 },
      }),
    )
    expect(html.match(/data-wb-part="cell"/g)).toHaveLength(3 + 3 * 2)
  })

  it('List는 items 수만큼 행을 내고 짝수·홀수 행 조각을 번갈아 쓴다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'List', props: { items: 4 } }),
    )
    expect(html.match(/data-wb-part="row"/g)).toHaveLength(2)
    expect(html.match(/data-wb-part="rowAlt"/g)).toHaveLength(2)
  })

  it('Button은 라벨을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Button', props: { label: '저장' } }),
    )
    expect(html).toContain('저장')
  })

  it('Button의 disabled는 상태 속성으로 나온다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Button', props: { disabled: true } }),
    )
    expect(html).toContain('data-wb-state="disabled"')
  })

  it('Field는 라벨과 컨트롤 조각을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Field', props: { label: '아이디' } }),
    )
    expect(html).toContain('data-wb-part="label"')
    expect(html).toContain('data-wb-part="control"')
    expect(html).toContain('아이디')
  })

  it('Grid는 열 수를 CSS 변수로 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Grid', props: { columns: 3 } }),
    )
    expect(html).toContain('--wb-grid-columns:3')
  })

  it('KeyValue는 키와 값 조각을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({
        id: 'n_000000000001',
        type: 'KeyValue',
        props: { pairs: [{ key: '이름', value: '홍길동' }] },
      }),
    )
    expect(html).toContain('data-wb-part="key"')
    expect(html).toContain('홍길동')
  })

  it('Slot은 주입된 내용을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Slot' }, { slot: <span>주입됨</span> }),
    )
    expect(html).toContain('주입됨')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/renderer/test/structures.test.tsx
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구조 그룹 구현**

`packages/renderer/src/structures/structure.tsx`:
```tsx
import type { CSSProperties } from 'react'
import type { StructureRenderer } from './registry'

export const PageDefault: StructureRenderer = ({ attrs, children }) => (
  <div {...attrs}>{children}</div>
)

export const SlotDefault: StructureRenderer = ({ attrs, slot }) => <div {...attrs}>{slot}</div>

export const SectionContained: StructureRenderer = ({ attrs, part, children }) => (
  <section {...attrs}>
    <div {...part('inner')}>{children}</div>
  </section>
)

export const FlexDefault: StructureRenderer = ({ attrs, props, children }) => (
  <div
    {...attrs}
    style={{
      display: 'flex',
      flexDirection: props.direction as 'row' | 'column',
      alignItems: mapAlign(props.align as string),
      justifyContent: mapJustify(props.justify as string),
      flexWrap: props.wrap === true ? 'wrap' : 'nowrap',
    }}
  >
    {children}
  </div>
)

export const GridDefault: StructureRenderer = ({ attrs, props, children }) => {
  // CSS 커스텀 프로퍼티는 CSSProperties 타입에 없으므로 캐스팅한다.
  const style = {
    display: 'grid',
    gridTemplateColumns: `repeat(${props.columns as number}, 1fr)`,
    '--wb-grid-columns': String(props.columns),
  } as CSSProperties

  return (
    <div {...attrs} style={style}>
      {children}
    </div>
  )
}

export const CardPlain: StructureRenderer = ({ attrs, props, part, children }) => (
  <div {...attrs}>
    <div {...part('header')}>
      <div {...part('title')}>{String(props.title)}</div>
      {props.subtitle ? <div {...part('subtitle')}>{String(props.subtitle)}</div> : null}
    </div>
    <div {...part('body')}>{children}</div>
  </div>
)

export const TabsUnderline: StructureRenderer = ({ attrs, props, part, children }) => {
  const tabs = props.tabs as string[]
  const active = props.active as number
  return (
    <div {...attrs}>
      <div {...part('list')}>
        {tabs.map((label, index) => (
          <span key={`${label}-${index}`} {...part('tab')} aria-selected={index === active}>
            {label}
          </span>
        ))}
      </div>
      <div {...part('panel')}>{children}</div>
    </div>
  )
}

function mapAlign(value: string): string {
  return value === 'start' ? 'flex-start' : value === 'end' ? 'flex-end' : value
}

function mapJustify(value: string): string {
  if (value === 'start') return 'flex-start'
  if (value === 'end') return 'flex-end'
  if (value === 'between') return 'space-between'
  return value
}
```

`packages/renderer/src/structures/data.tsx`:
```tsx
import type { StructureRenderer } from './registry'

export const ListTable: StructureRenderer = ({ attrs, props, part }) => {
  const columns = props.columns as string[]
  const items = props.items as number
  return (
    <table {...attrs}>
      <thead {...part('header')}>
        <tr>
          {columns.map((column, index) => (
            <th key={`${column}-${index}`} {...part('cell')}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: items }, (_, rowIndex) => (
          <tr key={rowIndex} {...part(rowIndex % 2 === 1 ? 'rowAlt' : 'row')}>
            {columns.map((column, columnIndex) => (
              <td key={`${column}-${columnIndex}`} {...part('cell')}>
                —
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {props.pagination === true ? (
        <tfoot>
          <tr>
            <td {...part('pagination')} colSpan={columns.length}>
              1 2 3
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}

export const TreeIndent: StructureRenderer = ({ attrs, props, part }) => {
  const items = props.items as string[]
  const depth = props.depth as number
  return (
    <ul {...attrs}>
      {items.map((label, index) => (
        <li key={`${label}-${index}`} {...part('node')} style={{ paddingLeft: `${(index % depth) * 16}px` }}>
          <span {...part('toggle')}>▸</span>
          <span {...part('label')}>{label}</span>
        </li>
      ))}
    </ul>
  )
}

export const KeyValueTable: StructureRenderer = ({ attrs, props, part }) => {
  const pairs = props.pairs as { key: string; value: string }[]
  return (
    <table {...attrs}>
      <tbody>
        {pairs.map((pair, index) => (
          <tr key={`${pair.key}-${index}`} {...part('row')}>
            <th {...part('key')}>{pair.key}</th>
            <td {...part('value')}>{pair.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

`packages/renderer/src/structures/input.tsx`:
```tsx
import type { StructureRenderer } from './registry'

export const SearchFormInline: StructureRenderer = ({ attrs, part, children }) => (
  <form {...attrs}>
    <div {...part('fields')}>{children}</div>
    <div {...part('actions')}>
      <span>조회</span>
      <span>초기화</span>
    </div>
  </form>
)

export const EntryFormLabelLeft: StructureRenderer = ({ attrs, props, part, children }) => (
  <form {...attrs}>
    {props.title ? <div {...part('label')}>{String(props.title)}</div> : null}
    <div {...part('row')}>{children}</div>
    <div {...part('actions')}>
      <span>저장</span>
      <span>취소</span>
    </div>
  </form>
)

export const FieldOutlined: StructureRenderer = ({ attrs, props, part }) => (
  <div {...attrs}>
    <label {...part('label')}>{String(props.label)}</label>
    <div {...part('control')} data-control={String(props.control)}>
      {String(props.placeholder) || ' '}
    </div>
  </div>
)
```

`packages/renderer/src/structures/action.tsx`:
```tsx
import type { StructureRenderer } from './registry'

export const ButtonSolid: StructureRenderer = ({ attrs, props, part }) => (
  <button {...attrs} type="button" disabled={props.disabled === true}>
    <span {...part('label')}>{String(props.label)}</span>
  </button>
)

export const LinkDefault: StructureRenderer = ({ attrs, props }) => (
  <a {...attrs} href={props.target ? `#${String(props.target)}` : '#'}>
    {String(props.label)}
  </a>
)
```

`packages/renderer/src/structures/document.tsx`:
```tsx
import { createElement } from 'react'
import type { StructureRenderer } from './registry'

const ROLE_TAG: Record<string, string> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body: 'p',
  caption: 'small',
}

export const TextDefault: StructureRenderer = ({ attrs, props }) =>
  createElement(
    ROLE_TAG[props.role as string] ?? 'p',
    { ...attrs, 'data-wb-role': String(props.role) },
    String(props.content),
  )

export const MediaImage: StructureRenderer = ({ attrs, props, part }) => (
  <figure {...attrs}>
    <div {...part('frame')} style={{ aspectRatio: String(props.ratio) }} />
    {props.caption ? <figcaption {...part('caption')}>{String(props.caption)}</figcaption> : null}
  </figure>
)

export const DividerDefault: StructureRenderer = ({ attrs, props }) => (
  <hr {...attrs} data-direction={String(props.direction)} />
)

export const PlaceholderDefault: StructureRenderer = ({ attrs, props }) => (
  <div {...attrs} style={{ height: `${props.height as number}px` }}>
    {String(props.label)}
  </div>
)
```

- [ ] **Step 4: 설치 진입점 작성**

`packages/renderer/src/structures/index.ts`:
```ts
import { ButtonSolid, LinkDefault } from './action'
import { KeyValueTable, ListTable, TreeIndent } from './data'
import { DividerDefault, MediaImage, PlaceholderDefault, TextDefault } from './document'
import { EntryFormLabelLeft, FieldOutlined, SearchFormInline } from './input'
import { getStructure, registerStructure, type StructureRenderer } from './registry'
import {
  CardPlain,
  FlexDefault,
  GridDefault,
  PageDefault,
  SectionContained,
  SlotDefault,
  TabsUnderline,
} from './structure'

const DEFAULTS: [type: string, structure: string, render: StructureRenderer][] = [
  ['Page', 'default', PageDefault],
  ['Slot', 'default', SlotDefault],
  ['Section', 'contained', SectionContained],
  ['Flex', 'default', FlexDefault],
  ['Grid', 'default', GridDefault],
  ['Card', 'plain', CardPlain],
  ['Tabs', 'underline', TabsUnderline],
  ['List', 'table', ListTable],
  ['Tree', 'indent', TreeIndent],
  ['KeyValue', 'table', KeyValueTable],
  ['SearchForm', 'inline', SearchFormInline],
  ['EntryForm', 'labelLeft', EntryFormLabelLeft],
  ['Field', 'outlined', FieldOutlined],
  ['Button', 'solid', ButtonSolid],
  ['Link', 'default', LinkDefault],
  ['Text', 'default', TextDefault],
  ['Media', 'image', MediaImage],
  ['Divider', 'default', DividerDefault],
  ['Placeholder', 'default', PlaceholderDefault],
]

/** 기본 구조를 등록한다. 이미 등록돼 있으면 건너뛴다. */
export function installStructures(): void {
  for (const [type, structure, render] of DEFAULTS) {
    if (!getStructure(type, structure)) registerStructure(type, structure, render)
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm vitest run packages/renderer/test/structures.test.tsx
```
Expected: 12 passed

`render.test.tsx`가 자체 더미 구조를 쓰면서 `resetStructures()`를 호출하므로 두 테스트 파일이 서로 간섭할 수 있다. vitest는 기본적으로 파일마다 별도 모듈 그래프를 쓰므로 문제가 없다. 만약 간섭이 관찰되면 루트 `vitest.config.ts`의 `test`에 `isolate: true`를 명시한다.

- [ ] **Step 6: 공개 API에 노출**

`packages/renderer/src/index.ts` 끝에 추가:
```ts
export { installStructures } from './structures/index'
```

- [ ] **Step 7: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 카탈로그 19종의 기본 구조 구현체 추가"
```

---

### Task 12: 레이아웃 합성

**Files:**
- Create: `packages/renderer/src/compose.tsx`
- Modify: `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/compose.test.tsx`

**Interfaces:**
- Consumes: Task 10의 `renderDocument`·`RenderOptions`
- Produces:
  - `renderComposed(layout: LayoutDocument, page: PageDocument, options?: RenderOptions): ReactElement`

- [ ] **Step 1: 합성 테스트 작성**

`packages/renderer/test/compose.test.tsx`:
```tsx
import { installCatalog, type LayoutDocument, type PageDocument } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderComposed } from '../src/compose'
import { installStructures } from '../src/structures/index'

beforeAll(() => {
  installCatalog()
  installStructures()
})

const layout: LayoutDocument = {
  version: 1,
  root: {
    id: 'n_lay000000001',
    type: 'Page',
    children: [
      {
        id: 'n_lay000000002',
        type: 'Text',
        props: { content: '헤더 영역', role: 'h1' },
      },
      {
        id: 'n_lay000000003',
        type: 'Flex',
        props: { direction: 'row' },
        children: [
          {
            id: 'n_lay000000004',
            type: 'Tree',
            props: { items: ['회원관리', '권한관리'] },
          },
          { id: 'n_lay000000005', type: 'Slot' },
        ],
      },
    ],
  },
}

const page: PageDocument = {
  version: 1,
  root: {
    id: 'n_pag000000001',
    type: 'Page',
    children: [{ id: 'n_pag000000002', type: 'Text', props: { content: '회원 목록 본문' } }],
  },
}

describe('renderComposed', () => {
  it('레이아웃 껍데기를 그린다', () => {
    const html = renderToStaticMarkup(renderComposed(layout, page))
    expect(html).toContain('헤더 영역')
    expect(html).toContain('회원관리')
  })

  it('페이지를 Slot 자리에 주입한다', () => {
    const html = renderToStaticMarkup(renderComposed(layout, page))
    const slotIndex = html.indexOf('data-wb-id="n_lay000000005"')
    const pageIndex = html.indexOf('회원 목록 본문')
    expect(slotIndex).toBeGreaterThan(-1)
    expect(pageIndex).toBeGreaterThan(slotIndex)
  })

  it('페이지 루트 노드가 결과에 포함된다', () => {
    const html = renderToStaticMarkup(renderComposed(layout, page))
    expect(html).toContain('data-wb-id="n_pag000000001"')
  })

  it('구조 지정을 레이아웃과 페이지 양쪽에 적용한다', () => {
    const html = renderToStaticMarkup(
      renderComposed(layout, page, { structures: { Text: 'default' } }),
    )
    expect(html).toContain('data-wb-structure="default"')
  })

  it('Slot이 없는 레이아웃이면 페이지가 나타나지 않는다', () => {
    const noSlot: LayoutDocument = {
      version: 1,
      root: { id: 'n_lay000000009', type: 'Page', children: [] },
    }
    const html = renderToStaticMarkup(renderComposed(noSlot, page))
    expect(html).not.toContain('회원 목록 본문')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run packages/renderer/test/compose.test.tsx
```
Expected: FAIL — 모듈 없음

- [ ] **Step 3: compose.tsx 구현**

`packages/renderer/src/compose.tsx`:
```tsx
import type { LayoutDocument, PageDocument } from '@wirebound/schema'
import type { ReactElement } from 'react'
import { renderDocument, type RenderOptions } from './render'

/**
 * 레이아웃 껍데기에 페이지를 주입해 완성된 목업을 그린다.
 * 페이지는 레이아웃의 Slot 자리에 들어간다.
 */
export function renderComposed(
  layout: LayoutDocument,
  page: PageDocument,
  options: RenderOptions = {},
): ReactElement {
  const slot = renderDocument(page, options)
  return renderDocument(layout, { ...options, slot })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run packages/renderer/test/compose.test.tsx
```
Expected: 5 passed

- [ ] **Step 5: 공개 API에 노출**

`packages/renderer/src/index.ts` 끝에 추가:
```ts
export { renderComposed } from './compose'
```

- [ ] **Step 6: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 레이아웃과 페이지를 합성하는 렌더링 추가"
```

---

### Task 13: playground 앱

두 패키지가 실제로 동작하는지 눈으로 확인하는 최소 하네스다. 에디터가 아니다.

**Files:**
- Create: `apps/playground/package.json`
- Create: `apps/playground/vite.config.ts`
- Create: `apps/playground/tsconfig.json`
- Create: `apps/playground/index.html`
- Create: `apps/playground/src/main.tsx`
- Create: `apps/playground/src/sample.ts`
- Create: `apps/playground/src/debug.css`
- Test: `apps/playground/test/sample.test.ts`

**Interfaces:**
- Consumes: `@wirebound/schema`의 `installCatalog`·`validatePage`·`validateLayout`, `@wirebound/renderer`의 `installStructures`·`renderComposed`
- Produces: `pnpm --filter @wirebound/playground dev`로 뜨는 확인용 페이지

- [ ] **Step 1: 앱 설정 파일 작성**

`apps/playground/package.json`:
```json
{
  "name": "@wirebound/playground",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@wirebound/renderer": "workspace:*",
    "@wirebound/schema": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
```

`apps/playground/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
})
```

`apps/playground/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "jsx": "react-jsx" },
  "include": ["src", "test", "vite.config.ts"]
}
```

`apps/playground/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>wirebound playground</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

설치:
```bash
pnpm install
```

- [ ] **Step 2: 샘플 문서 테스트 작성**

`apps/playground/test/sample.test.ts`:
```ts
import { installCatalog, validateLayout, validatePage } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { sampleLayout, samplePage } from '../src/sample'

beforeAll(() => {
  installCatalog()
})

describe('샘플 문서', () => {
  it('레이아웃이 검증을 통과한다', () => {
    expect(validateLayout(sampleLayout)).toEqual([])
  })

  it('페이지가 검증을 통과한다', () => {
    expect(validatePage(samplePage)).toEqual([])
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
pnpm vitest run apps/playground/test/sample.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 샘플 문서 작성**

`apps/playground/src/sample.ts`:
```ts
import type { LayoutDocument, PageDocument } from '@wirebound/schema'

export const sampleLayout: LayoutDocument = {
  version: 1,
  root: {
    id: 'n_lay000000001',
    type: 'Page',
    children: [
      {
        id: 'n_lay000000002',
        type: 'Flex',
        props: { direction: 'row', align: 'center', justify: 'between' },
        children: [
          { id: 'n_lay000000003', type: 'Text', props: { content: 'ACME 관리자', role: 'h3' } },
          { id: 'n_lay000000004', type: 'Button', variant: 'ghost', props: { label: '로그아웃' } },
        ],
      },
      { id: 'n_lay000000005', type: 'Divider' },
      {
        id: 'n_lay000000006',
        type: 'Flex',
        props: { direction: 'row', align: 'stretch' },
        children: [
          {
            id: 'n_lay000000007',
            type: 'Tree',
            props: { items: ['회원 관리', '권한 관리', '통계'], depth: 2 },
          },
          { id: 'n_lay000000008', type: 'Slot' },
        ],
      },
    ],
  },
}

export const samplePage: PageDocument = {
  version: 1,
  root: {
    id: 'n_pag000000001',
    type: 'Page',
    children: [
      { id: 'n_pag000000002', type: 'Text', props: { content: '회원 목록', role: 'h1' } },
      {
        id: 'n_pag000000003',
        type: 'SearchForm',
        marker: 1,
        children: [
          { id: 'n_pag000000004', type: 'Field', props: { label: '아이디', control: 'text' } },
          { id: 'n_pag000000005', type: 'Field', props: { label: '가입일', control: 'dateRange' } },
        ],
      },
      {
        id: 'n_pag000000006',
        type: 'List',
        marker: 2,
        props: {
          columns: ['No', '아이디', '이름', '상태'],
          items: 5,
          pagination: true,
        },
        interactions: [
          {
            on: 'select',
            actions: [
              { type: 'navigate', target: 'page:관리자/회원/상세' },
            ],
          },
        ],
      },
    ],
  },
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm vitest run apps/playground/test/sample.test.ts
```
Expected: 2 passed

- [ ] **Step 6: 확인용 스타일과 부트스트랩 작성**

`apps/playground/src/debug.css`:
```css
/* P0 확인용 최소 스타일. 실제 테마는 P4a에서 CSS로 컴파일된다. */
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #1f2937; }
[data-wb-component] { outline: 1px dashed #cbd5e1; outline-offset: -1px; }
[data-wb-component="Page"] { padding: 12px; }
[data-wb-component="Slot"] { flex: 1; padding: 12px; }
[data-wb-component="Tree"] { width: 200px; list-style: none; margin: 0; padding: 12px; }
[data-wb-component="List"] { width: 100%; border-collapse: collapse; }
[data-wb-part="cell"] { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
[data-wb-part="header"] [data-wb-part="cell"] { background: #f9fafb; font-weight: 600; }
[data-wb-part="control"] { border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; min-width: 140px; }
[data-wb-component="Field"] { display: inline-flex; gap: 6px; align-items: center; margin-right: 12px; }
[data-wb-component="SearchForm"] { display: flex; gap: 12px; align-items: center; padding: 12px 0; }
[data-wb-component="Button"][data-wb-state~="disabled"] { opacity: 0.5; }
```

`apps/playground/src/main.tsx`:
```tsx
import { installCatalog, validateLayout, validatePage } from '@wirebound/schema'
import { installStructures, renderComposed } from '@wirebound/renderer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './debug.css'
import { sampleLayout, samplePage } from './sample'

installCatalog()
installStructures()

const issues = [...validateLayout(sampleLayout), ...validatePage(samplePage)]
if (issues.length > 0) {
  console.error('샘플 문서 검증 실패', issues)
}

const container = document.getElementById('root')
if (!container) throw new Error('#root를 찾을 수 없습니다')

createRoot(container).render(
  <StrictMode>{renderComposed(sampleLayout, samplePage)}</StrictMode>,
)
```

- [ ] **Step 7: 개발 서버로 눈으로 확인**

```bash
pnpm --filter @wirebound/playground dev
```
브라우저에서 표시된 주소를 열고 다음을 확인한다:
- 상단에 "ACME 관리자"와 "로그아웃" 버튼이 가로로 배치돼 있다
- 왼쪽에 트리 3개 항목이 있다
- 오른쪽 Slot 영역에 "회원 목록" 제목, 검색폼 2개 필드, 4열 5행 테이블이 보인다
- 개발자 도구에서 요소를 찍으면 `data-wb-id` · `data-wb-component` · `data-wb-structure` · `data-wb-part`가 보인다
- 콘솔에 검증 실패 로그가 없다

확인 후 서버를 종료한다.

- [ ] **Step 8: 빌드 확인**

```bash
pnpm --filter @wirebound/playground build
```
Expected: 에러 없이 `dist/` 생성

- [ ] **Step 9: 전체 테스트와 타입체크**

```bash
pnpm test && pnpm typecheck
```
Expected: 모두 통과

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: 스키마·렌더러 확인용 playground 앱 추가"
```

---

## P0 완료 기준

- [ ] `pnpm test`가 전부 통과한다
- [ ] `pnpm typecheck`가 에러 없이 끝난다
- [ ] `pnpm --filter @wirebound/playground dev`로 샘플 목업이 그려진다
- [ ] 패치 왕복 속성 테스트가 300회 반복에서 통과한다
- [ ] 카탈로그 19종 모두 기본 구조 구현을 갖는다

## P0에서 의도적으로 하지 않은 것

이것들은 다음 단계로 미룬 것이지 빠뜨린 것이 아니다.

| 항목 | 담당 단계 |
|---|---|
| 서버·DB·인증·권한 | P1 |
| 에디터 UI (트리·캔버스·속성 패널) | P2 |
| revision 저장·개인 undo | P2 |
| WebSocket 실시간 동기화·소프트 잠금 | P3 |
| 테마 규격·CSS 컴파일 | P4a |
| 기본 외의 구조 구현체, 시스템 테마 | P4b |
| 코멘트·상호작용 실행 | P5 |
| 스냅샷 | P6 |
| 프리셋·JSON 가져오기/내보내기 | P7 |
| HTML 번들 내보내기 | P8 |

`marker`와 `interactions`는 P0에서 **타입과 검증만** 갖춘다. 화면에 표시하거나 실행하는 것은 P5다.
