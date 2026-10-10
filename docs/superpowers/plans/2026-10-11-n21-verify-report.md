# N21 — 합친 판 최종 검증 보고

대상: main `6392caee`(N15 · N16 · N17 · N18 · N20 · N19 병합 뒤) 위의 `feat/n21-verify`. 코드는 고치지 않았다. 기계 혼자 사용(자기 Postgres `5524`).

**결론: 전량 게이트 넷이 한 판에 전부 초록이다. 빨강 0 · 재실행 없음.**

## 게이트 (1회차, 2026-10-11 04:51:02 ~ 05:10:59)

| 게이트 | 결과 | 실행 | 건너뜀 | 실패 | 벽시계 |
| --- | --- | --- | --- | --- | --- |
| `pnpm typecheck` | 통과 | `tsc --build --force` 종료 0 · `error TS` 0줄 | — | 0 | 12s |
| `pnpm build` | 통과 | 패키지 15 · 시스템 테마 다섯 `.wbtheme` 산출 | — | 0 | 5s |
| `pnpm test --maxWorkers=25%` | 통과 | 파일 486 · 케이스 7994 | 1 | 0 | 412s |
| `pnpm test:build` | 통과 | 직렬 갈래 파일 24 · 케이스 210 / 파일 병렬 `test:browser` 파일 70 · 케이스 530 | 직렬 1 · 병렬 0 | 0 | 768s(직렬 144s + 병렬 623s) |

건너뜀 둘(둘 다 전제를 실물로 정하는 자 — 이 기계에서 안 서는 판):
- `apps/api/test/log-destination.test.ts` «공간이 찬 채로 끝내도 `flushSync` 에서 멈추지 않는다(Linux `/dev/full`)» — `DEV_FULL`(Linux 전용). macOS 에서는 늘 건너뛴다. tmpfs 판은 `apps/api/build-test/log-destination-full-disk.test.ts` 가 잰다.
- `packages/theme-kit/build-test/template.test.ts` «저장소 밖에서 설치하고 빌드한다(WB_TEMPLATE_INSTALL=1)» — 환경변수를 안 줘서 건너뜀(네트워크 설치 판).
- `screen-chromium.test.ts` 는 31 케이스 전부 실행(건너뜀 0 — 브라우저가 떴다).

`typecheck` 12s · `build` 5s 는 짧지만 `--force` · 산출 줄 15개 확인(`error TS` 0, 테마 `.wbtheme` 다섯 모두 출력).

## 빨강의 혼자 돌린 값 · 원인 트랙

빨강 없음 — 해당 없음. 시간 상한 케이스(`ws-lock-cost` 2 케이스 5715ms 통과 · `screen-chromium` 31 통과 · `edit-lost-commit` 통과)도 한 판에서 모두 초록이라 «세 번 + 게이트 재실행» 절차는 일어나지 않았다.

## 겹침 점검 (`git diff --name-only <병합>^1 <병합>`)

| 쌍 | 같은 파일 | 판정 |
| --- | --- | --- |
| N18(26파일) ∩ N19(21파일) | `docs/superpowers/specs/2026-08-03-wirebound-design.md` (문서 한 곳) | 코드 겹침 없음 |
| N18 ∩ N20(8파일) · N17(14) · N16(2) | 없음 | — |
| N19 ∩ N20 | `packages/renderer/src/render.tsx` (N20 +2줄 · N19 +2 −1줄) | 병합 충돌 없이 합쳐짐 · 아래 케이스 초록 |

각 트랙 케이스가 합친 뒤 **실제로 실행됐는지**(실행 수):
- N18 서버: `lock-page-delete` 7 · `lock-store` 39 · `lock-structure` 9 · `migration-0023` 2 · `nesting-limit` 9 · `page-structure-seq` 1 · `ws-lock-cost` 2 — 전부 통과, 건너뜀 0.
- N19 웹: `refusal-head` 1 · `undo-before-ack` 17 · `menu-cascade-delete` 14 · `node-alias` 26 · `text-clamp` 6 · `view-state-address` 8 · 실브라우저 `n19-notices` 9 — 전부 통과.
- N20 렌더러 · 레이아웃: `renderer/fallback` 16 · `renderer/view-keys` 3 · 실브라우저 `n20-layout` 4 · `tree-drag-review` 26 — 전부 통과.
- `packages/schema/test/validate.test.ts` 30 통과.

## 시스템 테마 sha256 (`dist/*.wbtheme` ↔ `system-themes/<이름>/checksums.json` 의 `@1.1.0`)

| 테마 | sha256 | 일치 |
| --- | --- | --- |
| system-admin | `c6a042eb…8ed211` | 일치 |
| system-commerce | `61a087f8…8005d2` | 일치 |
| system-docs | `ab6f7497…fcfe827` | 일치 |
| system-portal | `934f3578…12afeb` | 일치 |
| system-saas-marketing | `e3851e7c…8e0e39d5` | 일치 |

## 덮개 잠듦

`pmset -g log` 의 마지막 `Sleep` 줄은 2026-10-09 12:26 이다. 게이트 구간(10-11 04:51 ~ 05:11)에 `Sleep` · `Clamshell Sleep` 줄이 없다(`PowerUIAgent` 의 MaintenanceWake 보조 줄만 있었다). 겹친 판 없음 → 재실행 없음.

## 보고에 덧붙임

- `pnpm test:build` 한 줄의 벽시계 합은 768s(약 12분 48초)다. 직렬 갈래가 파일을 차례로 돌아 144s, 파일 병렬 `test:browser`(워커 3)가 623s.
- 지침 고칠 곳 없음.
