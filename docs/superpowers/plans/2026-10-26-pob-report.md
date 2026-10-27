# POB 보고 — 파일첨부 · 반복 행 표(PO-B)

브리프: `.worktrees/.coord/brief-pob.md`(공통 규칙 `common-w13.md` · 키 `pob`). 기준은 `feat/popup` 의 설계 커밋(`a5261076` · `c59c53c4`) 위에 main(6단계 결정 · `.ruler/30-delegation.md` 한 문장)을 한 번 합친 판 `3c0c3644`. 설계 `docs/superpowers/specs/2026-10-26-popup-attach-repeat-design.md` «4» · «5» · «6» · «7» · «9» · «11» PO-B 1 ~ 8. Q1 · Q5 는 (가) — 파일첨부는 꼴만, 반복 행 표는 같은 `DataGrid` 의 프리셋 카드. 워크트리 `feat-attach` · Postgres 5504 · api 3104 · node v24.21.0(모든 판).

스크래치 뿌리 `S` = `/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound--worktrees-feat-attach/2e980b71-f2b9-4d57-83cd-d4987dab0a9c/scratchpad`. 변조는 `S/mut/run.py`(백업 이름은 경로 전체 · 맞은 수 1 · 복원 뒤 `filecmp` 바이트 비교) + `S/mut/unit.json` · `S/mut/browser.json`, 진행 줄 `S/mut/*.status`.

## PO-A 와 겹친 파일 · A 위로 옮길 때 다시 잴 것

PO-A(`feat/popup`)와 이 브랜치가 함께 고친 파일 — 설계 «나란히 돌릴 때 미리 나눈 것» 의 자리 그대로다(목록 끝 · 표에 한 줄씩).

| 파일 | 이 트랙이 더한 것 | 합칠 때 |
| --- | --- | --- |
| `packages/schema/src/component/define.ts` | `EditorControl` 의 `fileList` · `ComponentDef.presets` · `ComponentPreset` · `NodeTemplate` · `defineComponent` 의 프리셋 검사 | A 의 `initial` 의 `interactions` 줄과 나란히 |
| `packages/schema/src/component/catalog/index.ts` | `FileAttachDef` 등록(`AffixDef` 뒤) · `assertPresetLabels` · `assertPresets` | A 의 `PopupDef` · 뿌리 판정과 나란히 |
| `packages/schema/src/index.ts` | `ComponentPreset` · `NodeTemplate` 타입 · `presetOf` · `templateNode` | 내보내기 목록 |
| `packages/schema/test/component/catalog.test.ts` | 36 종 · 구역 표에 `FileAttach` | **합친 판은 37 종** · 구역 표에 둘 다 |
| `packages/schema/test/node-display.test.ts` | `FileAttach` 요약 셋 · 덮음 표 | 덮음 표에 둘 다 |
| `packages/renderer/test/prop-marks.test.tsx` | 인구조사 `FileAttach` 칸(표지 없음 — 아래 «결정») | 둘 다 |
| `packages/theme-sdk/src/version.ts` · `package.json` | 1.8.0 | 같은 판 — 한쪽 그대로 |
| `packages/theme-sdk/src/default-views/index.ts` | `FileAttach: FileAttachView` · `LONG_WORD_CSS` 에 `FileAttach` | 등록 · 셀렉터 줄 |
| `packages/theme-gallery/src/samples.ts` | `FileAttach` 다섯 · `DataGrid` 끝 둘 · `Field` 끝 하나 · 도우미(`presetSample` · `fileAttach` · 긴 이름 둘) | 표본 끝 · A 의 `gallery.tsx` 뿌리 감싸기 위에서 갤러리 · `check` 를 다시 돈다 |
| `system-themes/admin/{package.json, src/manifest.ts, test/admin.test.ts}` | 1.8.0 · `^1.8.0` | 같은 판 |
| `system-themes/admin/src/theme.css` | 파일첨부 절(«액션» 절 앞) · 폼 단추 구역 규칙에 파일첨부 한 줄 | 절 단위 |
| `system-themes/admin/checksums.json` | `system-admin@1.8.0` = 이 브랜치 빌드의 값 | **합친 판에서 `pnpm build` 뒤 `shasum -a 256` 으로 다시 적는다** |

A 위로 옮긴 판에서 다시 잴 것: ① `packages/schema/test/component/catalog.test.ts` 의 종 수 37 · `packages/theme-kit/build-test/dev.test.ts` 의 `kinds` 37(이 브랜치는 main + 이 트랙 = 36) ② `checksums.json` 의 1.8.0 sha256(합친 빌드) ③ 생성물 `apps/web/public/llms.txt`(`pnpm vitest run apps/web/test/llms-txt.test.ts -u`) ④ 갤러리 · `wb-theme check` · `shots`(A 의 뿌리 감싸기 위에서 B 의 표본) ⑤ `.sample-card` 수(`dev.test.ts` — 지금 6 · 이 트랙이 안 바꿨다) ⑥ 실브라우저 `palette-preset` · `file-attach-narrow`(팔레트 카드 · 축소판 차례가 A 의 카드 변화와 겹치는지).

## 바꾼 것

