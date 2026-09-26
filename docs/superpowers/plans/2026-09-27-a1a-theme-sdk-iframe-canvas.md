# A1a — theme-sdk · 뷰 렌더 경로 · iframe 캔버스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」를 따른다 — 태스크는 워크트리의 Orca 워커가 한다.

**Goal:** 캔버스가 same-origin iframe 안에서, 새 `@wirebound/theme-sdk` 의 뷰 계약으로 짠 저장소 테마(`system-admin` 첫 판)로 그려진다.

**Architecture:** `theme-sdk` 가 뷰 계약(`view` · `Root` · `Focus` · `useToken` · `useWindow`)과 SDK 기본 뷰를 소유한다. `renderer` 에 `RenderOptions.theme` 을 더해, 주면 노드마다 «테마 뷰 → 기본 뷰» 를 React 컴포넌트로 그린다(주지 않으면 지금의 구조 경로 그대로). 웹 캔버스는 iframe 문서에 React portal 로 문서를 그리고, 선택 외곽선 · 번호 마커는 호스트 문서에서 iframe 좌표로 그린다. **이 차수는 더하기만 한다** — 카탈로그의 `structures` · `parts` · `variants`, 구조 레지스트리, `packages/themes`, 내보내기, api 는 건드리지 않는다(걷기는 A1b).

**Tech Stack:** TypeScript · React 19(`createPortal`) · vitest(jsdom) · tsdown · playwright-core(`apps/web/build-test`).

**Spec:** `docs/superpowers/specs/2026-09-27-code-themes-design.md` — 「패키지와 번들 계약」 · 「manifest」 · 「진행 단계」 절(A1 의 앞 절반).

## Global Constraints

- `packages/schema` · `packages/themes` · `packages/exporter` · `apps/api` · `packages/cli` · `packages/mcp` 의 소스를 바꾸지 않는다.
- 렌더러의 구조 경로(`renderDocument(doc, { structures })`)는 한 글자도 바뀌지 않게 둔다 — `RenderOptions.theme` 이 없으면 지금과 같다. 내보내기가 그 경로를 쓴다.
- 새 프로덕션 런타임 의존을 더하지 않는다(`react` · `react-dom` · `@wirebound/*` 워크스페이스 의존만).
- `@wirebound/theme-sdk` 는 `@wirebound/schema` 와 `react`(peer)만 의존한다. `renderer` 는 `theme-sdk` 를 의존한다(반대 방향 금지).
- 기본 뷰의 DOM 은 지금 **기본 구조**(`defaultStructure(def)`)의 구현체와 바이트까지 같다. `data-wb-structure` · `data-wb-part` 는 기본 뷰가 제 마크업의 훅으로 그대로 단다.
- 뷰가 새로 다는 속성은 `data-wb-focus`(값 없음) · `data-wb-marker`(placement) · `data-wb-marker-offset`(`x,y`) 셋뿐이고, 기본 뷰는 셋 다 달지 않는다.
- `apps/*` · `packages/*` 바로 밑에 새 `tsconfig*.json` 을 두는 것은 그 패키지의 빌드용일 때만이다(`CLAUDE.md` 「`apps/*`·`packages/*` 바로 밑에 `tsconfig*.json` 을 새로 두지 않는다」).
- 테스트 보고에는 실행 수와 건너뛴 수를 함께 적는다(`CLAUDE.md` 「「통과」를 보기 전에 몇 개가 실행됐는지 확인한다」).
- 주석은 `docs/guideline/base/03-comments.md`, 다른 파일 인용은 `docs/guideline/base/04-citation.md` 를 따른다(줄번호 대신 이름).

## Review Focus

1. **테마 뷰 하나가 던진다** — 그 노드 자리만 폴백(메시지 + 자식)이 서고, 나머지 문서와 선택은 산다. → Task 4 «뷰가 던지면 그 노드만 폴백».
2. **iframe 안의 높이가 바뀐다**(상호작용 알림 · 이미지 · 편집) — iframe 이 따라 늘고 줄며, 외곽선 · 마커가 다시 잰 자리에 선다. → Task 7 «내용이 자라면 iframe 이 따라 자란다», Task 8 «편집 뒤 외곽선이 새 자리에».
3. **캔버스의 빈 자리를 누른다** — 편집 모드면 선택이 풀리고, 뷰 모드면 선택이 안 바뀐다. iframe 안의 클릭이 호스트 핸들러에 닿아야 한다. → Task 7 «iframe 안 클릭이 호스트 onClick 에 닿는다», Task 8 «빈 자리 클릭은 선택을 푼다».
4. **노드 id 에 따옴표 · 공백이 든다** — iframe 안에서도 셀렉터를 조립하지 않고 속성을 견줘 찾는다. → Task 8 «따옴표가 든 id 도 고른다».
5. **StrictMode 이중 마운트 · 페이지 전환** — iframe 문서의 `<style>` 이 두 벌 생기지 않고, portal 이 사라지지 않는다. → Task 7 «두 번 마운트해도 style 은 한 벌».

---

## 확정한 결정

### D1. 뷰는 React 컴포넌트이고, 렌더러는 노드마다 `ViewHost` 엘리먼트를 만든다

지금 `renderNode` 는 구조 구현체를 **함수로 바로 부른다.** 테마 뷰는 훅(`useToken` · `useWindow`)을 쓰므로 컴포넌트로 그려야 한다. 그래서 테마 경로의 `renderNodeIn` 은 모양 가드 · 카탈로그 조회 · props 검증 · 겹layer · 자식 재귀를 지금처럼 **동기로** 하고(그래서 `onNodeError` 의 «돌아온 시점에 다 모여 있다» 가 그대로 선다), 마지막에 `<ViewHost …/>` 엘리먼트를 돌려준다. 뷰 본문에서 난 예외는 `ViewHost` 안의 노드별 경계가 받아 그 자리에 폴백을 그린다 — 동기 `onNodeError` 에는 실리지 않는다.

### D2. `Root` 는 뷰의 루트 DOM 요소를 그리는 컴포넌트다

`<Root as="table" …>` — `as` 의 태그로 그리고, `ViewHost` 가 컨텍스트로 준 `data-wb-*` 속성과 상호작용 핸들러를 편 뒤 나머지 props 를 편다. 그래서 테마가 `data-wb-id` 를 빠뜨릴 방법이 없다. `Root` 가 그려졌는지는 `ViewHost` 의 레이아웃 이펙트가 본다 — 안 그려졌으면 그 노드를 **기본 뷰로 다시 그리고** `console.error` 로 말한다(spec 의 «개발 모드에서 던진다» 는 A2 의 `wb-theme dev` 가 맡는다. 호스트는 화면을 잃지 않는 쪽이다).

### D3. `Focus` 는 감싸지 않고 표시만 한다

`<Focus>{child}</Focus>` 는 자식 엘리먼트 하나를 `cloneElement` 로 복제해 `data-wb-focus=""` 를 더한다. 감싸는 `div` 를 두면 테마의 레이아웃이 바뀐다. 자식이 엘리먼트 하나가 아니면 던진다(노드 경계가 폴백으로 받는다).

### D4. variant 결정

| 조건 | 뷰가 받는 `variant` |
|---|---|
| 카탈로그에 `variantFrom` 이 있다(`Text` · `Field` · `Divider`) | 그 prop 값(문자열이 아니면 `undefined`). manifest 의 `components` 는 보지 않는다 |
| manifest 에 그 컴포넌트 선언이 있고 `node.variant` 가 선언 안에 있다 | `node.variant` |
| manifest 에 그 컴포넌트 선언이 있고 `node.variant` 가 없거나 선언 밖이다 | `defaultVariant` |
| manifest 에 그 컴포넌트 선언이 없다 | `node.variant`(없으면 `undefined`) |

`Root` 가 다는 `data-wb-variant` 는 이 값이다.

### D5. 기본 뷰는 기본 구조의 바이트 사본이다

카탈로그 컴포넌트 19종마다 기본 구조(`structures[0]`)의 구현체를 `theme-sdk/src/default-views/` 로 옮긴다. DOM 은 바이트까지 같게 둔다(`data-wb-structure` · `data-wb-part` 포함). 구조 기본 CSS 중 기본 구조가 쓰는 규칙과 노드 변수 도구(`nodeVar`)도 SDK 가 제 사본을 갖는다 — A1b 가 렌더러의 원본을 걷을 때 SDK 쪽이 남는다. 두 벌이 공존하는 것은 A1a ~ A1b 사이뿐이다.

### D6. 저장소 테마 `system-admin` 첫 판은 옛 `ADMIN_THEME` 의 컴파일 결과를 소스로 옮긴 것이다

옛 `admin` 테마는 모든 컴포넌트에 기본 구조를 고른다(`packages/themes/src/system/admin.ts` 의 `structure:` 전부가 각 카탈로그의 첫 구조다). 그래서 기본 뷰 + 옛 컴파일 CSS 한 장이면 지금 캔버스와 같은 외형이 선다. CSS 는 이 차수에서 **한 번** 뽑아 `system-themes/admin/src/theme.css` 로 커밋하고, 그 뒤로는 그 파일이 소스다(생성기를 남기지 않는다 — A1b 가 `packages/themes` 를 걷으면 생성기가 설 자리가 없다). manifest 의 토큰 키는 그 CSS 의 `:root` 변수 이름과 spec 의 명명 규칙(`semantic.primary` → `--wb-semantic-primary`)으로 맞춘다.

### D7. 캔버스 iframe 은 portal 로 채운다

`<iframe>`(`about:blank`, same-origin)의 문서에 `<style data-wb-style="base">`(SDK 기본 CSS) · `<style data-wb-style="theme">`(테마 CSS)를 넣고, 문서 트리는 `createPortal(tree, iframeDocument.body)` 로 그린다. 뷰 코드는 호스트 창의 JS 영역에서 돈다 — 전역 `window` 는 호스트 창이다. 그래서 SDK 는 `useWindow()` 로 iframe 창을 준다(A2 의 스킬 문서가 «전역 `window` 대신 이것» 을 가르친다). CSS 의 `@media` 는 iframe 폭으로 판정된다. iframe 높이는 문서 높이를 따라간다(안쪽 스크롤 없음). 줌은 지금처럼 바깥 프레임의 `transform: scale()` 이다.

### D8. 선택 외곽선 · 마커는 호스트 문서에 그린다

외곽선 · 마커는 지금처럼 `wb-shell-canvas-surface` 안에 절대 위치로 그린다. iframe 이 표면의 (0,0)에 서고 iframe 안의 좌표는 배율 전 CSS px 이므로, 노드 상자는 **iframe 문서 안의 `getBoundingClientRect()` 그대로** 가 문서 좌표다(줌으로 나누지 않는다). 마커 자리는 렌더러의 `markerPoint(nodeElement)` 가 `data-wb-focus` · `data-wb-marker` · `data-wb-marker-offset` 으로 계산한다 — A5 의 HTML 뷰어와 PPTX 가 같은 함수를 쓴다.

### D9. 캔버스는 이 차수부터 서버의 옛 테마를 읽지 않는다

