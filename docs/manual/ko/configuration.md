<!-- source: docs/manual/en/configuration.md @ v0.1.0 -->
# 설정

wirebound 서버와 `wireb` CLI 에서 바꿀 수 있는 설정의 목록입니다.
값을 찾아보는 운영자와 개발자가 대상입니다.

## 서버 설정(`.env`)

Docker 배포는 저장소 뿌리의 `.env` 를 읽습니다. `cp .env.example .env` 로 만들고, 커밋하지 마세요.
값을 바꾼 뒤 `docker compose up -d` 로 적용합니다.

| 키 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `WIREBOUND_DEPLOY` | `1` | 필수 | 이 체크아웃이 배포 자리라는 표지. 없으면 모든 `docker compose` 명령이 멈춥니다. |
| `POSTGRES_PASSWORD` | 글자 | 필수 | 데이터베이스 비밀번호. 영문자와 숫자만 씁니다. 데이터베이스 볼륨을 만들 때만 읽힙니다. |
| `SEED_USER_EMAIL` | 이메일 | 비움 | 첫 계정의 이메일. `migrate` 가 만들고, 이미 있는 계정은 그대로 둡니다. |
| `SEED_USER_NAME` | 글자 | 이메일의 로컬 파트 | 첫 계정의 표시 이름. |
| `SEED_USER_PASSWORD` | 글자 | 비움 | 첫 계정의 비밀번호, 8–200자. 계정이 생긴 뒤에는 비워도 됩니다. |
| `SEED_USER_ADMIN` | `1` | 비움 | 새로 만드는 시딩 계정을 인스턴스 관리자로 만듭니다. 이미 있는 계정은 바꾸지 않습니다. |
| `SESSION_COOKIE_NAME` | 글자 | `wb_session` | 세션 쿠키 이름. |
| `SESSION_TTL_HOURS` | 수 | `720` | 세션 수명(시간). |
| `LOG_LEVEL` | 글자 | `info` | API 로그 수준. 예: `debug`. |
| `EXPORT_RENDER_LIMIT` | 수 | `2` | PPTX 화면 이미지용 헤드리스 브라우저를 동시에 몇 개 띄우나. 메모리 4 GB 미만이면 `1`. |
| `ASSET_FILE_MAX_BYTES` | 수 | `5242880`(5 MB) | 그림 파일 하나의 상한. 넘으면 413. |
| `ASSET_PROJECT_MAX_BYTES` | 수 | `209715200`(200 MB) | 프로젝트 하나의 그림 합. 그림은 데이터베이스에 살아서, 이 값이 백업이 자라는 폭을 묶습니다. |
| `ASSET_PERSONAL_MAX_BYTES` | 수 | `104857600`(100 MB) | 한 사람의 개인 모듈 그림 합. |
| `APP_PORT` | 수 | `8080` | 입구 `web` 이 호스트에 여는 HTTP 포트. |
| `TRUSTED_PROXIES` | IP · CIDR | 비움(아무도 안 믿음) | 입구 앞에 선 리버스 프록시의 주소, 공백으로 가릅니다. 클라이언트가 닿는 대역은 절대 적지 마세요. |
| `BACKEND_SUBNET` · `BACKEND_IP_RANGE` · `EDGE_IP` | CIDR · CIDR · IP | `10.231.47.0/24` · `10.231.47.128/25` · `10.231.47.2` | 내부 Compose 네트워크. 서버의 다른 네트워크와 겹칠 때만 셋을 함께 바꿉니다. |
| `WIREBOUND_TAG` | 글자 | `local` | 서버에서 지은 이미지의 태그. |

`HOST` · `PORT` · `NODE_ENV` · `DATABASE_URL` · `TRUST_PROXY` · `POSTGRES_PORT` 는 여기 적지 마세요. 이미지와 `compose.yaml` 이 정합니다.
`PASSWORD_SCRYPT_N` · 데이터베이스 시간 제한 같은 다른 API 설정과 그 뜻은 [`apps/api/.env.example`](../../../apps/api/.env.example)에 있습니다. API 는 그 값도 `.env` 에서 받습니다.

## CLI 설정

| 이름 | 자리 | 설명 |
| --- | --- | --- |
| `.wirebound.json` | 저장소 뿌리 | `server` 와 `projectId`. `wireb init` 이 만듭니다. 커밋해도 됩니다. |
| `~/.wirebound/credentials.json` | 홈 디렉터리 | `wireb login` 이 저장한 토큰, 파일 권한 `600`. |
| `WIREB_TOKEN` | 환경 변수 | 자격 파일 대신 쓸 토큰. |
| `WIREB_CREDENTIALS` | 환경 변수 | 다른 자격 파일 경로. |
| `WIREB_PASSWORD` | 환경 변수 | 터미널이 없을 때 `wireb login` 의 비밀번호. |

## 다음 단계

- [Docker 로 배포하기](how-to/deploy-with-docker.md)
- [레퍼런스](reference.md)
