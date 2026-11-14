# RV-CF 보고 — 코멘트 포커스 리뷰

브랜치 `feat/comment-focus`(기준 main `e943cd14` · 머리 `6e4a31b4`)의 코멘트 포커스(구현 보고 `docs/superpowers/plans/2026-11-14-cf-report.md`)를 반증했다.
고치지 않았다 — 이 보고만 커밋한다. 탐침은 스크래치에 두고 api 하네스 없이 `editor-stack` 으로 돌렸다(스크래치 vitest 설정의 `root` 를 체크아웃,
`test.dir` 을 스크래치로 — `.ruler` 「검증」 «스크래치 탐침을 테스트 글롭에 안 넣고»). 값은 전부 실브라우저(Chrome · dev 번들)다. jsdom 값은 «7» 의 변조 셋뿐이다.

## 바꾼 것

없음(보고 파일 하나). 탐침 중에 소스를 잠깐 바꾼 판은 셋이고 모두 백업 · 바이트 비교로 되돌렸다 — 끝의 `git status --short` 는 `?? .build/` 하나,
`git ls-files -s apps/web/src | md5` 는 시작 때와 같다(`4d889d8d…`).

| 판 | 무엇을 바꿨나 | 되돌림 |
|---|---|---|
| 기준 소스 끼우기 | `e943cd14` 의 `canvas.tsx` · `comment-panel.tsx` · `editor.tsx` · `use-view-state.ts` · `canvas-pick.tsx` · `shell.css`(표지 `useCommentPointing` 0 건 확인) | 여섯 파일 `cmp` 같음 |
| `choose` 계측 | `use-view-state.ts` 의 `choose` 에 `globalThis.__wbChoose` 로 부른 값을 쌓는 한 줄 | `cmp` 같음 |
| 변조 B3 · F5 · R5 · T1c | 아래 «7» | 넷 다 `cmp` 같음 |

## 결정

1. **«겨눈 노드가 화면에 없다» 를 항목 2 와 갈라 적었다** — 브리프의 «링이 보이는 구간 밖» 은 값만 적을 일(사용자에게 물음)이고, 안 보이는 탭 패널
   안 노드는 링이 **아예 안 서는** 판이라 결함(중간)으로 올렸다(아래 M2).
2. **묶음에 포커스가 선 채의 키 명령을 «4» 에서 쟀다** — 소스에 `.wb-shell-selection` 을 읽는 자리가 0 이라(아래 «4») «링이 선 채 그 기능을 써서
   잰다» 는 손잡이 · 키보드 명령이 링과 고른 노드 가운데 어디로 가는지로 쟀다.

## 발견 — 무게 차례

| # | 무게 | 무엇 |
|---|---|---|
| M1 | 중간 | 묶음 안 본문 글을 **끌어 고르기 · 두 번 눌러 낱말 · 세 번 눌러 줄** 이 «고름» 이 되어 화면 상태가 바뀐다 |
| M2 | 중간 | 지금 탭이 아닌 패널(`Tabs` 의 다른 `TabPanel`) 안 노드의 묶음은 포커스 · 누름 · Enter 모두 **링 0 · 상태 그대로** — 사람에게 아무 신호가 없다 |
| M3 | 중간 | 묶음 `li` 에 포커스(링은 묶음의 노드)인 채 Delete · Backspace · Cmd+D · ↑↓ · Escape · Cmd+A 가 **고른 노드**에 간다 — Delete 가 링과 다른 노드를 서버에서 지운다 |
| L1 | 낮음 | 남이 그 노드를 지우면 링은 걷히지만 가리킴 값이 남아, **같은 id 로 다시 서면(되돌리기) 사람 몸짓 없이 링이 되살아난다** |
| L2 | 낮음 | 고른 옅은 노드(여럿 고름의 기준 아닌 것)를 가리키면 캔버스에 **진한 실선 둘**이 서 어느 쪽이 기준 노드인지 캔버스로는 못 가른다(결정 4 의 값) · 정본 818 줄과 어긋남 |
| L3 | 낮음 | 정본 «컴포넌트» 탭 문단의 «키보드 … 는 탭을 안 옮긴다» 가 머리 단추의 Enter · Space(탭을 옮긴다)와 글자로 부딪힌다 |
| V1 | 값 | 캔버스 칸보다 긴 페이지의 아래쪽 노드 링은 **보이는 구간과 겹침 0px** — 링도 진짜 선택(머리 단추)도 캔버스를 안 굴린다 |

