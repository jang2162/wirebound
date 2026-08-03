# wirebound 설계 문서

작성일: 2026-08-03
상태: 승인됨 (구현 계획 작성 대기)

---

## 1. 개요

**wirebound**는 관리자 페이지를 중심으로 한 웹 화면 설계 도구다. 프로젝트의 메뉴 트리를 좌측에 두고, 중앙에서 페이지 목업을 확인하며, 우측에서 번호별 코멘트와 상호작용 설명을 읽는다. Storybook이 컴포넌트를 트리로 탐색하게 만든 것처럼, wirebound는 **화면 설계서**를 트리로 탐색하게 만든다.

기존 도구와의 차이는 두 가지다.

1. **목업이 그림이 아니라 데이터다.** 페이지는 컴포넌트 트리 JSON이며, 좌표가 아니라 구조로 표현된다. 따라서 기계가 읽고 검증하고 수정할 수 있다.
2. **LLM 에이전트가 1급 사용자다.** MCP 서버와 CLI가 사람과 동일한 편집 경로를 쓴다. 개발 리포에 `.wirebound.json`을 두면 코딩 에이전트가 설계서를 읽고 구현하며, 어긋난 부분을 설계서에 코멘트로 되돌려준다.

패키지명은 `wirebound`, CLI 명령은 `wireb`다.

### 1.1 대상 사용자

- **기획자 / PM** — 화면을 설계하고 코멘트를 단다. 코드를 쓰지 않는다.
- **디자이너** — 레이아웃과 테마를 잡는다.
- **개발자** — 설계서를 읽고 구현한다. CLI/MCP로 접근한다.
- **코딩 에이전트** — MCP를 통해 설계서를 읽고 구현하며 피드백을 남긴다.

### 1.2 성공 기준

- 기획자가 코드 없이 관리자 화면 설계서 한 벌을 완성할 수 있다.
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
| 스타일 | 쉘(Layout) / 테마(Theme) 분리, 레이아웃이 테마 참조 | 여러 레이아웃이 같은 색감을 공유해야 함 |
| 이력 | JSON Patch 커맨드 로그, 개인 undo 스택, 태그형 스냅샷 | 동시편집 환경에서 누가 무엇을 바꿨는지 추적 가능 |
| 동시편집 | WebSocket 실시간 반영 + 노드 단위 소프트 잠금 | CRDT 없이 설계서 작업에 충분한 협업 수준 |
| 상호작용 | 선언적 트리거→액션 규칙 (고정 액션 목록) | 스크립트 없이 검증 가능, 자동 문장화 가능 |
| 컴포넌트 | 내장 카탈로그 고정 (확장 없음) | 스키마를 닫아두면 검증·렌더링·내보내기가 단순 |
| 권한 | 프로젝트 단위 멤버 초대 (owner/editor/viewer) | 요구된 3종 권한과 1:1, 조직 계층 불필요 |
| LLM 연계 | 서버 API 직결 MCP·CLI, `.wirebound.json` 리포 바인딩 | 파일 동기화 없이 실시간 반영 |
| 내보내기 | HTML 정적 번들 우선, PPTX 후속 | 렌더러 재사용으로 비용이 거의 없음 |
| MVP 범위 | 실시간 동시편집 + 스냅샷 + 상호작용 포함, MCP/CLI 제외 | 협업 도구로서의 핵심을 먼저 완성 |

### 2.1 명시적으로 제외한 것 (YAGNI)

- **반응형 편집** — 관리자 화면이 주 용도이므로 데스크톱 폭 프리셋만 제공한다.
- **자유 좌표 배치** — 레이아웃 규칙 기반 배치만 지원한다.
- **CRDT 실시간 협업** — 소프트 잠금으로 충분하다.
- **컴포넌트 플러그인** — 서버에서 외부 코드 실행은 보안 부담이 크다.
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
  renderer   schema → React 렌더링 (headless, DOM 구조만 생성)
  themes     토큰/컴포넌트 스타일 → CSS 컴파일
  exporter   HTML 정적 번들 생성 (P10에서 PPTX 추가)
  cli        wireb (P9)
  mcp        MCP 서버 (P9)
