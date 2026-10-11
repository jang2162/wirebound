# Komodo 로 배포하기

운영 compose(`deploy/docker-compose.yml`)를 **Komodo 의 Stack(Git Repo 소스)** 으로 올리는 설정이다. compose 의 서비스 · 잰 값 ·
앞단 조건은 최상위 README 「배포하려면」 절이 갖는다. 이 문서는 Komodo 쪽 설정과 저장소 쪽 파일이 어떻게 맞물리는지만 적는다.

**전제 — wirebound 의 앞단(`web`, Caddy)이 그 서버의 80 · 443 을 직접 쥔다.** 이미 다른 리버스 프록시가 80 · 443 을 쥔 서버라면
아래 「다른 프록시 뒤에 둘 때」 를 먼저 본다.

## Stack 설정

Stack 을 바꾸면 같은 커밋에서 이 표를 고친다 — Komodo 의 설정은 저장소에서 안 보인다.

| 항목 | 값 | 까닭 |
| --- | --- | --- |
| Name | `wirebound` | |
| Project Name | `wirebound-prod` | **비우면 Stack 이름이 `docker compose -p` 로 가서 compose 의 `name: wirebound-prod` 를 덮는다** — 볼륨 이름이 `wirebound_pgdata` 로 바뀌어 빈 DB 로 뜬다. 손으로 올리던 서버를 Komodo 로 넘길 때도 같은 볼륨을 이어 쓴다 |
| Server | (배치할 Komodo 서버) | |
| Source | Git Repo — `gitlab.develma.com` / `app/wirebound` / `main` · 비공개 저장소라 Komodo 에 등록한 git account | |
| Run Directory | `deploy` | compose 의 `build.context: ..` · `env_file: .env` 가 이 디렉터리 기준이다 |
| File Paths | `docker-compose.yml` | 서버 덮어쓰기 파일을 쓰면 그 **뒤**에 적는다(아래 「서버 덮어쓰기 파일」) |
| Env File Path | `.env`(기본값) | Run Directory 기준이라 `deploy/.env` 가 된다 — 손으로 올릴 때 `cp deploy/.env.example deploy/.env` 로 만들던 그 자리다 |
| Environment | 아래 「환경 변수」 | |
| Webhook | **끔** — 사람이 Komodo 에서 Deploy 한다 | Deploy 는 이미지를 다시 짓고(2분 안팎) `migrate` 를 돌린 뒤 `api` · `web` 을 다시 만든다. 그리던 pptx 내려받기와 편집 연결(WS)이 끊긴다 |

- **Deploy 는 서버에서 이미지를 짓는다.** `api` · `migrate` · `web` 은 레지스트리 이미지가 아니라 `pull_policy: build` 다 — Komodo 가 먼저
  부르는 pull 을 건너뛰고 `up` 이 저장소 코드로 짓는다. api 이미지가 1.8GB 이고 빌드에 메모리를 쓴다(README 「다시 재는 법」).
- **컨테이너 이름을 박지 않는다**(`container_name` 없음) — 같은 서버의 다른 Stack 과 겹칠 이름이 없다.

## 환경 변수

Komodo 는 Stack Environment 를 `deploy/.env` 로 써서 `docker compose --env-file` 로 준다. 그 파일이 **compose 의 `${…}` 를 채우고**,
compose 의 `env_file: .env` 가 같은 파일을 `migrate` · `api` 컨테이너에 싣는다. 키의 뜻과 기본값은 `deploy/.env.example` 이 정본이다.

| 키 | 필수 | 설명 | Komodo 에 넣는 값 |
| --- | --- | --- | --- |
| `SITE_ADDRESS` | 필수 | 앞단이 받을 주소. 도메인이면 Caddy 가 인증서를 받는다 — 그 도메인이 서버를 가리키고 80 · 443 이 바깥에서 닿아야 한다 | `wirebound.example.com` |
| `POSTGRES_PASSWORD` | 필수(비밀) | **영숫자만** — 접속 문자열에 그대로 끼운다. 처음 `up` 한 뒤에 바꿔도 DB 는 안 바뀐다 | `[[WIREBOUND_POSTGRES_PASSWORD]]` |
| `SEED_USER_EMAIL` · `SEED_USER_NAME` | 선택 | 최초 계정. `migrate` 만 읽는다 | |
| `SEED_USER_PASSWORD` | 선택(비밀) | 최초 계정 비밀번호. 계정을 만든 뒤에는 키를 지워도 된다 | `[[WIREBOUND_SEED_USER_PASSWORD]]` |
| `SESSION_COOKIE_NAME` | 선택(`wb_session`) | 세션 쿠키 이름 | |
| `SESSION_TTL_HOURS` | 선택(`720`) | 세션 만료(시간) | |
| `LOG_LEVEL` | 선택(`info`) | 로그 수준 | |
| `EXPORT_RENDER_LIMIT` | 선택 | 동시에 뜨는 화면 그리기 브라우저 수(README 「화면 그리기 상한」) | |
| `HTTP_PORT` · `HTTPS_PORT` | 선택(`80` · `443`) | 앞단의 바깥 포트 | |
| `BACKEND_SUBNET` · `BACKEND_IP_RANGE` · `EDGE_IP` | 선택 | compose 네트워크 대역 · 다른 컨테이너가 받는 범위 · 앞단 고정 주소. 서버의 다른 네트워크와 겹칠 때만 **셋을 함께** 바꾼다 | |
| `WIREBOUND_TAG` | 선택(`local`) | 지은 이미지의 태그 | |