높음(데이터를 잃음 · 남의 화면 · 잘못된 노드에 씀)은 이 트랙이 연 길에서 안 나왔다 — M3 의 Delete 는 링과 다른 노드에 쓰지만 같은 길이 기준 소스의
다른 포커스 정지점(묶음 안 «수정» 단추)에서 같은 값으로 서고, 지운 노드는 그 사람이 고른 노드(외곽선이 선 것)다. 사용자가 «링이 선 노드에 쓴다» 로
읽을 수 있어 무게를 올릴지는 코디네이터가 정한다.

## 잰 값

공통 픽스처(`editor-stack` 의 alice · 창 1600×900 · 줌 1 · 기본테마) — 페이지 하나, 상태 `s_admin`(«관리자»), 뿌리 자식 `n_a`(Text «늘 보이는 글») ·
`n_b`(Text «관리자 글», `visibility: { mode: 'only', states: ['s_admin'] }`) · `n_c`(Text «또 다른 글»). 판마다 새 탭으로 열어 «코멘트» 탭을 누르고
`[data-comment-node="n_b"]` 가 설 때까지 기다린다. 줄여 쓰는 이름:

```ts
const group = (page, id) => page.locator(`.wb-shell-comments [data-comment-node="${id}"]`)
const switcherName = (page) => page.getByRole('button', { name: /^화면 상태:/ }).getAttribute('aria-label')
const rings = (page) => page.evaluate(() => [...document.querySelectorAll('[data-wb-comment-pointed]')].map((e) => e.getAttribute('data-wb-comment-pointed')))
// 본문의 i 번째 글자 가운데 — 글자 노드를 TreeWalker 로 훑어 Range(i, i+1).getBoundingClientRect() 의 가운데(호스트 좌표).
// BODY_B = '.wb-shell-comments [data-comment-node="n_b"] .wb-shell-comment-body'  ·  nth 는 같은 셀렉터의 몇째 요소
```

### 1. 포인터가 묶음 안에서 하는 다른 일 — M1

코멘트 셋: `n_a` «alpha beta gamma delta epsilon zeta», `n_b` «first second third fourth fifth sixth seventh» · «lorem ipsum dolor sit amet consectetur».
끌기는 `page.mouse.down()` 뒤 8 – 10 걸음 `move` · `up`. 두 모드 값이 같다.

| 몸짓 | 앞 → 뒤 «화면 상태:» | 링 | 남은 고른 글 | `activeElement` |
|---|---|---|---|---|
| `n_b` 둘째 본문 글자 0(−2px) → 15 끌기 | 기본 → **관리자** | `['n_b']` | «lorem ipsum dolo» | `li[n_b]` |
| `n_a` 본문 글자 6 → `n_b` 둘째 본문 글자 10 끌기(밖 → 안) | 기본 → 기본 | `['n_a']` | «» (아래) | `li[n_a]` |
| `n_b` 둘째 본문 글자 10 → `n_a` 본문 글자 6 끌기(안 → 밖) | 기본 → 기본 | `[]` | «eta gamma … lorem ipsu»(두 묶음에 걸침) | `li[n_b]` |
| `n_b` 둘째 본문 글자 8 에 `mouse.dblclick` | 기본 → **관리자** | `['n_b']` | «ipsum» | `li[n_b]` |
| 같은 점에 `mouse.click(…, { clickCount: 3 })` | 기본 → **관리자** | `['n_b']` | «lorem ipsum dolor sit amet consectetur» | `li[n_b]` |
| 대조 — 작성자 줄 한 번 누름 | 기본 → 관리자 | `['n_b']` | «» | `li[n_b]` |

- **M1** — 같은 묶음 안의 끌기 · 두 번 · 세 번 누름은 `click` 이 그 `li` 안에 떨어져 `pickTarget` 이 고름으로 받는다. 설계의 반-목표 «훑는 동안 캔버스가
  뒤집히는 것 — 상태 전환은 사람이 묶음을 «고른» 때만» 에 걸린다(글을 베끼려는 몸짓이 캔버스를 뒤집는다). 고른 글 · 포커스는 남는다(데이터 손실 없음).
  밖 ↔ 안 끌기는 `click` 이 두 묶음의 공통 조상(`ul`)에 떨어져 고름이 아니다. 거르는 값의 후보: `click` 때 `getSelection()` 이 그 묶음 안에서
  접히지 않았으면 고름이 아니다 · `event.detail > 1` 이면 고름이 아니다(첫 누름이 이미 골랐다).
