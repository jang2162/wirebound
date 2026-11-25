# 페이지 레이아웃 — 빈 · 팝업 · 서브페이지

페이지마다 **레이아웃**을 고른다. 레이아웃은 페이지 내용을 감싸는 틀이고 셋으로 고정이다 — **빈**(`blank` · 틀 없음), **팝업**(`popup` · 제목줄과 닫기가 있는 상자), **서브페이지**(`subpage` · GNB · LNB · 브레드크럼브 · 페이지 제목). 틀은 테마가 그리고, 서브페이지의 메뉴들은 프로젝트의 메뉴 트리에서 짓는다. 편집 중에 거슬리는 영역은 끌 수 있고, 끌 수 있는 영역은 테마가 선언하며, 켬/끔은 사람 × 프로젝트마다 저장한다.

**정해진 것(사용자 결정 — 이 문서는 뒤집지 않는다):**

1. 테마가 그리는 고정 3종이다. 페이지 속성 `layout: blank | popup | subpage`. GNB · LNB · 브레드크럼브는 테마 뷰가 메뉴 트리 데이터로 그린다. `Slot` 레이아웃 트리(정본 「레이아웃」 절 · `layouts` 표)를 쓰는 길은 고르지 않았다.
2. 팝업 판정을 속성으로 옮기고 저장된 문서를 마이그레이션한다.
3. 표시 옵션은 편집 모드에만 적용한다. 뷰 모드 · HTML 번들 · PPTX 는 늘 전부 켠 상태로 그린다.

시안은 `/Users/jang2162/Projects/Personal/wirebound/.worktrees/.coord/skala-theme/index.html` 의 «④ 서브페이지 레이아웃 + 표시 옵션» · «시스템 제안», 치수의 기준은 lms-skala 관리자 셸(`src/main/resources/templates/layout/mng/mainHeader.html` · `mainLeft.html`, `static/public/mng/scss/_header.scss` · `_lnb.scss` · `_content.scss`)이다 — GNB 높이 60px, LNB 폭 240px(메뉴 · 즐겨찾기 탭 · 접기 손잡이), 본문 패딩 24/28, 브레드크럼브 12.5px, 페이지 제목 22px.

구현 차례는 `docs/superpowers/plans/2026-11-25-page-layout-plan.md` 가 갖는다.

---

## 모델

### `layout` 은 페이지 문서의 필드다

```jsonc
{ "version": 7, "layout": "subpage", "root": { "id": "n_…", "type": "Page", "children": [] }, "viewStates": [ … ] }
```

- 값은 `'blank' | 'popup' | 'subpage'` 셋뿐이다(`packages/schema` 에 `PAGE_LAYOUTS` · `PageLayout`). 판 7 문서에는 늘 있다 — 봉투(`envelope.ts` 의 문서 스키마)가 없는 값 · 모르는 값을 거절한다.
- **문서 판을 6 → 7 로 올린다**(`migrate.ts` 의 `CURRENT_DOCUMENT_VERSION`). 런타임 사슬의 판 6 → 7 단계가 값을 채운다 — 뿌리가 `Popup` 이면 `popup`, 그 밖은 `blank`(옛 화면이 한 픽셀도 안 바뀌는 값). 같은 함수를 DB 마이그레이션이 저장된 문서마다 부른다(「팝업 옮기기」).

**문서에 두는 까닭(페이지 행 칼럼이 아니다):**

| 성질 | 문서 필드면 | `pages.layout` 칼럼이면 |
|---|---|---|
| 되돌리기 · 이력 | 편집 묶음 하나(`/layout`)라 revision · 개인 undo · 리베이스를 그대로 탄다 | 칼럼 쓰기에는 revision 이 없다 — 따로 지어야 한다 |
| 팝업으로 바꾸기 | `/layout` 과 뿌리 갈아 끼우기가 **한 묶음** — 둘이 어긋난 채 커밋될 길이 없다 | 칼럼 쓰기와 문서 편집이 두 쓰기라 사이에서 끊기면 둘이 갈린다 |
| 스냅샷 · 페이지 JSON · 클립보드 · MCP · CLI | 문서를 나르는 자리가 전부 그대로 나른다 | 나르는 자리마다 칼럼을 더해야 한다 |
| 잠금 | `/layout` 은 `/root` 밖이라 노드 잠금과 겹치지 않는다(`lock.ts` 의 겹침은 `/root` 아래 경로끼리만 선다 — `viewStates` 와 같은 자리다) | — |

메뉴 트리 응답처럼 문서를 통째로 싣지 않는 자리는 `schema->>'layout'` 하나만 고른다(`repos/pages.ts` 의 `listPageRows` 가 지금 `schema->'root'->>'type'` 을 고르는 자리).

### 기본값

| 판 | 값 |
|---|---|
| 판 6 이하 문서(저장된 것 · 가져오기 · 클립보드 · REST 의 옛 판) | 뿌리 `Popup` → `popup`, 그 밖 → `blank` |
| `POST …/pages` 에 `layout` 이 없음 | `blank`(`kind: 'popup'` 이면 `popup`) — API · MCP · 테스트 픽스처의 페이지가 틀 없이 선다 |
| 에디터 메뉴 트리 «페이지 추가» | 요청에 `layout: 'subpage'` 를 실어 보낸다(「정한 것」 1) |
| «팝업 페이지 추가» | `popup` |

API 의 기본값을 `blank` 로 두는 까닭: 픽스처 · 에이전트가 만든 페이지가 테마의 GNB · LNB 를 얻으면 캔버스의 노드 좌표 · PPTX 그림 크기가 테마마다 바뀌어, 좌표로 판을 세우는 실브라우저 케이스와 화면 크기를 견주는 api 케이스가 한꺼번에 흔들린다. 사람이 고르는 입구(에디터)만 사람의 기본값을 싣는다.

### 문서를 나르는 자리

