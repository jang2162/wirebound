# 테마 미리보기 두 보기 · 프로젝트 카드 — 구현 계획

> **에이전트 작업자에게:** 이 저장소는 트랙마다 워크트리 하나 · Orca 워커 하나다(`AGENTS.md` 「워크트리 작업」). 워커는 자기 트랙 절과
> «공통 제약» · «리뷰 초점» · «갤러리 계약»만 읽으면 된다. 단계는 체크박스(`- [ ]`)로 적는다.

**목표:** 테마 미리보기를 «컴포넌트»(그룹별 격자) · «예제 페이지»(이어진 다섯 장) 두 보기로 나누고 토큰을 탭으로 위에 올리며, 프로젝트 목록 카드에
«프로젝트 추가» 카드 · «열기» 큰 단추 · 톱니 설정을 둔다.

**구조:** 두 트랙을 나란히 돌린다. C(카드 — 웹만)와 P(미리보기 — `@wirebound/theme-gallery` · 웹 · kit). 둘 다 `apps/web/src/shell.css` 를
고치니 뒤에 병합하는 쪽이 그 파일을 먼저 본다.

**스택:** TypeScript · React 19 · react-router · vitest(jsdom · 실브라우저 `editor-stack`) · Playwright(kit `shots`).

**설계:** `docs/superpowers/specs/2026-11-02-theme-preview-and-project-cards-design.md` — 계획은 설계를 근거로 한다. 둘을 함께 읽는다.

## 공통 제약

- 서버 · 마이그레이션 · 테마 SDK · 토큰 저장 API 는 바꾸지 않는다.
- 토큰 편집기의 동작(초안 · 409 나란히 보기 · 422 칸 사유 · 판 옮김 · 읽기 전용)은 그대로다 — 배치만 바뀐다(`apps/web/src/settings/token-editor.tsx` 머리말).
- 갤러리 패키지 안의 틀은 **인라인 스타일로만** 칠한다(`packages/theme-gallery/src/gallery.tsx` 머리말 — 테마 CSS 와 한 문서다).
- `galleryItems` · `galleryItemDocument` 의 뜻, `GALLERY_SAMPLES` 의 타입마다 **첫 표본**, 칸 표지 `data-wb-gallery-item="<타입>/<variant>/<표본 id>"` 는 바꾸지 않는다(`wb-theme check` · 팔레트 축소판 · 케이스가 기댄다).
- 미리보기 안의 누름은 바깥 화면을 안 움직인다 — 설정 페이지를 안 떠나고, 바깥 주소 · `history.length` 가 그대로다.
- 화면 문안의 따옴표 · 말투는 기존 화면(`routes/settings.tsx` · `routes/project-list.tsx`)을 따른다. 사람 글(프로젝트 이름)을 접근 이름에 실을 때는 지금 «설정» 링크와 같은 꼴(`` `${name} 설정` ``)로 짓는다.
- 정본 설계(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)와 코드 테마 설계(`docs/superpowers/specs/2026-09-27-code-themes-design.md` 「토큰 편집」 · 「`wb-theme dev`」)는 그 트랙이 바꾼 만큼 고친다(정본은 «언제 뒤집혔다» 없이 지금 참인 것만).

## 리뷰 초점

설계가 함의하지만 사람이 먼저 밟을 것들이다. 각 줄은 그 케이스를 가진 태스크를 가리킨다.

1. **미리보기 안의 링크 · 단추를 여러 번 눌러 장을 오간 뒤 브라우저 «뒤로»** — 설정 페이지 앞 화면으로 간다(미리보기 이동이 기록에 안 쌓였다). (P2 «바깥 기록이 그대로다» · P3 실브라우저 «뒤로»)
2. **다른 탭에 사유가 있는 토큰 칸** — 저장이 꺼지고, 그 탭 이름에 표지가 서며, 문장이 그 칸을 말한다. (P3 «다른 탭의 사유»)
3. **창 높이 900px · 폭 1280px 에서 토큰 탭 하나가 가장 긴 판(기본테마 «색»)** — 미리보기 상자의 위 끝이 창 안에 선다. (P3 실브라우저 «한 화면»)
4. **조회 실패 · 프로젝트 0 개에서 새 프로젝트 만들기** — 추가 카드로 만들 수 있다. (C1 «실패해도 만든다» · «0 개»)
5. **좁은 창(390px)에서 격자 · 카드** — 미리보기 격자는 한 열로, 카드의 «열기» 는 눌리는 크기로, 뼈대 상자가 가로로 안 넘친다. (C2 · P3 실브라우저 «좁은 창»)

