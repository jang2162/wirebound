# Docker 로 배포하기

저장소 뿌리의 `compose.yaml` 이 **앱만** 올린다 — Postgres · 마이그레이션 · api · 입구(`web`). 입구는 HTTP 포트 하나를 열고, 에디터 정적 번들을
서빙하고, `/api` 와 `/health` 를 api 로 넘긴다. **TLS · 도메인은 각자의 프록시가 맡는다** — 그 프록시에 맞춘 차이(포트를 닫기 · 프록시의
네트워크에 붙기)는 서버마다 쓰는 `compose.override.yaml` 이 갖는다(아래 「앞에 프록시를 세운다」).

이미지 없이도 지킬 조건(api 가 필요로 하는 것 · 브라우저와 한글 글꼴 · 앞단이 지킬 조건 · 화면 그리기 상한)은 최상위 README 「배포하려면」 절이
갖는다. 이 문서의 잰 값은 Colima 의 리눅스 VM(linux/arm64)에서 compose 를 실제로 올려 잰 것이다 — 운영 서버에서 돌려 본 적은 없다(아래
「이 문서가 안 잰 것」).

## 필요한 파일

| 파일 | 무엇 | 커밋 |
| --- | --- | --- |
| `compose.yaml` | 배포 compose. 프로젝트 이름 `wirebound-prod` · 볼륨 `wirebound-prod_pgdata` 로 고정 | 한다 |
| `Dockerfile` · `.dockerignore` | 이미지 둘(`api` · `web`) — 빌드 문맥은 저장소 뿌리 | 한다 |
| `docker/web/Caddyfile` | 입구의 설정 — 이미지에 구워진다 | 한다 |
| `.env.example` | 아래 환경 변수의 템플릿 | 한다 |
| `.env` | 그 서버의 값 — `cp .env.example .env` 로 만든다. compose 가 보간에도 쓰고 api · migrate 컨테이너에도 싣는다(`env_file`) | **안 한다**(`.gitignore`) |
| `compose.override.yaml` | 그 서버의 프록시에 맞춘 차이 | **안 한다**(`.gitignore`) |

`docker/dev/compose.yaml` 은 개발 DB 다(`pnpm db …`) — 배포와 상관없다. 개발 명령은 뿌리의 `.env` 를 안 읽는다.

## 환경 변수

`compose.yaml` 이 읽는 키 전부다. 템플릿은 `.env.example` 이고, **compose 의 `${…}` 를 더하거나 빼면 같은 커밋에서 이 표와 템플릿을 고친다.**

| 키 | 필수 | 설명 | 예시 |
| --- | --- | --- | --- |
| `WIREBOUND_DEPLOY` | 필수(`1`) | 이 자리가 배포 자리라는 표지 — 없으면 `up` · `down` 을 비롯한 `docker compose` 가 멈춘다(아래 「운영 명령」의 `down -v`) | `1` |
| `POSTGRES_PASSWORD` | 필수(비밀) | Postgres 비밀번호. **영숫자로** — 접속 문자열에 그대로 끼운다. 빈 볼륨에서 처음 뜰 때만 읽힌다(뒤에 바꿔도 DB 는 안 바뀐다) | |
| `SEED_USER_EMAIL` | 선택 | 최초 계정의 이메일 — `migrate` 가 만든다(이미 있으면 그대로 둔다). 가입 화면이 없어 첫 계정은 이 길뿐이다 | `me@example.com` |
| `SEED_USER_NAME` | 선택(이메일의 로컬 파트) | 최초 계정의 이름 | |
| `SEED_USER_PASSWORD` | 선택(비밀) | 최초 계정의 비밀번호(8자 이상). 계정을 만든 뒤에는 비워도 된다. api 컨테이너는 시딩 셋을 빈 값으로 받는다 | |
| `SESSION_COOKIE_NAME` | 선택(`wb_session`) | 세션 쿠키 이름 | |
| `SESSION_TTL_HOURS` | 선택(`720`) | 세션 만료(시간) | |
| `LOG_LEVEL` | 선택(`info`) | api 로그 수준 | `debug` |
| `EXPORT_RENDER_LIMIT` | 선택(`2`) | 동시에 뜨는 화면 그리기 브라우저 수 — 서버 메모리로 고른다(README 「화면 그리기 상한」) | `1` |
| `APP_PORT` | 선택(`8080`) | 입구가 호스트에 여는 HTTP 포트 | `8080` |
| `TRUSTED_PROXIES` | 선택(비움 = 아무도 안 믿음) | 입구 앞에 선 프록시의 주소 — 공백으로 가른 IP · CIDR(아래 「믿는 앞단」) | `172.20.0.5` |
| `BACKEND_SUBNET` · `BACKEND_IP_RANGE` · `EDGE_IP` | 선택(`10.231.47.0/24` · `10.231.47.128/25` · `10.231.47.2`) | compose 네트워크의 대역 · 다른 컨테이너가 받는 범위 · 입구의 고정 주소. api 가 믿는 앞단이 `EDGE_IP` 다. 서버의 다른 네트워크와 겹칠 때만 셋을 함께 바꾼다(입구 주소는 대역 안 · 범위 밖) | |
| `WIREBOUND_TAG` | 선택(`local`) | 지은 이미지의 태그(`wirebound-api:<값>` · `wirebound-web:<값>`) | |

