# 공통코드 Implementation Plan

> **For agentic workers:** 이 저장소에서는 워크트리 안의 Orca 워커가 태스크를 차례로 구현하고, 리뷰어 워커가 태스크마다 · 브랜치 끝에 한 번 본다(AGENTS.md 「워크트리 안의 작업은 Orca 세션이 한다」). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트마다 공통코드 표(그룹 → 항목)를 두고, 노드를 그 표에 참조로 묶어 «이 코드를 쓰는 곳»을 빠짐없이 찾게 한다.

**Architecture:** 표는 api 의 두 테이블이 갖고 REST 로 읽고 쓴다. 노드는 봉투의 새 선택 칸 `code` 로 «그룹 키 · 코드값»을 가리킨다. 풀기 · 사용처 셈 · lint 는 `packages/schema` 의 순수 함수 한 벌이고, 렌더러 · 웹 · 서버 · CLI · MCP · 내보내기가 모두 그것을 부른다.

**Tech Stack:** TypeScript · zod 4 · Kysely + 손 SQL 마이그레이션 · Fastify · React 19 · vitest(jsdom · build 프로젝트의 실브라우저)

**Spec:** `docs/superpowers/specs/2026-11-10-common-codes-design.md`(태스크 0 이 스크래치에서 옮겨 커밋한다). 실행자는 이 계획과 설계를 함께 읽는다.

## Global Constraints

- 참조는 DB id 가 아니라 **그룹 키 + 코드값**이다. `key` · `value` 는 만든 뒤 못 바꾼다(REST 가 받지 않는다).
- `key`: `^[A-Z][A-Z0-9_]{0,39}$`. `value`: 1 ~ 40 자. `name`(그룹 · 항목): 1 ~ 60 자. `value` · `name` 은 별칭과 같은 받지 않는 글자 표(`packages/schema/src/alias.ts`)를 쓴다 — 거절은 봉투 · REST 둘 다.
- 상한: 그룹당 항목 200 · 프로젝트당 그룹 500. 묶인 선택 위젯은 사용 중 항목을 차례대로 **앞 30 개**(`OPTIONS_MAX`)까지 그린다.
- 권한: 읽기 viewer 이상, 쓰기 editor 이상(프로젝트 권한 모델 그대로 · API 토큰도 같은 가드).
- 이력 없음: 코드 표에는 revision · undo 가 없다. 스냅샷만 표를 담는다.
- 코드 표는 소프트 잠금 대상이 아니다. 나중 쓰기가 이긴다.
- 목업에 그룹 키 · 코드값 같은 날 식별자를 그리지 않는다. 끊긴 참조는 prop 의 대체 글 + 경고 표지로 그린다.
- 정본 설계서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)를 고치므로 브랜치 게이트는 전량 넷이다(AGENTS.md 「검증 — wirebound」 · README 「트랙 게이트」).

## Review Focus

1. **표에 없는 그룹 키를 든 노드를 붙여넣음 · 모듈 넣기 · 페이지 JSON 가져오기** — 거절 없이 들어오고, 캔버스에 경고 표지, 통지 «끊긴 공통코드 N» 이 선다. → 태스크 9 의 케이스.
2. **다른 탭이 쓰는 항목을 지움** — `codes-changed` 를 받은 화면이 다시 그려 그 노드가 끊김 표지로 바뀐다(옛 이름을 그대로 두지 않는다). → 태스크 7 의 케이스.
3. **고른 값(`code.selected`)이 사용 안 함이 됨 · 지워짐** — 그리기에서 빠지고 `broken-code-ref` 경고, 하나 고르는 위젯이 그 빈자리에 다른 항목을 골라 보이지 않는다. → 태스크 3 · 6 의 케이스.
4. **판 3 스냅샷(표 없음) 복원** — 지금 표를 건드리지 않는다. 판 4 스냅샷 복원은 표를 그 판으로 덮고, 안전망 스냅샷이 덮기 전 표를 담는다. → 태스크 5 의 케이스.
5. **사용 중 항목 31 개 이상 · 0 개인 그룹에 묶은 선택 위젯** — 앞 30 개 · placeholder 만, lint `code-choices-truncated` · `code-choices-empty`, 저장은 거절하지 않는다. → 태스크 3 · 6 의 케이스.

