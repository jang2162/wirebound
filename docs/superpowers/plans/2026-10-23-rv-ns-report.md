# RV-NS 보고 — 노드 구역(모델 A) 리뷰 — 2026-10-23

브리프: 코디네이터 `brief-rv-ns.md`. 대상: 워크트리 `feat-node-slots` · 브랜치 `feat/node-slots` · HEAD `15bdd30a`(구현 NS2 의 마지막 커밋). 리뷰는 고치지 않고 재서 적는다. 탐침은 스크래치(테스트 글롭 밖 · api 하네스를 스크래치 vitest 설정으로 부름 — `root` = 워크트리 · `globalSetup` · `setupFiles` = api 프로젝트의 것)에서 돌렸다. node v24.21.0 · Postgres 5481(이 워크트리의 컨테이너).

## 높은 무게

**없다.** 잠금 우회 · 편집을 잃음 · 남의 화면 · 권한 · 데이터를 잃는 마이그레이션 · 서버 기동 멈춤 가운데 재현된 것이 없다 — 구역 안 잠금 121 판(실물 api 두 세션 · 세 입구) · 리베이스 무작위 4000 판 · 실브라우저 두 사람 4 판 · 옛 판 테마 1.2.1 에 고정한 프로젝트의 판 3 화면이 모두 기대대로였다.

## 무게 순 발견

| # | 무게 | 무엇 | 절 |
| --- | --- | --- | --- |
| 1 | 중간 · 사용자 결정 | `0028` 이 옮긴 검색폼의 단추가 판 2 화면과 다르다 — «조회(주 단추) · 초기화» → «초기화 · 검색»(낱말 · 차례 · 주 단추 강조). 입력폼은 주 단추 강조만 잃는다 | 2 |
| 2 | 중간 | `wb-theme check` 가 패널 내용을 안 그리는 탭 뷰를 못 잡는다(오류 0) — 그 테마의 화면 · 번들에서 탭 내용이 조용히 사라진다 | 6 |
| 3 | 중간 · B 몫 | `zones` 맵이 없는 노드에 둘이 서로 다른 구역의 첫 노드를 함께 넣으면 뒤에 닿은 쪽이 버려진다(통지 있음) — 맵째 `add` 의 전제가 구역 넷을 한 자리로 묶는다. 지금 화면에는 그 길이 사실상 없고 B 가 연다 | 1 |
| 4 | 낮음 · 케이스 | 웹 리베이스의 구역 갈래를 재는 store 케이스가 0 이다(설계가 든 «구역 사이 `move` 의 리베이스» 포함) | 1 |
| 5 | 낮음 · 케이스 | 마이그레이션 «판 2 가 하나도 안 남는다» 가 제목의 «단추 없는 폼» 을 안 센다 | 7 |
| 6 | 낮음 · 케이스 도우미 | `packages/exporter/test-support/fixtures.ts` 의 `typesIn` 이 몸통만 돈다 — 구역 안 오타 타입을 «카탈로그 밖 타입» 케이스가 못 잡는다 | 1 |
| 7 | 낮음 · 원래 있던 길 | `0028` 이 `head_seq` 를 안 올린다(`0025` 와 같다) — 배포를 걸친 판 2 좌표 편집이 같은 `baseSeq` 로 판 3 문서에 얹힐 수 있다. 재지 않았다 | 2 |

## 1. 잠금이 구역 안에서도 몸통과 같은가

### 실물 api 두 세션 (탐침 `zone-lock.test.ts`)

보라(editor)가 WS 로 카드의 머리 오른쪽 구역 둘째 단추 `n_e2`(`/root/children/0/zones/headEnd/1`)를 잡고, 다혜(owner)가 편집을 REST(세션) · WS `patch` · MCP 꼴(토큰 + `x-wb-client: mcp` 의 `PATCH …/ops`) 세 입구로 보낸다. 문서: 카드(제목 옆 `n_badge` · 머리 오른쪽 `n_e1` `n_e2` · 몸통 `n_kv` · 바닥 `n_f1`) · 검색폼(몸통 `n_fd` · 단추 `n_s1` `n_s2`) · 탭(패널 `n_tp1[n_t1]` · `n_tp2[n_t2]`).