- **적지 않는 것:** `HOST` · `PORT` · `NODE_ENV`(이미지가 정한다) · `DATABASE_URL` · `TRUST_PROXY`(compose 가 위 값으로 짓는다) ·
  `POSTGRES_PORT`(개발 compose 의 값 — 있으면 api 가 접속 문자열과 견준다).
- **api 가 읽는 그 밖의 키**(`PASSWORD_SCRYPT_N` · DB 연결 시간 제한 등 — 목록과 뜻은 `apps/api/.env.example`)도 `.env` 에 적으면 api 가 받는다(`env_file`).
- **이미지에는 비밀이 없다** — `.dockerignore` 가 `.env` 를 빌드 문맥에서 빼고, 값은 기동 때 온다.

## 올리기

```bash
# 저장소 뿌리에서
cp .env.example .env          # POSTGRES_PASSWORD · SEED_USER_* 를 채운다(WIREBOUND_DEPLOY=1 은 그대로 둔다)
docker compose up -d --build
```

| 서비스 | 무엇 | 바깥 포트 |
| --- | --- | --- |
| `postgres` | `postgres:16-alpine` · 데이터는 볼륨 `wirebound-prod_pgdata` | 없음 |
| `migrate` | api 이미지로 `src/db/migrate.ts latest` 를 한 번 돌고 끝난다 — 마이그레이션을 올리고 `SEED_USER_*` 로 최초 계정을 만든다. **`up` 마다 다시 돈다** — 다 올라간 DB 에는 아무것도 안 한다 | 없음 |
| `api` | `migrate` 가 종료 0 으로 끝나야 뜬다. 뜰 때 견주기만 하므로 뒤처진 DB 로는 안 뜬다 — `migrate` 가 죽으면 `docker compose logs migrate` 에 까닭이 있다 | 없음 |
| `web` | 입구(Caddy) — 정적 번들 · `/api/*` 와 `/health` 를 api 로. TLS 를 끝내지 않는다 | `${APP_PORT:-8080}` → 80 |

- **이미지는 서버에서 짓는다** — `api` · `migrate` · `web` 은 레지스트리 이미지가 아니라 `pull_policy: build` 다(pull 을 건너뛰고 `up` 이 저장소
  코드로 짓는다). 캐시 없는 빌드가 3분 남짓 · api 이미지 2.0GB 안팎이다(아래 「잰 값」).
- **`container_name` 을 박지 않는다** — 같은 서버의 다른 스택과 겹칠 이름이 없다.
- **기본은 모든 주소의 `8080` 을 연다.** 프록시를 앞에 세우면 override 가 그 포트를 닫거나 루프백으로 좁힌다(아래).
- `.env` 가 없거나 `WIREBOUND_DEPLOY` · `POSTGRES_PASSWORD` 가 비면 `required variable … is missing a value` 로 아무것도 만들거나 지우기 전에
  멈춘다 — `up` 만이 아니라 `ps` · `down` 도 그 줄을 보간한다. 개발 DB 를 띄우려고 뿌리에서 `docker compose --env-file apps/api/.env up -d` 를 쳐도
  그 문장(`… — 개발 DB 는 pnpm db up -d`)으로 멈춘다.

