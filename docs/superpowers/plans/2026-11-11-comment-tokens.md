# 코멘트 토큰 Implementation Plan

> **For agentic workers:** 이 저장소에서는 워크트리 안의 Orca 워커가 태스크를 차례로 구현하고, 리뷰어 워커가 브랜치 끝에 한 번 본다(AGENTS.md 「워크트리 안의 작업은 Orca 세션이 한다」). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코멘트 본문에 페이지 · 번호 · 공통코드를 가리키는 토큰을 넣고, 읽는 자리마다 지금의 이름 · 번호로 풀어 보이며 눌러 그 자리로 간다.

**Architecture:** 토큰은 본문 글 안의 `[보이는 글](wb:<종류>/<대상>)` 이다(서버 검증 · 저장은 그대로). 파싱과 풀기는 `packages/schema` 의 순수 함수 한 벌이고, 웹 패널 · 번들 · PPTX · MCP · CLI 가 그 함수를 지난다. 웹은 프로젝트 전체의 «번호 색인» 을 새 조회로 받아 푼다.

**Tech Stack:** TypeScript · zod 4 · Fastify · React 19 · vitest(jsdom · build 프로젝트의 실브라우저)

**Spec:** `docs/superpowers/specs/2026-11-11-comment-tokens-design.md`(태스크 0 이 스크래치에서 옮겨 커밋한다). 실행자는 이 계획과 설계를 함께 읽는다.

## Global Constraints

- 토큰 꼴: `[<글>](wb:page/<pageId>)` · `[<글>](wb:comment/<pageId>/<nodeId>)` · `[<글>](wb:code/<KEY>)` · `[<글>](wb:code/<KEY>/<퍼센트 인코딩한 값>)`. `wb:comment` 는 **번호(그 노드의 코멘트 묶음)** 를 가리킨다 — 코멘트 하나가 아니다.
- 모르는 종류 · 꼴이 깨진 토큰은 원문 글자 그대로 보인다.
- 풀기는 그 코멘트가 사는 프로젝트의 자료로만 한다. 끊김의 까닭(지워짐 · 다른 프로젝트)을 가르지 않는다 — 대체 글 + «찾을 수 없음» · 누를 수 없음.
- 읽는 자리에서 날 id 를 보이지 않는다(MCP 와 CLI `--json` 만 대상을 싣는다).
- 서버는 토큰을 고치지 않는다. 본문 길이 한도(`COMMENT_BODY_MAX_LENGTH`)는 원문으로 센다.
- 입력 칸은 지금 글 상자 그대로다(칩 편집기 없음). 한글 조합 중에는 자동완성을 열지도 고르지도 않는다.
- 정본 설계서를 고치므로 브랜치 게이트는 전량 넷이다.

## Review Focus

1. **재번호 뒤의 토큰** — «문서 순서대로 재번호» 뒤에 «#3» 이 새 번호로 보이고, 누르면 같은 노드로 간다. → 태스크 2 · 4 의 케이스.
2. **남의 프로젝트 id 를 든 토큰** — 붙여 넣은 본문의 `wb:page/<남의 id>` 가 그 제목을 내지 않고 «찾을 수 없음» 이다(서버 색인 · 번들 · MCP 모두). → 태스크 2 · 3 의 케이스.
3. **토큰처럼 생긴 보통 글** — `[링크](https://…)` · `[a](wb:)` · 닫히지 않은 `[` · `wb:` 만 든 글이 원문 그대로 보이고 깨지지 않는다. → 태스크 1 의 케이스.
4. **한글 조합 중의 `#`** — 조합 중 Enter 가 후보를 고르지 않고, `#` 뒤 한글 조합이 끝난 뒤에 거른다(실브라우저 CDP `Input.imeSetComposition`). → 태스크 5 의 케이스.
5. **노드째 지운 번호 · 코멘트가 다 지워져 번호가 걷힌 노드** — 앞은 끊김, 뒤는 «회원 목록 › <노드 이름>» 으로 누르면 그 노드로 간다. → 태스크 2 · 4 의 케이스.

---

### Task 0: 설계 문서를 브랜치에 들인다

