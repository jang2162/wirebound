# rv-ly2 보고 — 페이지 레이아웃 T1 · T2 · T3 반증 리뷰

브리프: 코디네이터 `brief-rv-ly2.md`. 대상 `feat/page-layout` 머리 `bc42aad1`(기준 `f3acecc0`). 판 Node v24.21.0(`mise env`) · DB 컨테이너 포트 5544. **고치지 않았다** — 소스 변조도 하지 않았다(재는 것은 전부 스크래치 탐침). 커밋은 이 보고 하나.

시작 15:57 — 같은 워크트리의 터미널 둘(`orca terminal list` — 둘 다 빈 셸 프롬프트) · 추적 파일 색인 md5 `11982d53bd96c4c7652ce85c5b59e254` · `git status --short` 0 줄. 끝 값은 맨 아래 「끝」.

## 한 줄 판정

**높은 무게는 없다.** 저장 경계 · 마이그레이션 · 앞 판 테마 내보내기 모두 이 브랜치에서 맞게 선다. 남은 것은 중간 1(새 `wireb` ↔ 옛 서버) · 낮음 넷이다.

| # | 무게 | 무엇 | 새 장치가 연 길인가 |
|---|---|---|---|
| F1 | 중간 | 새 `wireb`(payload 규격 5)가 옛 서버의 덤프(판 4 · `layouts` 키)를 `unrecognized_keys: layouts` 로 거절한다 — `wireb lint` 등 `fetchSnapshot` 을 쓰는 명령이 옛 서버에 붙으면 멈춘다 | 새 길 — 앞 판까지 규격은 키를 더하기만 해 새 CLI 가 옛 payload 를 읽었다 |
| F2 | 낮음 | `wireb lint` 의 테마 규칙이 `Slot` 을 선언한 저장 테마에 고정된 프로젝트에서 «테마 없음(unavailable)» 이 된다 — `packages/cli/src/project.ts` 의 `fetchLintTheme` 가 `validateManifest(manifest)` 를 `stored` 없이 부른다 | 원래 있던 길 — 같은 자리가 1.5.0 · 1.6.0 의 `List` 선언에 이미 그렇다. `Slot` 은 새 사례 |
| F3 | 낮음 | `0038` up 이 판 2 · 3 payload 도 판 5 로 적어 원래 판을 잃고, down 은 모두 판 4 로 내린다(판 2 · 3 으로 못 돌아간다). 옛 레이아웃 문서는 down 뒤 `[]`(정한 대로) | 새 길. 뜻은 안 바뀐다 — 복원이 판 숫자가 아니라 `theme` · `codes` 키 유무로 가른다(`restore-plan.ts` 377 · 380 줄) |
| F4 | 낮음 | `0037` down 은 `revisions` 의 `/layout` 연산을 남긴다 — 내린 판(main)의 `PatchPath` 가 `/layout` 을 거절해 그 revision 의 되돌리기가 400 이다 | 새 길(되돌림 때만) — 코드로 읽은 값, 안 잼 |
| F5 | 낮음 | 문서 문장 낡음 — MCP `patch_page` 설명(`packages/mcp/src/tools.ts` 120 줄)이 경로를 «/root · /viewStates · /version» 으로만 적어 `/layout` 을 말하지 않는다(설계 「문서를 나르는 자리」 는 «`/layout` 을 그대로 받는다»). 주석 넷이 «뿌리가 `Popup` 이면 popup» 으로 판정을 적는다(`apps/api/src/services/export-bundle.ts:72` · `packages/cli/src/read/page.ts:59` · `apps/web/src/api/types.ts:597` · `apps/web/src/api/client.ts:258`) — 코드는 `pageKindOf`(layout)를 읽는다 | 새 길(문장) |

## 1 — 앞 판 테마 · `Slot` 을 선언한 테마에 고정된 프로젝트

### 얼린 1.5.0 · 1.6.0 · 1.7.0

`apps/web/build-test/tree-old-theme.test.ts` 를 혼자 돌렸다(16:06 · load 14.6 → 29.2 · 3/3 통과). 판마다 출력:

| 판 | 미리보기 html | 미리보기 pptx | 번들 테마 CSS | PPTX 화면 그림 |
|---|---|---|---|---|
| 1.5.0 | 200 · `system-admin@1.5.0` · 경고 없음 | 200 · 경고 없음 | 실림(1) | 1 장(폭 1440) |
| 1.6.0 | 같음 | 같음 | 실림(1) | 1 장 |
| 1.7.0 | 같음 | 같음 | 실림(1) | 1 장 |