- **비밀값은 Komodo Variables 에 Secret 으로 두고 `[[…]]` 로 참조한다.** Variable 은 Komodo 전체가 공유하므로 이름 앞에 `WIREBOUND_` 를 붙인다.
- **넣지 않는 키:** `POSTGRES_PORT`(개발용 compose 의 값 — 있으면 api 가 접속 문자열과 견주고 안 뜬다) · `DATABASE_URL` · `TRUST_PROXY`
  (compose 가 짓는다) · `HOST` · `PORT` · `NODE_ENV`(이미지가 정한다).
- **Environment 를 바꾼 뒤에는 Deploy 를 다시 한다** — 떠 있는 컨테이너의 환경은 `up` 때 정해진다.
- compose 에 변수를 더하거나 빼면 같은 커밋에서 `deploy/.env.example` 과 이 표를 고친다.

## 서버에서 운영 명령을 칠 때

README 「백업 · 올리기 · 비밀번호」 의 명령은 저장소 뿌리에서 `-f deploy/docker-compose.yml` 로 친다. Komodo 서버에서는 저장소가 Komodo 의
clone 디렉터리에 있으므로 **프로젝트 이름으로** 친다 — 위치와 상관없이 같은 컨테이너에 닿는다.

```bash
docker compose -p wirebound-prod exec -T postgres pg_dump -U wirebound -Fc wirebound > wirebound-$(date +%F).dump
docker compose -p wirebound-prod exec api node --import tsx src/db/reset-password.ts me@example.com
```

`run --rm … migrate` 처럼 compose 파일이 필요한 명령은 clone 디렉터리의 `deploy/` 에서 친다(위치는 아래 「clone 디렉터리」).

## 서버 덮어쓰기 파일

**지금은 쓰지 않는다** — 위 전제(앞단이 80 · 443 을 직접 쥔다)에서는 기본 compose 그대로 뜬다.

서버에서만 달라질 것(호스트 경로 볼륨 · 외부 네트워크 · 포트를 닫기)이 생기면 Komodo 의 clone 디렉터리 안 `deploy/compose.server.yaml` 에
**달라지는 키만** 쓰고, File Paths 에 `docker-compose.yml` **뒤**로 적는다. 이 파일은 `.gitignore` 에 있다(Periphery 는 갱신할 때
`git pull --rebase --force` 를 하므로 같은 이름이 저장소에 추적되면 충돌한다).

- **리스트(`ports` · `volumes` · `networks`)는 합쳐진다** — 바꾸려면 `!override`, 없애려면 `!reset []` 이다. 쓴 뒤 서버에서
  `docker compose -f docker-compose.yml -f compose.server.yaml config` 로 결과를 보고 Deploy 한다.
- **clone 을 다시 하면(Stack 을 다시 만들거나 저장소 · 브랜치를 바꾸면) 이 파일이 지워진다.** 파일을 쓰면 그 내용(비밀값 제외)을 이 절에 그대로 옮겨 둔다.

## clone 디렉터리

Periphery 는 저장소를 `{stack_dir}/{Stack 이름}` 에 clone 한다(`stack_dir` 기본값 `/etc/komodo/stacks`). 덮어쓰기 파일을 쓰거나 서버에서
`deploy/` 로 들어가야 하면, Periphery 컨테이너 정의에서 그 경로가 호스트의 어디에 바인드됐는지 읽어 아래 칸을 채운다.

| 호스트 경로 | Periphery 컨테이너 경로 |
| --- | --- |
| (서버에서 확인해 적는다) | `{stack_dir}/wirebound/` |

## 다른 프록시 뒤에 둘 때

**이 구성은 아직 그 판을 지원하지 않는다.** 앞에 프록시를 하나 더 두면 api 가 보는 클라이언트 주소가 전부 그 프록시 하나가 된다 —
api 는 `web` 만 믿고(`TRUST_PROXY`), `web` 의 Caddy 는 받은 `X-Forwarded-For` 를 버리고 소켓 주소로 새로 적는다(`deploy/Caddyfile`).
그러면 로그인 제한이 서버 전체에 한 벌로 걸린다(README 「앞단(리버스 프록시)이 지킬 조건」). 그 판을 열려면 Caddyfile 의
`trusted_proxies` 와 그 조건의 잰 값을 함께 고쳐야 한다.