```

### 3.2 핵심 원칙

**`schema` 패키지가 유일한 진실이다.**
웹 에디터, 서버 검증, HTML 내보내기, MCP가 전부 같은 타입 정의와 같은 검증기를 쓴다. 스키마가 한 곳에만 있으므로 "웹에서는 통과했는데 CLI에서는 실패"하는 상황이 생기지 않는다.

**렌더러는 하나뿐이다.**
`renderer`가 웹 앱의 캔버스와 내보낸 HTML 양쪽을 그린다. 두 개의 렌더 구현이 존재하지 않으므로 결과가 어긋날 수 없다.

**렌더러는 스타일을 갖지 않는다.**
`renderer`는 DOM 구조와 `data-wb-*` 속성만 생성한다. 스타일은 전부 `themes`가 컴파일한 CSS가 담당한다. 테마 교체는 CSS 파일 교체이며, 내보낸 번들에서도 동일하게 성립한다.

**모든 편집은 같은 파이프라인을 통과한다.**
사람의 GUI 편집, MCP의 patch, CLI의 수정이 모두 `검증 → revision 기록 → 브로드캐스트`를 거친다. 우회 경로가 없으므로 이력이 항상 완전하다.

### 3.3 각 패키지의 책임과 의존

| 패키지 | 책임 | 의존 |
|---|---|---|
| `schema` | 노드 타입, props 정의, zod 검증, patch/inverse 생성, 마이그레이션, lint 규칙 | 없음 |
| `renderer` | 스키마 트리 → React 엘리먼트, 상호작용 런타임 | `schema` |
| `themes` | 토큰/컴포넌트 스타일 → CSS 문자열 컴파일, 테마 검증 | `schema` |
| `exporter` | 정적 HTML 번들 생성 | `schema`, `renderer`, `themes` |
| `cli` | 터미널 명령, API 클라이언트 | `schema` |
| `mcp` | MCP 도구 정의, API 클라이언트 | `schema` |
| `apps/api` | 인증, 권한, 영속성, revision, WebSocket | `schema`, `exporter` |
| `apps/web` | 에디터 UI, 실시간 동기화, undo 스택 | `schema`, `renderer`, `themes` |

`schema`가 의존을 갖지 않는다는 점이 중요하다. Node와 브라우저 양쪽에서 동작해야 한다.

---

## 4. 도메인 모델

### 4.1 엔티티 관계

```
User
Project ──┬── ProjectMember (user, role: owner|editor|viewer)
          ├── ApiToken     (name, hash, createdBy, scope=projectId)
          ├── Theme        (name, tokens, componentStyles)
          ├── Layout       (name, schema, themeRef)
          ├── MenuNode     (parentId, order, title)   ← 트리
          │     └── Page   (title, order, layoutRef?, description, schema)
          │           ├── Comment  (marker, nodeId, body, author)
          │           └── Revision (seq, actor, ops[], inverse[], createdAt)
          ├── PagePreset   (name, schemaFragment)
          └── Snapshot     (tag, description, atSeq, payload, createdBy)
```

### 4.2 테이블 정의

```sql
users(id, email, name, password_hash, created_at)

projects(id, name, slug, description, default_layout_id, created_at, updated_at)

project_members(project_id, user_id, role, invited_at)
  PK (project_id, user_id)
  role ∈ ('owner','editor','viewer')

api_tokens(id, project_id, name, token_hash, created_by, last_used_at, created_at)

themes(id, project_id, name, tokens jsonb, component_styles jsonb, updated_at)

layouts(id, project_id, name, schema jsonb, theme_id, updated_at)

menu_nodes(id, project_id, parent_id, title, sort_order, created_at)
  parent_id NULL = 루트

pages(id, project_id, menu_node_id, title, sort_order, layout_id,
      description text, schema jsonb, schema_version int,
      head_seq bigint, updated_at)

comments(id, page_id, marker int, node_id text, body text,
         author_id, created_at, updated_at)

revisions(id, page_id, seq bigint, actor_type, actor_id, actor_label,
          ops jsonb, inverse jsonb, created_at)
  UNIQUE (page_id, seq)
  actor_type ∈ ('user','mcp','cli')