| 걸음 | 자리 | 무엇 |
| --- | --- | --- |
| 1 카탈로그 | `packages/schema/src/component/catalog/input.ts` | `FileEntrySchema`(`{ name ≤ 200, size ≤ 20 }`) · `FILES_MAX` 20 · `FileAttachDef`(입력 갈래 · `files` · `maxFiles` 0 ~ 99 기본 1 · `maxSize` ≤ 20 자 기본 «100 MB» · `hint` · 상태 `disabled` · «단추» 구역 기본 `[파일추가][항목 제거][전체 항목 제거]` · 요약 «파일 N개 · 최대 M개») |
| 1 이름 | `packages/renderer/src/render.tsx` | `NAMED_PIECES` — 값 칸 · 셀 틀 · 제 칸의 `FileAttach` 도 필드 이름을 받는다(옛 `VALUE_PIECES` 일곱 + `FileAttach`) |
| 2 위젯 | `packages/schema/src/component/define.ts` · `apps/web/src/panels/controls/list-control.tsx` · `panels/property-panel.tsx` | 편집 칸 `fileList` — 목록 위젯 넷째 꼴(이름 · 크기 두 칸 · `FILES_MAX` 에서 «항목 추가» 끔 · 빈 목록 받음) |
| 3 SDK 뷰 | `packages/theme-sdk/src/default-views/input.tsx` · `index.ts` · `version.ts` | `FileAttachView`(조각 `actions` · `list` · `checkHead` · `checkbox` · `file` · `check` · `fileName` · `fileSize` · `drop` · `limit` · `limitCount` · `limitSize`) · 기본 CSS · `LONG_WORD_CSS` 에 파일첨부 · SDK 1.8.0 |
| 3 기본테마 | `system-themes/admin/src/theme.css` 외 | 테두리 상자 · 작은 단추(보조 꼴) · 목록 머리 · 빈 목록 줄 · 빨간 굵은 한도 수 · 꺼진 상자 · 판 1.8.0 · `checksums.json` |
| 4 `check` | `packages/theme-kit/src/check.ts` | `fileAttachProblems` F1 ~ F4(출처 `file`) |
| 5 프리셋 | `define.ts` · `component/preset.ts`(새 파일) · `catalog/index.ts` · `catalog/data.ts` | `ComponentDef.presets` · `templateNode` · `presetOf` · `assertPresets`(템플릿의 타입 · props · 구역 · 받는 타입 · 설 자리 — 실을 때 던진다) · `assertPresetLabels` · `DataGrid` 의 `repeatRows` «반복 행 표» |
| 5 웹 | `edit/create-node.ts` · `edit/structure-drop.ts`(`Placing` 의 `preset`) · `drag/use-placement.ts` · `palette/placeable.ts` · `component-palette.tsx` · `palette-thumbs.tsx` | `createNode(type, nextId, preset)` · 프리셋 카드(타입 카드 바로 뒤 · 열쇠 `<타입>:<프리셋>`) · 축소판은 그 카드가 넣는 노드 |
| 6 표본 | `packages/theme-gallery/src/samples.ts` | 파일첨부 다섯(빈 · 셋 · 크기 한도만 · 한도 없음 · 값 칸 안 개수 한도만) · 반복 행 표 둘(프리셋 · 기간 · 합계 행) · `Field` «단순 파일 선택 줄» |
| 6 스타터 | `packages/theme-kit/template/SKILL.md` | 카탈로그 36 종 · `FileAttach` 뷰 계약 한 절 |
| 7 | `apps/web/config/llms-txt.ts` → `apps/web/public/llms.txt` · `packages/mcp/skill/SKILL.md` | `FileAttach` 한 줄 · «Editor preset» 줄(템플릿을 정의에서 읽어 싣는다) · 스킬 두 문단 |
| 정본 | `docs/superpowers/specs/2026-08-03-wirebound-design.md` | §5 표(`DataGrid` 의 프리셋 카드 · `FileAttach` 줄 · 파일 목록) · §5.1 «프리셋» · §6.1 «파일첨부» · §9 팔레트 카드 · 목록 칸 · §12.6 |
| 8 실브라우저 | `apps/web/build-test/palette-preset.test.ts` · `file-attach-narrow.test.ts` | 아래 «잰 값» |

## 결정과 이유

