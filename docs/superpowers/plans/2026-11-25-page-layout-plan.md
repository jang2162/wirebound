# 페이지 레이아웃 — 구현 계획

설계: `docs/superpowers/specs/2026-11-25-page-layout-design.md`. 기준은 main `f3acecc0`. 태스크는 앞 태스크의 산출물을 쓰는 차례로 적었다. 브리프 · 워커 규칙은 `AGENTS.md` 「워커에게 맡길 때 — wirebound」 를 따른다 — 이 문서에 사본을 두지 않는다.

**설계의 「정한 것 — 레이아웃 갈래」 다섯은 사용자가 답한 값이다** — «페이지 추가» 는 `subpage` · 일괄 입구 없음 · PPTX 서브페이지 캡처 폭 720 그대로 · 메뉴 숨김 없음 · 즐겨찾기 · 접기는 그림만.

## 차례와 병렬

```
T1 schema(판 7 · layout · 내비)
 ├─ T2 api 마이그레이션(문서 판 7) ─ T3 레이아웃 표 걷기(payload 5)
 └─ T4 테마 계약(SDK 1.10 · manifest · LayoutFrame · kit check)
        ├─ T6 캔버스 ─────────────┐
        ├─ T8 번들 · PPTX          ├─ T10 MCP · CLI · 문서 마무리
        └─ T9 기본테마 새 판(skt 뒤) ┘
T5 표시 옵션 표 · API(T1 과 무관 — 처음부터 나란히)
T7 에디터 UI(«레이아웃» 라디오 · «보기» 메뉴) — T5 · T6 뒤, rp · sp 병합 뒤
```

- **나눠 돌리지 않는 곳:** T1 → T2 → T3 은 한 사슬이다 — `packages/schema` 의 문서 판 · 마이그레이션 · 스냅샷 payload 가 서로 물려 있다(지침 «이 프로젝트에서 병렬화가 잘 맞는 지점» 의 `patch · validate · tree` 와 같은 성질). 한 워커가 차례로 한다.
- **나란히 돌려도 되는 곳:** T5 는 처음부터(api 표 · 라우트 · 웹 클라이언트만). T4 가 끝나면 T6(`apps/web`) · T8(`packages/exporter` · `apps/api/src/services/export-*`) · T9(`system-themes/admin`)는 서로 다른 영역이다 — 워크트리마다 자기 DB 컨테이너로 가르면 api 케이스도 함께 돈다(`README.md` 「워크트리를 여럿 띄울 때」).
- **마이그레이션 번호를 미리 나눈다** — 지금 마지막이 `0036-common-codes`. T2 = `0037-page-layout`, T3 = `0038-drop-layouts`, T5 = `0039-view-prefs`. T5 가 T2 · T3 보다 먼저 병합되면 번호 차례와 병합 차례가 어긋나므로 **T5 는 T3 병합 뒤 그 위로 rebase 해 병합한다**(지침 «마이그레이션 번호를 옮기면 …»).

## 다른 트랙과 겹치는 파일

| 트랙 | 그 트랙이 건드린 것(`git diff --stat main...<브랜치>`) | 이 계획에서 겹치는 태스크 | 순서 |
|---|---|---|---|
| sp `feat/shell-polish` | `apps/web/src/shell.css` · `shell/action-menu.tsx` · 관리자 화면 | T7(머리 «보기» 단추 · `shell.css` · `shell/head-fold.ts`) | sp 병합 뒤 T7 |
| rp `feat/right-panel` | `apps/web/src/panels/property-panel.tsx` · `panels/node-head.tsx` · `shell.css` · `shell/sidebar-layout.ts` | T7(«페이지 정보» 의 «레이아웃» — `panels/page-kind.tsx` · `page-info.tsx`) | rp 병합 뒤 T7 |
| skt `feat/skala-theme` | `system-themes/admin/src/theme.css` · `system-themes/admin/test/admin.test.ts` · 판 2.1.0 | T9(기본테마 레이아웃 뷰 · CSS · 판) · T4 가 `Slot` 을 걷으며 고칠 `structure.tsx` 는 겹치지 않는다 | skt 병합 뒤 T9 · 판은 2.2.0 · `checksums.json` 줄은 합친 판에서 다시 짓는다 |

T1 – T6 · T8 · T10 은 세 트랙의 파일과 안 겹친다. 그래도 **합친 판의 전량 넷은 병합 때마다 한 번** 돈다(README 「트랙 게이트」 머리말).

---

## T1 — schema: 판 7 · `layout` · 판정 · 내비