---

### Task 0: 설계 문서를 브랜치에 들인다

**Files:**
- Create: `docs/superpowers/specs/2026-11-10-common-codes-design.md`(코디네이터 스크래치의 사본 — 브리프가 경로를 준다)

- [ ] **Step 1:** 사본을 그대로 옮기고 `git add` · `git commit -m "docs(spec): common codes design"`.

### Task 1: 코드 표의 모양 · 글자 규칙

**Files:**
- Create: `packages/schema/src/codes.ts`
- Modify: `packages/schema/src/index.ts`(내보내기)
- Test: `packages/schema/test/codes.test.ts`

**Interfaces:**
- Produces:
  - `interface CodeItem { value: string; name: string; active: boolean }`
  - `interface CodeGroup { key: string; name: string; items: CodeItem[] }`(항목은 차례대로)
  - `type CodeTable = readonly CodeGroup[]`(그룹 차례대로)
  - `CODE_KEY_PATTERN` · `CODE_VALUE_MAX = 40` · `CODE_NAME_MAX = 60` · `CODE_ITEMS_MAX = 200` · `CODE_GROUPS_MAX = 500`
  - `CodeKeySchema` · `CodeValueSchema` · `CodeNameSchema`(zod) · `CodeTableSchema`(그룹 키 · 그룹 안 값 중복 거절)

- [ ] **Step 1: 실패하는 케이스** — `CodeKeySchema` 가 `ORDER_STATUS` · `A` · `A1_B` 를 받고 `order_status` · `1A` · `A-B` · 41자를 거절. `CodeValueSchema` 가 `WAIT` · `01` 을 받고 빈 글 · 41자 · U+202E 든 글 · U+2028 든 글을 거절. `CodeTableSchema` 가 같은 키 둘 · 한 그룹 안 같은 값 둘을 거절.
- [ ] **Step 2:** `pnpm vitest run packages/schema/test/codes.test.ts` — 모듈 없음으로 실패.
- [ ] **Step 3:** 구현. 받지 않는 글자 판정은 `alias.ts` 의 표를 import 해 쓴다(두 벌 금지).
- [ ] **Step 4:** 같은 명령 — 통과(실행 수를 적는다).
- [ ] **Step 5:** 커밋 `feat(schema): common code table shape`.

### Task 2: 노드의 `code` 칸 · 카탈로그 선언 · 검증

**Files:**
- Modify: `packages/schema/src/node.ts`(`WbNode.code?`) · `packages/schema/src/envelope.ts`(`WbNodeSchema`) · `packages/schema/src/component/define.ts`(`ComponentDef.code?`) · `packages/schema/src/component/catalog/{input,action,document,structure}.ts` · `packages/schema/src/validate.ts`
- Test: `packages/schema/test/code-ref.test.ts`

**Interfaces:**
- Consumes: `CodeKeySchema` · `CodeValueSchema`(태스크 1)
- Produces:
  - `interface CodeRef { group: string; item?: string; selected?: string[] }` · `WbNode.code?: CodeRef`
  - `type CodeBinding = { kind: 'choices' } | { kind: 'label'; prop: string }` · `ComponentDef.code?: CodeBinding` · `codeBindingOf(type: string): CodeBinding | null`
  - 검증 이슈 코드 `invalid-code-ref`(severity `error`)

