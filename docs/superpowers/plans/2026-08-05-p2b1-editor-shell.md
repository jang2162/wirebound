# P2b-1 에디터 셸 (읽기 전용) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인해서 프로젝트를 열고, 메뉴·페이지 트리에서 페이지를 골라, 그 설계서를 3분할 화면의 캔버스에서 볼 수 있게 한다.

**Architecture:** `apps/web`은 Vite + React 19 SPA다. 서버와의 대화는 `ApiClient` 인터페이스 하나를 통과하고(구현은 `fetch`, 테스트는 가짜 주입), 화면은 `react-router`가 URL로 관리하며, 캔버스는 `@wirebound/renderer`를 그대로 쓴다. **이 단계는 아무것도 편집하지 않는다** — 선택 상태는 만들지만 문서를 바꾸는 경로는 P2b-2가 만든다.

**Tech Stack:** TypeScript(ESM, strict + `noUncheckedIndexedAccess`) · React 19 · Vite 6 · react-router 7 · vitest 3 + React Testing Library + jsdom · `@wirebound/schema` · `@wirebound/renderer`

## Global Constraints

설계 문서 `docs/superpowers/specs/2026-08-03-wirebound-design.md`와 `apps/api/README.md`가 이 계획의 근거다. 특히 **README의 엔드포인트 표가 P2b가 근거로 삼는 계약**이라고 README 스스로 선언한다 — 서버 동작이 궁금하면 코드가 아니라 그 표를 먼저 본다.

- **의존 방향은 한 방향이다:** `schema` ← `renderer` ← `apps/web`. `apps/web`이 `apps/api`를 import하지 않는다(같은 저장소지만 HTTP 경계 너머다).
- **`packages/schema`는 zod 외 런타임 의존을 갖지 않는다.** 브라우저와 Node 양쪽에서 돈다.
- **사용자 대면 메시지와 주석은 전부 한국어.** 주변 코드의 주석 밀도·어투(무엇이 아니라 왜를 설명한다)를 따른다.
- Node ≥ 22.9.0, ESM only, TypeScript strict + `noUncheckedIndexedAccess`, `moduleResolution: bundler`, `verbatimModuleSyntax`. `pnpm typecheck`가 exit 0이어야 한다.
- **`pnpm test`가 초록이어야 한다.** 현재 706 tests / 40 files.
- 커밋할 파일은 **경로로 명시해서** stage한다. `git add -A` 금지 — 이 저장소는 여러 작업이 병렬로 돈다.

## 이 단계가 만들지 않는 것

의도적으로 뺀 것들이다. 리뷰어가 "왜 없냐"고 묻지 않도록 여기 적어 둔다.

- **편집.** 속성 패널의 입력, 노드 추가·삭제·이동, 낙관적 적용, pending 큐, undo/redo — 전부 **P2b-2**다. 이 단계의 우측 패널은 선택 노드의 속성을 **읽기 전용으로 보여줄 뿐**이다.
- **드래그 정렬.** 메뉴·페이지 트리와 구조 트리의 드래그(설계 §9)는 편집이므로 P2b-2다.
- **코멘트·번호 마커·상호작용 탭.** P5다. 우측 패널은 이 단계에서 탭이 하나(속성)뿐이다.
- **테마 전환 드롭다운·테마 CSS.** P4a다. 캔버스는 테마 없이 렌더러의 기본 구조만 그린다.
- **상호작용 런타임.** 뷰 모드에서 상호작용이 실제로 동작하는 것은 P5다. 이 단계의 모드 토글은 **선택 아웃라인과 구조 트리의 표시 여부만** 가른다.
- **회원가입 화면.** 서버에 `POST /api/auth/signup`이 있지만 이 단계는 로그인만 만든다. 계정 발급은 지금 수동이다(설계 §10이 "팀이 자체 호스팅하는 도구"라고 못박았다).
- **프로젝트·메뉴·페이지 생성/수정 화면.** 서버에 엔드포인트가 있지만 이 단계는 **읽기 전용**이다.
- **레이아웃 합성(`renderComposed`).** 레이아웃 리소스는 P4a가 만든다. 캔버스는 `renderDocument`로 페이지만 그린다.

## 설계 결정 (계획 단계에서 확정)

구현자가 다시 고민하지 않도록 근거와 함께 못 박는다.

**D1. 편집 상태는 React를 모르는 순수 TypeScript 스토어다.** P2b-2가 만들 편집 상태 머신(문서·pending 큐·undo/redo 스택·baseSeq)이 이 단계의 선택 상태와 같은 스토어에 산다. React에는 `useSyncExternalStore`로 붙인다. **그래야 상태 로직을 브라우저 없이 단위 테스트할 수 있다** — P2a가 파이프라인을 HTTP 없이 테스트한 것과 같은 구조다. 이 단계는 그 스토어의 뼈대와 선택 상태만 만든다.

**D2. 서버와의 대화는 `ApiClient` 인터페이스 하나를 통과한다.** 구현은 `createHttpClient(baseUrl)`이고, 테스트는 가짜 객체를 주입한다. **컴포넌트가 `fetch`를 직접 부르는 곳이 하나도 없어야 한다.** 서버 계약이 갈라지는 것은 타입과 README가 막는다.

**D3. 세션 쿠키는 JS가 읽을 수 없다(HttpOnly).** 로그인 여부를 아는 유일한 방법은 `GET /api/auth/me`다 — 200이면 로그인, 401이면 아니다. **`localStorage`에 로그인 상태를 캐시하지 않는다.** 캐시하면 서버가 세션을 지운 뒤에도 로그인된 것처럼 보인다.

**D4. `fetch`는 `credentials: 'include'`가 필요하다.** 개발 중에는 Vite dev 서버(5173)와 API(3000)가 다른 오리진이라 그렇다. Vite 프록시로 같은 오리진처럼 보이게 하는 방법도 있지만, 운영 배포 형태가 아직 정해지지 않았으므로 **프록시를 쓴다** — 그러면 `credentials`가 `same-origin`으로 충분하고 CORS 설정이 서버에 필요 없다. 서버는 지금 CORS 헤더를 내지 않는다(P1이 만들지 않았다).

**D5. 에러 봉투는 하나뿐이다.** `{ error: { code, message, issues? } }`. `ApiError` 클래스가 `status`·`code`·`message`·`issues`를 담아 던진다. 화면은 `code`로 분기한다 — `unauthenticated`면 로그인으로, `not-found`면 "없음", `forbidden`면 "권한 없음". **HTTP 상태 숫자로 분기하지 않는다**(같은 404가 "없음"과 "비멤버" 둘 다이고, 그 구분을 서버가 의도적으로 숨긴다 — 설계 §10).

**D6. 라우트는 넷이다.** `/login`, `/`(프로젝트 목록), `/projects/:projectId`(페이지 미선택 셸), `/projects/:projectId/pages/:pageId`(페이지 선택 셸). **id가 URL에 있어야 새로고침과 공유가 된다.**