`Canvas` 에서 `useProjectThemeState` · `useThemeCss` · `themeStructures` · `usePublishCanvasStructures` · `usePublishThemeFailed` 를 걷는다. 테마 고르개 · 테마 편집 화면은 남지만 캔버스에 닿지 않는다(A1b 가 걷는다). 속성 패널의 `visibleWhen` 은 `useCanvasStructures()` 가 빈 표를 주므로 기본 구조 기준으로 판정된다 — `List` 의 기본 구조가 `table` 이라 `컬럼` 칸은 지금처럼 보인다.

---

## 파일 구조

```
packages/theme-sdk/                       (신규)
  package.json · tsconfig.json · tsdown.config.ts
  src/index.ts                             공개 API
  src/types.ts                             ViewProps · View · ThemeManifest · TokenDecl · ComponentDecl · MarkerSpec · ThemeDefinition
  src/define.ts                            defineTheme · view
  src/context.tsx                          NodeContext · ThemeContext · useToken · useWindow · ThemeProvider
  src/root.tsx                             Root · Focus · markerAttrs
  src/css-tools.ts                         nodeVar · NODE_VAR_PREFIX · TREE_INDENT_VAR · componentRule · partRule (렌더러 사본)
  src/default-views/{structure,data,input,action,document}.tsx   기본 뷰 + 그룹별 기본 CSS
  src/default-views/index.ts               DEFAULT_VIEWS · defaultViewsCss
  test/*.test.tsx

packages/renderer/
  src/view-host.tsx                        (신규) ViewHost · 노드별 경계 · Root 누락 감지
  src/variant.ts                           (신규) resolveVariant
  src/marker.ts                            (신규) markerPoint · focusElement
  src/render.tsx                           RenderOptions.theme · 테마 경로 분기
  src/index.ts                             새 export
  package.json · tsconfig.json             theme-sdk 의존 · 참조
  test/view-path.test.tsx · test/variant.test.ts · test/marker.test.ts · test/default-view-parity.test.tsx  (신규)

system-themes/admin/                      (신규, 워크스페이스 글롭 추가)
  package.json · tsconfig.json
  src/index.ts                             ADMIN_V0 (defineTheme 결과) · ADMIN_V0_CSS
  src/manifest.ts                          manifest 선언
  src/theme.css                            옛 ADMIN_THEME 컴파일 결과(첫 판 소스)
  src/css.d.ts                             '*.css?raw' 모듈 선언
  test/admin.test.ts

apps/web/
  src/canvas/canvas-iframe.tsx             (신규) CanvasIframe
  src/canvas/canvas-theme.ts               (신규) CANVAS_THEME — 이 차수의 테마 고정 자리
  src/canvas/canvas.tsx                    iframe · 뷰 경로 · 측정 교체
  src/shell.css                            .wb-shell-canvas-iframe
  package.json                             theme-sdk · system-theme-admin 의존
  test/editor-harness.tsx                  iframe 안을 보는 헬퍼
  test/canvas/canvas-iframe.test.tsx       (신규)
  test/canvas/*.test.tsx · 그 밖의 직접 조회 파일들   iframe 기준으로 고침
  build-test/editor-stack.ts               canvasFrame(page) 헬퍼
  build-test/editor-*.test.ts              캔버스 조회를 iframe 으로
  build-test/canvas-iframe.test.ts         (신규) 실브라우저 판

pnpm-workspace.yaml · package.json(typecheck 글롭) · vitest.config.ts(별칭 · unit 글롭) · tsconfig.json(참조)
```

---

## Task 1: `theme-sdk` 패키지와 뷰 계약 타입

**Files:**
- Create: `packages/theme-sdk/package.json`, `packages/theme-sdk/tsconfig.json`, `packages/theme-sdk/tsdown.config.ts`, `packages/theme-sdk/src/index.ts`, `packages/theme-sdk/src/types.ts`, `packages/theme-sdk/src/define.ts`
- Modify: `vitest.config.ts`(별칭 `@wirebound/theme-sdk` → `packages/theme-sdk/src/index.ts`), `tsconfig.json`(참조 `packages/theme-sdk`)
- Test: `packages/theme-sdk/test/define.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Placement = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'start' | 'end'
  export interface MarkerSpec { placement?: Placement; offset?: readonly [number, number] }
  export type TokenType = 'color' | 'length' | 'number' | 'font' | 'shadow' | 'select'
  export interface TokenDecl { type: TokenType; label: string; group?: string; default: string | number; options?: readonly string[] }
  export interface VariantDecl { id: string; label: string; hideProps?: readonly string[] }
  export interface ComponentDecl { variants: readonly VariantDecl[]; defaultVariant: string }
  export interface ThemeManifest {
    id: string; name: string; description?: string; version: string; sdk: string; preview?: string
    tokens: { groups?: readonly { id: string; label: string }[]; items: Readonly<Record<string, TokenDecl>> }
    components?: Readonly<Record<string, ComponentDecl>>
    patterns?: Readonly<Record<string, unknown>>
  }
  export interface ViewProps<P extends Record<string, unknown> = Record<string, unknown>> {
    nodeId: string; type: string; props: P; states: readonly string[]; variant: string | undefined
    children: ReactNode; slot: ReactNode
  }
  export type View = ComponentType<ViewProps>
  export interface ThemeDefinition { manifest: ThemeManifest; views: Readonly<Partial<Record<string, View>>> }
  export function defineTheme(def: ThemeDefinition): ThemeDefinition
  export function view<P extends Record<string, unknown> = Record<string, unknown>>(render: (props: ViewProps<P>) => ReactElement): View
  export const SDK_VERSION: string   // '1.0.0'
  ```

- [ ] **Step 1: 패키지 뼈대를 만든다** — `packages/renderer` 의 `package.json` · `tsconfig.json` · `tsdown.config.ts` 를 본떠 만든다. 차이: `name` 은 `@wirebound/theme-sdk`, `dependencies` 는 `@wirebound/schema`, `peerDependencies` 는 `react ^19.0.0`, `devDependencies` 에 `react` · `react-dom` · `@types/react` · `@types/react-dom` · `tsdown`. `tsconfig.json` 의 `references` 는 `../schema`. 루트 `tsconfig.json` 참조와 `vitest.config.ts` 별칭을 더한다(별칭은 `@wirebound/renderer` 줄 바로 앞 — 더 긴 이름이 먼저 오게 기존 순서 규칙을 확인한다). `pnpm install`.

- [ ] **Step 2: 실패하는 테스트**

```ts
// packages/theme-sdk/test/define.test.ts
import { describe, expect, it } from 'vitest'
import { defineTheme, SDK_VERSION, view, type ThemeManifest } from '@wirebound/theme-sdk'

const manifest: ThemeManifest = {
  id: 'sample', name: '샘플', version: '0.1.0', sdk: '^1.0.0',
  tokens: { items: { 'semantic.primary': { type: 'color', label: '주색', default: '#2563eb' } } },
}

describe('defineTheme', () => {
  it('정의를 그대로 돌려준다 — 등록 부작용이 없다', () => {
    const List = view(() => <div />)
    const theme = defineTheme({ manifest, views: { List } })
    expect(theme.manifest).toBe(manifest)
    expect(theme.views.List).toBe(List)
  })

  it('view 는 이름 있는 함수 컴포넌트를 돌려준다', () => {
    const V = view(() => <span />)
    expect(typeof V).toBe('function')
  })

  it('SDK 판은 semver 다', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
```

- [ ] **Step 3: 실패를 본다** — `pnpm vitest run packages/theme-sdk/test/define.test.ts` → 모듈을 못 찾아 실패.

- [ ] **Step 4: 구현**

```ts
// packages/theme-sdk/src/define.ts
import type { ReactElement } from 'react'
import type { ThemeDefinition, View, ViewProps } from './types'

/** 호스트 SDK 판. 업로드 검증(A3)이 manifest 의 `sdk` 범위와 견준다. */
export const SDK_VERSION = '1.0.0'

/** 정의를 그대로 돌려준다. 등록은 호스트가 한다 — 여기서 전역에 쓰면 테스트와 갤러리가 서로를 오염시킨다. */
export function defineTheme(def: ThemeDefinition): ThemeDefinition {
  return def
}

export function view<P extends Record<string, unknown> = Record<string, unknown>>(
  render: (props: ViewProps<P>) => ReactElement,
): View {
  const component = (props: ViewProps) => render(props as ViewProps<P>)
  return component
}
```

`types.ts` 는 Interfaces 블록의 타입을 그대로 적는다(`ReactNode` · `ComponentType` 은 `react` 에서 `import type`). `index.ts` 는 둘을 다시 내보낸다.

- [ ] **Step 5: 통과를 본다** — 같은 명령, 3 passed.

- [ ] **Step 6: 커밋**

```bash
git add packages/theme-sdk vitest.config.ts tsconfig.json pnpm-lock.yaml
git commit -m "feat(theme-sdk): package skeleton, view contract types, defineTheme"
```

---

## Task 2: `Root` · `Focus` · `useToken` · `useWindow`

**Files:**
- Create: `packages/theme-sdk/src/context.tsx`, `packages/theme-sdk/src/root.tsx`
- Modify: `packages/theme-sdk/src/index.ts`
- Test: `packages/theme-sdk/test/root.test.tsx`

**Interfaces:**
- Consumes: Task 1 의 `MarkerSpec` · `ThemeManifest`.
- Produces:
  ```ts
  export interface NodeBinding {
    attrs: Record<string, string | undefined> & Partial<Record<'onClick' | 'onChange' | 'onSubmit', (e: SyntheticEvent) => void>>
    markRootRendered: () => void
  }
  export const NodeContext: Context<NodeBinding | null>
  export interface ThemeRuntimeValue { tokens: Readonly<Record<string, string | number>>; window: Window }
  export function ThemeProvider(props: { value: ThemeRuntimeValue; children: ReactNode }): ReactElement
  export function useToken(key: string): string | number | undefined
  export function useWindow(): Window
  export function Root(props: { as?: keyof JSX.IntrinsicElements; marker?: MarkerSpec } & Record<string, unknown>): ReactElement
  export function Focus(props: { children: ReactElement }): ReactElement
  export function markerAttrs(marker: MarkerSpec | undefined): Record<string, string>
  ```

- [ ] **Step 1: 실패하는 테스트**

