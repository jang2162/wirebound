# RB-CI-B 보고 — 자리표시자 트랙을 main(CI-A 병합) 위로 — 2026-10-24

브리프: 코디네이터 `brief-rb-ci-b.md` · 공통 `common-w8.md`. 워크트리 `feat-placeholder` · 브랜치 `feat/placeholder` · Postgres 5502(`pnpm db port postgres 5432` → `0.0.0.0:5502`). node v24.21.0. 이 워크트리에 붙은 다른 에이전트 없음(`orca terminal list`).

## 바꾼 것

| 커밋 | 무엇 |
| --- | --- |
| `c19d6ae5` | **main 을 합침**(`git merge --no-ff main` — 결과 브랜치가 main `4880f0e5` 의 후손). 충돌 19 파일을 손으로 풀고, 합친 판이 서게 고친 것 다섯을 같은 커밋에 담았다(아래 「충돌을 푼 파일」 · 「합친 판에 맞춘 것」) |
| `1a1c0961` | 새 케이스 — 필드 값 칸 ↔ 자리표시자 몸통(브리프 3). `packages/schema/test/field-placeholder.test.ts` · `packages/renderer/test/field-placeholder.test.tsx` |

**rebase 가 아니라 merge 를 고른 까닭:** CI-B 의 8 커밋이 겹친 파일(판 번호 · `checksums.json` · `shots.ts` · 패널 케이스)을 커밋마다 고쳐, rebase 는 같은 자리의 충돌을 커밋마다 다시 푼다. merge 는 한 번 풀고 그 판을 한 커밋이 말한다. 결과가 main 의 후손이라는 조건은 같다.

### 충돌을 푼 파일 — 누구의 무엇을 지켰나

| 파일 | main(CI-A)에서 지킨 것 | CI-B 에서 지킨 것 | 푼 꼴 |
| --- | --- | --- | --- |
| `packages/theme-sdk/src/version.ts` · `package.json` | `ViewProps.field` 가 든 1.4.0 은 아래 판으로 | `useAsset` · `placeholderVars` | **1.5.0**(설계 「구현을 나누는 법」 — CI-B 가 1.4.0 위로) |
| `system-themes/admin/package.json` · `src/manifest.ts` · `test/admin.test.ts` | 1.4.1(DateInput 폭) · `sdk ^1.4.0` 은 아래 판으로 | 자리표시자 CSS | **1.5.0** · `sdk ^1.5.0` — main 의 1.4.1 위 |
| `system-themes/admin/checksums.json` | `1.4.0` · `1.4.1` 줄 그대로 | — | `1.5.0` 줄을 **합친 판의 빌드로 다시 지음**(`3f0050b2…` — CI-B 의 `9646a483…` 는 CI-A 가 빠진 빌드라 버림. 배포 안 한 판이라 CI-B 의 1.5.0 이름을 그대로 쓴다) |
| `packages/theme-kit/template/theme.config.ts` · `SKILL.md` | SKILL 의 «1.4.0 — 값 칸 `Field` · 조각 아홉» 은 아래 판 설명으로 | `^1.5.0` · `~1.5.0` · `1.5.0` | 범위 줄을 1.5.0 으로, 아래 판 설명에 1.4.0 을 |
| `apps/api/src/db/migrations/index.ts` | `0029-compose-field` | `0030-assets` | 둘 다, 번호 차례 |
| `packages/schema/src/component/define.ts` | `optionList` | `color` · `image`(주석째) | 줄마다 한 값 꼴로 열 |
| `packages/schema/test/component/catalog.test.ts` | `Field: ['body']` | `Placeholder: ['body']` | 둘 다 |
| `packages/renderer/src/render.tsx` | `type ViewField`(`fieldNames` · `renderNodeIn` 우회는 자동 합침) | `AssetProvider` · `type AssetResolver`(`withAssets` 는 자동 합침) | import 한 덩이에 둘 다 |
| `packages/theme-kit/src/shots.ts` | 한 줄 조각 꺾임(`wrapped` · `ONE_LINE_PIECES`) | 정한 값 자리표시자(`placeholder` · `placeholderExpectations`) | `measure` 의 인자를 `{ onePieces, nodeId, want }` 하나로 묶어 둘 다 잰다 · 문제 줄 둘 다 |
| `packages/theme-kit/build-test/shots.test.ts` | `wrapped` = `[]` | `placeholder` = `[]` | 둘 다 |
| `packages/exporter/test/bundle-stateless-bytes.test.ts` | 머리말의 판 4 문장 | 머리말의 자리표시자 문장 | 두 문장을 차례로 · `views.css` 해시는 다시 지음(아래) |
| `apps/web/src/shell.css` | `.wb-shell-list-pick` · `.wb-shell-list-foot` | 색 · 그림 위젯 규칙 전부 | 둘 다(두 쪽이 같은 몸 `display: flex; flex-wrap: wrap; gap: 4px` 을 나눠 써 겹친 것 — 규칙마다 제 몸) |
| `apps/web/test/lock/props-lock.test.tsx` | `optionList` 줄 · 목록 위젯 주석 · `HTMLButtonElement` 타입 | `color` · `image` 줄 | 표에 셋 다 · control 수를 **열**로(«열한 번째가 생기면 죽는다») |
| `apps/web/test/panels/property-panel.test.tsx` | `optionList` 줄 · `n-select` 픽스처 | `color` · `image` 줄 · `n-ph` 픽스처 | 둘 다 · control 수 **열** |
| `docs/superpowers/specs/2026-08-03-wirebound-design.md` | 표지 목록(`Input` 의 `kind` · `size` · `Select.size` · `Chip.removable` · `Affix.tone`) · 속성 탭 단락(몫의 `Field` · 목록 칸 · 종류 바꾸기) | 표지 `Placeholder` 의 `border` · `align` · `imageFit` · 「자리표시자의 그리기 값」 단락 · 색 칸 · 그림 칸 문장 | main 단락에 CI-B 문장을 끼움(표지 목록 = `marks.ts` 의 `MARKED_PROPS` 합친 판과 같다) |

