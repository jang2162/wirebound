# RV2-CF 보고 — 코멘트 포커스 대응의 좁은 반증

브랜치 `feat/comment-focus`(머리 `92d90b65`)에서 대응 `c3bf6f60..HEAD`(8 커밋 — 보고 `docs/superpowers/plans/2026-11-14-fx-cf-report.md`)가 세운 장치 넷
(M1 미룬 고름 · M2 펼침 · M3 묶음 안 단축키 막기 · V1 캔버스 굴림)이 **새로 연 길**만 찾았다. 고치지 않았다 — 반증과 보고다.

값은 따로 적지 않으면 실브라우저(Chrome · dev 번들 · `editor-stack` · 창 1600×900 · 줌 1 · 기본테마)다. jsdom 값은 없다(이 차수는 jsdom 을 안 돌렸다).
탐침은 스크래치의 vitest 설정(`root` 체크아웃 · `test.dir` 스크래치 · 루트 설정 `build` 프로젝트의 `esbuild` · `resolve`)으로 돌렸고 `editor-stack` 은
체크아웃의 절대 경로로 `import` 했다. 원문은 아래 «탐침 원문».

**고치기 전 판**은 대응이 고친 소스 넷(`apps/web/src/canvas/canvas.tsx` · `comments/comment-pointing.tsx` · `panels/comment-panel.tsx` · `routes/editor.tsx` —
`c3bf6f60..HEAD` 의 `apps/web/src` 바뀐 파일 전부 · 다른 소스가 새 이름을 안 쓴다)을 `git show c3bf6f60:<경로>` 로 갈아 끼우고 같은 탐침을 돌린 값이다(라벨
«전»). 경로 전체 이름으로 백업하고 `cmp` 로 되돌렸다 — 끝의 `git ls-files apps/web/src packages | xargs md5 -q | md5` 가 시작 값 `33d779d7…` 과 같다.
`packages/*` 는 그 범위에서 안 바뀌었다.

## 결함 — 무게순

높은 무게(데이터를 잃음 · 남의 화면 · 잘못된 페이지에 씀 · 겹친 잠금)는 안 나왔다. 둘 다 중간이고 **둘 다 M1(미룬 고름)이 연 길**이다.

### M-1 (중간) — 미룬 고름이 간격 안의 다른 몸짓을 500ms 뒤에 덮는다

묶음을 한 번 누르고 고름이 서기 전(500ms) 다른 몸짓을 하면, 간격이 지날 때 고름(상태 전환 · 펼침 · 굴림)이 그 몸짓 **위에** 선다. 미룬 고름을 걷는 자리는 다른
고름 · 둘째 클릭 · 패널이 내려감뿐이고, 설 때는 그때의 렌더(`latestShowNode`)로 판정하며 펼침의 `selection` 도 **설 때의** 진짜 선택을 적는다 — 그래서 «진짜 선택이
바뀌면 걷는다» (M2) · «캔버스를 누르면 걷는다» (M2) · «한 번 굴린 링은 끌려오지 않는다» (V1 결정 2)가 그 간격 안에서는 다 빠진다.