**건드릴 파일:** `packages/schema/src/node.ts`(`PageDocument.layout` · `PageLayout` · `PAGE_LAYOUTS`) · `envelope.ts`(문서 스키마의 `layout` — 판 7 에 필수) · `migrate.ts`(`CURRENT_DOCUMENT_VERSION` 7 · 판 6 → 7 단계) · 새 `migrate-page-layout.ts`(`liftPageLayout` — 머리말에 «판 6 → 7 의 뜻으로 얼어 있다») · `validate.ts`(`layout-root-mismatch`) · `new-page.ts`(`pageKindOf` 가 `layout` 을 읽음 · `newPageDocument(layout, title)`) · `page-view.ts`(`layout` 칸) · 새 `layout-nav.ts`(`buildLayoutNav`) · `index.ts`. 정본: 「페이지 스키마 노드」 의 문서 판 · 「컴포넌트 카탈로그」 의 `Popup` 줄과 검증 코드.

**`pageKindOf` 를 부르는 자리는 이 태스크에서 안 고친다** — 판정 함수만 바뀌고 호출자는 그대로 맞는다. `newPageDocument` 의 인자가 바뀌므로 그 호출자(`apps/api/src/routes/pages.ts` 의 만들기)는 같은 커밋에서 `kind` → `layout` 으로 옮긴다(`kind: 'popup'` → `'popup'`, 그 밖 → `'blank'`).

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| 판 6 뿌리 `Popup` → `layout: 'popup'`, 판 6 뿌리 `Page` → `'blank'`, 판 5 문서가 두 단계를 지나 7 | `packages/schema/test/migrate-page-layout.test.ts` | 단계가 늘 `blank` 를 짓게 → 팝업 판만 죽음 |
| 봉투가 판 7 의 `layout` 없음 · 모르는 값을 거절 | `packages/schema/test/envelope*.test.ts` 곁 | `layout` 을 `optional` 로 |
| `layout-root-mismatch` 두 방향(팝업 + `Page` · 서브페이지 + `Popup`) | `packages/schema/test/validate*.test.ts` 곁 | 한 방향만 보게 |
| `pageKindOf({ layout: 'popup', root: Page })` 가 `popup`(검증 전 값으로 판정 출처를 가르는 유일한 판) | 같은 파일 | 뿌리 타입을 읽게 되돌림 |
| `buildLayoutNav` — 메뉴 안 페이지 → 하위 메뉴 차례 · 팝업 레이아웃 제외 · 빈 메뉴 · 팝업만 든 메뉴의 `pageId: null` · `current` · `trail` · 트리에 없는 페이지 | `packages/schema/test/layout-nav.test.ts` | 차례를 하위 메뉴 먼저로 · 팝업 거르기를 뗌 · `trail` 에서 페이지를 뺌 — 각각 그 케이스만 |
| **판정 출처 인구조사** — 테스트 밖에서 뿌리 타입 `'Popup'` 을 판정으로 읽는 자리가 `validate.ts` 하나뿐 | 새 `packages/schema/test/page-layout-census.test.ts`(`stripComments` 로 주석을 걷고 센다 — 지침 «주석을 정규식으로 걷는 것도 손으로 쓴 파서다») | 다른 파일에 `root.type === 'Popup'` 을 심음 |

뿌리 타입을 읽는 변조는 검증이 두 값을 짝으로 묶어 대부분의 케이스에서 살아남는다 — 그래서 넷째 줄(검증 전 값)과 인구조사가 그 축을 소유한다. 이 사실을 두 케이스 머리말에 적는다.

**게이트:** 전량 넷(`packages/*` · 정본). 판 7 을 기대값으로 박은 케이스(`CURRENT_DOCUMENT_VERSION` 을 안 읽고 `6` 을 쓴 자리)를 `git grep -n "version: 6" -- '*.test.ts' '*.test.tsx'` 로 먼저 세어 같은 커밋에서 고친다.

## T2 — api: 저장된 문서를 판 7 로 · 트리 · 만들기