| 자리 | 실리는 것 |
|---|---|
| revision · 리베이스 · 개인 undo | `{ op: 'replace', path: '/layout' }` — 바꾸는 묶음의 첫 연산은 `{ op: 'test', path: '/layout', value: <바꾸기 전> }`(남이 먼저 바꿨으면 리베이스가 묶음을 버린다) |
| 스냅샷 payload | `pages[].schema.layout`(판 7 문서). payload 판은 「겹치는 기존 장치」 의 `layouts` 걷기와 함께 4 → 5 |
| 페이지 JSON(가져오기 · 내보내기) | `schema.layout`. 판 6 파일은 런타임 사슬이 채운다. `page.layoutRef` 는 그대로 «받되 쓰지 않는다»(「겹치는 기존 장치」) |
| 클립보드 봉투 · 모듈 | 노드 묶음이라 `layout` 과 무관하다 |
| MCP `get_page` · `list_pages` · CLI `page get` | `document.layout` 과 `PageView` 의 새 칸 `layout`(`pageView` 가 `pageLayoutOf` 로 읽는다 — 판 6 이하 문서는 뿌리에서) · `list_pages` 의 페이지마다 `layout`. `kind` 는 남긴다 — `layout === 'popup'` 이면 `popup`, 그 밖은 `page`(읽는 자리가 이미 쓰는 값이다). `page get` 의 사람 출력은 이름 뒤에 «서브페이지» · «팝업» 을 붙인다(빈 레이아웃은 옛 줄 그대로) |
| MCP `patch_page` | `/layout` 을 고치는 연산을 그대로 받는다 — 팝업 경계를 넘는 묶음은 뿌리 갈아 끼우기를 함께 실어야 검증(`layout-root-mismatch`)을 지난다. 꼴은 스킬 문서(`packages/mcp/skill/SKILL.md` 「고칠 때」)가 가르치고 `apps/api/test/page-layout-skill.test.ts` 가 그 예를 글자 그대로 보낸다 |
| 메뉴 트리 응답(`GET …/tree`) | 페이지마다 `layout` 을 더하고 `kind` 는 그것에서 짓는다 |
| `POST …/pages` | 본문에 `layout?` 를 더한다. `kind` 는 남긴다(`kind: 'popup'` ≡ `layout: 'popup'`). 둘이 어긋나면(`kind: 'popup'` + `layout: 'subpage'`) 400 |

---

## 팝업 옮기기

### 판정은 `layout` 하나, 뿌리 `Popup` 은 그 짝으로 남는다

**팝업 레이아웃의 틀은 뿌리 `Popup` 노드가 그린다.** `Popup` 은 카탈로그에 남고, 판 7 문서에서 `layout === 'popup'` ⇔ 뿌리 타입 `Popup` 이다 — 검증 오류 `layout-root-mismatch`(`validate.ts` — 봉투를 지난 문서에 돈다)가 둘이 어긋난 문서를 모든 저장 경계에서 거절한다. **«팝업인가» 를 묻는 자리는 전부 `layout` 을 읽는다**(`pageKindOf` 가 `doc.layout` 을 본다). 뿌리 타입을 읽는 자리는 검증 하나만 남는다.

뿌리를 `Page` 로 바꾸고 제목 · 크기를 페이지 속성으로 옮기는 길을 고르지 않은 까닭:

- **팝업의 «바닥» 은 설계 내용이다.** `[취소][저장]` 은 상호작용(«팝업 닫기»)을 든 노드이고 코멘트 번호 · 잠금 · 되돌리기를 탄다. 뿌리가 `Page` 면 그 노드들이 설 구역이 없다 — `Page` 에 레이아웃마다 다른 구역을 더하면 검증이 레이아웃을 보고 구역을 가려야 하고, 바꿀 때마다 구역을 옮기는 연산이 는다.
- **앞 판 테마가 그대로 선다.** 기본테마 1.5.0 · 1.6.0 · 1.7.0 · 2.0.0 과 그 밖 저장된 테마가 `[data-wb-component="Popup"] > [data-wb-part="titlebar" | "body" | "footer" | "close"]` 를 꾸민다(`system-themes/admin/src/theme.css` · `packages/theme-sdk/src/default-views/structure.tsx` 의 `PopupView` 와 덮개 층 규칙). 뿌리를 바꾸면 고정된 프로젝트의 팝업이 테마 꾸밈을 잃는다.
- **팝업을 꾸미는 장치가 그대로 맞다** — 덮개 층(`packages/renderer/src/popup-layer.tsx` 의 `PopupLayer` · `isPopupClose` 의 `close` 조각), 캡처 규칙(`packages/theme-sdk/src/capture.ts`), `wb-theme check` 의 팝업 조각 검사(`packages/theme-kit/src/check.ts`), 갤러리 표본.

대가: 두 값이 짝이라 «팝업 ↔ 다른 레이아웃» 바꾸기는 뿌리를 갈아 끼우는 편집이다 — 남이 뿌리를 쥐었으면 잠금이 막는다(지금 «종류» 바꾸기와 같다). `blank ↔ subpage` 는 `/layout` 하나라 잠금과 무관하다.

### 판정을 읽는 자리 — 바꿀 곳

다시 재는 법: `git grep -n "pageKindOf\|'Popup'\|\"Popup\"" -- packages apps`(테스트 포함 줄 수) · 테스트를 뺀 파일은 같은 식에 `git grep -l` 를 쓰고 `/test/` · `build-test` · `.test.` 를 거른다. 뿌리 타입을 다른 이름으로 읽는 자리는 `git grep -l "isPopupDocument\|root_type\|rootIsPopup" -- packages apps` 로 센다.