## 확인

```bash
curl -s http://localhost:8080/health            # {"status":"ok"} — 입구 너머 api
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/auth/me   # 401 — /api 가 api 에 닿는다
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/projects/x    # 200 — 깊은 링크도 index.html
docker compose ps -a                            # api 가 healthy · migrate 가 Exited (0)(끝난 컨테이너는 -a 에만 나온다)
```

**로그인은 TLS 너머에서만 선다.** 이미지는 `NODE_ENV=production` 이라 세션 쿠키가 `Secure` 다 — 맨 HTTP 로 연 화면에서는 로그인 200 뒤
`/api/auth/me` 가 401 이다(브라우저가 쿠키를 안 받는다). 예외는 브라우저가 안전한 출처로 보는 `http://localhost:8080` · `http://127.0.0.1:8080` 이다 — 서버
안에서나 SSH 터널(`ssh -L 8080:127.0.0.1:8080` 로 그 서버에 붙어)로 열면 프록시 없이도 로그인이 선다. 사람들이 쓰는 주소는 TLS 를 끝내는 프록시를 앞에 세운다.

## 앞에 프록시를 세운다 — `compose.override.yaml`

서버의 프록시에 맞춘 차이는 뿌리의 `compose.override.yaml` 에 **달라지는 키만** 쓴다. 그 이름은 `.gitignore` 에 있다(커밋하지 않는다).
`-f` 없이 친 `docker compose` 는 그 파일을 스스로 읽고, `-f` 를 주면 `-f compose.yaml -f compose.override.yaml` 로 둘 다 적어야 읽는다.
쓴 뒤에는 결과를 먼저 본다:

```bash
docker compose config        # ports · networks 가 뜻한 대로인가
```

- **리스트(`ports` · `volumes` · `networks`)는 합쳐진다.** override 의 `ports: []` 는 기본 파일의 `8080` 을 닫지 못한다(쟀다 — 그대로 남는다).
  닫으려면 `ports: !reset []`, 바꾸려면 `ports: !override` 다음에 새 목록이다. `!reset` · `!override` 를 못 읽는 옛 Compose 가 있다 —
  그 서버의 `docker compose version` 에서 위 `config` 가 도는지 본다.
- **`web` 의 `backend` 네트워크(고정 주소 `EDGE_IP`)를 빼지 않는다** — api 가 믿는 앞단이 그 주소다. 아래 예는 네트워크를 **더하므로**
  `backend` 가 남는다. `networks: !override` 를 쓰면 `backend`(그 `ipv4_address` 째)를 함께 적는다.
- **믿는 앞단을 함께 적는다** — 프록시의 주소를 `.env` 의 `TRUSTED_PROXIES` 에(아래 「믿는 앞단」). 안 적으면 클라이언트 주소가 전부 그 프록시
  하나로 보여 로그인 제한이 서버 전체에 한 벌로 걸린다.

### ⓐ 프록시 컨테이너가 같은 도커 네트워크에 붙는다

```yaml
# compose.override.yaml — 프록시 컨테이너가 `proxy` 네트워크에서 web 에 닿는다. 그 네트워크는 서버에 먼저 있어야 한다.
services:
  web:
    # 호스트 포트를 닫는다 — 바깥은 프록시를 거쳐서만 닿는다.
    ports: !reset []
    # 더한다(합쳐진다) — `backend`(api 가 믿는 고정 주소)는 그대로 남는다.
    networks:
      proxy:
        # 프록시가 부를 이름. 서비스 이름 `web` 은 같은 네트워크의 다른 스택과 겹칠 수 있다.
        aliases: [wirebound-web]

networks:
  proxy:
    external: true
```

- `proxy` 는 그 서버의 프록시가 쓰는 네트워크 이름이다 — 이름이 다르면 이 파일의 키를 그 이름으로 바꾼다. `external: true` 라 compose 가
  만들지 않는다 — 없으면 `up` 이 죽는다.