**D7. 셸 CSS는 캔버스 안으로 새어 들어가면 안 된다.** 캔버스 내용의 외형은 P4a의 테마 CSS가 전담한다. 셸의 모든 클래스에 `wb-shell-` 접두어를 붙이고, **자손 선택자·요소 선택자(`div`, `button`)를 쓰지 않는다.** 캔버스 컨테이너 안쪽을 겨냥하는 셸 규칙이 하나도 없어야 한다.

**D8. 렌더러가 던지지 않게 고친다(P0 이월 6번).** 지금 `render.tsx`의 `def.props.parse(...)`는 raw `ZodError`를 던지고, 메시지가 영문이며, **노드 하나가 React 서브트리 전체를 죽인다.** `requireComponent`·`requireStructure`도 던진다. `safeParse` + 한국어 로케일로 바꾸고 실패한 노드 자리에 **눈에 보이는 폴백**을 렌더한다. **이 단계에서 고치는 이유:** P2b-2가 서버 검증 **전에** 낙관적 패치를 적용하므로(설계 §7.1) 일시적으로 유효하지 않은 문서가 정상 상태가 된다. 캔버스를 그 위에 짓기 전에 고쳐야 한다.

**D9. 모드 토글은 표시만 가른다.** 편집 모드에서는 선택 아웃라인과 좌하 구조 트리가 보이고, 뷰 모드에서는 구조 트리가 접혀 메뉴 트리가 좌측 전체를 쓴다(설계 §9). **이 단계에서 "편집 모드"가 실제로 편집을 뜻하지는 않는다.**

**D10. 뷰포트 프리셋과 줌은 편집이 아니라 확인이다**(설계 §9). 페이지 스키마에는 반응형 분기가 없다. 프리셋은 `1920 / 1440 / 1280 / 1024 / 768 / 375`, 기본 `1280`. 줌은 캔버스 컨테이너에 CSS `transform: scale()`로 건다 — **문서를 건드리지 않는다.**

## 파일 구조

**새로 만드는 것**

| 파일 | 책임 |
|---|---|
| `apps/web/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` | Vite + React 19 앱 골격 |
| `apps/web/src/main.tsx` | 진입점. 라우터 마운트 |
| `apps/web/src/api/types.ts` | 서버 응답 타입(README 계약을 TypeScript로) |
| `apps/web/src/api/client.ts` | `ApiClient` 인터페이스 + `ApiError` |
| `apps/web/src/api/http-client.ts` | `fetch` 구현 |
| `apps/web/src/api/context.tsx` | `ApiClient`를 React에 주입하는 컨텍스트 |
| `apps/web/src/store/editor-store.ts` | 순수 TS 스토어(선택 상태·모드·뷰포트). React를 모른다 |
| `apps/web/src/store/use-editor-store.ts` | `useSyncExternalStore` 바인딩 |
| `apps/web/src/routes/login.tsx` | 로그인 화면 |
| `apps/web/src/routes/project-list.tsx` | 프로젝트 목록 |
| `apps/web/src/routes/editor.tsx` | 3분할 셸 |
| `apps/web/src/panels/menu-tree.tsx` | 좌상 메뉴·페이지 트리 |
| `apps/web/src/panels/structure-tree.tsx` | 좌하 구조 트리 |
| `apps/web/src/panels/property-panel.tsx` | 우측 속성 패널(읽기 전용) |
| `apps/web/src/canvas/canvas.tsx` | 캔버스 + 뷰포트·줌 |
| `apps/web/src/shell.css` | 셸 크롬 스타일(`wb-shell-` 접두어) |
| `apps/web/test/**` | 테스트 |

**고치는 것**

| 파일 | 무엇을 |
|---|---|
| `packages/renderer/src/render.tsx` | `parse` → `safeParse`, 던지지 않고 폴백 렌더 (D8) |
| `packages/renderer/src/fallback.tsx` (신규) | 폴백 노드 |
| `packages/renderer/src/index.ts` | 새 타입·함수 export |
| `vitest.config.ts` | `web` 프로젝트 추가(jsdom) |
| `tsconfig.json` | `apps/web` 참조 추가 |
| `apps/api/package.json` 또는 루트 | 개발 시 두 서버를 함께 띄우는 스크립트 |

## 실행 시 유의 — 모든 디스패치에 붙일 것

P2a가 남긴 프로세스 관찰(`docs/superpowers/plans/2026-08-04-p2a-carryforward.md`)이 그대로 적용된다. 요지만 옮긴다.

**이 저장소의 지배적 실패는 "테스트가 이름이 주장하는 것을 검사하지 않는다"였다.** 실제 사례: 인증 우회가 44개 초록 뒤에 숨었고, 세이브포인트 래퍼 둘을 통째로 지워도 600개가 초록이었으며, 404 테스트 둘이 "라우트가 없어도 404가 난다"는 이유로 가짜 초록이었고, `limit 기본값은 50이다`가 기본값이 3 이상이면 어떤 값이어도 통과했다.

따라서 모든 태스크에서:

1. **테스트마다 물어라: "이름이 가리키는 것이 깨져도 통과할까?"** 통과하면 보고서에 솔직히 적는다.
2. **변이 검사를 돌리고 어느 이름의 테스트가 실패했는지 보고한다.** 실패한 테스트 이름을 못 대는 변이는 아무것도 증명하지 못한다.
3. **양성 대조를 붙인다.** "없을 때 X가 안 보인다"를 단언하면 "있을 때는 보인다"도 같은 테스트에 넣는다 — 렌더가 통째로 깨져도 초록인 상황을 막는다.

**주석 규칙(P2a에서 네 번 깨진 것):** "이것이 X를 증명한다"고 쓰기 전에 코드로 성립하는지 확인한다. 거짓 근거 주석을 고칠 때는 **새 문장을 쓰지 말고 그 문장을 삭제만 한다.**

**계획의 사실 오류를 발견하면 그것이 유용한 산출물이다.** P2a에서 20건 넘게 나왔다. 의도가 요구하는 것을 구현하고 무엇이 틀렸는지 보고서에 명확히 적는다 — 조용히 범위를 넓히지도, 틀린 줄 알면서 계획대로 하지도 않는다.

---

### Task 1: `apps/web` 골격과 vitest `web` 프로젝트

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/test/smoke.test.tsx`
- Modify: `vitest.config.ts`, `tsconfig.json`(루트), `apps/api/README.md`(명령 요약)

**Interfaces:**
- Produces: `apps/web`이 `pnpm --filter @wirebound/web dev`로 뜨고, `pnpm test`가 `web` 프로젝트를 함께 돈다.

- [ ] **Step 1: 실패하는 스모크 테스트를 먼저 쓴다**

`apps/web/test/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../src/app'