| 자리 | 지금 읽는 것 | 바꾼 뒤 |
|---|---|---|
| `packages/schema/src/new-page.ts` 의 `pageKindOf` | `root.type === 'Popup'` | `doc.layout === 'popup'` |
| 같은 파일 `newPageDocument(kind, title)` | 종류 | `newPageDocument(layout, title)` — `layout` 을 싣고 `popup` 이면 지금처럼 뿌리 `Popup` + 바닥 |
| `packages/schema/src/validate.ts` 의 `ROOT_TYPES` | 뿌리가 `Page` · `Popup` | 그대로 + `layout-root-mismatch` |
| `packages/schema/src/page-view.ts` 의 `pageView` | `pageKindOf` | 그대로(판정이 바뀐다) + `layout` 칸 |
| `packages/schema/src/lint/design.ts` | `pageKindOf` — `modal-target-not-popup` · `navigate` 가 팝업을 가리킴 · 화면의 `closeModal` | 그대로(판정이 바뀐다). 규칙 문장(«팝업 페이지»)은 그대로 둔다 |
| `packages/renderer/src/popup-layer.tsx` 의 `isPopupDocument` | 뿌리 타입 | `doc.layout === 'popup'`(검증 전 문서는 `pageKindOf` 와 같은 꼴로 견딘다). 팝업 문서를 얻는 곳(캔버스 `canvas-popups.tsx` · 번들 `exporter/src/bundle/index.ts` · 런타임 `exporter/src/browser/mount.tsx`)이 이것을 부른다 |
| `apps/api/src/services/menu-tree.ts` 의 `buildMenuTree` · `repos/pages.ts` 의 `listPageRows` | `schema->'root'->>'type'` | `schema->>'layout'` · 응답에 `layout` |
| `apps/api/src/services/export-bundle.ts` · `export-pptx.ts` | `pageKindOf` | 그대로(판정이 바뀐다) |
| `packages/cli/src/read/page.ts` · `commands/page-get.ts` | `pageKindOf` · `view.kind` | 그대로 + 줄에 레이아웃 이름 |
| `apps/web/src/panels/page-kind.tsx` · `edit/page-kind-ops.ts` | «종류» `[화면] [팝업]` | «레이아웃» `[빈] [서브페이지] [팝업]` — 「캔버스 · 내보내기」 의 «페이지 정보» |
| `apps/web/src/panels/menu-tree.tsx` 의 팝업 표지 · `panels/interaction-panel.tsx` 의 대상 고르개 | `pageKindOf` · 트리 `kind` | 그대로 |
| `apps/web/src/tree/use-tree-commands.tsx` «팝업 페이지 추가» · «페이지 추가» | `kind` | `layout` 을 싣는다 |
| `packages/theme-gallery` 표본 · 예제의 팝업 문서 · `packages/exporter/test-support/fixtures.ts` | 뿌리 `Popup` | 문서에 `layout: 'popup'` 을 더한다 |

### 마이그레이션

DB 마이그레이션 `0037-page-layout` 이 판 6 문서를 판 7 로 옮긴다 — `packages/schema` 의 판 6 → 7 함수(`liftPageLayout` — 런타임 사슬과 같은 함수)를 저장된 문서가 사는 자리마다 부른다.

| 표 · 칸 | 옮기는 것 |
|---|---|
| `pages.schema` · `schema_version` | `layout` 을 채우고 판 7 로. **`head_seq` 는 안 올린다** — 있던 경로가 하나도 안 바뀐다(`/layout` 은 새 자리다). 판 6 바탕의 편집(열어 둔 탭 · 에이전트의 `baseSeq`)은 그대로 적용된다 |
| `snapshots.payload` 의 `pages[]` | 같은 함수 · `schemaVersion` 7 |
| `modules.nodes` · `personal_modules.nodes` | 노드 묶음이라 옮길 것이 없다 |
| `layouts.schema` | 옮기지 않는다 — 같은 차례에서 표를 걷는다(「겹치는 기존 장치」) |

`down` 은 `layout` 을 지우고 판 6 으로 내린다(뿌리가 짝이라 잃는 값이 `blank` · `subpage` 의 구별뿐이다 — 내린 `subpage` 는 판 6 에 없는 값이라 버린다). 편집 이력(`revisions`)의 `ops` · `inverse` 에서도 `/layout` 연산을 걷는다 — 내린 판의 `PatchPath` 가 모르는 경로라 남기면 그 되돌리기가 400 이다. 둘 다 빈 revision(레이아웃만 바꾼 편집)은 지운다 — 판 6 에서는 아무것도 안 바꾼 편집이고, 지운 번호는 구멍으로 남는다(이력은 `seq < 커서` 로 읽는다).

**«남은 옛 판 0» 셈은 문서가 사는 자리 전부를 센다** — `pages` 와 스냅샷 payload 의 `pages[]` 둘이다(지침 「수를 셀 때는 두 번 세고」 덧붙임의 마이그레이션 항목).

### 앞 판 시스템 테마에 고정된 프로젝트

| 테마 | 팝업 페이지 | 서브페이지 |
|---|---|---|
| 기본테마 1.5.0 · 1.6.0 · 1.7.0 · 2.0.0 · 2.1.0(그리고 `layouts` 를 선언하지 않은 모든 저장된 테마) | 뿌리 `Popup` 을 그 테마가 그대로 그린다. 바뀌는 것은 호스트가 그리는 바깥뿐이다 — 캔버스 · 번들 장에서 흐린 막 위 가운데(「캔버스 · 내보내기」) | SDK 기본 레이아웃 뷰가 내용만 그린다 — 화면은 `blank` 와 같다. 끌 영역이 없어 «보기» 메뉴가 «이 테마는 끌 영역을 선언하지 않았습니다» 를 말한다 |
| 레이아웃 뷰를 낸 판(기본테마 2.2.0 부터) | 같다 | 테마의 GNB · LNB · 브레드크럼브 · 제목 |

마이그레이션은 옛 화면 페이지를 `blank` 로 두므로 테마를 올리기 전에도 뒤에도 옛 페이지는 사람이 `subpage` 로 바꿀 때까지 그대로다.

---

## 테마 계약

### manifest — `layouts`

```ts
// ThemeManifest(packages/theme-sdk/src/types.ts)에 더한다 — 선택 키
layouts?: Partial<Record<PageLayout, { regions: readonly LayoutRegionDecl[] }>>

interface LayoutRegionDecl {
  id: string        // ^[a-z][A-Za-z0-9]{0,31}$ — 레이아웃 안에서 유일
  label: string     // 1–20자 — «보기» 메뉴의 항목 이름
  toggle?: boolean  // 끌 수 있나 — 없으면 true
}
```

기본테마의 선언(2.2.0 부터):

```ts
layouts: {
  subpage: {
    regions: [
      { id: 'gnb', label: 'GNB' },
      { id: 'lnb', label: 'LNB' },
      { id: 'breadcrumb', label: '브레드크럼브' },
      { id: 'title', label: '페이지 제목' },
    ],
  },
}
```

