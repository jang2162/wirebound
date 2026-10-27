# RB-POB 보고 — 파일첨부 · 반복 행 표 트랙을 main(PO-A 병합) 위로 옮김

브리프 `.worktrees/.coord/brief-rb-pob.md` · 워크트리 `feat-attach`(Postgres 5504 · api 3104) · Node v24.21.0. 옮기는 방법은 **main 을 합침**(rebase 는 16 커밋마다 같은
겹침을 다시 풀어야 해서 골랐다). 결과 `feat/attach` 는 main(`e606ded2`)의 후손이다 — 병합 커밋 `7b76b388`(부모 `0d62ae30` · `b0ac90bb`, PO-A 병합) 뒤
`bd724b53`(main 이 그 사이 더한 문서 커밋 `e606ded2` 하나 — `.ruler/*` · 로드맵, 충돌 없음 · `pnpm exec ruler apply`).

## 충돌을 푼 파일

git 이 멈춘 열 파일. 모두 **둘 다 지켰다** — 한쪽을 버린 덩이는 없다(값을 다시 지은 셋은 아래 «다시 지은 값»).

| 파일 | 덩이 | A(팝업)의 무엇 | B(파일첨부 · 프리셋)의 무엇 | 푼 꼴 |
| --- | --- | --- | --- | --- |
| `apps/web/src/edit/create-node.ts` | 1(import) | `cloneJsonValue` · `Interaction`(구역 `initial` 의 상호작용 베끼기) | `presetOf` · `templateNode`(프리셋 갈래) | import 합집합 — 본문은 git 이 이미 둘을 나란히 합쳤다(프리셋 갈래가 먼저 · 구역 씨앗에 `interactions` 줄) |
| `apps/web/test/edit/create-node.test.ts` | 1 | «서버가 짓는 새 팝업 페이지의 뿌리는 …» | «프리셋 — 템플릿이 내용 전부다 …» · «프리셋 — 그 타입에 없는 키면 null …» | 셋 다(B 둘 뒤에 A 하나) |
| `packages/schema/src/component/catalog/index.ts` | 1(import) | `InteractionSchema` · `isTargetlessAction`(씨앗 상호작용 검사) | `BODY_ZONE` · `NodeTemplate`(`assertPresets`) | import 합집합 · 등록 목록은 git 이 합쳤다(`PopupDef` · `FileAttachDef` — 37) |
| `packages/schema/test/zones-census.test.ts` | 1(머리말) | 정본 갈래에 `new-page.ts` | 정본 갈래에 `preset.ts` · `assertPresets` | 두 이름 다 — 수 표(`DIRECT_READS`)는 git 이 합쳤고 케이스 초록 |
| `packages/theme-kit/src/check.ts` | 4 | `source` 의 `'popup'` · `popupProblems` 부르기 · `popupProblems` · `popupDirectParts` · `accessibleName` | `source` 의 `'file'` · `fileAttachProblems` 부르기 · `fileAttachProblems` · `filesOf` | 둘 다 — 함수 넷은 글자 그대로 들었는지 파이썬으로 견줬다(5/5). 처음 푼 판에서 A 의 머리말 `/**` 가 덩이 밖이라 빠져 `tsc` 가 죽었다 — 되살렸다 |
| `packages/mcp/skill/SKILL.md` | 1 | «팝업은 페이지의 종류다» 문단 | «반복 행 입력 표» · «파일첨부는 `FileAttach` 다» 두 문단 | B 둘 뒤에 A 하나 |
| `packages/mcp/test/skill.test.ts` | 1 | 팝업의 꼴 낱말 열둘 | 파일첨부 · 반복 행 표의 꼴 낱말 여덟 | 둘 다 |
| `packages/theme-kit/template/SKILL.md` | 2 | 카탈로그 목록에 `Popup` · `Popup` 뷰 계약 절 | 목록에 `FileAttach` · `FileAttach` 뷰 계약 절 | 둘 다 · 수는 **37 종** |
| `packages/exporter/test/bundle-stateless-bytes.test.ts` | 3 | 머리말 «팝업을 들이며 …» · `views.css` `30ef00ae…` | 머리말 «파일첨부를 들이며 …» · `views.css` `a95f850c…` | 머리말 둘 다 + 합친 판 한 줄 · `views.css` 는 **합친 판에서 다시 지은 `aa61efa7d7e3d912`**(`WB_PRINT_DIGEST=1`) — 다른 해시(«넓은 표본» `index.html` 의 B 값 · `shell.css` 의 A 값)는 git 이 합친 값 그대로 초록 |
| `system-themes/admin/checksums.json` | 1 | `system-admin@1.8.0` = `3d36b429…9183` | 같은 줄 = `85d4e84d…b251` | **둘 다 아님** — 합친 판 `pnpm build` 의 `d5e4a1e6c0ef8f676a6ac8134afb83ec36fc436976291c4b77b2cb00bb29baad`(두 번 빌드해 같은 값) |

