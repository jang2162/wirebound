# rv-lu — 레이아웃 T7(에디터 UI) 반증 리뷰

브랜치 `feat/layout-ui`(머리 `e88276ee` · main `f4abef43` 위) · Postgres 5550 · Node v24.21.0 · 겨눈 것은 T7 이 세운 장치(«레이아웃» 바꾸기 · 머리 «보기» · 머리 문턱 · «페이지 추가» 기본값 · 바뀐 이름)뿐이다. 고친 것은 없다 — 이 보고만 커밋한다.

## 판

- 시작 · 끝: `orca terminal list` 에 이 워크트리 터미널 둘(셸 프롬프트 — 다른 에이전트 없음) · `git ls-files -s | md5` `87516d4f0e029c52b28f5582964107cf`(시작 = 끝) · `git status --short` 는 처음부터 있던 `?? .build/` 하나(시작 = 끝).
- `pnpm build` rc 0(05:2x · 기본테마 2.2.0 `.wbtheme` 다시 지음) 뒤에 실브라우저로 쟀다. 탐침은 스크래치에 두고 `vitest.browser.config.ts` 를 얹은 설정(`root` = 체크아웃 · `dir` = 스크래치 · `maxWorkers: 1`)으로 `editor-stack` 위에서 돌렸다 — 테스트 글롭 밖이다. 변조는 걸지 않았다(소스 바이트 그대로).
- load 2.2 – 2.5(코어 15) · 잠듦 없음(`pmset -g log` 의 마지막 Sleep 은 2026-11-25 22:30 — 탐침 05:26 ~ 05:45 밖). 게이트 슬롯은 안 썼다(전량 · `test:browser` 를 안 돌렸다 — 탐침 파일 여섯을 하나씩 돌렸다).

## 결론

**높음 0 · 중간 0 · 낮음 4.** 사용자 노드를 잃는 판 · 남의 편집을 지우는 판 · 인가 우회 · 머리 도구가 안 보이는 판은 못 찾았다. 낮음 넷 가운데 셋은 원래 있던 성질(잠금 의미 · 리베이스의 `move` 다시 짓기 · 머리 줄바꿈)이 새 장치에 드러난 것이고, 하나(L1)는 설계가 정한 동작의 결과다.

## 항목

### 1. «레이아웃» 바꾸기(`layoutOps`) — 서버 문서

**탐침 P1** — 팝업 페이지(`POST …/pages { layout: 'popup' }` — 바닥 `[취소][저장]`, `취소` 에 `closeModal`) · 몸통 글 `n_text0000001`. 앨리스가 «페이지 정보» «레이아웃» 단추를 차례로 누르고, 걸음마다 서버 `GET` 을 `layout` 과 `headSeq` 가 바뀔 때까지 기다려 적었다(되돌리기는 `ControlOrMeta+z`).

| 걸음 | 서버 `layout` · 뿌리 | 몸통 | 바닥 | 화면 |
|---|---|---|---|---|
| 처음 | popup · `Popup`(`props.title` = 상세) | 글 | 취소 · 저장 | — |
| 빈 | blank · `Page`(props 없음) | 글 · 취소 · 저장 | (`zones` 비움) | 빈 |
| Cmd+Z | popup · `Popup`(`title` 상세) | 글 | 취소 · 저장 | 팝업 |
| 서브페이지 | subpage · `Page` | 글 · 취소 · 저장 | — | 서브페이지 |
| 팝업 | popup · `Popup` | 글 · 취소 · 저장 | — | 팝업 |
| 빈 | blank · `Page` | 글 · 취소 · 저장 | — | 빈 |
| 서브페이지 | subpage | 〃 | — | 서브페이지 |
| 빈 | blank | 〃 | — | 빈 |
| 팝업 | popup · `Popup` | 〃 | — | 팝업 |
| Cmd+Z | blank · `Page` | 〃 | — | 빈 |
| Cmd+Z | subpage · `Page` | 〃 | — | 서브페이지 |

여섯 방향 모두 서버 = 화면 · 노드 수 그대로(잃은 노드 0) · 되돌리기는 걸음마다 바로 앞 레이아웃과 노드 자리를 되살렸다(첫 Cmd+Z 는 바닥 둘을 바닥으로 되돌렸다).

