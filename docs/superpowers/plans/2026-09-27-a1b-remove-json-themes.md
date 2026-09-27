# A1b — 옛 JSON 테마 체계 걷기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」를 따른다 — 태스크는 워크트리의 Orca 워커가 한다.

**Goal:** 옛 JSON 테마 체계(카탈로그의 구조 어휘 · 렌더러의 구조 경로 · `packages/themes` 의 테마 엔진 · 웹의 테마 UI · api 의 테마 저장과 라우트 · 스냅샷의 테마)가 저장소에서 사라지고, 모든 그리기가 A1a 의 뷰 경로 하나로 선다.

**Architecture:** 소비자부터 떼고 제공자를 나중에 걷는다 — 내보내기 → 웹 → playground → api(+ 스냅샷 · CLI · MCP) → `packages/themes` → 렌더러 → 스키마. 그래서 태스크마다 `pnpm typecheck` 가 초록으로 끝난다. 남는 것: 패턴(`packages/themes` 의 패턴 규격 · 전개 — manifest 가 싣는다), 스냅샷 payload 규격(테마 없이 판 2), 설계 lint(`lintProject` 는 설계 lint 만).

**Tech Stack:** TypeScript · React 19 · Kysely 마이그레이션 · vitest · playwright-core.

**Spec:** `docs/superpowers/specs/2026-09-27-code-themes-design.md` — 「걷어 낼 것」 · 「진행 단계」(A1 의 뒤 절반). 앞 차수: `docs/superpowers/plans/2026-09-27-a1a-theme-sdk-iframe-canvas.md` · 보고 `2026-09-27-a1a-report.md` · 리뷰 `2026-09-27-a1a-review.md` · 대응 `2026-09-27-a1a-fix-report.md`.

## Global Constraints

- 새 프로덕션 런타임 의존을 더하지 않는다. 없어지는 의존(`@wirebound/themes` 를 더는 안 보는 패키지의 의존)은 `package.json` 에서 뺀다.
- **api 의 Node 프로세스는 테마 코드를 싣지 않는다**(spec 「내보내기와 PPTX」). 내보내기는 이 차수에서 SDK 기본 뷰와 `defaultViewsCss()` 로 그린다(D3).
- 태스크마다 끝에서 `pnpm typecheck` 오류 0 · 그 태스크가 건드린 패키지의 테스트 초록. 전량 게이트는 Task 9.
- 지우는 테스트 케이스는 **이름과 까닭**을 보고에 적는다. «옛 체계를 재던 케이스» 가 아닌데 죽는 것은 지우지 말고 고친다.
- 사용자에게 보이던 동작 가운데 이 차수가 **바꾸는 것**은 D1 ~ D6 이 적은 것뿐이다. 그 밖에서 동작이 바뀌면 멈추고 보고한다.
- 주석은 `docs/guideline/base/03-comments.md`, 인용은 `docs/guideline/base/04-citation.md`. 지운 것을 가리키는 주석 · 문서 문장을 남기지 않는다(`CLAUDE.md` 「가르치는 자리가 여럿이면 전부 맞아야 한다」 — 지운 이름으로 `git grep` 해 센다).

## Review Focus

1. **옛 스냅샷이 복원 · 조회된다** — 이 차수 전에 만든 스냅샷(payload 판 1, `themes` 키가 있다)이 마이그레이션 뒤에도 목록 · 조회 · 복원에서 400 · 500 이 나지 않는다. → Task 4 «판 1 스냅샷을 마이그레이션이 판 2 로 고친다» · «고친 스냅샷을 복원한다».
2. **`migrate:down` 왕복** — `test/global-setup.ts` 가 매 실행 latest → none → latest 를 왕복한다. 0018 의 `down` 이 테이블 모양을 되살려 0006 · 0007 의 `down` 이 돈다. → Task 4 «0018 왕복».
3. **패턴이 있는 테마에서 패턴 삽입이 그대로 된다** — 출처만 바뀌었다(D2). → Task 2 «manifest 의 패턴이 고르개에 서고 넣으면 전개된다».
4. **variant 를 가진 노드의 변형 칸** — `Button` 의 `primary` 처럼 옛 카탈로그 variant 를 가진 노드가 속성 패널에서 같은 값을 보이고 바꿀 수 있다. → Task 2 «변형 칸의 선택지는 manifest 가 준다» · «옛 variant 값이 그대로 선다».
5. **내보내기가 끊기지 않는다** — HTML · PPTX 내보내기가 200 으로 끝나고, 결과에 기본 뷰 CSS 가 실린다. → Task 1 «번들의 CSS 는 기본 뷰 CSS 로 시작한다» · Task 4 이후 api export 스위트 초록.

---

## 확정한 결정

### D1. 카탈로그에서 `structures` · `parts` · `variants` · `visibleWhen` · `defaultStructure` 가 사라진다

`ComponentDef` 에는 `type` · `label` · `description` · `group` · `props` · `editor` · `variantFrom?` · `states` · `children` 가 남는다. `variantFrom` 의 검사는 «그 prop 이 있고 enum 이고 editor 에 있다» 만 남는다(`variants` 와 견주던 양방향 검사는 짝이 없어 걷는다). `validate.ts` 의 `unknown-variant` 검사는 걷는다 — variant 는 테마가 선언하므로 스키마가 판정할 수 없다(A3 의 lint 가 manifest 로 본다). `ignored-variant`(variantFrom 컴포넌트에 `variant` 를 단 노드)는 남는다.

### D2. 패턴은 남고, 출처가 캔버스 테마의 manifest 가 된다

패턴 고르개는 `CANVAS_THEME.manifest.patterns` 를 `packages/themes` 의 `PatternsSchema` 로 읽는다. `system-admin` 첫 판에는 패턴이 없다 — 옛 `ADMIN_THEME` 에도 없었으므로 지금 사용자가 보는 «이 테마에는 패턴이 없습니다» 가 그대로다. 패턴 규격(`spec/patterns.ts`)과 전개(`pattern/expand.ts`)는 `packages/themes` 에 남는다(A2 가 manifest 검증과 함께 다시 정리한다).

### D3. 내보내기는 이 차수에서 테마 없이 기본 뷰로 그린다 — spec 과 다르다

spec 「진행 단계」 는 A1 ~ A4 동안 내보내기를 «테마 이전 중» 으로 거절한다고 적었다. **거절하지 않는다.** 거절하면 api 의 내보내기 스위트(작업 풀 · 한도 · PPTX 화면)가 A5 까지 죽은 채 남아 A5 가 되살릴 때 무엇이 깨졌는지 가를 자가 없다. 대신 `exporter` 는 렌더러의 뷰 경로로 그리고, 테마를 받으면(`theme?: ThemeDefinition` · `themeCss?: string`) 그것으로, 안 받으면 SDK 기본 뷰와 `defaultViewsCss()` 로 그린다. api 는 테마 코드를 싣지 않으므로(Global Constraints) 늘 안 받는 판이다 — 결과물은 스타일 없는 와이어프레임이다. 미리보기 응답의 `themeId` 는 `null` 이다. A5 가 브라우저 렌더로 옮기며 프로젝트 테마를 싣는다.