| 묶음 | 판(입구마다) | 기대 · 받은 값 |
| --- | --- | --- |
| (가) 잠긴 노드 · 부모 카드 지움/덮음 · 뿌리 덮음 | 4 | 423 · 문서 그대로 |
| (가) 부모 카드 prop · 같은 구역 형제 prop/지움 · 다른 구역 형제 · 몸통 형제 지움 · 다른 폼 단추 지움 | 6 | 200 · 문서 바뀜 |
| (나) 잠긴 노드를 바닥 · 뿌리 몸통으로 · 잠긴 노드 안으로 옮김 · 구역 배열째 옮김(`from` = 머리 오른쪽) · 바닥 배열을 머리 오른쪽 열쇠 위로 | 5 | 423 |
| (나) 형제를 바닥으로 · 바닥 단추를 머리 오른쪽 맨 앞으로 · 다른 폼 단추를 머리 오른쪽 끝으로 | 3 | 200 |
| (다) `zones` 맵 지움 · `replace` · `add` 로 덮음 · 그 구역 배열 지움 · `replace []` · `add []` | 6 | 423 |
| (다) 바닥 배열 지움 · 몸통 배열 지움 · 제목 옆 배열 `replace []` | 3 | 200 |
| (라) 맨 앞 넣고 밀린 자리 고침 · 앞 형제 지우고 당겨진 자리 지움 · 앞 형제를 바닥으로 옮기고 당겨진 자리 고침 · 바닥 단추를 맨 앞으로 옮기고 밀린 자리 지움 · 카드 앞에 넣고 옛 카드 좌표의 구역 지움 · 번호 `01` · `zones` 를 지우고 다시 만듦 | 7 | 423 |
| (라) 맨 앞 넣고 원래 번호(이제 형제) 고침 | 1 | 200 |

세 입구 × 35 판 = 105 판 · 기대와 갈린 판 0 · 423 판 66 개 모두 서버 문서 바이트 그대로 · 200 판 39 개 모두 문서가 바뀜.

고르기(WS `lock` 프레임 · 보라가 `n_e2`): `n_e2` · 카드 · 뿌리 → `lock-denied`, 같은 구역 형제 `n_e1` · 바닥 `n_f1` · 몸통 `n_kv` · 제목 옆 `n_badge` → 받음. 7 판 기대대로.

반대 방향(보라가 카드를 잡음 · REST): 구역 안 단추 prop · 구역 안 단추를 다른 폼으로 · 다른 폼 단추를 카드 바닥으로 → 423, 다른 폼 단추 prop → 200. 4 판 기대대로.

탭 · 폼(REST): 둘째 패널 안 `n_t2` 를 남이 잡음 — 첫째 패널 지움 200 · 첫째 패널 지운 뒤 당겨진 0 의 내용 지움 423 · 탭째 지움 423. 폼 단추 `n_s2` 를 남이 잡음 — 폼 몸통 필드 지움 200 · `actions` 덮음 423. 5 판 기대대로.

합 121 판 · 통과 121.

**탐침의 구분력:** `packages/schema/src/tree.ts` 의 `findNodePath` 가 경로에 `/zones/` 가 든 노드를 못 찾게 한 변조(백업 · `cmp` 복원)에 REST 35 판만 돌려 22 판이 죽었다 — 423 이어야 할 22 판 가운데 21 판이 200(문서 바뀜) · 1 판(잠긴 단추 안으로 옮김)이 409(그 편집은 검증이 버튼의 자식을 거절). 200 이어야 할 13 판은 그대로 200.

### 클라이언트 리베이스(`apps/web/src/store/anchored-ops.ts`) — 무작위 판 (탐침 `zone-rebase.test.ts` · node 환경)

`apps/web/test/store/` 의 케이스에 구역(`zones` · «구역») 낱말이 하나도 없다 — 설계가 새 케이스로 든 «구역 사이 `move` 의 리베이스» 가 케이스로 없다(`git grep -c -iE "zone|구역" -- apps/web/test/store/` → 0 줄). 그래서 무작위 판으로 쟀다.