자동으로 합쳐진 겹침 파일(충돌 없음)은 `marks.ts`(표 줄 둘 다) · `theme-sdk/src/index.ts` · `schema/src/index.ts` · `samples.ts` · `prop-marks.test.tsx` · `theme.css` · `llms-txt.ts` · `public/llms.txt` · `property-panel.tsx` · `apps/api/README.md` 등 15 이다 — 아래 게이트가 잰다.

### 합친 판에 맞춘 것(같은 커밋)

- **CI-B 픽스처 둘이 문서 판 3** — `apps/api/test/assets.test.ts`(번들 판 `PUT …/schema`) · `packages/renderer/test/placeholder-view.test.tsx`. main 은 판 4 이고 판 3 은 거절된다(CI-A 「`0029`」 — 런타임 사슬에 판 3 → 4 가 없다). 둘을 4 로. CI-B 가 바꾼 파일에서 `version: 3` · 옛 `Field.control` 을 센 식은 파이썬 `version:\s*3\b|control:\s*'(text|select|…)'` — 맞은 줄 가운데 판 3 문서는 이 둘뿐이고 나머지는 편집 칸의 위젯 종류(`EditorField.control`)였다. `DOC_VERSION`(= `CURRENT_DOCUMENT_VERSION`)은 CI-B 가 안 바꿨다(main 의 4 그대로).
- **번들 바이트** — `bundle-stateless-bytes` 의 `assets/views.css` 를 `b10511ed0986f204` 로(`WB_PRINT_DIGEST=1`). 다시 지은 것은 그 한 줄(두 판 · 두 자리)이고 **페이지 HTML 은 main 의 해시 그대로** — CI-B 보고의 «그림 없는 페이지는 `views.css` 만 바뀐다» 가 합친 판에서도 선다.
- **`/llms.txt`** — 자동 합침 판이 정의에서 지은 글과 같았다(`apps/web/test/llms-txt.test.ts` 2 통과 — 다시 쓸 것 없음).

