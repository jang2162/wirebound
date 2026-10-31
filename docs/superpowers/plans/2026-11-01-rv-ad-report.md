# RV-AD 보고 — 관리자 화면 리뷰

브랜치 `feat/admin-screens` · 워크트리 `.worktrees/feat-admin-screens` · 머리 `22c34cd6`(AD 보고 커밋) · Postgres 5513. 브리프 `brief-rv-ad.md` · 공통
`common-w14.md` · 자리 표 `brief-ad.md`. **소스는 고치지 않았다** — 케이스 파일 셋과 이 보고만 더했다.

| 파일 | 무엇 |
|---|---|
| `apps/web/test/rv-ad-admin.test.tsx`(jsdom) | 빨강 skip 셋(H1 둘 · L1 · L2) · 잠금 여섯(확인 상자의 대상 · «더 보기» 겹침 · 비관리자 조회 0 ×4) |
| `apps/web/test/rv-ad-source.test.ts`(node) | 잠금 둘 — 기록 행동 표 = 서버 `AUDIT_ACTIONS` · `dangerouslySetInnerHTML` 0 |
| `apps/web/build-test/rv-ad-admin.test.ts`(Chrome) | 빨강 skip 넷(H1 · H2 · H3 · M1) · 잠금 · 잰 값 여섯(복사 판 · 새는 자리 · 비관리자 + 강등 · U+202E 표 · 카드 문턱 · owner) |

`describe.skip` 블록 머리에 «고칠 트랙이 skip 을 떼고 초록으로 돌린다» 를 달았다. 실패 값은 skip 을 뗀 사본(`sed 's/describe\.skip(/describe(/'` — 끝에 지웠다)으로 쟀다.

## 발견

무게: **높음**(남의 데이터 · 링크 원문 새어 나감 · 잘못된 사람에게 쓰기 · 잃음) · **중간** · **낮음**.

### H1 높음 — 새 링크 상자가 앞 링크의 «복사했습니다» 를 물려받는다(링크 원문이 잘못된 사람에게)

- **재현:** 사용자 칸에서 밥의 «재설정 링크 만들기» → 상자의 «복사» → «복사했습니다». 이어 «초대 링크 만들기» → 만들기. 새 상자(«초대 링크 «새 팀»»)에
  **«복사했습니다» 가 그대로 선다** — 클립보드에는 아직 밥의 재설정 링크가 있다. 사람은 «복사했다» 를 믿고 새 팀에 붙여 넣는다 → 밥의 비밀번호를 남이 바꾼다.
  초대 링크 칸에서 A 를 복사한 뒤 B 를 만들어도 같다.
- **까닭:** `LinkReveal` 이 키 없이 같은 자리에 다시 그려져(`users-section.tsx` 의 `{reveal !== null && <LinkReveal … />}` · `invites-section.tsx` 의
  `created`) `copied` 상태가 새 주소로 이어진다. 사용자 칸의 `onCreated` 와 초대 칸의 `onCreated` 는 그 사이 상자를 걷지 않는다(재설정 링크만 `setReveal(null)` 뒤
  `await` 를 지나 새로 선다).
- **실패 값:** jsdom `{"copied": true, "field": "…/invite/invite-token-i-1"}` ≠ `copied: false` · 초대 칸 `<p role="status">복사했습니다</p>` ≠ null.
  Chrome(dev · 운영 번들 둘 다) `{"copiedShown":true,"clipboard":"bob-reset"}` ≠ `{ copiedShown: false, clipboard: 'bob-reset' }`.
- **고칠 방향:** 두 칸에서 `<LinkReveal key={url} …>`(주소가 바뀌면 새 부품). 「고칠 방향 실측」 F1.

### H2 중간 — 줄 «…» 항목에서 Enter 를 누른 채 있으면 메뉴가 다시 열려 첫 항목(재설정 링크 만들기)이 거듭 나간다