판: 카드 넷(구역 셋 · 몸통에 단추 0–2 · `zones` 맵이 없는 카드 20 %) 문서 D 에서 웹 편집 함수(`removeNodeOps` · `propOps` · `insertNodeOps` · `moveNodeOps` — 구역 인자 포함)로 내 편집 L 과 남의 편집 R 을 짓고, S = R(D) 위로 `anchorOps(D, L)` → `rebaseAnchored(S, …)`. 오라클은 포인터 없이 노드 id 의 (부모, 구역)으로 «같은 뜻» 을 본다 — 얹혔으면 겨눈 노드만 바뀌고 남의 노드는 자리 · 값 그대로, 못 얹었으면 못 얹을 판(겨눈 노드 · 부모가 없음)이어야 한다.

| 값 | 수 |
| --- | --- |
| 판 · 구역 경로를 건드린 판 | 4000 · 2568 |
| 얹힘 — 지움 · prop · 넣기 · 옮기기 | 1033 · 731 · 949 · 1062 |
| 얹혔는데 뜻이 다름(엉뚱한 노드 · 엉뚱한 구역 · 남의 노드가 바뀜) | **0** |
| 못 얹을 판이라 못 얹음 | 182 |
| 얹을 수 있는데 못 얹음(전제) | 44 — 같은 카드에서 둘이 빈 구역 · `zones` 맵을 함께 만든 판뿐. 같은 구역 21 (덮지 않으려면 버려야 맞다) · **다른 구역 23** |

«다른 구역 23» 은 `zones` 맵이 없는 카드에 둘이 서로 다른 구역의 첫 노드를 넣은 판이다 — 둘 다 `add …/zones { <이름>: […] }`(맵째)를 내고, 뒤에 닿은 쪽의 전제(«`zones` 키가 없었다», `premise.had`)가 깨져 버려진다. 리베이스의 버림은 통지(`use-realtime.ts` 의 `droppedNotice`)가 말하므로 조용한 잃음은 아니다. 몸통(`add …/children [노드]`)과 같은 기전이지만 구역은 **맵 하나를 구역 넷이 나눠 써** 서로 다른 자리의 첫 넣기끼리도 부딪친다. 지금(A) 웹은 빈 구역 칸이 없어(놓을 자리는 형제가 선 구역뿐 — `structure-drop.ts` · `structure-toolbar.tsx` 의 호출이 그 구역 안의 자리를 준다) 맵째 `add` 를 내는 길이 화면에 사실상 없다. B 가 빈 구역 칸(Q2) · 구역 줄 넣기로 그 길을 연다 — B 에서 잦아진다(무게: 중간 · B 의 몫 · 아래 «남은 것»).

서버 판정과 클라이언트 판정이 같은 답을 내는가: 둘 다 `@wirebound/schema` 의 `lockConflictOfOps` · `selectionConflicts` 하나를 부른다(화면 `store/editor-store.ts`). 얹힌 경로가 겨눈 노드를 그대로 가리키는 것(위 0)이 성립하면 같은 문서 · 같은 ops 에 같은 함수다.

### 셈 자가 못 보는 읽기 (`packages/schema/test/zones-census.test.ts` 밖)

셈 자는 `X.children` · `X.zones` · `X['children']` 를 AST 로 센다. 못 보는 꼴 셋을 TypeScript 파서로 따로 셌다(`packages` · `apps` · `system-themes` 의 `src` · `config` · `test-support` 423 파일 — 메뉴 트리 파일은 뺐다):

| 꼴 | 수 | 노드를 걷는데 구역을 빠뜨린 자리 |
| --- | --- | --- |
| 구조 분해 `{ children }` · `{ zones }` | 11 | **1 — `packages/exporter/test-support/fixtures.ts:237` 의 `typesIn`**(몸통만 돈다). 나머지 10 은 뷰 인자(`default-views/*`) |
| 문자열 `'children'` · `'zones'` · `'/children…'` 와 템플릿 경로 | 34 | 0 — 전부 몸통 · 구역을 가르는 자리(`render.tsx` · `check.ts` · `canvas-preview.ts` · `structure-tree.tsx` 의 `pointer === '/children'`), 경로 짓기(`zones.ts` · `validate.ts` · `ops.ts`), `anchored-ops.ts` 의 토큰 견줌 |