## 마이그레이션 기록

| DB | 합치기 전 | 한 것 | 뒤 |
| --- | --- | --- | --- |
| 테스트 `wb_placeh_test` | `0028` · **`0030`**(0029 없음) | 0030 의 `down` 과 같은 SQL(표 셋 · `wb_release_asset_blob()`)과 `kysely_migration` 의 `0030-assets` 줄 삭제를 한 트랜잭션으로 | `0028` — 다음 api 실행의 global-setup 이 `0029` · `0030` 을 차례로 올렸다 |
| 개발 `wb_placeh` | `0028` | `pnpm -C apps/api migrate` | `0029` · `0030` |

## 필드 × 자리표시자(브리프 3)

**셈:**

- 설 자리 — `Field` 의 값 칸은 `accepts` 가 없고(«값 칸은 무엇이든 받는다» — `catalog/input.ts` 머리말) `Placeholder` 몸통도 없다. `placement` 를 가진 타입은 `TabPanel` 하나다. 두 겹침 다 검증을 지난다.
- 그림 걷기(`imageIdsIn` · `clearImages`) — `childLists` · `mapChildLists` 로 돌아 `Field` 의 값 칸(몸통)을 따로 알 필요가 없다. 부르는 자리 다섯(`export-source.ts` · 번들 · `claim-images.ts` · `editor-keys.tsx` 의 붙이기 · 모듈 쪽)이 같은 함수다.
- 렌더러 — 필드 이름(`fieldNames`)은 `Field` 몸통의 `VALUE_PIECES` 만 세어 자리표시자는 이름을 안 받는다. 그림 주소는 문맥(`AssetProvider`)이라 `renderNodeIn` 의 캐시 우회와 무관하다.
- 붙여넣기(`editor-keys.tsx` 의 `paste`) — CI-A 는 이 파일을 안 고쳤다(겹침 0). 붙인 노드의 그림 가져오기는 위 걷기 함수를 지난다.
- 기본 뷰 — CI-A 는 `default-views/input.tsx`, CI-B 는 `document.tsx`(파일이 갈린다). 갤러리 `samples.ts` 는 자동 합침.

**새 판(`1a1c0961`)** — 넷 다 고친 소스에서 초록:

| 케이스 | 판 | 재는 것 |
| --- | --- | --- |
| schema «필드 값 칸 안의 자리표시자» | `Field{증빙} > [Input, Placeholder{image A}]` | 검증 오류 0 · 걷기 `[A]` · 비우기 1 · 필드 props · 형제 그대로 · 비운 판도 오류 0 |
| schema «자리표시자 몸통 안의 필드» | `Placeholder{image A} > Field{문구} > [Input, Placeholder{image B}]` | 오류 0 · 걷기 `[A, B]` · B 만 비우기 1 → `[A]` · 둘 다 2 |
| renderer «필드 값 칸 안의 자리표시자» | 위 첫 판 + `assetUrl` | 입력 `aria-label` «증빙» · `aria-required` true · 자리표시자는 이름 · 필수 없음 · 조각 `['image']` · `src` 표본 주소 · `alt` 라벨 |
| renderer «자리표시자 몸통 안의 필드» | `Placeholder{배너 · image A · 600×200} > [Field{문구} > Input, Input{안내 «검색어»}, Placeholder{image B}]` | 조각 `['image', 'content']` · `data-wb-frame` `box` · 필드가 몸통 안 · 필드 안 입력 «문구» · 몸통에 바로 선 입력은 «검색어»(자리표시자 라벨 «배너» 가 아니다) · 안쪽 그림 `src` |

## 혼자 죽는 변조

러너 `…/scratchpad/mut.py` — 경로 전체 이름 백업 · 찾는 글자 맞은 수 1 확인 · 돌린 뒤 바이트 비교 복원(넷 다 `restored: True`). 실행 수는 `통과 + 실패`.

