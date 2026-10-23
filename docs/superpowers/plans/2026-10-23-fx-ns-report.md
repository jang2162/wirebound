# FX-NS 보고 — 구역 모델(A) 리뷰 대응: 폼 단추의 주 단추 — 2026-10-23

브리프: 코디네이터 `brief-fx-ns.md` · 공통 `common-w5.md`. 대상: 워크트리 `feat-node-slots` · 브랜치 `feat/node-slots` · 시작 HEAD `fb8c6755`. 리뷰 보고 `docs/superpowers/plans/2026-10-23-rv-ns-report.md` 의 발견 1(사용자 결정 (a)) · 4 · 5 · 6. node v24.21.0 · Postgres 5481(이 워크트리 컨테이너).

## 결정과 이유

### 주 단추는 노드 `variant: 'primary'` 로 싣는다 (물음 `q-fx-ns.md` Q1 — 코디네이터 답: 그대로)

**잰 값**(스크래치 탐침 — `packages/{schema,themes,renderer}/dist` 를 바로 부름 · 문서는 검색폼 `actions` 에 «초기화» · «검색»(`variant: 'primary'`)):

| 판 | `validatePage` 이슈 | lint `theme-variant` | `resolveVariant`(그리는 값) |
| --- | --- | --- | --- |
| 기본테마 manifest(Button: default · primary · secondary · danger · ghost) | 0 | 0 | `primary` |
| 스타터 테마 꼴(`packages/theme-kit/template/theme.config.ts` — default · primary) | 0 | 0 | `primary` |
| Button 을 선언했는데 `primary` 가 없는 테마(default · outline) | 0 | **1** — «Button 의 variant "primary" 는 테마 t@1.0.0 에 없습니다 — default(기본)으로 그려집니다» | `default` |
| Button 을 선언 안 한 테마 | 0 | 0 | `primary`(그대로 `data-wb-variant`) |
| 테마 없음(`NO_THEME` · SDK 기본 뷰 — 내보내기) | 0 | (manifest 없음 — 테마 규칙 안 돎) | `primary` |

- 검증은 `node.variant` 값을 판정하지 않는다(`variantFrom` 컴포넌트의 `ignored-variant` 만 — `Button` 은 `variantFrom` 이 없다). 오류 · 던짐은 어느 판에도 없다.
- **«초기화» · «취소» 에 `secondary` 를 싣는 길은 피했다** — 같은 탐침에서 스타터 테마 꼴이 `theme-variant` 경고 1(«초기화»)을 낸다. 스타터로 만든 테마마다 새 폼 하나에 경고가 선다.
- **대안(안 고름)** — 기본테마 CSS 가 자리로 칠함(검색폼 끝 · 입력폼 첫 단추): 카탈로그는 테마 낱말을 모르지만, 단추를 지우거나 옮기면 강조가 남의 단추로 간다(입력폼에서 «저장» 을 지우면 «취소» 가 주 단추). 코디네이터 답으로 버렸다.
- **부딪친 문장:** 정본 «컴포넌트 정의 구조» 의 «기본 내용에 변형을 적지 않는다» — 정본을 «기본 내용의 변형은 폼 주 단추(«검색» · «저장»)의 `primary` 하나다 …» 로 고쳤다. 날짜 붙은 `2026-10-23-node-slots-design.md` 157 줄은 이력이라 안 고쳤다.

### 기본테마 — 폼 단추 구역의 «기본» 단추를 보조 꼴로

기본테마의 `Button` 은 바탕 규칙(`[data-wb-structure="solid"]`)이 주색으로 채운다 — `default` 변형도 주색이라, `primary` 만 싣으면 두 단추가 여전히 같은 칠이다. 판 2 의 «첫 단추 칠» 규칙(`> span:first-child` — 뷰에 박힌 `span` 단추)은 판 3 에서 이미 걷혀 있었다(지금 `theme.css` 에 `first-child` 0 줄 — 구역 단추는 `span` 이 아니라 `Button` 노드라 그 규칙이 남아도 아무것도 안 칠했다).

더한 규칙: `SearchForm` · `EntryForm` 의 `> [data-wb-part="actions"] > [data-wb-component="Button"][data-wb-variant="default"]` 을 보조 꼴(바탕 · 글 · 테두리 = `secondary` 와 같은 값)로. 폼 밖의 기본 단추 · 폼 안의 `danger` · `ghost` 등은 그대로다. 판 2 의 «첫째가 주 단추, 나머지는 보조» 를 자리 대신 변형으로 옮긴 것이다.

