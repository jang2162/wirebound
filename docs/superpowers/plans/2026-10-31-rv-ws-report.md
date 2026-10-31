# RV-WS(뼈대 트랙 리뷰) 보고

브랜치 `feat/workspace-shell`, 머리 `d010c323`(기준 `20b398e2`). 브리프 `brief-rv-ws.md` · 계획 `docs/superpowers/plans/2026-10-31-workspace-admin.md`
«트랙 S» · «웹 계약» · «리뷰 초점» 5 · 구현 보고 `docs/superpowers/plans/2026-10-31-ws-report.md`. **리뷰다 — 소스를 고치지 않았다.** 새 파일은 케이스와
이 보고뿐이다. Node v24.21.0(`mise env`).

무게: **높음**(인가 우회 · 남의 데이터 · 잃음) · **중간** · **낮음**. 값은 **jsdom** · **Chrome**(실브라우저 `editor-stack`) · **api**(Fastify `inject`)로
갈라 적는다.

## 발견 한눈에

| 키 | 무게 | 무엇 | 이 트랙이 연 길? | 케이스(skip 을 떼면 빨강) |
| --- | --- | --- | --- | --- |
| R-6a | **높음(잃음)** | 에디터에서 보낸 편집이 닿기 전에 목록에서 사이드바 «로그아웃» → 편집이 말없이 사라짐 | 아니다 — 기준 `page-head.tsx` 부터 같은 길(이월) | `build-test/rv-ws-workspace.test.ts` |
| R-5a | **중간** | 검색 칸(값이 `?q=`)에 한글 조합이 쌓임 · 빠른 영문이 글자를 잃음 — `BrowserRouter` 의 전이 | **그렇다**(S3 의 검색 칸) | 같은 파일 |
| R-2a | 낮음 | 넓힌 `.role` 예외가 이름으로 걸러 같은 이름의 판정이 가드를 지남 | 그렇다(S3) | `test/rv-ws-role-guard.test.ts`(초록 — 대신 잡는 자) |
| R-3a | 낮음 | 다른 탭에서 같은 사람이 다시 로그인한 소식이 강등을 못 나름 — 관리자 묶음이 남음 | 넓혔다(한 칸 → 다섯) | `test/rv-ws-admin.test.tsx` |
| R-4a | 낮음 | «준비 중» 관리자 칸 사이를 옮기면 «메뉴» 가 펴진 채 | 그렇다(S2) — M 트랙이 저절로 푼다 | `build-test/rv-ws-workspace.test.ts` |
| R-4b | 낮음 | 창 320 의 설정 탭 줄에서 End 로 고른 탭이 줄 안에 다 안 보임 | 그렇다(S4 가로 탭) | 같은 파일 |
| R-6b | 낮음 | 전환 통지가 «머리의 사람» 을 가리키는데 이름은 사이드바 바닥 · 좁은 창에서 안 보임 | 그렇다(S2 가 머리 `…` 를 걷음) | 같은 파일 |

인가 우회 · 남의 데이터는 나오지 않았다(목록 응답 «1» · 관리자 주소 «3»). **병합을 막을 것은 R-5a 하나로 본다** — 사람이 이 화면에서 가장 먼저 밟는 칸이다.
R-6a 는 높음이지만 원래 있던 길이라 이월로 적는다.

## 1. 목록 응답이 남의 것을 새지 않는가 — 발견 없음

케이스 `apps/api/test/rv-ws-project-list.test.ts`(api · 4 · 초록 · skip 없음).

- 멤버 넷 · 프로젝트 넷(멤버 수 1 · 3 · 4 · 2) · 사람마다 역할이 갈리는 판: 사람마다 자기가 멤버인 프로젝트만, 수는 그 프로젝트의 멤버 행 수, 역할은 자기 것.
- 남의 프로젝트의 페이지 `updated_at` 을 2099 년으로 올려도 내 목록은 바이트째 그대로(`toEqual(before)`).
- 질의 수(`pg.Client.prototype.query` 호출 수 · 인증 질의 포함): **프로젝트 1 개 3 · 30 개 3** — 같다.
- 페이지 300 개 프로젝트를 든 목록(롤백 하네스 · load 20): **4.0 · 4.1 · 4.2 · 4.4 · 6.9 ms**(다섯 번).

| 변조(`apps/api/src/repos/projects.ts`) | 실행 · 실패 | 죽은 케이스 · 실패 값 |
| --- | --- | --- |
| A5 멤버 수 하위 질의에 `and m.role <> 'editor'` | 4 · 1 | «멤버 여럿 · 프로젝트 여럿 …» — 배열 `toEqual` |
| A1 멤버 수 하위 질의가 프로젝트를 안 가림(`m.project_id is not null`) | 4 · 2 | 위 케이스 + «1 개 · 30 개 …»의 카나리아(`memberCount === 2` 거짓) |
| A2 `max(pages.updated_at)` 이 프로젝트를 안 가림 | 4 · 1 | «남의 프로젝트에서 일어난 편집은 …» — `toEqual(before)` |
| A3 멤버 수를 행마다 따로 조회(N+1) | 4 · 1 | «1 개 · 30 개 …» — `expected 33 to be 4` |
| A4 최근 수정 하위 질의에 페이지마다 `pg_sleep(0.002)` | 4 · 1 | «페이지 300 개 …» — `expected 762.3 to be less than 200` |