- 프록시는 `http://wirebound-web:80` 으로 넘긴다. TLS · 도메인 · 인증서는 프록시의 설정이다.
- `.env` 의 `TRUSTED_PROXIES` 에 **프록시 컨테이너의 주소 하나**를 적는다(그 네트워크에서 고정 주소를 주면 바뀌지 않는다). **네트워크 대역을
  적으면 그 네트워크의 모든 컨테이너를 믿는다** — 같은 네트워크의 다른 컨테이너가 입구에 곧바로 `X-Forwarded-For: 1.1.1.1` 을 실어 보내자 api 가
  `1.1.1.1` 을 봤다(쟀다 · 아래 「잰 값」).
- 프록시가 Caddy 면(예):

  ```
  wirebound.example.com {
  	reverse_proxy wirebound-web:80
  }
  ```

  Caddy 는 받은 `X-Forwarded-For` 를 버리고 자기가 본 주소를 적어 넘긴다(기본값). 다른 프록시는 «받은 머리에 덧붙이거나 새로 적는» 쪽이어야 한다 —
  받은 값을 그대로 넘기면 클라이언트가 지은 값이 끝에 선다.

### ⓑ 프록시가 그 서버의 호스트에서 돈다

```yaml
# compose.override.yaml — 입구를 루프백에만 연다. 호스트의 프록시가 127.0.0.1 로 붙는다.
services:
  web:
    ports: !override
      - '127.0.0.1:${APP_PORT:-8080}:80'
```

- 프록시는 `http://127.0.0.1:8080` 으로 넘긴다. 그 서버의 다른 주소로는 `8080` 이 안 닿는다(쟀다 — LAN 주소로 `000`).
- 루프백으로 붙은 요청을 입구는 `backend` 네트워크의 **게이트웨이** 주소에서 온 것으로 본다 — `TRUSTED_PROXIES` 가 그 주소다:

  ```bash
  docker network inspect wirebound-prod_backend --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
  ```

  게이트웨이는 엔진이 고른다(이 기계에서는 `ip_range` 의 첫 주소 `10.231.47.128`) — 적힌 수를 베끼지 말고 위 명령으로 읽는다.
- **ⓑ 없이(포트가 모든 주소에 열린 채) 게이트웨이를 `TRUSTED_PROXIES` 에 적지 않는다** — 게시 포트로 들어온 요청이 게이트웨이로 보이는 판(이 기계 ·
  리눅스의 IPv6 · 사용자 공간 프록시)에서 바깥의 누구나 `X-Forwarded-For` 를 지어 적는다. 게이트웨이를 믿는 것은 그 포트를 루프백에만 연 때다.

- **nginx 를 앞에 둘 때 잰 지시어** — `proxy_http_version 1.1` 과 `Upgrade` · `Connection` 머리가 없으면 WS 가 **404** 이고 에디터는 재연결을
  되풀이한다. `proxy_read_timeout` 은 25초보다 길게(에디터의 핑 간격 — `5s` 로 두자 WS 가 5.0초에 끊겼다 · 기본 60s 는 넘는다).
  `upstream { keepalive … }` 를 안 두면 상류 연결을 남기지 않는다.
  `X-Forwarded-For` 는 `$proxy_add_x_forwarded_for`(덧붙임)로 싣는다 — 덧붙인 값의 경로는 안 쟀다.

### 믿는 앞단 — `TRUSTED_PROXIES`

입구(`docker/web/Caddyfile`)는 `TRUSTED_PROXIES` 의 주소에서 온 요청만 그 요청의 `X-Forwarded-For` 를 이어받는다. 머리를 **오른쪽부터** 읽어 믿지
않는 첫 주소를 클라이언트로 삼고(`trusted_proxies_strict` — 왼쪽 끝은 클라이언트가 지어 적은 값이다), api 에는 **그 주소 하나**로 새로 적어 넘긴다.
api 는 입구 하나만 믿는다(`TRUST_PROXY` = `EDGE_IP`).