### 기본테마 1.3.0 을 그대로 다시 지었다 (판을 안 올림)

`1.3.0` 은 main 에 없다(main 의 표는 `1.2.1` 까지 · main `package.json` `1.2.1`). 기동 시딩은 같은 `id@version` 인데 바이트가 다르면 멈추는데, 그 판을 넣은 DB 가 없다 — 이 워크트리 개발 DB(`wb_nodeslot`)의 `theme_packages` 0 행 · 테스트 DB 는 실행마다 새로 · 사용자 DB(5433)는 main 이라 1.3.0 을 본 적이 없다. 리뷰 · 앞 워커의 실브라우저 판은 일회용 DB 였다. 그래서 `checksums.json` 의 `system-admin@1.3.0` 줄만 새 sha256 으로 고쳤다: `dbd4e77a…a64` → `41c88768a1a36c102aedd9dbbf664ac0a65191828614b2978418a13ffb74e582`(5446 바이트). 앞 판 다섯 줄은 그대로다.

## 바꾼 것

| 자리 | 무엇 |
| --- | --- |
| `packages/schema/src/component/define.ts` | `NodeSeed.variant?` |
| `packages/schema/src/component/catalog/input.ts` | 검색폼 «검색» · 입력폼 «저장» 에 `variant: 'primary'` |
| `packages/schema/src/component/catalog/index.ts` | 기본 내용이 `variantFrom` 타입에 `variant` 를 실으면 던진다(새 노드가 `ignored-variant` 를 들고 서지 않게) |
| `apps/web/src/edit/create-node.ts` | 기본 내용의 `variant` 를 노드에 옮긴다 |
| `apps/web/config/llms-txt.ts` · `public/llms.txt`(다시 지음) | «create with» 에 `variant "primary"` — MCP · REST 로 만든 폼도 같은 노드 |
| `apps/api/src/db/migrations/0028-node-zones.ts` | 옮긴 폼의 단추 = 카탈로그 `initial` 과 같은 노드(낱말 · 차례 · `primary`) |
| `system-themes/admin/src/theme.css` · `checksums.json` | 위 규칙 · 1.3.0 sha256 |
| `docs/superpowers/specs/2026-08-03-wirebound-design.md` | 컴포넌트 표의 검색폼(«조회/초기화» → «초기화/검색») · 입력폼 줄과 «기본 내용의 변형» 문장 |
| `apps/api/test/node-zones-migration.test.ts` | 단추 꼴을 값으로(낱말 · 차례 · 주 단추) · 발견 5 — 모든 표의 폼 10 개를 걷어 단추 꼴을 견줌 |
| `packages/schema/test/component/catalog.test.ts` · `apps/web/test/edit/create-node.test.ts` | 기본 내용의 `variant` · 입력폼 `createNode` |
| `packages/exporter/test-support/fixtures.ts` | 발견 6 — `typesIn` 이 `zones` 의 배열도 돈다 |
| `system-themes/admin/test/admin.test.ts` | «`default` 를 겨냥한 규칙이 없다» → «폼 단추 구역의 기본 단추 둘뿐이다»(물음 Q2 — 이 자가 게이트에서 새 규칙을 잡았다. 그 자리 밖의 `default` 규칙은 계속 죽는다) |
| `apps/web/build-test/form-primary-button.test.ts`(새) | 실브라우저 — 새 폼 · 옮긴 폼의 주 단추 배경색 |
| `apps/web/test/store/zone-rebase.test.ts`(새) | 발견 4 — 리뷰의 무작위 리베이스 판 · 오라클 그대로 |

## 잰 값

### 무작위 리베이스 (`apps/web/test/store/zone-rebase.test.ts`)

시드 고정 · 4000 판 · 0.26s. 판 4000 · 구역 경로를 건드린 판 2684 · 얹힘 — 지움 1028 · prop 704 · 넣기 980 · 옮기기 1078(그 가운데 다른 부모 · 구역으로 991) · 둘이 같은 그릇(`children` · `zones` 맵 · 한 구역 배열)을 함께 만들어 버려진 판 81 · **틀린 판 0**. 리뷰 판(44)과 수가 다른 것은 난수를 뽑는 차례가 달라서다(리뷰는 «다른 구역 23» 을 맵째 `add` 가 겹친 판으로 셌다 — 여기서는 그 판이 «같은 그릇 `…/zones`» 에 든다). 카나리아 하한: 판 > 3000 · 구역 경로 > 1500 · 꼴마다 얹힘 > 500 · 구역 사이 옮기기 > 500.