### D4. 변형 칸 — 선택지는 manifest 가 주고, `system-admin` 첫 판이 옛 variant 를 선언한다

속성 패널의 «변형» 칸은 `CANVAS_THEME.manifest.components[type]` 이 있을 때만 서고, 선택지는 그 `variants`(라벨 표시 · id 저장)다. `variantFrom` 컴포넌트는 칸이 없다(지금과 같다). 옛 카탈로그 variant 를 쓰던 페이지가 같은 칸을 보도록, `system-admin` 첫 판 manifest 에 다섯 컴포넌트를 선언한다:

| 컴포넌트 | variants(id — 라벨) | defaultVariant |
|---|---|---|
| Section | default 기본 · hero 히어로 · muted 옅게 | default |
| Card | default 기본 · featured 강조 | default |
| List | default 기본 · featured 강조 · compact 촘촘 | default |
| Button | default 기본 · primary 주 · secondary 보조 · danger 위험 · ghost 투명 | default |
| Link | default 기본 · muted 옅게 | default |

`Button` 은 옛 카탈로그에 `default` 가 없었다. 선언에 `default` 를 두지 않으면 variant 없는 버튼이 `primary` 로 그려진다(D4 의 결정 표 — A1a 계획 D4). 옛 CSS(`system-themes/admin/src/theme.css`)에 `[data-wb-variant="default"]` 를 겨냥한 규칙이 없는지 확인한다(있으면 보고). 변형 칸의 «(기본)» 은 `variant` 를 지운다 — 그 노드는 `defaultVariant` 로 그려진다.

### D5. `visibleWhen` 은 manifest 의 `hideProps` 가 대신한다

속성 패널은 노드의 variant 를 렌더러의 `resolveVariant` 로 구하고, 그 variant 선언의 `hideProps` 에 든 prop 칸을 감춘다. `system-admin` 첫 판에는 `hideProps` 가 없으므로 `List` 의 «컬럼» 칸은 늘 보인다(지금도 기본 구조 `table` 기준이라 늘 보였다).

### D6. 스냅샷 payload 판 2 — `themes` 가 없다

`SnapshotPayload` 에서 `themes` 를 걷고 `SNAPSHOT_PAYLOAD_VERSION = 2`. 규격은 `z.strictObject` 그대로다. 저장된 판 1 payload 는 마이그레이션 0018 이 `themes` 키를 지우고 `payloadVersion` 을 2 로 고친다. 복원은 레이아웃의 테마 되돌리기 단계 · `RestoreResult.themes` · `summary.layouts.themeRefChanged` 를 걷는다. A3 가 `{ themeId, version, tokens }` 를 판 3 으로 더한다.

### D7. `lintProject` 는 설계 lint 만 한다

`packages/themes` 의 `lintProject` 는 `lintDesign` 만 돈다(테마 lint `lintThemes` 를 걷는다). 스키마의 lint 규칙 가운데 `theme-vocabulary` · `theme-token` · `theme-style-prop` · `theme-node-variant` · `theme-pattern` · `theme-extends` · `theme-other` 를 걷는다. `.wirebound.json` 의 lint 설정이 걷은 규칙 id 를 쓰면 지금 lint 설정 검증이 모르는 규칙을 어떻게 다루는지 먼저 재고, 거절한다면 그 판을 케이스로 적는다(걷은 규칙이라는 말을 싣는다). 스냅샷 lint 노트의 `theme-unset` · `theme-unresolved` · `variant-rule-off` 를 걷는다.

---

## 파일 구조 (지우는 것 · 고치는 것)

```
packages/exporter        page.tsx · bundle/index.ts · runtime/plan.ts — 뷰 경로 · theme?: ThemeDefinition · themeCss?
                         test-support/fixtures.ts — 구조 · variant 픽스처 걷기
apps/web                 src/theme/** 전부 지움 · store/theme-draft-store.ts · store/use-theme-draft.tsx · routes/theme-editor.tsx
                         canvas/canvas-structures.tsx 지움 · panels/pattern-picker.tsx 출처 교체 · panels/property-panel.tsx
                         api/{client,types,http-client}.ts 테마 메서드 · projects/project-actions.ts · shell/snapshots-panel.tsx
                         routes/editor.tsx · app.tsx · catalog-setup.ts · shell.css · package.json
system-themes/admin      src/manifest.ts — components(D4)
apps/playground          src/main.tsx · src/debug.css · package.json
apps/api                 db/migrations/0018-drop-json-themes.ts(신규) · routes/themes.ts 지움 · services/{project-theme,system-themes}.ts 지움
                         repos/themes.ts 지움 · repos/layouts.ts · repos/projects.ts · services/snapshot-capture.ts · services/restore*.ts
                         services/export-*.ts · routes/export.ts · app.ts · db/types.ts
packages/themes          남김: spec/patterns.ts · pattern/expand.ts · snapshot/* · lint/index.ts(설계 lint 만) · issue.ts(패턴이 쓰는 몫)
                         지움: spec/{meta,tokens,primitives,components,assets,handles,theme}.ts · resolve/** · emit/** · system/** · lint/{input,project,node-variant}.ts · resolved.ts · own.ts
packages/cli · mcp       read/lint.ts · commands/lint.ts · embed.ts · mcp tools.ts 설명
packages/renderer        지움: structures/** · structure-css*.ts · registry export · resolveStructure* · partAttrs · nodeAttrs 의 structure
                         render.tsx — 뷰 경로 하나 · theme 없으면 NO_THEME
packages/schema          component/define.ts · registry.ts(defaultStructure) · catalog/*.ts · validate.ts · lint/rules.ts
docs                     specs/2026-08-03-wirebound-design.md(정본) — Task 8
```

---

## Task 1: 내보내기를 뷰 경로로

**Files:**
- Modify: `packages/exporter/src/page.tsx`, `packages/exporter/src/bundle/index.ts`, `packages/exporter/src/runtime/plan.ts`, `packages/exporter/package.json`(의존: `@wirebound/themes` 빼고 `@wirebound/theme-sdk` 더함), `packages/exporter/test-support/fixtures.ts`
- Modify: `apps/api/src/services/export-bundle.ts`, `apps/api/src/services/export-pptx.ts`, `apps/api/src/routes/export.ts`(테마를 읽어 넘기던 자리) — 컴파일을 지키는 만큼만
- Create: `packages/renderer/src/no-theme.ts` · Modify: `packages/renderer/src/index.ts`(`NO_THEME` 내보내기)
- Test: `packages/exporter/test/*`