- 검증은 `packages/themes` 의 `ManifestSchema`(모양 — `z.strictObject` 라 이 키를 더해야 받는다)와 `validateManifest`(레이아웃 키 셋 밖 · 겹친 id · 영역 8 개 초과를 이슈로)다. 빌드 · 업로드 · 시딩 · 호스트가 같은 함수를 부른다.
- `layouts` 가 없는 manifest 는 그대로 받는다 — 앞 판 테마는 «선언한 영역 없음» 이다.

### 뷰 — `ThemeDefinition.layouts`

```ts
// packages/theme-sdk/src/types.ts
interface ThemeDefinition {
  manifest: ThemeManifest
  views: Readonly<Partial<Record<string, View>>>
  layouts?: Readonly<Partial<Record<PageLayout, LayoutView>>>   // 새 키
}
type LayoutView = ComponentType<LayoutViewProps>

interface LayoutViewProps {
  layout: PageLayout
  /** 페이지 이름(`pages.title`) — 제목 영역이 쓴다. 팝업 제목(`Popup.title`)과 따로다. */
  title: string
  /** 메뉴 트리 뿌리들 — GNB. 항목마다 하위가 다 들어 있어 드롭다운도 그린다. */
  gnb: readonly LayoutNavItem[]
  /** 지금 페이지가 든 뿌리 메뉴 — LNB 는 그 `children` 이다. 트리에 없는 페이지면 `null`. */
  lnb: LayoutNavItem | null
  /** 뿌리 메뉴 → … → 지금 페이지. 브레드크럼브. */
  trail: readonly LayoutNavItem[]
  /** 선언한 영역마다 지금 그리는가 — 호스트가 정한다(「표시 옵션 저장」). 선언 밖 id 는 없다. */
  regions: Readonly<Record<string, boolean>>
  /** 페이지 내용(문서 뿌리를 그린 것). 뷰는 이것을 정확히 한 번 둔다. */
  children: ReactNode
}

interface LayoutNavItem {
  id: string                 // 메뉴 id 또는 페이지 id
  kind: 'menu' | 'page'
  title: string
  /** 누르면 갈 페이지 — 페이지면 제 id, 메뉴면 그 아래 첫 화면 페이지(「메뉴 트리 → GNB · LNB · 브레드크럼브」), 없으면 null */
  pageId: string | null
  /** 지금 페이지이거나 그 조상 메뉴 */
  current: boolean
  children: readonly LayoutNavItem[]
}
```

SDK 가 내는 조각 둘(`packages/theme-sdk` — `Zone` 과 같은 자리):

- **`<LayoutRegion id>`** — 그 영역이 꺼졌으면(`regions[id] === false`) 아무것도 안 그린다. 켜졌으면 `data-wb-layout-region={id}` 를 단 요소로 감싼다. 끌 수 있는 영역은 이것으로만 감싼다 — 호스트의 켬/끔이 테마 코드 없이 선다.
- **`<LayoutLink item>`** — 항목 하나의 링크. 누름은 호스트가 정한다(문맥 — 편집 모드는 아무것도 안 함 · 뷰 모드는 그 페이지로 옮김 · 번들은 그 장 파일의 `href` · 캡처는 아무것도 안 함). `pageId` 가 `null` 이면 링크가 아닌 글(`aria-disabled`)이다. 지금 페이지면 `aria-current="page"`.

**SDK 기본 레이아웃 뷰는 셋 다 `children` 만 그린다**(영역 없음). 레이아웃 뷰를 안 낸 테마 · 앞 판 테마는 세 레이아웃이 같은 화면이다 — 팝업은 뿌리 `Popup` 이 상자를 그린다.

렌더러가 뷰 밖을 감싼다(`packages/renderer` 의 새 `LayoutFrame`):

```html
<div data-wb-layout="subpage">                       ← 렌더러
  …테마 레이아웃 뷰가 그린 것…
    <div data-wb-layout-content>  …문서 뿌리…  </div>  ← 렌더러가 `children` 을 감싼다(`display: contents`)
</div>
```

- `data-wb-layout` 안 · `data-wb-layout-content` 밖이 **틀**이다 — 캔버스가 이 둘로 노드 자리와 틀을 가른다(「캔버스 · 내보내기」). `data-wb-layout-content` 는 `display: contents` 라 테마 CSS 의 배치에 끼지 않는다(SDK 기본 CSS — 특이도 0).
- 틀 안 요소에는 `data-wb-id` 를 달지 않는다 — 노드가 아니다(코멘트 번호 · 고르기 · 잠금 · 끌기 대상이 아니다).
- 레이아웃 뷰가 던지면 노드 뷰와 같이 SDK 기본(내용만)으로 대신 그리고 오류를 알린다.

SDK 판은 1.10.0(더하기만 하는 계약 — `^1.8.0` 을 선언한 테마가 그대로 맞는다).

### `wb-theme check` 가 더 볼 것(`packages/theme-kit/src/check.ts`)

| 검사 | 판 |
|---|---|
| 레이아웃 뷰가 `children` 을 정확히 한 번 둔다 · 안 던진다 | 그린 판마다(모두 켬 · 끌 수 있는 영역 하나씩 끔 · 지금 페이지가 트리에 없는 내비 · 빈 내비) 그려진 `[data-wb-layout-content]` 수와 문서 뿌리 노드(`[data-wb-id=<뿌리 id>]`) 수가 1 · 틀에 `data-wb-error` 가 없다 — 뷰가 `regions` · `lnb` 로 갈라 그리면 한 판만 세서는 끈 판에서 내용이 사라지거나 두 번 서는 뷰가 지나고, 내용 상자 속성만 흉내 낸 빈 요소는 뿌리 노드로 걸린다 |
| 선언한 끌 수 있는 영역이 `LayoutRegion` 으로 섰다 | 모두 켠 판에 `[data-wb-layout-region=<id>]` 가 있고, 그 하나만 끈 판에 없다 |
| 선언 밖 영역 id | 그려진 `data-wb-layout-region` 가운데 manifest 에 없는 것 — 경고 |