git 이 멈추지 않았지만 합친 판에서 깨진 자리(의미 겹침):

| 파일 | 무엇 | 고침 |
| --- | --- | --- |
| `packages/theme-kit/test/check.test.ts` | 같은 `describe('checkTheme')` 안에 A 의 `const [EMPTY, SEARCH, FORM]`(팝업 표본) · B 의 `const EMPTY`(빈 목록 파일첨부 표본) — `tsc` TS2451 | B 쪽을 `EMPTY_LIST` 로(두 자리) |
| `packages/schema/test/component/catalog.test.ts` | 두 트랙 다 36 을 적었다(main + 자기) | 37 · 케이스 이름 «37종을 등록한다» |
| `packages/theme-kit/build-test/dev.test.ts` | `kinds` 36 | 37 |

## 다시 잰 ① ~ ⑥(구현 보고 «PO-A 와 겹친 파일 · A 위로 옮길 때 다시 잴 것»)

| | 무엇 | 값 |
| --- | --- | --- |
| ① | 카탈로그 종 수 | `listComponents()` 37(`catalog.test.ts` 초록) · `dev.test.ts` `kinds` — 아래 «게이트» |
| ② | `checksums.json` 1.8.0 | `d5e4a1e6…baad`(위) · `admin.test.ts` 초록 |
| ③ | `apps/web/public/llms.txt` | `pnpm vitest run apps/web/test/llms-txt.test.ts -u` 뒤 diff 0 — git 이 합친 생성물이 생성기 출력과 같았다(`-u` 전에도 2/2 초록). `Popup` · `closeModal` · `FileAttach` · «Editor preset `repeatRows`» 줄이 다 있다 |
| ④ | 갤러리 · `wb-theme check` · `shots` | 아래 |
| ⑤ | `.sample-card` 수 | 아래 |
| ⑥ | 실브라우저 `palette-preset` · `file-attach-narrow` | 아래 |

**마이그레이션.** 테스트 DB(`wirebound_test` · 5504)의 `kysely_migration` 은 합치기 전 32 줄(마지막 `0032-list-data-grid`). 합친 판에서
`apps/api/test/modal-popup-migration.test.ts` · `popup-pages.test.ts` 를 돌리자(13/13) global-setup 이 올려 **33 줄 · 마지막 `0033-modal-popup`** — 손댄 기록 없음.
개발 DB `wb_attach` 는 32 줄 그대로다(이 차수에 api dev 를 안 띄웠다 — 실브라우저 판은 `editor-stack` 의 일회용 DB).

## 겹침 판 — 팝업 × 파일첨부 · 반복 행 표

