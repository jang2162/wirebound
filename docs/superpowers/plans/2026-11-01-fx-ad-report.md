# FX-AD 보고 — 관리자 화면 리뷰 대응

브랜치 `feat/admin-screens` · 워크트리 `.worktrees/feat-admin-screens` · 머리 `0a538be0`(RV-AD) 위 · Postgres 5513 · api 3113. 브리프 `brief-fx-ad.md` · 공통
`common-w14.md` · 자리 표 `brief-ad.md`. 리뷰 `2026-11-01-rv-ad-report.md` 의 H1 · H2 · H3 · M1 · L1 · L2 를 고쳤다.

## 바꾼 것

커밋: `3b341d19`(H1 · H2 · H3 · L1 · L2) · `24afe533`(M1 웹 + api · 정본 설계 · api README) · 이 보고(api 케이스의 지역 함수 이름 하나 고침과 함께 — «게이트»).

| 발견 | 고침 | 케이스 |
|---|---|---|
| H1 높음 | 두 칸의 `LinkReveal` 에 `key`(사용자 칸 `reveal.url` · 초대 칸 `created.token`) | 리뷰 jsdom 둘 · Chrome 하나 skip 뗌 |
| H3 높음 | `LinkReveal` 이 `pagehide` 에 `flushSync(onClose)` | 리뷰 Chrome(초대) skip 뗌 + 재설정 링크 판 · jsdom `test/admin/fx-ad.test.tsx` 둘 |
| H2 중간 | `ActionMenu` 가 반복 Enter · Space 를 목록 · 단추에서 버림 · 사용자 칸 줄 쓰기는 한 번에 하나(`writing` ref) | 리뷰 Chrome skip 뗌 · 에디터 판 `build-test/fx-ad-repeat.test.ts` 둘 · jsdom `action-menu.test.tsx` 넷 · `fx-ad.test.tsx` 하나 |
| M1 중간 | 웹 `shell/isolate.ts`(화면 일곱 파일) · api `auth/hidden-chars.ts`(이름 · 링크 이름 거절 · `printable` 같은 표) | 리뷰 Chrome skip 뗌 · `test/admin/fx-ad-bidi.test.tsx` 일곱 · `apps/api/test/hidden-chars.test.ts` 여섯 |
| L1 낮음 | 칸 셋의 목록 받기를 `useAdminList`(차례 번호)로 | 리뷰 jsdom skip 뗌 |
| L2 낮음 | `useAdminList` 가 다시 받기 실패에 앞 표를 두고 `Outcome` 이 같은 문장을 한 줄로 | 리뷰 jsdom skip 뗌 · `fx-ad.test.tsx` 하나 |

실브라우저의 고치기 전 빨강은 고침만 떼는 변조(B1 · B2 · B5 · B6 — 아래)로 다시 보였다 — 리뷰 값과 같다(`copiedShown: true` · 원문이 DOM 에 · `reset: 10` ·
뒤집힌 문장).

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

## 결정과 이유

1. **H1 의 같은 꼴(키 없이 같은 자리에 다시 서는 상태 든 부품)은 관리자 칸에 둘 — 링크 상자 둘 — 뿐이다.** 센 것: `AskDialog`(사용자 칸 확인 상자 —
   `asking` 이 닫기 · 확정에서 `null` 을 지나고, 모달이라 열린 채 다른 줄을 고를 길이 없다) · `OwnerDialog`(같은 까닭) · `LastOwnerCount`(`AskDialog` 안 —
   `userId` 가 바뀌어도 `count` 를 안 되돌리지만 위 까닭으로 닿는 길이 없다) · `InviteCreateDialog`(닫히면 `null` 이라 열 때마다 새로 선다) · 멤버 칸
   `AskButton`(줄 `key` = `userId`). 닿는 길이 없는 셋에는 `key` 를 안 달았다 — 잴 판이 없는 장치를 더하지 않는다.
2. **`isolate` 는 접근 이름 · `title` 에 쓰지 않는다.** 행동 메뉴 «<이름> 더 보기» · 역할 고르개의 `aria-label` 은 글의 흐름 속에 그려지지 않고(읽기 프로그램은
   방향 글자로 차례를 안 바꾼다), 그 이름으로 찾는 케이스가 jsdom · 실브라우저에 많다. 남는 것: `title` 말풍선에는 이름의 방향 글자가 그대로 선다(«남은 것»).
3. **`isolate` 는 FSI … PDI 로 감싸기만 하지 않고 안의 내장 · 덮어쓰기 · 격리 글자를 걷는다**(브리프는 감싸기만 적었다). 까닭 둘 — 이름 안의 짝 없는 PDI 가
   우리 FSI 를 먼저 닫으면 그 뒤 글자가 격리 밖으로 샌다(`fx-ad-bidi` 의 이름이 그 꼴을 싣는다), 그리고 덮어쓰기 글자를 걷어야 이미 든 흉내 이름(«U+202E 사퇴박»)이
   남의 이름(«박퇴사»)으로 안 보인다(실브라우저 «사퇴박관리자»). 방향 표지(U+200E · U+200F · U+061C)는 둔다 — 오른쪽에서 쓰는 이름이 제 차례를 잡는 데 쓴다.
