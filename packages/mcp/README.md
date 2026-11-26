# @wirebound/mcp

`wireb-mcp` — wirebound 설계서를 코딩 에이전트에게 여는 **stdio MCP 서버**다. 도구(`list_pages` · `get_page` · `patch_page` · `add_comment` · `validate`)로 페이지를 읽고 고친다. 프로젝트 · 서버 · 토큰은 도구 인자가 아니라 리포의 `.wirebound.json` 과 `wireb login` 이 저장한 자격이 정한다 — 먼저 [`@wirebound/cli`](https://github.com/jang2162/wirebound/tree/main/packages/cli) 로 `wireb init` · `wireb login` 을 한다.

## 설치

```bash
npm install -g @wirebound/mcp
```

Node 22.18 이상.

## 등록 (Claude Code)

```bash
cd <구현 리포>          # .wirebound.json 이 있는 자리
claude mcp add wirebound -- wireb-mcp
```

다른 호스트 · `.mcp.json` 으로 두는 길 · 에이전트에게 가르치는 스킬(이 패키지의 `skill/SKILL.md`)은 저장소 README 의 [「MCP 서버 등록」](https://github.com/jang2162/wirebound#7-mcp-서버-등록) 절이 소유한다.

- 저장소: https://github.com/jang2162/wirebound
- 라이선스: MIT
