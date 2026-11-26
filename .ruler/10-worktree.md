# 워크트리 작업

공용 규칙(`base` 스택 「Git 과 워크트리」·「워커에게 일을 맡길 때」, `orca` 스택, `orca-worker` 스킬) 위에 wirebound 가 더하는 것이다. **코드 변경은 예외 없이 워크트리에서 한다** — `.ruler/base/override.md` 가 `base` 의 「코드 변경 작업의 기본값은 워크트리다」 를 그렇게 바꾼다.

두 줄 요약:

1. **메인 세션은 브랜치를 갈아타지 않는다.** `checkout`/`switch` 대신 워크트리를 만든다.
2. **메인 세션은 워크트리를 만들고, 그 안의 실제 작업은 Orca로 띄운 Claude 세션이 한다.** 메인 세션은 디스패치·판정·병합만 한다 — 여기서 "리뷰"는 리뷰어를 띄우는 것이지 메인 세션이 코드를 뜯어보는 것이 아니다.

## 최상위에서 허용되는 것

`base` 스택 「최상위 체크아웃에서는 브랜치를 갈아타지 않는다」 의 읽기 작업(`status`·`log`·`diff`·`show`·`fetch`)에 더해, 워크트리 관리(`worktree add`·`list`·`remove`)도 최상위에서 한다.

## 생성 직후 세팅

새 워크트리는 빈 체크아웃이다. 빌드·테스트 전에 그 워크트리를 대상으로 돌린다.

Orca 로 만들면 `orca.yaml` 의 셋업이 아래 앞 둘(런타임 · 설치)과 빌드를 대신 돌린다 — 그래도 맞았는지 잰다(`orca-worker` 스킬 「셋업 훅이 무엇을 했는지 믿지 말고 잰다」). `git worktree add` 로 만들면 lefthook 의 `post-checkout` 이 런타임 · 설치를 돌린다.

```bash
(cd .worktrees/feat-<작업명> && mise trust && mise install)  # 런타임 먼저 — 경로마다 신뢰가 따로다
pnpm -C .worktrees/feat-<작업명> install    # node_modules 는 워크트리마다 따로 필요하다 · prepare 가 훅 설치와 guideline apply 를 한다
pnpm -C .worktrees/feat-<작업명> build      # packages/* 의 dist 생성 — tsx로 도는 api가 이것을 본다
pnpm -C .worktrees/feat-<작업명> typecheck  # 컴파일 확인 겸 캐시 예열
pnpm -C .worktrees/feat-<작업명> exec guideline apply  # install 의 prepare 가 이미 돌린다 — install 을 --ignore-scripts 로 했을 때만
```

`cd`로 들어가지 말고 `-C`(git이면 `-C`, pnpm이면 `-C`/`--dir`)로 대상을 지정한다. **메인 세션의 셸은 작업 디렉터리가 유지되므로** 한 번 들어가면 이후 명령이 최상위인 줄 알고 워크트리에서 돌거나 그 반대가 된다.