| 변조 | 자리 | 돌린 범위 | 실행 · 실패 | 죽은 케이스 ⟶ 값 |
| --- | --- | --- | --- | --- |
| X1 그림을 든 자리표시자에서 걷기를 멈춤(`out.add(image); return`) | `packages/schema/src/images.ts` 의 `imageIdsIn` | `packages/{schema,renderer,exporter}/test` · `apps/web/test/{edit,palette,panels}` | 3 274 · 3 | schema «자리표시자 몸통 안의 필드» ⟶ `expected [ Array(1) ] to deeply equal [ …(2) ]` · `paste-images` 둘(«붙이기 편집 전에 …» · «가져오기가 실패하면 …» — 같은 걷기를 붙이기 길에서 잰다) |
| X2 값 칸을 입력 조각만 받게(`accepts`) | `packages/schema/src/component/catalog/input.ts` 의 `FieldDef` | `packages/{schema,renderer}/test` | 1 352 · 4 | schema 두 판 ⟶ `expected [ Array(1) ] to deeply equal []` · `catalog.test` «받는 타입 제약은 탭 하나다» · `compose-input.test` «값 구역은 몸통 하나이고 무엇이든 받으며 …» |
| X3 자리표시자도 값 조각으로 셈 | `packages/renderer/src/render.tsx` 의 `VALUE_PIECES` | `packages/{renderer,theme-sdk,exporter}/test` | 854 · 1 | renderer «필드 값 칸 안의 자리표시자» ⟶ `expected [ '증빙 1', 'true' ] to deeply equal [ '증빙', 'true' ]` |
| X4 `Field` 가 아닌 부모도 몸통 조각에 이름(`type !== 'Field'` 가드를 뗌) | 〃 의 `fieldNames` | 〃 | 854 · 1 | renderer «자리표시자 몸통 안의 필드» ⟶ `expected '배너' to be '검색어'` |

- **혼자 죽는 것** — renderer 두 판(X3 · X4 각각 혼자).
- **늘 함께 죽는 것** — schema «필드 값 칸 안의 자리표시자» 는 혼자 죽는 변조가 없다: 값 칸을 좁히는 변조(X2)는 받는 타입 목록의 소유자(`catalog.test` · `compose-input.test`)와 함께 죽는다. 이 판은 «그 꼴이 서는 문서에서 걷기 · 비우기가 값 칸 안까지 닿는다» 를 함께 재므로 남기고, 머리말에 두 소유 케이스를 이름으로 적었다. schema «자리표시자 몸통 안의 필드» 는 X1 에서 `paste-images` 두 판과 함께 죽는다(schema 안에서는 혼자).
- **첫 판의 X3 은 renderer 두 판을 함께 죽였다**(둘째 판에도 `Field > [Input, Placeholder]` 가 있었다). 둘째 판의 안쪽 자리표시자를 필드 밖(몸통에 바로)으로 옮겨 축을 갈랐다 — 필드 안 자리표시자의 축은 첫 판이 갖는다.

## 수의 등식

`vitest list`(실행 없이 수집 — 건너뛰는 판은 안 센다)로 네 판을 셌다: 기준 `96efb495` · main `4880f0e5` · CI-B `61c13bff` · 합친 판 `1a1c0961`. 각 판을 스크래치에 `git archive` 로 풀고 `node_modules` 를 이 워크트리 것으로 이은 뒤 그 판에서 `pnpm build`. api 프로젝트는 global-setup 을 뗀 설정으로(DB 에 안 닿게), 실브라우저 · build 의 전제 검사는 이 워크트리 개발 DB 에 `select 1` 만 한다.

| 갈래 | 기준 | main | CI-B | 합친 판 | 등식 |
| --- | --- | --- | --- | --- | --- |
| `pnpm test`(`!build`) | 510 · 8 207 | 517 · 8 330 | 520 · 8 316 | **529 · 8 443** | 8 330 + (8 316 − 8 207 = 109) + 새 4 = 8 443 · 파일 517 + 10 + 2 = 529 |
| `test:build:serial`(`build`) | 17 · 156 | 18 · 160 | 17 · 158 | **18 · 162** | 160 + 2 = 162 |
| `test:browser` | 85 · 510 | 86 · 514 | 86 · 517 | **87 · 521** | 514 + 7 = 521 · 파일 86 + 1 = 87 |