snapshots(id, project_id, tag, description, payload jsonb,
          created_by, created_at)
```

`pages.schema`는 materialized 상태다. 읽기는 항상 이 컬럼 하나로 끝난다. `revisions`는 append-only 이력이며, replay는 감사와 스냅샷 검증 용도로만 쓴다.

`pages.head_seq`는 해당 페이지의 최신 revision seq다. 클라이언트가 patch를 보낼 때 `baseSeq`로 사용한다.

### 4.3 페이지 스키마 노드

```jsonc
{
  "id": "n_7f3a",          // 안정 ID — 코멘트·상호작용·잠금·patch 경로의 공통 앵커
  "type": "List",
  "props": { "columns": ["No", "아이디", "이름"], "rows": 10, "pagination": true },
  "variant": "zebra",      // 테마가 정의한 variant 중 하나 (선택)
  "marker": 2,             // 우측 코멘트 번호 (없으면 코멘트 없음)
  "interactions": [
    { "on": "click", "actions": [ { "type": "setProp", "target": "n_9c1e", "prop": "loading", "value": true } ] }
  ],
  "children": []
}
```

`id`는 생성 시 부여되고 절대 바뀌지 않는다. 노드를 트리 안에서 옮겨도 유지되므로 코멘트와 상호작용 타겟이 따라간다. 가져오기·프리셋 적용 시에만 새 id를 발급하며, 그때 참조도 함께 리매핑한다.

### 4.4 레이아웃

레이아웃은 별도 형식이 아니라 **`Slot` 노드를 하나 품은 같은 스키마 트리**다.

```jsonc
{
  "id": "n_root",
  "type": "Page",
  "children": [
    { "id": "n_hdr", "type": "Flex", "props": { "direction": "row" }, "children": [ ... ] },
    { "id": "n_body", "type": "Flex", "props": { "direction": "row" }, "children": [
        { "id": "n_lnb", "type": "Flex", "props": { "direction": "column", "width": 240 },
          "children": [ { "id": "n_nav", "type": "Tree", "props": { "items": [ ... ] } } ] },
        { "id": "n_slot", "type": "Slot" }
    ]}
  ]
}
```

렌더링 시 페이지 스키마가 `Slot` 위치에 주입된다. "헤더 있음/LNB 있음" 같은 속성은 별도 플래그가 아니라 트리에 해당 노드가 존재하느냐로 표현된다. 그 결과 레이아웃 편집기와 페이지 편집기가 같은 UI를 쓰고, 렌더러도 하나로 끝난다.

레이아웃은 `themeRef`로 테마 하나를 가리킨다. 페이지는 프로젝트 기본 레이아웃을 상속하되 `layoutRef`로 개별 지정할 수 있다.

### 4.5 스냅샷

스냅샷은 **삭제 없는 태그**다.

- 생성: 현재 프로젝트 전체 상태(메뉴·페이지·레이아웃·테마·코멘트)를 `payload`에 압축 저장하고, 각 페이지의 `head_seq`를 함께 기록한다.
- 복원: 이력을 지우지 않는다. 현재 상태에서 스냅샷 상태로 가는 patch를 계산해 **새 revision들로 append**한다. 따라서 복원 자체가 이력에 남고, 복원을 다시 되돌릴 수도 있다.

payload를 통째로 저장하는 이유는 복원 속도 때문이다. revision replay는 페이지 수가 늘면 선형으로 느려지고, 스냅샷은 자주 만들지 않으므로 저장 비용이 문제되지 않는다.

---

## 5. 컴포넌트 카탈로그

카탈로그는 고정이며 프로젝트별 확장이 없다.

| 그룹 | 컴포넌트 | 설명 |
|---|---|---|
| 구조 | `Page` | 루트 노드. 페이지당 하나 |
| | `Slot` | 레이아웃 전용. 페이지가 주입되는 자리 |
| | `Flex` | 가로/세로 배치 |
| | `Grid` | 격자 배치 (열 수, 간격) |
| | `Card` | 제목·본문 영역을 가진 카드 |
| | `Tabs` | 탭 목록과 패널 |
| 데이터 | `List` | 목록/테이블. 컬럼, 행 수, 페이지네이션, 선택 |
| | `Tree` | 계층 목록 |
| | `KeyValue` | 키-값 뷰 (상세 화면용) |
| 입력 | `SearchForm` | 검색 조건 필드 묶음 + 조회/초기화 |
| | `EntryForm` | 등록/수정 폼. 라벨-필드 배치 규칙 |
| | `Field` | 단일 입력요소 (text/number/select/date/dateRange/checkbox/radio/textarea/file) |
| 액션 | `Button` | 버튼. variant(primary/secondary/danger/ghost) |
| | `Link` | 링크. 페이지 이동 대상 지정 가능 |
| 문서 | `Text` | 제목/본문 텍스트 |
| | `Divider` | 구분선 |
| | `Placeholder` | 이미지·차트 등 미정 영역 자리표시 |

`Text`, `Divider`, `Placeholder`는 원래 요구 목록에 없었으나 설계서 작성에 필수적이라 추가했다.

### 5.1 컴포넌트 정의 구조

각 컴포넌트는 한 파일에서 네 가지를 함께 정의한다.

```ts
defineComponent({
  type: 'List',
  props: z.object({ columns: z.array(z.string()), rows: z.number(), pagination: z.boolean() }),
  editor: [                                    // 속성 패널 폼이 여기서 자동 생성됨
    { prop: 'columns',    control: 'stringList', label: '컬럼' },
    { prop: 'rows',       control: 'number',     label: '행 수' },
    { prop: 'pagination', control: 'switch',     label: '페이지네이션' },
  ],
  variants: ['default', 'zebra', 'compact'],
  render: (node, ctx) => ( ... ),              // headless DOM
})
```

속성 패널이 정의에서 자동 생성되므로 컴포넌트를 늘려도 에디터 코드를 수정하지 않는다.

---

## 6. 테마 시스템

### 6.1 구조

```jsonc
{
  "tokens": {
    "color.primary": "#2563eb",
    "color.text":    "#1f2937",
    "color.border":  "#e5e7eb",
    "radius.md":     "6px",
    "space.unit":    "4px",
    "font.base":     "14px"
  },
  "components": {
    "Button": {
      "base":     { "paddingX": "space.3", "paddingY": "space.2", "radius": "radius.md" },
      "variants": {
        "primary":   { "bg": "color.primary", "fg": "#ffffff" },
        "secondary": { "bg": "transparent", "fg": "color.text",
                       "borderColor": "color.border", "borderWidth": "1px" }
      }
    }
  }
}
```

### 6.2 스타일 프로퍼티 화이트리스트

컴포넌트 스타일에는 임의 CSS를 쓸 수 없다. 허용 프로퍼티는 다음으로 제한한다.

```
색:      bg, fg
간격:    padding, paddingX, paddingY, margin, marginX, marginY, gap
크기:    width, height, minWidth, maxWidth
테두리:  borderColor, borderWidth, borderStyle, radius
타이포:  fontSize, fontWeight, lineHeight, textAlign
기타:    shadow, opacity
```

값은 토큰 참조(`"color.primary"`) 또는 리터럴(`"#ffffff"`, `"1px"`)만 허용한다. `calc()` 같은 표현식은 받지 않는다.

제한하는 이유는 세 가지다. (1) 값을 검증할 수 있다. (2) PPTX 도형으로 변환할 때 매핑이 성립한다. (3) 설계서가 임의 스타일 튜닝의 장이 되는 것을 막는다.

### 6.3 컴파일

`themes`가 테마를 CSS 한 장으로 컴파일한다.

```css
:root { --wb-color-primary: #2563eb; --wb-radius-md: 6px; }
[data-wb-component="Button"] { padding: var(--wb-space-2) var(--wb-space-3); border-radius: var(--wb-radius-md); }
[data-wb-component="Button"][data-wb-variant="primary"] { background: var(--wb-color-primary); color: #fff; }
```

웹 앱은 이 CSS를 `<style>`로 주입하고, 내보낸 번들은 `assets/theme.css`로 담는다. 동일한 컴파일러를 쓰므로 결과가 같다.

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

`inverse`는 서버가 적용 직전 상태를 보고 생성한다. 클라이언트가 계산해 보내지 않는다 — 클라이언트 상태가 낙관적으로 앞서 있을 수 있기 때문이다.

### 7.2 소프트 잠금

- 노드를 선택하면 그 **서브트리**에 잠금을 건다.
- TTL 30초, 편집 중 하트비트로 갱신, WS 연결 종료 시 즉시 해제.
- 잠긴 노드는 다른 사용자 화면에 "○○ 편집 중" 배지가 뜨고 선택이 차단된다(1차 방어).
- 서버는 patch 수신 시 잠금 소유자를 재확인한다(2차 방어). 불일치면 409.
- MVP는 서버 인메모리 저장소를 쓰되 인터페이스를 분리해, 다중 인스턴스 확장 시 Redis 구현으로 교체한다.

### 7.3 개인 undo/redo

클라이언트가 **자기 revision id 스택**을 보유한다.

- **undo**: 스택 최상단 revision의 `inverse`를 현재 문서에 적용 가능한지 검사한다(경로 존재 확인). 가능하면 새 patch로 전송하고, revision id를 redo 스택으로 옮긴다.
- **적용 불가**: 그 사이 다른 사람이 대상 노드를 지운 경우다. 에러가 아니라 정상 흐름으로 처리한다 — 스택에서 제거하고 "이미 변경되어 되돌릴 수 없습니다"를 안내한 뒤 다음 항목으로 넘어간다.
- **redo**: undo가 만든 revision의 `inverse`를 같은 방식으로 적용한다.
- **새로고침**: 서버에서 내 actor의 최근 revision 50개를 받아 스택을 재구성한다.

undo도 새 revision으로 append되므로 다른 사람 화면과 절대 어긋나지 않는다.

### 7.4 LLM 편집 경로

MCP의 `patch_page`는 WebSocket 대신 REST로 들어오지만, 그 뒤 파이프라인(검증 → revision → 브로드캐스트)은 완전히 같다. 에이전트가 고친 내용이 열려 있는 사람 화면에 즉시 나타나고, `actor_type='mcp'`, `actor_label='<토큰명>'`으로 구분 표시된다.

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
    { "type": "switchTab",  "target": "n_1f8c", "tab": 2 },
    { "type": "navigate",   "target": "page:관리자/회원/상세" },
    { "type": "openModal",  "target": "page:관리자/회원/등록" }
  ]
}
```

액션 타입은 위 5종으로 고정한다. 스크립트나 표현식은 허용하지 않는다. 그래서 규칙을 정적으로 검증할 수 있고(타겟 존재 여부, prop 유효성), 자동으로 문장화할 수 있다.

### 8.2 자동 문장화

```
"① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다"
"③ 상세정보 탭 선택 시 ④ 기본정보 영역이 숨겨집니다"
```

우측 패널, HTML 번들, PPTX 모두 이 문장을 싣는다. 설계서 독자가 규칙 JSON을 볼 일이 없다.

### 8.3 실행

편집 모드에서는 상호작용이 동작하지 않는다(노드 선택이 우선). 뷰 모드 토글 시 `renderer`의 상호작용 런타임이 활성화되어 실제로 동작한다. 내보낸 HTML 번들은 항상 뷰 모드다.

---

## 9. 설계서 화면 구조

```
┌──────────────┬────────────────────────────┬──────────────────┐
│ 메뉴 · 페이지 │  목업 캔버스                │ [속성|코멘트|상호]│
│  회원관리     │  ┌──────────────────────┐  │ List             │
│   ├ 목록 ●    │  │ ① 검색폼             │  │  컬럼   [편집]   │
│   ├ 상세      │  │ ② 목록  [②]          │  │  행 수  10       │
│   └ 등록      │  └──────────────────────┘  │  페이지네이션 ✓  │
│  권한관리     │  뷰포트 1280 · 줌 100%     │ ─────────────    │
├──────────────┤  [편집 모드 | 뷰 모드]      │ 코멘트           │
│ 구조 트리     │                            │ ① 검색폼 - ...   │
│  Page         │                            │ ② 목록 - ...     │
│   ├ SearchForm│                            │ ─────────────    │
│   └ List   ●  │                            │ 상호작용          │
└──────────────┴────────────────────────────┴──────────────────┘
```

**좌측 상단 — 메뉴·페이지 트리.** 메뉴 폴더와 페이지를 한 트리에 표시하고 드래그로 정렬한다. 한 메뉴 아래 여러 페이지를 둘 수 있어 "상황별 화면"이 자연스럽게 표현된다.

**좌측 하단 — 구조 트리.** 선택된 페이지의 컴포넌트 트리다. 노드 선택·추가·삭제·이동(드래그)을 여기서 한다. 편집 모드에서만 보이며, 뷰 모드에서는 접혀 메뉴 트리가 전체를 쓴다.

**중앙 — 캔버스.** 편집 모드에서 선택 아웃라인과 번호 마커 오버레이가 보인다. 캔버스에서도 노드를 클릭해 선택할 수 있지만, **구조 변경은 구조 트리에서, 속성 변경은 속성 패널에서** 한다. 캔버스 직접 드래그 편집은 지원하지 않는다. 뷰포트 폭 프리셋(1920/1440/1280/1024)과 줌을 제공한다.

**우측 — 탭 패널.** 모드에 따라 탭 구성이 바뀐다.

| 모드 | 탭 |
|---|---|
| 편집 모드 | **속성**(선택 노드) / 코멘트 / 상호작용 |
| 뷰 모드 | **페이지 설명** / 코멘트 / 상호작용 |

속성 탭은 컴포넌트 정의의 `editor` 명세에서 자동 생성된다(5.1 참조). 페이지 설명은 편집 모드에서 페이지 자체를 선택했을 때 속성 탭에 나타난다.

**번호 마커** — 코멘트를 달면 다음 번호가 자동 부여된다. 수동 변경이 가능하고, "문서 순서대로 재번호" 버튼으로 일괄 정리한다. 번호는 노드 `id`에 묶여 있어 노드를 옮겨도 코멘트가 따라간다.

---

## 10. 권한 모델

| 역할 | 가능한 일 |
|---|---|
| **owner** | 전부 + 멤버 초대/역할 변경, 프로젝트 삭제, 테마·레이아웃 편집, 스냅샷 복원, API 토큰 발급 |
| **editor** | 메뉴·페이지·컴포넌트·코멘트·상호작용 편집, 스냅샷 생성 (복원 불가) |
| **viewer** | 조회 전용 — 편집·코멘트 모두 불가 |

- 권한 체크는 REST와 WebSocket이 **동일한 가드 함수**를 쓴다.
- WS는 룸 참가 시 한 번, 각 patch 수신 시 한 번 확인한다(연결 도중 권한 회수 대응).
- API 토큰은 **발급자의 권한을 상속**한다. editor가 만든 토큰으로는 스냅샷 복원이 안 된다. 토큰 스코프는 프로젝트 단위다.

테마·레이아웃 편집을 owner로 제한한 이유는 이 둘이 프로젝트 전체 페이지의 외형을 한 번에 바꾸는 전역 자원이기 때문이다.

---

## 11. 프리셋 · 가져오기 / 내보내기

### 11.1 페이지 프리셋

내장 3종을 기본 제공한다.

- **검색 + 목록형** — `SearchForm` + `List` + 페이지네이션
- **상세 조회형** — `Card` + `KeyValue` + 액션 버튼 그룹
- **등록/수정 폼형** — `EntryForm` + 필드 묶음 + 저장/취소

"현재 페이지를 프리셋으로 저장"으로 프로젝트 프리셋을 추가할 수 있다. 프리셋 적용 시 노드 `id`를 새로 발급한다.

### 11.2 페이지 JSON

```jsonc
{
  "wireboundVersion": "1",
  "page": { "title": "회원 목록", "layoutRef": "admin-lnb", "description": "..." },
  "schema": { "id": "n_root", "type": "Page", "children": [ ... ] },
  "comments": [ { "marker": 1, "nodeId": "n_7f3a", "body": "검색 조건은 AND 결합" } ]
}
```

가져오기 시 노드 id를 재발급하되 코멘트의 `nodeId`와 상호작용의 `target`을 함께 리매핑한다. `wireboundVersion`은 스키마 마이그레이션 진입점이다.

### 11.3 HTML 정적 번들

```
wirebound-export/
  index.html            트리 네비 + 뷰어 셸
  pages/
    관리자-회원-목록.html
    관리자-회원-상세.html
  assets/
    theme.css           테마 컴파일 결과
    runtime.js          상호작용 런타임
```

`exporter`가 `renderer`를 서버에서 실행해 정적 HTML을 만든다. 트리 네비게이션·목업·코멘트 3분할이 웹 앱과 동일하고, 상호작용도 동작한다. 렌더러가 하나뿐이라 결과가 어긋날 수 없다.

---

## 12. LLM 연계 (P9)

### 12.1 리포 바인딩

개발 리포 루트에 `.wirebound.json`을 둔다.

```jsonc
{
  "server": "https://wirebound.example.com",
  "projectId": "prj_a1b2",
  "pageMap": {
    "관리자/회원/목록": "src/pages/admin/MemberList.tsx",
    "관리자/회원/상세": "src/pages/admin/MemberDetail.tsx"
  }
}
```

`pageMap`이 설계서 페이지와 소스 파일을 잇는다. 에이전트는 소스 파일에서 페이지를 역조회할 수도 있다.

### 12.2 MCP 도구

| 도구 | 용도 |
|---|---|
| `list_pages` | 프로젝트 메뉴/페이지 트리 조회 |
| `get_page` | 페이지 스키마 + 코멘트 + 상호작용 문장 조회 |
| `patch_page` | 사람 편집과 동일 경로의 수정 (baseSeq 필수) |
| `add_comment` | 구현 중 발견한 이슈를 설계서에 기록 |
| `validate` | lint 규칙 실행 |
| `resolve_source` | `pageMap` 기반 페이지↔소스 상호 조회 |

### 12.3 CLI

```
wireb login                        토큰 발급 및 저장
wireb init                         .wirebound.json 생성
wireb pull                         프로젝트 스냅샷을 로컬 JSON으로 (읽기 전용)
wireb page get <경로> [--json]     페이지 조회
wireb lint [경로]                  규칙 검증
wireb export --format html -o dir  정적 번들 생성
```

### 12.4 lint 규칙

"LLM을 통한 검증"의 실체다. 규칙은 `schema` 패키지에 두어 웹·CLI·MCP가 공유한다.

- 코멘트가 없는 주요 컴포넌트 (`List`, `EntryForm`, `SearchForm`)
- 어느 메뉴에도 연결되지 않은 페이지
- 대상 노드가 삭제된 상호작용 규칙
- `navigate`/`openModal` 대상 페이지가 존재하지 않음
- 중복된 코멘트 번호
- `EntryForm` 안에 `Field`가 하나도 없는 등 구조적 공백
- 프로젝트 명명 규칙 위반 (설정 가능)

### 12.5 스킬

에이전트에게 다음 흐름을 가르친다.

1. 화면 구현 요청을 받으면 `resolve_source` 또는 `list_pages`로 대상 페이지를 찾는다.
2. `get_page`로 스키마·코멘트·상호작용을 읽는다.
3. 구현한다.
4. 설계와 어긋나거나 결정이 필요한 부분을 `add_comment`로 회신한다.
5. `validate`로 설계서 자체의 결함을 보고한다.

---

## 13. 에러 처리

| 상황 | 응답 | 클라이언트 동작 |
|---|---|---|
| 스키마 검증 실패 | 422 | 낙관적 적용 롤백 후 서버 상태로 재동기화 |
| 잠금 충돌 | 409 + 점유자 정보 | UI 사전 차단이 1차 방어, 발생 시 안내 후 재시도 |
| baseSeq 불일치 | 서버 리베이스 시도 → 실패 시 409 | 페이지 재로딩 |
| 권한 없음 | 403 | WS는 룸에서 강제 퇴장, 읽기 전용 전환 |
| undo 대상 소실 | 에러 아님 | 스택에서 제거하고 안내 |
| WS 연결 끊김 | — | 지수 백오프 재연결, 복구 시 `head_seq` 기준 델타 수신 |

### 13.1 스키마 마이그레이션

컴포넌트 props는 반드시 바뀐다. `schema` 패키지에 버전별 마이그레이션 함수 체인을 두고, 페이지를 읽을 때 최신 버전으로 올려 읽는다. 가져오기와 스냅샷 복원도 같은 경로를 탄다.

```ts
migrations = [
  { from: 1, to: 2, migrate: (doc) => { /* List.rows 기본값 도입 */ } },
]
```

`pages.schema_version`에 현재 버전을 기록하고, 마이그레이션이 실행되면 다음 저장 시 갱신한다.

---

## 14. 테스트 전략

| 대상 | 방식 |
|---|---|
| `schema` | **patch/inverse 왕복 속성 테스트** — 임의 편집 시퀀스를 적용한 뒤 역순으로 역적용하면 원본과 정확히 일치해야 한다. 이력 시스템 전체의 안전망 |
| `schema` | zod 검증 경계값, 마이그레이션 체인 |
| `renderer` | 컴포넌트별 DOM 스냅샷 테스트 |
| `themes` | 토큰 참조 해석, 화이트리스트 위반 거부 |
| `api` | 동시편집 통합 테스트 — 두 클라이언트 동시 patch, 잠금 경합, 편집 중 권한 회수, WS 재연결 후 델타 복구 |
| `api` | 권한 매트릭스 (역할 × 엔드포인트) |
| `exporter` | 내보낸 HTML의 DOM과 웹 렌더 DOM의 동등성 검증 |
| e2e | 페이지 생성 → 편집 → 코멘트 → 스냅샷 → 복원 한 줄기 (Playwright) |

patch/inverse 왕복 테스트가 가장 중요하다. undo, 스냅샷 복원, MCP 편집이 전부 이 성질에 의존한다.

---

## 15. 로드맵

| 단계 | 내용 | 완료 시 가능한 것 |
|---|---|---|
| **P0** | 모노레포 + `schema`(노드 타입·zod·patch 유틸) + `renderer` 골격 | 스키마 JSON을 넣으면 화면이 그려진다 |
| **P1** | 인증, 프로젝트, 멤버/권한, 메뉴 트리, 페이지 CRUD | 프로젝트와 메뉴 구조를 만든다 |
| **P2** | 에디터 3분할 셸 — 트리·캔버스·속성 패널, revision 로그, 개인 undo/redo | 혼자서 설계서를 작성할 수 있다 |
| **P3** | WebSocket 실시간 동기화 + 소프트 잠금 | 여럿이 동시에 작업한다 |
| **P4** | 레이아웃·테마 관리 + CSS 컴파일 | 프로젝트별 외형을 잡는다 |
| **P5** | 코멘트/번호 마커 + 상호작용 규칙 + 뷰 모드 | 설계서로서 완성된다 |
| **P6** | 스냅샷 태그/복원 | 버전을 관리한다 |
| **P7** | 페이지 프리셋 + JSON 가져오기/내보내기 | 반복 작업이 빨라진다 |
| **P8** | HTML 정적 번들 내보내기 | **MVP 릴리스** — 설계서를 배포한다 |
| **P9** | `wireb` CLI + MCP + 스킬 + `.wirebound.json` + lint | 에이전트가 설계서를 읽고 구현한다 |
| **P10** | PPTX 내보내기 | 보고용 산출물을 만든다 |

각 단계는 그 자체로 동작 가능한 상태를 만들고 끝낸다. P2까지 가면 단독 사용이 가능하고, P8이 1차 릴리스다.

---

## 16. 열린 질문 (구현 중 결정)

- **PPTX 표현 방식** — 헤드리스 렌더 이미지 삽입 방식과 도형 변환 방식 중 선택. P10 착수 시 스타일 화이트리스트 매핑 가능성을 보고 결정한다.
- **스냅샷 보관 정책** — 개수 제한 또는 보관 기간. 실사용 데이터가 쌓인 뒤 결정한다.
- **revision 로그 압축** — 페이지당 revision이 수만 건이 되면 오래된 구간을 주기적으로 압축한다. 성능 문제가 실제로 관측되면 착수한다.