**Interfaces:**
- Consumes: A1a 의 `renderDocument(doc, { theme })` · `ThemeDefinition` · `defaultViewsCss()`.
- Produces:
  ```ts
  export interface ExportPageOptions { document: PageDocument; title: string; theme?: ThemeDefinition; themeCss?: string; lang?: string }
  export interface ExportBundleOptions { pages: readonly BundlePage[]; theme?: ThemeDefinition; themeCss?: string; lang?: string }
  export function pageCss(themeCss?: string): string   // STANDALONE_RESET 뒤에 defaultViewsCss() + (themeCss ?? '')
  // packages/renderer/src/no-theme.ts (신규 — index 에서 내보낸다)
  export const NO_THEME: ThemeDefinition   // manifest { id: 'none', name: '테마 없음', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } } · views {}
  ```

  **`NO_THEME` 을 이 태스크에서 만드는 까닭:** Task 6 전까지 렌더러는 `theme` 이 없으면 옛 구조 경로로 간다. 내보내기가 `theme` 없이 부르면 그 길로 떨어져, `installStructures()` 를 걷은 뒤 모든 노드가 «구현되지 않은 구조» 폴백이 된다. 그래서 내보내기는 늘 `options.theme ?? NO_THEME` 을 넘긴다. Task 6 이 `NO_THEME` 을 렌더러의 기본값으로 삼는다.

- [ ] **Step 1: 실패하는 테스트** — `packages/exporter/test/page.test.ts` 에:

```ts
it('번들의 CSS 는 기본 뷰 CSS 로 시작하고, 테마 CSS 를 주면 그 뒤에 싣는다', () => {
  const plain = exportPage({ document: SAMPLE_PAGE, title: 't' })
  expect(plain.css).toContain(defaultViewsCss())
  const themed = exportPage({ document: SAMPLE_PAGE, title: 't', themeCss: 'a{color:red}' })
  expect(themed.css.indexOf(defaultViewsCss())).toBeLessThan(themed.css.indexOf('a{color:red}'))
})

it('테마 뷰를 주면 그것으로 그린다', () => {
  const Button = view(({ props }) => <Root as="button" className="mine">{String(props.label)}</Root>)
  const theme = defineTheme({ manifest: EMPTY_MANIFEST, views: { Button } })
  const { html } = exportPage({ document: pageWith({ id: 'b', type: 'Button', props: { label: 'x' } }), title: 't', theme })
  expect(html).toContain('class="mine"')
})
```

`SAMPLE_PAGE` · `pageWith` · `EMPTY_MANIFEST` 가 테스트 지원에 없으면 `test-support/fixtures.ts` 에 더한다(`EMPTY_MANIFEST = { id: 'test', name: 'test', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } }`).

- [ ] **Step 2: 실패를 본다** — `pnpm vitest run packages/exporter/test/page.test.ts`.

- [ ] **Step 3: 구현** — `page.tsx`:

```tsx
import { renderDocument, type NodeRenderError } from '@wirebound/renderer'
import { defaultViewsCss, type ThemeDefinition } from '@wirebound/theme-sdk'

export function pageCss(themeCss?: string): string {
  return STANDALONE_RESET + defaultViewsCss() + (themeCss ?? '')
}

export function renderPageTree(page: PageDocument, theme: ThemeDefinition | undefined) {
  const errors: NodeRenderError[] = []
  const tree = renderDocument(page, { theme: theme ?? NO_THEME, onNodeError: (e) => errors.push(e) })
  return { tree, errors }
}
```

`installRegistries()` 는 `installCatalog()` 만 부른다. `bundle/index.ts` · `runtime/plan.ts` 는 `themeStructures(theme)` · `structures` 인자를 걷고 `theme` 을 그대로 넘긴다. `assets/theme.css` 파일 이름은 그대로 두고 내용만 `pageCss(options.themeCss)` 다.

`test-support/fixtures.ts` 의 `variantFixture` · `coverageThemes` · `declaredStructures` · `declaredVariants` · `renderedPairs` 는 옛 구조 · variant 어휘를 재던 것이다 — 걷고, 그것을 쓰던 `parity.test.tsx` · `bundle-parity.test.tsx` · `catalog.test.ts` 의 케이스를 센다. «내보내기 DOM = 캔버스 DOM» 의 성질은 뷰 경로에서도 참이어야 하므로 `parity.test.tsx` 는 «`exportPage({ theme })` 의 본문 = 같은 `theme` 으로 `renderDocument` 한 것의 정적 마크업» 한 케이스로 줄인다.

api 쪽: `services/export-bundle.ts` 의 `exportBundle({ pages, theme: asResolvedTheme(theme) })` → `exportBundle({ pages })`, `services/export-pptx.ts` 의 `asResolvedTheme` · `exportPage({ …, theme })` → `exportPage({ document, title })`. `routes/export.ts` 는 테마를 읽어 작업 명세에 싣던 자리(`currentProjectTheme` · `readScreenTheme`)를 걷고, 미리보기 응답의 `themeId` 를 `null` 로 둔다(D3). **테마 저장 자체(`routes/themes.ts` 등)는 Task 4 에서 걷는다** — 여기서는 내보내기가 테마를 안 읽게만 한다.

- [ ] **Step 4: 통과를 본다** — `pnpm vitest run packages/exporter` · `pnpm test:build`(exporter 의 `dist-*` 판 포함 — `pnpm build` 뒤). api 의 export 스위트: `pnpm vitest run apps/api/test/export` — 내용 단언이 옛 테마 CSS 에 기대던 케이스가 있으면 기본 뷰 CSS 기준으로 고치고 이름을 적는다. `pnpm typecheck`.

- [ ] **Step 5: 커밋**

```bash
git add packages/exporter packages/renderer/src/no-theme.ts packages/renderer/src/index.ts apps/api/src/services/export-bundle.ts apps/api/src/services/export-pptx.ts apps/api/src/routes/export.ts apps/api/test pnpm-lock.yaml
git commit -m "refactor(exporter): render through the view path; exports carry default-view CSS until A5"
```

---

## Task 2: 웹에서 옛 테마 UI 를 걷고, 패턴 · 변형 칸을 manifest 로

**Files:**
- Delete: `apps/web/src/theme/`(전부), `apps/web/src/store/theme-draft-store.ts`, `apps/web/src/store/use-theme-draft.tsx`, `apps/web/src/routes/theme-editor.tsx`, `apps/web/src/canvas/canvas-structures.tsx`
- Modify: `apps/web/src/panels/pattern-picker.tsx`, `apps/web/src/panels/property-panel.tsx`, `apps/web/src/panels/controls/variant-control.tsx`, `apps/web/src/panels/structure-toolbar.tsx`(import 만), `apps/web/src/routes/editor.tsx`, `apps/web/src/app.tsx`, `apps/web/src/catalog-setup.ts`, `apps/web/src/api/{client,types,http-client}.ts`, `apps/web/src/projects/project-actions.ts`, `apps/web/src/shell/snapshots-panel.tsx`, `apps/web/src/shell.css`, `apps/web/package.json`, `system-themes/admin/src/manifest.ts`
- Test: 아래 «테스트 셈» 목록

**Interfaces:**
- Consumes: `CANVAS_THEME`(`canvas/canvas-theme.ts`), 렌더러의 `resolveVariant`(A1a — `packages/renderer/src/variant.ts`, 이 태스크에서 `index.ts` 로 내보낸다), `PatternsSchema` · `expandPattern`(`@wirebound/themes`).
- Produces:
  ```ts
  // panels/property-panel.tsx
  export function variantFieldOf(def: ComponentDef, manifest: ThemeManifest): { label: string; options: readonly { id: string; label: string }[] } | null
  export function visibleFields(def: ComponentDef, node: WbNode, props: Record<string, unknown>, manifest: ThemeManifest): EditorField[]
  // panels/pattern-picker.tsx
  export function themePatterns(manifest: ThemeManifest): { entries: [string, ThemePattern][]; broken: string | null }
  ```