```tsx
// packages/theme-sdk/test/root.test.tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Focus, NodeContext, Root, ThemeProvider, useToken, useWindow } from '@wirebound/theme-sdk'

function bind(extra: Record<string, unknown> = {}) {
  const markRootRendered = vi.fn()
  const attrs = { 'data-wb-id': 'n1', 'data-wb-component': 'List', 'data-wb-variant': 'table', ...extra }
  return { value: { attrs, markRootRendered }, markRootRendered }
}

describe('Root', () => {
  it('as 태그로 그리고 노드 속성을 편다', () => {
    const { value, markRootRendered } = bind()
    const { container } = render(
      <NodeContext.Provider value={value}><Root as="table" className="t" /></NodeContext.Provider>,
    )
    const el = container.firstElementChild!
    expect(el.tagName).toBe('TABLE')
    expect(el.getAttribute('data-wb-id')).toBe('n1')
    expect(el.getAttribute('data-wb-variant')).toBe('table')
    expect(el.getAttribute('class')).toBe('t')
    expect(markRootRendered).toHaveBeenCalledTimes(1)
  })

  it('테마가 넘긴 data-wb-id 는 노드 것에 진다', () => {
    const { value } = bind()
    const { container } = render(
      <NodeContext.Provider value={value}><Root data-wb-id="가짜" /></NodeContext.Provider>,
    )
    expect(container.firstElementChild!.getAttribute('data-wb-id')).toBe('n1')
  })

  it('marker 를 속성 둘로 싣는다', () => {
    const { value } = bind()
    const { container } = render(
      <NodeContext.Provider value={value}>
        <Root marker={{ placement: 'top-end', offset: [4, -8] }} />
      </NodeContext.Provider>,
    )
    const el = container.firstElementChild!
    expect(el.getAttribute('data-wb-marker')).toBe('top-end')
    expect(el.getAttribute('data-wb-marker-offset')).toBe('4,-8')
  })

  it('marker 가 없으면 두 속성 다 없다', () => {
    const { value } = bind()
    const { container } = render(<NodeContext.Provider value={value}><Root /></NodeContext.Provider>)
    expect(container.firstElementChild!.hasAttribute('data-wb-marker')).toBe(false)
    expect(container.firstElementChild!.hasAttribute('data-wb-marker-offset')).toBe(false)
  })

  it('노드 바깥에서 쓰면 던진다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Root />)).toThrow('Root 는 뷰 안에서만')
  })
})

describe('Focus', () => {
  it('자식을 감싸지 않고 data-wb-focus 를 더한다', () => {
    const { container } = render(<Focus><table className="x" /></Focus>)
    const el = container.firstElementChild!
    expect(el.tagName).toBe('TABLE')
    expect(el.hasAttribute('data-wb-focus')).toBe(true)
    expect(container.children).toHaveLength(1)
  })

  it('자식이 엘리먼트 하나가 아니면 던진다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Focus>{'글자' as never}</Focus>)).toThrow('Focus 는 엘리먼트 하나')
  })
})

describe('useToken · useWindow', () => {
  it('프로바이더의 값을 읽는다', () => {
    const seen: unknown[] = []
    function Probe() { seen.push(useToken('density'), useToken('없음'), useWindow()); return null }
    const fake = {} as Window
    render(<ThemeProvider value={{ tokens: { density: 'compact' }, window: fake }}><Probe /></ThemeProvider>)
    expect(seen).toEqual(['compact', undefined, fake])
  })

  it('프로바이더가 없으면 토큰은 없고 창은 전역 창이다', () => {
    const seen: unknown[] = []
    function Probe() { seen.push(useToken('density'), useWindow()); return null }
    render(<Probe />)
    expect(seen).toEqual([undefined, window])
  })
})
```

`@testing-library/react` 가 이 패키지의 devDependency 에 없으면 `apps/web/package.json` 의 판으로 더한다.

- [ ] **Step 2: 실패를 본다** — `pnpm vitest run packages/theme-sdk/test/root.test.tsx`.

- [ ] **Step 3: 구현**

```tsx
// packages/theme-sdk/src/context.tsx
import { createContext, useContext, type ReactElement, type ReactNode, type SyntheticEvent } from 'react'

export interface NodeBinding {
  attrs: Record<string, string | undefined> &
    Partial<Record<'onClick' | 'onChange' | 'onSubmit', (event: SyntheticEvent) => void>>
  /** 렌더러의 `ViewHost` 가 «Root 가 그려졌나» 를 보는 통로. */
  markRootRendered: () => void
}

export const NodeContext = createContext<NodeBinding | null>(null)

export interface ThemeRuntimeValue {
  tokens: Readonly<Record<string, string | number>>
  /** 문서가 그려지는 창. 캔버스에서는 iframe 의 창이고 전역 `window` 와 다르다. */
  window: Window
}

const ThemeContext = createContext<ThemeRuntimeValue | null>(null)

export function ThemeProvider(props: { value: ThemeRuntimeValue; children: ReactNode }): ReactElement {
  return <ThemeContext.Provider value={props.value}>{props.children}</ThemeContext.Provider>
}

export function useToken(key: string): string | number | undefined {
  return useContext(ThemeContext)?.tokens[key]
}

export function useWindow(): Window {
  return useContext(ThemeContext)?.window ?? window
}
```

```tsx
// packages/theme-sdk/src/root.tsx
import { Children, cloneElement, createElement, isValidElement, useContext, type ReactElement } from 'react'
import { NodeContext } from './context'
import type { MarkerSpec } from './types'

export function markerAttrs(marker: MarkerSpec | undefined): Record<string, string> {
  if (marker === undefined) return {}
  const out: Record<string, string> = { 'data-wb-marker': marker.placement ?? 'top-start' }
  if (marker.offset !== undefined) out['data-wb-marker-offset'] = `${marker.offset[0]},${marker.offset[1]}`
  return out
}

export function Root(
  props: { as?: string; marker?: MarkerSpec } & Record<string, unknown>,
): ReactElement {
  const binding = useContext(NodeContext)
  if (binding === null) throw new Error('Root 는 뷰 안에서만 쓸 수 있습니다')
  binding.markRootRendered()
  const { as = 'div', marker, ...rest } = props
  // 노드 속성을 **뒤에** 편다 — 테마가 같은 이름을 넘겨도 노드 것이 이긴다.
  return createElement(as, { ...rest, ...markerAttrs(marker), ...binding.attrs })
}

export function Focus(props: { children: ReactElement }): ReactElement {
  const only = Children.toArray(props.children)
  if (only.length !== 1 || !isValidElement(only[0])) throw new Error('Focus 는 엘리먼트 하나만 감쌉니다')
  return cloneElement(only[0] as ReactElement<Record<string, unknown>>, { 'data-wb-focus': '' })
}
```

`markRootRendered` 를 렌더 중에 부르는 것은 ref 갱신만 하는 함수라서다(Task 4 의 `ViewHost` 가 `useRef` 에 적는다) — 상태를 바꾸지 않는다.

- [ ] **Step 4: 통과를 본다** — 9 passed.

- [ ] **Step 5: 커밋**

```bash
git add packages/theme-sdk
git commit -m "feat(theme-sdk): Root, Focus, marker attributes, useToken and useWindow"
```

---

## Task 3: SDK 기본 뷰 19종과 기본 CSS

**Files:**
- Create: `packages/theme-sdk/src/css-tools.ts`, `packages/theme-sdk/src/default-views/{structure,data,input,action,document}.tsx`, `packages/theme-sdk/src/default-views/index.ts`
- Modify: `packages/theme-sdk/src/index.ts`
- Test: `packages/renderer/test/default-view-parity.test.tsx`(렌더러 쪽에 둔다 — 옛 구조 구현체와 견줘야 하므로)

**Interfaces:**
- Consumes: Task 2 의 `Root` · `NodeContext`.
- Produces:
  ```ts
  export const DEFAULT_VIEWS: Readonly<Record<string, View>>   // 카탈로그 19종 전부
  export function defaultViewsCss(): string
  export { nodeVar, NODE_VAR_PREFIX, TREE_INDENT_VAR } from './css-tools'
  ```

**옮기는 법.** 각 컴포넌트의 **기본 구조 구현체 하나만** 옮긴다(`packages/schema/src/component/catalog/*.ts` 의 `structures[0]` — Page·Slot·Flex·Grid·Link·Text·Divider·Placeholder 는 `default`, Section `contained`, Card `plain`, Tabs `underline`, List `table`, Tree `indent`, KeyValue `table`, SearchForm `inline`, EntryForm `labelLeft`, Field `outlined`, Button `solid`, Media `image`). 옮길 때의 바꿔 쓰기는 기계적이다:

| 옛 구조 구현체 | 기본 뷰 |
|---|---|
| `({ attrs, props, part, children, slot }) => <button {...attrs} …>` | `view(({ props, children, slot }) => <Root as="button" data-wb-structure="solid" …>)` |
| `{...part('label')}` | `data-wb-part="label"` |
| `nodeVar` · `componentRule` · `partRule` (`../structure-css-tools`) | `../css-tools` 의 사본 |
| 그룹의 `*CssBlocks()` | 같은 이름으로 옮기되 **기본 구조를 겨냥한 규칙만** 남긴다 |

`data-wb-structure` 는 `Root` 에 명시 prop 으로 준다 — `ViewHost` 가 주는 노드 속성에는 이제 structure 가 없다(Task 4). 예시(Button):

```tsx
// packages/theme-sdk/src/default-views/action.tsx
import { Root } from '../root'
import { view } from '../define'

export const ButtonView = view(({ props }) => (
  <Root as="button" data-wb-structure="solid" type="button" disabled={props.disabled === true}>
    <span data-wb-part="label">{String(props.label)}</span>
  </Root>
))

export const LinkView = view(({ props }) => (
  <Root as="a" data-wb-structure="default" href={props.target ? `#${String(props.target)}` : '#'}>
    {String(props.label)}
  </Root>
))

export function actionCssBlocks(): string[] {
  return []
}
```

**속성 순서가 바이트 비교에 든다.** 옛 구현체는 `{...attrs}` 를 맨 앞에 펴서 `data-wb-id` 가 첫 속성이다. `Root` 는 노드 속성을 **뒤에** 펴므로 속성 순서가 달라진다. 비교는 순서를 가르지 않게 한다(아래 테스트의 `normalize` — 속성을 이름순으로 다시 쓴다).

- [ ] **Step 1: 실패하는 테스트**

```tsx
// packages/renderer/test/default-view-parity.test.tsx
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultStructure, installCatalog, listComponents, type WbNode } from '@wirebound/schema'
import { DEFAULT_VIEWS, defaultViewsCss } from '@wirebound/theme-sdk'
import { installStructures, renderDocument, structureBaseCss } from '@wirebound/renderer'
import { SAMPLE_NODES } from './fixtures/sample-nodes'

beforeAll(() => { installCatalog(); installStructures() })

/** 속성 순서를 이름순으로 맞춘다 — `Root` 는 노드 속성을 뒤에 펴 순서만 다르다. */
function normalize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const el of doc.body.querySelectorAll('*')) {
    const attrs = [...el.attributes].map((a) => [a.name, a.value] as const).sort(([a], [b]) => a.localeCompare(b))
    for (const [name] of attrs) el.removeAttribute(name)
    for (const [name, value] of attrs) el.setAttribute(name, value)
  }
  return doc.body.innerHTML
}

const theme = { manifest: { id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } }, views: {} }