본 것: 응답 칸의 출처(멤버 행 조인 · 상관 하위 질의 둘). 안 본 것: 프로젝트 수천 · 사람 수천 규모(인덱스 계획은 `EXPLAIN` 으로 안 봤다), 실커밋 하네스에서의 시간.

## 2. `.role` 가드를 넓힌 자리 — 낮음 하나(가드의 구분력)

무엇을 열지는 그대로 `projectAbilities` 하나다 — 설정 절 넷(`general` · `members` · `theme` · `danger`)은 이 트랙이 안 고쳤고(`git diff --stat 20b398e2`
에 없음) 카드의 «설정» 은 역할과 무관하게 모두에게 선다. 넓힌 이름은 지금 표지 · 거름에만 쓰인다(코드 줄 넷).

**R-2a 낮음 — 넓힌 예외가 이름으로 걸러, 같은 이름으로 쓴 판정이 가드를 지난다.** `apps/web/test/role-access.test.ts` 의 `listFilterRow` 는 두 파일에서
`item.role` · `q.role` · `DEFAULT_QUERY.role` · `query.role` 을 지운 뒤 `.role` 이 남는지 본다. 변조로 잰 값(가드 파일 하나, 실행 4):

| 변조 | 가드(`role-access.test.ts`) | 이 리뷰의 케이스 |
| --- | --- | --- |
| R1 `project-filter.ts` 에 `canOpenSettings(item) { return item.role === 'owner' }` | **산다**(실패 0) | 죽는다 — «네 줄뿐이다» 5 ≠ 4 |
| R4 `project-list.tsx` 에 `const query = project; if (query.role === 'viewer') …` | **산다**(실패 0) | 죽는다 — 같은 케이스 5 ≠ 4 |
| R2 `project-list.tsx` 에 `project.role === 'owner'` | 죽는다(1) | — |
| R3 `project-list.tsx` 에 `const { role } = project` | **산다**(실패 0) | 죽는다 — «구조 분해 · 대괄호 …» 2 ≠ 1 |

R3 은 이 트랙의 몫이 아니다 — 가드의 정규식 `\.\s*role\b` 가 구조 분해 · 대괄호를 못 보는 것은 기준 `20b398e2` 부터다. 다만 넓힌 두 파일이 그 꼴로 판정을
들여와도 초록이라 함께 적는다. (R3 첫 판은 load 25 에서 가드 케이스가 5s 한도로 죽어 `STACK_TRACE_ERROR` 였다 — 구분력이 아니다. `--testTimeout=60000`
으로 다시 돌려 산 것을 봤다.)

- 케이스 `apps/web/test/rv-ws-role-guard.test.ts`(jsdom 프로젝트 · 2 · 초록 · skip 없음): 두 파일의 `.role` 읽기를 **줄 글자째** 못박고, 구조 분해 ·
  대괄호 역할 읽기가 `api/http-client.ts` 의 꼴 검사 하나뿐임을 센다.
- **고칠 방향**: `listFilterRow` 를 이름 대신 줄 글자 목록(지금 넷)으로 못박고, 가드의 정규식에 구조 분해 · 대괄호 꼴을 더한다(이 케이스 둘을
  `role-access.test.ts` 로 옮긴다). **그대로 짜면 죽는 것**: 두 파일의 줄 모양을 바꾸는 손질(포매터가 줄을 접는 판 포함)마다 가드가 죽는다 — 의도한 값이다.
  구조 분해 꼴을 더하면 `http-client.ts` 의 `value['role']` 이 걸리므로 그 줄을 예외로 적어야 한다.

## 3. 관리자 칸 — 낮음 하나(다른 탭 소식이 강등을 못 나른다)

케이스 `apps/web/test/rv-ws-admin.test.tsx`(jsdom · 7 · 초록 6 · skip 1).

- **직접 친 주소 다섯(초록)**: 관리자 아님 + `/admin/{users,invites,projects,themes,audit}` — 관리자 묶음 0 · `role="alert"` «인스턴스 관리자만 볼 수
  있습니다» · 테마 조회 0 회. 모르는 칸(`/admin/xyz`)이 목록으로 가는 것은 구현의 `workspace-layout.test.tsx` 가 이미 잰다.