- [ ] **Step 1: 실패하는 케이스**
  - `choices` 타입 `Select` · `CheckboxGroup` · `RadioGroup` 의 `codeBindingOf` 가 `{ kind: 'choices' }`.
  - `label` 타입과 prop: `Button.label` · `Link.label` · `Text.content` · `Chip.label` · `Affix.text` · `Placeholder.label` · `TabPanel.label` · `Input.value`(빌더가 카탈로그를 훑어 더하면 이 표에 더한다 — 기준은 설계 「노드 봉투」).
  - `validatePage` 이슈 `invalid-code-ref`: `code` 를 받지 않는 타입(`DataGrid`), `choices` 타입에 `item`, `label` 타입에 `item` 없음 · `selected`, `Select` · `RadioGroup` 의 `selected` 둘 이상, `selected` 의 중복 값.
  - `code` 가 없는 옛 문서는 이슈 0.
- [ ] **Step 2:** `pnpm vitest run packages/schema/test/code-ref.test.ts` — 실패.
- [ ] **Step 3:** 구현. 봉투는 모양(키 · 값 꼴)만, 타입과의 맞춤은 `validate.ts` 가 카탈로그로 본다(`alias` · `weight` 와 같은 갈래). 문서 판은 올리지 않는다(선택 칸 추가 — 옛 문서는 그대로 읽힌다).
- [ ] **Step 4:** 같은 명령 통과 + `pnpm vitest run --project unit packages/schema` 전부 통과(카탈로그 정의 인구조사 케이스가 새 칸을 세는지 본다).
- [ ] **Step 5:** 커밋 `feat(schema): node code reference`.

### Task 3: 풀기 · 사용처 셈 · lint

**Files:**
- Create: `packages/schema/src/codes-resolve.ts` · `packages/schema/src/codes-usage.ts`
- Modify: `packages/schema/src/lint/rules.ts` · `packages/schema/src/lint/input.ts` · `packages/schema/src/lint/design.ts` · `packages/schema/src/display.ts`(`nodeDisplayName`)
- Test: `packages/schema/test/codes-resolve.test.ts` · `packages/schema/test/codes-usage.test.ts` · `packages/schema/test/lint-codes.test.ts`

**Interfaces:**
- Consumes: 태스크 1 · 2
- Produces:
  - `type CodeIndex`(그룹 키 → 그룹) · `indexCodes(table: CodeTable): CodeIndex`
  - `resolveChoices(index: CodeIndex, ref: CodeRef): { options: ChoiceOption[]; truncated: boolean; brokenGroup: boolean; brokenSelected: string[] }` — 사용 중 항목 앞 30 개, `selected` 는 값으로 맞춘다
  - `resolveLabel(index: CodeIndex, ref: CodeRef): { name: string; inactive: boolean } | null`(`null` = 끊김)
  - `codeUsage(sources: readonly UsageSource[], group: string, item?: string): UsageHit[]` — `UsageSource = { kind: 'page' | 'layout' | 'module'; id: string; title: string; nodes: readonly WbNode[] }`, `UsageHit = { kind; id; title; nodes: { nodeId: string; name: string }[] }`. 숨은 상태의 노드도 센다. 선택 위젯은 그룹만 맞아도 걸리고, `item` 을 주면 `code.item === item` 이거나 `selected` 에 든 노드만.
  - `codeUsageCounts(sources): Map<string, { group: number; items: Map<string, number> }>`
  - `LintProject.codes?: CodeTable`(없으면 코드 규칙이 안 돈다)
  - lint 규칙 `broken-code-ref`(error — 없는 그룹 · 없는 항목 · 단 `selected` 의 없는 값은 warning), `inactive-code-ref`(warning), `code-choices-truncated`(warning), `code-choices-empty`(warning)
  - `nodeDisplayName(node, codes?: CodeIndex)` — 묶인 대표 글 노드는 풀린 이름

