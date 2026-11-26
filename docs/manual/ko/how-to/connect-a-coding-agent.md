<!-- source: docs/manual/en/how-to/connect-a-coding-agent.md @ v0.1.0 -->
# 코딩 에이전트 연결하기(MCP)

`wireb-mcp` 서버를 코딩 에이전트에 등록해, 에이전트가 화면을 구현하면서 페이지를 읽고 · 검사하고 · 코멘트를 남기게 하는 안내입니다.
Claude Code 처럼 MCP 를 쓰는 에이전트의 개발자가 대상입니다. 먼저 `wireb init` 과 `wireb login` 으로 연결한 저장소가 있어야 합니다. [코드 저장소 연결하기](connect-a-repository.md)를 보세요.

## 프로젝트를 찾는 법

`wireb-mcp` 는 stdio MCP 서버입니다. 프로젝트 · 서버 · 토큰은 도구 인자가 아닙니다.
서버는 작업 디렉터리에서 위로 올라가며 `.wirebound.json` 을 찾고, `wireb login` 이 저장한 토큰을 읽습니다.
그래서 `.wirebound.json` 이 있는 저장소에서 등록합니다.

## Claude Code 에 등록합니다

1. 서버를 설치하세요.

   ```bash
   npm install -g @wirebound/mcp
   ```

2. 연결한 저장소에서 등록하세요.

   ```bash
   cd <YOUR_REPO>
   claude mcp add wirebound -- wireb-mcp
   claude mcp list
   ```

   ```text
   wirebound: wireb-mcp  - ✔ Connected
   ```

팀과 설정을 나누려면 대신 `.mcp.json` 파일을 저장소에 커밋하세요:

```json
{ "mcpServers": { "wirebound": { "command": "wireb-mcp", "args": [] } } }
```

Claude Code 는 프로젝트 `.mcp.json` 의 서버를 처음 쓸 때 사람마다 승인을 받습니다.

stdio 서버를 받는 다른 MCP 호스트도 같은 명령을 씁니다. 이 프로젝트가 확인한 것은 Claude Code 뿐입니다.

## 에이전트가 할 수 있는 일

| 도구 | 쓰임 |
| --- | --- |
| `list_pages` | 메뉴 트리와 페이지를 나열합니다. |
| `get_page` | 페이지 하나의 노드 트리 · 코멘트 · 상호작용을 읽습니다. |
| `patch_page` | JSON Patch 연산으로 페이지를 고칩니다. |
| `add_comment` | 노드에 코멘트를 남깁니다. |
| `validate` | 페이지를 컴포넌트 카탈로그에 비춰 검사합니다. |
| `list_codes` | 공통코드(그룹과 항목)를 읽습니다. |
| `code_usage` | 공통코드 그룹 · 항목을 쓰는 노드를 찾습니다. |
| `edit_codes` | 공통코드 그룹 · 항목을 만들고 · 고치고 · 지웁니다. |

에이전트가 무엇을 고칠 수 있는지는 프로젝트에서의 역할을 따릅니다. `viewer` 토큰은 읽기만 합니다.

## 에이전트에게 규칙을 가르칩니다

패키지에 스킬 파일 `skill/SKILL.md` 가 듭니다. 경로 쓰는 법, 편집 충돌(`stale` · `locked`), `validate` 결과 읽는 법을 설명합니다.
에이전트에 스킬로 설치하거나 에이전트 지침에 넣으세요. 원본은 [`packages/mcp/skill/SKILL.md`](../../../../packages/mcp/skill/SKILL.md)입니다.

서버마다 에이전트용 영어 안내를 `/llms.txt` 로 냅니다. 예: `http://localhost:8080/llms.txt`.

## 다음 단계

- [레퍼런스](../reference.md)
- [문제 해결](../troubleshooting.md)