**틀의 배치 규칙이 형제 구조로 안 가르는지는 kit 이 안 본다** — 노드 뷰 CSS 의 형제 셀렉터도 안 보는 것과 같다(읽으려면 CSS 파서가 든다). 영역을 끄면 형제가 바뀌므로 그 성질은 테마 몫이다 — 기본테마는 틀 규칙째 `system-themes/admin/test/admin.test.ts` «배치를 바꾸는 규칙은 형제 구조로 안 가른다» 가 센다. 올린 테마에는 열려 있다.

---

## 메뉴 트리 → GNB · LNB · 브레드크럼브

### 지금 메뉴 트리의 모양

메뉴(`menu_nodes` — `parent_id` · `sort_order`)는 트리이고 페이지(`pages.menu_node_id` — NOT NULL)는 메뉴에 매달린 잎이다 — **메뉴에 안 든 페이지는 없다.** 한 메뉴 안에서 페이지들이 먼저, 하위 메뉴가 뒤에 선다(메뉴 트리 칸이 그 차례로 그린다). 메뉴에 «숨김» 표지는 없다(`MenuNodesTable` 칸: id · project_id · parent_id · title · sort_order · created_at).

### 짓는 규칙 — `buildLayoutNav`(`packages/schema`, 순수 함수)

입력은 메뉴 트리(트리 응답 `TreeMenuNode[]` 와 같은 꼴 — 페이지마다 `layout`)와 지금 페이지 id. 캔버스 · 번들 · 갤러리 예제가 이 함수 하나를 부른다.

| 항목 | 규칙 |
|---|---|
| 항목에 드는 페이지 | `layout` 이 `popup` 이 아닌 페이지(빈 · 서브페이지). **팝업 레이아웃 페이지는 GNB · LNB · 브레드크럼브 어디에도 안 선다** — 화면이 아니라 덮개로 여는 것이다 |
| 차례 | 메뉴 안에서 페이지(그 메뉴의 차례) → 하위 메뉴(그 차례) |
| GNB | 뿌리 메뉴들. 뿌리 메뉴 아래 항목은 다 든다(드롭다운은 테마가 정한다) |
| 메뉴의 `pageId` | 그 메뉴 아래를 위 차례로 훑은 **첫 화면 페이지** — 없으면 `null`(빈 메뉴 · 팝업만 든 메뉴) |
| LNB | 지금 페이지가 든 뿌리 메뉴(`lnb`) — 그 `children` 이 LNB 항목이다. 깊이를 자르지 않는다(lms-skala 는 4단까지 그린다 — 자르는 것은 테마다) |
| 브레드크럼브(`trail`) | 뿌리 메뉴 → … → 페이지가 든 메뉴 → 지금 페이지. «홈» 같은 머리 항목은 테마가 더한다 |
| `current` | 지금 페이지와 그 조상 메뉴 |
| 화면 상태 | 메뉴 항목이 아니다(시안 «화면 상태(«답글 등록 폼 열림» 등)는 메뉴에 안 그립니다») |
| 지금 페이지가 트리에 없음(막 만들어 트리가 아직 안 옴 · 트리 조회 실패) | `gnb` 는 받은 트리 그대로, `lnb: null`, `trail` 은 지금 페이지 하나 |
| 지금 페이지가 팝업 레이아웃 | 서브페이지 뷰를 안 부르므로 쓰지 않는다 |

방향 제어 글자를 든 메뉴 · 페이지 이름은 `buildLayoutNav`(항목 `title`)와 `LayoutFrame`(뷰의 `title`)이 `isolateBidi` 로 가둬 내린다 — 짝 없는 U+202E 는 `<a>` · `<span>` 끝을 넘어 문단 끝까지 뒤집으므로(브레드크럼브의 구분 글자 · 다음 항목) 항목마다 따로 요소로 두는 것은 격리가 아니다. 뷰가 `LayoutLink` 로 두든 이름을 한 글로 이어 붙이든 같다. 제어 글자가 없는 이름은 글자 그대로다. 실 Chrome 판은 `packages/theme-kit/build-test/layout-bidi.test.ts` 가 잰다.

### 틀의 링크를 누르면

| 판 | `LayoutLink` 누름 |
|---|---|
| 편집 모드 캔버스 | **아무 일도 없다** — 고름도 안 바뀐다(틀은 노드가 아니다). 포인터는 기본 화살표 |
| 에디터 뷰 모드 캔버스 | 그 페이지를 연다(메뉴 트리 칸의 링크와 같은 이동 — 뷰 모드는 그대로). `pageId` 가 `null` 이면 링크가 아니다 |
| HTML 번들 장 | 그 장 파일로 옮긴다(`href` — 번들이 페이지 경로를 이미 든다) |
| 화면 모드 · PPTX 캡처 | 아무 일도 없다 |

상호작용(«이동» · «팝업 열기»)은 노드의 것이라 틀과 무관하다 — 틀은 상호작용 규칙을 갖지 않는다.

---

## 표시 옵션 저장

### 표

```
project_view_prefs(user_id, project_id, hidden_regions jsonb, updated_at)
  PK (user_id, project_id) · user_id → users CASCADE · project_id → projects CASCADE
  hidden_regions = 끈 영역의 열쇠 목록 «<레이아웃>.<영역 id>»(예: "subpage.gnb") — 최대 32 개 · 열쇠 꼴 ^(blank|popup|subpage)\.[a-z][A-Za-z0-9]{0,31}$
```

- **행이 없으면 다 켠 것이다.** 저장은 끈 것만 든다 — 테마가 새 영역을 더하면 켠 채로 선다.
- **모르는 열쇠는 그대로 둔다** — 테마를 바꿔 영역이 사라져도 지우지 않는다(되돌아온 테마에서 다시 꺼진다). 그리는 쪽이 지금 테마가 선언한 끌 수 있는 영역에만 적용한다.
- 멤버에서 빠져도 행은 남는다(끈 영역 열쇠뿐이다) — 다시 들어오면 그대로 받는다. 프로젝트를 지우면 함께 지워진다.
- **스냅샷 · 복원 · 페이지 JSON · 내보내기와 무관하다** — 문서가 아니라 사람의 화면 설정이다. revision · 되돌리기가 없다(나중 쓰기가 이긴다).

### API