- `pnpm install`을 빠뜨리면 워크스페이스 심링크가 없어 `@wirebound/*` import가 전부 깨진다.
- `pnpm build`를 빠뜨리면 `tsx`로 도는 것(`api`의 `dev`·`migrate`)이 `@wirebound/schema`를 못 찾는다. `dist/`는 gitignore라 새 워크트리에 없는데 워크스페이스 패키지의 `exports`가 `dist`를 가리키기 때문이다. vitest는 alias로 소스를 직접 보므로 영향이 없다 — "테스트는 통과하는데 서버만 안 뜨는" 형태로 나타난다.
- **`tsx watch` 로 api 가 도는 체크아웃에서 `pnpm build` 를 돌리면 api 가 멈춘다** — 빌드가 `packages/*/dist` 를 지웠다 다시 쓰는 사이 감시가 재기동해 `MODULE_NOT_FOUND`(`@wirebound/exporter` 등)로 죽고, 빌드가 끝나도 스스로 다시 안 선다. 빌드 뒤 api 를 다시 띄운다(최상위의 사용자 dev 서버면 메인 세션이 한다).
- **`git worktree add` 로 만들면 codegraph 색인도 그 워크트리에서 만든다** — `(cd .worktrees/feat-<작업명> && npx -y @colbymchenry/codegraph init)`(`orca.yaml` 의 `scripts.setup` 과 같은 명령이다 — Orca 로 만들면 셋업이 돌린다). 안 만들면 codegraph 가 최상위 체크아웃의 색인으로 답한다(응답 머리의 «different git worktree» 경고). 그 경고가 보이면 그 결과로 판정하지 말고 그 워크트리의 파일을 읽는다 — 브랜치가 앞선 워크트리에서는 다른 판의 소스를 지금 소스로 읽게 된다.
- **`@wirebound/schema` 를 고친 뒤의 웹 타입 검사는 루트 `pnpm typecheck`(`tsc --build`)로 한다** — `pnpm -C apps/web exec tsc --noEmit` 은 프로젝트 참조 때문에 다시 빌드한 패키지의 새 `export` 를 못 봐 «없는 이름» 오류를 낸다.
- gitignore 대상인 로컬 설정은 따라오지 않는다. `.env`·`.env.*`가 전부 무시되므로 `apps/api/.env`를 최상위에서 복사하거나 `apps/api/.env.example`에서 만든다. **api 를 띄우지 않는 워크트리도 만든다** — `pnpm test` 전량은 api 스위트가 DB 에 붙는다. 워크트리(체크아웃 뿌리의 `.git` 이 파일)에서 테스트 DB 가 compose 기본 포트(최상위 컨테이너)를 가리키면 — `.env` 가 없거나 최상위 값을 그대로 복사했으면 — 스위트가 멈춘다(`apps/api/test/test-database-url.ts` 의 `worktreeEnvError`). DB 가 필요 없는 트랙이라 `.env` 를 안 만들면 브리프의 게이트를 `pnpm exec vitest run --project unit --project web` 으로 적는다 — `pnpm test --project '!api'` 는 스크립트의 `--project '!build'` 와 부정 패턴 둘이 되어 api 까지 돈다(서로를 포함해 아무것도 안 빠진다).
- **그 `.env`의 값 다섯을 그 워크트리 것으로 바꾼다** — `POSTGRES_PORT` · `DATABASE_URL` · `TEST_DATABASE_URL` · `PORT` · `SESSION_COOKIE_NAME`(포트를 붙인다 — 쿠키는 포트를 가르지 않아 한 브라우저로 워크트리에 로그인하면 같은 호스트의 다른 체크아웃 세션을 덮는다). **절차와 그 값을 안 가르면 무엇이 보이는지는 `docs/guides/development.md` 「워크트리를 여럿 띄울 때」 절이 소유한다** — 여기 두 벌로 적지 않는다. 요지만: **워크트리마다 자기 컨테이너를 띄운다**(컨테이너·볼륨·포트·데이터가 전부 갈린다), 에디터의 프록시 대상은 `PORT`를 자동으로 따라가므로 손댈 곳이 없다.
- **Postgres 컨테이너는 워크트리마다 띄운다 — `pnpm db …` 로.** 개발 compose(`docker/dev/compose.yaml`)가 컨테이너 이름을 고정하지 않고 호스트 포트를 `POSTGRES_PORT`에서 받으며, 루트 `package.json` 의 `db` 스크립트가 `--project-directory .` 로 **체크아웃 디렉터리 이름을 프로젝트 이름으로** 쓰게 한다 — 그것이 격리 기전이다(컨테이너·볼륨이 그 이름을 따라간다). 그래서 **어느 체크아웃의 스크립트를 부르느냐가 곧 어느 컨테이너냐다** — `pnpm -C .worktrees/feat-<작업명> db up -d` 로 대상을 지정해도 된다. 그 파일을 `pnpm db` 밖에서 부르면(`docker compose -f docker/dev/compose.yaml …`) 프로젝트 이름이 모든 체크아웃에서 `dev` 하나가 되므로 파일이 멈춘다. **뿌리에서 맨 `docker compose …` 는 배포 compose(`compose.yaml`)다** — 개발 DB 명령이 아니다. 메인 세션이 안 띄웠으면 워커가 자기 것을 띄운다(이제 그 컨테이너는 그 워크트리의 것이지 공유 자원이 아니다). **띄운 뒤 `pnpm db port postgres 5432` 가 그 포트를 찍는지 본다** — 포트 충돌 뒤 다시 친 `up` 은 종료 0 · healthy 인데 포트 없이 뜨고, 그때 `DATABASE_URL` 은 포트를 쥔 **다른 컨테이너의 DB** 에 닿는다. 종료 1 이면 포트 없이 뜬 것이다. **그때 어긋나면 무엇이 보이는지는 `docs/guides/development.md` 「워크트리를 여럿 띄울 때」 절과 `docs/guides/development.md` 「컨테이너를 못 찾는다 / 포트가 이미 잡혀 있다」 절이 소유한다** — 여기 옮겨 적지 않는다.

