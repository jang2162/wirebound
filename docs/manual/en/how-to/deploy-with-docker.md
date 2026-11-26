# Deploy with Docker

This guide runs wirebound on one Linux server with Docker Compose, behind your own HTTPS reverse proxy.
It is for the person who operates the server. It assumes you finished [Getting Started](../getting-started.md) step 1.

## What the stack contains

The `compose.yaml` file at the repository root starts the application only. TLS and domain names are your reverse proxy's job.

| Service | What it does | Host port |
| --- | --- | --- |
| `postgres` | PostgreSQL 16. Data lives in the volume `wirebound-prod_pgdata`. | none |
| `migrate` | Applies database migrations and creates the seed account, then exits. It runs on every `up`. | none |
| `api` | The REST and WebSocket server. It starts only after `migrate` exits with code 0. | none |
| `web` | The entry point (Caddy). It serves the editor and forwards `/api` and `/health` to `api`. | `APP_PORT` (default `8080`) |

The images are built on the server from the repository, so `docker compose up -d --build` is also how you upgrade.

## Put an HTTPS proxy in front

The session cookie is `Secure`, so browsers sign in only over HTTPS or on `localhost`.
On plain HTTP the sign-in request succeeds but the next request returns 401.

1. Point your reverse proxy (nginx, Caddy, Traefik, and so on) at the `web` service.
   Forward the whole site to it. Do not split `/api` off to another backend.
2. Let the proxy pass WebSocket upgrades on `/api/projects/<id>/ws`, and set its idle timeout above 25 seconds.
3. Add the proxy's IP address to `TRUSTED_PROXIES` in `.env`.
   Without it, every client appears to come from the proxy, and the sign-in rate limit applies to everyone at once.
4. Keep the server-specific changes (closing port 8080, joining the proxy's network) in `compose.override.yaml` next to `compose.yaml`.
   That file is ignored by Git, and `docker compose` reads it automatically.

Check the merged result before you start the stack:

```bash
docker compose config
```

## Run day-to-day commands

Run these from the repository root, where `compose.yaml` and `.env` are.

| Task | Command |
| --- | --- |
| Back up the database (uploaded images are included) | `docker compose exec -T postgres pg_dump -U wirebound -Fc wirebound > wirebound-$(date +%F).dump` |
| Upgrade after `git pull` | `docker compose up -d --build` |
| Reset a password | `docker compose exec api node --import tsx src/db/reset-password.ts <EMAIL>` |
| Lift a sign-in lock | `docker compose exec api node --import tsx src/auth/unlock-login.ts <EMAIL>` |
| Read the logs | `docker compose logs -f api` |

> [!WARNING]
> `docker compose down -v` deletes the production database volume. Use `docker compose down` to stop the stack and keep the data.

## Choose the memory limit for PPTX screen images

Each PPTX export opens a headless browser per screen. `EXPORT_RENDER_LIMIT` caps how many run at once (default `2`).
In the project's measurements, the worst case used about 3.1 GB at `2` and 1.9 GB at `1`.
Set it to `1` on servers with less than 4 GB of memory.

## Learn more

The operator guide [`docs/guides/deploy-docker.md`](../../../guides/deploy-docker.md) (in Korean) has every environment variable, override examples for both proxy layouts, measured values, and a Komodo setup.

## Next steps

- [Configuration](../configuration.md)
- [Troubleshooting](../troubleshooting.md)