---

## 갤러리 계약 (P1 · P2 가 짓고 P3 · P4 가 쓴다)

`packages/theme-gallery/src/index.ts` 가 다음을 더 낸다. 지금 내는 것은 그대로 둔다.

```ts
export type GalleryLayout = 'list' | 'grid'
// ThemeGallery 의 props 에 더한다 — 없으면 'grid'.
//   layout?: GalleryLayout

export interface GalleryGroup {
  group: ComponentGroup          // @wirebound/schema
  label: string                  // COMPONENT_GROUP_LABELS[group]
  items: GalleryItem[]
}
export function galleryGroups(theme: ThemeDefinition): GalleryGroup[]   // COMPONENT_GROUPS 차례 · 빈 그룹은 뺀다

// GallerySample 에 더한다 — 참이면 격자에서 한 줄을 통째로 쓴다.
//   wide?: boolean

export type ExamplePageId = 'dashboard' | 'orders' | 'order' | 'order-form'
export interface ExamplePage { id: ExamplePageId; title: string; target: string; document: PageDocument }
export const EXAMPLE_LAYOUT: LayoutDocument
export const EXAMPLE_PAGES: readonly ExamplePage[]        // 위 차례 그대로 — 장 이름 줄의 차례
export const EXAMPLE_POPUPS: readonly { target: string; document: PageDocument }[]   // 삭제 확인 팝업 하나

export function ThemeExamples(props: {
  theme: ThemeDefinition
  tokens: Readonly<Record<string, string | number>>
  window?: Window
  page: ExamplePageId
  onPageChange: (page: ExamplePageId) => void
  /** 팝업을 세울 구간 — 없으면 창 전체(`PopupLayer` 의 `area`). */
  popupArea?: PopupArea          // @wirebound/renderer
}): ReactElement
```

- 보기 전환 · 장 이름 줄은 **갤러리 밖(호스트)** 이 그린다 — 웹은 미리보기 머리에, kit 은 셸에. `shots` 가 여는 프레임에는 서지 않는다.
- 장 제목: `대시보드` · `주문 목록` · `주문 상세` · `주문 등록`. 팝업 제목: `주문 삭제`.

---

## 트랙 C — 프로젝트 카드 (브랜치 `feat/project-cards`)

게이트: `README.md` 「트랙 게이트」 의 `apps/web/**` 줄.

### C1: 추가 카드 · 열기 · 톱니 설정

**파일:**
- 고침: `apps/web/src/routes/project-list.tsx` (`ProjectListRoute` 의 `actions` · 상태 셋의 갈래 · `ProjectCards` · `ProjectRow`)
- 고침: `apps/web/src/shell/icons.ts` — `openProject: ArrowUpRight` 를 더한다
- 고침: `apps/web/src/shell.css` — `.wb-shell-home-add` · `.wb-shell-home-open` · `.wb-shell-home-settings` (지금 `.wb-shell-project-settings` 를 카드에서 걷는다 — 다른 자리가 쓰는지 `git grep` 으로 센다)
- 시험: `apps/web/test/routes/project-list.test.tsx` · `apps/web/test/routes/project-crud.test.tsx`

