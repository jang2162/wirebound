<!-- source: docs/manual/en/how-to/deploy-with-docker.md @ v0.1.0 -->
# Docker 로 배포하기

리눅스 서버 한 대에서 Docker Compose 로 wirebound 를 띄우고, 직접 둔 HTTPS 리버스 프록시 뒤에 세우는 안내입니다.
서버를 운영하는 사람이 대상입니다. [시작하기](../getting-started.md) 1단계를 마쳤다고 봅니다.

## 스택에 든 것

저장소 뿌리의 `compose.yaml` 은 애플리케이션만 띄웁니다. TLS 와 도메인은 리버스 프록시가 맡습니다.

| 서비스 | 하는 일 | 호스트 포트 |
| --- | --- | --- |
| `postgres` | PostgreSQL 16. 데이터는 볼륨 `wirebound-prod_pgdata` 에 삽니다. | 없음 |
| `migrate` | 데이터베이스 마이그레이션을 올리고 시딩 계정을 만든 뒤 끝납니다. `up` 마다 돕니다. | 없음 |
| `api` | REST · WebSocket 서버. `migrate` 가 종료 코드 0 으로 끝나야 뜹니다. | 없음 |
| `web` | 입구(Caddy). 에디터를 내주고 `/api` 와 `/health` 를 `api` 로 넘깁니다. | `APP_PORT`(기본 `8080`) |

이미지는 저장소에서 서버가 직접 짓습니다. 그래서 올리기도 `docker compose up -d --build` 입니다.

## 앞에 HTTPS 프록시를 둡니다

세션 쿠키가 `Secure` 라서 브라우저는 HTTPS 나 `localhost` 에서만 로그인합니다.
맨 HTTP 에서는 로그인 요청은 성공하지만 다음 요청이 401 을 냅니다.

1. 리버스 프록시(nginx · Caddy · Traefik 등)가 `web` 서비스를 가리키게 하세요.
   사이트 전체를 넘깁니다. `/api` 를 다른 백엔드로 떼어 내지 마세요.
2. 프록시가 `/api/projects/<id>/ws` 의 WebSocket 업그레이드를 넘기게 하고, 유휴 제한을 25초보다 길게 두세요.
3. 프록시의 IP 주소를 `.env` 의 `TRUSTED_PROXIES` 에 적으세요.
   안 적으면 모든 클라이언트가 프록시 하나로 보여 로그인 시도 제한이 모두에게 한꺼번에 걸립니다.
4. 서버마다 다른 변경(8080 포트 닫기 · 프록시의 네트워크에 붙기)은 `compose.yaml` 옆의 `compose.override.yaml` 에 두세요.
   그 파일은 Git 이 무시하고 `docker compose` 가 스스로 읽습니다.

스택을 띄우기 전에 합친 결과를 확인하세요:

```bash
docker compose config
```

## 평소에 쓰는 명령

`compose.yaml` 과 `.env` 가 있는 저장소 뿌리에서 실행하세요.

| 할 일 | 명령 |
| --- | --- |
| 데이터베이스 백업(올린 그림도 함께 듭니다) | `docker compose exec -T postgres pg_dump -U wirebound -Fc wirebound > wirebound-$(date +%F).dump` |
| `git pull` 뒤 올리기 | `docker compose up -d --build` |
| 비밀번호 재설정 | `docker compose exec api node --import tsx src/db/reset-password.ts <EMAIL>` |
| 로그인 막힘 풀기 | `docker compose exec api node --import tsx src/auth/unlock-login.ts <EMAIL>` |
| 로그 보기 | `docker compose logs -f api` |

> [!WARNING]
> `docker compose down -v` 는 운영 데이터베이스 볼륨을 지웁니다. 데이터를 남기고 멈추려면 `docker compose down` 을 쓰세요.

## PPTX 화면 이미지의 메모리 상한을 고릅니다

PPTX 내보내기는 화면마다 헤드리스 브라우저를 띄웁니다. `EXPORT_RENDER_LIMIT` 가 동시에 도는 수를 묶습니다(기본 `2`).
이 프로젝트가 잰 값으로 최악의 판이 `2` 에서 3.1 GB, `1` 에서 1.9 GB 쯤 썼습니다.
메모리가 4 GB 보다 적은 서버에서는 `1` 로 두세요.

## 더 알아보기

운영 안내 [`docs/guides/deploy-docker.md`](../../../guides/deploy-docker.md)에 환경 변수 전부, 두 가지 프록시 배치의 override 예, 잰 값, Komodo 설정이 있습니다.

## 다음 단계

- [설정](../configuration.md)
- [문제 해결](../troubleshooting.md)