2.0.0 은 기동 시딩의 지금 판이다 — 전량 게이트의 `apps/api/test/export-theme.test.ts` «미리보기의 themeId 가 "id@판" 이고 경고가 없다» 가 이 판이다(ly2 보고의 게이트에서 초록). 따로 다시 재지 않았다.

### 손으로 지은 `Slot` 선언 테마(`slotty@1.0.0`)

kit `buildTheme` 로 `views: { Slot }` 을 든 테마를 짓고(`theme.css` 는 `Text` 를 `rgb(1, 2, 3)` 으로 칠한다), 산출물의 manifest 에 `components.Slot`(variant `boxed`)을 더해 `packWbtheme` 로 다시 쌌다. 카나리아: theme.js 에 `Slot` 글자 있음 · manifest 에 `Slot` 있음.

| 잰 것 | 값 |
|---|---|
| 올리기(`POST /api/admin/theme-packages`) | **422** `테마 패키지를 받지 않았습니다` · `manifest.json:components.Slot` «카탈로그에 없는 컴포넌트입니다: Slot»(`unknown-component`) — 정한 대로(올리기 판은 거절) |
| `theme_packages` 에 직접 넣고(시딩된 판처럼) 고정 · `GET …/theme` | 200 · manifest 에 `Slot` 그대로 |
| 미리보기 html · pptx | 200 · `slotty@1.0.0` · `themeWarning` 둘 다 `null` |
| 번들에서 `Text` 의 계산 색 | `rgb(1, 2, 3)` — 테마 CSS 가 먹는다 |
| 캔버스(에디터 iframe)의 `Text` 계산 색 | `rgb(1, 2, 3)` |
| 콘솔 | `[wirebound] 테마 slotty@1.0.0 views.Slot 는 카탈로그에 없는 타입의 뷰입니다 — 쓰이지 않습니다` 한 줄(경고 — 그리기는 안 바뀐다) |
| PPTX | 200 · 화면 그림 2 장(화면 · 팝업 페이지) |
| 판 정리 | `{"processes":0,"listeningPorts":[],"databases":0}` |

(번들 CSS 글자 셈 `cssMentions(…, 'rgb(1, 2, 3)')` 은 0 이었다 — 빌드가 공백을 걷어 `rgb(1,2,3)` 으로 싣는다. 색의 계산값으로 실림을 잰다.)

**판정: 높은 무게 없음.** 저장된 판은 `readWbtheme(…, { stored: true })`(`export-source.ts:141`) 하나로 읽히고, 웹 · 번들은 패키지 파일을 검증 없이 싣는다. 걷힌 `views.Slot` 은 `warnUnusedViewKeys` 의 경고뿐이다. 옛 스타터 템플릿(`main` 의 `packages/theme-kit/template/src/index.tsx`)은 `views.Slot` 을 들었다 — 그 템플릿으로 지은 사용자 테마가 모두 이 꼴이며, 지금 kit 로 다시 지으면 `wb-theme check` 가 `findBadViewKeys` 로 오류를 낸다(작성 도구의 몫 · 정한 대로). 남은 자리는 F2(CLI lint)다:

```
validateManifest({ …, components: { Slot: { variants: [{ id: 'boxed', label: '상자' }], defaultVariant: 'boxed' } } })
→ manifest null · issues ["unknown-component@components.Slot"]
```

탐침 원문: 스크래치 `probes/slot-theme.probe.ts`(실브라우저 — 설정은 `vitest.browser.config.ts` 를 펴고 `root` 를 체크아웃, `test.dir` 을 스크래치로). 테마를 짓는 몸통:

```ts
writeFileSync(join(dir, 'src/index.tsx'), `import { defineTheme, Root, view } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
import './theme.css'
const Slot = view(({ children }) => <Root as="div">{children}</Root>)
export default defineTheme({ manifest, views: { Slot } as never })
`)
writeFileSync(join(dir, 'src/theme.css'), '[data-wb-component="Text"] {\n  color: rgb(1, 2, 3);\n}\n')
const built = await buildTheme({ root: dir, entry: 'src/index.tsx', outDir: join(dir, 'out') })
const { files } = readWbtheme(bytes, { stored: true })
const manifest = { ...files.manifest, components: { ...(files.manifest.components ?? {}), Slot: { variants: [{ id: 'boxed', label: '상자' }], defaultVariant: 'boxed' } } }
return packWbtheme({ manifest, themeJs: files.themeJs, themeCss: files.themeCss, assets: files.assets })
```