describe('기본 뷰는 기본 구조와 같은 DOM 을 낸다', () => {
  it('카탈로그의 모든 컴포넌트에 기본 뷰가 있다', () => {
    expect(Object.keys(DEFAULT_VIEWS).sort()).toEqual(listComponents().map((d) => d.type).sort())
  })

  for (const [label, node] of Object.entries(SAMPLE_NODES)) {
    it(label, () => {
      const doc = { root: node as WbNode } as never
      const old = renderToStaticMarkup(renderDocument(doc))
      const next = renderToStaticMarkup(renderDocument(doc, { theme }))
      expect(normalize(next)).toBe(normalize(old))
    })
  }

  it('기본 CSS 는 기본 구조를 겨냥한 옛 규칙을 전부 싣는다', () => {
    const next = defaultViewsCss()
    for (const def of listComponents()) {
      const s = defaultStructure(def)
      const oldRules = structureBaseCss().split('\n}').filter((r) => r.includes(`[data-wb-component="${def.type}"]`) && (!r.includes('data-wb-structure=') || r.includes(`"${s}"`)))
      for (const rule of oldRules) expect(next).toContain(rule.trim())
    }
  })
})
```

`test/fixtures/sample-nodes.ts` 를 새로 둔다 — 카탈로그 19종마다 **props 를 모두 채운 노드 하나 이상**(자식이 있는 컴포넌트는 `Text` 자식 하나, `List` 는 `columns` 셋, `Tree` 는 두 단계, `Field` 는 `control` 마다 하나, `Text` 는 `role` 마다 하나, `Divider` 는 `direction` 둘). 각 컴포넌트 정의의 zod props 를 읽고 기본값이 아닌 값을 고른다. 키는 `'List — columns 셋'` 처럼 무엇을 재는지 적는다.

이 테스트는 Task 4 의 `RenderOptions.theme` 이 있어야 돈다. **Task 3 과 4 를 한 워커가 차례로 하고, Task 3 의 커밋에서 이 파일은 `it.todo` 없이 그대로 두되 Step 2 의 실패 사유가 «theme 옵션이 없다» 임을 확인한다.**

- [ ] **Step 2: 실패를 본다** — `pnpm vitest run packages/renderer/test/default-view-parity.test.tsx` → `DEFAULT_VIEWS` 가 없어 실패.

- [ ] **Step 3: 구현** — 위 «옮기는 법» 대로 다섯 그룹을 옮긴다. `default-views/index.ts`:

```ts
import type { View } from '../types'
import { actionCssBlocks, ButtonView, LinkView } from './action'
import { dataCssBlocks, KeyValueView, ListView, TreeView } from './data'
import { DividerView, documentCssBlocks, MediaView, PlaceholderView, TextView } from './document'
import { EntryFormView, FieldView, inputCssBlocks, SearchFormView } from './input'
import { CardView, FlexView, GridView, PageView, SectionView, SlotView, structureCssBlocks, TabsView } from './structure'

export const DEFAULT_VIEWS: Readonly<Record<string, View>> = Object.freeze({
  Page: PageView, Slot: SlotView, Section: SectionView, Flex: FlexView, Grid: GridView, Card: CardView, Tabs: TabsView,
  List: ListView, Tree: TreeView, KeyValue: KeyValueView,
  SearchForm: SearchFormView, EntryForm: EntryFormView, Field: FieldView,
  Button: ButtonView, Link: LinkView,
  Text: TextView, Media: MediaView, Divider: DividerView, Placeholder: PlaceholderView,
})

/** 기본 뷰가 서기 위한 최소 CSS. 호스트는 테마 CSS 보다 **먼저** 싣는다. */
export function defaultViewsCss(): string {
  return [...structureCssBlocks(), ...dataCssBlocks(), ...inputCssBlocks(), ...actionCssBlocks(), ...documentCssBlocks()].join('\n')
}
```

`Slot` 뷰는 `slot` 을, 나머지는 `children` 을 그린다(옛 구현체와 같다).

- [ ] **Step 4: 통과는 Task 4 끝에서 본다.** 여기서는 `pnpm typecheck` 가 0 오류인지만 본다.

- [ ] **Step 5: 커밋**

```bash
git add packages/theme-sdk packages/renderer/test/default-view-parity.test.tsx packages/renderer/test/fixtures/sample-nodes.ts
git commit -m "feat(theme-sdk): default views ported byte-for-byte from the default structures"
```

---

## Task 4: 렌더러의 테마 경로 — `RenderOptions.theme` · `ViewHost` · variant

**Files:**
- Create: `packages/renderer/src/view-host.tsx`, `packages/renderer/src/variant.ts`
- Modify: `packages/renderer/src/render.tsx`, `packages/renderer/src/index.ts`, `packages/renderer/package.json`(의존 `@wirebound/theme-sdk: workspace:*`), `packages/renderer/tsconfig.json`(참조 `../theme-sdk`)
- Test: `packages/renderer/test/view-path.test.tsx`, `packages/renderer/test/variant.test.ts`

**Interfaces:**
- Consumes: Task 1 `ThemeDefinition` · `View` · `ViewProps`, Task 2 `NodeContext` · `NodeBinding`, Task 3 `DEFAULT_VIEWS`.
- Produces:
  ```ts
  // render.tsx
  export interface RenderOptions { /* 기존 필드 그대로 */ theme?: ThemeDefinition }
  // variant.ts
  export function resolveVariant(def: ComponentDef, node: WbNode, props: Record<string, unknown>, manifest: ThemeManifest | undefined): string | undefined
  // view-host.tsx (내부 — index 에서 내보내지 않는다)
  export function ViewHost(props: { view: View; fallbackView: View; binding: Omit<NodeBinding, 'markRootRendered'>; viewProps: ViewProps; nodeId: string; onViewError?: (e: NodeRenderError) => void }): ReactElement
  ```

- [ ] **Step 1: 실패하는 테스트 — variant**

```ts
// packages/renderer/test/variant.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, requireComponent, type WbNode } from '@wirebound/schema'
import { resolveVariant } from '../src/variant'

beforeAll(() => installCatalog())
const manifest = {
  id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} },
  components: { List: { variants: [{ id: 'table', label: '표' }, { id: 'cards', label: '카드' }], defaultVariant: 'table' } },
}
const list = (variant?: string) => ({ id: 'n', type: 'List', ...(variant ? { variant } : {}) }) as WbNode

describe('resolveVariant', () => {
  it('선언 안의 값은 그대로', () => expect(resolveVariant(requireComponent('List'), list('cards'), {}, manifest)).toBe('cards'))
  it('선언 밖의 값은 defaultVariant', () => expect(resolveVariant(requireComponent('List'), list('featured'), {}, manifest)).toBe('table'))
  it('값이 없으면 defaultVariant', () => expect(resolveVariant(requireComponent('List'), list(), {}, manifest)).toBe('table'))
  it('선언이 없는 컴포넌트는 node.variant 그대로', () =>
    expect(resolveVariant(requireComponent('Button'), { id: 'b', type: 'Button', variant: 'danger' } as WbNode, {}, manifest)).toBe('danger'))
  it('variantFrom 은 prop 값이 이긴다', () =>
    expect(resolveVariant(requireComponent('Text'), { id: 't', type: 'Text', variant: 'x' } as WbNode, { role: 'h2' }, manifest)).toBe('h2'))
  it('variantFrom prop 이 문자열이 아니면 undefined', () =>
    expect(resolveVariant(requireComponent('Text'), { id: 't', type: 'Text' } as WbNode, { role: 3 }, manifest)).toBeUndefined())
  it('manifest 가 없으면 node.variant 그대로', () =>
    expect(resolveVariant(requireComponent('List'), list('featured'), {}, undefined)).toBe('featured'))
})
```

- [ ] **Step 2: 실패하는 테스트 — 뷰 경로**

```tsx
// packages/renderer/test/view-path.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { Root, view, type ThemeDefinition } from '@wirebound/theme-sdk'
import { renderDocument, type NodeRenderError } from '@wirebound/renderer'

beforeAll(() => installCatalog())

const base = { id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } }
const page = (children: unknown[]): PageDocument =>
  ({ root: { id: 'root', type: 'Page', props: {}, children } }) as never

function draw(doc: PageDocument, theme: ThemeDefinition, errors: NodeRenderError[] = []) {
  return render(<>{renderDocument(doc, { theme, onNodeError: (e) => errors.push(e) })}</>)
}

describe('테마 경로', () => {
  it('테마 뷰가 있으면 그것으로, 없으면 기본 뷰로 그린다', () => {
    const Button = view(({ props }) => <Root as="button" className="mine">{String(props.label)}</Root>)
    const { container } = draw(page([{ id: 'b', type: 'Button', props: { label: '저장' } }, { id: 't', type: 'Text', props: { text: '안녕' } }]),
      { manifest: base, views: { Button } })
    expect(container.querySelector('[data-wb-id="b"]')!.className).toBe('mine')
    expect(container.querySelector('[data-wb-id="t"]')!.getAttribute('data-wb-structure')).toBe('default')
  })

  it('뷰는 props · states · variant · children 을 받는다', () => {
    const seen: unknown[] = []
    const List = view((p) => { seen.push(p); return <Root /> })
    draw(page([{ id: 'l', type: 'List', props: { selected: true }, variant: 'cards' }]),
      { manifest: { ...base, components: { List: { variants: [{ id: 'cards', label: '카드' }], defaultVariant: 'cards' } } }, views: { List } })
    const p = seen[0] as { nodeId: string; states: string[]; variant: string; props: Record<string, unknown> }
    expect(p.nodeId).toBe('l')
    expect(p.states).toContain('selected')
    expect(p.variant).toBe('cards')
    expect(p.props.selected).toBe(true)
  })

  it('노드 속성: data-wb-structure 는 없고 variant · state 는 있다', () => {
    const List = view(() => <Root />)
    const { container } = draw(page([{ id: 'l', type: 'List', props: { selected: true }, variant: 'x' }]), { manifest: base, views: { List } })
    const el = container.querySelector('[data-wb-id="l"]')!
    expect(el.hasAttribute('data-wb-structure')).toBe(false)
    expect(el.getAttribute('data-wb-variant')).toBe('x')
    expect(el.getAttribute('data-wb-state')).toContain('selected')
  })

  it('뷰가 던지면 그 노드만 폴백이 서고 형제는 산다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(() => { throw new Error('테마 버그') })
    const { container } = draw(page([{ id: 'b', type: 'Button', props: { label: 'x' } }, { id: 't', type: 'Text', props: { text: '산다' } }]),
      { manifest: base, views: { Button } })
    const fb = container.querySelector('[data-wb-id="b"]')!
    expect(fb.getAttribute('data-wb-error')).toContain('테마 버그')
    expect(screen.getByText('산다')).toBeTruthy()
  })

  it('Root 를 안 그린 뷰는 기본 뷰로 다시 그리고 console.error 로 말한다', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(() => <button>Root 없음</button>)
    const { container, findByText } = draw(page([{ id: 'b', type: 'Button', props: { label: '기본' } }]), { manifest: base, views: { Button } })
    await findByText('기본')
    expect(container.querySelector('[data-wb-id="b"]')!.getAttribute('data-wb-structure')).toBe('solid')
    expect(err.mock.calls.some((c) => String(c[0]).includes('Root'))).toBe(true)
  })

  it('props 검증 실패는 지금처럼 동기로 onNodeError 에 모인다', () => {
    const errors: NodeRenderError[] = []
    draw(page([{ id: 'b', type: 'Button', props: { label: 3 } }]), { manifest: base, views: {} }, errors)
    expect(errors.map((e) => e.nodeId)).toEqual(['b'])
  })

  it('theme 을 안 주면 구조 경로 그대로다', () => {
    const { container } = render(<>{renderDocument(page([{ id: 'b', type: 'Button', props: { label: 'x' } }]))}</>)
    expect(container.querySelector('[data-wb-id="b"]')!.getAttribute('data-wb-structure')).toBe('solid')
  })
})
```

`installStructures()` 가 필요한 마지막 케이스를 위해 파일 머리의 `beforeAll` 에 `installStructures()` 도 부른다.

- [ ] **Step 3: 실패를 본다** — 두 파일을 돌려 실패 사유가 «`resolveVariant` 없음» · «theme 옵션이 무시됨» 인지 본다.

- [ ] **Step 4: 구현**

```ts
// packages/renderer/src/variant.ts
import type { ComponentDef, WbNode } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 뷰가 받는 variant. 표는 계획서 D4 — 여기가 그 판정의 유일한 자리다. */
export function resolveVariant(
  def: ComponentDef,
  node: WbNode,
  props: Record<string, unknown>,
  manifest: ThemeManifest | undefined,
): string | undefined {
  if (def.variantFrom !== undefined) {
    const value = props[def.variantFrom]
    return typeof value === 'string' ? value : undefined
  }
  const declared = manifest?.components?.[def.type]
  if (declared === undefined) return node.variant
  return declared.variants.some((v) => v.id === node.variant) ? node.variant : declared.defaultVariant
}
```

```tsx
// packages/renderer/src/view-host.tsx
import { Component, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import { NodeContext, type NodeBinding, type View, type ViewProps } from '@wirebound/theme-sdk'
import { FallbackNode } from './fallback'

class NodeBoundary extends Component<{ nodeId: string; children: ReactNode; fallbackChildren: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }
  static getDerivedStateFromError(error: unknown) {
    return { message: `테마 뷰가 던졌습니다: ${error instanceof Error ? error.message : String(error)}` }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }
  render() {
    if (this.state.message !== null) {
      return <FallbackNode nodeId={this.props.nodeId} message={this.state.message}>{this.props.fallbackChildren}</FallbackNode>
    }
    return this.props.children
  }
}