| 경로 | 메서드 | 권한 | 본문 | 응답 |
|---|---|---|---|---|
| `/api/projects/:projectId/view-prefs` | GET | viewer(세션) | — | 200 `{ hiddenRegions: string[] }`(행이 없으면 `[]`) |
| `/api/projects/:projectId/view-prefs` | PUT | viewer(세션) | `{ hiddenRegions: string[] }` | 200 같은 꼴. 꼴 밖 열쇠 · 33 개 이상 · 겹친 열쇠는 400 |

- **viewer 도 저장한다** — 읽기 도구의 설정이다(«배치 선» 이 viewer 에게도 서는 것과 같다).
- **토큰으로 부르면 403** — 사람의 화면 설정이다(`DELETE …/tokens/:tokenId` 와 같은 꼴). 경로 파라미터가 `:projectId` 라 인증 훅은 토큰을 받으므로 라우트가 거절한다.
- 비멤버는 가드의 404.
- **실시간 방송이 없다** — 남에게 보일 것이 아니다. 같은 사람의 다른 탭은 에디터를 다시 열 때 읽는다.
- 쓰기는 그 행 하나의 upsert 다 — 다른 행을 잠그지 않는다. 그래도 가드 뒤 재확인을 지나는 쓰기라 `apps/api/test/guard-in-lock.test.ts` 의 분모 · 상태 셈에 이 표를 더한다(지침 「새 표를 쓰는 라우트를 더하면」).

### 에디터의 입구 — 머리의 «보기»

- 머리 도구 줄의 **«배치 선» 곁**에 «보기» 단추(아이콘 · 접근 이름 «보기») — 누르면 체크박스 목록 팝오버. **편집 모드에서만 선다**(뷰 모드는 늘 다 켠다 — 정해진 것 3). 모든 역할에 선다.
- 항목은 **열린 페이지의 레이아웃**에 지금 테마가 선언한 끌 수 있는 영역이다(`toggle !== false`) — 이름은 선언의 `label`. 끌 영역이 없으면(빈 · 팝업 · 선언 없는 테마) 단추는 꺼지고 까닭을 말한다(«이 레이아웃에는 끌 영역이 없습니다» · «이 테마는 끌 영역을 선언하지 않았습니다»).
- 누르면 곧바로 캔버스에 반영하고 PUT 을 보낸다. 실패하면 되돌리고 통지 한 줄(«보기 설정을 저장하지 못했습니다»). 연달아 누른 것은 마지막 값 하나로 보낸다.
- 에디터를 열 때 GET 으로 읽는다 — 읽기 전 · 실패한 동안은 다 켠 판으로 그린다.
- 머리 접기(`shell/head-fold.ts` 의 단계 표)에 이 단추의 자리를 더한다 — «배치 선» 과 같은 단계에서 `…` 로 접힌다.

---

## 캔버스 · 내보내기

### 캔버스(`apps/web/src/canvas/canvas.tsx` 의 `CanvasDocument`)

- 문서를 `LayoutFrame` 으로 감싸 그린다 — 레이아웃 · 내비(`buildLayoutNav` — 에디터가 든 메뉴 트리 조회 값) · 영역 켬/끔(편집 모드면 `hidden_regions` 를 지금 테마의 선언에 적용 · 뷰 모드면 다 켬)을 넘긴다.
- **틀은 노드가 아니다:**
  - 고르기 — 누른 자리가 `[data-wb-layout]` 안 · `[data-wb-layout-content]` 밖이면 고름을 안 바꾼다(`canvas-pick.ts` 의 `nodeIdAt` 는 `data-wb-id` 조상이 없어 `null` 이고, 지금 `null` 은 «바탕을 누름» 이다 — 틀은 그 갈래에서 뺀다).
  - 끌어 놓기 — 포인터가 틀 위면 **놓을 자리가 없다**(미리보기 없음 · 놓아도 편집 없음). `canvas-drop.ts` 의 «뿌리의 노드 사이 바탕은 가장 가까운 자식의 앞 · 뒤» 와 «페이지 끝» 갈래가 틀을 바탕으로 읽지 않게 한다.
  - 사각형 고르기 · 가장자리 자동 스크롤 · 외곽선 · 코멘트 번호는 그려진 상자를 재므로 틀이 민 자리를 그대로 따른다.
- 폭 · 배율 — 뷰포트 폭(`viewportWidth` · 기본 1280)과 맞춤 배율(`routes/editor.tsx` 의 `fitZoom`)은 그대로다. 서브페이지는 그 폭 안에 틀과 내용을 함께 그린다(LNB 240 이면 내용 칸이 그만큼 좁다).
- **팝업 레이아웃** — 뷰포트 폭 전체를 흐린 막으로 깔고 팝업 상자를 가운데 위(위 여백 24px)에 제 크기로 세운다(시안 항목 09). 상자가 뷰포트보다 넓으면 뷰포트 − 2 × 여백. 막은 틀이다 — 누름 · 끌기 대상이 아니다. 막 · 가운데 세우기는 호스트(렌더러의 `LayoutFrame` 의 팝업 판 · SDK 기본 CSS)가 그려 테마 판과 무관하다. 뷰 모드에서 «팝업 열기» 로 덮개 위에 쌓는 팝업(`PopupLayer`)은 틀 없이 상자만 쌓는다(덮개가 이미 막이다).

### «페이지 정보» 탭의 «레이아웃»

지금 «종류» `[화면] [팝업]`(`panels/page-kind.tsx`) 자리를 **«레이아웃» `[빈] [서브페이지] [팝업]`** 로 바꾼다 — 단추 꼴 라디오 · 화살표 로빙은 그대로다.

| 바꿈 | 편집 묶음(하나 · 되돌리기 한 번) |
|---|---|
| 빈 ↔ 서브페이지 | `test /layout` → `replace /layout`. 잠금과 무관하다 |
| → 팝업 | `test /layout` · `test /root/type` → `replace /layout` + 지금 `pageKindOps` 의 화면 → 팝업 연산(뿌리 `Popup` · 제목 = 페이지 이름) |
| 팝업 → 빈 · 서브페이지 | `test /layout` · `test /root/type` → `replace /layout` + 지금의 팝업 → 화면 연산(바닥을 몸통 끝으로 · 제목 · 크기를 걷음) |