넣기는 `tree-old-theme.test.ts` 의 `install` 과 같은 `insert into theme_packages …` · 고정은 `putTheme` · 번들은 `exportBundle` + `openBundlePage(…, { screen: true })` 에서 `getComputedStyle([data-wb-id="n_text000001"]).color` · 캔버스는 `canvasFrame(page).locator('[data-wb-id="n_text000001"]')` 의 같은 값 · PPTX 는 `GET …/export?format=pptx` 의 `ppt/media/*.png` 수.

## 2 — 문서 판 6 → 7(`0037`) · 문서가 사는 자리 전부

제 DB(`wb_rvly2_<pid>_<시각>`)를 `0036-common-codes` 까지 올려 넣고: 판 6 페이지 셋(화면 둘 · 바닥 구역과 상태를 든 팝업 하나) · 기본 레이아웃 행(`Page > Slot`)과 `default_layout_id` · 프로젝트 모듈 하나 · 스냅샷 셋(payload 판 2 · 3 · 4 — 모두 `layouts[]` 와 판 6 `pages[]`). 그 뒤 최신 → `0036` → 최신으로 오르내리며 **키를 가리지 않고**(`root` 에 `type` 이 있는 객체 전부 · 레이아웃 문서는 뿌리 아래 `Slot` 으로 가름) 셌다.

| 판 | 페이지 문서 | 레이아웃 문서 | 판 7 아님 · 짝 어긋남 | `layouts` 표 · 칼럼 | payload 판 · `layouts` 키 | 판 7 검증 오류 | `schema_version` ≠ `schema.version` |
|---|---|---|---|---|---|---|---|
| 0036 | 8 | 3 | 8(전부 판 6) | 1 · 1 | 2 · 3 · 4, 셋 다 키 있음 | — | 0 |
| 최신(1) | 8 | 0 | **0** | 0 · 0 | 5 · 5 · 5, 키 없음 | 0 | 0 |
| 0036(내림) | 8 | 0 | 8(판 6 · `layout` 없음) | 1 · 1 | **4 · 4 · 4**, `layouts: []` | — | 0 |
| 최신(2) | 8 | 0 | **0** | 0 · 0 | 5 · 5 · 5 | 0 | 0 |

- 뿌리 `Popup` ⇔ `layout: popup` 이 페이지 행 · payload `pages[]` 전부에서 맞았다(최신 판의 꼴은 `7/blank/Page` · `7/popup/Popup` 둘뿐).
- 모듈(`modules.nodes`)은 노드 묶음이라 셈에 문서가 없다(0) — 정한 대로.
- **down 은 `layout` 만 걷고 판 6 으로 내린다**(`subpage` 의 구별을 잃음 — 정한 대로). 다시 올리면 같은 값이다(멱등).
- F3: 판 2 · 3 payload 가 up 에서 판 5 로, down 에서 판 4 로 적힌다 — 원래 판 숫자를 잃는다. 내린 판 4 payload 의 `layouts` 는 원래 문서가 아니라 `[]` 다(`0038` 머리말이 정한 것).
- 셈에서 판 4 payload 하나가 «`codes` 모양이 틀렸다» 로 규격을 못 지난 것은 내 픽스처의 `codes` 꼴 탓이다(결함 아님).

탐침 원문: 스크래치 `apiprobes/migrate.probe.ts`(api 하네스 설정 — `globalSetup` · `setupFiles` 를 api 프로젝트의 것으로). 세는 함수:

```ts
function docs(value, where, out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => docs(v, `${where}[${i}]`, out))
  else if (value !== null && typeof value === 'object') {
    if (value.root && typeof value.root === 'object' && 'type' in value.root) {
      const isLayoutDoc = (value.root.children ?? []).some((c) => c.type === 'Slot')
      out.push({ where, version: value.version, layout: value.layout ?? null, root: value.root.type, layoutDoc: isLayoutDoc })
    }
    for (const [k, v] of Object.entries(value)) docs(v, `${where}.${k}`, out)
  }
  return out
}
// bad = 페이지 문서 가운데 version !== 7 || (layout === 'popup') !== (root === 'Popup')
```

## 3 — 판정 바꿈의 빠진 자리

`git grep -n "'Popup'\|\"Popup\"\|root\.type\|root_type\|->>'type'" -- packages apps ':!**/test/**' ':!**/build-test/**'` → 40 줄(`test-support` 의 픽스처 1 줄 포함). 39 줄을 갈래로 나눴다:

