# Connect a code repository

This guide links an implementation repository to a wirebound project with the `wireb` CLI, so developers and CI can read, check, and export the spec.
It is for developers. You need a project ID and an account that is a member of the project.

## Install the CLI

```bash
npm install -g @wirebound/cli
```

To pin the version per repository, install it as a dev dependency instead: `npm install -D @wirebound/cli`, then run it with `npx wireb`.

## Link the repository

1. In the repository root, create the link file.

   ```bash
   wireb init --server <SERVER_URL> --project <PROJECT_ID>
   ```

   This writes `.wirebound.json` with the server URL and the project ID. Commit it. It never holds a token.

2. Sign in to get a token.

   ```bash
   wireb login --email <YOUR_EMAIL>
   ```

   The token is stored in `~/.wirebound/credentials.json` with file mode `600`.
   It works for this one project only. Another project returns 404 with this token.

## Read the spec

| Goal | Command |
| --- | --- |
| Save a snapshot of the whole project | `wireb pull -o design.json` |
| Print one page as a structure outline with comments and interactions | `wireb page get "<MENU>/<PAGE>"` |
| Check the spec for defects | `wireb lint` |
| Export a static HTML bundle | `wireb export --format html -o <DIR>` |
| Export a PPTX deck | `wireb export --format pptx -o <DIR>` |

Page paths are the menu titles and the page title joined with `/`, for example `wireb page get "주문 관리/주문 목록"`.

## Run it in CI

A terminal is not available in CI, so pass the credentials through environment variables:

| Variable | Use |
| --- | --- |
| `WIREB_PASSWORD` | The password for `wireb login` when no terminal is attached. You can also pipe it on standard input. |
| `WIREB_TOKEN` | A token to use instead of the credentials file. |
| `WIREB_CREDENTIALS` | A different path for the credentials file. |

`wireb lint` exits with code 10 when it finds an error. Add `--fail-on warning` to fail on warnings too:

```bash
wireb lint --fail-on warning
```

## Revoke tokens

Open **계정** (Account) in the left sidebar. The **API 토큰** (API tokens) section lists every token you created and lets you revoke them one by one or all at once.

## Next steps

- [Connect a coding agent (MCP)](connect-a-coding-agent.md)
- [Reference](../reference.md) for every command and exit code