### 실브라우저 — 기본테마 캔버스의 주 단추 (`apps/web/build-test/form-primary-button.test.ts` · editor-stack · dev 번들)

한 페이지에 새 검색폼 · 입력폼(`createNode` — 팔레트 · 끌기와 같은 함수) · `0028` 의 `liftDocument` 로 옮긴 판 2 검색폼 · 입력폼(단추 없는 폼) · 폼 밖 기본 단추 하나를 넣고 에디터로 열었다. 캔버스 문서에서 토큰 색을 같은 문서에서 계산해 견줬다 — `--wb-semantic-primary` = `rgb(37, 99, 235)` · `--wb-semantic-surface` = `rgb(255, 255, 255)`.

| 폼 | 단추(낱말 · `data-wb-variant` · 배경색) |
| --- | --- |
| 새 검색폼 · 옮긴 검색폼 | «초기화» `default` `rgb(255, 255, 255)` · «검색» `primary` `rgb(37, 99, 235)` |
| 새 입력폼 · 옮긴 입력폼 | «저장» `primary` `rgb(37, 99, 235)` · «취소» `default` `rgb(255, 255, 255)` |

카나리아: 테마 시트(`link[data-wb-style="theme"]`) 1 · 두 토큰 색이 다름 · **폼 밖 기본 단추 = `rgb(37, 99, 235)`**(규칙이 폼 밖으로 안 샌다). 1 파일 · 1 케이스 · 4.6s · 건너뜀 0.

| # | 변조 | 결과 |
| --- | --- | --- |
| B1 | 기본테마의 «폼의 단추 구역» 규칙 셀렉터를 아무것도 안 맞는 것으로(`[data-wb-mutated-away]`) · 테마 다시 빌드 | 1 사망 — 네 폼의 기본 단추 넷이 `rgb(255, 255, 255)` 대신 `rgb(37, 99, 235)`(주 단추와 같은 칠 — 고치기 전 화면 그대로). 복원 `cmp` 참 · 다시 빌드한 sha256 `41c88768…e582` 그대로 |
| B2 | `0028` 이 단추에 `variant` 를 안 실음 | 1 사망 — 옮긴 폼의 «검색» · «저장» 만 `primary` `rgb(37, 99, 235)` 대신 `default` `rgb(255, 255, 255)` · 새 폼은 그대로 |

## 혼자 죽는 변조

백업 이름은 경로 전체 · 복원은 `cmp` · 돌린 것은 그 케이스 파일만(vitest json 의 통과 + 실패).

| # | 변조 | 돌린 것 | 결과 |
| --- | --- | --- | --- |
| M1 | `0028` 이 단추에 `variant` 를 안 실음 | `node-zones-migration` | 6 실행 · 3 사망 — 판 2 셈(폼 10 개 중 꼴이 다른 폼 목록 ≠ []) · 페이지(`{type,props}` ≠ `{…, variant: 'primary'}`) · 판 3 표(`[['저장',null],…]` ≠ `[['저장','primary'],…]`). 세 케이스가 함께 죽는다 — 축의 주인은 «페이지» 케이스(값 전부) |
| M2 | `0028` 이 스냅샷 payload 의 레이아웃을 안 옮김(`if (schema === null \|\| schema !== null) return layout`) | 같은 파일 | 6 · **1 사망** — «판 2 가 하나도 안 남는다» · `[{ id: 'l_ef', type: 'EntryForm' }]` ≠ `[]`. 고치기 전 이 케이스의 셈(`pages[].schemaVersion` · 글자 `"tabs":` 등)은 payload 의 레이아웃을 안 봐 이 판에서 살았다 — 발견 5 의 같은 꼴 |
| M3 | 단추에 칸 하나 더(`props: { label, disabled: false }`) | 같은 파일 | 6 · **1 사망** — «페이지 …» · 노드 전체 견줌(낱말 · 주 단추만 보는 셈은 산다) |
| M4 | `createNode` 가 기본 내용의 `variant` 를 안 옮김 | `create-node` · `catalog` · `llms-txt` | 22 · **1 사망** — «기본 내용 — 구역의 `initial` 이 실제 노드로 …» |
| M5 | 카탈로그 «검색» 의 `variant` 를 뗌 | 같은 셋 | 22 · 3 사망 — `llms.txt` 스냅샷 · `createNode` 기본 내용 · 카탈로그 기본 내용. 카탈로그 케이스는 혼자 안 죽는다(`createNode` 가 같은 표를 읽는다) — 축의 주인은 카탈로그 케이스 |
| M6 | `llms.txt` 가 `variant` 를 안 적음 | `llms-txt` · `create-node` | 13 · **1 사망** — «public/llms.txt 가 정의에서 지은 글과 같다» 스냅샷 불일치 |
| M7 | exporter 픽스처의 머리 왼쪽 구역 `Text` → 오타 `Txet` | `packages/exporter/test/parity.test.tsx` | 43 · 2 사망 — «카탈로그 밖의 타입은 폴백 픽스처의 하나뿐이다» `['Txet','없는타입']` ≠ `['없는타입']` · «본 픽스처가 유효한 페이지 문서다». **고치기 전 `typesIn`(구역 걷기 줄을 뗌) + 같은 오타: 43 · 1 사망 — «카탈로그 밖» 케이스가 살았다** |
| T1 | 기본테마에 폼 밖 `default` 셀렉터를 더함(`[data-wb-component="Card"][data-wb-variant="default"]` 를 `secondary` 규칙 목록에) | `system-themes/admin/test/admin.test.ts` | 16 · **1 사망** — «`[data-wb-variant="default"]` 규칙은 폼 단추 구역의 기본 단추 둘뿐이다» · 셀렉터 3 ≠ 2 |
| Z1 | `anchored-ops.ts` 의 `anchorPath` 가 `footer` 구역 자리를 몸통으로 적음 | `anchored-ops` · `zone-rebase` | 28 · **1 사망** — 새 케이스 · 틀린 판 목록 ≠ [](앞 다섯 줄). 기존 `anchored-ops.test.ts` 27 은 살았다(구역 판이 없다 — 리뷰 발견 4 그대로) |

