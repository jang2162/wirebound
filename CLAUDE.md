# wirebound

웹 화면 설계 도구. 관리자 화면을 시작점으로 하되 마케팅·포털·커머스 등 다양한 형태의 웹 설계서를 같은 도구로 작성한다.

- 패키지명 `wirebound`, CLI 명령 `wireb`
- 설계 문서: `docs/superpowers/specs/2026-08-03-wirebound-design.md`
- 구현 계획: `docs/superpowers/plans/`

## 스택

TypeScript 모노레포 (pnpm workspace) · React 19 · Node(Fastify) · PostgreSQL · vitest

```
packages/schema     노드 타입·컴포넌트 카탈로그·검증·JSON Patch   ← 단일 진실
packages/renderer   스키마 → React 렌더링 (headless)
packages/themes     테마 규격·검증·CSS 컴파일
packages/exporter   HTML 정적 번들 (후속: PPTX)
packages/cli        wireb
packages/mcp        MCP 서버
apps/web            설계서 에디터
apps/api            REST + WebSocket
```

의존 방향은 한 방향이다: `schema` ← `renderer` ← 나머지. `schema`는 zod 외의 런타임 의존을 갖지 않으며 브라우저와 Node 양쪽에서 동작해야 한다.

## 명령

```bash
pnpm install
pnpm test                 # 전체 워크스페이스 테스트 (루트 vitest.config.ts)
pnpm typecheck
pnpm vitest run <경로>    # 단일 파일 테스트
```

---

# 병렬 작업과 워크트리

이 저장소는 여러 에이전트·작업이 워크트리를 통해 병렬로 돌 수 있다. **최상위 체크아웃은 혼자 쓰는 디렉터리가 아니라 공유 자원으로 취급한다.**

## 최상위에서는 임의로 브랜치를 체크아웃하지 않는다

최상위 프로젝트 디렉터리(워크트리가 아닌 원본 체크아웃)에서는 브랜치를 마음대로 `checkout`/`switch` 하지 않는다.

**Why:** 최상위의 HEAD를 옮기면 그 디렉터리를 보고 있는 다른 작업·IntelliJ·실행 중인 `pnpm dev`·vitest watch가 전부 영향을 받아 병렬 작업이 깨진다.

**How to apply:**

- 다른 브랜치에서 작업해야 하면 브랜치를 갈아타지 말고 워크트리를 새로 만든다 (`git worktree add`).
- 최상위에서 허용되는 것은 읽기 작업(`status`, `log`, `diff`, `show`, `fetch`)이다.
- 체크아웃이 꼭 필요하면 먼저 사용자에게 확인을 받는다.
- 워크트리 내부에서는 그 워크트리의 브랜치를 자유롭게 다뤄도 된다.

## 병렬 작업 중 커밋 주의

최상위 체크아웃은 다른 에이전트가 동시에 만지고 있을 수 있다.

- `git add -A` / `git commit -a`로 작업 트리 전체를 쓸어 담지 않는다. 남의 작업 중인 파일이 내 커밋에 섞인다.
- 커밋할 파일을 **경로로 명시해서** stage 한다.
- 커밋 직전에 `git status`로 stage 목록을 확인한다. 내가 건드리지 않은 파일이 있으면 멈추고 사용자에게 알린다.

## 워크트리 생성 규칙

- **위치:** `.worktrees/<브랜치-슬러그>/` (저장소 루트 하위, gitignore 됨). 저장소 바깥이나 임의 경로에 만들지 않는다 — 다른 에이전트가 찾지 못한다.
- **브랜치:** 워크트리를 만들 때 새 브랜치를 함께 만든다. 이미 다른 워크트리가 체크아웃한 브랜치는 git이 거부한다.

  ```bash
  git worktree add -b feat/<작업명> .worktrees/feat-<작업명>
  ```

  기준 브랜치를 명시해야 하면 마지막 인자로 준다 (`... .worktrees/x main`). 기본은 현재 HEAD다.