- 밖 → 안 끌기의 «고른 글 없음» 은 **기준 소스(`e943cd14` 여섯 파일을 끼움)에서도 같다**(중간값 셋 다 «», `activeElement` 는 `body`) — 이 트랙과 무관한 값이다.
- **머리 단추 누름에 `li` 의 `onClick` 이 한 번 더 도는가 — 안 돈다.** `choose` 계측(위 «바꾼 것»)으로 센 부른 값:

  | 판(편집 모드 · 숨은 `n_b` 의 묶음) | `choose` 에 간 값 | 뒤 «화면 상태:» · 고름 · 탭 · 링 |
  |---|---|---|
  | 머리 단추 누름 · Enter · Space · `dblclick` | 넷 다 `['s_admin']` | 관리자 · `['n_b']` · 컴포넌트 · `[]` |
  | 작성자 줄 한 번 · 본문 두 번(낱말) | `['s_admin']` | 관리자 · 고름 그대로 · 코멘트 · `['n_b']` |
  | 뷰 모드 본문 세 번 · 뷰 모드 묶음 Enter · 편집 모드 묶음 Space | `['s_admin']` | 관리자 · 링 `['n_b']` |
  | 묶음 Enter 꾹(`keyboard.down` 다섯 번 — 반복) | `['s_admin']` | 관리자 |

### 2. 링이 사람 눈에 보이는가 — V1 · M2

**V1** — 픽스처 `n_t0` … `n_t69`(Text «줄 i 글» 일흔), `n_t0` · `n_t69` 에 코멘트. `group(page, 'n_t69').focus()` 뒤 · 작성자 줄 누름 뒤에 잼.

| 창 · 모드 | `.wb-shell-canvas` 상자(top–bottom) | `scrollTop` 앞 → 뒤 | 링 top–bottom(호스트) | 보이는 구간과 겹침 |
|---|---|---|---|---|
| 1440×900 편집 · 뷰 | 49 – 858(`clientHeight` 809 · `scrollHeight` 2336) | 0 → 0 | 2328.5 – 2348 | **0px** |
| 1280×720 편집 · 뷰 | 49 – 678(`clientHeight` 629) | 0 → 0 | 2328.5 – 2348 | **0px** |

링은 노드 상자와 차 0px 로 섰다(`ringVsNode` 의 x · y · 폭 · 높이). 대조 — 편집 모드에서 그 묶음의 **머리 단추**(진짜 선택)를 눌러도 `scrollTop` 0,
고른 외곽선 2328.5 – 2348 로 겹침 0px — 패널에서 고른 진짜 선택도 캔버스를 안 굴린다(`reveal` 은 탭 · 접힌 검색폼을 펼칠 뿐 굴리지 않는다 —
`canvas/canvas.tsx` 의 `revealKey`). 고치지 않았다 — 굴릴지는 사용자에게 물을 일이다.

**M2** — 픽스처: 뿌리 자식 `n_top`(Text) · `n_tabs`(Tabs — 자식 `n_p1`(TabPanel «첫 탭» › `n_in1` Text) · `n_p2`(TabPanel «둘째 탭» › `n_in2` Text)),
`n_in1` · `n_in2` 에 코멘트. 두 모드 같다.

| 걸음 | 값 |
|---|---|
| 연 판 — iframe 안 `[data-wb-id="n_in2"]` 수 | **0**(지금 탭이 아닌 패널은 그리지 않는다) |
| `group(page, 'n_in2').focus()` | 링 `[]` |
| 작성자 줄 누름(고름) | 링 `[]` · «화면 상태: 기본» 그대로 |
| 대조 — 편집 모드 머리 단추 | 고름 `['n_in2']` · 외곽선 y 164 · 노드 `isVisible()` 참(렌더러 `reveal` 이 그 탭을 편 판으로 그림) |