**인터페이스:**
- 만든다: 추가 카드 `<li className="wb-shell-home-card wb-shell-home-add">` — 닫힌 판은 단추 하나(접근 이름 `프로젝트 추가`), 연 판은 지금의 `ProjectForm`(`submitLabel="만들기"`)을 그 `li` 안에 그린다. 여닫기는 지금의 `commands.openCreate` · `closeForm` · `form` 이다.
- 만든다: 카드의 «열기» `Link`(`to=/projects/:id`, 접근 이름 `` `${name} 열기` ``, 보이는 글 `열기` + `openProject` 아이콘) · 톱니 `Link`(`to=/projects/:id/settings`, 접근 이름 `` `${name} 설정` ``, 보이는 글 없음 · `title` = 접근 이름).

- [ ] **1: 실패하는 케이스를 쓴다** — `project-list.test.tsx` 에:
  - «추가 카드가 격자 맨 앞이다» — 프로젝트 둘에서 `getAllByRole('listitem')` 의 첫째 안에 `getByRole('button', { name: '프로젝트 추가' })`.
  - «검색 결과 0 에서도 추가 카드가 남는다» — 맞지 않는 검색어 뒤 추가 단추가 있고 카드 수 1.
  - «0 개» — 빈 목록에서 추가 단추와 `EMPTY_NOTICE` 가 함께 있고, `EMPTY_HINT` 가 «새 프로젝트» 단추를 가리키지 않는다(`not.toMatch(/새 프로젝트/)`).
  - «실패해도 만든다» — 조회 실패(alert)인 채 추가 단추를 눌러 만들기 폼이 선다. «불러오는 중» 에서도 같다.
  - «열기 · 설정» — 카드마다 `getByRole('link', { name: '<이름> 열기' })` 의 `href` 가 `/projects/<id>`, `getByRole('link', { name: '<이름> 설정' })` 의 `href` 가 `/projects/<id>/settings` 이고 설정 링크의 `textContent.trim()` 이 `''`.
  - «머리 단추가 없다» — `queryByRole('button', { name: '새 프로젝트' })` 가 `null`.
- [ ] **2: 돌려서 실패를 본다** — `pnpm vitest run apps/web/test/routes/project-list.test.tsx` · 새 케이스가 빨강.
- [ ] **3: 구현한다** — 상태 셋(불러오는 중 · 실패 · 준비)과 무관하게 격자(`ul`)를 세우고 맨 앞에 추가 카드를 둔다. 실패 · 불러오는 중 알림은 지금 자리 그대로. `EMPTY_HINT` 는 «위의 «프로젝트 추가» 로 …» 꼴로 고친다(정확한 글은 워커 판단).
- [ ] **4: 기존 케이스를 센다** — `git grep -n "새 프로젝트" -- apps/web/test apps/web/build-test` 의 자리(머리 단추를 누르던 판)를 추가 카드로 옮긴다. `project-crud.test.tsx` 의 만들기 판이 그 가운데 있다. «설정» 글자로 찾던 판(`getByRole('link', { name: /설정/ })` 등)도 센다.
- [ ] **5: 돌려서 통과를 본다** — `pnpm vitest run --project web` 실행 수와 실패 0.
- [ ] **6: 커밋** — `feat(web): project list — add card, open button, gear settings`

### C2: 실브라우저 · 문서

**파일:**
- 시험: `apps/web/build-test/rv-ws-workspace.test.ts` 와 «새 프로젝트» 를 누르는 실브라우저 판 전부(C1 의 4 에서 센 목록 · `palette.test.ts` · `placeholder-images.test.ts` · `theme-admin.test.ts` · `theme-canvas.test.ts` · `theme-system.test.ts` 가 후보)
- 새 케이스: `apps/web/build-test/project-cards.test.ts`
- 문서: 정본 설계 「프로젝트 목록」 절

- [ ] **1: 실패하는 케이스를 쓴다** — `project-cards.test.ts`:
  - «창 1280 · 390 에서 «열기» 단추가 눌리는 크기다» — 상자 높이 ≥ 36px, 폭 ≥ 카드 안쪽 폭의 60%(390 에서도), `.wb-shell-workspace` 의 `scrollWidth <= clientWidth`(가이드 «뼈대 상자로 잰다»).
  - ««열기» 는 에디터로 간다» — 누른 뒤 주소 `/projects/<id>`.
  - «추가 카드로 만든 프로젝트가 격자에 선다».