- [ ] **Step 1: 실패하는 케이스**
  - `resolveChoices`: 사용 중 3 · 사용 안 함 1 → 옵션 3. 사용 중 31 → 30 · `truncated: true`. 사용 중 0 → 빈 배열. `selected: ['GONE']` → `brokenSelected: ['GONE']`, 옵션의 `selected` 는 모두 거짓. 사용 안 함 값을 고름 → 옵션에서 빠지고 `brokenSelected` 에 든다.
  - `resolveLabel`: 이름 · `inactive` · 없는 그룹/항목 `null`.
  - `codeUsage`: 페이지 둘 · 레이아웃 하나 · 모듈 하나에 걸친 노드를 찾고, 숨은 노드(`visibility`)와 구역(`zones`) 안 노드도 센다. `item` 거름이 `selected` 로 고른 선택 위젯을 잡는다.
  - lint: 네 규칙이 각 판에서 한 번씩 서고, `codes` 를 안 주면 넷 다 0.
- [ ] **Step 2:** 세 파일 실행 — 실패.
- [ ] **Step 3:** 구현. 노드 걷기는 `zones.ts` 의 `childLists` 하나를 지난다.
- [ ] **Step 4:** 통과 + `packages/schema/test/lint-rules.test.ts` · `lint-design.test.ts` 통과(규칙 표 인구조사).
- [ ] **Step 5:** 커밋 `feat(schema): resolve, usage and lint for common codes`.

### Task 4: api — 테이블 · REST · 실시간

**Files:**
- Create: `apps/api/src/db/migrations/0036-common-codes.ts` · `apps/api/src/repos/codes.ts` · `apps/api/src/routes/codes.ts`
- Modify: `apps/api/src/db/migrations/index.ts` · `apps/api/src/app.ts`(등록) · `apps/api/src/ws/protocol.ts` · `apps/api/src/ws/notify.ts` · `apps/api/README.md`(엔드포인트 계약)
- Test: `apps/api/test/codes.test.ts` · `apps/api/test/codes-usage.test.ts` · 인구조사 갱신(`permission-matrix.test.ts` · `restore-lock-census.test.ts` 가 새 라우트를 센다)

**Interfaces:**
- Consumes: 태스크 1 · 3(`CodeTableSchema` · `codeUsage` · `codeUsageCounts`)
- Produces (모두 `/api/projects/:projectId` 아래):
  - `GET /codes` → `{ groups: { key, name, items: { value, name, active }[] }[] }`(viewer)
  - `POST /codes` `{ key, name }` → 그룹 · 409 `code-key-taken`(editor)
  - `PATCH /codes/:key` `{ name?, sortOrder? }` · `DELETE /codes/:key`
  - `POST /codes/:key/items` `{ value, name, active? }` · `PATCH /codes/:key/items/:value` `{ name?, sortOrder?, active? }` · `DELETE /codes/:key/items/:value`
  - `GET /codes/usage?group=&item=` → `UsageHit[]` · `GET /codes/usage-counts` → `{ [key]: { group: number; items: { [value]: number } } }`
  - WS 프레임 `{ type: 'codes-changed'; projectId }` — 쓰기 커밋 뒤, 낸 연결 제외(`notifyCommentsChanged` 와 같은 꼴)
  - 테이블: 설계 「저장」의 둘 · `sort_order` 정수 · CASCADE

- [ ] **Step 1: 실패하는 케이스**(`withApi`)
  - viewer 는 `GET` 200 · 쓰기 403. editor 쓰기 200. 비멤버 404.
  - `PATCH` 본문에 `key` · `value` 를 실으면 400(바꿀 수 없다).
  - 상한: 항목 201 번째 · 그룹 501 번째 400. 글자 규칙 위반 400.
  - 사용처: 페이지 둘에 묶은 노드를 넣고 `usage?group=ORDER_STATUS&item=WAIT` 가 그 둘을 낸다. 개인 모듈은 안 센다.
  - `codes-changed` 가 다른 연결에 닿고 낸 연결에는 안 닿는다(`WsProbe` · `mark` 꼴 — AGENTS.md 「`WsProbe.quiet()`」 줄).