`stateShowingNode` 는 화면 상태만 보고(`n_in2` 는 어느 상태에서나 «보인다»), 캔버스는 요소가 없는 노드에 링을 안 세운다(`outlinedIds` 이펙트의
`findNodeElement` 가 `null`). 정본 새 문단의 «지금 상태에서 숨은 노드는 그릴 요소가 없어 링도 없다» 는 참이지만 이 판(상태가 아니라 탭 · 접힌
검색폼이 숨김)은 말하지 않는다. 접힌 검색폼 안 노드는 안 쟀다(같은 `reveal` 갈래라 같을 것으로 본다 — 못 잰 것).

### 3. 링이 노드를 따라가는가

픽스처: 공통 셋 + `n_t0` … `n_t39`, `n_a` · `n_b` · `n_c` 에 코멘트, 밥(editor). 창 1440×900. `group(page, 'n_c').focus()` 로 링을 세우고 차례로:

| 걸음 | 편집 · 뷰 모드의 링 − 노드 상자(x · y · 폭 · 높이) |
|---|---|
| 포커스 직후 | 0 · 0 · 0 · 0 |
| «축소» 한 번(75%) | 0 · 0 · 0 · 0 |
| «확대» 두 번(125%) | 0 · 0 · 0 · 0 |
| 캔버스 칸 가운데에서 `mouse.wheel(0, 120)`(`scrollTop` 120) | 0 · 0 · 0 · 0 |
| «뷰포트 폭» 375 | 0 · 0 · 0 · 0 |
| 상태 전환기로 «관리자»(`n_b` 가 서 `n_c` 가 40.6px 밀림) | 0 · 0 · 0 · 0 · 링 `['n_c']` |
| 밥이 REST 로 `n_c` 앞(`/root/children/2`)에 두 줄 Text `n_ins` 를 넣음(200) | 0 · 0 · 0 · 0 · 링 `['n_c']` |
| 밥이 `n_c` 를 지움(200) | 링 `[]` · 묶음은 «– 사라진 노드 (n_c)» · `tabindex` 없음 |
| 밥이 같은 자리에 같은 id `n_c` 를 다시 넣음(되돌리기 흉내) | **링 `['n_c']` 가 다시 선다** — 그 사이 alice 는 아무것도 안 함(포커스는 상태 전환기 단추) |
| 묶음 고름이 상태를 바꾼 판(작성자 줄 누름 → `n_b` 가 섬) | `n_b` 링 − 노드 0 · 0 · 0 · 0 |

- **L1** — 가리킴 값(`CommentPointingProvider` 의 `pointed`)은 노드가 사라져도 남고 링만 측정 이펙트가 못 그린다. 걷히는 때(정본 · `comment-pointing.tsx`
  머리말의 넷)에 «노드가 사라짐» 이 없다. 남의 되돌리기 · 다시 붙이기로 그 노드가 다시 서면, 사람이 다른 데를 보고 있어도 링이 선다.

### 4. `.wb-shell-selection` 을 읽는 쪽 — L2 · M3

`git grep -n 'wb-shell-selection'`(`-selection-member` 포함): `apps/web/src` 10 줄 · 2 파일 · `apps/web/build-test` 28 줄 · 20 파일 · `apps/web/test` 3 줄 · 2 파일.