`typesIn` 은 `packages/exporter/test/parity.test.tsx` «픽스처가 합쳐 카탈로그의 컴포넌트를 전부 쓴다» · «카탈로그 밖의 타입은 폴백 픽스처의 하나뿐이다» 가 쓴다 — 구역 안에만 둔 타입을 못 세어, 둘째 케이스는 구역 안의 오타 타입을 못 잡는다(거짓 초록 · 낮음 · 케이스 도우미).

## 2. 마이그레이션 `0028`

구현의 케이스(`apps/api/test/node-zones-migration.test.ts`)가 브리프의 꼴 대부분을 이미 판 2 표본으로 잰다 — 탭 · 활성 탭 번호 · `switchTab`(범위 안 · 밖 · 문서 밖) · 검색폼 · 접힌 검색폼 · 입력폼 · `tabs` 없는 탭 · 상태 보임 · 표지 · 별칭 · 레이아웃 · 프로젝트/개인 모듈 · 스냅샷(판 1 · 2 · 3) · 재실행 · `down` 두 갈래. 코드로 본 것:

- **노드 id 는 바뀌지 않는다** — `liftNode` 가 `{ ...node }` 로 옮기고 새 id 는 패널 · 폼 단추에만 짓는다(`freshId` — 그 문서 · 묶음의 id 와 안 겹치게). 코멘트 행(`comments.node_id`)은 옮기지 않아도 그대로 닿는다.
- **다시 돌려도 안전하다** — 페이지 · 레이아웃 · 스냅샷은 판 3 이면 `null`(안 건드림), 모듈 두 표는 «자식이 다 `TabPanel` 인 탭은 그대로» · «`actions` 가 비지 않은 폼은 그대로» 로 멈춘다.
- **`down` 은 행이 있으면 «백업에서 되돌린다» 로 거절** · 다 비면 내려간다(케이스 둘 · 변조 AD1).

실브라우저 한 판(탐침 `zones-live.test.ts` (1) · editor-stack · dev 번들): 판 2 표본(탭 이름 셋 · 둘째 활성 · 자식 둘 · `switchTab` 단추 · 검색폼 · 입력폼)을 `liftDocument` 로 옮긴 노드를 새 페이지에 넣고 에디터로 열었다 — 탭 머리 `["기본정보","상세정보","이력"]` · 활성 패널에 옛 자식 둘 · 검색폼 `actions` 구역 단추 `["초기화","검색"]` · 입력폼 `["저장","취소"]` · 구조 트리 구역 줄(`/children` · `/zones/actions` ×2) · 콘솔 오류 0.

**발견 — 옮긴 검색폼의 단추가 판 2 화면과 다르다(중간 · 사용자 결정 후보).** 판 2 기본 뷰는 검색폼 단추줄을 «조회» · «초기화» 차례로 그렸고(`git show main:packages/theme-sdk/src/default-views/input.tsx` 39–40 줄), 기본테마 CSS 가 첫 단추(`span:first-child`)를 주 단추로 칠했다(`git show main:system-themes/admin/src/theme.css` 414–415 줄). `0028` 은 카탈로그 `initial` 의 사본 «초기화» · «검색» 을 넣는다 — 옮긴 설계서마다 낱말(조회 → 검색) · 차례 · 주 단추 강조가 바뀐다. 입력폼은 «저장» · «취소» 차례가 같지만 주 단추 강조(판 2 의 첫 단추 칠)가 기본 단추로 바뀐다(스크린숏에서 두 단추가 같은 칠). 설계 spec 「3. 컴포넌트별 구역」 이 새 폼의 기본 내용으로 «초기화 · 검색» 을 정했고 Q1 (가) 가 «폼에는 기본 단추» 라 적어 설계대로이지만, 사용자 볼륨(5433)의 기존 설계서가 낱말까지 바뀌는 것은 사용자에게 물을 일이다.