- [ ] **Step 1: manifest 에 components 를 싣는다** — `system-themes/admin/src/manifest.ts` 에 D4 의 표를 `components` 로. `system-themes/admin/test/admin.test.ts` 의 «components 선언은 카탈로그의 이름만 쓴다» 가 이미 잰다. 더할 케이스: «옛 테마 CSS 에 `[data-wb-variant="default"]` 규칙이 없다»(`expect(ADMIN_V0_CSS).not.toContain('data-wb-variant="default"')`).

- [ ] **Step 2: 실패하는 테스트 — 변형 칸 · 감춤 · 패턴**

```tsx
// apps/web/test/panels/property-panel.test.tsx — 기존 «속성 패널 — 변형» 블록을 이 셋으로 바꾼다
it('변형 칸의 선택지는 캔버스 테마의 manifest 가 준다', async () => {
  await openPage(docWith({ id: 'b', type: 'Button', props: { label: '저장' } }))
  selectNode('b')
  const options = [...(await screen.findByLabelText('변형')).querySelectorAll('option')].map((o) => o.textContent)
  expect(options).toEqual(['(기본)', '기본', '주', '보조', '위험', '투명'])
})

it('옛 variant 값이 그대로 선다', async () => {
  await openPage(docWith({ id: 'b', type: 'Button', props: { label: '저장' }, variant: 'danger' }))
  selectNode('b')
  expect((await screen.findByLabelText('변형') as HTMLSelectElement).value).toBe('danger')
  expect(canvasQuery('[data-wb-id="b"]')!.getAttribute('data-wb-variant')).toBe('danger')
})

it('manifest 가 선언하지 않은 컴포넌트에는 변형 칸이 없다', async () => {
  await openPage(docWith({ id: 't', type: 'Tabs', props: {} }))
  selectNode('t')
  expect(screen.queryByLabelText('변형')).toBeNull()
})
```

```ts
// apps/web/test/panels/visible-fields.test.ts (신규)
import { installCatalog, requireComponent } from '@wirebound/schema'
const manifest = { id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} },
  components: { List: { variants: [{ id: 'table', label: '표' }, { id: 'cards', label: '카드', hideProps: ['columns'] }], defaultVariant: 'table' } } }
beforeAll(() => installCatalog())
it('variant 선언의 hideProps 칸을 감춘다', () => {
  const def = requireComponent('List')
  const names = (variant?: string) => visibleFields(def, { id: 'l', type: 'List', ...(variant ? { variant } : {}) }, {}, manifest).map((f) => f.prop)
  expect(names('cards')).not.toContain('columns')
  expect(names('table')).toContain('columns')
  expect(names()).toContain('columns')          // defaultVariant 가 table
})
```

```tsx
// apps/web/test/panels/pattern-picker.test.tsx — getProjectTheme 스텁 대신 캔버스 테마를 vi.mock 으로
vi.mock('../../src/canvas/canvas-theme', async (orig) => {
  const real = await orig<typeof import('../../src/canvas/canvas-theme')>()
  return { ...real, CANVAS_THEME: { ...real.CANVAS_THEME, manifest: { ...real.CANVAS_THEME.manifest, patterns: PORTAL_PATTERNS } } }
})
```

«manifest 의 패턴이 고르개에 서고 넣으면 전개된다» 케이스: 기존 `structure-pattern.test.tsx` 의 «넣으면 전개된다» 케이스를 옮겨 오되, `getProjectTheme` 스텁을 걷고 위 `vi.mock` 으로 패턴을 싣는다. 단언은 기존 것 그대로(고르개에 `content.noticeBoard` 가 서고, 고르면 구조 트리에 전개된 노드들이 선다).

`PORTAL_PATTERNS` 는 옛 `packages/themes/src/system/portal.ts` 의 `patterns` 를 **이 테스트 파일로 복사한 상수**다(Task 5 가 그 원본을 지운다). `vi.mock` 이 닿는지 모의 팩토리의 호출 수로 확인한다(`CLAUDE.md` 「목 · 계측은 불린 수를 값으로 확인하고」).

- [ ] **Step 3: 실패를 본다.**

- [ ] **Step 4: 구현**

```tsx
// property-panel.tsx
import { resolveVariant } from '@wirebound/renderer'
import type { ThemeManifest } from '@wirebound/theme-sdk'

export function variantFieldOf(def: ComponentDef, manifest: ThemeManifest) {
  if (def.variantFrom !== undefined) return null
  const decl = manifest.components?.[def.type]
  if (decl === undefined) return null
  return { label: VARIANT_LABEL, options: decl.variants.map((v) => ({ id: v.id, label: v.label })) }
}

export function visibleFields(def: ComponentDef, node: WbNode, props: Record<string, unknown>, manifest: ThemeManifest): EditorField[] {
  const variant = resolveVariant(def, node, props, manifest)
  const hidden = new Set(manifest.components?.[def.type]?.variants.find((v) => v.id === variant)?.hideProps ?? [])
  return def.editor.filter((field) => !hidden.has(field.prop))
}
```

호출 자리는 `CANVAS_THEME.manifest` 를 넘긴다. `VariantControl` 은 `options: readonly { id: string; label: string }[]` 를 받아 `<option value={id}>{label}</option>` 으로 그린다(첫 줄 «(기본)» → `null` 은 그대로).

```tsx
// pattern-picker.tsx — 출처 교체
export function themePatterns(manifest: ThemeManifest) {
  const parsed = PatternsSchema.safeParse(manifest.patterns ?? {})
  if (!parsed.success) return { entries: [], broken: '테마의 패턴 선언을 읽지 못했습니다' }
  return { entries: Object.entries(parsed.data), broken: null }
}
```

`useProjectThemeState` 호출과 로딩 · 실패 상태를 걷고 `themePatterns(CANVAS_THEME.manifest)` 를 쓴다(동기 — 조회가 없다). 빈 목록 문안 «이 테마에는 패턴이 없습니다» 는 그대로.