이 세팅은 워커를 띄우기 전에 메인 세션이 해 둔다. 워커가 첫 실행에서 빌드 누락으로 헤매는 시간을 없앤다. 이것은 아래 "메인 세션은 디스패치·판정·병합만 한다"를 어기는 것이 아니라 그 규칙이 말하는 **작업 공간 생성**의 일부다 — 워커가 아직 없어 덮어쓸 작업이 없고, 대상이 부트스트랩 명령과 `.env` 복사로 한정된다. 소스 파일은 여기서 건드리지 않는다. **워커를 띄운 순간 이 예외도 끝난다** — 이후 빌드가 다시 필요해지면 워커에게 시킨다.


## 워크트리 안의 작업은 Orca 세션이 한다

워크트리를 만들었으면 **그 워크트리에서 돌 Claude 세션을 Orca 로 띄운다.** 병렬 작업일 때만이 아니라 **워크트리를 쓰는 모든 작업**이 그렇다 — 백그라운드 서브에이전트(Agent 도구)보다 Orca 터미널 워커가 우선이다. 판단 지점과 절차는 `orca-worker` 스킬이 갖는다.

- **Why:** Orca 터미널 워커는 앱에 독립 터미널로 떠서 진행을 직접 보고 개입할 수 있고, Orca 태스크·디스패치 이력(provenance)이 남는다. 서브에이전트는 컨텍스트가 코디네이터 안에 숨어 안 보인다.
- **How to apply:**
  - CLI 실행자: `ORCA_CLI_COMMAND` 가 있으면 그 값, 없으면 macOS·일반은 `orca`, Linux 는 `orca-ide` — 리눅스에서 bare `orca` 는 GNOME 스크린리더로 붙는다. 오케스트레이션 experimental 기능이 켜져 있어야 한다.
  - **감독(supervised) vs 완전 위임(handoff):** 완료를 기다려 리뷰어를 띄우고 판정·병합하면 supervised(`task-create` + `worker-start` + `check --wait`). 소유권을 넘기고 안 지켜보면 full handoff(`terminal send` 또는 `worktree create --prompt`, lifecycle 프리앰블 안 붙임).

## 디스패치 상태는 에이전트의 생사가 아니다

`dispatch-show`가 `failed / Terminal closed by operator request`를 내도 **그 에이전트는 살아
있을 수 있다.** 코디네이터 세션이 재시작되면 Orca가 워크트리의 앞 세션을 **복원**하고, 그
에이전트는 자기 프롬프트를 이어서 계속 돈다. 디스패치 기록은 그때 이미 닫혀 있다.

**Why:** 기록만 보고 *"워커가 죽었다"*고 판단해 같은 워크트리에 재개 워커를 띄우면
**한 워크트리에 에이전트가 둘 붙는다.** 살아 있던 쪽이 설계를 고쳐 가는 중이면 재개 워커가
그 파일들을 덮어 **판단 과정이 통째로 사라진다.** 재개 워커가 이것을 잡는 길은 하나 —
`orca terminal list`로 터미널이 둘인 것을 보고, 파일이 자기 눈앞에서 바뀌는지(md5)를 실증한 뒤
**한 줄도 쓰지 않고 멈춰서 묻는 것**이다. **브리프의 전제를 의심하는 것이 워커의 일이다.**

**How to apply:**