function Guarded(props: { view: View; fallbackView: View; binding: Omit<NodeBinding, 'markRootRendered'>; viewProps: ViewProps; nodeId: string }): ReactElement {
  const rendered = useRef(false)
  rendered.current = false
  const [missing, setMissing] = useState(false)
  useLayoutEffect(() => {
    if (!missing && !rendered.current) {
      console.error(`${props.viewProps.type} 테마 뷰가 Root 를 그리지 않아 기본 뷰로 대신 그렸습니다 (노드 ${props.nodeId})`)
      setMissing(true)
    }
  })
  const View = missing ? props.fallbackView : props.view
  const binding: NodeBinding = { ...props.binding, markRootRendered: () => { rendered.current = true } }
  return <NodeContext.Provider value={binding}><View {...props.viewProps} /></NodeContext.Provider>
}

export function ViewHost(props: Parameters<typeof Guarded>[0]): ReactElement {
  return (
    <NodeBoundary nodeId={props.nodeId} fallbackChildren={props.viewProps.children}>
      <Guarded {...props} />
    </NodeBoundary>
  )
}
```

`render.tsx` 의 `renderNodeIn` 에서 props 검증을 지난 뒤, **`options.theme` 이 있으면** 구조 해석 대신:

```tsx
if (options.theme !== undefined) {
  const props = parsed.data as Record<string, unknown>
  const variant = resolveVariant(def, node, props, options.theme.manifest)
  const states = activeStates(def, props)
  const attrs: Record<string, string | undefined> = { 'data-wb-id': node.id, 'data-wb-component': node.type }
  if (variant !== undefined) attrs['data-wb-variant'] = variant
  if (states.length > 0) attrs['data-wb-state'] = states.join(' ')
  const binding = { attrs: options.interaction === undefined ? attrs : { ...attrs, ...handlersFor(root, node, options) } }
  const fallbackView = DEFAULT_VIEWS[node.type]!
  return (
    <ViewHost
      key={node.id}
      nodeId={node.id}
      view={options.theme.views[node.type] ?? fallbackView}
      fallbackView={fallbackView}
      binding={binding}
      viewProps={{ nodeId: node.id, type: node.type, props, states, variant, children, slot: options.slot ?? null }}
    />
  )
}
```

머리주석(`renderNode` 의 «흡수하지 않는 것») 에 «테마 경로에서는 뷰 본문의 예외를 노드 경계가 받는다» 한 문장을 더한다.

- [ ] **Step 5: 통과를 본다** — `pnpm vitest run packages/renderer` 전체(옛 케이스 포함)와 `packages/theme-sdk` 를 돌려 실행 수 · 실패 0 을 적는다. `default-view-parity` 가 여기서 통과해야 한다 — 실패하면 기본 뷰 쪽을 고친다(옛 구현체를 고치지 않는다).

- [ ] **Step 6: 구분력** — `view-host.tsx` 를 경로 전체 이름으로 백업하고(`cp packages/renderer/src/view-host.tsx "$SCRATCH/packages__renderer__src__view-host.tsx"`) 세 변조를 **하나씩** 심어 무엇이 죽는지 적는다: ① `NodeBoundary` 를 걷고 `Guarded` 만 돌려준다 ② `setMissing(true)` 를 지운다 ③ `render.tsx` 에서 `resolveVariant` 대신 `node.variant` 를 넘긴다. 각 변조 뒤 바이트 비교로 복원하고 `git status` · `git diff --stat` 로 뜻한 파일뿐인지 본다. 죽지 않는 변조가 있으면 덮지 말고 그렇다고 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add packages/renderer
git commit -m "feat(renderer): theme render path — views as components, per-node boundary, variant resolution"
```

---

## Task 5: 포커스 · 마커 좌표 — `markerPoint`

**Files:**
- Create: `packages/renderer/src/marker.ts`
- Modify: `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/marker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Point { x: number; y: number }
  /** 노드 루트 요소 → 선택 외곽선이 감쌀 요소(`[data-wb-focus]` 가 루트 안에 있으면 그것, 아니면 루트). 루트의 자손 노드 안의 focus 는 보지 않는다. */
  export function focusElement(root: Element): Element
  /** 노드 루트 요소 → 마커 중심점. 좌표계는 `root.getBoundingClientRect()` 와 같다. */
  export function markerPoint(root: Element): Point
  ```

- [ ] **Step 1: 실패하는 테스트**

```ts
// packages/renderer/test/marker.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { focusElement, markerPoint } from '@wirebound/renderer'

function box(el: Element, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
}

function node(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild!
}

describe('markerPoint', () => {
  const cases: [string, [number, number]][] = [
    ['top-start', [10, 20]], ['top-end', [110, 20]], ['bottom-start', [10, 70]],
    ['bottom-end', [110, 70]], ['start', [10, 45]], ['end', [110, 45]],
  ]
  for (const [placement, [x, y]] of cases) {
    it(placement, () => {
      const root = node(`<div data-wb-id="n" data-wb-marker="${placement}"></div>`)
      box(root, 10, 20, 100, 50)
      expect(markerPoint(root)).toEqual({ x, y })
    })
  }

  it('속성이 없으면 top-start · offset 0 — 지금 캔버스의 자리', () => {
    const root = node('<div data-wb-id="n"></div>')
    box(root, 10, 20, 100, 50)
    expect(markerPoint(root)).toEqual({ x: 10, y: 20 })
  })

  it('offset 을 더한다', () => {
    const root = node('<div data-wb-id="n" data-wb-marker="top-end" data-wb-marker-offset="4,-8"></div>')
    box(root, 10, 20, 100, 50)
    expect(markerPoint(root)).toEqual({ x: 114, y: 12 })
  })

  it('망가진 offset · placement 는 무시하고 기본값으로', () => {
    const root = node('<div data-wb-id="n" data-wb-marker="middle" data-wb-marker-offset="a,b"></div>')
    box(root, 10, 20, 100, 50)
    expect(markerPoint(root)).toEqual({ x: 10, y: 20 })
  })

  it('focus 요소가 있으면 그 상자가 기준이다', () => {
    const root = node('<div data-wb-id="n" data-wb-marker="bottom-end"><header></header><table data-wb-focus=""></table></div>')
    box(root, 0, 0, 300, 300)
    box(root.querySelector('table')!, 50, 60, 100, 40)
    expect(focusElement(root).tagName).toBe('TABLE')
    expect(markerPoint(root)).toEqual({ x: 150, y: 100 })
  })

  it('자식 노드 안의 focus 는 이 노드의 것이 아니다', () => {
    const root = node('<div data-wb-id="p"><div data-wb-id="c"><span data-wb-focus=""></span></div></div>')
    expect(focusElement(root)).toBe(root)
  })
})
```

- [ ] **Step 2: 실패를 본다.**

- [ ] **Step 3: 구현**

```ts
// packages/renderer/src/marker.ts
export interface Point { x: number; y: number }

const PLACEMENTS = new Set(['top-start', 'top-end', 'bottom-start', 'bottom-end', 'start', 'end'])

export function focusElement(root: Element): Element {
  for (const el of root.querySelectorAll('[data-wb-focus]')) {
    // 가장 가까운 노드(자기 자신 포함)가 root 여야 이 노드의 것이다 — 자식 노드 안의 focus 는 그 자식의 것이다.
    if (el.closest('[data-wb-id]') === root) return el
  }
  return root
}

function offsetOf(root: Element): [number, number] {
  const raw = root.getAttribute('data-wb-marker-offset')
  if (raw === null) return [0, 0]
  const parts = raw.split(',').map(Number)
  return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0]!, parts[1]!] : [0, 0]
}

export function markerPoint(root: Element): Point {
  const r = focusElement(root).getBoundingClientRect()
  const raw = root.getAttribute('data-wb-marker') ?? 'top-start'
  const placement = PLACEMENTS.has(raw) ? raw : 'top-start'
  const x = placement.endsWith('end') ? r.left + r.width : r.left
  const y = placement.startsWith('top') ? r.top : placement.startsWith('bottom') ? r.top + r.height : r.top + r.height / 2
  const [dx, dy] = offsetOf(root)
  return { x: x + dx, y: y + dy }
}
```

- [ ] **Step 4: 통과를 본다** — 11 passed.

- [ ] **Step 5: 커밋**

```bash
git add packages/renderer
git commit -m "feat(renderer): markerPoint and focusElement shared by canvas, viewer and PPTX"
```

---

## Task 6: 저장소 테마 `system-admin` 첫 판

**Files:**
- Modify: `pnpm-workspace.yaml`(`system-themes/*`), 루트 `package.json`(`typecheck` 글롭에 `system-themes/*/tsconfig*.json`, `build` 필터에 `./system-themes/*`), `vitest.config.ts`(별칭 `@wirebound/system-theme-admin` → `system-themes/admin/src/index.ts`, `unit` 프로젝트 글롭에 `system-themes/*/test/**/*.test.{ts,tsx}`), `tsconfig.json`(참조)
- Create: `system-themes/admin/package.json`, `system-themes/admin/tsconfig.json`, `system-themes/admin/src/{index.ts,manifest.ts,theme.css,css.d.ts}`
- Test: `system-themes/admin/test/admin.test.ts`

**Interfaces:**
- Consumes: Task 1 `defineTheme` · `ThemeManifest`, Task 3 `DEFAULT_VIEWS`.
- Produces:
  ```ts
  export const ADMIN_V0: ThemeDefinition      // views = DEFAULT_VIEWS
  export const ADMIN_V0_CSS: string            // theme.css 원문
  ```