- **열린 탭에서 강등(초록 — 지금 동작을 적는다)**: 세션 사용자는 관리자, 서버는 403. 사이드바는 관리자 묶음을 **그대로 둔다**(판정 값이 세션 사용자의
  `isInstanceAdmin` 이고 그 값은 마운트의 `/me` · 이 탭의 로그인 · 다른 탭의 «다른 사람» 소식에서만 바뀐다). «테마» 를 누른 화면은 서버의 403 문장을
  `alert` 로 말하고 «테마 목록» 을 안 그린다 — 데이터는 안 샌다. 목록 조회의 403 은 «관리자만»(`ADMIN_ONLY`)이 아니라 서버 문장으로 선다 — `forbidden`
  갈래는 동작(업로드 · 숨김 · 템플릿)의 403 에만 걸려 있다(`routes/admin-themes.tsx` 의 `load`). 문장이 갈리는 것은 낮음 이하라 발견으로 세지 않았다.
- **R-3a 낮음(skip 1) — 다른 탭에서 같은 사람이 다시 로그인한 소식이 강등된 값을 실어 와도 이 탭의 관리자 묶음이 남는다.** `session/session-context.tsx`
  의 `heard` 는 같은 사람이면 `renewal` 만 올리고 소식의 `user`(새 `isInstanceAdmin` · `name`)를 버린다. skip 을 뗀 실패 값:
  `AssertionError: expected <nav …(2)><p …(2)></p> to be null`(관리자 묶음 `nav` 가 남음). 무게: 표시만 낡는다 — 권한은 서버가 가른다(위 판). 이
  트랙 전에도 같은 값으로 옛 머리 `…` 의 «테마 관리» 한 칸이 남았다 — 이 트랙이 그 칸을 다섯으로 넓혔다. 관리자 지정 · 해제가 화면에 생기는 A · M
  트랙 뒤에는 밟힐 판이 는다.
  - **고칠 방향**: `heard` 의 같은 사람 줄을 `{ ...current, user: news.user, renewal: current.renewal + 1 }` 로. **그대로 짜면 죽을 것**: 사용자 객체의
    참조가 소식마다 바뀌어 `useSessionUser()` 를 이펙트 의존에 둔 자리가 다시 돈다(`git grep -n 'useSessionUser()' apps/web/src` 로 의존을 센다). 같은 사람
    소식은 «쓰기는 끊지 않는다» 성질(`renewal`)이라 세대는 그대로 둔다.

| 변조 | 실행 · 실패 | 죽은 케이스 · 실패 값 |
| --- | --- | --- |
| M3a 사이드바 `admin` 을 늘 참(`… === true \|\| true`) | 6 · 5 | «직접 친다» 다섯 — `expected <nav …> to be null` |
| M3b 테마 관리가 관리자 아님에도 조회(`if (!admin) return` 뗌) | 6 · 1 | «/admin/themes — …» — `expected 1 to be +0` |
| M3c 테마 목록 조회 실패를 빈 목록으로 접음 | 6 · 1 | «열린 탭에서 강등된 뒤 …» — `Unable to find role="alert"` |

안 본 것: 실브라우저(이 항목은 jsdom 값뿐이다), `/me` 를 다시 부르는 길(창 초점 · 주기)이 없다는 것은 코드에서 읽었다(`session-context.tsx` 의 `api.me()`
는 마운트 한 자리).

## 실브라우저 케이스 — `apps/web/build-test/rv-ws-workspace.test.ts`

스택 하나(`editor-stack`)로 초록 8 · skip 5. 아래 «4» – «7» 의 Chrome 값은 이 파일의 로그다(load 64 – 89 · dev 번들). skip 다섯을 뗀 판: 실행 13 ·
실패 5(skip 다섯 그대로 — 아래 각 항목에 실패 값).

## 4. 좁은 창의 «메뉴» · 문턱 · 줌 — 낮음 둘

**Chrome 값(초록):**

- 창 390, 키보드만: 로고 → «메뉴» 다음 Tab 은 접힌 칸으로 안 가고 내용 칸의 «새 프로젝트» 로 간다. Enter 로 펴면 Tab 아홉이 «프로젝트 · 계정 · 사용자 · 초대 링크 ·
  프로젝트 · 테마 · 기록 · 로그아웃 · 새 프로젝트» 차례다. Space 로 접힌다. **Escape 는 안 접는다**(aria-expanded 그대로 `true` — 흐름 안 펴기라 구현 «결정»
  대로다. 발견으로 세지 않았다). 목록 → «계정»(다른 컴포넌트)으로 가면 접힌다.
- 문턱 넘침: 창 **719(접힘 · 펼침) · 720 · 721 · 900 · 960 · 1000** × 화면 여섯(목록 · 계정 · 설정 일반 · 테마 · 멤버 · 테마 관리) — 문서 0 · 뼈대 상자 0 ·
  창 밖 글자 노드 0(센 글자 노드 17 – 67). 카드 격자 표본에 띄어쓰지 않은 긴 이름 · 긴 주소 설명을 넣었다. 720 부터 사이드바 폭 > 150, 719 는 위 줄.