- [ ] **2: 돌려서 실패를 본다** — `pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/project-cards.test.ts`.
- [ ] **3: 옮긴 판을 고친다** — C1 의 4 에서 센 실브라우저 판.
- [ ] **4: 게이트** — `apps/web/**` 줄 전부. 실행 수 · 건너뜀 수를 보고에 적는다.
- [ ] **5: 정본 「프로젝트 목록」 을 지금 모양으로 고치고 커밋** — `docs(spec): project list cards`

---

## 트랙 P — 미리보기 (브랜치 `feat/theme-preview`)

게이트: 전량 넷(`packages/*` 를 건드린다). `pnpm test:build:serial` 이 kit 의 `dev.test.ts` · `shots.test.ts` 를 돈다.

### P1: 그룹 격자 (`@wirebound/theme-gallery`)

**파일:**
- 고침: `packages/theme-gallery/src/gallery.tsx` — `galleryGroups` · `layout` prop · 격자 그리기
- 고침: `packages/theme-gallery/src/samples.ts` — 넓은 표본에 `wide: true`
- 고침: `packages/theme-gallery/src/index.ts`
- 시험: `packages/theme-gallery/test/gallery.test.tsx`

**인터페이스:** «갤러리 계약» 의 `GalleryLayout` · `GalleryGroup` · `galleryGroups` · `GallerySample.wide`.

- [ ] **1: 실패하는 케이스를 쓴다**
  - «`galleryGroups` 는 `COMPONENT_GROUPS` 차례이고 합치면 `galleryItems` 와 같다» — `galleryGroups(t).map(g => g.group)` 이 `COMPONENT_GROUPS` 에서 빈 그룹을 뺀 것과 같고, `flatMap(g => g.items)` 의 표지 집합이 `galleryItems(t)` 의 것과 같다(빠짐 · 겹침 0).
  - «각 항목이 제 타입의 카탈로그 그룹에 든다» — 항목마다 `getComponent(type).group === g.group`.
  - «격자 판: 그룹 머리가 서고 넓은 표본은 한 줄을 쓴다» — `layout` 없이 그린 판에 `[data-wb-gallery-group="<group>"]` 가 그룹 수만큼, 그 안 머리 글이 `COMPONENT_GROUP_LABELS[group]`, `wide` 표본 칸의 인라인 `gridColumn` 이 `1 / -1`.
  - «목록 판은 지금 그대로다» — `layout="list"` 판에 `[data-wb-gallery-group]` 0, 칸 차례가 `galleryItems` 차례.
- [ ] **2: 돌려서 실패를 본다** — `pnpm vitest run packages/theme-gallery`.
- [ ] **3: 구현** — 격자는 그룹마다 `display: grid; grid-template-columns: repeat(auto-fill, minmax(<최소 폭>, 1fr))` 인라인(최소 폭은 워커 판단 — 320 언저리). 넓은 표본 고르기는 워커 판단이되 `DataGrid` · `SearchForm` · `Table` 계열 · 폼 표는 넓게 둔다. `wide` 를 단 표본 목록을 보고에 적는다.
- [ ] **4: 통과 · 커밋** — `feat(theme-gallery): grouped grid layout`

### P2: 예제 페이지 (`@wirebound/theme-gallery`)

**파일:**
- 새로: `packages/theme-gallery/src/examples/documents.ts` — `EXAMPLE_LAYOUT` · `EXAMPLE_PAGES` · `EXAMPLE_POPUPS`
- 새로: `packages/theme-gallery/src/examples/theme-examples.tsx` — `ThemeExamples`
- 시험: `packages/theme-gallery/test/examples.test.tsx`

**인터페이스:** «갤러리 계약» 의 예제 쪽 전부. 그리기는 `renderComposed(EXAMPLE_LAYOUT, page.document, { theme, assetUrl: galleryAssetUrl, interaction: { overlay, onEvent } })`(`packages/renderer/src/compose.tsx`) · 팝업은 `usePopupStack` + `PopupLayer`(`area` = `popupArea`). 이동 타겟은 `pageTargetKey`(`packages/schema/src/page-target.ts`)로 견준다.

