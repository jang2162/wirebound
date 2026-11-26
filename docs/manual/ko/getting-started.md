<!-- source: docs/manual/en/getting-started.md @ v0.1.0 -->
# 시작하기

빈 기계에서 시작해 wirebound 서버를 띄우고, 첫 프로젝트를 만들고, 코드 저장소가 그 프로젝트를 읽게 하는 안내입니다.
팀을 위해 wirebound 를 세우는 사람이 대상입니다. 15분쯤 걸리고 대부분은 첫 이미지 빌드 시간입니다.

## 시작하기 전에

- 서버를 띄울 기계에 Compose v2 가 있는 Docker.
- 코드가 있는 기계에 Node.js 22.18 이상.
- Git.

## 1. 서버를 띄웁니다

1. 저장소를 받고 배포 설정 파일을 만드세요.

   ```bash
   git clone https://github.com/jang2162/wirebound.git
   cd wirebound
   cp .env.example .env
   ```

2. `.env` 를 열어 아래 값을 적으세요:

   | 키 | 값 |
   | --- | --- |
   | `POSTGRES_PASSWORD` | 데이터베이스 비밀번호. 영문자와 숫자만 씁니다. |
   | `SEED_USER_EMAIL` | 첫 계정의 이메일. |
   | `SEED_USER_PASSWORD` | 첫 계정의 비밀번호, 8자 이상. |
   | `SEED_USER_ADMIN` | `1`. 이 줄은 직접 더합니다. 첫 계정을 인스턴스 관리자로 만듭니다. |

   `WIREBOUND_DEPLOY=1` 은 그대로 둡니다. 나머지 키는 [설정](configuration.md)에 있습니다.

3. 스택을 짓고 띄우세요.

   ```bash
   docker compose up -d --build
   ```

   첫 빌드는 몇 분 걸립니다. 스택은 서비스 넷(`postgres` · `migrate` · `api` · `web`)입니다.

4. 서버가 답하는지 확인하세요.

   ```bash
   curl -s http://localhost:8080/health
   ```

   ```json
   {"status":"ok"}
   ```

**결과:** 에디터가 `http://localhost:8080` 에서 열립니다.

## 2. 로그인하고 프로젝트를 만듭니다

1. 같은 기계의 브라우저에서 `http://localhost:8080` 을 여세요.
   `localhost` 에서는 HTTPS 없이 로그인됩니다. 다른 기계에서 쓰려면 TLS 를 끝내는 리버스 프록시가 필요합니다. [Docker 로 배포하기](how-to/deploy-with-docker.md)를 보세요.
2. 시딩한 계정으로 로그인하세요.
3. **프로젝트 추가** 를 누르고 이름과 슬러그를 적으세요.
4. 왼쪽 **메뉴·페이지 트리** 에 메뉴와 페이지를 더하고, **컴포넌트** 팔레트에서 컴포넌트를 캔버스로 끌어다 놓으세요.

**결과:** 프로젝트가 에디터에서 열립니다. 주소 창에 `/projects/<project-id>/…` 가 보입니다. 4단계에서 쓸 프로젝트 ID 를 적어 두세요.

## 3. 팀을 초대합니다

공개 가입 화면은 없습니다. 사람은 인스턴스 관리자가 만든 초대 링크로 들어옵니다.

1. 왼쪽 사이드바에서 **초대 링크** 를 여세요. 인스턴스 관리자에게만 보입니다.
2. **초대 링크 만들기** 를 누르고 그 링크를 상대에게 보내세요.
3. 상대가 가입하면 프로젝트의 **설정** › **멤버** 에서 이메일을 적고 역할(`owner` · `editor` · `viewer`)을 고른 뒤 **초대** 를 누르세요.

**결과:** 새 멤버의 프로젝트 목록에 그 프로젝트가 보입니다.

## 4. 코드 저장소를 연결합니다

1. CLI 와 MCP 서버를 설치하세요.

   ```bash
   npm install -g @wirebound/cli @wirebound/mcp
   ```

2. 코드 저장소에서 프로젝트를 연결하고 로그인하세요.

   ```bash
   wireb init --server http://localhost:8080 --project <PROJECT_ID>
   wireb login --email <YOUR_EMAIL>
   ```

   `wireb init` 은 커밋해도 되는 `.wirebound.json` 을 씁니다. 비밀은 담기지 않습니다.
   `wireb login` 은 비밀번호를 묻고 토큰을 `~/.wirebound/credentials.json` 에 저장합니다.

3. 설계서를 받으세요.

   ```bash
   wireb pull -o design.json
   ```

   ```text
   /path/to/your-repo/design.json에 썼습니다
   메뉴 1개 · 페이지 4개
   ```

**결과:** `design.json` 에 프로젝트의 메뉴 · 페이지 · 코멘트 전부의 스냅샷이 담깁니다.

## 5. 설계서를 내보냅니다

에디터 오른쪽 위의 **…** 메뉴에서 **프로젝트 내보내기** 를 고르세요.
어느 브라우저에서나 열리는 정적 번들은 HTML, 페이지마다 화면 이미지가 든 슬라이드는 PPTX 를 고릅니다.

저장소에서도 같은 일을 할 수 있습니다:

```bash
wireb export --format html -o out
```

## 다음 단계

- [코딩 에이전트 연결하기(MCP)](how-to/connect-a-coding-agent.md)
- CI 와 검사는 [코드 저장소 연결하기](how-to/connect-a-repository.md)
- HTTPS · 백업 · 올리기는 [Docker 로 배포하기](how-to/deploy-with-docker.md)