**건드릴 파일:** 새 `apps/api/src/db/migrations/0037-page-layout.ts`(`pages.schema` · `schema_version` · `snapshots.payload` 의 `pages[]` — 설계 「마이그레이션」 표 · `head_seq` 안 올림) · `migrations/index.ts` · `repos/pages.ts` 의 `listPageRows`(`schema->>'layout'`) · `services/menu-tree.ts`(`PageRow.layout` · 응답 `layout` · `kind` 를 그것에서) · `routes/pages.ts`(본문 `layout?` · `kind` 와 어긋나면 400) · `apps/web/src/api/types.ts` · `http-client.ts` 의 트리 응답 검사(`layout` 을 받는다 — 없으면 `kind` 에서 짓는다: 아직 안 올린 서버의 응답) · `apps/web/src/panels/page-import-dialog.tsx` 의 `layoutRef` 문장. README: 라우트 표의 `pages` 줄 · 「트리 응답」.

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| 판 6 DB(팝업 · 화면 · 스냅샷 payload 에 둘)를 올리면 남은 판 6 문서가 0 — `pages` 와 payload `pages[]` 둘 다 셈(`formsIn` 처럼 JSON 을 걷는다) | 새 `apps/api/test/migration-0037.test.ts` | payload 를 안 옮김 |
| `head_seq` 가 안 오른다 · 판 6 바탕 편집이 올린 뒤 적용된다 | 같은 파일 | `head_seq` 를 올림 |
| `down` 이 `layout` 을 지우고 판 6 | 같은 파일 | `down` 이 판만 내림 |
| 트리 응답 `layout` · `kind` | `apps/api/test/tree*.test.ts` 곁 | SQL 이 뿌리 타입을 고르게 되돌림(T1 인구조사와 함께 — 이 변조는 응답 값으로는 산다: 머리말에 적는다) |
| `POST …/pages` — `layout` 없음 → `blank`, `kind: 'popup'` → `popup`, `layout: 'subpage'`, 어긋난 둘 → 400 | `apps/api/test/pages*.test.ts` 곁 | 기본값을 `subpage` 로 |

마이그레이션 디렉터리를 글자로 세는 자(`git grep -lE 'MIGRATIONS_DIR|db/migrations' apps/api/test`)를 이 트랙 게이트에 넣는다. 옛 판 DB 에서 캡처 · 복원을 부르는 마이그레이션 케이스(`git grep -lE 'captureSnapshot|restoreSnapshot' -- apps/api/test/migration-*`)는 판 7 문서를 손으로 지은 payload 로 맞춘다.

**게이트:** api 줄(`pnpm typecheck` · `pnpm build` · `pnpm vitest run --project api` · `pnpm vitest run --project build apps/api/build-test`) + `apps/web` 을 건드렸으니 web 줄 — 합쳐 전량 넷.

## T3 — 레이아웃 표 · `Slot` · `renderComposed` 걷기

**건드릴 파일:** 새 `apps/api/src/db/migrations/0038-drop-layouts.ts`(`projects.default_layout_id` → `layouts` 를 걷고 payload 를 판 5 로 — `layouts` 키를 뺀다 · `down` 은 표 · 칼럼과 프로젝트마다 기본 레이아웃 행을 다시 짓는다) · `db/types.ts` · `repos/layouts.ts`(파일째) · `repos/projects.ts`(만들기의 2 · 3 단계) · `repos/snapshots.ts`(캡처 · `lockProjectLayouts` · 덤프의 `layouts`) · `services/restore-plan.ts`(`layout-mismatch`) · `repos/codes.ts`(사용처 `kind: 'layout'`) · `packages/themes/src/snapshot/payload.ts`(`SNAPSHOT_PAYLOAD_VERSION` 5 · `layouts` 키 걷기) · `packages/schema` 의 `LayoutDocument` · `AnyDocument` · `validateLayout` · `assertValidLayout` · 카탈로그 `SlotDef` · `packages/renderer/src/compose.tsx` · `apps/playground` · `packages/theme-gallery/src/examples`(`EXAMPLE_LAYOUT` — 이 태스크에서는 예제를 레이아웃 없이 그리고, T4 가 `LayoutFrame` 으로 다시 감싼다) · `packages/theme-sdk/src/default-views/structure.tsx` 의 `Slot` 뷰 · `packages/cli`(payload 판을 읽는 자리). README · 정본: 설계 「정본 · README 에서 고칠 절」 의 레이아웃 몫.

**지우는 파일이 있다** — 워커의 `git rm` 은 자동 모드가 막는다(지침 «추적 파일 · 디렉터리를 걷는 브리프는 사용자가 칠 한 줄을 함께 적는다»). 브리프에 `git -C <워크트리> rm -q apps/api/src/repos/layouts.ts packages/renderer/src/compose.tsx` 와 그 밖 빈 껍데기가 된 파일을 물음 파일에 모아 적게 하고, 코디네이터가 그 한 줄을 친다.

**걷기 셈** — 걷은 이름을 낱말 단위로 센다(지침 «걷혔나를 세는 식은 낱말 단위로도»): `git grep -nwF -e LayoutDocument -e validateLayout -e renderComposed -e Slot -e default_layout_id -e lockProjectLayouts -- ':!docs/superpowers/plans' ':!apps/api/src/db/migrations'`. `Slot` 은 무관한 낱말(`export-worker.ts` 의 `interface Slot` · `resolveSlot`)과 섞이므로 남은 줄을 열어 갈래로 나눈다.

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| 판 4 payload(`layouts[]` 든) 스냅샷이 올린 뒤 판 5 로 읽히고 복원된다 | 새 `apps/api/test/migration-0038.test.ts` | payload 를 안 옮김 |
| 레이아웃 개수가 달라도 복원이 409 를 안 낸다(옛 `layout-mismatch` 판) | `apps/api/test/restore*.test.ts` 곁 | — (갈래째 걷힘: 고치기 전 빨강을 보고에 적는다) |
| 프로젝트를 만들면 레이아웃 행이 없다 · `down` 뒤 프로젝트마다 하나 | `migration-0038.test.ts` | `down` 이 행을 안 지음 |
| 걷은 `Slot` 을 선언한 저장된 manifest 로 내보내기가 테마째 안 버린다 | `packages/themes` 의 `readWbtheme` `stored` 케이스 곁 | `stored` 거름을 뗌 |