- 브라우저 확대(영속 컨텍스트의 `default_zoom_level` · 창 1280×800): **125% dpr 1.25 · CSS 폭 1024 · 150% dpr 1.5 · 853**. 화면 넷(목록 · 계정 · 설정 테마 ·
  테마 관리) 모두 사이드바 칸 9 개 전부 닿음 · 넘침 0/0/0.

**R-4a 낮음(skip) — 관리자 칸의 «준비 중» 넷 사이를 옮기면 «메뉴» 가 펴진 채 남는다.** `/admin/:section` 하나가 넷을 받아(`AdminPendingRoute`) 칸을 옮겨도
뼈대가 새로 서지 않는다 — `workspace-layout.tsx` 머리말 «화면을 옮기면 화면마다 이 뼈대가 새로 서므로 목록은 다시 접힌다» 가 이 넷에서 거짓이다. skip 을 뗀
실패 값: `expected 'true' to be 'false'`(390 · 사용자 → 초대 링크). **M 트랙이 칸마다 정적 라우트를 달면 저절로 풀린다**(컴포넌트가 갈린다).
- **고칠 방향**: 지금 고친다면 `WorkspaceLayout` 이 `useLocation().pathname` 이 바뀔 때 `open` 을 거둔다. **그대로 짜면 죽을 것**: 목록의 `?q=` 처럼 질의만
  바뀌는 판까지 접으려면 `pathname` 만 봐야 한다(`location.key` 로 보면 검색 칸에 칠 때마다 접힌다 — `replace` 도 새 key 다).

**R-4b 낮음(skip) — 창 320 에서 설정 탭 줄이 35px 넘쳐 구르는데, End 로 고른 «위험 구역» 탭이 줄 안에 다 안 보인다**(`scrollLeft` 0 · 포커스는 그 탭).
`choose(…, true)` 의 `focus()` 가 반쯤 보이는 탭을 굴리지 않는다. skip 을 뗀 실패 값: `expected false to be true`(`inRow`). 390 에서는 탭 넷이 들어가 판이
안 선다. 문서 · 뼈대 넘침은 0 이고 탭 줄 밖 글자 노드도 창 안이다(초록 케이스).
- **고칠 방향**: `choose` 에서 `focus()` 뒤 `scrollIntoView({ block: 'nearest', inline: 'nearest' })`. **그대로 짜면 죽을 것**: jsdom 에는
  `scrollIntoView` 가 없어 `settings-tabs.test.tsx` 의 키 케이스가 `TypeError` 로 죽는다 — 있는지 보고 부르거나 `test/setup.ts` 에 빈 함수를 둔다.

## 5. 주소 질의 · 한글 조합 — 중간 하나

**Chrome 값(초록):** `?q=&role=&sort=` → 칸 빈 글 · 역할 `all` · 정렬 `updated` · 카드 4. `?role=admin&sort=zzz` → `all` · `updated` · 카드 4.
`?q=<script>alert(1)</script>` → 칸에 글자 그대로 · 대화 상자 0 · «검색 결과가 없습니다»(빈 목록 문장 없음). `?q=%` → 칸 `%`. `?q=%E0%A4%A`(깨진 UTF-8) → 칸
`�%A`, 페이지 오류 0. 1000 자 → 칸 1000 자 · 넘침 0. 넷 다 «프로젝트 4개 중 0개» + «검색 결과가 없습니다» — 빈 목록의 «참여 중인 프로젝트가 없습니다» 와 갈린다.
뒤로 가기: «포털» · 정렬 «이름» 으로 거른 채 카드로 에디터에 갔다가 `goBack` → 주소 · 칸 · 정렬 · 카드 1 이 그대로.
3000 자(27KB 주소)는 vite dev 가 `ERR_HTTP_RESPONSE_CODE_FAILURE`(431)로 거절했다 — 앱이 아니라 서버의 머리 한도다(운영 앞단은 안 쟀다).

**R-5a 중간(skip) — 검색 칸에 한글을 조합해 치면 조합 걸음이 전부 칸에 쌓인다.** «고객»(ㄱ → 고 → 곡 → 고 확정 → ㄱ → 개 → 객 → 객 확정)을 CDP
`Input.imeSetComposition` · `Input.insertText` 로 친 칸 값:

| 칸 | 걸음마다 값 | 끝 값 · 주소 |
| --- | --- | --- |
| 맨 `<input>`(대조군 — 하네스) | ㄱ · 고 · 곡 · 고 · 고ㄱ · 고개 · 고객 · 고객 | 고객 |
| «새 프로젝트» 폼 «이름»(컴포넌트 상태가 값을 든다) | 같음 | 고객 |
| **검색 칸(값이 `?q=` 에서 온다)** | ㄱ · ㄱ고 · ㄱ고곡 · ㄱ고곡고 · … | **ㄱ고곡고ㄱ개객객 · q 도 같은 글** |