| 판(누른 뒤 둘째 몸짓까지 57 – 130ms) | 고치기 전(«전») | 지금 |
|---|---|---|
| **편집 — `n_in2` 묶음 → 구조 트리 줄 `n_in1`** (p1 h · p5) | 첫 탭 · `n_in1` 그림 · 외곽선 `['n_in1']` | **둘째 탭 펼침 · `n_in1` 안 그림 · 외곽선 `[]` · 링 `['n_in2']`** |
| 그 판에서 Delete(포커스는 트리 줄 `n_in1`) (p5 gap0) | — | 서버 `n_p1` 이 빔 — **캔버스에 안 보이는 `n_in1` 이 지워짐**(캔버스는 `n_in2` 링을 보인다) |
| 대조 — 같은 판을 700ms 뒤에 (p5 gap700) | — | 첫 탭 · 외곽선 `['n_in1']` · 링 `[]` · Delete 는 `n_in1`(보이는 노드) |
| 편집 — `n_in2` 묶음 → 트리 `n_p1` 누름 · ↓ (p1 h2) | 외곽선 `['n_in1']` | 둘째 탭 펼침 · 외곽선 `[]` |
| 두 모드 — `n_b` 묶음 → 머리 전환기에서 «손님» (p1 i) | `손님` · 뷰 모드 주소 `?state=s_guest` | **`관리자`** · 뷰 모드 주소 **`?state=s_admin`** |
| 뷰 — `n_in2` 묶음 → 캔버스 `n_top` 누름 (p1 g) | 첫 탭(펼침 없음) | 둘째 탭 펼침(링 없음 — 누름이 가리킴만 걷었다) |
| 뷰 — `n_in2` 묶음 → 캔버스 `switchTab` 단추(→ 첫 탭) (p2 마지막 걸음) | — | 둘째 탭 펼침 — **누른 단추의 탭 바꿈이 되돌아감** |
| 1440×900 · 1280×720 · 836×700 · 700×700 — `n_t35` 묶음 → 곧 휠 +900 (p4 S2) | 휠 자리 그대로(`scrollTop` 900) | 휠 뒤 링 칸 밖(위 끝 −352 · 1440) → **800ms 뒤 `scrollTop` 1171 로 끌려옴**(쓰기 −356) |

- 무게 — 중간. 첫 줄이 가장 무겁다: 고른 노드가 캔버스에 안 그려지고 외곽선도 없는 채 링은 다른 노드에 서 있어, 키보드 명령이 사람이 캔버스에서 보는 것과
  다른 노드에 간다(트리는 `n_in1` 을 고른 줄로 보인다 — 데이터를 잃는 것은 아니다). M3 이 막으려던 «링이 가리키는 노드 ≠ 단축키가 가는 노드» 가 묶음 밖 포커스로 다시 선다.
- 고칠 방향(코드를 안 고쳤다 — 문장 그대로 짜면 변조로 한 번 돌려 볼 것): 미룬 고름이 **클릭 때의** 진짜 선택 · 화면 상태 · 페이지를 적어 두고, 설 때 셋 가운데 하나라도
  다르면 버린다(펼침의 `selection` 과 같은 꼴). 캔버스 누름 · 칸 굴림(사람의 `wheel`)은 값으로 안 남아 그 둘은 걷는 자리(`cancelPick`)를 캔버스 쪽에 따로 두어야
  한다 — 가리킴 provider 에 «미룬 고름 걷기» 를 실으면 캔버스의 `point(null)` 자리 셋이 함께 부를 수 있다.

### M-2 (중간) — 미룬 고름이 옮겨 간 페이지에 닿는다(두 페이지에 같은 노드 id)

`RightPanel` 의 본문은 `key={restoredToken}` 이라 페이지를 옮겨도 «코멘트» 패널이 안 내려간다 — 타이머가 산다. 간격이 지날 때 `latestShowNode` 는 **새 페이지**
렌더의 `showNode`(새 문서 · 새 페이지의 상태 · 새 `reveal`)라, 새 페이지에 같은 id 의 노드가 있으면 그 페이지에서 고른다.

| 판(첫째 `n_b` 또는 `n_in2` 묶음 → 곧 메뉴 트리 «둘째» · 둘째는 같은 id 의 문서) | 전 | 지금 |
|---|---|---|
| 편집 · `n_b`(둘째에서 `s_admin` 에서만 보임) (p1 a) | 둘째 `기본` | 둘째 **`관리자`** · `n_b` 그림 |
| 뷰 · `n_b` (p1 a) | 둘째 `기본` · 주소 질의 없음 | 둘째 **`관리자`** · 주소 **`?state=s_admin`** |
| 두 모드 · `n_in2` (p1 a2) | 둘째 첫 탭 | 둘째 **둘째 탭 펼침** |
| 대조 — 둘째가 다른 id 의 문서 (p1b a3) | — | 둘째 `기본` · 첫째로 돌아와도 `기본` · 콘솔 0 |

