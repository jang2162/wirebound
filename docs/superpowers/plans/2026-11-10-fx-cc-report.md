# FX-CC — 공통코드 리뷰 대응 보고

브랜치 `feat/common-codes` · 앞 머리 `1345aa2c`(리뷰 보고) · 리뷰 `docs/superpowers/plans/2026-11-10-rv-cc-report.md` · 설계 `docs/superpowers/specs/2026-11-10-common-codes-design.md` · 구현 보고 `docs/superpowers/plans/2026-11-10-cc-report.md`.

## 진행

| 항목 | 내용 | 커밋 | 상태 |
| --- | --- | --- | --- |
| N1(새 발견) | 내려받기 워커가 공통코드 표를 못 받는다 | `5a4ed50a` | 고침 |
| M2 | 사용처 목록의 노드 이름 | `2eb4f1df` | 고침 |
| M1 | 노드 이름이 표를 안 받는 자리 · 상호작용 문장 사슬 | `4e5c4eea` | 고침 |
| M3 | 묶인 노드의 «종류 바꾸기» | `6e506658` · `990f7491` | 고침 |
| M4 | 공통코드 화면의 지우기 | `8242918c` | 고침 |
| 문서 | 정본 설계서 · `apps/api/README.md` | `3f53156d` | 끝 |
| L1 – L4 | 이월 | — | 안 고침(아래 «남은 것») |

## 새 발견 — N1 (높음) 내려받기(라우트)가 공통코드 표를 워커로 안 넘긴다

- **무엇:** `GET …/export`(html · pptx)는 조립을 워커 스레드에 맡기고 행을 메시지로 쪼개 보낸다(`apps/api/src/services/export-worker.ts` 의 `feed`). 그 메시지에 `codes` 가 없어 워커의 `rows.codes` 는 늘 빈 표였다 — **내려받은 zip 에 `codes.html` 장이 없고, 페이지 데이터에 `codes` 가 없어 묶인 노드가 대체 글로 서고, PPTX 화면도 대체 글로 찍힌다.** 같은 스레드의 `exportProjectBundle`(구현 차수의 api 케이스가 부른 것)만 표를 실었다.
- **어떻게 찾았나:** M1 의 PPTX 판을 라우트로 내려받아 재다가 슬라이드의 이름이 대체 글이었다. 슬라이드 글자를 찍어 보고 워커의 행을 따라갔다.
- **재현:** `apps/api/test/export-routes.test.ts` «공통코드 표가 있으면 내려받은 zip 에 «공통코드» 장과 페이지 데이터의 표가 있다» — 고치기 전 zip 에 `codes.html` 이 없어 `expected '' to contain '<td>우수</td>'`.
- **고침:** 프로토콜에 `{ t: 'rows'; part: 'codes' }` 한 줄 · `feed` 가 테마 앞에 한 번 보내고 · 워커가 받는다.
- **새 장치가 연 길인가:** 그렇다 — `ExportRows.codes` 는 이 브랜치가 더한 칸이다. 병합 전에 잡혔다.

## 바꾼 것