새 실브라우저 케이스 `apps/web/build-test/popup-attach.test.ts`(4 케이스). 프로젝트 하나 — 여는 화면 «목록» · 팝업 «작은»(small) · «보통»(medium) ·
«넓은»(large) · 빈 팝업 «빈». 팝업 몸통은 2열 폼 표(값 칸에 파일첨부 · 이름 입력) · 파일첨부(단추 셋) · 반복 행 표(프리셋 꼴 + 날짜 열 · 행 둘)다.
파일 줄은 «통장사본.PDF» · 하이픈 없는 긴 영문 이름 · 띄어 쓰지 않은 한글 이름(`file-attach-narrow.test.ts` 와 같은 표본). 기본테마 1.8.0.

**여는 단추 셋이 다 B 의 자리다**(⑤의 실물 판) — «작은» 은 파일첨부 «단추» 구역의 단추(대상 ` page: 관리자 / 작은 ` — 공백 낀 글자), «보통» 은
반복 행 표 «삭제» 열의 **둘째 줄(사본 `data-wb-copy-of`)** 단추(대상 `관리자/보통` — 접두 없음), «넓은» 은 그리드 머리 오른쪽 단추. 뷰 모드
(`canvas-popups.tsx`)와 번들 런타임이 셋 다 열었다(덮개가 서야 판이 선다 — 판 아홉 다 섰다).

상자 안 잰 값(글자 노드 `Range.getClientRects()` · 요소 상자 — 그리드는 제 스크롤 상자 안을 빼고 그 상자를 잰다):

| 판 | 상자 폭 · 설 자리 | 상자 밖 글자 · 요소 | 문서 | 이름 칸 줄 수(값 칸 · 몸통) | 크기 칸 | 이름 칸 글자 − 칸 오른끝 | 그리드(칸 안 · 스크롤 상자 · 조각 밖 · 머리 칸 줄) | 폼 표 줄 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 뷰 모드(창 1440 · iframe 1280) 작은 | 480 · 788 | 0 · 0 | 1280/1280 | [1,3,3] · [1,2,2] | 1 | −11 · −12 | 안 · 0 · 0/8 · [1,1,1,1] | 2 |
| 뷰 모드 보통 | 720 · 788 | 0 · 0 | 1280/1280 | [1,2,1] · [1,1,1] | 1 | −11 · −129 | 같음 | 2 |
| 뷰 모드 넓은 | **788** · 788 | 0 · 0 | 1280/1280 | **[1,6,5]** · [1,1,1] | 1 | −9 · −187 | 같음 | **1** |
| 번들 화면 모드 1280 작은 | 480 · 1232 | 0 · 0 | 1280/1280 | [1,3,3] · [1,2,2] | 1 | −11 · −12 | 같음 | 2 |
| 번들 1280 보통 | 720 · 1232 | 0 · 0 | 1280/1280 | [1,2,1] · [1,1,1] | 1 | −11 · −129 | 같음 | 2 |
| 번들 1280 넓은 | 960 · 1232 | 0 · 0 | 1280/1280 | [1,3,2] · [1,1,1] | 1 | −10 · −332 | 같음 | 1 |
| 번들 390 작은 · 보통 · 넓은 | 342 · 342 | 0 · 0 | 390/390 | [1,3,3] · [1,3,3] | 1 | −13 · −9 | 같음 | 2 |

«설 자리» 는 그 겹(`[data-wb-popup-level]`)의 폭 − 좌우 여백 48 이다 — 뷰 모드의 겹은 보이는 캔버스 칸(836)에 맞춘다(`canvas-popups.tsx`), 번들은 창이다.
덮개 틀(`[data-wb-popup-frame]`)은 상자에 맞춰 줄어 폭이 늘 상자와 같다(처음 지은 판은 그 틀과 견줘 폭 단언이 아무것도 안 쟀다 — 겹으로 바꿨다).