- [ ] **1: 실패하는 케이스를 쓴다**
  - «문서가 검증을 지난다» — `EXAMPLE_LAYOUT`(레이아웃 검증) · 페이지 · 팝업 문서마다 `validatePage` 이슈 0. 레이아웃의 Slot 이 정확히 하나.
  - «다섯 그룹이 다 실린다» — 레이아웃 + 페이지 + 팝업 문서의 노드 타입을 모아 `getComponent(type).group` 집합이 `COMPONENT_GROUPS` 전부.
  - «이음이 다 닿는다» — 문서들의 `navigate` · `openModal` 타겟마다 `pageTargetKey` 가 `EXAMPLE_PAGES` · `EXAMPLE_POPUPS` 의 타겟 하나에 맞는다(죽은 이음 0). 그리고 설계의 이음 여섯이 있다: 목록 줄 → 상세 · 상세 «수정» → 등록 · 상세 «삭제» → 팝업 · 등록 «저장» · «취소» → 목록 · 팝업 «삭제» → 목록(+닫힘) · 팝업 «취소» → 닫힘.
  - «누르면 장이 바뀐다» — `ThemeExamples page="orders"` 에서 첫 줄의 이동 노드를 눌러 `onPageChange` 가 `'order'` 로 한 번 불린다. 상세의 «삭제» 로 `role="dialog"`(또는 `[data-wb-popup-frame]`) 하나가 서고 «취소» 로 0 이 된다. 팝업 «삭제» 는 `onPageChange('orders')` 와 함께 팝업 0.
  - «바깥 기록이 그대로다» — 왼쪽 메뉴 `Link` 를 셋 눌러도 `window.history.length` · `location.hash` 가 누르기 전과 같다(jsdom — 실브라우저 판은 P3).
  - «장이 바뀌면 팝업 · 겹layer 를 비운다» — 팝업을 연 채 `page` prop 을 바꾸면 팝업 0.
- [ ] **2: 돌려서 실패를 본다** — `pnpm vitest run packages/theme-gallery`.
- [ ] **3: 문서를 짓는다** — 설계 「«예제 페이지» 보기 — 주문 관리」 의 장 · 이음 그대로. 왼쪽 메뉴는 `Link` · `Button` 노드(카탈로그에 메뉴 컴포넌트가 없다). 글 · 숫자는 워커 판단(«주문번호» · «주문자» · «상태» 같은 관리자 화면의 말). 노드 id 는 장마다 겹치지 않게 접두를 둔다.
- [ ] **4: `ThemeExamples` 를 짓는다** — 이동 요청은 `onPageChange`, 팝업 요청은 스택, 닫기는 `pop`. `Link` 의 해시 이동은 미리보기 뿌리에서 `click` 의 `preventDefault` 로 막는다(렌더러는 submit 만 막는다 — `packages/renderer/src/render.tsx`). 렌더러가 내는 말(`issues`)은 미리보기 안 한 줄로 보인다(번들 `mount.tsx` 의 `notices` 꼴 — 워커 판단).
- [ ] **5: 통과 · 커밋** — `feat(theme-gallery): linked example pages`

### P3: 웹 — 토큰 탭 · 넓은 미리보기 · 두 보기

**파일:**
- 고침: `apps/web/src/settings/token-editor.tsx` — 무리를 탭으로(`groupsOf` 를 그대로 쓴다), 저장 줄을 탭 줄로
- 고침: `apps/web/src/settings/theme-preview.tsx` — 보기 전환 · 장 이름 줄 · 폭 따라가기 · `ThemeExamples`
- 고침: `apps/web/src/settings/theme-section.tsx` · `apps/web/src/routes/admin-themes.tsx` — 배치(관리자 › 테마는 토큰 없이 미리보기만)
- 고침: `apps/web/src/shell.css` — `.wb-shell-settings-tokens` 를 세로 배치로, 탭 · 칸 격자, 미리보기 머리
- 시험: `apps/web/test/settings/token-editor.test.tsx` · `apps/web/test/settings/theme-preview.test.tsx`(새로) · `apps/web/build-test/theme-preview.test.ts`(새로)