| 갈래 | 줄 | 판정인가 |
|---|---|---|
| 얼린 `0033-modal-popup` | 3 | 아니다(얼린 판) |
| 검증 `validate.ts`(`ROOT_TYPES` · 짝 · 문장 · `bad-root`) | 6 | 표의 허용 자리 |
| 판 6 규칙 `migrate-page-layout.ts` | 1 | 표의 허용 자리 |
| 문서를 짓는 자리(`new-page.ts` 의 시드 · 카탈로그 정의 · 갤러리 표본 넷 — `gallery.tsx:69` 는 표본 노드에서 `layout` 을 짓는다) | 6 | 아니다(짝을 맞춰 짓는다) |
| 편집 연산(`page-kind-ops.ts` 의 `test` · `replace /root/type`) | 2 | 아니다 |
| DOM · CSS 조각(`popup-layer.tsx` 의 닫기 조각 · `aria-modal`, SDK · 템플릿 CSS 9, kit `check.ts` 3) | 15 | 아니다(컴포넌트 꾸밈) |
| 주석 | 6 | F5 의 넷 |

**뿌리 타입으로 «팝업인가» 를 가르는 코드 자리는 표 밖에 0** 이다. 다른 이름의 사본도 셌다 — `isPopupDocument`(캔버스 `canvas.tsx` · `canvas-popups.tsx` · 번들 `bundle/index.ts` · 런타임 `browser/mount.tsx`)는 모두 `pageKindOf` 를 거치고, 웹의 트리 표지는 서버가 `layout` 에서 지은 `kind`(옛 서버 응답은 `withLayouts`)를 읽는다. «의 것과 같다» 사본은 판정 바꿈에 걸린 것이 없다.

## 4 — `layout-root-mismatch` 를 모든 저장 경계가 지나는가

실커밋 하네스(`withRealApi`)로 쟀다. 모두 이 브랜치의 값이다.

| 경계 · 묶음 | 답 |
|---|---|
| REST ops — `replace /layout popup` 만(뿌리 `Page`) | 422 `layout-root-mismatch@/layout` |
| REST ops — `replace /root/type Popup` 만 | 422 `layout-root-mismatch@/layout` |
| REST ops — `remove /layout` | 422 `bad-document@/layout` |
| REST ops — `[replace /version 6, remove /layout, replace /root/type Popup]`(봉투의 판 7 필수를 피해 가는 묶음) | 422 `bad-document@/version`(7단계 — 판 바꿈 거절) |
| REST ops — 모르는 값 `Subpage` | 422 `bad-document@/layout` |
| REST ops — `blank → subpage`(`/layout` 하나) | 200 · 저장 `7/subpage/Page` |
| REST ops — `[test /layout subpage, replace /layout popup, replace /root/type Popup, add /root/props]` | 200 · 저장 `7/popup/Popup` · 트리 `layout: popup` · `kind: popup` |
| PUT schema — 판 7 `subpage` + 뿌리 `Popup` | 422 mismatch |
| PUT schema — 판 6 뿌리 `Popup`(레이아웃 없음) | 200 · 저장 `7/popup/Popup` |
| PUT schema — 판 5 뿌리 `Popup` | 200 · 저장 `7/popup/Popup`(사슬 5 → 6 → 7) |
| PUT schema — 판 6 `layout: popup` + 뿌리 `Page` | 422 mismatch(판 6 단계가 아는 값을 그대로 두고 검증이 말한다) |
| PUT schema — 판 6 `layout: subpage` + 뿌리 `Page` | 200 · `7/subpage/Page`(판 6 이라 적은 문서의 아는 값은 산다 — `migrate-page-layout.ts` 머리말대로) |
| PUT schema — 판 7 `layout` 없음 | 400 `schema.layout`(문장은 «요청을 처리할 수 없습니다») |
| WS patch — `replace /layout popup` 만 | `patch-error` 422 `layout-root-mismatch@/layout` |
| WS patch — `remove /layout` | `patch-error` 422 `bad-document@/layout` |
| WS — 남(editor)이 뿌리 노드를 `lock` 한 채 `blank → subpage`(`/layout` 하나) | `patch-ack` — 설계대로 `/layout` 은 잠금과 안 겹친다 |
| WS — 같은 잠금 아래 팝업으로 바꾸는 묶음(`/root/type` 포함) | `patch-error` 423 `locked` |
| 스냅샷 복원 — payload 의 페이지를 DB 로 `subpage` + 뿌리 `Popup` 으로 고쳐 넣고 복원(입구가 없어 DB 로 지은 판) | 422 `layout-root-mismatch@/layout` «페이지1: 스키마 검증에 실패했습니다» · 페이지는 그대로(`7/popup/Popup`) |