- **`FileAttach` 의 표지는 없다**(설계 «9» 의 `FileAttach: { disabled }` 를 따르지 않음) — `disabled` 는 상태(`data-wb-state` · `aria-disabled`)로 이미 실린다. `marks.ts` 머리말 «상태로 실리는 prop 은 표에 넣지 않는다» 와 `packages/renderer/test/prop-marks.test.tsx` 의 규칙(불리언은 표지 · 상태 · 변형 가운데 하나)이 그렇게 정한다.
- **파일 이름은 빈 글도 받는다**(설계 꼴의 `min(1)` 을 뺐다) — 목록 위젯의 «항목 추가» 는 다른 꼴처럼 빈 줄을 더하므로, 빈 이름을 막으면 더하는 순간 422 다. 선택지(`OptionSchema` 의 `label`)와 같다.
- **필드 이름을 받는 집합을 따로 둔다**(`NAMED_PIECES`) — 설계 «`fieldNames` 를 넓힌다» · «값 조각이 아니다» 를 함께 지키려고 조합 입력의 조각 목록을 고치지 않고 이름 받는 집합만 넓혔다. 결과: 값 칸에 입력이 먼저 있으면 파일첨부는 «라벨 + 차례»(«첨부 2»)다 — 이름 붙는 조각 둘의 규칙 그대로(실브라우저 «파일첨부» 판이 잰다).
- **체크는 그림 조각**(`<span data-wb-part="checkbox">`) — 설계 꼴의 `<input type="checkbox" disabled>` 대신. 그리드 선택 칸과 같은 꼴이고, SDK 기본 뷰는 실제 `<input>` 을 안 그린다(«포커스 받는 요소는 단추 · 링크 · 입력 칸만» — 꺼진 입력이라도 테마 작성자가 `disabled` 를 빼면 캔버스 단축키가 막힌다). 머리 체크 칸에는 `aria-label="고르기"` 를 단다.
- **프리셋 템플릿은 실을 때 구조 검사 · 검증은 케이스로** — 설계 «`assertZoneReferences` 가 템플릿을 `validatePage` 로 검증» 을 그대로는 못 짓는다: `validate.ts` → `display.ts` 가 `catalog/index.ts` 의 `CATALOG_DEFS` 를 맨 위에서 읽어, 카탈로그 모듈이 `validate` 를 import 하면 그 모듈이 먼저 실리는 판에서 고리가 덜 지은 값을 읽는다. 그래서 실을 때는 같은 축(타입 · props · 구역 · 받는 타입 · 설 자리 · 변형)의 구조 검사(`assertPresets`)를 던지고, `validatePage` 이슈 0 은 `packages/schema/test/component/preset.test.ts` 가 프리셋마다 잰다.
- **카드 열쇠** — 타입 카드는 타입 이름 그대로(`data-wb-palette-card="DataGrid"` 를 쓰는 기존 판 열여섯 자리가 그대로 선다), 프리셋 카드는 `DataGrid:repeatRows`. 카드 · 축소판 창 · 표본이 같은 열쇠로 짝짓는다(`canvas-cost` · `n20-layout` 이 창 → 표본을 그 속성으로 잇는다).
- **프리셋 카드의 축소판은 넣을 노드**(설계 «갤러리의 같은 표본») — 갤러리 표본 «DataGrid — 반복 행 표(프리셋)» 도 같은 `templateNode` 로 지어 둘이 같은 꼴이다. 축소판은 `createNode(type, …, preset)` 으로 짓는다(카드가 보이는 것 = 넣는 것).
- **넣기 입구** — 프리셋이 닿는 것은 팔레트 «넣기»(안 · 뒤 · 구역 줄 · 페이지 끝) · 캔버스 끌기 · 트리 끌기 셋이다. 붙이기 · 모듈 넣기 · 들여쓰기 · 내어쓰기(`edit/editor-shortcuts.ts` 의 `edits: true` 일곱 — 되돌리기 · 다시 실행 · 지우기 · 복제 · 위 · 아래 · 들여 · 내어 · 이름 바꾸기)는 있는 노드를 다루고 새 노드를 안 짓는다 — 프리셋으로 지은 그리드는 보통 그리드다. 판정(받는 타입 · 설 자리 · 잠금)은 `Placing.type` 그대로라 프리셋이 안 든다.
- **캔버스 미리보기는 타입 그대로**(`canvas/canvas-preview.ts` 의 `previewDocument` — 새 노드는 `{ id, type }` 하나) — 프리셋 카드를 끌어도 «그리드» 카드와 같은 빈 그리드 미리보기다. 고치지 않았다(«남은 것»).
- **목록 위젯은 다른 목록 꼴과 같은 저장 길** — 초안은 위젯 안 한 칸 몫이고 blur · Enter 에 통째 `replace` 하나다. 저장 단추로 보내는 글 상자가 아니라 `PanelDraftsProvider` 에 안 든다(`.ruler/30-delegation.md` «우측 탭에 저장 단추로 보내는 글 상자» 문장의 대상이 아니다 — 탭 왕복 · 모드 왕복은 blur 가 먼저 커밋하는 기존 표 그대로다 · `property-panel.tsx` 의 `PropControl` 머리말).
- **실시간 겹침의 전제** — 편집은 prop 하나의 `replace` 이고 `test` 가 없다. 두 사람이 같은 목록의 다른 줄을 고치면 늦게 닿은 쪽의 목록 전체가 이긴다(리베이스가 남의 판 위에 그대로 다시 얹는다 — `store/anchored-ops.ts` 머리말 «필드 값 `replace` 는 … 뒤의 것이 이긴다»). 다른 목록 칸 · 글 칸과 같아 이 트랙에서 바꾸지 않고 정본 §9 «속성 탭» 에 적었다(«남은 것»).
- **스타터 템플릿에 빈 CSS 자리를 두지 않았다** — 템플릿 `src/theme.css` 는 컴포넌트마다의 자리를 갖지 않는다(Page · Card · Button 셋뿐). 대신 템플릿 `SKILL.md` 의 뷰 계약 절에 조각 이름과 `check` 규칙을 적었다.

## 잰 값

### 좁은 칸(실브라우저 · `build-test/file-attach-narrow.test.ts` · 내보낸 번들의 화면 모드)

페이지 셋 — «폼표»(2열 폼 표의 값 칸에 파일첨부 둘 · 반복 행 표 하나) · «격자»(격자 배치 2열에 둘) · «카드»(카드 몸통에 둘). 파일첨부의 파일 줄: «통장사본.PDF | 2.1 MB» · 하이픈 없는 긴 영문 이름 | «100.5 MB» · 띄어 쓰지 않은 한글 이름 | «480 KB». 반복 행 표는 입력 둘 · 날짜 · «삭제» 단추 × 2 줄. 문서 = 창 폭(전부 `n/n`) · 셀 안 조각이 제 행 밖 0/8 · 크기 칸 줄 수 전부 1 · 이름 칸 글자가 칸 안 · 파일첨부 안 요소 · 글자의 넘침 ≤ 0(기본테마 −9 · SDK 0 — 오른끝까지의 여유 px).

