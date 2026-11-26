# Troubleshooting

This page lists common problems by symptom, with the cause and the fix.
It is for anyone who runs or uses a wirebound server. Commands assume the Docker deployment and run from the repository root.

## Sign-in fails with "이메일 또는 비밀번호가 올바르지 않습니다"

The message means "incorrect email or password". It is the same for a wrong password and for an account that does not exist.

- **No account yet.** The seed account is created only when `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` are set.
  Check the output of the `migrate` service:

  ```bash
  docker compose logs migrate
  ```

  If it says "계정 시딩 건너뜀" (seeding skipped), set both values in `.env` and run `docker compose up -d` again. Existing accounts are never changed.
- **Wrong password.** See [Forgot a password](#forgot-a-password).

## Sign-in succeeds, then the editor shows the sign-in page again

The page is served over plain HTTP from another machine. The session cookie is `Secure`, so the browser drops it.
Open the site through an HTTPS reverse proxy, or on the server itself at `http://localhost:8080`. See [Deploy with Docker](how-to/deploy-with-docker.md).

## "로그인 시도가 너무 많습니다 — N분 뒤 다시 시도하세요"

The message means "too many sign-in attempts, retry in N minutes".
The server blocks an email after 10 attempts and an address after 30 attempts within 15 minutes, even with the right password.

- Wait for the time in the message, or lift the lock:

  ```bash
  docker compose exec api node --import tsx src/auth/unlock-login.ts <EMAIL>
  ```

  If the message persists, the client address is blocked. Add `--address <IP>` to the same command.
- If everyone sees this message, the server cannot tell clients apart.
  Add your reverse proxy's address to `TRUSTED_PROXIES` in `.env`, then run `docker compose up -d`.

## Forgot a password

There is no self-service reset. Use one of these:

- **An instance admin creates a reset link.** In **사용자** (Users), open the **…** menu on the person's row and select **재설정 링크 만들기** (Create reset link). Send the link to the person. It is valid for 24 hours and works once.
- **Someone with server access resets it.** The command asks for the new password twice without echoing it:

  ```bash
  docker compose exec api node --import tsx src/db/reset-password.ts <EMAIL>
  ```

  The command signs the person out everywhere. It keeps API tokens created with `wireb login`.
  If the old password leaked, also revoke the tokens: sign in, open **계정** (Account), and select **전부 폐기** (Revoke all) in **API 토큰** (API tokens).

## The PPTX has slides without screen images

The slide shows "화면 이미지가 실리지 않았습니다" (screen image not included). The export still succeeds.
To see the reason, open **프로젝트 내보내기** (Export project) in the editor and choose PPTX. The preview lists each failed page and why.

| Reason in the preview | Fix |
| --- | --- |
| No Korean font on the server ("한글 글꼴이 없어") | The Docker image includes `fonts-noto-cjk`. On your own image, install a Korean font. |
| The browser could not start ("브라우저를 띄우지 못했습니다") | The Docker image includes Chromium. On your own setup, set `SCREEN_CHROMIUM_PATH` to a Chromium binary. |
| The page is too large ("페이지가 너무 커") | Pages taller than about 200 grid rows are skipped on purpose. Split the page. |

`wireb export --format pptx` prints the number of missing images as a warning and exits with 0.

## A component dragged onto the canvas does not drop

Reopen the editor with `?debugDrag=1` at the end of the address, drag the component once, and copy every `[wb-drag]` line from the browser console into an issue.
Those lines show which step stopped. The developer guide [`docs/guides/drag-debug.md`](../../guides/drag-debug.md) (in Korean) explains them.

## `wireb` exits with code 2

The repository is not linked, or the token is missing. Run `wireb init` in the repository root and then `wireb login`.
If you changed the server URL in `.wirebound.json`, run `wireb login` again. Tokens are bound to the URL.

## The MCP tool answers "[wireb 코드 2] .wirebound.json을 찾을 수 없습니다"

The MCP server started outside the linked repository, so it could not find `.wirebound.json`.
Register the server from the repository root, or set the working directory in your MCP host's settings.

## Next steps

- [Configuration](configuration.md)
- [Open an issue](https://github.com/jang2162/wirebound/issues) if your problem is not listed
