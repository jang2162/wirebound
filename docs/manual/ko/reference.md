<!-- source: docs/manual/en/reference.md @ v0.1.0 -->
# 레퍼런스

`wireb` CLI 의 모든 명령, `wireb-mcp` 서버의 도구, `wb-theme` 키트의 명령 목록입니다.
정확한 문법이 필요한 개발자가 대상입니다.

## `wireb`

`npm install -g @wirebound/cli` 로 설치합니다. 요약은 `wireb --help` 가 찍습니다.

| 명령 | 설명 |
| --- | --- |
| `wireb init --server <URL> --project <ID>` | 지금 디렉터리에 `.wirebound.json` 을 만듭니다. 네트워크를 타지 않습니다. |
| `wireb login --email <EMAIL> [--name <LABEL>]` | 토큰을 발급받아 저장합니다. `--name` 은 **계정** 화면에서 토큰에 붙는 꼬리표입니다. |
| `wireb pull [-o <FILE>]` | 프로젝트의 읽기 전용 스냅샷을 JSON 으로 저장합니다. |
| `wireb export --format html\|pptx -o <DIR>` | 정적 HTML 번들(파일 여럿) 또는 PPTX 파일 하나를 그 디렉터리에 씁니다. |
| `wireb lint [PATH] [--fail-on warning]` | 설계서의 결함을 검사합니다. `PATH` 가 없으면 모든 페이지를 봅니다. |
| `wireb page get <PATH> [--json]` | 페이지 하나를 구조 · 코멘트 · 상호작용으로 찍습니다. |
| `wireb codes list [--json]` | 공통코드(그룹과 항목)와 그것을 쓰는 노드 수를 찍습니다. |
| `wireb codes usage <KEY> [CODE] [--json]` | 그룹이나 항목을 쓰는 페이지 · 모듈의 노드를 찍습니다. |
| `wireb codes set-group <KEY> [--name <NAME>] [--order <N>]` | 그룹을 만들거나(이름 필수) 고칩니다. |
| `wireb codes set-item <KEY> <CODE> [--name <NAME>] [--order <N>] [--active\|--inactive]` | 항목을 만들거나 고칩니다. |
| `wireb codes delete <KEY> [CODE]` | 그룹(항목째) 또는 항목 하나를 지웁니다. 그것을 쓰던 노드는 끊긴 참조로 남습니다. |

페이지 경로는 메뉴 제목들과 페이지 제목을 `/` 로 이은 것입니다. 예: `주문 관리/주문 목록`.

### 종료 코드

| 코드 | 뜻 | 할 일 |
| --- | --- | --- |
| `0` | 성공. `lint` 는 warning 만 찾았을 때도 0 입니다. | — |
| `1` | 명령이나 옵션을 잘못 썼습니다. | 사용법을 읽고 다시 치세요. |
| `2` | 설정이나 자격이 없습니다. | `wireb init` 또는 `wireb login` 을 실행하세요. |
| `3` | 서버가 거절했습니다(권한 · 잠금 · 검증). | 메시지를 읽으세요. |
| `4` | 서버에 닿지 못했습니다. | 저장된 주소의 서버가 떠 있는지 보세요. |
| `10` | `lint` 가 error 를 하나 이상 찾았습니다(`--fail-on warning` 이면 warning 도). | 짚은 노드를 고치세요. |
| `70` | `wireb` 의 버그입니다. | 이슈로 알려 주세요. |

자격은 서버 주소와 프로젝트 ID 의 쌍에 매입니다.
`.wirebound.json` 의 `server` 를 바꾸면 `wireb login` 을 다시 할 때까지 명령이 `4` 가 아니라 `2` 로 끝납니다.

### 예: `wireb lint`

```bash
wireb lint
```

```text
warning	주문 관리/주문 목록 (n_ec42df6a4546)	comment-missing	검색폼(SearchForm)에 코멘트가 없습니다 — 주요 컴포넌트는 설명이 필요합니다
결함 5건 (error 0 · warning 5)
```

줄마다 심각도 · 노드 ID 가 붙은 페이지 경로 · 규칙 · 메시지가 탭으로 갈려 있습니다.

## `wireb-mcp`

`npm install -g @wirebound/mcp` 로 설치합니다. stdio MCP 서버입니다. 작업 디렉터리나 그 위의 `.wirebound.json` 과, `wireb login` 이 저장한 토큰을 읽습니다.

| 도구 | 설명 |
| --- | --- |
| `list_pages` | 프로젝트의 메뉴 트리와 페이지. |
| `get_page` | 페이지 하나의 노드 트리 · 코멘트 · 상호작용. |
| `patch_page` | JSON Patch 연산으로 페이지 하나를 고칩니다. 남이 같은 노드를 바꿨거나 쥐고 있으면 `stale` · `locked` 를 냅니다. |
| `add_comment` | 노드에 코멘트를 더합니다. |
| `validate` | 페이지 하나를 컴포넌트 카탈로그에 비춰 검사합니다. |
| `list_codes` | 공통코드. |
| `code_usage` | 공통코드 그룹 · 항목을 쓰는 노드. |
| `edit_codes` | 공통코드 그룹 · 항목을 만들고 · 고치고 · 지웁니다. |

인자와 충돌 규칙은 [`packages/mcp/skill/SKILL.md`](../../../packages/mcp/skill/SKILL.md)에 있습니다.

## `wb-theme`

테마 프로젝트에 `npm install -D @wirebound/theme-kit` 으로 설치합니다.

| 명령 | 설명 |
| --- | --- |
| `wb-theme dev [--entry <PATH>] [--port <N>]` | 바로 반영되는 미리보기 갤러리를 띄웁니다. |
| `wb-theme build [--entry <PATH>] [--out <DIR>]` | `<id>-<version>.wbtheme` 을 짓습니다. |
| `wb-theme check [--entry <PATH>] [--file <.wbtheme>]` | 소스나 지은 패키지의 뷰 계약을 검사합니다. |
| `wb-theme shots [--entry <PATH>] [--out <DIR>] [--widths 390,1280] [--browser <CHROMIUM_PATH>]` | 뷰포트 폭마다 갤러리의 스크린숏을 찍습니다. |

## 다음 단계

- [문제 해결](troubleshooting.md)