| 테마 | 페이지 | 창 | 문서 | 이름 칸 줄 수(파일첨부마다) | 안 넘침 | 표 오른끝 − 칸 · 스크롤 상자 − 표 | 조각 밖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 기본테마 | 폼표 | 390 | 390/390 | [1, 2, 2] / [1, 2, 2] | -9 | -13 · 0 | 0/8 |
| 기본테마 | 폼표 | 720 | 720/720 | [1, 1, 1] / [1, 1, 1] | -9 | -175 · 0 | 0/8 |
| 기본테마 | 폼표 | 961 | 961/961 | [1, 3, 2] / [1, 3, 2] | -9 | -13 · 0 | 0/8 |
| 기본테마 | 폼표 | 1000 | 1000/1000 | [1, 2, 2] / [1, 2, 2] | -9 | -13 · 0 | 0/8 |
| 기본테마 | 폼표 | 1280 | 1280/1280 | [1, 2, 1] / [1, 2, 1] | -9 | -96 · 0 | 0/8 |
| 기본테마 | 격자 | 390 | 390/390 | [3, 11, 10] | -9 | 0 · 0 | 0/8 |
| 기본테마 | 격자 | 720 | 720/720 | [1, 2, 2] | -9 | 0 · 0 | 0/8 |
| 기본테마 | 격자 | 961 | 961/961 | [1, 2, 1] | -9 | 0 · 0 | 0/8 |
| 기본테마 | 격자 | 1000 | 1000/1000 | [1, 2, 1] | -9 | 0 · 0 | 0/8 |
| 기본테마 | 격자 | 1280 | 1280/1280 | [1, 1, 1] | -9 | 0 · 0 | 0/8 |
| 기본테마 | 카드 | 390 | 390/390 | [1, 2, 2] | -9 | 0 · 0 | 0/8 |
| 기본테마 | 카드 | 720 · 961 · 1000 · 1280 | n/n | [1, 1, 1] | -9 | 0 · 0 | 0/8 |
| SDK | 폼표 | 390 | 390/390 | [1, 2, 2] / [1, 2, 2] | 0 | -31 · 0 | 0/8 |
| SDK | 폼표 | 720 | 720/720 | [1, 1, 1] / [1, 1, 1] | 0 | -233 · 0 | 0/8 |
| SDK | 폼표 | 961 | 961/961 | [1, 2, 2] / [1, 2, 2] | 0 | 0 · 0 | 0/8 |
| SDK | 폼표 | 1000 | 1000/1000 | [1, 2, 2] / [1, 2, 2] | 0 | -13 · 0 | 0/8 |
| SDK | 폼표 | 1280 | 1280/1280 | [1, 2, 2] / [1, 2, 2] | 0 | -153 · 0 | 0/8 |
| SDK | 격자 | 390 | 390/390 | [2, 6, 7] | 0 | 0 · 0 | 0/8 |
| SDK | 격자 | 720 · 961 · 1000 | n/n | [1, 2, 2] | 0 | 0 · 0 | 0/8 |
| SDK | 격자 | 1280 | 1280/1280 | [1, 1, 1] | 0 | 0 · 0 | 0/8 |
| SDK | 카드 | 390 | 390/390 | [1, 2, 2] | 0 | 0 · 0 | 0/8 |
| SDK | 카드 | 720 · 961 · 1000 · 1280 | n/n | [1, 1, 1] | 0 | 0 · 0 | 0/8 |

- 문턱 바로 위(961)의 폼 표 값 칸이 가장 좁다 — 기본테마에서 긴 영문 이름이 세 줄(1000 · 1280 은 두 줄 · 720 은 960 아래 판이라 한 줄에 쌍 하나로 넓어져 한 줄).
- 격자 배치 2열은 390 에서도 2열이라(테마의 격자 배치는 창 폭으로 안 접는다) 이름 칸이 열한 줄까지 꺾인다 — 칸 안이고 넘침은 없다(«남은 것»).
- 한도 수 색 — 기본테마 `rgb(239, 68, 68)`(빨강) · SDK 기본은 글 색 그대로(케이스가 둘을 가른다).
- PPTX 화면 그림 폭 `[1440, 1548, 1440]`(폼표 · 격자 · 카드 · 캡처 720 × 2) — 격자 배치 2열은 찍는 판이 그리드의 스크롤 상자를 풀어 표 전체 폭(774)으로 펼친다(정본 §6.1 «그리드» 의 찍는 판 — 프리셋 없이 지은 그리드도 같다). 케이스는 폼표 · 카드의 1440 만 단언하고 격자는 ≥ 1440 으로 적는다.

### 기본테마 1.7.0 에 고정된 프로젝트(`.ruler/20-verification.md` «SDK 기본 CSS 를 바꾸는 트랙» · «카탈로그에서 타입을 … 바꾸는 트랙»)

main(`afaf5687` + 문서 두 커밋 — `git archive main`)을 `S/main` 에 풀어 `pnpm install --frozen-lockfile --prefer-offline --ignore-scripts` · `pnpm build` → `system-admin-1.7.0.wbtheme` sha256 `b9eba8fe…74ab` = `checksums.json` 의 1.7.0 줄(사용자 DB 의 판). 이 브랜치의 실브라우저 판(`editor-stack`)에 `theme_packages` 로 넣고 1.7.0 에 고정한 프로젝트(2열 폼 표 — 값 칸에 파일첨부 · 반복 행 표)를 스크래치 탐침으로 쟀다(케이스로 안 남김 — main 빌드 산출물이 필요하다).

| 무엇 | 값 |
| --- | --- |
| 바인딩 PUT | 200 |
| 내보내기 미리보기 | `themeId` `system-admin@1.7.0` · `themeWarning` `null` |
| 번들 창 720 · 1000 · 1280 | 문서 `720/720` · `1000/1000` · `1280/1280` · `[data-wb-error]` 0 · 조각 `list` · `file` · `limit` · `limitCount` · `actions` 각 1(SDK 1.8.0 기본 뷰) · 파일첨부 오른끝 − 칸 −66 · −13 · −13 · 한도 수 색 `rgb(15, 23, 42)`(1.7.0 은 파일첨부 규칙이 없어 글 색 그대로) |

### 프리셋 · 파일첨부 입구(실브라우저 · `build-test/palette-preset.test.ts`)

