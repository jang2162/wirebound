# FX-AD 보고 — 관리자 화면 리뷰 대응

브랜치 `feat/admin-screens` · 워크트리 `.worktrees/feat-admin-screens` · 머리 `0a538be0`(RV-AD) 위 · Postgres 5513 · api 3113. 브리프 `brief-fx-ad.md` · 공통
`common-w14.md` · 자리 표 `brief-ad.md`. 리뷰 `2026-11-01-rv-ad-report.md` 의 H1 · H2 · H3 · M1 · L1 · L2 를 고쳤다.

## 고치기 전 빨강(리뷰의 skip 을 뗀 판)

| 판 | 실패 값 |
|---|---|
| jsdom H1 사용자 칸 | `expected { …(2) } to deeply equal { …(2) }`(새 상자에 «복사했습니다» — 리뷰 값과 같다) |
| jsdom H1 초대 칸 | `expected <p …(2)></p> to be null` |
| jsdom L2 | `[ '인스턴스 관리자만 할 수 있습니다', …(1) ]` ≠ 한 줄 |
| jsdom L1 | `{ server: true, warning: true, …(1) }` ≠ `{ server: true, warning: false, …(1) }` |

(실브라우저 판은 아래 «실브라우저».)

## 혼자 죽는 변조 — jsdom

백업은 경로 전체 이름 · 복원은 바이트 비교 · 변조마다 겨눈 파일만 돈다(스크래치 `mut.py`). 복원 뒤 `md5` 가 변조 전과 같다.

| id | 바꾼 것 | 돌린 파일 | 결과(통과 · 실패 — 실패 값) |
|---|---|---|---|
| J1 | 사용자 칸 `LinkReveal` 의 `key` 뗌 | rv-ad-admin · fx-ad | 13 · 1 — H1 사용자 칸 `expected { …(2) } to deeply equal` |
| J2 | 초대 칸 `LinkReveal` 의 `key` 뗌 | 같음 | 13 · 1 — H1 초대 칸 `expected <p …(2)></p> to be null` |
| J3 | `pagehide` 리스너를 안 검 | 같음 | 12 · 2 — FX H3 둘 `expected <section …> to be null` |
| J4 | 사용자 칸 `write` · `resetLink` 의 `writing` 가드 뗌 | 같음 | 13 · 1 — `{ during: 1, after: 2, grant: 1 }` ≠ `{ during: 0, after: 1, grant: 1 }` |
| J5 | `ActionMenu` 목록의 `if (event.repeat) return` 뗌 | action-menu | 25 · 2 — 반복 Enter · Space `select: [['a']]` ≠ `[]` |
| J6 | `ActionMenu` 단추의 반복 막기 뗌 | action-menu | 25 · 2 — `{ first: true, repeat: true }` ≠ `repeat: false` |
| J7 | `useAdminList` 의 차례 견줌 뗌 | rv-ad-admin · fx-ad | 13 · 1 — L1 `warning: true` |
| J8 | 다시 받기 실패에 앞 표를 두는 줄 뗌 | 같음 | 12 · 2 — L2 두 줄 · FX L2 `table: false` |
| J9 | `Outcome` 의 같은 문장 접기 뗌 | 같음 | 13 · 1 — L2 두 줄 |
| J10 | `Outcome` 이 `stale` 을 안 그림 | 같음 | 13 · 1 — FX L2 `alerts: []` |

- J3 은 `flushSync` 를 못 잰다 — jsdom 의 `act` 가 어차피 내린다. `flushSync` 는 실브라우저 변조가 잰다(아래).

## 실브라우저(H1 · H2 · H3 — dev 번들)

고친 뒤 값(`[rv-ad …]` · `[fx-ad …]` 줄):

| 판 | 값 |
|---|---|
| H1 | `{"copiedShown":false,"clipboard":"bob-reset"}` |
| H3 초대 링크 칸 | `{"restored":true,"token":false,"reasons":"null"}` — bfcache 로 되살았고 상자는 걷힌 채다 |
| H3 재설정 링크(사용자 칸 — 새 판) | `{"restored":true,"token":false,"reasons":"null"}` |
| H2 관리자 «관리자로 지정» 누른 채 | `{"grant":1,"reset":0,"revoke":0,"deactivate":0,"links":0}` |
| H2 에디터 구조 트리 «삭제» 누른 채(새 판) | `order` 넷 · `headSeq` 2 · `reopened` 0 · 포커스 `BODY` |
| H2 에디터 구조 트리 «아래로» 누른 채(새 판) | `order` 다섯(글 1 이 글 2 뒤) · `headSeq` 2 · `reopened` 0 · 포커스 «Text 글 1 더 보기» |

### 혼자 죽는 변조 — 실브라우저