- **M1** — `listInteractionSentences(document, codes?)` · `describeInteraction(document, source, interaction, codes?)` 가 표를 받는다(문장의 트리거 · 대상 · 탭 이름 셋이 `NodeIndex.codes` 하나를 읽는다 — 탭 바꾸기의 `"<이름>" 탭` 도 표의 이름이다). `pageView` 가 `input.codes` 를 문장에 넘긴다(`get_page` · `wireb page get` 의 `interactions`). 내보내기: `pageSentences(page, codes?)` · `commentEntries(page, comments, codes?)` · `ShellInput.codes` · `ExportPptxOptions.codes`(api 가 `rows.codes` 를 넘긴다). 웹: 구조 트리 줄(`nodeSummary(node, codes)` — 줄 글 · 줄 단추와 줄 행동의 접근 이름이 한 `rowLabel`) · 상호작용 탭(제목 · 대상 목록 · 규칙 문장 · 페이지 문장 목록) · 상태 지우기 상자(`nodeRowLabel(node, codes)`)가 `useProjectCodes().index` 를 읽는다.
- **M2** — `codeUsage(sources, group, item?, codes?)`. 서버 라우트(`GET …/codes/usage`)가 표를 읽어 넘긴다 — 공통코드 화면 · CLI `codes usage` · MCP `code_usage` 가 이 응답의 이름을 그대로 보인다. 끊긴 참조의 노드는 대체 글이다(`resolvedCodeProps` 가 `null`).
- **M3** — `changeKindOps(document, nodeId, toType, codes?)` 가 `code` 를 옮기거나 푼다(`apps/web/src/edit/change-kind.ts` 머리말 «공통코드에 묶인 노드»). `changeKindUnbindsCode(node, toType)` 가 풀었는지를 말하고, 입구(`panels/structure-toolbar.tsx` 의 `changeKind`)가 커밋 뒤 정보 통지 `CODE_UNBOUND_NOTICE`(«공통코드 묶음을 풀었습니다»)를 세운다.
- **M4** — `codes-screen.tsx` 의 `askDelete` 가 늘 `api.codeUsage` 를 한 번 묻고, 답의 노드 수가 0 이면 곧바로 지우고 아니면 그 목록으로 확인 상자를 세운다. 조회가 실패하면 지우지 않고 실패 줄을 세운다.
- **문서** — 정본 설계서 4.3 «공통코드 참조» 에 «노드를 이름으로 부르는 자리도 표의 이름을 쓴다», 속성 패널 «공통코드» 칸에 종류 바꾸기 규칙, 공통코드 화면의 지우기에 «누른 때 다시 물은 사용처로 정한다», 11.3 번들에 코멘트 줄 · 문장의 이름. `apps/api/README.md` 「공통코드」 에 사용처 응답의 이름.

## 결정

- **M1 — lint 문장은 그대로 대체 글이다**(브리프). `LintProject.codes` 가 있어 꿸 수는 있지만 끊긴 참조 문장(`broken-code-ref`)은 대체 글이 맞고, 나머지 둘(`missing-comment` · `ignored-template`)만 표의 이름으로 바꾸면 한 lint 출력 안에서 이름이 갈린다.
- **M1 — 번들 «공통코드» 장의 `codeUsage` 에는 표를 안 넘겼다** — 장은 노드 수만 싣고 이름을 안 읽는다(`bundle/index.ts` 의 그 줄에 주석).
- **M3 — «대표 글 ↔ 대표 글» 은 규칙을 안 뒀다.** 브리프의 방향은 `label ↔ label` 도 옮기라 했지만, 종류 바꾸기의 대상(`KIND_TYPES` 일곱) 가운데 대표 글 타입은 `Input` 하나라 그 쌍이 없다. 닿지 않는 갈래를 짓는 대신 케이스 «입력 조각 가운데 대표 글 타입은 Input 하나다» 가 둘째가 생기면 빨강으로 알린다.
- **M3 — «첫 값» 은 `code.selected[0]` 이다**(배열의 첫 값 — 브리프 그대로). 대체 글(`props.options`)은 기존 `firstPickOnly` 가 **선택지 차례의 첫 고름**을 남겨, 고른 차례와 표의 차례가 다르면(`selected: ['B', 'A']`) 남긴 값과 대체 글의 고름이 다른 항목이 된다. 그래서 표를 알면 줄인 참조를 표에서 다시 풀어 `options` 를 적는다(고르기 `pickCodeOps` 와 같은 풀기). 표를 모르면(조회 실패) 옛 대체 글의 첫 고름이 남는다 — 그리기는 `code.selected` 가 이기므로 표가 돌아오면 맞는다.
- **M3 — 푸는 판은 표로 푼 props 에서 옮긴다.** «그때 표의 이름을 새 타입의 prop 으로» 를 `resolvedCodeProps(node, codes)` 를 옮길 원본으로 쓰는 것으로 지었다 — 묶인 `Input`(값 «옛 가» · 표 «새 가») → `TextArea` 의 `value` 가 «새 가» 다. 끊긴 참조 · 표 없음이면 대체 글에서 옮긴다(풀기와 같다).
- **M3 — 전제(`test`)를 더하지 않았다.** 종류 바꾸기는 원래 전제 없이 필드마다 `replace` 한다(머리말 «op 은 노드째 바꾸지 않고 필드마다 낸다»). `remove …/code` 는 남이 먼저 풀었으면 경로가 없어 묶음째 버려진다 — 조용히 덮지 않는다. 겹친 편집 판은 안 쟀다(L1 과 한 뿌리 — «남은 것»).
- **M3 — 통지는 커밋을 낸 뒤 세운다**(`commitOps` 가 `true` 일 때). 서버가 그 편집을 거절하면 통지가 남는 판은 안 쟀다 — 실브라우저 판에서 `patch-error` 0 을 단언한다.
- **M4 — 확인 상자의 «N곳» 은 방금 물은 사용처의 노드 수다**(`hits` 의 `nodes` 합) — 화면의 사용 수(`counts`)는 연 때의 값이라 같은 상자에서 수와 목록이 갈린다. 그룹 · 항목 모두 그 수가 `usage-counts` 의 수와 같은 셈이다(노드마다 한 번).
- **M4 — 안 쓰이는 항목도 조회 한 번을 낸다.** 지우기마다 `GET …/codes/usage` 하나가 는다.
- **커밋의 Co-Authored-By** 는 공통 규칙(`common-w22.md`)의 줄을 썼다.