- 무게 — 중간(옮겨 간 페이지의 화면 상태 · 뷰 모드 주소가 사람 몸짓 없이 바뀐다 — 문서는 안 바뀐다). 조건이 좁다 — id 는 한 문서 안에서만 겹치지 않고
  (`packages/schema/src/validate.ts` 의 `duplicate-id`), 에디터의 붙이기는 id 를 새로 짓는다(`apps/web/build-test/clipboard.test.ts` `sameId: false`). REST · MCP 로
  지은 페이지(같은 id 를 두 페이지에 쓴 문서)에서 선다.
- M-1 의 «클릭 때의 페이지를 적어 두고 다르면 버린다» 가 이것도 닫는다.

### 낮음

- **L-1 — 간격 안에 우측 탭을 옮기거나 캔버스 노드를 누르면 고름이 사라진다**(p1 b · f · 편집). 패널이 내려가며 타이머를 걷는다. 전: `관리자`(곧바로 선 고름이 남음) ·
  지금: `기본`. «마지막 몸짓이 이긴다» 로 읽으면 맞는 값이라 결함인지는 판단거리다 — M-1 을 고칠 때 이 판과 같은 규칙으로 맞춘다.
- **L-2 — 첫 링 굴림이 칸을 가로로 20px 민다**(p4 S1 · 네 창 다). 노드(문서 폭 1280)가 칸(860 · 700 · 320 · 184)보다 넓어 `bringIntoPane` 이 왼끝을 맞추고
  (`scrollLeft` 0 → 20 — 무대 여백 24 − `PANE_MARGIN` 4) 그 뒤로는 안 민다. 전: 0. 새 장치의 길이지만 무게는 거의 없다.
- **L-3(원래 있던 길 · 이월) — 뷰 모드에서 상호작용이 숨긴 탭 패널 안 노드의 묶음을 고르면 펼침도 링도 안 선다**(p2). 단추 `switchTab`(→ `n_p2`)로 둘째 탭을 연 뒤
  `n_in1`(첫 탭 · 문서의 `active`) 묶음을 고르면 `n_in1` 0 · 링 `[]`. 펼침 판정(`canvas.tsx` 의 `reveal`)이 문서의 `active` 만 보고 겹layer 의 `active` 를 안
  본다. 전에는 펼침이 없어 그 판의 링도 없었다 — M2 가 안 닫은 칸이다.

## 항목별 잰 값

### 1. 미룬 고름(500ms)

판마다 첫째 페이지(«탐침 원문» 의 문서) «코멘트» 탭에서 묶음 작성자 줄을 누르고 둘째 몸짓을 한 뒤 900ms 뒤에 읽었다. 둘째 몸짓까지 57 – 130ms. 콘솔 오류 · 경고는
모든 판 0(셸을 떠난 판 포함).

| 판 | 모드 | 전 | 지금 |
|---|---|---|---|
| a 페이지 옮김(같은 id) | 편집 · 뷰 | 둘째 `기본` | 둘째 `관리자`(뷰 `?state=s_admin`) — M-2 |
| a2 페이지 옮김(같은 id · 펼침) | 편집 · 뷰 | 둘째 첫 탭 | 둘째 둘째 탭 — M-2 |
| a3 페이지 옮김(다른 id) | 편집 · 뷰 | — | `기본` · 첫째로 돌아와 `기본` |
| b 우측 탭 «컴포넌트» | 편집 | `관리자` | `기본` — L-1 |
| c 모드 바꿈 | 편집 → 뷰 | `관리자` · `?state=s_admin` · 링 `n_b` | 같음 |
| c 모드 바꿈 | 뷰 → 편집 | `관리자` · 링 `n_b` | 같음 |
| d 우측 접음 | 두 모드 | 첫 탭(펼침 없음) | 둘째 탭 펼침 · 링 `[]`(접힘이 가리킴만 걷음) — 설계대로(펼침은 접힘에 안 걷힘) |
| e 다른 묶음(`n_top`) | 두 모드 | 링 `n_top` · `기본` | 같음 · `n_in2` 안 펼침 |
| f 캔버스 `n_top` → «코멘트» 탭으로 돌아옴 | 편집 | `관리자` | `기본` — L-1 |
| g 캔버스 `n_top` 누름 | 편집 | «컴포넌트» 탭 · 고름 `n_top` | 같음 · 펼침 없음(패널이 내려가 타이머가 걷힘) |
| g 캔버스 `n_top` 누름 | 뷰 | 첫 탭 | 둘째 탭 펼침 — M-1 |
| h 구조 트리 줄 `n_in1` | 편집 | 외곽선 `n_in1` | 외곽선 `[]` · 둘째 탭 — M-1 |
| h2 트리 `n_p1` · ↓ | 편집 | 외곽선 `n_in1` | 외곽선 `[]` · 둘째 탭 — M-1 |
| i 전환기 «손님» | 편집 · 뷰 | `손님` | `관리자` — M-1 |
| j 남이 `n_b` 를 지움(REST 200) | 편집 · 뷰 | `관리자`(뷰 `?state=s_admin`) | `기본` · 링 `[]` · 콘솔 0 |
| k 로고 «프로젝트 목록» | 편집 · 뷰 | 콘솔 0 | 콘솔 0 · 에러 0 |
| l 다른 묶음 `n_in2` 머리 단추 | 편집 | `관리자` · 고름 `n_in2` | `기본` · 고름 `n_in2` · «컴포넌트» |
| e2 이웃 묶음 경계를 잇달아(10px 틈) | 편집 | — | 두 클릭 `detail` 다 1 — 이웃 묶음은 두 번 누름으로 안 묶인다 |

