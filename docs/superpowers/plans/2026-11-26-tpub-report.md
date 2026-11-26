# tpub — npm Trusted Publishing(OIDC) 배포 워크플로 보고

기준 main `d049eb6a` · 브랜치 `feat/trusted-publish` · 워크트리 `/Users/jang2162/orca/workspaces/wirebound/feat-trusted-publish`. 잰 런타임
Node v24.21.0 · npm 11.19.0 · pnpm 10.0.0(`eval "$(mise env -s zsh)"` 뒤).

## 커밋

| 커밋 | 무엇 |
| --- | --- |
| `661daae4` | `scripts/release/publish.mjs` — 아직 없는 판 고르기 · `pnpm pack` · tarball 검사 · `npm publish` |
| `d947823a` | `.github/workflows/publish.yml` |
| `5e2122f1` | `docs/guides/npm-release.md` — 사람이 할 일 |
| (이 보고) | 이 파일 |

## 확인한 규칙(출처)

| 규칙 | 값 | 출처 |
| --- | --- | --- |
| npm CLI · Node 최소 판 | npm **11.5.1** 이상 · Node **22.14.0** 이상 | https://docs.npmjs.com/trusted-publishers |
| 워크플로 권한 | `id-token: write`(OIDC 토큰), 예시는 `contents: read` 함께 | 같은 쪽 |
| `setup-node` 의 `registry-url` | 요구라고 적지 않았다 — 예시에만 있다 | 같은 쪽 |
| provenance | 공개 저장소 · 공개 패키지면 **자동** — `--provenance` 불필요 | 같은 쪽 · https://docs.npmjs.com/generating-provenance-statements |
| runner | **GitHub-hosted 만**, self-hosted 는 아직 안 된다 | https://docs.npmjs.com/trusted-publishers |
| 설정 칸 | Organization or user · Repository · Workflow filename(경로 없이 · `.yml`/`.yaml`) · Environment(선택) · Allowed actions(`npm stage publish` 는 늘 허용, `npm publish` 는 골라서 허용). 모든 칸 대소문자 구분 · 저장 때 확인 안 함 | 같은 쪽 |
| 만료 | 새로 만든 설정은 **2 일 안에 첫 성공 publish** 가 없으면 만료 · 고칠 수 없음 | 같은 쪽 «Trusted publisher configuration expiry» |
| 토큰 끄기 | Settings → Publishing access → «Require two-factor authentication and disallow tokens» — 토큰 인증만 막고 OIDC 는 그대로 | 같은 쪽 |
| 없는 패키지 | `npm trust` 의 전제 «Package must exist» — 새 패키지 첫 판은 사람이 낸다 | https://docs.npmjs.com/cli/v12/commands/npm-trust |
| `npm trust github` | `--file` 필수 · `--repo owner/repo` · `--env` · `--allow-publish` · npm 11.15.0 이상 · 계정 2FA · 첫 요청에 OTP | 같은 쪽(v11 판 https://docs.npmjs.com/cli/v11/commands/npm-trust 도 같다) |
| `repository.url` | `package.json` 의 값이 GitHub 저장소와 맞아야 한다 — 8 개 모두 `git+https://github.com/jang2162/wirebound.git` 임을 확인 | https://docs.npmjs.com/trusted-publishers |

문서끼리 갈린 곳 하나: `npm trust` 쪽은 «패키지당 설정 하나», trusted-publishers 쪽은 «최대 10 개» 라 적는다. 이 트랙은 하나만 쓰므로 무관하다.

### pnpm 의 OIDC

pnpm 공식 문서(https://pnpm.io/cli/publish)는 지금 판(12.x)이 trusted publishing 아래에서 provenance 를 스스로 붙인다고 적지만 **판을 적지 않고**,
10.0.0 릴리스 노트(https://github.com/pnpm/pnpm/releases/tag/v10.0.0)에는 publish · OIDC 항목이 없다. 설치된 pnpm 10.0.0 의 `dist/pnpm.cjs` 를 열어
보면 `pnpm publish` 는 `pack.api` 로 tarball 을 만든 뒤 `runNpm(opts.npmPath, ["publish", "--ignore-scripts", <tarball>, …])` 로 **PATH 의 npm 에
넘긴다** — pnpm 10.0.0 은 OIDC 를 스스로 다루지 않는다.

## 고른 배포 방식과 까닭

**`pnpm pack` → `npm publish <tgz>`** (브리프의 대안 길). pnpm 10.0.0 이 어차피 그렇게 하므로 동작은 같고, 드러내 두면 셋을 스크립트가 직접 잰다:
① npm 판(11.5.1 이상인지 `checkNpm`) ② tarball 의 `package.json` 에 `workspace:` 가 안 남았는지 · 이름 · 판이 맞는지(`checkTarball`) ③ 패키지마다
«이미 있으면 건너뜀»(`npm view <이름>@<판>` — 404 만 «없다», 다른 실패는 던진다). pnpm 을 올려 `pnpm publish -r` 의 OIDC 에 기대는 길은 판 근거를 못
찾아 고르지 않았다.

- 낼 집합: `pnpm ls -r --depth -1 --json` 에서 `private` 가 아닌 것(하드코딩 없음) — 지금 8 개.
- 차례: dependencies · peer · optional 의 워크스페이스 의존 먼저(고리면 던진다). devDependencies 는 받는 쪽 설치에 안 들어 뺐다.
- 런타임: `jdx/mise-action` 이 `mise.toml`(Node 24.21.0 · pnpm 10.0.0)을 깐다 — Node 24 의 npm 은 11.x. `setup-node` 를 따로 두지 않았다(OIDC 교환에
  `.npmrc` 가 필요 없고 기본 레지스트리가 npmjs). 신뢰는 `MISE_TRUSTED_CONFIG_PATHS` 로 준다.
- 액션 SHA(각 저장소 latest 릴리스를 `gh api` 로 읽음): `actions/checkout` v7.0.1 `3d3c42e5…` · `jdx/mise-action` v5.3.0 `924e7c58…`.
- 테스트 단계는 `pnpm exec vitest run --project unit --project web` — 아래 «지침 결함» 때문에 브리프의 `pnpm test --project '!api' --project '!build'` 꼴을
  안 썼다.
- 프리릴리스(판에 `-`)는 `--tag next`. Environment 는 안 쓴다(npmjs 설정에서 비운다).

## 로컬 검증 값

| 판 | 값 |
| --- | --- |
| `plan`(손대지 않은 판) | 8 개 모두 «건너뜀» · **«대상 8 개 · 낼 것 0 개»** · 종료 0 |
| 변조 A: `packages/renderer/package.json` 의 `version` 0.1.0 → 0.1.1(맞은 수 1) | **renderer 하나만 «낼 것»** · pack 1 개 · 검사 `@wirebound/renderer@0.1.1 (@wirebound/schema@0.1.0, @wirebound/theme-sdk@1.10.0)` · `publish --dry-run` → `+ @wirebound/renderer@0.1.1` «Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)» · 종료 0 |
| 그 tarball 의 `package.json` | dependencies `@wirebound/schema: 0.1.0` · `@wirebound/theme-sdk: 1.10.0` — `workspace:` 없음(devDependencies 의 `@wirebound/test-support` 도 `0.0.0`) |
| 변조 B: A + 스크립트의 `pnpm pack` 을 `npm pack` 으로(맞은 수 1) | 검사가 죽는다: «workspace: 범위가 남았다 — dependencies.@wirebound/schema=workspace:*, dependencies.@wirebound/theme-sdk=workspace:*, devDependencies.@wirebound/test-support=workspace:*» |
| 복원 | 두 변조 모두 경로 이름 백업 → `cp` → `cmp` 같음 · `git status` 에 뜻한 파일만 |
| actionlint 1.7.12(`mise exec actionlint@1.7.12 shellcheck@latest --`, 저장소 설정 안 바꿈) | `publish.yml` 오류 0(shellcheck 켜짐 · pyflakes 만 꺼짐). 대조: `inputs.dry-run` → `inputs.dryrun` 사본은 «property "dryrun" is not defined in object type {dry-run: bool}» 로 종료 1 |

실제 `npm publish` 는 부르지 않았다(`--dry-run` 만). GitHub 에서는 안 돌렸다 — OIDC 교환 · provenance 는 첫 Actions 실행에서야 잰다.

## 게이트

Node v24.21.0 · 15:19 – 15:21 · load 4.26 → 7.21(15 코어) · `pmset -g log` 의 마지막 Sleep 은 11:51 이라 실행과 안 겹친다.

| 명령 | 결과 |
| --- | --- |
| `pnpm typecheck` | 종료 0 |
| `pnpm exec vitest run --project unit --project web` | 종료 0 · 파일 460 통과(460) · 케이스 6849 통과 · 1 건너뜀 · 실패 0(전체 6850) |

브리프의 `pnpm test --project '!api'` 는 이 워크트리(`.env` 없음)에서 api 를 골라 `worktreeEnvError` 로 멈추므로(아래) 남길 프로젝트를 적은 꼴로 돌았다.

## 지침 결함 — `pnpm test --project '!api'` 는 api 를 뺀다는 문장과 다르게 돈다

`pnpm test` 가 이미 `vitest run --project '!build'` 라, 덧붙인 `--project '!api'` 는 부정 패턴 둘이 되어 서로를 포함한다 — **api 까지 돈다.**
잰 값(vitest 3.2.7): `vitest list --project '!build' --project '!api'` 는 api global-setup 의 `worktreeEnvError` 로 종료 1(api 를 고른 것).
`--project '!api'` 하나는 unit 3038 · web 3811 · **build 182**, `--project unit --project web` 은 unit 3038 · web 3811.

그 문장이 있는 곳(이 트랙 범위 밖이라 안 고쳤다):

- `.ruler/10-worktree.md` 「생성 직후 세팅」 — «DB 가 필요 없는 트랙이라 `.env` 를 안 만들면 브리프의 게이트를 `pnpm test --project '!api'` 로 적는다»
  → **«… 게이트를 `pnpm exec vitest run --project unit --project web` 으로 적는다 — `pnpm test --project '!api'` 는 `!build` 와 부정 패턴 둘이 되어 api 까지 돈다.»**
- `README.md` 292 줄(옆 트랙 `pd` 가 다시 쓰는 중) — 같은 바꿈.
- `apps/api/test/test-database-url.ts` 139 줄의 오류 문장과 그것을 글자로 견주는 `apps/api/test/test-database-url.test.ts` 156 줄 — 같은 바꿈.

## 사람이 할 일

`docs/guides/npm-release.md` 가 정본이다. 요약:

1. 병합 · 푸시 뒤 Actions → publish → Run workflow(`dry-run` 체크)로 한 번 돌려 install · build · typecheck · 테스트 · «낼 것 0» 을 본다.
2. 다음 릴리스에서 판을 올린 패키지에만, **실배포 직전에** npmjs.com 에서 Trusted Publisher 를 건다(GitHub Actions · `jang2162` · `wirebound` ·
   `publish.yml` · Environment 비움 · **`npm publish` 허용**) — 또는 `npm trust github … --allow-publish`. 건 뒤 2 일 안에 실배포가 성공해야 한다.
3. `vX.Y.Z` 태그 push(또는 `dry-run` 끈 수동 실행)로 낸다.
4. 성공을 본 뒤 그 패키지들에 «Require two-factor authentication and disallow tokens» 를 켠다.
5. 새 패키지는 첫 판을 사람이 OTP 로 내고 Trusted Publisher 를 건다. 내지 않을 패키지는 `"private": true`.

## 물음

`q-tpub.md` 에 적은 물음 없음 — 모두 브리프의 기본값으로 갔다(Environment 안 씀 · 테스트 프로젝트는 위 까닭으로 양의 목록).
