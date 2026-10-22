# wirebound

웹 화면 설계 도구. 관리자 화면을 시작점으로 하되 마케팅·포털·커머스 등 다양한 형태의 웹 설계서를 같은 도구로 작성한다.

- 패키지명 `wirebound`, CLI 명령 `wireb`
- 설계 문서: `docs/superpowers/specs/2026-08-03-wirebound-design.md` — **살아 있는 정본이다.** `docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」의 «spec»에 들지 않는다 — 늘 지금 참인 설계만 적는다(«언제 뒤집혔다»·«앞 판은» 없이). 시점 기록은 `docs/superpowers/plans/*`(이월 장부 포함)가 갖는다.
- 구현 계획: `docs/superpowers/plans/`
- API 기동 절차·엔드포인트 계약: `apps/api/README.md`

## 스택

TypeScript 모노레포 (pnpm workspace) · React 19 · Node(Fastify) · PostgreSQL · vitest

```
packages/schema     노드 타입·컴포넌트 카탈로그·검증·JSON Patch   ← 단일 진실
packages/theme-sdk  테마 뷰 계약(view · Root · Focus · useToken) · SDK 기본 뷰
packages/renderer   스키마 → React 렌더링 — 노드마다 «테마 뷰 → 기본 뷰»
packages/themes     manifest 검증 · 토큰 CSS · .wbtheme 읽기 · 쓰기 · 스냅샷 payload 규격 · 설계 lint
packages/theme-gallery 카탈로그 × variant 표본 갤러리(kit dev 가 그린다)
packages/theme-kit  테마 작성 도구 wb-theme — dev · build · 스타터 템플릿(pack-template)
system-themes/*     저장소 테마(admin 하나 — id 는 system-<이름> · 보이는 이름 «기본테마») — pnpm build 가 .wbtheme 로 낸다 · api 가 기동 때 시딩한다 · 판마다 sha256 을 `system-themes/<이름>/checksums.json` 에 적는다(테마마다 제 표)
packages/exporter   HTML 정적 번들 · PPTX
packages/cli        wireb
packages/mcp        MCP 서버
packages/test-support 케이스 공용 도우미(stripComments · 시딩되는 system-admin 의 판과 토큰)
apps/web            설계서 에디터
apps/api            REST + WebSocket
apps/playground     렌더러 + system-admin 표본 화면(셸 · iframe 없이 vite 로 띄운다)
Dockerfile · compose.yaml 배포 이미지 · 단일 서버 compose — 앱만, 프록시는 서버마다 compose.override.yaml (docs/guides/deploy-docker.md)
docker/web · docker/dev 입구(web)의 Caddyfile · 개발 Postgres compose(pnpm db …)
```

의존 방향은 한 방향이다: `schema` ← `renderer` ← 나머지. `packages/test-support` 는 `system-themes/*` 패키지에 기대지 않는다 — `renderer` 의 케이스가 test-support 에 기대고 시스템 테마는 renderer 에 기대어, 고리가 되면 `pnpm build` 의 차례가 깨진다(테마가 kit 보다 먼저 빌드되어 `wb-theme` 을 못 찾는다). `schema`는 zod 외의 런타임 의존을 갖지 않으며 브라우저와 Node 양쪽에서 동작해야 한다.

## 명령

```bash
pnpm install
pnpm test                 # 전체 워크스페이스 테스트 (루트 vitest.config.ts)
pnpm typecheck
pnpm vitest run <경로>    # 단일 파일 테스트
pnpm fmt                  # oxfmt — 설정은 .oxfmtrc.json (JS · TS · JSON · YAML · TOML — md · css · html 은 뺀다)
pnpm lint                 # oxlint
```
