# mg-lcx 보고 — 캔버스(lc) · 번들(lx)을 main(2.2.0 포함) 위로 합치고 게이트

브리프 `mg-lcx` · 워크트리 `feat-layout-canvas`(브랜치 `feat/layout-canvas` · DB `0.0.0.0:5547`) · 판 Node v24.21.0(`mise env` — 셸의 맨 `node` 는 v26 이라 모든 스크립트가 `eval "$(mise env -s zsh)"` 뒤에 돈다). 시작 때 `orca terminal list` 의 이 워크트리 터미널은 둘(`..layout-canvas` · «초기 설정» — 둘 다 셸 프롬프트) · `git status --short` 는 `.build/` 한 줄 · 추적 파일 색인 md5 `febaa0493cf8fada2711b3c36b0e7576`(첫 병합 직전). 물음 `q-mg-lcx.md` 에 둘(Q1 · Q2)을 적었고 코디네이터 답을 받았다(Q1 기본값 · Q2 보고에).

## 합친 머리

| 커밋 | 무엇 |
|---|---|
| `c849c686` | `merge: main into feat/layout-canvas` — main `5c0e7da5`(ls · 기본테마 2.2.0) |
| `bcaaaed9` | `merge: feat/layout-export into feat/layout-canvas` — lx `fa48c035` |
| `7ab7a7bd` | fix(web) — 뷰포트 높이 틀 아래 캔버스 iframe 높이(합친 탓 · 아래 3-④) |
| `24561ba9` | test(web) — 끌기 훑기 서브페이지 판의 틀 카나리아(3-①) |
| `c891bda7` | fix(exporter, system-admin) — 번들 뷰어 셸의 틀 높이 · 2.2.0 체크섬(3-② · 2) |

## 충돌과 푼 방법

- **`packages/schema/test/zones-census.test.ts`**(main 병합) — 머리말 «노드가 아니다» 한 줄을 lc 는 `canvas.tsx` 의 틀 내비 · 메뉴 트리로, main(ls)은 기본테마 `layout-subpage.tsx` 의 LNB 항목으로 고쳤다. 둘 다 이어 붙였다(lc 구절 뒤에 ls 구절). 덩이 밖 공통 줄은 그대로.
- **정본 `docs/superpowers/specs/2026-08-03-wirebound-design.md`**(lx 병합) — 덩이 둘. 각 덩이에서 두 쪽이 다른 것은 마지막 문장 하나뿐임을 파이썬으로 확인했다(그 문장을 뺀 두 쪽 글자가 같다).
  - §6.0 «`LayoutFrame` 으로 그리는 자리» — lc «에디터 캔버스 · … — HTML 번들 · PPTX 는 틀 없이», lx «… · HTML 번들의 장과 그 장을 찍는 PPTX 화면 — 캔버스는 틀 없이». 지금 참인 것으로: **에디터 캔버스 · 테마 미리보기 «예제 페이지» · `wb-theme dev` · `wb-theme check` · HTML 번들의 장과 그 장을 찍는 PPTX 화면(영역은 늘 다 켠다 — §11.3)**.
  - §8.3 «팝업 — 덮개 층» 끝 문장 — 캔버스(lc: 팝업 레이아웃의 틀 · 문서 폭 막 · 문서보다 넓으면 문서 폭 − 48) 문장 뒤에 번들 팝업 장(lx: 막이 뷰포트 폭 · 가운데 위 24px)을 «도» 로 잇고 화면 모드(막 없이 제 크기)로 끝냈다.
  - 합친 뒤 정본에서 «틀 없이» 를 센 줄 0(옛 두 문장의 잔재 없음).
- **조용히 합쳐진 파일** — `apps/web/test/canvas/bundle-parity.test.tsx`(lx 의 «번들 뿌리 = 첫 `[data-wb-id]`») 포함. 두 병합 뒤 `pnpm build` 0 · `pnpm typecheck` 0.