- [ ] **Step 2:** `pnpm vitest run --project api apps/api/test/codes.test.ts apps/api/test/codes-usage.test.ts` — 실패.
- [ ] **Step 3:** 구현. 마이그레이션 디렉터리를 글자로 세는 자(`git grep -lE 'MIGRATIONS_DIR|db/migrations' apps/api/test`)를 이 태스크 게이트에 넣는다.
- [ ] **Step 4:** 통과 + 인구조사 케이스 통과 + `pnpm typecheck`.
- [ ] **Step 5:** 커밋 `feat(api): common code table and usage`.

### Task 5: 스냅샷 — 담기 · 복원

**Files:**
- Modify: `packages/themes/src/snapshot/payload.ts`(`SNAPSHOT_PAYLOAD_VERSION = 4` · `codes?`) · `apps/api/src/services/snapshot-capture.ts` · `apps/api/src/services/restore.ts` · `apps/api/src/services/restore-plan.ts` · `packages/themes/src/snapshot/lint-input.ts`(`codes` 를 `LintProject` 로)
- Test: `apps/api/test/snapshot-codes.test.ts` · 갱신: `apps/api/test/restore-plan.test.ts` · `packages/themes` 의 payload 케이스

**Interfaces:**
- Consumes: 태스크 1 · 4
- Produces: `SnapshotPayload.codes?: CodeTable`(판 4 부터) · 복원 결과에 `codesRestored: boolean`

- [ ] **Step 1: 실패하는 케이스**
  - 캡처한 payload 의 `codes` 가 그때 표와 같다(차례 포함).
  - 판 4 복원: 스냅샷 뒤 만든 그룹은 사라지고, 지운 항목이 돌아온다. 안전망 스냅샷의 `codes` 가 덮기 전 표다.
  - 판 3 payload(표 없음) 복원: 지금 표가 그대로다.
  - 복원 뒤 `codes-changed` 가 룸에 간다.
- [ ] **Step 2:** 실행 — 실패.
- [ ] **Step 3:** 구현. 표는 행 교체(지우고 넣기)다. 잠금 차례의 자리는 정본 「스냅샷」 복원 잠금 차례에 맞춰 넣고 `restore-lock-census` 를 고친다.
- [ ] **Step 4:** 통과 + `pnpm vitest run --project api apps/api/test/restore*.test.ts`.
- [ ] **Step 5:** 커밋 `feat(snapshot): capture and restore common codes`.

### Task 6: 렌더러 — 묶인 노드를 표로 그린다

**Files:**
- Modify: `packages/renderer/src/render.tsx`(`RenderOptions.codes?: CodeIndex` · props 를 뷰에 넘기기 전 풀기) · `packages/theme-sdk` 의 표지(끊김 속성)
- Test: `packages/renderer/test/codes.test.tsx`

**Interfaces:**
- Consumes: 태스크 3 의 `resolveChoices` · `resolveLabel` · `CodeIndex`
- Produces: `RenderOptions.codes` · 끊긴 노드 뿌리 요소의 `data-wb-code-broken=""`(테마는 꾸미지 않아도 셸 CSS 가 표지를 그린다)

- [ ] **Step 1: 실패하는 케이스**
  - `Select` 가 `code: { group: 'S', selected: ['B'] }` 이고 `props.options` 가 옛 글일 때, 그린 선택지 글이 표의 이름이고 «B» 의 이름이 골라져 있다.
  - `Affix` 가 `code: { group: 'S', item: 'A' }` · `props.text: '옛 이름'` → 표의 이름을 그린다. 표에서 지우면 «옛 이름» + `data-wb-code-broken`.
  - `codes` 옵션이 없으면 prop 글을 그리고 `data-wb-code-broken` 이 없다(표 없는 소비자).
  - 날 키(`S`) · 값(`A`)이 그린 글자에 안 나온다.
  - 노드 캐시: 같은 노드에 다른 `codes` 를 주면 다시 그린다.