- **넘침 0 · 꺾인 줄은 크기 칸 1 · 머리 칸 1 — 아홉 판 전부.** 파일 이름은 칸 안에서 꺾인다(SDK `LONG_WORD_CSS` 의 `FileAttach`).
- **결함 아님 · 값으로 적는 것 하나 — 뷰 모드의 넓은 팝업.** 캔버스 칸이 좁으면 상자가 960 대신 788 로 준다. 폼 표의 접기는 상자 폭이 아니라
  크기 표지(`data-wb-size`)와 창 폭을 보므로 넓은 팝업은 788 에서도 2열이고, 그 값 칸의 파일첨부 긴 이름이 6 · 5 줄로 꺾인다(넘치지는 않는다).
  번들 1280 의 같은 팝업은 3 · 2 줄이다. 설계 «6» 의 «팝업 크기가 접기 문턱» 그대로의 결과이고, 뷰 모드에서만 칸 폭이 끼어든다(PO-A 의 덮개 층 설계).
- **내보내기 미리보기**(`GET …/export/preview?format=html`) — `brokenLinks` `[]` · `themeWarning` 없음 · `themeId` `system-admin@1.8.0`. 여는 단추
  셋이 파일첨부 · 그리드 구역 · 사본 줄 안이고 대상 글자가 공백 · 접두 없음을 섞었는데도 «못 이음» 이 없다(FX-POA 의 `pageTargetKey` 를 지난다).

**팔레트 «넣기» — 팝업 페이지**(빈 팝업 · 바닥 기본 내용 «취소» · «저장»): 뿌리 줄을 고른 «반복 행 표» → 몸통 끝, 뿌리 줄을 고른 «파일첨부» → 몸통 끝,
«바닥» 구역 줄을 고른 «반복 행 표» → 바닥 끝. 서버 문서 몸통 `[DataGrid, FileAttach]` · 바닥 `[Button 취소, Button 저장, DataGrid]` · 두 그리드 다
프리셋 꼴(머리 오른쪽 «추가» · 열 셋). 캔버스에서 몸통의 둘은 `body` 조각 안 · 바닥의 표는 `body` 밖(P4 — 덮개 층이 몸통만 굴린다). «바닥» 구역은
받는 타입을 정하지 않아(`PopupDef`) 표도 받는다 — 막을 근거가 카탈로그에 없어 값만 적는다.

### ⑤ FX-POA 의 대상 풀이와 B

번들(`hrefsFor` · `popupsFor` → `exporter/src/nodes.ts` 의 `eachNode`) · lint(`walkNodes`) · 미리보기(`referencedTargets` → `walkNodes`)는 셋 다
`childLists` 로 몸통 · 구역을 다 돈다 — 파일첨부 «단추» 구역 · 그리드 머리 오른쪽 · 셀 틀(GridColumn 몸통)의 단추가 몸통의 단추와 같은 풀이
(`pageTargetKey`)를 지난다. 반복 행의 사본 줄은 문서에 없는 노드라 표에 안 들고, 런타임이 원본 노드의 상호작용으로 돈다(사본을 누르면 연다 — 아래).
케이스 둘을 더했다:

- `packages/exporter/test/bundle-popups.test.tsx` «대상 글자의 풀이 — 파일첨부 · 반복 행 표 안 단추» — `popups` 키 ` page: 첨부 ` · `첨부 `(파일첨부
  단추 · 셀 틀 단추), 파일첨부 단추 · «삭제» 원본 · **사본 줄** 셋 다 한 겹을 연다, 머리 오른쪽 «이동»(` 상세 `)과 실린 팝업 안 파일첨부 단추의
  «이동»(`page: 상세`)이 `상세.html` 로 옮긴다.
- `packages/schema/test/lint-design.test.ts` «파일첨부 · 반복 행 표 안 단추의 대상도 같은 열쇠로 푼다» — 셋 다 종류 경고(`modal-target-not-popup` 둘 ·
  `navigate-to-popup` 하나)가 그 경로로 선다(못 풀었으면 `page-target-missing`).

### 혼자 죽는 변조(새 케이스 여섯)