영문을 한 글자씩: 사이 0ms → `et`(load 78 · 첫 판 load 64 에서는 `t`), 150ms → `report`. 원인: `main.tsx` 의 `<BrowserRouter>` 가 기본으로 위치 갱신을
`React.startTransition` 안에서 한다(`react-router` 7.18.2 `BrowserRouter` 의 `setState` — `useTransitions === false` 일 때만 곧바로). 검색 칸은
`value={query.text}` 로 주소에 매여 있어, 입력 이벤트 뒤 React 가 칸을 아직 안 바뀐 주소 값으로 되돌린다 — 조합 중에 값을 덮으면 조합이 그 자리에서 끝난다.
조합은 부하와 무관하게 깨지고(기전), 영문은 전이가 다음 키보다 늦을 때 글자를 잃는다. jsdom 케이스(`fireEvent.change` 한 번)는 이 판을 못 낸다.
skip 을 뗀 실패 값: `expected { value: 'ㄱ고고ㄱ개객객', q: 'ㄱ고고ㄱ개객객' } to deeply equal { value: '고객', q: '고객' }`.
- **고칠 방향**: 검색 글은 `useState` 로 들고(첫 값은 주소에서) 바뀔 때 주소에 `replace` 로 싣는다 — 주소가 칸 밖에서 바뀌면(뒤로 가기) 그 값을 칸에 다시
  넣는다. **그대로 짜면 죽을 것**: `routes/project-list.test.tsx` «검색어 · 역할 · 정렬은 주소 질의에 …» 의 «그 주소로 열면 그대로 선다» 는 첫 값만 보면
  산다. 뒤로 가기 판(위 초록 케이스)이 «주소가 칸 밖에서 바뀌면 다시 넣는다» 를 잰다. `<BrowserRouter useTransitions={false}>` 로 앱 전체를 바꾸는 길은
  에디터의 페이지 전환까지 동기로 바꿔 범위가 넓다 — 고르지 않는다.

## 6. 사이드바로 옮긴 세션 동작 — 높음 하나(원래 있던 길 · 이월) · 낮음 하나

**jsdom**: 구현의 `test/shell/workspace-layout.test.tsx` «로그아웃이 실패하면 서버 문장을 내용 칸 머리 아래에 …»(화면 넷)가 실패 줄의 자리를 잰다. 걷힌
`PageHead` 의 자리(머리 아래 형제 · `.wb-shell-project-alert`)와 같은 자리 · 같은 클래스다 — 통지는 잃지 않았다.

**Chrome 값(초록):**

- 창 390, 계정 설정에서 «메뉴» → «로그아웃», 요청을 끊음(`route.abort` 1 회): 내용 칸의 `alert` «서버에 연결하지 못했습니다» 가 창 안(top 458 / 844).
- 같은 컨텍스트의 다른 탭에서 사이드바 «로그아웃» → 이 탭도 `/login` → 다른 탭에서 bob 로그인 → 이 탭이 `/` 로 가고 사이드바 이름이 «밥».

**R-6a 높음(잃음) — 원래 있던 길, 이월 — 에디터에서 보낸 편집이 서버에 닿기 전에 목록으로 나와 사이드바 «로그아웃» 을 누르면 그 편집이 말없이 사라진다.**
판: 페이지 행을 `holdRow` 로 쥐고 칸에 «붙잡힌 채 목록으로» 를 친 뒤 blur(편집이 WS 로 나가 줄에 섬) → 로고로 `/` → 사이드바 «로그아웃» → 로그인 화면 →
쥔 행을 놓음. 값: 차례 **`WS→ patch · POST logout`(ack 없음)** · 서버 `headSeq` 1 · 내용 `["1쪽 원문"]` · 로그인 화면 줄 **빈 글**. 에디터 `…` 의 로그아웃은
같은 판에서 답을 기다린 뒤 나가거나 한도 뒤 «답을 받지 못해 …» 한 줄을 남긴다(`build-test/editor-logout-edits.test.ts`). 에디터 밖 화면의 로그아웃은
`settle` 없이 곧바로 나간다. **이 트랙의 몫이 아니다** — 기준 `20b398e2` 의 `shell/page-head.tsx:28` 도 `useLogout()`(settle 없음)이고 `useLogout` ·
`panels/write-ledger.tsx` 는 이 트랙이 안 고쳤다(코드로 같은 길 · 기준 사본에서 Chrome 으로는 안 쟀다). 다만 이제 «로그아웃» 이 늘 보이는 사이드바 칸이라
누르기가 쉬워졌다. skip 을 뗀 실패 값: `expected false to be true`(«저장되거나 · 말한다» 둘 다 거짓).
- **고칠 방향**: 에디터 셸이 내려갈 때 답을 못 받은 편집(`EditorStore` 의 보낸 편집)을 세션 범위 자리(라우트 표 밖 — `WriteLedgerProvider` 와 같은 층)에
  넘기고, 뼈대의 `useLogout` 이 그 자리를 `settle` 로 기다린다(한도 3s · 남으면 `logoutLossNotice` 와 같은 한 줄). **그대로 짜면 죽을 것**: 셸이 내려간 뒤
  편집의 답(ack)을 받을 연결이 없다 — WS 가 셸과 함께 닫히면 기다릴 것이 «답» 이 아니라 «모름» 이 된다. 그래서 한 줄은 «반영됐는지 알 수 없습니다» 꼴이어야
  한다. `workspace-layout.test.tsx` «로그아웃은 한 번 부르고 …» 는 기다릴 것이 없으면 곧바로 나가야 산다.