**L1(낮음 · 설계가 정한 동작의 결과)** — 팝업 → 빈 · 서브페이지에서 몸통 끝으로 옮긴 `취소` 는 `interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }]` 를 그대로 든다(P1 서버 값). 화면 페이지의 `closeModal` 은 lint `close-outside-popup`(`packages/schema/src/lint/design.ts` 258 · 339)이 경고로 잡는다 — 레이아웃 하나 바꾸면 경고가 하나 선다. 그리고 팝업 → 서브페이지 → 팝업 왕복은 바닥을 되살리지 않는다(바닥 단추가 팝업 «내용» 에 남는다 — 설계 표 «바닥은 안 만든다»). 둘 다 설계 `2026-11-25-page-layout-design.md` 의 «바닥 노드를 몸통 끝으로 옮긴다(지우지 않는다)» 그대로라 결함은 아니다. 안내가 필요한지는 판단하지 않았다. **새 장치가 연 길**(`layoutOps`).

**«팝업 페이지를 «페이지 이동» 으로 가리키는 판» 의 lint** — 같은 메뉴의 «목록» 페이지에 `navigate → page:회원관리/상세` 단추를 두고, «상세» 를 UI 로 서브페이지 → 팝업으로 바꾼 뒤 `lintDesign` 을 서버 문서 둘로 돌렸다: 앞 규칙 집합에 없던 `navigate-to-popup` 이 바꾼 뒤 하나 섰다. lint 는 `pageKindOf(document)`(= `pageLayoutOf`)를 읽어 `layout` 만 바꿔도 잡는다. (탐침의 lint 입력은 메뉴를 빈 배열로 줘 `document-invalid` · `page-unlinked` 가 앞뒤 같은 수로 섞였다 — 견준 것은 차이 하나다.)

#### 남이 쥔 판 — 잠금

**탐침 P1 «남이 바닥 노드 · 뿌리를 쥔 판»** — 앨리스 · 밥이 같은 페이지를 열고, 밥이 구조 트리 줄을 눌러 고른 뒤 1.2s 기다려 앨리스의 «레이아웃» 단추 `disabled` 와 무리의 `aria-description` 을 적었다.

| 페이지 | 밥이 고른 것 | 앨리스의 빈 · 서브페이지 · 팝업 | 까닭 |
|---|---|---|---|
| 팝업 | 몸통 글 | 꺼짐 · 꺼짐 · 켬 | 밥님이 편집 중이라 바꿀 수 없습니다 |
| 팝업 | 바닥 단추 | 꺼짐 · 꺼짐 · 켬 | 〃 |
| 팝업 | 뿌리 | 켬 · 켬 · 켬 | 없음 |
| 서브페이지 | 몸통 글 | 켬 · 켬 · 꺼짐 | 〃 |
| 서브페이지 | 뿌리 | 켬 · 켬 · 켬 | 없음 |
| 둘 다 | 밥 Escape | 켬 · 켬 · 켬 | 없음 |

**L2(낮음 · 원래 있던 성질)** — 경계를 넘는 단추를 끄는 것은 «뿌리 잠금» 이 아니라 **페이지 안 아무 노드의 남의 잠금**이다. `lockOf(rootId)` 는 스토어의 `lockedBy`(`selectionConflicts` — 뿌리를 고르면 서브트리를 claim 하는 판정)라, 밥이 페이지 어디든 고르고 있으면 앨리스는 팝업 경계를 못 넘는다. 막는 쪽이라 데이터는 안전하다. 반대로 **밥이 뿌리를 고른 판은 잠금이 서지 않는다** — P1c: 밥이 뿌리를 눌러 고른 뒤(밥 화면 `wb-shell-tree-row-picked` = 뿌리 id) 앨리스 트리의 잠금 표지 0 · 단추 셋 다 켬, 앨리스의 «빈» 이 서버에 섰다(`headSeq` +1 · `layout: blank` · `Page` · `patch-error` 0). 뿌리 고름이 잠금을 안 만드는 것은 앞부터 있던 잠금 의미다. 이 판에서 밥이 속성 패널로 팝업 제목(`/root/props/title`)을 고치던 중이었으면 그 편집은 `Page` 뿌리에 얹힌다 — 재지 않았다(«남은 것»). 판정은 `panels/page-kind.tsx` 의 `blocked` · 설계 문장 «남이 뿌리를 쥐었으면 잠금이 막는다» 가 실제로는 «남이 그 페이지 안을 쥐었으면» 으로 선다.