- **재개·중복 판단 전에 `orca terminal list`로 실제 생존을 확인한다.** 그 워크트리에 붙은
  터미널과 `connected`를 본다. 디스패치 상태만으로 판단하지 않는다. **목록이 그 워크트리의 터미널을 하나도 안 내면(자기 세션도 안 보이면) 목록이 그 런타임의 터미널을 못 본 것이다** — «없다» 로 읽지 말고, 작업하는 동안 그 워크트리의 추적 파일 색인 md5(`git ls-files -s <경로> | md5`)와 `git status --short` 를 시작 · 끝에 견줘 다른 쓰는 자가 없었는지를 값으로 적는다(`docs/superpowers/plans/2026-11-14-rv-cf-report.md` 「지침」).
- 살아 있으면 **재개 워커를 띄우지 않는다.** 그 에이전트에게 `terminal send`로 정보를 주거나
  기다린다. 이미 띄웠으면 **새로 온 쪽을 물린다** — 맥락은 먼저 있던 쪽에 있다.
- **물릴 때 «자기 것과 남의 것을 구분 못 하면 복구하지 말고 그대로 두고 보고하라»고 한다.**
  남의 프로브를 덮는 것이 더 나쁘다.
- 디스패치가 닫힌 채 도는 에이전트는 `worker_done`이 거부된다(`capability is revoked`).
  **거부된 본문은 코디네이터에게 그대로 전달되므로 보고를 잃지는 않는다.** 완료는
  **커밋으로 감지**하면 된다.
- **디스패치가 닫힌 워커의 `orca orchestration ask` 도 코디네이터에게 안 닿는다** — 워커는 타임아웃까지 답을 못 받고 브리프의 기본값으로 간다. **물음은 파일로 받는다** — 브리프에 «물을 것은 `q-<트랙>.md` 에 적어라(답이 없으면 기본값으로 가고 보고에 적어라)»를 쓰고, 대기 루프는 그 파일의 수정 시각을 본다. 답은 그 파일 끝에 붙이고 워커 터미널에 «답을 붙였다»만 보낸다 — 답을 붙인 뒤 수정 시각을 대기 루프의 기록에 옮겨 적지 않으면 루프가 자기 답에 다시 깬다. **터미널에 묻게 하지 않는다** — 워커가 «물었다»고 믿고 출력하지 않는 일이 생긴다. 터미널 표지(`❓ 코디네이터에게`)는 보조로만 쓰고, 쓸 때는 **줄 머리로** 잡는다 — 브리프 본문이 같은 표지를 인용하므로 글자만 찾으면 제출 직후에 거짓으로 깬다. 워커가 코디네이터 스크래치의 물음 파일에 셸로(`cat >>`) 덧붙이면 그 경로가 안 보여 튕기는 판이 있다 — 파일 도구(Edit)로 붙이고 붙었는지 다시 읽게 한다.
- **채팅 워커(핸들이 `structworker_…`)는 `orca terminal send` 를 안 받는다**(`terminal_unsupported_for_agent_session`) — 답을 붙였다는 알림 · 정보는 `orca orchestration send --to dispatch:<dispatchId>` 로 보낸다. 끝난 워커의 세션에 `worker-start --terminal <핸들>` 로 새 태스크를 이어 붙이면 `session_caller_not_live` 로 거절된다(효과 없음) — 새 워커를 `--agent` 로 띄운다.
- **트랙 키를 고르기 전에 `.worktrees/.coord/` 에 `brief-<키>.md` · `q-<키>.md` 가 이미 있는지 본다** — 옛 트랙의 키를 다시 쓰면 파일 도구가 옛 브리프를 말없이 덮고, 남은 옛 물음 파일이 새 워커의 물음으로 읽힌다.
- 리뷰어를 여럿 붙이는 것도 같은 사고다. **둘이 동시에 변조를 심으면 서로의 복구를 망친다** —
  한쪽이 되돌린 것을 다른 쪽이 자기 변조로 알고 다시 되돌린다. 그래도 이미 붙어 완주한 중복
  리뷰어의 발견은 **버릴 결과가 아니다** — 자기 변조 시간대를 적게 해, 그 시간에 다른 리뷰어가 본
  실패는 거짓일 수 있다고 가를 수 있게 한다.

## 워크트리 폐기

작업이 병합되거나 폐기되면 정리한다.