**R-6b 낮음(skip) — 전환 통지의 문장이 «머리의 사람» 을 가리키는데 이름은 사이드바 바닥에 있고, 좁은 창에서는 접힌 목록 안이라 안 보인다.**
`SWITCHED_NOTICE = '다른 사람으로 로그인됐습니다 — 이 탭은 이제 머리의 사람의 화면입니다'`(`session/session-menu.tsx:52`)는 옛 머리 `…` 의 메뉴 머리 이름을
가리키던 글이다. skip 을 뗀 실패 값(창 390): `expected false to be true`(bob 의 이름 `isVisible`).
- **고칠 방향**: 통지에 이름을 싣는다(«… 이 탭은 이제 <이름>의 화면입니다»). **그대로 짜면 죽을 것**: 상수를 문장으로 견주는 케이스 — `git grep -l -F
  'SWITCHED_NOTICE' apps/web` 로 센다(상수를 가져오는 곳은 함수로 바뀌면 타입 오류로 잡힌다). 이 리뷰의 build-test 는 글자를 그대로 적었다.

## 7. 설정 가로 탭 — 낮음 하나(위 R-4b) · 원래 있던 낮음 하나

**jsdom**: 구현의 `test/routes/settings-tabs.test.tsx`(8 — ← → · ↑ ↓ · Home · End · 로빙 `tabIndex` · 다른 키 · 초안 남음 · viewer 의 «테마»)가 그대로 초록.
**Chrome 값(초록)**: 창 1280, `?section=bogus` → «일반». → → End Home ← 의 고른 탭 · 주소가 «테마 theme · 멤버 members · 위험 구역 danger · 일반 general ·
위험 구역 danger»(← 는 처음에서 끝으로 돈다). bob(viewer) `?section=danger` → 탭 «일반 · 테마 · 멤버», «일반» 이 고름. 창 320: 탭 줄 35px 넘쳐 안에서 구름 ·
문서 · 뼈대 넘침 0 · 탭 줄 밖 글자 노드 창 안. 줄 안의 고른 탭은 R-4b.

**원래 있던 낮음(이월 — 이 트랙의 몫 아님)**: 붐빌 때(load 40) 키를 빨리 누르면 걸음을 잃는다. 첫 판에서 키 사이 기다림 없이 → → End Home ← 를 누른 값:
«일반 theme · 일반 theme · 일반 danger · 테마 general · 테마 general»(고른 탭 · 주소). 고른 탭이 주소(`?section=`)에서 오고 주소 갱신이 전이(R-5a 의
`startTransition`)라, 둘째 → 가 아직 «일반» 인 `selected` 로 셈해 «테마» 를 다시 골랐다. 탭 키 규칙은 기준에서 같다(S4 는 방향만 바꿨다). 케이스는 걸음마다
값이 설 때까지 기다리게 짰다(이 판을 잠그지 않는다).

### 실브라우저 케이스의 혼자 죽는 변조

파일 전체(초록 8)를 변조마다 한 번 돌렸다(백업은 경로 전체 이름 · 바이트 비교 복원 «같음» 여덟 판 모두). load 51 – 144.