## 잰 값

- **고치기 전 빨강(재현):**
  - M1 — `pageView` 의 `interactions`: `packages/schema/test/codes-names.test.ts` «pageView 의 interactions 가 표의 이름을 쓴다» 가 사슬만 고친 판에서 `"옛 대기 버튼 클릭 시 …"` 로 죽었다. 나머지 자리는 고침을 하나씩 뗀 변조(아래 표 A · B · C)가 고치기 전 값이다.
  - M2 — `apps/api/test/codes-usage.test.ts` «노드 이름은 표의 이름이다 …»: `[['n_live', '옛 이름 사이 글자'], …]`(REST).
  - M3 — `apps/web/test/edit/change-kind-code.test.ts` 일곱 가운데 여섯 빨강: 넷이 `expected ['invalid-code-ref'] to deeply equal []`(리뷰 P1 의 네 판 그대로), 둘은 새 함수 없음. 실브라우저(고침의 `remove …/code` 를 뗀 판 KB1): 서버 문서가 `Select` 그대로(`{ id, type, props, code }` — 편집이 거절됐다).
  - M4 — jsdom: 상자가 안 서고 `['delete-item ORDER_STATUS DONE']` 이 나갔다. 실브라우저(LB1): `expected 'deleted' to be 'asked'` — 리뷰가 읽기로만 적은 판이 Chrome · 진짜 서버에서 선다.
  - N1 — 위 «새 발견».
- **실브라우저(Chrome · `editor-stack` · dev 번들 · `pnpm build` 뒤):** `apps/web/build-test/change-kind-code.test.ts` 1 / 1 — 셀렉트 → 여러 줄 입력: 서버 문서 `{ id, type: 'TextArea' }` · 통지 «공통코드 묶음을 풀었습니다»; 체크박스(고름 `['B', 'A']`) → 라디오 묶음: `code: { group: 'G', selected: ['B'] }` · `options: [{ label: '새 가' }, { label: '새 나', selected: true }]`; WS `patch-ack` 2 · `patch-error` 0. `apps/web/build-test/codes-screen.test.ts` 2 / 2 — 연 뒤 REST 로 묶은 항목의 «삭제»: 상자 «1곳에서 씁니다» · 서버에 항목이 남음.
- **jsdom:** `apps/web/test/codes/codes-names.test.tsx` 4 · `codes-screen.test.tsx` 9 · `panels/change-kind.test.tsx` 10 · `edit/change-kind-code.test.ts` 7 통과.
- **표 없이 부르는 자리(고친 뒤 셈 — `git grep -nP '\b(nodeDisplayName|nodeSummary|nodeRowLabel|describeNode)\(' -- ':!docs' ':!*.test.ts' ':!*.test.tsx'`):** 남은 것 셋 — `packages/schema/src/lint/codes.ts:20`(끊긴 참조 문장 — 대체 글이 맞다) · `lint/design.ts:185` · `:211`(lint 문장 — 위 «결정»). 문장 · 코멘트 · 사용처 사슬(`codeUsage` · `listInteractionSentences` · `describeInteraction` · `pageSentences` · `commentEntries`)을 같은 꼴로 세면 표 없이 부르는 자리는 `packages/exporter/src/bundle/index.ts` 의 장 하나다(노드 수만 쓴다).

