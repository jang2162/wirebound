# Connect a coding agent (MCP)

This guide registers the `wireb-mcp` server with a coding agent, so the agent can read pages, check them, and leave comments while it implements screens.
It is for developers who use an MCP-capable agent such as Claude Code. You need a repository linked with `wireb init` and `wireb login` first, see [Connect a code repository](connect-a-repository.md).

## How it finds the project

`wireb-mcp` is a stdio MCP server. The project, the server, and the token are not tool arguments.
The server reads `.wirebound.json`, searching upward from its working directory, and the token saved by `wireb login`.
So register it from the repository that holds `.wirebound.json`.

## Register with Claude Code

1. Install the server.

   ```bash
   npm install -g @wirebound/mcp
   ```

2. Register it from the linked repository.

   ```bash
   cd <YOUR_REPO>
   claude mcp add wirebound -- wireb-mcp
   claude mcp list
   ```

   ```text
   wirebound: wireb-mcp  - ✔ Connected
   ```

To share the setting with your team, commit a `.mcp.json` file in the repository instead:

```json
{ "mcpServers": { "wirebound": { "command": "wireb-mcp", "args": [] } } }
```

Claude Code asks each person to approve a project `.mcp.json` server the first time.

Other MCP hosts that accept stdio servers take the same command. The project has tested Claude Code only.

## What the agent can do

| Tool | Purpose |
| --- | --- |
| `list_pages` | List the menu tree and the pages. |
| `get_page` | Read one page: its node tree, comments, and interactions. |
| `patch_page` | Edit a page with JSON Patch operations. |
| `add_comment` | Leave a comment on a node. |
| `validate` | Check a page against the component catalog. |
| `list_codes` | Read the code tables (groups and items). |
| `code_usage` | Find the nodes that use a code group or item. |
| `edit_codes` | Create, update, or delete code groups and items. |

What the agent may change follows your role in the project. A `viewer` token can read but not edit.

## Teach the agent the rules

The package ships a skill file, `skill/SKILL.md`, that explains paths, edit conflicts (`stale`, `locked`), and how to read `validate` results.
Install it as a skill in your agent, or add it to your agent instructions. The source is [`packages/mcp/skill/SKILL.md`](../../../../packages/mcp/skill/SKILL.md).

Each server also serves an English guide for agents at `/llms.txt`, for example `http://localhost:8080/llms.txt`.

## Next steps

- [Reference](../reference.md)
- [Troubleshooting](../troubleshooting.md)
