<!-- source: docs/manual/en/how-to/connect-a-repository.md @ v0.1.0 -->
# 코드 저장소 연결하기

`wireb` CLI 로 구현 저장소를 wirebound 프로젝트에 연결해, 개발자와 CI 가 설계서를 읽고 · 검사하고 · 내보내게 하는 안내입니다.
개발자가 대상입니다. 프로젝트 ID 와 그 프로젝트의 멤버 계정이 필요합니다.

## CLI 를 설치합니다

```bash
npm install -g @wirebound/cli
```

저장소마다 판을 고정하려면 개발 의존으로 설치하세요: `npm install -D @wirebound/cli` 뒤 `npx wireb` 로 실행합니다.

## 저장소를 연결합니다

1. 저장소 뿌리에서 연결 파일을 만드세요.

   ```bash
   wireb init --server <SERVER_URL> --project <PROJECT_ID>
   ```

   서버 주소와 프로젝트 ID 가 든 `.wirebound.json` 이 생깁니다. 커밋하세요. 토큰은 절대 담기지 않습니다.

2. 로그인해 토큰을 받으세요.

   ```bash
   wireb login --email <YOUR_EMAIL>
   ```

   토큰은 파일 권한 `600` 인 `~/.wirebound/credentials.json` 에 저장됩니다.
   이 프로젝트 하나에만 쓰입니다. 다른 프로젝트에 쓰면 404 입니다.

## 설계서를 읽습니다

| 할 일 | 명령 |
| --- | --- |
| 프로젝트 전체의 스냅샷 저장 | `wireb pull -o design.json` |
| 페이지 하나를 구조 · 코멘트 · 상호작용으로 찍기 | `wireb page get "<MENU>/<PAGE>"` |
| 설계서의 결함 검사 | `wireb lint` |
| 정적 HTML 번들 내보내기 | `wireb export --format html -o <DIR>` |
| PPTX 덱 내보내기 | `wireb export --format pptx -o <DIR>` |

페이지 경로는 메뉴 제목들과 페이지 제목을 `/` 로 이은 것입니다. 예: `wireb page get "주문 관리/주문 목록"`.

## CI 에서 돌립니다

CI 에는 터미널이 없으므로 자격을 환경 변수로 줍니다:

| 변수 | 쓰임 |
| --- | --- |
| `WIREB_PASSWORD` | 터미널이 없을 때 `wireb login` 의 비밀번호. 표준입력으로 줘도 됩니다. |
| `WIREB_TOKEN` | 자격 파일 대신 쓸 토큰. |
| `WIREB_CREDENTIALS` | 다른 자격 파일 경로. |

`wireb lint` 는 error 를 찾으면 종료 코드 10 으로 끝납니다. warning 에서도 실패하게 하려면 `--fail-on warning` 을 붙이세요:

```bash
wireb lint --fail-on warning
```

## 토큰을 거둡니다

왼쪽 사이드바의 **계정** 을 여세요. **API 토큰** 절이 만든 토큰을 전부 보여 주고, 하나씩 또는 한꺼번에 폐기하게 합니다.

## 다음 단계

- [코딩 에이전트 연결하기(MCP)](connect-a-coding-agent.md)
- 명령과 종료 코드 전부는 [레퍼런스](../reference.md)