**관찰 — `0028` 은 `head_seq` 를 안 올린다**(`0025` 와 같다 — 원래 있던 길). 배포를 걸쳐 판 2 좌표로 지은 편집을 든 클라이언트(배포 전에 페이지를 읽은 MCP 에이전트 등)가 같은 `baseSeq` 로 보내면 서버는 판 3 문서에 그 좌표를 얹는다 — 옛 탭의 자식 좌표(`…/children/<i>`)는 이제 패널을 가리킨다. 웹 에디터는 재연결 때 문서를 다시 읽고 옛 번들은 판 3 을 `unsupported-version` 으로 막는다. 재지 않았다(배포 판을 세워야 한다) · 낮음.

## 3. 실시간 두 사람 (실브라우저 · 탐침 `zones-live.test.ts` (2a)–(2d))

밥의 WS 올림을 1.5s 늦추고(`startWsDelay`) 밥이 키로 편집하는 사이 앨리스가 REST 로 먼저 커밋한다. 판마다 밥의 프레임이 `patch-error`(낡은 `baseSeq`) → 리베이스 → 다시 보냄 → `patch-ack` 를 지났다(밥이 받은 프레임 차례로 확인). 끝에 밥 · 앨리스의 구조 트리 줄 차례를 서버 문서의 전위(카탈로그 구역 차례) 차례와 견줬다.

| 판 | 밥(늦음) | 앨리스(먼저 커밋) | 서버 · 밥 · 앨리스 |
| --- | --- | --- | --- |
| (2a) | 카드 몸통 `n_b2` 지움 | 머리 오른쪽 맨 앞 · 몸통 맨 앞에 넣음 | `n_card n_h0 n_h1 n_b0 n_b1` 셋 다 같다 |
| (2b) | 머리 오른쪽 단추 `n_h1` 복제(Cmd+D) | 그 구역 맨 앞에 넣음 | 머리 오른쪽 `[n_hx, n_h1, 사본]` 셋 다 같다 |
| (2c) | 첫 패널 복제(탭 더함) | 둘째 패널 첫 내용 지움 | `n_tp1[n_t1] · 사본[사본 내용] · n_tp2[n_t3]` 셋 다 같다 |
| (2d) | 둘째 패널 안 `n_t3` 지움 | 맨 앞에 패널 더함 | `n_tp0[n_t0] · n_tp1[n_t1] · n_tp2[n_t2]` 셋 다 같다 |

4 판 · 화면 = 서버 4. 밥 탭의 콘솔에 «Failed to load resource: 404» 한 줄씩 — 지연 프록시 origin 에서 연 탭에만 섰다(앨리스 0 · 리소스 이름은 안 적었다).

## 4. 입구별 — 구역 안 노드 (탐침 `zone-entries.test.ts`)

카드(표지 1 · 머리 오른쪽 단추 — 표지 2 · `switchTab` → 몸통 안 탭의 둘째 패널 · `setVisible` → 카드 밖 노드 / 몸통 탭 패널 둘 / 바닥에 카드 — 그 머리 오른쪽에 상태 보임 단추) 하나 = 노드 9.

| 입구 | 꼴 같음 | 옛 id 재사용 | `switchTab` 이 사본 패널 | 밖 대상 | 표지 | 깊은 구역의 보임 | 결과 검증 오류 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 클립보드(봉투 → `prepareNodesForPaste` → `pasteOps`) | 예 | 0 | 예 | 남음 | 걷힘 | 남음 | 0 |
| 복제(`duplicateOps`) | 예 | 0 | 예 | 남음 | 걷힘 | 남음 | 0 |
| 모듈 저장 → 넣기(`moduleNodesForSave` → JSON 왕복 → `moduleInsertOps`) | 예 | 0 | 예 | 빠짐(묶음 밖 1) | 걷힘 | 걷힘 | 0 |
| 가져오기(`planPageImport`) | 예 | 0 | 예 | 새 id 로 따라감 | 남음 | 남음 | 0 — 코멘트 둘(깊은 구역 단추 · 패널)이 새 id 를 따라감 · 끊긴 0 |