- [ ] **Step 2:** 실행 — 실패.
- [ ] **Step 3:** 구현. 캐시 열쇠에 `codes` 객체를 넣는다(`nodeCacheFor`).
- [ ] **Step 4:** 통과 + `pnpm vitest run --project unit packages/renderer`.
- [ ] **Step 5:** 커밋 `feat(renderer): render code-bound nodes from the table`.

### Task 7: 웹 — 표 읽기 · 캔버스에 싣기 · 실시간

**Files:**
- Modify: `apps/web/src/api/client.ts` · `apps/web/src/api/http-client.ts` · `apps/web/src/api/types.ts` · `apps/web/src/realtime/protocol.ts` · 에디터가 렌더 옵션을 짓는 자리(`apps/web/src/canvas/*`) · `apps/web/test/helpers.tsx`(`fakeApi` 의 `listCodes` 기본값 = 빈 표 — 모든 에디터 케이스에서 돈다)
- Test: `apps/web/test/codes/codes-canvas.test.tsx`

**Interfaces:**
- Consumes: 태스크 4 의 REST · 프레임, 태스크 6 의 `RenderOptions.codes`
- Produces: `ApiClient.listCodes(projectId)` · `createCodeGroup` · `updateCodeGroup` · `deleteCodeGroup` · `createCodeItem` · `updateCodeItem` · `deleteCodeItem` · `codeUsage(projectId, group, item?)` · `codeUsageCounts(projectId)` · 에디터 스토어의 `codes: CodeIndex`

- [ ] **Step 1: 실패하는 케이스**
  - 에디터를 열면 표를 읽어 묶인 `Affix` 를 표의 이름으로 그린다.
  - `codes-changed` 를 받으면 다시 읽고, 항목이 지워졌으면 그 노드가 끊김 표지로 바뀐다(Review Focus 2).
  - 표 조회가 실패해도 캔버스는 prop 글로 그리고 통지 한 줄을 세운다.
- [ ] **Step 2:** 실행 — 실패.
- [ ] **Step 3:** 구현. 다시 읽기는 마지막에 시작한 조회의 답만 싣는다.
- [ ] **Step 4:** 통과 + `pnpm vitest run --project web`(alert · 통지를 세는 케이스가 `fakeApi` 기본값으로 안 죽는지).
- [ ] **Step 5:** 커밋 `feat(web): load common codes into the canvas`.

### Task 8: 웹 — 공통코드 화면

**Files:**
- Create: `apps/web/src/routes/codes.tsx` · `apps/web/src/codes/*`(그룹 목록 · 항목 표 · 사용처 · 지우기 확인)
- Modify: `apps/web/src/app.tsx`(`/projects/:projectId/codes`) · `apps/web/src/routes/editor.tsx:819` 근처 머리 메뉴(«공통코드» — «프로젝트 설정» 앞) · `apps/web/src/routes/project-list.tsx` 카드 메뉴 · `apps/web/src/shell/icons.ts` · `apps/web/test/role-access.test.ts` 경로 표
- Test: `apps/web/test/codes/codes-screen.test.tsx` · `apps/web/build-test/codes-screen.test.ts`(실브라우저 — 900px 아래 카드 접힘 · 긴 영문 이름 넘침)

**Interfaces:**
- Consumes: 태스크 7 의 클라이언트
- Produces: 주소 `?group=<key>` · 사용처 줄 링크 `/projects/:projectId/pages/:pageId?node=<nodeId>`(에디터가 그 노드를 고른다 — 이미 있는 질의면 그것을 쓰고, 없으면 이 태스크가 더한다)