P1c 원문(요지):

```ts
// 앨리스가 연 뒤 본문을 골랐다 Escape · 밥이 연다(뿌리가 자동으로 골라짐)
await b.page.locator(`${TREE} [data-tree-row][data-tree-id="${rootId}"]`).locator('button').first().click()
// → bob picked = [rootId] · 앨리스 .wb-shell-structure-lock 0 · 단추 ["빈:false","서브페이지:false","팝업:false"]
await group.getByRole('radio', { name: '빈', exact: true }).click()
// → 서버 { head: +1, layout: 'blank', type: 'Page' } · 앨리스 받은 patch-error 0
```

#### 남이 먼저 바꾼 판 — 리베이스(탐침 P5)

앨리스 탭은 `startDownDelay(2500)` 로 서버 → 브라우저를 늦추고, `joined` 뒤 밥이 REST `PATCH …/ops` 를 보내고 곧바로 앨리스가 단추를 누른다. 판 카나리아: 누른 순간 밥의 프레임을 아직 못 받음(`receivedTheirsBeforeClick: false`) · `delayed() > 0` · 앨리스가 `patch` 를 보냄 · 서버가 앨리스의 첫 판을 `409` 로 거절(`patch-error` 1). 7s 뒤 서버 문서를 적었다.

| 밥의 편집(같은 `baseSeq`) | 앨리스 | 서버 끝 | 하단 바 | 판정 |
|---|---|---|---|---|
| 바닥에 단추 더함(`add /root/zones/footer/2`) | 팝업 → 빈 | popup · 바닥 취소 · 저장 · 밥단추 | «다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 1개를 버렸습니다» | 묶음째 버림 — 밥 노드 남음(`remove /root/zones` 의 «자식 줄 전제» 가 막음) |
| 바닥 단추 글 고침 | 팝업 → 서브페이지 | subpage · 몸통 글 · 취소(**밥고침**) · 저장 | 없음 | 얹힘 · 밥 글 남음 |
| 바닥 `취소` 를 몸통 맨 앞으로 옮김 | 팝업 → 빈 | blank · 몸통 **글 · 취소** · 저장 | 없음 | 얹힘 — L3 |
| 바닥 단추 둘 다 지움 | 팝업 → 빈 | popup · 바닥 `[]` | «… 편집 1개를 버렸습니다» | 묶음째 버림(지운 노드를 옮길 수 없다) |
| 몸통에 글 더함 | 서브페이지 → 팝업 | popup · 몸통 글 · 밥글 | 없음 | 얹힘 · 밥 노드 남음 |

다섯 판 모두 서버 = 앨리스 화면(«레이아웃» 의 골라진 단추), 잃은 사용자 노드 0.

**L3(낮음 · 원래 있던 길)** — 밥이 `취소` 를 몸통 맨 앞(`/root/children/0`)으로 옮긴 판에서 앨리스의 «빈» 이 얹히며 `취소` 를 몸통 **끝**으로 다시 옮겼다(밥이 둔 자리가 말없이 바뀜 · 노드는 안 잃음). `layoutOps` 의 `move from /root/zones/footer/0` 은 리베이스가 노드 id 로 `from` 을 다시 지어(`store/anchored-ops.ts` «자리의 셋» — `move` 의 `from` 은 노드) 이미 바닥에 없는 노드도 옮긴다. «바닥에 있던 것만 옮긴다» 는 전제를 묶음이 싣지 않는다(`test /root/zones/footer` 같은 것 없음). 노드 id 로 다시 짓는 것은 리베이스의 원래 규칙이고, 그 규칙 위에 바닥 비우기를 얹은 것이 새 장치다 — **새 장치가 연 길이지만 뿌리는 원래 규칙**.

P5 원문(요지 — 셋째 판):

```ts
const made = await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '상세', layout: 'popup' })
await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '본문' } } }] })
const before = (await call('GET', P)).body
const delay = await stack.startDownDelay(2_500)
const { page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
// joined 뒤 · 페이지 정보 탭
await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: before.headSeq, ops: [{ op: 'move', from: '/root/zones/footer/0', path: '/root/children/0' }] })
await group.getByRole('radio', { name: '빈', exact: true }).click()
await page.waitForTimeout(7_000)
// 서버: { layout: 'blank', type: 'Page', children: ['n_text0000001', <취소>, <저장>], zones: {} } — 밥이 둔 «취소 · 본문» 차례가 «본문 · 취소» 로
```