| 자리 | 갈래 | 링이 선 판에서 집는 것 |
|---|---|---|
| `apps/web/src` — `canvas.tsx` 762 · 771 · 789(그림) · 17 · 429 · 767 · 783(주석) · `shell.css` 28 · 1745 · 1851 | **읽는 자리 0** — 그리기 · 규칙뿐. 손잡이는 `box`(고른 것의 측정값)로 서고(`canvas.tsx` 813 `CanvasDragHandle`), 끌기 · 키보드는 스토어 선택을 본다 | — |
| build-test 첫 요소 + `data-wb-selected-id`(`querySelector('.wb-shell-selection')?.getAttribute(…)`) — `canvas-drop-below` 186 · `canvas-drop-review` 1123 · `canvas-drop` 266 · `drag-pointer-kinds` 438 · `first-row-ask` 145 · `grid-editor` 92 · `grid-row-actions` 134 · `grid-row-content` 85 · `grid-row-nested` 161 · `grid-row-pick` 151 · `mv-overlaps` 99 · `palette` 550 · `comment-focus` 256 | 고른 것이 있으면 고른 외곽선(링이 뒤라서). 고른 것이 없고 링만 있으면 링 → 속성 없음 → `null`(«안 고름» 으로 맞게 읽힌다) | 13 자리 |
| build-test 속성으로 거름(`[data-wb-selected-id="…"]`) — `canvas-iframe` 151 · `editor-narrow-canvas` 312 · 333 · 448 · `n1-layout` 213 · 223 · `n20-layout` 224 | 링을 안 집는다 | 7 자리 |
| build-test 첫 요소의 **상자**(`querySelector(…).getBoundingClientRect()`) — `n1-layout` 187 · `n20-layout` 231 · `canvas-preview` 347 | 고른 것이 없고 링만 있으면 **링의 상자** | 3 자리 |
| build-test 로케이터 전부(`locator('.wb-shell-selection')`) — `canvas-iframe-host-events` 160(`getAttribute` — 둘이면 strict 위반) · `grid-row-nested` 272 · `grid-row-pick` 241(`boundingBox` — 둘이면 strict 위반) · `zone-editor` 547(`.first()`) | 링과 고른 외곽선이 함께면 strict 위반 · `.first()` 는 고른 것 | 4 자리 |
| `apps/web/test` — `comment-pointing-ring` 3 · 105 · `shell-css` 82(누수 검사의 글) | 링을 재는 케이스 · 읽는 자리 아님 | — |

지금 이 판들은 코멘트를 안 써 링이 서지 않는다 — 오늘 깨지는 케이스는 0 이다. 링과 섞는 새 케이스가 «상자» 3 자리 · «로케이터 전부» 4 자리의 꼴을
베끼면 거짓 값 · strict 위반이 난다(이월 — 아래 «남은 것» 3).

**L2** — 결정 4 의 값. `n_c` 를 누른 뒤 `n_a` 를 Cmd+누름(기준 `n_c` · 옅은 `n_a`) → 외곽선 `wb-shell-selection|solid|2px` · `wb-shell-selection-member|dashed|1px`.
«코멘트» 탭에서 `group(page, 'n_a').focus()` → `wb-shell-selection|solid|2px` 둘(`data-wb-member-id` 0 · 링 `['n_a']`) — 캔버스만 보면 둘 다 «기준
노드» 꼴이다. 정본 818 줄(«보이는 것» — «기준 노드는 진한 선 · 나머지는 가는 끊은 선»)이 이 판에서 거짓이다.

**M3** — 묶음에 포커스가 선 채 키 명령. 픽스처: 공통 셋 + `n_d`, `n_a` · `n_b` · `n_c` 에 코멘트. 캔버스에서 `n_a` 를 누른 뒤 «코멘트» 탭 →
`group(page, 'n_c').focus()`(링 `['n_c']`) 또는 대조로 `n_c` 묶음의 «수정» 단추 `.focus()` → `keyboard.press(키)` → 600ms 뒤 잼. 두 포커스 자리의 값이 같다.

| 키 | 뒤 — 고름 · 링 · 서버 `headSeq` · 뿌리 자식 |
|---|---|
| `ArrowDown`(다음 노드 고르기) | 고름이 `n_b`(숨어 외곽선 없음) · 링 `['n_c']` · 4 · 그대로 |
| `Delete`(고른 노드 삭제) | 고름 `[]` · 링 `['n_c']` · **4 → 5 · `n_a` 가 빠짐** |
| `Meta+d`(복제) | 고름이 새 사본 · 링 `['n_c']` · **4 → 5 · `n_a` 뒤에 사본** |
| `Escape`(선택 해제) | 고름 `[]` · 링 `['n_c']` · 4 |
| `Meta+a`(형제 모두) | 기준 `n_a` · 옅은 `n_d` · 링 `['n_c']` · 4 |

묶음 `li` 에 `data-wb-own-shortcuts` · `data-wb-holds-keys` 가 없고 역할도 없어 `shortcutsBlocked` · `keyHeldByWidget` 둘 다 지나 단축키가 고른 노드에 간다.
같은 길이 묶음 안 «수정» 단추에서도 서므로 길 자체는 기준 소스에 있던 것이다(그 단추는 이 트랙 앞에도 Tab 정지점이었다). 이 트랙이 더한 것은 **링이
다른 노드를 가리키는 정지점**이다 — 묶음을 Tab 으로 훑다 Delete · Backspace 를 친 사람은 링이 선 노드가 아니라 고른 노드를 잃는다(되돌리기로 돌아온다).