| 변조 | 자리 | 실행 · 실패 | 죽은 케이스 · 실패 값 |
| --- | --- | --- | --- |
| B1 접힌 칸 목록을 `display: none` 대신 `height: 0; overflow: hidden` | `shell.css` 좁은 창 블록 | 8 · 1 | «창 390 — 접힌 칸은 Tab 차례에서 빠지고 …» — 접힌 채 Tab 이 칸 목록 안 `expected true to be false` |
| B3 `@media (720px – 721px)` 에 카드 격자 `min-width: 700px` | `shell.css` | 8 · 1 | «창 719 · 720 · …» — `[['프로젝트 목록@720', …], …]` ≠ `[]` |
| B4 `@media (840px – 860px)` 에 내용 칸 `min-width: 900px` | `shell.css` | 8 · 1 | «브라우저 확대 …» — 150% 의 넘침 판 |
| B5 `queryOf` 가 모르는 역할을 그대로 | `projects/project-filter.ts` | 8 · 1 | «주소 질의 …» — `['', 'all', 'updated', 0]` ≠ `[…, 4]`(빈 `role=` 이 거름이 됨) |
| B6 «이름» 칸의 `setName` 을 `startTransition` 으로 감쌈 | `projects/project-form.tsx` | 8 · 1 | «한글 조합 — 대조군 …» — `expected 'ㄱ고곡고ㄱ개객객' to be '고객'`(R-5a 의 기전을 상태 입력에서 그대로 재현) |
| B7 세션 통지를 화면 몸 **뒤**로 | `shell/workspace-layout.tsx` | 8 · 1 | «세션 통지 …» — `{ said: true, inView: false }` |
| B8 `useLogout` 이 `api.logout()` 대신 아무것도 안 보냄 | `session/session-menu.tsx` | 8 · 2 | «에디터에서 보낸 편집이 … 목록으로 나와 …» — `expected ['WS→ patch'] to include 'POST logout'`(값). «세션 통지» 도 죽었으나 `locator.waitFor` 시간 초과라 구분력이 아니다 |
| B9b 설정 탭에서 «위험 구역» 을 누구에게나 | `routes/settings.tsx` | 1 · 1(`-t '설정 가로 탭'`) | «설정 가로 탭 …» — viewer 탭 `{ tabs: [… '위험 구역'] }` ≠ `['일반', '테마', '멤버']` |

B9(← 의 돌기를 뗌)는 `expect.poll` 시간 초과(«Matcher did not succeed in time»)로 죽어 구분력에서 뺐다. 첫 B9b 판도 viewer 판을 «일반» 판으로 기다려
시간 초과였다 — 케이스가 탭 목록을 기다리게 고친 뒤 값으로 죽었다. «목록에서 로그아웃» 케이스는 판 카나리아(편집 · 로그아웃 요청이 나갔다)만 단언하는
측정 판이다 — 성질은 skip «목록 화면에서 로그아웃해도 …» 가 갖는다.

### jsdom · api 케이스의 혼자 죽는 변조

위 «1» · «2» · «3» 의 표.

## 8. 흔들림 하나 — 이 트랙의 몫으로 못 가름(증거 없음)

`apps/web/test/settings/members-section.test.tsx` «owner 가 둘일 때 나를 빼면 …» 를 기준 사본(`20b398e2` 를 스크래치에 `git archive` · `node_modules` 는 워크트리
것을 심링크 · `mise trust`)과 이 브랜치에서 **번갈아 열 번씩**(`-t` 로 그 케이스 하나, web 프로젝트) 돌렸다. 다른 일을 띄우지 않았다(앞의 변조 줄이 끝난 뒤).

| 판 | 통과 · 실패 | 케이스 시간(ms, 열 판) | load(1분) |
| --- | --- | --- | --- |
| 기준 `20b398e2` | 10 · 0 | 413 · 524 · 461 · 519 · 2086 · 615 · 1641 · 942 · 609 · 1116 | 37 – 43 |
| 이 브랜치 | 10 · 0 | 478 · 609 · 365 · 487 · 2046 · 631 · 742 · 1139 · 631 · 558 | 37 – 43 |

두 판의 시간 분포가 같다(가운데값 ~0.61s · ~0.62s · 둘 다 다섯째 판이 ~2s). 이 케이스는 `App` 을 설정 화면째 그려(`renderWithProviders(<App />)`) 뼈대가
들지만 무게 차가 안 보인다. **load 30 넘는 판에서 기준 사본도 한 번 죽은 판이 있다** — 첫 고리에서 사본의 `mise.toml` 이 신뢰 전이라 런타임을 증명 못 한 판이라
버렸다(실패 값은 남기지 않았다). 남은 원인 가설: `findByText` 기본 1s 가 붐빌 때 모자란다 — 이 리뷰의 몫이 아니라 이월(고칠 방향: 그 케이스의 기다림에
`{ timeout }` 을 준다. 그대로 짜면 죽을 것은 없다).

## 게이트

리뷰라 전량을 돌리지 않았다(브리프). Node v24.21.0(`mise env` · 변조 줄 · 흔들림 고리의 상태 파일 첫 줄에 적음).

| 단계 | 결과 |
| --- | --- |
| 새 jsdom · api 케이스 + 기대는 파일(`role-access` · `settings-tabs` · `shell/workspace-layout` · `project-list-fields`) | 7 파일 · 통과 68 · 건너뜀 1(R-3a skip) · load 34 |
| 새 실브라우저 케이스 `rv-ws-workspace.test.ts` | 통과 8 · 건너뜀 5(skip) · load 32 |
| skip 을 뗀 판(실브라우저 · jsdom) | 실브라우저 13 · 실패 5 · jsdom 7 · 실패 1 — 실패는 skip 그 판들뿐 |
| `pnpm typecheck` | 0 |
| `pnpm lint` | 0(경고는 이 리뷰 파일에 0) |
| `oxfmt`(새 파일 넷) | 적용 |
| 숨은 글자(U+2028 · 방향 제어 · 폭 없는 글자 · 서로게이트) | 새 파일 다섯 모두 0 |
| 잠듦 | `pmset -g log` 의 마지막 Sleep 20:28 — 이 리뷰의 실행(00:21 – 01:08)보다 앞 |