## 혼자 죽는 변조

대본 `…/scratchpad/mut/run.py`(백업 이름 = 경로 전체 · 맞은 수 1 확인 · `cp` 복원 뒤 바이트 비교), 변조마다 그 케이스 파일만. 끝에 `git status` 깨끗.

| # | 변조 | 돌린 파일 | 실행 | 죽은 케이스 | 실패 값 |
| --- | --- | --- | --- | --- | --- |
| A1 | `codes-usage.ts` — `nodeDisplayName(node)` 로 | schema `codes-usage` · `codes-names` | 11 | «표를 받으면 표의 이름으로 부른다» 1 | `['n_btn', '옛 대기 버튼']` ≠ `'새 대기 버튼'` |
| A2 | `describe.ts` — 트리거 이름에서 표를 뗌 | schema `codes-names` | 6 | 문장 · `pageView` 2(한 사슬) | 문장이 «옛 대기 버튼 클릭 시 …» |
| A3 | 대상 이름에서 표를 뗌 | 같음 | 6 | 같은 2 | «… 옛 대기 사이 글자가 …» |
| A4 | 탭 이름을 `target.props` 로 | 같음 | 6 | 같은 2 | «… "옛 탭" 탭으로 …» |
| A5 | `page-view.ts` — 문장에 표를 안 넘김 | 같음 | 6 | «pageView 의 interactions …» 1 | 옛 문장 |
| A6 | `describeInteraction` 이 표를 버림 | 같음 | 6 | «표를 받으면 트리거 · 대상 · 탭 …» 1 | 옛 문장 |
| B1 | 번들 `commentEntries` 에 표를 안 넘김 | exporter `bundle-codes` · `pptx` | 45 | «코멘트 칸 · 상호작용 탭 …» 1 | 우측 칸에 «옛 이름» |
| B2 | 번들 `pageSentences` 에 표를 안 넘김 | 같음 | 45 | 같은 1 | 문장이 표의 이름이 아님 |
| B3 | PPTX `commentEntries` | 같음 | 45 | PPTX «표를 받으면 …» 1 | `'① 새 이름 버튼'` 없음 |
| B4 | PPTX `pageSentences` | 같음 | 45 | 같은 1 | 문장 없음 |
| C1 | `structure-tree.tsx` — `nodeSummary(node)` | web `codes-names` | 4 | «구조 트리 줄 — 묶인 노드의 줄 글 …» 1 | `'Button 옛 이름'` |
| C2 | 상호작용 탭 제목 | 같음 | 4 | «상호작용 탭 …» 1 | 탭에 «옛 이름» |
| C3 | 대상 목록 | 같음 | 4 | 같은 1 | 같음 |
| C4 | 규칙 문장 | 같음 | 4 | 같은 1 | 같음 |
| C5 | 페이지 문장 목록 | 같음 | 4 | 같은 1 | 같음 |
| C6 | 상태 지우기 상자 | 같음 | 4 | «상태 지우기 상자 …» 1 | `['Button 옛 이름']` |
| D1 | `routes/codes.ts` — 표를 안 넘김 | api `codes-usage` | 3 | «노드 이름은 표의 이름이다 …» 1 | `'옛 이름 사이 글자'` |
| D2 | `export-pptx.ts` 의 `codes: rows.codes` 를 뗌 | api `export-pptx-screens` · `export-routes` | 33 | «공통코드 — 슬라이드의 노드 이름» 1 | `'① 새 이름 버튼'` 없음 |
| D3 | `feed` 의 `codes` 메시지를 뗌(N1 고치기 전) | 같음 | 33 | 위 + «… zip 에 «공통코드» 장 …» 2(워커로 가는 표 하나를 두 산출물이 읽는다) | `expected '' to contain '<td>우수</td>'` |
| D4 | 워커가 `codes` 메시지를 버림 | 같음 | 33 | 같은 2 | 같음 |
| K1 | `change-kind.ts` — `remove …/code` 를 뗌 | web `change-kind-code` · `panels/change-kind` | 17 | 4(푸는 판 넷 — 한 연산을 넷이 읽는다) | `['invalid-code-ref']` |
| K2 | 고름 줄이기 `replace …/code` 를 뗌 | 같음 | 17 | «여럿 고른 체크 묶음 → 하나 고르는 타입 …» 1 | `['invalid-code-ref']` |
| K3 | 푸는 판의 원본을 대체 글로 | 같음 | 17 | «풀 때 그때 표의 이름을 …» 1 | `value` 가 «옛 가» |
| K4 | 줄인 고름의 대체 글 다시 풀기를 뗌 | 같음 | 17 | «여럿 고른 체크 묶음 …» 1 | `options` 가 옛 대체 글 |
| K5 | 같은 꼴도 늘 푼다 | 같음 | 17 | 3(옮기는 판 셋) | `code` 가 `undefined` |
| K6 | 통지를 뗌 | 같음 | 17 | «못 받는 종류로 바꾸면 … 한 줄을 알린다» 1 | `expected null to be '공통코드 묶음을 풀었습니다'` |
| K7 | 묶인 노드면 늘 통지 | 같음 | 17 | «같은 묶음 꼴로 바꾸면 … 알리지 않는다» 1 | `expected '공통코드 묶음을 풀었습니다' to be null` |
| KB1 | K1 을 실브라우저로 | `build-test/change-kind-code` | 1 | 1 | 서버 문서가 `Select` 그대로(거절) |
| KB2 | K2 를 실브라우저로 | 같음 | 1 | 1 | 서버 문서가 `CheckboxGroup` 그대로(거절) |
| KB3 | 도구모음이 표를 안 넘김 | 같음 | 1 | 1 | `options` 가 옛 대체 글 |
| L1 | `askDelete` — 화면의 사용 수 0 이면 곧바로 지움(고치기 전) | web `codes-screen` | 9 | 2(«연 뒤 다른 길로 묶인 …» · «조회가 실패하면 …» — 둘 다 «묻지 않고 지움» 이 그 판이다) | `['delete-item ORDER_STATUS DONE']` ≠ `[]` |
| L2 | 조회 실패에도 지움 | 같음 | 9 | «사용처 조회가 실패하면 …» 1 | 같음 |
| L3 | 상자의 수를 화면의 사용 수로 | 같음 | 9 | «연 뒤 다른 길로 묶인 …» 1 | «0곳에서 …» 에 «2곳에서 씁니다» 없음 |
| L4 | 안 쓰여도 늘 묻는다 | 같음 | 9 | «안 쓰이는 항목은 묻지 않고 지운다» 1 | `[]` ≠ `['delete-item …']` |
| LB1 | L1 을 실브라우저로 | `build-test/codes-screen` | 2 | «연 뒤 다른 길로 묶인 항목의 «삭제» …» 1 | `expected 'deleted' to be 'asked'` |