| id | 바꾼 것 | 겨눈 케이스 | 결과 |
|---|---|---|---|
| B1 | 두 칸의 `LinkReveal` `key` 뗌 | H1 | 0 · 1 — `{ copiedShown: true, … }` |
| B2 | `pagehide` 리스너를 안 검 | H3 둘 | 0 · 2 — 둘 다 `expected true to be false`(원문이 DOM 에) |
| B3 | `flushSync` 를 떼고 `onClose()` 만 | H3 둘 | **산다**(2 · 0) — Chrome 은 페이지를 얼리기 전에 React 의 갱신이 돈다. `flushSync` 는 다른 브라우저의 차례를 안 잰 보험으로 둔다(머리말에 적었다) |
| B4 | `ActionMenu` 반복 거름 둘 다 뗌 | 에디터 «삭제» · «아래로» | 1 · 1 — «아래로» `reopened: 1`(메뉴가 다시 열려 «별칭 바꾸기» 가 골라짐 — 서버 편집 없음 · `headSeq` 2). «삭제» 는 산다 — 지운 줄의 «…» 가 사라져 포커스가 `body` 다(머리말에 적었다) |
| B5 | B4 와 같음 | 관리자 H2 | 0 · 1 — `{ grant: 1, reset: 10 }` |

- 에디터 «아래로» 판은 처음에 서버 값만 단언해 B4 에 살았다 — 사슬이 고르는 첫 항목(«별칭 바꾸기»)은 서버 편집을 안 낸다. 누른 동안 `role="menu"` 가
  새로 선 수(`reopened` — `MutationObserver`)를 더해 B4 로 죽였다.

## M1 — 이름의 방향 제어 글자(웹 + api)

### 화면 겹 — `apps/web/src/shell/isolate.ts`

`isolate(text)` = FSI(U+2068) + 안의 내장 · 덮어쓰기 · 격리 글자(U+202A – U+202E · U+2066 – U+2069)를 걷은 글 + PDI(U+2069). 글 노드 하나로 남아
`<option>` · 템플릿 문장에도 쓴다.

**센 자리**(`git grep -n "isolate(" -- apps/web/src` — 38 줄, `import` 포함):

| 파일 | 감싼 자리 |
|---|---|
| `admin/users-section.tsx` | 결과 한 줄 다섯 · 링크 상자 제목 둘 · 표의 이름 · 이메일 · 초대 링크 이름 · 확인 상자 문장 둘(이름 · 이메일) |
| `admin/invites-section.tsx` | 결과 한 줄 · 링크 상자 제목 · 표의 이름 · 만든 사람 · 거두기 상자 문장 |
| `admin/projects-section.tsx` | 표의 이름(링크 · 글) · owner 이름 · 결과 한 줄(프로젝트 · 받은 사람) · 상자 문장 · 고르개(이름 · 이메일) |
| `admin/audit-section.tsx` | 기록 줄의 사람(이름 · 이메일) · 링크 · 프로젝트 이름 · 누가 · 사람 고르개 |
| `routes/reset.tsx` | «<이름>(<이메일>)의 새 비밀번호를 정합니다» |
| `routes/invite.tsx` | 0 — 사람이 지은 글을 안 보인다 |
| `settings/members-section.tsx` | 이름 · 이메일 · «<이름> 제외» · «<이름> 제외 확정» 단추 글 |

- **감싸지 않은 것:** 접근 이름 · `title` 만 드는 글(행동 메뉴 «… 더 보기» · 역할 고르개의 `aria-label`). 글의 흐름 속에 그려지지 않고, 그 이름으로 찾는 케이스가
  많다(«결정» 2).
- **기존 케이스:** 글자 그대로 견주던 단언을 같은 함수로 지어 견주게 고쳤다 — jsdom 8 파일(`test/admin/*` 넷 · `rv-ad-admin` · `fx-ad` · `routes/reset` ·
  `settings/members-section`) · 실브라우저 3 파일(`rv-ad-admin` · `admin-screens` · `members-confirm`). 고치기 전 jsdom 빨강 59(8 파일).
- **새 케이스:** `test/admin/fx-ad-bidi.test.tsx` — 화면 여섯에서 이름 · 이메일 · 링크 · 프로젝트 이름에 U+202E(와 짝 없는 PDI)를 넣고 글이 서는 판(표 · 상자 ·
  결과 한 줄 · 링크 상자 · 고르개 · 기록 줄 · 단추 글)을 다 세운 뒤 **글 노드에 U+202E 가 남은 수**를 센다(0 이어야 한다 — `isolate` 가 걷으므로 남은 하나가 곧
  감싸지 않은 자리) · 판 카나리아(그 글이 감싼 꼴로 섰다) · `isolate` 단위 하나.

### 서버 겹 — `apps/api/src/auth/hidden-chars.ts`