4. **서버는 ZWNJ · ZWJ 도 거절한다**(브리프의 «폭 없는 글자»). 값: 페르시아어 이름(ZWNJ) · 이모지 잇기(ZWJ)를 이름에 못 쓴다. 한글 사이에서 안 보여 같은 이름을
   둘 지을 수 있어 거절 쪽으로 갔다 — 사내 도구의 이름이라 잃는 것이 작다고 봤다. 되돌리려면 `RANGES` 에서 U+200B – U+200F 를 U+200B · U+200E · U+200F 로 좁힌다
   («표 하나» 케이스의 88 이 86 이 된다).
5. **`printable`(잠금 풀기 출력)의 범위가 넓어졌다** — 표를 하나로 모으며 폭 없는 글자 · U+061C · 줄 구분(U+2028 · U+2029)도 `\uXXXX` 로 바꾼다. 터미널로 나가는
   글이 더 보수적이 될 뿐 잃는 것이 없다. 앞 케이스(`login-unlock.test.ts` «printable 은 …»)는 그대로 초록이다.
6. **`flushSync` 는 보험으로 남긴다** — Chrome 은 뗀 판(B3)도 초록이었다. Firefox · Safari 의 `pagehide` 뒤 차례를 안 쟀다.
7. **목록 받기를 훅 하나(`useAdminList`)로 모았다** — 칸 셋이 같은 `load` 를 따로 들어, `turn` 을 셋에 펴는 대신 한 자리에 두었다. 로그인이 풀린 실패는 앞 표가
   있어도 `failed` 로 가 `SignedOut` 이 선다.
8. **사용자 칸의 쓰기 가드는 `ref`(`writing`)다** — `busy` 는 다음 렌더에야 서서 한 틱 안의 두 고름이 둘 다 거짓을 본다. 단추 · 항목을 끄지는 않았다(끈 항목은 이유
   문장이 필요하다 — 잠깐의 쓰기 동안 이유를 말할 것이 없다).
9. **단추의 반복 Enter · Space 는 기본 동작을 막는다** — 단추의 Enter 는 keydown 의 기본 동작이 클릭이다. Space 는 keyup 에 클릭을 내지만 반복 keydown 을 같이
   막아도 잃는 것이 없다.

## 남은 것

- **`title` 말풍선**(행동 메뉴 «<이름> 더 보기»)에는 이름의 방향 글자가 그대로 선다 — 결정 2.
- **이 브리프 밖의 사람 글 자리:** 셸 사이드바 · 계정 화면의 내 이름, 에디터의 접속자 · 코멘트 작성자, API 토큰 이름 · 프로젝트 이름의 서버 검사(`routes/tokens.ts` ·
  `routes/projects.ts` — 숨는 글자를 안 막는다). 관리자 › 프로젝트 표는 프로젝트 이름을 격리한다. 다른 화면은 안 셌다.
- **«비활성화» 에서 Enter 를 누른 채** — 상자가 열리고 첫 포커스(닫기 ×)가 반복 Enter 에 닫힐 수 있다(쓰기는 없다 — 확정 단추에 안 닿는다). 안 쟀다.
- Firefox · Safari 의 bfcache · 키 반복 · `flushSync` 차례. 배포 입구(Caddy) 뒤의 bfcache.
- 리뷰 «안 본 것» 의 나머지(화면 읽기 프로그램 · 한글 조합 중의 키)는 그대로다.

## 게이트

머리 `24afe533` · node v24.21.0 · 체인 하나(`nohup nice -n 10 caffeinate -i`) · 슬롯 `gate-slots/fx-ad`(07:14:53 잡음 · 07:48:51 놓음 — 그때 다른 슬롯 0).
잠듦: `pmset -g log` 의 마지막 `Sleep` 은 2026-10-31 20:28(열 비상)이라 실행(11-01 07:14 – 07:50)과 안 겹친다. load(1분): 시작 37.6 · `test` 끝 6.8 ·
`test:build:serial` 끝 16.4 · `test:browser` 끝 20.1 · 끝 22.5 — 45 를 넘은 때가 없어 기다림 0.

| 단계 | rc | 파일 | 통과 · 실패 · 건너뜀 |
|---|---|---|---|
| `pnpm typecheck` | 0 | — | — |
| `pnpm build` | 0 | — | — |
| `pnpm test --maxWorkers=25%` | **1** | 579(api 181 · web 228 · packages 167 · system-themes 2 · playground 1) | 9029 · **1** · 3(api 2 · web 1) |
| `pnpm test:build:serial`(`test:build` 의 첫째 갈래) | 0 | 18 | 175 · 0 · 1 |
| `pnpm test:browser`(둘째 갈래) | 0 | 101 | 664 · 0 · 2 |
| `EDITOR_STACK_BUNDLE=build` 관리자 · 링크 화면 · 에디터 반복(`rv-ad-admin` · `admin-screens` · `fx-ad-repeat`) | 0 | 3 | 17 · 0 · 0 |