### 2. 머리 «보기»(탐침 P2 · P6)

| 판 | «보기» 단추 |
|---|---|
| 편집 · 서브페이지 · 기본테마 2.2.0 | 켬 · `title` 보기 |
| 편집 · 빈 / 팝업 · 2.2.0 | 꺼짐 · `title` = `aria-description` = «이 레이아웃에는 끌 영역이 없습니다» |
| 편집 · 서브페이지 · system-admin 1.7.0 고정 | 꺼짐 · «이 테마는 끌 영역을 선언하지 않았습니다» |
| 뷰 모드(넷 모두) | 없음 |
| viewer(밥) · 서브페이지 | 켬 — GNB 를 끄면 메뉴 `GNB=false` · 캔버스 gnb 0 · lnb 1 · PUT 200 · 밥의 서버 값 `["subpage.gnb"]` |

키보드(창 1440): Enter 로 엶 → 포커스 `menuitemcheckbox` GNB · ArrowDown → LNB · Space → LNB 끔(PUT 1 · 서버 `["subpage.lnb"]` · 캔버스 lnb 0) · Enter → LNB 켬(PUT 2 · 서버 `[]`) · 두 번 다 메뉴가 열린 채 포커스는 그 항목 · Esc → 메뉴 0 · 포커스 «보기» 단추. 접힌 머리(창 900)에서 `…` 를 Enter 로 열고 ArrowDown 으로 «보기 · GNB» 에 서서 Enter → 메뉴 열린 채 · 서버 `["subpage.gnb"]` · Esc → 포커스 «더 보기».

키 반복: 메뉴를 열고 첫 항목에서 `keyboard.down('Enter')` 12 번(35ms 간격) → PUT 1 · 메뉴가 다시 선 수 0(`MutationObserver`) · 항목 `GNB=false` · 캔버스 gnb 0 · 서버 `["subpage.gnb"]` — 반복 keydown 은 버려져 한 번만 바뀐다(`shell/action-menu.tsx` 의 `event.repeat` 거름 — 앞부터 있던 장치). 화면 = 서버.

연달아 다섯 번(같은 항목 `click` 다섯): PUT 5(모두 200 · 차례대로 lnb 넣음 · 뺌 …) · 끝 항목 `LNB=false` · 캔버스 lnb 0 · 서버 `["subpage.gnb","subpage.lnb"]` — 화면 = 서버. 로컬은 PUT 답이 다음 누름 전에 와 «마지막 값만» 으로 합쳐지지 않았다(합치기는 jsdom «연달아 셋» 이 잰다).

U+202E: 픽스처 테마 `bidi@1.0.0`(서브페이지 영역 `gnb` 의 `label` = «AB» + U+202E + «CD»)를 올려 고정했다. 머리 메뉴의 첫 항목 글은 FSI · A · B · U+202E · C · D · PDI(`isolateBidi` 와 같은 바이트), 글자 x: A 529 · B 539 · D 547 · C 557 — 뒤집힘이 격리 안에 갇힌다. 접힌 `…`(창 1000): «보기 · » 의 보 837 · 기 848 · · 863 다음에 A 870 · B 880 · D 888 · C 898 — 접두가 앞에 그대로 선다. 접힌 항목을 누르면 메뉴가 열린 채 `보기 · …=false` · PUT 200 · 서버 `["subpage.gnb"]` · 캔버스 gnb 0, 창 1440 으로 돌아온 머리 메뉴도 `=false` — 접힌 판과 머리 판이 같은 값이다.

결함 없음.

### 3. 머리 접기 문턱(탐침 P3)

`editor-head-tools.test.ts` 의 `shape` 와 같은 셈(머리 높이 · 머리 상자 밖 넘침 · 가운데 점이 다른 요소인 컨트롤)에 문서 넘침을 더했다. 편집 모드 · 서브페이지(«보기» 켬) · 창 높이 900.

| 프로젝트 이름 | 창 1440 | 1143 – 1009 | 1008 – 700 | 600 | 390 |
|---|---|---|---|---|---|
| 관리자 콘솔 설계서 | 48 | 48(«보기» 머리) | 48(«보기» `…`) | 98 | 148 |
| 영문 51자 끊을 자리 없음 · 페이지 제목 46자 | 48 | **98** | 98 | 98 | 148 |
| 한글 32자 · 제목 17자 | 48 | **98** | 98 | 98 | 148 |