- **하나의 작업 = 하나의 워크트리.** 여러 작업을 한 워크트리에서 브랜치 갈아타며 처리하지 않는다.
- **작업 전 확인:** `git worktree list`로 같은 작업의 워크트리가 이미 있는지 본다. 있으면 새로 만들지 말고 그것을 쓴다.

## 생성 직후 세팅

새 워크트리는 빈 체크아웃이다. 빌드·테스트 전에 워크트리 안에서 직접 돌린다.

```bash
cd .worktrees/feat-<작업명>
pnpm install       # node_modules 는 워크트리마다 따로 필요하다
pnpm typecheck     # 컴파일 확인 겸 캐시 예열
pnpm test
```

- `pnpm install`을 빠뜨리면 워크스페이스 심링크가 없어 `@wirebound/*` import가 전부 깨진다.
- gitignore 대상인 로컬 설정은 따라오지 않는다. `.env.local`처럼 커밋되지 않는 파일이 필요하면 최상위 체크아웃에서 복사한다.

## 워크트리 폐기

작업이 병합되거나 폐기되면 정리한다.

```bash
git worktree remove .worktrees/<워크트리명>
```

디렉터리를 `rm -rf`로 먼저 지웠다면 `git worktree prune`을 함께 돌려 등록 정보를 지운다.

## 병렬·워크트리 작업은 Orca 환경이면 `/orchestration`으로

병렬 작업이나 워크트리를 분리해 굴리는 상황이면, 먼저 Orca 앱 환경인지 확인하고 가능하면 Orca 오케스트레이션(`/orchestration`)으로 별도 Orca 터미널에 워커를 띄워 진행한다 — 백그라운드 서브에이전트(Agent 도구)보다 우선한다.

**Why:** Orca 터미널 워커는 앱에 독립 터미널로 떠서 진행을 직접 보고 개입할 수 있고, Orca 태스크·디스패치 이력(provenance)이 남는다. 서브에이전트는 컨텍스트가 코디네이터 안에 숨어 안 보인다.

**환경 확인:** `orca status --json`이 running runtime을 보이면 Orca 환경이다. (CLI 실행자: `ORCA_CLI_COMMAND`가 있으면 그 값, 없으면 macOS·일반은 `orca`, Linux는 `orca-ide` — 리눅스에서 bare `orca`는 GNOME 스크린리더로 붙는다.) 오케스트레이션 experimental 기능이 켜져 있어야 한다.

**방식은 외우지 말고** `orca skills get orchestration`으로 버전 맞춤 가이드를 읽는다 (플래그·서브커맨드가 릴리스마다 바뀐다). 요지:

1. `git worktree add`로 만든 `.worktrees/*`도 Orca가 인식한다 (`orca worktree list --json`에 id로 나옴)
2. 그 워크트리 id로 `orca terminal create --worktree id:<fullId> --command "claude"`
3. `terminal wait --for tui-idle`
4. 감독이면 `orchestration task-create` + `dispatch --inject` + `check --wait --types worker_done,escalation,decision_gate`

**감독(supervised) vs 완전 위임(handoff):** 완료를 기다려 리뷰·병합하면 supervised(`task-create` + `dispatch --inject` + `check --wait`). 소유권을 넘기고 안 지켜보면 full handoff(`terminal send` 또는 `worktree create --prompt`, lifecycle 프리앰블 안 붙임).

Orca 환경이 아니거나 오케스트레이션이 불가하면 기존대로 워크트리 + 서브에이전트(Agent 도구)로 진행한다.

## 이 프로젝트에서 병렬화가 잘 맞는 지점

구현 계획의 태스크는 대부분 앞 태스크의 산출물을 쓰므로 순차 실행이 기본이다. 병렬로 돌릴 만한 것은 다음 정도다.

- 카탈로그 그룹별 컴포넌트 정의 (구조/데이터/입력/액션/문서) — 서로 독립적이다
- 구조 구현체를 그룹별로 나눠 구현할 때 (P4b)
- 시스템 테마 5종 제작 (P4b) — 테마 엔진이 완성된 뒤라면 서로 간섭하지 않는다

반대로 `packages/schema`의 patch·validate·tree는 서로 물려 있어 나눠 돌리면 충돌만 난다.