- [ ] **Step 1: CSS 를 한 번 뽑는다** — 스크래치패드에 아래 스크립트를 쓰고, api 의 tsx 로 돌려 `system-themes/admin/src/theme.css` 로 받는다(스크립트는 저장소에 넣지 않는다 — 계획서 D6).

```ts
// $SCRATCH/admin-css.ts
import { ADMIN_THEME, compileTheme, resolveTheme } from '@wirebound/themes'
import { installCatalog } from '@wirebound/schema'
installCatalog()
const r = resolveTheme(ADMIN_THEME)
if (!r.theme) { console.error(r.issues); process.exit(1) }
process.stdout.write(compileTheme(r.theme))
```

```bash
cp "$SCRATCH/admin-css.ts" apps/api/.probe-admin-css.ts
pnpm --filter @wirebound/api exec tsx --conditions=development .probe-admin-css.ts > system-themes/admin/src/theme.css
rm apps/api/.probe-admin-css.ts
git status --short   # apps/api 에 남은 것이 없어야 한다
```

파일 머리에 CSS 주석 한 단락을 더한다: 이 파일은 옛 JSON 테마 `admin` 의 컴파일 결과를 옮긴 첫 판이고 이제 이 파일이 소스라는 것, `:root` 의 `--wb-semantic-*` 는 manifest 토큰이 덮는 자리라는 것. 뽑은 크기(바이트)와 `@media` 수를 보고에 적는다(설계 탐침에서 15194 바이트 · `@media` 1 이었다 — 다르면 다른 까닭을 적는다).

- [ ] **Step 2: 실패하는 테스트**

```ts
// system-themes/admin/test/admin.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { DEFAULT_VIEWS } from '@wirebound/theme-sdk'
import { ADMIN_V0, ADMIN_V0_CSS } from '@wirebound/system-theme-admin'

beforeAll(() => installCatalog())

describe('system-admin 첫 판', () => {
  it('id · 판 · sdk 범위', () => {
    expect(ADMIN_V0.manifest.id).toBe('system-admin')
    expect(ADMIN_V0.manifest.version).toBe('0.1.0')
    expect(ADMIN_V0.manifest.sdk).toBe('^1.0.0')
  })

  it('뷰는 기본 뷰다', () => {
    expect(ADMIN_V0.views).toBe(DEFAULT_VIEWS)
  })

  it('토큰 키마다 CSS 의 :root 에 같은 이름의 변수가 있다', () => {
    const keys = Object.keys(ADMIN_V0.manifest.tokens.items)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(ADMIN_V0_CSS).toContain(`--wb-${key.replaceAll('.', '-')}:`)
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(ADMIN_V0.manifest.components ?? {})) expect(catalog.has(type)).toBe(true)
  })

  it('CSS 는 비어 있지 않고 :root 로 시작한다', () => {
    expect(ADMIN_V0_CSS.length).toBeGreaterThan(1000)
    expect(ADMIN_V0_CSS).toContain(':root {')
  })
})
```

- [ ] **Step 3: 실패를 본다.**

- [ ] **Step 4: 구현**

```ts
// system-themes/admin/src/manifest.ts
import type { ThemeManifest } from '@wirebound/theme-sdk'

export const MANIFEST: ThemeManifest = {
  id: 'system-admin',
  name: '관리자',
  description: '관리자 화면용 기본 테마',
  version: '0.1.0',
  sdk: '^1.0.0',
  tokens: {
    groups: [{ id: 'color', label: '색' }, { id: 'shape', label: '모양' }],
    items: {
      'semantic.primary': { type: 'color', label: '주색', group: 'color', default: '#2563eb' },
      'semantic.primarySoft': { type: 'color', label: '주색(옅게)', group: 'color', default: '#eff6ff' },
      'semantic.surface': { type: 'color', label: '면', group: 'color', default: '#ffffff' },
      'semantic.canvas': { type: 'color', label: '바탕', group: 'color', default: '#f8fafc' },
      'semantic.border': { type: 'color', label: '테두리', group: 'color', default: '#e2e8f0' },
      'semantic.borderStrong': { type: 'color', label: '테두리(짙게)', group: 'color', default: '#94a3b8' },
      'semantic.text': { type: 'color', label: '글자', group: 'color', default: '#0f172a' },
      'semantic.textMuted': { type: 'color', label: '글자(흐리게)', group: 'color', default: '#475569' },
      'semantic.danger': { type: 'color', label: '위험', group: 'color', default: '#ef4444' },
      'radius.sm': { type: 'length', label: '모서리(작게)', group: 'shape', default: '4px' },
      'radius.md': { type: 'length', label: '모서리(중간)', group: 'shape', default: '6px' },
      'radius.lg': { type: 'length', label: '모서리(크게)', group: 'shape', default: '10px' },
    },
  },
}
```

기본값은 Step 1 에서 뽑은 CSS 의 `:root` 가 실제로 내는 값(팔레트를 따라가 얻은 16진)과 같아야 한다 — 다르면 CSS 를 기준으로 manifest 를 고친다. `semantic.surface` 가 CSS 에 없으면 그 키를 뺀다.

```ts
// system-themes/admin/src/index.ts
import { defineTheme, DEFAULT_VIEWS } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'

export const ADMIN_V0 = defineTheme({ manifest: MANIFEST, views: DEFAULT_VIEWS })
export const ADMIN_V0_CSS: string = css
```

```ts
// system-themes/admin/src/css.d.ts
declare module '*.css?raw' {
  const content: string
  export default content
}
```

`package.json` 은 `@wirebound/system-theme-admin`, `private: true`, `exports` 는 `./src/index.ts`(빌드 산출물 없음 — 이 차수의 소비자는 vite · vitest 뿐이다. `.wbtheme` 빌드는 A2), 의존 `@wirebound/theme-sdk`. `tsconfig.json` 은 `noEmit: true`.

- [ ] **Step 5: 통과를 본다** — 5 passed. `pnpm typecheck` 0 오류(소스 옆에 `.js` 가 흘러나오지 않았는지 `git status` 로 본다).

- [ ] **Step 6: 커밋**

```bash
git add pnpm-workspace.yaml package.json vitest.config.ts tsconfig.json pnpm-lock.yaml system-themes/admin
git commit -m "feat(system-themes): system-admin v0 — default views plus the old admin CSS as source"
```

---

## Task 7: `CanvasIframe` — iframe 문서에 portal 로 그리기

**Files:**
- Create: `apps/web/src/canvas/canvas-iframe.tsx`
- Modify: `apps/web/src/shell.css`(`.wb-shell-canvas-iframe`), `apps/web/package.json`(의존 `@wirebound/theme-sdk` · `@wirebound/system-theme-admin`)
- Test: `apps/web/test/canvas/canvas-iframe.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function CanvasIframe(props: {
    /** iframe 문서의 head 에 차례로 싣는 스타일. id 는 `data-wb-style` 값. */
    styles: readonly { id: string; css: string }[]
    width: number
    children: (frame: { document: Document; window: Window }) => ReactNode
    onFrame?: (frame: { document: Document; window: Window } | null) => void
  }): ReactElement
  ```

- [ ] **Step 1: 스파이크 — jsdom 에서 portal 클릭이 호스트 핸들러에 닿는가.** 아래 테스트의 «iframe 안 클릭이 호스트 onClick 에 닿는다» 를 먼저 쓰고 돌린다. **닿지 않으면** `CanvasIframe` 이 iframe 문서에 네이티브 `click` 리스너를 달아 `props.onFrameClick(event.target)` 으로 넘기는 판으로 인터페이스를 바꾸고, 그 사실과 실패 값을 보고에 적는다(아래 구현은 닿는 판이다).

- [ ] **Step 2: 실패하는 테스트**

```tsx
// apps/web/test/canvas/canvas-iframe.test.tsx
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasIframe } from '../../src/canvas/canvas-iframe'

function frameDoc(container: HTMLElement): Document {
  const iframe = container.querySelector('iframe')!
  return iframe.contentDocument!
}

describe('CanvasIframe', () => {
  it('자식을 iframe 문서의 body 에 그린다 — 호스트 문서에는 없다', async () => {
    const { container } = render(
      <CanvasIframe styles={[]} width={1280}>{() => <p data-probe="1">안</p>}</CanvasIframe>,
    )
    await waitFor(() => expect(frameDoc(container).querySelector('[data-probe]')).not.toBeNull())
    expect(document.querySelector('[data-probe]')).toBeNull()
  })

  it('스타일은 iframe 의 head 에 차례로 — 호스트 head 에는 없다', async () => {
    const { container } = render(
      <CanvasIframe styles={[{ id: 'base', css: 'p{}' }, { id: 'theme', css: 'button{color:red}' }]} width={1280}>{() => null}</CanvasIframe>,
    )
    await waitFor(() => expect(frameDoc(container).head.querySelectorAll('style[data-wb-style]')).toHaveLength(2))
    const ids = [...frameDoc(container).head.querySelectorAll('style')].map((s) => s.getAttribute('data-wb-style'))
    expect(ids).toEqual(['base', 'theme'])
    expect(document.head.querySelector('style[data-wb-style="theme"]')).toBeNull()
  })

  it('두 번 마운트해도 style 은 한 벌', async () => {
    const { container } = render(
      <StrictMode><CanvasIframe styles={[{ id: 'base', css: 'p{}' }]} width={1280}>{() => null}</CanvasIframe></StrictMode>,
    )
    await waitFor(() => expect(frameDoc(container).head.querySelectorAll('style[data-wb-style="base"]')).toHaveLength(1))
  })

  it('스타일 내용이 바뀌면 같은 태그를 고쳐 쓴다', async () => {
    const { container, rerender } = render(<CanvasIframe styles={[{ id: 'theme', css: 'a{}' }]} width={1280}>{() => null}</CanvasIframe>)
    rerender(<CanvasIframe styles={[{ id: 'theme', css: 'b{}' }]} width={1280}>{() => null}</CanvasIframe>)
    await waitFor(() => expect(frameDoc(container).head.querySelector('style')!.textContent).toBe('b{}'))
    expect(frameDoc(container).head.querySelectorAll('style')).toHaveLength(1)
  })

  it('iframe 안 클릭이 호스트 onClick 에 닿는다', async () => {
    const onClick = vi.fn()
    const { container } = render(
      <div onClick={(e) => onClick((e.target as Element).getAttribute('data-probe'))}>
        <CanvasIframe styles={[]} width={1280}>{() => <button data-probe="안">누름</button>}</CanvasIframe>
      </div>,
    )
    await waitFor(() => expect(frameDoc(container).querySelector('button')).not.toBeNull())
    fireEvent.click(frameDoc(container).querySelector('button')!)
    expect(onClick).toHaveBeenCalledWith('안')
  })

  it('폭은 width px 그대로', () => {
    const { container } = render(<CanvasIframe styles={[]} width={375}>{() => null}</CanvasIframe>)
    expect(container.querySelector('iframe')!.style.width).toBe('375px')
  })

  it('내용이 자라면 iframe 이 따라 자란다', async () => {
    const { container } = render(<CanvasIframe styles={[]} width={1280}>{() => <div />}</CanvasIframe>)
    const doc = await waitFor(() => frameDoc(container))
    // jsdom 은 레이아웃이 없어 scrollHeight 를 흉내 낸다 — 실브라우저 판은 Task 9.
    Object.defineProperty(doc.documentElement, 'scrollHeight', { configurable: true, value: 640 })
    await act(async () => { doc.defaultView!.dispatchEvent(new Event('wb-canvas-measure')) })
    expect(container.querySelector('iframe')!.style.height).toBe('640px')
  })
})
```