«같은 묶음을 다시 한 번(간격 밖 · 안)» 은 대응의 케이스가 잰다(M1 «두 번 누름» · V1 «다시 고름») — 다시 재지 않았다.

### 2. 펼침과 그 걷힘

뷰 모드 · 둘째 탭(같은 사람의 다른 탭 B) · 서버(p2). 단추 `n_btn1`(→ `n_p1`) · `n_btn2`(→ `n_p2`) · 둘째 탭 안 `n_btn_in`(→ `n_p1`).

| 걸음 | 그림(`n_in1` · `n_in2`) · 링 |
|---|---|
| `n_in2` 고름 | 0 · 1 · `['n_in2']` — B 는 1 · 0(남의 화면 안 닿음) |
| → `n_btn1` | 1 · 0(펼침 걷힘 · 단추의 탭) |
| → `n_btn2` | 0 · 1(겹layer) |
| → `n_in1` 묶음 고름 | **0 · 1 · 링 `[]`** — L-3 |
| → 캔버스 `n_top` | 0 · 1(겹layer 그대로) |
| `n_btn1` 뒤 `n_in2` 고름 → 펼친 패널 안 `n_btn_in` | 1 · 0(펼침 걷힘 · 단추의 탭 — 설계대로) |
| `n_in2` 고름 → 간격 안 `n_btn1` | 0 · 1 — M-1 |
| 서버 `headSeq` · `Tabs.active` · `SearchForm.collapsed` | 5 · 0 · `true` — 앞과 같음 · B 끝까지 1 · 0 |

편집 모드(p2): `n_in2` 고른 뒤 «페이지 정보» 탭 · 우측 접음 · 뷰 모드 · 편집 모드로 돌아옴에서 펼침이 그대로 남고, 구조 트리로 `n_tabs` 를 고르면 걷혀 첫 탭이다.
서버 그대로. 팝업이 선 판은 못 쟀다(«남은 것»).

### 3. 묶음 안 단축키 막기

전 · 지금 값이 칸마다 같다 — 막기가 새지 않고, 글 상자의 키는 원래 입력 표면의 것이다(p3).

| 자리 · 키 | 전 = 지금 |
|---|---|
| 묶음 «수정» 상자 — End · Backspace / Home · Delete / Meta+z / Meta+Shift+z / Meta+a · Meta+c · End · Meta+v | 글에 먹음(«n_in1 에 단 » → «_in1 에 단 » → 되돌림 · 다시 → 두 벌 붙임) · 고름 `n_top` 그대로 |
| 그 상자에서 `#` 고르개 — ↓ ↓ ↑ | 활성 0 → 1 → 2 → 1 · 고름 그대로 |
| 고르개 Escape / 한 번 더 Escape | 고르개 닫힘 · 고치는 상자 남음 / 남음 |
| 서버 | 바뀜 없음 |
| 묶음 밖 — «코멘트» 탭 단추 · «문서 순서대로 재번호» 단추 · «페이지 정보» 첫 단추에서 Meta+d · Delete | 복제 · 지움(번호가 오름) — 노드 단축키가 전처럼 선다 |
| 같은 자리 ↓ | 서버 그대로 · 고른 외곽선이 전과 같은 값(탭 단추 `[]` · «페이지 정보» 단추 `['n_top']`) |