**인터페이스:**
- 쓴다: «갤러리 계약» 전부. 팝업 구간은 캔버스의 `usePopupArea`(`apps/web/src/canvas/canvas-popups.ts*`)와 같은 셈으로 짓는다(미리보기 상자 = 스크롤 상자).
- 만든다: `ThemePreview` props 는 그대로(`themeRef` · `manifest` · `tokens`) — 보기 · 장은 그 안의 상태다. 탭은 `role="tablist"` · `role="tab"`(`aria-selected`) · `role="tabpanel"`. 보기 전환은 `role="radiogroup"`(«미리보기 보기») 안의 라디오 둘 «컴포넌트» · «예제 페이지». 장 이름 줄은 `nav`(«예제 페이지») 안의 단추 넷(`aria-current="page"`).

- [ ] **1: 실패하는 케이스를 쓴다 (jsdom)**
  - «탭이 무리마다 서고 고른 탭의 칸만 보인다» — 기본테마 manifest 로 탭 넷(색 · 모양 · 글자 · 밀도) · 첫 탭 «색» 고름 · «모양» 칸의 입력이 DOM 에 없거나 `hidden`.
  - «다른 탭의 사유» — «모양» 칸 하나에 틀린 값을 넣은 뒤 «색» 탭으로 가면 «모양» 탭에 사유 표지(접근 이름에 «고칠 칸 있음» 이 든다)가 서고 «토큰 저장» 이 꺼지며 «고칠 칸이 있습니다 — <그 칸 이름>» 문장이 선다.
  - «저장 줄은 탭과 무관하게 보인다» — 어느 탭에서도 «토큰 저장» · «전부 기본값으로» 가 있다.
  - «409 · 422 · 판 옮김» — 지금의 케이스(`token-editor.test.tsx`)가 그대로 초록이다(칸을 찾는 판이 탭을 바꿔야 하면 그 걸음만 더한다).
  - «보기 전환 · 장» — «예제 페이지» 를 고르면 장 이름 줄이 서고 첫 장 «대시보드» 가 `aria-current`. 토큰을 바꿔도 고른 보기 · 장이 남는다.
  - «관리자 › 테마» — 토큰 칸 없이 같은 미리보기(보기 전환이 있다).
- [ ] **2: 돌려서 실패를 본다** — `pnpm vitest run apps/web/test/settings`.
- [ ] **3: 구현** — 미리보기 iframe 폭은 상자의 `clientWidth` 를 `ResizeObserver` 로 재어 `CanvasIframe` 의 `width` 로 넘긴다(고정 640 걷음). 미리보기 상자는 지금처럼 창 높이에 묶여 안에서 스크롤한다.
- [ ] **4: 실브라우저 케이스** — `apps/web/build-test/theme-preview.test.ts`:
  - «한 화면» — 창 1280×900, 기본테마 «색» 탭에서 미리보기 상자의 위 끝 < 900.
  - «폭을 따라간다» — 창 1600 에서 iframe 폭이 1000 이상이고 상자 폭과 1px 안에서 같다.
  - «뒤로» — 목록에서 설정 › 테마로 들어와 예제 페이지에서 이동 셋 · 팝업 열고 닫기 뒤 `page.goBack()` 이 프로젝트 목록에 닿는다. iframe 안 `location.hash` 가 비었다.
  - «팝업이 보이는 구간에 선다» — 미리보기 상자를 끝까지 내린 판에서 연 팝업 상자가 상자의 보이는 사각형 안.
  - «좁은 창» — 390 에서 «컴포넌트» 격자가 한 열(칸 왼끝이 모두 같다), `.wb-shell-workspace` 가로 넘침 0.