변조 스크립트 `S/mut/run.py`(백업 이름은 경로 전체 · 맞은 수 1 · 복원 뒤 `filecmp` 바이트 비교 · 빌드를 거치는 변조는 복원 뒤 다시 `pnpm build`).
돌린 것은 그 케이스 파일 하나다. `S` = 이 세션의 스크래치(재부팅에 지워진다 — 값은 이 표가 전부다).

| id | 자리 | 바꿈 | 시각 | load | 실행 · 실패 | 죽은 케이스 «실패 값» |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | `packages/schema/src/lint/design.ts:172` | 몸통 밖 구역 노드의 상호작용을 건너뜀 | 13:01:28 ~ 13:01:30 | 8.5 | 48 · 1 | «파일첨부 · 반복 행 표 안 단추의 대상도 …» 경고 셋 → `navigate-to-popup` 하나(셀 틀 것만) |
| B1 | `packages/exporter/src/nodes.ts:22` | `eachNode` 가 몸통 줄만 돈다 | 13:01:30 ~ 13:01:31 | 8.5 | 14 · 1 | «구역 · 셀 틀 · 사본 줄의 «팝업 열기» …» `popups` 키 `['첨부 ']`(파일첨부 단추의 ` page: 첨부 ` 가 빠짐) |
| P3 | `apps/api/src/services/export-bundle.ts:187` | `brokenLinks` 가 글자 그대로 견줌 | 13:07:27 ~ 13:07:43 | 10.3 | 4 · 1 | «… 미리보기는 끊긴 링크 0 …» `brokenLinks` 에 `page: 관리자 / 작은` · `관리자/보통` `missing` |
| P4 | `apps/web/src/palette/palette-add.ts:71` | 구역 줄 «넣기» 가 그 구역 대신 몸통으로 | 13:07:43 ~ 13:07:59 | 10.6 | 4 · 1 | «팝업 페이지의 팔레트 «넣기» …» 바닥 표가 몸통 셋째로(`body` `[DataGrid, FileAttach, DataGrid]`) |
| P1 | `packages/theme-sdk/src/default-views/index.ts:106` | `LONG_WORD_CSS` 에서 `FileAttach` 뺌(빌드) | 13:08:05 ~ 13:08:25 | 12.8 | 4 · 1 | «덮개 위 상자 안 — …» 상자 밖 요소 — 파일첨부 `list` · `thead` · `th` · `file` · `fileName` · `fileSize` …(긴 이름이 안 꺾여 목록 표가 상자를 넘는다) |
| P2 | `packages/theme-sdk/src/default-views/structure.tsx:172` | 작은 팝업 480 → 500px(빌드) | 13:08:31 ~ 13:08:52 | 13.4 | 4 · 1 | «팝업 크기가 접기 문턱이다 — …» 작은 팝업 폭 `480` → `500`(뷰 모드 · 번들 1280) |

### 기본테마 1.7.0 고정 프로젝트 — 팝업 안 파일첨부 하나

B 기준 판 `3c0c3644`(main 1.7.0 + 설계 문서)를 `git archive` 로 풀어(node_modules 는 워크트리 것을 이음) `pnpm build` → `system-admin-1.7.0.wbtheme`
sha256 `b9eba8fe…74ab` = `checksums.json` 의 1.7.0 줄(사용자 DB 의 판). 합친 판의 `editor-stack` 에 `theme_packages` 로 넣고, 목록(«열기» → `page:관리자/첨부`) ·
팝업 «첨부»(파일첨부 — 파일 둘 · «파일추가») 프로젝트를 1.7.0 에 고정했다(스크래치 탐침 — main 빌드 산출물이 필요해 케이스로 안 남김). 13:14.