## 2. 2.2.0 체크섬

- 병합 직후 `pnpm build` 의 `system-admin-2.2.0.wbtheme` sha256 `2015dc4c…fb5e1` — `checksums.json` 의 2.2.0 줄과 같았다(합친 판이 테마 바이트를 안 바꿨다).
- 3-② 가 테마 CSS 를 고쳐 다시 지었다: **`28d5ed7154d09f8647491cbc520d09b4c27455a22bf4883c35415125961cda87`** — 변조 다섯 판 뒤 복원 · 다시 빌드에서도 같은 값(두 번 지어 같음). `c891bda7` 에 적었다. 배포 안 한 판이라 판 이름은 그대로다.

## 3. ls 가 넘긴 것

### ① 끌기 훑기 서브페이지 판의 틀 카나리아(`24561ba9`)

- `apps/web/build-test/admin-drag-sweep.test.ts` — 끌기 전에 캔버스 문서의 `[data-wb-layout="subpage"]` 수 · `[data-wb-layout-region]` 수를 재어 서브페이지 판은 `{ frames: 1, regions: true }`, 나머지 판은 `{ frames: 0, regions: false }` 를 단언. 머리말의 «캔버스에 틀이 서는지는 세지 않는다» 를 지금 참인 것으로 고쳤다.
- 잰 값(창 1280×1100 · dev 번들) — 7 판 초록. 서브페이지 · 팔레트 Button `{frames:1, regions:4}` 점 60 · 손잡이 s_t4 점 91 · 뒤집힘 0 · 죽음 0 · `Maximum update depth` 0.
- **카나리아 변조**: `canvas.tsx` 의 `LayoutFrame` 에 `layout={'blank'}` → 서브페이지 두 판이 `expected { frames: +0, regions: false } to deeply equal { frames: 1, regions: true }` 로 죽음(실행 2 · 죽음 2).
- **형제 구조 배치 규칙 변조는 훑기에서 산다(못 잰 것 · Q2)** — 테마 `theme.css` 끝에 심고 `pnpm -C system-themes/admin build` 뒤 서브페이지 두 판 + «화면 · 팔레트 Button»:

  | 변조 | 실행 | 죽음 | 값 |
  |---|---|---|---|
  | A `[data-wb-layout="subpage"] [data-wb-id] + [data-wb-id] { margin-top: 24px }` | 3 | 0 | 서브페이지 Button 점 60 → 55(규칙이 캔버스에 닿았다) · 뒤집힘 0 |
  | C `ec71f22b` 의 `* + *` · 단독 표 `:only-child` 음수 여백을 `[data-wb-layout="subpage"]` 아래로 | 3 | 0 | 뒤집힘 0 · 죽음 0 |
  | D 같은 규칙을 틀 없이(원래 `ec71f22b` 꼴) — «화면» 세 판 | 3 | 0 | 뒤집힘 0 · 죽음 0 |

  D 가 살아 머리말의 «시딩한 테마로 지으면 다섯 판 가운데 넷이 죽는다» 는 지금 판에서 서지 않는다(그 사이 에디터 쪽 판정이 바뀌었는지는 안 갈랐다 — «남은 것»). 같은 A · C 는 jsdom 인구조사 `system-themes/admin/test/admin.test.ts` «배치를 바꾸는 규칙은 형제 구조로 안 가른다» 가 각각 죽인다(실행 38 · 죽음 1).

### ② 번들 뷰어 셸의 틀 `100vh`(`c891bda7`)