모든 판(창 15 × 이름 3) 넘침 0 · 문서 넘침 0 · 덮인 컨트롤 0. 단계 경계: 1009 에서 «보기» 가 머리에, 1008 에서 `…` 에 «보기 · GNB · LNB · 브레드크럼브 · 페이지 제목» 넷이 다 든다(빠진 항목 0).

브라우저 확대(`zoomedContext` 꼴 — `devicePixelRatio` · `innerWidth` 로 실림 확인): 창 1440 × 1.25(inner 1152) · 1280 × 1.25(1024) · 1280 × 1.1(1164)은 «보기» 머리 · 머리 47 · 넘침 0. 1440 × 1.5(960) · 1.75(823) · 2(720)은 «보기» 가 `…` 에 넷 다 · 넘침 0 · 덮임 0.

**L4(낮음 · 원래 있던 성질)** — 긴 프로젝트 이름은 창 1143 부터 머리가 두 줄(98)이다(넘침 · 덮임은 0). `head-fold.ts` 머리말이 이미 «이름이 길면 … 머리가 줄을 바꾼다(넘치지는 않는다)» 로 적은 성질이고, «보기» 의 44px 만큼 그 문턱이 높아졌다. main 판에서 같은 이름이 어느 폭부터 두 줄인지는 재지 않았다 — 늘어난 폭이 44 인지 실측이 없다.

P3 원문(셈):

```ts
const head = document.querySelector('.wb-shell-header')!
const controls = [...head.querySelectorAll('button, select, a')].filter((e) => (e as HTMLElement).offsetParent !== null)
// overflow = max(컨트롤 오른끝, head.scrollWidth + left) − min(head 오른끝, 문서 clientWidth)
// covered = 가운데 점의 elementFromPoint 가 그 컨트롤(의 안)이 아닌 것
// docOverflow = documentElement.scrollWidth − clientWidth
// `…` 항목 = getByRole('menu', { name: '더 보기' }) 의 [role^="menuitem"] 글
```

### 4. «페이지 추가» = subpage · «팝업 페이지 추가» = popup(탐침 P4)

페이지를 짓는 사람 입구는 메뉴 줄의 «<메뉴> 추가»(`+`) 메뉴 하나다 — 트리 머리 «+» 는 «최상위 메뉴 추가» 만 든다(`panels/menu-tree.tsx` 555 · 581). 키보드 단축키 입구는 없다(`openInput('new-page')` 를 부르는 자리는 `panels/tree-row-actions.tsx` 177 하나).

| 입구 | 서버 트리(`GET …/tree` 의 `layout/kind`) |
|---|---|
| 마우스 «+» → 페이지 추가 | subpage/page |
| 마우스 «+» → 팝업 페이지 추가 | popup/popup |
| 키보드(«+» 에 포커스 · Enter · ↓ 1 · Enter) → 페이지 추가 | subpage/page |
| 키보드(↓ 2) → 팝업 페이지 추가 | popup/popup |

system-admin 1.7.0 에 고정한 프로젝트에서 «페이지 추가» 로 지은 «옛판서브»: 서버 subpage · 캔버스 `[data-wb-layout-region]` 0 · 캔버스 글 없음 · «레이아웃» 은 서브페이지가 골라짐 · «보기» 꺼짐(«이 테마는 끌 영역을 선언하지 않았습니다»). 그림 `/private/tmp/claude-501/-Users-jang2162-orca-workspaces-wirebound-feat-layout-ui/787f6160-89e1-49dd-9b74-8ff720266e93/scratchpad/p4-170-subpage.png`(스크래치 — 재부팅에 지워진다): 틀 없이 빈 흰 판(1280 폭 문서의 빈 `Page` · 위 끝의 고른 선) — 빈 레이아웃과 겉모양이 같다. 안내가 필요한지는 판단하지 않았다(브리프).

결함 없음.

### 5. 이름 · 문안

