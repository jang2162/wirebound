# Reference

This page lists every command of the `wireb` CLI, the tools of the `wireb-mcp` server, and the commands of the `wb-theme` kit.
It is for developers who need the exact syntax. The programs print their messages in Korean.

## `wireb`

Install with `npm install -g @wirebound/cli`. Run `wireb --help` for the summary.

| Command | Description |
| --- | --- |
| `wireb init --server <URL> --project <ID>` | Create `.wirebound.json` in the current directory. Makes no network request. |
| `wireb login --email <EMAIL> [--name <LABEL>]` | Issue a token and save it. `--name` labels the token on the **계정** (Account) page. |
| `wireb pull [-o <FILE>]` | Save a read-only snapshot of the project as JSON. |
| `wireb export --format html\|pptx -o <DIR>` | Write a static HTML bundle (many files) or one PPTX file into the directory. |
| `wireb lint [PATH] [--fail-on warning]` | Check the spec for defects. Without `PATH` it checks every page. |
| `wireb page get <PATH> [--json]` | Print one page as its structure, comments, and interactions. |
| `wireb codes list [--json]` | Print the code tables (groups and items) and how many nodes use them. |
| `wireb codes usage <KEY> [CODE] [--json]` | Print the page and module nodes that use a group or an item. |
| `wireb codes set-group <KEY> [--name <NAME>] [--order <N>]` | Create a group (name required) or update it. |
| `wireb codes set-item <KEY> <CODE> [--name <NAME>] [--order <N>] [--active\|--inactive]` | Create or update an item. |
| `wireb codes delete <KEY> [CODE]` | Delete a group with its items, or one item. Nodes that used it keep a broken reference. |

A page path is the menu titles and the page title joined with `/`, for example `주문 관리/주문 목록`.

### Exit codes

| Code | Meaning | What to do |
| --- | --- | --- |
| `0` | Success. `lint` also returns 0 when it finds only warnings. | — |
| `1` | Wrong command or option. | Read the usage text and retry. |
| `2` | Settings or credentials are missing. | Run `wireb init` or `wireb login`. |
| `3` | The server refused the request (permission, lock, or validation). | Read the message. |
| `4` | The server could not be reached. | Check that the server at the saved URL is running. |
| `10` | `lint` found at least one error (or a warning with `--fail-on warning`). | Fix the reported nodes. |
| `70` | A bug in `wireb`. | Report it as an issue. |

Credentials are bound to the pair of server URL and project ID.
If you change `server` in `.wirebound.json`, commands exit with `2`, not `4`, until you run `wireb login` again.

### Example: `wireb lint`

```bash
wireb lint
```

```text
warning	주문 관리/주문 목록 (n_ec42df6a4546)	comment-missing	검색폼(SearchForm)에 코멘트가 없습니다 — 주요 컴포넌트는 설명이 필요합니다
결함 5건 (error 0 · warning 5)
```

Each line holds the severity, the page path with the node ID, the rule, and the message, separated by tabs.

## `wireb-mcp`

Install with `npm install -g @wirebound/mcp`. It is a stdio MCP server. It reads `.wirebound.json` from its working directory or a parent directory, and the token saved by `wireb login`.

| Tool | Description |
| --- | --- |
| `list_pages` | The menu tree and the pages of the project. |
| `get_page` | One page: node tree, comments, and interactions. |
| `patch_page` | Edit one page with JSON Patch operations. Returns `stale` or `locked` when someone else changed or holds the same nodes. |
| `add_comment` | Add a comment to a node. |
| `validate` | Check one page against the component catalog. |
| `list_codes` | The code tables. |
| `code_usage` | The nodes that use a code group or item. |
| `edit_codes` | Create, update, or delete code groups and items. |

The arguments and the conflict rules are described in [`packages/mcp/skill/SKILL.md`](../../../packages/mcp/skill/SKILL.md).

## `wb-theme`

Install with `npm install -D @wirebound/theme-kit` in a theme project.

| Command | Description |
| --- | --- |
| `wb-theme dev [--entry <PATH>] [--port <N>]` | Start the preview gallery with live reload. |
| `wb-theme build [--entry <PATH>] [--out <DIR>]` | Build `<id>-<version>.wbtheme`. |
| `wb-theme check [--entry <PATH>] [--file <.wbtheme>]` | Check the view contract of the source or a built package. |
| `wb-theme shots [--entry <PATH>] [--out <DIR>] [--widths 390,1280] [--browser <CHROMIUM_PATH>]` | Take screenshots of the gallery per viewport width. |

## Next steps

- [Troubleshooting](troubleshooting.md)
