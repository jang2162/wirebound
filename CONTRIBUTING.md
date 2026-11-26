# Contributing to wirebound

Thank you for helping. This page is the short English entry point for developers.
The detailed developer guide is [`docs/guides/development.md`](docs/guides/development.md), written in Korean. Section names below in 「」 refer to it.

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 22.18 or later (`engines` in `package.json`) | The build reads TypeScript config files with Node's type stripping. |
| pnpm | 10.0.0 (`packageManager`) | The workspace layout depends on it. Do not use npm or yarn in this repository. |
| Docker | any recent version | Runs the development PostgreSQL. |

If you use [mise](https://mise.jdx.dev/), `mise trust && mise install` sets up Node and pnpm from `mise.toml`.

## Set up from source

Run these from the repository root, in this order:

```bash
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm db up -d
pnpm db port postgres 5432
pnpm build
SEED_USER_EMAIL=<YOUR_EMAIL> SEED_USER_PASSWORD='<PASSWORD>' SEED_USER_ADMIN=1 pnpm --filter @wirebound/api migrate
```

- `pnpm db …` wraps the development Compose file `docker/dev/compose.yaml`. The plain `docker compose` at the root is the production stack.
- `pnpm db port postgres 5432` must print a port. If it exits with 1, the container started without a port. See 「컨테이너를 못 찾는다」.
- Do not skip `pnpm build`. The API runs from the built `dist` of the workspace packages. Tests pass without it, but the server does not start.

Then start the two servers in two terminals:

```bash
pnpm --filter @wirebound/api dev
pnpm --filter @wirebound/web dev
```

Open the address printed by the second command (default `http://localhost:5173/`) and sign in with the seed account.
The procedure and every failure you may meet are in 「세우기 — 다섯 걸음」 and 「띄우기」.

## Run the checks

Four checks, and none replaces another:

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:build
```

- `pnpm test` needs the development PostgreSQL. Without a database, run `pnpm exec vitest run --project unit --project web`.
- `pnpm test:build` checks the built packages and drives the editor in a real headless Chrome. It skips the parts whose browser or database is missing and says so.
- Run `pnpm fmt` and `pnpm lint` before you commit. The Git hooks run them too.

Which checks a change needs is in 「트랙 게이트」.

## Work in a worktree

The maintainers work on one Git worktree per task. Each worktree runs its own PostgreSQL container, ports, and session cookie name.
The steps and the five values to change in `apps/api/.env` are in 「워크트리를 여럿 띄울 때」.

## Agent instructions

Coding agents read `AGENTS.md`. It is generated, so do not edit it.
The sources are `.ruler/*.md`, and shared rules come from the `guideline` CLI into `.guideline/`. Regenerate after changing a source:

```bash
pnpm exec guideline apply
```

## Where things are

| Topic | Document |
| --- | --- |
| API endpoints, error format, permissions | [`apps/api/README.md`](apps/api/README.md) (Korean) |
| Product design, the current source of truth | [`docs/superpowers/specs/2026-08-03-wirebound-design.md`](docs/superpowers/specs/2026-08-03-wirebound-design.md) (Korean) |
| Plans and reports | [`docs/superpowers/plans/`](docs/superpowers/plans/) (Korean, point-in-time records) |
| Deployment details | [`docs/guides/deploy-docker.md`](docs/guides/deploy-docker.md) (Korean) |
| npm releases | [`docs/guides/npm-release.md`](docs/guides/npm-release.md) (Korean) |
| User manual | [`docs/manual/`](docs/manual/README.md) |

## Pull requests

- Keep one topic per pull request, and stage files by path instead of `git add -A`.
- If you change the English user documents (`README.md`, `docs/manual/en/`), update the Korean translation in the same pull request, or open an issue labeled `translation`.
- Describe how you checked the change: the commands you ran and how many tests ran.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