load 가 내내 높았다(20 – 144 — 다른 워크트리의 일). 그 때문에 둘을 버렸다: `role-access` 가드 케이스가 5s 한도로 죽은 판(«2»)과 설정 탭 첫 판의 걸음
잃음(«7» — 원래 있던 성질이라 케이스가 걸음마다 기다리게 고쳤다).

## 무엇을 봤고 안 봤나

- 봤다: 브리프의 여덟 항목 모두. 목록 응답의 칸 출처 · 질의 수 · 시간(api), `.role` 가드의 구분력(변조), 관리자 주소 다섯 · 강등 · 다른 탭 소식(jsdom),
  좁은 창 키보드 · 문턱 여섯 폭 · 줌 둘(Chrome), 주소 질의 여섯 꼴 · 뒤로 가기 · 한글 조합(Chrome), 세션 통지 둘 · 목록에서 로그아웃(Chrome), 설정 탭(Chrome +
  구현의 jsdom), 흔들림(기준 대 브랜치).
- 안 봤다: 운영 번들(`EDITOR_STACK_BUNDLE=build`) — 전부 dev 번들이다(R-5a 의 기전은 번들과 무관하다). 운영 앞단의 주소 길이 한도. Firefox · Safari 의 IME.
  R-6a 를 기준 사본에서 Chrome 으로 — 코드가 같은 길임만 봤다. 프로젝트 수천 규모의 질의 계획.

## 남은 것

- **R-5a 를 고치는 트랙**(병합 전 권함) — 검색 글을 컴포넌트 상태로, skip «검색 칸에 한글을 조합해 치면 …» 을 뗀다.
- R-2a · R-3a · R-4b · R-6b — 낮음, 고칠 방향은 각 절.
- R-4a — M 트랙이 칸마다 정적 라우트를 달면 skip «펼친 «메뉴» 에서 관리자 칸 …» 을 떼서 초록인지 본다.
- R-6a — 이월(에디터 밖 로그아웃의 `settle`).
- «8» 의 흔들림 — 이월(기다림 한도).

## 지침

1. **무엇이 비었나** — 주소 질의에 값을 매단 입력(`value={searchParams.get(…)}`)은 `BrowserRouter` 가 위치 갱신을 `startTransition` 으로 해 한글 조합을 깨고
   빠른 입력의 글자를 잃는다. jsdom(`fireEvent.change` 한 번)은 못 낸다. **어디** — `AGENTS.md` «워커에게 맡길 때 — wirebound» 의 jsdom · 실브라우저 문단(«jsdom
   값은 실브라우저 값이 아니다 …»)의 끝. **넣을 문장** — «**주소 질의를 값으로 쓰는 입력 칸은 실브라우저에서 한글 조합(CDP `Input.imeSetComposition`)으로
   잰다** — `main.tsx` 의 `BrowserRouter` 는 위치 갱신을 전이(`startTransition`)로 해, `value` 를 주소에서 읽는 칸은 입력 이벤트 뒤 옛 값으로 되돌려져 조합이
   걸음마다 굳는다(«고객» → «ㄱ고곡고ㄱ개객객»). 글은 컴포넌트 상태로 들고 주소에는 싣기만 한다(`apps/web/build-test/rv-ws-workspace.test.ts` «한글 조합»).»
2. **무엇이 비었나** — 브라우저 확대를 재는 길(영속 컨텍스트 + `Default/Preferences` 의 `partition.default_zoom_level`)이 지침에 적혀 있지만 `editor-stack`
   에 도우미가 없어 판마다 짓는다. **어디** — 같은 문단의 «브라우저 확대(페이지 줌)는 뷰포트 흉내로 못 잰다» 뒤. **넣을 문장** — «만든 꼴은
   `apps/web/build-test/rv-ws-workspace.test.ts` 의 `zoomedContext` 다(로그인은 `context.request.post` · `viewport: null` · `--window-size`). 첫 페이지는
   `context.pages()[0]` 이다.»
3. **무엇이 틀렸나 — 없음(확인)**: 지침 «열을 두는 배치의 넘침은 문턱 바로 위 폭에서도 잰다» 대로 719 · 720 · 721 과 옛 `@media` 문턱(900 · 960)을 쟀다.
   사이드바가 생겨 같은 창 폭에서 내용 칸이 296px 좁아졌는데도(232 + 여백 64) 넘침 0 이었다 — 새 문장은 필요 없다.