모든 변조 뒤 `cmp` 참.

## 남은 것

- **발견 2(`wb-theme check` 의 탭) · 3(빈 구역 맵째 `add`)** — 이 트랙 밖(브리프). 3 의 판은 새 store 케이스에서 «둘이 같은 그릇을 함께 만들어 버려진 판» 81 로 센다(그 수는 단언하지 않는다 — 고치는 트랙이 그 판을 0 으로 만들면 이 케이스의 버림 허용을 걷는다).
- **발견 7(`0028` 이 `head_seq` 를 안 올림)** — 손대지 않았다(원래 있던 길 · 브리프 밖).
- **Button 을 선언했는데 `primary` 가 없는 남의 테마** — 새 폼 하나마다 lint `theme-variant` 경고 1 이 서고 그 테마의 기본 변형으로 그린다(위 표). 올라간 남의 테마가 없어 지금 닿는 데이터는 없다.
- 기본 내용의 `variant` 를 `variantFrom` 타입에 실으면 던지는 검사(`catalog/index.ts`)는 케이스가 없다 — 지금 카탈로그가 그 판을 안 만든다(내보내지 않는 함수라 변조로만 잴 수 있다).
- `docs/superpowers/specs/2026-10-23-node-slots-design.md` 157 줄 «기본 내용에 변형을 적지 않는다» 는 이력이라 그대로다 — 지금 참인 문장은 정본.

## 게이트

건드린 경로가 `packages/*` · `system-themes/*` · 두 앱이라 전량 넷(`README.md` 「트랙 게이트」). 체인은 스크립트 하나 · `nohup nice -n 10 caffeinate -i` · 게이트 자리 파일(`gate-slots/fx-ns` — 띄울 때 0 개). node v24.21.0.

| 판 | HEAD | 단계 | 결과 |
| --- | --- | --- | --- |
| 1 (21:16:48) | `406db39e` | `pnpm typecheck` | **rc 2** — 웹 build-test 의 api 소스 정적 `import`(TS6059 · TS6307) → 내리고 실행 때 싣는 길로 고침(`1a362386`). 이 판의 `tsc --build` 가 `apps/api/src/db/migrations/0028-node-zones.{js,d.ts}` 와 `.map` 넷을 흘려 지웠다(지침 3) |
| 2 (21:19:11) | `1a362386` | — | 흘린 파일을 보고 곧바로 내림(잰 것 없음) |
| 3 (21:19:38 – 21:40:48) | `1a362386` | `typecheck` · `build` | rc 0 · rc 0 |
| | | `pnpm test --maxWorkers=25%` | rc 1 — 505 파일 · 통과 8162 · **실패 1** · 건너뜀 1. 실패: `system-themes/admin/test/admin.test.ts` «`[data-wb-variant="default"]` 규칙이 없다» — 새 «폼의 단추 구역» 규칙을 잡았다 → 자를 좁힘(`06f2d8bd` · 물음 Q2 · 변조 T1) |
| | | `pnpm test:build:serial` | rc 0 — 17 파일 · 통과 156 · 실패 0 · 건너뜀 1 |
| | | `pnpm test:browser` | rc 0 — 83 파일 · 통과 496 · 실패 0 · 건너뜀 1 |
| 4 (21:42:26 – 21:51:43) | `06f2d8bd` | `typecheck` · `pnpm test --maxWorkers=25%` | rc 0 · rc 0 — 505 파일 · **통과 8163 · 실패 0** · 건너뜀 1 |