다른 값은 하나다 — **묶음 `li` 에 포커스가 선 채 Meta+z**: 전은 앞 편집(Meta+d 복제)을 되돌렸고(`headSeq` 3 → 4) 지금은 아무것도 안 한다. 대응 «결정» 1 이 적은
그대로다(«되돌리기 · 붙이기도 함께 안 선다»).

### 4. 캔버스 굴림

긴 페이지(`n_t0` … `n_t69`) · 칸 `scrollTop` · `scrollLeft` 쓰기를 setter 로 세고 칸 밖 스크롤 상자의 움직임 최댓값을 모았다(p4). 네 창 같은 꼴이다.

| 걸음 | 1440×900 | 1280×720 | 836×700 | 700×700 | 전(네 창) |
|---|---|---|---|---|---|
| S1 `n_t69` 묶음 포커스 | 쓰기 `[1494, +20(가로)]` · 칸 안 | `[1674, +20]` | `[1694, +20]` | `[1694, +20]` | 쓰기 0 · 칸 밖(위 끝 2280) |
| S2 `n_t35` 누름 → 휠 +900 → 800ms | 1171 → 1527 → **1171** | 1171 → 1707 → **1171** | 1171 → 1727 → **1171** | 같음 | 0 → 900 → 900 |
| S3 링 `n_t62` 선 채 트리 줄 `n_t2` | 쓰기 0 · `n_t2` 칸 밖(−1165) | 0 · −1345 | 0 · −1365 | 0 · −1365 | 쓰기 0 · `n_t2` 칸 밖(−798) |
| S4 트리 `n_t30` · ↓ 넷 → `n_t34` | 쓰기 0 · 칸 안(`scrollIntoView` 가 굴림) | 같음 | 같음 | 같음 | 같음 |
| S6 Tab 으로 묶음 훑기(`n_t35` · `n_t62` · `n_t69`) | 쓰기 셋(밖에 선 것마다 하나) · 셋 다 칸 안 | 같음 | 같음 | 같음 | 쓰기 0 · 둘이 칸 밖 |
| S7 확대 둘(문서 폭 1920) 뒤 `n_t0` · `n_t69` | 쓰기 하나씩 · 둘 다 칸 안 | 같음 | (줌 무리가 셸 `…` 로 접혀 안 잼) | (같음) | 쓰기 0 · 둘 다 칸 밖 |

- 칸 밖 스크롤 상자 움직임: S1 · S2 · S3 에서 0. S4 이후의 `section.wb-shell-region` 583 – 633 은 키보드 고름이 구조 트리 칸을 굴린 것(`revealNode` — 전에도 같음)이다.
- 키보드 고름(S4)과 겨루지 않는다 — 링이 서 있어도 다시 안 굴린다. 넣은 뒤 저절로 고름은 안 쟀다 — `bringIntoPane` 은 링이 새로 서거나 `revealed` 가 새 값일 때만 돌아
  고름만 바뀐 렌더에서는 안 돈다(코드로만).
- S3(트리 줄로 고른 노드를 캔버스가 안 굴림)은 전과 같다 — 원래 있던 동작이고 이 범위 밖이다.
- 좁은 창에서 우측이 덮개로 서는 폭은 없다 — 700 – 836 은 캔버스 칸이 184 – 320 으로 줄 뿐이다(`apps/web/build-test/editor-narrow-canvas.test.ts` 의 창 표).

## 탐침 원문

스크래치 설정(`probe.config.ts`):

```ts
const build = base.test.projects.find((p) => p.test?.name === 'build')
export default defineConfig({ root: '<체크아웃>', esbuild: build.esbuild, resolve: build.resolve,
  test: { dir: '<스크래치>/probe', include: ['**/*.test.ts'], pool: 'forks', maxWorkers: 1, testTimeout: 600_000, hookTimeout: 300_000 } })
```