| 무엇 | 값 |
| --- | --- |
| 바인딩 PUT | 200 |
| 내보내기 미리보기 html · pptx | `themeId` `system-admin@1.7.0` · **`themeWarning` `null`**(둘 다) · `errors` `[]` · `brokenLinks` `[]` · `screenFailures` `[]` |
| 번들 덮개 위(창 1280) | 상자 720 · `[data-wb-error]` 0 · 파일첨부 조각 `list` 1 · `file` 2 · `limit` 1 · `actions` 1(SDK 1.8.0 기본 뷰) · 상자 밖 요소 0 · `data-wb-failed` 없음 |
| 에디터 캔버스(팝업 페이지) | `[data-wb-error]` 0 · 파일 줄 2 · 배너 없음 |

## 수의 등식(`vitest list` — 실행 없이 · 건너뜀은 안 센다)

판마다 `git archive` 로 풀어(node_modules 는 워크트리 것을 이음 · `apps/api/.env` 심링크 — 5504) `pnpm build` 뒤 프로젝트마다 `vitest list --json`. api 는
`globalSetup` 을 뗀 설정, 실브라우저는 `vitest.browser.config.ts`. 판: B 기준 `3c0c3644` · B 머리 `0d62ae30` · main `e606ded2` · 합친 판 `47c479d1`. 케이스
열쇠는 (파일 · 이름) — 합친 판 = main ∪ (B 가 더한 것) − (B 가 뺀 것) + 이 차수가 더한 것.

| 프로젝트 | B 기준 | B 머리(+ · −) | main | 합친 판 | 등식 |
| --- | --- | --- | --- | --- | --- |
| unit | 2587 | 2647(+62 · −2) | 2646 | 2708 | 2646 + 62 − 2 + 2(이 차수 — `bundle-popups` · `lint-design` 하나씩) = 2708 · 이름 바꿈 하나(`catalog.test.ts` «36종을 등록한다» → «37종을 등록한다») |
| web | 3398 | 3413(+16 · −1) | 3413 | 3428 | 3413 + 16 − 1 = 3428 |
| build | 175 | 175 | 175 | 175 | 같다 |
| api | 2640 | 2640 | 2655 | 2655 | 같다 — B 는 api 케이스가 없다 |
| 실브라우저 | 598 | 607(+9) | 618 | 631 | 618 + 9 + 4(`popup-attach`) = 631 |

열쇠 집합으로 견줘 «합친 판에만 있는 것» 은 위 이 차수 몫 여섯과 이름 바꾼 하나, «합친 판에 빠진 것» 은 옛 이름 하나뿐이다 — 병합이 잃은 케이스 0.

## 게이트

**판:** HEAD `41ceff3e`(이 절 앞 커밋 — 그 뒤로는 이 보고만 바뀐다) · Node v24.21.0 · 13:20:10 ~ 14:05:03 · `nohup nice -n 10 caffeinate -i` 체인 하나
(`S/gate/gate.zsh` · pgid 85453): 실브라우저 전량(게이트 전 — 입구가 합쳐졌다) → `pnpm fmt` → `fmt:check` → `lint` → `typecheck` → `build` →
`pnpm test --maxWorkers=25%` → `test:build:serial` → `test:browser`. 단계 `rc` 모두 0. `pnpm fmt` 뒤 바뀐 파일 0. 띄우기 전 1분 부하 13:19 14.8 · 13:20 13.8.
게이트 칸(`gate-slots/`)은 띄울 때 0 개 — 전량 갈래마다 `rb-pob` 를 만들고 끝에 지웠다(끝에 0 개). 단계 경계의 1분 부하: 13.4(시작) · 26.5(게이트 전
실브라우저 끝) · 21.4(test 시작) · 3.1(test 끝) · 14.8(serial 끝) · 17.0(browser 끝) — 30 을 넘은 경계는 없다(경계에서만 쟀다).
**잠듦 대조:** `pmset -g log | grep -E ' Sleep  '` 의 마지막 줄이 10:23:55(`Clamshell Sleep`)이고 그 뒤 0 줄 — 모든 갈래와 안 겹친다.
빌드한 `system-admin-1.8.0.wbtheme` sha256 `d5e4a1e6…baad` = `checksums.json` 의 1.8.0 줄. `lint` 경고 93 줄 — 이 차수가 쓴 줄은 없다(합친 판에서 바뀐
파일에 걸린 둘 `apps/web/src/drag/use-placement.ts` · `system-themes/admin/test/admin.test.ts` 도 그 줄의 blame 이 10-01 ~ 10-23).