- **재현(Chrome):** 반복캐럴 줄의 «…» 에 포커스 → ↓(열림 · 첫 항목) → ↓(«관리자로 지정») → Enter 를 누른 채(첫 keydown + 반복 keydown 20 번 · 35ms 간격 — 0.7s).
  고른 항목이 메뉴를 닫고 포커스를 «…» 로 돌린다 → 반복 Enter 가 단추를 눌러 메뉴가 다시 열리고 첫 항목에 포커스 → 다음 반복 Enter 가 «재설정 링크 만들기» 를 고른다
  → 되풀이.
- **실패 값:** `{"grant":1,"reset":10,"revoke":0,"deactivate":0,"links":10}`(서버 기록 `reset.create` 10 · `password_resets` 10 줄) ≠ `{ grant: 1, reset: 0 }`.
  화면에 보이는 것은 마지막 링크 하나다 — 나머지 아홉은 원문이 아무에게도 안 갔다(해시뿐)지만 24 시간 쓸 수 있는 링크와 기록 줄이 남는다.
- **넓이:** `shell/action-menu.tsx` 의 `onListKeyDown`(Enter · Space → `click()`)과 단추의 기본 활성화가 `event.repeat` 를 안 본다 — 에디터의 모든 «…» 메뉴가 같은
  부품이다(에디터 판은 안 쟀다). «비활성화» 에서 누른 채 있으면 상자가 열리고 첫 포커스(닫기 ×)가 반복 Enter 에 닫혀 같은 사슬로 들어간다(안 잼 — 코드 경로).
  관리자 칸의 줄 쓰기(지정 · 다시 활성화 · 재설정)는 `busy` 를 안 본다 — 반복이 앞 쓰기의 답을 기다리지 않는다.
- **고칠 방향:** `ActionMenu` 가 반복 키(`event.repeat`)의 Enter · Space 를 목록과 단추 둘 다에서 `preventDefault` 하고 버린다. F2.

### H3 높음(조건부) — bfcache 로 돌아오면 새 링크 상자가 원문째 되살아난다

- **재현(Chrome · bfcache 켬):** 초대 링크를 만들어 상자가 선 채 같은 탭에서 다른 문서(`/api/health`)로 옮긴 뒤 «뒤로». 페이지가 bfcache 에서 되살아나(`window`
  표지가 남음) 상자와 원문이 그대로다 — 문장 «이 화면을 떠나면 다시 볼 수 없습니다» 가 거짓이 된다. 그 탭의 이력에 닿는 사람(공용 기계 · 자리를 비운 사이)이 원문을
  얻는다. 조건: 같은 탭의 «뒤로» — 그래서 «조건부».
- **실패 값:** dev · 운영 번들 둘 다 `{"restored":true,"token":true,"reasons":"null"}` → `expected true to be false`.
- **판 세우기:** Playwright 는 Chrome 을 `--disable-back-forward-cache` 로 띄운다(기본 인자) — 케이스가 그 인자를 뺀 브라우저를 따로 띄운다. 사람의 Chrome 은
  bfcache 가 켜져 있다. 배포 입구(`docker/web/Caddyfile` 의 `file_server`)는 `Cache-Control: no-store` 를 안 단다 — 배포 판 자체는 안 쟀다.
- **고칠 방향:** `LinkReveal` 이 `pagehide` 에서 `flushSync(onClose)`(상자를 걷은 DOM 이 bfcache 에 들어간다). F3.

### M1 중간 — 사람이 지은 이름의 방향 제어 글자(U+202E)가 확인 상자 · 고르개 · 표의 글을 뒤집는다

- 서버의 이름 검사(`apps/api/src/auth/credentials.ts` 의 `DisplayName` — `z.string().min(1).max(80)`)는 방향 제어 · 제어 글자를 받는다. 초대 링크를 받은 사람은
  제 이름을 스스로 짓는다.