문서(첫째 · 같은 id 판의 둘째 — `PATCH …/ops` `baseSeq: 0`):

```ts
[{ op: 'add', path: '/viewStates', value: [{ id: 's_admin', name: '관리자' }, { id: 's_guest', name: '손님' }] },
 { op: 'add', path: '/root/children/0', value: { id: 'n_top', type: 'Text', props: { content: '맨 위 글' } } },
 { op: 'add', path: '/root/children/1', value: { id: 'n_b', type: 'Text', props: { content: '관리자 글' }, visibility: { mode: 'only', states: ['s_admin'] } } },
 { op: 'add', path: '/root/children/2', value: { id: 'n_tabs', type: 'Tabs', props: { active: 0 }, children: [
   { id: 'n_p1', type: 'TabPanel', props: { label: '첫 탭' }, children: [{ id: 'n_in1', type: 'Text', props: { content: '첫 탭 안 글' } }] },
   { id: 'n_p2', type: 'TabPanel', props: { label: '둘째 탭' }, children: [{ id: 'n_in2', type: 'Text', props: { content: '둘째 탭 안 글' } }] }] } },
 { op: 'add', path: '/root/children/3', value: { id: 'n_sf', type: 'SearchForm', props: { collapsed: true }, children: [{ id: 'n_sf_in', type: 'Text', props: { content: '접힌 조건' } }] } }]
// 코멘트는 첫째에만: n_top · n_b · n_in1 · n_in2 · n_sf_in. 다른 id 판의 둘째는 n_other(Text) 하나.
// p2 는 둘째 탭 패널 children 에 { id: 'n_btn_in', type: 'Button', props: { label }, interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: 'n_p1' }] }] },
// 뿌리 4 · 5 에 같은 꼴의 n_btn1(→ n_p1) · n_btn2(→ n_p2).
```

걸음(p1 의 `run` — 판마다 새 프로젝트 · 새 탭):

```ts
await page.goto(P1); await canvasFrame(page).locator('[data-wb-id="n_top"]').waitFor()
if (mode === 'view') await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
await page.getByRole('tab', { name: '코멘트', exact: true }).click()
await page.locator(`.wb-shell-comments [data-comment-node="${first}"] .wb-shell-comment-author`).first().click()
await act(page)              // 예: page.getByRole('link', { name: '둘째' }).click()
                             //     page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_in1"] .wb-shell-structure-node').click()
                             //     page.locator('.wb-shell-header').getByRole('button', { name: /^화면 상태:/ }).click(); page.getByRole('menuitemradio', { name: '손님' }).click()
                             //     canvasFrame(page).locator('[data-wb-id="n_top"]').click()
await page.waitForTimeout(900)
// 읽기: 전환기 aria-label · 고른 탭 · [data-wb-comment-pointed] · [data-wb-selected-id], [data-wb-member-id] · iframe 의 [data-wb-id] 수 · location.search
```

p5(M-1 첫 줄): 위 첫째 · 편집 · «코멘트» 탭 → `n_in2` 작성자 줄 → (0 또는 700ms) → 구조 트리 줄 `n_in1` → 900ms → 읽기 → `Delete` → 800ms → 서버 `n_tabs` 패널 자식.

p4: 뿌리 자식 `n_t0` … `n_t69`(Text «줄 i 글») · 코멘트 `n_t0` · `n_t35` · `n_t62` · `n_t69`. 칸(`.wb-shell-canvas`)에 `Object.defineProperty(pane, 'scrollTop' | 'scrollLeft', …)`
로 `Element.prototype` 서술자를 감싸 쓰기마다 바뀐 양을 모은다. S2 의 휠은 칸 가운데에서 `page.mouse.wheel(0, 900)` — 누름 60ms 뒤.

## 게이트

브리프대로 전량 게이트는 안 돌렸다 — 탐침 파일 하나씩만이다. 소스를 안 고쳐 이 커밋은 보고 하나다.