describe('앱 골격', () => {
  it('앱을 렌더하면 제품 이름이 보인다', () => {
    render(<App />)
    expect(screen.getByText('wirebound')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

`pnpm vitest run apps/web/test/smoke.test.tsx` → 모듈 없음으로 실패.

- [ ] **Step 3: 패키지와 설정을 만든다**

`apps/web/package.json`:

```json
{
  "name": "@wirebound/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@wirebound/renderer": "workspace:*",
    "@wirebound/schema": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "vite": "^6.0.0"
  }
}
```

`@testing-library/jest-dom`을 넣지 않는다 — `toBeInTheDocument` 같은 커스텀 매처 없이 vitest 기본 단언(`expect(x).toBeTruthy()`, `expect(el.textContent).toBe(...)`)으로 충분하고, 매처 패키지는 설정 파일을 하나 더 요구한다.

`apps/web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 중 API를 같은 오리진으로 보이게 한다(설계 결정 D4).
    // 그래야 쿠키가 same-origin으로 실리고 서버에 CORS 설정이 필요 없다.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
})
```

`3001`은 `apps/api/src/config.ts:49`의 `PORT` 기본값을 확인한 값이다. `.env`로 바꿀 수 있으므로, 개발자가 다른 포트를 쓰면 이 프록시도 함께 바꿔야 한다는 것을 주석에 적어라.

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": ".tsbuild",
    "composite": true,
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "test", "vite.config.ts"],
  "references": [{ "path": "../../packages/schema" }, { "path": "../../packages/renderer" }]
}
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>wirebound</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/app.tsx`:

```tsx
/** 앱 루트. 태스크 4가 여기에 라우터를 얹는다. */
export function App() {
  return <h1>wirebound</h1>
}
```

`apps/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'

const root = document.getElementById('root')
if (!root) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: vitest에 `web` 프로젝트를 더한다**

`vitest.config.ts`의 `projects` 배열에 항목을 더한다. **기존 `shared` 객체를 그대로 스프레드한다** — 프로젝트마다 별도 Vite 설정이라 상속되지 않는다(그 파일의 기존 주석이 설명한다).

```ts
      {
        ...shared,
        test: {
          name: 'web',
          include: ['apps/web/test/**/*.test.{ts,tsx}'],
          // React 컴포넌트를 렌더하므로 DOM이 필요하다. api·unit 프로젝트는
          // DOM이 없어야 하므로(노드 전용 코드가 DOM 전역에 기대지 않도록)
          // 이 프로젝트에만 jsdom을 건다.
          environment: 'jsdom',
        },
      },
```

루트 `package.json`의 `test` 스크립트에 `--project web`을 더한다:

```json
    "test": "vitest run --project unit --project api --project web",
    "test:watch": "vitest --project unit --project api --project web",
```

루트 `tsconfig.json`의 `references`에 `{ "path": "./apps/web" }`을 더한다.

- [ ] **Step 5: 통과 확인**

```bash
pnpm install
pnpm vitest run apps/web/test/smoke.test.tsx
pnpm test          # 707 tests가 되어야 한다 (706 + 1)
pnpm typecheck
```

`pnpm --filter @wirebound/web dev`가 실제로 뜨는지도 한 번 확인해라(포트가 열리면 Ctrl-C).

- [ ] **Step 6: 변이 검사**

`vitest.config.ts`의 `web` 프로젝트에서 `environment: 'jsdom'`을 빼고 → 스모크 테스트가 `document is not defined`로 실패해야 한다. 되돌린다.

- [ ] **Step 7: README 명령 요약에 한 줄 더하고 커밋**

`apps/api/README.md`의 "명령 요약"에:

```
pnpm --filter @wirebound/web dev                   # 에디터 개발 서버 (API가 떠 있어야 한다)
```

```bash
git add apps/web vitest.config.ts tsconfig.json package.json pnpm-lock.yaml apps/api/README.md
git status
git commit -m "feat(web): Vite + React 앱 골격과 vitest web 프로젝트"
```

---

### Task 2: `ApiClient` 인터페이스와 HTTP 구현

**Files:**
- Create: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts`, `apps/web/src/api/http-client.ts`, `apps/web/test/api/http-client.test.ts`
- Test: `apps/web/test/api/http-client.test.ts`

**Interfaces:**
- Consumes: 없음(서버 계약은 `apps/api/README.md`의 엔드포인트 표다)
- Produces:

```ts
// api/types.ts
export interface SessionUser { id: string; email: string; name: string }
export interface ProjectSummary { id: string; name: string; slug: string; description: string | null }
export interface ProjectDetail extends ProjectSummary { role: 'owner' | 'editor' | 'viewer' }
export interface TreePage { id: string; title: string; sortOrder: number }
export interface TreeMenuNode {
  id: string; title: string; sortOrder: number
  pages: TreePage[]; children: TreeMenuNode[]
}
export interface PageDetail {
  id: string; menuNodeId: string; title: string; description: string | null
  sortOrder: number; schemaVersion: number; headSeq: number; schema: PageDocument
}

// api/client.ts
export interface ApiClient {
  login(email: string, password: string): Promise<SessionUser>
  logout(): Promise<void>
  me(): Promise<SessionUser>
  listProjects(): Promise<ProjectSummary[]>
  getProject(projectId: string): Promise<ProjectDetail>
  getTree(projectId: string): Promise<TreeMenuNode[]>
  getPage(projectId: string, pageId: string): Promise<PageDetail>
}

export type ApiErrorCode =
  | 'bad-request' | 'unauthenticated' | 'forbidden'
  | 'not-found' | 'conflict' | 'validation-failed' | 'internal'

export interface ApiErrorIssue { path: string; message: string; code?: string; nodeId?: string | null }

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly issues: ApiErrorIssue[]
  constructor(status: number, code: ApiErrorCode, message: string, issues?: ApiErrorIssue[])
}

// api/http-client.ts
export function createHttpClient(fetchImpl?: typeof fetch): ApiClient
```

- [ ] **Step 1: 테스트를 먼저 쓴다**

`apps/web/test/api/http-client.test.ts`. **가짜 `fetch`를 주입한다** — 네트워크를 타지 않는다.

행 하나 = `it` 하나:

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `login은 이메일과 비밀번호를 POST하고 사용자를 돌려준다` | URL `/api/auth/login`, method POST, 본문 JSON, 반환값 |
| 2 | `getTree는 봉투를 벗겨 배열을 돌려준다` | 서버가 `{ menu: [...] }`를 주면 클라이언트는 배열을 반환 |
| 3 | `모든 요청에 credentials: 'same-origin'이 붙는다` | 가짜 fetch가 받은 init 확인 |
| 4 | `204 응답은 본문을 파싱하지 않는다` | `logout()`이 던지지 않는다 |
| 5 | `에러 봉투를 ApiError로 바꾼다` | 401 + `{error:{code:'unauthenticated',message:'로그인이 필요합니다'}}` → `ApiError`의 `status`·`code`·`message` 셋 다 |
| 6 | `issues가 있으면 그대로 싣는다` | 422 + issues 배열 → `err.issues`가 `toEqual` |
| 7 | `issues가 없으면 빈 배열이다` | `err.issues`가 `[]`(undefined 아님) |
| 8 | `봉투가 아닌 응답도 ApiError로 바꾼다` | 500 + HTML 본문 → 던지되 `code`가 `internal` |
| 9 | `getPage는 headSeq를 그대로 싣는다` | P2b-2가 이 필드를 baseSeq로 쓴다 |

**케이스 8이 중요하다.** 프록시나 리버스 프록시가 502 HTML을 낼 수 있고, 그때 `response.json()`이 던지면 화면이 "SyntaxError"를 보여준다. 봉투 파싱 실패는 `internal`로 흡수한다.

**케이스 3의 판별:** `credentials`를 지워도 jsdom에서는 아무것도 안 깨진다. 가짜 fetch가 받은 `init` 객체를 직접 단언해야 한다.

- [ ] **Step 2: 실패를 확인한다**

`pnpm vitest run apps/web/test/api/http-client.test.ts`

- [ ] **Step 3: 구현한다**

계약:

- `createHttpClient(fetchImpl = globalThis.fetch)` — 테스트가 가짜를 주입한다.
- 모든 요청에 `credentials: 'same-origin'`, `headers: { 'content-type': 'application/json' }`(본문이 있을 때만).
- 응답 처리 순서: `res.ok`면 204는 `undefined`, 그 밖은 `res.json()`. `res.ok`가 아니면 봉투를 파싱해 `ApiError`를 던지되, **파싱이 실패하면 `new ApiError(res.status, 'internal', '서버 응답을 이해할 수 없습니다')`**.
- `getTree`는 `{ menu }` 봉투를 벗긴다 — **호출자는 배열만 본다**(README가 그 엔드포인트만 봉투를 쓴다고 적고 있고, 그 관용구를 앱 안으로 들이지 않는다).
- `ApiError`는 `Error`를 상속하고 `name = 'ApiError'`.

`api/types.ts`의 `PageDetail.schema`는 `@wirebound/schema`의 `PageDocument`를 그대로 쓴다 — **서버가 봉투를 검증해서 보내므로 여기서 다시 검증하지 않는다.**

- [ ] **Step 4: 통과 확인과 변이 검사**

| 깨뜨릴 것 | 실패해야 하는 케이스 |
|---|---|
| `credentials` 옵션 제거 | 3 |
| `{ menu }` 벗기기 제거 | 2 |
| 봉투 파싱 실패의 try/catch 제거 | 8 |
| `issues ?? []`를 `issues`로 | 7 |

각각 되돌리고 초록을 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/api apps/web/test/api
git status
git commit -m "feat(web): ApiClient 인터페이스와 fetch 구현"
```

---

### Task 3: 렌더러가 던지지 않게 한다 (P0 이월 6번)

**Files:**
- Create: `packages/renderer/src/fallback.tsx`
- Modify: `packages/renderer/src/render.tsx`, `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/fallback.test.tsx`

**Interfaces:**
- Consumes: `@wirebound/schema`의 `getComponent`·`getKoreanErrorMap`·`ValidationIssue`
- Produces:

```ts
// render.ts의 RenderOptions에 추가
export interface RenderOptions {
  structures?: Record<string, string>
  slot?: ReactNode
  /** 노드 렌더에 실패할 때마다 불린다. 앱이 배너 등으로 알릴 때 쓴다. */
  onNodeError?: (error: NodeRenderError) => void
}

export interface NodeRenderError {
  nodeId: string
  type: string
  /** 한국어 메시지. 사용자에게 그대로 보여도 된다. */
  message: string
}
```

- [ ] **Step 1: 테스트를 먼저 쓴다**

`packages/renderer/test/fallback.test.tsx`. **`render.test.tsx`의 관례를 그대로 따라라** — 확인한 결과 그 파일은 jsdom이 아니라 `react-dom/server`의 `renderToStaticMarkup`으로 문자열 마크업을 만들고, `beforeAll`에서 `installCatalog()` + `resetStructures()` 뒤 필요한 구조를 직접 등록한다. **RTL을 쓰지 마라** — 이 테스트는 `unit` 프로젝트(DOM 없음)에서 돌고, 그게 렌더러가 브라우저에 묶이지 않았다는 증거이기도 하다.

따라서 단언은 마크업 문자열에 대해 한다(`expect(html).toContain('data-wb-error')` 같은). 속성 값을 정밀하게 봐야 하면 문자열에서 뽑아라.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `알 수 없는 타입은 던지지 않고 폴백을 그린다` | `type: 'NoSuchThing'` → 던지지 않고 `data-wb-error`가 있는 엘리먼트 |
| 2 | `폴백 메시지는 한국어다` | 메시지에 한글이 있고 `Too small` 같은 영문 zod 문구가 없다 |
| 3 | `props가 잘못돼도 형제 노드는 정상으로 그려진다` | 자식 둘 중 하나만 깨뜨림 → 나머지 하나의 `data-wb-component`가 살아 있다 |
| 4 | `깨진 노드의 자식은 폴백 안에 그대로 그려진다` | 서브트리가 통째로 사라지지 않는다 |
| 5 | `구현되지 않은 구조도 폴백이다` | 등록 안 된 `(type, structure)` 조합 |
| 6 | `onNodeError가 노드마다 불린다` | 깨진 노드 둘 → 두 번, `nodeId`가 각각 맞다 |
| 7 | `정상 문서는 폴백을 그리지 않고 onNodeError도 안 부른다` | **양성 대조** — 폴백이 항상 나오는 회귀를 잡는다 |
| 8 | `폴백에도 data-wb-id가 있다` | 캔버스의 선택 로직이 id로 노드를 찾으므로 |

**케이스 3이 P0 이월 6번의 핵심이다** — "노드 하나가 서브트리를 죽인다"를 정면으로 겨냥한다.
**케이스 7이 없으면** 폴백을 무조건 그리는 구현도 1~6을 통과한다.

- [ ] **Step 2: 실패를 확인한다**

`pnpm vitest run packages/renderer/test/fallback.test.tsx` → 지금은 `requireComponent`가 던져서 실패한다.

- [ ] **Step 3: 폴백을 만든다**

`packages/renderer/src/fallback.tsx`:

```tsx
import type { ReactNode } from 'react'

/**
 * 렌더할 수 없는 노드 자리에 그리는 눈에 보이는 자리표시.
 *
 * 던지지 않는 이유(설계 §7.1): P2b의 에디터는 서버 검증 **전에** 낙관적 패치를
 * 적용하므로 일시적으로 유효하지 않은 문서가 정상 상태다. 한 노드가 던지면
 * React가 그 서브트리를 통째로 버려 편집 중 화면이 사라진다.
 *
 * 스타일을 인라인으로 두는 이유: 이 요소는 테마(P4a)의 어휘 밖이다. 테마가
 * 스타일할 수 있는 것은 카탈로그가 선언한 parts뿐이고(설계 §5.1), 폴백은
 * 그 목록에 없다.
 */
export function FallbackNode(props: {
  nodeId: string
  message: string
  children?: ReactNode
}) { /* … */ }
```

폴백은 `data-wb-id`(선택 로직용)와 `data-wb-error`(메시지)를 갖고, 메시지를 눈에 보이게 표시하며, `children`을 그대로 품는다.

- [ ] **Step 4: `render.tsx`를 고친다**

계약:

- `getComponent(node.type)`이 `undefined`면 → 폴백. 메시지 `알 수 없는 컴포넌트 타입: ${node.type}`.
- `def.props.safeParse(node.props ?? {}, { error: getKoreanErrorMap() })`가 실패하면 → 폴백. 메시지는 `validate.ts`의 `invalid-props` 이슈와 **같은 문안**을 쓴다(`${type}의 props가 올바르지 않습니다: …`). **두 경로가 다른 문구를 내면 사용자가 같은 문제를 다른 문제로 읽는다.**
- `getStructure(...)`가 `undefined`면 → 폴백. 메시지 `구현되지 않은 구조: ${type}:${structure}`.
- `resolveStructure`가 던지는 경우(테마가 없는 구조를 지정)도 폴백으로 흡수한다.
- **자식은 폴백 안에 그대로 렌더한다.** 부모를 못 그린다고 자식까지 버리지 않는다.
- 실패할 때마다 `options.onNodeError?.({ nodeId, type, message })`를 부른다.

**`requireComponent`·`requireStructure`는 그대로 둔다** — 다른 호출자(테스트, 앞으로의 exporter)가 "없으면 던진다"에 기대고 있을 수 있다. `render.tsx`가 `get…` 계열로 바꿔 스스로 처리한다.

- [ ] **Step 5: 통과 확인과 변이 검사**

| 깨뜨릴 것 | 실패해야 하는 케이스 |
|---|---|
| `safeParse`를 `parse`로 되돌리기 | 3(던져서 실패) |
| 폴백에서 `children` 렌더 제거 | 4 |
| `onNodeError` 호출 제거 | 6 |
| 한국어 로케일 인자 제거 | 2 |
| 정상 경로에서도 폴백 반환 | 7 |

기존 렌더러 테스트가 전부 통과해야 한다 — **하나라도 고쳐야 했다면 왜인지 보고해라.**

- [ ] **Step 6: 커밋**

```bash
git add packages/renderer/src packages/renderer/test/fallback.test.tsx
git status
git commit -m "fix(renderer): 노드 렌더 실패를 폴백으로 흡수 (P0 이월 6번)"
```

---

### Task 4: 로그인 화면과 라우팅 골격

**Files:**
- Create: `apps/web/src/api/context.tsx`, `apps/web/src/routes/login.tsx`, `apps/web/src/routes/require-auth.tsx`, `apps/web/test/routes/login.test.tsx`
- Modify: `apps/web/src/app.tsx`, `apps/web/src/main.tsx`
- Test: `apps/web/test/routes/login.test.tsx`, `apps/web/test/helpers.tsx`(신규)

**Interfaces:**
- Consumes: 태스크 2의 `ApiClient`·`ApiError`
- Produces:

```tsx
// api/context.tsx
export function ApiProvider(props: { client: ApiClient; children: ReactNode }): ReactElement
export function useApi(): ApiClient   // Provider 밖에서 부르면 던진다

// test/helpers.tsx
export function fakeApi(overrides?: Partial<ApiClient>): ApiClient
export function renderWithProviders(ui: ReactElement, options?: { client?: ApiClient; route?: string }): void
```

- [ ] **Step 1: 테스트 헬퍼와 실패하는 테스트를 먼저 쓴다**

`apps/web/test/helpers.tsx`의 `fakeApi`는 **모든 메서드가 기본적으로 던지게** 만든다 — `throw new Error('fakeApi: <메서드>가 스텁되지 않았습니다')`. 그래야 테스트가 실제로 부르는 메서드만 명시적으로 스텁하게 되고, **예상 못 한 호출이 조용히 `undefined`를 반환하지 않는다.**

`apps/web/test/routes/login.test.tsx`:

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `이메일과 비밀번호를 입력해 제출하면 login을 부른다` | 가짜가 받은 인자 |
| 2 | `로그인에 성공하면 프로젝트 목록으로 간다` | 라우터 위치가 `/` |
| 3 | `401이면 서버 메시지를 그대로 보여준다` | `ApiError`의 `message`가 화면에 |
| 4 | `실패해도 입력한 이메일은 남는다` | 재시도 시 다시 타이핑하지 않아도 된다 |
| 5 | `제출 중에는 버튼이 비활성이다` | 중복 제출 방지 |
| 6 | `이메일이 비면 제출하지 않는다` | 클라이언트 측 최소 검증 |
| 7 | `이미 로그인돼 있으면 로그인 화면 대신 목록으로 간다` | `me()`가 200 |
| 8 | `me()가 401이면 로그인 화면이 보인다` | **양성 대조** — 7의 반대 |

**케이스 3의 판별:** 하드코딩한 "로그인 실패" 문구를 보여줘도 통과하지 않게, 가짜가 던지는 메시지를 **특이한 문자열**로 두고 그것이 화면에 있는지 본다.

- [ ] **Step 2: 실패 확인 → 구현**

`ApiProvider`/`useApi`: 컨텍스트가 `null`이면 `useApi`가 던진다(**`as`로 좁히지 않는다** — Provider를 빠뜨린 실수를 조용히 넘기면 런타임에 `undefined.login`이 된다).

`require-auth.tsx`: `me()`를 부르고 `unauthenticated`면 `/login`으로 리다이렉트, 성공하면 자식을 렌더. **로딩 중에는 아무것도 렌더하지 않는다**(깜빡임 방지).

라우트 정의(D6):

```
/login                                     로그인
/                                          프로젝트 목록      (인증 필요)
/projects/:projectId                       에디터 셸          (인증 필요)
/projects/:projectId/pages/:pageId         에디터 셸 + 페이지 (인증 필요)
```

`main.tsx`가 `createHttpClient()`를 만들어 `ApiProvider`에 넣는다. **테스트는 `main.tsx`를 거치지 않는다.**

- [ ] **Step 3: 통과 확인과 변이 검사**

| 깨뜨릴 것 | 실패해야 하는 케이스 |
|---|---|
| 로그인 성공 후 navigate 제거 | 2 |
| 에러 메시지를 하드코딩 문구로 | 3 |
| 제출 중 `disabled` 제거 | 5 |
| `require-auth`의 리다이렉트 제거 | 8이 아니라 — **인증 필요 라우트에 대한 별도 케이스가 필요하다.** 없으면 추가해라 |

마지막 행이 가리키는 공백을 실제로 확인하고, 없으면 케이스를 하나 더 만들어라.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src apps/web/test
git status
git commit -m "feat(web): 로그인 화면과 인증 라우팅 골격"
```

---

### Task 5: 프로젝트 목록 화면

**Files:**
- Create: `apps/web/src/routes/project-list.tsx`, `apps/web/test/routes/project-list.test.tsx`
- Modify: `apps/web/src/app.tsx`(라우트 등록)

**Interfaces:**
- Consumes: `ApiClient.listProjects()`
- Produces: 프로젝트를 누르면 `/projects/:projectId`로 간다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `프로젝트 목록을 이름으로 보여준다` | 두 개를 주면 둘 다 |
| 2 | `프로젝트를 누르면 그 프로젝트로 간다` | 라우터 위치가 `/projects/<id>` |
| 3 | `목록이 비면 안내를 보여준다` | 빈 배열 → 안내 문구, 그리고 **에러 문구는 없다** |
| 4 | `조회에 실패하면 서버 메시지를 보여준다` | `ApiError` 메시지 |
| 5 | `로딩 중에는 목록도 빈 안내도 보이지 않는다` | 빈 배열과 로딩을 구분한다 |
| 6 | `설명이 없는 프로젝트도 그린다` | `description: null` |

**케이스 5가 중요하다.** 로딩과 "정말 비어 있음"을 구분하지 않으면 화면이 잠깐 "프로젝트가 없습니다"를 번쩍인다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

`useEffect` + 로컬 `useState` 셋(`data` | `error` | `status`)으로 충분하다. **데이터 페칭 라이브러리를 들이지 마라** — 이 단계의 화면은 셋뿐이고, P2b-2의 편집 상태는 D1의 스토어가 맡는다.

- [ ] **Step 3: 변이 검사와 커밋**

`status`를 없애고 `data.length === 0`으로만 빈 상태를 판정 → 케이스 5가 실패해야 한다.

```bash
git add apps/web/src/routes/project-list.tsx apps/web/src/app.tsx apps/web/test/routes/project-list.test.tsx
git commit -m "feat(web): 프로젝트 목록 화면"
```

---

### Task 6: 편집 상태 스토어 (선택·모드·뷰포트)

**Files:**
- Create: `apps/web/src/store/editor-store.ts`, `apps/web/src/store/use-editor-store.ts`, `apps/web/test/store/editor-store.test.ts`

**Interfaces:**
- Consumes: `@wirebound/schema`의 `PageDocument`·`WbNode`
- Produces:

```ts
export type EditorMode = 'edit' | 'view'
export const VIEWPORT_PRESETS = [1920, 1440, 1280, 1024, 768, 375] as const
export type ViewportWidth = (typeof VIEWPORT_PRESETS)[number]

export interface EditorState {
  /** 서버에서 받은 문서. P2b-2가 여기에 낙관적 패치를 적용한다. */
  document: PageDocument | null
  /** 이 문서의 최신 revision seq. P2b-2가 baseSeq로 쓴다. */
  headSeq: number
  selectedNodeId: string | null
  mode: EditorMode
  viewportWidth: ViewportWidth
  /** 0.25 ~ 2.0 */
  zoom: number
}

export class EditorStore {
  getState(): EditorState
  subscribe(listener: () => void): () => void
  loadPage(document: PageDocument, headSeq: number): void
  selectNode(nodeId: string | null): void
  setMode(mode: EditorMode): void
  setViewportWidth(width: ViewportWidth): void
  setZoom(zoom: number): void
  reset(): void
}

// use-editor-store.ts
export function useEditorStore<T>(store: EditorStore, selector: (s: EditorState) => T): T
export function EditorStoreProvider(props: { store: EditorStore; children: ReactNode }): ReactElement
export function useEditorStoreInstance(): EditorStore
```

- [ ] **Step 1: 테스트를 먼저 쓴다 — React 없이**

`apps/web/test/store/editor-store.test.ts`. **이 파일은 React를 import하지 않는다.** 그것이 D1의 요점이다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `초기 상태는 문서 없음·선택 없음·편집 모드다` | 기본값 |
| 2 | `기본 뷰포트는 1280이고 줌은 1이다` | 설계 §9 |
| 3 | `loadPage는 문서와 headSeq를 함께 넣는다` | 둘 다 |
| 4 | `loadPage는 이전 선택을 지운다` | 다른 페이지의 노드 id가 남으면 안 된다 |
| 5 | `selectNode는 구독자에게 알린다` | `subscribe` 콜백 호출 |
| 6 | `상태가 바뀌지 않으면 알리지 않는다` | 같은 id로 두 번 `selectNode` → 한 번만 |
| 7 | `getState는 매번 같은 참조를 준다(변경 없으면)` | `useSyncExternalStore`가 무한 루프에 빠지지 않는 조건 |
| 8 | `구독 해제하면 더 이상 안 알린다` | `unsubscribe()` |
| 9 | `setZoom은 0.25~2.0으로 클램프한다` | `0.1` → `0.25`, `5` → `2` |
| 10 | `setViewportWidth는 프리셋만 받는다` | 타입으로 막히지만 런타임 값도 확인 |
| 11 | `reset은 초기 상태로 돌린다` | 페이지를 떠날 때 |

**케이스 7이 이 단계에서 가장 미묘하다.** `getState()`가 매번 새 객체를 만들면 `useSyncExternalStore`가 무한 렌더에 빠진다. 상태를 불변 객체로 들고 있다가 변경 시에만 새로 만들어야 한다. **이 테스트가 그 성질을 고정한다.**

**케이스 6이 없으면** 매 호출마다 알리는 구현도 통과하고, 그러면 React가 불필요하게 리렌더한다.

- [ ] **Step 2: 실패 확인 → 구현**

계약:

- 내부 상태는 **불변 객체 하나**. 변경은 새 객체를 만들어 교체하고, 그때만 리스너를 부른다.
- 변경 여부는 필드 단위로 비교한다(같은 값이면 교체하지 않는다).
- `subscribe`는 해제 함수를 돌려준다.
- **React·DOM·`fetch`를 import하지 않는다.** 이 파일이 브라우저 밖에서 도는 것이 요점이다.

`use-editor-store.ts`는 `useSyncExternalStore(store.subscribe, () => selector(store.getState()))` 형태다. **selector의 반환값이 원시값이거나 안정된 참조여야 한다** — 그 제약을 파일 독스트링에 적어라.

- [ ] **Step 3: 통과 확인과 변이 검사**

| 깨뜨릴 것 | 실패해야 하는 케이스 |
|---|---|
| `getState`가 매번 `{...state}`를 반환 | 7 |
| 값이 같아도 항상 리스너 호출 | 6 |
| `loadPage`에서 선택 초기화 제거 | 4 |
| `setZoom`의 클램프 제거 | 9 |

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/store apps/web/test/store
git commit -m "feat(web): 편집 상태 스토어 (React 비의존)"
```

---

### Task 7: 3분할 셸 레이아웃과 모드 토글

**Files:**
- Create: `apps/web/src/routes/editor.tsx`, `apps/web/src/shell.css`, `apps/web/test/routes/editor-shell.test.tsx`
- Modify: `apps/web/src/app.tsx`, `apps/web/src/main.tsx`(CSS import)

**Interfaces:**
- Consumes: 태스크 6의 `EditorStore`, 태스크 2의 `ApiClient.getProject`
- Produces: `/projects/:projectId` 라우트가 3분할 셸을 그린다. 각 패널 자리는 이 단계에서 빈 상자이고 태스크 8·9가 채운다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `셸은 좌·중·우 세 영역을 그린다` | 세 랜드마크의 존재 |
| 2 | `편집 모드에서는 구조 트리 자리가 보인다` | 설계 §9 |
| 3 | `뷰 모드에서는 구조 트리 자리가 접힌다` | 같은 절 |
| 4 | `모드 토글을 누르면 모드가 바뀐다` | 스토어 상태 + 화면 |
| 5 | `프로젝트 이름이 셸에 보인다` | `getProject`의 결과 |
| 6 | `프로젝트 조회에 실패하면 서버 메시지를 보여준다` | 셸 대신 에러 |
| 7 | `뷰포트 프리셋 여섯 개를 고를 수 있다` | 1920·1440·1280·1024·768·375 |
| 8 | `줌을 바꾸면 스토어에 반영된다` | |

**케이스 3의 판별:** "접힌다"를 CSS 클래스만으로 표현하면 jsdom 테스트가 판별하지 못할 수 있다. **DOM에서 실제로 빠지거나 `hidden` 속성이 붙게** 하고 그것을 단언해라. 어느 쪽인지 보고서에 적어라.

- [ ] **Step 2: 실패 확인 → 구현**

레이아웃은 CSS Grid. **D7을 지켜라** — 모든 클래스에 `wb-shell-` 접두어, 자손 선택자·요소 선택자 금지. `shell.css`에 그 이유를 주석으로 적어라(캔버스 안은 P4a의 테마가 전담한다).

셸은 `EditorStore` 인스턴스를 하나 만들어 `EditorStoreProvider`로 내려 준다. **프로젝트가 바뀌면 `reset()`한다.**

- [ ] **Step 3: 셸 CSS가 캔버스로 새지 않는지 확인**

```bash
rg '^\s*[a-z]+\s*\{' apps/web/src/shell.css        # 요소 선택자가 있으면 안 된다
rg 'wb-shell-[a-z-]+\s+[.a-z]' apps/web/src/shell.css   # 자손 선택자
```

둘 다 0건이어야 한다. 결과를 보고서에 싣는다.

- [ ] **Step 4: 변이 검사와 커밋**

모드 토글의 조건을 반전 → 케이스 2·3이 함께 실패해야 한다(하나만 실패하면 둘 중 하나가 양성 대조 역할을 못 하는 것이다).

```bash
git add apps/web/src apps/web/test/routes/editor-shell.test.tsx
git commit -m "feat(web): 3분할 셸 레이아웃과 모드 토글"
```

---

### Task 8: 메뉴·페이지 트리와 페이지 로딩

**Files:**
- Create: `apps/web/src/panels/menu-tree.tsx`, `apps/web/test/panels/menu-tree.test.tsx`
- Modify: `apps/web/src/routes/editor.tsx`

**Interfaces:**
- Consumes: `ApiClient.getTree`·`getPage`, `EditorStore.loadPage`
- Produces: 페이지를 누르면 URL이 `/projects/:projectId/pages/:pageId`가 되고 스토어에 문서가 실린다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `메뉴와 그 아래 페이지를 함께 그린다` | 설계 §9 — 한 트리다 |
| 2 | `중첩 메뉴를 깊이대로 그린다` | `children`이 있는 트리 |
| 3 | `sortOrder 순서대로 그린다` | **입력 배열을 정렬 순서와 다르게 준다** — 안 그러면 정렬을 지워도 통과한다 |
| 4 | `페이지를 누르면 URL에 pageId가 실린다` | |
| 5 | `페이지를 누르면 스토어에 문서와 headSeq가 실린다` | `getPage`의 결과 |
| 6 | `선택된 페이지가 시각적으로 구분된다` | 그리고 **다른 페이지는 구분 표시가 없다**(양성 대조) |
| 7 | `URL에 pageId가 있는 채로 들어오면 그 페이지를 연다` | 새로고침·공유 |
| 8 | `페이지가 없는 메뉴도 그린다` | `pages: []` |
| 9 | `트리 조회에 실패하면 서버 메시지를 보여준다` | |
| 10 | `페이지 조회에 실패하면 트리는 남고 캔버스 자리에만 에러가 뜬다` | 한 실패가 화면 전체를 죽이지 않는다 |

**케이스 3이 이 저장소가 반복해서 놓친 함정이다** — 삽입 순서와 기대 순서가 같으면 정렬 코드를 지워도 통과한다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

트리는 재귀 컴포넌트. **키는 노드 id다**(인덱스 금지 — 정렬이 바뀌면 React가 상태를 잘못 재사용한다).

- [ ] **Step 3: 변이 검사**

| 깨뜨릴 것 | 실패해야 하는 케이스 |
|---|---|
| `sortOrder` 정렬 제거 | 3 |
| 선택 표시 제거 | 6 |
| URL의 `pageId` 초기 로딩 제거 | 7 |
| `getPage` 실패를 화면 전체 에러로 | 10 |

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/panels/menu-tree.tsx apps/web/src/routes/editor.tsx apps/web/test/panels/menu-tree.test.tsx
git commit -m "feat(web): 메뉴·페이지 트리와 페이지 로딩"
```

---

### Task 9: 캔버스, 구조 트리, 읽기 전용 속성 패널

**Files:**
- Create: `apps/web/src/canvas/canvas.tsx`, `apps/web/src/panels/structure-tree.tsx`, `apps/web/src/panels/property-panel.tsx`, `apps/web/test/canvas/canvas.test.tsx`, `apps/web/test/panels/structure-tree.test.tsx`, `apps/web/test/panels/property-panel.test.tsx`
- Modify: `apps/web/src/routes/editor.tsx`

**Interfaces:**
- Consumes: `@wirebound/renderer`의 `renderDocument`·`installStructures`·`NodeRenderError`, `@wirebound/schema`의 `installCatalog`·`getComponent`·`walkNodes`, 태스크 6의 스토어
- Produces: P2b-2가 이 세 패널 위에 편집을 얹는다.

- [ ] **Step 1: 캔버스 테스트**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `문서를 렌더러로 그린다` | `data-wb-component`가 있는 엘리먼트 |
| 2 | `노드를 누르면 그 노드가 선택된다` | 스토어의 `selectedNodeId` |
| 3 | `자식을 누르면 자식이 선택된다(부모가 아니라)` | 이벤트 전파 처리 |
| 4 | `편집 모드에서 선택 노드에 아웃라인이 붙는다` | |
| 5 | `뷰 모드에서는 아웃라인이 없다` | **양성 대조** |
| 6 | `뷰포트 폭이 캔버스에 적용된다` | 스토어 값이 style에 |
| 7 | `줌이 transform으로 적용된다` | 문서를 건드리지 않는다(D10) |
| 8 | `렌더 실패 노드가 있으면 배너로 알린다` | `onNodeError` 연결 |
| 9 | `문서가 없으면 안내를 보여준다` | 페이지 미선택 |

**케이스 3의 판별:** 이벤트 전파를 처리하지 않으면 부모가 선택된다. 중첩 노드가 필요하다.

- [ ] **Step 2: 구조 트리 테스트**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `문서의 노드 트리를 그린다` | `walkNodes` 또는 재귀 |
| 2 | `노드 타입을 보여준다` | `List`, `SearchForm` 등 |
| 3 | `노드를 누르면 선택된다` | 스토어 |
| 4 | `캔버스에서 선택하면 구조 트리에도 반영된다` | 같은 스토어를 본다 |
| 5 | `선택된 노드만 구분 표시된다` | 양성 대조 |
| 6 | `문서가 없으면 비어 있다` | |

- [ ] **Step 3: 속성 패널 테스트 (읽기 전용)**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `선택 노드의 editor 명세대로 필드를 나열한다` | 카탈로그의 `editor` 배열 순서대로 |
| 2 | `각 필드의 라벨과 현재 값을 보여준다` | |
| 3 | `props에 없는 값은 비워 둔다` | `undefined`를 "undefined"로 찍지 않는다 |
| 4 | `visibleWhen이 현재 구조와 다르면 감춘다` | 설계 §5.1 |
| 5 | `visibleWhen이 맞으면 보인다` | **양성 대조** |
| 6 | `선택이 없으면 안내를 보여준다` | |
| 7 | `알 수 없는 타입이면 안내를 보여준다` | 카탈로그에 없는 노드 |
| 8 | `이 단계에서는 입력이 없다(읽기 전용)` | `input`·`textarea`·`select`가 0개 |

**케이스 8이 이 태스크의 범위를 고정한다** — P2b-2가 그것을 뒤집을 때 이 테스트를 바꾸게 되고, 그 변경이 곧 "편집이 생겼다"는 신호다.

**케이스 4·5는 `visibleWhen.structure`가 무엇과 비교되는지 정해야 한다.** 테마가 없는 이 단계에서 현재 구조는 항상 `defaultStructure(def)`다. 그렇게 구현하고 **P4a가 테마의 구조 선택으로 바꿔야 한다는 것을 주석에 적어라.**

- [ ] **Step 4: 구현 → 통과 확인**

캔버스는 `installCatalog()`·`installStructures()`가 이미 불렸다고 가정한다. **`installCatalog`는 멱등하다** — `packages/schema/src/component/catalog/index.ts:28-32`가 `if (!getComponent(def.type))`로 이미 등록된 타입을 건너뛴다. `installStructures`도 같은 모양인지 확인하고, 아니면(`registerStructure`가 중복에 던진다) 그 사실을 보고해라.

두 함수를 부르는 자리는 **전용 모듈 하나**(`apps/web/src/catalog-setup.ts` 같은)로 두고 `main.tsx`와 테스트가 그것을 함께 import한다. 테스트마다 각자 부르면 어느 테스트가 먼저 도는지에 따라 결과가 달라진다.

- [ ] **Step 5: 변이 검사**

| 깨뜨릴 것 | 실패해야 하는 케이스 |
|---|---|
| 캔버스의 `stopPropagation` 제거 | 캔버스 3 |
| 뷰 모드에서도 아웃라인 렌더 | 캔버스 5 |
| `visibleWhen` 필터 제거 | 속성 4 |
| 속성 패널에 `input` 추가 | 속성 8 |
| 구조 트리와 캔버스가 다른 스토어를 보게 | 구조 4 |

- [ ] **Step 6: 최종 확인과 커밋**

```bash
pnpm test          # 전체
pnpm test:build
pnpm typecheck
pnpm --filter @wirebound/web build    # 프로덕션 번들이 실제로 만들어지는지
```

```bash
git add apps/web/src apps/web/test
git status
git commit -m "feat(web): 캔버스·구조 트리·읽기 전용 속성 패널"
```

---

## 자체 리뷰

계획을 다 쓴 뒤 스펙과 대조한 결과다.

**스펙 커버리지.** 설계 §9의 3분할 구조 — 좌상 메뉴·페이지 트리(태스크 8), 좌하 구조 트리(9), 중앙 캔버스(9), 우측 패널(9). 뷰포트 프리셋·줌(7·9). 모드별 표시 전환(7). §5.1의 "속성 패널이 `editor` 명세에서 자동 생성된다"(9). §10의 세션 쿠키 인증(4). P0 이월 6번(3).

**의도적으로 뺀 것과 그 이유는 "이 단계가 만들지 않는 것" 절에 있다.** 편집·드래그·코멘트·상호작용·테마·레이아웃 합성이 전부 이후 단계다.

**타입 일관성 확인.** `PageDocument`·`WbNode`가 `@wirebound/schema`에서 한 번만 온다. `TreeMenuNode`(태스크 2)가 서버 README의 트리 응답과 같은 모양이다. `EditorState.headSeq`(태스크 6)가 `PageDetail.headSeq`(태스크 2)에서 온다 — **P2b-2가 그것을 `baseSeq`로 쓴다.**

**계획을 쓴 뒤 확인한 것 셋 — 둘은 초안이 틀렸고 고쳤다.**

1. **API 기본 포트는 `3000`이 아니라 `3001`이다**(`apps/api/src/config.ts:49`). 초안이 틀렸고 태스크 1의 프록시 설정을 고쳤다.
2. **`installCatalog`는 멱등하다.** 초안은 "멱등하지 않다"고 단정했는데 거짓이다 — `packages/schema/src/component/catalog/index.ts:28-32`가 `if (!getComponent(def.type))`로 건너뛴다. 태스크 9의 서술을 고쳤다. `installStructures`는 확인하지 않았고 태스크 9가 확인을 지시한다.
3. **렌더러 테스트는 jsdom이 아니라 `renderToStaticMarkup`을 쓴다.** 태스크 3의 테스트 지침을 그에 맞게 고쳤다. 이 사실은 렌더러가 브라우저에 묶이지 않았다는 뜻이기도 하다 — 태스크 9의 캔버스 테스트만 jsdom(`web` 프로젝트)에서 돈다.

**남은 미확인 사항 하나:** `@testing-library/react` 16이 React 19와 함께 동작하는지, 그리고 `react-router` 7의 테스트용 라우터 API(`createMemoryRouter` 등)의 정확한 형태를 확인하지 않았다. 태스크 1·4의 구현자가 실제 버전으로 확인하고, 계획이 제시한 형태와 다르면 **의도(테스트가 라우터 위치를 단언할 수 있을 것)를 지키면서 실제 API에 맞추고 보고해라.**