- **잰 값(Chrome · 보이는 차례로 읽은 글):** 이름 «U+202E 사퇴박» 은 표(1280 · 720 카드)에서 «박퇴사» 로 보인다 — 진짜 «박퇴사» 와 같은 글(이메일 칸만 다르다).
  관리자 표지가 붙으면 «박퇴사관리자». 끝을 닫은(U+202C) 이름의 비활성화 상자: «박퇴사(rv-ad-8-…@browser.test) 계정을 비활성화합니다. …» — 진짜의 상자와 이메일만
  다르다. 끝을 안 닫은 이름의 상자: «바 이큰토 IPA · 션세 · 인그로 .다니합화성활비 을정계 )tset.resworb@…(박퇴사.다니깁끊 로» — 이름 뒤 문장 전체가 뒤집힌다.
  owner 고르개의 `<option>` 글 · 기록 줄(`person()`)도 같은 글을 날로 싣는다(고르개는 글만 봤고 화면 차례는 안 잼).
- **빨강(skip):** «이름 뒤의 «(이메일) 계정을 비활성화합니다. …» 가 보이는 차례 그대로» — 판은 이름을 DB 에 바로 적어 세운다(서버가 앞으로 막아도 옛 행의 판).
- `dangerouslySetInnerHTML` 은 0(관리자 칸 여섯 · 링크 화면 둘 — 잠금). 줄바꿈 이름은 한 줄로 접히고 넘침 0.
- **고칠 방향:** 두 겹 — 화면은 사람이 지은 글을 문장 안에서 격리(FSI U+2068 … PDI U+2069 로 감싼다 — 글 노드 하나를 지킨다), 서버는 `DisplayName` 이 방향 제어 ·
  제어 글자를 거절(`apps/api/src/auth/unlock-login.ts` 의 글자 범위와 같은 범위). 서버 겹은 이 웹 트랙 밖이다. F4.

### L1 낮음 — 겹친 목록 다시 받기의 늦은 답이 새 목록을 덮는다

- **재현(jsdom):** owner 넘기기를 보낸 채 «취소» → 닫기의 다시 받기(넘기기 커밋 전 표를 읽음)가 넘기기 성공 뒤의 다시 받기보다 늦게 온다 → 표가 «활성 owner 없음» ·
  경고 · «…» 로 돌아간다. 결과 한 줄은 «넘겼습니다».
- **실패 값:** `{ menu: true, server: true, warning: true }` ≠ `{ menu: false, server: true, warning: false }`.
- 같은 꼴: 칸 넷의 `load` 가 조회 차례를 안 본다(기록 칸만 `turn` 을 둔다). 사용자 칸의 줄 쓰기는 `busy` 를 안 봐 쓰기 둘이 겹칠 수 있다(H2 의 반복이 그 판이다).
  서버가 판정하므로 잘못된 쓰기는 없고 화면만 낡는다(다음 쓰기의 409 가 바로잡는다).
- **고칠 방향:** 칸마다 `load` 에 차례 번호(`audit-section.tsx` 의 `turn` 과 같은 꼴). F5.

### L2 낮음 — 강등 뒤 쓰기 하나에 같은 403 문장이 두 줄 서고 표가 사라진다

- **재현:** 관리자 칸을 연 채 다른 관리자가 나를 해제 → «관리자로 지정». 쓰기의 실패 한 줄과 쓰기 뒤 다시 받기의 실패 한 줄이 같은 문장으로 둘 선다. 표는 사라지고
  사이드바의 관리자 묶음은 남는다(세션 사용자는 다시 안 읽는다 — 설계대로 «권한의 진실은 서버»).
- **실패 값:** Chrome `{"alert":["인스턴스 관리자만 할 수 있습니다","인스턴스 관리자만 할 수 있습니다"],"table":0,"adminNav":1,"grant":0}` · jsdom
  `[ '인스턴스 관리자만 할 수 있습니다', '인스턴스 관리자만 할 수 있습니다' ]` ≠ 한 줄.
- **고칠 방향:** 다시 받기가 실패하면 앞 표를 두고 그 실패가 쓰기의 실패와 같은 문장이면 한 줄만. F6.

### L3 낮음 — 기록 칸의 행동 표를 서버 목록과 견주는 자가 없었다

- 지금 두 목록(웹 `AUDIT_ACTIONS` 의 열쇠 · 서버 `repos/admin-audit.ts` 의 `AUDIT_ACTIONS`)은 13 종 · 같은 차례로 같다. 견주는 자가 없어 서버에 행동이 늘면 화면은
  그 줄을 행동 이름 그대로(`auditLine` 의 «모르는 행동») 그리고, 거름에서는 못 고른다. 꼴 검사(`isAuditEntry`)는 `action` 을 글자로만 봐 쪽째 버리지는 않는다.
- **리뷰가 잠갔다:** `test/rv-ad-source.test.ts` «기록 칸의 행동 표가 서버의 행동 목록과 같은 집합 · 같은 차례다»(서버 파일을 실행 때 경로로 싣는다).

## 문제 없음으로 잰 것(잠금 · 잰 값)

| 볼 것 | 값 | 판 |
|---|---|---|
| 1 원문이 저장소 · IndexedDB · 주소 · `history.state` · 콘솔 · 뒤따른 요청에 | 열 칸 모두 거짓 · 뒤따른 요청 6 · IndexedDB 이름 `[]` | Chrome 잠금 |
| 1 SPA 로 다른 칸 → 뒤로 · 같은 컨텍스트의 다른 탭의 DOM 에 | 없음 | Chrome 잠금 |
| 1 «복사» — 권한 줌 · 기본 · `writeText` 거절 · 클립보드 없음 | 넷 다 «복사했습니다» · 클립보드 = 주소(거절 · 없음은 `execCommand`) | Chrome 잠금(문장 = 실제) |
| 2 상자가 떠 있는 동안 목록이 다른 차례로 다시 그려짐 | 확정 → `[['u-bob']]`(상자를 연 줄의 id) · 상자 문장 «밥(u-bob@…)» | jsdom 잠금 |
| 2 낡은 줄의 행동 | 서버가 409 로 막는다(`routes/admin-users.ts` — 이미 비활성 · 이미 관리자 · 비활성 지정 …) | 코드 |
| 2 «관리자로 지정» 항목 더블클릭 | `{"grant":1,"reset":0}` | Chrome 잰 값(케이스는 걷었다 — 변조 BD) |
| 3 비관리자가 칸 넷을 염 | 관리자 조회 0(jsdom) · `/api/admin/*` 0 / 요청 1148(Chrome) | 잠금 둘 |
| 5 owner 고르개 | 비활성 사용자 0 · 409 «이 프로젝트에는 이미 활성 owner 가 있습니다» · 닫으면 «…» 사라짐 · 나에게 넘긴 줄은 `/projects/<id>` 링크 | Chrome 잠금 |
| 6 «더 보기» 를 겹쳐 누름(클릭 셋 + 반복 Enter) | 다음 쪽 조회 1 · 줄 3 | jsdom 잠금 |
| 7 접근성 트리 899 · 900 · 901 | 899(카드): 칸 이름 «이름 …» · «이메일 …» 처럼 이름표가 **한 번** · columnheader 0 · table 1 · row 1. 900 · 901(표): columnheader 7 · 칸 이름에 이름표 없음. 두 번 읽힘 없음 | Chrome 잰 값 |
| 7 넘침 899 · 900 · 901 | 문서 0 · 창 밖 글자 노드 0 | Chrome 잠금 |

## 혼자 죽는 변조

백업은 경로 전체 이름(`bak__apps__web__…`) · 복원은 바이트 비교(`filecmp`) · 변조마다 그 케이스 파일만 `-t` 로 그 케이스만 · 맞은 수 1 확인. 실패 값은 vitest json 의
첫 줄. 도우미는 스크래치의 `mut.py`(`muts.json`). 실브라우저는 dev 번들.

| id | 바꾼 것 | 겨눈 케이스 | 결과(통과 · 실패 — 실패 값) |
|---|---|---|---|
| MA | 비활성화 확정이 `state.users[1].id`(목록 차례)로 보냄 | jsdom «확인 상자가 떠 있는 동안 …» | 0 · 1 — `[['u-carol']]` ≠ `[['u-bob']]` |
| MB | «더 보기» 의 `disabled={loadingMore}` → `false` | jsdom ««더 보기» 를 겹쳐 …» | 0 · 1 — 줄 5 ≠ 3 |
| MC | 관리자 아님 한 줄 곁에 `props.children` 도 그림 | jsdom «관리자가 아닌 사람이 … 0» ×4 | 0 · 4 — `['listAdminUsers']` 등 ≠ `[]`(칸마다 그 칸의 조회) |
| ME | 웹 `AUDIT_ACTIONS` 에서 `theme.unhide` 뺌 | node «기록 칸의 행동 표 …» | 0 · 1 — 12 ≠ 13 |
| MF | 링크 상자 문장을 `dangerouslySetInnerHTML` 로 | node «`dangerouslySetInnerHTML` 이 0» | 0 · 1 — `[link-reveal.tsx]` ≠ `[]` |
| BC [Chrome] | 복사 실패 뒤 `execCommand` 결과를 안 보고 «복사했습니다» | ««복사» — 클립보드 판마다 …» | 0 · 1 — 거절 판의 클립보드 `'sentinel-rejected'` ≠ 주소 |
| BL [Chrome] | 링크 상자가 원문을 `sessionStorage` 에 적음 | «새 링크의 원문은 …» | 0 · 1 — `session: true` |
| BN [Chrome] | MC 와 같은 변조 | «관리자 아닌 사람이 … `/api/admin/*` 0» | 0 · 1 — 요청 10 ≠ `[]` |
| BT [Chrome] | 카드 꼴 문턱 `max-width: 899px` → `1px` | «카드 꼴 문턱 …» | **산다**(1 · 0) — 899 의 표 꼴도 넘침 0 이다 |
| BT2 [Chrome] | 칸의 `overflow-wrap: anywhere` 뗌 | 같은 케이스 | 0 · 1 — `{ doc: 0, past: 14 }`(창 밖 글자 노드 14 — 문서 넘침은 0) |
| BO [Chrome] | owner 고르개에서 활성 거름 뗌 | «owner 넘기기 — …» | 0 · 1 — `hasInactive: true` |
| BD [Chrome] | 행동 메뉴의 뒤따르는 클릭 삼킴(`guardFollowingClick`) 뗌 | «관리자로 지정» 더블클릭 판 | **산다**(1 · 0) — 첫 누름이 메뉴를 닫아 둘째 누름이 닿을 항목이 없다. **그 케이스는 걷었다**(아무것도 안 잰다). 잰 값 `{"grant":1,"reset":0}` 은 위 표에 남긴다 |

- «카드 꼴 문턱» 케이스는 문턱을 겨눈 변조(BT)에 산다 — 문턱 자체는 구현의 넘침 판(`admin-screens.test.ts` B3)이 잰다. 이 케이스가 혼자 잠그는 것은 899 · 900 · 901
  에서 창 밖 글자 0(BT2)이고, 접근성 트리 값은 잰 값이다.
- 빨강 skip 넷 · 셋은 skip 을 뗀 사본에서 위 «발견» 의 실패 값으로 죽었다(각 케이스가 재려던 값 — 시간 초과 0).

## 고칠 방향 실측(그대로 짜면 무엇이 죽나)

방향마다 소스에 그대로 짜 넣고(백업 · 바이트 비교 복원 — 스크래치 `fix.py`) skip 을 뗀 사본과 곁 케이스를 돌렸다. 고친 소스는 남기지 않았다.

| id | 짜 넣은 것 | 돌린 것 | 결과 |
|---|---|---|---|
| F1(H1) | 사용자 칸 `<LinkReveal key={reveal.url} …>` · 초대 칸 `key={created.token}` | `test/admin/*` + jsdom 사본 · Chrome H1 | jsdom 52 통과 · 2 실패(L1 · L2 — 이 고침 밖) · Chrome H1 통과. 죽은 기존 케이스 0 |
| F2(H2) | `ActionMenu` — 목록의 Enter · Space 에 `if (event.repeat) return` · 단추의 반복 Enter · Space 를 `preventDefault` | `test/shell/*` + `test/admin/*`(503) · Chrome H2 | 503 통과 · H2 통과. 죽은 것 0. **안 돌린 것:** `ActionMenu` 를 쓰는 나머지 jsdom(`test/panels/*` 등) · 실브라우저 전량 — 고칠 트랙의 게이트가 돈다 |
| F3(H3) | `LinkReveal` 이 `pagehide` 에서 `flushSync(onClose)` | `test/admin/*`(43) · Chrome H3 · «새 링크의 원문은 …» | 43 통과 · 둘 통과 |
| F4(M1 화면 겹) | 비활성화 상자 문장의 이름을 FSI(U+2068) … PDI(U+2069)로 감쌈(소스에는 이스케이프로) | `test/admin/*`(43) · Chrome M1 | 43 통과 · M1 통과. 문장 하나만 고쳤다 — 관리자 해제 상자 · 결과 한 줄 · 고르개 · 기록 줄에 같은 꼴을 펴면 **그 문장을 글자 그대로 견주는 케이스가 죽는다**(예: `test/admin/users-section.test.tsx` 의 `'밥 — 관리자로 지정했습니다.'` 꼴 — 이름 둘레에 숨은 글자가 든다). 그 단언은 같은 감싸개로 지어 견주게 고친다 |

- L1 · L2 는 짜 넣지 않았다(낮음). L1 은 기록 칸의 `turn` 꼴을 칸 셋의 `load` 에 펴고, L2 는 다시 받기 실패 때 앞 표를 두는 길이다 — 그대로 짜면 «목록을 못 받으면 문장»
  을 재는 기존 케이스(사용자 · 초대 · 프로젝트 칸의 첫 조회 실패)는 첫 조회라 앞 표가 없어 그대로다(안 잼).
- M1 서버 겹(`DisplayName` 거절)은 api 트랙의 일이다 — 그대로 짜면 이미 든 이름은 그대로 남으므로 화면 겹(F4)이 함께 있어야 옛 행이 닫힌다(M1 케이스가 DB 에
  바로 적어 그 판을 센다).

## 안 본 것

- Firefox · Safari(bfcache · 클립보드 · 키 반복이 다를 수 있다). 배포 입구(Caddy) 뒤의 bfcache — 헤더만 읽었다.
- 실제 화면 읽기 프로그램 — 접근성 트리 값(CDP)만 쟀다.
- H2 의 에디터 «…» 메뉴들 · «비활성화» 에서 누른 채의 사슬(코드 경로만 읽음). 한글 조합 중의 키.
- 초대 · 재설정 링크 화면(`/invite/…` · `/reset/…`)이 원문 주소를 받는 사람의 브라우저 이력에 남기는 것 — AC 트랙의 화면이라 이 리뷰 밖이다.
- 기록 칸 · 초대 칸 · 프로젝트 칸에 방향 제어 글자가 든 판(사용자 칸만 쟀다 — 같은 날 글자 꼴이라 같은 값으로 본다).

## 게이트

리뷰라 전량을 안 돌렸다(브리프). node v24.21.0 · 15 코어. 잠듦 — `pmset -g log` 의 마지막 `Sleep` 은 2026-10-31 20:28(열 비상)이라 실행(11-01 06:10 – 06:31)과
안 겹친다. load(1분) 는 실브라우저 판마다 22 – 49(첫 판 49 — 그 판도 끝까지 섰고 값이 뒤 판과 같았다).

| 단계 | 결과 |
|---|---|
| `pnpm vitest run --project web apps/web/test/rv-ad-admin.test.tsx apps/web/test/rv-ad-source.test.ts` | 2 파일 · 8 통과 · 4 건너뜀(skip 블록) · 실패 0 |
| `pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/rv-ad-admin.test.ts` | 1 파일 · 6 통과 · 4 건너뜀(skip 블록) · 실패 0 |
| skip 뗀 사본(끝에 지움) | jsdom 4 실패 · 7 통과 · Chrome(dev) 4 실패 · 6 통과(더블클릭 판을 걷기 전 7) · Chrome(운영 번들 · H1 · H2 · H3 만) 3 실패 |
| `pnpm typecheck` | rc 0(첫 판 rc 2 — 새 케이스의 `Node.data` 타입 하나, 고쳤다) |
| `pnpm lint` · `oxlint`(새 파일 셋) · `oxfmt` | rc 0 · 새 경고 0 |

- 기대는 파일 — 새 jsdom 판은 `test/admin/admin-server.ts` · `test/helpers.tsx` 를, 실브라우저 판은 `editor-stack.ts` · `theme-fixtures.ts` 를 쓴다. 그 파일들은 안 바꿨다.
- 숨은 글자 — 새 케이스 파일 셋 0(파이썬으로 셈). 방향 제어 글자는 케이스에서 `String.fromCharCode` 로 짓는다.

## 남은 것

- 고칠 트랙: H1 · H3(높음) · H2 · M1(중간) · L1 · L2(낮음) — 각 skip 을 떼고 초록으로. M1 의 서버 겹은 api 쪽 이월.
- 구현 보고 «남은 것» 의 B2 · B4(실브라우저가 못 재는 겹)는 그대로다 — 이 리뷰의 BD 도 같은 까닭(둘째 누름이 닿을 자리가 없다)으로 산다.

## 지침

1. **`editor-stack` 의 Chrome 은 bfcache 가 꺼져 있다.** 무엇이 빠졌나: 실브라우저 판은 «다른 문서로 떠났다 뒤로 오면» 을 못 잰다 — Playwright 가
   `--disable-back-forward-cache` 를 기본 인자로 준다(`playwright-core` 의 `chromiumSwitches`). 사람의 Chrome 은 켜져 있어 H3 이 섰다. 어디:
   `.ruler/30-delegation.md` 「워커에게 맡길 때 — wirebound」 의 «jsdom 값은 실브라우저 값이 아니다 …» 문단 끝. 넣을 문장: «**`editor-stack` 의 Chrome 은 bfcache 가
   꺼져 있다** — Playwright 가 `--disable-back-forward-cache` 를 기본 인자로 준다. 다른 문서로 떠났다 «뒤로» 오는 판(지운 줄 안 화면 상태가 되살아나는가)은
   `chromium.launch({ ignoreDefaultArgs: ['--disable-back-forward-cache'] })` 로 따로 띄운 브라우저에서 재고, bfcache 로 되살면 `load` 가 다시 안 오니
   `goBack({ waitUntil: 'commit' })` 로 기다린다(`apps/web/build-test/rv-ad-admin.test.ts` H3).»
2. **쓰기를 내는 메뉴는 키 반복으로도 잰다.** 무엇이 빠졌나: 지침은 연타를 «더블클릭» 으로만 적는다 — 키 반복은 고른 항목이 메뉴를 닫고 포커스를 단추로 돌린 뒤
   단추를 다시 눌러 다른 항목(첫 항목)을 고른다. 어디: 같은 파일 «**jsdom 은 좌표 · 상속 계산도 없다.**» 문단 끝. 넣을 문장: «**쓰기를 내는 메뉴 · 단추는 키 반복으로도
   잰다** — 고른 항목이 닫히며 포커스를 «…» 로 돌리면 누른 채인 Enter 가 단추를 다시 눌러 메뉴를 열고 첫 항목을 고른다(관리자 › 사용자에서 0.7s 에 재설정 링크 10 개 —
   `apps/web/build-test/rv-ad-admin.test.ts` H2). playwright 의 `keyboard.down` 을 거듭 부르면 반복(`autoRepeat`)으로 나간다. 서버 기록 수로 센다.»
3. **보고 글에 쓴 이스케이프 `\u202E` 도 날 글자로 풀린다.** 무엇이 틀렸나: 「숨은 글자를 이스케이프로 쓴 파일은 쓴 뒤 바이트로 센다」 가 소스 · 케이스의 이스케이프만 겨눈다 —
   보고 `.md` 에 적은 `\u202E` 세 곳이 파일 도구에서 날 U+202E 로 풀려 문서가 거꾸로 보였다(이 보고는 «U+202E» 글로 다시 썼다). 어디: `.ruler/20-verification.md` 의 그 절
   **How to apply** 끝. 넣을 문장: «문서(보고 · 계획 · 설계)에서 숨은 글자를 가리킬 때는 이스케이프(`\u202E`)가 아니라 이름(«U+202E»)으로 적는다 — 파일 도구가 이스케이프를
   날 글자로 풀어 문서 글을 뒤집는다.»