- [ ] **Step 3: 실패를 본다.**

- [ ] **Step 4: 구현**

```tsx
// apps/web/src/canvas/canvas-iframe.tsx
/**
 * 캔버스 문서를 그리는 same-origin iframe. 목적은 **문서 분리**다 — 테마 CSS 가 에디터를 칠하지 않고,
 * 테마의 `@media` 가 뷰포트 프리셋 폭으로 판정된다(설계 spec 「캔버스 iframe」). 보안 격리가 아니다.
 *
 * 문서 트리는 호스트의 React 로 그려 portal 로 iframe body 에 붙인다. 그래서 React 이벤트는 호스트 트리로
 * 버블링하고, 뷰 코드의 전역 `window` 는 호스트 창이다(iframe 창은 SDK 의 `useWindow`).
 */
import { useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Frame { document: Document; window: Window }

const MEASURE_EVENT = 'wb-canvas-measure'

export function CanvasIframe(props: {
  styles: readonly { id: string; css: string }[]
  width: number
  children: (frame: Frame) => ReactNode
  onFrame?: (frame: Frame | null) => void
}): ReactElement {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [height, setHeight] = useState(320)

  useLayoutEffect(() => {
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!doc || !win) return
    if (doc.body === null) doc.write('<!doctype html><html><head></head><body></body></html>')
    doc.body.style.margin = '0'
    const next = { document: doc, window: win }
    setFrame(next)
    props.onFrame?.(next)
    return () => props.onFrame?.(null)
  }, [iframe])

  useLayoutEffect(() => {
    if (frame === null) return
    const head = frame.document.head
    for (const { id, css } of props.styles) {
      let tag = head.querySelector<HTMLStyleElement>(`style[data-wb-style="${id}"]`)
      if (tag === null) {
        tag = frame.document.createElement('style')
        tag.setAttribute('data-wb-style', id)
        head.appendChild(tag)
      }
      if (tag.textContent !== css) tag.textContent = css
    }
  }, [frame, props.styles])

  useLayoutEffect(() => {
    if (frame === null) return
    const measure = () => setHeight(Math.max(320, frame.document.documentElement.scrollHeight))
    measure()
    const Observer = (frame.window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    const observer = Observer ? new Observer(measure) : null
    observer?.observe(frame.document.body)
    frame.window.addEventListener(MEASURE_EVENT, measure)
    return () => { observer?.disconnect(); frame.window.removeEventListener(MEASURE_EVENT, measure) }
  }, [frame])

  return (
    <>
      <iframe
        ref={setIframe}
        className="wb-shell-canvas-iframe"
        title="캔버스 문서"
        style={{ width: `${props.width}px`, height: `${height}px` }}
      />
      {frame !== null && createPortal(props.children(frame), frame.document.body)}
    </>
  )
}
```

`style[data-wb-style="${id}"]` 는 id 가 코드 상수(`base` · `theme`)라서 셀렉터로 조립해도 된다 — 사용자 값이 아니다. `shell.css` 에 `.wb-shell-canvas-iframe { display: block; border: 0; }` 를 `.wb-shell-canvas-surface` 규칙 옆에 더하고, 파일 머리의 래퍼 속성 허용 목록 규칙(`test/shell-css.test.ts`)이 요구하는 대로 등록한다.

- [ ] **Step 5: 통과를 본다** — 7 passed.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/canvas/canvas-iframe.tsx apps/web/src/shell.css apps/web/package.json apps/web/test/canvas/canvas-iframe.test.tsx pnpm-lock.yaml
git commit -m "feat(web): CanvasIframe — same-origin iframe document filled through a portal"
```

---

## Task 8: 캔버스를 iframe · 뷰 경로로 옮긴다

**Files:**
- Create: `apps/web/src/canvas/canvas-theme.ts`
- Modify: `apps/web/src/canvas/canvas.tsx`, `apps/web/test/editor-harness.tsx`, 그리고 아래 «직접 조회 파일» 목록
- Test: `apps/web/test/canvas/canvas.test.tsx`(고침), `apps/web/test/canvas/canvas-markers.test.tsx`(고침), `apps/web/test/canvas/bundle-parity.test.tsx`(고침)

**Interfaces:**
- Consumes: Task 4 `RenderOptions.theme`, Task 5 `markerPoint` · `focusElement`, Task 6 `ADMIN_V0` · `ADMIN_V0_CSS`, Task 7 `CanvasIframe`, Task 3 `defaultViewsCss`, Task 2 `ThemeProvider`.
- Produces:
  ```ts
  // canvas-theme.ts — A4 가 프로젝트의 id@버전으로 바꿀 자리
  export const CANVAS_THEME: ThemeDefinition
  export const CANVAS_STYLES: readonly { id: string; css: string }[]   // [{id:'base', css: defaultViewsCss()}, {id:'theme', css: ADMIN_V0_CSS}]
  export function canvasTokens(theme: ThemeDefinition): Record<string, string | number>  // 토큰 기본값
  // editor-harness.tsx
  export function canvasDocument(): Document
  ```

- [ ] **Step 1: 하네스를 iframe 기준으로 고친다** — `editor-harness.tsx` 에 `canvasDocument()` 를 더하고(`canvasFrame()` 안의 `iframe.wb-shell-canvas-iframe` 의 `contentDocument`, 없으면 던진다), `nodeElement` · `canvasRootId` 가 그 문서를 보게 한다. `deselect()` 는 iframe 문서의 `body` 를 누른다. `selectionOutline()` 은 호스트 문서 그대로다(외곽선은 호스트에 그린다 — D8). `nodeElement` 는 셀렉터를 조립하지 말고 `[data-wb-id]` 를 돌며 속성을 견준다(Review Focus 4).

- [ ] **Step 2: 직접 조회를 센다** — 하네스를 거치지 않고 캔버스를 조회하는 테스트 파일을 센다.

```bash
git grep -lE "document(\.body)?\.querySelector(All)?\(\s*['\"\`][^'\"\`]*(data-wb-id|wb-shell-canvas|data-wb-marker|data-wb-structure)" apps/web/test
```

설계 탐침에서 이 목록은 `panels/comment-diverged-lift` · `panels/list-control` · `panels/comment-marker-wait` · `panels/property-panel` · `panels/comment-panel` · `lock/undo-locks` · `canvas/canvas-markers` · `canvas/interaction-runtime` · `canvas/canvas` · `edit/undo-redo` · `edit/undo-restore` · `edit/edit-recovery` · `edit/rebase-dropped-refusal` · `edit/use-edit-commit` · `edit/undo-restore-history` · `api/response-shape` · `routes/viewer-entries` · `routes/viewer-readonly` · `routes/role-live` · `session/logout-farewell` 이었다. 다시 센 목록과 견주고, 문서 노드(`data-wb-id` · `data-wb-structure`)를 찾는 자리는 `canvasDocument()` 로, 외곽선 · 마커(`data-wb-selected-id` · `data-wb-marker-for` · `.wb-shell-marker`)를 찾는 자리는 호스트 문서 그대로 둔다. 표본 셋을 열어 옳게 갈랐는지 본다.

- [ ] **Step 3: 실패하는 테스트를 더한다** — `canvas.test.tsx` 에:

```tsx
it('문서는 iframe 안에, 외곽선은 호스트에 그린다', async () => {
  await openPage(docWithText('t1', '안'))
  expect(canvasDocument().querySelector('[data-wb-id="t1"]')).not.toBeNull()
  expect(document.querySelector('[data-wb-id="t1"]')).toBeNull()
  expect(selectionOutline()).not.toBeNull()
})

it('iframe 의 head 에 base · theme 스타일이 차례로 있다', async () => {
  await openPage(docWithText('t1', '안'))
  const ids = [...canvasDocument().head.querySelectorAll('style[data-wb-style]')].map((s) => s.getAttribute('data-wb-style'))
  expect(ids).toEqual(['base', 'theme'])
})

it('빈 자리 클릭은 선택을 푼다', async () => {
  await openPage(docWithText('t1', '안'))
  deselect()
  await waitFor(() => expect(selectionOutline()).toBeNull())
})

it('따옴표가 든 id 도 고른다', async () => {
  await openPage(docWithText('t"1 x', '안'))
  fireEvent.click(requireNode('t"1 x'))
  await waitFor(() => expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('t"1 x'))
})

```

`docWithText(id, text)` 가 하네스에 없으면 `Page > Text` 문서를 만드는 도우미로 더한다.

**«편집 뒤 외곽선이 새 자리에 선다» 케이스를 하나 더 세운다.** 순서:
1. 하네스에 `stackLayout(doc: Document): void` 를 더한다 — `doc` 안의 `HTMLElement.prototype.getBoundingClientRect` 를 가로채, `[data-wb-id]` 요소는 문서 순서의 번호 i 에 대해 `{ left: 0, top: i * 20, width: 100, height: 20 }` 를, 그 밖의 요소는 가장 가까운 `[data-wb-id]` 조상의 상자를 돌려준다. 되돌리는 함수를 돌려준다.
2. `Page > [Text t1]` 문서를 열고 `stackLayout(canvasDocument())` 를 건 뒤 `t1` 을 고른다 — `selectionOutline().style.top` 이 `20px`(Page 가 0 번, t1 이 1 번).
3. 구조 트리 툴바로 `t1` 앞에 `Text` 하나를 넣는다(`test/edit/` 의 기존 삽입 케이스가 쓰는 조작을 그대로 쓴다 — 그 파일의 도우미를 가져온다).
4. `t1` 이 여전히 선택된 채 `selectionOutline().style.top` 이 `40px` 가 될 때까지 기다린다.

옛 테마 주입을 재던 케이스(`canvas.test.tsx` 의 «서버 테마가 `<style data-wb-style="theme">` 에» · «null 테마면 빈 시트» · «프로젝트 id 로 요청» · «테마의 구조가 렌더러에» · «구조 구현체가 던져도 경계가 산다») 는 **지운다** — 캔버스가 서버 테마를 안 읽는다(D9). 마지막 것은 «테마 뷰가 던져도 캔버스가 산다» 로 바꿔 둔다(`CANVAS_THEME` 을 `vi.mock` 으로 던지는 뷰가 든 테마로 바꾼다 — `apps/web` 테스트는 `setupFiles` 가 앱 모듈을 먼저 싣지 않으므로 파일 머리의 `vi.mock` 이 닿는다. 닿는지 호출 수로 확인한다).

- [ ] **Step 4: 실패를 본다** — `pnpm vitest run apps/web/test/canvas`.

- [ ] **Step 5: 구현** — `canvas-theme.ts`:

```ts
import { ADMIN_V0, ADMIN_V0_CSS } from '@wirebound/system-theme-admin'
import { defaultViewsCss, type ThemeDefinition } from '@wirebound/theme-sdk'