걷기(파일 · 기호) — 탐색 보고의 목록 그대로:
- 지움: `src/theme/**` 18 파일 · `store/theme-draft-store.ts` · `store/use-theme-draft.tsx` · `routes/theme-editor.tsx` · `canvas/canvas-structures.tsx`
- `app.tsx`: 테마 편집 라우트와 그 import · 주석.
- `routes/editor.tsx`: `CanvasStructuresProvider` 감싸기, `ThemePicker` 와 그 주석, `restoredToken` 표의 «레이아웃의 테마 선택» 줄. `CanvasDocumentProvider` 는 남긴다.
- `projects/project-actions.ts`: `chooseTheme` · `editTheme`(A4 가 설정 페이지와 함께 다시 정한다).
- `api/client.ts` · `types.ts` · `http-client.ts`: `getProjectTheme` · `listProjectThemes` · `setProjectTheme` · `getTheme` · `createTheme` · `updateTheme`, `ProjectTheme` · `ThemeSummary` · `ThemeDetail`, 그 모양 검사 · 경로 · 본문 키. **`RestoreResult.themes` · `summary.layouts.themeRefChanged` 는 Task 4 가 api 와 함께 걷는다**(지금 걷으면 api 응답과 어긋난다).
- `catalog-setup.ts`: `installStructures` 와 그 머리말 문장(카탈로그 설치만 남는다).
- `shell.css`: `.wb-shell-theme-*` · `.wb-shell-token-*`(API 토큰 화면의 `.wb-shell-tokens-*` 는 아니다) · `.wb-shell-gallery-*` · 팔레트 셀렉터의 `.wb-shell-theme,` — 지운 파일만 쓰던 클래스인지 `git grep` 으로 확인한 뒤.
- `package.json`: `@wirebound/themes` 는 **남긴다**(패턴이 쓴다).

**테스트 셈** — 탐색 보고(메인 세션이 받은 것)의 목록이다. 다시 세고(`git grep -lE "@wirebound/themes|theme-editor|ThemePicker|useProjectTheme|theme-draft|canvas-structures|chooseTheme|editTheme|getProjectTheme|listProjectThemes|setProjectTheme" apps/web/test`) 견준다:
- 지움: `test/theme/` 18 파일 · `test/routes/theme-editor.test.tsx` · `test/store/theme-draft-store.test.ts`
- 고침: `test/helpers.tsx`(`systemTheme` · `SYSTEM_ADMIN_THEME_ID` · 테마 메서드 스텁), `test/panels/property-panel.test.tsx`(구조 탐침 · `visibleWhen` 두 케이스를 걷고 위 새 케이스로), `test/panels/pattern-picker.test.tsx` · `test/panels/structure-pattern.test.tsx`(출처 교체), `test/lock/toolbar-abilities.test.tsx`(`getProjectTheme` 스텁 → 캔버스 테마 목), `test/shell/snapshots-panel.test.tsx`(테마 고르개 케이스 «테마 고르개가 복원이 되돌린 선택을 다시 읽는다» 지움 — «테마 차이» 케이스 둘은 Task 4), `test/shell/remote-restore-reload.test.tsx`(고르개 단언 걷기), `test/routes/role-live.test.tsx`(owner 표지를 고르개에서 다른 owner 전용 UI 로 — 스냅샷 복원 단추 등, 무엇을 골랐는지 적는다), `test/routes/viewer-readonly.test.tsx`(`reads()` 의 `/theme` · `/themes` 줄), `test/api/http-client.test.ts`(테마 메서드 · 모양 행), `test/api-consumers.test.ts`, `test/role-access.test.ts`, `test/projects/project-actions.test.ts` · `test/routes/project-abilities-wiring.test.tsx`(`chooseTheme` · `editTheme`), `test/shell-css-guard.ts` · `test/shell-css-palette.test.ts` · `test/shell-css-picker.test.ts`(지운 클래스), `test/canvas/bundle-parity.test.tsx`(옛 `admin` 과의 견주기 → «캔버스 DOM = `exportPage({ theme: CANVAS_THEME })` 본문», 전제 케이스 «옛 admin 은 모든 컴포넌트에 기본 구조를 고른다» 지움).

- [ ] **Step 5: 통과를 본다** — `pnpm vitest run apps/web system-themes` · `pnpm typecheck`. 실행 수 · 지운 케이스 수 · 이름.

- [ ] **Step 6: 커밋**

```bash
git add apps/web system-themes/admin pnpm-lock.yaml
git commit -m "refactor(web): drop the JSON theme UI; patterns and the variant field read the canvas theme manifest"
```

---

## Task 3: playground 를 뷰 경로로

**Files:**
- Modify: `apps/playground/src/main.tsx`, `apps/playground/src/debug.css`, `apps/playground/package.json`

- [ ] **Step 1:** `main.tsx` 에서 `installStructures()` 를 걷고 `renderComposed(sampleLayout, samplePage, { theme: ADMIN_V0 })` 로 그린다. `defaultViewsCss()` · `ADMIN_V0_CSS` 를 `<style>` 둘로 `document.head` 에 싣는다(playground 는 셸이 없어 iframe 이 필요 없다). 의존에 `@wirebound/theme-sdk` · `@wirebound/system-theme-admin`.
- [ ] **Step 2:** `debug.css` 의 `[data-wb-part=…]` 규칙은 기본 뷰가 여전히 다는 훅이라 둔다. 머리 주석의 `@wirebound/themes` 문장을 고친다.
- [ ] **Step 3:** `pnpm -C apps/playground build` 가 되는지 · `pnpm vitest run apps/playground` · `pnpm typecheck`.
- [ ] **Step 4: 커밋** — `git add apps/playground pnpm-lock.yaml && git commit -m "refactor(playground): render with system-admin v0 through the view path"`

---

## Task 4: api 에서 테마 저장 · 라우트를 걷고, 스냅샷 판 2

**Files:**
- Create: `apps/api/src/db/migrations/0018-drop-json-themes.ts`
- Modify: `apps/api/src/db/migrations/index.ts`, `apps/api/src/db/types.ts`, `apps/api/src/app.ts`, `apps/api/src/repos/layouts.ts`, `apps/api/src/repos/projects.ts`, `apps/api/src/services/snapshot-capture.ts`, `apps/api/src/services/restore.ts`, `apps/api/src/services/restore-plan.ts`, `apps/api/src/routes/snapshots.ts`, `apps/api/src/db/describe-schema-state.ts` · `main.ts`(«relation "themes" does not exist» 문장), `packages/themes/src/snapshot/payload.ts` · `lint-input.ts`, `packages/cli/src/read/lint.ts` · `commands/lint.ts`, `packages/mcp/src/tools.ts`(validate 설명), `apps/web/src/api/{types,http-client}.ts` · `apps/web/src/shell/snapshots-panel.tsx`(`RestoreResult.themes`)
- Delete: `apps/api/src/routes/themes.ts`, `apps/api/src/services/project-theme.ts`, `apps/api/src/services/system-themes.ts`, `apps/api/src/repos/themes.ts`
- Test: `apps/api/test/*`

- [ ] **Step 1: 실패하는 테스트 — 마이그레이션**

```ts
// apps/api/test/migration-0018.test.ts
it('판 1 스냅샷을 마이그레이션이 판 2 로 고친다', async () => {
  // 0017 까지만 올린 DB 에 판 1 payload(themes 키 있음)를 넣고 0018 을 올린다.
  await migrateTo('0017-page-seq-floors')
  const id = await insertRawSnapshot({ payloadVersion: 1, themes: [{ layoutId: L, themeId: null, theme: null }], ...BASE_PAYLOAD })
  await migrateTo('0018-drop-json-themes')
  const payload = await readSnapshotPayload(id)
  expect(payload.payloadVersion).toBe(2)
  expect('themes' in payload).toBe(false)
  expect(SnapshotPayloadSchema.safeParse(payload).success).toBe(true)
})

it('0018 왕복 — down 뒤 0006 · 0007 의 down 이 돈다', async () => {
  await migrateTo('0018-drop-json-themes')
  await migrateTo('0005-revisions')
  await migrateTo('0018-drop-json-themes')
})

```

