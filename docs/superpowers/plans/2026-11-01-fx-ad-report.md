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