표 하나(`RANGES`): C0 · DEL · C1 · U+061C · U+200B – U+200F · U+2028 – U+202E · U+2060 – U+2064 · U+2066 – U+2069 · U+FEFF. 두 자리가 쓴다 —
`DisplayName`(`auth/credentials.ts`) · 초대 링크 이름(`routes/admin-invites.ts`)의 거절, 잠금 풀기 출력(`auth/unlock-login.ts` 의 `printable` — 앞 범위는
C0 · DEL · C1 · U+200E · U+200F · U+202A – U+202E · U+2066 – U+2069 였다. 폭 없는 글자 · U+061C · 줄 구분이 더해졌다).

**입구**(`git grep -n "DisplayName" -- apps/api/src` · 링크 이름): 초대 링크 가입(`routes/invite-signup.ts`) · 시딩 `SEED_USER_NAME`(`db/seed-user.ts` 의
`SeedEnvSchema`) · 시딩 함수(`validateInput` — 픽스처) · 이메일에서 지은 이름(`defaultNameFor` — 로컬 파트는 ASCII 라 걸릴 일이 없다) · 초대 링크 만들기.
**계정 이름을 바꾸는 입구는 없다**(계정 화면은 이름을 보이기만 한다). 이미 든 이름은 그대로 둔다 — 데이터 마이그레이션 없음.

`apps/api/test/hidden-chars.test.ts`: 표(갈래 17 · 보이는 이름 7) · **BMP 모든 글자에서 `printable` 이 바꾸는 글자 = `DisplayName` 이 거절하는 글자**(88 자) ·
입구마다 400(가입 · 링크 만들기 — 갈래 17 전부 · DB 행 0 · 보이는 이름 201 카나리아) · 시딩 env · 시딩 함수.

### 실브라우저

| 판 | 고친 뒤 값 |
|---|---|
| M1 비활성화 상자(끝 안 닫은 U+202E 이름) | `"사퇴박(rv-ad-5-…@browser.test) 계정을 비활성화합니다. 로그인 · 세션 · API 토큰이 바로 끊깁니다."` |
| U+202E 표 1280 · 720 | 진짜 «박퇴사» · 흉내(관리자) «사퇴박관리자» · 끝 닫은 흉내 «사퇴박» · 넘침 0 — **흉내가 더는 «박퇴사» 로 안 보인다**(덮어쓰기 글자를 걷으므로) |

### 혼자 죽는 변조 — M1

| id | 바꾼 것 | 결과 |
|---|---|---|
| W1 – W5 | 사용자 칸의 표 이름 · 비활성화 문장 · 해제 결과 한 줄 · 재설정 상자 제목 · 초대 상자 제목에서 `isolate` 뗌(하나씩) | 각각 6 · 1 — «관리자 › 사용자» 판만 |
| W6 · W7 | 초대 칸의 만든 사람 · 거두기 문장 | 각각 6 · 1 — «초대 링크» 판만 |
| W8 · W9 · W15 | 프로젝트 칸의 고르개 · owner 이름 · 상자 문장 | 각각 6 · 1 — «프로젝트» 판만 |
| W10 · W11 | 기록의 `person()` · 사람 고르개 | 각각 6 · 1 — «기록» 판만 |
| W12 | 멤버 칸 «<이름> 제외» | 6 · 1 — «멤버» 판(첫 판은 단추를 감싼 이름으로 찾아 «못 찾음» 으로 죽었다 — 끝 글 `/제외$/` 로 찾게 고쳐 값으로 죽였다) |
| W13 | 재설정 화면 문장 | 6 · 1 — «재설정» 판만 |
| W14 | `isolate` 가 안의 글자를 안 걷음 | 0 · 7 — 전부(단위 · 화면 여섯) |
| B6 [Chrome] | 비활성화 문장에서 `isolate` 뗌 | 0 · 1 — `'이 큰토 IPA · 션세 · 인그로 .다니합화성활비 을정계 )tse…'` |
| A1 | `DisplayName` 의 거절 뗌 | 2 · 4 — 표 같음 · 가입 · 시딩 env · 시딩 함수 |
| A2 | 링크 이름의 거절 뗌 | 5 · 1 — 링크 만들기만 |
| A3 | `printable` 이 앞의 제 범위로 | 5 · 1 — «표 하나» 만 |
| A4 | 가입 본문이 `DisplayName` 대신 맨 `z.string()` | 5 · 1 — 가입만 |
| A5 | `SEED_USER_NAME` 이 맨 `z.string()` | 5 · 1 — 시딩 env 만 |
| A6 | 시딩 함수의 이름이 맨 `z.string()` | 5 · 1 — 시딩 함수만 |

- «표» 케이스(갈래 17 · 보이는 이름 7)는 혼자 죽는 변조가 없다 — 표를 바꾸는 변조는 «표 하나» 의 수(88)와 입구 판도 함께 죽인다. 표 축의 정본으로 남긴다.