«고친 스냅샷을 복원한다» 케이스: 첫 케이스처럼 판 1 스냅샷을 넣고 0018 을 올린 뒤, 그 DB 로 앱을 세워(기존 복원 케이스가 앱을 세우는 도우미를 따른다) owner 세션으로 `POST /api/projects/:projectId/snapshots/:snapshotId/restore` — 200 이고, 스냅샷 뒤에 고친 페이지 제목이 스냅샷의 값으로 돌아온다.

`migrateTo` · `insertRawSnapshot` · `readSnapshotPayload` 는 기존 마이그레이션 케이스(`git grep -l "migrateTo\|Migrator" apps/api/test`)가 쓰는 도우미를 따른다 — 없으면 Kysely `Migrator` 의 `migrateTo` 로 이 파일 안에 둔다. **api 테스트의 `setupFiles` 가 앱을 먼저 싣는다**(`CLAUDE.md` 「목 · 계측은 …」) — 마이그레이션을 오르내리는 케이스가 다른 케이스의 DB 를 깨지 않게, 이 파일은 별도 DB(`wb_a1b_migrate` 같은 일회용)를 만들어 쓰고 끝에 지운다.

- [ ] **Step 2: 실패를 본다.**

- [ ] **Step 3: 구현** — 0018:

```ts
import { sql, type Kysely, type Migration } from 'kysely'

/**
 * **옛 JSON 테마를 걷는다** — 테마는 코드 패키지가 된다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`).
 * 레이아웃의 테마 참조 · 테마 표를 지우고, 저장된 스냅샷 payload 에서 `themes` 를 걷어 판 2 로 고친다(규격이 `z.strictObject` 라
 * 남기면 판 2 규격이 옛 스냅샷을 못 읽는다).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE snapshots SET payload = (payload - 'themes') || '{"payloadVersion": 2}'::jsonb WHERE (payload->>'payloadVersion')::int = 1`.execute(db)
    await db.schema.alterTable('layouts').dropColumn('theme_id').execute()
    await db.schema.dropTable('themes').execute()
  },
  // **`down` 은 모양만 되살린다** — 테마 행과 스냅샷의 테마는 돌아오지 않는다(판 1 로 되돌리며 `themes` 는 빈 배열).
  async down(db: Kysely<unknown>): Promise<void> {
    // 0006 의 `up` 과 같은 모양으로 `themes` 를 만든다 — 열 · 제약 · 색인을 0006 에서 옮겨 적는다.
    // 0007 의 `theme_id` 칸(`references('themes.id').onDelete('restrict')`, NULL 허용)을 되살린다.
    await sql`UPDATE snapshots SET payload = payload || '{"payloadVersion": 1, "themes": []}'::jsonb WHERE (payload->>'payloadVersion')::int = 2`.execute(db)
  },
}
```

`down` 의 `themes` 표 · `theme_id` 칸은 0006 · 0007 의 `up` 을 **그대로 옮겨 적는다**(열 이름 · 타입 · 제약 · 색인 이름). 옮겨 적은 뒤 왕복 케이스로 잰다.

걷기:
- `app.ts`: `routes/themes` 등록 · `syncSystemThemes(db)` 호출.
- `repos/layouts.ts`: `themeId` · `updateLayoutTheme`. `repos/projects.ts`: `DEFAULT_THEME_SLUG` · 만들 때 테마 찾기.
- `services/snapshot-capture.ts`: `freezeTheme` · `payload.themes`. `services/restore*.ts`: `set-layout-theme` 단계 · `RestoreThemeReport` · `themes` · `summary.layouts.themeRefChanged`.
- `packages/themes/src/snapshot/payload.ts`: `SnapshotLayoutTheme` · `LayoutThemeSchema` · `themes` 칸, `SNAPSHOT_PAYLOAD_VERSION = 2`. 머리말의 «테마는 병합된 결과로 얼린다» 절을 걷는다(지금 참이 아니다). `lint-input.ts`: 테마 노트 셋.
- CLI: `read/lint.ts` · `commands/lint.ts` 의 테마 노트 출력. MCP: `validate` 설명에서 «테마».
- 웹: `RestoreResult.themes` · `themeRefChanged` · `isRestoreResult` 의 `themes` 검사 · `snapshots-panel.tsx` 의 «테마는 스냅샷 당시와 다릅니다» 줄. `test/shell/snapshots-panel.test.tsx` 의 «테마 차이» 두 케이스 · 픽스처의 `themes`, `restore-banner-lift` · `reload-sent-edits` 픽스처의 `themes: []`.
- api 테스트: 테마 전용 파일(`routes-themes` · `repos-themes` · `repos-layouts` 의 테마 케이스 · `system-themes` · `system-themes-roundtrip` · `theme-boundaries` · `theme-choose-gone` · `theme-order` · `theme-warnings` · `themes-schema`)을 지우고, 스냅샷 · 복원 · `permission-matrix` · `actor-census` · `project-dump` · `helpers.ts` 에서 테마 줄을 걷는다. 지운 파일 · 케이스 이름을 적는다. **`permission-matrix` 는 라우트 표를 잰다** — 걷은 라우트가 표에서도 빠져야 한다.

- [ ] **Step 4: 통과를 본다** — `pnpm vitest run apps/api`(워크트리 DB) · `pnpm vitest run packages/themes packages/cli packages/mcp` · `pnpm typecheck`. 최상위 사용자 DB 는 건드리지 않는다.

- [ ] **Step 5: 구분력** — 0018 의 `UPDATE` 한 줄을 뗀 판에서 «판 1 스냅샷을 …» 이 무슨 값으로 죽는지, `down` 의 `theme_id` 되살리기를 뗀 판에서 왕복 케이스가 무엇으로 죽는지 적는다(백업 · 바이트 비교 복원).

- [ ] **Step 6: 커밋**

```bash
git add apps/api packages/themes/src/snapshot packages/cli packages/mcp apps/web/src/api apps/web/src/shell/snapshots-panel.tsx apps/web/test
git commit -m "refactor(api): drop stored JSON themes and layout theme refs; snapshot payload v2 without themes"
```

---

## Task 5: `packages/themes` 의 옛 엔진을 걷는다

**Files:**
- Delete: `packages/themes/src/spec/{meta,tokens,primitives,components,assets,handles,theme}.ts`, `packages/themes/src/resolve/**`, `packages/themes/src/emit/**`, `packages/themes/src/system/**`, `packages/themes/src/lint/{input,project,node-variant}.ts`, `packages/themes/src/resolved.ts`, `packages/themes/src/own.ts` — 남는 모듈이 쓰는지 먼저 본다
- Modify: `packages/themes/src/index.ts`, `packages/themes/src/lint/index.ts`(`lintProject` = `lintDesign` 만), `packages/themes/src/issue.ts`(패턴 검증이 쓰는 코드만), `packages/themes/src/spec/patterns.ts`(지운 모듈을 보던 import)
- Delete/Modify: `packages/themes/test/*` — 패턴 · 스냅샷 · lint(설계) 케이스만 남는다