```bash
# 1. 그 워크트리의 컨테이너와 볼륨을 먼저 지운다 — 그 워크트리의 스크립트로
pnpm -C .worktrees/<워크트리명> db down
docker volume rm <워크트리명>_wirebound-pgdata     # 그 워크트리의 데이터. 확인하고 지운다

# 2. 워크트리를 지운다
git worktree remove .worktrees/<워크트리명>
```

- **컨테이너·볼륨을 먼저 지운다.** 워크트리를 지우면 `docker/dev/compose.yaml` · `package.json` 이 사라져 `pnpm db down` 이 그 프로젝트를 못 찾는다 — 컨테이너와 볼륨이 이름만 남아 떠돈다(`docs/guides/development.md` 「컨테이너를 못 찾는다 / 포트가 이미 잡혀 있다」 절 — `docker volume ls` 에서 지워진 워크트리 이름이 붙은 볼륨이 그것이다).
- **볼륨 이름을 확인하고 지운다**(`docker volume ls`). 사용자의 설계서가 든 볼륨과 이름이 한 글자 다를 뿐이다.
- 그 워크트리에 붙어 있는 Orca 터미널이 있으면 먼저 종료한다. 세션이 살아 있으면 제거가 실패하거나 지워진 경로에서 도는 좀비 세션이 남는다.
- **워커가 띄운 dev 서버가 남아 있는지 본다.** 컨테이너·볼륨과 달리 이것은 `pnpm db down` 이 안 지운다. api 를 띄운 워커·리뷰어가 저마다 `tsx watch` 를 남기고, 상류 컨테이너가 사라져도 supervisor 는 안 죽는다. 워크트리를 지우면 **지워진 경로에서 도는 좀비**가 된다.

  ```bash
  ps -eo pid,etime,command | grep '<워크트리명>' | grep -v grep   # 경로로 확인하고
  kill <pid>…                                                     # 안 죽으면 kill -9
  ```

  명령 줄에 경로가 없는 서버(그 디렉터리에서 상대 경로로 띄운 것)는 `ps … | grep` 에 안 걸린다 — 그 워크트리의 포트로 `lsof -nP -t -iTCP:<PORT> -sTCP:LISTEN` 을 세고, pid 의 cwd(`lsof -p <pid> -a -d cwd`)가 그 워크트리인지 본 뒤 내린다.

  **브리프에 «끝나면 서버를 내려라»를 적어도 남는다** — 세션이 중간에 끊기거나 재개되면 앞 세션의 것이 그대로 산다. 폐기 직전에 메인 세션이 한 번 본다.
- 디렉터리를 `rm -rf`로 먼저 지웠다면 `git worktree prune`을 함께 돌려 등록 정보를 지운다.

## 이 프로젝트에서 병렬화가 잘 맞는 지점

워크트리 자체는 단일 작업에도 쓴다. 여기서 말하는 것은 **워커를 여럿 띄울 만한** 지점이다. 구현 계획의 태스크는 대부분 앞 태스크의 산출물을 쓰므로 순차 실행이 기본이다.

- 카탈로그 그룹별 컴포넌트 정의 (구조/데이터/입력/액션/문서) — 서로 독립적이다
- 시스템 테마를 테마마다 만들 때 — SDK 뷰 계약 위에서 테마끼리 서로 간섭하지 않는다

반대로 `packages/schema`의 patch·validate·tree는 서로 물려 있어 나눠 돌리면 충돌만 난다.

**api 테스트를 도는 작업끼리도 동시에 돌려도 된다 — 붙는 DB 가 다르면.** **워크트리마다 자기 컨테이너를 띄우면 저절로 갈린다**(포트가 다르다). **값은 `docs/guides/development.md` 「워크트리를 여럿 띄울 때」 절의 표가 소유한다 — 여기 옮겨 적지 않는다**(가리키면서 같은 자리에 값을 다시 적으면 값이 바뀔 때 고칠 자리가 늘고 한쪽이 조용히 낡는다). **가르지 않았으면 동시에 돌리지 마라** — 부트스트랩에서 `.env`의 값 다섯을 안 바꾸고 컨테이너도 안 띄웠으면 두 작업이 한 DB 에서 서로의 판을 지운다.