- 옛 이름: `git grep -n -F -e "'종류'" -e '"종류"' -- apps/web packages ':!docs'` 13 줄 — 그리드 행 종류(`grid-row-actions.test.ts:453` 의 `radiogroup '종류'` — DataGrid 행 `kind`) · 초대 표 열 · 상호작용 액션 «종류» · Input `kind` 셀렉트 · 카탈로그 prop 라벨뿐이다. 페이지 정보의 옛 «종류» 를 찾는 줄 0. `pageKindOps` · `페이지 종류` · `wb-shell-page-kind` 는 `docs/superpowers/plans` 밖에서 이력 설계 문서 셋(2026-10-23 · 10-26 · 11-25 page-layout)에만 남는다 — 11-25 설계 표의 «지금 `pageKindOps` 의 화면 → 팝업 연산» 은 걷힌 함수 이름을 지금 것처럼 부른다(코디네이터 몫 — 「남은 것」).
- «보기» 부분 일치: `git grep -n -P "['\"]보기['\"]" -- apps/web` 19 줄 — 찾기로 쓰는 자리는 `layout-ui.test.ts` 183 · 185(둘 다 `exact: true`)와 `editor-head-tools` 의 이름 목록뿐이다. 그 밖은 버튼 글 픽스처(«보기» 라벨 단추 — `export-bundle` · `paste-view-states` · `view-state-address`)와 `password-input.tsx` 의 «<라벨> 보기»(계정 화면 — 에디터 머리와 한 화면에 안 선다). «보기» 를 품는 더 긴 이름(«… 더 보기» · «미리보기 — …»)으로 찾는 줄은 «보기» 단추에 안 맞는다(Playwright 부분 일치는 찾는 글이 이름의 부분이어야 한다). `name: '보기'` 를 `exact` 없이 찾는 줄 0.
- «레이아웃» 이름의 다른 요소: `aria-label` 에 «레이아웃» 을 든 요소는 `page-kind.tsx` 54 하나 — `getByRole('radiogroup', { name: '레이아웃' })`(jsdom 셋)이 다른 것에 안 맞는다.

결함 없음.

## 남은 것

- **L2 의 끝** — 밥이 뿌리를 고른 채 속성 패널로 팝업 제목을 고치는 동안 앨리스가 «빈» 으로 바꾸면 밥의 제목 편집이 어떻게 끝나는지(`Page` 뿌리에 `props.title` 이 얹히는가 · 버려지고 알리는가) 재지 않았다. 뿌리 고름이 잠금을 안 만드는 것은 원래 성질이고, 경계를 넘는 바꿈의 전제(`test /root/type`)만 뿌리를 지킨다.
- **L3** 을 막으려면 묶음이 «그 노드가 아직 바닥에 있다» 를 전제로 실어야 한다(예: 바닥 배열 값 `test`). 고칠지는 코디네이터 몫 — 노드를 잃지는 않는다.
- **L4** 의 main 대조(같은 긴 이름이 main 에서 몇 폭부터 두 줄인가)는 안 쟀다.
- 설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 325 줄 «지금 `pageKindOps` 의 화면 → 팝업 연산» 은 걷힌 함수 이름이다 — 구현 보고 «남은 것» 의 «배치 선과 같은 단계» 문장과 함께 코디네이터가 고칠지 정한다.
- 운영 번들(`EDITOR_STACK_BUNDLE=build`)로는 안 쟀다 — 모두 dev 번들이다.
- 탐침 원문 전부는 스크래치 `…/scratchpad/probe/p1-layout.probe.ts` · `p1c-root.probe.ts` · `p2-view.probe.ts` · `p3-head.probe.ts` · `p4-add.probe.ts` · `p5-race.probe.ts` · `p6-esc.probe.ts`(재부팅에 지워진다 — 다시 지을 값은 위 원문 요지에 옮겼다).

## 지침

고칠 것 없음. 덧붙일 만한 것 하나: `AGENTS.md` 「검증 — wirebound」 의 실브라우저 판 목록에 «**뿌리를 고르는 것은 잠금을 안 만든다** — `lockedBy(rootId)` 는 남이 페이지 안 아무 노드를 골랐을 때 참이고, 남이 뿌리를 고른 판은 거짓이다. "남이 뿌리를 쥔 판" 을 세우려면 뿌리가 아니라 그 아래 노드를 고르게 한다(`docs/superpowers/plans/2026-11-25-rv-lu-report.md` L2)» 를 넣을 만하다(넣을 자리: 「목 · 계측은 불린 수를 값으로 확인하고 …」 절 끝 — `.ruler/*.md` 소스는 코디네이터가 고친다).