/** 캔버스가 그리는 테마. 이 차수에서는 저장소 테마 하나로 고정이다 — A4 가 프로젝트의 id@버전으로 바꾼다. */
export const CANVAS_THEME: ThemeDefinition = ADMIN_V0

export const CANVAS_STYLES = Object.freeze([
  { id: 'base', css: defaultViewsCss() },
  { id: 'theme', css: ADMIN_V0_CSS },
] as const)

export function canvasTokens(theme: ThemeDefinition): Record<string, string | number> {
  return Object.fromEntries(Object.entries(theme.manifest.tokens.items).map(([k, d]) => [k, d.default]))
}
```

`canvas.tsx` 에서:
- `useProjectThemeState` · `useThemeSourceOf` · `useThemeCss` · `themeStructures` · `usePublishCanvasStructures` · `usePublishThemeFailed` import 와 호출을 걷는다.
- `Canvas` 의 `themeReloadToken` prop 을 걷는다. `routes/editor.tsx` 에서 그 값을 들던 `themeReloadToken` 상태와 `CanvasFrame` 을 거쳐 넘기던 자리도 걷고, `ThemePicker` 의 `onChanged` 는 `() => {}` 로 둔다(고르개는 A1b 가 걷는다 — 그때까지 골라도 캔버스는 안 바뀐다). `shell/theme-alert.test.tsx` 의 캔버스 관련 케이스(«실패한 테마 조회가 알림을 세운다» 등 캔버스가 `usePublishThemeFailed` 를 부르는 것에 기댄 것)와 `theme/theme-picker.test.tsx` 의 «고르면 캔버스 시트가 바뀐다», `panels/panel-canvas-structure.test.tsx` 는 지운다. 지운 케이스 이름을 보고에 적는다.
- `CanvasDocument` 는 `renderDocument(doc, { theme: CANVAS_THEME, onNodeError, ...interaction })` 로 그린다.
- 표면 안에 `<CanvasIframe styles={CANVAS_STYLES} width={viewportWidth} onFrame={setFrame}>{(f) => <ThemeProvider value={{ tokens, window: f.window }}><CanvasBoundary …><CanvasDocument …/></CanvasBoundary></ThemeProvider>}</CanvasIframe>` 를 둔다. 외곽선 · 마커 · 알림은 지금처럼 표면의 형제로 둔다.
- `nodeIdAt(target, surface)` → `nodeIdAt(target, frame.document.body)`: 대상에서 `parentElement` 를 따라 iframe body 까지 올라가며 첫 `data-wb-id` 를 찾는다. 대상이 iframe 문서 밖(외곽선 · 알림)이면 `null` 이 아니라 **선택을 바꾸지 않는다**(지금은 외곽선이 `pointer-events:none` 이라 닿지 않는다 — 알림 줄을 누른 것이 선택을 푸는지 지금 코드로 먼저 재고, 같은 동작을 유지한다).
- `findNodeElement(surface, id)` → `findNodeElement(frame.document, id)`, 셀렉터 조립 없이 속성 비교.
- `measure(target, surface, zoom)` → iframe 문서 좌표 그대로: `const r = focusElement(target).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }`(D8 — 줌으로 나누지 않는다. iframe 의 스크롤은 0 이다: 높이를 문서에 맞춘다).
- 마커: `const p = markerPoint(el); marker = { left: p.x, top: p.y }`.
- 레이아웃 이펙트의 의존에 `frame` 을 더한다. iframe 이 자라서 상자가 바뀐 경우를 위해 `CanvasIframe` 의 높이 측정 뒤 다시 재도록 `onFrame` 과 별개로 `ResizeObserver` 가 준 신호를 의존에 넣는다(간단히: `CanvasIframe` 에 `onResize?: () => void` 를 더하고 캔버스가 `measureTick` 상태를 올린다).

`bundle-parity.test.tsx` 는 캔버스 쪽 DOM 을 `canvasDocument()` 에서 읽게 고치고, 견주는 내보내기 쪽은 `system-admin` 과 같은 옛 테마(`systemTheme('admin')`)로 둔다. **캔버스 DOM 과 내보내기 DOM 이 지금처럼 같아야 한다** — 이것이 기본 뷰 이식의 끝에서 끝까지 판이다. 다르면 무엇이 다른지 적고 기본 뷰를 고친다.

- [ ] **Step 6: 통과를 본다** — `pnpm vitest run apps/web` 전량. 실행 수 · 건너뛴 수 · 실패 0 을 적는다. 지운 케이스의 이름과 수를 보고에 적는다.

- [ ] **Step 7: 구분력** — 경로 전체 이름으로 백업하고 하나씩: ① `measure` 에서 `focusElement(target)` 대신 `target` ② `nodeIdAt` 의 올라가기를 iframe body 가 아니라 호스트 표면에서 멈추게 ③ `CanvasIframe` 에 `styles` 를 빈 배열로. 각각 어느 케이스가 무슨 값으로 죽는지 적고 복원(바이트 비교 · `git status` · `git diff --stat`).

- [ ] **Step 8: 커밋**

```bash
git add apps/web
git commit -m "feat(web): canvas renders inside the iframe with the view path and system-admin v0"
```

---

## Task 9: 실브라우저 판

**Files:**
- Modify: `apps/web/build-test/editor-stack.ts`(헬퍼 `canvasFrame(page): FrameLocator` · `canvasText(page): Promise<string>`), `apps/web/build-test/editor-*.test.ts`(캔버스 조회를 iframe 으로)
- Create: `apps/web/build-test/canvas-iframe.test.ts`

- [ ] **Step 1: 기존 판의 캔버스 조회를 센다**

```bash
git grep -nE "wb-shell-canvas-frame|wb-shell-marker|data-wb-id" apps/web/build-test
```

문서 글자를 읽는 자리(`.wb-shell-canvas-frame` 의 `hasText` · `innerText()`)는 `canvasText(page)` 또는 `canvasFrame(page).locator(…)` 로 바꾼다 — 호스트의 `innerText` 는 iframe 안의 글자를 담지 않는다. 마커(`.wb-shell-marker`)는 호스트 그대로다. 바꾼 줄 수를 보고에 적는다.

- [ ] **Step 2: 새 판** — `canvas-iframe.test.ts`(기존 `editor-*.test.ts` 의 `startEditorStack` · `openTab` · 페이지 만들기 모양을 그대로 따른다):

| 케이스 | 재는 법 |
|---|---|
| 캔버스 문서가 iframe 안에 그려진다 | `canvasFrame(page).locator('[data-wb-id]').first()` 가 보인다 · 호스트 `page.locator('[data-wb-component]')` 수가 0 |
| 테마 CSS 가 에디터 버튼을 안 바꾼다 | iframe 문서 head 에 `button{border-radius:0 !important;background:rgb(1,2,3) !important}` 를 `evaluate` 로 더한 뒤, 호스트의 모드 단추(`.wb-shell-mode`)의 `getComputedStyle(...).backgroundColor` 가 더하기 전과 같다 |
| 프리셋 375 에서 iframe 의 `@media` 가 걸린다 | iframe head 에 `@media (max-width: 400px){ body{ --probe: narrow } }` 를 더하고, 뷰포트 폭을 375 로 고른 뒤 iframe 창의 `getComputedStyle(body).getPropertyValue('--probe').trim()` 가 `narrow`, 1280 에서는 빈 값. 브라우저 창 폭은 1440 그대로다 |
| 캔버스 클릭이 노드를 고른다 | iframe 안의 Text 노드를 누르면 `.wb-shell-selection[data-wb-selected-id=…]` 가 선다 · 그 상자가 노드의 화면 상자와 1px 안에서 겹친다(줌 1, 0.5 두 판) |
| 마커가 노드의 top-start 에 선다 | 코멘트를 단 노드의 화면 상자 좌상단과 `.wb-shell-marker` 중심이 1px 안(줌 1, 0.5) |
| 내용이 자라면 iframe 이 자란다 | Text 를 여러 개 넣은 뒤 iframe 요소의 `clientHeight` 가 iframe 문서의 `scrollHeight` 와 같고, iframe 안 세로 스크롤이 없다 |

- [ ] **Step 3: 돌린다** — Postgres 컨테이너가 떠 있는지 보고 `pnpm test:browser`. 실행 수 · 건너뛴 수 · 실패 0 을 적는다. 운영 번들로도 한 번: `EDITOR_STACK_BUNDLE=build pnpm test:browser`(이펙트 순서를 바꾼 차수다 — `CLAUDE.md` 의 실브라우저 판 절).

- [ ] **Step 4: 구분력** — 「테마 CSS 가 에디터 버튼을 안 바꾼다」 가 iframe 없이는 죽는지: `CanvasIframe` 대신 호스트 문서에 스타일을 넣는 변조(스타일 태그를 `document.head` 에)를 심어 그 케이스가 죽는지 본다. 「@media」 케이스도 같은 변조에서 죽어야 한다. 백업 · 바이트 비교 복원.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/build-test
git commit -m "test(web): real-browser cases for the iframe canvas — CSS separation, @media width, selection and marker geometry"
```

---

## Task 10: 전량 게이트와 보고

- [ ] **Step 1:** `pnpm typecheck` — 0 오류. `git status` 에 소스 옆 `.js` · `.d.ts` 가 없다.
- [ ] **Step 2:** `pnpm test` — 실행 수 · 건너뛴 수 · 실패 0. api 스위트는 워크트리의 자기 DB 로 돈다(`CLAUDE.md` 「생성 직후 세팅」). DB 를 안 띄운 판이면 `pnpm test --project '!api'` 로 돌리고 그렇다고 적는다 — 이 차수는 api 를 바꾸지 않는다.
- [ ] **Step 3:** `pnpm test:build` — 실행 수. `packages/exporter` 의 `dist-*` 판이 그대로 초록인지(내보내기를 안 건드렸다는 확인).
- [ ] **Step 4:** 보고서 `docs/superpowers/plans/2026-09-27-a1a-report.md` — 태스크마다 커밋 · 실행 수 · 구분력 변조 결과(무엇이 무슨 값으로 죽었나), 지운 테스트 케이스 목록과 까닭, `system-themes/admin/src/theme.css` 의 크기 · `@media` 수, 스파이크(Task 7 Step 1) 결과, 계획과 달라진 것.

---

## 이 계획이 정하지 않고 넘기는 것

- 옛 체계 걷기 — 카탈로그의 `structures` · `parts` · `variants` · `visibleWhen`, 렌더러 구조 레지스트리 · structure-css, `packages/themes`, 웹의 테마 고르개 · 편집 화면 · 갤러리, api 의 테마 라우트 · 테이블, 스냅샷 payload 의 테마, CLI · MCP 의 테마 lint, 내보내기 경로의 «테마 이전 중» 거절. **A1b 계획**이 A1a 병합 뒤의 코드로 센다.
- manifest zod 검증 · `.wbtheme` · `theme-kit` — A2.
- 뷰 props 의 컴포넌트별 타입(`ViewProps<'List'>`) — 카탈로그가 props 타입을 내보내지 않는다(`packages/schema/src/component/catalog/*.ts` 의 `defineComponent` 결과는 `ComponentDef` 다). A2 에서 `theme-kit` 작성자 경험과 함께 정한다.
- 속성 패널의 `hideProps` 적용 — manifest 를 읽는 패널은 A4.