### 5. 진짜 선택 · 쓰기가 안 바뀌는가

M3 픽스처 + 밥(editor)의 둘째 탭. alice 가 캔버스에서 `n_a` 를 고르고 «코멘트» 탭의 새 코멘트 상자(`#wb-comment-draft`)에 «n_a 에 쓰던 말» 을 친 뒤:
s0 · `n_b` 묶음 `focus()` 뒤 s1 · `n_b` 작성자 줄 누름 뒤 s2 · `n_c` 묶음 `focus()` + Enter 뒤 s3.

| 값 | 편집 모드 s0 → s3 | 뷰 모드 s0 → s3 |
|---|---|---|
| 고른 외곽선 | `['n_a']` 넷 다 | `[]` 넷 다(뷰 모드에 고른 외곽선 없음) |
| «달 곳» 문장(`#wb-comment-target`) | «달 곳: 1 Text (n_a)» 넷 다 | 같음 |
| 초안 | «n_a 에 쓰던 말» 넷 다 | 같음 |
| 서버 `headSeq` | 4 넷 다 | 4 넷 다 |
| 구조 트리 잠금 배지 | 0 넷 다 | 0 넷 다 |
| 주소 | `?state=` 없음 넷 다 | s0 · s1 없음 → s2 · s3 `?state=s_admin` |
| «화면 상태:» · 링 | 기본 `[]` → 기본 `[]` → 관리자 `['n_b']` → 관리자 `['n_c']` | 같음 |

- 밥의 탭(상태 «관리자» 로 바꾼 뒤 캔버스 누름): `n_b` → 고름 `['n_b']` · `n_c` → `['n_c']` — alice 의 포커스 · 고름이 잠금을 안 세웠다. 대조 `n_a`
  → 고름이 `['n_c']` 그대로(alice 가 진짜로 고른 `n_a` 는 잠겨 있다).
- 뷰 모드의 `?state=` 는 설계대로다 — 주소는 뷰 모드 · viewer 만 쓴다(`shell/view-state-address.ts` 머리말). viewer 의 주소는 안 쟀다.

### 6. 권한 — viewer

밥을 viewer 로 넣은 같은 픽스처를 밥이 연다.

| 값 | |
|---|---|
| 머리의 모드 단추 | «편집 모드»(`aria-pressed=true`) · «뷰 모드» 둘 다 서고 **편집 모드로 열린다** |
| 우측 탭 | 페이지 정보 · 컴포넌트 · 코멘트 · 상호작용 |
| «코멘트» 탭의 머리 단추 · 묶음 `tabindex` | 3 개(`n_a` · `n_b` · `n_c`) · `"0"` |
| `n_b` 작성자 줄 누름 | «화면 상태: 관리자» · 링 `['n_b']` |
| `n_c` 머리 단추 누름 | 고름 `['n_c']` · 탭 «컴포넌트» · 링 `[]` · 서버 `headSeq` 4 그대로 |
| 잠금 — viewer 가 머리 단추로 `n_c` 를 고른 뒤 alice 가 `n_c` 를 누름 | alice 고름 `['n_c']`(잠금 없음). 대조로 viewer 가 캔버스에서 `n_d` 를 누른 뒤 alice 도 `['n_d']` |

viewer 의 고름은 남에게 잠금을 안 세우고 쓰기도 없다 — 머리 단추는 viewer 의 캔버스 누름과 같은 일을 한다. 뷰 모드(viewer 가 «뷰 모드» 를 누른 판)의
링 · 고름은 alice 의 뷰 모드 판과 같은 코드라 따로 안 쟀다(못 잰 것).

### 7. 변조 표 표본 — 보고와 같다

`python3` 로 한 곳(맞은 수 1 확인)을 바꾸고 그 파일만 돌린 뒤 백업으로 되돌려 `cmp`(넷 다 같음).