| `TRUSTED_PROXIES` | 프록시가 넘긴 `X-Forwarded-For` | api 가 보는 클라이언트 |
| --- | --- | --- |
| 비움(기본) | 무엇이든 | 입구가 본 소켓 주소(프록시 하나) |
| 프록시의 주소 | `6.6.6.6` | `6.6.6.6` |
| 〃 | `1.1.1.1, 6.6.6.6`(클라이언트가 지은 `1.1.1.1` 뒤에 프록시가 덧붙임) | `6.6.6.6` |
| 〃 | 없음 · IP 가 아님 | 프록시의 주소 |
| 〃 · 믿지 않는 다른 주소에서 온 요청 | `7.7.7.7` | 그 요청의 소켓 주소 |

**클라이언트가 닿는 대역을 적지 않는다** — 적으면 그 대역의 누구나 제 주소를 지어 적는다.

## 운영 명령

저장소 뿌리에서 친다(`compose.yaml` 과 `.env` 가 있는 자리 · override 를 쓰면 그것도 그 자리에 있다).

```bash
# 백업 — 복원은 새 DB 에 pg_restore
docker compose exec -T postgres pg_dump -U wirebound -Fc wirebound > wirebound-$(date +%F).dump

# 올리기 — 새 코드를 받은 뒤. migrate 가 먼저 돌고, api 는 도는 요청을 끝까지 답한 뒤 새 것으로 바뀐다
docker compose up -d --build

# 비밀번호 재설정 — 터미널에서 숨겨 묻는다(README 「비밀번호를 잊었다」)
docker compose exec api node --import tsx src/db/reset-password.ts me@example.com

# 로그인 막힘 풀기 — 떠 있는 api 에 보낸다(README 「에디터가 뜨는데 로그인이 안 된다」의 ⓓ · 주소는 --address <주소>)
docker compose exec api node --import tsx src/auth/unlock-login.ts me@example.com
```

- **`docker compose down -v` 는 운영 DB(`wirebound-prod_pgdata`)를 지운다** — 프로젝트 이름이 고정이라 그 기계의 어느 디렉터리에서 쳐도 같은
  볼륨이다. 배포 값(`WIREBOUND_DEPLOY`)이 없는 자리에서는 멈추지만, `-p wirebound-prod` · `COMPOSE_PROJECT_NAME=wirebound-prod` 로 이름을 밖에서 주면
  compose 는 파일 없이 그 이름의 라벨로 지운다(멈추지 않는다). 컨테이너만 내리려면 `docker compose down`(볼륨 남김)이다.
- **사람을 더 만들려면** `docker compose run --rm -e SEED_USER_EMAIL=… -e SEED_USER_PASSWORD=… migrate` — 시딩은 이미 있는 이메일을 그대로 두므로
  값을 바꿔 다시 돌리면 계정이 하나 는다. 비밀번호가 셸 기록에 남는다 — 곧 위 재설정으로 바꾼다. **`run` 도 `pull_policy: build` 라 api 이미지를
  다시 짓는다** — 받아 둔 새 코드가 있으면 `wirebound-api:local` 태그가 새 코드로 바뀐다(떠 있는 api 는 옛 이미지 그대로 · 다음 `up` 이 새 것을 띄운다).
- **막힘 풀기 · 재설정은 api 가 든 그 컨테이너 · 그 사용자로 친다** — `exec -u root` · `run --rm api …` 로 치면 입구를 못 찾는다(README 「api 가
  필요로 하는 것」).
- **저장소 밖에서 칠 때**(compose 파일이 없는 자리)는 `-p wirebound-prod` 를 붙인다 — 프로젝트 이름이 고정이라 위치와 상관없이 떠 있는 같은
  컨테이너에 닿는다(`exec` · `logs` · `ps` 부류). `up` · `run --rm … migrate` 처럼 compose 파일이 필요한 명령은 뿌리에서 친다 — `-p` 만 주면
  `no configuration file provided` 로 멈춘다.
- 올리는 동안 WS 는 끊겼다 다시 붙는다(에디터가 스스로) — api 가 바뀌는 몇 초 동안 입구는 502 를 낸다.

## 이미 올린 서버가 알아 둘 것