| 갈래 | 시각 | 실행(통과 + 실패) | 실패 | 건너뜀 | 파일 | main(FX-POA «게이트») | 등식 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 실브라우저 전량(게이트 전) | 13:20:10 ~ 13:36:08 | 631 | 0 | 1(`layout-weight` 스크린숏) | 96 | 618 · 93 | 618 + 9(B) + 4(`popup-attach`) = 631 |
| `pnpm test` unit | 13:36:26 ~ 13:48:06 | 2708 | 0 | 0 | 170 | 2646 · 167 | 2646 + 60(B 순 — +62 −2) + 2(이 차수) = 2708 |
| `pnpm test` web | 같음 | 3430 | 0 | 0 | 214 | 3415 · 213 | 3415 + 15(B 순) = 3430 |
| `pnpm test` api | 같음 | 2655 | 0 | 1(`log-destination` «Linux `/dev/full`» — macOS 에서 원래 건너뜀) | 165 | 2655 · 165 | 같다 |
| `test:build:serial` | 13:48:06 ~ 13:51:11 | 175 | 0 | 1(`template` «저장소 밖에서 설치») | 18 | 175 · 18 | 같다 |
| `test:browser` | 13:51:11 ~ 14:05:03 | 631 | 0 | 1(`layout-weight` 스크린숏) | 96 | 618 · 93 | 위와 같다 |

web 의 실행 수는 `vitest list`(3428)보다 2 많다 — main 도 같은 차다(게이트 3415 · list 3413). unit 파일 170 = 167 + 3(B 의 `schema/test/component/preset.test.ts` ·
`text-max.test.ts` · `renderer/test/file-attach-view.test.tsx`), web 214 = 213 + 1(`panels/file-list-control.test.tsx`), 실브라우저 96 = 93 + 2(B 의 `palette-preset` · `file-attach-narrow`) + 1(`popup-attach`).
⑥ — B 의 실브라우저 판 `palette-preset`(카드 차례 · 축소판 · 넣기 입구 다섯 · 글 한도) · `file-attach-narrow` 는 A 의 카드 · 팝업 변화 위에서 두 판 다 초록이다.
끝(14:05)에 이 워크트리 경로의 vitest · vite · tsx · Chrome · 체인 0 · 3104 리스너 0. DB 컨테이너(5504)는 남겼다.

## 남은 것(낮은 것 — 이월 후보)

- **뷰 모드의 넓은 팝업 안 2열 폼 표의 값 칸이 좁다** — 캔버스 칸이 좁으면 상자가 960 대신 칸 폭(창 1440 에서 788)으로 주는데 폼 표는 크기 표지를
  보고 2열을 지켜, 값 칸 안 파일첨부의 긴 이름이 6 · 5 줄로 꺾인다(넘침 0 — 위 «겹침 판»). 번들 · PPTX 는 상자 960 그대로라 이 판이 없다. 접기를
  상자 폭(컨테이너 쿼리)으로 옮길지는 PO-A 의 덮개 층 · 기본테마 설계의 몫이라 이 차수에서 바꾸지 않았다.
- **팝업 «바닥» 구역은 받는 타입을 정하지 않는다** — 팔레트가 그리드 · 파일첨부도 바닥에 넣는다(덮개 층이 몸통만 굴려 바닥에 큰 표를 두면 상자가
  창 높이를 먹는다). 카탈로그 결정(`PopupDef` 의 `footer` 에 `accepts`)이라 값만 적었다.