구역 안 노드 복제는 같은 구역 바로 뒤(`add /root/children/0/zones/headEnd/1`). 서버의 모듈 저장 두 라우트는 같은 `moduleNodesForSave` 를 부른다. 스냅샷 복원은 id 를 안 바꾼다. MCP · CLI 는 `pageView` 의 `zoneLabel`(`packages/cli/src/commands/page-get.ts:102`)을 쓰고, `/llms.txt` 는 구역 · 경로 꼴 · «create with» 를 컴포넌트마다 싣는다(생성물 = 정의 — `apps/web/test/llms-txt.test.ts`). HTML 번들 · PPTX 는 구현 보고의 실물 판(번들 런타임 DOM · PPTX 문장)을 다시 재지 않았다.

## 5. 기본 내용 (탐침 `zone-initial.test.ts`)

`createNode`: 검색폼 `actions` = 초기화 · 검색, 입력폼 = 저장 · 취소, 탭 몸통 = 탭 패널 «탭 1» · «탭 2», 카드 · 목록 = 없음. 단추 둘을 지우면 `actions: []` 로 남고(다시 안 생김), 둘째 지움만 되돌리면 단추 하나(«검색»)가 돌아온다. 빈 단추 구역의 폼을 복제 · 붙이기 · 모듈 넣기 → 셋 다 단추 0. 단추 든 폼 복제 → 둘(두 벌 아님). `createNode` 를 부르는 자리는 팔레트 · 끌기 · 하단 판 넣기뿐이다(복사 길은 노드를 베낀다).

## 6. 테마

- **기본테마 1.3.0 바이트** — 이 세션의 api 탐침이 global-setup 으로 다시 지은 `system-themes/admin/dist/system-admin-1.3.0.wbtheme` 의 sha256 `dbd4e77a…a64` 가 `checksums.json` 의 `system-admin@1.3.0` 줄과 같다. 앞 판 다섯 줄은 main 과 글자가 같다.
- **1.2.1 에 고정한 프로젝트 × 판 3 문서 — 내용이 안 사라진다(높은 무게 아님).** 1.2.1 바이트를 재현했다 — `git archive main` 의 `system-themes/admin` · `packages/{theme-sdk,schema,renderer,themes}` · `tsconfig.base.json` 을 스크래치에 풀고 지금 kit 의 `buildTheme` 으로 지은 것의 sha256 이 `checksums.json` 의 `system-admin@1.2.1`(`3712cd2a…fc4`)과 같다. 그 판을 `theme_packages` 에 넣고 프로젝트를 1.2.1 · 1.3.0 에 하나씩 고정해 같은 판 3 문서(카드 구역 셋 · 검색폼/입력폼 단추 · 목록 머리 둘 · 탭 패널 둘)를 에디터로 열었다(탐침 `old-theme.test.ts`): 구역 노드 13 개 모두 보이고(상자 0 · 숨김 0) 자리가 두 판에서 가로 같음 · 세로 2–10px 차 · 콘솔 오류 0. 기본테마는 뷰가 없어(`VIEWS = {}` — main 도 같다) 뷰는 앱의 지금 SDK 기본 뷰다. 옛 CSS 는 구역 규칙만 모른다.
- **`wb-theme check` — «구역을 안 그린 뷰» 는 이름 붙은 구역에만 선다.** 카드 · 목록 · 검색폼에서 구역을 뺀 뷰는 오류로 섰다(케이스 `packages/theme-kit/test/check.test.ts` · 탐침 `kit-tabs.test.ts`: 목록 2 · 검색폼 1). **탭 뷰가 패널 내용(`items[i].content`)을 안 그려도 오류 0 이다** — 구역 전 SDK 꼴(`({ children }) => h(Root, null, children)` — 탭 머리만 그린다)과 `items` 의 `element` 만 그리는 뷰 둘 다 `errors: []`. `missingZones`(`packages/theme-kit/src/check.ts:169`)가 `pointer === '/children'` 을 건너뛰고, 안 그려진 패널 내용 노드는 «그 노드 자신이 안 그려졌으면 보지 않는다» 로 빠진다. 그런 테마로 그린 화면 · 번들에서 탭 내용이 조용히 사라진다(중간 · 올라간 남의 테마가 없어 지금 닿는 데이터는 없다 · 아래 «남은 것»).

## 7. 구현 보고의 혼자 죽는 변조 — 다시 돌림