`guard-in-lock` 의 분모 · 상태 셈과 `restore-lock-census` 에서 `layouts` 를 함께 뺀다.

**게이트:** 전량 넷 + 카탈로그 타입을 걷었으니 `pnpm test:build:serial` 의 `packages/theme-kit/build-test/dev.test.ts` · `shots.test.ts`(타입 수 · 표본 수) · `packages/exporter/test/parity.test.tsx` «무엇을 덮었나» · `bundle-stateless-bytes.test.ts` 해시(지침 «하드코딩된 개수 하한 단언» — `WB_PRINT_DIGEST=1` 로 다시 짓고 머리말에 까닭). 앞 판 시스템 테마 고정 프로젝트로 내보내기를 한 번 찍어 `themeWarning` 이 빈지 적는다(지침 «카탈로그에서 타입을 걷거나 바꾸는 트랙도 …»).

## T4 — 테마 계약: SDK · manifest · `LayoutFrame` · kit

**건드릴 파일:** `packages/theme-sdk/src/types.ts`(`ThemeManifest.layouts` · `ThemeDefinition.layouts` · `LayoutViewProps` · `LayoutNavItem` · `LayoutRegionDecl`) · 새 `packages/theme-sdk/src/layout.tsx`(`LayoutRegion` · `LayoutLink` · 문맥) · `default-views`(세 레이아웃의 기본 뷰 = `children` · `[data-wb-layout-content] { display: contents }` · 팝업 레이아웃의 막 · 가운데 세우기 · 캡처 판에서 막 없음 — `capture.ts`) · `version.ts`(1.10.0) · `index.ts` · `packages/themes/src/manifest/schema.ts`(`ManifestSchema.layouts` · `validateManifest` 이슈) · 새 `packages/renderer/src/layout-frame.tsx`(`LayoutFrame` — 뷰 고르기 · 감싸기 · 던지면 기본 뷰 + 오류) · `packages/renderer/src/index.ts` · `packages/theme-kit/src/check.ts`(설계 「`wb-theme check` 가 더 볼 것」 넷) · `packages/theme-kit/template`(manifest 에 주석으로 `layouts` 예) · `packages/theme-gallery/src/examples`(`ThemeExamples` 가 `LayoutFrame` + `buildLayoutNav` 로 예제 장을 서브페이지로 · 예제 메뉴 트리) · `wb-theme dev` 의 예제 판에 영역 켬/끔 체크(작성자가 끄는 판을 본다). 정본 「테마의 범위」 · 「노드 속성」 · `docs/superpowers/specs/2026-09-27-code-themes-design.md` 의 manifest 절.

**SDK 기본 CSS 를 바꾸는 트랙이다** — 앞 판 시스템 테마 고정 프로젝트로 한 번 그린다(지침 «SDK 기본 CSS(`*CssBlocks`)를 바꾸는 트랙은 …»). 팝업 레이아웃의 막 · 가운데 세우기가 1.5.0 · 1.7.0 · 2.0.0 의 `[data-wb-popup-frame] > [data-wb-component="Popup"]` 규칙과 엇갈리지 않는지 본다(덮개 층은 막을 안 그린다).

**jsdom 이 읽는 SDK CSS 에 `@layer` 를 두지 않는다**(지침 «jsdom 의 CSS 파서는 `@layer` 를 못 읽어»).

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| manifest `layouts` — 모르는 레이아웃 키 · 겹친 id · 꼴 밖 id · 9 개 영역 → 이슈, 없는 키는 그대로 받음 | `packages/themes/test/manifest*.test.ts` 곁 | 겹침 검사를 뗌 |
| `LayoutRegion` 이 꺼진 영역을 안 그린다 · `data-wb-layout-region` | `packages/theme-sdk/test/layout.test.tsx` | `regions[id] === false` 판정을 뗌 |
| `LayoutLink` — `pageId: null` 은 링크가 아님 · `current` 면 `aria-current` · 누름이 문맥의 처리기로 | 같은 파일 | 처리기를 안 부름 |
| `LayoutFrame` — 테마 뷰 없음 → 기본(내용만) · 뷰가 던지면 기본 + 오류 · `data-wb-layout` · `data-wb-layout-content` 하나 | `packages/renderer/test/layout-frame.test.tsx` | 던질 때 오류 보고를 뗌 |
| `wb-theme check` — `children` 을 안 두는 뷰 · 두 번 두는 뷰 · `LayoutRegion` 없이 그린 선언 영역 · 선언 밖 id → 각각 이슈 | `packages/theme-kit/test/check.test.ts` 곁 | 검사 넷을 하나씩 끔(검사마다 그 픽스처만 죽음) |
| 팝업 레이아웃의 막이 캡처 판에서 안 선다 | `packages/theme-sdk/test` 의 캡처 케이스 곁 | 캡처 규칙을 뗌 |