- [ ] **Step 1:** 남는 공개 API 를 먼저 적는다 — `PatternNodeSchema` · `PatternSchema` · `PatternsSchema` · `PATTERN_CATEGORIES` · `SLOT_TYPES` · `checkPatterns` · `expandPattern` · 타입 `ThemePattern` · `PatternNode` · `SlotType` · `ExpandedPattern`, 스냅샷의 `Snapshot*` · `SNAPSHOT_PAYLOAD_VERSION` · `SnapshotPayloadSchema` · `SNAPSHOT_RESOURCES` · `snapshotToLintInput` · `SnapshotLint*`, lint 의 `lintProject` · `ProjectLintInput`, 패턴 검증이 내는 이슈 타입. `test/public-api.test.ts` 를 이 목록으로 먼저 고친다 → 빨강(지울 것이 아직 있다).
- [ ] **Step 2:** 지운다. `checkPatterns` 가 테마의 다른 절(토큰 · 컴포넌트)을 보던 검사가 있으면 그 갈래를 걷고 무엇을 걷었는지 적는다. 저장소 전체에서 지운 이름을 센다 — `git grep -nE "resolveTheme|compileTheme|mergeTheme|themeStructures|systemTheme|SYSTEM_THEME_IDS|ADMIN_THEME|lintThemes|ThemeSchema|TOKEN_NAMESPACES|STYLE_PROPERTIES|NODE_HANDLES"` 가 0 이어야 한다(`docs/superpowers/plans/*` 의 이력 문서는 센 수에서 뺀다 — 발행된 기록이다).
- [ ] **Step 3:** `pnpm vitest run packages/themes packages/cli packages/mcp` · `pnpm typecheck` · `pnpm build`(dist 에 지운 모듈이 남지 않는다 — `clean: true`).
- [ ] **Step 4: 커밋** — `git add packages/themes && git commit -m "refactor(themes): remove the JSON theme engine; keep patterns, snapshot payload and design lint"`

---

## Task 6: 렌더러의 구조 경로를 걷는다

**Files:**
- Delete: `packages/renderer/src/structures/**`, `packages/renderer/src/structure-css.ts`, `packages/renderer/src/structure-css-tools.ts`
- Modify: `packages/renderer/src/render.tsx`, `packages/renderer/src/attrs.ts`, `packages/renderer/src/index.ts`
- Delete/Modify: `packages/renderer/test/*` — `registry` · `structure-*` · `structures*` · `structure-css` 케이스 파일을 지우고, `default-view-parity.test.tsx`(옛 구조와 견주던 판 — 할 일을 마쳤다)를 지운다. `render.test.tsx` · `fallback.test.tsx` · `attrs.test.ts` · `contract-attrs.test.ts` · `compose*.test.tsx` · `interaction-runtime.test.tsx` 는 뷰 경로로 고친다.

**Interfaces:**
- Produces:
  ```ts
  export interface RenderOptions { theme?: ThemeDefinition; slot?: ReactNode; onNodeError?: …; interaction?: InteractionOptions }  // structures 칸 없음
  export const NO_THEME: ThemeDefinition   // manifest 비어 있음 · views {} — 모두 기본 뷰
  ```

- [ ] **Step 1: 실패하는 테스트**

```tsx
// packages/renderer/test/render.test.tsx
it('theme 을 안 주면 기본 뷰로 그린다', () => {
  const { container } = render(<>{renderDocument(page([{ id: 'b', type: 'Button', props: { label: 'x' } }]))}</>)
  expect(container.querySelector('[data-wb-id="b"]')!.tagName).toBe('BUTTON')
})
it('구조 경로의 이름이 공개 API 에 없다', async () => {
  const api = await import('@wirebound/renderer')
  for (const name of ['registerStructure', 'getStructure', 'requireStructure', 'listStructureKeys', 'installStructures', 'structureBaseCss', 'resolveStructure', 'resolveStructureOf', 'partAttrs', 'nodeVar', 'TREE_INDENT_VAR', 'NODE_VAR_PREFIX'])
    expect(name in api).toBe(false)
})
```

- [ ] **Step 2: 실패를 본다.**
- [ ] **Step 3: 구현** — `render.tsx` 의 `renderNodeIn` 에서 `options.theme !== undefined` 갈래를 유일한 길로 두고 `const theme = options.theme ?? NO_THEME`. `resolveStructureOf` · `resolveStructure` · `getStructure` 호출과 그 갈래의 폴백 문안(«카탈로그에 없는 구조» · «구현되지 않은 구조»)을 걷는다. `attrs.ts` 의 `nodeAttrs(node, def, structure, props)` · `partAttrs` · `WbAttrs['data-wb-structure']` 를 걷는다 — A1a 에서 뷰 경로가 속성을 직접 짓는다(A1a 계획 Task 4 의 `renderNodeIn` 코드 블록). `contract-attrs.test.ts` 는 «렌더러 `src/` 의 `data-wb-*` 는 `id` · `component` · `variant` · `state` · `error`(폴백) · `focus` · `marker` · `marker-offset` 뿐이다» 로 목록을 고친다 — `structure` · `part` 는 기본 뷰의 마크업 훅이라 `theme-sdk` 에 있다.
- [ ] **Step 4:** `pnpm vitest run packages/renderer packages/theme-sdk packages/exporter apps/web` · `pnpm typecheck`.
- [ ] **Step 5: 커밋** — `git add packages/renderer && git commit -m "refactor(renderer): the view path is the only path; structure registry and structure CSS removed"`

---

## Task 7: 카탈로그에서 구조 어휘를 걷는다

**Files:**
- Modify: `packages/schema/src/component/define.ts`, `packages/schema/src/component/registry.ts`, `packages/schema/src/component/catalog/{structure,data,input,action,document}.ts`, `packages/schema/src/index.ts`, `packages/schema/src/validate.ts`, `packages/schema/src/lint/rules.ts`, `packages/schema/src/lint/design.ts`(`unknown-variant` 매핑)
- Modify: `packages/schema/test/*` — `catalog.test.ts` · `catalog-vocabulary.test.ts` · `human-axis.test.ts` · `reachability.test.ts` · `registry.test.ts` · `variant-from.test.ts` · `validate.test.ts`(`unknown-variant` 16 케이스) · `build-test/dist-loadable.test.ts`(`installStructures`), `apps/api/test/pages.test.ts`(임시 정의의 `structures` · `parts` · `variants`), `apps/api/test/issue-severity.test.ts` · `ws-patch.test.ts` · `ws-broadcast.test.ts`(`unknown-variant`)

- [ ] **Step 1: 실패하는 테스트**

