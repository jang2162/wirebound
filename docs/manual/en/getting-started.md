# Getting Started

This guide takes you from an empty machine to a running wirebound server, a first project, and a code repository that reads it.
It is for the person who sets wirebound up for a team. Allow about 15 minutes, most of it for the first image build.

## Before you begin

- Docker with Compose v2 on the machine that runs the server.
- Node.js 22.18 or later on the machine that holds your code.
- Git.

## 1. Start the server

1. Clone the repository and create the deployment settings file.

   ```bash
   git clone https://github.com/jang2162/wirebound.git
   cd wirebound
   cp .env.example .env
   ```

2. Open `.env` and set these values:

   | Key | Value |
   | --- | --- |
   | `POSTGRES_PASSWORD` | A database password. Use letters and digits only. |
   | `SEED_USER_EMAIL` | The email of the first account. |
   | `SEED_USER_PASSWORD` | The password of the first account, 8 characters or more. |
   | `SEED_USER_ADMIN` | `1`. Add this line yourself. It makes the first account the instance admin. |

   Leave `WIREBOUND_DEPLOY=1` as it is. The other keys are described in [Configuration](configuration.md).

3. Build and start the stack.

   ```bash
   docker compose up -d --build
   ```

   The first build takes a few minutes. The stack has four services: `postgres`, `migrate`, `api`, and `web`.

4. Check that the server answers.

   ```bash
   curl -s http://localhost:8080/health
   ```

   ```json
   {"status":"ok"}
   ```

**Result:** the editor is served at `http://localhost:8080`.

## 2. Sign in and create a project

1. Open `http://localhost:8080` in a browser on the same machine.
   Sign-in works on `localhost` without HTTPS. Other machines need a reverse proxy with TLS, see [Deploy with Docker](how-to/deploy-with-docker.md).
2. Sign in with the seed account.
3. Select **프로젝트 추가** (Add project), then enter a name and a slug.
4. Add a menu and pages in the **메뉴·페이지 트리** (menu and page tree) on the left, then drag components from the **컴포넌트** (components) palette onto the canvas.

**Result:** the project opens in the editor. The address bar shows `/projects/<project-id>/…`. Keep the project ID for step 4.

The editor UI is in Korean. This manual gives the Korean label in bold and the English meaning in parentheses.

## 3. Invite your team

There is no public sign-up page. People join through invite links that the instance admin creates.

1. In the left sidebar, open **초대 링크** (Invite links). Only the instance admin sees it.
2. Select **초대 링크 만들기** (Create invite link) and send the link to the person.
3. After they sign up, open the project's **설정** (Settings), go to **멤버** (Members), enter their email, choose a role (`owner`, `editor`, or `viewer`), and select **초대** (Invite).

**Result:** the new member sees the project in their project list.

## 4. Connect a code repository

1. Install the CLI and the MCP server.

   ```bash
   npm install -g @wirebound/cli @wirebound/mcp
   ```

2. In your code repository, link it to the project and sign in.

   ```bash
   wireb init --server http://localhost:8080 --project <PROJECT_ID>
   wireb login --email <YOUR_EMAIL>
   ```

   `wireb init` writes `.wirebound.json`, which you can commit. It holds no secrets.
   `wireb login` asks for your password and stores a token in `~/.wirebound/credentials.json`.

3. Pull the spec.

   ```bash
   wireb pull -o design.json
   ```

   ```text
   /path/to/your-repo/design.json에 썼습니다
   메뉴 1개 · 페이지 4개
   ```

**Result:** `design.json` holds a snapshot of every menu, page, and comment in the project.

## 5. Export the spec

In the editor, open the **…** menu in the top right and select **프로젝트 내보내기** (Export project).
Choose HTML for a static bundle that opens in any browser, or PPTX for a slide deck with a screen image per page.

You can do the same from the repository:

```bash
wireb export --format html -o out
```

## Next steps

- [Connect a coding agent (MCP)](how-to/connect-a-coding-agent.md)
- [Connect a code repository](how-to/connect-a-repository.md) for CI and linting
- [Deploy with Docker](how-to/deploy-with-docker.md) for HTTPS, backups, and upgrades
