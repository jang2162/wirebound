# npm 에 내기

`@wirebound/*` 패키지는 GitHub Actions 의 `.github/workflows/publish.yml` 이 **npm Trusted Publishing(OIDC)** 으로 낸다 — 저장소에 npm 토큰 비밀이 없다.
워크플로는 `private` 가 아닌 워크스페이스 패키지 가운데 **레지스트리에 아직 없는 판만** 골라, 의존 먼저 `pnpm pack` 하고 `npm publish <tarball>` 로 낸다
(이미 있는 판은 «건너뜀» 으로 로그에 적는다). 고르기 · pack · 내기는 `scripts/release/publish.mjs` 가 하고, 로컬에서도 같은 스크립트로 잴 수 있다
(아래 「로컬에서 미리 보기」).

이 문서는 사람이 할 일을 적는다 — npmjs.com 의 설정과 릴리스 절차.

## 처음 한 번 — 패키지마다 Trusted Publisher 를 건다

npmjs.com 에서 패키지마다 **Settings → Trusted publishing** 에 아래 값을 넣는다. 값은 글자 그대로 넣는다(대소문자를 가린다 · npm 은 저장할 때 값을
확인하지 않고 내는 순간에야 틀린 것을 알린다).

| 칸 | 값 |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `jang2162` |
| Repository | `wirebound` |
| Workflow filename | `publish.yml`(경로 없이 파일 이름만) |
| Environment name | 비운다 — 워크플로가 GitHub environment 를 안 쓴다 |
| Allowed actions | **`npm publish` 를 허용한다** — 이 워크플로는 `npm publish` 로 낸다 |

걸 패키지 8 개:

| 패키지 | 설정 화면 |
| --- | --- |
| `@wirebound/schema` | https://www.npmjs.com/package/@wirebound/schema/access |
| `@wirebound/theme-sdk` | https://www.npmjs.com/package/@wirebound/theme-sdk/access |
| `@wirebound/themes` | https://www.npmjs.com/package/@wirebound/themes/access |
| `@wirebound/renderer` | https://www.npmjs.com/package/@wirebound/renderer/access |
| `@wirebound/cli` | https://www.npmjs.com/package/@wirebound/cli/access |
| `@wirebound/mcp` | https://www.npmjs.com/package/@wirebound/mcp/access |
| `@wirebound/theme-gallery` | https://www.npmjs.com/package/@wirebound/theme-gallery/access |
| `@wirebound/theme-kit` | https://www.npmjs.com/package/@wirebound/theme-kit/access |

화면 대신 npm CLI(11.15.0 이상 · 계정에 2FA 가 켜져 있어야 하고 첫 요청에서 OTP 를 묻는다)로도 건다:

```bash
for p in schema theme-sdk themes renderer cli mcp theme-gallery theme-kit; do
  npm trust github "@wirebound/$p" --file publish.yml --repo jang2162/wirebound --allow-publish -y
done
npm trust list @wirebound/schema   # 걸렸는지 본다
```

**새로 건 설정은 2 일 안에 한 번 성공적으로 내야 산다** — 그 안에 성공한 publish 가 없으면 설정이 만료되어 고칠 수도 없고, 지우고 다시 걸어야
한다. dry-run 은 내기가 아니라 셈에 안 든다. 그래서 **그 릴리스에서 판을 올린 패키지에만, 실배포 직전에** 건다(아래 「릴리스」 의 차례). 판이 안 바뀐
패키지는 워크플로가 건너뛰어 그 설정이 검증되지 않고 2 일 뒤 만료된다 — 8 개를 한꺼번에 걸어 두지 않는다.

### 걸고 난 뒤 — 토큰 배포를 끈다

패키지마다 **Settings → Publishing access** 에서 **«Require two-factor authentication and disallow tokens»** 를 고르고 Update Package Settings 를
누른다. 뜻: 그 패키지는 사람이 2FA 로 내거나 Trusted Publisher(OIDC)로만 나간다. 전통적인 npm 토큰(automation · granular)으로는 못 낸다 — 토큰이
새도 그 패키지를 덮어쓸 수 없다. Trusted Publisher 는 토큰이 아니라 OIDC 라 그대로 돈다. 첫 실배포가 Actions 에서 성공한 것을 본 뒤에 켠다.