- 프로젝트 이름은 `wirebound-prod`, DB 볼륨은 `wirebound-prod_pgdata` 다 — 같은 서버에서 이 compose 로 올리면 그 볼륨을 잇는다.
- 입구가 여는 포트는 `${APP_PORT:-8080}` 하나다 — 80 · 443 은 열지 않는다. 사람들이 쓰던 주소는 그 서버의 프록시가 받아 입구로 넘긴다(위 ⓐ ⓑ).
- 이 구성은 인증서 볼륨을 쓰지 않는다 — 서버에 `wirebound-prod_caddy-data` · `wirebound-prod_caddy-config` 가 있으면 이 compose 가 안 쓰는
  볼륨이다(`docker volume ls`).
- 배포 값은 뿌리의 `.env` 에서 온다 — `WIREBOUND_DEPLOY=1` 이 있어야 `docker compose` 가 돈다. Komodo 면 Run Directory 가 뿌리다(아래 부록).

## 잰 값

| 단계 | 결과 |
| --- | --- |
| 빌드(이미지 캐시 없음) | 3:01 · 이미지 api 1.98GB · web 86MB |
| `up -d`(이미지 있음) | postgres healthy → migrate 종료 0(마이그레이션 · 시딩) → api healthy → web · 51s |
| 맨 HTTP 로 입구 | `/health` 200 json · `/api/auth/me` 401 json · `/` · `/projects/x` 200 html |
| ⓐ — 외부 네트워크의 Caddy(내부 CA TLS) 너머 | 같은 넷 · `POST /api/auth/login` 200 · 쿠키 `Secure` `HttpOnly` · 다음 `/api/auth/me` 200 · 호스트 포트는 닫힘 |
| ⓑ — `127.0.0.1:18080` | 루프백 200 · 이 기계의 LAN 주소 `000` |
| `down` 뒤 `up` | 사용자 · 세션 수가 같다 · 받아 둔 세션 쿠키로 `/api/auth/me` 200 |
| 이미지 안의 스모크(`screen-chromium.test.ts`) | 31 통과 · 건너뜀 0 |

클라이언트 주소(api 로그의 `remoteAddress` — 같은 네트워크에 고정 주소를 준 컨테이너로 보냈다):

| 판 | api 가 본 주소 |
| --- | --- |
| `TRUSTED_PROXIES` 비움 · 컨테이너 A 가 입구에 `X-Forwarded-For: 6.6.6.6` | A 의 주소 |
| `TRUSTED_PROXIES` = A · 같은 요청 / `1.1.1.1, 6.6.6.6` | `6.6.6.6` / `6.6.6.6` |
| 〃 · 믿지 않는 B 가 `7.7.7.7` | B 의 주소 |
| ⓐ · `TRUSTED_PROXIES` = 프록시 네트워크 **대역** · 같은 네트워크의 컨테이너 D 가 입구에 곧바로 `1.1.1.1` | **`1.1.1.1`** |
| ⓐ · `TRUSTED_PROXIES` = **프록시 주소 하나** · D 가 같은 요청 / C 가 프록시를 거쳐 `1.1.1.1` | D 의 주소 / C 의 주소 |
| ⓑ · `TRUSTED_PROXIES` = 게이트웨이 · 호스트에서 `X-Forwarded-For: 5.5.5.5` / 비움 | `5.5.5.5` / 게이트웨이 |
| B 가 api 에 곧바로 `6.6.6.6` | B 의 주소 — api 가 믿는 것은 입구 하나 |

## 다시 재는 법

이미지 빌드 · 기동은 게이트에 없다. 대신 둘이 있다.

- **값이 맞물리는지** — `pnpm test:build` 의 `apps/api/build-test/deploy-compose.test.ts` 가 `docker compose config` 로 푼 `compose.yaml` 과
  Caddy 이미지의 `caddy adapt` 로 읽은 `docker/web/Caddyfile` 을 잰다(끄는 한도 대 api 의 한도 · 입구의 grace · `TRUST_PROXY` = 입구 주소 ·
  그 주소가 대역 안 · `ip_range` 밖 · 바깥 포트는 입구의 HTTP 하나 · TLS 없음 · 믿는 앞단의 기본값 · 오른쪽부터 고른 주소 하나로 새로 적기).
  docker 가 없으면 건너뛴다.