| 변조 | 자리 | 돌린 것 | 결과 |
| --- | --- | --- | --- |
| V3 `accepts` 판정을 뗌 | `packages/schema/src/validate.ts` `if (zone.accepts === undefined) continue` → `… \|\| true` | `packages/schema/test/zones.test.ts` | 21 실행 · 1 사망 — «검증 — 구역 코드 셋 zone-type-not-allowed — 탭 몸통에 탭 패널 밖 · 경로는 그 자식» · `expected [] to deep equally contain [ 'zone-type-not-allowed', …(2) ]`. 구현 보고와 같은 케이스(구현 보고 때 20 실행 — 뒤 커밋 `4937987d` 가 케이스를 더했다) |
| A3 개인 모듈을 안 옮김 | `apps/api/src/db/migrations/0028-node-zones.ts` `['modules', 'personal_modules']` → `['modules']` | `apps/api/test/node-zones-migration.test.ts` | 6 실행 · 1 사망 — «0028 — 문서 판 2 → 3 판 3 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷» · `TypeError: Cannot read properties of undefined (reading 'actions')`(312 줄 — 옮기지 않은 개인 모듈에 `zones` 가 없다). 같은 케이스 · 실패는 단언이 아니라 그 값을 읽다 던진 것 |

둘 다 백업(경로 전체 이름) · `cmp` 복원 참 · 끝의 `git status` 에 소스 변경 0.

A3 판에서 하나 더 보였다 — «판 2 가 하나도 안 남는다 — …(옛 탭 · 옛 탭 번호 · **단추 없는 폼**)» 는 제목 · 주석(«`tabs` prop · `tab` 칸 · 단추 없는 폼 — 을 모든 표의 글자에서 센다»)과 달리 글자 `"tabs":` · `"tab":` · `"StateSwitch"` 만 센다. 개인 모듈의 단추 없는 검색폼이 판 2 꼴로 남은 A3 에서 이 케이스는 살았다(낮음 · 케이스가 제가 잰다고 적은 것보다 덜 잰다).

## 바꾼 것

이 보고 하나. 소스 · 케이스는 안 고쳤다(리뷰는 재서 적는다). 탐침 다섯은 스크래치에 두고 커밋하지 않았다 — `zone-lock.test.ts`(api 하네스) · `zone-rebase.test.ts` · `zone-entries.test.ts` · `zone-initial.test.ts` · `kit-tabs.test.ts`(unit) · `zones-live.test.ts` · `old-theme.test.ts`(editor-stack). 스크래치 설정은 `.ruler` 「목 · 계측 …」 의 꼴(`root` = 워크트리 · `test.dir` = 스크래치 · api 프로젝트의 `globalSetup` · `setupFiles`)이다.

## 남은 것

- **발견 1(검색폼 단추)** — 사용자에게 물을 일: 옮길 때 판 2 화면을 지킬지(«조회» · «초기화» 차례 · 첫 단추 주 단추 변형), 카탈로그 기본 내용(«초기화» · «검색»)으로 맞출지. 마이그레이션이 사용자 DB 에서 돌기 전에 정해야 한다(되돌릴 수 없는 `down`).
- **발견 2(`check` 의 탭)** — `missingZones` 가 `bodyHost: 'parent'` 인 자식(패널)의 몸통이 그려졌는지도 보게 하는 고침 후보(갤러리 탭 표본의 패널 내용 노드가 그 탭 요소 안에 섰는가). 고칠 트랙은 위 탐침의 두 뷰를 케이스로 세운다.
- **발견 3** — B 의 브리프에 «빈 구역 · 맵째 `add` 를 내는 넣기를 두 사람이 함께 낸 판» 을 실브라우저 판으로 넣는다. 고치는 길(맵째 `add` 대신 서버가 받는 다른 꼴 · 전제를 그 구역 키로 좁힘)은 서버가 받는 꼴과 함께 정한다.
- **발견 4 · 5 · 6** — 케이스 고침. 4 는 이 보고의 무작위 판(오라클 — 포인터 없이 (부모, 구역))을 `apps/web/test/store/` 로 옮기면 선다.
- HTML 번들 · PPTX 는 구현 보고의 실물 판을 다시 재지 않았다.

## 게이트