`check.test.ts` 에 같은 `describe` 이름을 다른 트랙이 더하면 git 이 조용히 합친다 — 병합 뒤 `pnpm typecheck` 로 먼저 잰다(지침 «합친 판은 … `pnpm typecheck` 로 먼저»).

**게이트:** 전량 넷 + `pnpm test:build:serial`(kit `dev` · `shots`).

## T5 — 표시 옵션: 표 · API · 웹 클라이언트

T1 과 무관하다 — 처음부터 나란히 돈다. 번호는 `0039` 로 두고 T3 병합 뒤 rebase 해 병합한다.

**건드릴 파일:** 새 `apps/api/src/db/migrations/0039-view-prefs.ts` · `db/types.ts` · 새 `apps/api/src/repos/view-prefs.ts` · 새 `apps/api/src/routes/view-prefs.ts`(설계 「API」 표 — 세션만 · 토큰 403 · viewer) · `app.ts` 의 라우트 등록 · `apps/web/src/api/client.ts` · `http-client.ts`(`getViewPrefs` · `putViewPrefs` — 응답 모양 검사) · `apps/web/test/helpers.tsx` 의 `fakeApi`(기본값 `[]` — 에디터를 여는 모든 jsdom 케이스가 이 조회를 지나므로 `notStubbed` 로 두면 한꺼번에 죽는다: 지침 «편집 모드의 «컴포넌트» 탭에 조회를 더하는 브리프는 …» 와 같은 성질). README 라우트 표. 정본 「테이블 정의」.

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| 행 없음 → `[]` · PUT 뒤 GET 이 같은 값 · 다른 사람의 행과 갈린다 | 새 `apps/api/test/view-prefs.test.ts` | upsert 열쇠에서 `user_id` 를 뺌 |
| viewer 가 저장 · 비멤버 404 · 토큰 403 | 같은 파일 | 토큰 거절을 뗌 |
| 꼴 밖 열쇠 · 33 개 · 겹친 열쇠 → 400 | 같은 파일 | 개수 상한을 뗌 |
| 프로젝트를 지우면 행도 지워진다 | 같은 파일 | FK `CASCADE` 를 `RESTRICT` 로(삭제가 막힘 — 상태 코드로 죽는다) |
| `guard-in-lock` 의 분모 · 상태 셈에 이 표 | `apps/api/test/guard-in-lock.test.ts` | 상태 셈에서 표를 뺌 → «강등이 없으면 상태가 바뀐다» 대조가 죽음 |
| 웹 클라이언트가 틀린 응답 모양을 거절 | `apps/web/test/api/http-client.test.ts` 곁 | 모양 검사를 뗌 |

`inject` 를 감싸는 도우미는 `payload` 를 `Record<string, unknown>` 으로 받는다(지침 «api 케이스의 `inject` 를 감싸는 도우미는 …»).

**게이트:** api 줄 + web 줄 = 전량 넷.

## T6 — 캔버스: 틀 그리기 · 틀은 노드가 아님 · 팝업 막

T4(`LayoutFrame` · SDK) 와 T5(`getViewPrefs`) 뒤.

**건드릴 파일:** `apps/web/src/canvas/canvas.tsx`(`CanvasDocument` 이 `LayoutFrame` 으로 감쌈 — 레이아웃 · 내비 · 영역 · 링크 처리기) · 에디터가 든 메뉴 트리 조회 값을 캔버스에 잇는 자리(그 값을 쥔 곳을 워커가 먼저 센다 — 메뉴 트리 칸이 그리는 값) · 새 `apps/web/src/store/use-view-prefs.ts`(읽기 · 낙관 반영 · 마지막 값만 보냄 · 실패 되돌림) · `canvas-pick.ts`(틀 누름은 고름을 안 바꿈) · `canvas-drop.ts`(틀 위는 놓을 자리 없음) · `use-canvas-marquee.ts`(틀에서 시작한 사각형은 바탕과 같다 — 바꾸지 않으면 케이스로 잠근다) · `canvas-iframe.tsx`(틀이 든 문서 높이). 뷰 모드의 링크 누름 → 그 페이지로 옮김(메뉴 트리 칸 링크와 같은 이동).