팝업 경계를 넘는 바꿈은 뿌리를 쥔 사람이 있으면 꺼지고 까닭을 말한다(지금의 `blockedNotice`). 읽기만 하는 판(뷰 모드 · viewer)은 «레이아웃 · 서브페이지» 글이다. 메뉴 트리 줄의 팝업 아이콘 · 접근 이름 « — 팝업» 은 그대로다(판정이 `layout` 이다).

### HTML 번들(`packages/exporter` · `apps/api/src/services/export-bundle.ts`)

- 장마다 `LayoutFrame` 으로 그린다 — **영역은 늘 다 켠다**(정해진 것 3 · `hidden_regions` 는 내보내기에 안 들어간다).
- 내비는 **번들에 한 벌** 싣는다(`assets/nav.js` — 메뉴 트리 + 페이지 id → 장 경로. `file://` 로도 열리게 전역을 세우는 일반 스크립트다) — 장마다 트리를 싣지 않는다(장 수 × 트리 크기로 자란다). 장의 데이터는 제 페이지 id · 페이지 제목 · 제 자리(번들 안 경로)만 든다. `LayoutLink` 는 그 장 파일로 가는 상대 경로를 `href` 로 단다. 메뉴 트리는 api 가 트리 응답과 같은 조립(`buildMenuTree`)에 올린 문서의 `layout` 을 실어 짓는다 — 내보내기 행(`ExportRows`)과 워커로 가는 메시지는 그대로다.
- 팝업 레이아웃 장은 캔버스와 같다(흐린 막 + 가운데 상자). 덮개 위 팝업은 틀 없이 상자만이다.
- 뷰어 셸의 목차와 장 안의 GNB · LNB 가 함께 선다 — 목차는 번들의 길잡이, GNB · LNB 는 설계 내용이다. 화면 모드(`#wb-screen`)는 장만 그린다.

### PPTX(`apps/api/src/services/export-pptx.ts` · `screen-render-chromium.ts`)

- 번들 장을 화면 모드로 찍으므로 틀이 다 켠 채로 함께 찍힌다.
- 팝업 레이아웃 장은 지금처럼 **상자만** 찍는다 — 캡처 판(`html[data-wb-capture]`)에서 막을 안 그린다(`packages/theme-sdk/src/capture.ts` 의 캡처 규칙 자리).
- **서브페이지 장도 캡처 폭 720(`VIEWPORT`)으로 찍는다**(「정한 것」 3) — LNB 240 을 빼면 내용 칸이 480 남짓이라 폼 표 · 그리드는 좁은 꼴로 접힌 채 실린다. 크기 상한(`maxArea`)도 그대로다.

### 좌표 · 크기가 바뀌는 판

| 무엇 | 바뀌는 판 |
|---|---|
| 캔버스 노드 상자 · 코멘트 번호 · 외곽선 | 서브페이지면 틀만큼 아래 · 오른쪽으로 밀린다 — 저장된 좌표가 없어 데이터는 안 바뀐다. 마이그레이션이 옛 페이지를 `blank` 로 두고 API 기본값이 `blank` 라 기존 실브라우저 판은 그대로다 |
| 캔버스 문서 높이(`canvas-iframe.tsx` 가 재는 iframe 높이) | 틀만큼 커진다 |
| 번들 장 · PPTX 그림 크기 | 서브페이지 장은 틀만큼 크다(PPTX 캡처 폭은 720 그대로 — 높이만 는다) |
| 팝업 장 | 캔버스 · 번들은 뷰포트 폭의 막 위 가운데 · PPTX 는 상자만(그대로) |

---

## 겹치는 기존 장치

### 정본 「레이아웃」 절 · `layouts` 표 · `Slot` — 걷는다

지금 있는 것: `layouts` 표와 `projects.default_layout_id`(`apps/api/src/db/migrations/0007-layouts.ts`), 프로젝트를 만들 때 짓는 기본 레이아웃(`repos/layouts.ts` 의 `defaultLayoutDocument` — `Page > Slot`), 스냅샷 payload 의 `layouts[]` 와 복원의 `layout-mismatch`(`services/restore-plan.ts`), 공통코드 사용처의 `kind: 'layout'`(`repos/codes.ts`), 스키마의 `LayoutDocument` · `validateLayout` · 카탈로그 `Slot`, 렌더러의 `renderComposed`(`packages/renderer/src/compose.tsx`) — 그 문서를 그리는 코드는 플레이그라운드(`apps/playground`)와 갤러리 예제(`packages/theme-gallery/src/examples` 의 `EXAMPLE_LAYOUT`)뿐이고 에디터 · 번들은 안 그린다(`canvas.tsx` 의 `Canvas` 머리말 «`renderComposed`를 쓰지 않는다»).

**전부 걷는다.** 까닭:

- 정해진 것 1 이 레이아웃을 테마가 그리는 고정 셋으로 정했다 — 사람이 짓는 레이아웃 문서가 설 자리가 없다.
- 남겨 두면 «레이아웃» 이 두 뜻이 된다(문서 필드 `layout` 과 `layouts` 표의 행). 표는 편집 화면도 고르는 길도 없어 아무 화면에도 안 보이는데, 스냅샷 복원은 그 개수로 409 를 낸다.
- `Slot` 은 레이아웃 문서 전용 타입이라 표를 걷으면 쓰는 자리가 없다.

걷는 차례 — DB 마이그레이션 하나가 `projects.default_layout_id` → `layouts` 를 걷고 판 4 이하 스냅샷 payload 의 `layouts` 키를 뺀다(판 숫자는 그대로 — 복원이 판 숫자로 테마 · 공통코드의 갈래를 가른다. 새 캡처는 판 5 — `packages/themes/src/snapshot/payload.ts` 의 `SNAPSHOT_PAYLOAD_VERSION`). `down` 은 표 · 칼럼을 빈 채로 다시 세운다(판 5 payload 는 판 4 로 내리고 모든 payload 에 `layouts: []` 를 싣는다 — 레이아웃 행은 다시 짓지 않는다: 옛 판의 복원이 빈 집합끼리 견줘 맞고, 행을 지으면 그 복원이 409 · 그 아래 `down` 들이 레이아웃 수로 멈춘다). 카탈로그에서 `Slot` 을 걷으면 저장된 테마 manifest 가 `Slot` 을 선언했어도 내보내기는 `stored` 읽기(`readWbtheme`)로 그 선언을 빼고 읽는다(정본 「테마의 범위」 의 걷힌 타입 문장 — 기본테마 manifest 는 `Slot` 을 선언하지 않는다).