- **재현**(기본테마 2.2.0 · 짧은 서브페이지 장 · 창 1280×800): 뷰어 셸 — 틀 높이 800(= `100vh`) · 목업 `scrollHeight − clientHeight` **88**(목업 여백 24 × 2 + 장 상자 여백 20 × 2). 화면 모드 — 0.
- **고친 것**(Q1 답 = 기본값): 셸이 `.wb-export-canvas` 에 `--wb-frame-min-height: calc(100vh - 5.5rem)`, 화면 모드(`.wb-export-screen .wb-export-canvas`)에 `100vh` 를 건다 — 옛 셸 글자 뒤에 덧붙였다(`bundle-stateless-bytes` 가 앞을 해시로 잠근다 — 덧붙은 장 상자 규칙은 그 변수 하나만 싣는지를 새로 단언). 기본테마 틀은 `min-height: var(--wb-frame-min-height, 100vh)`. 셸 감싸개 허용 목록(`bundle-shell.test.ts`)에 그 변수 하나를 계약으로 더했고, 테마 인구조사 «`var()` 가 가리키는 `--wb-*` 는 `:root` 에» 에 호스트 변수로 뺐다. 정본 §6.0(틀 높이 변수) · §11.3(셸이 칸 높이를 준다) 한 줄씩.
- **케이스** 새 `apps/web/build-test/bundle-subpage-height.test.ts` — 뷰어 셸 · 화면 모드 두 판. 고치기 전(옛 `dist`) 셸 판 `mockupScroll: 88` 로 빨강 · 화면 모드 초록. 고친 뒤 2 / 2.

  | 변조(소스 → `pnpm -C packages/exporter build` · `-C system-themes/admin build` → 복원 · 다시 빌드) | 실행 | 죽은 판 · 값 |
  |---|---|---|
  | M1 셸 칸 높이 변수를 뗌 | 2 | 뷰어 셸 · `mockupScroll` 88 |
  | M2 칸 높이를 `100vh − 8rem` 으로 | 2 | 뷰어 셸 · `frameToCanvas` −40 |
  | M3 화면 모드 변수를 뗌 | 2 | 화면 모드 · `frameToWindow` −88 |
  | M4 테마가 `100vh` 만 읽음 | 2 | 뷰어 셸 · `mockupScroll` 88 |

- 이름 충돌의 여지: 토큰 키 꼴(`^[a-zA-Z0-9.-]+$`)은 `frame.min-height` 를 받아 같은 변수 이름을 지을 수 있다 — 테마가 제 토큰으로만 짓는 이름이라 낮음.

### ③ 캔버스 `contentHeight` 머리말 · ④ 합친 탓으로 선 결함(`7ab7a7bd`)

- **재현**(새 `apps/web/build-test/subpage-frame-height.test.ts` · 기본테마 2.2.0 · 창 1440×900): 서브페이지 페이지에서 손잡이로 끌다 Escape — iframe 1239 → 끄는 동안 1280 → **취소 뒤 1280 그대로**(+41), 남(bob)이 둘째 큰 카드를 지워도 **1280 그대로**. 빈 레이아웃 대조는 1019 → 1060 → 1019 → 577. lc 의 L3-M2 와 같은 기전 — 틀의 `min-height: 100vh` 가 틀 상자를 iframe 높이에 묶어 `body` · 그 자식(틀)의 상자가 안 바뀌어 높이 관찰이 안 깬다. lc · ls 어느 쪽 혼자서도 안 서고 합친 판에서만 선다(lc 판의 캔버스에는 2.2.0 이 없고, ls 판의 캔버스에는 틀이 없었다).
- **고친 것**: `canvas-iframe.tsx` 의 높이 관찰이 `[data-wb-layout-content] > *`(틀 안 문서 뿌리 — 내용 상자는 `display: contents` 라 제 상자가 없다)도 본다. `contentHeight` 머리말을 «뿌리 · `body` · 레이아웃 틀에 뷰포트 단위 높이를 걸면 … 그래서 `naturalHeight` 로 잰다(기본테마의 서브페이지 틀이 `100vh`)» 로 고쳤다.
- 고친 뒤 subpage `{ before: 1239, grew: 1280, cancelled: 1239, after: 797 }` · blank 그대로. 혼자 죽는 변조 = 고침을 뗀 판(새 관찰 한 줄을 뗌 — 고치기 전과 같은 소스) → subpage 판만 `cancelled: 41` · `shrank: false` 로 죽음(실행 2 · 죽음 1).