혼자 안 죽는 것: A2 – A4(문장 사슬 하나를 `listInteractionSentences` 케이스와 `pageView` 케이스가 함께 읽는다 — `pageView` 쪽은 A5 가 혼자 죽인다) · D3 – D4(워커로 가는 표 하나) · K1 · K5(연산 하나를 여러 꼴이 읽는다) · L1.

## 게이트

체인 하나(`nohup nice -n 10 caffeinate -i` · 슬롯 `gate-slots/fx-cc` — 띄울 때 슬롯 0 · 끝나고 지움), 머리 `3f53156d`(고침 넷 · N1 · 문서 뒤). node v24.21.0 · load 14:58 3.26 → `pnpm test` 끝 15:09 3.42 → `test:browser` 끝 15:26 9.22. 잠듦: `pmset -g log` 의 마지막 Sleep 은 10:40 — 게이트(14:58 – 15:26) 안에 없음.

| 단계 | rc | 파일 | 실행 | 통과 | 실패 | 건너뜀 |
| --- | --- | --- | --- | --- | --- | --- |
| `pnpm typecheck` · `pnpm build` | 0 · 0 | — | — | — | — | — |
| `pnpm test --maxWorkers=25%` | 0 | 615(unit 183 · api 190 · web 242) | 9389 | 9386 | 0 | 3 |
| `pnpm test:build:serial` | 0 | 18 | 179 | 178 | 0 | 1 |
| `pnpm test:browser` | 0 | 125 | 771 | 769 | 0 | 2 |
| `pnpm fmt:check` · `pnpm lint` | 0 · 0 | — | — | — | — | — (lint 경고는 앞부터 있던 줄) |

