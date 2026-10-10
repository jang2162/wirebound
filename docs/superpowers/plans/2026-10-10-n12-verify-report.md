# N12 — 합친 판 검증 보고

기준: `feat/n12-verify` (main `f3ef329c`, N1 · N3 · N7 · N11 + 앞서 N6 · N9 병합). 코드를 고치지 않았다. 2026-10-10 14:13–15:24, 체인 스크립트 하나(`nohup caffeinate -i`), 자기 Postgres 5511.

## 게이트

| 게이트 | 시간 | 실행 | 건너뜀 | 실패 |
| --- | --- | --- | --- | --- |
| `pnpm typecheck` (`tsc --build --force`) | 14s | 오류 0 | — | 0 |
| `pnpm build` | 5s | 패키지 · 테마 다섯 `.wbtheme` 생성 | — | 0 |
| `pnpm test --maxWorkers=20%` | 549s | 7888 통과 (471 파일) | 1 | 0 |
| `pnpm test:build` | 1900s | 702 통과 (90 파일) | 1 | 0 |
| `pnpm test:browser` | 1782s | 498 통과 (67 파일) | 0 | 0 |

건너뜀 까닭:
- `test`: `apps/api/test/log-destination.test.ts` «공간이 찬 채로 … (Linux `/dev/full`)» — macOS 에는 `/dev/full` 이 없다(`skipIf(!DEV_FULL)`). tmpfs 판은 `test:build` 의 `log-destination-full-disk` 가 잰다(전제가 서면 돈다).
- `test:build`: `packages/theme-kit/build-test/template.test.ts` «저장소 밖에서 설치하고 빌드한다» — `WB_TEMPLATE_INSTALL=1` 을 안 줘서 건너뜀(설계된 옵트인).

빨강이 없어 혼자 돌리기 · 원인 트랙 가림은 해당 없다. `test:browser` 는 N1 이 따로 안 돌렸던 칸이며 이번에 전량 통과했다.

## 시스템 테마 sha256

다섯 모두 `dist/*.wbtheme` 의 `shasum -a 256` 이 `system-themes/<이름>/checksums.json` 의 `@1.1.0` 항목과 일치한다.

| 테마 | sha256 (앞 12자) |
| --- | --- |
| system-admin | c6a042eb21a4 |
| system-commerce | 61a087f85e50 |
| system-docs | ab6f7497d1bd |
| system-portal | 934f35789bfc |
| system-saas-marketing | e3851e7ca0ca |

## 덮개 잠듦

`pmset -g log` 에서 2026-10-10 14:13–15:24 구간의 `Sleep` 줄은 0 개(마지막 잠듦은 10-09 12:26). 겹친 판 없음 — 다시 돌리지 않았다.

## 정리

소스 변경 없음. 띄운 서버 없음(체인 종료 후 남은 vitest · vite 프로세스 없음). Postgres 컨테이너 `feat-n12-verify-postgres-1`(5511)은 이 워크트리 것이라 코디네이터 폐기 때 내린다.