- 데이터 갈래 카드 차례에서 `DataGrid` 바로 뒤가 `DataGrid:repeatRows` · «넣기» 이름 «반복 행 표 넣기» · 축소판(같은 카드 창의 표본)에 열 3 · 입력 ≥ 2.
- 넣기 다섯(트리 줄 끌어 놓기 · 뿌리 «넣기» · 카드 «바닥» 구역 줄 · 잎(파일첨부) 뒤 · 캔버스 끌어 놓기) → 서버의 프리셋 그리드 다섯이 다 템플릿 꼴(id 를 뗀 꼴 같음) · 노드 45 개 id 서로 다름 · 자리 `[앞 글, 표, 카드, 파일첨부, 표, 그리드, 필드, 표, 끝 글, 표]` + 카드 바닥에 하나 · 캔버스의 프리셋 그리드마다 입력 4(2 행 × 2).
- 되돌리기 한 번 → 서버 문서가 넣기 전과 바이트 같음.
- 행을 고른 «넣기» — 프리셋 · «그리드» 카드가 같은 문장 «행에는 칸만 놓을 수 있습니다» · 서버 그대로.
- 필드(값 칸에 입력 하나)를 고른 «파일첨부 넣기» → 값 칸 끝에 단추 셋 든 파일첨부 · 이름 «첨부 2»(입력은 «첨부 1») · 빈 목록 줄 1 · 한도 «최대 1개 100 MB 제한» · «파일» 칸에서 줄을 더하고 이름 · 크기를 치면 서버 `files` 가 그 값 · 캔버스의 `fileName` 이 그 글 · 빈 목록 줄 0.

### 실행 수(이 트랙이 더하거나 바꾼 파일 — 단독 실행)

| 파일 | 통과 / 실행 |
| --- | --- |
| `packages/schema/test/component/preset.test.ts` | 18 / 18 |
| `packages/renderer/test/file-attach-view.test.tsx` | 7 / 7 |
| `packages/theme-kit/test/check.test.ts` | 37 / 37 |
| `apps/web/test/panels/file-list-control.test.tsx` | 6 / 6 |
| `apps/web/test/edit/create-node.test.ts` · `apps/web/test/palette/placeable.test.ts` | 19 / 19 |
| `apps/web/build-test/palette-preset.test.ts` | 3 / 3 |
| `apps/web/build-test/file-attach-narrow.test.ts` | 5 / 5 |

## 혼자 죽는 변조

`S/mut/run.py` — 변조마다 겨누는 파일만 돌린다(맞은 수 1 · 경로 전체 백업 · 복원 뒤 `filecmp` 같음 · 빌드를 거치는 변조는 복원 뒤 다시 빌드). 모든 판 node v24.21.0. «실패 / 실행» 은 그 파일의 통과 + 실패다. 실패 값은 json 의 첫 줄.

### 단위 · jsdom(`S/mut/unit.json` — 28 판 · 모두 값으로 죽음)

| 변조 | 자리 | 무엇을 뗐나 | 죽은 케이스 | 실패 / 실행 | 실패 값 |
| --- | --- | --- | --- | --- | --- |
| U1 | `schema/component/preset.ts` | `templateNode` 의 props 베끼기(템플릿 객체를 그대로 넘김) | `templateNode` «템플릿과 값을 나누지 않는다» | 1 / 18 | `{ label: '바뀜' }` ≠ `{ label: '가' }` |
| U2 | `catalog/index.ts` `assertPresets` | 받는 타입 검사 | «받지 않는 타입» | 1 / 18 | 던지지 않음 |
| U3 | 같은 함수 | 설 자리 검사 | «설 자리 밖» | 1 / 18 | 던지지 않음 |
| U4 | 같은 함수 | 변형을 prop 에서 짓는 타입의 `variant` 검사 | «… variant» | 1 / 18 | 던지지 않음 |
| U5 | 같은 함수 | 몸통을 구역 맵에 둔 판 검사 | «몸통을 구역 맵에» | 1 / 18 | 던지지 않음 |
| U6 | 같은 함수 | props 규격 검사 | «props 규격 밖» | 1 / 18 | 던지지 않음 |
| U7 | 같은 함수 | 모르는 타입 검사 | «모르는 타입» | 1 / 18 | 던지지 않음 |
| U8 | `define.ts` `defineComponent` | 프리셋 키 꼴 검사(`ZONE_NAME_PATTERN`) | «프리셋 선언 키 꼴 · 겹침 · 이름 · 노드 타입» | 1 / 18 | 던지지 않음 |
| U9 | `catalog/input.ts` | `files` 의 `.max(FILES_MAX)` | «파일 목록은 { name, size } 배열이고 상한 …» | 1 / 18 | `true` ≠ `false` |
| U10 | `catalog/data.ts` | «반복 행 표» 템플릿의 `GridRow.repeat` 2 → 3 | 카탈로그 «반복 행 표» · `createNode` 프리셋 | 2 / 31 | `{ repeat: 3 }` ≠ `{ repeat: 2 }` · 노드 꼴 |
| U11 | `renderer/render.tsx` | `NAMED_PIECES` 의 `FileAttach` | «값 칸 안이면 필드 이름» | 1 / 7 | `'파일첨부'` ≠ `'통장사본'` |
| U12 | `theme-sdk/default-views/input.tsx` | 빈 목록 안내 줄 | «빈 목록은 안내 줄 하나 …» | 1 / 7 | `[]` ≠ `['끌어 놓으세요']` |
| U13 | 같은 파일 | 한도 없음이면 한도 줄을 안 그림 | «한도 없음» | 1 / 7 | `'최대 제한'` ≠ `null` |
| U14 | 같은 파일 | 개수 한도 0 도 한도로 읽기(`> 0` → `>= 0`) | «한도 크기만» · «한도 없음» | 2 / 7 | `'최대 0개 10 MB 제한'` ≠ `'최대 10 MB 제한'` |
| U15 | `theme-kit/check.ts` F1 | 파일 줄 수 판정 | F1 셋(첫 줄 뺌 · 두 번 · 조각 이름) | 3 / 37 | `[]` ≠ 표본 셋 |
| U16 | 같은 파일 F2 | 빈 목록 안내 판정 | F2 둘(늘 그림 · 안 그림) | 2 / 37 | `[]` ≠ 표본 |
| U17 | 같은 파일 F3 | 한도 값 조각 견줌 | F3 «조각 없이 한 줄로» | 1 / 37 | `[]` ≠ 표본 넷 |
| U18 | 같은 파일 F3 | 한도 없음인데 한도 줄 | F3 «한도가 없어도 한도 줄» | 1 / 37 | `[]` ≠ `['FileAttach — 한도 없음 · 비활성']` |
| U19 | 같은 파일 F3 | `limits.length !== 1` 가드 통째 | F3 «뿌리 밖 형제로» | 1 / 37 | **`TypeError`(값이 아니다)** — 가드를 떼면 뒤 줄이 `limits[0]` 을 읽어 던진다 |
| U19b | 같은 자리 | 가드는 두고 그 보고 줄만(`out.push` → `void`) | F3 «뿌리 밖 형제로» | 1 / 37 | `[]` ≠ 표본 넷 — 값으로 죽음 |
| U20 | 같은 파일 F4 | 목록이 `table` 인지 | F4 «목록을 div 로» | 1 / 37 | `[]` ≠ 표본 다섯 |
| U21 | 같은 파일 F4 | 머리 칸이 `th scope="col"` 인지 | F4 «머리 칸을 td 로» | 1 / 37 | `[]` ≠ 표본 다섯 |
| U22 | `web/edit/create-node.ts` | 프리셋 갈래 | `createNode` 프리셋 둘(템플릿 · 없는 키 `null`) | 2 / 13 | 노드 꼴 · `null` 아님 |
| U23 | `web/palette/placeable.ts` | 프리셋 카드 | «제 타입 카드 바로 뒤 · 열쇠 «타입:키»» | 1 / 6 | `[]` ≠ `[['DataGrid:repeatRows', …]]` |
| U24 | `web/panels/controls/list-control.tsx` | 파일 꼴의 값 이름(`{ name, size }` → `{ key, value }`) | 파일 목록 «통째로 낸다» · «항목 추가 · 옮기기» | 2 / 6 | `replace` 값 |
| U25 | 같은 파일 | `FILES_MAX` 에서 «항목 추가» 끔 | «상한에서는 꺼지고 …» | 1 / 6 | `false` ≠ `true` |
| U26 | `web/config/llms-txt.ts` | 프리셋 줄을 첫 프리셋만 빼고 냄(`slice(1)`) | `public/llms.txt` 스냅숏 | 1 / 2 | 스냅숏 다름 |
| U27 | `catalog/index.ts` `assertPresetLabels` | 이름 겹침 검사 | «카드 이름이 겹치면 던진다» | 1 / 18 | 던지지 않음 |

