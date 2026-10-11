# Komodo 로 배포하기

운영 compose(`deploy/docker-compose.yml`)를 **Komodo 의 Stack(Git Repo 소스)** 으로 올릴 때의 Stack 설정이다. 배포 자체(필요한 파일 ·
환경 변수 · 실행 · 확인 · 운영 명령)는 Docker 기준으로 최상위 README 「배포하려면」 절이 갖고, 환경 변수의 키와 뜻은 `deploy/.env.example`
이 갖는다. 이 문서는 Komodo 에서만 달라지는 것만 적는다 — 서버 이름 · 호스트 경로 같은 서버별 값은 각자 Komodo 에서 고른다.

**전제 — wirebound 의 앞단(`web`, Caddy)이 그 서버의 80 · 443 을 직접 쥔다.** 이미 다른 리버스 프록시가 80 · 443 을 쥔 서버라면
아래 「다른 프록시 뒤에 둘 때」 를 먼저 본다.

## Stack 설정

Stack 을 바꾸면 같은 커밋에서 이 표를 고친다 — Komodo 의 설정은 저장소에서 안 보인다.

| 항목 | 값 | 까닭 |
| --- | --- | --- |
| Name | `wirebound` | |
| Source | Git Repo — `gitlab.develma.com` / `app/wirebound` / `main` · 비공개 저장소라 Komodo 에 등록한 git account 를 고른다 | |
| Project Name | `wirebound-prod` | **비우면 Stack 이름이 `docker compose -p` 로 가서 compose 의 `name: wirebound-prod` 를 덮는다** — 볼륨 이름이 `wirebound_pgdata` 로 바뀌어 빈 DB 로 뜬다. 손으로 올리던 서버를 Komodo 로 넘길 때도 같은 볼륨을 이어 쓴다 |
| Run Directory | `deploy` | compose 의 `build.context: ..` · `env_file: .env` 가 이 디렉터리 기준이다 |
| File Paths | `docker-compose.yml` | 서버 덮어쓰기 파일을 쓰면 그 **뒤**에 적는다(아래 「서버 덮어쓰기 파일」) |
| Env File Path | `.env`(기본값) | Run Directory 기준이라 `deploy/.env` 가 된다 — 손으로 올릴 때 `cp deploy/.env.example deploy/.env` 로 만드는 그 자리다 |
| Environment | 아래 「Environment」 | |
| Webhook | **끔** — 사람이 Komodo 에서 Deploy 한다 | Deploy 는 이미지를 다시 짓고(2분 안팎) `migrate` 를 돌린 뒤 `api` · `web` 을 다시 만든다. 그리던 pptx 내려받기와 편집 연결(WS)이 끊긴다 |
| override 파일 | 쓰지 않는다 | 아래 「서버 덮어쓰기 파일」 |

- **Deploy 는 서버에서 이미지를 짓는다.** `api` · `migrate` · `web` 은 레지스트리 이미지가 아니라 `pull_policy: build` 다 — Komodo 가 먼저
  부르는 pull 을 건너뛰고 `up` 이 저장소 코드로 짓는다. api 이미지가 1.8GB 이고 빌드에 메모리를 쓴다(README 「다시 재는 법」).
- **컨테이너 이름을 박지 않는다**(`container_name` 없음) — 같은 서버의 다른 Stack 과 겹칠 이름이 없다.

## Environment

Komodo 는 Stack Environment 를 `deploy/.env` 로 써서 `docker compose --env-file` 로 준다 — 손으로 올릴 때 채우는 `deploy/.env` 와 같은
파일이다. **넣을 키와 뜻은 `deploy/.env.example` 을 그대로 따른다.** Komodo 에서만 다른 것은 셋이다.

- **비밀 둘은 값 대신 Komodo Variables(Secret)를 참조한다.** Variable 은 Komodo 전체가 공유하므로 이름 앞에 `WIREBOUND_` 를 붙인다.

  ```
  POSTGRES_PASSWORD=[[WIREBOUND_POSTGRES_PASSWORD]]
  SEED_USER_PASSWORD=[[WIREBOUND_SEED_USER_PASSWORD]]
  ```

- **`deploy/.env.example` 머리가 «적지 않는» 키는 Environment 에도 넣지 않는다**(`POSTGRES_PORT` · `HOST` · `PORT` · `NODE_ENV` ·
  `DATABASE_URL` · `TRUST_PROXY` — 까닭은 그 머리말).
- **Environment 를 바꾼 뒤에는 Deploy 를 다시 한다** — 떠 있는 컨테이너의 환경은 `up` 때 정해진다.

## 서버에서 운영 명령을 칠 때

README 「백업 · 올리기 · 비밀번호」 절의 명령을 그대로 쓴다. 저장소가 Komodo 의 clone 디렉터리에 있으므로 그 절의 «저장소 밖에서 칠 때»
꼴(`-p wirebound-prod`)로 친다.

## 서버 덮어쓰기 파일

**쓰지 않는다** — 위 전제(앞단이 80 · 443 을 직접 쥔다)에서는 기본 compose 그대로 뜬다.

서버에서만 달라질 것(호스트 경로 볼륨 · 외부 네트워크 · 포트를 닫기)이 생기면 clone 디렉터리 안 `deploy/compose.server.yaml` 에
**달라지는 키만** 쓰고, File Paths 에 `docker-compose.yml` **뒤**로 적는다. 이 파일은 `.gitignore` 에 있다(Periphery 는 갱신할 때
`git pull --rebase --force` 를 하므로 같은 이름이 저장소에 추적되면 충돌한다).

- **리스트(`ports` · `volumes` · `networks`)는 합쳐진다** — 바꾸려면 `!override`, 없애려면 `!reset []` 이다. 쓴 뒤 서버의 `deploy/` 에서
  `docker compose -f docker-compose.yml -f compose.server.yaml config` 로 결과를 보고 Deploy 한다.
- **clone 을 다시 하면(Stack 을 다시 만들거나 저장소 · 브랜치를 바꾸면) 이 파일이 지워진다.** 파일을 쓰면 위 표의 override 파일 칸에
  그 이름과 내용(비밀값 · 서버별 값 제외)을 옮겨 둔다.

## 다른 프록시 뒤에 둘 때

**이 구성은 아직 그 판을 지원하지 않는다.** 앞에 프록시를 하나 더 두면 api 가 보는 클라이언트 주소가 전부 그 프록시 하나가 된다 —
api 는 `web` 만 믿고(`TRUST_PROXY`), `web` 의 Caddy 는 받은 `X-Forwarded-For` 를 버리고 소켓 주소로 새로 적는다(`deploy/Caddyfile`).
그러면 로그인 제한이 서버 전체에 한 벌로 걸린다(README 「앞단(리버스 프록시)이 지킬 조건」). 그 판을 열려면 Caddyfile 의
`trusted_proxies` 와 그 조건의 잰 값을 함께 고쳐야 한다.