리뷰가 더한 커밋은 이 보고 하나(문서만 · 코드 글자 불변) — `README.md` 「트랙 게이트」 의 «문서 · 주석만» 줄: `pnpm typecheck` + 그 글을 읽는 케이스. 결과는 아래 줄.

## 지침

1. **`[data-tree-row]` 는 메뉴 트리 줄과 구조 트리 줄 둘 다다.** 틀린 것: 실브라우저 판에서 구조 트리 차례를 `[data-tree-row]` 로 읽으면 메뉴 · 페이지 줄(UUID id)이 앞에 섞인다 — 이 리뷰의 첫 판이 그렇게 «화면 ≠ 서버» 로 읽혔다. 자리: `.ruler/30-delegation.md`(「워커에게 맡길 때 — wirebound」) 의 «트리 줄이 다른 부모로 옮겨졌는지는 화면 차례로 재지 않는다» 문장 뒤. 넣을 문장: «**구조 트리 줄을 셀 때는 구조 트리 칸으로 좁힌다**(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row]`) — `[data-tree-row]` 는 메뉴 트리 줄에도 붙는다.»
2. **`startWsDelay` 로 연 탭은 `joined` 도 늦게 받는다.** 틀린 것: 탭을 열고 곧바로 키를 누르면 WS 가 아직 룸에 안 들어 편집이 REST 로 나가 지연 판이 안 선다(이 리뷰의 첫 판 — 밥의 지움이 앨리스보다 먼저 커밋돼 앨리스의 REST 가 409). 자리: 같은 파일 «방송에서 제 연결을 빼는 판을 잴 때는 `joined`(연결 id)를 받은 뒤에 보낸다» 문장 뒤. 넣을 문장: «**WS 를 늦춘 탭(`startWsDelay`)도 `joined` 를 받은 뒤에 누른다** — 그 전의 편집은 실시간 채널이 없어 REST 로 나가 늦춘 판을 안 잰다. 받은 프레임에서 `joined` 를 확인하고, 판이 섰는지는 `patch-error` → `patch-ack` 차례로 적는다.»
3. **옛 판 시스템 테마의 바이트는 그 판의 소스로 지금 kit 에서 다시 짓는다.** 틀린 것: 저장소에 얼린 옛 판은 0.1.0 하나(`apps/web/build-test/fixtures/`)라, 사용자 DB 에 든 다른 판(1.2.1 등)으로 재야 할 때 길이 적혀 있지 않다. 자리: `.ruler/20-verification.md`(「검증 — wirebound」) 의 «시스템 테마를 고르는 데이터 마이그레이션은 앞 판만 시딩된 DB 에서 잰다» 줄 뒤. 넣을 문장: «**옛 판 시스템 테마가 필요하면 그 판의 커밋에서 `system-themes/<이름>` · `packages/{theme-sdk,schema,renderer,themes}` · `tsconfig.base.json` 을 `git archive` 로 스크래치에 풀고**(패키지마다 `node_modules` 는 워크트리 것을 심링크, 테마의 `node_modules/@wirebound/*` 는 푼 패키지로) 지금 kit 의 `buildTheme` 으로 짓는다 — sha256 이 `checksums.json` 의 그 줄과 같아야 사용자 DB 의 판이다. 넣는 길은 `apps/web/build-test/theme-system.test.ts` 의 `theme_packages` 삽입이다.»

| 단계 | 결과 |
| --- | --- |
| `pnpm typecheck` | rc 0 (17:49:42 – 17:49:56 · node v24.21.0) |
| 이 보고를 읽는 케이스 | 0 (`git grep -n "rv-ns-report"` — 이 파일 밖 0 줄) |
| 숨은 글자(U+200B–200F · 2028–202F · 2066–2069 · 서로게이트 · 제어) | 0 |

탐침 실행(node v24.21.0): api 잠금 121 판 · 통과 121(변조 판 REST 35 · 사망 22) · 리베이스 1 케이스(4000 판) · 입구 5 · 기본 내용 1 · kit 1 · 실브라우저 5 + 1 — 건너뜀 0. 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 줄은 12:58:48 — 이 세션의 실행 시각(17:30 – 17:50)과 안 겹친다.