붙이기 · 모듈 넣기 · 리베이스 뒤 묶음은 웹이 지은 연산이 WS patch(없으면 REST ops)로 나가는 같은 경계다 — 서버는 편집 뒤 문서 전체를 `validatePage` 로 본다(`edit-pipeline.ts` 6단계)라 «`test` 없는 묶음» · «리베이스 뒤 묶음» 도 결과 문서의 짝으로 갈린다. MCP `patch_page` 는 `ops` 를 그대로 `PATCH …/ops` 로 넘긴다(`packages/mcp/src/handlers.ts` 의 `patchPage`). CLI 는 페이지를 쓰는 명령이 없다(`git grep "method: 'PATCH'\|method: 'PUT'\|method: 'POST'" -- packages/cli/src` — 공통코드 · 로그인뿐). **우회는 찾지 못했다.**

탐침 원문: 스크래치 `boundaries.probe.ts.done` · `apiprobes/ws2.probe.ts`. 복원 판:

```ts
await sql`update snapshots set payload = jsonb_set(payload, '{pages,0,schema,layout}', '"subpage"') where id = ${snapId}`.execute(getTestDb())
const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${f.projectId}/snapshots/${snapId}/restore`, cookies: f.owner.cookie, payload: {} })
```

잠금 판: `b.send({ type: 'lock', pageId, nodeIds: [rootId] })` 뒤 `a` 가 `baseSeq: 0` 으로 두 묶음을 보냈다.

## 5 — `0038` · payload 판 5

- 판 4 스냅샷(`layouts` 를 품은 payload)은 이 브랜치에서 `0038` 이 판 5 로 고친 뒤 복원된다 — `migration-0038.test.ts` «옮긴 판 4 스냅샷이 지금 코드로 복원» 이 잠근다. 위 2 의 셈에서 판 2 · 3 · 4 셋 다 키가 걷혔다.
- **판 5 스냅샷을 앞 판 서버가 받는 길은 없다** — 스냅샷을 올리는 입구가 없고(`restore-plan.ts` 머리말), 앞 판 서버는 `0038` 뒤 DB 에서 뜨지 않는다(모르는 마이그레이션). 남은 것은 CLI 판 어긋남뿐이다:
  - 옛 `wireb` ↔ 새 서버: 판 5 를 옛 규격(`layouts` 필수)이 거절 — `payload.ts` 머리말이 적은 대로(앞 판들도 같은 꼴).
  - **새 `wireb` ↔ 옛 서버(F1):** `SnapshotPayloadSchema.safeParse({ payloadVersion: 4, …, layouts: [], … })` → `unrecognized_keys: layouts`. `fetchSnapshot`(`packages/cli/src/project.ts`)이 «프로젝트 덤프 응답이 규격과 다릅니다» 로 던진다. 앞 판까지는 규격이 키를 더하기만 해(theme · codes 는 선택) 새 CLI 가 옛 덤프를 읽었다 — 키를 걷은 이번 판이 처음 그 방향을 끊는다.
- `down` 이 빈 표를 다시 짓는 결정은 맞물린다 — 위 2 의 셈에서 내린 뒤 payload 넷이 판 4 · `layouts: []` 이고 표 · 칼럼이 섰다. 기준 판(`f3acecc0`)의 코드가 레이아웃 행을 읽는 자리는 캡처(`listLayouts`)와 프로젝트 만들기뿐이다(`git grep -n "default_layout_id\|listLayouts\|findLayout" main -- apps/api/src packages`) — 빈 표에서 복원 비교는 빈 집합끼리 맞는다. `down` 변조는 지침대로 api 프로젝트로 판이 안 서므로 재지 않았다.
- F4(코드로 읽음): `0037` down 은 `revisions.ops` 의 `/layout` 을 안 걷는다. 내린 판의 `PatchPath` 가 `/layout` 을 모르므로 그 revision 의 inverse 를 되보내면 400 이다. 되돌림(롤백) 때만 서는 길이다.

## 6 — 가져오기 · 내보내기 파일

`POST …/pages/import`:

| 파일 | 답 |
|---|---|
| 판 6 · 뿌리 `Popup`(바닥 구역) · `page.layoutRef: 'l_default'` | 201 · 저장 `7/popup/Popup` · 응답 `ignoredLayoutRef: "l_default"` |
| 판 5 · 뿌리 `Popup` | 201 |
| 판 7 · `layout` 없음 | 400 «페이지 JSON의 모양이 규격과 다릅니다» · 자리 `schema.layout` |
| 판 7 · `layout: popup` + 뿌리 `Page` | 422 «가져올 문서의 스키마 검증에 실패했습니다» · `layout-root-mismatch@/layout` |
| 판 7 · `layout: subpage` + 뿌리 `Page` | 201 · `7/subpage/Page` |

내보내기는 저장된 판 7 문서를 그대로 싣는다(`schema.layout` 포함). 판 7 파일을 기준 판(main)에 가져가면 그 봉투(`strictObject` · `layout` 모름)가 «모양이 다르다» 로 거절한다 — «모르는 판» 문장이 아니다. 판 어긋남이라 무게를 매기지 않았다(안 잼 · 코드로 읽음).

## 7 — 게이트의 빨강 둘(`editor-down-delay` · `menu-realtime`)

판마다 혼자(`--maxWorkers=1`) · load 30 아래에서 시작 · 이 브랜치 세 번 · 기준 판 사본(`f3acecc0` 을 `git archive` · `pnpm install --frozen-lockfile --prefer-offline` · `pnpm build` — Node v24.21.0 로 다시 지었다. 첫 빌드는 사본의 `mise.toml` 이 신뢰 전이라 Node 26 으로 돌아 버렸다) 세 번.

| 판 | 파일 | 회 | 시작 load(1·5·15분) | 통과 / 실패 / 건너뜀 |
|---|---|---|---|---|
| 브랜치 | `editor-down-delay` | 1 · 2 · 3 | 12.64 · 13.95 · 14.97 | 1/0/0 × 3 |
| 브랜치 | `menu-realtime` | 1 · 2 · 3 | 13.97 · 13.05 · 18.32 | 19/0/0 × 3 |
| 기준 사본 | `editor-down-delay` | 1 · 2 · 3 | 17.70 · 24.89 · 29.40 | 1/0/0 × 3 |
| 기준 사본 | `menu-realtime` | 1 · 2 · 3 | 27.16 · 22.80 · 28.73 | 19/0/0 × 3 |

**열두 판 모두 초록**이다(16:10 – 16:17 · 기준 사본 둘째 `menu-realtime` 의 끝 load 39.6). `pmset -g log` 의 마지막 Sleep 은 09:34 — 구간에 잠듦 없음. 게이트의 두 빨강(끝 load 48)은 낮은 load 에서 재현되지 않았고 기준 판에서도 같은 판이 초록이라 **이 브랜치가 연 결함의 증거가 없다** — ly2 보고의 «부하 판» 판정과 같다. 높은 load 에서 기준 판도 죽는지는 재지 않았다(브리프의 조건이 load 30 아래다).

## 지침

1. **기준 판 사본을 스크래치에 풀면 `mise trust <사본>/mise.toml` 을 먼저 친다** — 안 치면 `mise env` 가 사본의 설정을 거절해 PATH 의 다른 Node(이 기계는 v26.13.1)로 `pnpm install` · `pnpm build` 가 돈다(오류 없음). 자리: `.ruler/` 의 워커 지침 「병렬 브랜치가 잰 수는 …」 의 «기준선 · 옆 브랜치의 수는 실행 없이 …» 문단(`git archive` 로 스크래치에 풀고 …) 끝에 «푼 사본은 `mise trust <사본>/mise.toml` 뒤 `mise env` 로 Node 를 적는다» 를 넣는다. 검증 지침 「게이트 · 변조 스크립트는 판의 런타임을 스스로 증명한다」 와 같은 뿌리다.
2. 실브라우저 탐침에서 번들 CSS 를 글자로 세면(`cssMentions`) 빌드가 공백을 걷은 꼴(`rgb(1,2,3)`)과 견줘야 한다 — 계산값으로 재는 편이 낫다. 넣을 자리가 마땅치 않아 문장은 제안하지 않는다(이 보고에만 둔다).

## 끝

16:18 — 서버 · vitest 없음(`ps` · 포트 3144 LISTEN 0) · 게이트 슬롯 파일 지움 · 커밋 직전 추적 파일 색인 md5 `11982d53bd96c4c7652ce85c5b59e254`(시작과 같다 — 다른 쓰는 자 없음) · `git status --short` 는 이 보고 한 줄(`??`)뿐.