**이펙트 · 마운트 순서를 바꾸는 트랙이다** — `EDITOR_STACK_BUNDLE=build pnpm test:browser` 도 돈다(README 「트랙 게이트」).

**실브라우저 판(`apps/web/build-test/` · 새 `page-layout-canvas.test.ts`)** — 서브페이지 픽스처는 레이아웃 뷰를 낸 테마가 있어야 선다. T9 전이면 **픽스처 테마**(`apps/web/build-test/theme-fixtures.ts` 꼴로 `layouts` 를 선언하고 레이아웃 뷰를 낸 작은 테마를 올린다)로 세운다.

| 판 | 단언 | 카나리아 · 혼자 죽는 변조 |
|---|---|---|
| 틀(GNB 링크 위)에 컴포넌트를 끌어 놓음 | 서버 편집 0 · 미리보기 안 섬 | 같은 판에서 내용 칸에 놓으면 편집 1(판이 섰다) · `canvas-drop` 의 틀 거름을 뗌 |
| 편집 모드에서 틀 링크 누름 | 고른 노드 그대로 · 주소 그대로 | 노드를 먼저 고른 상태(카나리아) · 틀 누름을 바탕 누름으로 되돌림 |
| 뷰 모드에서 LNB 링크 누름 | 그 페이지가 열린다(주소 · 캔버스의 페이지 이름) | 처리기를 편집 모드 것으로 |
| 편집 모드에서 «GNB» 를 끈 값(`view-prefs` 에 미리 PUT) | `[data-wb-layout-region="gnb"]` 0 · 뷰 모드로 바꾸면 1 | `regions` 를 모드와 무관하게 |
| 팝업 레이아웃 페이지 | 상자 가운데가 뷰포트 가운데(±1px) · 막이 뷰포트 폭 · 막 누름은 고름을 안 바꿈 | 가운데 세우기 규칙을 뗌 |
| 앞 판 테마(`apps/web/build-test/fixtures/` 의 1.7.0)에 고정된 프로젝트의 서브페이지 | 캔버스 문서가 `blank` 판과 같은 상자(뿌리 노드 왼 · 위) · «보기» 항목 0 | — |
| 틀이 민 노드에서 코멘트 번호 · 외곽선이 노드를 따른다 | 번호 상자 ⊂ 노드 상자 근처(기존 마커 판과 같은 셈) | 측정 의존에서 틀 높이를 뺌 |

좌표를 쓰는 판은 지침의 실브라우저 항목을 따른다 — 누를 점은 훑어 고르고(`palette-chain.test.ts` 꼴), 판을 열 때 `zoomToFull`, 겨눌 점은 `dragLayoutSettled` 뒤에 잰다.

**게이트:** web 줄(`pnpm typecheck` · `pnpm build` · `pnpm vitest run --project web` · `pnpm test:browser` · `pnpm vitest run --project build apps/web/build-test/export-bundle.test.ts`) + 운영 번들 판.

## T7 — 에디터 UI: «레이아웃» 라디오 · «보기» 메뉴 · «페이지 추가»

**rp · sp 병합 뒤** — 둘이 `shell.css` · 패널을 고친다.

**건드릴 파일:** `apps/web/src/panels/page-kind.tsx` → «레이아웃» `[빈] [서브페이지] [팝업]`(이름은 `page-layout.tsx` 로 옮겨도 된다 — 옮기면 찾는 케이스를 센다) · `apps/web/src/edit/page-kind-ops.ts` → `layoutOps`(설계 「«페이지 정보» 탭의 «레이아웃»」 표) · 새 «보기» 단추와 팝오버(`apps/web/src/shell/` — `GuidesToggle` 곁) · `routes/editor.tsx` 머리 도구 줄 · `shell/head-fold.ts` 단계 표 · `apps/web/src/tree/use-tree-commands.tsx`(«페이지 추가» 가 `layout: 'subpage'` — 설계 「정한 것 — 레이아웃 갈래」 1) · `shell.css`. 정본 「설계서 화면 구조」 의 «페이지 정보» 탭 · 머리 도구 · «팝업 페이지».