| 변조 | 바꾼 글자 | 돈 파일 · 실행 | 죽은 케이스 · 실패 값 | 보고와 |
|---|---|---|---|---|
| T1c | `use-view-state.ts` `const here = hidden \|\| (node !== …` → `const here = (node !== …` | `apps/web/test/shell/state-showing-node.test.ts` · 6 실행 · 통과 5 · 실패 1 | «부모가 숨으면 자식도 숨는다 — …» — `expected { change: false } to deeply equal { change: true, state: 's_admin' }` | 같다 |
| F5 | `comment-panel.tsx` `if (event.target !== event.currentTarget \|\| (event.key` → `if ((event.key` | `apps/web/test/panels/comment-focus.test.tsx` · 12 · 11 · 1 | ««수정» 단추를 누르거나 거기서 Enter · 고치는 상자에서 Enter — 상태가 그대로다» — `'화면 상태: 관리자'` ≠ `'화면 상태: 기본'` | 같다 |
| R5 | `canvas.tsx` `if (target !== null) next.push(…)` → 늘 넣고 `target === null` 이면 0 상자 | `apps/web/test/canvas/comment-pointing-ring.test.tsx` · 10 · 9 · 1 | «지금 상태에서 숨은 노드를 가리키면 링이 없다» — `expected [ 'n_admin' ] to deeply equal []` | 같다 |
| B3 | `comment-panel.tsx` `return own === null \|\| …` → `return true \|\| own === null \|\| …` | `apps/web/build-test/comment-focus.test.ts`(`-c vitest.browser.config.ts`) · 7 · 6 · 1 · 건너뜀 0 | «묶음 안의 «수정» · …» — `comment-focus.test.ts:189` `'화면 상태: 관리자'` ≠ `'화면 상태: 기본'`(«수정» 누름 뒤 첫 단언 — 뒤 걸음은 안 닿음) | 같다 |

### 8. 정본

- 바뀐 두 문단(«중앙 — 캔버스» 의 외곽선 문장 · «컴포넌트» 탭의 탭 이동 문장)과 새 «코멘트» 탭 문단을 구현과 견줬다 — 위 «1» – «6» 의 값과 맞는다.
  남는 어긋남은 셋: L2(818 줄), L3(아래), M1(«묶음을 누르거나» 가 끌어 고르기 · 두 번 · 세 번 누름도 덮는지 문장이 말하지 않는다 — 구현은 덮는다).
- **L3** — 833 줄 «캔버스에서 노드를 누르거나 «코멘트» 탭의 묶음 머리를 누르면(고르면) 우측 탭이 «컴포넌트» 로 옮긴다 — 구조 트리 줄 · 키보드 · … 는
  탭을 안 옮긴다». 머리 단추에 포커스를 두고 Enter · Space 를 치면 탭이 옮긴다(«1» 의 표 — 탭 «컴포넌트»). 그 «키보드» 는 키보드로 노드를 고르는
  명령(↑↓ ← →)을 뜻하지만 글자로는 키보드 전부로 읽힌다.
- 연대기 표현: 더한 줄에서 «이제 · 바뀌었 · 전에는 · 앞 판 · 더는 · 지금은 · 원래 · 고쳤» 0 건. «뒤집» 1 건은 «훑는 동안 캔버스가 안 뒤집힌다»(동작)다.
- `git grep -n -F '외곽선'`(정본) 12 줄 · `'코멘트» 탭'` 7 줄 · `'아웃라인'` 2 줄을 열었다(파이썬 줄 셈과 같다). 틀려진 것은 818 줄 하나(L2). 721 줄(«숨은 노드도 … 캔버스에는
  외곽선이 없다») · 747 줄(«고른 노드를 펼쳐 보인다» — 고른 노드에만이다) · 883 줄(토큰 이동)은 참이다.

## 게이트

돌리지 않았다(브리프 — 케이스를 안 바꾼다). 파일 하나씩 돈 판:

| 실행 | 실행 · 통과 · 실패 · 건너뜀 |
|---|---|
| `apps/api/test/health.test.ts`(global-setup 이 테스트 DB 에 붙는지) | 18 · 18 · 0 · 0 |
| 변조 T1c · F5 · R5 · B3 | «7» 의 표 |
| 스크래치 탐침(실브라우저 — `editor-stack`) | 실행 열두 번 · 판 53(이 브랜치 52 · 기준 소스 1 — `it.skip` 으로 뺀 판 넷은 안 셈) — 빨강은 탐침을 잘못 짠 판 셋(없는 링을 기다림 둘 · 코멘트 없는 묶음을 겨눔 하나)뿐이고 고쳐 다시 돌렸다 |