판 4 는 판 3 뒤의 고침이 테스트 한 파일뿐이라 `test:build` 두 갈래를 다시 안 돌았다(판 3 에서 초록 · 그 뒤 소스 · build-test 불변). `pnpm fmt` · `pnpm lint`(touched 파일 경고 0 — 남은 경고는 앞서 있던 것) · 커밋 훅 fmt/lint 초록. 숨은 글자(U+200B–200F · 2028–202F · 2066–2069 · 서로게이트 · 제어) — 바뀐 16 파일에서 0. 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 줄은 20:47:20 — 게이트 판(21:16 – 21:52)과 안 겹친다. 끝에 이 워크트리 경로의 vitest · vite · tsx 0(첫 판을 내릴 때 남은 vitest 일꾼 넷은 cwd 를 보고 내렸다). DB 컨테이너는 남겼다.

## 지침

1. **zsh 줄바꿈 배열과 heredoc 을 한 명령에 섞으면 Claude Code 의 안전 검사가 명령을 못 읽어 거절한다.** 틀린 것: `.ruler/20-verification.md` 「「통과」를 보기 전에 몇 개가 실행됐는지 확인한다 — 덧붙임」 의 zsh 항목이 권하는 `F=("${(@f)$(…)}")` 꼴을 `python3 - "${F[@]}" <<'EOF'` 와 한 줄에 쓰자 «could not be checked for dangerous rm operations» 로 막혔다(`rm` 이 없는 명령). 자리: 같은 항목의 «줄바꿈 목록은 `F=("${(@f)$(…)}")` 배열로 받아 …» 문장 뒤. 넣을 문장: «**그 배열을 heredoc 스크립트에 넘기는 명령은 에이전트 셸의 안전 검사가 못 읽어 거절한다** — 목록을 스크래치 파일에 쓰고 스크립트가 그 파일을 읽게 한다.»
2. **마이그레이션 «판 N 이 하나도 안 남는다» 셈은 스냅샷 payload 의 레이아웃도 센다.** 틀린 것: `0028` 의 셈이 `payload->'pages'` 의 판만 세어, payload 의 `layouts` 를 안 옮기는 변조(M2)에 살았다. 자리: `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 의 «마이그레이션을 새로 두면 …» 줄 뒤. 넣을 문장: «**문서를 옮기는 마이그레이션의 «남은 옛 판 0» 셈은 문서가 사는 자리 전부를 센다** — 페이지 · 레이아웃 · 두 모듈 표에 더해 스냅샷 payload 의 `pages[]` · `layouts[]` 둘 다다(`apps/api/test/node-zones-migration.test.ts` 의 `formsIn` 처럼 글자를 JSON 으로 읽어 키를 가리지 않고 걷는다).»
3. **웹 build-test 가 다른 앱 소스를 정적 `import` 하면 `pnpm typecheck` 가 그 소스 옆에 `.js` · `.d.ts` · `.map` 을 흘린다.** 틀린 것: `form-primary-button.test.ts` 의 첫 판이 `../../api/src/db/migrations/0028-node-zones` 를 `import` 하자 `tsc --build` 가 TS6059 · TS6307(웹 `rootDir` 밖)로 실패하면서 `apps/api/src/db/migrations/` 에 `0028-node-zones.js` 등 넷을 냈다 — 마이그레이션 디렉터리에 같은 이름의 `.js` 가 선다. 자리: `.ruler/20-verification.md` 「`apps/*`·`packages/*`·`system-themes/*` 바로 밑에 `tsconfig*.json` 을 새로 두지 않는다」 절의 How to apply 뒤. 넣을 문장: «**한 앱의 케이스가 다른 앱의 소스를 쓰려면 정적 `import` 대신 실행 때 경로로 싣는다**(`await import(fileURLToPath(new URL(…, import.meta.url)))` — `apps/web/build-test/form-primary-button.test.ts`). 정적 `import` 는 그 파일을 이 프로젝트의 빌드에 끌어들여 타입검사가 실패하면서도 소스 옆에 산출물을 흘린다 — `git status` 에 `.js` 가 뜨면 지우고 게이트를 다시 돈다.»
