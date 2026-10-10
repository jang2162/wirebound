# N13 — 합친 판 최종 검증 보고

대상: main `a7d4c5d3`(N1 · N2 · N3 · N4 · N5 · N7 · N8 · N11 병합 뒤). 워크트리 `feat/n13-verify`, Postgres 5513. 소스는 고치지 않았다. 게이트 체인은 `nohup caffeinate -i` 스크립트 하나로 돌렸다(앞 체인 없음 확인).

## 게이트 (2026-10-10 17:42–18:38)

| 게이트 | 결과 | 실행 | 건너뜀 | 실패 | 시간 |
| --- | --- | --- | --- | --- | --- |
| `pnpm typecheck` | rc 0 | (tsc --build --force) | — | 0 | 13s |
| `pnpm build` | rc 0 | 시스템 테마 다섯 `.wbtheme` 생성 | — | 0 | 5s |
| `pnpm test --maxWorkers=25%` | rc 0 | 파일 475 · 케이스 7941 | 1 | 0 | 393s |
| `pnpm test:build` | rc 0 | 파일 92 · 케이스 726 | 1 | 0 | 1581s |
| `pnpm test:browser` | rc 0 | 파일 69 · 케이스 522 | 0 | 0 | 1400s |

건너뜀 까닭:
- `test` 1건 — `apps/api/test/log-destination.test.ts` 의 `/dev/full` 케이스(`it.skipIf(!DEV_FULL)`, Linux 전용 — 이 기계는 macOS).
- `test:build` 1건 — `packages/theme-kit/build-test/template.test.ts` 의 `WB_TEMPLATE_INSTALL=1` 케이스(`it.skipIf(!INSTALL)`, 저장소 밖 설치 — 환경 변수를 안 줘서).

빨강 없음 → 혼자 세 번 돌릴 케이스 · 시간 상한 재실행 없음. 시간 상한 케이스(`ws-lock-cost` 등)도 첫 판에 통과했다.

## N2 ↔ N5 겹침 점검

- `apps/web/test/edit/redo-before-ack.test.tsx` — 3 케이스 전부 실행(`test.log` 의 `✓ … (3 tests)`), 건너뜀 0. 셋째 «다시 실행의 까닭은 정보 통지 한 칸에 서서 앞의 정보 통지를 바꿔 끼운다» 가 N2 정보 통지 한 칸에 redo 까닭이 서는 케이스다.
- `apps/web/build-test/n2-notices.test.ts` — 3 케이스 전부 실행, 통과(`test:build` · `test:browser` 두 판 모두 `(3 tests)`), 건너뜀 0.

## 시스템 테마 sha256 (`dist/*.wbtheme` ↔ `system-themes/<이름>/checksums.json`)

| 테마 | sha256 | checksums.json 일치 |
| --- | --- | --- |
| admin | c6a042eb21a425a72c70fbdc7f8d09c8a9fe46f4dba63c05a10b6651898ed211 | 일치 |
| commerce | 61a087f85e50e88038cfe2d4bf73634f7d82a44daadd74195089a6d9788005d2 | 일치 |
| docs | ab6f7497d1bdd677229d7f20bdb2abd6f82cec70083fa942b57b25906fcfe827 | 일치 |
| portal | 934f35789bfc6bed57ea9f3424bea7a84ae3e834acc6a25420ac79342d12afeb | 일치 |
| saas-marketing | e3851e7ca0cac441c86507c3b9c46d6ecda8be79c80782bb8af6141f8e0e39d5 | 일치 |

## 덮개 잠듦

`pmset -g log` 에서 2026-10-10 날짜의 `Sleep` · `Wake` 줄 0건(마지막 `Sleep` 은 10-09 12:13). 게이트 구간 17:42–18:38 과 겹침 없음 → 다시 돌릴 판 없음.

## 지침 보고

없음.