- 런타임 `node v24.21.0`. 실행 10:32 – 10:49. `pmset -g log` 의 마지막 ` Sleep ` 은 11-13 19:29 — 그 뒤 잠듦 없음. load 10 – 58(코어 15) — 다른 저장소의 일이 같은 기계를 쓴다. 시간 한도로 죽은 판은 없다.
- 끝에 이 워크트리 경로의 vitest · vite · Chrome 은 0(`ps`) — 남은 것은 codegraph MCP(이 세션)뿐. 자기 DB 컨테이너(5463)는 남겼다.
- `orca terminal list --worktree path:<이 워크트리>` 는 «No terminals listed» 였다(구현 워커 · 이 세션 모두 안 보임). 작업 내내 `apps/web/src` 의 색인 md5 가 그대로여서 다른 쓰는 자는 없었다.

## 남은 것

1. **M1 · M2 · M3 를 고칠지** — 셋 다 사용자가 바란 동작에 닿는다. 고치는 차수에 넘길 판(위 «잰 값» 의 픽스처 · 좌표 · 셀렉터)을 케이스로 잠근다.
   M1 은 «고른 글이 있으면 고름이 아님» · `detail > 1` 거름이 후보, M2 는 링에도 렌더러 `reveal` 을 주는 것(그러면 뷰 모드에서 문서가 아닌 화면이
   펼쳐진다 — 설계 판단)이 후보, M3 는 묶음 `li` 에서 노드 단축키를 막는 것(`data-wb-own-shortcuts`)이 후보다 — 셋 다 코드로 안 쟀다.
2. **V1 · L2 는 사용자에게 물을 일** — 링(과 패널에서 고른 진짜 선택)을 캔버스 칸 안으로 굴릴지 · 고른 옅은 노드를 가리킬 때 기준 외곽선과 갈라 그릴지.
3. **«4» 의 build-test 읽기 꼴 7 자리**(첫 요소의 상자 3 · 로케이터 전부 4)는 링과 섞는 새 케이스에서 거짓 값 · strict 위반을 낸다 — 오늘 깨지는 것은 0.
   새 케이스는 `[data-wb-selected-id]` 로 고른다.
4. L1 · L3 — 걷히는 때에 «노드가 사라짐» 을 더할지 · 정본 833 줄의 «키보드» 를 «키보드로 노드를 고르는 명령» 으로 좁힐지.
5. **못 잰 것** — 접힌 검색폼 안 노드의 링(M2 와 같은 갈래로 봄) · viewer 의 뷰 모드 · viewer 의 주소 · 좁은 창(우측이 덮개로 서는 폭)에서의 «우측 접힘» 걷기 · 운영 번들(`EDITOR_STACK_BUNDLE=build`) · Firefox · Safari.

## 지침

- **무엇이 틀렸나:** `.ruler` 「워크트리 작업」 의 «재개 · 중복 판단 전에 `orca terminal list` 로 실제 생존을 확인한다» 가 터미널 목록에 에이전트 세션이
  나온다고 전제한다. 이 판에서 `orca terminal list`(전부 · `--worktree path:<워크트리>` 둘 다)는 이 워크트리의 터미널을 하나도 안 냈다 — 브리프가
  «둘이 보이는 것이 정상» 이라 한 구현 워커 · 이 세션 모두 안 보였다. 그 판에서 «터미널이 없다 = 다른 에이전트가 없다» 로 읽으면 판정이 틀린다.
- **어느 문서 어느 절:** `.ruler/10-worktree.md`(생성물 `AGENTS.md`) 「디스패치 상태는 에이전트의 생사가 아니다」 의 «How to apply» 첫 항목 끝.
- **넣을 문장:** «`orca terminal list` 가 그 워크트리의 터미널을 하나도 안 내면(자기 세션도 안 보이면) 목록이 그 런타임의 터미널을 못 본 것이다 —
  «없다» 로 읽지 말고, 작업하는 동안 그 워크트리의 추적 파일 색인 md5(`git ls-files -s <경로> | md5`)와 `git status --short` 를 시작 · 끝에 견줘 다른 쓰는
  자가 없었는지를 값으로 적는다.»