### `layoutRef` — 받되 쓰지 않는 채로 남긴다

페이지 JSON 봉투의 `page.layoutRef`(`packages/schema/src/page-json/envelope.ts` «`layoutRef`는 받되 쓰지 않는다») 는 남긴다 — 봉투가 `z.strictObject` 라 걷으면 그 키를 든 옛 파일 · 남의 서버 파일이 400 으로 거절된다. 가져오기 응답의 `ignoredLayoutRef` 도 그대로다. 바뀌는 것은 설명 글뿐이다 — 가져오기 상자(`apps/web/src/panels/page-import-dialog.tsx`)의 «페이지는 프로젝트의 기본 레이아웃을 쓰고 …» 를 «레이아웃은 파일의 문서(`schema.layout`)에서 옵니다 — `layoutRef` 는 쓰지 않습니다» 로. 내보내기는 계속 `layoutRef` 를 짓지 않는다.

### 잠금 · 동시 편집

- 레이아웃을 바꾸는 쓰기는 **페이지 문서 편집**이다(`PATCH …/ops` · WS `patch` — revision · 개인 undo · 리베이스). 따로 라우트가 없다.
- `blank ↔ subpage` 는 `/layout` 하나라 노드 잠금과 겹치지 않는다. 팝업 경계를 넘는 바꿈은 `/root/type` 을 고쳐 뿌리 잠금과 겹친다.
- 남이 레이아웃을 바꾸면 패치 프레임으로 와 캔버스의 틀이 바뀐다. 메뉴 트리의 `layout` · `kind`(다른 페이지 줄의 팝업 아이콘 · 다른 페이지의 GNB/LNB 판정)는 트리를 다시 읽을 때 따라온다 — 트리 응답은 문서 편집에 `menu-changed` 를 내지 않는다. 지금 «종류» 바꾸기와 같은 낡음이고, 내비의 팝업 거르기가 한 번 늦을 뿐 데이터를 바꾸지 않는다.
- `structure_seq` 는 안 오른다(`/layout` 은 노드 구조가 아니다). 팝업 경계를 넘는 바꿈은 바닥 노드를 옮기므로 지금처럼 오른다.

### 검증 · lint

- 새 검증 오류 **`layout-root-mismatch`** — «팝업 레이아웃의 뿌리는 Popup 이고, 빈 · 서브페이지 레이아웃의 뿌리는 Page 입니다». 정본 「컴포넌트 카탈로그」 의 `Popup` 줄 · 검증 코드 목록에 더한다.
- 설계 lint 규칙은 더하지 않는다 — 팝업 판정을 쓰는 규칙 셋(`openModal` · `navigate` · `closeModal`)은 `pageKindOf` 를 거쳐 그대로 맞는다. 정본 「lint 규칙」 의 줄은 문장 그대로다.

### 정본 · README 에서 고칠 절

정본(`docs/superpowers/specs/2026-08-03-wirebound-design.md`): 「엔티티 관계」(`Layout` 줄 · `Page` 의 `layoutRef?`), 「테이블 정의」(`layouts` · `default_layout_id` 를 걷고 `project_view_prefs` 를 더한다), 「페이지 스키마 노드」 의 문서 판(6 → 7), 「레이아웃」(이 문서의 「모델」 · 「테마 계약」 으로 바꾼다), 「스냅샷」(payload 에서 레이아웃), 「컴포넌트 카탈로그」 의 `Popup` · `Slot` 줄, 「테마의 범위」 · 「노드 속성」 의 레이아웃 뷰 · `data-wb-layout*`, 「상호작용」 의 `setViewState` 문장(«레이아웃은 상태가 없어»), 「실행」 의 «편집 캔버스 · 페이지로 연 팝업 페이지는 덮개 없이 상자만», 「설계서 화면 구조」 의 «팝업 페이지» · «페이지 정보» 탭 · 머리 도구, 「HTML 정적 번들」 의 팝업 장 · 내비, 「MCP 도구」 · 「CLI」 의 `kind` · `layout`. `apps/api/README.md`: 라우트 표(`pages` 의 `layout` · `view-prefs`), 「페이지 JSON 가져오기」 의 `layoutRef`, 스냅샷 payload 판 · `layouts` 문장, 「이 서버가 만들지 않은 것」 의 «레이아웃 편집» · «레이아웃 생성 · 삭제».

---

## 정한 것 — 레이아웃 갈래

1. **새 페이지의 레이아웃** — 에디터 «페이지 추가» 는 `subpage` 를 싣는다(이 기능의 주 쓰임이고 lms-skala 꼴 설계서의 기본 화면). API 기본값은 이와 무관하게 `blank` 다(「모델」 의 «기본값»).
2. **옛 화면 페이지를 한꺼번에 서브페이지로 바꾸는 입구는 두지 않는다** — 마이그레이션은 옛 페이지를 `blank` 로 두고, 사람은 페이지마다 «레이아웃» 을 바꾼다(에이전트는 `patch_page` 로 `/layout`). 이미 페이지마다 제목 · 브레드크럼브를 노드로 그린 설계서(시안 항목 14)는 그 노드를 함께 걷는다.
3. **PPTX 의 서브페이지 캡처 폭은 720 그대로다** — 캡처 뷰포트(`VIEWPORT`)와 크기 상한(`maxArea`)을 서브페이지 장이라고 바꾸지 않는다. 내용 칸이 480 남짓이라 폼 표 · 그리드는 좁은 꼴로 접힌 채 실린다. GNB · LNB 를 빼고 찍지 않는다(«정해진 것» 3 — 늘 전부 켠 상태).
4. **메뉴 숨김을 두지 않는다** — 모든 메뉴가 GNB · LNB 에 선다(`menu_nodes` 에 숨김 칸이 없다).
5. **«즐겨찾기» 탭 · LNB 접기 손잡이는 테마가 그림으로만 그린다** — 즐겨찾기 탭은 고정 글 · 접기는 모양만이다. 즐겨찾기 목록을 데이터로 두지 않는다.