### 새 패키지를 처음 낼 때

Trusted Publisher 는 **레지스트리에 이미 있는 패키지에만** 걸 수 있다. 새 워크스페이스 패키지(9 번째)는 첫 판을 사람이 로컬에서 OTP 로 낸다:

```bash
pnpm build
pnpm --filter @wirebound/<이름> publish --access public   # OTP 를 묻는다
```

낸 뒤 위 표의 값으로 Trusted Publisher 를 걸고 이 문서의 표에 줄을 더한다. 워크플로는 고칠 것이 없다 — 낼 집합을 `private` 가 아닌 워크스페이스
패키지에서 읽는다(이미 낸 판이라 다음 실행에서는 «건너뜀» 이다). 반대로 **내지 않을 패키지는 `package.json` 에 `"private": true` 를 둔다** — 없으면
워크플로가 그 패키지를 내려다 Trusted Publisher 가 없어 실패한다.

## 릴리스

1. **판을 올린다** — 낼 패키지의 `package.json` 의 `version`. 워크스페이스 의존(`workspace:*`)은 pack 이 **그때의 정확한 판**으로 바꾼다
   (`@wirebound/cli` 의 `@wirebound/schema` 가 `0.1.0` 처럼). 그래서 `schema` 만 올리고 `cli` 를 안 올리면, 나간 `cli` 는 옛 `schema` 를 계속
   가리킨다 — 새 판을 받게 하려면 기대는 패키지의 판도 함께 올린다.
2. **커밋하고 main 에 넣는다.**
3. **수동 실행으로 dry-run 을 먼저 돌린다** — GitHub → Actions → publish → Run workflow, `dry-run` 체크(기본값). 로그의 «낼 판 고르기 · pack» 단계에서
   낼 것 · 건너뜀 목록과 tarball 의 워크스페이스 의존 판을, «npm publish» 단계에서 `npm publish --dry-run` 결과를 본다.
4. Trusted Publisher 를 아직 안 걸었으면 지금 건다(2 일 안에 5 를 한다).
5. **실제로 낸다** — 둘 중 하나:
   - 태그를 push 한다: `git tag v0.2.0 && git push origin v0.2.0` (태그 이름은 `v` 로 시작하면 된다 — 워크플로는 태그 글자와 패키지 판을 견주지 않고 «없는
     판» 을 낸다).
   - 또는 수동 실행에서 `dry-run` 을 끄고 돌린다.

공개 저장소의 공개 패키지라 npm 이 provenance(출처 증명)를 스스로 붙인다 — `--provenance` 를 안 준다. 판에 `-` 가 든 판(프리릴리스)은 `next` 태그로
나가 `latest` 를 안 옮긴다.

## 로컬에서 미리 보기

```bash
node scripts/release/publish.mjs plan                              # 낼 것 · 건너뜀
pnpm build && node scripts/release/publish.mjs pack /tmp/wb-pack   # pack 하고 tarball 의 workspace: 범위를 검사
node scripts/release/publish.mjs publish /tmp/wb-pack --dry-run    # npm publish --dry-run
```

`publish` 를 `--dry-run` 없이 로컬에서 부르지 않는다 — 로컬 npm 로그인으로 나간다(provenance 없이).

## 실패할 때

| 증상 | 볼 것 |
| --- | --- |
| `ENEEDAUTH` · 404 · 403 으로 publish 가 죽는다 | 그 패키지의 Trusted Publisher 값(조직 · 저장소 · `publish.yml` · environment 비움 · `npm publish` 허용) · 2 일 만료 · `package.json` 의 `repository.url` 이 `github.com/jang2162/wirebound` 인지 |
| «npm X — Trusted Publishing 은 npm 11.5.1 이상이 필요하다» | `mise.toml` 의 Node 판(Node 24 의 npm 은 11.x) |
| «workspace: 범위가 남았다» | pack 을 pnpm 이 아닌 도구로 했다 — 스크립트의 `pnpm pack` 을 바꾸지 않는다 |
| self-hosted runner 에서 OIDC 가 안 된다 | Trusted Publishing 은 GitHub-hosted runner 만 받는다 — `runs-on: ubuntu-latest` 를 둔다 |