- [ ] **5: 기존 판을 센다** — 미리보기 · 갤러리를 재는 판(`git grep -ln "settings-preview\|data-wb-gallery" -- apps/web/test apps/web/build-test`)과 «토큰» 칸을 찾는 판이 탭 · 격자에서 서는지. `theme-system-review.test.ts` 의 `[data-wb-gallery-item]` 기다림이 기본 «컴포넌트» 보기에서 그대로 서는지.
- [ ] **6: 커밋** — `feat(web): token tabs, wide preview with components and example pages`

### P4: `wb-theme dev` · `shots`

**파일:**
- 고침: `packages/theme-kit/src/client/protocol.ts` — `FrameState` 에 `view: 'components' | 'examples'` · `page: ExamplePageId`
- 고침: `packages/theme-kit/src/client/frame.tsx` — `?layout=list` 질의를 읽어 `ThemeGallery` 의 `layout` 으로(없으면 `grid`), `view` 가 `examples` 면 `ThemeExamples`
- 고침: `packages/theme-kit/src/client/shell.tsx` — 보기 전환 · 장 이름 줄(웹과 같은 말)
- 고침: `packages/theme-kit/src/shots.ts` — 프레임 주소에 `?layout=list`
- 시험: `packages/theme-kit/build-test/dev.test.ts` · `shots.test.ts`

- [ ] **1: 실패하는 케이스를 쓴다**
  - `shots.test.ts` «shots 는 목록 판을 잰다» — `shots` 가 연 프레임에 `[data-wb-gallery-group]` 0 이고 칸 수가 `galleryItems` 수. 보기 전환 · 장 이름 줄이 프레임에 0.
  - `dev.test.ts` «dev 프레임은 격자 · 두 보기» — 셸에서 «예제 페이지» 를 고르면 프레임에 예제 장이 서고 첫 장이 «대시보드». 지금의 칸 수 · `.sample-card` 수 단언이 격자 판에서 그대로 서는지 보고, 갈리면 판을 목록으로 열지 말고 기대값을 고친다(갈린 까닭을 머리말에 적는다).
- [ ] **2: 돌려서 실패를 본다** — `pnpm vitest run --project build packages/theme-kit/build-test/dev.test.ts packages/theme-kit/build-test/shots.test.ts`(실행 수를 본다 — 0 이면 `vitest.config.ts` 의 `build` 프로젝트 `include` 를 보고 맞는 명령으로 돈다).
- [ ] **3: 구현 · 통과 · 커밋** — `feat(theme-kit): dev preview views, shots keeps list layout`

### P5: 문서 · 게이트

- [ ] **1: 문서** — 코드 테마 설계 「토큰 편집」(탭 · 두 보기 · 폭) · 「`wb-theme dev`」(두 보기 · `shots` 는 목록 판) · 정본 설계의 테마 설정 문장. `packages/theme-gallery` 머리말(`gallery.tsx`)의 «kit dev 의 프레임과 웹의 토큰 편집 옆 갤러리» 를 지금 쓰는 곳으로.
- [ ] **2: 전량 게이트** — 전량 넷. 실행 수 · 건너뜀 수 · 게이트 전후 load 를 보고에 적는다.
- [ ] **3: 커밋** — `docs(spec): theme preview views`

---

## 진행 순서

1. 메인 세션: 설계 · 계획을 main 에 들인다. 워크트리 둘(`feat-project-cards` · `feat-theme-preview`)을 만들고 부트스트랩한다(`AGENTS.md` 「생성 직후 세팅」 · `.env` 값 다섯).
2. C · P 워커를 나란히 띄운다. 끝나면 각각 리뷰어를 띄운다(C 는 «리뷰 초점» 4 · 5, P 는 1 – 3 · 5 를 지목).
3. 먼저 끝난 쪽을 병합하고, 뒤의 쪽은 main 위로 합친 판에서 `shell.css` 를 보고 전량 게이트를 한 번 돈 뒤 병합한다.

## 진행 기록

(병합 때 채운다)

## 이월 (병합을 막지 않음)

- `wb-theme check` · `shots` 가 예제 페이지를 재게 할지 — 설계 비목표.