**접근 이름 · 셸 CSS 를 바꾼다** — 그 커밋에서 `pnpm vitest run --project web` 전체와 실브라우저 전량을 한 번 돈다(지침 «접근 이름 · 셸 CSS 를 바꾼 항목은 …»). «종류» 라디오의 이름 «화면» · «팝업» 과 `aria-label="종류"` 를 찾는 케이스를 먼저 센다: `git grep -n -F -e "'종류'" -e "name: '화면'" -e "name: '팝업'" -- apps/web/test apps/web/build-test`(같은 이름의 다른 칸 — 초대 표 열 · 상호작용 액션 고르개 — 이 섞이므로 줄을 열어 가른다). 머리에 단추를 더하면 머리 접기 판(`apps/web/build-test` 의 머리 폭 판)과 `getByRole(… { name })` 부분 일치를 센다.

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| `layoutOps` — 빈 ↔ 서브페이지는 `test /layout` + `replace /layout` 뿐 · 팝업 경계는 뿌리 연산 포함 · 같은 값이면 `null` | `apps/web/test/edit/layout-ops.test.ts` | 첫 `test` 를 뗌 |
| 남이 먼저 레이아웃을 바꾼 판에서 내 바꿈이 버려진다(리베이스) | `apps/web/build-test` 의 리베이스 판 꼴 — 지침 «문서 편집 묶음에 `test` 를 더하는 고침의 경주 케이스는 …» (`replace` 판으로 세운다) | `test /layout` 을 뗌 |
| 남이 뿌리를 쥐었으면 팝업 단추만 꺼지고 까닭 · 빈 ↔ 서브페이지는 켜져 있음 | `apps/web/test/panels/page-layout.test.tsx` | 잠금 판정을 세 단추 모두에 |
| «보기» — 편집 모드에만 · 끌 영역 없는 레이아웃 · 선언 없는 테마에서 꺼지고 까닭 · 누르면 PUT 하나(연달아 셋 → 마지막 값 하나) · 실패면 되돌림 + 통지 | `apps/web/test/shell/view-menu.test.tsx` | 마지막 값만 보내기를 뗌 |
| «페이지 추가» 가 `layout: 'subpage'` 를 싣고 «팝업 페이지 추가» 가 `popup` | `apps/web/test/tree/*.test.tsx` 곁 | 값을 뺌 |

**게이트:** web 줄 + 정본을 고쳤으니 전량 넷.

## T8 — 번들 · PPTX

T4 뒤. T6 과 나란히.

**건드릴 파일:** `packages/exporter/src/bundle/index.ts`(번들에 내비 한 벌 · 장 데이터는 페이지 id · 팝업 문서 판정) · `packages/exporter/src/browser/mount.tsx`(`ExportCanvas` 를 `LayoutFrame` 으로 · 링크 `href` · 다 켠 영역) · `packages/exporter/src/bundle/shell.tsx`(마크업을 바꾸면 `wb-export-` 정규식 케이스를 센다 — 지침) · `apps/api/src/services/export-bundle.ts`(트리 행에 `layout`) · `export-pptx.ts` · `screen-render-chromium.ts`(서브페이지 장도 캡처 폭 720 · 크기 상한 그대로 — 설계 「정한 것 — 레이아웃 갈래」 3) · `export-worker-protocol.ts` · `export-worker.ts` · `export-worker-thread.ts`(`ExportRows` 에 칸을 더하면 워커로 가는 메시지 셋을 함께 — 지침) · `packages/exporter/test-support/fixtures.ts`(서브페이지 장 · 팝업 장에 `layout`). 정본 「HTML 정적 번들」.

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| 번들 장의 LNB 링크를 누르면 그 장 파일이 열린다 · 메뉴의 링크는 첫 화면 페이지 | `apps/web/build-test/` 의 번들 판(`openBundlePage`) | `href` 를 장 경로 대신 id 로 |
| 사람의 `hidden_regions` 가 있어도 번들 · PPTX 는 다 켠다 | `apps/api/test/export-routes.test.ts` 곁(라우트로 내려받은 zip — 워커를 지난 판) | `ExportRows` 에 표시 옵션을 실음 |
| 내비가 번들에 한 벌이다(장 수와 무관한 크기) | `packages/exporter/test/bundle*.test.tsx` | 장마다 트리를 실음 |
| 팝업 장 — 번들은 막 + 가운데 · PPTX 그림은 상자 크기 | `apps/api/build-test/screen-chromium.test.ts` 곁 | 캡처 판의 막 거름을 뗌 |
| 서브페이지 장의 PPTX 그림 폭이 720 이다(높이만 틀만큼 는다) | 같은 파일 | 서브페이지 장만 캡처 폭을 바꿈 |
| `bundle-stateless-bytes` 해시 | 다시 짓고 머리말에 까닭 | — |

번들 판은 `pnpm build` 뒤에 잰다(`editor-stack` 의 api 가 `packages/*/dist` 를 읽는다 — 지침). PPTX 판이 한꺼번에 «화면 그림 0» 이면 먼저 Playwright 캐시를 본다.

**게이트:** 전량 넷.

## T9 — 기본테마 새 판: 서브페이지 레이아웃 뷰

