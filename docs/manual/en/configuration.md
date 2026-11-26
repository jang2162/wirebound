# Configuration

This page lists the settings you can change on a wirebound server and in the `wireb` CLI.
It is for operators and developers who look up a value.

## Server settings (`.env`)

The Docker deployment reads `.env` at the repository root. Create it with `cp .env.example .env`. Never commit it.
After you change a value, apply it with `docker compose up -d`.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `WIREBOUND_DEPLOY` | `1` | required | Marks this checkout as a deployment. Without it, every `docker compose` command stops. |
| `POSTGRES_PASSWORD` | string | required | Database password. Use letters and digits only. It is read only when the database volume is created. |
| `SEED_USER_EMAIL` | email | empty | Email of the first account. `migrate` creates it and leaves an existing account unchanged. |
| `SEED_USER_NAME` | string | local part of the email | Display name of the first account. |
| `SEED_USER_PASSWORD` | string | empty | Password of the first account, 8 to 200 characters. You can clear it after the account exists. |
| `SEED_USER_ADMIN` | `1` | empty | Makes a newly created seed account the instance admin. It does not change an existing account. |
| `SESSION_COOKIE_NAME` | string | `wb_session` | Name of the session cookie. |
| `SESSION_TTL_HOURS` | number | `720` | Session lifetime in hours. |
| `LOG_LEVEL` | string | `info` | API log level, for example `debug`. |
| `EXPORT_RENDER_LIMIT` | number | `2` | Headless browsers that may run at once for PPTX screen images. Use `1` below 4 GB of memory. |
| `ASSET_FILE_MAX_BYTES` | number | `5242880` (5 MB) | Largest single image upload. Larger files get 413. |
| `ASSET_PROJECT_MAX_BYTES` | number | `209715200` (200 MB) | Total image size per project. Images live in the database, so this bounds backup growth. |
| `ASSET_PERSONAL_MAX_BYTES` | number | `104857600` (100 MB) | Total image size of one person's personal modules. |
| `APP_PORT` | number | `8080` | HTTP port that the `web` entry point opens on the host. |
| `TRUSTED_PROXIES` | IPs or CIDRs | empty (trust none) | Addresses of the reverse proxies in front of the entry point, separated by spaces. Never list a range your clients can reach. |
| `BACKEND_SUBNET`, `BACKEND_IP_RANGE`, `EDGE_IP` | CIDR, CIDR, IP | `10.231.47.0/24`, `10.231.47.128/25`, `10.231.47.2` | The internal Compose network. Change all three together, only if they clash with another network on the server. |
| `WIREBOUND_TAG` | string | `local` | Tag of the images built on the server. |

Do not set `HOST`, `PORT`, `NODE_ENV`, `DATABASE_URL`, `TRUST_PROXY`, or `POSTGRES_PORT` here. The images and `compose.yaml` set them.
Other API settings, such as `PASSWORD_SCRYPT_N` and database timeouts, are listed with their meaning in [`apps/api/.env.example`](../../../apps/api/.env.example) (comments in Korean). The API accepts them from `.env` too.

## CLI settings

| Name | Where | Description |
| --- | --- | --- |
| `.wirebound.json` | repository root | `server` and `projectId`. Created by `wireb init`. Safe to commit. |
| `~/.wirebound/credentials.json` | home directory | Tokens saved by `wireb login`, file mode `600`. |
| `WIREB_TOKEN` | environment | Token to use instead of the credentials file. |
| `WIREB_CREDENTIALS` | environment | Path of a different credentials file. |
| `WIREB_PASSWORD` | environment | Password for `wireb login` when no terminal is attached. |

## Next steps

- [Deploy with Docker](how-to/deploy-with-docker.md)
- [Reference](reference.md)