```ts
// packages/schema/test/component/define.test.ts (또는 registry.test.ts)
it('카탈로그 정의에 구조 어휘가 없다', () => {
  installCatalog()
  for (const def of listComponents()) {
    expect(Object.keys(def).sort()).toEqual(
      ['children', 'description', 'editor', 'group', 'label', 'props', 'states', 'type', ...(def.variantFrom ? ['variantFrom'] : [])].sort(),
    )
    for (const field of def.editor) expect('visibleWhen' in field).toBe(false)
  }
})

it('variant 는 스키마가 판정하지 않는다 — 아무 문자열이나 통과한다', () => {
  const issues = validatePage(pageWith({ id: 'b', type: 'Button', props: { label: 'x' }, variant: '처음-보는-값' }))
  expect(issues.filter((i) => i.nodeId === 'b')).toEqual([])
})

it('variantFrom 컴포넌트의 variant 는 여전히 ignored-variant 경고다', () => {
  const issues = validatePage(pageWith({ id: 't', type: 'Text', props: { content: 'x', role: 'h1' }, variant: 'x' }))
  expect(issues.map((i) => i.code)).toContain('ignored-variant')
})
```

- [ ] **Step 2: 실패를 본다.**
- [ ] **Step 3: 구현** — D1 · D7. `defineComponent` 의 `structures` · `parts` · `variants` 검사 · `visibleWhen` 검사를 걷고, `variantFrom` 검사는 «prop 이 있다 · enum 이다 · editor 에 있다» 만. `defaultStructure` 를 걷는다. `validate.ts` 의 `unknown-variant` 갈래와 `ValidationCode` · `ISSUE_SEVERITY` 의 그 항목. `lint/rules.ts` 의 `theme-*` 일곱. lint 설정이 걷은 규칙 id 를 만났을 때의 동작을 재고(D7) 케이스로 적는다.
- [ ] **Step 4:** 저장소 전체에서 센다 — `git grep -nE "\.structures\b|\.parts\b|def\.variants|visibleWhen|defaultStructure|unknown-variant"` 가 소스 · 테스트에서 0(OOXML 의 `parts`, 상호작용 런타임의 `plan.variants` 같은 무관한 이름은 표본을 열어 가른다 — 무관한 것의 목록을 보고에 적는다).
- [ ] **Step 5:** `pnpm vitest run packages apps/web system-themes` · `pnpm vitest run apps/api` · `pnpm typecheck`.
- [ ] **Step 6: 커밋** — `git add packages/schema apps/api/test && git commit -m "refactor(schema): catalog loses structures, parts, variants and visibleWhen; variants belong to themes"`

---

## Task 8: 정본 설계서를 지금에 맞춘다

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-wirebound-design.md`

정본은 «늘 지금 참인 설계만» 적는다(`CLAUDE.md`). A1a · A1b 뒤에 거짓이 된 절을 **지금 상태**로 고친다 — 연대기(«A1b 에서 걷었다») 없이. 코드 테마의 **목표 설계 전체**는 옮겨 적지 않는다(아직 참이 아니다 — spec `2026-09-27-code-themes-design.md` 를 가리키는 한 줄만).

- [ ] **Step 1:** 거짓이 된 문장을 센다 — `grep -nE "structure|구조 구현체|parts|variants|themeRef|테마 전환 드롭다운|extends|파생 테마|토큰 GUI|JSON 에디터|테마 갤러리|data-wb-part|data-wb-structure|화이트리스트|compileTheme|themes\(" docs/superpowers/specs/2026-08-03-wirebound-design.md` 로 줄을 뽑아 절마다 판정한다.
- [ ] **Step 2:** 고친다 — 요지:
  - 「확정된 설계 결정」 표의 «테마 범위» · «구조 변형» 줄: 테마는 headless SDK 위에 짠 코드 패키지이고 카탈로그는 고정, 형태는 테마 뷰가 정한다.
  - 「명시적으로 제외한 것」: «컴포넌트 플러그인» 은 남기되(카탈로그는 닫혀 있다) «테마의 임의 마크업 템플릿» 줄을 걷는다.
  - 「컴포넌트 정의 구조」: 예시에서 `structures` · `parts` · `variants` · `visibleWhen` 를 걷고, «테마가 쓸 수 있는 어휘» 문단을 «variant 와 감출 속성은 테마가 선언한다» 로.
  - 「테마 시스템」 전체: **지금의 상태**로 줄인다 — 캔버스는 same-origin iframe 에서 SDK 뷰로 그리고 저장소 테마 `system-admin` 하나를 싣는다, 프로젝트가 테마를 고르는 기능 · 업로드 · 토큰 편집은 아직 없다, 목표 설계는 spec 을 가리킨다. 스타일 화이트리스트 · 상속 · 컴파일 절은 걷는다.
  - 「설계서 화면 구조」: 캔버스 iframe 한 문단, 테마 전환 드롭다운 문장 걷기.
  - 「스냅샷」: «테마도 payload 에 포함한다» 문단을 지금 상태로(테마는 아직 얼리지 않는다 — 프로젝트 테마가 없다).
  - 「HTML 정적 번들」: `theme.css` 가 기본 뷰 CSS 라는 것(D3).
  - 「권한 모델」: «테마 · 레이아웃 편집» 에서 테마를 뺀다(지금 편집할 테마가 없다).
  - 「로드맵」: P4 줄은 역사가 아니라 단계 정의라 두되, 코드 테마 단계(A1 ~ A6)를 한 줄로 더한다.
- [ ] **Step 3: 커밋** — `git add docs/superpowers/specs/2026-08-03-wirebound-design.md && git commit -m "docs(spec): canonical design states the view-path renderer and the removed JSON themes"`

---

## Task 9: 전량 게이트와 보고

- [ ] `pnpm typecheck` 0 · `git status` 에 소스 옆 산출물 없음.
- [ ] `pnpm build` 뒤 `pnpm test`(워크트리 DB) — 실행 · 건너뜀 · 실패.
- [ ] `pnpm test:build` — `packages/exporter` 의 `dist-*` · `packages/schema` 의 `dist-loadable` 포함.
- [ ] `pnpm test:browser` · `EDITOR_STACK_BUNDLE=build pnpm test:browser`.
- [ ] 마이그레이션을 사용자 DB 에 돌리기 전 확인용: 워크트리 DB 에 main 판으로 스냅샷 하나를 만든 뒤(main 사본 — `CLAUDE.md` 「실브라우저 판은 …」 의 main 사본 절차) 이 브랜치로 `migrate` 하고 그 스냅샷을 복원한다. 값을 보고에 적는다.
- [ ] 보고서 `docs/superpowers/plans/2026-09-27-a1b-report.md` — 태스크마다 커밋 · 실행 수 · 지운 파일 / 케이스(이름과 까닭) · 구분력 · 계획과 달라진 것. 걷은 이름의 0 셈(Task 5 · 7 의 `git grep`)과 무관 목록.

---

## 이 계획이 정하지 않고 넘기는 것

- manifest zod 검증 · `.wbtheme` · `theme-kit` — A2(패턴 규격을 manifest 검증 곁으로 옮기는 것 포함).
- 프로젝트의 테마 선택 · 토큰 · 스냅샷의 테마(판 3) · «현재 테마에 없는 variant» lint — A3 · A4.
- 내보내기에 프로젝트 테마를 싣는 것 — A5(D3).