**skt 병합 뒤.** 판 2.2.0(skt 가 2.1.0).

**건드릴 파일:** `system-themes/admin/src/manifest.ts`(`layouts.subpage.regions` 넷 · `version` · `sdk: '^1.10.0'`) · 새 `system-themes/admin/src/views/layout-subpage.tsx` · `theme.tsx`(`layouts`) · `theme.css`(GNB 60 · LNB 240 · 본문 패딩 24/28 · 브레드크럼브 12.5px · 제목 22px — lms-skala `_header.scss` · `_lnb.scss` · `_content.scss` 와 시안 «④» · 팝업 제목줄 · 닫기 · 바닥은 skt 의 몫이면 건드리지 않는다) · `system-themes/admin/checksums.json`(합친 판에서 `pnpm build` 뒤 `shasum -a 256` — 지침 «뒤에 병합하는 트랙의 `checksums.json` 새 줄은 …») · `system-themes/admin/test/admin.test.ts`(«배치를 바꾸는 규칙은 형제 구조로 안 가른다» 를 `[data-wb-layout]` 규칙에도).

**같은 판 이름을 나눠 쓰는 트랙이 생기면** 사용자 개발 DB 에 시딩된 판과 sha256 이 갈려 api 기동이 멈춘다 — 병합 전에 덤프를 뜨고 그 판을 쓰는 프로젝트가 없으면 행을 지운다(지침 «같은 판 이름을 나눠 쓰는 두 트랙은 …»).

**케이스:**

| 케이스 | 자리 | 혼자 죽는 변조 |
|---|---|---|
| `wb-theme check` 초록 — 영역 넷이 `LayoutRegion` 으로 섬 | `system-themes/admin` 빌드 · `packages/theme-kit/build-test` | `title` 영역을 `LayoutRegion` 밖으로 |
| 치수 — GNB 높이 60 · LNB 폭 240 · 제목 22px · 브레드크럼브 12.5px(실브라우저 · 토큰을 실은 판) | 새 `apps/web/build-test/admin-subpage.test.ts` | LNB 폭 토큰을 바꿈 |
| 좁은 창(390)과 캡처 폭(720)에서 넘침 0 — 뼈대 상자 · 글자 노드 `Range` 로 | 같은 파일(지침 «화면 넘침은 요소 상자로만 세지 않는다») | 내용 칸 `min-width: 0` 을 뗌 |
| 끄는 동안 캔버스가 안 멈춘다 — 서브페이지 판으로 끌기 훑기 | `apps/web/build-test/admin-drag-sweep.test.ts` 에 서브페이지 판 | 틀에 형제 셀렉터 배치 규칙을 심음 |

**게이트:** 전량 넷 + `pnpm test:build`.

## T10 — MCP · CLI · llms · 문서 마무리

T1 – T9 뒤(하나의 짧은 트랙).

**건드릴 파일:** `packages/mcp`(`get_page` 설명 · `patch_page` 의 `/layout` 안내) · `packages/cli/src/commands/page-get.ts`(줄에 레이아웃 이름) · 스킬 문서(정본 「스킬」) · `apps/web/config/llms-txt.ts`(문서 판 · `layout` — 상수를 읽어 싣는다: 지침 «생성물을 정의와 대조하는 케이스는 …») · 정본 · README 에 남은 줄(설계 「정본 · README 에서 고칠 절」 을 다 지났는지 센다). 옛 이름 셈: `git grep -n -F "종류 ·" -- ':!docs/superpowers/plans'` · `git grep -nw "kind" -- packages/mcp/src packages/cli/src` 를 열어 갈래로 나눈다.

**게이트:** 전량 넷(정본 · `packages/mcp` 가 정본을 읽는다).

---

## 브리프에 넣을 것(태스크 공통)

- 시작할 때 `orca terminal list` 로 그 워크트리의 다른 에이전트를 본다 · 목록이 비면 추적 파일 색인 md5 와 `git status --short` 를 시작 · 끝에 견준다.
- «고쳐라» 도 재현이 먼저다 · 재현 안 되면 고치지 않고 보고한다.
- 변조는 백업 · 바이트 비교로 되돌린다(`git checkout` 금지) · 변조마다 실행 수(`-t` 로 좁혔으면 통과 + 실패)를 적는다.
- 판 7 · 마이그레이션 번호 · 판 2.2.0 은 이 계획의 값이다 — 앞 트랙 병합으로 바뀌면 물음 파일에 적고 기본값(다음 빈 번호 · 다음 판)으로 간다.
- 각 태스크는 그 동작을 바꾼 커밋에서 정본의 그 절을 함께 고친다(정본은 늘 지금을 말한다) — 정본을 고친 커밋은 전량 넷이다.