U19 는 가드를 통째로 떼면 뒤 줄이 빈 목록의 첫 칸을 읽어 던진다 — 그 가드는 보고와 함께 뒤 줄을 지킨다. 보고만 뗀 U19b 가 그 케이스를 값으로 죽인다.

### 실브라우저(`S/mut/browser.json` — 6 판 · 모두 값으로 죽음)

| 변조 | 자리 | 무엇을 뗐나 | 죽은 케이스 | 실패 / 실행 | 실패 값 |
| --- | --- | --- | --- | --- | --- |
| B1 | `palette/component-palette.tsx` | 카드 «넣기» 의 `preset` | `palette-preset` 넣기 다섯 · 되돌리기 | 2 / 3 | `['뿌리 넣기', 1]` ≠ `['뿌리 넣기', 2]` · 프리셋 그리드 `[]` |
| B2 | `drag/use-placement.ts` | 끌어 놓기의 `preset` | 넣기 다섯 | 1 / 3 | `['트리 놓기', 0]` ≠ `['트리 놓기', 1]` |
| B3 | `palette/palette-thumbs.tsx` | 프리셋 카드 축소판(타입의 첫 표본으로) | 넣기 다섯(축소판 머리) | 1 / 3 | 열 4 ≠ 3 |
| B4 | `system-themes/admin/src/theme.css` | 한도 수의 `color: danger`(빌드 거침) | `file-attach-narrow` 기본테마 | 1 / 5 | 판마다 `red: true` → `false` |
| B5 | `theme-sdk/default-views/index.ts` | `LONG_WORD_CSS` 의 `FileAttach`(빌드 거침) | 기본테마 · SDK | 2 / 5 | 목록 넘침 `"list +44"` ~ `"list +349"` · 문서 `534/390` · `555/390` · `1174/1000` · 긴 이름 안 꺾임 |
| B6 | `theme-sdk/default-views/input.tsx` | 크기 칸 `white-space: nowrap`(빌드 거침) | 기본테마 · SDK | 2 / 5 | 크기 칸 줄 수 1 → 2 ~ 4 |

B1 · B2 는 처음 묶음에서 폴의 «10000ms 안에 안 섰다» 로 죽었다 — 폴의 끝 조건이 «프리셋 꼴 그리드 수» 라 단언할 값이 끝 조건에 들었다. 폴은 «그리드가 하나 늘었다»(꼴 무관)만 기다리고 꼴 수는 그 뒤 `expect` 로 보게 고쳤다(`2deae51e`). 위 표의 B1 ~ B3 은 고친 뒤 다시 잰 값(`B1r` ~ `B3r`), B4 ~ B6 은 기본 리포터를 함께 준 재측정(`B4r` ~ `B6r` — 처음 묶음도 같은 케이스가 같은 수로 죽었다).

변조마다 죽은 케이스는 그 변조가 겨눈 케이스뿐이다(위 «죽은 케이스» 밖의 실패 0). U10 · U14 · U15 · U16 · U22 · U24 의 둘 · 셋은 한 장치를 함께 재는 케이스다(같은 갈래의 다른 판).