- [ ] **Step 1: 실패하는 케이스**
  - 그룹 목록에 이름 · 키 · 항목 수 · 사용 수, 고른 그룹의 항목 표(차례 · 코드값 · 이름 · 사용 여부 · 사용 수 · «…»), 그 아래 사용처.
  - viewer 는 만들기 · «…» 가 없다.
  - 쓰이는 항목 «삭제» → 확인 상자에 사용 수 · 첫 다섯 곳 · «참조가 끊깁니다». 안 쓰이는 항목은 확인 없이 지운다.
  - 코드값 칸은 만든 뒤 읽기 전용이다.
  - 사용처 줄을 누르면 에디터로 가 그 노드가 골라진다.
- [ ] **Step 2:** 실행 — 실패.
- [ ] **Step 3:** 구현. 관리자 칸과 같은 꼴(위 줄 · 표 · 줄 «…» · 900px 아래 카드)을 쓰고 사람 글은 `isolate` 한다.
- [ ] **Step 4:** jsdom 통과 + `pnpm test:browser apps/web/build-test/codes-screen.test.ts`.
- [ ] **Step 5:** 커밋 `feat(web): common codes screen`.

### Task 9: 웹 — 속성 패널의 묶기 · 풀기 · 고르기

**Files:**
- Create: `apps/web/src/panels/code-binding.tsx`
- Modify: `apps/web/src/panels/property-panel.tsx` · 붙여넣기 · 모듈 넣기 · 가져오기의 통지 자리
- Test: `apps/web/test/panels/code-binding.test.tsx` · `apps/web/build-test/code-binding.test.ts`

**Interfaces:**
- Consumes: 태스크 2 의 `codeBindingOf`, 태스크 3 의 풀기, 태스크 7 의 스토어 `codes`, 태스크 8 의 사용처 주소
- Produces: 편집 묶음 셋(모두 기존 편집 경로의 JSON Patch 한 묶음)
  - 묶기: `add /…/code` + 대체 글 prop `replace`(선택 위젯은 `options`, 대표 글은 그 prop) — 노드 값 `test` 를 전제로 둔다
  - 고르기(선택 위젯): `replace /…/code/selected` + `options` 의 대체 글 · `selected` 맞춤
  - 풀기: `remove /…/code` + 그때 풀린 이름으로 prop `replace`(끊긴 참조면 prop 그대로)

- [ ] **Step 1: 실패하는 케이스**
  - `Affix` 에 «공통코드로 묶기» → 그룹 → 항목 고르면 서버 문서에 `code` 와 `text` = 그 이름.
  - 묶인 동안 대표 글 칸이 잠기고 «공통코드: 주문 상태 › 결제 대기 · 풀기» 와 «이 코드를 쓰는 곳 N»(사용처 화면 링크).
  - 표에서 이름을 바꾼 뒤 풀면 prop 이 **새 이름**이다.
  - `Select` 묶음: 패널이 «표의 항목 중 고르기»가 되고 하나만 고를 수 있다.
  - 끊긴 노드: «끊긴 공통코드: ORDER_STATUS › WAIT · 다시 묶기 · 풀기».
  - 표에 없는 키를 든 노드 붙여넣기 → 거절 없이 들어오고 «끊긴 공통코드 1» 통지(Review Focus 1). 모듈 넣기 · 페이지 JSON 가져오기도 각각 한 판.
- [ ] **Step 2:** 실행 — 실패.
- [ ] **Step 3:** 구현. 묶음의 전제는 노드 값 `test` 하나(AGENTS.md «전제를 칸 하나로 세우면 …» 줄).
- [ ] **Step 4:** 통과 + 실브라우저 판 + `pnpm vitest run --project web`.
- [ ] **Step 5:** 커밋 `feat(web): bind nodes to common codes`.

### Task 10: 내보내기 — HTML 번들 · PPTX