`list` 의 수 = 실행 수 − 건너뜀(셋 다 1 — main 의 FX-CI 게이트 8 331 · 161 · 515 와 CI-B 의 FX-CI-B 게이트 8 317 · 159 · 518 이 그 꼴이다).

합치기 직후(새 케이스 전) 실행: `--project unit --project web` 366 파일 · 5 813 중 통과 5 813 · `--project api` 161 파일 · 2 627 중 통과 2 626 · 건너뜀 1 · 실패 0. 스타터 템플릿(브리프 4): `template.test.ts` 9 통과 · 건너뜀 1(`WB_TEMPLATE_INSTALL=1`) · 실패 0 — SDK 기본 뷰 다섯 파일의 상대 import 19 줄에 `import type` 0(`document.tsx` 의 `useAsset` · `placeholderVars` · `PLACEHOLDER_VARS` 는 값 import 이고 SDK 가 내보낸다).

## 게이트

커밋 `1a1c0961` · node v24.21.0 · 스크립트 하나(`…/scratchpad/gate/gate.sh`)를 `nohup nice -n 10 caffeinate -i … & disown` 으로 · 단계마다 `rc=$?` · 띄울 때 `gate-slots` 의 파일 0(내 슬롯 `rb-ci-b` 는 끝에 지움). 건드린 경로가 `packages/*` · `system-themes/*` · `apps/api` · `apps/web` · 정본 문서라 `README.md` 「트랙 게이트」 의 «그 밖» 줄 — 전량 넷 + `pnpm fmt` · `pnpm lint`. 브리프대로 그 앞에 실브라우저 전량을 한 번 돌았다.

| 단계 | 시각 | rc | 파일 | 통과 | 실패 | 건너뜀 |
| --- | --- | --- | --- | --- | --- | --- |
| 실브라우저 전량(게이트 전) | 10:21 – 10:32 | 0 | 87 | 521 | 0 | 1(`layout-weight` 의 스크린숏 판) |
| `pnpm typecheck` | 10:32 | 0 | — | — | — | — |
| `pnpm build` | 10:32 | 0 | — | — | — | — |
| `pnpm test --maxWorkers=25%` | 10:32 – 10:42 | 0 | 529 | 8 443 | 0 | 1(`log-destination` 의 Linux `/dev/full` 판 — macOS) |
| `test:build:serial` | 10:42 – 10:44 | 0 | 18 | 162 | 0 | 1(`template` 의 `WB_TEMPLATE_INSTALL=1` 판) |
| `test:browser` | 10:44 – 10:55 | 0 | 87 | 521 | 0 | 1(같은 스크린숏 판) |
| `pnpm fmt` · `pnpm lint` | 10:55 | 0 · 0 | — | — | — | — |

- 통과 수가 「수의 등식」 의 합친 판(`list`)과 셋 다 같다 — 등식이 맞고 빨강도 없다.
- `pnpm fmt` 뒤 바뀐 추적 파일 0(`git status` 의 한 줄은 아직 커밋 전인 이 보고). `pnpm lint` 는 경고만(오류 0 · 이 트랙이 더한 경고 0 — 새 두 파일은 커밋 훅의 lint 에서 경고 0).
- 게이트의 `pnpm build` 가 다시 지은 `system-admin-1.5.0.wbtheme` 의 sha256 이 `checksums.json` 의 `1.5.0` 줄(`3f0050b2…`)과 같다(빌드가 결정적 — `admin.test.ts` · 시딩 케이스도 그 값으로 통과).
- 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 줄이 2026-10-23 20:49 — 이 트랙의 측정(2026-10-24 09:40 – 10:55)과 안 겹친다.
- 끝에 이 워크트리 경로의 vitest · vite · tsx · Chrome 0. dev 서버는 띄우지 않았다. DB 컨테이너(5502)는 남긴다.
- 숨은 글자(제어 · 방향 제어 · 폭 없음 · U+2028/2029 · BOM) — `main..HEAD` 의 바뀐 파일 + 이 보고 105 파일에서 0.