전량이 첫 판에 초록이라 고친 것이 없다 — 한 판 더 돌 까닭이 없었다. 리뷰 게이트와의 차: 파일 +3(schema `codes-names` · web `codes-names` · `change-kind-code`) · 실브라우저 파일 +1(`change-kind-code`), 실행 `pnpm test` +27 · 실브라우저 +2.

워크트리 뿌리의 추적 안 되는 `.build/` 는 Swift Package Manager 의 캐시 디렉터리였다(`CACHEDIR.TAG` · `.buildSystem_debug` 둘뿐 — 11:45 에 생김 · 이 저장소의 도구가 만든 것이 아니다. 폴더를 연 편집기의 Swift 언어 서버로 보인다). 지웠다.

## 남은 것

- **L1 (낮음) — 묶기 · 고르기 · 풀기의 전제(노드 값 `test`)가 자손까지 덮는다.** `apps/web/src/edit/code-ops.ts` 의 `premise` 가 `structuredClone(node)` 통째(자식 포함)를 `test` 한다 — `TabPanel` 은 탭 안의 남의 편집에도 버려진다. 겹친 편집 판(남이 같은 노드의 다른 칸을 고침 · 옮김 · 지움 × 묶기 · 고르기 · 풀기)을 재는 케이스가 없다. 실브라우저 `startWsDelay` 판으로 세울 자리다. **M3 의 종류 바꾸기 × 남의 풀기 · 묶기 겹침도 같은 자리에서 잰다**(이번에 안 쟀다).
- **L2 (낮음) — `ViewItem.props` 는 표로 안 푼다.** `packages/renderer/src/render.tsx` 의 `itemOf` 가 자식 props 를 `rawProps` 로 파싱한다 — 부모 뷰가 묶인 자식의 대표 글을 `items[i].props` 로 읽으면 대체 글이다. 지금 SDK 기본 뷰 · 기본테마는 탭 머리를 `item.element` 로 그려 화면엔 안 나온다. 테마 계약의 빈칸이다.
- **L3 (낮음) — 시연의 `setProp` 이 묶인 prop 을 덮어도 표가 이긴다.** `render.tsx` 의 `codeProps` 가 상호작용 겹layer 뒤에 표의 이름을 덮는다. 묶인 `Button.label` 을 `setProp` 으로 바꾸는 상호작용은 뷰 모드 · 번들에서 아무 일도 안 보인다. 설계가 정하지 않은 자리다.
- **L4 (낮음) — 패널의 «이 코드를 쓰는 곳 N» 은 막 묶은 편집보다 먼저 물을 수 있다.** `panels/code-binding.tsx` 의 `UsageLink` 는 그 칸이 설 때 한 번 `codeUsageCounts` 를 묻는다 — 묶기 편집(WS)의 커밋보다 조회가 먼저 닿으면 N − 1 을 보이고 다시 고를 때까지 그대로다. 안 쟀다.
- **M3 의 통지가 거절된 편집 뒤에 남는 판**은 안 쟀다(서버가 그 묶음을 다른 까닭으로 거절 — 잠금 · 리베이스 버림). 통지는 커밋을 낸 직후에 선다.
- **공통코드 화면의 표 «사용 수» 칸 · 그룹 목록의 «사용 N»** 은 여전히 연 때의 값이다(룸에 안 든다 — 구현 보고 «결정»). 지우기만 다시 묻는다.
- 구현 보고 «남은 것» 의 복원 확인 상자 조건문(스냅샷 목록에 payload 판이 없다)은 그대로다. 상호작용 문장의 이름은 이번에 닫았다.