**Files:**
- Modify: `packages/exporter`(번들에 풀린 표 싣기 · 목차 «공통코드» 장) · `apps/api/src/routes/export.ts` · `apps/api/src/services/export-bundle.ts`(표를 읽어 넘긴다) · `packages/exporter/test-support/fixtures.ts`(넓은 표본에 묶인 노드)
- Test: `packages/exporter/test/bundle-codes.test.tsx` · 갱신: `packages/exporter/test/bundle-stateless-bytes.test.ts` 해시(`WB_PRINT_DIGEST=1` · 머리말에 까닭)

**Interfaces:**
- Consumes: 태스크 3 · 6
- Produces: 번들 목차의 «공통코드» 장(그룹마다 항목 표 + 사용처 — 페이지 링크)

- [ ] **Step 1: 실패하는 케이스** — 묶인 노드가 번들에서 표의 이름으로 서고, «공통코드» 장이 그룹 · 항목 · 사용처를 싣는다. 표가 빈 프로젝트는 그 장이 없다. PPTX 는 같은 번들 렌더를 지나 표의 이름이다(api 의 화면 렌더 케이스 하나).
- [ ] **Step 2:** 실행 — 실패.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** 통과 + `pnpm vitest run --project unit packages/exporter`.
- [ ] **Step 5:** 커밋 `feat(exporter): common codes in bundles`.

### Task 11: CLI · MCP · llms.txt

**Files:**
- Modify: `packages/cli/src/*`(명령 `codes list` · `codes usage <key> [value]` · `codes set-group` · `codes set-item` · `codes delete` — 이름은 기존 명령 꼴을 따른다 · `page get` 에 풀린 이름 · `wireb pull` 덤프에 `codes`) · `packages/mcp/src/tools.ts` · `packages/mcp/src/handlers.ts` · `apps/web/config/llms-txt.ts` · 스킬 문서
- Test: `packages/cli/test/codes.test.ts` · `packages/mcp/test/codes.test.ts` · 갱신: `apps/web/test/llms-txt.test.ts`

**Interfaces:**
- Consumes: 태스크 4 의 REST
- Produces: MCP 도구 `list_codes`(표 + 사용 수) · `code_usage { group, item? }` · `edit_codes { ops }`(그룹 · 항목 만들기 · 이름 · 차례 · 사용 여부 · 지우기). `get_page` 응답의 `nodes[]` 에 묶인 노드는 `code: { …, resolved }`

- [ ] **Step 1: 실패하는 케이스** — 각 도구 · 명령의 정상 판 하나, 권한 없는 토큰 거절 하나, `get_page` 의 `resolved` 이름, 터미널 출력이 이름을 `terminal-safe` 로 내는지(제어 글자 든 이름).
- [ ] **Step 2:** 실행 — 실패.
- [ ] **Step 3:** 구현. 도구 표의 `spec` 줄은 정본 「MCP 도구」 표에 같은 글자로 더한다(태스크 12).
- [ ] **Step 4:** 통과.
- [ ] **Step 5:** 커밋 `feat(cli,mcp): common codes tools`.

### Task 12: 정본 설계서 · 게이트

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-wirebound-design.md` — 「도메인 모델」(엔티티 · 테이블) · 「페이지 스키마 노드」(`code`) · 「컴포넌트 카탈로그」(묶이는 타입 · 선택지 30 개) · 「설계서 화면 구조」(공통코드 화면 · 패널) · 「스냅샷」(판 4 · 표 덮기) · 「lint 규칙」(넷) · 「MCP 도구」(셋) · 「편집 · 실시간」(`codes-changed`). 지금 참인 설계만 적는다(연대기 금지).

- [ ] **Step 1:** 고치고, 정본을 읽는 케이스(`git grep -l "wirebound-design.md" -- '*.test.ts'`)를 돈다.
- [ ] **Step 2:** 전량 게이트 넷(`pnpm test` · `pnpm typecheck` · `pnpm test:build` · `pnpm lint` + `pnpm fmt`) — 실행 · 건너뜀 수를 보고에 적는다.
- [ ] **Step 3:** 커밋 `docs(spec): common codes in the canonical design`.