### ⑤ PPTX 720 의 두 줄 GNB 그림

- `docs/superpowers/plans/2026-11-25-mg-lcx-shots/pptx-720-gnb10-subpage.png` — 뿌리 메뉴 열 개(대시보드 · 회원관리 · 과정관리 · 수강관리 · 평가관리 · 게시판관리 · 통계 · 콘텐츠관리 · 운영관리 · 시스템관리)마다 서브페이지 화면 하나, 실제 PPTX(`GET …/export?format=pptx`)의 `ppt/media/image4.png`(«수강관리 목록» · 1440×1104 = 720×552 의 2 배). GNB 가 여섯 · 넷으로 두 줄이고 고른 막대는 «수강관리» 아래, 본문은 두 줄 머리만큼(약 60px) 내려간다. 탐침은 스크래치(`pptx.probe.ts` — 위 픽스처를 짓고 PPTX 를 풀어 그림을 꺼냄).

## 게이트

체인 스크립트 하나를 `nohup nice -n 10 caffeinate -i … & disown` 으로 띄웠다(자리 `gate-slots/mg-lcx` — 띄울 때 자리 0 · 끝에 지움). 머리 `c891bda7` · Node v24.21.0(상태 파일 첫 줄) · 시작 03:16:49 load 3.47 · 끝 04:07:41 load 8.42(코어 15). `pmset -g log` 의 Sleep 줄은 11-25 22:27 – 22:30 뿐 — 게이트 밖.

| 단계 | rc | 파일 | 통과 | 실패 | 건너뜀 |
|---|---|---|---|---|---|
| `pnpm typecheck` | 0 | — | — | — | — |
| `pnpm build` | 0 | — | — | — | — |
| `pnpm test --maxWorkers=25%` | 0 | 650 | 9749 | 0 | 3 |
| `test:build:serial`(`--project build`) | 0 | 20 | 188 | 0 | 1 |
| `test:browser`(dev 번들) | 0 | 148 | 922 | 0 | 2 |
| `EDITOR_STACK_BUNDLE=build` `test:browser` | 0 | 148 | 922 | 0 | 2 |

빨강 0 — «부하 · 기존 흔들림» 과 «합친 탓» 을 가를 판이 없었다(`change-kind-code` 도 두 실브라우저 판에서 초록). 합친 탓 결함은 게이트 전에 탐침으로 찾은 3-④ 하나이고 고쳐 케이스로 잠갔다. 끝에 이 워크트리 경로의 vitest · dev 서버 0(`ps`).

## 남은 것

- 끌기 훑기가 형제 구조 배치 규칙 변조(틀 안 · 틀 밖 모두)를 지금 판에서 못 잡는다 — `admin-drag-sweep.test.ts` 머리말 «다섯 판 가운데 넷이 죽는다» 를 다시 재어 고칠지(에디터 쪽 판정이 바뀌었는지 · 점 고르기가 그 판을 못 겨누는지) 정한다. 지금 그 성질은 jsdom 인구조사가 잠근다.
- 기본테마 2.2.0 의 `100vh` 는 캔버스에서 `naturalHeight` + 문서 뿌리 관찰로 풀었다 — 올린 테마가 노드 안(문서 뿌리 아래)에 뷰포트 단위 높이를 걸면 같은 묶임이 다시 선다(`apps/web/build-test/n20-layout.test.ts` 의 `vhinner` 가 미리보기 판만 잰다).

## 지침

- 고칠 지침 없음(셸의 맨 `node` 가 v26 이라 `mise env` 를 거쳐야 하는 것은 이미 지침 「게이트 · 변조 스크립트는 판의 런타임을 스스로 증명한다」 에 있다).