- **이미지를 새로 지었으면 그 안에서 스모크** — 건너뜀 0 이어야 한다(`-u root` 는 build 프로젝트가 시작할 때 `packages/*` 를 다시 빌드해서다):

  ```bash
  docker run --rm -u root -w /app --entrypoint "" wirebound-api:local \
    node_modules/.bin/vitest run --project build apps/api/build-test/screen-chromium.test.ts
  ```

손으로 재는 한 판 — 운영과 안 겹치게 **프로젝트 이름 · 태그 · 포트 · 대역 셋**을 바꿔 올린다(뿌리의 `.env` 를 채운 뒤). 운영이 떠 있는 서버에서
대역을 그대로 두면 `Pool overlaps with other one on this address space` 로 안 서고, 태그 · 포트를 그대로 두면 운영 이미지 태그를 새로 짓고 운영
포트를 겨룬다. 값은 한 번 `export` 해 모든 줄이 같은 값을 쓰게 한다 — 셸 값이 `.env` 를 이긴다:

```bash
export WIREBOUND_TAG=measure APP_PORT=18080 \
  BACKEND_SUBNET=10.241.47.0/24 BACKEND_IP_RANGE=10.241.47.128/25 EDGE_IP=10.241.47.2
docker compose -p wb-measure up -d --build
docker compose -p wb-measure -f compose.yaml -f compose.override.yaml up -d   # ⓐ · ⓑ 를 잴 때(그 예를 그 이름으로 둔다)
docker compose -p wb-measure logs api | grep remoteAddress              # 클라이언트 주소
docker compose -p wb-measure down -v
unset WIREBOUND_TAG APP_PORT BACKEND_SUBNET BACKEND_IP_RANGE EDGE_IP
```

클라이언트 주소는 이 기계의 게시 포트로 못 잰다(Colima 는 넘긴 요청을 전부 게이트웨이 하나로 보인다) — 같은 네트워크에 고정 주소(대역 안 ·
`ip_range` 밖)를 준 컨테이너로 보낸다: `docker run --rm --network wb-measure_backend --ip 10.241.47.10 caddy:2.11.4 wget -qO- --header 'X-Forwarded-For: 6.6.6.6' http://web/api/auth/me`.

## 이 문서가 안 잰 것

- **x86_64 · 운영 서버** — 전부 linux/arm64 VM 에서 쟀다.
- **실제 도메인의 인증서** — ⓐ 의 TLS 는 Caddy 의 내부 CA(`local_certs`)로만 쟀다.
- **바깥 클라이언트의 진짜 주소** — 이 기계에서는 호스트 게시 포트로 온 요청이 게이트웨이 하나로 보였다. 리눅스 서버에서 바깥 IPv4 는 도커가
  iptables 로 넘겨 주소가 남는다고 알려져 있다 — 안 쟀다. 올린 뒤 바깥에서 한 번 부르고 `docker compose logs api | grep remoteAddress` 가
  프록시 · 게이트웨이 주소면 위 「믿는 앞단」을 다시 본다. 도커의 IPv6 를 안 켠 채 IPv6 로 온 요청은 사용자 공간 프록시를 지나 게이트웨이 주소가
  된다고 알려져 있다 — 안 쟀다. 입구는 `[::]:8080` 도 연다(`docker compose ps`) — 그 판이면 IPv6 클라이언트 전부가 게이트웨이 한 주소로 세어져
  로그인 제한을 함께 쓴다.
- **api 의 종료 한도(30s)를 넘는 일** — 한도 뒤 종료 1 은 `apps/api/test/shutdown.test.ts` 가 재고, 컨테이너에서는 30s 를 넘는 일을 안 돌려 봤다.
- **끄는 동안 도는 응답 · 편집 연결 · 내보내기의 시간** — 입구를 거쳐 이 구성으로 다시 재지 않았다. 그 값에 닿는 입구 설정(`grace_period` ·
  `keepalive` · WS 기본값)과 맞물림은 `deploy-compose.test.ts` 가 잰다.
- **다중 인스턴스** — 실시간 층이 프로세스 하나를 전제한다.

## 부록 — Komodo 로 올릴 때