- **`pnpm test` 의 실패 하나:** `apps/api/test/user-creation-census.test.ts` «쓰이는 `signup` 이 전부 `./helpers` 의 것에 묶인다» —
  `expected [ 'hidden-chars.test.ts:76', …(1) ]` — 새 케이스가 가입 요청을 감싼 지역 함수를 `signup` 이라 불렀다(인구조사는 그 이름을 픽스처의 것으로만 센다).
  `join` 으로 이름을 바꿨다(시간 한도 아님 — 값으로 죽었다). 바꾼 뒤 두 파일 23 통과, **api 프로젝트 전량 다시**(`--project api --maxWorkers=25%`, 07:50 – 07:58 ·
  load 31.1 → 4.7 · 잠듦 없음): 181 파일 · 2758 통과 · 0 실패 · 2 건너뜀(첫 판의 api 2757 + 1 실패와 같은 분모). web · packages 는 이 고침과 무관해 다시 안 돌렸다.
- 숨은 글자: 바뀐 파일 전부 0(파이썬 — U+200B – U+200F · U+202A – U+202E · U+2060 – U+2069 · U+2028 · U+2029 · U+061C · U+FEFF · C0).
- `pnpm fmt` · `pnpm lint`(바뀐 파일 — lefthook 도 커밋마다) rc 0.

## 지침

1. **키 반복 사슬은 서버 값만으로 재면 못 본다.** 무엇이 빠졌나: 리뷰 지침 2(«쓰기를 내는 메뉴 · 단추는 키 반복으로도 잰다 … 서버 기록 수로 센다»)를 그대로 따른
   에디터 판이 반복 거름을 뗀 변조(B4)에 살았다 — 사슬이 고른 첫 항목(«별칭 바꾸기»)은 서버 편집을 안 낸다. 어디: `.ruler/30-delegation.md` 「워커에게 맡길 때 —
   wirebound」 의 «**jsdom 은 좌표 · 상속 계산도 없다.**» 문단 끝(리뷰 지침 2 를 넣는다면 그 문장 뒤). 넣을 문장: «서버 기록 수에 더해 **누른 동안 메뉴가 다시 선
   수**(`role="menu"` 가 DOM 에 새로 선 횟수 — `MutationObserver`)를 센다 — 사슬이 고르는 첫 항목이 서버 편집을 안 내면(입력을 여는 항목) 서버 값은 그대로다
   (`apps/web/build-test/fx-ad-repeat.test.ts` «아래로»).»
2. **사람 글을 격리하면 그 글로 찾던 자리가 값 없이 «못 찾음» 으로 죽는다.** 무엇이 빠졌나: testing-library `getByText` 의 기본 정규화와 Playwright
   `getByText(…, { exact: true })` · `getByRole({ name })` 는 FSI · PDI 를 공백으로 안 본다 — 격리를 넣자 jsdom 59 · 실브라우저 판 여럿이 판 만들기(줄 찾기)에서
   죽었고, 변조 판(W12)도 단언 값이 아니라 «단추를 못 찾음» 으로 죽었다. 어디: 같은 파일 «**`getByText` 는 요소의 제 글 노드만 견준다**» 문장 뒤. 넣을 문장:
   «**사람 글을 `isolate`(`apps/web/src/shell/isolate.ts`)로 감싼 자리는 기대값도 같은 함수로 짓는다** — 글자 그대로의 이름 · 문장은 FSI · PDI 때문에 안 맞는다.
   판을 세우는 찾기(줄 · 단추)는 감싼 글이 아니라 감싸지 않는 값(이메일 칸의 `includes` · 끝 글 `/제외$/`)으로 찾아, 감싸기를 뗀 변조가 판 만들기가 아니라 단언
   값으로 죽게 한다(`apps/web/test/admin/fx-ad-bidi.test.tsx` «멤버»).»
3. **숨은 글자 셈은 스크래치 초안에도 한다.** 무엇이 빠졌나: 리뷰 지침 3(«문서에서 숨은 글자를 가리킬 때는 이름으로 적는다»)과 같은 일이 이 보고의 초안에서도
   났다 — `Write` 로 쓴 초안의 백틱 안 «U+200B – U+200F» 를 이스케이프 꼴로 적은 글자가 날 글자로 풀렸다(커밋 전에 셈으로 잡았다). 리뷰 지침 3 의 문장으로 충분하다 — 새 문장은
   없다. 그 지침이 들어가면 «초안 · 스크래치에서 옮겨 붙이는 글도 센다» 를 덧붙인다.