- [ ] 코디네이터 스크래치 사본(브리프가 경로를 준다)을 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md` 로 글자 그대로 옮겨 커밋 `docs(spec): comment tokens design`.

### Task 1: 파서

**Files:** Create `packages/schema/src/comment-tokens.ts` · Modify `packages/schema/src/index.ts` · Test `packages/schema/test/comment-tokens-parse.test.ts`

**Interfaces — Produces:**
- `type CommentTokenTarget = { kind: 'page'; pageId: string } | { kind: 'comment'; pageId: string; nodeId: string } | { kind: 'code'; group: string; item?: string }`
- `type CommentSegment = { type: 'text'; text: string } | { type: 'token'; label: string; target: CommentTokenTarget; raw: string }`
- `parseCommentBody(body: string): CommentSegment[]` — 이어 붙인 `raw` · `text` 가 원문과 글자 그대로 같다.
- `formatCommentToken(label: string, target: CommentTokenTarget): string` — 글의 `]` · `\` 를 이스케이프, 코드값은 `encodeURIComponent`.

- [ ] **Step 1: 실패하는 케이스** — 종류 셋의 왕복(`parse(format(x))`), 한 본문의 토큰 여럿과 사이 글, 줄바꿈 낀 본문, Review Focus 3 의 꼴 다섯(원문 그대로 · `text` 조각), 글에 `]` 가 든 라벨의 왕복, `/` · 공백 · `)` 가 든 코드값의 왕복, uuid 가 아닌 `pageId` · 노드 id 꼴(`NODE_ID_PATTERN`)이 아닌 `nodeId` 는 토큰이 아니다, 모든 판에서 `segments.map(s => s.type === 'text' ? s.text : s.raw).join('') === body`.
- [ ] **Step 2:** `pnpm vitest run packages/schema/test/comment-tokens-parse.test.ts` — 실패.
- [ ] **Step 3:** 구현(정규식 하나로 짓지 말고 왼쪽부터 훑는 작은 스캐너 — 이스케이프 · 중첩 `[` 를 정규식이 못 가른다).
- [ ] **Step 4:** 통과(실행 수) · 혼자 죽는 변조 하나.
- [ ] **Step 5:** 커밋 `feat(schema): comment token parser`.

### Task 2: 풀기 · lint

**Files:** Modify `packages/schema/src/comment-tokens.ts` · `packages/schema/src/lint/rules.ts` · `packages/schema/src/lint/input.ts` · `packages/schema/src/lint/design.ts` · Test `packages/schema/test/comment-tokens-resolve.test.ts` · `packages/schema/test/lint-comment-tokens.test.ts`

**Interfaces:**
- Consumes: 태스크 1 · `CodeIndex` · `resolveLabel`(`codes-resolve.ts`) · `nodeDisplayName`
- Produces:
  - `interface CommentTokenContext { currentPageId: string; pages: ReadonlyMap<string, { title: string; menuPath: string }>; markers: ReadonlyMap<string, { marker: number | null; nodeName: string }> /* 열쇠 `${pageId}/${nodeId}` */; codes?: CodeIndex }`
  - `type ResolvedSegment = { type: 'text'; text: string } | { type: 'link'; text: string; target: CommentTokenTarget } | { type: 'broken'; text: string }`
  - `resolveCommentTokens(body: string, context: CommentTokenContext): ResolvedSegment[]`
  - `commentTokenText(body: string, context: CommentTokenContext, withTarget: boolean): string` — 글 한 줄로 편 것(PPTX · CLI 는 `false`, MCP · CLI `--json` 은 `true` → `회원 목록 #3 (comment:<pageId>/<nodeId>)`)
  - `buildMarkerIndex(pages: readonly { id: string; document: PageDocument }[], codes?: CodeIndex): CommentTokenContext['markers']`
  - lint 규칙 `comment-token-broken`(info) · `LintComment` 에 `body` 를 더한다

- [ ] **Step 1: 실패하는 케이스** — 설계 «풀린 모양» 표의 줄마다 하나(같은 페이지 «#3» · 다른 페이지 «회원 목록 #3» · 같은 제목 둘이면 «메뉴 › 제목 #3» · 번호 없는 노드 «회원 목록 › 버튼» 이 `link` · 노드째 없음 `broken` · 코드 그룹 · 항목 · 끊긴 코드 `broken`), 컨텍스트에 없는 페이지 id 는 대체 글 그대로 `broken`(Review Focus 2 — 출력에 컨텍스트 밖의 어떤 이름도 없다), 재번호(마커 3 → 1)를 반영한 컨텍스트에서 «#1»(Review Focus 1). `commentTokenText` 의 두 꼴. lint 가 끊긴 토큰마다 한 이슈.
- [ ] **Step 2–4:** 실패 → 구현 → 통과 · 혼자 죽는 변조. 규칙 표 인구조사(`lint-rules.test.ts`)도 돈다.
- [ ] **Step 5:** 커밋 `feat(schema): resolve comment tokens`.

### Task 3: api — 번호 색인 · lint 입력

**Files:** Create `apps/api/src/routes/comment-index.ts`(또는 `routes/comments.ts` 에 라우트 하나) · Modify `apps/api/src/app.ts` · `apps/api/README.md` · lint 입력을 짓는 자리(`packages/themes/src/snapshot/lint-input.ts` 의 `body`) · Test `apps/api/test/comment-index.test.ts`

**Interfaces — Produces:** `GET /api/projects/:projectId/comments/index`(viewer) → `{ pages: { id, title, menuPath }[]; markers: { pageId, nodeId, marker: number | null, nodeName: string, firstComment: string }[] }` — 코멘트가 하나라도 달린 노드만. 번호 · 노드 이름은 페이지 문서에서 `buildMarkerIndex` 로 짓는다(공통코드 표로 이름을 푼다).

- [ ] **Step 1: 실패하는 케이스** — 페이지 둘에 코멘트를 달고 색인이 둘을 낸다, 재번호 뒤 번호가 새 값, 비멤버 404 · viewer 200, 다른 프로젝트의 페이지는 없다, `firstComment` 는 그 노드의 가장 이른 코멘트 앞 40 자.
- [ ] **Step 2–4:** 실패 → 구현 → 통과 · 변조. 가드 인구조사(`permission-matrix` 등 — 새 라우트를 센다)를 돈다.
- [ ] **Step 5:** 커밋 `feat(api): comment marker index`.

### Task 4: 웹 — 패널에 풀어 보이기 · 이동

**Files:** Create `apps/web/src/panels/comment-body.tsx` · Modify `apps/web/src/panels/comment-panel.tsx:1280` · `apps/web/src/api/{client,http-client,types}.ts` · 셸이 색인을 드는 자리(공통코드의 `ProjectCodesProvider` 와 같은 꼴 — `ProjectCommentIndexProvider`) · `apps/web/test/helpers.tsx`(`fakeApi` 기본값 = 빈 색인) · Test `apps/web/test/panels/comment-tokens.test.tsx` · `apps/web/build-test/comment-tokens.test.ts`

**Interfaces:**
- Consumes: 태스크 2 의 `resolveCommentTokens`, 태스크 3 의 조회, 에디터의 `?node=` 고르기(`routes/editor.tsx` 549 근처)
- Produces: `<CommentBody body context onNavigate />` · 이동 주소: 페이지 `/projects/:id/pages/:pageId` · 번호 `…/pages/:pageId?node=<nodeId>&comment=1`(패널이 그 묶음으로 굴려 1.5s 강조) · 코드 `/projects/:id/codes?group=<KEY>[&item=<값>]`

- [ ] **Step 1: 실패하는 케이스** — 패널이 토큰을 링크로 그리고 날 id 가 글자에 없다, 누르면 각 주소로 간다(뷰 모드에서도), 끊김은 단추가 아니고 «찾을 수 없음», `comments-changed` · 메뉴 변경 · `codes-changed` 뒤 다시 풀린다, 재번호 편집 뒤 «#3» → «#1»(Review Focus 1), 노드째 지운 판 · 번호 걷힌 판(Review Focus 5). 실브라우저 하나: 다른 페이지 번호 토큰을 눌러 그 페이지 · 노드 · 강조가 서는지.
- [ ] **Step 2–4:** 실패 → 구현 → 통과 · 변조. `pnpm vitest run --project web` 전부(`fakeApi` 기본값이 다른 케이스를 안 죽이는지).
- [ ] **Step 5:** 커밋 `feat(web): render and follow comment tokens`.

### Task 5: 웹 — `#` 자동완성

**Files:** Create `apps/web/src/panels/comment-token-picker.tsx` · Modify `comment-panel.tsx`(달기 1150 · 고치기 1258 의 `<textarea>`) · Test `apps/web/test/panels/comment-token-picker.test.tsx` · `apps/web/build-test/comment-token-picker.test.ts`

**Interfaces — Produces:** 고르면 `#<친 글>` 자리를 `formatCommentToken(지금 이름, target)` 으로 바꾼다. 달기 · 고치기 저장 직전에 본문의 토큰 라벨을 지금 이름으로 다시 적는다(`refreshCommentTokenLabels(body, context): string` — `packages/schema` 에 둔다).

- [ ] **Step 1: 실패하는 케이스** — `#` 로 열리고 친 글로 거른다(이 페이지 번호 · 다른 페이지 · 다른 페이지 번호 · 코드 그룹 · 항목 다섯 무리), ↑ ↓ · Enter · 누름으로 고른다, Escape 는 `#…` 를 보통 글로 남긴다, 길이 한도를 넘는 고름은 넣지 않고 말한다, 저장 직전 라벨 갱신. 실브라우저: 한글 조합 중 Enter 가 안 고른다(Review Focus 4 — CDP `Input.imeSetComposition`).
- [ ] **Step 2–4:** 실패 → 구현 → 통과 · 변조.
- [ ] **Step 5:** 커밋 `feat(web): comment token autocomplete`.

### Task 6: 번들 · PPTX

**Files:** Modify `packages/exporter/src/bundle/comments.ts:89` · 번들 셸이 코멘트 본문을 그리는 자리 · `packages/exporter/src/pptx/index.ts:249` · 페이지 장의 번호 닻 · `codes.html` 의 그룹 · 항목 닻 · `apps/api/src/services/export-*`(색인 자료를 내보내기 행에 싣는다 — 워커 메시지 셋도: AGENTS.md «`ExportRows` 에 칸을 더하면 …») · Test `packages/exporter/test/bundle-comment-tokens.test.tsx` · `apps/api/test/export-routes.test.ts`(내려받은 zip 에서)

- [ ] **Step 1: 실패하는 케이스** — 번들의 토큰이 `<a href>`(페이지 장 · `#wb-marker-<nodeId>` · `codes.html#wb-code-<KEY>[-<값>]`), 끊김은 링크 없음, PPTX 는 풀린 글만, 라우트로 내려받은 zip 에서도 풀림, 번들 글은 목업 칸이 아니라 코멘트 칸에서 잰다(페이지 데이터 JSON 을 읽지 않는다).
- [ ] **Step 2–4:** 실패 → 구현 → 통과 · 변조. `bundle-stateless-bytes` 해시를 다시 지어야 하면 `WB_PRINT_DIGEST=1` 과 머리말 까닭.
- [ ] **Step 5:** 커밋 `feat(exporter): comment tokens in bundles and pptx`.

### Task 7: MCP · CLI · 가져오기

**Files:** Modify `packages/mcp/src/handlers.ts`(`get_page` 의 코멘트 글) · `packages/mcp/src/tools.ts`(`add_comment` 설명에 토큰 꼴) · `packages/cli/src/read/page.ts:171` · `packages/cli/src/commands/page-get.ts:115` · `apps/web/config/llms-txt.ts` · 스킬 문서 · `apps/api/src/services/page-import.ts`(가져온 본문의 `wb:comment/<파일의 옛 pageId>/…` · `wb:page/<옛 id>` 를 새 페이지 id 로 — 파일에 옛 페이지 id 가 있을 때만) · Test `packages/mcp/test/comment-tokens.test.ts` · `packages/cli/test/comment-tokens.test.ts` · `apps/api/test/page-import-tokens.test.ts`

- [ ] **Step 1: 실패하는 케이스** — `get_page` 가 `commentTokenText(…, true)` 꼴, CLI 사람 출력은 대상 없음 · `--json` 은 대상 포함, 터미널 글은 `terminal-safe`, 가져온 페이지 안을 가리키던 토큰이 새 페이지 id 로 이어지고 바깥을 가리키던 토큰은 그대로(끊김으로 보인다).
- [ ] **Step 2–4:** 실패 → 구현 → 통과 · 변조.
- [ ] **Step 5:** 커밋 `feat(cli,mcp): comment tokens for agents`.

### Task 8: 정본 설계서 · 게이트

- [ ] **Step 1:** 정본 「설계서 화면 구조」(코멘트 토큰 · 자동완성 · 이동) · 「HTML 정적 번들」(닻) · 「lint 규칙」 · 「MCP 도구」 · 「CLI」 를 지금 참인 설계로 고치고, 정본을 읽는 케이스를 돈다.
- [ ] **Step 2:** 전량 넷 + `pnpm fmt` · `pnpm lint` — 실행 · 건너뜀 수를 적는다. 빨강을 고쳤으면 고친 뒤 전량을 한 판 더.
- [ ] **Step 3:** 커밋 `docs(spec): comment tokens in the canonical design`.