## 게이트

`S/gate.zsh` 하나로 `nohup nice -n 10 caffeinate -i` 아래에서 돌렸다 — node v24.21.0 · HEAD `2deae51e` · 14:28 ~ 15:31. 그 구간에 잠듦 없음(`pmset -g log` 의 마지막 `Sleep` 줄이 09:29).

| 단계 | 종료 | 실행 | 통과 | 실패 | 건너뜀 |
| --- | --- | --- | --- | --- | --- |
| `pnpm fmt` · `pnpm lint` · `pnpm typecheck` · `pnpm build` | 0 · 0 · 0 · 0 | — | — | — | — |
| `pnpm test`(api 포함) | 1 | 8682 | 8678 | 3 | 1 |
| `pnpm test:build:serial` | 0 | 176 | 175 | 0 | 1 |
| `pnpm test:browser` | 1 | 607 | 602 | 4 | 1 |

빨강 일곱 — 셋은 이 트랙의 몫이라 고쳤고(`912818c4`), 넷은 겹침 부하의 흔들림이다.

| 케이스 | 까닭 | 처리 |
| --- | --- | --- |
| `exporter/test/parity.test.tsx` «픽스처가 합쳐 카탈로그의 컴포넌트를 전부 쓴다» | 픽스처에 `FileAttach` 가 없다 | «넓은 표본» 의 폼 표에 파일첨부 필드 하나를 더했다 |
| `exporter/test/bundle-stateless-bytes.test.ts` 둘 | `assets/views.css` 해시(파일첨부 기본 규칙) · 위 픽스처로 «넓은 표본» 과 `index.html` 해시 | `WB_PRINT_DIGEST=1` 로 다시 지어 머리말에 까닭을 적었다 — 다른 파일 해시는 그대로 |
| `build-test/palette.test.ts` «축소판 — … 빈 카드가 없다» | 자가 카드 키(`DataGrid:repeatRows`)를 `data-wb-component` 와 그대로 견줬다 — 프리셋 카드의 표본은 `DataGrid` 노드다 | `CARD_THUMBS` 가 키의 `:` 앞을 견준다(소스는 그대로 · 고치기 전 판의 줄임 비 0.71 · 표본은 서 있었다) |
| `canvas-iframe` «늦게 온 테마 시트 …» · `canvas-preview` «끄는 중 bob 이 …» · `editor-logout-edits` «다른 탭에서 들어온 사람 …» | 판 카나리아(«시트가 실렸다» 거짓) · 놓을 자리 한 칸 아래 · `waitForURL` 8s 초과 | 아래 재실행 — 같은 무리가 기준선에서도 죽는다 |

**흔들림 판정** — 넷과 `palette` 를 한 실행에 겹친(4 파일 · 워커 3) 판을 세 번: HEAD 29/34 · 33/34 · 31/34 — 첫 게이트의 넷은 다 초록이고 판마다 다른 끌기 · 로그아웃 케이스가 죽었다(«떨림» 은 세 판 모두 — 놓을 자리 `@1` ≠ `@0`). 같은 묶음을 기준선 사본(`main` · 1.7.0 빌드 · 같은 DB 5504)에서 한 번: 30/34 — «끄는 중 bob» · «iframe 높이» · «로그아웃 다른 탭» · «띠를 지나가기만» 이 죽었다. `canvas-preview` 혼자 두 번은 6/6 · 6/6. `palette` + `canvas-preview` 둘만 겹친 판을 HEAD · 기준선 번갈아 둘씩: HEAD 21/21 · 20/21(«bob»), 기준선 18/21(«bob» · «띠» · «더블클릭 · Enter») · 21/21 — «떨림» 은 HEAD 두 판 모두 초록. 겹침 부하에서 끌기 판들이 흔들리는 것은 기준선의 성질이고 이 트랙이 연 것이 아니다(«떨림» 이 HEAD 4 파일 판에서만 세 번 죽은 것은 가르지 못했다 — 둘 겹침 · 혼자 판은 초록).

**고친 뒤** — HEAD `912818c4` 에서 `packages/exporter` 전부 + `apps/web/test/canvas/bundle-parity.test.tsx` 27 파일 483 / 483, `build-test/palette.test.ts` 15 / 15. 전량은 다시 돌지 않았다 — 고친 셋은 픽스처 · 자 둘이고 그 픽스처를 쓰는 파일은 위 27 파일이 전부다(`git grep -l broadFixture -- ':!docs'`).

**둘째 게이트(HEAD `912818c4` · 16:07 ~ 17:14) — 안 잰 판으로 버린다.** 같은 기계에서 다른 저장소(`pitwall` 워크트리)가 `timeout 1500 yes` 15 개로 CPU 부하 시험을 돌려 부하 평균이 124 였다(17:15). `pnpm typecheck` 23s → 107s, `pnpm test` 는 실행 6041(첫 게이트 8682 — `vitest-worker` 의 `onTaskUpdate` 시간 초과로 수집이 끊겼다) · 실패 22 가 거의 다 5s 시간 초과(`STACK_TRACE_ERROR`), serial 은 16 파일 가운데 2 파일 24 케이스만 돌았다. 실브라우저는 603 / 607(시간 초과 둘 · `layout-guides` «남이 Flex 를 세로로» 하나). 잠듦은 없었다. 그 부하는 남의 것이라 건드리지 않았다. 18:17 에도 부하 평균 42 · `yes` 15 개라 물음(`.coord/q-pob.md` Q1)을 올렸고, 코디네이터 답(18:58)은 **(나) 첫 게이트 + 고친 자리 재실행으로 끝낸다** 였다 — 전량 재게이트는 PO-A 위로 옮긴 뒤 병합 전에 돈다. 18:47 께 기계가 재부팅돼 세션이 끊겼고(Colima · DB 5504 는 코디네이터가 다시 세웠다), 스크래치 `S` 는 그때 지워졌다 — 이 보고의 `S/…` 경로(변조 스크립트 · json · 게이트 로그)는 더 없고, 값은 이 보고의 표가 전부다.