| 실행 | 판 | 케이스(통과 / 실행 · 건너뜀 0) |
|---|---|---|
| p1-pick | 지금 · 전 | 23 / 23 · 23 / 23 |
| p1b-pick | 지금 | 3 / 3 |
| p2-reveal | 지금 | 2 / 2 |
| p3-keys | 지금 · 전 | 3 / 3 · 3 / 3 |
| p4-scroll | 지금 · 전 | 4 / 4 · 4 / 4 |
| p5-hidden-selected | 지금 | 2 / 2 |

탐침은 값을 적기만 하고 단언하지 않는다 — «통과» 는 판이 끝까지 섰다는 뜻이다(판마다 `PROBE` 줄 하나 · 빠진 줄 0). node `v24.21.0`(`mise env`). 12:23 – 12:33 ·
load 2.5 – 9.7(코어 15). `pmset -g log` 의 마지막 ` Sleep ` 은 11-13 19:29 — 실행 동안 잠듦 없음. 끝에 `git status --short` 는 `?? .build/` 하나.

## 남은 것

1. **M-1 · M-2(중간 — 고칠 트랙)** — 미룬 고름이 클릭 때의 진짜 선택 · 화면 상태 · 페이지를 적어 두고 설 때 다르면 버리게, 캔버스 누름 · 사람의 휠이 미룬 고름을
   걷게. 그 트랙은 위 «결함» 표의 판을 `apps/web/build-test/comment-focus.test.ts` 로 잠근다(p5 의 Delete 판 · 전환기 판 · 페이지 옮김 판 · 휠 판).
2. **L-1** — 간격 안 탭 옮김 · 캔버스 누름으로 고름이 사라지는 것을 맞는 값으로 둘지(M-1 과 같은 규칙으로) 정한다.
3. **L-3(이월 · 원래 있던 길)** — 펼침 판정이 상호작용 겹layer 의 `Tabs.active` · `setVisible` 을 안 본다.
4. **못 잰 것** — 팝업이 선 판의 펼침, 넣은 뒤 저절로 고름과 링 굴림의 겨룸(코드로만), 운영 번들(`EDITOR_STACK_BUNDLE=build`), Firefox · Safari, 남의 편집이 다시 잴 때
   밀어낸 링(대응 보고 «못 잰 것» 그대로).

## 지침

- **무엇이 빠졌나:** 동작을 시간으로 미루는 장치(더블클릭 간격 · 디바운스)를 세우는 브리프 · 리뷰가 «간격 안에 다른 몸짓이 오는 판» 을 세지 않았다. 미룬 일은
  «클릭한 렌더» 가 아니라 «설 때의 렌더» 로 판정되면(최신 콜백을 ref 로 싣는 꼴) 그 사이의 페이지 옮김 · 다른 고름 · 상태 고름 · 휠이 판정의 입력이 되고, 다른 장치의
  걷는 규칙(«선택이 바뀌면 걷는다» 처럼 값으로 견주는 것)이 미룬 일이 설 때의 값을 새 기준으로 받아 빠진다. 또 본문을 `key` 로 다시 세우지 않는 패널의 타이머는
  페이지를 옮겨도 산다.
- **어느 문서 어느 절:** `.ruler/30-delegation.md`(생성물 `AGENTS.md`) 「워커에게 맡길 때 — wirebound」 의 «답을 기다리며 미뤄 두는 장치에는 한도를 둔다» 문장 뒤.
- **넣을 문장:** «**사람의 몸짓을 시간으로 미루는 장치(더블클릭 간격 · 디바운스)는 간격 안에 다른 몸짓이 오는 판을 입구마다 센다** — 페이지 옮김 · 다른 고름 ·
  같은 값을 바꾸는 다른 입구 · 캔버스 누름 · 굴림. 미룬 일이 설 때의 렌더로 판정하면(최신 콜백을 ref 로 싣는 꼴) 그 사이의 몸짓이 판정의 입력이 되고, 값으로
  견주는 다른 장치의 걷기도 설 때의 값을 기준으로 받아 빠진다. 클릭 때의 값(페이지 · 선택 · 상태)을 적어 두고 설 때 다르면 버린다. 페이지마다 다시 서지 않는
  패널의 타이머는 페이지를 옮겨도 산다(`docs/superpowers/plans/2026-11-14-rv2-cf-report.md` M-1 · M-2).»
