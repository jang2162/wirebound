# FX-UI — 화면 다듬기 리뷰 대응(넷) 보고

브랜치 `feat/ui-polish` · 시작 머리 `8104fc85` · 트랙 키 `fx-ui`. 브리프 `.worktrees/.coord/brief-fx-ui.md` · 리뷰 보고 `docs/superpowers/plans/2026-11-19-rv-ui-report.md` ·
구현 보고 `docs/superpowers/plans/2026-11-18-ui-report.md`. node `v24.21.0` · 자기 DB 포트 5534.

작업 공간: `orca terminal list` 는 이 워크트리의 터미널을 하나도 안 냈다(자기 세션도 안 보임 — 목록이 이 런타임을 못 본 것). 그래서 시작 · 끝의
`git ls-files -s apps | md5` 와 `git status --short` 를 견준다 — 시작 `ac5b223f46cf5400f97edb77f6751b9a` · `?? .build/` 만.

## 1. 4b — 코멘트 무리 이름의 내부 id

**바꾼 것.** `apps/web/src/panels/comment-panel.tsx` — 무리 이름(머리 글 · 가리킬 수 있는 무리의 `aria-label` · 편집 모드 머리 단추의 이름)을 «달 곳» 과 같은
`nodeRowLabel`(구조 트리 줄 이름 `타입 (별칭) 요약`)로 짓는다(`rowLabelsOf` — 옛 `aliasesOf` 를 갈아 낌). 사라진 노드는 «사라진 노드», 문서를 못 읽은 무리는
«이름을 모르는 노드»(아래 결정). 내부 id 는 어느 갈래에도 없다.

**결정.** 문서를 못 읽은 무리(`present: 'unknown'`)는 그 노드가 무엇인지 모른다 — 옛 판은 id 를 말했다. «사라진 노드» 라고 단언하지 않는 규칙
(`Group.present` 머리말)을 지켜 «이름을 모르는 노드» 로 두었다. 같은 화면에 «문서를 읽지 못해 번호를 보일 수 없습니다» 가 함께 서서 까닭을 말한다. 그 판의
무리 둘은 같은 이름이다(코멘트가 달린 차례로 선다).

**기대값을 바꾼 케이스**(무리 이름으로 찾는 자리 — `git grep -n -P "['\"\`/][0-9–] n_" -- apps/web/test apps/web/build-test` 에 더해 `comment-group` · `사라진 노드` 셈):

| 파일 | 자리 | 옛 → 새 |
| --- | --- | --- |
| `apps/web/test/panels/comment-panel.test.tsx` | 번호 차례 · 한 무리 · 번호 없음/사라짐 · 고른 표시 · 재번호(D4) · 문서 못 읽음 | `'1 n_c'` → `'1 Text 다'` 등 · `'– 사라진 노드 (n_없음)'` → `'– 사라진 노드'` · `'– n_a'` → `'– 이름을 모르는 노드'` |
| `apps/web/test/panels/alias-naming.test.tsx` | 무리 머리 | `'2 회원 목록 (n_list)'` · `'– n_plain'` → `'2 DataGrid (회원 목록)'` · `'– Text 안내'` |
| `apps/web/test/panels/comment-focus.test.tsx` | 머리 단추 이름 둘 | `'2 n_b'` → `'2 Text 관리'` |

실브라우저(`apps/web/build-test`)는 무리를 `data-comment-node` 로 찾고 글은 «사라진 노드» 포함만 본다(`comment-focus.test.ts` 728줄) — 고칠 자리 0.

**새 케이스** `comment-panel.test.tsx` «무리의 이름은 «달 곳» 과 같은 이름이다 — 머리 글도 접근 이름도 내부 id 를 말하지 않는다»: 무리 `aria-label` = `'1 Text 가'` ·
같은 노드의 «달 곳» = `'달 곳: 1 Text 가'` · 머리 글 · 접근 이름에 `n_` 없음. (jsdom 값이다 — 접근 이름은 속성 글이라 실브라우저와 같은 글이다.)

**고치기 전 · 뒤**(jsdom, 세 파일): 고치기 전 9 실패(바꾼 기대값 8 + 새 케이스) → 고친 뒤 52 통과 · `apps/web/test/panels` + `apps/web/test/comments` 62 파일 955 통과.

| 변조 | 돌린 것 | 결과 |
| --- | --- | --- |
| M1 무리 이름을 옛 식(`present === 'no' ? 사라진 노드 (id) : id`)으로 되돌림 | 새 케이스 하나(`-t`) | 1 실패 · 통과 0 — `expected '1 n_a' to be '1 Text 가'`(접근 이름 값) |