## 지침

1. **무엇이 비었나:** 내보내기 행(`ExportRows`)에 칸을 더한 트랙이 워커로 가는 메시지(`export-worker-protocol.ts` 의 `ToWorker` · `export-worker.ts` 의 `feed` · `export-worker-thread.ts`)를 안 고쳐, 라우트 내려받기만 그 칸을 잃었다(N1). 같은 스레드 함수(`exportProjectBundle` · `exportProjectPptx`)를 부르는 케이스는 초록이다. **어디:** `.ruler/wirebound/` 의 워커 위임 덧붙임 «판정 · 풀이를 바꾸는 트랙은 그 판정을 «같다» 고 적은 사본을 함께 센다» 곁(또는 검증 덧붙임의 번들 줄들 곁). **넣을 문장:** «**`ExportRows` 에 칸을 더하면 워커로 가는 메시지 셋(`apps/api/src/services/export-worker-protocol.ts` 의 `ToWorker` · `export-worker.ts` 의 `feed` · `export-worker-thread.ts` 의 받는 자리)을 함께 고치고, 그 칸을 라우트로 내려받은 zip 에서 잰다**(`GET …/export` — `apps/api/test/export-routes.test.ts`). 같은 스레드의 `exportProjectBundle` 만 부르는 케이스는 워커가 그 칸을 빈 값으로 조립해도 초록이다(공통코드 표가 내려받은 번들 · PPTX 에서 통째로 빠졌다 — `docs/superpowers/plans/2026-11-10-fx-cc-report.md` N1).»
2. **무엇이 비었나:** 실브라우저 케이스에서 `import type { Page } from 'playwright'` 는 vitest 로는 초록이고 `pnpm typecheck` 만 `TS2307` 로 잡는다(타입 전용 import 라 실행에 안 남는다). **어디:** `.ruler/wirebound/` 워커 위임 덧붙임 «실브라우저 판은 `apps/web/build-test/` 에 케이스로 잠근다» 단락. **넣을 문장:** «**실브라우저 케이스의 playwright 타입은 `playwright-core` 에서 가져온다**(`import type { Page } from 'playwright-core'`) — `playwright` 는 타입 검사에서만 «모듈 없음» 이고 vitest 는 타입 전용 import 를 지워 초록이다. 새 케이스 파일을 더한 커밋에서 `pnpm typecheck` 를 돈다.»
3. **무엇이 비었나:** jsdom 하네스(`renderEditor` · `openPage`)는 `apiOverrides` 의 함수를 **여는 때** 쥔다 — 연 뒤 `board.api.x = …` 로 갈아 끼운 스텁은 안 불려, «조회 실패 판» 이 원래 스텁의 답으로 돌았다(M4 의 실패 케이스가 처음에 다른 까닭으로 빨강이었다). **어디:** 같은 덧붙임의 jsdom 단락(«jsdom 값은 실브라우저 값이 아니다») 곁. **넣을 문장:** «**`apiOverrides` 의 스텁은 여는 때의 함수가 쥐인다 — 연 뒤에 답을 바꾸려면 함수를 갈아 끼우지 말고 스텁이 읽는 변수(깃발 · 큐)를 바꾼다**(`apps/web/test/codes/codes-screen.test.tsx` «사용처 조회가 실패하면 …» 의 `failing`).»
