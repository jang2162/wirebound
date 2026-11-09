# 2026-11-09 TRV — 합친 판(MV + TR) 검증 보고

워크트리 `feat-tree-items` 를 `git merge --ff-only main` 으로 main `c3484350`(MV `0f6d548f` 뒤에 TR 을 합친 판)과 같게 했다 — 빨리감기가 섰다.
`pnpm install --frozen-lockfile` · `pnpm build` 를 다시 돌았다. 고친 것은 없다(빨강이 없었다).

## 게이트

체인 하나(`nohup nice -n 10 caffeinate -i` · 슬롯 파일 `tr` · `pnpm test` 는 `--maxWorkers=25%`) · node v24.21.0 · 12:37 ~ 13:06 · 잠듦 없음(`pmset -g log` 의 마지막
Sleep 은 09:31).

| 단계 | 끝 | 실행 | 통과 | 실패 | 건너뜀 | load(시작 → 끝) |
|---|---|---|---|---|---|---|
| `pnpm typecheck` | 0 | — | — | — | — | 3.8 |
| `pnpm build` | 0 | — | — | — | — | — |
| `pnpm test`(590 파일) | 0 | 9150 | 9147 | 0 | 3 | 4.3 → 12.1 |
| `pnpm test:build:serial`(18 파일) | 0 | 178 | 177 | 0 | 1 | 12.1 → — |
| `pnpm test:browser`(115 파일) | 0 | 740 | 738 | 0 | 2 | — → 18.5 |
| `pnpm fmt:check` · `pnpm lint` | 0 · 0 | — | — | — | — | — |

- **`page-info-style.test.ts` 는 이번에 초록이다** — TR 게이트(`349323e9` 기준)의 판 세우기 실패(옛 탭 이름 «속성»)는 MV 가 고친 판이다. 그 파일의 7 케이스가
  돌아 브라우저 건너뜀이 9 → 2 다.
- 건너뜀은 파일 안의 조건부다: test 3(`apps/api/test/log-destination.test.ts` · `apps/api/test/rv-ac-link-exposure.test.ts` · `apps/web/test/rv-ws-admin.test.tsx`) ·
  serial 1(`packages/theme-kit/build-test/template.test.ts`) · browser 2(`apps/web/build-test/layout-weight.test.ts` · `apps/web/build-test/rv-ws-workspace.test.ts`).
- TR 게이트 2 판의 흔들림 둘(`rv-ws-project-list` · `editor-restore-late-commit`)도 이번 판에서 초록이다.
- MV 의 `apps/web/build-test/mv-overlaps.test.ts`(브라우저 파일 114 → 115)가 이 판에 들었고 초록이다 — MV × TR 겹침(트리 항목 칸 · 컴포넌트 탭 · 코멘트 목록 ·
  탭 머리 줄 폭)에서 빨강이 없다.

## 남은 것

없다 — TR 보고(`docs/superpowers/plans/2026-11-03-tr-report.md`)의 «남은 것» 그대로다.