### 수의 등식(`vitest list` — 실행 없이 · 건너뜀은 안 센다)

기준선 = 병합 기준 `3c0c3644` 를 `git archive` 로 푼 사본(`pnpm build` 뒤). 케이스 열쇠는 (파일 · 이름).

| 프로젝트 | 기준선 | + | − | HEAD |
| --- | --- | --- | --- | --- |
| unit | 2587 | 47 | 2 | 2632 |
| web | 3400 | 10 | 1 | 3409 |
| build | 175 | 0 | 0 | 175 |
| 실브라우저 | 598 | 8 | 0 | 606 |

− 셋은 이름을 고친 케이스다(`schema/test/component/catalog.test.ts` · `system-themes/admin/test/admin.test.ts` · `web/test/palette/placeable.test.ts` 각 하나 — + 에 새 이름으로 든다). + 의 파일: `preset.test.ts` 18 · `theme-kit/test/check.test.ts` 11 · `file-attach-view.test.tsx` 7 · `prop-marks.test.tsx` 6 · `node-display.test.ts` 3 · `catalog.test.ts` 1 · `admin.test.ts` 1 · `file-list-control.test.tsx` 6 · `create-node.test.ts` 2 · `placeable.test.ts` 2 · `file-attach-narrow.test.ts` 5 · `palette-preset.test.ts` 3. 게이트의 실행 수와는 건너뜀 하나씩(serial 176 = 175 + 1 · 실브라우저 607 = 606 + 1)이 다르다.

## 남은 것

- **마지막 HEAD(`912818c4` 뒤)의 전량 게이트** — 둘째 게이트가 남의 부하로 안 잰 판이 되어, PO-A 위로 옮긴 뒤 병합 전에 돈다(코디네이터 답 · 「게이트」).
- **목록 칸의 실시간 겹침** — 두 사람이 같은 파일 목록(· 키-값 · 선택지)의 다른 줄을 고치면 늦은 쪽의 목록 전체가 이긴다(전제 `test` 없음 · «결정»). 줄마다의 전제를 싣는 것은 목록 칸 넷 공통의 일이다(L).
- **프리셋 카드를 끌 때의 캔버스 미리보기**는 빈 그리드(타입만)다 — 놓으면 템플릿이 선다(L).
- **격자 배치 2열은 390 에서도 2열** — 파일첨부 이름 칸이 열한 줄까지 꺾인다(넘침 0 · L · 격자 배치의 좁은 창 접기는 이 트랙 밖).
- **PPTX 의 격자 배치 2열 칸 안 그리드**는 찍는 판이 표를 펼쳐 그림이 넓어진다(1548) — 5단계 찍는 판의 성질(L).
- **«더블클릭» · «드래그» 파랑**(빈 목록 안내 안 낱말 강조)은 로드맵 9(글 부분 강조)의 몫이다(설계 «4»).

## 지침

코디네이터 몫(`.ruler/*`)이라 고치지 않고 자리와 문장만 적는다.

1. **카탈로그에 타입을 더하면 내보내기 픽스처 · 번들 바이트도 센다** — `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 의 «하드코딩된 개수 하한 단언 …» 항목 끝에 넣을 문장:
   > 카탈로그에 타입을 더하면 `packages/exporter/test/parity.test.tsx` «무엇을 덮었나»(픽스처가 합쳐 카탈로그 전부를 쓴다)가 그 타입이 없는 픽스처를 빨강으로 낸다 — `packages/exporter/test-support/fixtures.ts` 의 «넓은 표본» 에 그 타입을 싣고, 그 픽스처 · 기본 뷰 CSS 가 바꾼 `packages/exporter/test/bundle-stateless-bytes.test.ts` 의 해시를 `WB_PRINT_DIGEST=1` 로 다시 지어 머리말에 까닭을 적는다. 둘은 `pnpm test` 전량에서야 걸려(브리프의 영역 게이트가 `packages/exporter` 를 안 돌면 못 본다) 이 트랙이 게이트에서 처음 봤다(`docs/superpowers/plans/2026-10-26-pob-report.md` 「게이트」).
2. **팔레트에 «타입:키» 카드를 더하면 카드 키를 타입으로 읽는 자를 센다** — 같은 절의 «여섯째 함정» 다음에 넣을 문장:
   > **일곱째 함정:** ⑦ **열쇠가 타입이라고 기대는 자는 프리셋 카드(«타입:프리셋 키»)를 빈 카드로 센다** — 축소판 셈(`apps/web/build-test/palette.test.ts` 의 `CARD_THUMBS`)이 카드 키를 `data-wb-component` 와 그대로 견줘 `DataGrid:repeatRows` 의 표본(`DataGrid` 노드)을 못 찾았다. 카드 키(`data-wb-palette-card` · `data-wb-palette-window` · `data-wb-palette-thumb`)를 타입과 견주는 자를 `git grep` 으로 세고 키의 `:` 앞으로 견주게 한다.
3. **겹침 부하의 끌기 흔들림은 기준선 성질이다** — 지침 문장이 아니라 이월 장부의 한 줄이다: `canvas-preview` · `palette` · `editor-logout-edits` 의 끌기 · 로그아웃 케이스가 4 파일 겹침(워커 3 · `nice`)에서 기준선 · HEAD 모두 판마다 다른 1 ~ 5 개가 죽는다(혼자는 초록). 실브라우저 전량에서 그 무리의 빨강은 겹친 판 재실행과 기준선 사본 대조로 가른다(위 「흔들림 판정」).
