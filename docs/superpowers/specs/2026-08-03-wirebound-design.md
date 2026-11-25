# wirebound 설계 문서

이 문서는 살아 있는 정본이다 — 늘 지금 참인 설계만 적는다. 시점 기록(계획 · 이월 장부)은 `docs/superpowers/plans/`가 갖는다.

---

## 1. 개요

**wirebound**는 웹 화면 설계 도구다. 프로젝트의 메뉴 트리를 좌측에 두고, 중앙에서 페이지 목업을 확인하며, 우측에서 번호별 코멘트와 상호작용 설명을 읽는다. Storybook이 컴포넌트를 트리로 탐색하게 만든 것처럼, wirebound는 **화면 설계서**를 트리로 탐색하게 만든다.

관리자 화면이 첫 번째 대상이지만 거기에 한정하지 않는다. 마케팅 사이트, 포털, 커머스, 문서 사이트까지 같은 도구로 설계한다. 이 범용성은 테마 시스템이 담당한다(§6).

기존 도구와의 차이는 세 가지다.

1. **목업이 그림이 아니라 데이터다.** 페이지는 컴포넌트 트리 JSON이며, 좌표가 아니라 구조로 표현된다. 따라서 기계가 읽고 검증하고 수정할 수 있다.
2. **테마가 디자인 시스템이다.** 같은 페이지 스키마가 테마에 따라 관리자 테이블로도, 마케팅 랜딩 페이지로도 렌더된다. 테마 교체가 곧 사이트 리디자인이다.
3. **LLM 에이전트가 1급 사용자다.** MCP 서버와 CLI가 사람과 동일한 편집 경로를 쓴다. 개발 리포에 `.wirebound.json`을 두면 코딩 에이전트가 설계서를 읽고 구현하며, 어긋난 부분을 설계서에 코멘트로 되돌려준다.

패키지명은 `wirebound`, CLI 명령은 `wireb`다.

### 1.1 대상 사용자

- **기획자 / PM** — 화면을 설계하고 코멘트를 단다. 코드를 쓰지 않으며, 테마는 고르기만 한다.
- **디자이너** — 레이아웃을 잡고 테마를 만든다. 테마는 headless SDK 위의 코드 패키지로 짠다(§6).
- **개발자** — 설계서를 읽고 구현한다. CLI/MCP로 접근한다.
- **코딩 에이전트** — MCP를 통해 설계서를 읽고 구현하며 피드백을 남긴다.

### 1.2 성공 기준

- 기획자가 코드 없이 화면 설계서 한 벌을 완성할 수 있다.
- 같은 페이지 스키마에 다른 테마를 적용하면 다른 성격의 사이트로 보인다.
- 두 사람이 같은 페이지를 동시에 열고 편집해도 서로의 작업이 유실되지 않는다.
- 내보낸 HTML 번들이 웹 앱에서 보던 것과 구조적으로 동일하다.
- 코딩 에이전트가 사람의 설명 없이 설계서만 읽고 화면을 구현할 수 있다.

---

## 2. 확정된 설계 결정

| 축 | 결정 | 근거 |
|---|---|---|
| 실행 형태 | 서버형 SaaS (웹 앱) | 프로젝트 단위 권한 분리와 실시간 협업이 요구사항 |
| 저작 방식 | 선언적 스키마(JSON 트리) + GUI 트리/폼 에디터 | 좌표 기반은 LLM이 다루기 어렵고 재사용·내보내기가 불리 |
| 기술 스택 | TypeScript 모노레포 (React + Node + PostgreSQL) | 스키마·검증·렌더러를 웹/CLI/MCP/내보내기가 공유 |
| 스타일 | 쉘(Layout) / 테마(Theme) 분리 | 여러 레이아웃이 같은 디자인 언어를 공유해야 함 |
| 테마 범위 | 디자인 시스템 정의 — headless SDK 위의 코드 패키지(뷰 + 토큰) (§6) | 관리자 외 다양한 형태의 웹을 같은 도구로 설계해야 함 |
| 형태 | 테마의 뷰가 마크업을 정하고, 카탈로그(컴포넌트 종류 · props)는 닫혀 있다 | 형태를 바꾸는 자유를 주면서도 검증 · 내보내기 · LLM 조작이 기대는 닫힌 스키마를 지킨다 |
| 이력 | JSON Patch 커맨드 로그, 개인 undo 스택, 태그형 스냅샷 | 동시편집 환경에서 누가 무엇을 바꿨는지 추적 가능 |
| 동시편집 | WebSocket 실시간 반영 + 노드 단위 소프트 잠금 | CRDT 없이 설계서 작업에 충분한 협업 수준 |
| 상호작용 | 선언적 트리거→액션 규칙 (고정 액션 목록) | 스크립트 없이 검증 가능, 자동 문장화 가능 |
| 컴포넌트 | 내장 카탈로그 고정 (확장 없음) | 스키마를 닫아두면 검증·렌더링·내보내기가 단순 |
| 권한 | 프로젝트 단위 멤버 초대 (owner/editor/viewer) | 요구된 3종 권한과 1:1, 조직 계층 불필요 |
| LLM 연계 | 서버 API 직결 MCP·CLI, `.wirebound.json` 리포 바인딩 | 파일 동기화 없이 실시간 반영 |
| 내보내기 | HTML 정적 번들, PPTX는 렌더 이미지 방식 | 렌더러 재사용으로 비용이 거의 없음. 도형 변환은 포기 |
| MVP 범위 | 실시간 동시편집 + 스냅샷 + 상호작용 포함, MCP/CLI 제외 | 협업 도구로서의 핵심을 먼저 완성 |

**서버 구현 결정**

| 축 | 결정 | 근거 |
|---|---|---|
| DB 접근 | Kysely 쿼리 빌더 + 손으로 쓴 SQL 마이그레이션 | JSON 컬럼(`schema`·`tokens`·`ops`)이 많고 §7.1의 트랜잭션 경계를 직접 제어해야 한다. ORM 추상화가 얻는 것이 없다 |
| 인증 | HttpOnly 세션 쿠키 + DB 세션 (§10) | WebSocket 핸드셰이크가 같은 쿠키를 쓰고, 권한 회수가 즉시 반영된다 |
| 비밀번호 | `node:crypto`의 scrypt (파라미터를 해시 문자열에 동봉) | 네이티브 의존 없이 OWASP 권장 KDF를 쓴다. 파라미터 동봉으로 나중에 비용을 올려도 기존 해시가 유효하다 |
| 패키지 배포 | `schema`·`renderer`를 tsdown으로 빌드, `exports`는 `dist` | §3.3의 "Node와 브라우저 양쪽에서 동작"을 번들러 없이 만족시킨다. 개발·테스트는 `development` 조건으로 소스를 직접 본다 |
| 테스트 DB | Docker Compose Postgres + 테스트별 트랜잭션 롤백 | §14의 권한 매트릭스·통합 테스트가 실제 Postgres 동작(제약·jsonb)을 요구한다 |
| 배포 형태 | 단일 리눅스 서버 · docker compose — 앱만: api 프로세스 하나 · Postgres · HTTP 입구(Caddy). TLS · 도메인은 서버마다의 프록시가 맡고 그 차이는 `compose.override.yaml` 이 갖는다. 이미지는 저장소의 `Dockerfile`, compose 는 뿌리의 `compose.yaml` | 팀이 자체 호스팅하는 도구이고 실시간 층이 프로세스 하나를 전제한다. 절차 · 잰 값은 `docs/guides/deploy-docker.md`, 이미지 없이도 지킬 조건은 최상위 README 「배포하려면」 |
| PPTX 화면 이미지의 자원 상한 | 동시에 뜨는 브라우저 수(env `EXPORT_RENDER_LIMIT`, 비우면 2 — 넘은 요청은 줄을 서서 기다린다) · 한 장의 넓이(뷰포트 폭 × 8192 CSS px — 넘은 장은 그리지 않고 크기와 상한을 말한다. 테마의 전이 · 애니메이션을 끄고 글꼴을 한 장의 한도 안에서 기다린 뒤 재고 잰 크기로 묶어 찍는다 — 찍는 사이에 커진 장 · 글꼴이 한도 안에 안 온 장도 안 그린다) · 장 수(200). **바이트 상한은 두지 않는다** | 브라우저 하나가 수백 MB, 긴 페이지 한 장이 수 GB 를 먹는다 — 서버 하나의 메모리를 이 셋이 묶고, 파일 크기도 셋의 곱으로 묶인다. 넘은 장을 자르지 않는 것은 잘린 목업이 멀쩡한 한 장으로 읽히기 때문이다 |

### 2.1 명시적으로 제외한 것 (YAGNI)

- **페이지의 반응형 편집** — 페이지 스키마에 브레이크포인트별 분기를 두지 않는다. 반응형은 **테마가 정의**하고(§6), 사용자는 뷰포트 프리셋을 바꿔 확인만 한다.
- **자유 좌표 배치** — 레이아웃 규칙 기반 배치만 지원한다.
- **CRDT 실시간 협업** — 소프트 잠금으로 충분하다.
- **컴포넌트 플러그인** — 카탈로그는 닫혀 있다(§5). 테마는 코드 패키지지만 뷰 · 토큰만 내고 컴포넌트 종류 · props 를 더하지 못한다 — 닫아 둬야 검증 · 내보내기 · LLM 편집 · lint · 테마 교체가 성립한다(§6).
- **테마 코드의 격리** — 테마 패키지는 인스턴스 관리자만 올리고, 올라온 코드는 브라우저에서 같은 origin 의 신뢰 코드로 돈다(샌드박스 없음). 서버(api 의 Node 프로세스)는 테마 코드를 실행하지 않는다.
- **사이트 안의 테마 작성** — 사이트에는 코드 에디터 · 서버 쪽 빌드가 없다. 테마는 저장소 밖에서 짜서 `.wbtheme` 로 빌드해 올린다(§6). CLI 로 올리는 길 · 한 프로젝트 안의 토큰 여러 벌도 두지 않는다 — 까닭은 `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「목적과 범위」.
- **PPTX 무손실 도형 변환** — 렌더 이미지 삽입 방식으로 확정한다.
- **조직/워크스페이스 계층** — 프로젝트 단위 초대로 시작한다.
- **비로그인 공유 링크** — 후속 과제.
- **CLI 양방향 파일 동기화** — 로컬 파일을 편집해 서버로 밀어 올리는 `push` 흐름은 만들지 않는다. 수정은 항상 서버 API를 직접 호출한다. 읽기 전용 덤프(`wireb pull`)만 제공한다.

---

## 3. 아키텍처

### 3.1 패키지 구조

```
apps/
  web        React SPA — 3분할 설계서 에디터
  api        Node(Fastify) — REST + WebSocket, PostgreSQL

packages/
  schema     노드 타입 정의 + zod 검증 + JSON Patch 유틸 + lint 규칙
  renderer   schema → React 렌더링 (노드마다 테마 뷰를 그린다)
  theme-sdk  테마 뷰 SDK — 뷰 계약 · SDK 기본 뷰와 그 CSS · 공유 런타임(`./runtime`)
  themes     테마 manifest 규격 · 검증 · 토큰 CSS · `.wbtheme` 읽기 · 쓰기 · 스냅샷 payload 규격 · 설계 lint 입구
  theme-gallery 카탈로그 × variant 표본 갤러리 · 이어진 예제 페이지
  theme-kit  테마 작성 도구 — `wb-theme dev` · `build` · `check` · `shots` · 스타터 템플릿
  exporter   HTML 정적 번들 · PPTX 생성
  cli        wireb
  mcp        MCP 서버

system-themes/
  admin      시스템 테마(id 는 system-<이름> · `system-admin` 하나 — 보이는 이름 «기본테마») — 저장소 빌드가 `.wbtheme` 로 내고 api 가 기동 때 넣는다(§6)
```

### 3.2 핵심 원칙

**`schema` 패키지가 유일한 진실이다.**
웹 에디터, 서버 검증, HTML 내보내기, MCP가 전부 같은 타입 정의와 같은 검증기를 쓴다. 스키마가 한 곳에만 있으므로 "웹에서는 통과했는데 CLI에서는 실패"하는 상황이 생기지 않는다.

**렌더러는 하나뿐이다.**
`renderer`가 웹 앱의 캔버스와 내보낸 HTML 양쪽을 그린다. 두 개의 렌더 구현이 존재하지 않으므로 결과가 어긋날 수 없다.

**렌더러는 스타일을 갖지 않고, 형태는 테마의 뷰가 정한다.**
`renderer`는 노드마다 테마의 뷰(없으면 SDK 기본 뷰)를 React 컴포넌트로 그리고 `data-wb-*` 속성을 싣는다(§6.1). 스타일은 테마의 CSS가 담당한다. 카탈로그가 닫혀 있으므로 테마 교체로 형태가 바뀌어도 문서의 계약(컴포넌트 종류 · props)은 그대로다.

**모든 편집은 같은 파이프라인을 통과한다.**
사람의 GUI 편집, MCP의 patch, CLI의 수정이 모두 `검증 → revision 기록 → 브로드캐스트`를 거친다. 우회 경로가 없으므로 이력이 항상 완전하다.

### 3.3 각 패키지의 책임과 의존

| 패키지 | 책임 | 의존 |
|---|---|---|
| `schema` | 노드 타입, props 정의, zod 검증, patch/inverse 생성, 마이그레이션, lint 규칙 | 없음 |
| `renderer` | 스키마 트리 → 노드마다 테마 뷰(없으면 SDK 기본 뷰), 상호작용 런타임 | `schema`, `theme-sdk` |
| `theme-sdk` | 뷰 계약(`view` · `Root` · `Focus`), manifest 타입(`defineManifest`), SDK 기본 뷰와 그 CSS, 공유 런타임(`installRuntime` — `theme.js` 가 `__wirebound_runtime__` 에 등록한다) | 없음(react 는 peer) |
| `themes` | 테마 manifest 규격 · 검증(`validateManifest`), 토큰 → CSS 변수(`tokensCss`), `.wbtheme` 읽기 · 쓰기(`readWbtheme` · `packWbtheme`), 스냅샷 payload 규격과 lint 입력 변환, 설계 lint 입구(`lintProject`) | `schema`, `theme-sdk`(타입만) |
| `theme-gallery` | 카탈로그 × variant 표본을 그리는 갤러리(`ThemeGallery` — 그룹별 격자 · `wb-theme shots` · `check` 가 여는 목록 판) · 포커스 · 마커 겹쳐 보기 · 이어진 예제 페이지(`ThemeExamples` — 가상의 «주문 관리» 장 넷 + 팝업, 문서의 상호작용으로 장을 바꾼다) | `schema`, `renderer`, `theme-sdk` |
| `theme-kit` | 작성자 도구 `wb-theme` — `dev`(«컴포넌트» · «예제 페이지» 미리보기 · 토큰 패널 · 뷰포트 프리셋 · HMR), `build`(`.wbtheme`), `check`(갤러리 칸 전부를 jsdom 에서 번들로 그려 오류 · 안 쓰는 토큰을 본다), `shots`(갤러리를 목록 판으로 실 Chromium 으로 폭마다 찍고 콘솔 오류 · 폴백 · 가로 넘침을 적는다), `pack-template`(스타터 템플릿 zip). 비공개 패키지(`schema` · `themes` · `renderer` · `theme-gallery`)는 산출물 안에 묶는다 | `theme-sdk`(peer), vite |
| `exporter` | 정적 HTML 번들 · PPTX 생성 | `schema`, `renderer`, `theme-sdk`, `themes` |
| `cli` | 터미널 명령, API 클라이언트 | `schema`, `themes` |
| `mcp` | MCP 도구 정의 | `cli` |
| `system-themes/*` | 시스템 테마의 소스(SDK 뷰 · manifest · `theme.css`) | `theme-sdk`(빌드는 `theme-kit`) |
| `apps/api` | 인증, 권한, 영속성, revision, WebSocket, 시스템 테마 시딩 | `schema`, `theme-sdk`, `themes`, `exporter` |
| `apps/web` | 에디터 UI, 실시간 동기화, undo 스택, 프로젝트 설정 · 테마 관리 화면 | `schema`, `renderer`, `theme-sdk`, `themes`, `theme-gallery` |

`schema`가 의존을 갖지 않는다는 점이 중요하다. Node와 브라우저 양쪽에서 동작해야 한다.

---

## 4. 도메인 모델

### 4.1 엔티티 관계

```
User
Project ──┬── ProjectMember (user, role: owner|editor|viewer)
          ├── ApiToken     (name, hash, createdBy, scope=projectId)
          ├── MenuNode     (parentId, order, title)   ← 트리
          │     └── Page   (title, order, description, schema — 레이아웃은 schema.layout)
          │           ├── Comment  (marker, nodeId, body, author)
          │           └── Revision (seq, actor, ops[], inverse[], createdAt)
          ├── Module       (name, nodes)
          ├── CodeGroup    (key, name, order)          ← 공통코드 표
          │     └── CodeItem (value, name, order, active)
          └── Snapshot     (tag, description, atSeq, payload, createdBy)
```

### 4.2 테이블 정의

```sql
users(id, email, name, password_hash, is_instance_admin, created_at, deactivated_at, invite_id, last_seen_at)
  UNIQUE (email)
  is_instance_admin = 인스턴스 관리자(§10). 주는 길은 서버의 명령 · 시딩 · 관리자 API 다
  deactivated_at    = 비활성 표시 — NULL 이면 활성. 비활성화가 관리자 표시도 지운다
  invite_id         = 들어온 초대 링크 → invites (링크를 지우면 NULL)
  last_seen_at      = 마지막 접속 — 세션 조회가 묶어서 고친다. 세션이 지워져도 남는다

invites(id, name, kind, token_hash, expires_at, revoked_at, created_by, created_at)
  kind = 'single'(가입 하나로 다 씀) | 'multi'(만료 · 거둠까지)
  token_hash = 링크 원문의 sha256 해시 (원문은 저장하지 않는다)

password_resets(id, user_id, token_hash, expires_at, used_at, created_by, created_at)
  만든 뒤 24 시간 · 한 번. used_at 은 쓴 시각이고, 새 링크 · 비활성화 · 만든 사람의 해제가 막을 때도 채운다

admin_audit(id, at, action, actor_id, target_user_id, project_id, invite_id, detail)
  actor_id NULL = 서버 명령. 대상 칸은 FK 가 없다(대상이 지워져도 기록은 남는다)

sessions(id, user_id, expires_at, created_at, last_seen_at)
  id = 쿠키에 실린 세션 토큰의 sha256 해시 (원문은 저장하지 않는다)

projects(id, name, slug, description,
         theme_id, theme_version, theme_tokens json, theme_rev int, created_at, updated_at)
  FK (theme_id, theme_version) → theme_packages  RESTRICT
  theme_id · theme_version 은 함께 NULL 이거나 함께 값이다 — NULL 은 «아직 고정 안 됨»(기동 시딩이 채운다)
  theme_tokens = 기본값과 다른 토큰 값만 · theme_rev = 바인딩 저장 · 판 3 복원마다 1 오른다

theme_packages(theme_id, version, name, description, sdk_range, manifest json,
               files bytea, size, sha256, uploaded_by, uploaded_at, hidden_at)
  PK (theme_id, version)
  files = .wbtheme zip 원본 · uploaded_by NULL = 시스템 테마(또는 지워진 사용자)
  행은 hidden_at 말고 안 바뀐다 — 지우는 길이 없다

project_members(project_id, user_id, role, invited_at)
  PK (project_id, user_id)
  role ∈ ('owner','editor','viewer')

api_tokens(id, project_id, name, token_hash, user_id, last_used_at, created_at)

menu_nodes(id, project_id, parent_id, title, sort_order, created_at)
  parent_id NULL = 루트

pages(id, project_id, menu_node_id, title, sort_order, layout_id,
      description text, schema jsonb, schema_version int,
      head_seq bigint, structure_seq bigint, updated_at)

comments(id, page_id, node_id text, body text,
         author_id, created_at, updated_at)
  번호(marker)는 이 행이 아니라 페이지 문서의 노드가 든다 (§4.3)

revisions(id, page_id, seq bigint, actor_type, actor_id, actor_label,
          ops jsonb, inverse jsonb, created_at)
  UNIQUE (page_id, seq)
  actor_type ∈ ('user','mcp','cli')

snapshots(id, project_id, tag, description, payload jsonb,
          created_by, created_at, kind)
  kind ∈ ('tag','restore-safety','cascade-safety') — 누가 찍었는지(사람 · 복원 · 연쇄 — §4.5)

modules(id, project_id, name, nodes jsonb, created_by, created_at, updated_at)
  nodes = 모듈의 노드 묶음(§11.1) · name 에 유일 제약이 없다

code_groups(id, project_id, key, name, sort_order, created_at, updated_at)
  UNIQUE (project_id, key) · project_id CASCADE
  key = 노드가 가리키는 그룹 키 — 만든 뒤 못 바꾼다(§4.3 «공통코드 참조»)

code_items(id, group_id, value, name, sort_order, active, created_at, updated_at)
  UNIQUE (group_id, value) · group_id CASCADE
  value = 노드가 가리키는 코드값 — 만든 뒤 못 바꾼다 · active = 사용 여부(사용 안 함은 그리기 · 고르기에서 빠진다)

asset_blobs(sha256, bytes bytea, mime, size, width, height, created_at)
  sha256 = 바이트의 sha256 소문자 hex — 내용이 이름이다(같은 그림은 한 행) · width · height = 올릴 때 잰 원래 크기(SVG 는 viewBox)
  마지막 소유 행이 지워지면 함께 지워진다(트리거) — §11.4

project_assets(project_id, sha256, name, uploaded_by, created_at)
  PK (project_id, sha256) · project_id CASCADE · sha256 → asset_blobs RESTRICT

personal_assets(owner_id, sha256, name, created_at)
  PK (owner_id, sha256) · owner_id CASCADE · sha256 → asset_blobs RESTRICT
```

`pages.schema`는 materialized 상태다. 읽기는 항상 이 컬럼 하나로 끝난다. `revisions`는 append-only 이력이며, replay는 감사와 스냅샷 검증 용도로만 쓴다.

`pages.head_seq`는 해당 페이지의 최신 revision seq다. 클라이언트가 patch를 보낼 때 `baseSeq`로 사용한다. `pages.structure_seq`는 **구조(노드 추가 · 삭제 · 옮김 — 노드의 id · 부모 · 차례)가 마지막으로 바뀐 편집의 seq**다 — 내용(props · 상호작용)만 고친 편집은 올리지 않는다. 소프트 잠금의 하트비트 도장이 문서 축으로 읽는다(「소프트 잠금」). **한 페이지 id 에서 `head_seq`는 다시 작아지지 않고, 번호가 같으면 문서도 같다** — 서버는 편집의 자리 경로를 `baseSeq` 판에 그대로 적용하므로(「정방향 흐름」) 번호가 곧 편집의 판본이다. 복원이 되살린 페이지는 그 id 가 쓴 마지막 번호 다음에서 선다(「스냅샷」) — 그 번호에는 revision 이 없다.

### 4.3 페이지 스키마 노드

```jsonc
{
  "id": "n_7f3a",          // 안정 ID — 코멘트·상호작용·잠금·patch 경로의 공통 앵커
  "type": "DataGrid",
  "alias": "회원 목록",       // 사람이 붙인 이름 (선택)
  "props": { "select": "check", "fixedColumns": 1 },
  "variant": "featured",   // 테마가 정의한 variant 중 하나 (선택)
  "weight": 2,             // 부모 안의 몫 — 정수 1 ~ 12 (선택)
  "marker": 2,             // 우측 코멘트 번호 (없으면 코멘트 없음)
  "interactions": [
    { "on": "click", "actions": [ { "type": "setProp", "target": "n_9c1e", "prop": "loading", "value": true } ] }
  ],
  "children": [ { "id": "n_c1a0", "type": "GridColumn", "props": { "label": "아이디" }, "children": [ … ] } ],   // 몸통 구역 — 그리드면 열
  "zones": {               // 이름 붙은 구역 (선택)
    "headEnd": [ { "id": "n_b2c4", "type": "Button", "props": { "label": "엑셀 다운로드" } } ],
    "rows": [ { "id": "n_r1d2", "type": "GridRow", "props": { "repeat": 10 } } ]
  }
}
```

`id`는 생성 시 부여되고 절대 바뀌지 않는다. 노드를 트리 안에서 옮겨도 유지되므로 코멘트와 상호작용 타겟이 따라간다. 가져오기·붙여넣기·복제·모듈 넣기 시에만 새 id를 발급하며, 그때 참조도 함께 리매핑한다.

**구역(`zones`).** 노드의 자식 자리는 **몸통**(`children`)과 **이름 붙은 구역**(`zones` — 구역 이름 → 노드 배열)이다. 어느 구역을 받는지는 카탈로그가 컴포넌트마다 선언하고(§5.1 `zones`), 선언한 차례가 순회 · 화면의 차례다(`Card` 면 제목 옆 → 머리 오른쪽 → 몸통 → 바닥). `zones` 와 그 안의 배열은 선택이고 없는 열쇠는 빈 구역이다. 구역 이름은 `^[a-z][A-Za-z0-9]{0,31}$` 이고 `body` 일 수 없다(몸통은 `children` 에만 산다 — 봉투가 거절한다 · `__proto__` 같은 열쇠도 꼴에서 빠진다). 열쇠 차례는 뜻이 없다(문서는 `jsonb` 에 산다). 경로는 몸통 `…/children/<i>` · 구역 `…/zones/<이름>/<i>` 이고 구역 사이 옮기기는 `move` 하나다. **노드를 걷는 자리는 전부 `packages/schema` 의 `childLists` 하나를 지난다**(몸통과 구역을 선언 차례로 — 검증 전 값에서 던지지 않는다) — 잠금 · 보임 · 이름 · 복사 · 순회 · 구조 번호(`sameStructure`) · 내보내기 · lint 가 구역 안 노드를 몸통 노드와 같이 본다. 그 함수를 안 지나고 `.children` · `.zones` 를 바로 읽는 자리는 `packages/schema/test/zones-census.test.ts` 가 파일마다 센다. 검증은 선언 밖 구역(`zone-not-allowed`) · 몸통이 없는 타입의 `children`(`children-not-allowed`) · 받지 않는 타입(`zone-type-not-allowed`) · 설 자리 밖의 타입(`misplaced-component`)을 오류로 낸다. 빈 구역은 화면에 아무것도 안 세운다(뷰가 감싸는 요소째 안 그린다 — §6.1 `data-wb-zone`).

**몫(`weight`)** 은 부모 안에서 그 노드가 차지할 몫이다 — 정수 1 ~ 12, 없으면 테마 · 기본 배치 그대로. 뜻은 부모가 정한다: `Flex` · `Field`(값 칸 — §5) 안이면 남는 폭을 형제끼리 몫대로 나누고(`flex: <몫>` — 바탕 폭이 0 이라 안 여백 · 테두리를 뺀 내용 폭이 몫의 비다), `Grid` · 열을 정한 `SearchForm`(§5) 안이면 차지할 칸 수(시스템 테마의 검색폼은 칸 하나가 라벨|값 쌍이다), `FormTable` 안이면 차지할 라벨|값 쌍 수이고 모두 부모 열 수로 자른다(3열에 5 → 3 — 열 수 이상이면 한 줄 전체). 그 밖의 부모 안에서는 아무 일도 없고 값만 남는다 — 옮겨 다시 `Flex` 안에 들면 다시 먹는다. 카탈로그 prop 이 아니라 `alias` · `variant` 와 같은 노드 필드인 까닭: 컴포넌트마다 같은 prop 을 덧붙이지 않고, 상호작용 `setProp` 의 대상이 아니며, 패널이 부모를 보고 칸을 보일지 정한다. 렌더러가 부모를 보고 실을 값(자른 칸 수)을 정해 뷰의 `Root` 에 넘기고, `Root` 는 뷰가 준 `style` 에 `--wb-node-weight` 를 **더한다**(노드 속성 `data-wb-*` 는 늘리지 않는다 — §6.1). SDK 기본 CSS 의 특이도 0 규칙이 그 변수를 `Flex` · `Grid` · 열을 정한 `SearchForm` · `FormTable` 칸 · `Field` 값 칸의 자식에서 읽고, 모든 노드 뿌리(그리드 되풀이 행의 사본 노드 — `data-wb-copy-of` — 도)에서 변수를 초기화해 자손에 물려지지 않게 한다(몫을 준 `Card` 안 `Flex` 의 자식 · 몫을 준 필드 안 값 칸 조각이 그 몫을 받지 않는다 — `apps/web/build-test/searchform-columns.test.ts`). 노드가 아닌 요소(폼 표의 빈 쌍)는 그 초기화에 안 걸리므로 몫 변수를 읽지 않는다. 자르기를 CSS(`span min(…)`)가 아니라 렌더러가 하는 것은 CSS 가 열 수를 상속으로만 읽어 `Grid` 안의 `Grid` 가 제 열 수로 잘리기 때문이다. 모양은 노드 봉투(`WbNodeSchema`)가 보고, 복사 · 붙여넣기 · 복제 · 모듈 · 가져오기에서 노드와 함께 간다. 캔버스 · HTML 번들 · PPTX 가 같은 렌더러 · 같은 기본 CSS 라 셋에 같이 선다.

**별칭(`alias`)** 은 같은 타입이 여럿일 때 사람이 가르려고 붙이는 이름이다. 앞뒤 공백이 없는 1 ~ 60자(코드 포인트로 센다)이고, 받지 않는 글자 — 줄을 바꾸거나 출력을 제어하는 글자(C0 · DEL · C1 · U+2028 · U+2029) · 방향 제어 글자(U+061C · U+200E · U+200F · U+202A ~ U+202E · U+2066 ~ U+2069) · 짝 없는 서로게이트 — 가 없고, 보이는 글자가 하나는 있다(공백과 폭 없는 글자 U+200B ~ U+200D · U+2060 · U+FEFF 만이면 빈 값이다). 비우면 필드째 지운다. 받지 않는 글자의 표는 한 벌이다(`packages/schema/src/alias.ts`) — 봉투는 거절하고 화면은 같은 표로 다듬는다. 모양은 노드 봉투(`WbNodeSchema`)가 보므로 저장 경계(문서 저장 · 편집 · 가져오기 · 클립보드 봉투 · 모듈 저장)가 같은 판정을 받는다 — 별칭이 없는 옛 문서는 그대로 읽힌다. 문서 안에서 유일할 필요는 없다. 복사 · 붙여넣기 · 복제 · 모듈 · 가져오기에서 노드와 함께 간다. 노드를 사람이 부르는 이름은 하나(`packages/schema` 의 `nodeDisplayName` — 별칭이 있으면 별칭, 없으면 라벨성 prop + 카탈로그 한국어 이름)이고, 노드를 가리키는 자리(구조 트리 줄 · 속성 패널 제목 · 상호작용 문장과 대상 고르개 · 코멘트의 노드 표시 · 캔버스 손잡이 · 내보낸 설계서 · CLI `page get` · MCP `get_page`)가 모두 그 이름을 거친다. 라벨 · 제목 · 탭 이름 · 컬럼 이름처럼 별칭이 아닌 사람 글은 방향 제어 글자를 막지 않으므로, 그 글이 이름으로 이어 붙는 자리(문장 · 줄 요약 · 고르개 항목 · 내보낸 목록)는 **이름마다** 방향을 가둔다(`packages/schema` 의 `isolateBidi` — 제어 글자가 든 이름만 U+2068 … U+2069 로 감싸고 보통 글은 한 글자도 안 바꾼다).

**공통코드 참조(`code`).** 상태 · 구분 같은 코드 이름은 프로젝트의 **공통코드 표**(그룹 → 항목 — §4.2 `code_groups` · `code_items`)에 두고, 노드는 그 표를 **그룹 키 + 코드값**으로 가리킨다(DB id 가 아니다 — 스냅샷 · 페이지 JSON · 클립보드를 건너도 같은 뜻이다). 꼴은 `{ "group": "ORDER_STATUS", "item"?: "WAIT", "selected"?: ["WAIT"] }` 다 — 키는 `^[A-Z][A-Z0-9_]{0,39}$`, 코드값은 1 ~ 40자, 그룹 · 항목 이름은 1 ~ 60자이고 코드값 · 이름은 별칭과 같은 받지 않는 글자 규칙을 쓴다. 묶이는 컴포넌트는 둘로 갈린다(§5): **선택 위젯**(`Select` · `CheckboxGroup` · `RadioGroup`)은 `group` 과 고른 값 `selected` 를 들고 그 그룹의 사용 중 항목을 차례대로 선택지로 그린다(앞 30 개까지 — `OPTIONS_MAX`), **대표 글을 가진 컴포넌트**(`Button.label` · `Link.label` · `Text.content` · `Chip.label` · `Affix.text` · `Placeholder.label` · `TabPanel.label` · `Input.value`)는 `group` + `item` 을 들고 그 항목의 이름을 그린다. **노드를 이름으로 부르는 자리도 표의 이름을 쓴다** — 구조 트리 줄 · 상호작용 문장과 그 대상 목록 · 코멘트 칸 · 상태 지우기 상자 · 공통코드 사용처 목록 · `get_page` 의 개요와 `interactions`(끊긴 참조는 prop 의 대체 글이다). lint 문장만 대체 글로 부른다. 검증(`invalid-code-ref`)은 꼴만 본다 — 묶지 않는 타입의 `code`, 선택 위젯의 `item`, 대표 글의 `selected`, 하나만 고르는 타입의 `selected` 둘 이상을 거절한다. **표에 있는지는 검증이 보지 않는다** — 표는 문서 밖의 값이라, 표에 없는 키를 든 노드(붙여넣기 · 모듈 넣기 · 가져오기)도 저장된다. 그 노드는 **끊긴 참조**다: 묶을 때 prop 에 적어 둔 대체 글로 그리고 에디터 캔버스에 경고 표지를 단다(lint `broken-code-ref` — §12.4). 고른 값이 사용 안 함이 되거나 지워지면 그리기에서 빠진다(하나 고르는 위젯이 그 빈자리에 다른 항목을 골라 보이지 않는다). 표에는 revision · 되돌리기가 없고(나중 쓰기가 이긴다 · 소프트 잠금 대상이 아니다) 스냅샷만 표를 담는다(§4.5). 이름 · 차례 · 사용 여부는 자유롭게 고치고, 키 · 코드값을 바꾸려면 새 항목을 만들고 사용처(공통코드 화면 — §9)를 따라 다시 묶는다.

**화면 상태.** 같은 페이지가 상황(권한 · 로그인 여부 · 데이터 유무)에 따라 다른 화면을 보이면, 상태를 트리로 두고 노드마다 어느 상태에서 보이는지를 단다 — 노드는 하나이고 상태마다 보이고 숨을 뿐이다. 상태 목록은 루트 노드가 아니라 **페이지 문서**의 선택 필드다 — `{ "version": 2, "root": { … }, "viewStates": [{ "id": "s_login", "name": "로그인" }, { "id": "s_admin", "name": "관리자", "parent": "s_login", "description": "승인을 맡는 운영자" }] }`. 문서에 두는 까닭은 카탈로그의 `states`(컴포넌트의 불리언 상태 — §5.1)와 이름이 겹치지 않고, 목록 편집(JSON Patch `/viewStates/…`)이 노드 잠금에 막히지 않게 하려는 것이다 — 잠금 판정은 `/root` 아래 경로끼리만 겹치므로 남이 페이지 안 어느 노드(뿌리 포함)를 잡고 있어도 목록 편집은 지나가고, 같은 묶음의 노드 연산은 그대로 판정된다. 상태는 많아야 20개, 이름은 앞뒤 공백 없는 1 ~ 30자(코드 포인트)로 별칭과 같은 받지 않는 글자 표를 따르고 한 페이지 안에서 겹치지 않는다. id 는 노드 id 규칙이고 `default` 일 수 없으며 이름을 바꿔도 그대로다. **`description` 은 그 상태가 무엇인지 사람이 적는 선택 칸이다** — 여러 줄 자유 글 1 ~ 2000자(페이지 설명 · 코멘트와 같은 수 · 같은 단위 UTF-16)이고, 빈 글 · 보이는 글자가 없는 글은 받지 않는다(설명이 없는 상태는 칸이 없는 상태 하나뿐이다 — 화면은 비우면 칸을 지운다). 짝 없는 서로게이트는 받지 않는다(문서가 사는 `jsonb` 가 거절한다). **`parent` 는 목록의 다른 상태 id 이고 상태는 트리다** — 자기 자신 · 목록 밖 · 고리는 받지 않고 깊이는 3 이하(뿌리 상태가 깊이 1)이며, 형제 차례는 목록 차례다. **자식 상태는 부모의 경우를 좁힌 것이다**(«로그인 > 관리자») — «S 에서»는 S 와 그 자손 상태를 뜻한다. «기본»은 목록에 없고 늘 있다 — 트리의 뿌리가 아니라 «상태를 고르지 않은 화면»이고, 목록이 비거나 없으면 상태가 없는 페이지다. 레이아웃에는 목록이 없다. 모양은 페이지 봉투(`PageEnvelopeSchema`)가 보므로 저장 경계(문서 저장 · 편집 · 가져오기 · 스냅샷)가 같은 판정을 받는다.

노드마다 **상태 보임**(`visibility`)을 단다 — `{ "mode": "only" | "except", "states": [...] }`. `only` 는 나열한 상태(와 그 자손 상태)에서만 보이고, `except` 는 거기서 숨는다. `states` 에는 `"default"`(«기본» — 자손이 없다)를 넣을 수 있고, 1개 이상 · 겹침 없음 · 목록의 id 또는 `default` 다. 없으면 모든 상태에서 보인다. **부모가 숨으면 자손도 숨는다** — 자식의 `only` 가 부모를 되살리지 않는다. 뿌리에는 둘 수 없다(`bad-root` — 뿌리가 숨으면 그 상태의 화면이 통째로 빈다). 판정은 `packages/schema` 의 순수 함수 하나(`isVisibleIn` · 트리 차례는 `viewStateOrder`)이고 렌더러 · 에디터 · 번들 · MCP 가 같이 쓴다. 렌더러는 지금 상태(`RenderOptions.viewState` — 목록에 없는 id 는 기본)에서 숨은 노드를 자손째 그리지 않는다. 목록에 없는 상태를 가리키는 보임은 문서 하나에서는 오류가 아니라 lint 의 몫이다 — 단 **편집이 목록 밖을 가리키는 보임을 새로 만들면 저장 경계가 오류로 거절한다**(`state-cases-left` — 목록에서 상태만 빼면 그 상태를 가리키던 보임이 뜻을 잃는데, 잠금 판정은 노드 밖인 목록 편집을 막지 않는다. 상태는 보임째 지운다 — 아래). 노드를 부르는 이름은 `only` 보임의 상태를 붙인다(«'승인 버튼'(관리자 상태)» · 둘이면 «'승인 버튼'(관리자 · 손님 상태)» — 그 노드 자신 또는 가장 가까운 조상의 보임이 `only` 일 때, `except` · 보임 없음은 붙이지 않는다). 상태 추가 · 이름 · 순서 · 삭제와 보임 고치기는 새 편집 종류가 아니라 JSON Patch 묶음 하나다(`packages/schema` 의 `view-state-ops.ts`) — 지금 전송 길 · 잠금 판정 · 개인 되돌리기(묶음 하나 = 되돌리기 한 번)를 그대로 탄다. 상태 목록은 번호로만 가리킬 수 있어, **목록의 있는 자리를 고치는 묶음(이름 · 순서 · 삭제)과 서버가 짓는 그 역연산은 그 자리의 상태 id 를 JSON Patch `test` 로 싣는다**(`guardViewStateOps`) — 남이 그 사이 순서를 바꾸거나 그 상태를 빼면 묶음째 적용이 실패한다(409). 웹의 리베이스 · 되돌리기는 노드처럼 상태도 id 로 다시 짚는다. **상태를 지우면 하위 상태째 목록에서 빼고, 모든 노드의 `states` 에서 그 id 들을 뺀다** — `only` 인데 비면 그 노드를 지우고(그 상태에서만 보이던 내용), `except` 인데 비면 보임을 걷고, 남으면 남은 상태로 바꾼다(`removeViewStateOps`). 순서는 형제 안에서만 바꾼다. 복사 · 붙여넣기 · 복제는 보임을 들고 간다(붙이는 페이지에 같은 id 가 없으면 같은 이름의 상태로 맞추고, 둘 다 없으면 빼고 말한다 — §9 «클립보드»). 문서를 통째로 갈아 끼우는 쓰기(`PUT …/schema` · 페이지 JSON 가져오기 · 스냅샷 복원)는 상태 목록을 함께 갈아 끼운다(`replaceDocumentOps`).

**페이지 레이아웃(`layout`).** 페이지 내용을 감싸는 틀이고 페이지 문서의 필드다 — `{ "version": 7, "layout": "subpage", "root": { … } }`. 값은 셋으로 고정이다: `blank`(틀 없음) · `popup`(제목줄과 닫기가 있는 상자 — 뿌리 `Popup` 이 그린다) · `subpage`(GNB · LNB · 브레드크럼브 · 페이지 제목 — 테마가 메뉴 트리로 그린다). 판 7 문서에는 늘 있다 — 페이지 봉투(`PageEnvelopeSchema`)가 없는 값 · 모르는 값을 거절한다(판 6 이하 문서는 키 없이 지나고 판 6 의 뜻 — 뿌리 `Popup` 이면 팝업 — 으로 읽힌다). **«팝업인가» 를 묻는 자리는 전부 `layout` 을 읽는다**(`pageKindOf`) — 뿌리 `Popup` 은 그 짝이고 짝이 어긋난 문서는 검증 오류 `layout-root-mismatch`(«팝업 레이아웃의 뿌리는 Popup 이고, 빈 · 서브페이지 레이아웃의 뿌리는 Page 입니다»)로 모든 저장 경계에서 거절된다. 루트 노드가 아니라 문서에 두는 까닭은 화면 상태 목록과 같다 — `/layout` 편집이 노드 잠금에 막히지 않고, revision · 개인 undo · 리베이스 · 스냅샷 · 페이지 JSON 이 문서를 나르는 길 그대로 나른다.

**문서 판 7.** 지금 판은 7 이다(`CURRENT_DOCUMENT_VERSION`). 들어오는 경계(스냅샷 복원 · 페이지 JSON 가져오기 · 클립보드 봉투 읽기 · CLI · MCP 읽기 · REST 의 문서 쓰기)는 판 5 · 6 · 7 문서를 받는다 — 판 5 · 6 은 런타임 사슬의 판 5 → 6 · 6 → 7 단계(아래)로 올려 받고, 판 1 · 2 는 «버전 2에서 올릴 마이그레이션이 없습니다», 판 3 · 4 는 «버전 3(4)에서 올릴 마이그레이션이 없습니다» 로 거절된다. 저장된 문서는 DB 마이그레이션이 한 번 옮겼다: 판 1 → 2 는 상태 영역(`StateSwitch` > `StateCase`)을 노드 보임으로 꺼내고(`packages/schema` 의 `liftStateRegions` — 영역 하나마다 안쪽부터: 기본 가지의 자식은 영역 자리에 차례로 꺼내고 다른 가지가 있으면 `except [그 가지들의 상태]`, 상태 S 가지의 자식은 그 뒤에 꺼내고 `only [S]`, 바깥 영역의 가지 안에서 꺼낸 노드는 두 조건을 합친 집합을 `only [...]`(`default` 포함)로 적는다. 목록 밖 상태의 가지 · 영역 밖 가지 · 빈 집합은 버린다), 판 2 → 3 은 구역을 들인다(`apps/api/src/db/migrations/0028-node-zones.ts` 에만 있다 — 탭 이름 배열 `Tabs.props.tabs` 를 이름마다 `TabPanel` 노드로 · 옛 자식은 `active` 자리 패널로, `switchTab` 의 탭 번호를 그 패널 id 로, 검색폼 · 입력폼에 기본 단추 둘을 `zones.actions` 로), 판 3 → 4 는 조합 입력을 들인다(`apps/api/src/db/migrations/0029-compose-field.ts` 에만 있다 — `Field` 의 `control` 을 값 칸의 조각 노드로: `text` · `number` → `Input`(`number` 는 `kind`), `select` → `Select`, `date` → `DateInput`, `dateRange` → `DateInput` · `Affix '~'` · `DateInput`, `checkbox` → `CheckboxGroup`, `radio` → `RadioGroup` + `variant: 'radio'`, `textarea` → `TextArea`, `file` → 읽기 전용 `Input`(«선택된 파일 없음») · `Button '파일 선택'`. 그 prop 이 있는 조각에만 `placeholder`(빈 글은 빼고) · `disabled` · `invalid` 를 옮기고 `Field` 에서는 걷는다. 그 prop 을 바꾸던 `setProp` 은 그 prop 을 가진 조각마다 하나씩 늘어나고(기간의 두 날짜 칸 · 파일의 입력과 단추), `control` 을 바꾸던 것은 그대로 경고로 남는다 — 노드 id 는 그대로라 코멘트 · 번호 · 별칭이 안 끊긴다), 판 4 → 5 는 자료 표를 그리드로 옮긴다(`apps/api/src/db/migrations/0032-list-data-grid.ts` 에만 있다 — `List` 를 같은 id 의 `DataGrid` 로: `columns` 는 열마다 `GridColumn` + 셀 틀 `Text «—»`, `items` 는 되풀이 행 하나(`repeat` — 50 에서 자른다), `pagination` 은 «바닥» 의 `Pagination`, `selectable` 은 `select: 'check'`, `selected` · `disabled` 는 그 행의 꼴, `loading` · `empty` · 머리 구역 · 변형 · 별칭 · 표지 · 상호작용은 그대로 — props 가 없던 목록은 옛 기본값(열 셋 · 다섯 줄 · 바)으로 선다. `selectable` 을 바꾸던 `setProp` 은 `select` 로 옮기고 다른 옛 prop 의 액션은 경고로 남는다. 판 4 문서는 `List` 가 없어도 판 번호를 올리고, `List` 를 옮긴 페이지는 `head_seq` · `structure_seq` 를 하나 올려 옛 좌표의 편집이 `stale` 로 거절되게 한다), 판 5 → 6 은 트리 항목을 계층으로 옮긴다(`packages/schema` 의 `migrate-tree-items.ts` — 런타임 사슬에 있고 DB 마이그레이션 `0035-tree-items` 가 같은 함수를 부른다: 판 5 의 글 목록 `items` · 깊이 `depth` 가 그린 화면 그대로 — 항목 i 의 단은 `i % depth` 이고 단 L 인 항목은 그 앞의 가장 가까운 단 L − 1 항목의 자식(없으면 맨 위), 자식이 있는 항목은 펼침, `depth` 는 걷고, 항목이 없던 트리는 판 5 의 기본값(«항목 1» · «항목 2» · 깊이 2)으로 옮기며 101 째부터의 항목은 버린다. 판 5 라고 적힌 문서에 이미 판 6 꼴(이름이 글인 객체)인 항목이 들면 런타임 사슬은 그 항목을 제 꼴(펼침 · 자식째) · 제 자리 그대로 맨 위에 남기고 글 항목만 옮긴다 — 글 항목의 단은 글 항목끼리의 차례로 세고, 남긴 항목 뒤의 글 항목은 그 앞의 글 항목을 부모로 잡지 않는다(펼친 차례가 들어온 차례 그대로다). 101 째부터 버리는 것은 글 항목뿐이라 남긴 항목까지 합쳐 100 을 넘으면 판 6 검증이 거절한다. DB 마이그레이션은 판 5 검증을 지난 저장 문서(글 항목뿐)를 옮겨 이 갈래를 안 탄다. `setProp` 액션이 `items` · `depth` 를 바꾸던 것은 경고로 남는다. 판 5 문서는 트리가 없어도 판 번호를 올리고, 트리를 옮긴 페이지는 `head_seq` · `structure_seq` 를 하나 올린다), 판 6 → 7 은 페이지 레이아웃(`layout` — 아래 «페이지 레이아웃»)을 채운다(`packages/schema` 의 `migrate-page-layout.ts` — 런타임 사슬에 있고 DB 마이그레이션 `0037-page-layout` 이 같은 함수를 부른다: 뿌리 `Popup` 이면 `popup`, 그 밖은 `blank` — 판 6 의 화면이 안 바뀌는 값이다. 판 6 이라고 적힌 문서에 이미 아는 `layout` 이 들면 그대로 둔다. 있던 경로가 안 바뀌어 `head_seq` 를 안 올린다). 옮기는 자리는 페이지 · 레이아웃 · 프로젝트 모듈 · 개인 모듈 · 스냅샷 payload 의 문서다 — 편집 이력(`revisions`)은 안 옮겨, 옮기기 전 편집의 되돌리기는 옛 경로를 가리켜 건너뛰어진다. 판을 안 바꾸는 DB 마이그레이션도 있다 — `0031-entry-form-table` 은 입력폼 몸통의 잇단 `Field` 묶음마다 `FormTable`(1 열) 하나로 감싸고(같은 다섯 자리), 감싼 페이지의 `head_seq` · `structure_seq` 를 하나 올려 옛 좌표의 편집이 `stale` 로 거절되게 한다.

**노드는 스타일을 갖지 않는다.** `variant`로 테마가 정의한 표현 중 하나를 고를 뿐이고, 실제 스타일 값은 전부 테마에 있다. 이 성질 덕분에 테마 교체만으로 전체 설계서의 외형이 바뀐다. 반대로 "이 버튼만 빨갛게" 같은 일회성 스타일은 지원하지 않는다 — 필요하면 테마에 variant를 추가하는 것이 올바른 경로다.

**예외는 `Placeholder` 하나다 — 그리기 값(크기 · 바탕 · 테두리 꼴 · 테두리 색 · 모서리 · 글 색 · 글 크기 · 정렬 · 여백 · 그림 · 그림 맞춤)을 prop 으로 든다.** 카탈로그가 못 덮는 요소(칩 · 배지 · 띠)를 사람이 손으로 그리는 자리다. 봉투는 그대로이고(스타일 키를 노드에 두지 않는다) 값은 그 컴포넌트의 props 다. 값의 꼴을 좁힌다 — 색은 소문자 `#rrggbb`(`PLACEHOLDER_COLOR`) 또는 빈 값, 길이는 정수 px. 뷰가 값을 인라인 변수로 싣는데, 자유 CSS 글자를 받으면 `url(…)` 이 캔버스 · 내보낸 번들에서 바깥 요청을 내고 `;` · `}` 로 꾸밈을 넘길 길이 생긴다(서버의 두 쓰기 입구가 422 — `apps/api/test/placeholder-props.test.ts`). 빈 값은 «테마 기본» 이다 — 사람이 정한 값만 테마를 이긴다(§6.1 «자리표시자의 그리기 값»). 그림(`image`)은 이 프로젝트에 올린 그림의 id(그 바이트의 sha256 소문자 64 자 — `ASSET_ID_PATTERN`)이고 `imageFit` 은 `cover` · `contain` 이다(§11.4 «그림»).

노드가 어떤 형태로 그려질지는 노드가 아니라 **테마의 뷰가 결정**한다(§6). 같은 `Card` 노드가 한 테마에서는 테두리 상자로, 다른 테마에서는 그림자 카드로 그려진다.

### 4.4 레이아웃

페이지의 레이아웃은 **페이지 문서의 필드 `layout`** 이다(§4.3 «페이지 레이아웃») — `blank` · `popup` · `subpage` 셋으로 고정이고, 사람이 짓는 레이아웃 문서 · `Slot` 노드 · 레이아웃 표는 없다. 빈 · 서브페이지 레이아웃의 뿌리는 `Page`, 팝업 레이아웃의 뿌리는 `Popup` 이다(뿌리 `Popup` 이 제목줄 · 닫기 · 바닥이 있는 상자를 그린다). 페이지 JSON 의 `page.layoutRef` 는 받되 쓰지 않는다(§11.2) — 레이아웃은 파일의 문서(`schema.layout`)에서 온다.

### 4.5 스냅샷

스냅샷은 **삭제 없는 태그**다 — 지우는 라우트가 없다. 저절로 지워지는 것은 메뉴 연쇄 삭제의 안전망뿐이다(아래).

- 생성: 현재 프로젝트 전체 상태(메뉴·페이지·코멘트와 테마 바인딩 · 공통코드 표)를 `payload`에 압축 저장하고, 각 페이지의 `head_seq`를 함께 기록한다.
- 복원: 이력을 지우지 않는다. 현재 상태에서 스냅샷 상태로 가는 patch를 계산해 **새 revision들로 append**한다. 따라서 복원 자체가 이력에 남고, 복원을 다시 되돌릴 수도 있다.
- **메뉴 연쇄 삭제도 안전망 스냅샷을 찍는다** — 지우기 직전의 프로젝트를 같은 트랜잭션에서 스냅샷 하나로 남긴다(태그 `메뉴 "<제목>" 삭제 전 <시각>` · 설명에 지운 수). 연쇄 삭제는 페이지의 이력까지 지워 되돌리기가 없고, 그 스냅샷으로 복원(owner)하면 지운 메뉴 · 페이지가 같은 id 로 돌아온다. 화면은 지운 뒤 지운 수와 그 스냅샷의 태그를 정보 통지 한 줄로 알린다. 확인 상자는 지울 페이지가 있으면 «다른 페이지에서 이 페이지들로 가는 링크가 있으면 끊깁니다 — wireb lint 로 찾을 수 있습니다» 한 줄을 더한다(상자는 다른 페이지의 설계를 읽지 않아 어느 링크인지는 말하지 않는다). 잠금은 복원과 같다(프로젝트 → 메뉴 → 페이지 → 코멘트) — 캡처가 프로젝트 전체를 보므로 서브트리 밖의 열린 편집도 그 커밋을 기다려 싣는다.
- **연쇄 삭제의 안전망은 프로젝트마다 20개까지다** — 넘으면 새 안전망을 남기는 그 트랜잭션에서 오래된 것부터 지운다. 연쇄마다 프로젝트 전체 payload 가 하나씩 쌓이는데, 오래된 안전망일수록 복원하면 그 뒤의 일을 더 많이 지워 쓸모가 줄어든다. 세는 것은 연쇄의 안전망뿐이고(스냅샷마다 누가 찍었는지 — 사람 · 복원 · 연쇄 — 를 따로 적는다 · 태그 글자로 가르지 않는다), 사람이 붙인 태그와 복원의 안전망은 지우지 않는다. 지우기는 프로젝트를 잠근 뒤라 그 스냅샷으로 복원하는 중이면 그 복원이 끝난 뒤에 지우고, 지워진 스냅샷의 복원은 «찾을 수 없다»(404)이고 오류 코드가 `snapshot-gone` 이다 — 가드를 지난 멤버(owner)에게만 나간다(프로젝트가 없거나 멤버가 아닌 요청은 가드가 `not-found` 로 같은 응답을 내 비멤버가 스냅샷이 있는지 알 수 없다 · 잠금을 기다리는 사이 빠지거나 내려간 사람도 복원이 어느 갈래로 끝나든 커밋 순간의 권한을 다시 봐 가드와 같은 응답을 받는다). 스냅샷 상자를 연 채 그 지움이 일어나면 그 줄의 «되돌리기» 가 `snapshot-gone` 을 받고, 상자는 목록을 다시 받아 지워진 줄을 빼며 «이 스냅샷은 이미 지워졌습니다. 목록을 다시 받았습니다.» 라고 말한다(`not-found` 404 는 서버 문장을 그대로 그리고, 404 가 아닌 거절 · 모름과 함께 줄이 남고 목록을 다시 받지 않는다).
- 복원이 지워진 페이지를 되살리면 **같은 id** 로 서고, `head_seq`는 **그 id 가 지워질 때까지 쓴 번호 다음**부터 센다(지워진 이력은 되살아나지 않는다). 0 부터 다시 세면 복원 방송을 못 받은 클라이언트(연결이 끊긴 탭 · MCP · CLI)의 번호와 남의 편집으로 오른 번호가 우연히 같아지고, 그 클라이언트의 편집이 되살린 문서의 다른 노드에 적용된다. 그래서 페이지를 지울 때 그 id 의 마지막 번호를 남긴다 — 수명은 프로젝트다(복원이 되살릴 수 있는 것의 바깥 경계). 남긴 번호가 없는 id(번호를 남기기 전에 지웠다)는 어디까지 셌는지 알 길이 없어(스냅샷의 번호는 하한이다) 2^32 에서 센다.

payload를 통째로 저장하는 이유는 복원 속도 때문이다. revision replay는 페이지 수가 늘면 선형으로 느려지고, 스냅샷은 자주 만들지 않으므로 저장 비용이 문제되지 않는다.

**테마는 참조로 얼린다**(payload 판 3) — 테마 내용이 아니라 프로젝트의 바인딩 `{ themeId, version, tokens }` 를 싣는다. 테마 패키지는 지우지 않으므로 참조로 충분하다. 판 3 복원은 바인딩도 되돌리고(숨긴 버전이어도 된다) 값이 같아도 `theme_rev` 를 올려 `theme-changed` 를 보낸다. 판 2 이하 스냅샷의 복원은 바인딩을 건드리지 않는다(payload 에 `theme` 가 있어도). 가리킨 패키지가 그 서버에 없으면 복원하지 않는다(409). 토큰은 그 판의 manifest 로 바인딩 저장과 같은 검사를 지나고, 걸린 키는 버려 기본값으로 선다 — 복원을 거절하지 않는다.

**공통코드 표는 통째로 싣는다**(payload 판 4 — `codes`: 그룹 → 항목 · 차례 그대로). 판 4 복원은 표를 그 판으로 **덮는다** — 복원은 페이지 · 메뉴까지 프로젝트 전체를 그 시점으로 되돌리는 동작이라 표만 지금 것으로 남으면 되돌린 페이지의 참조가 엇갈린다. 표에 revision 이 없어 patch 가 아니라 행 교체이고, 값이 같아도 덮고 커밋 뒤 `codes-changed` 를 낸 연결까지 보낸다. 덮기 전 안전망 스냅샷이 지금 표도 담으므로 복원을 되돌리면 표도 돌아온다. 판 3 이하 스냅샷의 복원은 표를 건드리지 않는다(payload 에 `codes` 가 있어도). 코드 쓰기는 모두 프로젝트 행을 먼저 잡아 복원 뒤에 줄 서므로 복원 중에는 표가 안 바뀐다. 화면의 복원 확인 상자는 «공통코드 표를 담은 스냅샷이면 공통코드 표도 그 시점으로 돌아갑니다»를 한 줄 말한다(목록이 스냅샷의 판을 싣지 않아 조건으로 말한다).

**레이아웃 표는 싣지 않는다**(payload 판 5). 판 4 이하 payload 의 `layouts`(프로젝트마다의 `Page > Slot` 문서)는 DB 마이그레이션 `0038-drop-layouts` 가 걷었다 — 페이지 레이아웃은 페이지 문서(`schema.layout`)와 함께 실리고, 복원은 레이아웃 개수를 견주지 않는다. payload 규격은 판 4 이하 payload 의 `layouts` 를 받고 걷는다 — 이 판의 `wireb` 가 옛 서버의 덤프를 읽는다. 판 5 이상의 `layouts` 는 모르는 키다.

---

## 5. 컴포넌트 카탈로그

카탈로그는 고정이며 프로젝트별 확장이 없다.

| 그룹 | 컴포넌트 | 설명 |
|---|---|---|
| 구조 | `Page` | 루트 노드. 페이지당 하나 — 뿌리 밖(깊이와 상관없이)에 두면 검증 오류 `nested-page`. 저장 경계(편집 · `PUT …/schema` · 스냅샷 복원 · 웹의 붙이기 판정)는 편집 전 문서에 이미 서 있던 중첩 `Page`(노드 id 로 가른다)를 거절 사유로 세지 않는다 — 규칙 전에 저장된 문서가 무관한 편집에 막히지 않고, 중첩 `Page` 의 수는 늘지 않는다. lint 는 그 문서를 `document-invalid` 오류로 말한다. 새로 들이는 입구는 `Page` 를 거절한다 — 모듈 저장(맨 위 포함 · 422 `nested-page`) · 페이지 JSON 가져오기(그 문서를 내보낸 파일도). 이미 저장된 모듈은 그대로 읽는다(목록 · 삭제) |
| 구조 | `Popup` | 팝업 레이아웃 페이지의 루트 노드 — «팝업인가» 의 판정은 문서의 `layout` 이고(`pageKindOf`) 뿌리 `Popup` 은 그 짝이다(`layout: 'popup'` ⇔ 뿌리 `Popup` · 어긋나면 검증 오류 `layout-root-mismatch`). `Page` 와 같이 뿌리에만 선다(뿌리 밖이면 `nested-page` · 다른 타입이 뿌리면 `bad-root` — 문장은 «Page 또는 Popup») · 레이아웃 뿌리는 `Page` 뿐이다. props `title`(제목줄 — 페이지 이름과 따로) · `size`(`small` · `medium` · `large` — SDK 기본 CSS 480 · 720 · 960px). 몸통 + «바닥»(`footer`) 구역. 닫기(✖)는 노드가 아니라 뷰의 조각이다. 새 팝업 페이지의 바닥은 `[취소][저장]` 이고 «취소» 는 처음부터 «팝업 닫기» 를 든다(카탈로그 `initial` 의 `interactions`). 팔레트 카드가 없다 |
| | `Section` | 세로 밴드. 풀블리드 배경 + 내부 컨테이너 정렬 |
| | `Flex` | 가로/세로 배치 |
| | `Grid` | 격자 배치 (열 수, 간격). 팔레트 이름 «격자 배치» — 자료 표 «그리드» 는 `DataGrid` 다 |
| | `Card` | 제목·본문 영역을 가진 카드. 구역: 제목 옆(`titleSide`) · 머리 오른쪽(`headEnd`) · 몸통 · 바닥(`footer`) — 머리줄은 제목 · 부제 · 그 두 구역이 다 비면 안 선다 |
| | `Tabs` | 탭 목록과 패널. 탭마다 `TabPanel` 노드 하나를 몸통에 둔다 — `active` 는 «몇째 패널»(0 부터 · 숨은 패널도 센다)이고 그 패널이 숨었거나 없으면 보이는 첫 패널을 연다 |
| | `TabPanel` | 탭 하나 — 이름(`label`)은 탭 머리에, 몸통은 부모 `Tabs` 의 패널 칸에 선다. `Tabs` 의 몸통에만 선다(`misplaced-component`) |
| 데이터 | `DataGrid` | 그리드(자료 표) — 열은 노드(`GridColumn` · 열 묶음)이고 행도 노드(`GridRow`)다. 구역: 머리 왼쪽(`headStart` — «총 N건») · 머리 오른쪽(`headEnd` — 엑셀 다운로드 단추 — 둘 다 비면 머리줄째 없다) · 몸통 «열»(열 · 열 묶음만) · «행»(`rows` — 행만) · «바닥»(`footer` — 무엇이든 · 기본 자리의 `Pagination`). `select`(none · check · radio — 맨 앞 선택 칸) · `fixedColumns`(0 ~ 20 — 앞 몇 잎 열을 가로 스크롤에 붙인다) · `emptyText` · 상태 `empty` · `loading`. 표보다 좁은 창에서는 표 칸만 가로로 굴러간다(문서는 창 폭 그대로 — §6.1 «그리드»). 새로 만들면 열 셋(셀 틀 `Text «—»`) · 되풀이 5 줄 행 · 바가 든다. 열이 없으면 lint 구조적 공백(§12.4) 팔레트에는 같은 타입의 프리셋 카드 «반복 행 표»(`repeatRows` — 열 «항목 1» · «항목 2»(셀 틀 `Input`) · «삭제»(셀 틀 `Button «삭제»` · 짧은 칸 · 가운데) · 되풀이 2 줄 행 · 머리 오른쪽 `[추가]` · 바 없음 — §5.1 «프리셋»)가 «그리드» 바로 뒤에 선다 |
| | `GridColumnGroup` | 열 묶음 — 아래 열 여럿 위에 걸치는 병합 머리 칸(`label`). 몸통 «열»(열 · 열 묶음 — 트리 깊이가 머리 단이다). 그리드 · 열 묶음의 몸통에만 선다 |
| | `GridColumn` | 열 — 머리 칸(`label` · `required` · `align` · `size`(auto · short · medium · long — 폭은 테마) · `sort`(none · sortable · asc · desc 표시) · `tone`(음영))과 몸통 «셀» = 셀 틀(칸을 안 가진 행마다 되풀이되는 칸 내용 — 무엇이든 받는다). `numbering`(off · asc · desc)을 켜면 셀 틀 대신 데이터 행 번호를 그린다(셀 틀은 lint `ignored-template`). 그리드 · 열 묶음의 몸통에만 선다 |
| | `GridRow` | 행 — `repeat`(1 ~ 50 줄 — 첫 줄이 이 노드, 둘째 줄부터는 사본 — §6.1 «그리드») · `kind`(data · total 합계 · gap 생략 띠 — 칸 · 되풀이를 안 읽는 전폭 띠) · `tone`(default · selected · dimmed · shaded). 칸이 없으면 열마다 셀 틀을, 하나라도 있으면 제 칸만 그린다(칸이 열을 앞에서부터 덮고 모자란 열은 빈 칸 — 폭이 잎 열 수와 다르면 lint `grid-row-cells`). 칸 유무가 곧 «컴포넌트» 탭 «속성» 묶음의 «행 내용»(기본 · 커스텀 — §9 «컴포넌트» 탭)이다 — 따로 적는 prop 이 없다. 그리드의 «행» 에만 선다 |
| | `GridCell` | 행이 제 손으로 그린 칸 — `span` · `rowSpan`(1 ~ 50 · 세로 칸은 아래 행의 그 열을 덮고 생략 띠에서 끊긴다) · 몸통 «내용». 행의 몸통에만 선다 |
| | `Pagination` | 페이지네이션 바 — 행 수 셀렉트(`sizeSelect`) · 쪽 번호 · 범위 글(`range` — «1 - 10 (총 72 항목 중)»)을 한 줄에 둔다. 수는 `total` · `pageSize` · `page` 로 셈한다(지금 쪽은 쪽 수로 자른다). 쪽 번호는 자리 아홉이다 — 쪽 수가 아홉을 넘으면 첫 쪽 · 끝 쪽이 늘 서고 지금 쪽 둘레(앞뒤 둘)와의 사이가 «…»(`ellipsis` 조각)다. 바는 창이 아니라 제 폭에 맞춰 줄을 바꾼다(세 조각 · 쪽 번호가 한 줄에 안 들면 — 격자 배치 칸 · 폼 표 값 칸 · 카드 안에서도 칸 밖으로 안 나간다). 어디든 선다 |
| | `Tree` | 계층 목록 — 항목(`items`)이 이름 · 펼침 · 자식 항목의 중첩 목록이다(아래 «트리 항목»). 상태 `selected` · `disabled` |
| | `KeyValue` | 키-값 뷰 (상세 화면용) |
| 입력 | `SearchForm` | 검색 조건 필드 묶음 + 초기화/검색. `columns`(1 ~ 4 · 기본값 없음)를 정하면 필드를 그 수의 칸으로 깔고 필드의 몫(§4.3)이 칸 수다 — 시스템 테마는 `FormTable` 과 같은 라벨|값 쌍 격자로 깐다(라벨 칸이 값 칸 왼쪽 · 열마다 맞는다 · 빈 쌍은 비워 둔다 · SDK 기본 CSS 는 필드 하나를 같은 폭 칸 하나에 — §6.1 «폼 표»). 안 정하면 테마마다의 지금 배치(필드가 옆으로 서고 넘치면 접힌다). 좁은 창에서는 열을 정했어도 한 줄에 필드 하나(라벨 위)다(시스템 테마의 좁은 창 문턱 640px). 단추는 `actions` 구역의 노드다(뷰에 박힌 단추가 없다 — 새로 만들면 «초기화» · «검색» 이 들고 «검색» 이 주 단추 `variant: 'primary'` 다) |
| | `EntryForm` | 등록/수정 폼. 몸통(«항목» — 무엇이든 받는다)에 폼 표 · 구역 제목 · 그리드를 쌓고 단추줄은 맨 아래 하나다. 새로 만들면 몸통에 1쌍 `FormTable` 하나(필드 셋)가 든다. 단추는 `actions` 구역의 노드다(새로 만들면 «저장» · «취소» 가 들고 «저장» 이 주 단추 `variant: 'primary'` 다) |
| | `FormTable` | 폼 표 — 라벨|값 칸을 표로 깐다. `title`(비면 머리줄째 없다) · `columns`(한 줄의 쌍 수 1 ~ 4 · 기본 1) · 구역 «머리 오른쪽»(`headEnd` — 제목 오른쪽 단추) · «옆 칸»(`aside` — 표 왼쪽에서 모든 줄을 덮는 칸 · 사진) · «칸»(몸통 — 새로 만들면 `Field` 셋). 행은 노드가 아니다 — 칸이 흐르며 생기고 자식의 몫(§4.3)이 차지할 쌍 수다(전폭 행은 몫 ≥ 열 수). 줄 끝 · 넓은 칸이 남긴 구멍의 빈 쌍은 뷰가 채운다(§6.1 «폼 표»). 라벨 칸 · 값 칸은 안의 `Field` 의 두 조각이다. 세 구역 다 무엇이든 받는다 — `Field` 가 아닌 자식은 그 몫만큼의 쌍 폭을 한 칸으로 덮는다. `Field` 가 하나도 없으면 lint 구조적 공백(§12.4) |
| | `Field` | 입력 필드 — 라벨(`label`) · 필수(`required`)와 값 칸(몸통 구역 «값»). 값 칸에 아래 조각과 `Button` 을 줄 세운다(`[날짜]~[날짜][이전주]` · `[셀렉트][입력][확인]`). 새로 만들면 값 칸에 `Input` 하나가 든다. 값 칸은 무엇이든 받고 가로로 줄 세우며 넘치면 줄을 바꾼다 — 조각의 몫(§4.3)은 `Flex` 처럼 남는 폭을 나눈다. 몸통 하나라 구조 트리에 구역 줄이 안 선다 |
| | `Input` | 한 줄 입력 — `kind`(text · number · password) · `value` · `placeholder` · `size`(short · medium · long — 고정 폭의 낱말, 길이는 테마) · 상태 `disabled` · `readonly`(회색 채움 — 딤드와 다르다) · `invalid` |
| | `TextArea` | 여러 줄 입력 — `value` · `placeholder` · `rows`(1 ~ 20) · 같은 상태 셋. 몫이 없어도 값 칸을 채운다 |
| | `Select` | 셀렉트 — `options`(하나만 고른다) · `placeholder`(고른 것이 없을 때 · 기본 «== 선택 ==») · `size` · `disabled` · `invalid` |
| | `DateInput` · `TimeInput` | 날짜 · 시간 칸 — `value` · `placeholder` · 상태 셋. 폭은 테마의 고정 폭이다 |
| | `CheckboxGroup` | 체크 묶음 — `options`(여럿) · `disabled`. 항목 하나면 단일 체크다. 체크 칩 묶음은 테마 변형(기본테마 `chip`) |
| | `RadioGroup` | 라디오 묶음 — `options`(하나 이하) · `disabled`. 세그먼트는 테마 변형(기본테마의 기본이 `segment` — 붙은 칸 · 고른 칸 채움 · 안 고른 판도 선다) |
| | `Chip` | 칩 — `label` · `removable`(× 표지) · `disabled` |
| | `Affix` | 사이 글자 — `text`(~ · 부터 · % · 안내 글) · `tone`(default · muted · danger · primary) |
| | `FileAttach` | 파일첨부 — 꼴만 그린다(파일을 올려 보관하지 않는다). `files`(파일 목록 · 0 ~ 20 줄 · `{ name, size }` 글 둘 — 표본 값) · `maxFiles`(0 ~ 99 · 기본 1 — 0 이면 개수 글 없음) · `maxSize`(0 ~ 20 자 · 기본 «100 MB» — 빈 글이면 크기 글 없음) · `hint`(빈 목록 줄의 글) · 상태 `disabled`. 구역 «단추»(`actions` — 무엇이든 · 새로 만들면 `[파일추가][항목 제거][전체 항목 제거]`). 뷰가 목록 머리 «□ · 파일이름 · 파일크기» · 빈 목록 안내 · 한도 글 «최대 {개수}개 {크기} 제한»(수는 조각 — 기본테마가 빨간 굵은 글로)을 그린다(§6.1 «파일첨부»). 값 칸(`Field`) 안이면 필드 이름이 그 묶음의 이름이다. 조합 입력의 조각이 아니다 — 한 값이 아니라 목록 · 단추 · 글을 품은 상자다. 단순 파일 선택 줄(«[파일선택][선택된 파일 없음]»)은 이것이 아니라 `Button` + 읽기 전용 `Input` 이다 |
| 액션 | `Button` | 버튼 |
| | `Link` | 링크. 페이지 이동 대상 지정 가능 |
| 문서 | `Text` | 텍스트. `role`로 타이포 스케일 선택 (display/h1~h6/body/caption) |
| | `Media` | 이미지·영상·일러스트·차트 영역 |
| | `Divider` | 구분선 |
| | `Placeholder` | 카탈로그에 없는 요소를 손으로 그리는 자리 · 미정 영역. 그리기 값을 prop 으로 든다(§4 «예외는 `Placeholder` 하나다»). 몸통(«내용»)이 있으면 라벨 대신 그것을 가로로 줄 세운다 — 칩 · 배지를 지어 모듈로 저장한다 |

**파일 목록**(`FileAttach` 의 `files`)은 선택지와 같은 판단이다 — 줄은 노드가 아니고(표지 · 상호작용을 줄마다 못 단다) 이름 · 크기는 글이다(이름은 빈 글도 받는다 — 목록 위젯의 «항목 추가» 가 빈 줄을 더한다). 속성 패널은 편집 칸 `fileList`(이름 · 크기 두 칸 줄 · 상한에서 «항목 추가» 가 꺼진다)로 그린다. 이름 · 크기와 `maxSize` 는 글 한도가 있다(zod `.max()` — UTF-16 단위로 센다). 속성 패널의 글 칸 · 목록 칸은 카탈로그 prop 의 글 한도를 정의에서 읽어(`packages/schema` 의 `propTextMax`) 그 한도에서 막고 — 붙여 넣은 글도 한도까지만 받는다 — `/llms.txt` 의 prop 줄도 같은 한도를 싣는다(`string (≤ n chars)`).

**선택지**(`Select` · `CheckboxGroup` · `RadioGroup` 의 `options`)는 `{ label, selected? }` 의 배열이다 — 1 ~ 30 개, 고른 것은 항목에 붙어 항목을 옮겨도 따라간다. 하나만 고르는 두 타입은 둘 이상 고른 배열을 검증이 거절한다(`refine` — 422). 항목은 노드가 아니다(항목마다 표지 · 상호작용을 못 단다). 속성 패널은 편집 칸 `optionList`(`select: 'one' | 'many'`)로 그린다 — 하나 고르는 칸은 고르면 다른 항목의 고름을 같은 연산에서 걷는다(§9 «컴포넌트» 탭의 «속성» 묶음). 조건에 따라 딤드되는 칸(«N 이면 뒤 입력 딤드»)은 `disabled` 를 켠 판을 그리고 조건은 표지 · 코멘트에 적는다 — 화면 상태마다 prop 값을 다는 장치는 없다.

**공통코드에 묶는 타입**은 카탈로그가 선언한다(§5.1 `code`) — 선택 위젯 셋(`Select` · `CheckboxGroup` · `RadioGroup` — 선택지를 그 그룹의 사용 중 항목 앞 30 개로 그린다)과 대표 글 여덟(`Button.label` · `Link.label` · `Text.content` · `Chip.label` · `Affix.text` · `Placeholder.label` · `TabPanel.label` · `Input.value` — 그 항목의 이름을 그린다). 칸 · 열 머리의 이름(`Field.label` · `GridColumn.label` · `GridColumnGroup.label`) · 여러 줄 글(`TextArea.value`) · 구획 제목(`Section` · `Card`) · 노드가 아닌 줄(`KeyValue` · `FileAttach` · `Tree` 의 항목)은 묶지 않는다 — 코드 이름이 아니라 칸 · 구획의 이름이다. 묶인 노드는 prop 의 글을 그대로 들고 있다(대체 글 — 끊긴 참조 · 표를 못 받은 소비자가 그린다). 사용 중 항목이 30 개를 넘거나(lint `code-choices-truncated`) 0 개인(`code-choices-empty` — 선택지 없이 안내 문구만) 그룹에 묶어도 저장은 거절하지 않는다.

**트리 항목**(`Tree` 의 `items`)은 `{ label, open?, children? }` 의 중첩 배열이다 — 모든 깊이를 합쳐 100 항목 · 깊이 5 단까지(`TREE_ITEMS_MAX` · `TREE_DEPTH_MAX` — 넘으면 검증이 거절한다 · 422). 선택지와 같은 판단으로 항목은 노드가 아니다(항목마다 표지 · 상호작용을 못 단다). 펼침 · 자식이 없는 항목은 그 키가 없다. 기본 뷰는 항목마다 줄(펼침 표지 · 이름 — 자식이 있는 항목만 ▾ 펼침 · ▸ 접힘 표지를 갖고 잎의 표지 자리는 빈 칸)과, 펼친 항목이면 그 밑에 한 단 들인 자식 목록을 그린다 — 접힌 항목의 자식은 안 그린다(캔버스 · 번들 · 화면 모드 같다). 들여쓰기 폭은 테마 토큰(`--wb-tree-indent`)이다. 속성 패널은 편집 칸 `treeItems` 로 그린다(§9 «컴포넌트» 탭의 «속성» 묶음).

`Text` · `Divider` · `Placeholder`는 설계서 작성에 필수적이라, `Section` · `Media`는 관리자 외 사이트 설계에 필수적이라 카탈로그에 든다. `Section`은 "화면 전체 폭 배경 + 가운데 정렬된 콘텐츠"라는 사이트 레이아웃의 기본 단위다.

### 5.1 컴포넌트 정의 구조

각 컴포넌트는 한 파일에서 다음을 함께 정의한다.

```ts
defineComponent({
  type: 'DataGrid',
  label: '그리드',
  description: '여러 건을 열과 행으로 늘어놓는 자료 표.',
  group: 'data',
  props: z.strictObject({ select: z.enum(['none', 'check', 'radio']).default('none'),
                          fixedColumns: z.number().int().min(0).max(20).default(0), /* … */ }),
  editor: [                                    // 속성 패널 폼이 여기서 자동 생성됨
    { prop: 'select',       control: 'select', label: '선택 열', options: ['none', 'check', 'radio'] },
    { prop: 'fixedColumns', control: 'number', label: '고정 열 수',
      hint: '가로로 굴려도 왼쪽에 남는 열 수 — 선택 · 번호 열도 셉니다' },  // 칸 밑 안내 한 줄(있을 때만)
    { prop: 'empty',        control: 'switch', label: '빈 상태' },
  ],
  states:     ['empty', 'loading'],
  zones: [                                     // 받는 자식 자리 — 차례가 순회 · 화면 차례다. 빈 목록이면 자식을 안 받는다
    { name: 'headStart', label: '머리 왼쪽' },
    { name: 'headEnd',   label: '머리 오른쪽' },
    { name: 'body',      label: '열', accepts: ['GridColumn', 'GridColumnGroup'], initial: [/* 열 셋 */] },
    { name: 'rows',      label: '행', accepts: ['GridRow'], initial: [{ type: 'GridRow', props: { repeat: 5 } }] },
    { name: 'footer',    label: '바닥', initial: [{ type: 'Pagination' }] },
  ],
})
```

**구역 선언(`zones`)** 의 한 줄은 `{ name, label, accepts?, initial? }` 다 — `name` 이 `body` 면 몸통(`children`), 그 밖은 `zones[name]`. `label` 은 구조 트리의 구역 줄 · 문장이 부르는 화면 이름, `accepts` 는 받는 타입(없으면 무엇이든 — `Tabs` 의 몸통은 `TabPanel`, 그리드 · 열 묶음의 몸통은 열 · 열 묶음, 그리드의 «행» 은 행, 행의 몸통은 칸으로 좁힌다), `initial` 은 **에디터가 노드를 새로 만들 때만** 넣는 기본 내용이다(`apps/web/src/edit/create-node.ts` — 검색폼 · 입력폼의 단추 둘 · 탭의 패널 둘 · 그리드의 열 셋 · 행 · 바와 열의 셀 틀 — 기본 내용 안의 기본 내용도 돈다. prop 기본값과 달리 사람이 지우고 고칠 내용이라 노드로 든다 · MCP · REST 로 쓰는 쪽은 받지 않고 `/llms.txt` 가 «함께 넣으라» 를 적는다 · 기본 내용의 변형은 폼 주 단추(«검색» · «저장»)의 `primary` 하나다 — 기본테마 · 스타터 테마가 둘 다 선언하는 이름이고, 선언 안 한 테마에서는 lint `theme-variant`(경고) · 그 테마의 기본 변형으로 그린다). 정의에는 셋이 더 있다 — `placement`(이 타입이 설 수 있는 자리 `{ type, zone }` 하나 또는 그 목록 — `TabPanel` 은 `Tabs` 의 몸통, 열 · 열 묶음은 그리드 · 열 묶음의 몸통, 행은 그리드의 «행», 칸은 행의 몸통. 읽는 자리는 `placementsOf` 로 목록을 받는다) · `bodyHost: 'parent'`(제 몸통을 부모 뷰가 그린다 — `TabPanel` · 열 · 열 묶음) · `reveal(props, { zone, index })`(그 자식 줄 자리의 자손을 보이게 덮을 props — `Tabs` 는 `active` 를 그 패널 자리로, `SearchForm` 은 `collapsed: false` · 에디터가 고른 노드나 «코멘트» 탭에서 고른 묶음의 노드를 펼쳐 보일 때만 렌더러가 쓴다 — §9 «고른 노드를 펼쳐 보인다»). 구역을 더하는 것은 문서 판을 안 올리고(없는 열쇠가 빈 구역이다), 빼거나 이름을 바꾸는 것은 올린다.

**프리셋**(`presets` — `{ key, label, description, node }` 의 목록)은 같은 타입의 다른 첫 내용이다 — 팔레트가 «타입 + 프리셋» 마다 카드를 하나 더 세우고(그 타입 카드 바로 뒤), 그 카드로 넣으면 `initial` 대신 템플릿(`node` — id 없는 노드 트리)이 내용 전부다(`@wirebound/schema` 의 `templateNode` · 웹의 `createNode(type, nextId, preset)`). 새 타입이 아니라서 넣는 규칙(받는 타입 · 설 자리)은 타입으로 판정하고, 문서에는 프리셋의 흔적이 없다. 템플릿은 카탈로그를 실을 때 타입 · props · 구역 · 받는 타입 · 설 자리를 검사받고(`assertPresets`), 카드 이름은 컴포넌트 이름 · 다른 프리셋 이름과 겹치지 않는다. MCP · REST 는 받지 않는다 — `/llms.txt` 가 템플릿을 그대로 싣고 «같은 꼴을 적으라» 를 말한다. 지금 프리셋은 `DataGrid` 의 «반복 행 표» 하나다(§5 표).

**정의(계약)와 그리기는 패키지가 다르다.** 위 선언은 `schema` 패키지에 있고 React에 의존하지 않는다. 화면은 테마의 뷰가 그린다(§6). `schema`가 의존을 갖지 않아야 한다는 §3.3의 원칙 때문이다.

**구조 · 조각 · 변형은 카탈로그에 없다 — 테마가 선언한다.** 컴포넌트가 어떤 마크업으로 그려질지는 테마의 뷰가, 고를 수 있는 변형(`variant`)과 변형마다 감출 속성은 테마 manifest 가 정한다(§6.0). 그래서 스키마는 노드의 `variant` 값을 판정하지 않는다 — 테마에 없는 값이면 렌더러가 그 테마의 기본 변형으로 그린다.

**공통코드 묶음 선언(`code`)** 은 `{ kind: 'label', prop }`(대표 글 — 그 prop 을 표의 항목 이름으로 그린다) 또는 `{ kind: 'choices' }`(선택지 — `options` 를 그 그룹의 항목으로 그린다)다. 정의는 그 prop · `options` 가 스키마에 있어야 선다(`defineComponent` 가 던진다). 하나만 고르는지는 선택지 칸의 선언(`select: 'one'`)이 정본이다.

**변형을 prop 에서 파생하는 컴포넌트가 있다**(`variantFrom` — `Text`의 `role` · `Divider`의 `direction`). 그 enum prop 의 값이 `data-wb-variant`가 되고, 노드의 `variant`는 무시된다(검증이 `ignored-variant` 경고로 알린다).

상태는 props에서 파생된다. `states`에 선언된 이름과 같은 props가 `true`이면 그 상태가 활성화되고, 렌더러가 `data-wb-state`에 실어 보낸다(뷰의 루트에는 접근성 속성도 선다 — §6.1). 상태 · 변형으로 실리지 않는 불리언 · enum prop 은 prop 표지(`data-wb-<prop>`)로 실린다(§6.1). 상태는 설계서 표현에 필수다. "필수값 미입력 시 저장 버튼 비활성", "선택된 행 강조" 같은 서술을 목업에서 실제로 보여주려면 상태를 켤 수 있어야 한다. 상태 목록은 여기 고정 선언되어 있어 임의 상태를 만들 수 없다.

속성 패널이 정의에서 자동 생성되므로 컴포넌트를 늘려도 에디터 코드를 수정하지 않는다.

---

## 6. 테마 시스템

### 6.0 테마의 범위

wirebound는 관리자 화면에 한정되지 않는다. 마케팅 사이트, 포털, 커머스, 문서 사이트의 설계도 같은 도구로 해야 한다. 이 요구가 테마의 범위를 결정한다.

**테마는 색 팔레트가 아니라 디자인 시스템 정의다.** 같은 페이지 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도, 히어로가 있는 랜딩 페이지로도 렌더된다.

**테마는 코드 패키지다.** headless SDK(`@wirebound/theme-sdk`) 위에 컴포넌트마다 React 뷰를 짜고, manifest(토큰 · 컴포넌트별 변형)를 선언한다 — 아는 키만 받는다. 구성 레시피(`patterns`)는 싣지 않는다: 실은 manifest 는 빌드 · 업로드가 «patterns 는 더 지원하지 않습니다» 로 거절한다(`@wirebound/themes` 의 `validateManifest`). 그 앞에 저장된 패키지(옛 시스템 테마 `system-commerce` · `system-portal` 의 판)에 남은 `patterns` 는 패키지를 다시 읽는 자리마다 다르게 선다 — 내보내기는 그 패키지를 못 읽어 기본 뷰로 내보내고(미리보기 한 줄), CLI · MCP lint 는 테마 규칙을 빼고 돌며, 캔버스 · 속성 패널은 서버 manifest 를 다시 검증하지 않아 그 테마로 그린다. 카탈로그가 걷은 컴포넌트(`0032` 앞 기본테마 1.6.0 이하가 선언한 `List`)를 선언한 저장된 패키지는 내보내기가 카탈로그에 기대는 검사(없는 컴포넌트 · 그 컴포넌트의 변형 · 숨길 prop)를 빼고 읽어(`readWbtheme` 의 `stored`) 그 테마로 내보낸다 — 걷힌 선언은 렌더러가 안 읽는다. 올리기 · 빌드 · 시딩은 그 검사를 그대로 본다. 되풀이해 넣을 묶음은 모듈(§11.1)이다. 뷰가 없는 컴포넌트는 SDK 기본 뷰로 그린다. **테마 CSS 의 배치(여백 · 크기 · 표시)를 바꾸는 규칙은 형제 구조(`+` · `~` · `:first-child` · `:last-child` · `:only-child` · `:nth-*` · `:has()` · `:empty`)로 가르지 않는다** — 에디터는 끄는 동안 배치 미리보기를 `display: none` 으로 숨긴 배치로 놓을 자리를 재는데 형제 셀렉터는 숨긴 요소도 형제로 세어, 미리보기가 선 자리마다 숨긴 배치가 달라지면 같은 포인터에서 답이 뒤집혀 캔버스가 `Maximum update depth` 로 멈춘다(색 · 모서리처럼 그림만 바꾸는 규칙은 괜찮다 — 기본테마는 `system-themes/admin/test/admin.test.ts` «배치를 바꾸는 규칙은 형제 구조로 안 가른다» · 실브라우저 `apps/web/build-test/admin-drag-sweep.test.ts` 가 잰다). **판을 올리며 더한 토큰이 옛 키가 칠하던 자리를 나눠 가지면 새 키의 기본값은 그 옛 키의 참조(`{semantic.text}`)다** — 옛 판에서 옛 키를 덮은 프로젝트가 판을 올리면 덮은 값은 옛 키에만 이어지고 새 키는 기본값으로 서, 리터럴이면 그 자리만 덮은 팔레트를 벗어난다(어두운 바탕에 짙은 라벨 글). 카탈로그는 닫혀 있다 — 테마는 컴포넌트 종류나 props 를 더하지 못하고 형태만 정한다. 이 선을 지켜야 스키마가 닫힌 채로 남고, 검증 · 내보내기 · LLM 조작이 성립한다. 목표 설계 전체(업로드 · 버전 · 프로젝트의 테마 선택 · 토큰 편집 · 스냅샷의 테마 · 내보내기의 테마)는 `docs/superpowers/specs/2026-09-27-code-themes-design.md`가 든다.

**지금 서 있는 것:**

- **캔버스는 same-origin iframe 안에서 프로젝트가 고정한 `id@버전` 의 번들과 토큰으로 그린다.** iframe 문서는 표준 모드(`<!doctype html>`)로 선다 — 내보낸 번들 · PPTX 화면과 같은 레이아웃 규칙이라 같은 폭에서 노드 · 번호 마커가 같은 자리에 선다(quirks 모드면 폼 뒤 여백 · 줄 높이 셈이 갈린다). 번들(`theme.js`)은 에디터가 세션마다 하나 두는 숨은 적재 iframe 에 `<script>` 로 싣고 판마다 한 번만 싣는다. 캔버스 머리의 시트는 SDK 기본 뷰 CSS → 그 판의 `theme.css`(`<link>`) → 토큰 CSS 변수 차례다. 다른 사람이 테마 · 토큰을 저장하면 열린 캔버스가 `theme-changed` 로 새로고침 없이 따라가고(토큰만이면 변수만, 판이 바뀌면 번들을 다시 싣는다), 끊긴 동안 놓친 저장은 셸이 프로젝트를 다시 읽을 때의 `themeRev` 로 따라잡는다. 번들을 못 받으면(오류 · 등록 없음 · 10 초) SDK 기본 뷰로 그리고 셸 머리에 한 줄로 알리며 «다시 불러오기» 를 둔다.
- **프로젝트 설정 페이지**(`/projects/:projectId/settings` — §9)가 테마를 고르고(고르개 밑의 인라인 확인에 토큰 이어짐 · 버려짐 · 기본값 수와 페이지별 없는 variant 수) 토큰을 고친다(manifest 선언에서 짓는 폼을 무리마다 탭으로 위에 · 그 밑에 넓은 미리보기 — «컴포넌트»(그룹별 격자) · «예제 페이지»(이어진 관리자 화면) 두 보기). 인스턴스 관리자는 **테마 관리** 화면(`/admin/themes`)에서 패키지를 올리고 판을 숨기고 스타터 템플릿을 받고 판마다 같은 두 보기의 미리보기를 본다 — 에디터 밖 화면 사이드바의 «관리자» 묶음(«테마» 칸 포함)은 관리자에게만 있다(§9 «셸 밖의 화면»).
- **서버는 테마 패키지를 받고 프로젝트가 그중 하나에 고정된다.** 인스턴스 관리자(§10)가 `.wbtheme` 를 올리고(`POST /api/admin/theme-packages` — 본문은 zip 바이트, 서버는 코드를 실행하지 않고 `readWbtheme` · manifest · SDK 범위 · `system-` 접두어 · 같은 `id@version` 을 본다) 버전을 숨기고 되살린다. 올린 패키지는 불변이고 지우는 길이 없다. 로그인한 사람은 목록 · manifest · 패키지 안의 파일을 읽는다(숨긴 버전은 목록에서 관리자에게만 보이고 파일은 누구에게나 나간다 — 고정한 프로젝트가 그려져야 한다). 한 테마의 «최신» 은 숨기지 않은 버전 가운데 semver 가 가장 큰 것이다.
- **시스템 테마는 하나다** — `system-admin`(보이는 이름 «기본테마» — 새 프로젝트가 서는 테마). 다른 모양의 사이트는 관리자가 올린 테마로 그린다(위 «테마 관리»). 작성자 테마와 같은 SDK 로 짠 저장소 안의 테마이고(`system-themes/admin/`) 뷰 없이 SDK 기본 뷰와 `theme.css` 로 그린다. 모양은 관리자 화면이다 — 회색 선의 표 격자(여백 없는 카드와 밑선 그은 머리줄 · 옅은 바탕 라벨 칸의 폼 표 · 머리 바탕의 그리드) · 13px 본문 · 4px 모서리 · 흰 단추와 채운 주 단추(`primary` 만 주색으로 채운다) · 읽기 전용과 비활성을 바탕 밝기로 가른 입력칸. 형태가 다른 구조(카드 그리드 · 아코디언 트리 · 정의 목록 등)는 테마가 variant 와 뷰로 더한다. 시스템 테마의 토큰은 사람이 고칠 만한 것(색 · 서체 · 모양 · 밀도 · 폭)만 선언한다. 한 테마 안에서 variant 는 여럿이고 `defaultVariant` 가 그 테마의 대표 모양이다 — 한 문서에 두 모양을 함께 둘 수 있다.
- **시스템 테마는 api 가 기동할 때 넣는다** — 저장소 빌드가 낸 `system-themes/*/dist/*.wbtheme`(`package.json` 이 있는 테마 디렉터리만 — 저장소에서 걷은 테마가 체크아웃에 남긴 `dist` 는 안 읽는다) 가운데 DB 에 없는 `id@version` 만. 같은 `id@version` 인데 내용(sha256)이 다르면 기동을 멈춘다(판을 올려야 한다). 판마다 산출물의 sha256 을 `system-themes/<이름>/checksums.json` 에 적는다 — 판을 안 올린 채 내용이 바뀌면 기동이 멈추기 전에 테스트가 잡는다. 배포한 판의 줄은 고치지 않는다(그 판이 시딩된 DB 가 있다). 테마가 비어 있는 프로젝트는 그 자리에서 `system-admin` 최신판으로 채워지고, 새 프로젝트도 그 판으로 선다. 저장소가 더는 내지 않는 시스템 테마(`system-commerce` · `system-docs` · `system-portal` · `system-saas-marketing`)는 패키지 행이 남아 숨겨져 있고, 그것에 고정한 프로젝트는 마이그레이션 `0027-retire-system-themes` 가 `system-admin` 최신판으로 옮긴다(토큰은 테마 바꾸기와 같게 잇는다). 그 테마를 가리키는 옛 판 3 스냅샷은 숨긴 그 판으로 복원된다.
- **프로젝트의 테마 바인딩은 owner 가 바꾼다**(`PUT /api/projects/:projectId/theme` — `theme_rev` 낙관적 동시성, 숨긴 버전은 지금 고정한 판의 토큰만 고칠 때만). 토큰은 대상 manifest 로 검증하고 기본값과 같은 값을 뺀 뒤 저장한다(값 200 글자 · 전체 16 KB 상한). 저장은 프로젝트 룸에 `theme-changed` 를 방송한다. 바꾸기 전의 영향(이어지는 · 버려지는 · 기본값으로 서는 토큰 수, 새 테마에 없는 variant 를 쓰는 노드 수)은 `GET …/theme/impact` 가 계산한다. lint 의 테마 규칙이 «현재 테마에 없는 variant» 를 본다(§12.4).
- **변형은 manifest 가 선언한다** — `components[type].variants` · `defaultVariant` · `hideProps`. 노드의 `variant`가 선언 밖이면 렌더러가 `defaultVariant`로 그린다(페이지 데이터는 바꾸지 않는다). 속성 패널의 변형 칸과 감출 속성도 이 선언을 읽는다.
- **내보내기(HTML 번들 · PPTX 화면)도 프로젝트가 고정한 `id@버전` 의 번들 · CSS · 토큰으로 그린다**(§11.3). 테마 코드는 브라우저(내보낸 페이지 · PPTX 의 Chromium)에서만 돈다 — api 의 Node 프로세스는 패키지 파일을 바이트로 번들에 싣기만 한다.
- **테마는 저장소 밖에서 짜서 `.wbtheme` 한 파일로 빌드한다.** 스타터 템플릿(`wb-theme pack-template` 이 짓는 zip — SDK · kit tarball 과 코딩 에이전트용 `SKILL.md` 동봉)을 풀고 `wb-theme dev` 로 갤러리를 보며 짜고, `wb-theme build` 가 manifest 를 검증해 `dist/<id>-<version>.wbtheme` 를 낸다. `wb-theme check` 는 갤러리 칸 전부를 빌드한 번들로 그려 오류를(그리지 않는 타입 · 카탈로그에 없는 타입을 가리키는 `views` 키도 오류다 — 렌더러가 읽지 않아 조용히 버려진다), `wb-theme shots` 는 실 Chromium 스크린숏으로 콘솔 오류 · 가로 넘침을 본다(§3.3). `.wbtheme` 는 zip 이고 `manifest.json` · `theme.js`(IIFE — `react` · `react/jsx-runtime` · `@wirebound/theme-sdk` 를 번들에 넣지 않고 호스트가 세운 `__wirebound_runtime__` 에서 읽는다) · `theme.css` · `assets/**` 만 든다. 읽기(`readWbtheme`)는 크기 · 항목 수 · 경로 · 허용 목록 · 링크를 풀기 전에 본다. 시스템 테마도 `pnpm build` 가 같은 길로 `.wbtheme` 를 낸다. 만든 `.wbtheme` 는 관리자가 올린다(위 «테마 관리»).
- **레이아웃 틀(§4.4)은 테마가 그린다**(SDK 1.10.0 — 더하기만 한 계약이라 `^1.8.0` 을 선언한 테마가 그대로 맞는다). manifest 의 선택 키 `layouts` 가 레이아웃(`blank` · `popup` · `subpage`)마다 틀의 영역(`regions` — `id` 는 `^[a-z][A-Za-z0-9]{0,31}$` · 레이아웃 안에서 유일 · `label` 1 ~ 20자 · `toggle: false` 면 못 끈다 · 8 개까지)을 선언하고, `validateManifest` 가 레이아웃 키 셋 밖 · 겹친 id · 꼴 밖 id · 영역 수를 이슈로 낸다 — 키가 없는 manifest(앞 판 테마)는 «선언한 영역 없음» 이다. 뷰는 `ThemeDefinition.layouts` 로 내고 `LayoutViewProps`(`title` · 메뉴 트리에서 지은 `gnb` · `lnb` · `trail`(`buildLayoutNav`) · `regions` · `children`)를 받는다. 뷰는 `children`(페이지 내용)을 정확히 한 번 두고, 끌 수 있는 영역을 SDK `<LayoutRegion id>` 로만 감싸며(호스트가 끈 영역은 감싸는 요소째 안 그린다), 메뉴 항목을 `<LayoutLink item>` 으로 둔다(`pageId` 가 없으면 링크가 아닌 글 · 지금 페이지는 `aria-current="page"` · 누름은 호스트가 정한다). 뷰를 안 낸 레이아웃은 SDK 기본 레이아웃 뷰(내용만)로 그린다 — 앞 판 테마는 세 레이아웃이 같은 화면이다. 렌더러의 `LayoutFrame` 이 뷰 밖을 `data-wb-layout` 으로, `children` 을 `data-wb-layout-content`(SDK 기본 CSS 가 `display: contents`)로 감싸고, 뷰가 던지면 기본(내용만)으로 대신 그리며 틀에 `data-wb-error` 를 단다. 팝업 레이아웃의 막(흐린 바탕 · 여백 24px · 가운데 위 상자)은 SDK 기본 CSS 가 `[data-wb-layout="popup"]` 에 그리고 찍는 판(`CAPTURE_CSS`)은 막 없이 상자만이다. `wb-theme check` 는 레이아웃을 내거나 선언한 테마마다 그 뷰를 예제 장으로 그려, 그린 판마다(모두 켬 · 끌 수 있는 영역 하나씩 끔 · 트리에 없는 페이지의 내비 · 빈 내비) 내용 상자와 문서 뿌리 노드가 하나씩인지와 뷰가 안 던졌는지 · 선언한 끌 수 있는 영역이 모두 켠 판에 서고 그 하나만 끈 판에 없는지를 오류로, 선언 밖 영역을 경고로 잰다. `LayoutFrame` 으로 그리는 자리는 에디터 캔버스(§9 «중앙 — 캔버스») · 테마 미리보기의 «예제 페이지»(서브페이지 장 · 예제 메뉴 트리) · `wb-theme dev`(작성자가 끄는 영역 체크) · `wb-theme check` 다 — HTML 번들 · PPTX 는 틀 없이 문서 뿌리를 그린다.

### 6.1 노드 속성

노드의 루트에는 `data-wb-*` 속성이 실리고, 테마의 CSS는 이것을 셀렉터로 쓴다.

| 속성 | 값 | 누가 싣나 |
|---|---|---|
| `data-wb-id` | 노드 id | 렌더러 — 에디터의 선택 · 잠금 · 코멘트 앵커 |
| `data-wb-copy-of` | 원본 노드 id — 그리드 되풀이 행의 둘째 줄부터(사본) `data-wb-id` 대신 선다(둘 중 하나만) | 렌더러 · SDK `Root` — 에디터의 노드 찾기 · 끌기 판정 · 마커가 훑는 `data-wb-id` 에 안 걸린다(외곽선 · 손잡이 · 마커 · 코멘트 핀은 원본 하나에 선다). 캔버스 누름 · 범위 선택은 사본을 원본으로 읽고, 끌어 놓기는 사본 위를 놓을 자리로 안 읽는다(§9 «선택 — 고르는 법» · «캔버스에 놓기») |
| `data-wb-component` | 컴포넌트 타입 | 렌더러 |
| `data-wb-variant` | 변형(`variantFrom`이면 그 prop 값) | 렌더러 |
| `data-wb-state` | 공백 구분 상태 목록 | 렌더러 |
| `data-wb-<prop>` | prop 표지 — 불리언은 참일 때 빈 값, enum 은 그 값(`data-wb-compact=""` · `data-wb-kind="video"`) | SDK `Root` — `view()` 로 짠 뷰 전부 |
| `aria-disabled` · `aria-busy` · `aria-invalid` · `aria-required` · `aria-readonly` | 상태 `disabled` · `loading` · `invalid` · `required` · `readonly` 가 참이면 `true` | SDK `Root` — 뷰가 같은 이름을 넘기면 뷰 것(기본 `Field` 뷰는 뿌리가 라벨 이름을 단 `group` 이라 `aria-required` 를 거둔다 — 그 역할은 그 속성을 받지 않는다. 필수는 라벨의 별(`data-wb-state~="required"`)이 말한다. 입력 조각은 뿌리의 역할(`textbox` · `spinbutton` · `combobox`)이 `aria-invalid` · `aria-readonly` 를 받고, 필드 값 칸의 조각은 그 필드의 필수를 `aria-required` 로 받는다 — 아래 «값 칸 조각의 이름») |
| `data-wb-marker` · `data-wb-marker-offset` | 번호 마커의 자리(`top-start` 등)와 어긋남 `x,y` | SDK `Root` — 뷰가 `marker` 를 줄 때 |
| `data-wb-focus` | 선택 외곽선 · 마커의 기준 상자 | SDK `Focus` — 없으면 루트가 기준이다 |
| `data-wb-structure` | 기본 뷰의 형태 이름 | SDK 기본 뷰 |
| `data-wb-part` | 기본 뷰의 내부 조각 이름 | SDK 기본 뷰 |
| `data-wb-cell` | 기본 그리드 뷰의 몸 칸 종류 — `select`(선택 칸) · `number`(번호 열) · `template`(셀 틀) · `own`(행이 그린 제 칸) · `blank`(모자란 열의 빈 칸) | SDK 기본 뷰 |
| `data-wb-column-of` | 그리드 열의 몸 칸(셀 틀 · 번호 칸 — `td`)이 속한 열 노드 id — 칸(빈 자리 · 그 안의 사본 노드)을 누르면 그 칸이 선 줄의 행을 고르고(§9 «선택 — 고르는 법»), 첫 줄 셀 틀 칸의 빈 자리에 끌어 놓으면 그 열 셀 틀의 끝이다(§9 «캔버스에 놓기») | SDK 기본 그리드 뷰 |
| `data-wb-col` · `data-wb-fixed` · `data-wb-fixed-off` | 그리드 머리 · 몸 칸의 열 자리(0 부터 — 걸친 칸은 첫 열) · 고정 열 칸(마지막 고정 열은 `last`) · 고정을 푼 표(`table` 조각 — 고정 구역이 스크롤 상자 폭의 3/4 을 넘을 때) | SDK 기본 그리드 뷰 — `data-wb-fixed-off` 는 그 레이아웃 이펙트가 단다 |
| `data-wb-zone` | 구역 이름 — 그 구역의 그린 것을 감싼 요소에(비었으면 요소째 없다) | SDK `Zone` — 뷰가 `<Zone name>` 으로 둔다 · 에디터가 캔버스의 구역 상자를 이것으로 찾는다 |
| `data-wb-layout` | 페이지 레이아웃(`blank` · `popup` · `subpage`) — 레이아웃 틀의 겉 상자에. 그 안 · `data-wb-layout-content` 밖이 틀이고 틀 요소에는 `data-wb-id` 가 없다(노드가 아니다) | 렌더러 `LayoutFrame` |
| `data-wb-layout-content` | 레이아웃 뷰가 받은 `children`(문서 뿌리)을 감싼 상자 — SDK 기본 CSS 가 `display: contents` | 렌더러 `LayoutFrame` |
| `data-wb-layout-region` | 레이아웃 틀의 영역 id — 켠 영역을 감싼 요소에(끈 영역은 요소째 없다) | SDK `LayoutRegion` — 레이아웃 뷰가 `<LayoutRegion id>` 로 둔다 |
| `data-wb-placeholder` | 입력 조각의 `text` 조각이 값 대신 안내 문구를 그릴 때 — 테마가 흐리게 그린다 | SDK 기본 뷰 |
| `data-wb-capture` | 찍는 판 — `<html>` 에. 화면을 그림으로 찍는 도구가 SDK 의 찍는 판 시트(`CAPTURE_CSS`)와 함께 단다 | api 화면 그리기 · `wb-theme shots` |
| `data-wb-columns` | 열을 정한 `SearchForm` 의 열 수 — `fields` 조각에(루트가 아니다) `--wb-node-searchform-columns` 와 함께 · `FormTable` 의 열 수 — `cells` 조각에 `--wb-node-formtable-columns` 와 함께(늘 선다 — 기본 1) | SDK `searchFormFieldsAttrs` · `formTableCellsAttrs` — 기본 뷰와 그 조각을 그리는 테마 뷰 |

앞의 넷은 렌더러가 짓고 뷰가 자기 루트(`Root`)에 편다 — 어느 테마의 뷰든 같다. 노드 몫(§4.3)은 속성이 아니라 `Root` 가 인라인으로 싣는 변수 `--wb-node-weight` 다. 마커 · 초점 자리는 뷰가 DOM 을 바꿔도 번호 마커 · 외곽선이 제 자리에 서게 하는 훅이고, 좌표는 `renderer` 의 한 함수가 이 속성으로 계산한다(에디터 오버레이 · 내보낸 번들 · PPTX 가 같은 함수를 쓴다 — `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「뷰 계약」). 뒤의 셋은 SDK 기본 뷰의 마크업 훅이라, 자기 뷰를 짠 테마는 자기 마크업을 쓴다(테마의 뷰가 기본 뷰를 불러 감싸면 그 훅이 그대로 선다).

**뷰는 구역을 `zones` · `items` 로 받는다**(SDK 1.3.0 부터 — manifest 의 `sdk` 범위가 가른다). `ViewProps` 의 `children` 은 몸통을 그린 것 그대로이고, `zones` 는 이름 붙은 구역마다 그린 것(빈 구역은 `null`)이라 뷰는 직접 두지 않고 `<Zone name as data-wb-part>` 로 둔다 — `Zone` 이 빈 구역이면 감싸는 요소째 안 그리고 있으면 `data-wb-zone` 을 단다. `items` 는 몸통의 보이는 자식을 하나씩(`nodeId` · 몸통 배열의 자리 `index` · 뿌리 요소 `element` · 제 몸통을 부모에게 맡긴 자식이면 그 몸통 `content`) 내 `Tabs` 처럼 자식마다 머리와 내용을 가르는 뷰가 쓴다. `TabPanel` 의 뷰는 `children` 을 `null` 로 받고 탭 머리만 그린다 — 렌더러가 그 몸통을 부모의 `items[i].content` 로 넘긴다. 구역을 안 그리는 뷰는 그 안 노드를 화면에서 잃으므로 `wb-theme check` 가 «내용이 든 구역을 뷰가 안 그렸다» 를 오류로 잰다(갤러리 칸마다 구역에 표본 노드를 넣어 그린다). SDK 기본 뷰의 자리: `Card` 머리줄 = 제목 · 제목 옆 · 부제 · 머리 오른쪽(오른끝), 밑에 몸통 · 바닥 · `SearchForm` 은 필드 뒤 `actions`(접히면 `toggle` 줄만 — 두 구역 다 빠진다) · `EntryForm` 은 제목 · 항목 · `actions` · `FormTable` 은 머리줄(`header` — `title` 조각 · 머리 오른쪽) · 옆 칸(`aside`) · 칸(`cells`) · `DataGrid` 는 표 위 `head` 조각(머리 왼쪽 · 머리 오른쪽 양끝) · 표를 감싼 `scroll` 조각 · `footer` 조각(바닥) · `Tabs` 는 `list` 조각(`items` 마다 탭 머리) · `panel` 조각(지금 패널의 내용). 기본테마(`system-admin`)는 그 자리를 `theme.css` 로 꾸미고 «소제목 + 오른쪽 단추» 줄을 카드의 테두리 없는 변형(`borderless` — «테두리 없음»)으로 짓는다.

**`Field` 는 라벨 조각과 값 조각을 형제로 둔다**(SDK 1.4.0 — 카탈로그 타입 아홉이 더해지고 `Field` 의 DOM 이 바뀌어 판을 올렸다). 기본 `FieldView` 는 `Root div[role=group][aria-labelledby]` > `label[data-wb-part=label]` · `div[data-wb-part=value]`(몸통 — 조각들)다 — 라벨|값 표가 두 조각을 칸에 나눠 놓을 수 있다. 입력 조각의 기본 뷰는 실제 `<input>` · `<select>` 가 아니라 역할 · 이름을 단 그림이다(`text` 조각 — 값, 없으면 안내 문구 · 날짜 · 시간의 `glyph` · 셀렉트 꺾쇠는 CSS). 선택지 묶음은 항목마다 `option` 조각(`role=checkbox | radio` · `aria-checked`)과 `mark` 조각을 그리고 테마 CSS 가 `[aria-checked="true"]` 로 고른 칸을 꾸민다 — 항목은 노드가 아니라 `data-wb-id` 가 없다. 칩의 × 는 `remove` 조각이다. 기본테마는 뷰 없이 `theme.css` 로 꾸미고 `RadioGroup` 의 `segment`(기본) · `radio`, `CheckboxGroup` 의 `checkbox`(기본) · `chip` 을 선언한다. 입력 조각의 상호작용은 `click` · `select` 만 뷰 모드에서 돈다 — 실제 입력이 없어 `change` 는 나지 않는다. **값 칸 조각의 이름** — 렌더러가 `Field` 몸통의 입력 조각(`Input` · `TextArea` · `Select` · `DateInput` · `TimeInput` · `CheckboxGroup` · `RadioGroup` — 단추 · 사이 글자 · 칩은 빼고)에 `ViewProps.field`(`{ name, required }`)를 싣는다. 이름은 그 판에 서는 입력 조각이 하나면 라벨, 여럿이면 «라벨 + 별칭», 별칭이 없으면 «라벨 + 차례(1부터)» 다(«기간 1» · «기간 2») — 입력 칸만 훑는 보조 기술은 묶음의 이름을 지나지 않아 조각 제 이름이 어느 라벨의 칸인지 말한다. 기본 뷰는 그것을 `aria-label` 로, 필수면 `aria-required` 로 편다(그 속성을 받는 역할만 — 체크 묶음 `group` 은 이름만). 라벨이 빈 필드 · 필드 밖의 조각은 안내 문구 · 종류 이름으로 선다. 칸은 선택이다 — 안 쓰는 테마 뷰는 지금 그대로 그린다.

**폼 표는 쌍 격자다**(SDK 1.6.0). 렌더러가 칸을 세는 부모(`Grid` · `FormTable` · 열을 정한 `SearchForm`)의 몸통 자식마다 자른 몫을 `ViewItem.span` 으로 싣고(없으면 1), SDK `pairRows(items, columns)` 가 격자의 자동 배치와 같은 셈으로 줄을 지어 줄 끝과 «넓은 칸이 다음 줄로 넘어가며 남긴 구멍» 에 빈 쌍을 끼운 차례를 준다 — CSS 만으로는 남는 트랙에 상자가 없어 칸 선 · 라벨 바탕이 안 선다. 기본 `FormTableView` 는 `Root div`(제목이 있으면 `role=group` · `aria-labelledby` — 표 하나가 이름 붙은 묶음) > 머리줄(`header` — `title` 조각 · `<Zone headEnd>`, 제목도 머리 오른쪽도 없으면 없다) · `<Zone aside>` · `cells` 조각(`formTableCellsAttrs(columns)`) > 그 차례의 자식 · 빈 쌍(`div[data-wb-part=filler][aria-hidden]` > `label` · `value` 조각 — `Field` 와 같은 두 조각이라 테마의 라벨 바탕 · 칸 선 규칙이 그대로 듣는다 · 노드가 아니다)이다. `<table>` 이 아니다 — 칸에 `Field` 뿌리(`group`)가 서고 값 칸에 그리드 · 하위 표가 든다. SDK 기본 CSS 가 폼 표의 `cells` 를 `repeat(열 수, 라벨 폭 minmax(0, 1fr))`(라벨 폭은 테마의 손잡이 `--wb-form-labelWidth` · 없으면 8rem — SDK `FORM_LABEL_WIDTH_VAR`)로 깔고 자식은 `span 2 × 몫`, 빈 쌍은 늘 한 쌍, 그 안의 `Field` · 빈 쌍은 `grid-template-columns: subgrid` 로 두 조각을 트랙에 놓는다 — 라벨 칸 · 값 칸의 왼끝이 줄마다 맞고 두 칸이 그 줄 높이를 채운다(값 칸이 키를 키우면 라벨 칸이 따라 늘어난다). 그래서 **`Field` 뷰는 두 조각을 뿌리의 직계로 그린다** — 감싸는 요소를 끼우면 두 조각이 한 칸에 몰린다. `display: contents`(뿌리 상자가 없어 외곽선 · 놓기 판정 · 마커가 깨진다)도, 표 뷰가 자식 조각을 나눠 그리는 길(계약이 크게 바뀐다)도 아니다. 960px 아래(PPTX 캡처 폭 720 이 든다)는 한 줄에 쌍 하나 · 라벨 왼쪽 · 빈 쌍 숨김이다 — 열 수가 그대로면 라벨 칸이 열마다 빠져 줄을 안 바꾸는 값(세그먼트 · 하위 표)이 옆 쌍 · 창 밖으로 넘친다. 640px 아래는 한 줄에 쌍 하나 · 라벨 위 · 빈 쌍 숨김 · 옆 칸은 표 위다. 값 칸 안의 폼 표(하위 표)는 폭과 무관하게 한 줄에 쌍 하나이고 값 칸 폭을 채운다(내용 폭으로 줄면 값 트랙이 0 으로 접힌다). SDK 기본 CSS 가 특이도 0 으로 그 판들을 두고(테마가 안 꾸민 판의 모양) 폼 표를 꾸미는 테마는 제 규칙으로 덮는다 — 기본테마는 960 판을 열을 정한 조회 폼에도 건다(SDK 기본의 열 조회 폼은 같은 폭 칸 · 라벨 위라 안 접는다). 기본테마 1.5.0 이하에 고정된 프로젝트는 폼 표를 그 테마의 `[EntryForm] [Field]`(자손) 두 칸 규칙 · SDK 기본 CSS 로 그린다 — 칸 선 · 라벨 바탕은 1.6.0 으로 올린 뒤다. 라벨이 빈 `Field` 는 역할을 안 낸다(이름 없는 `group` 이 안 선다 — 행 가운데 빈 쌍). **열을 정한 조회 폼의 SDK 기본 CSS 는 쌍 격자가 아니다**(필드 하나 = 같은 폭 칸 하나) — 그 위에 «필드 하나 = 트랙 하나» 로 덮어 둔 SDK 1.5.0 이하 테마(기본테마 1.5.0 에 고정된 프로젝트)에서 필드가 두 트랙씩 덮어 열이 깨지지 않게 한다. 쌍 격자는 테마가 고른다 — 기본테마가 트랙 · 자식 폭(`span calc(2 * var(--wb-node-weight, 1))`) · subgrid 를 건다. `wb-theme check` 가 폼 표 뷰의 꼴 — `cells` 조각이 있는지 · 칸(몸통 자식)과 빈 쌍이 그 직계인지 · 칸 `Field` 와 빈 쌍이 두 조각을 직계로 갖는지 · 빈 쌍 수가 `pairRows` 셈과 같은지 — 를 오류로, `wb-theme shots` 가 같은 줄 라벨 칸 높이 = 값 칸 높이와 쌍 격자 꼴로 안 선 폼 표 몸통 `Field`(그 판은 쌍 높이를 하나도 못 잰다)를 문제 줄로 잰다. 기본테마는 뷰 없이 `theme.css` 로 꾸민다(바깥 · 칸 선 · 라벨 칸 옅은 바탕 · 굵은 글 · 머리줄 제목 · 필수 별은 라벨 앞이고 대체 글이 비어 묶음의 접근 이름에 안 든다(필수는 입력 조각의 `required` 가 말한다) · 칸이 하나도 안 선 표는 선을 안 긋는다 · 열을 정한 조회 폼은 폼 표와 같은 라벨 칸 · 칸 선이고 빈 쌍은 안 그린다 · 라벨 칸은 140px · 칸은 42px 이상 · 테두리 있는 카드의 몸통에 곧바로 든 폼 표 · 그리드 · 조회 폼은 형제가 있어도 카드에 붙어 제 바깥 선을 걷는다). 실브라우저 판은 `apps/web/build-test/form-table.test.ts` · `admin-look.test.ts` 다.

**그리드는 표 하나에 열 노드 · 행 노드를 펴서 그린다**(SDK 1.7.0). 뷰는 구역마다 보이는 자식을 `zoneItems` 로 받고, `ViewItem` 은 타입 · props · 손자(`items`)와 사본 짓기(`copy(row)`)를 싣는다. SDK `gridLayout(columns, rows, …)` 이 순수 함수로 머리 줄(열 묶음 깊이만큼 — 잎은 `rowspan` 으로 바닥까지 · `scope` 는 잎 `col` · 묶음 `colgroup`) · 몸 줄(되풀이 행을 `repeat` 줄로 펴고 · 셀 틀 · 제 칸 · 세로 칸의 덮임 · 생략 띠에서 끊음 · 번호 · 고정 열)을 셈하고, 기본 그리드 뷰가 `GridProvider` 로 그 셈을 내려 열 · 열 묶음 · 행 · 칸 뷰가 `useGridHead` · `useGridRow` · `useGridCell` 로 제 칸을 읽는다(뷰 함수 몸이 아니라 노드 id 로 — 훅이 부모 노드의 문맥을 읽지 않게). **되풀이 행의 둘째 줄부터는 사본이다** — 렌더러가 그 서브트리를 다시 그리되 노드마다 `data-wb-id` 대신 `data-wb-copy-of` 를 싣고, 뷰의 `nodeId` 는 `<원본 id>~<열쇠>`(HTML `id` 가 안 겹친다) · 사본 안 입력 조각의 접근 이름에 « (n행)» 이 붙는다. 표지 · 상태 · 상호작용은 원본과 같다(사본을 누르면 원본의 규칙이 돈다). 사본의 글은 원본과 같고 «No» 만 다르다. 사본 노드도 노드 뿌리라 SDK 의 몫 초기화가 덮는다. **고정 열**은 `position: sticky` 이고 둘째 고정 열부터의 왼쪽 자리(앞 칸 폭의 합)를 기본 그리드 뷰의 레이아웃 이펙트가 재어 `--wb-node-datagrid-left` 로 싣는다(표 · 스크롤 상자 크기가 바뀔 때 · 글꼴이 실린 뒤 다시 잰다 — 캔버스 · 번들 · 갤러리가 같다). 같은 이펙트가 고정 구역 폭이 스크롤 상자 폭의 3/4 을 넘으면 표에 `data-wb-fixed-off` 를 달아 고정을 푼다 — 붙인 채 굴리면 고정 칸이 상자 끝에 겹쳐 쌓이고 나머지 열이 안 보인다. 표는 칸 글의 폭(줄을 안 바꾼 폭 — 상자보다 좁으면 상자 폭)이고 칸 글은 낱말 가운데서 안 꺾인다(한글도 공백 단위 — 열 폭 `size` 를 정한 열은 그 폭에서 낱말 사이로 꺾이고, 끊을 자리 없는 긴 낱말은 열을 넓힌다). 표가 창보다 넓으면 표 칸(`scroll` 조각)만 가로로 굴러가고 문서는 창 폭 그대로다. **찍는 판**(PPTX 의 화면 그림 · `wb-theme shots`)은 `<html data-wb-capture>` 와 SDK 의 `CAPTURE_CSS`(`@layer` 안의 `!important` — 스크롤 상자를 풀고 고정 열을 놓는다)를 함께 달아 표 전체 폭으로 찍는다(넓이 상한 720 × 8192 px² 는 그대로 — 넓어진 만큼 받는 높이가 준다). 이 시트를 기본 뷰 CSS 에 안 넣는 까닭은 jsdom 의 CSS 파서가 `@layer` 든 시트를 통째로 버려서다. `wb-theme check` 는 그리드 표본마다 행 뷰가 줄마다 원본 `Root` 를 그리지 않는지 · 셀 틀이 줄마다 `data-wb-id` 로 서지 않는지 · 몸 줄의 칸 수 · `colspan` 합이 `gridLayout` 과 같은지 · 머리 칸이 `colspan` · `rowspan` 을 싣는지를 오류로, `wb-theme shots` 는 고정 열 제자리 · 칸 글 넘침 · 찍는 판 펼침을 잰다.

**파일첨부는 단추 줄 · 목록 표 · 한도 글이다**(SDK 1.8.0). 기본 `FileAttachView` 는 `Root div[role=group][aria-label]`(값 칸 안이면 필드 이름 — 렌더러가 «값 칸 조각의 이름» 과 같은 길로 싣는다, 밖이면 «파일첨부») > `<Zone actions>`(`actions` 조각) · `table[data-wb-part=list]`(머리 `th scope=col` 셋 — 고르기 · 파일이름 · 파일크기 · 파일마다 `tr[data-wb-part=file]` > `check` · `fileName` · `fileSize` 칸 · 목록이 비면 `td[data-wb-part=drop]` 한 줄) · `p[data-wb-part=limit]`(«최대 » `limitCount` «개» 조각 · `limitSize` 조각 « 제한» — 개수가 0 이면 개수 조각, 크기가 비면 크기 조각이 없고 둘 다 없으면 줄째 없다)다. 체크는 `<input>` 이 아니라 `checkbox` 조각(그림 — 그리드 선택 칸과 같다). SDK 기본 CSS 는 단추 줄 오른쪽 · 넘치면 다음 줄, 표 폭 100%, 이름 칸은 뿌리의 `overflow-wrap: anywhere` 로 낱말 가운데서도 꺾이고 크기 칸은 안 꺾인다. `wb-theme check` 가 F1 ~ F4 — `file` 조각 수 = `files` 길이 · 빈 목록이면 `drop` 하나 · 차면 0 · 한도가 있으면 `limit` 하나 안에 그 값의 조각 · 없으면 `limit` 0 · `list` 가 `table` 하나이고 머리 칸이 `th scope=col` 셋 — 와 조각의 자리 — `file` 줄이 `list` 표 몸통의 `tr` · 줄마다 `check` 칸 안 `checkbox` 하나와 그 파일의 글을 든 `fileName` · `fileSize` 칸 · 머리 줄의 `checkHead` 칸 안 `checkbox` 하나 · «단추» 구역에 내용이 있으면 목록 표 밖 `actions` 조각 하나(그 구역 상자이거나 품는다) — 를 오류로 잰다(갤러리 표본이 파일 0 · 하나 · 셋과 한도 글 네 갈래를 갖는다). `checkbox` 조각 안의 꺼지지 않은 입력 칸은 포커스 경고다(다른 자리의 입력 칸은 «기대한 포커스» 라 경고가 아니다). 기본테마는 테두리 상자 안에 작은 단추 줄 · 머리 바탕의 목록 머리 · 옅은 바탕의 한도 줄을 붙여 세우고, 한도 수는 빨간 굵은 글 · 꺼진 상자는 비활성 바탕이다.

**테마 뷰가 그리는 포커스 받는 요소는 단추(`<button>`) · 링크(`<a href>`) · 입력 칸(`input` · `select` · `textarea`)만이다.** 에디터의 단축키 · 노드 복사는 캔버스 문서에서 포커스가 없거나(본문) 단추 · 링크일 때만 서고(「단축키」의 «서지 않는 때») 그 밖의 포커스 받은 요소(`tabindex` 를 단 요소 · `summary` · `controls` 를 켠 `video` · `audio`)는 입력 표면으로 본다 — 그런 요소를 누른 뒤에는 Delete · Cmd+C · Cmd+D 가 안 서고 통지도 없다. 판정을 넓히지 않는 것은 닫힌 shadow 안의 입력과 `tabindex` 만 단 요소를 DOM 으로 가를 수 없어서다(`apps/web/src/edit/editor-shortcuts.ts` 의 `shortcutsBlocked`). `wb-theme check` 가 갤러리 칸마다 그런 요소를 찾아 경고한다 — 오류가 아니라 종료 코드에 안 들고, 닫힌 shadow 안은 못 본다. 계약은 테마 작성 안내(`packages/theme-kit/template/SKILL.md` 「뷰 계약」)에도 있다.

**prop 표지는 화면을 바꾸는 불리언 · enum prop 가운데 상태(`data-wb-state`) · 변형(`variantFrom` → `data-wb-variant`)으로 실리지 않는 것 전부에 선다** — 지금 `Section.compact` · `Flex` 의 `direction` · `align` · `justify` · `wrap` · `DataGrid.select` · `GridColumn` 의 `required` · `align` · `size` · `sort` · `tone` · `numbering` · `GridRow` 의 `kind` · `tone` · `Pagination` 의 `sizeSelect` · `range` · `SearchForm.collapsed` · `Input` 의 `kind` · `size` · `Select.size` · `Chip.removable` · `Affix.tone` · `Media` 의 `kind` · `ratio` · `Placeholder` 의 `border` · `align` · `imageFit` 이다(표는 `packages/theme-sdk/src/marks.ts` 의 `MARKED_PROPS`). 같은 값을 두 이름으로 싣지 않는다 — 상태 · 변형으로 실리는 prop 은 표지가 없다. 테마 CSS 는 `[data-wb-component="Section"][data-wb-compact]` 처럼 겨냥한다. 렌더러의 노드 속성 계약은 넓히지 않는다: `view()` 가 노드의 props · 상태를 문맥으로 내리고 `Root` 가 펴므로 기본 뷰와 테마 뷰가 같은 표지를 빠뜨릴 수 없다. `Root` 는 제 노드 id 의 문맥만 읽는다 — `view()` 를 거치지 않은 맨 함수 뷰의 `Root` 는 표지 · 접근성 속성을 안 편다(부모 노드의 것을 잘못 읽지 않게). 카탈로그에 불리언 · enum prop 이 생기면 표 · 상태 · 변형 가운데 하나에 들어야 한다 — `packages/renderer/test/prop-marks.test.tsx` 가 prop 마다 그 길과 «바꾸면 기본 뷰의 DOM 이 바뀐다» 를 센다. 수 prop 은 표지가 아니다(셀렉터로 셀 수 없다) — `SearchForm.columns` 는 `fields` 조각의 `data-wb-columns` 로 «정했다» 를 가르고 열 수는 변수가 나른다(`FormTable.columns` 는 `cells` 조각에 늘 선다). 시스템 테마는 `[data-wb-part="fields"][data-wb-columns]` 에서만 제 `fields` 배치를 쌍 격자로 바꾼다(`apps/web/build-test/searchform-columns.test.ts`).

**자리표시자의 그리기 값은 노드 변수로 실린다**(SDK 1.5.0). `placeholderVars(props)`(SDK)가 정한 값만 `--wb-node-placeholder-<이름>`(`width` · `height` · `radius` · `font-size` · `padding` 은 `px` 를 붙여, `background` · `border-color` · `color` 는 `#rrggbb`)으로 내고 기본 뷰가 `Root` 의 `style` 에 싣는다 — 커스텀 프로퍼티만이다(inline 일반 선언은 테마의 몫까지 덮는다). SDK 기본 CSS 는 자리표시자 뿌리마다 그 여덟을 `initial` 로 끊어(바깥 값이 안쪽 자리표시자에 물려지지 않게) 특이도 0 으로 배치(가로 줄 세우기 · 넘치면 줄바꿈 · 세로 가운데 · 빈 칸은 높이를 안 정했으면 120px)를 잡는다. 테두리 꼴 · 정렬은 표지(`data-wb-border` · `data-wb-align`)다. **테마는 그 변수를 대체값과 함께 읽어야 한다**(`background: var(--wb-node-placeholder-background, <테마의 바탕>)`) — 안 읽고 덮으면 사람이 고른 색이 그 테마에서 사라진다. 갤러리의 «정한 색 · 모서리 · 여백» 표본(`PLACEHOLDER_SET_PROPS`)으로 둘이 잰다: `wb-theme check`(jsdom)는 뷰가 뿌리에 변수를 싣는지(오류), `wb-theme shots`(실 Chromium)는 계산된 `background-color` · `border-top-color` · `color` · 모서리 · 글 크기 · 여백이 정한 값인지(문제 줄)다. jsdom 은 특이도를 안 보고 `var()` 를 안 풀어 계산 값을 못 낸다. 기본테마는 몸통의 `Text` 가 자리표시자의 글 색을 물려받게 한다. 몸통이 있으면 라벨 조각(`label`) 대신 몸통 조각(`content`)이 선다. **그림은 그리는 자리가 주소를 정한다** — 렌더러가 `RenderOptions.assetUrl`(그림 id → 주소 · 못 읽으면 `null`)을 받아 SDK 문맥으로 내리고 뷰가 `useAsset(id)` 로 읽는다(캔버스는 `/api/projects/:p/assets/:id`, 번들은 페이지 깊이에 맞춘 상대 주소, 갤러리는 표본 `data:`). 기본 뷰는 그림 조각 `<img data-wb-part="image" alt=<라벨>>`(그림이 있으면 라벨 조각은 안 선다)이고 못 읽으면(`null` · 읽다 깨짐) «그림을 불러올 수 없음» 표지(`image-missing`)다. 그림이 칸을 채우는 꼴은 뷰가 정하는 조각 속성 `data-wb-frame`(너비 · 높이를 다 정했거나 몸통이 있으면 `box` — 칸에 깔고 `imageFit` 으로 맞춘다 · 한 변만 정했으면 `width` · `height` · 없으면 그림의 원래 크기)이다. `Flex` 안에서 몫을 받은 자리표시자는 바탕 폭이 0 이라 정한 너비가 바닥(`min-width`)이 된다.

**SDK 기본 뷰는 표지 · 상태로 제 모양을 바꾼다** — 테마가 없어도 화면이 바뀐다. `Section` 의 위아래 여백은 compact 면 준다(특이도 0 — 테마의 여백 규칙이 이긴다), `SearchForm` 은 접히면 머리줄(`toggle` 조각)만 남고 자식이 DOM 에서 빠진다(`display: none` 으로 감추면 테마 CSS 가 되살릴 수 있다), `DataGrid` 는 `select` · `empty` · `loading` 을 선택 칸 · 빈 결과 줄 · 칸마다 막대 조각으로, `KeyValue` 는 `columns` 쌍씩 한 행으로, `Media` 는 `kind` 를 틀 가운데 표지(`glyph`)로 그린다. 시스템 테마가 표지를 읽는지는 `apps/web/build-test/theme-prop-marks.test.ts` 가 켬/끔의 상자 차로 잰다. 그리드는 어느 variant 든 표다 — `select: 'check'` 면 머리에 하나 · 행마다 하나 선택 칸이 서고, 시스템 테마는 `DataGrid` variant 전부에서 그렇다(같은 테스트가 variant 마다 센다).

---

## 7. 편집 · 실시간 · 이력 파이프라인

### 7.1 정방향 흐름

```
[클라] 속성 변경
   → 로컬 낙관적 적용 (즉시 화면 반영)
   → WS 전송 { pageId, baseSeq, ops[], clientOpId }
        ↓
[서버] 권한 확인(editor+) → 잠금 확인 → 적용 후 zod 검증
   → seq 부여 → revision insert (ops + inverse)
   → pages.schema / head_seq 갱신 → 룸 broadcast
        ↓
[본인] ack(seq) 수신 → pending 큐에서 제거
[타인] ops 수신 → 자기 pending 위에 리베이스 적용
```

서버 쪽 입구는 둘이다 — WS `patch` 프레임과 REST(`PATCH .../ops`). 검증·기록·브로드캐스트는
두 입구가 같은 절차를 공유한다(REST 의 ack 는 HTTP 응답이다).

`inverse`는 서버가 적용 직전 상태를 보고 생성한다. 클라이언트가 계산해 보내지 않는다 — 클라이언트 상태가 낙관적으로 앞서 있을 수 있기 때문이다.

**리베이스는 경로를 노드 id 로 다시 짓는다.** ops 의 경로는 자리(index) 경로라, 내 편집이 서버에 닿기 전에 남이 같은 배열 앞자리에 넣거나 빼면 같은 경로가 **다른 노드**를 가리킨다 — 그대로 얹으면 던지지 않고 남의 노드를 고치거나 지우고, 409 뒤 다시 내는 편집이 그 경로를 서버에 보낸다. 그래서 클라이언트는 편집을 큐에 넣을 때 그 경로가 지나는 노드의 id 를 적어 두고(넣을 자리는 부모 · 앞 형제들 · 뒤 형제들 — 가까운 것부터, 양옆이 함께 사라져도 살아 있는 형제 곁에 선다), 남의 ops 를 받으면 새 문서에서 그 id 의 자리로 경로를 다시 지어 얹는다. 다시 지은 ops 가 그 편집이 서버로 나가는 ops 다.

- 경로의 노드가 사라졌으면(남이 지웠다) 그 편집은 얹히지 않는다 — 버리고 알린다.
- 경로가 맞아도 뜻이 바뀌는 op 도 얹지 않는다: 만들 때 없던 키를 만드는 `add`인데 그 사이 남이 그 키를 만들었거나, `children` 배열을 통째로 바꾸는데 그 사이 자식 줄이 바뀌었으면 남의 것을 덮는다.
- **`zones` 맵이 없는 노드의 빈 구역에 첫 노드를 넣는 편집은 맵째 `add …/zones { <이름>: […] }` 다** — 맵 하나를 구역 여럿이 나눠 쓰므로, 남이 **다른 구역**의 첫 노드로 맵을 먼저 만들었으면 그 편집을 그 구역 키의 `add …/zones/<이름>` 로 좁혀 얹는다(같은 구역을 남이 먼저 만들었으면 위 줄대로 얹지 않는다). 그 편집의 되돌리기(`remove …/zones`)도 그 사이 남이 다른 구역을 더했으면 제 구역(`remove …/zones/<이름>`)만 지운다 — 제 구역의 자식이 만들 때와 같을 때만. 맵이 있을 때 낸 키 `add …/zones/<이름>`(그 구역의 첫 노드)도 같은 뜻으로 다루어, 그 사이 남이 맵을 지웠으면 맵째 `add …/zones { <이름>: […] }` 로 되살려 얹는다. 남이 그 구역을 만들었다 비워 빈 배열만 남았으면 내 첫 노드는 그 자리(`add …/zones/<이름>/0`)에 얹는다 — 남이 그 구역에 넣은 노드가 있으면 덮지 않으려고 얹지 않는다.
- 같은 필드 값을 남이 고쳤으면 내 값이 얹힌다(서버가 받는 순서대로 뒤의 것이 이긴다).
- **페이지를 서버에서 읽는 동안 온 그 페이지의 revision(남의 ops · 내 ack · 번호 응답)은 적어 두었다가 읽은 판 뒤에 번호 차례로 얹는다** — 판을 싣는 입구 전부다: 페이지 열기(떠났다 돌아오는 길 포함) · 재연결 · 복원 뒤 다시 읽기 · 편집 실패 수습. 읽은 판이 그 커밋 앞일 수 있고, 그 revision 은 이 탭에 다시 오지 않는다. 번호가 이어지지 않으면 얹지 않고 낡았다고 말한다. 적어 둔 것은 복원이 알려지거나 다른 페이지를 실으면 버린다 — 복원이 알려지기 전에 적은 것은 복원 앞 판의 것일 수 있다. 복원이 알려지기 전에 시작한 읽기의 판은 복원 앞일 수 있으므로, 실어도 «복원됐다»는 낡음을 그대로 둔다. **«복원됐다»는 복원이 바꾸는 것(메뉴 · 페이지 · 코멘트 · 설명 · 테마 선택)을 전부 다시 읽은 판만 거둔다** — 페이지만 읽는 조회(재연결 · 다른 페이지 열기 · 편집 실패 수습)로는 안 거두고, 다시 읽기를 시작한 뒤 새 복원이 알려졌으면 그 다시 읽기로도 안 거둔다. 다시 읽기를 시작한 **뒤에** 시작한 페이지 조회(다시 읽는 사이 다른 페이지로 옮긴 판)는 거둔다 — 나머지는 그 다시 읽기가 이미 읽기 시작했다. 내가 한 복원의 알림(연결 id 없이 나가 내 소켓이 되받은 것)은 복원 응답의 안전망 스냅샷 id 로 알아보고 넘긴다. 내 복원의 답을 잃으면(커밋 전에 거절됐는지 모른다 — 연결 실패 · 봉투 없는 5xx) 서버는 복원했을 수 있는데 그 알림은 내 연결로 안 오므로, «복원됐는지 모른다»는 같은 낡음을 세우고 같은 단추로 다시 읽게 한다 — 스스로 다시 읽지 않는다(그 읽기가 실패하면 판을 비우는데, 복원이 안 닿았으면 멀쩡한 화면을 지운다). 그 복원이 내 다시 읽기보다 늦게 커밋돼 알림이 뒤에 오면 «복원됐다»는 낡음을 다시 세운다.
- **답을 잃은 편집 · 게시의 COMMIT 이 확인 한도(1초)를 넘겨 늦게 커밋되면 서버는 번호 프레임이 아닌 `page-stale { pageId, seq? }`를 룸 전체에(낸 사람의 연결까지) 알린다.** `seq`는 그 쓰기가 남긴 revision 의 번호 **힌트**(번호를 모르는 게시는 없다)로 받는 쪽의 비교에만 쓴다 — 이미 `seq` 이상의 판을 든 화면은 경보를 안 세우고 번호를 얹지 않는다. 문서를 안 바꾼 쓰기(마지막이 아닌 코멘트 삭제 · 바꿀 것 없는 재번호)는 커밋돼도 신호가 없다. 그 revision 의 번호 프레임은 늦게 내지 않는다 — 머리가 더 나아갔으면 받는 쪽이 옛 번호를 «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다. 받는 화면은 열린 페이지(또는 여는 중인 페이지)의 신호면 «늦게 반영된 변경이 있다»는 낡음을 세우고 «다시 불러오기»로 **그 페이지만** 다시 읽는다(그 읽기가 실패하면 한 줄로 말하고 — 누가 썼는지는 말하지 않는다 — 낡음은 그대로 두어 다시 누를 수 있다). 거두는 것은 **신호 뒤에 시작한 조회가 판을 실은 때(서버 판과 같다고 본 조회도)**뿐이다 — 신호가 닿는 사이 시작한 조회는 그 커밋 앞을 읽었을 수 있다. 신호 앞의 판을 이미 읽은 화면은 `seq` 힌트로 가른다 — 힌트가 없는 신호(번호를 모르는 게시)에서는 경보를 한 번 세운다(대가는 다시 읽기 하나). 같은 낡음은 뒤따르는 갭 · 갈라짐이 덮지 않고 복원 낡음이 덮는다. **한도 안에 커밋이 확인됐는데 번호를 모르는 쓰기(게시 — 같은 키의 재전송이 번호 프레임을 더하는 쓰기)도 그 자리에서 같은 신호를 낸다** — 같은 키로 다시 보내지 않는 클라이언트의 게시가 남의 화면을 낡히지 않게. 웹의 재전송과 겹치면 낡음이 하나 남고 «다시 불러오기»가 같은 판을 읽어 푼다. **복원은 이 신호를 쓰지 않는다** — 답을 잃은 복원이 늦게 커밋되면 제때와 같은 알림(복원 알림 · 메뉴 트리 번호 · 지운 페이지의 잠금 놓기 · 테마 바인딩)을 그대로 늦게 낸다. 복원 알림은 번호를 안 실어 늦어도 이음이 안 틀어지고, 트리 · 테마 번호는 그 복원의 것이라 더 새 판을 든 화면은 넘긴다.
- **페이지를 떠나며 버린 편집은 전부 말한다.** 앞 편집의 답을 기다리는 동안 쌓인 편집은 서버에 가지 않았다 — 떠나는 순간 그 수를 말하고, 답을 기다리던 편집이 거절되거나 답을 못 받으면 둘을 합쳐 말한다. 그 답을 기다리는 동안 또 떠나면 그 떠남에서 버린 것도 합치고, 버린 것이 여러 페이지에 있으면 페이지 수를 싣는다. 떠난 페이지에 편집을 이어 보내지는 않는다(그 편집은 앞 편집의 결과 위에 지어졌고, 떠난 페이지의 남의 ops 는 이 탭이 얹지 않는다).
- **편집을 잃었다고 말하는 통지는 서로 덮지 않고 잇는다** — 통지 자리는 하나이고 잃음은 제 때에 온다(리베이스 버림 · 편집 실패 수습 · 판을 다시 싣는 읽기 · 떠남의 거절). 같은 틀의 문장은 수를 더하고, 반영됐는지 모름 · 저장되지 않음 · 되돌리기 이력 초기화 순으로 선다. 새 편집 · 되돌리기 · 닫는 단추가 이은 통지를 통째로 치운다 — 남겨 두면 방금 낸 편집도 실패한 것으로 읽힌다. 누른 뒤 답을 기다렸다가 서는 것(되짚기 이력을 받은 되돌리기 · 편집의 ack 까지 미룬 되돌리기 · 다시 실행 · 페이지 목록을 읽은 붙이기)은 기다리는 사이 선 잃음을 치우지 않는다 — 누른 때의 통지가 아니라 그 뒤에 온 잃음이고, 제 말은 그 뒤에 잇는다. 세션이 끊긴 통지는 잃음이 덮지 않는다. «화면에 남아 있는 편집은 저장되지 않았다»(수습이 판을 못 읽음)는 판이 다시 실리면 거둔다.
- **떠남의 통지는 페이지를 옮겨도 남는다** — 옮긴 뒤의 화면에 서는 것이 요점이다(판을 옮기면 이은 통지 가운데 떠남의 것만 남는다). 새 편집이 덮고, 그 통지가 가리키는 페이지를 다 다시 열면 풀리며, 닫는 단추로 닫는다(편집을 못 내는 화면 — 뷰 모드 · viewer — 에서는 새 편집이 덮을 일이 없다). 가리키는 페이지를 다시 연 뒤 그 페이지에서 또 편집을 버리고 떠났으면 그 다시 열기는 확인이 아니다 — 통지는 그 페이지를 다시 가리킨다.
- **로그아웃은 보낸 편집의 답을 받은 뒤에 나간다.** 칸에 친 채 누르면 그 클릭이 낸 편집과 로그아웃이 겨루고, 로그아웃이 먼저 세션을 지우면 편집은 거절되는데 화면이 내려가 말할 자리가 없다. 답이 한도(3초) 안에 안 오면 기다리지 않고 나간다 — 로그아웃은 권한을 줄이는 쓰기라 막지 않는다. 그때 답을 못 받은 편집(«모름») · 거절된 편집 · 못 보낸 편집(«저장되지 않았다»)의 수는 로그인 화면이 한 줄로 말한다 — 기다리는 동안 수습 · 다시 읽기가 버린 편집도 센다(그 화면은 셸째 내려가 아무도 못 봤다). «거절»은 큐에서 빠진 편집에만 선다 — 보내기가 거절됐어도 큐에 남은 편집은 번호를 기다린 뒤 다시 나가 커밋될 수 있어 «모름»이다. 그 탭에서만, 그 로그아웃이 연 세션 동안만 선다 — 같은 탭의 다음 사람은 로그인 전에 보고, 다음 세션이 끝난 뒤의 로그인 화면에는 없다. 기다리는 동안 세션이 끝났으면(다른 탭의 로그아웃 · 다른 사람으로 들어옴) 로그아웃 요청을 내지 않는다 — 쿠키는 이제 다른 세션의 것이라 내면 그 사람의 세션을 끊는다. 그때 두고 간 편집의 한 줄도 없다(그 세션을 끝낸 것은 이 탭이 아니다).
- 서버는 경로를 다시 짓지 않는다 — 받은 경로를 `baseSeq` 판에 그대로 적용한다(「에러 처리」의 `baseSeq` 불일치). 그래서 **번호가 곧 판본이어야 한다** — 한 페이지 id 에서 번호가 같으면 서버 문서도 같다(「테이블 정의」의 `head_seq` · 「스냅샷」의 복원). 클라이언트의 바탕이 같은 번호의 서버 판과 다르면(클라이언트가 얹은 것이 서버와 갈렸다) 이 장치가 막지 못하므로, 다시 붙을 때는 번호와 함께 문서도 견준다.

**코멘트 목록도 실시간이다.** 코멘트를 달고 · 고치고 · 지우는 쓰기는 커밋 뒤 그 페이지의 `comments-changed { pageId }` 를 룸에 알린다 — 본문은 싣지 않고, 낸 연결은 뺀다(낸 화면은 쓰기의 답 뒤에 스스로 다시 읽는다). 같은 멱등 키로 다시 보낸 게시(재생)는 낸 연결까지 알린다 — 앞 요청이 답을 잃었으면 그 신호는 아무 연결에도 안 갔다. 번호(`marker`)의 변화는 문서에 살아 `page-changed` 가 따로 나른다. 행을 안 바꾸는 재번호도 번호를 바꿨으면 이 신호를 낸다 — 다른 페이지의 코멘트 토큰(«상세 #2»)을 보이는 화면이 번호 색인을 다시 읽는다. 바꿀 것이 없는 재번호는 안 낸다. 받는 화면은 그 페이지의 목록이 열려 있으면(«코멘트» 탭 · «컴포넌트» 탭의 «코멘트» 묶음) 다시 읽는다 — 읽는 권한은 그 조회가 잰다. 늦게 커밋된 쓰기의 `page-stale` 과 다시 붙음(끊긴 동안의 신호는 사라졌다)에도 다시 읽는다. 신호가 몰아치면 200ms 창 하나에 조회 하나로 묶고, 겹친 조회는 늦게 낸 것의 답만 받는다 — 늦게 온 앞 답이 뒤 답이 세운 목록을 덮지 않는다. 다시 읽는 동안 앞 목록이 그대로 서고 «불러오는 중» 을 안 말한다 · 실패하면 앞 목록에 «목록을 다시 불러오지 못했습니다» 를 단다. 목록이 안 열린 화면은 신호를 버린다 — 목록은 열 때 읽는다.

**메뉴 트리도 실시간이다.** 메뉴 · 페이지 트리를 바꾸는 쓰기(메뉴의 만들기 · 이름 · 자리 · 삭제 · 연쇄 삭제, 페이지의 만들기 · 가져오기 · 제목 · 자리 · 삭제, 스냅샷 복원 — 페이지 설명만 바꾼 것은 아니다)는 커밋마다 프로젝트의 메뉴 트리 판 번호를 하나 올리고 그 번호를 룸 전체에 알린다(`menu-changed` — 낸 사람의 연결까지, 트리는 싣지 않는다). 트리 응답도 같은 번호를 실어, 번호와 트리를 한 시점에서 읽는다. COMMIT 의 답을 잃은 트리 쓰기는 «반영됐는지 알 수 없다»로 답하되, 서버가 새 연결로 커밋을 확인했으면 그때의 번호를 알린다(커밋 안 됐으면 «반영되지 않았다»로 답하고 알리지 않는다).

**공통코드 표도 실시간이다.** 표를 바꾸는 쓰기(그룹 · 항목의 만들기 · 이름 · 차례 · 사용 여부 · 지우기)는 커밋 뒤 룸에 `codes-changed { projectId }` 를 알린다 — 본문은 싣지 않고 낸 연결은 뺀다(낸 화면은 답 뒤에 스스로 다시 읽는다). 아무것도 안 바꾼 거절(404 · 409)은 안 알린다. 판 4 스냅샷 복원은 표를 덮은 뒤 낸 연결까지 알린다. 받는 에디터는 표를 다시 읽고 캔버스를 다시 그린다 — 남이 지운 항목에 묶인 노드는 끊김 표지로 바뀐다(옛 이름을 그대로 두지 않는다). 다시 붙음(끊긴 동안의 신호는 사라졌다)에도 다시 읽는다. 표를 못 읽으면 표 없이 그리고(묶인 노드는 대체 글 · 끊김 표지 없음 — 표를 모르는 것과 참조가 끊긴 것은 다르다) 하단 바에 한 줄로 알린다.

- 받는 화면은 제 트리의 번호보다 큰 신호면 트리를 다시 받는다. 받는 동안 온 신호는 합친다 — 떠 있는 조회가 끝나면 한 번 더 받는다. 같거나 작은 번호의 신호(내 쓰기의 답 뒤 다시 받기가 먼저 그 판을 받았다 · 신호가 거꾸로 닿았다)는 넘긴다. 겹친 조회의 답은 번호로 가른다 — 작은 번호의 답은 늦게 냈어도 버린다. 신호로 낸 조회가 실패하면 앞 트리를 그대로 둔다. 다시 붙으면 트리를 한 번 다시 받는다(끊긴 동안의 신호는 다시 오지 않는다).
- **남의 변경으로 받은 트리가 열린 것의 대상을 지우면** — 줄의 행동 메뉴는 그 줄과 함께 닫힌다. 이름 · 새 메뉴 · 새 페이지 입력은 닫고, 친 글이 있었으면 하단 바에 «그 항목이 트리에서 사라져 친 이름을 쓰지 않았습니다»를 세운다(열린 페이지가 함께 사라져 판이 비워져도 이 줄은 한 번 남는다). 연쇄 삭제 상자는 그 메뉴가 사라졌으면 닫고 하단 바에 그렇다고 말하고, 밑의 메뉴 · 페이지 id 집합이 바뀌었으면(늘든 줄든) 새 목록으로 다시 서서 «목록이 바뀌었습니다 — 다시 확인하세요.»를 띄우고 확정 단추가 «새 목록 확인»이 된다 — 첫 누름(클릭 · Enter)은 단추를 «모두 삭제»로 되돌리기만 하고 아무것도 안 지운다(그 누름의 더블클릭 둘째도 버린다). 목록이 또 바뀌면 다시 «새 목록 확인»이다. 바뀐 순간 단추에 손을 올린 채 누른 사람이 본 적 없는 목록을 지우지 않게 하는 것이고, 시간으로 가르지 않는다(이름만 바뀐 것은 같은 행이라 그대로다). 고른 줄(열린 페이지의 줄 포함)이 사라지면 화면의 보이는 차례에서 그 줄 다음으로 남은 줄(없으면 앞으로 남은 줄)을 고른다 — 키보드로 줄을 옮겨 다니던 사람이 트리의 다른 자리로 튀지 않게. 포커스가 그 줄에 있었으면 포커스도 그 줄로 옮긴다(포커스가 선 줄이 옮겨져 다시 그려져도 그 줄에 다시 선다 — 아니면 포커스가 문서 본문으로 떨어진다). 대상이 남았으면(옮겨졌다) 열린 것은 새 자리에 그대로 선다 — 입력은 친 글째 서고, 접힌 메뉴 안으로 들어갔으면 그 메뉴가 펴진다. **내 조작 · 복원 뒤의 다시 받기가 남의 지움을 함께 실었을 때도 고른 줄이 사라졌으면** 같은 이웃 줄로 옮긴다(없으면 고름을 풀어 주소의 페이지로) — 그 신호는 이미 받은 판이라 위 맞춤을 안 타므로 고른 줄만 따로 맞춘다. 열린 입력 · 상자는 그 조작이 스스로 맞춘다. **가져오기 상자는 대상 메뉴가 사라져도 닫지 않는다** — 연 순간의 메뉴로 보내고 서버의 거절을 상자 안에 보인다(고른 파일 · 글자 · 제목을 잃지 않는다).
- **열어 둔 페이지가 트리에서 빠지면** 캔버스가 그 페이지를 다시 묻고, 서버에도 없으면 판을 비우고(구조 트리 · 속성 패널도 그 노드를 내린다) «대상을 찾을 수 없습니다»를 그린다 — 다음 편집을 기다리지 않는다. 내가 지운 열린 페이지는 묻지 않는다(지운 조작이 프로젝트 뿌리로 옮긴다).
- 트리 조작이 404 를 받으면 트리를 다시 받는다 — 대상이 이미 없다는 것은 트리가 낡았다는 신호다.

### 7.2 소프트 잠금

- 노드를 선택하면 그 **서브트리**에 잠금을 건다 — 여럿을 고르면 고른 서브트리마다 하나다(§9 «선택 — 고르는 법»). 한 연결은 **한 페이지의 노드 집합**을 쥐고, `lock` 프레임 하나가 «이 연결의 잠금을 이 집합으로»를 나른다 — 프레임마다 집합의 노드 **전부**를 판정하고(이미 쥔 노드도 — 같은 집합을 다시 보내는 하트비트도), 빠지는 노드는 놓는다. 이미 쥔 노드를 다시 판정하는 것은 쥔 뒤에 문서가 바뀌기 때문이다 — 복원은 잠금을 안 보고 문서를 갈아 끼워 두 사람의 잠금을 조상/자손으로 만들 수 있고, 다시 판정하지 않으면 그 겹침이 둘 중 하나가 놓을 때까지 서로의 편집을 423 으로 막는다. 다시 판정하면 먼저 하트비트를 보낸 쪽이 겹친 노드를 거절받는다. 대가는 같은 페이지에 남의 잠금이 있는 동안 하트비트도 머리 문서를 읽는 것이다 — **다만 판정을 지난 그대로면 읽지 않는다**: 같은 집합이고 · 그 프로젝트의 살아 있는 잠금 목록이 안 바뀌었고 · 문서의 구조 번호(`pages.structure_seq`)가 그대로면 판정의 입력이 같으므로 만료만 미룬다(판정은 노드의 부모 사슬만 읽는다 — 내용만 고친 편집은 판정을 안 바꾼다). **판정은 문서를 한 번 돈다** — 판정은 동기이고 페이지 행을 쥔 채라, 노드마다 남의 잠금마다 문서를 훑으면 하트비트 한 번이 «고른 수 × 남의 잠금 수»로 늘어 그동안 서버 전체와 그 페이지의 편집이 선다(다시 재는 법: `apps/api/test/ws-lock-cost.test.ts`). 빈 집합은 다 놓는 것이다. 집합은 200 개까지다 — 편집 하나의 연산 상한과 같은 수(고른 것을 한 번에 지우는 묶음이 노드마다 연산 하나다).
- **서버는 획득을 판정한다** — 집합의 노드의 서브트리가 다른 사용자가 쥔 서브트리와 겹치면(한쪽이 다른 쪽의 조상이거나 같으면) **그 노드만** 받지 않고 요청한 연결에 그 노드들을 거절(`lock-denied`)로 답한다 — 나머지는 쥔다. 판정은 1차 방어(선택 차단)와 **같은 함수**다. 같은 사용자의 다른 탭은 막지 않고, 자기 집합 안의 조상과 자손도 견주지 않는다(잠금 소유자는 사람이다). 거절이 집합의 일부면 화면은 그 노드를 선택에서 빼고 «○○님이 편집 중이라 고를 수 없습니다»를 하단 바에 세운다(누구인지는 잠금 목록에서 읽는다 — 아직 모르면 «다른 사람이»). 전부면 선택을 **잡지 않은 채** 남기고 편집 입구는 남의 잠금으로 막힌다 — 자격을 보는 사이 멤버십이 바뀌었거나 서버가 끝내지 못한 획득도 프레임의 노드 전부를 거절하고 그 연결이 쥔 것을 다 놓는다. 배지가 아직 닿지 않은 창의 경합 · 재연결의 재알림도 이 판정을 지나므로 **겹친 잠금은 서지 않는다**. **편집 커밋과 잠금 획득은 페이지 행 하나에 줄 선다** — 편집은 그 행을 쥔 채 2차 방어를 판정하고 커밋하며, 획득도 모두 그 행을 쥔 채 판정한다 — 같은 페이지에 남의 잠금이 있어 문서를 봐야 하면 커밋된 문서로(편집이 트리를 옮기거나 노드를 더하는 사이의 획득도 겹치지 않는다). 그래서 판정을 지난 편집이 방금 선 남의 잠금 아래로 커밋되지도 않는다. 거절은 그 `lock` 프레임과 짝지어지고(화면이 매긴 차례를 되돌려준다), 서버가 오류로 판정을 끝내지 못한 획득도 거절로 답한다(답이 없으면 화면은 쥔 줄 안다). TTL 로 걷힌 잠금은 그 방에 알린다. 획득을 거절하지 않고 겹친 잠금을 «서로 막는 보수적 결과»로 받아들이면, 재연결 · 승격 뒤 첫 편집 · 보통 경합에서 잠금이 실제로 겹쳐 두 사람이 서로를 막는다.
- TTL 30초(집합째), 편집 중 하트비트(같은 집합을 다시 보냄)로 갱신, WS 연결 종료 시 집합 전부를 즉시 해제.
- 잠긴 노드마다 다른 사용자 화면에 "○○ 편집 중" 배지가 뜨고 선택이 차단된다(1차 방어) — 여럿을 고르는 몸짓(Cmd · Shift 클릭 · Cmd+A · 사각형)도 그 노드를 건너뛴다.
- 서버는 patch 수신 시 잠금 소유자를 재확인한다(2차 방어). 불일치면 423 `locked`(누가 잡고 있는지를 싣는다). **편집이 건드리는 자리는 연산마다 그 연산이 선 문서의 좌표로 잰다** — JSON Patch 의 포인터는 앞 연산을 적용한 뒤 문서의 좌표이고 `move` 의 `path` 는 `from` 을 뺀 뒤 좌표라, 잠긴 노드의 자리를 연산마다 따라가며 견준다(배열 번호는 적용이 읽는 대로). 화면이 편집을 미리 묻는 자리(끌어 놓기 · 컴포넌트 목록의 «넣기» 단추 · 되돌리기 · 다시 실행 · 붙이기 · 복제 · 여럿을 고른 판의 지우기 · 잘라내기 · 일괄 속성 · 고른 것이 바뀌어 내려가는 칸의 초안)도 같은 함수를 부른다 — 하나 고른 판의 지우기 · 순서 · 계층 · 속성 칸은 이 함수가 아니라 고른 노드의 잠금(선택 판정)으로 막는다. 적용이 실패하는 연산부터는 재지 않는다 — 그 앞에서(또는 그 연산 자신이) 잠긴 자리에 닿지 않았으면 묶음째 `patch-failed` 로 거절된다. 이 판정을 거치는 입구는 편집 셋(REST `PATCH …/ops` — MCP 의 `patch_page` 포함 · WS `patch` · `PUT …/schema`)이고, **거치지 않는 입구는 코멘트 번호 · 복원 · 가져오기**다 — 코멘트는 아래 줄, 복원은 프로젝트 전체를 되돌리는 owner 조작이라 대응하는 서브트리가 없고, 가져오기는 새 페이지라 잠금이 설 수 없다.
- **코멘트는 잠금 대상이 아니다.** 잠긴 서브트리 안의 노드에도 코멘트를 달 수 있고 그 번호(`marker`)가 문서에 써진다. 잠금은 같은 것을 동시에 고치는 것을 막는 장치이고, 번호는 속성·구조 편집과 부딪히지 않는다(잠금 소유자의 탭은 방송으로 받는다). 막으면 노드를 선택만 해 둬도 그 아래에 의견을 못 달고, 잠금을 걸지 않는 에이전트가 어긋난 점을 코멘트로 되돌려주는 길(원칙 3 · §7.4)도 막힌다.
- MVP는 서버 인메모리 저장소를 쓰되 인터페이스를 분리해, 다중 인스턴스 확장 시 Redis 구현으로 교체한다.

### 7.3 개인 undo/redo

클라이언트가 **자기 revision id 스택**을 보유한다.

- **undo**: 스택 최상단 revision의 `inverse`를 현재 문서에 적용 가능한지 검사한다. 경로는 「정방향 흐름」의 리베이스와 같이 노드 id 로 다시 짓는다 — `inverse`는 그 revision 의 문서에서 지은 자리 경로라, 그 사이 남이 같은 배열 앞자리에 넣었으면 옛 경로가 남의 노드를 가리킨다. 가능하면 새 patch로 전송하고, revision id를 redo 스택으로 옮긴다. 새로고침으로 재구성한 항목도 붙잡는다 — 지금 판에서 그 revision 뒤의 `inverse`를 최신 것부터 거꾸로 얹어 그 revision 의 문서를 짓고 거기서 노드 id 를 적는다. 그 사이에 남의 revision(코멘트 번호 · 토큰으로 낸 내 것 포함)이 끼어 있으면 그 구간의 이력을 누가 냈든 받아 함께 되짚는다(`GET .../revisions?beforeSeq=`) — 빠진 구간은 그 아래가 모두 찬 데까지 한 조회로 받는다. 받기 · 짓기 · 붙잡기는 **처음 되돌릴 때** 한다 — 페이지를 열 때 하면 되돌리기를 안 눌러도 문서 통째 교체 revision(문서 두 벌)이 낀 페이지마다 수 MB ~ 수백 MB 를 받고, 50 항목을 다 지으면 문서 크기 × op 수만큼 화면이 멈춘다. 되짚는 판은 목록을 실은 판이라 그 뒤에 판이 올라도 받을 구간은 늘지 않는다. 맨 위 세션 항목을 «적용 불가»로 건너뛴 누름이 그 아래 새로고침 항목에 닿아도 붙잡기 전에 받는다 — 건너뛴 것은 그 세션 항목뿐이고 함께 알린다. 되돌리기의 두 조회(목록 · 되짚기)는 `inverse`만 받는다 — `ops`는 되돌리기에 안 쓰이고, 문서 통째 교체 revision 이면 응답의 반이다. 받는 동안 되돌리기 · 다시 실행은 꺼지고(다시 실행이 맨 위를 바꾸면 그 누름이 버려진다), 그 사이 이 탭의 편집이 스택 맨 위에 올랐으면 그 누름은 되돌리지 않는다. 조회가 실패하면(답이 없으면 읽기의 시간 한도에서) 되돌리지 않고 알린다 — 항목은 남아 다시 누르면 다시 받는다. **문서를 못 지은 항목(한 누름에 받는 구간의 한도 밖에 번호가 남았다)은 경로 그대로 보내지 않는다** — 남의 노드를 고친다. 누를 때 «적용 불가»와 같이 건너뛰고 그 수를 말한다.
- **적용 불가**: 그 사이 다른 사람이 대상 노드를 지운 경우다. 에러가 아니라 정상 흐름으로 처리한다 — 스택에서 제거하고 "이미 변경되어 되돌릴 수 없습니다"를 안내한 뒤 다음 항목으로 넘어간다.
- **redo**: undo가 만든 revision의 `inverse`를 같은 방식으로 적용한다.
- **ack 전의 누름**: 스택은 편집이 ack 될 때 서버가 준 `inverse`로 쌓인다 — 내 편집의 ack 가 닿기 전에 누른 undo · redo 는 누른 때 큐의 마지막 편집의 ack 까지 미뤘다가 한 번 한다. 미룸은 스토어에 하나뿐이다 — 키 · 머리 단추 어느 쪽이든 미뤄 둔 것이 있으면 새 누름은 버린다. 누른 뒤에 낸 편집은 기다리지 않고 되돌리지도 않는다(그 ack 때 큐에 있으면 «되돌리기 전에 새 편집이 있어 되돌리지 않았습니다»). 미루지 않으면 맨 위가 그 편집이 아니라 앞 항목이라 엉뚱한 것(새로고침으로 채운 첫 편집이면 페이지 통째)을 되돌린다. ack 뒤 스택 맨 위가 바뀌지 않았거나(편집이 실패 · 버려짐) 판이 갈렸으면(떠남 · 다시 실림) 편집을 못 내는 화면이 되면(뷰 모드 · viewer) 하지 않는다 — 판이 갈린 판은 «화면이 바뀌어 이전 화면에서 미뤄 둔 되돌리기는 하지 않았습니다» 로 말한다. 3s 안에 ack 가 안 오면 «편집이 아직 서버에 닿지 않아 되돌리지 못했습니다»를 말하고 하지 않는다 — 서 있는 잃음 통지를 덮지 않고 잇는다. 그 뒤 ack 가 오면 그 문장만 거둔다. **미루는 사이 선 잃음 통지(리베이스가 가운데 편집을 버림 등)는 ack 로 나간 되돌리기 · 다시 실행도 치우지 않는다** — 누른 때의 통지가 아니라 그 뒤에 온 잃음이다. **되돌림이 아직 다시 실행 스택을 못 채운 동안(미루는 중이거나 큐에 나가 ack 전) 누른 다시 실행 키는 «되돌리는 중입니다 — 서버에 닿은 뒤에 다시 실행할 수 있습니다»를 말하고 아무것도 보내지 않는다**(머리 단추는 꺼져 있다).
- **새로고침**: 서버에서 내 actor의 최근 revision 50개를 받아 스택을 재구성한다. 페이지를 실은 번호까지의 것만 싣고, 그 뒤 이 탭이 이미 쌓은 항목 **아래에** 서버 번호 순으로 끼운다 — 목록이 오기 전에 이 탭에서 고친 편집을 덮지 않는다. 목록을 받는 동안 판을 다시 실었으면(재연결 · 복원 · 실패 수습) · 떠났으면 그 목록은 싣지 않는다 — 다시 싣는 길은 스택을 채우지 않는다. 같은 페이지를 다시 실어 실을 항목을 버렸으면 그렇다고 알린다(이미 다른 통지가 서 있으면 그것을 덮지 않는다). 바탕이 서버와 갈라진 판(받은 편집이 안 얹혔다)에서는 싣지 않는다 — 되짚기가 서버의 노드를 붙잡는다는 보증이 없다.

undo도 새 revision으로 append되므로 다른 사람 화면과 절대 어긋나지 않는다.

**편집 하나 = 되돌리기 하나.** 여럿을 고른 판의 삭제 · 복제 · 잘라내기 · 붙이기 · 일괄 속성은 연산 묶음 하나(revision 하나)라 되돌리기 한 번에 통째로 돌아오고 다시 실행도 통째다.

**문서 전체 교체(`PUT .../schema`)가 만든 revision도 같은 방식으로 되돌릴 수 있다** — 그 `inverse`는 `/root`뿐 아니라 `/version`도 담지만 편집 경로가 그것을 받아들인다. undo 스택에 되돌릴 수 없는 항목이 섞이지 않는다.

### 7.4 LLM 편집 경로

MCP의 `patch_page`는 WebSocket 대신 REST로 들어오지만, 그 뒤 파이프라인(검증 → revision → 브로드캐스트)은 완전히 같다. 에이전트가 고친 내용이 열려 있는 사람 화면에 즉시 나타나고, revision 에 `actor_type='mcp'`, `actor_label='<토큰명>'`으로 구분해 남는다(이력이 그것을 나른다). 실시간 방송 프레임은 누가 했는지를 싣지 않는다 — 룸의 viewer 까지 가는데 읽는 자리가 없고, 사람 이름은 접속자 목록이 이미 나르므로 실으면 새로 가는 것은 토큰 이름뿐이다.

에이전트는 노드 잠금을 걸지 않는다. 대신 patch에 `baseSeq`를 반드시 포함하며, 불일치 시 409를 받고 재조회 후 재시도한다.

---

## 8. 상호작용

### 8.1 모델

```jsonc
{
  "on": "click",              // click | change | select | submit
  "actions": [
    { "type": "setProp",    "target": "n_9c1e", "prop": "loading", "value": true },
    { "type": "setVisible", "target": "n_4a2b", "value": false },
    { "type": "switchTab",  "target": "n_1f8c" },          // 대상은 TabPanel — 그 패널의 부모 Tabs 를 그 패널로 연다
    { "type": "setViewState", "target": "s_detail" },      // 화면 상태 바꾸기 — 대상은 그 문서의 viewStates id 또는 "default"(기본)
    { "type": "navigate",   "target": "page:관리자/회원/상세" },
    { "type": "openModal",  "target": "page:관리자/회원/등록" },   // 팝업 열기 — 대상은 팝업 페이지
    { "type": "closeModal" }                                          // 팝업 닫기 — 대상이 없다 · 맨 위 팝업을 닫는다
  ]
}
```

액션 타입은 위 7종으로 고정한다. 스크립트나 표현식은 허용하지 않는다. 그래서 규칙을 정적으로 검증할 수 있고(타겟 존재 여부, prop 유효성), 자동으로 문장화할 수 있다. `setViewState` 의 대상은 노드가 아니라 **그 규칙이 든 문서**(페이지 · 팝업 페이지)의 화면 상태(§9 «화면 상태») id 이거나 `"default"` 다(상태 id 는 `default` 일 수 없어 겹치지 않는다). 목록에 없는 대상은 경고 `view-state-missing` 이다 — 노드 대상이 끊긴 것과 같은 무게라 상태를 지우는 편집이 막히지 않는다. 문장은 «화면이 ‘상세 열림’ 상태로 바뀝니다» · «화면이 기본 상태로 바뀝니다»(지운 상태는 «사라진 상태»)이고 상태 이름은 방향 제어를 가둔다.

### 8.2 자동 문장화

```
"① 검색 버튼 클릭 시 ② 그리드가 로딩 상태로 바뀝니다"
"③ 상세정보 탭 선택 시 ④ 기본정보 영역이 숨겨집니다"
```

우측 패널, HTML 번들, PPTX 모두 이 문장을 싣는다. 설계서 독자가 규칙 JSON을 볼 일이 없다. 노드에 별칭(§4.3)이 있으면 문장은 그 노드를 별칭으로 부른다(«① 머리 저장 클릭 시 ② 회원 목록이 숨겨집니다» — 번호는 그 앞에, 조사는 별칭의 끝 글자에 맞춘다).

### 8.3 실행

편집 모드에서는 상호작용이 동작하지 않는다(노드 선택이 우선). 뷰 모드 토글 시 `renderer`의 상호작용 런타임이 활성화되어 실제로 동작한다. 내보낸 HTML 번들은 항상 뷰 모드다.

**화면 상태 바꾸기.** 런타임은 상태를 들지 않고 `setViewState` 를 요청으로 낸다(`navigate` · `openModal` 처럼) — 받는 쪽이 그 문서의 지금 상태를 바꾸고, 바뀐 상태에서 숨은 노드는 그리지 않고 보이는 노드를 그린다. 뷰 모드에서는 셸의 상태 고름(§9 «화면 상태» 의 지금 상태)이 바뀌어 머리 전환기도 그 상태를 보이고, **뷰 모드를 나가면 그 페이지의 들어가기 전 고름으로 돌아간다**(시연은 어느 페이지의 편집 화면에도 남지 않는다 — 뷰 모드 동안 떠났다 돌아와 나가도 들어가기 전 고름이고, 뷰 모드에서 처음 연 페이지는 기본이다. 주소 `?state=` 도 돌아간 고름을 따른다). 번들에서는 뷰어의 상태 전환기 · 주소 해시(§11.3 «화면 상태가 있는 페이지»)가 따라간다 — 화면 모드(`#wb-screen`)에서는 전환기만 따라가고 해시를 안 덮는다(새로고침이 화면 모드로 다시 연다). 팝업 안의 `setViewState` 는 **그 팝업 겹의 상태**만 바꾼다 — 겹마다 제 상태(처음엔 기본)를 들고 닫으면 사라져 다시 열면 기본이며, 연 화면의 상태는 그대로다. 한 규칙의 액션은 차례로 돈다 — `setViewState` 뒤의 노드 액션은 같은 누름에서 돌아 겹layer 에 얹히고, 그 노드가 바뀐 상태에서 숨었어도 얹힌 값은 그 노드가 보일 때 쓰인다(대상 판정은 노드가 문서에 있는가이지 지금 보이는가가 아니다). 목록에 없는 대상은 저장 때와 같은 문장으로 알리고 화면은 그대로다. `setVisible` 은 상태가 숨긴 노드를 드러내지 못한다 — 두 장치의 우선순위를 섞지 않는다.

**팝업 — 덮개 층.** 뷰 모드와 HTML 번들에서 «팝업 열기»(`openModal`)는 대상 팝업 페이지의 문서를 **연 화면 위에 덮개 + 가운데 상자**로 쌓는다(`renderer` 의 `PopupLayer` — 캔버스와 번들이 같은 층을 그리고, 팝업 문서를 얻는 곳만 다르다: 에디터는 열 때마다 `GET …/pages/:id` 로 읽고 번들은 여는 페이지의 데이터에 실려 있다). 덮개는 누름을 막고 덮개 누름으로는 닫지 않는다. 상자는 폭 `min(크기, 창 − 2 × 여백)` · 높이 상한 안이고 넘치면 몸통 조각(`body`)만 구른다. 상자 뿌리는 `role="dialog"` · `aria-modal="true"` · 제목으로 이름이 서고(뷰는 `aria-modal` 을 안 단다 — 페이지로 연 판은 모달이 아니다), 포커스는 상자 안 첫 요소로 가 상자 안을 돌며, 닫으면 연 요소로 돌아온다. ✖(뷰의 `close` 조각) · Escape(한글 조합 중은 빼고) · «팝업 닫기»(`closeModal`)가 **맨 위 하나**를 닫는다. 팝업 안의 상호작용은 팝업마다 제 겹layer 에서 돌아 닫으면 사라지고 다시 열면 처음 판이다. 팝업 안에서 다시 열면 위에 쌓고 겹은 다섯까지다(넘으면 «팝업은 다섯 겹까지 엽니다»). 에디터는 같은 대상을 읽는 동안의 둘째 열기를 버린다(더블클릭이 한 겹이다 — 다른 대상 · 쌓인 뒤 다시 열기 · 닫은 뒤 열기는 그대로 연다). 대상 글자는 에디터 · 번들 · lint · 내보내기 미리보기가 한 열쇠로 푼다(`@wirebound/schema` 의 `pageTargetKey` — 접두 `page:` 를 벗기고 마디마다 앞뒤 공백을 걷는다 · `matchPageTargets` 의 규칙). 대상을 못 풀면(없음 · 둘 이상) 이동과 같은 문장이고, 대상이 **팝업 페이지가 아니면** 열지 않고 말한다(lint `modal-target-not-popup`). 열린 팝업 없이 «팝업 닫기» 를 누르면 «열린 팝업이 없습니다»(팝업 페이지를 바로 연 판이면 «— 이 팝업 페이지를 바로 열었습니다»). 덮개 위 상자에는 코멘트 번호를 세우지 않는다. 에디터 캔버스가 페이지로 연 팝업 페이지는 덮개 없이 팝업 레이아웃의 틀(§4.4 — 문서 폭의 흐린 막)에 상자를 가운데 위(여백 24px)에 제 크기로(문서보다 넓으면 문서 폭 − 2 × 24px) 그리고, 화면 모드(PPTX 캡처)는 줄이지 않고 제 크기로 찍는다.

---

## 9. 설계서 화면 구조

```
┌──────────────────────────────────────────────────────────────────────────┐
│◧ ◆ wirebound 관리자 콘솔 설계서 ↶ ↷ ⬚ [편집 모드|뷰 모드]┊ 1280▾ −100%+ ⟷ ◨…│
├───────────────┬┬────────────────────────────┬┬───────────────────────────┤
│ 메뉴·페이지  +││  목업 캔버스               ││ [속성|코멘트|상호작용]    │
│  회원관리  + …││  ┌──────────────────────┐  ││ DataGrid                  │
│   ├ 목록 ●  … ││  │ ① 검색폼             │  ││  선택 열  체크            │
│   ├ 상세      ││ ⠿│ ② 그리드  [②]        │  ││  고정 열 수  1            │
│   └ 등록      ││  └──────────────────────┘  ││  빈 상태 ☐                │
│  권한관리     ││                            ││ ─────────────             │
├───────────────┤├════════════════════════════┤│ 코멘트                    │
│ 구조 트리     ││ [구조]데이터 입력… 찾기___ ││ ① 검색폼 - ...            │
│  Page         ││ ┌──────┐┌──────┐┌──────┐ … ││ ② 그리드 - ...            │
│   ├ SearchForm││ │▒▒▒▒▒+││▒▒▒▒▒+││▒▒▒▒▒+│   ││ ─────────────             │
│   └ DataGrid●…││ │ 격자 ││ 배치 ││ 영역 │   ││ 상호작용                  │
│               ││ └──────┘└──────┘└──────┘   ││                           │
│               │├────────────────────────────┤│                           │
│               ││ 통지 …          [컴포넌트] ││                           │
└───────────────┴┴────────────────────────────┴┴───────────────────────────┘
```

그림의 기호는 아이콘 단추다(아래 «단추의 아이콘»). `◧` · `◨` 는 좌측 · 우측 접기 토글(아래 «에디터는 데스크톱 창을 전제하고»), `↶` · `↷` 는 되돌리기 · 다시 실행, `⬚` 는 배치 선 토글(아래 «배치 선»), `┊` 는 머리의 구분선, `1280▾` 는 뷰포트 폭 고르개, `−100%+` 는 줌(축소 · 배율 · 확대), `⟷` 는 화면 맞춤, `+` · `…` 는 트리 줄의 행동(편집할 수 있는 판에서 줄에 마우스 · 포커스가 있거나 고른 줄일 때 선다) · 컴포넌트 목록 카드의 `+` 는 «넣기» 단추, `││` 는 폭을 바꾸는 손잡이, `⠿` 는 고른 노드를 옮기는 캔버스 손잡이(세로 점 두 줄의 쥐는 자리 아이콘), `══` 는 하단 컴포넌트 목록의 높이를 바꾸는 손잡이다. 머리는 창 전체 폭, 하단 바는 캔버스 칸 아래(두 사이드바 사이)이고, 컴포넌트 목록은 펼치면 캔버스와 하단 바 사이에 선다(하단 바의 «컴포넌트»로 열고 접는다).

**단추의 아이콘.** 셸의 단추와 행동 메뉴 항목은 아이콘(lucide)을 쓰고, **같은 동작은 어디서나 같은 아이콘이다** — 추가는 `+`, 더 보기는 `…`, 지우기는 휴지통, 닫기는 `×`, 위로 · 아래로는 화살표처럼. 한 아이콘을 두 동작이 나눠 쓰지 않는다. 꼴은 셋이다.

- **아이콘만** — 트리 줄 · 트리 제목 줄의 `+` · `…`, 트리 제목 줄의 «모두 접기» · «모두 펴기», 머리의 `…` · 좌측 · 우측 접기(«좌측 패널 접기» · «좌측 패널 펴기» 처럼 하는 일이 이름이다) · 되돌리기 · 다시 실행 · «배치 선» · 축소 · 확대 · 화면 맞춤, 통지 · 대화 상자의 닫기, 컴포넌트 카드의 «넣기», 캔버스 손잡이, 속성 목록 항목의 «N번째 지우기» · 상호작용의 규칙 · 액션 지우기 · 코멘트의 지우기. **이름은 아이콘이 아니라 글이 든다** — 접근 이름과 마우스를 올렸을 때의 툴팁이 그 자리의 글 그대로다(«되돌리기» · «회원관리 더 보기» · «1번째 지우기» · «통지 닫기»). 지우기의 휴지통은 누르기 전 — 마우스를 올리거나 키보드 포커스가 오면 — 붉어진다(꺼진 단추는 안 붉어진다).
- **아이콘 + 글** — 행동 메뉴(트리 줄 · 트리 제목 줄 · 머리의 `…`)의 모든 항목(«삭제»는 붉은 글), 에디터 밖 화면 사이드바의 칸, 속성 목록의 «항목 추가» · 상호작용의 «상호작용 추가» · «규칙 N에 액션 추가», 하단 바의 «컴포넌트», 코멘트의 «코멘트 달기» · «문서 순서대로 재번호» · «수정», 가져오기 상자의 «JSON 직접 붙여 넣기»(접힘 · 펼침 꺾쇠).
- **글만** — 되돌릴 수 없는 일을 확정하는 단추(삭제 확인 · 복원 확인 · 토큰 폐기 확인 …)는 글과 위험 색 그대로다. 모드 · 탭 · 폼의 단추도 글이다.

줌 묶음이 아이콘만인 것은 머리가 한 줄로 서는 폭을 지키려는 것이다 — 머리가 한 줄에 드는 창 폭이 좁은 창의 접힘 문턱을 정한다(아래 «머리»). 다시 재는 법: `apps/web/build-test/editor-head-tools.test.ts`(머리 한 줄에 드는 최소 창 폭) · `icon-buttons.test.ts`(좁은 칸 · 머리 한 줄 · 휴지통의 위험 색).

**에디터는 데스크톱 창을 전제하고 좁은 창(폭 640px 이하)은 지원하지 않는다** — 좌측(최소 200px) · 우측 패널(최소 300px) · 손잡이와 여백(16px)이 펼쳐진 동안 캔버스 칸은 창 폭에서 두 폭과 16px 을 뺀 만큼이다(문서가 쓰는 폭은 안쪽 여백 48px 을 더 뺀 만큼). 창이 줄면 캔버스 몫(480px)을 남기려고 우측 · 좌측을 차례로 최소까지 조이고(아래 «두 사이드바의 폭»), 둘 다 최소인 창 996px 아래에서는 캔버스 칸이 그 몫 아래로 준다 — 창 900 · 836 · 700 에서 384 · 320 · 184px. **그 폭을 메우는 길은 머리 양 끝의 접기 토글이다** — 좌측을 접으면 좌측과 그 손잡이 · 여백(8px)이 격자에서 빠지고(창 900 · 700 에서 캔버스 592 · 392px), 우측을 접으면 우측이 같은 식으로 빠져 좌측이 창 − 8 − 480 까지 넓을 수 있고(창 700 에서 좌측 212 · 캔버스 480px), 둘 다 접으면 캔버스가 창 폭이다. 저절로 접지 않는다 — 창을 흔드는 것만으로 트리 · 패널이 사라지지 않게. 접힘은 폭과 함께 사람마다 그 브라우저에 기억하고, 접힌 쪽은 펴면 보던 그대로다(트리의 펼침 · 스크롤 · 패널의 탭 · 쓰던 글). 두 폭이 최소이고 펼쳐진 채 556px 아래에서는 캔버스 상자가 우측 패널과 겹치며, 516px 아래에서는 우측 패널이 창 밖으로 잘린다(문서에 가로 스크롤은 서지 않는다). 다시 재는 법: `apps/web/build-test/editor-narrow-canvas.test.ts` «좁은 창» 이 창 1440 · 1024 · 900 · 836 · 700 × 편집 · 뷰의 칸 폭(펼침 · 좌측 접음 · 우측 접음 · 둘 다)을 `[좁은 창 표]` 로그로 낸다.

**머리 — 어디에 있고 무엇을 하는가.** 한 줄이다. 왼쪽은 좌측 접기 토글 · 로고(아이콘 + «wirebound» — 프로젝트 목록으로 가는 링크, 접근 이름 «프로젝트 목록»)와 프로젝트 이름(`<h1>` — 제목은 «지금 여기»라 링크가 아니다), 가운데는 상태 전환기 `[기본 ▾]`(아래 «화면 상태» — 두 모드 · 모든 역할) · 되돌리기 · 다시 실행(편집 모드이고 editor 이상일 때만) · «배치 선»(편집 모드) · 모드(편집 / 뷰), 구분선, 그 뒤가 캔버스를 다루는 도구 — 뷰포트 폭 고르개와 줌(축소 / 배율 / 확대 / 화면 맞춤 — 배율 말고는 아이콘만의 단추)이고, 오른쪽 끝은 우측 접기 토글과 `…`(«더 보기»)다. 캔버스 도구는 두 모드 모두에 선다 — 보는 폭과 배율은 모드가 아니라 사람의 화면에 대한 값이다. 통지는 머리에 없다 — 하단 바에 있다. **좁은 창에서는 접는다** — 창 1099px 아래에서는 로고를 아이콘만 남기고(접근 이름은 그대로) «뷰포트 폭» 글을 눈에서만 감추고(고르개의 이름은 그대로), 965px 아래에서는 상태 전환기를 머리에서 빼 `…` 의 앞 항목(상태 목록)으로 접고, 878px 아래에서는 줌 묶음(과 구분선)도 `…` 의 맨 앞 항목(축소 · 확대 · 화면 맞춤)으로 접는다. 전환기를 줌보다 먼저 접는다 — 줌은 어느 페이지에서나 쓰고 전환기는 상태가 있는 페이지에서만 고를 것이 있다. 문턱은 편집 모드 · 프로젝트 이름 «관리자 콘솔 설계서» · 지금 상태 «기본» 에서 단계마다 머리가 한 줄에 드는 최소 창 폭(글 있음 1078 · 글 감춤 945 · 전환기 접음 858 · 줌 접음 687 — Chrome)에 여유를 얹은 값이라 창 1440 · 900 · 700 에서 머리가 한 줄이다. 긴 상태 이름은 전환기 안에서 줄임표로 줄어 머리 폭이 이름에 안 달린다. 문턱은 창 폭이라 이름이 긴 프로젝트에서는 머리가 두 줄로 줄을 바꾼다(창 밖으로 넘치지는 않는다). 다시 재는 법: `apps/web/build-test/editor-head-tools.test.ts` · 문턱은 `apps/web/src/shell/head-fold.ts`.

**`…` 메뉴.** 모든 역할에게 같은 여섯이 선다 — **계정 설정 · 공통코드 · 프로젝트 설정 · 스냅샷 · 프로젝트 내보내기 · 로그아웃.** 머리가 상태 전환기 · 줌 묶음을 접은 좁은 창(위 «머리»)에서는 그 앞에 축소 · 확대 · 화면 맞춤과 «화면 상태: <이름>» 항목들(하나를 고르는 항목 — 지금 상태가 켜짐 · 트리 차례로 들여 씀)이 선다. 메뉴 머리에 로그인한 사람의 이름을 보인다. 계정 설정 · 공통코드 · 프로젝트 설정은 주소가 있는 링크(`/account` · `/projects/:id/codes` · `/projects/:id/settings`)이고, 스냅샷 · 프로젝트 내보내기는 에디터 위 대화 상자를 연다. 역할로 항목을 감추지 않는다 — 스냅샷 목록 · 내보내기 · 설정(읽기 전용 칸)은 viewer 도 보고, 막는 것은 그 안의 생성 · 복원이다(「권한 모델」). 로그아웃은 보낸 편집의 답을 한도까지 기다린 뒤 나간다(「정방향 흐름」). 단추로 열고(클릭 · Enter · Space · ↓), 화살표 · Home · End 로 옮기고(꺼진 항목에도 선다 — 포커스가 서야 그 이유가 읽힌다. 꺼진 항목의 Enter · 누름은 아무것도 안 한다), Enter 로 고르고, Escape · 바깥 누름으로 닫는다 — 닫히면 포커스가 `…` 로 돌아온다. 바깥 누름은 캔버스 iframe 안의 누름도 센다. 포커스가 메뉴(단추 포함) 밖의 요소로 옮아도(캔버스 iframe · 단추에서 친 Tab) 닫힌다 — 열린 메뉴는 늘 포커스가 그 안이다. 목록 안의 빈 자리(머리 · 여백)를 눌러 포커스가 어디에도 안 선 것은 닫지 않는다. 항목을 포인터로 고른 뒤 같은 자리에 곧바로 오는 둘째 누름(더블클릭 간격 · 몇 px 안)은 삼킨다 — 메뉴가 닫힌 자리 밑의 단추가 그 누름을 받지 않게. **펼친 목록은 화면 맨 위 겹에 선다** — 행동 메뉴(머리 · 트리 줄 · 트리 제목 줄의 `…` · `+`) 모두 같다. 단추 아래로 열고, 창 아래가 모자라면 위 · 아래 가운데 넓은 쪽으로 열고(트리 맨 아래 줄은 위로), 창 밖으로 나가면 창 안으로 당긴다 — 트리 칸이 목록을 자르거나 캔버스 · 패널이 덮지 않고, 열 때 트리 칸이 굴러가지 않는다. 열린 동안 칸을 굴리거나 창 크기가 바뀌면 목록이 단추를 따라가고, 단추가 칸의 보이는 자리 밖으로 굴러가면 닫힌다(칸은 굴린 자리 그대로다). 목록 안의 키는 지금처럼 그 메뉴를 품은 트리의 키 처리에 닿고(메뉴 트리 안의 메뉴에서는 에디터 단축키가 안 선다) — 메뉴가 쥔 키(화살표 · Home · End · Escape · Enter · Delete · Backspace — 아래 «단축키»)는 그 트리의 단축키(메뉴 트리의 삭제 확인 · Alt+화살표)도 안 받는다 — Tab 은 `…` · `+` 다음 자리로, Shift+Tab 은 그 단추로 간다.

**대화 상자 — 스냅샷 · 프로젝트 내보내기 · 페이지 가져오기 · 메뉴 삭제.** 앱의 모달(`<dialog>` 의 `showModal`)이다. 스냅샷 · 프로젝트 내보내기는 머리의 `…` 가, 페이지 가져오기는 메뉴 줄 `+` 의 «JSON 에서 가져오기…»가, 메뉴 삭제(하위가 있는 메뉴)는 메뉴 줄 `…` 의 «삭제» · Delete 가 연다. 한 번에 하나만 선다. 제목과 닫기 단추가 있고, 포커스를 안에 가두고, Escape · 닫기 단추로 닫으며(한글 조합 중의 Escape 는 닫지 않는다), 닫히면 연 자리(`…` · 줄 `+`)로 포커스를 돌려준다(연 자리가 그 사이 사라졌으면 — 남이 대상 메뉴를 지움 · 내가 확인한 메뉴 삭제 — 메뉴 트리의 고른 줄로 간다). **상자 머리 · 배경막 · 파일 칸 밖에 놓은 파일을 브라우저가 열지 않는다**(Chrome 은 새 탭으로 연다 — 브라우저에 따라 현재 탭을 옮겨 에디터를 떠날 수 있다). **바깥(배경막) 누름으로는 닫지 않는다** — 스냅샷 폼에 친 글 · 고른 파일을 잃지 않게. 상자 안에서 친 키는 뒤 트리의 단축키(`Delete` 의 삭제 확인)에 닿지 않는다. 열린 동안 뒤 화면(트리 · 캔버스 · 하단 바)은 누름 · 키를 받지 않는다. 상자는 셸 안에서 그려져 셸이 내려가면 함께 내려가고, **복원을 보낸 뒤 상자를 닫아도 복원의 답은 셸이 받는다**(다시 읽기 · «복원됐다» 신호 가르기 — 「정방향 흐름」). 내려간 셸의 답은 버린다. 복원의 답을 잃었다는 문장은 상자를 닫고 하단 바의 «다시 불러오기»를 누르라고 말한다 — 상자가 열린 동안은 하단 바를 못 누른다.

**페이지 가져오기 상자.** 제목이 대상 메뉴를 말한다(«페이지 가져오기 — 회원관리 메뉴로»). 대상은 **연 순간의 메뉴**다 — 열린 동안 남이 그 메뉴를 지우면 서버의 거절이 말한다. 파일 칸(끌어 놓기 · 눌러 고르기 · 키보드로 닿음 — 파일을 끌고 들어오면 강조한다)과 «JSON 직접 붙여 넣기»(기본은 접힘)로 글자를 받고, 미리보기가 서버와 같은 게이트(봉투 · 문서 버전 · 카탈로그 — §11.2)로 읽은 것을 말한다 — 들어갈 페이지 제목 · 노드 수 · 코멘트 수, 막는 이유와 파일의 자리, 막지 않는 경고 수(펴면 자리), 사라진 노드가 될 코멘트 수, 쓰지 않는 `layoutRef`, 그리고 미리보기가 못 보는 것(대상 메뉴가 아직 있는지 · NUL · 본문 크기 · 권한). 제목 칸을 비우면 파일의 제목을 쓴다. 바닥은 [취소] [가져오기]다 — 보내는 동안 «가져오는 중…»으로 꺼지고 «취소»도 꺼진다(보낸 요청은 멈출 수 없다). 머리 «닫기» · Escape 는 보내는 동안에도 닫는다(답이 오래 걸려도 가두지 않는다). **서버가 거절하면 상자를 닫지 않고** 고른 파일 · 글자 · 제목을 둔 채 이유를 보인다(보낸 뒤 상자를 닫았으면 그 이유는 트리의 실패 줄에 선다). 성공하면 상자를 닫고 새 페이지로 옮기고, 가져온 결과(코멘트 수 · 사라진 노드가 된 수 · 쓰지 않은 레이아웃)를 하단 바에 남긴다 — 보낸 뒤 상자를 닫았으면 옮기지 않고 하단 바의 결과만 남긴다.

**좌측 상단 — 메뉴·페이지 트리.** 메뉴 폴더와 페이지를 한 트리에 표시한다. 한 메뉴 아래 여러 페이지를 둘 수 있어 "상황별 화면"이 자연스럽게 표현된다.

**좌측 하단 — 구조 트리.** 선택된 페이지의 컴포넌트 트리다. 노드 선택·삭제·이동을 여기서 한다 — 새 노드는 하단 판(«컴포넌트» · «모듈» 탭)에서 넣고, 캔버스에서는 손잡이로 옮긴다. 편집 모드에서만 보이며, 뷰 모드에서는 접혀 메뉴 트리가 전체를 쓴다. 두 트리 사이의 손잡이가 세로 배분을 바꾼다.

**트리 줄 접기.** 메뉴 트리는 페이지나 하위 메뉴를 품은 메뉴와 화면 상태를 품은 페이지마다, 구조 트리는 자식 줄이 있는 노드마다 줄 앞에 펼침 단추(▸ 접힘 · ▾ 펼침)가 서고, 두 트리의 제목 줄에 «모두 접기» · «모두 펴기»가 선다(구조 트리의 «모두 접기»는 뿌리를 편 채 둔다 — 맨 위 갈래가 보인다). 고르기와 같은 읽기라 뷰 모드 · viewer 에게도 선다.

- **접힘은 화면의 상태다** — 구조 트리는 페이지마다, 메뉴 트리는 프로젝트마다 세션 동안 기억하고(페이지를 옮겼다 돌아와도 · 뷰 모드에 다녀와도 그대로) 새로 고침 뒤에는 모두 편다. 서버 · 다른 기기에 안 간다.
- **접고 편 상태는 줄 단추의 `aria-expanded` 가 말한다** — 펼침 단추는 포인터 몫이라 접근성 트리에 안 서고 Tab 정지점도 아니다(줄 단추 다음 Tab 은 그 줄의 `+` · `…`, 그다음 줄 단추다). 키보드는 ← → 다 — 구조 트리는 에디터 단축키(아래 표), 메뉴 트리는 메뉴 줄에 포커스를 두고 ← 접기 · → 펴기. 구조 트리 줄 아래의 별칭 입력 안의 ← → 는 캐럿을 옮길 뿐 줄을 접거나 고른 노드를 옮기지 않는다.
- **메뉴 트리의 ↑ ↓ · Home · End** — 줄 단추 · 페이지 링크에 포커스를 두고 ↑ ↓ 를 치면 보이는 줄을 옮겨 다니고(접힌 메뉴 안은 건너뛰고 끝에서 멈춘다 · 누른 채의 반복도 받는다) Home · End 는 보이는 첫 · 끝 줄로 간다. 옮겨 간 줄을 고르고 포커스도 그 줄로 옮긴다. **포커스가 줄 단추 · 링크에 서면 그 줄이 고른 줄이다** — Tab 으로 다른 줄에 닿은 채 친 Delete 는 열린 페이지가 아니라 포커스가 선 줄의 삭제 확인을 건다(열린 페이지의 링크면 «주소가 말하는 것»을 고른 줄로 둔다). 페이지 줄로 옮기는 것은 고르는 것이지 여는 것이 아니다 — 여는 것은 그 링크의 Enter(누름과 같다)다. 줄의 `+` · `…` 에서 친 ↓ ↑ 는 그 메뉴를 연다. ← → · ↑ ↓ 는 고르기와 같은 읽기라 뷰 모드 · viewer 에게도 선다.
- **고른 것이 접힌 줄 안으로 들어가면 그 조상을 편다** — 캔버스에서 고름 · 붙여넣기 · 복제 · 화살표 · 사각형 · 되돌리기, 남의 편집이 고른 노드를 접힌 줄 안으로 옮긴 판까지(고른 노드의 조상 사슬이 바뀌면 편다). 메뉴 트리는 열린 페이지와 고른 줄을 그렇게 편다. 사람이 고른 노드의 조상을 직접 접은 판은 다시 펴지 않는다.
- **보이는 차례** — ↑ ↓ 와 Shift+클릭 범위는 접힌 줄 안을 건너뛴다. 고른 노드가 접힌 줄 안에 숨어 있으면 ↑ ↓ 는 그것을 가린 보이는 조상에서 움직이고, 숨은 기준 노드에서 시작하는 Shift 범위는 서지 않는다(누른 줄 하나를 고른다).

**구조 트리 줄 — `타입 (별칭) 요약`.** 줄은 타입 이름 + 별칭이 있으면 ` (별칭)` + 요약이다(«Flex (머리 줄) 가로» · «Button 저장» · «Section»). 별칭 · 요약이 있는 줄은 타입을 흐리게 · 요약을 진하게 그린다 — 사람이 지은 글이 먼저 읽힌다. 한 줄이고 넘치면 끝에서 줄임표로 자른다. 별칭 · 요약은 사람 글이라 방향을 격리한다(괄호는 격리 밖) — RTL 별칭이나 라벨 · 제목에 든 방향 제어 글자가 줄의 다른 조각을 뒤집지 않는다. **줄 단추의 접근 이름도 같은 글이고**, 줄 행동 `…` 의 이름은 그 글 뒤에 «더 보기»를 붙인다(구조 트리 줄에는 `+` 가 없다 — 아래 «트리의 줄 행동»). 요약은 같은 타입이 여럿일 때 어느 것인지 가르는 데까지만이고 규칙은 카탈로그 정의마다 하나다(`summary` — `packages/schema/src/component/catalog/*.ts`): Flex 가로 · 세로(줄바꿈이면 «· 줄바꿈») · Grid «N열» · Button · Link · Placeholder 라벨 · Field 라벨 · 컨트롤 종류 · Card · EntryForm 제목 · Text 내용 앞 20자 · Tabs 탭 이름 · DataGrid «체크 선택 · 고정 N» · 열 · 열 묶음 머리 이름 · 행 «합계 · 강조 · ×5»(생략 띠는 «생략») · 칸 «가로 N · 세로 N» · Pagination «총 N» · KeyValue «N쌍» · Media 종류 · 설명 · Divider 방향 · Tree «항목 N» · Page · Section · SearchForm 없음. MCP `get_page` 의 노드 `rowLabel` 이 같은 글이다.

**별칭 고치기.** «컴포넌트» 탭 머리 카드의 «별칭» 칸(하나 고른 판 · 어느 컴포넌트에나 — 칸을 떠나거나 Enter 로 커밋) · 구조 트리 줄의 더블클릭 · F2(구조 트리 · 캔버스 어디서나 — 아래 «단축키») · 줄 `…` «별칭 바꾸기». 트리 쪽 셋은 그 줄 아래에 입력을 열고(메뉴 트리의 «이름 변경»과 같은 꼴 — Enter 만 확정 · Escape · 다른 곳 누름은 취소, Enter · Escape 뒤 포커스는 줄로 돌아온다), 지금 별칭이 든 채 선다. 고침은 편집 하나(`add` · `replace` · `remove` `/…/alias`)라 되돌리기 · 실시간 방송 · 잠금 판정을 편집 길 그대로 탄다 — 남이 잡은 노드 · 여럿을 고른 판에서는 입력이 안 열리고 «별칭 바꾸기»가 꺼진다. 속성 패널의 별칭 칸은 61자째를 받지 않고 칸 밑 안내 «트리 · 코멘트에 보이는 이름, 60자까지» 로 말한다(빈 칸의 자리표로 두면 값처럼 읽힌다 · 칸은 UTF-16 단위로 세어 이모지 같은 글자는 둘로 센다 — 서버의 코드 포인트 한도보다 빡빡한 쪽이라 받은 글이 잘리는 일은 없다). 친 글은 봉투의 모양으로 다듬어 보낸다(줄을 바꾸는 글자를 공백으로 · 방향 제어 글자와 짝 없는 서로게이트를 빼기 · 앞뒤 공백 걷기 · 60자에서 자름). 비우거나 보이는 글자가 없으면 지운다. 트리 입력을 연 노드가 문서에서 빠지면(같은 사람의 다른 탭 · 에이전트 · 복원) 입력을 닫고, 친 글이 있었으면 하단 바에 «바뀐 선택 때문에 친 값을 쓰지 않았습니다» 한 줄을 세운다 — 같은 id 가 되살아나도(되돌리기 · 다른 탭) 입력이 다시 서지 않는다. 그 노드가 다른 부모로 옮겨지면 입력은 새 자리에 친 글째 선다.

**트리의 줄 행동 — `+` · `…`.** 두 트리에는 툴바가 없다. 편집할 수 있는 판(편집 모드이고 editor 이상)에서 줄에 마우스를 올리거나 · 그 줄을 고르거나 · 줄 안에 포커스가 오면 줄 오른쪽 끝에 `+` · `…` 가 선다(포커스가 줄에 있으면 Tab 이 둘에 닿는다). 뷰 모드 · viewer 에게는 없다 — 하나만 빼고: viewer 의 구조 트리 줄 `…` 에는 «모듈로 저장…» 한 항목이 선다(내 개인 모듈로 남기는 쓰기라 문서를 안 바꾼다 — 아래 «모듈로 저장…». 구조 트리는 뷰 모드에는 없다). 누르면 **먼저 그 줄을 고르고** 연다 — 명령은 고른 줄에 대해 돌고, 키보드 단축키도 같은 명령이다. 구조 트리에서 여럿을 고른 판은 기준 노드의 줄에서 열면 고른 것 그대로이고(«삭제»가 고른 것 전부를 지운다 · 위로 · 아래로 · 들여쓰기 · 내어쓰기는 «노드 하나를 골랐을 때만 됩니다»로 꺼진다), 다른 줄에서 열면 그 줄 하나로 고른다. 열린 채 그 줄이 고른 줄(구조 트리는 기준 노드)이 아니게 되거나 구조 트리의 고른 목록이 바뀌면(메뉴 안의 Cmd+V · Cmd+D 가 넣은 노드를 고름 · 캔버스의 ↓ · Cmd+A · 남의 편집 · 잠금 거절) 메뉴가 닫힌다 — 항목 · 켜고 끔 · 이유가 다 연 때의 선택의 것이라, 남기면 연 줄의 이름을 단 메뉴의 «삭제»가 다른 노드들을 지운다.

| 줄 | `+` | `…` |
|---|---|---|
| 메뉴 | 하위 메뉴 · 페이지 추가 · 팝업 페이지 추가 · JSON 에서 가져오기… | 이름 변경 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제 |
| 페이지 | — | 이름 변경 · 옮기기(소속 메뉴 고르기) · 위로 · 아래로 · JSON 내보내기 · 삭제 |
| 구조 노드 | — | 별칭 바꾸기 · 종류 바꾸기…(입력 조각 줄에만) · 한 행 떼어 내기 · 열 틀로 칸 짓기(그리드 행 줄에만) · 모듈로 저장…(뿌리 줄에는 없다) · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제 — viewer 는 모듈로 저장… 하나 |

- 판정이 지금 막은 항목은 끈 채 이유를 단다(뿌리 노드의 순서 · 계층 · 삭제는 «루트가 아닌 노드를 고르세요»). 그 줄의 **종류**가 결코 못 하는 항목은 뺀다 — 페이지의 들여쓰기 · 내어쓰기, 메뉴의 옮기기(메뉴의 부모는 끌어 놓기 · 들여쓰기 · 내어쓰기가 바꾼다). 꺼진 항목은 지금 막힌 까닭을 한 문장으로 `title` 과 `aria-description` 에 든다 — 마우스를 올리면 보인다. 그 까닭은 항목마다의 조건보다 먼저 서는 원인(남의 잠금 · 고른 것이 없음 · 고른 것이 문서 · 트리에 없음 · 여럿을 고름 · 메뉴 조작을 보내는 중)이 있으면 그것이다. 트리 아래에 늘 서는 이유 줄은 없다 — 키보드로는 꺼진 항목에 화살표로 서서 그 문장(설명)에 닿는다. 메뉴 밖에서 이유를 드는 꺼진 단추(빈 트리의 «최상위 메뉴» · 삭제 확인 · 제목 충돌의 덮기 · 버리기 · 연쇄 삭제의 «모두 삭제»)도 포커스는 받고 누름은 안 받는다.
- **그리드 행 줄의 두 항목**(편집 하나 · 되돌리기 한 번 — 부모를 안 바꾼다). «한 행 떼어 내기» 는 되풀이 n(≥ 2)인 행을 되풀이 1 인 그 행(원본 id · 번호 · 별칭을 지킨다) + 바로 뒤 되풀이 n − 1 사본으로 가르고, «열 틀로 칸 짓기» 는 칸 없는 행에 그 행 첫 줄이 지금 그린 꼴대로 잎 열마다 칸을 짓는다(셀 틀 → 그 사본 · 번호 열 → 그 줄의 번호 글 · 합계 행 · 빈 열 묶음 → 빈 칸 · 위 행 세로 칸이 덮은 열 → 안 짓는다 · 화면 상태에서 숨은 열도 받는다). 꺼지는 판: 떼기는 되풀이 1 · 생략 띠 · **바깥 노드의 상호작용이 그 행(이나 그 안)을 가리킬 때**(«이 행을 가리키는 상호작용이 있어 뗄 수 없습니다 — 떼면 첫 줄에만 닿습니다» — 뒤 행은 새 id 라 바깥 동작이 안 따라간다), 칸 짓기는 칸을 가진 행 · 생략 띠 · **«행» 구역의 첫 행**(«첫 행은 늘 기본입니다 — 기본 행은 첫 행과 같은 꼴로 그려집니다» — 속성 패널 «행 내용» 과 같은 판정) · **위 행의 세로 칸이 그 행의 줄마다 다르게 덮을 때**(«위 행의 세로 칸이 이 행의 첫 줄을 덮고 있어 칸을 지을 수 없습니다» — 제 칸은 줄마다 같은 칸이라 어느 칸 수로도 모든 줄을 지금 꼴로 못 그린다) · **셀 틀을 읽는 열을 남이 쥐었을 때**(그 사람의 이름). 남의 편집이 내 화면에 닿기 전에 누른 묶음은 베끼는 것을 전제로 묶는다 — 떼기는 그 행 통째, 칸 짓기는 그 그리드의 열 트리 통째. 그 사이 남이 그것의 무엇이든 고쳤으면(행의 별칭 · 행 꼴 · 보임 · 상호작용 · 제 칸 / 열 더함 · 지움 · 머리 이름 · 셀 틀) 묶음째 버리고 알린다(«… 편집 1개를 버렸습니다»).
- **팝업 페이지** — 메뉴 줄 `+` «팝업 페이지 추가» 는 «페이지 추가» 와 같은 이름 입력이고 뿌리 `Popup`(제목 = 이름 · 바닥 `[취소][저장]`)으로 만든다(`POST …/pages` 의 `kind: 'popup'`). 메뉴 트리의 팝업 페이지 줄은 이름 앞에 팝업 아이콘을 두고 접근 이름이 « — 팝업» 으로 끝난다 — 열린 페이지는 열린 문서의 뿌리에서, 다른 페이지는 트리 응답의 `kind` 에서 읽는다.
- 메뉴 트리 제목 줄에 뿌리 `+`(«최상위 메뉴 추가»)가 있다. **구조 트리에는 넣는 단추가 없다** — 노드를 넣는 것은 하단 판(«컴포넌트» · «모듈» 탭 — 아래 «하단 컴포넌트 목록»)의 «넣기»와 끌어 놓기 · 붙이기 · 복제다. 트리가 정하는 것은 넣을 자리다(고른 노드 · 아래 구역 줄).
- **구역 줄** — 이름 붙은 구역이 있는 노드는 자식 줄 위에 카탈로그 차례대로 구역마다 줄을 세운다. 몸통 하나뿐인 노드는 구역 줄이 없다. **빈 구역의 줄(«바닥 · 비어 있음»)은 그 노드를 볼 때만 선다** — 그 노드를 골랐을 때 · 그 구역을 넣을 자리로 골랐을 때 · 끄는 포인터가 그 노드 줄에 0.7s 머물렀을 때(접힌 줄을 펴는 것과 같은 머무름 · 끄는 줄 자신은 빼고 · 끌기가 끝나면 다시 접는다). 그 밖에는 노드 줄 끝의 칩 «빈 구역 N» 으로 접는다 — 카드 하나에 빈 구역 줄이 셋씩 노드 사이에 끼어 트리를 덮는다. 끌기를 시작할 때 전부 펴지 않는다 — 겨눈 줄 위에 줄이 서서 포인터 밑 줄이 밀린다(카드 둘 밑의 줄이 102px). 다시 재는 법: `apps/web/build-test/ui-structure-zones.test.ts`. 감춘 구역 줄에 포커스가 있었으면 그 노드 줄로 옮긴다. 구역 줄은 노드가 아니다 — 누르면 **넣을 자리가 그 구역이 된다**(노드 선택이 비어 잠금을 안 잡는다 · 고칠 수 없는 판(viewer)도 고른다). 하단 판의 «넣기» · 모듈 «넣기» · 붙이기가 그 구역 끝에 넣는다. 속성 패널은 «Card · 바닥» 처럼 부모 머리 · 구역 이름의 제목과 한 줄(«이 구역에 넣을 것을 하단 판에서 고르세요. 붙여넣기도 이 구역 끝에 들어갑니다.» — 고칠 수 없는 판은 «구역입니다. 이 화면에서는 넣을 수 없습니다.»)을 보인다. 줄 행동이 없고 Delete · 복사 · 복제는 아무것도 안 한다(고른 노드가 없다). 끄는 것을 구역 줄에 놓으면 그 구역 끝이다(띠는 «안» 하나). 노드를 고르거나 그 부모가 문서에서 사라지면(남의 편집 · 되돌리기) 고른 구역이 빈다. 화살표 고르기(↑ ↓ ← →)는 노드 줄만 지난다.
- 이름 입력 · 옮기기 목록은 그 줄 곁에 선다. 옮기기 목록 안의 Escape(고르는 칸 · «취소»)와 «취소» · 메뉴를 고른 뒤에는 포커스가 줄 `…` 로 돌아온다. 페이지와 하위가 없는 메뉴의 삭제는 두 번 누르기 확인이고(되돌리기가 없다), 확인은 «삭제» 항목이 있던 자리에 서지 않는다(줄 아래). **하위(메뉴 · 페이지)가 있는 메뉴의 삭제는 확인 상자다** — «"회원관리" 메뉴와 하위 메뉴 N개 · 페이지 M개가 함께 삭제됩니다», 페이지가 있으면 경고 아이콘 · 위험 색의 경고 상자에 «페이지 M개와 그 안의 설계가 모두 삭제됩니다»와 지워질 페이지 이름 앞 다섯 · «외 N개»(상자의 설명이 문장과 경고 상자를 함께 품는다), 지우기 직전 상태를 스냅샷으로 남긴다는 한 줄, 확정 단추 «모두 삭제»(글 + 위험 색). 상자가 보인 목록의 id(밑의 메뉴 · 페이지)를 서버에 싣는다 — 서버가 다시 읽은 id 집합이 다르면(그 사이 페이지 추가 · 메뉴 옮기기 — 수가 같아도) 아무것도 안 지우고 지금 목록을 돌려주고, 화면은 그 목록으로 상자를 다시 세우고 «목록이 바뀌었습니다 — 다시 확인하세요.» 한 줄을 띄운다(트리도 다시 받는다). 확정 단추는 남의 변경으로 목록이 바뀐 판과 같이 «새 목록 확인»으로 서고 첫 누름은 그것만 푼다(「정방향 흐름」의 «메뉴 트리도 실시간이다»). 이름만 바뀐 판은 같은 행이라 지운다. 열린 페이지가 지운 서브트리 안이면 프로젝트 루트로 옮긴다. 연쇄 삭제도 트리 쓰기라 남의 화면에 곧바로 닿는다(「정방향 흐름」의 «메뉴 트리도 실시간이다» — 지운 페이지를 연 사람의 캔버스는 «대상을 찾을 수 없습니다»로 간다). 구조 노드의 삭제(줄 `…` · 키보드)는 확인 없이 바로 지운다(되돌리기로 돌아온다).
- 구조 트리에서 남이 잡은 노드(「소프트 잠금」)는 고를 수 없으므로 그 줄에는 줄 행동도 끌기도 없다.
- **«모듈로 저장…»**(구조 노드 줄 `…`)은 고른 노드를 개인 모듈 · 프로젝트 모듈(§11.1)로 남기는 상자를 연다 — 여럿을 골랐으면 고른 것 전부(기준 노드의 줄에서 연다), 조상과 자손을 함께 골랐으면 조상만, 문서 차례다. 상자는 담을 노드 수와 뺄 상호작용 동작 수를 한 문장으로 말하고(«노드 N개를 모듈로 저장합니다. 모듈 밖을 가리키는 상호작용 동작 M개는 빼고 저장합니다.») «저장할 곳» 고르기(«개인 모듈» · «프로젝트 모듈» — 기본값은 남에게 안 보이는 개인 모듈, 프로젝트 쪽은 editor 이상일 때만 선다 · viewer 에게는 개인 하나)와 이름 칸(1 ~ 60자 · 앞뒤 공백을 뗀다)을 받는다. 저장하면 «개인 모듈 '이름'을(를) 저장했습니다. 하단 판의 «모듈» 탭에 섭니다.»(프로젝트면 «프로젝트 모듈 …»)를 정보 통지로 말한다. 담을 노드는 상자를 연 순간의 문서로 정한다. 저장은 문서를 바꾸지 않아 잠금 · 되돌리기와 무관하다 — 남이 잡은 노드도 담는다. 서버가 거절하면 그 문장을 상자 안에 세운다.

**끌어 놓기.** 줄을 끌어 다른 줄의 **위 · 아래(형제로)** 나 **위에 겹쳐(자식으로)** 놓는다. 자식을 받는 줄은 높이의 위 25% · 아래 25% 가 형제 자리이고 가운데가 안이며, 자식을 안 받는 줄은 반으로 갈라 앞 · 뒤만 있다. 놓을 자리는 가는 선(형제) · 줄 강조(자식)로 보인다. 구조 트리 줄에는 하단 컴포넌트 목록의 카드(새 노드)와 캔버스 손잡이(그 노드)도 놓는다 — 같은 띠 · 같은 판정이다. 트리 줄을 끌어 캔버스에 놓지는 않는다(캔버스에서 옮기는 길은 손잡이다). **끄는 포인터가 접힌 줄 위에 0.7s 머물면 그 줄을 편다**(줄 끌기 · 카드 · 손잡이 모두 — 포인터가 멈춰 있어도 편다 · 놓거나 취소하면 걷는다). 접힌 줄에 «안»으로 놓으면 그 안 끝이다.

- **놓을 수 있는지는 이동 판정과 같다** — 메뉴는 메뉴의 형제 · 안으로, 페이지는 메뉴 안으로(다른 메뉴로 옮기기 포함 — 메뉴 줄 위에 놓으면 띠와 무관하게 그 메뉴의 끝), 구조 노드는 카탈로그가 자식을 받는 컴포넌트 안 · 형제 자리로. 자기 · 자기 자손 안, 뿌리 노드의 앞뒤, 남이 잡은 노드 안, 부모가 자식을 안 받는 노드의 앞뒤(검증을 안 지나는 문서에서만 선다), 그리고 낼 편집이 남의 잠금과 부딪치는 자리는 안 된다(구조 트리는 편집 묶음을 «소프트 잠금»의 2차 방어와 같은 함수로 미리 묻는다). 제자리면 보낼 것이 없다. 못 놓는 자리에서는 표시를 안 세우고, 놓아도 아무 일도 없다.
- **놓으면 줄 행동이 보내는 것과 같은 편집을 보낸다** — 구조는 `move` 편집, 메뉴는 `PATCH {parentId, sortOrder}`, 페이지는 `PATCH {menuNodeId, sortOrder}`(부모가 같으면 `sortOrder` 만). `sortOrder` 는 **옮긴 뒤 그 부모 안 차례**다 — 서버는 부모가 바뀌면 새 형제 줄에 끼울 자리로, 같으면 결과 배열의 자리로 읽고 두 뜻이 같은 값이다. 되돌리기 · 실시간 방송 · 서버 거절 수습이 줄 행동과 같은 길을 탄다. 끌어 놓기만의 편집 종류는 없다.
- 끌기는 마우스 · 펜이면 4px 넘게 움직인 뒤에, 터치면 8px 안에서 0.3s 가만히 누른 뒤에 선다(그 아래는 클릭 — 고르기. 터치가 그 전에 8px 넘게 움직이면 판 스크롤이라 끌기가 아니다). 끈 뒤의 클릭 하나는 삼킨다(줄이 링크면 끌어 놓은 페이지가 열린다). Escape · `pointercancel` 은 취소다. 트리 끝 24px 안에 닿으면 저절로 스크롤한다 — 포인터가 트리 상자 안일 때만이다(상자 밖은 끝 너머가 아니다). 다른 곳에서 끌어 온 카드가 트리 끝 띠로 들어오면 0.3s 머문 뒤에야 민다(캔버스 칸과 같다).
- **메뉴 트리는 끄는 동안 남의 변경을 받아도 끄는 표시가 끝까지 남고, 놓는 순간의 판정은 새 트리로 한다**(「정방향 흐름」의 «메뉴 트리도 실시간이다»). 그래서 두 사람이 같은 부모를 번갈아 끌어도 둘째의 뜻이 선다.
- **트리는 보인 부모 안에만 놓는다** — 떼는 순간 뗀 좌표로 다시 물은 자리의 부모가 지금 보이는 자리의 부모와 같을 때만 놓는다(띠 · 차례는 안 견준다 — 놓는 자리는 뗀 좌표 밑의 지금 자리다). 끄는 사이 문서 · 잠금이 바뀌면 트리가 표시를 마지막 좌표로 다시 물어, 같은 부모의 줄이면 새 줄로 따라가고 다른 부모 · 못 놓는 자리면 걷는다(포인터가 멈춰 있어도). 부모가 다른 줄이 포인터 밑에 와 있으면 놓아도 아무 일도 없다. 같은 부모 안에서는 사람이 본 차례와 놓는 차례가 다를 수 있다 — 끄는 사이 남이 그 부모의 형제를 넣거나 빼면 놓는 자리는 뗀 좌표 밑의 지금 자리다. 메뉴 트리도 같다(부모만 견준다).
- **포인터 이벤트로 짓는다(HTML5 DnD 가 아니다)** — 끌기가 서면 누른 요소가 포인터를 붙잡아(`setPointerCapture`) 캔버스 iframe 위를 지나도 끊기지 않는다. 끌기를 시작한 포인터의 이벤트만 듣는다(마우스로 끄는 중 다른 손가락의 뗌이 끌기를 놓지 않는다). 장치는 무엇을 끄는지 모르는 부품이다 — 놓을 자리 판정과 놓았을 때 할 일은 부르는 쪽이 준다.
- **터치는 카드 · 트리 줄을 길게 눌러(0.3s · 8px 안) 끈다.** 길게 누르기 전의 움직임은 브라우저의 판 스크롤이다. 끌기가 서면 그 손가락의 스크롤을 막는다(`touchmove` 의 기본 동작 — 안 막으면 브라우저가 스크롤로 가져가며 `pointercancel` 을 보낸다). 작은 단추인 캔버스 손잡이는 `touch-action: none` 이라 길게 누르지 않고 곧바로 끈다.
- **끄는 동안 캔버스 iframe 은 포인터를 안 받는다**(누른 순간부터 끝날 때까지 `pointer-events: none`). 펜은 캡처가 iframe 경계를 못 넘어, 안 막으면 캔버스 위의 `pointermove` · `pointerup` 이 iframe 문서로 가 끌기가 안 끝난다. 놓을 자리는 좌표로 캔버스 문서를 직접 물어 판정하므로 영향이 없다.

**중앙 — 캔버스.** 문서는 same-origin iframe 안에 그린다 — 테마의 CSS가 셸에 새지 않고, 뷰포트 폭이 iframe 의 폭이라 테마의 미디어 쿼리가 그 폭을 본다. iframe 문서는 표준 모드라 내보낸 번들과 레이아웃 규칙이 같다(§6). 편집 모드에서 선택 아웃라인(고른 노드마다 — 기준 노드는 진하게)이 보이고, 두 모드에서 번호 마커 오버레이와 코멘트 링(«코멘트» 탭이 가리킨 노드 — 아래 «코멘트» 탭)이 보이며, 배치 선을 켜면 그것도 보인다(아래). 뷰 모드에는 고른 노드의 외곽선이 없다 — 코멘트 링만 선다. 캔버스에서도 노드를 클릭해 선택할 수 있다(여럿 고르기는 아래 «선택»). **속성 변경은 속성 패널에서 한다.** 구조 변경은 구조 트리(줄 행동 · 끌어 놓기)가 갖고, 캔버스에서는 **끌어 놓는 것 둘**만 한다 — 고른 노드를 손잡이로 옮기기와 하단 컴포넌트 목록의 카드를 끌어 넣기. 캔버스의 노드를 아무 데서나 눌러 끌지는 않는다(캔버스의 누름은 고르기 · 누르고 끌면 사각형 고르기다). 여러 노드를 한꺼번에 끌기 · 복사해 놓기는 없다. **문서는 페이지 레이아웃의 틀(§4.4 `LayoutFrame`)로 감싸 그린다** — 내비(GNB · LNB · 브레드크럼브)는 메뉴 트리 칸이 받은 트리로 짓고(트리가 아직 없거나 조회가 실패하면 «지금 페이지가 트리에 없는» 내비), 편집 모드는 내가 끈 영역(`GET …/view-prefs` 의 열쇠 가운데 그 레이아웃의 것 — 지금 테마가 선언한 끌 수 있는 영역에만)을 빼고, 뷰 모드는 다 켠다. **틀은 노드가 아니다** — 틀(`data-wb-layout` 안 · `data-wb-layout-content` 밖 — GNB · LNB · 브레드크럼브 · 제목 · 팝업의 막)을 누르면 고름이 그대로이고(바탕 누름과 다르다 — 링도 안 걷힌다), 틀 위는 끌어 놓을 자리가 없으며(미리보기 없음 · 놓아도 편집 없음), 틀에서 누르고 끌면 바탕에서와 같은 사각형이다. 외곽선 · 번호 마커 · 배치 선은 틀이 민 자리를 따른다. 틀의 링크는 편집 모드에서 아무 일도 안 하고 뷰 모드에서 그 페이지를 연다(메뉴 트리 칸의 링크와 같은 이동 — 모드는 그대로).

**배치 선.** 머리의 «배치 선»(아이콘 토글 · 누름 상태 `aria-pressed`)은 편집 모드에서만 서고, 켜면 캔버스의 Flex · Grid 노드마다 점선 테두리(Flex 주황 · Grid 보라)와 왼쪽 위 모서리 표시를 그린다 — Flex 는 늘어놓는 방향(→ · ↓ · ← · ↑), Grid 는 «N열». 방향과 열 수는 **그려진 배치로 읽는다**(놓을 자리의 축과 같은 함수 — 아래 «캔버스에 놓기» · Grid 는 그려진 칸 수). 테두리 안에는 같은 색의 옅은 점선으로 칸을 가른다 — Grid 는 열과 열 · 행과 행 사이, Flex 는 자식과 자식 사이(가로 배치는 세로선 · 세로 배치는 가로선)와 줄바꿈으로 선 줄과 줄 사이다. 이 선의 자리도 CSS 가 아니라 **그려진 자식 상자로 정한다** — 서로 겹치는 자식끼리 열 · 행 · 줄로 묶고(칸 안에서 가운데 정렬된 자식의 윗끝이 칸마다 달라도 한 행이다), 이웃 묶음 사이 간격의 가운데에 긋는다(간격이 없으면 경계). 선은 자식이 덮는 범위 안에만 긋고, 자식이 하나 · 없으면 안쪽 선이 없다. 미리보기 노드는 세지 않는다. 칸을 둘 이상 덮는 자식은 그 사이의 선을 지운다. 다시 재는 법 · 선이 이웃 자식 사이 가운데와 1px 안인지 · 자식 수에 비례하는 비용: `apps/web/build-test/layout-guides.test.ts`(`[안쪽 선]` · `[다시 잼]` 로그). 선은 선택 아웃라인 · 번호 마커와 같은 셸 겹 · 같은 측정이라 줌 · 칸 스크롤 · 뷰포트 폭 · 남의 편집 · 배치 미리보기를 따라가고, 캔버스 문서에는 아무것도 넣지 않는다(테마 CSS 와 안 섞인다). 배치 미리보기 노드에는 안 그린다. 켬 · 끔은 사람마다 그 브라우저에 기억하고(못 읽으면 끈 채 시작한다), 뷰 모드에서는 단추도 선도 없다.

**화면 상태 — 고르기 · 다루기 · 노드 보임.** 상태 트리 · 노드 보임의 모델은 「페이지 스키마 노드」의 «화면 상태»가 갖는다. 화면은 이렇다.

- **지금 상태** — 머리의 상태 전환기 `[<상태 이름> ▾]`(접근 이름 «화면 상태: <이름>»)로 **고르기만** 한다. 항목은 «기본»과 상태 트리(트리 차례 · 하위 상태는 깊이만큼 들여 씀 — 하나를 고르는 항목)다. 지금 상태는 사람 · 탭마다의 화면 값이다 — 서버에 안 가고 남의 화면을 안 바꾼다. 페이지를 옮기면(옮겼다 돌아와도) 기본이다. 고른 상태를 남이 지우면 기본으로 선다. 캔버스는 그 상태에서 숨은 노드를 그리지 않는다. 뷰 모드에서는 상호작용 «화면 상태 바꾸기»(§8.3)도 지금 상태를 바꾸고, 뷰 모드를 나가면 그 페이지의 들어가기 전 상태로 돌아간다.
- **메뉴 트리의 상태 줄 — 고르기만 한다** — 상태가 있는 페이지 줄은 접히는 줄이고 그 아래에 상태 줄이 트리 차례 · 깊이로 선다. 열린 페이지의 줄은 열린 문서(실시간 — 남이 더한 상태가 곧바로 선다)에서, 다른 페이지는 트리 응답(페이지마다 `viewStates` — 다른 페이지의 상태가 남에 의해 바뀐 것은 트리를 다시 읽을 때 따라온다)에서 짓는다. 상태 줄을 누르면 그 페이지를 열고 그 상태를 고른다 — 열린 페이지면 상태만 바꾸고(주소는 안 옮긴다), 다른 페이지면 `?state=<id>` 주소로 연다. 지금 고른 상태의 줄이 켜진다(`aria-current`). 상태 줄은 메뉴 트리의 메뉴 · 페이지 선택에 들지 않는다 — ↑ ↓ 는 상태 줄을 건너뛰고(Tab 으로 닿는다), 상태 줄에서 친 Delete 는 메뉴 · 페이지의 삭제 확인을 걸지 않는다. 상태 줄에는 `…` 가 없고 페이지 줄 `…` 에 «상태 추가»가 없다 — 상태를 다루는 입구는 우측 «페이지 정보» 탭 하나다.
- **상태 다루기 — «페이지 정보» 탭의 «상태»** — 탭이 열린 페이지의 상태 목록을 열린 문서에서 트리 차례 · 깊이로 그리고(실시간 — 남이 더하거나 고친 상태가 곧바로 선다) 설명은 이름 아래 글이다. 편집 모드이고 editor 이상이면(메뉴 트리의 줄 행동이 서는 판과 같은 값) 줄마다 `…` 에 하위 상태 추가 · 이름 바꾸기 · 설명 쓰기 · 위로 · 아래로 · 삭제가, 목록 아래 «상태 추가»가 선다 — 뷰 모드 · viewer 에게는 이름과 설명의 글뿐이다. 추가 · 이름 바꾸기는 그 줄 아래 이름 입력이고(Enter 만 확정 · Escape · 다른 곳 누름은 취소), 이름 규칙(1 ~ 30자 · 별칭과 같은 받지 않는 글자 · 겹침 · 20개 · 깊이 3)을 어기면 보내지 않고 입력 아래에 까닭을 말한다. 설명 쓰기는 여러 줄 상자이고 «상태 설명 저장»으로 보낸다(Escape · «취소»는 안 보낸다 · 그대로면 안 보낸다 · 비우면 칸을 지운다). 설명 초안은 상태마다 들어 탭 · 모드를 오가도 남는다 — 여러 상태의 상자를 함께 열 수 있고, 뷰 모드에는 상자가 없되 초안은 남는다. 쓰는 중 남이 그 상태를 지우면 목록 아래 ««이름» 상태가 지워졌습니다»와 친 글(골라 복사할 수 있다 · «버리기»)이 남는다. 저장은 연 때의 설명을 바탕으로 싣고(`test`), 그 사이 남이 같은 상태의 설명을 바꿨으면 덮지 않고 페이지 메타와 같은 충돌 화면(«다른 사람이 이 상태 설명을 바꿨습니다» · «내 글로 덮기» · «내 글 버리기»)을 세운다 — 남의 글이 화면에 와 있으면 보내기 전에, 아직 안 왔으면 서버가 묶음째 거절한 뒤에 선다. 열린 상자는 남의 새 설명을 보이지 않는다(친 글을 덮지 않는다). 더하면 그 상태를 고른다. 순서는 형제 안에서만 옮긴다. 편집마다 `/viewStates/…` JSON Patch 묶음 하나(되돌리기 한 번)이고, 목록은 노드가 아니라 남이 페이지 안 노드를 잡고 있어도 막히지 않는다.
- **상태 삭제는 확인 상자다** — 지울 상태와 하위 상태의 이름(«"로그인" 상태와 하위 상태 1개(관리자)를 지웁니다.»), 보임이 걸린 노드의 수(함께 지워지는 노드 · 모든 상태에서 보이게 되는 노드 · 남은 상태에서만 보임이 유지되는 노드)와 지워지는 노드 이름(앞 8개 · «외 N개»), 지우는 상태로 바꾸는 «화면 상태 바꾸기» 가 든 노드가 있으면 «상호작용 N곳이 끊깁니다»(삭제는 그 동작을 안 고친다 — 경고로 남는다 · §8.3), 되돌리기 한 줄. 상자가 보인 것과 보낼 묶음이 바꾸는 것을 **네 id 집합**(상태 · 지울 노드 · 걷을 보임 · 줄일 보임)으로 견준다 — 연 뒤 남이 그 상태에 보임을 걸거나 · 지울 노드를 바꾸거나 · 하위 상태를 더하면 새 집합으로 다시 서며 «목록이 바뀌었습니다 — 다시 확인하세요.»를 띄우고, 그 첫 누름은 «새 목록 확인»(아무것도 안 보낸다)이다. 지울 · 고칠 노드 안에 남이 잡은 노드가 있으면 «삭제»를 끄고 까닭을 달고, 남이 놓으면 다시 켜진다. 누른 뒤 서버에 닿기 전에 바뀐 판은 서버가 막는다(«편집이 목록 밖을 가리키는 보임» 422 · 잠금 423).
- **속성 패널 «상태 보임»** — «상태» 묶음의 끝 칸(뿌리에는 없다). 첫 줄은 버튼 꼴 라디오 `[비활성][숨김][표시]` 다 — 비활성은 보임 없음(기본값), 숨김은 `except`, 표시는 `only` 다(← → 로 옮겨 고른다). 숨김 · 표시일 때만 둘째 줄 `[기본][상태1][상태2]…` 가 선다 — 여럿을 켜는 토글 단추(`aria-pressed`)이고 «기본» 다음 트리 차례, 하위 상태는 이름 앞 `›` 를 깊이만큼 둔다(접근 이름에는 안 든다). «비활성»에서 다른 갈래로 옮기면 지금 상태 하나로 시작한다(기본이면 «기본»). 하나는 늘 켜 둔다 — 마지막 하나는 끈다(보임을 걷으려면 «비활성»). 문서에 적는 차례는 «기본» 다음 트리 차례다. 고칠 때마다 편집 하나다. 상태가 없는 페이지에서는 칸 대신 ««페이지 정보» 탭에서 상태를 더하세요» 한 줄, 지금 상태에서 숨은 노드를 고르면 «지금 상태에서 숨어 있어 캔버스에 그리지 않습니다» 한 줄이 선다.
- **상태를 고른 채 편집** — 노드는 하나다. 지금 상태가 무엇이든 편집은 그 노드를 고치고, 새로 넣은 노드(하단 판 · 모듈 · 붙여넣기)에 지금 상태가 저절로 붙지 않는다. 숨은 노드도 고르고 고친다(구조 트리 · 속성 패널로 — 캔버스에는 외곽선이 없다). 상태를 바꿔 고른 노드가 숨어도 고른 것은 그대로다.
- **구조 트리** — 모든 노드를 그린다. 지금 상태에서 숨은 노드는 흐리게 서고, 그 노드 자신의 보임으로 숨은 줄 아래에 «이 상태에서 숨김» 표지가 선다(조상이 숨어 함께 숨은 자손은 흐리기만 — 줄 단추의 설명 `aria-description` 에도 든다).
- **읽기 — 주소** — 주소 `?state=<id>` 가 상태 화면을 링크로 나눈다. 페이지를 열 때 한 번 읽어 그 상태를 고르고(두 모드 · 목록에 없는 id 는 기본), 뷰 모드와 viewer(모드와 상관없이 — 편집할 수 없어 늘 읽는 화면이다)에서는 고른 상태가 바뀌면 주소를 바꿔 쓴다(뒤로 가기가 밟지 않는 바꿔 쓰기 · 기본이면 질의를 걷는다). 편집하는 사람의 편집 모드는 주소를 안 고친다 — 그 모드에서 고른 상태는 뷰 모드로 오면 실린다. 뷰 모드를 나가는 때만 한 번 주소를 돌아간 고름으로 맞춘다(새로고침 · 복사한 주소가 나간 뒤의 화면을 연다). 뷰 모드 · viewer 도 머리 전환기와 메뉴 트리의 상태 줄로 고른다. 다시 재는 법: `apps/web/build-test/state-tree.test.ts` · 뷰 모드를 나간 뒤는 `apps/web/build-test/set-view-state.test.ts`.

**캔버스 손잡이 — 고른 노드 옮기기.** 편집 모드이고 editor 이상이며 노드 **하나**를 골랐고 그것이 뿌리가 아니고 남이 잡지 않았을 때 선택 외곽선의 왼쪽 위 바깥에 손잡이 `⠿`(접근 이름 «<타입 (별칭)> 옮기기» — 별칭이 없으면 «<타입> 옮기기»)가 선다. 셸 겹의 단추라 테마 CSS 가 덮지 못하고, 줌을 걷어 화면에서 늘 같은 크기다. 끌면 그 노드를 옮긴다 — 캔버스 위에도, 구조 트리 줄 위에도 놓을 수 있다. 누르기만 하면 아무 일도 없다(고른 노드 그대로). 남이 그 노드를 잡거나 · 뷰 모드로 바꾸거나 · viewer 로 내려가면 손잡이가 곧바로 걷히고 끌던 것은 놓아도 아무 일도 없다. 고른 노드의 왼쪽 위가 캔버스 칸 밖으로 밀리면 손잡이도 칸 밖이다. 키보드로 옮기는 길은 트리 줄 `…` 의 위로 · 아래로 · 들여쓰기 · 내어쓰기다.

**캔버스에 놓기 — 놓을 자리.** 끄는 포인터 밑 캔버스 문서에서 가장 가까운 노드의 **그려진 상자**를 띠로 나눈다 — 부모가 늘어놓는 축의 앞 25% 는 앞 형제, 뒤 25% 는 뒤 형제, 가운데는 안(자식을 받는 컴포넌트일 때만 — 아니면 앞 · 뒤 반씩). 자식이 없는 빈 컨테이너는 상자 전체가 «안»이다 — 칸 없는 그리드 행(기본 행)은 빼고 늘 앞 · 뒤 · 안의 세 띠다(행 안은 칸만 받아, 상자 전체가 «안» 이면 기본 행 곁에 행을 놓을 자리가 없다). 뿌리의 자식 사이 바탕(간격 · 여백)은 점에서 가장 가까운 뿌리 직계 자식의 앞 · 뒤다(띠는 그 자식의 앞 · 뒤 반쪽뿐 — «안»은 없다). 뿌리에 자식이 없으면 뿌리 자신이 **페이지 끝**(뿌리의 마지막 자식)이다. 문서 밖의 칸 바탕은 **문서 아래쪽만** 페이지 끝이다 — 캔버스 칸 안이고 문서 아래끝보다 밑이면(짧은 문서 밑의 바탕 · 끝까지 민 긴 문서 밑의 여백 · 문서의 가로 범위 밖이어도) 페이지 끝에 놓이고, 문서 옆 · 위의 바탕은 놓을 자리가 아니다(칸 안에서 놓다 마는 자리다). 캔버스 칸 밖으로 밀려난 문서 부분(칸 스크롤 · 줌으로 넘친 쪽)은 캔버스로 세지 않는다.

- **앞 · 뒤의 축은 부모가 지금 그린 배치로 읽는다** — 테마마다 뷰가 달라 카탈로그가 아니라 그려진 결과다. 부모가 `flex` 면 `flex-direction`(`row*` 가로 · `column*` 세로), `grid` 면 자식 둘이 같은 줄(세로로 겹침)에 서 있을 때 가로, 그 밖은 이 노드가 형제와 같은 줄에 서 있으면 가로, 아니면 세로다. `*-reverse` 는 보이는 앞 · 뒤를 문서 차례로 뒤집는다. `direction: rtl` 은 가로 축의 보이는 차례를 뒤집는다(`*-reverse` 와 겹치면 서로 지운다 · 세로 축은 무관하다). CSS `order` 로 바뀐 보이는 차례는 안 읽는다 — 보이는 왼쪽 · 위를 문서의 앞으로 센다.
- **놓을 수 있는지와 놓은 자리(부모 + 구역 + 차례)는 구조 트리와 같은 판정이다** — 대상 노드 + 띠를 같은 함수가 부모 + 구역 + 차례로 바꾸고, 못 놓는 자리(자기 · 자손 안 · 남이 잡은 노드 안 · 자식을 안 받는 컴포넌트 안 · 받는 타입 밖 · 설 자리 밖 · 낼 편집이 남의 잠금과 부딪침)도 같다. 못 놓는 자리에서는 표시를 안 세우고, 놓아도 아무 일도 없다. **받는 타입 · 설 자리 밖이면 포인터 곁에 까닭 한 줄이 선다**(«탭에는 탭 패널만 놓을 수 있습니다» · «탭 패널은 탭 안에만 놓을 수 있습니다» — 부모 · 구역 · 타입의 화면 이름으로 짓는다 · 트리 줄 위에서도 같다 · 끌기가 끝나면 걷힌다). 하단 판 «넣기» · 붙이기 · 모듈 넣기가 그 자리에 걸리면 같은 문장을 낸다. 들여쓰기 · 내어쓰기도 부모를 바꾸므로 같은 판정을 지난다 — 갈 자리(앞 형제의 몸통 끝 · 부모가 선 구역)가 그 노드를 안 받으면 줄 `…` 의 항목이 그 문장을 이유로 든 채 꺼지고, 단축키(Alt+Shift+← · →)는 편집 없이 그 문장을 정보 통지로 말한다.
- **구역** — 노드의 «안» 은 몸통이다(몸통이 없는 노드 — 목록 — 는 «안» 이 없어 앞 · 뒤만). 구역 안 형제의 앞 · 뒤는 그 형제가 선 구역 안이고, 축은 그 구역 요소(`data-wb-zone`)의 배치로 읽는다(검색폼 단추줄은 가로). 같은 노드의 다른 구역으로 끌면 옮기기 편집 하나다(그 구역 배열이 없으면 빈 배열 `add` 와 `move` 둘이 한 편집).
- **그리드 되풀이 줄의 사본 위는 놓을 자리가 아니다** — 사본(`data-wb-copy-of` — §6.1)은 원본의 그림이라 그 앞 · 뒤 · 안이 문서에 없는 자리(한 행의 되풀이 사이)다. 표시를 안 세우고 포인터 곁에 «되풀이된 줄에는 놓을 수 없습니다 — 첫 행의 칸에 놓으세요» 가 선다(놓아도 아무 일도 없다). 셀 틀에 놓을 자리는 첫 줄의 칸이다 — 첫 줄 틀 칸의 빈 자리(`data-wb-column-of`)는 그 열 셀 틀의 끝이고, 칸 안 조각 곁은 그 조각의 앞 · 뒤다.
- **빈 구역 칸 — 끄는 동안만 선다.** 빈 이름 붙은 구역은 화면에 아무것도 안 세우므로(뷰가 감싸는 요소째 안 그린다) 끄는 동안 끄는 것을 받을 수 있는 빈 구역마다 그 구역 자리에 점선 칸(구역 이름)이 선다 — 받는 타입 · 설 자리 밖이거나 옮기는 노드의 서브트리 안 구역에는 안 선다 · 숨은 노드(접힌 검색폼 · 지금 탭이 아닌 패널)의 구역은 안 보인다. 칸은 «안» 띠 하나(그 구역 끝)이고 놓거나 그만두면 걷힌다 — 끌지 않을 때의 캔버스는 내보낸 화면과 같다. 칸이 걷혀 문서가 줄어도 놓인 노드는 손 뗀 순간 미리보기가 섰던 화면 자리에 남는다(캔버스 칸을 그만큼 굴린다 — 문서 바닥에 붙어 굴릴 자리가 모자라면 그만큼은 못 지킨다) · 놓지 않고 끝나면 화면 위 끝에 걸친 노드가 제자리다. 칸은 스토어 문서로 정한다(미리보기가 그 구역에 서도 칸이 남는다 — 판정이 미리보기를 뺀 배치로 재므로 칸이 남아야 배치가 그대로다) · 끄는 사이 남이 그 구역을 채우면 칸이 걷히고 표시는 그 구역 안의 자리로 옮겨 간다(같은 부모 · 구역이라 버리지 않는다). 칸은 노드가 아니다 — 렌더러에 에디터가 넘긴 그림(`RenderOptions.emptyZones`)이고, 표지(`data-zone-slot` · `data-zone-slot-of`)는 노드 속성 어휘(`data-wb-*`) 밖이라 테마 셀렉터에 안 걸린다.
- **표시는 배치 미리보기다** — 놓을 자리가 서 있는 동안 캔버스 문서의 그 자리에 그 컴포넌트(옮기기면 그 노드 서브트리의 사본)를 테마로 그려 반투명으로 실제로 끼운다. 옆 노드가 밀리고, 옮기는 원본은 제자리에 흐리게 남는다. 스토어 · 서버 · 되돌리기 · 실시간 방송 · 구조 트리 · 속성 패널은 미리보기를 모른다 — 캔버스가 지금 문서에 미리보기를 끼운 사본을 그릴 뿐이라 남이 문서를 바꾸면 새 문서 위에 다시 선다. 미리보기 노드는 선택 외곽선 · 번호 마커 · 손잡이 · 판정에 노드로 잡히지 않고(문서 id 의 꼴 밖의 id 를 단다), 외곽선 · 마커는 밀린 자리를 따르다 놓거나 취소하면 제자리로 온다. 못 놓는 자리에서는 미리보기도 없다. 테마가 자식 일부를 숨겨(활성 탭 밖의 패널 · 접힌 묶음) 미리보기가 숨은 자리에 서면(상자 0 × 0) 미리보기가 들어갈 부모를 셸의 강조색 테두리(안쪽 2px)로 둘러 «이 안으로 들어간다» 를 보인다. 끌기가 트리 줄 위에 있으면 트리 줄에는 선 · 강조가, 캔버스에는 같은 자리의 미리보기가 선다.
- **판정(띠)은 미리보기를 뺀 배치로 잰다**(되풀이 행 미리보기의 사본 줄도 뺀다) — 미리보기가 밀어낸 배치로 다시 물으면 자리가 옮고 옮은 미리보기가 다시 배치를 바꾸는 떨림이 생긴다. 미리보기를 뺀 배치로 재면 미리보기가 판정을 되먹이지 않아, 포인터가 멈춰 있으면 미리보기가 움직이지 않는다. 미리보기는 늘 포인터 밑 노드 곁(그 안 끝 · 그 뒤 — 노드가 안 밀린다, 그 앞 — 미리보기가 그 노드의 자리에 선다)에 선다.
- 줌 · 칸 스크롤을 반영한다. 캔버스 칸의 위 · 아래 · 왼 · 오른 끝 24px 에 닿으면 칸이 그쪽으로 저절로 스크롤한다(두 축을 따로 본다 — 모서리는 둘 다 · 포인터가 칸 안일 때만 — 칸 아래의 하단 판 위에서 머뭇거려도 칸은 안 밀리고, 판에서 캔버스로 올라가는 길은 끝 띠에 0.3s 머물 때만 민다 — 밖에서 끝 띠로 들어온 끌기는 머문 뒤에야 밀고 띠를 지나가기만 하면 안 민다. 끌기를 시작한 상자(트리 줄 · 캔버스 손잡이)와 그 안의 띠 아닌 곳에 섰던 상자의 띠는 곧바로 민다). 가로는 칸보다 넓은 문서(넓은 프리셋 · 큰 줌)의 화면 밖 쪽에 놓는 길이다. 민 뒤에는 멈춘 포인터 밑을 다시 물어 표시를 고친다 — 끝까지 밀려 포인터 밑이 칸의 여백(문서 밖)이면 표시가 걷힌다.

**캔버스로 끄는 끌기는 보인 자리에만 놓는다**(손잡이 · 컴포넌트 목록 카드 — 트리 위에 놓을 때도). 끄는 사이 남의 편집 · 늦은 글꼴로 놓을 자리가 바뀔 수 있다. 아래의 «표시»는 캔버스의 배치 미리보기와 트리 줄의 선 · 강조다.

- 남이 보인 대상을 잡거나 지우거나 보인 자리를 다른 부모 · 못 놓는 자리로 바꾸면 표시를 곧바로 걷는다 — 포인터가 멈춰 있어도. 보인 형제 자리의 차례만 밀리면(같은 부모) 표시는 새 자리로 옮겨 간다. 걷힌 뒤 포인터가 그 자리에서 4px 밖으로 움직여야 새 자리가 선다.
- 캔버스가 선택 외곽선 · 마커를 다시 잴 때(문서가 바뀜 — 남이 위 노드의 글을 늘려 노드가 밀린 판 포함 · 줌 · 폭 · 캔버스 문서의 크기가 바뀜) 마지막 좌표로 다시 물어, 같은 부모 안의 자리면 새 상자 · 새 차례로 다시 그리고 **다른 부모면 표시를 걷는다** — 멈춘 포인터 밑에서 표시가 다른 상자 안으로 뛰어 곧바로 뗀 판이 안 본 부모로 가지 않게.
- 떼는 순간 뗀 좌표로 다시 물은 자리가 보이던 자리와 같을 때만 놓는다(구조 트리와 같은 견줌 — 부모만) · 놓기 직전 지금 문서로 그 자리를 한 번 더 판정해 안 서면 아무것도 안 한다. **문서가 바뀌었다는 것만으로는 버리지 않는다** — 남이 다른 데를 고치거나 내 앞 편집이 리베이스돼도 보인 자리가 그대로면 놓인다.
- 끄는 중 페이지가 바뀌거나 캔버스 iframe 이 새로 서면 그 끌기는 아무것도 안 놓는다.

놓으면 옮기기는 `move` 편집, 넣기는 카드의 «넣기» 단추와 같은 함수(`apps/web/src/edit/create-node.ts` 의 `createNode`)로 지은 새 노드(카탈로그 기본 props · 새 id — 프리셋 카드면 그 템플릿)의 `add` 편집 하나를 보낸다 — 줄 행동과 같은 편집 전송 길(되돌리기 · 실시간 방송 · 409 리베이스 · 423 통지)이고 끌어 놓기만의 편집 종류는 없다. 넣은 새 노드는 고른 노드가 된다.

**고른 노드를 펼쳐 보인다.** 고른 노드(구역 줄이면 그 부모)가 지금 탭이 아닌 패널 · 접힌 검색폼 안이면 편집 모드 캔버스가 **그 화면에서만** 그 탭을 연 판 · 검색폼을 편 판으로 그린다. 구역 줄은 그 부모 자신이 그 구역을 가리면(접힌 검색폼의 구역 줄) 그 부모도 편 판이다 — 고른 노드의 외곽선 · 손잡이가 선다. 문서(`active` · `collapsed`) · 남의 화면 · 내보내기 · 뷰 모드는 그대로다(문서를 바꾸는 편집이 아니다). 무엇을 덮을지는 카탈로그의 `reveal`(§5.1 — `Tabs` · `SearchForm`)이 정하고 렌더러가 덮는다(`RenderOptions.reveal`). 다른 노드를 고르면 문서 그대로의 판으로 돌아온다. «코멘트» 탭에서 묶음을 고른 노드도 같은 장치로 펼친다 — 두 모드 다 · 그 사람의 화면에서만이다(아래 «코멘트» 탭).

**페이지를 안 고른 캔버스**는 문서 프레임(프리셋 폭 · 줌) 대신 캔버스 칸 가운데에 빈 상태를 그린다 — 그림 · «왼쪽 트리에서 페이지를 고르세요» · «메뉴 아래의 페이지를 누르면 여기에 그려집니다»(셸 글꼴). 다시 재는 법: `apps/web/build-test/v4-settings-ui.test.ts` «빈 캔버스».

뷰포트 폭 프리셋(1920 / 1440 / 1280 / 1024 / 768 / 375)과 줌(5% ~ 200%, «화면 맞춤»)을 제공한다. 폭을 바꾸면 테마가 정의한 브레이크포인트 스타일이 적용된다. 페이지 스키마 자체에는 반응형 분기가 없으므로, 이는 **편집이 아니라 확인**이다. 줌으로 줄이거나 키운 문서는 그 폭 · 높이만큼만 캔버스 칸을 차지한다 — 줌이 1 보다 작아도 칸 아래에 빈 세로 스크롤이 없다. «화면 맞춤»은 프리셋 폭을 칸에 맞춘 줌이고 그 뒤 가로 스크롤이 없다 — 줌 하한 5% 는 두 사이드바가 최소인 창 700 의 칸(쓰는 폭 136px)에 1920 을 맞추는 배율(7.1%) 아래다(상한 200% 는 좁은 프리셋을 넓은 칸에 맞출 때 걸리고, 그때도 넘치지 않는다). 축소 · 확대 단추는 25% 눈금을 한 칸씩 옮기고 **축소는 25% 에서 멈춘다** — 그 아래는 «화면 맞춤»만 간다. 맞춘 배율(눈금 밖)에서는 가까운 눈금으로 붙는다 — 63% 에서 축소는 50%, 확대는 75%(25% 아래면 확대는 25%). **페이지를 열면 폭 맞춤으로 연다** — 프리셋이 캔버스 칸보다 넓으면 칸 폭에 맞춘 배율, 좁으면 100%(`min(1, 칸 ÷ 프리셋)` — 좁은 문서를 키우는 것은 «화면 맞춤» 의 몫이다). 사람이 배율을 고르기 전까지는 칸 폭(창 · 좌우 접기 · 폭 손잡이)과 프리셋이 바뀔 때마다 다시 맞추고, 축소 · 확대 · «화면 맞춤» 을 누르면 그 페이지에서 그 배율로 남는다 — **손으로 고른 배율을 창 · 칸 크기가 바뀌었다고 빼앗지 않는다.** 다른 페이지를 열면 다시 폭 맞춤이다(같은 페이지를 다시 싣는 재조회는 아니다). 폭 맞춤이 배율을 줄여 둔 동안 배율 글이 주색이고(`title` · 줌 묶음의 설명 «폭 맞춤» — 머리 폭이 접힘 문턱을 정해 글을 더하지 않는다), 접힌 머리의 `…` 배율 줄은 «배율 63% · 폭 맞춤» 처럼 말한다. 칸은 세로 스크롤바 자리를 늘 둔다 — 서고 빠지며 칸 폭을 흔들면 맞춘 배율이 오간다. 다시 재는 법: `apps/web/build-test/ui-zoom-fit.test.ts` · `editor-narrow-canvas.test.ts` «화면 맞춤» · «줌 하한» · «빈 세로 스크롤».

**하단 바 — 통지와 «컴포넌트».** 캔버스 칸 아래 한 줄이다(좌 · 우 사이드바 사이, 캔버스와 같은 폭). 왼쪽은 통지 — 편집 실패 · 경고 · 남의 변경(복원 포함) · 테마를 못 실음 · 권한이 바뀜 · 페이지 JSON 의 가져온 결과 · 세션 전환 · 로그아웃 실패 — 이고, 오른쪽은 하단 판을 열고 접는 토글이다 — 넣을 수 있는 판(편집 모드이고 editor 이상)이면 «컴포넌트», 아니면(뷰 모드 · viewer) «모듈»(판이 «모듈» 탭 하나라서다 — 아래 «하단 판의 탭»). 캔버스 도구(뷰포트 폭 · 줌)는 머리에 있다(위 «머리»). 높이는 40px 아래로 줄지 않는다 — 통지가 없는 바도 같은 높이라 모드를 바꿔도 캔버스 칸이 튀지 않는다. 통지가 여럿이면 바가 위로 자라고 캔버스가 그만큼 준다 — 잘라 숨기지 않는다(통지 무리에 `max-height` 를 걸지 않는다). 하단 컴포넌트 판이 바닥(120)까지 줄어도 바가 창에 안 들어가는 칸(창 높이 400 이하 · 통지 여덟)에서만 **바 자체가 세로로 스크롤**되고(셸 · 캔버스 · 판은 안 넘친다), 새 통지(실패 통지 `role="alert"` 우선)는 보이는 자리로 스크롤된다. 바가 창에 들어가는 칸에는 스크롤이 없다. 다시 재는 법: `apps/web/build-test/n36-notice-floor.test.ts` · `n1-layout.test.ts`. **정보 통지는 실패 통지와 자리가 갈린 한 칸이다**(`role="status"`) — 일이 실패한 것이 아니라 알아 두면 좋은 한 줄(붙이며 뺀 동작 수 · 못 붙인 봉투의 까닭 · 키가 아무것도 안 한 까닭 · 고른 것이 숨어 빠진 까닭 · 연쇄 삭제 뒤 안전망 스냅샷)이 거기 선다. 한 칸이라 새 정보 통지가 앞의 것을 바꿔 끼우고(쌓이지 않는다), 새 편집 · 되돌리기 · 다시 실행 · 고른 것의 바뀜 · 페이지 옮김이 치운다 — 닫기 단추는 없다(연쇄 삭제의 한 줄만 열린 페이지가 함께 지워져 판이 비워져도 한 번 남는다). 통지 칸이 읽을 폭(320px)을 못 받으면 토글이 통지 아래 줄의 오른쪽 끝으로 내려간다 — 도구가 제 폭을 지키고 통지가 남은 폭만 받으면 통지 한 줄이 한두 낱말이 되어 바가 캔버스를 먹는다. 통지가 없으면 한 줄이다. 페이지 JSON 의 두 통지는 저절로 걷히지 않는다 — 고아가 된 코멘트는 되돌릴 수 없어 읽기 전에 사라지면 안 된다. 그 통지의 «닫기» · 다음 가져오기(내보내기)를 보낼 때 · 에디터를 떠날 때 걷힌다. 페이지를 옮기거나 모드를 바꿔도 남는다.

**하단 컴포넌트 목록 — 열고 접기 · 높이.** 하단 바의 «컴포넌트»(`aria-expanded`)를 누르면 캔버스와 하단 바 사이(셸 그리드의 한 줄)에 판(«컴포넌트 목록» 영역)이 서고, 다시 누르면 접힌다. 판을 열면 캔버스 칸이 판 높이만큼 준다. 판 위쪽 손잡이로 높이를 바꾼다 — 끌기(위로 끌면 커진다) · 화살표 · Home/End · 두 번 눌러 기본값. 높이는 기본 340px · 최소 220px 이고(기본은 카드 한 줄과 둘째 줄의 머리가, 최소는 카드 한 줄의 대부분이 보이는 높이), 최대는 캔버스와 판이 나눠 쓰는 세로(좌측 사이드바 높이에서 하단 바와 칸 사이 여백을 뺀 잰 값)에서 캔버스 몫(240px)을 뺀 만큼이다(최소보다 작아지지는 않는다). 통지로 하단 바가 자라거나 머리가 접히면 최대가 그만큼 줄어 판이 조여지고 캔버스 몫이 남는다 — 기억한 높이는 그대로라 통지가 걷히면 판이 돌아온다. 조여진 동안 손잡이를 만져도 키우는 쪽(위로 끌기 · ↑ · End)은 기억한 높이를 줄이지 않고, 줄이는 쪽(아래로 끌기 · ↓ · Home)은 그린 높이에서 움직여 그 높이를 기억한다. 하단 바가 창의 대부분을 먹어 최대가 최소로 주저앉는 판에서는 캔버스가 그 몫 아래로 주고, 그래도 모자라면(낮은 창에 통지가 여럿) 셸이 세로로 넘쳐 하단 바 아래가 창 밖으로 잘린다. 높이와 열림은 두 사이드바의 폭과 같은 자리에 사람마다 그 브라우저에 기억하고, 읽을 수 없는 값은 기본값으로 읽는다(`apps/web/src/shell/sidebar-layout.ts` 「하단 판의 높이」). **판과 토글은 늘 선다** — 넣을 수 있는 판(편집 모드이고 editor 이상)이 아니면(뷰 모드 · viewer) 판은 «모듈 목록»(손잡이 «모듈 목록 높이» · 토글 «모듈»)이고 «모듈» 탭 하나다(아래 «하단 판의 탭»). 열림 · 높이는 두 판이 같은 것을 쓴다. 판은 페이지를 옮겨도 그대로 있다.

**하단 판의 탭 — «컴포넌트» · «모듈».** 판의 맨 위 줄은 «목록 종류» 탭 둘이다 — «컴포넌트»(아래 «카드» — 갈래 탭 · 검색 · 카드)와 «모듈». 여는 단추는 하단 바의 토글 하나다. 마지막에 고른 탭은 사람마다 그 브라우저에 기억하고(저장소를 읽거나 쓰지 못하면 «컴포넌트»로 선다 · 탭은 그래도 바뀐다), 검색 칸은 탭마다 따로다(«컴포넌트 찾기» · «모듈 찾기»). 넣기를 거절한 문장은 탭을 바꾸면 걷힌다. **넣을 수 없는 판(뷰 모드 · viewer)은 «모듈» 탭 하나다** — «컴포넌트» 는 문서를 바꾸는 입구뿐이라 없고, 기억한 탭은 읽지도 쓰지도 않는다(편집 모드로 돌아오면 기억한 탭으로 선다). **«모듈» 탭은 묶음 둘이다** — 차례대로 «개인 모듈»(§11.1 — 내가 저장한 것 · 내가 여는 모든 프로젝트에 선다 · 최근 것 먼저) · «프로젝트 모듈»(§11.1 — 이 프로젝트에서 사람이 저장한 것 · 최근 것 먼저). 개인 모듈이 없으면 «구조 트리에서 노드를 골라 '모듈로 저장'에서 '개인 모듈'을 고르면 여기에 섭니다», 프로젝트 모듈이 없으면 «구조 트리에서 노드를 골라 '모듈로 저장'하면 여기에 섭니다» 한 줄이 선다. 검색은 두 묶음을 함께 거른다. 카드는 이름 · «노드 N개» · 오른쪽 위의 아이콘 단추 줄이다:

| 단추(접근 이름 «<이름> …») | 개인 모듈 | 프로젝트 모듈 |
|---|---|---|
| «넣기» · 카드 끌기 | 넣을 수 있는 판 | 넣을 수 있는 판 |
| «이름 바꾸기»(카드 안의 칸 — Enter 확정 · Escape 취소) · «삭제»(카드 안의 «삭제 확인» · «취소») | 늘(내 것) | editor 이상(모드와 무관) |
| «프로젝트 모듈로 복사» | editor 이상(모드와 무관) | — |
| «개인 모듈로 복사» | — | 늘(viewer 포함) |

넣기는 컴포넌트 카드와 같다 — «넣기»는 «고른 노드 뒤에» 자리(연달아 넣으면 방금 넣은 묶음의 기준 노드 뒤), 카드를 끌면 트리 줄 · 캔버스의 놓은 자리(같은 띠 · 같은 판정 · 캔버스에 묶음을 미리 그린다). 넣은 노드 전부를 고른다. 넣을 수 없는 판에는 넣는 길(단추 · 끌기 · 키)이 없다 — 넣는 사이(모듈을 다시 읽는 사이) 뷰 모드 · 강등으로 넣을 수 없게 되면 보내지 않는다. 목록은 탭을 열 때와 저장 · 이름 · 삭제 · 복사 뒤에 다시 읽는다.

**하단 컴포넌트 목록 — 카드.** 판의 위 줄은 갈래 탭(카탈로그의 갈래 — 구조 · 데이터 · 입력 · 액션 · 문서)과 이름 검색 칸이고, 아래는 고른 갈래의 카드다. **카드는 정해진 크기(264 × 200 — 축소판 창 264 × 176 + 이름 줄)이고 판 폭에 맞춰 여러 줄로 감싸이며, 넘치면 판이 세로로 스크롤한다** — 판을 키우면 카드가 커지지 않고 줄이 더 보인다(창 1440 × 900 의 최대 판에서 두 줄). 판이 카드보다 좁으면 카드 폭이 판에 맞게 준다. 카드는 페이지에 둘 수 있는 타입이다(카탈로그를 훑어 검증을 지나는 것 — 손으로 둔 목록이 아니다) · 갈래 안은 한국어 이름 차례. 타입의 프리셋(§5.1 «프리셋»)은 그 타입 카드 바로 뒤에 제 이름의 카드로 선다(«그리드» 다음 «반복 행 표») — 넣기 · 끌기 · 판정은 타입 카드와 같고 넣는 내용만 템플릿이다. 카드 · 축소판 창의 열쇠(`data-wb-palette-card` · `data-wb-palette-window`)는 타입 카드가 타입 이름, 프리셋 카드가 `<타입>:<프리셋 키>` 다. 검색어가 있으면 갈래를 가리지 않고 한국어 이름 · 영문 타입에 그 글이 든 카드만 선다(대소문자 무시 · 둘 다 NFC 로 맞춰 견준다). 맞는 것이 없으면 «맞는 컴포넌트가 없습니다». 카드는 축소판 · 한국어 이름 · 오른쪽 위의 «넣기» 단추(`+` 아이콘 — 접근 이름 · 툴팁 «<한국어 이름> 넣기»)다. 올리면 영문 타입과 설명이 툴팁으로 선다. 탭 줄과 카드 줄은 각각 Tab 정지점 하나이고(카드 줄의 정지점은 «넣기» 단추) 화살표 · Home/End 가 그 안을 옮긴다.

- **축소판** — 카드마다 그 컴포넌트의 갤러리 표본(없는 타입은 카탈로그 기본 props 로 지은 노드 하나 · 프리셋 카드는 그 카드가 넣는 노드)을 **프로젝트 테마**(캔버스와 같은 시트 차례 · 테마 정의 · 토큰)로 그려 줄여 보인다. **판 하나에 iframe 하나다** — 카드 판 뒤에 카드 판과 같은 크기로 깔아 함께 스크롤하고, 표본마다 그린 상자를 재서 카드 창에 맞춰 줄이고 상자 밖은 자른다. 남이 테마 · 토큰을 저장하면 따라가고, 테마 번들을 못 실으면 캔버스처럼 SDK 기본 뷰로 그린다. 축소판은 그림이다 — 안의 단추 · 입력은 누름 · 포커스를 받지 않고(`inert`) 누름은 위의 카드 몸통이 받는다.
- **카드 몸통 — 끌기 · 더블클릭 넣기.** 누르기만 하고 떼면(끌기 문턱 4px 안) 아무것도 안 한다(넣지도 고르지도 않는다). **더블클릭은 «넣기» 단추와 같은 넣기를 한 번 한다**(같은 자리 판정 · 연달아 넣기). 몸통에 닿은 누름 둘(같은 카드 · 500ms · 8px 안)을 짝짓는다 — 끌기를 마친 자리에서 곧바로 누른 한 번은 OS 가 더블클릭으로 세도 넣지 않고, 카드 안 단추 · 입력의 누름은 세지 않는다(«넣기» 단추 더블클릭은 단추가 하나만 넣는다). 모듈 카드도 같다(넣을 수 있는 판에서만).
- **«넣기» 단추 · Enter — «고른 노드 뒤에» 넣기.** 고른 것이 없거나 뿌리면 페이지 끝, 구조 트리의 구역 줄이면 그 구역 끝, 자식을 받는 컴포넌트면 그 안(몸통) 끝, 잎 · 몸통이 없는 노드(목록)면 그 뒤(같은 부모의 그 노드가 선 구역)에 넣고 넣은 노드를 고른다. **연달아 넣으면 방금 넣은 노드 뒤다** — 넣기 단추 · 끌어 놓기가 넣어 고른 노드를 그대로 고른 채 다시 넣으면 그 노드가 자식을 받아도 바로 뒤(형제)에 선다(검색 폼을 골라 필드를 셋 넣으면 폼 몸통에 필드 셋). 사람이 무엇이든 고르면(방금 넣은 그 노드를 다시 눌러도) 연달아가 끝나 위 규칙이다 — 방금 넣은 필드 안에 넣으려면 그 필드를 한 번 누른다. 고른 것이 바뀌거나 사라지면(되돌리기 · 남의 지움) · 다른 페이지를 열어도 끝난다. 그 뒤가 넣을 것을 안 받으면(받는 타입 · 설 자리) 위 규칙으로 물러서고, 잠금은 잎의 뒤와 같다. **그 안이 넣을 것을 안 받으면(받는 타입 · 설 자리) 그 뒤로 물러선다** — 열을 골라 «열» · «열 묶음»(셀 틀은 받지만 열은 그리드 · 열 묶음에만 선다) · 행을 골라 «행»(행 몸통은 칸만) · 칸을 골라 «칸» · 탭을 골라 글이 그 판이다. 몸통이 받는 것(열을 골라 글 — 셀 틀 끝)은 그대로 안이다. 물러선 뒤도 못 서면 안의 까닭을 말한다. 누른 채의 키 반복은 넣지 않는다. 같은 카드를 더블클릭 간격(500ms — 포인터는 같은 자리) 안에 다시 누른 둘째(더블클릭 · 연달아 친 Enter)도 넣지 않는다 — 다른 카드의 연타 · 간격 뒤의 같은 카드는 넣는다. 자리는 끌어 놓기와 같은 판정이고, 고른 잎을 남이 잡았으면 그 뒤에도 넣지 않는다(판정은 잠긴 노드 **뒤**에 넣는 편집을 막지 않지만 구조 트리 줄 행동이 고른 노드의 잠금이면 항목을 다 끄는 것과 같이 간다 — `apps/web/src/edit/structure-actions.ts` 의 `structureAbilities`). 안 끝에 넣는 판(뿌리 · 컨테이너)은 낼 편집의 판정에 맡긴다 — 페이지를 연 그대로(뿌리 선택) 남이 다른 노드를 고르고 있어도 페이지 끝에 넣는다. 못 넣으면 요청을 안 내고 판 머리에 이유 한 줄을 세운다 — 문장은 같은 판에서 화면이 이미 하는 말(구조 트리 꺼진 항목의 잠금 문장 · 자식을 안 받는 자리의 까닭(`apps/web/src/panels/tree-row-actions.tsx` 의 `STRUCTURE_WHY_DISABLED.addInside`) · 받는 타입 · 설 자리의 까닭(끌어 놓기와 같은 문장 — 아래 «캔버스에 놓기») · 속성 패널의 잠금 문장 · «고른 노드가 문서에 없습니다»)이다. 그 줄은 다음 누름이 걷고, 세운 판(페이지 · 고른 노드)이 바뀌어도 걷힌다(돌아와도 다시 서지 않는다).
- **끌기 — 넣을 자리에 놓기.** 카드를 끌어 구조 트리 줄이나 캔버스에 놓는다. 끄는 동안 포인터 곁에 카드 이름표가 따라온다. 놓을 자리 · 배치 미리보기 · 보인 자리에만 놓기는 캔버스 손잡이와 같다(위 «캔버스에 놓기 — 놓을 자리» · «캔버스로 끄는 끌기는 보인 자리에만 놓는다» · 트리 줄의 띠는 «끌어 놓기»). 끝 스크롤은 포인터가 마지막으로 지난 쪽(트리 · 캔버스 칸)이 한다. «넣기» 단추에서 시작한 끌기도 끌기다 — 끈 뒤의 클릭은 넣기로 새지 않는다.

**단축키.** 에디터 어디서나(구조 트리 · 캔버스 · 패널 바깥) 먹는다 — 호스트 문서와 캔버스 iframe 문서 둘 다에서 받는다. 표는 하나이고 `?` 가 그 표를 그대로 그리는 «단축키» 대화 상자를 연다. macOS 는 Cmd, 그 밖은 Ctrl 이다(엇갈린 쪽은 안 선다).

| 키 | 동작 |
|---|---|
| Cmd+Z | 되돌리기 — 머리 «되돌리기»와 같은 길(같은 판정 · 같은 편집) |
| Cmd+Shift+Z · Cmd+Y | 다시 실행 |
| Delete · Backspace | 고른 노드(들) 삭제 — 확인 없이 바로(되돌리기로 돌아온다). 여럿이면 묶음 하나다. 지운 뒤 선택이 빈다(줄 `…` «삭제»는 기준 노드의 부모를 고른다) — 이어 친 Delete 는 아무것도 안 지운다. 서버가 그 편집을 통째로 거절해 노드가 돌아오면(423 · 422 · 409 — 수습이 문서를 다시 싣는다) 고른 노드도 돌아온다 — 그 사이 사람이 선택을 바꿨으면 안 뺏는다. 포커스가 열린 행동 메뉴(그 단추 포함) · 고르개 안이면 그것이 받는다(아래 «키를 쓰는 위젯») |
| Cmd+C · Cmd+X · Cmd+V | 복사 · 잘라내기 · 붙여넣기(아래 «클립보드») |
| Cmd+D | 복제 — 고른 노드마다 제 바로 뒤에 사본(클립보드를 거치지 않는다 · 묶음 하나) · 사본 전부를 고른다 |
| Cmd+A | 형제 모두 고르기 — 기준 노드의 형제 모두(기준 노드가 루트거나 없으면 루트의 자식 모두 · 남이 잡은 것은 건너뛴다) · 브라우저의 «전부 고르기»는 막는다(입력 칸 안은 칸의 것) |
| Escape | 선택 해제(고른 것 전부) — 포커스가 열린 행동 메뉴(그 단추 포함) · 옮기기 목록 안이면 그것이 닫히고 선택은 그대로다. 끄는 중(트리 줄 · 손잡이 · 카드)이거나 사각형을 그리는 중이면 그것만 걷는다 |
| Alt+↑ / Alt+↓ | 위로 / 아래로 — 줄 행동과 같은 판정 · 같은 편집(하나 골랐을 때만) |
| Alt+Shift+← / Alt+Shift+→ | 내어쓰기 / 들여쓰기 — 같음 |
| ↑ / ↓ | 이전 / 다음 노드 — 구조 트리의 보이는 줄 차례(전위 · 접힌 줄 안은 건너뛴다), 남이 잡은 줄은 건너뛴다. 옮긴 노드를 구조 트리 · 캔버스에서 보이게 굴리고, 포커스가 구조 트리 줄 단추에 있었으면 옮겨 간 줄로 포커스도 따라간다 — 이어 친 Enter · Space 가 앞 줄을 다시 고르지 않게(하나 골랐을 때만) |
| ← / → | 자식 줄이 있는 펴진 줄의 ← 는 접기 · 접힌 줄의 → 는 펴기(고른 것은 그대로), 그 밖에는 부모 / 고를 수 있는 첫 자식(같이 굴린다 · 하나 골랐을 때만) |
| F2 | 별칭 바꾸기 — 고른 노드 줄 아래에 별칭 입력을 연다(하나 골랐고 남이 안 잡았을 때만 · 누른 채의 반복은 안 받는다). 여럿을 골랐으면 «하나만 고르면 바꿀 수 있다» 를 정보 통지로 말하고 안 연다. 고른 노드가 접힌 줄 안에 숨었으면 그 조상을 펴고 연다 — 고른 줄 자신의 접힘은 그대로. 좌측 사이드바를 접은 채면 먼저 펴고 연다 |
| ? | 단축키 목록 |

- 메뉴 트리 상자에 포커스가 있으면 그 상자의 단축키(메뉴 · 페이지)가 받고 이 표는 서지 않는다.
- **서지 않는 때** — 포커스가 글 입력 표면(입력 칸 · 글 상자 · 고르개 · `contenteditable` · 편집 역할 — 캔버스 문서 안의 것 포함)이다 · 한글 조합 중이다 · 모달이 열렸다 · 메뉴 트리 상자 안이다. 입력 칸의 Delete · Cmd+Z · Cmd+C 는 그 칸의 것이다. **캔버스 문서에서는** 포커스가 없거나(본문) 단추 · 링크일 때만 선다 — 그 밖의 포커스 받은 요소(테마가 그린 위젯 · 닫힌 shadow 안의 입력)는 입력 표면으로 본다. 클립보드도 같다.
- **키를 쓰는 위젯 안에서는 그 위젯이 쓰는 키만 이 표가 받지 않는다** — 메뉴 · 목록 · 고르기 무리(ARIA 역할)와 열린 행동 메뉴(그 단추 포함)는 화살표 · Home · End · Escape · Enter, 탭은 탭 줄 축의 화살표(가로 줄이면 ← →) · Home · End, 손잡이 · 값 조절은 제 축의 화살표(세로줄 ← → · 가로줄 ↑ ↓) · Home · End(열린 줄 메뉴 안의 ← 가 선택을 옮기면 그 메뉴의 «삭제»가 옮겨 간 노드를 지운다). **행동 메뉴가 열려 있으면 Delete · Backspace 는 그것이 받는다** — 포커스가 그 메뉴(단추 포함) 안이면 노드를 지우지 않고(메뉴 트리 안의 메뉴에서는 삭제 확인도 안 선다) 메뉴는 열린 채다. 메뉴는 고른 노드에 대한 명령을 들고 열려 있어, 항목을 고르려다 친 Delete 가 노드를 지우고 메뉴째 닫으면 안 된다. 닫히면(Escape · 바깥 누름 · 항목 고르기) 다시 고른 노드를 지운다. 그 밖의 위젯 안에서 그 위젯이 안 쓰는 축의 화살표(탭의 ↑ ↓)와 Delete · Backspace, 어느 위젯 안에서든 Cmd 조합 · ? 는 입력 표면이 아니면 선다. 행동 메뉴는 포커스가 그 밖으로 옮으면 닫히므로 그 뒤의 키는 닫힌 메뉴의 것과 같다. **닫힌 행동 메뉴의 단추(`…` · `+`)와 컴포넌트 카드의 «넣기»는 키를 쓰는 위젯이 아니다** — 닫힌 단추의 ↓ ↑ 는 메뉴를 열고(Alt 를 함께 눌러도 메뉴만 연다 — 두 트리 모두 순서 이동이 아니다), 닫힌 단추의 ← → 와 «넣기»의 화살표는 선택을 옮긴다. 둘 다 대상을 쥐지 않아 해가 없다 — 닫힌 `…` 를 다시 열면 그 줄을 다시 고르고, «넣기»는 누를 때의 선택에 넣는다.
- **누른 채의 키 반복** — Delete · Backspace · Cmd+D · Cmd+A 는 첫 누름 하나만 받는다(«넣기»와 같다 — 거른 반복도 브라우저 기본은 막는다). 되돌리기 · 다시 실행 · 붙여넣기 · 순서 · 계층 · 화살표 고르기 · Escape 는 반복을 받는다.
- **여럿을 고른 판에서 «하나 골랐을 때만»인 키**(순서 · 계층 · 화살표 고르기 · F2)는 아무것도 안 하고 정보 통지가 그렇다고 말한다.
- 편집 단축키(되돌리기 · 다시 실행 · 삭제 · 복제 · 순서 · 계층 · 별칭 · 잘라내기 · 붙여넣기)는 편집 모드이고 editor 이상일 때만 선다. 삭제 · 잘라내기 · 복제 · 순서 · 계층 · 붙여넣기는 고른 노드(여럿이면 그 가운데 하나라도 — 붙여넣기는 기준 노드)를 남이 잡았으면 편집을 안 내고, 복제 · 잘라내기 · 붙여넣기는 하단 바가 이유를 말한다(삭제 · 순서 · 계층 키는 말없이 서지 않는다 — 그 이유는 고른 줄 `…` 의 꺼진 항목이 든다). 되돌리기 · 다시 실행은 선택이 아니라 낼 편집을 남의 잠금에 묻는다(머리 단추와 같다). 고르기 · 선택 이동 · Cmd+A · 도움말 · 복사는 뷰 모드 · viewer 도 선다.

**클립보드.** 키가 아니라 브라우저의 `copy` · `cut` · `paste` 이벤트로 받는다 — 그 이벤트 안의 `clipboardData` 는 권한 묻기 없이 읽고 쓴다(클립보드 권한을 안 준 Chrome 에서도 선다). 담는 것은 `text/plain` 봉투 하나다: `{ "wirebound": "nodes", "version": <문서 version>, "nodes": [ <서브트리> ], "viewStates": [ … ], "source": { "projectId": … } }` — `viewStates` 는 꺼낸 페이지의 화면 상태 목록이고 목록이 있을 때만 싣는다. `source` 는 꺼낸 프로젝트다 — 다른 프로젝트에 붙이면 그림을 그 출처에서 가져온다(아래 «붙이기» · §11.4). 없는 봉투(옛 봉투)도 읽는다. **출처는 이 브라우저가 낸 복사일 때만 믿는다** — 봉투는 누구나 짓는 글이라, 글이 출처를 정하면 남이 지은 글을 두 프로젝트에 다 든 사람이 붙이는 순간 그 사람의 권한으로 그림이 옮겨진다. 그래서 복사 · 잘라내기가 그 봉투 글의 sha256 을 브라우저 저장소(`localStorage` — 같은 브라우저의 다른 탭 · 창에서 낸 복사도 지킨다 · 최근 20 개)에 적고, 붙이기는 글이 그 표지와 바이트까지 같을 때만 `source` 를 쓴다. 맞지 않는 봉투(남이 지은 글 · 한 글자라도 바꾼 글 · 저장소를 못 읽는 판)는 출처 없는 봉투와 같다.

- **복사**는 고른 노드(들)의 서브트리를 문서 차례대로 담는다. 고른 것이 없거나 루트면 · 글자를 긁어 골랐으면 브라우저의 복사가 그대로다. **잘라내기**는 복사 + 삭제(삭제와 같은 판정 · 같은 편집 · 키보드 삭제처럼 선택이 빈다)이고, 지울 수 없으면 아무것도 담지 않는다.
- **붙이기** — 봉투가 아닌 글이면 아무것도 안 하고 통지도 없다(브라우저의 붙여넣기가 그대로다). 봉투인데 지금 문서에 실을 수 없는 노드(없는 타입 · 중복 id · 틀린 props · 지금과 다른 버전 — 판 1 · 2 봉투도)면 안 붙이고 정보 통지가 까닭을 한 줄로 말한다. 노드 id 를 새로 짓고(붙이는 노드 안을 가리키던 상호작용 대상은 따라간다), 밖을 가리키던 동작은 붙이는 문서에 그 노드(페이지 대상이면 지금 프로젝트에 그 페이지)가 있으면 남기고 없으면 빼고 뺀 수를 정보 통지로 말한다 — 동작이 다 빠진 상호작용은 상호작용째 뺀다. 번호 마커는 따라가지 않는다(코멘트가 따라가지 않는다). **상태 보임**은 노드와 함께 가고 붙이는 페이지의 상태로 맞춘다 — 같은 id 는 그대로, id 가 달라도 같은 이름(글자 그대로)이면 그 페이지의 상태 id 로 옮긴다. 둘 다 없는 상태는 보임에서 빼고 정보 통지로 «상태 "관리자" 보임 1곳을 뺐습니다.»라고 말한다 — 이름은 봉투의 출처 목록에서(없으면 id). «기본»은 늘 남는다. `only` 의 상태가 다 빠지면 보임을 걷고 «노드 N개는 남은 상태가 없어 보임을 걷었습니다 — 모든 상태에서 보입니다.»를 덧붙인다(`except` 가 비면 원래 보이던 곳에서 그대로 보여 따로 말하지 않는다). 지금 고른 상태는 붙지 않는다. 판 1 봉투의 상태 영역은 읽을 때 보임으로 옮긴 뒤 같은 규칙을 탄다. 복제(Cmd+D)는 같은 페이지라 보임을 그대로 든다. **그림** — 봉투의 출처가 이 프로젝트가 아니고 노드가 그림을 들면 붙이기 편집 **전에** 그 출처에서 가져오고(§11.4 «가져오기»), 못 가져온 그림(출처의 멤버가 아님 · 출처가 지워짐 · 이 프로젝트의 한도)은 `image` 를 비우고 «그림 2개를 가져오지 못해 비웠습니다 — 출처에 들어갈 수 없습니다»(한도면 «— 이 프로젝트의 그림 공간이 찼습니다» · 가져오기가 끊기면 든 그림 전부를 비우고 «— 그림을 가져오지 못했습니다 — 연결을 확인하세요»)를 정보 통지로 말한다. 기다리는 동안의 규칙은 페이지 대상이 든 봉투와 같다(아래 «자리»). 같은 프로젝트 · 출처 없는 봉투(믿지 않은 출처 포함)는 가져오지 않고 그림 id 를 그대로 붙인다 — 이 프로젝트가 그 그림을 안 가졌으면 «그림을 불러올 수 없음» 표지가 선다(통지 없음).
- **자리** — 고른 노드 바로 뒤 형제로 봉투의 노드를 차례대로, 고른 것이 없거나 루트면 페이지 끝(여럿을 고른 판은 기준 노드 뒤). 넣은 노드 전부를 고른다 — 기준 노드는 마지막 것이라 이어 붙이면 그 뒤에 차례로 선다. 다른 프로젝트 · 다른 테마의 봉투도 그대로 붙는다. 페이지 대상이 든 봉투는 페이지 목록을 읽은 뒤 붙는다 — 자리는 누른 때 고른 노드다(읽는 사이 다른 노드를 골라도). 그 사이 페이지를 옮겼으면(돌아왔어도) 붙이지 않고 하단 바에 한 줄로 말한다 — 다시 읽은 페이지 목록에 그 페이지가 없으면(복원이 지웠다) «옮겼다» 가 아니라 «없어졌다» 로 말한다. 같은 페이지를 다시 실은 것(재연결 · 복원 뒤 다시 불러오기 · 편집 실패 수습)은 옮긴 것이 아니라 붙는다 — 누른 때의 노드가 다시 실은 문서에 없으면 페이지 끝이다. 기다리는 사이 선 잃음 통지는 붙이기가 치우지도 덮지도 않는다(붙이지 못했다는 말도 그 뒤에 잇는다).
- 붙이기 · 복제 · 잘라내기는 **편집 하나**(되돌리기 하나)다. 묶음이 연산 200 개(편집 하나의 상한 — 넣기 · 지우기는 노드마다 연산 하나)를 넘거나 넣은 뒤 문서가 검증을 못 지나면 보내기 전에 막고 이유를 말한다.

**선택 — 고르는 법.** 고른 것은 **목록 + 기준 노드**다 — 기준 노드는 마지막으로 고른 것이고 Shift 범위 · 화살표 이동 · 붙일 자리 · 속성 패널 · 줄 행동의 기준이다. 하나 고른 판은 목록 길이 1 이다.

| 몸짓 | 동작 |
|---|---|
| 클릭(트리 · 캔버스) | 그것 하나 — 캔버스에서 그리드 몸 줄의 셀 틀 · 번호 칸(`data-wb-column-of` — 빈 자리 · 그 안의 사본 노드)을 누르면 그 칸이 선 줄의 행이다(되풀이 N 줄은 다 같은 행 — 고른 표지가 N 줄을 덮는다). 첫 줄 셀 틀의 원본 노드는 그 노드다 — 셀 틀은 거기서 고친다. 그 밖의 사본(`data-wb-copy-of` — 커스텀 행의 제 칸 · 고름 칸이 선 줄)은 그 원본이고, 머리 칸은 그 열 · 열 묶음이다(남이 고를 것을 쥐었으면 그것을 누른 것과 같게 막힌다) |
| Cmd+클릭(트리 · 캔버스) · Shift+클릭(캔버스) | 더하기 · 빼기 — 더한 것이 기준 노드 · 뺀 것이 기준 노드였으면 목록의 마지막이 기준 · 빈 곳의 수식 키 클릭은 고른 것을 지킨다 |
| Shift+클릭(트리) | 기준 노드부터 누른 줄까지 보이는 줄 차례로(접힌 줄 안은 안 든다) — 목록을 갈아 끼우고 누른 줄이 기준 노드 |
| Cmd+A | 기준 노드의 형제 모두(위 단축키 표) |
| 캔버스 사각형 | 캔버스 문서 · 캔버스 칸의 빈 여백에서 누르고 4px 넘게 움직이면 선다. 떼면 그려진 상자가 사각형 안에 **완전히** 든 노드 가운데 가장 바깥 것들(뿌리는 빼고)을 고른다(요소마다 누름과 같은 판정으로 읽는다 — 그리드 사본 줄의 칸(셀 틀 칸 · 번호 칸 · 그 안의 사본 노드)은 그 줄의 행이라 사본 줄만 덮어도 그 행이 들고, 되풀이 N 줄은 행 하나다. 커스텀 행 제 칸의 사본 · 사본 줄의 고름 칸은 그 원본이다. 첫 줄 셀 틀의 원본 노드는 그 노드지만 그 줄의 행이 함께 든 사각형에서는 따로 안 든다 — 행 줄을 다 덮은 사각형은 행 하나다) — Shift 를 누른 채 떼면 더한다. 4px 안에서 떼면 클릭이고, 아무것도 안 감싼 사각형(Shift 없이)도 누른 점에서 16px 안에서만 움직였으면 누른 자리의 클릭이다 — 노드 위에서 흔들린 손은 그 노드를 고르고 칸 여백의 빈 사각형은 선택을 안 바꾼다(빈 사각형으로 선택을 비우지 않는다). 그보다 멀리 끈 빈 사각형은 아무것도 안 한다 — 고르지도 비우지도 않는다. 칸 끝에 닿으면 끌어 놓기와 같은 끝 스크롤이고, 줌 · 칸 스크롤과 무관하게 문서 좌표로 판정한다. Escape 는 사각형만 걷는다. 무언가를 고른 사각형의 뗀 뒤 클릭은 선택을 안 바꾼다 |

- **목록이 지키는 것** — 문서에 있는 노드만(남의 편집 · 되돌리기가 지운 노드는 빠진다 — 기준 노드가 빠지면 목록의 마지막이 기준) · 조상과 자손이 함께 없다(새로 누른 것이 관련된 쪽을 대신하고, 범위 · 사각형 · 문서가 바뀐 뒤에는 가장 바깥 것이 남는다) · 루트는 혼자일 때만(루트를 Cmd+클릭하면 루트 하나) · 문서 차례 · 200 개까지(넘는 몸짓은 더 고르지 않고 하단 바에 «한 번에 고를 수 있는 노드는 200개까지입니다»). 남이 잡은 노드는 어느 몸짓으로도 안 든다.
- **보이는 것** — 캔버스는 고른 것마다 외곽선(기준 노드는 진한 선 · 나머지는 가는 끊은 선), 손잡이는 하나 골랐을 때만. 구조 트리는 고른 줄을 모두 강조한다(기준 노드는 채움 · 나머지는 테두리).
- **잠금** — 고른 서브트리마다 하나(§7.2). 남의 화면에는 고른 것마다 배지다.
- **여럿을 고른 판의 동작** — 삭제(Delete · 기준 노드 줄 `…` «삭제») · 복사 · 잘라내기 · 복제는 고른 것 전부(묶음 하나), 붙여넣기는 기준 노드 뒤, 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 화살표 고르기는 하나 골랐을 때만이다. 고른 것 가운데 하나라도 남이 잡았으면 삭제가 꺼지고 그 항목이 «○○님이 편집 중인 노드가 있어 함께 지울 수 없습니다»를 이유로 든다.

**우측 — 탭 패널.** 모드에 따라 탭 구성이 바뀐다.

| 모드 | 탭 |
|---|---|
| 편집 모드 | 페이지 정보 / **컴포넌트**(선택 노드) / 코멘트 / 상호작용 — 처음 고른 탭은 컴포넌트 |
| 뷰 모드 | **페이지 정보**(읽기만) / 코멘트 / 상호작용 |

**«페이지 정보» 탭** — 차례는 페이지 이름 → 종류 → 페이지 설명 → 상태다. 편집할 수 있는 판(편집 모드이고 editor 이상)에는 이름 칸(«이름 저장») · 종류 `[화면] [팝업]`(단추 꼴 라디오 — 문서 뿌리를 갈아 끼우는 편집 하나 · 되돌리기 한 번: 화면 → 팝업은 뿌리 타입과 제목(= 페이지 이름), 팝업 → 화면은 «바닥» 노드를 몸통 끝으로 옮기고 제목 · 크기를 걷는다. 뿌리를 남이 쥐었으면 잠금이 막는다) · 설명 상자(«설명 저장» · 글자 수) · 상태 목록의 다루기(위 «화면 상태»)가 서고(이름 · 종류 · 설명은 같은 라벨-값 꼴 — 라벨 76px · 저장 단추는 칸마다이고 그 칸에 안 보낸 글이 있으면 단추 밑에 «바뀜»), 그 밖(뷰 모드 · viewer)은 제목 · 설명 · 상태의 글뿐이다. 이름은 메뉴 트리의 이름 변경과 같은 요청이고(`PATCH …/pages/:id` 의 `title` 과 바탕) 같은 충돌 화면(«다른 사람이 이 제목을 바꿨습니다» · «내 글로 덮기» / «내 글 버리기»)을 지나며, 설명과 같은 저장 장치(바탕 · 시간 넘김의 다시 읽기 · «모름» · 떠나 있는 동안 끝난 결말 · 탭을 오가도 남는 초안)를 쓴다. 이름은 트리 쓰기라 `menu-changed` 가 오면(남이 · 메뉴 트리에서 바꿈) 탭이 이름을 다시 읽는다 — 친 초안은 그대로다.

탭 줄은 패널 본문을 굴려도 패널 위 끝에 붙어 남고(탭 글은 셸 본문 크기 13px), ← → · Home · End 로 탭을 옮기고(포커스가 따라간다 · 끝에서 멈춘다) 고른 탭만 Tab 정지점이다 — 탭에 포커스가 있는 동안 ← → 는 위젯이 쥐어 고른 노드를 안 옮긴다. 탭 이름은 꺾지 않는다 — 네 이름이 패널 폭에 다 안 들면(글꼴 · 브라우저 최소 글자 크기) 탭째 다음 줄로 가고, 줄마다 그 밑에 구분선이 서며 고른 탭의 밑줄은 제 줄의 구분선 바로 위에 붙는다(줄이 탭 줄 폭을 다 채운다). 가로 스크롤 · 말줄임은 두지 않는다.

**«컴포넌트» 탭** — 고른 노드의 묶음 둘: **«속성»**(아래) · **«코멘트»**(고른 노드에 달린 코멘트). «코멘트» 묶음은 «코멘트» 탭과 같은 데이터 · 같은 줄 꼴이다 — 한쪽에서 달거나 고치거나 지운 것과 쓰던 초안이 다른 쪽에 그대로 서고(초안은 노드마다 · 탭 · 모드를 오가도 남는다), 고치기 · 지우기 권한도 같다. 다른 점은 둘이다: 고른 노드의 무리만 보이고(없으면 «이 노드에 단 코멘트가 없습니다»와 새 코멘트 상자), «문서 순서대로 재번호»(페이지 전체의 일)는 «코멘트» 탭에만 있다. **«코멘트» 묶음은 기본으로 접혀 있다** — 머리 줄(«코멘트» · 그 노드의 수 «N개» · «펼치기»/«접기» 단추 — `aria-expanded`)만 서고 속성이 탭을 차지한다. 접힌 동안에도 목록은 읽어 수가 서고 남의 쓰기를 따라간다. 그 노드에 쓰던 글(새 코멘트 초안 · 고치는 중인 코멘트)이 있으면 펴 두고 접기 단추를 끈다(초안을 숨기지 않는다 — 다 달아 초안이 비어도 편 채다). 사람이 편 상태는 셸이 사는 동안(노드를 바꿔 골라도 · 탭 · 모드 · 페이지를 오가도) 남는다. **«코멘트» 탭 이름 곁에는 하나를 고른 노드의 코멘트 수를 단다**(0 이면 안 단다 · 목록을 읽은 뒤) — 수는 눈에만 보이고 탭의 접근 이름은 «코멘트» 그대로이며, 읽는 사람에게는 탭의 설명(«고른 노드의 코멘트 N개»)으로 준다. 묶음은 노드를 고른 동안만 서고 그때 목록을 읽는다 — 페이지를 열면 루트가 골라져 있어 그 묶음이 한 번 읽는다. 묶음이 선 채 다른 노드를 고르면 목록을 다시 읽는다. 남이 달고 · 고치고 · 지운 코멘트는 두 자리 다 사람이 아무것도 안 해도 선다 — 서버가 코멘트 쓰기마다 `comments-changed` 신호를 보내고 열린 목록이 다시 읽는다(§7 «코멘트 목록도 실시간이다»). **캔버스에서 노드를 누르거나 «코멘트» 탭의 묶음 머리 단추를 누르면(고르면 — 그 단추에서 친 Enter · Space 도) 우측 탭이 «컴포넌트» 로 옮긴다** — 구조 트리 줄 · 키보드로 노드를 고르는 명령(↑ ↓ ← → · Cmd+A) · 넣은 뒤 저절로 고름 · 되돌리기는 탭을 안 옮긴다. 뷰 모드에는 이 탭이 없다.

**«코멘트» 탭** — 페이지의 코멘트 전부를 노드마다 묶어 보이고(번호가 있는 묶음이 번호 차례로 앞에 선다), 새 코멘트는 고른 노드에 단다. **묶음은 캔버스를 가리킨다**(두 모드 — 문서에 있는 노드의 묶음만. 사라진 노드 · 문서를 못 읽은 묶음은 가리킬 자리가 없어 아래 둘이 다 없다):

- **포커스가 곧 고름** — 묶음에 포커스가 들면(Tab 으로 묶음에 듦 — 묶음 자체가 Tab 정지점이다 · 묶음을 누름 · 묶음 안 단추 · 글 상자를 누름 · 본문 글을 끌어 · 두 번 · 세 번 눌러 고름) · 이미 포커스가 선 묶음을 다시 누르면 · 묶음 자체에 포커스가 선 채 Enter · Space 를 치면 그 묶음을 **곧바로** 고른다. 고르면 캔버스의 그 노드에 고른 노드의 외곽선(기준 노드)과 같은 꼴의 링이 서고, 그 노드가 지금 화면 상태에서 숨었으면 «기본» → 상태 트리 차례로 그 노드가 보이는 첫 상태를 고르며(보이면 그대로 · 어느 상태에서도 안 보이면 그대로), 지금 탭이 아닌 패널 · 접힌 검색폼 안이면 그 사람의 화면에서만 펼쳐 그린다(위 «고른 노드를 펼쳐 보인다» 와 같은 장치 — 두 모드 다 · 문서 · 남의 화면은 그대로). 고름은 그 자리에서 서서, 곧이어 한 다른 몸짓(구조 트리 줄 · 전환기 · 캔버스 누름 · 휠 · 페이지 옮김)이 낸 화면을 뒤에 덮지 않는다. Tab 으로 묶음을 훑거나 본문 글을 고를 때도 화면이 바뀐다(고른 글은 남는다). 같은 노드를 거듭 고르면 같은 답이다 — 이미 보이면 상태를 안 바꾸고 칸도 안 굴린다(포커스가 묶음 안에서 자식 사이로 옮겨도 다시 고른다). **토큰 링크에 든 포커스는 링만 세운다** — 링크가 데려간 노드 · 페이지가 그 묶음의 고름(화면 상태)에 가려지지 않게. 포커스가 든 뒤 묶음 안 단추 · 글 상자를 누르거나 거기서 친 키는 그것들의 일이다(다시 고르지 않는다).
  - **진짜 선택이 아니다** — 고른 것 · 새 코멘트의 «달 곳» · 노드마다의 초안 · 잠금이 그대로이고, 링은 고른 외곽선과 함께 선다. 이미 고른 노드(기준이든 여럿 고름의 옅은 것이든)를 가리키면 링을 따로 안 그린다 — 그 노드의 외곽선(기준이면 진한 선 · 옅으면 가는 끊은 선)이 그대로 선다. 사람이 그 노드가 숨는 상태로 바꾸면 그릴 요소가 없어 링도 없다. 마우스를 올리는 것으로는 안 선다.
  - **걷히는 때** — 링은 다른 묶음으로 가면 그 노드로 옮기고, 캔버스를 누르거나 · 페이지를 옮기거나 · 다른 탭으로 가거나 · 우측을 접거나 · 그 노드가 문서에서 사라지면 걷힌다(같은 id 로 다시 서도 사람이 다시 묶음에 들기 전에는 안 선다). 펼침은 다른 묶음을 고르거나(펼침은 하나다) · 캔버스를 누르거나(뷰 모드에서 그 탭 줄을 누르면 상호작용의 탭이 선다) · 진짜 선택이 바뀌거나 · 그 노드가 문서에서 사라지거나 · 페이지를 옮기면 걷힌다. 포커스가 묶음 밖(새 코멘트 폼 · 우측 탭 단추)으로 나가기만 해서는 링 · 상태 · 펼침 어느 것도 안 걷히고 안 되돌린다. «코멘트» 탭으로 돌아와도 다시 고르지 않는다(포커스가 묶음에 다시 들기 전에는).
- **머리 단추 — 고르고 «컴포넌트» 탭으로** — 편집 모드에서 묶음 머리(번호 · 이름)는 단추다: 고름에 더해 그 노드를 고르고 «컴포넌트» 탭으로 간다(남이 잡아 안 골라지면 탭은 그대로). 뷰 모드에는 «컴포넌트» 탭이 없어 머리가 글이다.

**링 · 고른 노드를 캔버스 칸 안으로 굴린다** — 링이 설 때(숨었던 노드가 보이게 됨도)와 묶음을 고를 때(머리 단추로 고른 진짜 선택도 · 같은 묶음을 다시 골라도) 그 노드가 캔버스 칸의 보이는 구간에 다 안 들면 가장 가까운 쪽 끝으로 칸만 굴린다(이미 보이면 안 굴린다 · 칸 밖의 문서 · 패널은 안 움직인다). 사람이 칸을 굴려 밀어낸 링은 다시 고르기 전에는 끌려오지 않는다(줌 · 남의 편집으로 다시 재도).

**묶음 안에서는 노드 단축키가 안 선다** — 묶음과 그 안의 «수정» · «삭제» 단추에서 친 Delete · Backspace · Cmd+D · ↑ ↓ · Escape · Cmd+A · 되돌리기 · 붙이기가 고른 노드에 가지 않는다(링이 가리키는 노드와 고른 노드가 다를 수 있다 · 도움말 `?` 도 안 선다 — 메뉴 트리 상자와 같다). 묶음 안 글 상자의 키는 글의 것이다.

«컴포넌트» 탭의 «코멘트» 묶음은 이미 고른 노드의 것이라 캔버스를 가리키지 않는다. 다시 재는 법: `apps/web/build-test/comment-focus.test.ts`.

«컴포넌트» 탭의 «속성» 묶음은 컴포넌트 정의의 `editor` 명세에서 자동 생성된다(5.1 참조) — 칸 정의에 안내(`hint` — 한 줄 · 60자 안)가 있으면 그 칸 밑에 둔다(그리드의 «되풀이» · «가로 칸 수» · «세로 칸 수» · «고정 열 수» · «열 폭» — 이름만으로 무엇을 세는지 모르거나 안 정했을 때의 대가가 안 보이는 칸). **머리 카드**가 칸들 위에 선다 — 제목 `타입 (별칭)`(별칭이 없으면 타입 — 타입은 배지) · 곁에 구조 트리 줄의 요약 · 위치(뿌리부터 부모까지의 줄 이름 사슬 — 누르면 그 조상을 고른다 · 고를 수 없는 조상은 꺼진다) · «별칭» 칸 · 변형 칸(테마가 변형을 선언한 타입) · 꺼진 까닭 한 줄. **칸은 묶음 넷으로 가른다** — 내용(글 · 목록 · 그림 칸) · 표시(고르개 · 수 · 색 · 그 밖의 켬/끔) · 레이아웃(방향 · 정렬 · 줄바꿈 · 열 수 · 칸 수 · 폭 · 크기 · 여백 · 모서리 · 비율) · 상태(비활성 · 읽기 전용 · 오류 · 로딩 · 빈 · 선택 · 접힘의 켬/끔). 묶음 안은 컴포넌트 정의의 차례이고 빈 묶음은 안 선다. 칸이 아닌 줄은 제 묶음의 끝이다 — 공통코드(묶는 타입만) · 행 내용(그리드 행만)은 내용, 몫은 레이아웃, 상태 보임은 상태. 묶음 머리를 누르면 접고 편다(`aria-expanded`) — 접힘은 묶음 이름으로 셸이 사는 동안(노드를 바꿔 골라도 · 탭 · 모드를 오가도) 남는다. 몫 · 상태 보임 · 별칭은 어느 컴포넌트에나 서는 노드 봉투의 칸이다(별칭은 위 «별칭 고치기»). 칸 줄은 라벨 76px · 값이 나머지다. **고르개**는 선택지가 넷 이하이고 글이 값 칸에 드는 것(글자 수 + 선택지마다 둘 ≤ 30)이면 단추 꼴 라디오(← → · Home · End), 그 밖은 셀렉트다. 값이 없는 고르개는 컴포넌트 정의의 기본값을 고른 채로 보인다(렌더러가 그 값으로 그린다). 켬/끔 칸은 체크박스를 스위치 모양으로 그린다. «몫» 칸(§4.3)은 **부모가 몫을 읽을 때만**(`Flex` · `Field` · `Grid` · `FormTable` · 열을 정한 `SearchForm` — 렌더러가 몫을 싣는 판정과 같은 함수) 선다 — 부모가 쌍 격자(`FormTable` · 열을 정한 `SearchForm`)면 칸 밑에 «차지할 쌍 수 — 열 수 이상이면 한 줄 전체» 를 둔다 — 넣으면 `add` / `replace …/weight`, 비우면 `remove`, 1 ~ 12 정수 밖을 친 채 떠나면 보내지 않고 칸 아래에 까닭을 말한다(바른 값을 보내면 걷힌다). 남이 잡은 노드 · 고칠 수 없는 역할이면 별칭 칸처럼 꺼진다. 기본값이 없는 수 칸(`SearchForm` 의 «열 수»)은 비우면 그 prop 을 지운다(`remove …/props/columns` — 안 정한 판으로 돌아간다). 다른 수 칸은 지금처럼 비운 것을 보내지 않는다. **색 칸**(`color` — 자리표시자의 바탕 · 테두리 · 글 색)은 지금 색 · `#rrggbb` 글 칸 · 고르개 · «테마 기본» 단추 · 견본 열둘이다 — 글 칸은 blur · Enter 에(대문자 · `#` 없는 여섯 자리를 소문자 `#rrggbb` 로 바꿔 보내고, 꼴 밖이면 안 보내고 칸 밑에 «색은 #rrggbb 꼴로 적습니다»), 견본 · «테마 기본»(`remove …/props/<prop>`)은 곧바로, 고르개는 닫을 때(`change`) 한 번 보낸다(끄는 동안의 `input` 은 안 보낸다 — 되돌리기 한 칸). 남이 잡으면 글 칸 · 고르개 · 단추 · 견본이 다 꺼진다. **그림 칸**(`image` — 자리표시자의 그림)은 지금 그림의 축소판 · 이름 · 크기 · 용량, «그림 고르기…»(PNG · JPEG · WebP · GIF · SVG) · «올린 그림에서»(그 프로젝트의 그림 격자와 쓴 용량 / 한도) · «지우기»(`remove …/props/image`)이고, 칸에 파일을 끌어 놓거나 칸에 포커스를 둔 채 붙여 넣어도 올린다(칸 안의 붙여넣기는 노드 붙이기가 아니다 · 패널의 다른 자리에 놓인 파일은 버린다 — 브라우저가 열지 않게). 올리는 동안 «올리는 중 N%» 와 «취소»(올리기 진행은 `XMLHttpRequest.upload` 로 받는다)이고 끝나면 `image` 하나를 바꾸는 편집을 낸다(되돌리기 한 번). 올리기와 편집은 따로다 — **편집 자리는 누른 때의 노드**라 그 사이 다른 노드를 골라도 처음 노드에 내고, 그 노드를 남이 잡았거나 지웠으면 편집을 안 내고 «그림은 올렸지만 이 칸이 잠겨(지워져) 넣지 못했습니다 — "올린 그림에서" 고를 수 있습니다» 를, 그 사이 페이지를 옮겼으면 아무것도 안 낸다. 올린 그림은 편집과 무관하게 프로젝트에 남는다. 실패는 칸 밑 한 줄이다 — 서버의 문장(크기 · 꼴 · 한도) · 권한 · 끊김(«올리지 못했습니다 — 연결을 확인하세요» + «다시 시도»). 남이 잡으면 고르기 · 놓기 · 붙여넣기 · 목록 · 지우기가 다 꺼진다. 여럿을 고른 판에서는 그림 칸이 «그림은 하나씩 골라 정합니다» 한 줄이다. 제목 · 상호작용 탭의 노드 이름과 문장은 긴 한 낱말 별칭도 패널 안에서 접고, 대상 고르개는 패널 폭을 넘지 않는다. **여럿을 고른 판** — 같은 타입이면 기준 노드의 칸을 그리되 칸마다 모두 같은 값이면 그 값, 갈리면 «여러 값»(글 · 수는 빈 칸과 자리표 · 고르개는 «여러 값» 칸 · 켬/끔은 반쯤 켬 · 목록 칸은 고치지 않는다)이다. **목록 칸**(키-값 · 선택지 · 파일 목록)은 배열을 통째로 바꾸는 편집 하나로 항목을 더하고 · 지우고 · ↑ ↓ 로 옮긴다 — 옮기기 · 고르기는 고치던 칸의 글을 얹어 곧바로 나간다. 선택지 칸은 항목마다 고르기(하나 고르는 칸은 라디오 · 여럿이면 체크)와 «고른 것 풀기» 가 서고, 마지막 하나는 못 지우며 30 개에서 더하지 못한다. 파일 목록 칸은 줄마다 이름 · 크기 두 칸이고 20 줄에서 더하지 못한다(빈 목록은 받는다). **트리 항목 칸**(`treeItems`)은 줄마다 이름 칸 · 펼침 표지 · `…`(아래에 항목 추가 · 하위 항목 추가 · 펼치기 / 접기 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 지우기)이고 바닥에 «항목 추가»(맨 위 끝)가 선다. 조작마다 `items` 를 통째로 바꾸는 편집 하나다(되돌리기 한 번 · 다른 목록 칸과 같은 «뒤의 것이 이긴다»). 하위 항목 추가 · 들여쓰기는 받는 항목을 편다(더한 것이 캔버스에 보이게). 들여쓰기는 앞 형제의 자식 끝으로, 내어쓰기는 부모 바로 뒤로 간다(뒤 형제는 그 자리에 남는다 — 구조 트리와 같다). 이름 칸에서 구조 트리 줄과 같은 단축키가 선다 — Alt+↑ · ↓(위로 · 아래로) · Alt+Shift+→ · ←(들여쓰기 · 내어쓰기) — 옮긴 뒤 포커스는 그 항목을 따라간다. 패널은 접힌 항목의 자식 줄도 그린다(고치려고 문서를 펼 일이 없게 — 표지가 펼침을 말한다). 펼침 표지는 포인터 몫이고 키보드는 `…` 의 «펼치기» · «접기» 다. 100 항목에서 더하기 셋이, 깊이 5 에서 하위 항목 추가 · 들여쓰기가 꺼진 채 까닭을 든다. 남이 잡으면 칸 · 표지 · `…` · «항목 추가» 가 다 꺼진다. 두 사람이 같은 목록의 다른 줄을 고치면 **늦게 닿은 쪽의 목록 전체가 이긴다** — 편집은 prop 하나의 `replace`(전제 `test` 없음)라 리베이스가 남의 판 위에 그대로 다시 얹고, 남이 고친 다른 줄은 늦은 쪽이 본 값으로 돌아간다(다른 목록 칸 · 글 칸과 같은 «뒤의 것이 이긴다» — `apps/web/src/store/anchored-ops.ts` 머리말). **«한 행 떼어 내기» · «열 틀로 칸 짓기»**(구조 트리 줄 `…` — 그리드 행 줄에만)는 편집 하나 · 되돌리기 한 번이다. 떼어 내기는 되풀이 n(≥ 2) 인 행을 되풀이 1 인 그 행(원본 id · 번호 · 별칭 · 상호작용을 지킨다 — 화면의 첫 줄이 원래 그 노드다)과 바로 뒤 되풀이 n − 1 인 새 행(복제와 같은 사본 — 새 id · 번호 없음)으로 가른다. 칸 짓기는 칸 없는 행에 잎 열마다 칸을 짓는데 **그 행의 첫 줄이 지금 그린 꼴 그대로**다 — 셀 틀 칸은 그 셀 틀의 사본, 번호 열은 그 줄의 번호 글(제 칸 행은 번호를 안 세어 수가 굳는다), 합계 행 · 빈 열 묶음의 빈 칸은 빈 칸, 위 행의 세로 칸이 덮은 열은 건너뛴다(화면 상태에서 숨은 열도 칸을 받는다). 행의 모양이 못 하게 하면(되풀이 1 · 칸을 가진 행 · 생략 띠 · 칸 짓기는 첫 행) 항목이 꺼진 채 까닭을 든다. **«행 내용: 기본 / 커스텀»**(그리드 행을 고른 판 — 단추 꼴 라디오 둘)은 칸 유무를 비추는 화면 명령이다(prop 이 아니다 — 렌더러 · 서버 · MCP · 내보내기가 같은 «칸이 있으면 제 칸» 으로 그린다). 기본 → 커스텀은 «열 틀로 칸 짓기» 와 같은 편집이고 같은 까닭으로 꺼진다 — **첫 행은 늘 기본**이라 «커스텀» 이 꺼진 채 까닭을 든다(이미 칸을 가진 첫 행은 커스텀으로 보이고 기본으로만 돌린다). **칸을 가진 행을 «행» 구역의 첫 자리로 데려오는 편집은 내기 전에 묻는다** — 앞에 칸 없던 첫 행이 뒤에 칸을 가지고 기본 행이 하나라도 남으면(위로 · 아래로 · 끌기 — 캔버스 손잡이 · 구조 트리 · 첫 행 지우기 · 잘라내기 · 그 밖에 편집 통로를 지나는 모든 입구가 한 판정을 부른다) «첫 행 바꾸기» 상자(«이 행이 첫 행이 되면 기본 행들이 첫 행과 다른 꼴로 그려집니다. 계속할까요?» · 보조 줄 «기본 행은 열의 셀 틀을 그립니다.» · «계속» · «취소»)가 선다. 끌기는 놓은 뒤 묻는다. 취소 · Escape 면 아무것도 안 낸다. «계속» 은 물은 판에서 노드 id 로 붙잡은 편집을 지금 문서로 옮겨 낸다 — 묻는 사이 남의 편집이 닿았어도 그 편집이 여전히 얹히면 다시 묻지 않고 내고(판정이 바뀌어 묻지 않을 판이 됐어도 낸다), 더는 얹히지 않으면(대상 · 목적지가 사라짐) 내지 않고 하단 바에 «묻는 사이 페이지가 바뀌어 편집을 내지 않았습니다 — 다시 해 주세요.» 한 줄. 새로 선 그리드(붙임 · 모듈) · 앞에 행이 없던 그리드는 안 묻는다. 되돌리기 · 다시 실행 · 남의 편집 · MCP · REST 로 첫 자리가 바뀌는 판도 안 묻는다. 커스텀 → 기본은 칸 배열을 걷는 편집 하나다 — 칸이 지금 열 틀로 지을 칸과 같은 꼴이면(바꾸고 안 고침) 곧바로 걷고, 다르면 칸 아래 확인 줄(«이 행의 칸 N개를 걷고 열의 셀 틀로 그립니다. 칸에서 고친 내용은 사라집니다.» · «기본으로 돌리기» · «취소» — Escape 는 취소)을 거친다. 확인 사이 칸이 바뀌었으면(남의 고침이 닿음) 걷지 않고 다시 묻는다. 걷기는 내가 본 칸 배열을 `test` 로 앞에 실어 그 사이 남이 칸을 고쳤으면 버리고 알린다. 생략 띠는 둘 다 꺼진다. 남이 그 행을 잡았으면 꺼지고, 칸 짓기는 셀 틀을 베낄 열을 남이 쥐었어도 안 나간다(남이 고치는 중인 셀 틀을 베끼지 않는다 — 떼어 내기는 열을 안 써 나간다). 두 묶음은 지은 판의 모양(떼어 내기는 그 행의 되풀이 수 · 칸 짓기는 칸이 없음)을 `test` 로 앞에 실어, 남의 편집이 내 화면에 닿기 전에 누른 묶음은 리베이스가 버리고 알린다 — 남이 고친 되풀이 수를 말없이 걷지 않는다. 칸 짓기가 베끼는 셀 틀 글은 누른 때 본 것이다(셀 틀 자신은 안 고친다). **«종류 바꾸기…»**(구조 트리 줄 `…` — 입력 조각 줄에만)는 상자의 종류 단추 하나로 그 조각의 타입을 바꾼다 — 노드 id · 번호 · 별칭 · 상태 보임 · 상호작용 · 몫을 지키고 이름이 같고 새 타입의 규격을 지나는 prop 을 옮기며(하나만 고르는 타입으로 가면 고른 것은 첫째만) 변형은 걷는다. 편집 하나(`type` · `props` · `variant` 필드 연산)라 되돌리기 · 잠금 판정 · 방송을 편집 길 그대로 탄다 — 남이 잡은 조각이면 항목이 꺼지고, 상자를 연 뒤 잡혔으면 보내지 않고 하단 바에 말한다. 행동 메뉴에 하위 메뉴가 없어 상자로 짓는다(누름 수는 같다). 바꾼 칸만 고른 것 전부에 묶음 하나로 쓰고 다른 칸은 노드마다 제 값 그대로다. 고른 것 가운데 하나라도 남이 잡았으면 칸이 다 꺼진다. **칸을 떠나지 않은 채 고른 것이 바뀌면**(일부 거절 · 같은 사람의 다른 탭이 고른 노드를 지우거나 옮김 · 타입을 바꿈 — 하나 고른 판도 같다) 친 글은 칸을 떠날 때의 커밋과 같은 길로 **앞 목록 가운데 아직 문서에 있고 그 타입 그대로이며 남이 안 쥔 노드**에 간다 — 새 목록에는 안 간다. 그런 노드가 없으면 버리고 하단 바에 «바뀐 선택 때문에 친 값을 쓰지 않았습니다» 한 줄. 칸에 친 채 브라우저의 뒤로 · 앞으로로 다른 페이지에 갔으면 어느 페이지에도 쓰지 않고 같은 한 줄이 다음 페이지 화면에 선다(친 페이지를 다시 열면 걷힌다). 세션이 끝나 화면이 내려가면 끝난 세션으로 아무것도 쓰지 않는다 — 내 로그아웃은 누름의 blur 가 그 전에 칸을 커밋해 로그아웃의 한 줄이 그 편집을 세고, 다른 탭의 로그아웃이면 이 탭은 버린 초안을 말하지 않는다(셸째 내려가 말할 자리가 없다). 칸에 친 채 에디터를 떠나 셸 밖 화면(프로젝트 목록)으로 가면 친 그 페이지에 쓴다. 타입이 섞였으면 «N개 고름» · «일괄 속성 편집은 같은 타입끼리만 됩니다» · «고른 노드 삭제» 단추다. 상호작용 탭의 규칙 편집과 코멘트의 새 코멘트(«코멘트» 탭 · «컴포넌트» 탭의 «코멘트» 묶음)는 하나 골랐을 때만이다(페이지의 상호작용 · 코멘트 목록은 그대로). **페이지 이름 · 설명은 «페이지 정보» 탭에서 읽고 고친다** — 편집 모드의 editor 이상에게는 편집기, 그 밖에는 읽기 전용이다. «컴포넌트» 탭에 두지 않는다: 이름 · 설명은 페이지 메타라 에디터 스토어가 들지 않고(페이지 문서는 한 번만 읽는다), 그 탭이 열릴 때 따로 읽고 쓴다 — 편집 모드에서 처음 고른 탭이 «컴포넌트»라 페이지를 열 때 페이지 읽기가 늘지 않는다.

**«상호작용» 탭** — 위는 하나 고른 노드의 규칙(편집 위젯 · 추가), 아래는 «이 페이지의 상호작용 · N» 목록이다. 목록은 줄마다 누가(그 노드의 타입 배지 · 별칭 · 요약) · 문장(§5 의 그 문장 — 내보내기와 같다) · 위치(뿌리를 뺀 조상의 줄 이름 사슬)라 같은 문장의 줄(행 고름이 같은 상태를 여는 그리드 여럿)이 갈린다. 줄을 누르면 그 노드를 고르고(지금 화면 상태에서 숨었으면 보이는 상태로 바꾼다) 캔버스 칸 안에 들인다 — 코멘트 묶음 머리 단추와 같은 길이고 탭은 그대로다(위에 그 노드의 규칙이 선다). 고른 노드의 줄은 왼금으로 표시한다. 줄은 편집이 아니라 이동이라 남의 잠금 · 보기 권한에도 눌린다.

**«공통코드» 칸**(묶는 타입 — §5 — 에만 선다). 묶이지 않았으면 «공통코드로 묶기» 단추 하나이고, 누르면 그룹 · 항목 고르개(선택 위젯은 그룹만)와 «묶기» 가 선다 — 묶기는 `code` 를 넣고 그 prop(대표 글 · `options`)에 표의 이름을 대체 글로 적는 편집 하나다(전제는 노드 값 `test` 하나 — 남이 그 사이 노드를 고쳤으면 묶음째 버려진다). 묶인 동안 그 prop 칸이 잠기고 «공통코드: <그룹 이름> › <항목 이름> · 풀기» 와 «이 코드를 쓰는 곳 N»(공통코드 화면의 그 항목으로 가는 링크)이 선다. 선택 위젯은 칸이 카드 하나가 된다 — «공통코드: <그룹 이름>» · 키 · 항목 수 · 항목 칩(고른 것 강조) · 하나만 고르는 타입은 «고른 값» 셀렉트(«— 없음 —» 과 항목), 여럿을 고르는 타입은 칩이 켜고 끄는 단추 · «풀기» · «이 코드를 쓰는 곳 N». 어느 쪽이든 `selected` 를 고친다. 그동안 선택지 칸은 숨는다(목록이 칩 한 줄에만 선다) — 참조가 끊겼거나 표를 못 읽었으면 잠긴 선택지 칸이 그대로 선다. **풀기**는 `code` 를 걷고 그때 표의 이름을 prop 에 적는다(묶을 때의 옛 이름이 다시 나타나지 않게 — 끊긴 참조면 prop 의 대체 글 그대로). **묶인 입력 조각의 «종류 바꾸기»** 는 참조를 같은 편집에서 옮기거나 푼다 — 선택 위젯끼리는 `code` 가 그대로 가고(하나만 고르는 타입으로 가며 고른 값이 둘 이상이면 첫 값만 남긴다), 그 밖의 종류로 가면 풀기와 같은 규칙으로 `code` 를 걷고 하단 바 정보 통지에 «공통코드 묶음을 풀었습니다» 를 보인다. 끊긴 노드는 «끊긴 공통코드: <그룹 키> › <코드값> · 다시 묶기 · 풀기» 다(표에 없어 이름 대신 키 · 값을 보인다). 표에 없는 키를 든 노드를 붙이거나 · 모듈로 넣거나 · 페이지 JSON 으로 가져오면 거절 없이 들어오고 하단 바 정보 통지에 «끊긴 공통코드 N개» 를 더한다. 캔버스의 끊김 표지는 노드 외곽의 점선이다(셸이 그리는 표지 — 테마 어휘가 아니다).

**칸에 친 채 떠나는 두 길은 일부러 규칙이 둘이다.** 한 규칙으로 맞추지 않는다 — 어느 쪽으로 맞춰도 한 길이 나빠진다.

| 떠나는 길 | 칸에 친 글 | 그렇게 두는 까닭 |
|---|---|---|
| 브라우저의 뒤로 · 앞으로(같은 에디터 안의 페이지 이동) | 어느 페이지에도 쓰지 않는다. 같은 한 줄(«바뀐 선택 때문에 친 값을 쓰지 않았습니다»)이 다음 페이지 화면에 서고, 친 페이지를 다시 열면 걷힌다 | 칸에 포커스가 있어 blur 가 안 나고, 위젯이 정리될 때 주소는 이미 다음 페이지다. 쓰면 기록을 옮기는 도중에 엉뚱한 페이지에 쓰거나 앞 페이지의 연산이 다른 페이지 경로로 나간다 |
| 링크를 눌러 에디터를 떠남(로고 «프로젝트 목록» · 셸 밖 화면으로 가는 링크) | 친 그 페이지에 쓴다(편집 하나 · REST) | 사람의 누름이라 blur 가 먼저 돌고, 그것이 못 돌아도 위젯이 정리되며 같은 초안을 쓴다 — 둘 다 주소가 아직 그 페이지일 때다. 쓸 대상이 분명하다. 버리면 글을 잃는다 |

버리는 쪽으로 맞추면 링크로 나가는 사람이 친 글을 잃고, 쓰는 쪽으로 맞추면 위 첫 줄의 기록 이동 틈이 열린다. 재는 자리: 두 줄 모두 `build-test/multiselect.test.ts` 의 «칸에 친 채 고른 것이 바뀐다» 절(첫 줄 «브라우저 «앞으로»…», 둘째 줄 «로고 링크로 …»). 둘째 줄의 두 겹(blur 커밋 · 위젯 정리의 쓰기)은 한 겹씩 떼면 초록이고 둘 다 떼야 빨강이다.


**두 사이드바의 폭.** 좌측(기본 264px · 최소 200px)과 우측 패널(기본은 창 폭의 24% 를 300 ~ 380px 로 자른 값 — 창 1280 · 1440 · 1920 에서 307 · 346 · 380 · 최소 300px)은 캔버스와의 사이에 있는 손잡이로 바꾼다 — 끌기 · 화살표 · Home/End · 두 번 눌러 기본값(우측 손잡이는 왼쪽으로 끌면 넓어진다). 폭은 사람마다 그 브라우저에 기억하고, 읽을 수 없는 값은 기본값으로 읽는다(우측을 두 번 눌러 기본값으로 돌리면 기억을 지워 다시 창을 따른다). **두 폭은 한 예산을 나눠 쓴다** — 어느 쪽의 최대 폭도 창 폭에서 상대 폭 · 손잡이와 여백(16px) · 캔버스 몫(480px — 가장 좁은 프리셋 375 가 100% 로 칸에 드는 폭에 여유를 얹은 값)을 뺀 만큼이라, 어느 쪽을 넓혀도 캔버스 몫이 남는다. 한쪽을 접으면 그 쪽의 폭과 손잡이 · 여백(8px)이 예산에서 빠진다(위 «에디터는 데스크톱 창을 전제하고»). 창이 줄면 우측을 먼저 최소까지, 그다음 좌측을 조여 읽는다 — 기억한 값은 그대로 두고 창이 다시 넓어지면 돌아온다.

**셸 밖의 화면.** 로그인 · 초대 가입 · 비밀번호 재설정 · 프로젝트 목록 · 프로젝트 설정 · 공통코드 · 계정 설정 · 관리자 화면(인스턴스 관리자). 셸 밖 화면으로 가면 에디터 셸이 내려간다. 로그인 · 초대 가입 · 재설정(로그인 전에 여는 화면) 밖의 화면은 같은 **뼈대** 안에 선다 — 왼쪽 사이드바와 내용 칸이다. 사이드바는 위에서부터 로고(프로젝트 목록으로), «프로젝트» · «계정», 인스턴스 관리자에게만 «관리자» 묶음(**사용자 · 초대 링크 · 프로젝트 · 테마 · 기록** — 관리자가 아니면 그 주소를 쳐도 «인스턴스 관리자만 볼 수 있습니다» 한 줄이고 조회하지 않는다), 바닥에 로그인한 사람의 이름과 «로그아웃»이다. 지금 화면의 칸이 강조된다. 내용 칸은 폭 제한 없이 좌우 여백만 두고, 머리에 빵부스러기 · 제목 · 오른쪽 주 동작이 선다. 세션 전환 · 로그아웃 실패의 통지는 내용 칸 머리 아래에 선다 — 세션 전환 통지는 새 사람의 이름을 말한다(«… 이 탭은 이제 <이름>의 화면입니다» — 이름이 보이는 사이드바 바닥은 좁은 창에서 접힌 목록 안이다). 창이 720px 보다 좁으면 사이드바가 위 줄(로고 · «메뉴»)로 접히고 칸은 «메뉴»를 눌러야 펴진다 — 편 목록은 주소의 경로가 바뀌면 다시 접힌다(질의만 바뀌면 그대로다).

- **프로젝트 목록**(홈) — 제목 «프로젝트» 곁에 흐린 프로젝트 수(«3개» — 거르면 «3개 중 1개» · 목록이 하나 이상일 때), 위 줄에 **검색**(이름 · 슬러그 · 설명 — 대소문자를 가리지 않는 부분 일치) · **역할 거름**(전체 / owner / editor / viewer) · **정렬**(최근 수정 — 기본 · 이름), 그 밑에 **카드 격자**(칸 260px 아래로 안 줄어 폭에 따라 열이 는다). 격자 맨 앞은 **«프로젝트 추가» 카드**다 — 누르면 그 카드 자리가 만들기 폼(이름 · 슬러그 · 설명)이고, 닫으면 포커스가 그 단추로 돌아온다. 이것이 만드는 길 하나라 거른 결과가 0 이어도 · 목록을 불러오는 중에도 · 조회에 실패해도(실패 알림은 위에 그대로) · 목록이 비어도 선다. 위 줄은 목록이 하나 이상일 때만 선다. 검색 · 거름 · 정렬은 주소의 `?q=&role=&sort=` 다(기본값은 싣지 않는다 — 뒤로 가기로 돌아오면 남는다). 검색 글은 칸이 들고 주소에는 싣기만 한다 — 한글 조합 중에는 주소를 안 고치고(끝낸 글을 싣는다), 주소가 칸 밖에서 바뀌면(뒤로 가기 · 사이드바 «프로젝트») 칸이 따른다. 칸이 주소를 읽으면 위치 갱신이 전이라 조합이 걸음마다 굳고 빠른 입력이 글자를 잃는다. **카드 전체가 에디터로 가는 링크다** — 이름 링크를 카드 상자만큼 늘인 것이라(주소 복사 · 새 탭의 자리도 그대로) 카드 어디를 눌러도 열리고, 마우스를 올리면 테두리가 주색이 되고 오른쪽 아래에 화살표가 서며, 키보드 포커스는 카드 둘레에 링을 그린다. 카드마다의 주색 단추는 없다 — 화면의 강조된 동작은 «프로젝트 추가» 카드 하나다. 카드는 그 이름 · **내 역할 표지** · 설명(두 줄까지 · 없으면 자리째 비운다 — 빈 상태 문구를 안 넣는다) · 아래 줄에 «멤버 N명 · 최근 수정(상대 시각)», 바닥 줄에 슬러그(작은 글 · 한 줄 · 넘치면 줄임표 — 사람이 고르는 단서가 아니라 이름 밑에서 뺐다)와 **«공통코드»** · **«설정»**(아이콘 + 글의 작은 보조 단추 둘 · 높이 36px · 모든 역할 — 공통코드 화면 · 프로젝트 설정으로 — 아이콘만으로는 뜻을 못 읽고 `title` 은 터치 기기에서 안 보인다)이다. 작은 단추는 늘인 링크 안이 아니라 그 위에 선 형제다(누를 수 있는 것 안에 누를 수 있는 것을 두지 않는다). 셋의 접근 이름은 «<이름> 열기»(보이는 글은 이름) · «<이름> 공통코드» · «<이름> 설정»이다(작은 단추는 `title` 도 같은 글). **최근 수정**은 프로젝트 행과 그 페이지들 가운데 가장 늦게 바뀐 시각이다(api README 「프로젝트 응답 형태」). 목록이 비면 추가 카드 밑 점선 상자에 «참여 중인 프로젝트가 없습니다» 와 ««프로젝트 추가» 카드로 첫 프로젝트를 만드세요», 거른 결과가 없으면 추가 카드 밑에 «검색 결과가 없습니다». 이름 · 슬러그 · 설명은 목록에서 고치지 않고, **목록에서 지우지 않는다**(삭제는 프로젝트 설정의 위험 구역이다).
- **공통코드**(`/projects/:id/codes` — 에디터 머리 `…` · 프로젝트 카드에서 연다) — 머리는 빵부스러기 «프로젝트 › <이름>» · 제목 «<이름> 공통코드» · 오른쪽 «에디터 열기». 위 줄의 «그룹 만들기», 왼쪽 **그룹 목록**(이름 · 키 · 항목 수 · 쓰는 노드 수 · 줄 «…» — 이름 바꾸기 · 위로 · 아래로 · 삭제 — 그 위의 **찾기 칸**이 이름 · 키의 부분 일치로 거른다 · 대소문자를 가리지 않는다 · 친 글은 화면만 들고 주소에 싣지 않는다 · 맞는 것이 없으면 «맞는 그룹이 없습니다» · 고른 그룹이 걸러져도 오른쪽은 그대로 · 넓은 창에서는 목록 칸이 따로 구르고 창 높이에 붙는다)과 오른쪽 **상세**(고른 그룹의 항목 표 — 차례 · 코드값 · 이름 · 사용 여부 · 쓰는 노드 수 · 줄 «…»(이름 바꾸기 · 사용 안 함으로 / 사용으로 · 위로 · 아래로 · 삭제) · «항목 추가»)이고, 고른 그룹 · 항목은 주소의 `?group=` · `?item=` 이며, 그 밑이 **사용처**(제목 «쓰는 곳» 곁에 «<그룹 · 항목 이름> · 페이지 N · 노드 M» — 고른 그룹 · 항목을 가리키는 노드를 페이지 · 모듈마다 접을 수 있는 묶음(이름 · 노드 수)으로 묶고, 줄은 타입 · 표시 이름 · 조상 이름(그 노드에 가까운 둘 — 더 깊으면 앞을 «…» 로 줄인다)이다 — 같은 이름의 노드를 조상으로 가른다 · 내부 노드 id 는 안 보인다. 페이지 줄은 에디터의 그 페이지 · 그 노드로 가는 링크 `?node=<id>` 이고 모듈은 글이다). 창 1100px 아래에서 목록 · 상세가 위아래로 접히고 900px 아래에서 표가 카드가 된다. 키 · 코드값은 만들 때만 적는다(그 뒤로 못 바꾼다 — 줄 «…» 에 «이름 바꾸기» 만 있다). 쓰이는 그룹 · 항목을 지우면 묻는다 — 쓰는 곳 수 · 첫 다섯 곳 · «참조가 끊깁니다 — 그 노드는 묶을 때의 글과 끊김 표지로 남습니다.» 안 쓰이면 묻지 않고 지운다. 쓰이는지는 «삭제» 를 누른 때 서버에 다시 물은 사용처로 정한다(화면의 사용 수는 연 때의 값이다) — 그 조회가 실패하면 지우지 않고 말한다. 읽기는 viewer 이상, 쓰기는 editor 이상이다(viewer 에게는 쓰기 단추가 없다). 이 화면은 룸에 안 들어, 남의 쓰기는 자기 쓰기 뒤 다시 읽기 · 새로고침에 보인다(설정 화면과 같다).
- **프로젝트 설정**(`/projects/:id/settings`) — 머리는 빵부스러기 «프로젝트 › <이름>» · 제목 «<이름> 설정» · 오른쪽 «에디터 열기». 절은 **일반**(이름 · 슬러그 · 설명) · **테마** · **멤버** · **위험 구역**이고, 내용 위 **가로 탭 목록**(«설정 절»)이 한 번에 한 절을 보인다(넘치면 줄 안에서 민다). 고른 절은 주소의 `?section=general|theme|members|danger` 다 — 없거나 모르는 값 · 그 사람에게 없는 절이면 일반이고, 탭을 고르면 주소를 바꾸되 뒤로 가기 기록을 안 쌓는다. 키보드는 고른 탭만 Tab 정지점이고 ←→(↑↓) · Home · End 로 옮기면 그 절이 열린다 — 키로 고른 탭은 넘친 줄 안으로 굴러 다 보인다(누른 탭은 안 굴린다). 안 고른 절도 그려 둔 채 감추므로 탭을 옮겨도 저장 안 한 값 · 열린 확인이 남는다. 절은 카드다. owner 가 아니면 일반 · 테마는 읽기로만 서고 위험 구역은 탭째 없다.
  - **테마** — 위에서부터 **지금 테마 요약**(이름 `id@판` — 이름은 테마의 것(숨기지 않은 최신판의 이름 · 고르개의 테마 칸과 같다)이고 숨기지 않은 판이 없을 때만 고정한 판의 이름이다 · 기본값과 다른 토큰 수 · 숨기지 않은 더 높은 판이 있으면 «새 버전») · **테마 바꾸기**(owner — 테마 · 버전 고르개와 그 밑의 인라인 확인) · **토큰**(무리마다 탭 — 고른 탭의 칸만 폭에 맞춘 여러 열 격자로 · 탭 줄 오른쪽에 «전부 기본값으로» · «토큰 저장» · 사유가 든 칸이 있는 탭은 이름에 표지) · 그 밑에 **미리보기**(내용 칸 폭을 다 쓴다 — iframe 폭이 상자 폭을 따른다). 미리보기 머리의 «컴포넌트» · «예제 페이지» 가 보기를 고르고, 예제 페이지면 장 이름 줄(대시보드 · 주문 목록 · 주문 상세 · 주문 등록)이 선다 — 예제 안의 이동 · 팝업은 미리보기 안만 바꾸고(바깥 주소 · 기록은 그대로) 팝업은 상자의 보이는 구간에 선다. 고른 보기 · 장은 그 화면에 있는 동안 남는다(토큰을 고쳐도). 미리보기 틀은 창 높이에 묶여 안에서 스크롤한다 — 창 960px 아래에서는 창 높이의 60% 다. 그래서 절의 길이는 갤러리가 아니라 토큰 칸의 길이다.
  - **멤버** — 모든 역할이 목록(이름 · 이메일 · 역할)을 본다. owner 에게만 초대(이메일 + 역할) · 역할 바꾸기 · 제외가 열린다. 비활성 사용자의 줄에는 «비활성» 표지가 선다(멤버 행은 그대로다 — 「권한 모델」). 서버의 거절(없는 계정 · 비활성 계정 · 이미 멤버 · 마지막 owner 를 강등 · 제외)은 서버의 문장으로 그 자리에 말한다. 제외는 두 번 누르기 확인이다 — 묻던 단추는 그 자리에서 «취소»가 되고 확정은 줄 아래 한 줄에 선다(첫 누름 자리에 확정이 서지 않아, 따로 누른 두 번이 멤버를 빼지 않는다). 내가 나를 강등 · 제외하면 페이지가 프로젝트를 다시 읽는다. 남이 나를 바꾼 것은 다시 읽기 전까지 모르고 서버가 막는다 — 설정 페이지는 실시간 룸에 없다.
  - **위험 구역** — 탭 목록의 끝 · owner 에게만. **프로젝트 삭제**는 프로젝트 이름을 그대로 쳐야 확정이 열린다(두 쪽을 NFC 로 편 뒤 견준다 — 대소문자 · 공백은 그대로 가른다). 지우면 프로젝트 목록으로 간다.
- **계정 설정**(`/account`) — 절(카드) 셋을 위아래로: **내 정보**(이름 · 이메일 — 읽기만 · 라벨 | 값 줄이고 줄 사이 16px), **비밀번호 바꾸기**(지금 · 새 · 새 확인 — 새 둘이 다르면 요청을 안 낸다. 지금 비밀번호가 틀렸다는 답은 칸 곁의 문장이고 로그아웃이 아니다. 바꾸면 다른 기기의 로그인이 끊긴다고 말한다 — 「권한 모델」), **API 토큰**(내 토큰 전부 — 「권한 모델」). 옛 주소 `/tokens` 는 `/account` 로 넘긴다.
- **관리자 › 사용자 · 초대 링크 · 프로젝트 · 기록**(`/admin/users` · `/admin/invites` · `/admin/projects` · `/admin/audit`) — 인스턴스 관리자의 화면(「권한 모델」). 넷 다 위 줄(검색 · 거름 · 단추) · 표 하나 · 줄 «…» 이고, 창 900px 아래에서는 줄이 카드(칸마다 이름표)로 접힌다. 서버의 거절은 서버 문장 그대로 말하고, 쓰기가 끝나면 목록을 다시 받는다 — 마지막에 시작한 조회의 답만 싣고, 다시 받기가 실패하면 앞 표를 둔 채 그 실패를 한 줄로 말한다(쓰기의 실패와 같은 문장이면 한 줄). 줄 «…» 의 쓰기는 한 번에 하나이고, 누른 채인 Enter · Space 의 반복은 메뉴가 버린다(에디터의 «…» 도 같은 부품이다). **사람이 지은 글(이름 · 이메일 · 링크 이름 · 프로젝트 이름)은 방향을 격리해 그린다** — 관리자 칸 넷 · 비밀번호 재설정 화면 · 프로젝트 설정의 멤버 칸이 문장 · 표 · 고르개 · 기록 줄에 넣을 때 FSI … PDI 로 감싸고 안의 내장 · 덮어쓰기 · 격리 글자를 걷는다(`apps/web/src/shell/isolate.ts` — 이름 안의 U+202E 가 확인 상자의 문장을 뒤집거나 남의 이름처럼 보이지 않게). 접근 이름 · `title` 에는 감싸지 않는다.
  - **사용자** — 이름(관리자 표지) · 이메일 · 상태 · 속한 프로젝트 수 · 가입(초대 링크로 들어왔으면 그 이름) · 마지막 접속. 이름 · 이메일 검색과 상태 거름, «초대 링크 만들기». 줄 «…»: 비활성이면 «다시 활성화» 하나, 활성이면 «재설정 링크 만들기»와 — 자기 줄이 아니면 — «관리자로 지정»/«관리자 해제» · «비활성화». 비활성화 · 관리자 해제는 확인 상자를 거친다(비활성화는 «로그인 · 세션 · API 토큰이 바로 끊깁니다»와 그 사람이 마지막 활성 owner 인 프로젝트 수를 말한다). 끝나면 거둔 링크 수 · 활성 owner 가 없어진 프로젝트 수를 한 줄로 말한다.
  - **초대 링크** — 이름(메모) · 종류(한 번 / 여러 명) · 만료 · 가입 수 · 상태(사용 중 / 만료 / 거둠 / 다 씀) · 만든 사람. 만들기 상자는 이름 · 종류(기본 «한 번») · 만료(일 — 기본 7, 1 – 90)다. 쓸 수 있는 줄에만 «…»(«거두기» — 확인 상자)가 있다. **목록에는 «복사»가 없다** — 원문은 서버에 없다(해시만).
  - **새 링크(초대 · 재설정)는 만든 자리에서 한 번 보인다** — 링크 칸 · «복사» · 만료와 «이 링크는 지금만 보입니다 — 이 화면을 떠나면 다시 볼 수 없습니다». 원문은 화면의 상태에만 있고 브라우저 저장소 · 주소에 남지 않는다. 문서를 떠나면(`pagehide`) 상자를 걷는다 — 같은 탭에서 다른 문서로 갔다 «뒤로» 와도(bfcache) 원문이 되살지 않는다. 새 링크가 같은 자리에 서면 상자는 새로 선다(앞 링크의 «복사했습니다» 를 물려받지 않는다). 주소는 화면이 짓는다(`<origin>/invite/<원문>` · `<origin>/reset/<원문>`).
  - **프로젝트** — 이름 · 슬러그 · owner(비활성 owner 는 표지) · 멤버 수 · 최근 수정. 활성 owner 가 없는 프로젝트가 있으면 위에 그 수의 경고와 그것만 보는 거름이 선다. «owner 넘기기»는 그 줄에만 있고, 활성 사용자(나 포함) 하나를 고른다. 이름은 내가 멤버인 프로젝트만 에디터로 가는 링크다.
  - **기록** — 언제 · 누가(서버 명령이면 «서버 명령») · 무엇(행동마다 한 줄 — 대상 사람 · 프로젝트 · 링크 이름과 세부). 최신이 위이고 행동 · 사람으로 거른다. «더 보기»가 다음 쪽을 잇는다.
- **테마 관리**(`/admin/themes` — 사이드바 «관리자 › 테마») — 인스턴스 관리자의 화면(「권한 모델」). 위에 도구 줄(«테마 패키지 올리기» · «스타터 템플릿 받기»), 그 밑에 왼쪽 **테마 목록**(테마마다 이름 · id · 판 수 · 숨긴 판 수)과 오른쪽 **상세**(고른 테마의 판 줄 — 판 · 이름 · 숨김 표지 · 크기 · 올린 때 · 올린 이 · «미리보기» · «숨김/되살림» — 와 그 밑의 **미리보기**)다(창 900px 아래에서는 목록이 위). 고른 것은 주소의 `?theme=<id>&version=<판>` 이고, 없거나 모르면 첫 테마 · 그 테마의 최신(숨기지 않은 판의 최대)이다. 올리기가 성공하면 올린 판을 고른다. **미리보기는 프로젝트 설정의 토큰 미리보기와 같은 부품이다** — 번들은 숨은 realm iframe 에 번들 로더로 싣고 갤러리는 same-origin 캔버스 iframe 에 그린다(관리자 화면 문서에 테마 코드를 싣는 길이 따로 없다). 토큰은 기본값이고, 숨긴 판도 미리 본다(서버가 숨긴 판의 manifest · 파일도 낸다).
- **로그인**(`/login`) — 창 가운데 카드 하나다(바탕은 셸 바탕색 · 카드가 창보다 길면 바탕이 구르고 위가 안 잘린다): «wirebound» · 한 줄 설명 «화면 설계서 작업 공간에 로그인합니다» · 이메일 · 비밀번호(라벨 13px 진한 글 · 칸 높이 40px) · «로그인» · 바닥에 «비밀번호를 잊었으면 관리자에게 재설정 링크를 요청하세요»(관리자의 «재설정 링크 만들기» — 아래 «관리자 › 사용자»). 다시 재는 법: `apps/web/build-test/ui-login.test.ts`.
- **초대 가입**(`/invite/<원문>`) · **비밀번호 재설정**(`/reset/<원문>`) — 로그인 화면과 같은 꼴(가운데 카드)의 링크 화면이다(로그인한 사람은 프로젝트 목록으로 간다). 먼저 링크를 확인하고, 못 쓰는 링크면 폼 대신 서버의 한 문장을 그린다. 가입은 이메일 · 이름 · 비밀번호 · 확인 넷이고 성공하면 곧바로 로그인된 채 프로젝트 목록으로 간다(이미 있는 이메일은 서버 문장). 재설정은 누구의 비밀번호인지 보이고 새 비밀번호 · 확인 둘이며, 바꾸면 로그인 화면으로 가 «비밀번호를 바꿨습니다» 한 줄을 보인다. 비밀번호는 8 자 이상이고 확인이 다르면 보내지 않는다(「권한 모델」 «초대 링크» · «재설정 링크»). 비밀번호 칸(로그인 · 가입 · 재설정)은 칸 안 오른쪽에 «보기» 토글을 둔다 — 누르면 친 글이 보이고 이름이 «<칸 라벨> 숨기기» 로 바뀌며, 포인터로 눌러도 포커스는 칸에 남는다. 칸은 브라우저 자동 채움의 `autocomplete`(로그인 `email` · `current-password`, 새 비밀번호 `new-password`)를 단다.

**번호 마커** — 코멘트를 달면 다음 번호가 자동 부여된다. 수동 변경이 가능하고, "문서 순서대로 재번호" 버튼으로 일괄 정리한다. 번호는 노드 `id`에 묶여 있어 노드를 옮겨도 코멘트가 따라간다.

**코멘트 토큰** — 코멘트 본문에 페이지 · 번호 · 공통코드를 가리키는 토큰을 넣는다. 토큰은 본문 글 안의 `[보이는 글](wb:<종류>/<대상>)` 이다 — `wb:page/<pageId>` · `wb:comment/<pageId>/<nodeId>`(그 노드의 번호 — 같은 노드의 코멘트 묶음) · `wb:code/<그룹 키>` · `wb:code/<그룹 키>/<퍼센트 인코딩한 코드값>`. 서버는 토큰을 모르고 글로 저장한다(본문 길이 한도도 원문으로 센다). 모르는 종류 · 꼴이 깨진 토큰은 원문 글자 그대로 보인다. 보이는 글은 대상이 끊겼을 때만 쓰는 대체 글이고, 달기 · 고치기를 저장할 때 화면이 지금 이름으로 다시 적는다.

- **풀린 모양** — 읽는 자리(코멘트 탭 · «컴포넌트» 탭의 «코멘트» 묶음 · 뷰 모드 · HTML 번들 · PPTX · MCP `get_page` · `wireb page get`)마다 토큰을 지금의 이름 · 번호로 푼다(`packages/schema` 의 `resolveCommentTokens` 한 벌): 페이지는 제목(같은 제목이 둘이면 «메뉴 › 제목»), 같은 페이지의 번호는 «#3», 다른 페이지의 번호는 «회원 목록 #3», 코멘트가 다 지워져 번호가 걷힌 노드는 «회원 목록 › 노드 이름», 공통코드는 그룹 · 항목의 이름이다. 페이지 제목 · 메뉴 경로 · 끊긴 토큰의 대체 글은 방향을 가둬(`isolateBidi`) 이름의 방향 제어 글자가 뒤따르는 글을 뒤집지 않는다 — 대체 글(라벨)에는 이름을 그대로 적고 보일 때만 가둔다. 노드째 지워졌거나 다른 프로젝트 · 권한 밖이면 끊김 — 대체 글 + 흐린 «찾을 수 없음» 이고 누를 수 없다. 끊김의 까닭은 가르지 않는다(가르면 남의 프로젝트 id 의 존재가 샌다). 풀기는 그 코멘트가 사는 프로젝트의 자료로만 하고, 읽는 자리에 날 id 를 보이지 않는다.
- **풀 자료** — 셸이 프로젝트의 번호 색인(`GET /api/projects/:projectId/comments/index` — 페이지 제목 · 메뉴 경로, 코멘트가 달렸거나 토큰이 가리키는 노드의 번호 · 이름 · 토큰을 푼 첫 코멘트 앞머리)과 공통코드 표를 든다. 열린 페이지는 그 문서로 풀어 재번호 · 편집이 곧바로 보인다. 색인은 코멘트 신호(번호를 바꾼 재번호 포함) · `menu-changed` · `codes-changed` · 다시 붙음 · 페이지를 옮길 때 다시 읽는다 — 남이 다른 페이지에서 문서 편집으로 번호를 바꾼 것(번호 든 노드를 지움 등)은 다음 다시 읽기까지 옛 번호로 보인다(이동은 id 라 그대로 맞는다).
- **이동** — 토큰을 누르면 그 자리로 간다(뷰 모드 · viewer 도): 페이지는 그 페이지를 열고, 번호는 그 페이지를 열어 그 노드를 고른 뒤 «코멘트» 탭의 그 묶음으로 굴려 잠깐 강조하며(`?node=<id>&comment=1`), 공통코드는 공통코드 화면의 그 그룹 · 항목이다(`?group=<키>&item=<값>`).
- **자동완성** — 새 코멘트 · 고치는 상자에서 `#` 를 치면(줄 머리 · 공백 · 여는 괄호 뒤) 후보 목록이 상자 밑에 선다: 이 페이지의 번호 · 다른 페이지 · 다른 페이지의 번호 · 공통코드 그룹 · 항목. 이어 친 글로 거른다(이름 · 노드 이름 · 첫 코멘트 · 그룹 키 · 코드값). ↑ ↓ 로 옮기고 Enter · 누름으로 고르면 `#…` 자리가 토큰 원문이 된다 — 넣으면 본문 한도를 넘는 고름은 넣지 않고 말한다. Escape 는 닫고 친 `#…` 를 보통 글로 둔다. **`#` 를 친 입력에서만 연다** — 캐럿을 옮겨 이미 든 `#`(보통 글 `#12` · 든 토큰의 라벨) 뒤에 서는 것으로는 안 열려 거기서 친 Enter 는 줄을 바꾸고, 토큰 원문 안에 친 `#` 로도 안 연다. 한글 조합 중에는 열지도 고르지도 않고 조합이 끝난 뒤 거른다. 입력 칸은 글 상자 그대로라 고칠 때 토큰은 원문으로 보인다.

---

## 10. 권한 모델

| 역할 | 가능한 일 |
|---|---|
| **owner** | 전부 + 멤버 초대/역할 변경, 프로젝트 삭제, 스냅샷 복원, 프로젝트의 테마 바꾸기 · 토큰 고치기 |
| **editor** | 메뉴·페이지·컴포넌트·코멘트·상호작용 편집(하위째 지우는 메뉴 삭제 포함 — 안전망 스냅샷이 함께 남는다), 공통코드 표 편집, 스냅샷 생성 (복원 불가) |
| **viewer** | 조회 전용 — 편집·코멘트 모두 불가. API 토큰 발급은 된다(토큰은 발급자의 권한을 넘지 않는다). 자기 개인 모듈(§11.1)의 저장 · 이름 · 삭제와 프로젝트 모듈을 개인 모듈로 복사하는 것도 된다 — 설계서가 아니라 그 사람의 데이터다 |

- 사용자 인증은 **HttpOnly 세션 쿠키**다. 쿠키에는 랜덤 토큰이 실리고 서버는 그 sha256 해시만 `sessions`에 보관한다. WebSocket 핸드셰이크도 같은 쿠키를 쓰므로 REST와 WS의 인증 경로가 하나다. 세션 행을 지우면 열려 있는 WS 연결의 권한도 즉시 회수된다. 계정이 생기는 길은 둘이다 — `migrate`가 환경변수로 만드는 시딩(새로 세운 서버의 첫 관리자)과 인스턴스 관리자가 만든 **초대 링크로 하는 가입**(아래). 링크 없이 계정을 만드는 웹 · API 길은 없다.
- 권한 체크는 REST와 WebSocket이 **동일한 가드 함수**를 쓴다.
- WS는 룸 참가 시 한 번, 각 patch 수신 시 한 번 확인한다(연결 도중 권한 회수 대응).
- 쓰기는 커밋 직전에 같은 트랜잭션 안에서 권한과 자격(세션·토큰)을 다시 본다. 잠금을 기다리는 동안 강등·제외되거나 로그아웃·토큰 폐기가 커밋되거나 세션의 수명이 다하면 그 쓰기는 가드와 같은 답(403·404·401)으로 되돌아간다. 예외는 자기 API 토큰의 폐기다 — 권한을 줄이는 쓰기라 되돌리지 않는다(되돌리면 멤버에서 빠진 뒤에도 남는 토큰이 다시 멤버가 될 때 되살아난다).
- 토큰 인증은 그 토큰의 마지막 사용 시각을 적는 갱신이 행을 찾아야 선다. 폐기와 겹친 요청은 그 갱신에서 폐기의 커밋을 기다렸다가, 토큰이 지워졌으면 401 로 끝난다 — 읽기에는 커밋 직전의 재확인이 없으므로 폐기된 토큰의 읽기를 막는 자리가 여기다.
- 세션 인증도 그 세션의 마지막 접속 시각을 적는 갱신이 행을 찾아야 선다. 로그아웃 · 세션 삭제가 요청이 세션을 읽은 뒤에 커밋되면 그 요청은 401 로 끝난다 — 지워진 세션으로 읽기가 답하지 않는다.
- 프로젝트 멤버가 아닌 사용자에게는 **404**를 준다(프로젝트 존재 자체를 숨긴다). 멤버지만 역할이 모자라면 **403**이다.
- **이메일 존재 여부는 로그인 경로에서만 감춘다.** 로그인 실패는 "없는 계정"과 "틀린 비밀번호"를 구분하지 않고 응답 시간도 맞춘다 — 미인증 상태에서 무제한 시도가 가능한 유일한 표면이기 때문이다. 반면 **멤버 초대의 404/409**는 이메일이 가입되어 있는지를 그대로 드러낸다. 이는 인지된 트레이드오프다: 초대는 계정이 있어야 도달할 수 있고, wirebound는 팀이 자체 호스팅하는 설계 도구이지 공개 가입 서비스가 아니다. "없는 계정/이미 멤버"라는 명확한 안내가 열거 방지보다 값지다. 인증된 사용자가 빈 프로젝트를 만들어 임의 이메일을 조회할 수 있다는 뜻이므로, 계정 발급이 통제되지 않는 배포에서는 이 결정을 재검토한다.
- **로그인은 시도 수를 제한한다**(비밀번호 바꾸기의 지금 비밀번호 시도도 같은 기록이다 — 아래). 키는 계정(정규화한 이메일)과 요청의 주소(IPv6 는 /64) 둘이고, 창(15분) 안에 계정 10 번 · 주소 30 번을 넘으면 비밀번호를 견주지 않고 429 + `Retry-After`로 답한다. 시도는 견주기 **전에** 세므로 동시에 몰린 요청도 한도 수만큼만 scrypt 를 돈다. 성공은 두 키에서 제 자리만 걷고 앞선 실패는 안 지운다 — 계정의 실패를 지우면 그 지움이 남의 다음 답에 보여 «그 사이 주인이 로그인했다 = 있는 계정»이 샌다. 막힌 동안은 옳은 비밀번호도 429 다 — 받아 주면 막힌 키에서 비밀번호를 맞혀 보는 창구가 남기 때문이고, 그 대가로 남이 틀린 비밀번호를 보내 내 새 로그인을 창 동안 막을 수 있다(이미 로그인한 세션 · 토큰은 그대로다). 막힌 키는 서버에 손이 닿는 사람이 명령으로 먼저 푼다 — 준 계정(또는 주소)의 기록만 걷는다. 명령은 api 가 연 유닉스 소켓(api 를 띄운 사용자만 들어가는 디렉터리)으로 보내고, api 의 TCP 포트에는 그 입구가 없다 — 인가가 파일 권한이다. 그래서 명령도 붙기 전에 api 와 같은 조건으로 그 자리(주인 · 권한 · 링크 아님)를 본다 — 공유 `/tmp` 에서는 남이 그 자리를 먼저 만들어 이메일을 받고 가짜 답을 낼 수 있다. 푼 것은 두드리는 쪽의 다음 답에 보인다(사람이 친 명령 한 번에 한 번 선다). 없는 계정도 같은 판정이다 — 키가 계정 행이 아니라 이메일 글자라 코드 · 문장 · 시간이 같다. 기록은 api 프로세스의 메모리에 있다(프로세스가 여럿이 되면 한도가 그 수만큼 곱해진다). 키 수에는 상한이 있고, 넘으면 창 안의 기록이 가장 적은 키부터 버린다 — 새 키로 표를 채워 막힌 계정의 기록을 씻지 못하게 하고, 주인의 성공이 버리는 차례를 바꾸지 않게 한다. 주소는 소켓 주소이고, 앞단 뒤에서는 그 앞단을 `TRUST_PROXY`로 믿게 해야 사람마다 갈린다.
- **비밀번호는 계정 설정에서 지금 비밀번호를 내고 바꾼다**(`POST /api/auth/password`). **세션으로만 부른다** — API 토큰으로 부르면 401 이다(프로젝트 밖 라우트라 토큰이 사람을 채우지 않는다 · 토큰은 프로젝트 범위이고 계정 자격을 바꾸지 않는다). 지금 비밀번호를 견주는 시도는 **로그인과 같은 한도 기록 · 같은 두 키**(그 사람의 이메일 · 요청 주소)에 센다 — 훔친 세션이 비밀번호를 맞혀 보는 창구가 되지 않게. 바꾸기의 실패는 로그인 한도에, 로그인의 실패는 바꾸기 한도에 함께 세이고, 막힌 동안은 옳은 지금 비밀번호도 429 다. 틀리면 로그인 실패와 같은 401 · 같은 문장에 이슈 `wrong-password` 를 싣고 세션은 그대로다(화면은 그 이슈로 «세션 끝»과 가른다). 새 비밀번호의 규칙 · 해시는 재설정 명령과 같다. **바꾸면 이 세션만 남기고 그 사람의 다른 세션을 모두 지운다** — 지운 세션의 WS 는 로그아웃과 같은 길로 곧바로 닫힌다. **API 토큰은 남는다** — 비밀번호와 따로 발급한 자격이고, 거두는 길은 계정 설정의 토큰 절이다. 쓰기는 커밋 직전에 세션을 다시 본다(위 쓰기 규칙 — 그 사이 로그아웃했으면 401 이고 아무것도 안 바뀐다).
- **로그인은 견준 해시가 아직 그 사람의 해시일 때만 세션을 낸다.** 로그인은 트랜잭션 밖에서 비밀번호를 견준 뒤 세션을 넣으므로, 그 사이 비밀번호 바꾸기 · 재설정이 커밋되면 옛 비밀번호로 낸 세션이 그 쓰기의 «다른 세션을 끝낸다» 뒤에 태어나 남는다. 그래서 세션 삽입이 사용자 행을 그 해시 조건으로 다시 읽고(그 행을 고치는 쓰기의 커밋을 기다리는 모드로 — 커밋 안 된 갱신을 지나 옛 값을 읽는 모드면 그 쓰기의 세션 삭제와 커밋 사이에 낀다), 0 행이면 틀린 비밀번호와 같은 401 이다. 한도에는 실패로 센다 — 낸 비밀번호가 세션을 낼 때 이미 그 사람의 것이 아니다.
- **노드 잠금은 역할 밖의 막음이다**(「소프트 잠금」). 남의 잠긴 서브트리를 건드리는 편집은 역할이 되어도 423 이다. 편집 묶음은 연산마다 잠긴 자리를 따라가며 견주고(앞 연산이 민 좌표 · `move` 의 뺀 뒤 좌표), 서버의 2차 방어와 화면이 편집을 미리 묻는 자리(끌어 놓기 · 컴포넌트 목록의 «넣기» 단추 · 되돌리기 · 다시 실행 · 붙이기 · 복제 · 여럿을 고른 판의 지우기 · 잘라내기 · 일괄 속성 · 고른 것이 바뀌어 내려가는 칸의 초안)가 같은 함수를 부른다. 그 판정을 거치지 않는 편집 입구는 코멘트 번호 · 복원 · 가져오기다.
- API 토큰은 **발급자의 권한을 상속**한다. editor가 만든 토큰으로는 스냅샷 복원이 안 된다. 토큰 스코프는 프로젝트 단위다.
- **그림은 해시를 안다고 읽을 수 없다** — 읽기는 그 프로젝트(개인 몫은 그 사람)의 소유 행이 있어야 선다(§11.4). 올리기는 editor 이상(세션 · 그 프로젝트의 토큰), 읽기 · 목록은 viewer 이상, 가져오기(`claim`)는 세션만이다(토큰은 프로젝트 하나의 스코프라 출처를 읽을 자격이 없다).
- 토큰은 **세션으로만** 발급·조회·폐기한다(토큰으로 토큰을 다루지 않는다). 프로젝트 안에서는 자기가 만든 토큰만 보고 거두고, 계정 아래에서는 **자기 토큰 전부를 프로젝트를 가리지 않고** 보고 거둔다 — 멤버에서 빠진 프로젝트에 남은 토큰(다시 멤버가 되면 산다)까지다. 그 줄에는 프로젝트의 이름을 싣지 않는다(빠진 뒤의 이름을 숨긴다 — 비멤버에게 프로젝트를 숨기는 규칙과 같다). 계정 설정의 «API 토큰» 절이 그 길이다.

- **인스턴스 관리자**는 프로젝트 역할과 별개인 표시다(`users.is_instance_admin`). 하는 일은 테마 패키지 업로드 · 버전 숨김과 되살림 · 스타터 템플릿 내려받기, 그리고 사람을 들이고 내보내는 것(초대 링크 · 비활성화 · 재설정 링크 · 관리자 지정 · 해제 · 활성 owner 없는 프로젝트의 owner 넘기기)이다. 프로젝트 권한을 넓히지 않는다 — 모든 프로젝트를 목록으로 보지만 멤버가 아니면 내용(페이지 · 메뉴 · 스냅샷 · 내보내기)을 여는 라우트를 지나지 못하고, 하는 프로젝트 쓰기는 owner 넘기기 하나다. 내용에 닿는 정상 길 둘(자기에게 owner 넘기기 · 남의 재설정 링크 쓰기)은 막지 않고 **관리자 기록**에 남긴다. 관리자를 주는 길은 서버의 명령(`admin grant|revoke` — 관리자가 0 명일 때 되살리는 길)과 시딩(`SEED_USER_ADMIN`)과 **이미 관리자인 사람의 API** 다 — 관리자가 아닌 사람이 요청으로 관리자가 되는 길은 없다. 올라온 테마 코드는 같은 origin 에서 신뢰 코드로 돌기 때문이다. 자기 자신은 해제 · 비활성화하지 못하고, 해제 · 비활성화는 요청자가 커밋 순간에도 관리자일 때만 서므로 관리자가 0 명이 되지 않는다. 관리자 판정은 요청마다 DB 에서 읽는다. 관리자 쓰기는 **사용자 행 → 자격** 차례로 다시 본다 — 비밀번호 바꾸기 · 재설정이 사용자 행 → 그 사람의 다른 세션 차례로 잡으므로, 반대 차례면 같은 사람의 다른 세션이 낸 관리자 쓰기와 서로를 기다리는 고리가 선다. 사용자 행 · 링크 행을 고치는 관리자 쓰기는 그 재확인을 쓰기 **앞**에 두고(대상 행과 요청자 행을 id 순으로 먼저 잡는다), 테마 쓰기는 쓰기 뒤에 둔다 — 링크 쓰기가 «링크 행 → 사용자 행» 이 되면 그 사람의 비활성화(«사용자 행 → 링크 행»)와 고리다. 모든 관리자 쓰기는 같은 트랜잭션에서 관리자 기록을 남긴다(되돌아간 행동은 기록도 없다). 관리자 라우트 · 패키지 읽기 라우트는 `:projectId` 가 없어 세션으로만 부른다(토큰은 프로젝트 범위다).
- **초대 링크.** 관리자가 이름 · 종류(한 번 / 여러 명) · 만료(1 – 90 일, 기본 7 일)를 골라 만든다. 원문은 만든 응답에만 실리고 해시만 저장한다 — 목록에서 다시 복사할 수 없다. 링크를 연 사람은 이메일 · 이름 · 비밀번호로 계정을 만들고 곧바로 로그인된다. **사람의 이름(1 – 80자)과 링크 이름(1 – 60자)은 숨는 글자를 받지 않는다**(400) — 제어(C0 · DEL · C1) · 방향 제어(U+061C · U+200E · U+200F · U+202A – U+202E · U+2066 – U+2069) · 폭 없는 글자(U+200B – U+200D · U+2060 – U+2064 · U+FEFF) · 줄 · 문단 구분(U+2028 · U+2029). 표는 `apps/api/src/auth/hidden-chars.ts` 하나이고 시딩(`SEED_USER_NAME`)도 지난다. 이미 든 이름은 그대로 두고 화면이 격리한다(위 «관리자 › …»). 쓸 수 있는 링크는 거두지 않았고 · 만료 전이고 · `single` 이면 가입 0 이고 · 만든 사람이 지금 활성 관리자인 것이다. 못 쓰는 넷(없음 · 만료 · 거둠 · 다 씀)은 같은 404 · 같은 문장이다. 가입은 링크 행을 잡고 판정하므로 한 번짜리 링크로 동시에 둘이 가입해도 하나만 선다. 이미 있는 이메일은 409 다. 가입 · 재설정 쓰기는 로그인과 같은 시도 한도에 센다(링크 원문 · 이메일을 맞혀 보는 판). 링크는 계정까지만이다 — 프로젝트에 넣는 것은 멤버 초대다.
- **비활성화.** 관리자가 사람을 끄면 같은 트랜잭션에서 그 사람의 세션 · API 토큰을 전부 지우고, 관리자 표시를 지우고, 그 사람이 만든 아직 쓸 수 있는 초대 · 재설정 링크와 그 사람에게 만든 재설정 링크를 거둔다. 커밋 뒤 그 사람의 WS 연결을 로그아웃과 같은 길로 닫는다. 로그인은 틀린 비밀번호와 같은 401 이다 — 세션 삽입이 비활성 표시를 해시와 같은 문장에서 보므로, 견준 뒤 · 넣기 전의 로그인도 세션을 못 남긴다. 멤버 행은 그대로이고(다시 켜면 돌아온다) 멤버 목록이 «비활성» 을 싣는다. 비활성 사용자는 멤버로 새로 넣지 못한다. 마지막 활성 owner 를 꺼도 막지 않고 그런 프로젝트 수를 알린다 — 관리자가 owner 를 넘긴다. 다시 활성화는 표시만 지운다(비밀번호 그대로 · 관리자 아님).
- **재설정 링크.** 관리자가 활성 사용자 한 사람에게 만든다(24 시간 · 한 번 · 새 링크가 앞 링크를 막는다). 쓰면 재설정 명령과 같은 함수로 비밀번호를 바꾸고 그 사람의 세션을 전부 지우고 WS 를 닫는다(API 토큰은 그대로다).

테마 바꾸기를 owner 로 둔 이유는 테마가 프로젝트 전체 페이지의 외형을 한 번에 바꾸는 전역 자원이기 때문이다. 페이지마다의 레이아웃(`layout`)은 문서 편집이라 editor 가 바꾼다.

---

## 11. 모듈 · 가져오기 / 내보내기

### 11.1 모듈

**모듈은 넣는 노드 묶음이고 소유자가 둘이다** — 모양은 `{ id, name(1 ~ 60자), nodes, createdBy, createdAt, updatedAt }` 이고 설명 칸은 없다. 고치기는 이름 바꾸기 · 삭제뿐이다 — 내용을 바꾸려면 새로 저장하고 옛것을 지운다(엔드포인트 · 오류 표는 `apps/api/README.md`).

| | 개인 모듈 | 프로젝트 모듈 |
|---|---|---|
| 소유 | 사람 하나(`createdBy` 가 소유자) | 프로젝트 |
| 보이는 곳 | 그 사람이 여는 모든 프로젝트의 «모듈» 탭 — 같은 프로젝트의 다른 멤버에게는 안 보인다 | 그 프로젝트의 모든 페이지 · 멤버 전부 |
| 읽기 · 쓰기 | 소유자 본인만 · 역할과 무관하다(viewer 도 저장 · 이름 · 삭제). 남의 것은 «없다»(404)와 같은 답이다 | 목록은 viewer 이상, 저장 · 이름 · 삭제는 editor 이상 |
| 자격 | 세션만 — API 토큰은 프로젝트 단위 스코프라 닿지 않는다 | 세션 · 그 프로젝트의 API 토큰 |
| 수명 | 프로젝트 삭제 · 멤버에서 빠짐 · 역할 바뀜이 건드리지 않는다(사용자와 함께 지워진다) | 프로젝트와 함께 지워진다 |

- **저장** — 구조 트리 줄 `…` «모듈로 저장…»(§9 «트리의 줄 행동» — 상자 안에서 개인 · 프로젝트를 고른다). 담는 것은 고른 노드이고 `Page` 는 담을 수 없다(§5 카탈로그 표의 `Page` 줄 — 서버가 422 `nested-page`). **저장할 때 걷는 것** — 번호(`marker`) · **상태 보임(`visibility`)**(모듈에는 상태가 없다) · **묶음 밖 노드를 가리키는 상호작용 동작**(페이지 대상 · 빈 대상 · 묶음 안 노드를 가리키는 것은 남는다 — 동작이 다 빠진 상호작용은 상호작용째 빠진다) · **«화면 상태 바꾸기» 의 상태 대상 동작**(기본으로 바꾸는 것은 남는다 — 모듈에는 상태가 없다). 화면의 상자와 서버(`POST …/modules` · `POST /api/me/modules`)가 같은 거름(`@wirebound/schema` 의 `moduleNodesForSave`)을 지나 — 화면을 안 지나는 본문(MCP · CLI)에도 같은 규칙이 걸린다. 노드 `id` 는 저장에서 그대로다. 코멘트는 노드에 없으므로 따라가지 않는다. 개수 상한은 없다.
- **넣기** — 하단 판 «모듈» 탭(§9 «하단 판의 탭»)의 «넣기» · 끌어 놓기. 넣을 수 있는 판(편집 모드이고 editor 이상)에서만이다. 자리는 컴포넌트 카드와 같다. 넣을 때 노드 `id` 를 새로 짓고(같은 모듈을 두 번 넣어도 겹치지 않는다), 넣는 페이지에 없는 노드 · 이 프로젝트에 없는 페이지를 가리키는 동작을 빼고 그 수를 정보 통지로 말한다(붙이기와 같은 거름 — 페이지는 id 가 아니라 메뉴 경로 · 제목으로 견주므로 다른 프로젝트에서 저장한 개인 모듈도 같은 경로의 페이지가 있으면 그 동작이 남는다). 넣은 노드는 보임 없이 들어간다 — 모든 상태에서 보이고 지금 고른 상태와 무관하다(저장 앞에 보임이 남은 묶음도 넣기가 걷는다). 같은 까닭으로 «화면 상태 바꾸기» 의 상태 대상(기본 말고)은 넣는 페이지에 같은 id 의 상태가 있어도 빼고 센다. 넣은 노드 전부를 고르고 편집 하나다(되돌리기 한 번). 넣기 직전에 그 모듈을 다시 읽는다 — 지워졌으면(404) 넣지 않고 «이 모듈은 지워졌습니다»를 말하고 그 목록을 다시 읽는다.
- **복사** — 개인 모듈 카드의 «프로젝트 모듈로 복사»(지금 연 프로젝트로 · editor 이상) · 프로젝트 모듈 카드의 «개인 모듈로 복사»(viewer 이상). 원본을 다시 읽고(지워졌으면 넣기와 같은 404 길) 같은 이름 · 같은 노드로 대상 쪽에 **새로 저장한다** — 새 `id` · 복사한 사람이 `createdBy` · 새 시각이고 원본과 이어지지 않는다(원본을 고치거나 지워도 사본은 그대로). 저장과 같은 거름 · 한도 · 권한을 지난다(viewer 의 «프로젝트 모듈로 복사» 는 서버가 403). 옮기기는 없다. 끝나면 대상 목록을 다시 읽고 «'이름' 을 프로젝트 모듈로 복사했습니다»(«… 개인 모듈로 …»)를 정보 통지로 말한다.
- **그림** — 개인 모듈로 저장 · 프로젝트 모듈을 개인 모듈로 복사하면 든 그림을 먼저 개인 몫으로 가져오고(§11.4 «가져오기»), 하나라도 못 가져오면 저장하지 않고 «그림 N개를 개인 몫으로 가져오지 못해 저장하지 않았습니다 — 개인 그림 공간이 찼습니다»(읽을 수 없으면 «— 이 프로젝트에서 읽을 수 없습니다»)를 말한다 — 그림 없이 남기면 다른 프로젝트에서 넣을 때 깨진다. 개인 모듈을 넣거나 프로젝트 모듈로 복사하면 그림을 개인 몫에서 이 프로젝트로 가져오고, 못 가져온 것은 비운 채 넣고 붙이기와 같은 문장으로 말한다. 프로젝트 모듈은 같은 프로젝트라 할 일이 없다.
- **실시간 방송은 없다** — 목록은 탭을 열 때와 저장 · 이름 · 삭제 · 복사 뒤에 다시 읽는다.
- **프로젝트 밖의 관리 화면은 없다** — 개인 모듈은 에디터의 «모듈» 탭에서만 다룬다(프로젝트가 하나도 없는 사람은 볼 수 없지만 데이터는 남는다). MCP · CLI 에는 모듈 도구가 없다.

모듈은 사람이나 프로젝트가 소유한 노드 묶음이고 테마를 바꿔도 그대로다. 테마는 넣을 묶음을 싣지 않는다(§6.0). 페이지를 통째로 바꾸는 템플릿은 두지 않는다 — 비우려면 지우고 모듈을 넣는다.

### 11.2 페이지 JSON

```jsonc
{
  "wireboundVersion": "1",
  "page": { "title": "회원 목록", "layoutRef": "admin-lnb", "description": "..." },
  "schema": { "version": 3, "root": { "id": "n_root", "type": "Page", "children": [ ... ] } },
  "comments": [ { "nodeId": "n_7f3a", "body": "검색 조건은 AND 결합" } ]
}
```

`schema`는 root 노드가 아니라 문서 봉투(`{ version, root }`)다 — 버전이 없으면 가져오기가 옛 버전 문서를 마이그레이션 없이 지금 버전으로 받는다(§13.1). 코멘트의 번호는 `schema` 안의 노드가 든다(§4.3) — `comments[].marker`는 받지 않고 400으로 거절한다. 두 자리에 적으면 둘이 어긋날 때 무엇을 믿을지 정할 규칙이 없다.

가져오기 시 노드 id를 재발급하되 코멘트의 `nodeId`와 상호작용의 `target`을 함께 리매핑한다. `schema` 의 화면 상태 목록(`viewStates`)은 그대로 싣는다 — 상태 id 는 페이지 안의 이름이라 다시 짓지 않는다. 노드의 공통코드 참조(`code`)도 그대로 싣고 표는 싣지 않는다(표는 프로젝트의 것이다) — 가져온 프로젝트의 표에 없는 키는 끊긴 참조로 들어온다(§4.3). `wireboundVersion`은 스키마 마이그레이션 진입점이다.

에디터에서는 메뉴 트리의 줄 행동이 이 파일을 주고받는다(「설계서 화면 구조」) — 페이지 줄 `…` 의 «JSON 내보내기»는 **그 줄의** 페이지를(열린 페이지가 아니다) 서버에서 문서와 코멘트를 같은 순간에 읽어 **모달**에 보인다 — 읽는 동안은 «불러오는 중…», 다 읽으면 받을 파일과 같은 글(이름 · 내용)을 읽기 전용 글 상자에 싣고 «클립보드에 복사» · «파일로 받기» 를 둔다(닫기는 상자 머리의 «닫기» · Escape). 복사의 성공 · 실패를 상자 안에 한 줄로 말하고, 복사하지 못하면(보안 문맥이 아님 · 거절) 글 상자 전체를 골라 포커스를 둔다. 읽기의 실패도 상자 안의 문장이다(세션이 끊긴 실패는 로그인 화면으로 간다). 열린 페이지는 보낸 편집의 답을 받은 뒤에 읽는다. 읽는 동안 그 항목은 꺼진다. 메뉴 줄 `+` 의 «JSON 에서 가져오기…»는 그 메뉴 밑에 새 페이지를 만드는 대화 상자를 연다(덮지 않는다). 둘 다 편집 모드이고 editor 이상일 때만 있다 — 설계서를 읽는 사람의 내려받기는 «프로젝트 내보내기»(§11.3)다.

### 11.3 HTML 정적 번들

```
wirebound-export/
  index.html            첫 페이지의 사본
  pages/
    관리자-회원-목록.html
    관리자-회원-상세.html
  assets/
    shell.css           뷰어 셸의 CSS
    views.css           SDK 기본 뷰의 CSS
    runtime.js          내보내기 런타임 — react · 카탈로그 · renderer · theme-sdk 런타임
    theme/theme.js      프로젝트가 고정한 패키지의 파일 그대로 (theme.css · assets/** 도) — 테마가 있을 때
    tokens.css          프로젝트 토큰 값 → CSS 변수 — 테마가 있을 때
    images/<id>.<ext>   페이지가 든 그림 가운데 그 프로젝트가 가진 것(§11.4)
  codes.html            «공통코드» 장 — 공통코드 표가 있을 때
```

`exporter`는 셸(트리 네비게이션 · 설명 · 코멘트 · 상호작용 목록)만 서버에서 짓고, 목업은 페이지에 실린 문서 JSON 을 **내보내기 런타임이 브라우저에서** 그린다 — 캔버스와 같은 `renderer` · 같은 시트 차례(기본 뷰 → 테마 → 토큰) · 같은 상호작용 런타임 · 같은 마커 좌표 함수라 결과가 어긋날 수 없다. 모든 스크립트가 일반 스크립트라 `file://` 로 열어도 돈다. 테마 번들을 못 쓰면(등록 없음 · 다른 판 · 뷰가 던짐) 기본 뷰로 그리고 까닭을 상태 줄과 `<html data-wb-failed>` 에 적는다 — 등록을 못 쓴 판은 테마 시트도 걷는다(기본 뷰에 테마 CSS 가 얹힌 반쪽 화면을 내지 않는다). PPTX 의 화면은 Chromium 이 이 번들의 페이지를 셸 없이(`#wb-screen`) 열어 찍는다 — 설계는 `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「내보내기와 PPTX」.

**공통코드** — 표가 있는 프로젝트는 페이지 데이터에 표를 싣고(`codes`) 런타임이 묶인 노드를 표의 이름으로 그린다(캔버스와 같은 풀기 · PPTX 화면도 같은 번들 페이지를 연다). 우측 칸의 코멘트 줄 · 상호작용 문장도 그 노드를 표의 이름으로 부른다(PPTX 의 오른쪽 칸 · 노트도). 끊김 표지는 그리지 않는다(셸의 표지라 번들에 없다 — 대체 글로 선다). 뿌리의 `codes.html` 이 «공통코드» 장이다 — 그룹마다 코드값 · 이름 · 사용 여부 표와 «쓰는 곳»(번들에 든 페이지 링크 · 노드 수 — 번들에 모듈은 없다)을 런타임 없이 정적 글로 싣는다(장에는 그룹 키 · 코드값을 싣는다 — 개발자가 옮겨 적는 자리다). 좌측 트리는 페이지 목록 밑에 «공통코드» 절을 하나 더 세워 그 장을 가리킨다. 표가 빈 프로젝트는 페이지 데이터의 `codes` · 장 · 그 절이 없다.

**팝업** — 페이지 데이터에 그 페이지에서 «팝업 열기» 로 닿는 팝업 페이지의 문서를 싣는다(타겟 → 문서 · 그림 경로 — 팝업이 연 팝업까지 닫힌 셈으로 한 벌씩). 번들은 `file://` 로도 열려 다른 파일을 못 읽으므로 싣는다. 런타임은 그 문서를 덮개 층(§8.3)으로 쌓고 페이지를 옮기지 않는다 — 실리지 않은 타겟(화면 페이지 · 둘 이상 · 없는 페이지)은 이동 링크의 길 그대로다. 이동 링크의 표(`hrefs`)는 그 페이지 문서와 거기 실린 팝업 문서들이 겨누는 타겟을 싣는다 — 덮개 위 팝업 안의 «이동» · 화면 대상 «팝업 열기» 도 그 표로 그 페이지 파일로 옮긴다. 닿는 팝업이 없는 페이지는 데이터에 그 키가 없다. 팝업 페이지 자체도 제 파일로 실리고(상자만 — 캔버스와 같다) 목차의 그 줄 앞에 «팝업» 표지를 단다.

**코멘트 토큰**(«설계서 화면 구조» 의 «코멘트 토큰») — 우측 칸의 코멘트 본문은 토큰을 번들에 실린 페이지로 푼다. 산 토큰은 링크다: 페이지는 그 페이지 장, 번호는 그 장의 코멘트 칸 그 노드의 줄(`#wb-marker-<노드 id>`), 공통코드는 «공통코드» 장의 그룹 · 항목(`codes.html#wb-code-<키>` · `#wb-code-<키>--<코드값의 UTF-8 16진>`). 번호 닻으로 장이 열리거나 해시가 그리로 바뀌면 런타임이 «코멘트» 탭을 고르고 그 줄로 굴린다 — 그 노드의 줄이 없으면(번호가 걷힌 노드) 목업의 그 노드로 굴리고, 그 노드도 지금 상태에 안 그려졌으면 장 머리에 남는다. 이 해시는 고른 화면 상태를 안 건드린다(`#state=` 아닌 해시 — 아래 «화면 상태가 있는 페이지» 문단). 스크립트가 없는 판은 장 머리다. 끊긴 토큰은 링크 없이 대체 글 + «찾을 수 없음» 이다. PPTX 는 슬라이드 사이 링크를 걸지 않고 풀린 글만 싣는다(끊김은 `대체 글 (찾을 수 없음)`).

**화면 상태가 있는 페이지**(문서의 `viewStates` 가 비어 있지 않은 페이지)는 목업 위에 전환기(`select#wb-export-state` — «기본»과 트리 차례의 상태 · 하위 상태는 깊이마다 빈칸 둘을 앞에 둔다)를 싣는다. 페이지 JSON 이 모든 노드와 보임을 들고 있어 런타임이 고른 상태에서 숨은 노드를 빼고 다시 그린다(하위 상태는 부모의 보임을 물려받는다) — 고른 상태는 주소 해시 `#state=<id>` 에 실려 링크로 나뉘고(기본이면 해시를 비운다), 해시를 바꾸면 그 상태로 그리며, 목록에 없는 id 는 기본이다. `#state=` 아닌 해시(번호 닻 · 빈 조각 `…#`)는 고른 상태를 안 건드린다 — 규칙 없는 `Link`(기본 뷰가 `<a href="#">`)를 누르면 주소가 빈 조각으로 바뀌지만 상태는 그대로다. 조각 없는 주소(뒤로 가기로 상태 해시가 빠진 판)는 기본이다. 다시 재는 법: `apps/web/build-test/bundle-link-state.test.ts`. 상호작용 «화면 상태 바꾸기»(§8.3)가 바꾼 상태도 전환기 · 해시에 실린다(전환기로 고른 것과 같은 주소). 코멘트 마커는 그 노드가 그려진 상태에서만 선다. 첫 탭(«페이지 정보» — 에디터 뷰 모드의 탭과 같은 이름)은 설명 아래 «화면 상태» 목록(트리 차례 · 깊이 · 이름 · 설명 — 설명이 없으면 이름만)을 싣는다. PPTX 는 상태를 싣는 자리가 없어 상태 설명도 싣지 않는다 — 노트의 절 이름도 탭(«페이지 정보»)이 아니라 «페이지 설명»이다(코멘트 · 상호작용 절은 탭 이름 그대로). 상호작용 · 코멘트 탭은 상태마다 갈리지 않는다 — `only` 보임 노드의 이름에 상태를 붙인다(«'승인 버튼'(관리자 상태)»). 상태가 없는 페이지는 전환기도 해시도 싣지 않는다 — 첫 탭 이름 말고는 화면 상태가 없는 번들과 바이트가 같다(`packages/exporter/test/bundle-stateless-bytes.test.ts`). 화면 모드(`#wb-screen` — PPTX)는 전환기를 숨기고 기본 상태를 찍는다.

### 11.4 그림

**그림은 자리표시자가 드는 바이트다** — 노드는 `image: <sha256>` 만 들고 바이트는 DB 의 덩이(`asset_blobs` · `bytea`)에 한 벌, 누가 가졌는지는 소유 행(`project_assets` · `personal_assets`)이 든다(§4.2). 같은 그림을 두 번 올리면 같은 덩이에 소유 행만 있다. 저장 자리를 DB 로 둔 까닭: 배포 compose 에 볼륨이 안 늘고 `pg_dump` 백업이 그림을 함께 들며, 소유 행과 바이트가 한 트랜잭션에 서서 «행은 있는데 파일이 없다» 판이 없다(대가는 DB 볼륨이 그림만큼 자라는 것 — 한도가 묶는다). 라우트 · 오류 표 · 환경 변수는 `apps/api/README.md`.

- **권한은 소유 행이 가른다 — 해시를 안다고 읽을 수 없다.** 프로젝트 P 의 읽기는 `project_assets(P, sha)` 가 있어야 서고, 남의 그림 · 없는 해시 · 지워진 덩이는 같은 질의 · 같은 404 다(개인 몫도 같다 — 남의 개인 그림과 없는 해시가 같은 답). 남의 프로젝트 그림의 해시를 문서에 적어도 그 프로젝트에 소유 행이 없으면 캔버스 · 번들에서 «그림을 불러올 수 없음» 이다.
- **받는 꼴** — PNG · JPEG · WebP · GIF · SVG 를 머리 바이트로 가른다(`Content-Type` · 확장자를 안 믿는다 — 꼴 밖은 415). 크기는 머리에서 읽고(SVG 는 `viewBox` · `width`/`height`) 가로 · 세로 8192px · 넓이 4천만 px 를 넘으면 422 다. SVG 의 스크립트는 `<img>` 로 그리면 안 돈다(캔버스 · 번들 · 캡처가 다 `<img>` 다). 주소를 직접 열어도 안 돌게 읽기 응답 전부에 `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` · `X-Content-Type-Options: nosniff` · `Cross-Origin-Resource-Policy: same-origin` · `Content-Disposition: inline` 을 싣는다. 내보낸 번들의 SVG 파일을 `file://` 로 직접 열면 그 로컬 파일 origin 에서 돈다(쿠키 · 세션이 없다). 캐시는 `private, max-age=31536000, immutable` — 내용이 이름이다.
- **한도** — 파일 하나 5 MB(413 · «그림은 5 MB 까지 올릴 수 있습니다(이 파일 7.2 MB)») · 프로젝트 200 MB(그 프로젝트 소유 행의 덩이 크기 합 · 409 `asset-quota`) · 사람 하나(개인 몫) 100 MB(409). 환경 변수로 바꾼다. 같은 덩이를 두 프로젝트가 가지면 두 프로젝트에 다 센다. 한도는 소유자마다의 자물쇠 안에서 세어 둘이 동시에 올려도 넘지 않는다.
- **가져오기(`claim`)** — 노드를 다른 몫으로 옮기는 자리(다른 프로젝트로 붙이기 · 개인 모듈 저장 · 개인 모듈 넣기 · 개인 ↔ 프로젝트 복사)가 부른다(§9 «클립보드» · §11.1). 출처(다른 프로젝트 · 내 개인 몫)에서 **읽을 수 있는** 그림만 대상에 소유 행을 더한다 — 바이트는 안 옮긴다. 다른 프로젝트가 출처면 그 프로젝트의 멤버여야 한다(역할은 가리지 않는다). 못 옮긴 그림의 까닭은 «읽을 수 없음»(출처에 없음 · 멤버가 아님 · 출처가 지워짐을 가르지 않는다 — 가르면 남의 그림이 있는지 샌다)과 «한도» 둘이다.
- **지우기 — 그림은 프로젝트 · 사람과 함께만 지운다.** «아무 노드도 안 쓴다» 로 지우려면 페이지 · 모듈 · 스냅샷 payload · 편집 이력(되돌리기가 지운 노드를 되살린다)을 다 세야 해서 낱개 삭제를 두지 않는다. 프로젝트를 지우면 소유 행이 CASCADE 로 빠지고, 마지막 소유 행이 빠진 덩이는 그 트랜잭션 안에서 함께 지워진다 — 남(다른 프로젝트 · 사람)이 가진 덩이는 남는다. 쓰지 않는 그림이 한도를 먹는 판은 «올린 그림에서» 의 쓴 용량으로 보인다.
- **다른 기능** — 같은 프로젝트의 붙이기 · 복제 · 모듈 · 스냅샷 · 복원은 id 를 그대로 든다(그림은 프로젝트와 함께만 지워지므로 복원한 문서의 그림이 늘 있다). 페이지 JSON 은 그림을 안 싣는다 — 다른 프로젝트에 가져오면 그림이 깨진다. HTML 번들은 문서가 든 그림 가운데 그 프로젝트가 가진 것만 `assets/images/<id>.<ext>` 로 싣고 페이지마다 그 파일에서 본 상대 주소 표를 데이터에 싣는다(§11.3). PPTX 는 번들 페이지를 찍으므로 그림이 함께 든다 — 준비 신호가 그림(`img`)이 실리거나 깨지기를 기다린다(한도 5s). 그림 바이트에는 실시간 방송이 없다 — 그림을 고르는 것이 prop 편집이라 그 편집이 방송된다. MCP 에는 올리기 도구가 없다 — 이미 올린 그림의 id 를 `patch_page` 로 적을 수 있다(`/llms.txt`).

---

## 12. LLM 연계 (P9)

### 12.1 리포 바인딩

개발 리포 루트에 `.wirebound.json`을 둔다.

```jsonc
{
  "server": "https://wirebound.example.com",
  "projectId": "prj_a1b2"
}
```

이 파일은 "이 리포가 어느 설계 프로젝트에 대응하는가"만 선언한다. 리포에서 `wireb`나 MCP를 쓰면 프로젝트를 매번 지정할 필요가 없어진다.

설계서 페이지와 소스 파일을 잇는 매핑은 두지 않는다. 대상 프로젝트의 기술 스택과 디렉터리 구조가 제각각이라 wirebound가 규칙을 가정할 수 없기 때문이다. 에이전트는 페이지 경로(`관리자/회원/목록`)로 설계서를 조회하고, 그 리포에서 어느 파일이 대응하는지는 리포의 컨벤션에 따라 스스로 판단한다.

### 12.2 MCP 도구

| 도구 | 용도 |
|---|---|
| `list_pages` | 프로젝트 메뉴/페이지 트리 조회 |
| `get_page` | 페이지 스키마 + 코멘트 + 상호작용 문장 조회 |
| `patch_page` | 사람 편집과 동일 경로의 수정 (baseSeq 필수) |
| `add_comment` | 구현 중 발견한 이슈를 설계서에 기록 |
| `validate` | lint 규칙 실행 |
| `list_codes` | 공통코드 표 + 사용 수 조회 |
| `code_usage` | 공통코드 그룹 · 항목의 사용처 조회 |
| `edit_codes` | 공통코드 그룹 · 항목 만들기 · 고치기 · 지우기 |

`get_page` 의 노드 개요(`nodes[]`)는 노드마다 이름(`name` — 문장이 부르는 이름이라 별칭이 있으면 별칭 · `only` 보임 노드면 «(관리자 상태)»를 붙인다) · 별칭(`alias` — 있을 때만) · 구조 트리 줄과 같은 글(`rowLabel` — `타입 (별칭) 요약`) · 상태 보임(`visibility` — 노드 자신의 것 그대로, 있을 때만) · 공통코드 참조(`code` — 묶인 노드만: 참조 그대로 + 표로 푼 값 `resolved`(대표 글은 항목 이름 · 끊겼으면 `null`, 선택 위젯은 그릴 선택지 이름 · 고른 것 · 빠진 고른 값) — 표를 담지 않은 옛 판 payload 는 `resolved: null`)를 싣고 묶인 노드의 이름 · `rowLabel` 은 표의 이름이다. 페이지는 화면 상태 목록(`viewStates` — `parent` 로 트리 · 없으면 빈 목록)을 싣는다. 판 1 문서는 읽을 때 판 2 로 옮겨 보인다.

화면 상태 전용 쓰기 도구는 없다 — `patch_page` 의 JSON Patch 로 목록(`/viewStates`)과 노드 보임(`/…/visibility`)을 고친다. 꼴(상태 더하기 · 하위 상태 더하기 · 이 상태에서만 보이기 · 상태 지우기)은 MCP 스킬 문서(`packages/mcp/skill/SKILL.md` 「화면 상태를 다룰 때」)가 가르치고, 그 예를 api 케이스가 글자 그대로 저장 경계에 보낸다(`apps/api/test/view-states-skill.test.ts`). `validate` 는 `info` 등급(«lint 규칙»)을 `infos` 로 따로 센다.

`get_page` 의 코멘트(`comments[]`)는 원문(`body`) · 토큰을 푼 글(`text`) · 같은 글에 토큰의 대상을 괄호로 붙인 것(`resolved` — `회원 목록 #3 (comment:<pageId>/<nodeId>)` · 끊김은 `대체 글 (찾을 수 없음)`)을 함께 싣는다 — 에이전트가 그 대상을 다음 호출에 쓴다. `add_comment` 의 본문은 같은 토큰 꼴을 받는다(«설계서 화면 구조» 의 «코멘트 토큰» · MCP 스킬 문서 「회신할 때」).

공통코드 도구 셋은 스냅샷이 아니라 지금 표를 부른다(`GET …/codes` · `…/codes/usage` · `…/codes/usage-counts` — 사용 수 · 사용처는 서버가 센다). `edit_codes` 는 `ops` 를 차례로 보내고 첫 거절에서 멈춘다 — 표에 이력이 없어 묶음을 되돌리지 않으므로 응답의 `applied` 가 이미 된 수다. 원소의 꼴은 보내기 전에 다 읽어 틀린 원소가 있으면 하나도 안 보낸다.

### 12.3 CLI

```
wireb login                        토큰 발급 및 저장
wireb init                         .wirebound.json 생성
wireb pull                         프로젝트 스냅샷을 로컬 JSON으로 (읽기 전용)
wireb page get <경로> [--json]     페이지 조회
wireb lint [경로]                  규칙 검증
wireb export --format html|pptx -o dir  정적 번들 · PPTX 파일 생성
wireb codes list [--json]          공통코드 표와 쓰는 노드 수
wireb codes usage <키> [코드값]    그 그룹 · 항목을 쓰는 노드
wireb codes set-group <키> …       그룹 만들기(이름 필수) · 고치기
wireb codes set-item <키> <값> …   항목 만들기 · 고치기(--name · --order · --active|--inactive)
wireb codes delete <키> [코드값]   그룹(항목째) · 항목 지우기
```

`wireb page get` 의 사람 출력은 코멘트 본문의 토큰을 풀린 글로만 싣고(대상 없음), `--json` 은 MCP `get_page` 와 같이 `body` · `text` · `resolved` 를 싣는다.

터미널로 나가는 글(`--json` 포함)은 라벨 · 제목 · 코멘트 본문처럼 설계서를 고치는 누구나 넣을 수 있는 글을 싣는다 — `\n` · `\t` 를 뺀 C0 · DEL · C1(`U+009B` 는 CSI) · 줄 · 문단 구분 · 방향 제어 글자를 `\uXXXX` 글로 바꿔 낸다(`packages/cli/src/terminal-safe.ts` — `--json` 은 읽은 값이 같다). 파일에 쓰는 바이트는 안 바뀐다.

### 12.4 lint 규칙

"LLM을 통한 검증"의 실체다. 규칙은 `schema` 패키지에 두어 웹·CLI·MCP가 공유한다.

**설계서 규칙**
- 코멘트가 없는 주요 컴포넌트 (`DataGrid`, `EntryForm`, `SearchForm`)
- 어느 메뉴에도 연결되지 않은 페이지
- 대상 노드 · 화면 상태가 삭제된 상호작용 규칙
- `navigate`/`openModal` 대상 페이지가 존재하지 않음
- `openModal` 이 팝업 페이지가 아닌 페이지를 가리킴 — 경고
- `navigate` 가 팝업 페이지를 가리킴 — 경고
- 화면 페이지의 `closeModal` — 닫을 팝업이 없음 · 경고
- 중복된 코멘트 번호
- `EntryForm` 안에 `Field`가 하나도 없는 등 구조적 공백
- 그려지지 않는 그리드 내용 — 번호 열(`numbering`)의 셀 틀 · 생략 띠 행(`kind: gap`)의 칸
- 제 칸을 가진 그리드 행의 칸 폭 합(위 행에서 내려온 칸 포함)이 잎 열 수와 다름
- 프로젝트 명명 규칙 위반 (설정 가능)
- 목록에 없는 화면 상태를 가리키는 노드 보임 — 경고
- 쓰이지 않는 화면 상태(그 상태 · 하위 상태를 가리키는 보임이 없음) — 정보
- 표에 없는 공통코드 그룹 · 항목을 가리키는 노드 — 오류
- 묶인 선택 위젯이 고른 코드값이 표에 없거나 사용 안 함 — 경고
- 사용 안 함 공통코드 항목을 가리키는 대표 글 — 경고
- 묶인 선택 위젯 그룹의 사용 중 항목이 선택지 한도(30)를 넘음 — 앞 30 개만 그린다 · 경고
- 묶인 선택 위젯 그룹에 사용 중 항목이 없음 — 경고
- 코멘트 본문의 끊긴 토큰(가리키는 페이지 · 번호의 노드 · 공통코드가 없음) — 정보

끊긴 코멘트 토큰은 화면과 같은 풀기(«설계서 화면 구조» 의 «코멘트 토큰»)로 가린다 — 공통코드 토큰은 표가 있을 때만 본다. 공통코드 규칙 다섯은 lint 입력에 프로젝트의 공통코드 표가 있을 때만 돈다. 끊긴 참조만 `error` 다 — 저장은 막지 않지만(검증은 표를 모른다) 그 노드는 표의 이름 대신 묶을 때 적어 둔 글을 그린다.

등급은 `error` · `warning` · `info` 셋이다. `error` · `warning` 은 저장 경계의 등급 그대로이고, `info` 는 lint 만의 «알림»이다 — 고칠 것이 없을 수도 있는 설계의 모양이라 `wireb lint --fail-on warning` 도 그것으로 실패하지 않는다. `wireb lint` 의 요약과 MCP `validate` 의 `infos` 가 따로 센다.

**테마 규칙** — 테마 자체의 결함(manifest · 토큰 · 뷰)은 lint 가 아니라 테마 빌드와 업로드 검증이 막는다(`docs/superpowers/specs/2026-09-27-code-themes-design.md` 「업로드 검증」). lint 는 문서가 프로젝트가 고른 테마와 어긋나는 것을 본다 — `wireb lint` · MCP `validate` 가 `GET /api/projects/:projectId/theme` 으로 그 manifest 를 받고, 못 받으면 이 규칙은 돌지 않고 그렇다고 말한다(`theme-unavailable`).
- 현재 테마에 없는 `variant` — 프로젝트가 고른 테마의 `components` 가 선언한 컴포넌트에서만 본다

### 12.5 스킬

에이전트에게 다음 흐름을 가르친다.

1. 화면 구현 요청을 받으면 `list_pages`로 대상 페이지를 찾는다.
2. `get_page`로 스키마·코멘트·상호작용을 읽는다.
3. 구현한다.
4. 설계와 어긋나거나 결정이 필요한 부분을 `add_comment`로 회신한다.
5. `validate`로 설계서 자체의 결함을 보고한다.

### 12.6 `/llms.txt`

배포한 앱은 `/llms.txt` 를 낸다 — wirebound 를 처음 보는 바깥 에이전트가 읽는 영어 글이다(llmstxt.org 의 꼴: H1 · 인용 요약 · 절). 담는 것은
wirebound 가 무엇인지 · 에이전트를 붙이는 법(도구 짓기 · `wireb init` · `wireb login` 의 토큰 · MCP 등록) · MCP 도구와 인자 · 페이지 문서와
노드 필드 · 상호작용 · 카탈로그(그룹 · 타입 · prop 의 꼴과 기본값 · 상태 prop · 변형을 고르는 prop · 프리셋의 템플릿 — 에디터 팔레트의 장치라 «같은 꼴을 `patch_page` 로 적으라» 와 함께) · REST 요약(토큰 · 오류 봉투 · 고른
프로젝트 라우트)이다.

- **정적 파일이다.** 웹 번들의 `apps/web/public/llms.txt` 를 개발(vite)이 그대로 내고, 빌드가 `dist/` 로 옮겨 운영 입구(`docker/web/Caddyfile`
  의 파일 서빙)가 낸다 — 두 판이 같은 바이트다. api 라우트로 내지 않는다: 요청마다 같은 글이고 인증 · 인스턴스 데이터 · 비밀값이 없어 api 가
  할 일이 없으며, 입구가 이미 정적 파일을 낸다(api 가 죽어도 나간다).
- **인스턴스의 것을 싣지 않는다** — 주소는 «이 파일을 낸 origin» 으로 말하고 프로젝트 · 사용자 · 테마 목록을 싣지 않는다. 모든 서버에서 같은
  글이다.
- **목록은 정의에서 짓는다.** `apps/web/config/llms-txt.ts` 가 `@wirebound/schema`(노드 · 상호작용 · 카탈로그 · 상한)와 `@wirebound/mcp`(도구 표
  · REST 요약 `LLMS_REST_ROUTES`)의 값으로 글을 짓고, 커밋된 파일이 그 글과 다르면 `apps/web/test/llms-txt.test.ts` 가 죽는다(`-u` 로 다시
  짓는다). 카탈로그 · 도구의 사람이 읽을 글은 한국어라 영어 한 줄 설명 표를 따로 두는데, 그 표의 키가 정의와 다르면 짓기가 던진다. REST
  요약은 고른 것이다 — 줄마다 등록된 라우트이고 최소 역할이 가드와 같은지를 `apps/api/test/llms-rest-routes.test.ts` 가 잰다(빠진 라우트는
  안 잰다 — 전부는 `apps/api/README.md` 「엔드포인트」).
- **손으로 쓴 글은 케이스가 재지 않는다** — 머리글 · 붙이는 법(명령 · 자격 파일 자리 · MCP 등록) · REST 의 인증 · 오류 봉투 문장 · 영어 한 줄
  설명의 뜻. 대조 케이스는 정의에서 읽은 값만 따라가므로 CLI 명령 · 인증 규칙을 바꾸는 쪽이 그 줄을 함께 고친다.
- **한 파일로 둔다** — 카탈로그 전체를 실어도 한 번에 읽힐 크기라 `/llms-full.txt` 로 나누지 않는다.

---

## 13. 에러 처리

| 상황 | 응답 | 클라이언트 동작 |
|---|---|---|
| 스키마 검증 실패 | 422 | 낙관적 적용 롤백 후 서버 상태로 재동기화 |
| 잠금 충돌 | 423 `locked` + 점유자 정보 | UI 사전 차단이 1차 방어, 발생 시 안내 — 자동 재시도하지 않는다 |
| baseSeq 불일치 | 409 | 페이지 재조회 후 재시도 |
| 권한 없음 | 403 | WS는 룸에서 강제 퇴장, 읽기 전용 전환 |
| undo 대상 소실 | 클라 사전 검사에 걸리면 에러 아님, 서버까지 오면 409 | 스택에서 제거하고 안내 |
| WS 연결 끊김 | — | 지수 백오프 재연결, 다시 붙으면 연 페이지를 재조회한다 — `head_seq`와 문서가 **둘 다** 같을 때만 가진 판을 둔다(§4.5) |

`baseSeq` 불일치는 **서버가 리베이스하지 않고** 곧바로 409로 돌려준다 — 서버가
리베이스하려면 무엇을 리베이스할 수 있는지(겹치지 않는 경로인지, 같은 서브트리인지)가
먼저 정해져야 한다. 클라이언트 쪽 리베이스(§7.1의 "타인 ops 수신 → 자기 pending 위에
리베이스")는 그와 별개로 클라이언트가 한다.

`undo 대상 소실` 행이 두 갈래인 이유는 §7.3의 undo가 클라이언트 사전 검사(경로 존재
확인)를 전제하기 때문이다. 그 검사를 통과해 서버까지 도달한 요청은 파이프라인에서
`patch-failed`가 되어 409로 나간다(`편집을 적용할 수 없습니다: …`). 어느 쪽이든
클라이언트의 대응은 같다 — 그 항목만 스택에서 버리고 나머지는 그대로 쓴다.

### 13.1 스키마 마이그레이션

컴포넌트 props는 반드시 바뀐다. `schema` 패키지에 버전별 마이그레이션 함수 체인을 두고, 페이지를 읽을 때 최신 버전으로 올려 읽는다. 가져오기와 스냅샷 복원도 같은 경로를 탄다.

```ts
migrations = [
  { from: 1, to: 2, migrate: (doc) => liftStateRegions(doc).doc },  // 상태 영역 → 노드 보임(§4.3 «문서 판 7»)
  { from: 5, to: 6, migrate: (doc) => liftTreeItems(doc).doc },     // 트리 항목 → 계층(§4.3 «문서 판 7»)
  { from: 6, to: 7, migrate: (doc) => liftPageLayout(doc) },        // 페이지 레이아웃(§4.3 «문서 판 7»)
]
```

판 2 → 3(구역) · 판 3 → 4(조합 입력) · 판 4 → 5(그리드)는 이 사슬에 없다 — DB 마이그레이션(`0028-node-zones` · `0029-compose-field` · `0032-list-data-grid`)에만 있어 판 1 · 2 문서는 사슬 끝(판 2)에서, 판 3 · 4 문서는 그 자리에서 «올릴 마이그레이션이 없습니다» 로 멈춘다. 판 5 → 6(트리 항목)은 사슬에 있다 — 새 노드 id 를 짓지 않는 순수 함수라 판 5 로 내보낸 페이지 JSON · 클립보드 봉투 · 판 5 를 보내는 클라이언트가 그대로 들어온다(DB 마이그레이션 `0035-tree-items` 가 같은 함수로 저장된 문서를 옮긴다). 판 6 → 7(페이지 레이아웃)도 같은 까닭으로 사슬에 있다(`0037-page-layout` 이 같은 함수를 부른다). 그래서 위 판 1 → 2 줄은 지금 판 7 에 닿는 길이 아니다(DB 마이그레이션 `0025` 와 `0028` 의 스냅샷 옮기기가 그 함수를 직접 부른다 — `0029` 는 판 1 · 2 스냅샷 문서를 먼저 `0028` 의 얼린 함수로 올린다).

`pages.schema_version`에 현재 버전을 기록하고, 마이그레이션이 실행되면 다음 저장 시 갱신한다.

**열린 항목 — 미지원 버전 문서의 복구 경로가 없다(결정 필요).**
저장된 문서의 `version`이 이 프로세스가 아는 `CURRENT_DOCUMENT_VERSION`보다 크면
`migrateDocument`가 던지고, 그러면 `GET .../pages/:pageId` · `PATCH .../ops` ·
`PUT .../schema` **세 경로가 전부 400**이 되어 그 페이지를 API로 되살릴 수 없다.
일어나는 경우는 배포 롤백이나 여러 버전이 같은 DB를 공유하는 롤링 배포다.

`PUT .../schema` 전체 교체는 탈출구가 아니다 — PUT도 편집 파이프라인을 타고, 그
파이프라인이 **저장된** 문서를 먼저 `migrateDocument`에 태우기 때문에 같은 이유로
막힌다. 이것은 모든 스키마 변경이 revision을 남긴다(§3.2 «모든 편집은 같은 파이프라인을
통과한다»)의 직접적인 대가이고, 파이프라인을 우회하는 두 번째 쓰기 경로를 두면 그 원칙이
다시 뚫리므로 두지 않는다.

스냅샷 복원도 탈출구가 아니다 — 복원도 같은 파이프라인을 타고 저장된 문서를 읽어야 하므로
미지원 버전 문서를 되살리지 못한다. 대신 복원은 쓰기 전에 400으로 끊으며 어느 페이지가
어떤 버전이라 막혔는지 말한다(`apps/api/README.md` 「미지원 버전 탈출구」 절).
되살릴지, 되살린다면 어떤 형태인지는 별도 결정이다. 그 전까지는 400 응답이 최소한 원인을
말해 주는 상태로 둔다.

---

## 14. 테스트 전략

| 대상 | 방식 |
|---|---|
| `schema` | **patch/inverse 왕복 속성 테스트** — 임의 편집 시퀀스를 적용한 뒤 역순으로 역적용하면 원본과 정확히 일치해야 한다. 이력 시스템 전체의 안전망 |
| `schema` | zod 검증 경계값, 마이그레이션 체인 |
| `renderer` | 뷰 경로(테마 뷰 · 기본 뷰 · 뷰 예외의 노드 단위 폴백), `data-wb-*` 속성 계약 검증 |
| `themes` | 스냅샷 payload 규격 |
| `theme-sdk` | 기본 뷰가 카탈로그 전부를 덮는지, 뷰 계약(`Root` · `Focus`), 공유 런타임 등록 · 받기 |
| `themes` | manifest 거부 표(참조 · 순환 · 카탈로그 · variant · `patterns` 키), `.wbtheme` 안전성(`..` · 절대 경로 · 링크 · 크기 · 항목 수 · 허용 목록) |
| `theme-kit` | 빌드한 `theme.js` 에 SDK · react 가 묶이지 않음, dev 갤러리의 실브라우저 판(`build-test`), 템플릿 zip 을 풀어 빌드 · 타입검사(저장소 밖 설치는 `WB_TEMPLATE_INSTALL=1`) |
| `api` | 동시편집 통합 테스트 — 두 클라이언트 동시 patch, 잠금 경합, 편집 중 권한 회수, WS 재연결 후 델타 복구 |
| `api` | 권한 매트릭스 (역할 × 엔드포인트) |
| `exporter` | 내보낸 HTML의 DOM과 웹 렌더 DOM의 동등성 검증 |
| e2e | 페이지 생성 → 편집 → 코멘트 → 스냅샷 → 복원 한 줄기 (Playwright) |

patch/inverse 왕복 테스트가 가장 중요하다. undo, 스냅샷 복원, MCP 편집이 전부 이 성질에 의존한다.

---

## 15. 로드맵

| 단계 | 내용 | 완료 시 가능한 것 |
|---|---|---|
| **P0** | 모노레포 + `schema`(노드 타입·zod·patch 유틸) + `renderer` 골격(구조 1종씩) | 스키마 JSON을 넣으면 화면이 그려진다 |
| **P1** | 인증, 프로젝트, 멤버/권한, 메뉴 트리, 페이지 CRUD | 프로젝트와 메뉴 구조를 만든다 |
| **P2a** | 편집 파이프라인 — revision 로그, JSON Patch 엔드포인트, 개인 undo/redo의 서버 쪽 | 편집 이력이 쌓이고 되돌릴 수 있다 |
| **P2b** | 에디터 3분할 셸 — 메뉴·구조 트리, 캔버스, 속성 패널, 낙관적 편집 | 혼자서 설계서를 작성할 수 있다 |
| **P3** | WebSocket 실시간 동기화 + 소프트 잠금 | 여럿이 동시에 작업한다 |
| **P4** | 테마 — 코드 테마 차수 A1 ~ A6(`docs/superpowers/specs/2026-09-27-code-themes-design.md` 「진행 단계」): 뷰 SDK · iframe 캔버스(A1), `.wbtheme` · 작성자 도구(A2), 업로드 · 버전 · 프로젝트 바인딩(A3), 테마 선택 · 토큰 편집 화면(A4), 내보내기(A5), 시스템 테마(A6) | 관리자 외 사이트 형태를 테마로 그리고, 테마를 코드로 짜서 올린다 |
| **P5** | 코멘트/번호 마커 + 상호작용 규칙 + 뷰 모드 | 설계서로서 완성된다 |
| **P6** | 스냅샷 태그/복원 | 버전을 관리한다 |
| **P7** | 모듈 + JSON 가져오기/내보내기 | 반복 작업이 빨라진다 |
| **P8** | HTML 정적 번들 내보내기 | **MVP 릴리스** — 설계서를 배포한다 |
| **P9** | `wireb` CLI + MCP + 스킬 + `.wirebound.json` + lint | 에이전트가 설계서를 읽고 구현한다 |
| **P10** | PPTX 내보내기 (렌더 이미지 방식) | 보고용 산출물을 만든다 |

각 단계는 그 자체로 동작 가능한 상태를 만들고 끝낸다. P2b까지 가면 단독 사용이 가능하고, P8이 1차 릴리스다.

P2를 둘로 쪼갠 이유: P2a는 서버(편집 파이프라인과 이력)이고 P2b는
그 위에 얹히는 에디터 UI다. 테스트 방식이 서로 다르고(vitest + Postgres vs.
컴포넌트 테스트), P2a만으로도 REST로 편집·되돌리기가 동작하는 상태가 된다.

---

## 16. 열린 질문 (구현 중 결정)

- **스냅샷 보관 정책** — 사람이 붙인 태그와 복원의 안전망의 개수 제한 또는 보관 기간. 실사용 데이터가 쌓인 뒤 결정한다(연쇄 삭제의 안전망은 「스냅샷」의 개수 상한을 따른다).
- **revision 로그 압축** — 페이지당 revision이 수만 건이 되면 오래된 구간을 주기적으로 압축한다. 성능 문제가 실제로 관측되면 착수한다.