## 남은 것

- **CI-B · CI-A 리뷰의 이월은 그대로다** — 이 트랙은 옮기기만 했다(`fx-ci-b-report.md` · `fx-ci-report.md` 「남은 것」).
- **schema «필드 값 칸 안의 자리표시자» 는 혼자 죽는 변조가 없다** — 「혼자 죽는 변조」 의 X2 가 받는 타입 목록의 소유 케이스와 함께 죽인다. 머리말이 소유 케이스를 이름으로 가리킨다.
- **«필드 값 칸 안의 자리표시자» 의 실브라우저 판은 없다** — jsdom 의 DOM 속성(이름 · 그림 `src` · 조각)으로 쟀다. Chrome 접근성 트리의 필드 이름 판(`packages/theme-kit/build-test/field-a11y.test.ts`)에는 자리표시자가 없다. 기본테마의 값 칸 CSS(`Field` 의 가로 줄 세우기) 안에서 자리표시자의 크기 · 그림이 어떻게 서는지는 화면으로 안 봤다.
- 스크래치의 네 판(`…/scratchpad/ver/{base,main,cib,merged}`)은 재부팅에 지워진다 — 다시 세는 법은 「수의 등식」 의 머리 문단.

## 지침

| 무엇이 비었나 | 어느 문서 어느 절 | 넣을 문장 |
| --- | --- | --- |
| 합친 판의 수 등식에 쓸 기준선(두 트랙이 갈라진 커밋)의 수는 보고 어디에도 없어, 판을 다시 돌리지 않고 세는 길이 적혀 있지 않다 | `.ruler/30-delegation.md` 「워커에게 맡길 때 — wirebound」 의 «병렬 브랜치가 잰 수는 라운드의 수가 아니다» 문단 끝 | «**기준선 · 옆 브랜치의 수는 실행 없이 `vitest list --json` 으로 센다** — 그 판을 `git archive` 로 스크래치에 풀고 `node_modules` 를 워크트리 것으로 이은 뒤 그 판에서 `pnpm build`(수집이 `dist` 를 import 한다). api 프로젝트는 `globalSetup` 을 뗀 설정으로 돌려 테스트 DB 에 안 닿게 하고, `build` 프로젝트 · `vitest.browser.config.ts` 는 전제 검사(`editorStackPrerequisite` — `select 1`)가 서도록 `DATABASE_URL` 을 준다(안 주면 실브라우저가 한 파일로 센다). `list` 는 건너뛰는 판을 안 세어 실행 수 − 건너뜀이다(`docs/superpowers/plans/2026-10-24-rb-ci-b-report.md` 「수의 등식」).» |
| 두 트랙이 각각 «다음 판» 의 sha256 을 `checksums.json` 에 적으면 뒤에 병합하는 쪽의 줄은 앞 트랙이 빠진 빌드의 값이다 — 판 이름만 지키고 값을 옮기면 시딩 케이스가 빨강이다 | `.ruler/20-verification.md` 「검증 — wirebound」 의 «시스템 테마를 고르는 데이터 마이그레이션은 …» 항목 뒤(새 항목) | «**뒤에 병합하는 트랙의 `checksums.json` 새 줄은 합친 판에서 다시 짓는다** — 그 트랙이 적은 sha256 은 앞 트랙이 빠진 빌드의 값이다. 합친 뒤 `pnpm build` 의 `.wbtheme` 을 `shasum -a 256` 으로 재어 적고, 배포 안 한 판이면 그 판 이름을 그대로 쓴다(`docs/superpowers/plans/2026-10-24-rb-ci-b-report.md` 「충돌을 푼 파일」).» |