`compose.yaml` 을 Komodo 의 Stack(Git Repo 소스)으로 올릴 때의 설정이다. 서버 이름 · clone 디렉터리의 호스트 경로 · 프록시 네트워크 이름은 각자
Komodo 에서 고르고 이 표에 적지 않는다. **Stack 을 바꾸면 같은 커밋에서 이 표를 고친다** — Komodo 의 설정은 저장소에서 안 보인다.

| 항목 | 값 | 까닭 |
| --- | --- | --- |
| Name | `wirebound` | |
| Source | Git Repo — `gitlab.develma.com` / `app/wirebound` / `main` · 비공개 저장소라 Komodo 에 등록한 git account 를 고른다 | |
| Project Name | `wirebound-prod` | **비우면 Stack 이름이 `docker compose -p` 로 가서 compose 의 `name` 을 덮는다** — 볼륨이 `wirebound_pgdata` 가 되어 빈 DB 로 뜬다 |
| Run Directory | 비움(저장소 뿌리) | `compose.yaml` 의 `build.context: .` · `env_file: .env` 가 뿌리 기준이다 |
| File Paths | `compose.yaml` → `compose.override.yaml`(그 서버가 쓰면) — **이 순서로** | Komodo 는 `-f` 로 부르므로 override 를 자동으로 읽지 않는다. 순서가 바뀌면 기본 파일이 override 를 덮는다 |
| Env File Path | `.env`(기본값) | 손으로 올릴 때 `cp .env.example .env` 로 만드는 그 자리다 |
| Environment | 위 「환경 변수」 표 | |
| Webhook | **끔** — 사람이 Komodo 에서 Deploy 한다 | Deploy 는 이미지를 다시 짓고 `migrate` 를 돌린 뒤 `api` · `web` 을 다시 만든다. 그리던 pptx 내려받기와 편집 연결(WS)이 끊긴다 |
| override 파일 | `compose.override.yaml` — 그 서버의 프록시에 따라 위 ⓐ 또는 ⓑ 의 내용 | |

- **Environment 는 compose 의 보간용 `.env` 가 된다** — Komodo 가 Run Directory 의 `.env` 로 써서 `--env-file` 로 준다. 그 파일을 compose 가
  `env_file` 로 api · migrate 에도 싣는다.
- **`WIREBOUND_DEPLOY=1` 을 Environment 에 넣는다** — 없으면 Deploy 의 `docker compose` 가 보간에서 멈춘다.
- **비밀 둘은 값 대신 Komodo Variables(Secret)를 참조한다.** Variable 은 Komodo 전체가 공유하므로 이름 앞에 `WIREBOUND_` 를 붙인다:

  ```
  POSTGRES_PASSWORD=[[WIREBOUND_POSTGRES_PASSWORD]]
  SEED_USER_PASSWORD=[[WIREBOUND_SEED_USER_PASSWORD]]
  ```

- **Environment 를 바꾼 뒤에는 Deploy 를 다시 한다** — 떠 있는 컨테이너의 환경은 `up` 때 정해진다.
- **override 파일은 서버에서 쓴다** — Komodo 에는 그 파일을 쓰는 화면이 없다. Periphery 가 clone 한 디렉터리의 뿌리(`compose.yaml` 옆)에 쓰고
  File Paths 에 `compose.yaml` 뒤로 적는다. 그 디렉터리의 호스트 경로는 Periphery 컨테이너 정의(`root_directory` · `stack_dir` 과 그 바인드)에서
  읽는다. 쓴 뒤 그 디렉터리에서 `docker compose -f compose.yaml -f compose.override.yaml config` 로 결과를 보고 Deploy 한다.
- **clone 을 다시 하면(Stack 을 다시 만들거나 저장소 · 브랜치를 바꾸면) override 파일이 지워진다** — 그 상태로 Deploy 하면 File Paths 의 파일이
  없어 실패한다. 내용은 위 ⓐ ⓑ 가 갖고 있다 — 다시 쓴다. 갱신(pull)은 지우지 않는다(`.gitignore` 에 있어 충돌도 없다).
- **운영 명령은** 위 「운영 명령」을 clone 디렉터리에서 치거나, 다른 자리에서 `-p wirebound-prod` 로 친다.