- 앞 차수의 이월 그대로 — 캔버스 끌기 미리보기는 프리셋 카드도 빈 그리드다(`2026-10-26-pob-report.md` «남은 것»).

## 지침

1. **무엇이 비었나:** 두 트랙이 같은 `describe` 블록에 같은 이름의 상수(`const EMPTY` — 팝업 표본 · 빈 목록 파일첨부 표본)를 더하면 git 은 충돌 없이
   합치고 `pnpm typecheck` 만 TS2451 로 잡는다(vitest 는 타입을 안 봐 케이스가 실행 전 수집에서 죽거나 한쪽 값으로 돈다). 충돌 파일만 보면 이 판을 놓친다.
   **어디:** `.ruler/30-delegation.md` 「워커에게 맡길 때 — wirebound」 의 «병렬 브랜치가 잰 수는 라운드의 수가 아니다» 문단, «합친 판은 수만이 아니라
   통과를 다시 잰다» 문장 뒤.
   **넣을 문장:** «합친 판은 충돌이 난 파일과 함께 git 이 조용히 합친 파일도 `pnpm typecheck` 로 먼저 잰다 — 두 트랙이 같은 `describe` 에 같은 이름을 더하면
   git 은 합치고 `tsc` 만 «Cannot redeclare» 로 잡는다(`packages/theme-kit/test/check.test.ts` 의 `EMPTY` — `docs/superpowers/plans/2026-10-27-rb-pob-report.md`).»
2. **무엇이 비었나:** 충돌 덩이를 «둘 다 지킴» 으로 이어 붙이면 덩이 밖 공통 줄(주석 머리 `/**` · 닫는 괄호 · `return out`)은 한쪽에만 붙는다 — `check.ts`
   에서 A 의 머리말 `/**` 가 덩이 앞 공통 줄이라 B 쪽에 쓰이고 A 쪽은 머리 없는 주석이 되어 `tsc` 가 죽었다.
   **어디:** 같은 문단, 위 문장 뒤.
   **넣을 문장:** «충돌 덩이를 «둘 다» 로 풀 때는 이어 붙인 뒤 양쪽의 함수 · 주석 블록이 원본(`git show <쪽>:<파일>`)의 글자 그대로 들었는지 블록마다 견준다
   — 덩이 밖 공통 줄(`/**` · 닫는 괄호)은 한쪽 몫만 남는다.»
3. **무엇이 비었나:** 기대값을 같은 페이지에서 읽는 단언은 그 값이 잰 값에서 지어지면 늘 참이다 — 팝업 폭을 «min(크기, 덮개 틀 폭)» 으로 견줬는데
   덮개 틀(`[data-wb-popup-frame]`)은 상자에 맞춰 줄어 틀 폭이 늘 상자 폭이었다(작은 팝업을 500 으로 바꿔도 초록일 판). 설 수 있는 폭은 겹
   (`[data-wb-popup-level]`)의 폭 − 좌우 여백이다.
   **어디:** `.ruler/20-verification.md` 「목 · 계측은 불린 수를 값으로 확인하고, …」 절, «대조군은 옳은 갈래와 그른 갈래가 다른 값을 내게 짓는다» 문장 뒤.
   **넣을 문장:** «기대값을 페이지에서 읽는 단언은 그 기대값이 잰 값에서 지어지지 않는지 본다 — 자식에 맞춰 줄어드는 그릇(덮개 틀 `[data-wb-popup-frame]`)의
   폭은 늘 자식 폭이라 «폭 = min(크기, 그릇 폭)» 이 늘 참이다. 설 자리는 줄지 않는 조상(`[data-wb-popup-level]` 폭 − 여백)에서 읽고, 기대값을 바꾸는 변조
   (크기 480 → 500)로 한 번 죽인다(`apps/web/build-test/popup-attach.test.ts`).»
