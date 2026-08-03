# wirebound 설계 문서

작성일: 2026-08-03
상태: 승인됨 (구현 계획 작성 대기)

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
- **디자이너** — 레이아웃을 잡고 테마를 만든다. 토큰은 GUI로, 깊은 수정은 JSON으로 한다.
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
| 스타일 | 쉘(Layout) / 테마(Theme) 분리, 레이아웃이 테마 참조 | 여러 레이아웃이 같은 디자인 언어를 공유해야 함 |
| 테마 범위 | 디자인 시스템 정의 — 토큰 + 구조 매핑 + 패턴 (§6) | 관리자 외 다양한 형태의 웹을 같은 도구로 설계해야 함 |
| 구조 변형 | 렌더러가 구조 구현체를 제공하고 테마가 선택 | 임의 템플릿 없이 형태를 바꿀 수 있는 유일한 방법 |
| 이력 | JSON Patch 커맨드 로그, 개인 undo 스택, 태그형 스냅샷 | 동시편집 환경에서 누가 무엇을 바꿨는지 추적 가능 |
| 동시편집 | WebSocket 실시간 반영 + 노드 단위 소프트 잠금 | CRDT 없이 설계서 작업에 충분한 협업 수준 |
| 상호작용 | 선언적 트리거→액션 규칙 (고정 액션 목록) | 스크립트 없이 검증 가능, 자동 문장화 가능 |
| 컴포넌트 | 내장 카탈로그 고정 (확장 없음) | 스키마를 닫아두면 검증·렌더링·내보내기가 단순 |
| 권한 | 프로젝트 단위 멤버 초대 (owner/editor/viewer) | 요구된 3종 권한과 1:1, 조직 계층 불필요 |
| LLM 연계 | 서버 API 직결 MCP·CLI, `.wirebound.json` 리포 바인딩 | 파일 동기화 없이 실시간 반영 |
| 내보내기 | HTML 정적 번들 우선, PPTX는 렌더 이미지 방식으로 후속 | 렌더러 재사용으로 비용이 거의 없음. 도형 변환은 포기 |
| MVP 범위 | 실시간 동시편집 + 스냅샷 + 상호작용 포함, MCP/CLI 제외 | 협업 도구로서의 핵심을 먼저 완성 |

### 2.1 명시적으로 제외한 것 (YAGNI)

- **페이지의 반응형 편집** — 페이지 스키마에 브레이크포인트별 분기를 두지 않는다. 반응형은 **테마가 정의**하고(§6.4), 사용자는 뷰포트 프리셋을 바꿔 확인만 한다.
- **자유 좌표 배치** — 레이아웃 규칙 기반 배치만 지원한다.
- **CRDT 실시간 협업** — 소프트 잠금으로 충분하다.
- **컴포넌트 플러그인** — 서버에서 외부 코드 실행은 보안 부담이 크다.
- **테마의 임의 마크업 템플릿** — 테마는 렌더러가 제공하는 구조 구현체 중에서만 고른다. 템플릿 엔진을 들이면 검증·내보내기·보안이 모두 무너진다.
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

**렌더러는 스타일을 갖지 않고, 구조는 테마가 고른다.**
`renderer`는 DOM 구조와 `data-wb-*` 속성만 생성한다. 스타일은 전부 `themes`가 컴파일한 CSS가 담당한다. 다만 렌더러는 컴포넌트마다 **여러 구조 구현체**를 갖고, 그중 무엇을 쓸지는 테마가 지정한다(§6.5). 그래서 테마 교체만으로 형태까지 바뀌면서도, 임의 마크업이 시스템에 들어오지는 않는다.

**모든 편집은 같은 파이프라인을 통과한다.**
사람의 GUI 편집, MCP의 patch, CLI의 수정이 모두 `검증 → revision 기록 → 브로드캐스트`를 거친다. 우회 경로가 없으므로 이력이 항상 완전하다.

### 3.3 각 패키지의 책임과 의존

| 패키지 | 책임 | 의존 |
|---|---|---|
| `schema` | 노드 타입, props 정의, zod 검증, patch/inverse 생성, 마이그레이션, lint 규칙 | 없음 |
| `renderer` | 스키마 트리 → React 엘리먼트, 상호작용 런타임 | `schema` |
| `themes` | 테마 규격 정의·검증, `extends` 병합, 토큰/구조/패턴 → CSS 컴파일, 시스템 테마 세트 | `schema` |
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
          ├── Theme        (meta, tokens, primitives, components, patterns, assets)
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

themes(id, project_id, slug, name, description, extends_ref, version,
       tokens jsonb, primitives jsonb, components jsonb,
       patterns jsonb, assets jsonb, updated_at)
  project_id NULL = 시스템 테마 (읽기 전용)
  extends_ref = 'system:<slug>' 형식, 상속 깊이 1단계
  UNIQUE (project_id, slug)

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
  "props": { "columns": ["No", "아이디", "이름"], "items": 10, "pagination": true },
  "variant": "featured",   // 테마가 정의한 variant 중 하나 (선택)
  "marker": 2,             // 우측 코멘트 번호 (없으면 코멘트 없음)
  "interactions": [
    { "on": "click", "actions": [ { "type": "setProp", "target": "n_9c1e", "prop": "loading", "value": true } ] }
  ],
  "children": []
}
```

`id`는 생성 시 부여되고 절대 바뀌지 않는다. 노드를 트리 안에서 옮겨도 유지되므로 코멘트와 상호작용 타겟이 따라간다. 가져오기·프리셋 적용·패턴 삽입 시에만 새 id를 발급하며, 그때 참조도 함께 리매핑한다.

**노드는 스타일을 갖지 않는다.** `variant`로 테마가 정의한 표현 중 하나를 고를 뿐이고, 실제 스타일 값은 전부 테마에 있다. 이 성질 덕분에 테마 교체만으로 전체 설계서의 외형이 바뀐다. 반대로 "이 버튼만 빨갛게" 같은 일회성 스타일은 지원하지 않는다 — 필요하면 테마에 variant를 추가하는 것이 올바른 경로다.

노드가 어떤 구조(`structure`)로 렌더될지는 노드가 아니라 **테마가 결정**한다(§6.5). 같은 `List` 노드가 관리자 테마에서는 테이블로, 마케팅 테마에서는 카드 그리드로 그려진다.

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

**테마도 payload에 포함한다.** 참조만 저장하면 테마가 나중에 바뀌었을 때 스냅샷이 다른 모습으로 복원된다. 테마 변경은 프로젝트 전체 페이지의 외형을 한 번에 바꾸므로, "그때 그 화면"을 보장하려면 당시 테마 내용을 함께 얼려야 한다. 상속 테마는 병합된 결과를 저장한다.

---

## 5. 컴포넌트 카탈로그

카탈로그는 고정이며 프로젝트별 확장이 없다.

| 그룹 | 컴포넌트 | 설명 |
|---|---|---|
| 구조 | `Page` | 루트 노드. 페이지당 하나 |
| | `Slot` | 레이아웃 전용. 페이지가 주입되는 자리 |
| | `Section` | 세로 밴드. 풀블리드 배경 + 내부 컨테이너 정렬 |
| | `Flex` | 가로/세로 배치 |
| | `Grid` | 격자 배치 (열 수, 간격) |
| | `Card` | 제목·본문 영역을 가진 카드 |
| | `Tabs` | 탭 목록과 패널 |
| 데이터 | `List` | 목록. 컬럼/아이템, 개수, 페이지네이션, 선택 |
| | `Tree` | 계층 목록 |
| | `KeyValue` | 키-값 뷰 (상세 화면용) |
| 입력 | `SearchForm` | 검색 조건 필드 묶음 + 조회/초기화 |
| | `EntryForm` | 등록/수정 폼. 라벨-필드 배치 규칙 |
| | `Field` | 단일 입력요소 (text/number/select/date/dateRange/checkbox/radio/textarea/file) |
| 액션 | `Button` | 버튼 |
| | `Link` | 링크. 페이지 이동 대상 지정 가능 |
| 문서 | `Text` | 텍스트. `role`로 타이포 스케일 선택 (display/h1~h6/body/caption) |
| | `Media` | 이미지·영상·일러스트·차트 영역 |
| | `Divider` | 구분선 |
| | `Placeholder` | 미정 영역 자리표시 |

원래 요구 목록에 없던 `Text` · `Divider` · `Placeholder`는 설계서 작성에 필수적이라 추가했고, `Section` · `Media`는 관리자 외 사이트 설계에 필수적이라 추가했다. `Section`은 "화면 전체 폭 배경 + 가운데 정렬된 콘텐츠"라는 사이트 레이아웃의 기본 단위이며, 테마의 `primitives.container` · `primitives.section`을 소비한다.

### 5.1 컴포넌트 정의 구조

각 컴포넌트는 한 파일에서 다음을 함께 정의한다.

```ts
defineComponent({
  type: 'List',
  props: z.object({ items: z.number(), columns: z.array(z.string()).optional(),
                    pagination: z.boolean(), selectable: z.boolean() }),
  editor: [                                    // 속성 패널 폼이 여기서 자동 생성됨
    { prop: 'items',      control: 'number',     label: '항목 수' },
    { prop: 'columns',    control: 'stringList', label: '컬럼',
      visibleWhen: { structure: 'table' } },   // 구조에 따라 보이는 속성이 다름
    { prop: 'pagination', control: 'switch',     label: '페이지네이션' },
  ],
  structures: ['table', 'cardGrid', 'stackedList', 'mediaList'],
  parts:      ['header', 'row', 'rowAlt', 'cell', 'item', 'media', 'title', 'meta'],
  variants:   ['default', 'featured', 'compact'],
  states:     ['selected', 'disabled', 'loading', 'empty'],
  render: {                                    // 구조별 headless DOM
    table:    (node, ctx) => ( ... ),
    cardGrid: (node, ctx) => ( ... ),
    stackedList: (node, ctx) => ( ... ),
    mediaList:   (node, ctx) => ( ... ),
  },
})
```

여기 선언된 것이 곧 **테마가 쓸 수 있는 어휘**다. 테마는 `structures`에 없는 구조를 고를 수 없고, `parts`에 없는 조각을 스타일링할 수 없으며, `states`에 없는 상태를 만들 수 없다. 테마 검증이 이 선언과 대조해 이루어진다.

속성 패널이 정의에서 자동 생성되므로 컴포넌트를 늘려도 에디터 코드를 수정하지 않는다. `visibleWhen`은 현재 테마가 선택한 구조에 따라 관련 없는 속성을 감춘다 — 카드 그리드에는 "컬럼"이 의미 없다.

---

## 6. 테마 시스템

### 6.0 테마의 범위

wirebound는 관리자 화면에 한정되지 않는다. 마케팅 사이트, 포털, 커머스, 문서 사이트의 설계도 같은 도구로 해야 한다. 이 요구가 테마의 범위를 결정한다.

**테마는 색 팔레트가 아니라 디자인 시스템 정의다.** 같은 페이지 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도, 히어로가 있는 랜딩 페이지로도 렌더된다. 자율적인 웹 디자인과 컴포넌트 매핑이 모두 테마의 책임이다.

이를 위해 렌더러의 역할을 조정한다. 렌더러는 컴포넌트마다 **여러 구조 구현체(structure)** 를 가지고, 테마가 그중 하나를 선택한다.

```jsonc
// 관리자 테마                       // 마케팅 테마
"List": { "structure": "table" }     "List": { "structure": "cardGrid" }
```

구조 구현체는 렌더러가 가진 고정 목록이다. 테마가 임의 마크업이나 템플릿을 정의하지는 못한다. 이 선을 지켜야 스키마가 닫힌 채로 남고, 검증·내보내기·LLM 조작이 성립한다.

### 6.1 테마 규격

```
Theme
├── meta         id, name, description, extends, version, preview
├── tokens       디자인 토큰 (palette → semantic → scale 3단)
├── primitives   사이트 골격 상수 (컨테이너, 그리드, 섹션 리듬, 브레이크포인트)
├── components   컴포넌트 매핑 (structure + base/parts/variants/states)
├── patterns     복합 구성 레시피 (헤더/히어로/기능그리드/CTA/푸터)
└── assets       폰트, 아이콘 세트, 플레이스홀더 표현
```

### 6.2 meta

```jsonc
{
  "id": "acme-portal",
  "name": "ACME 포털",
  "description": "사내 포털용 파생 테마",
  "extends": "system:portal",     // 시스템 테마 상속 (선택)
  "version": "1.2.0",
  "preview": "…"                  // 갤러리용 썸네일 (생성물)
}
```

### 6.3 tokens — 3단 분리

```jsonc
{
  "palette": {                                   // 1단: 원시값
    "blue.500": "#3b82f6", "blue.600": "#2563eb",
    "gray.50": "#f9fafb", "gray.500": "#6b7280", "gray.900": "#111827"
  },
  "semantic": {                                  // 2단: 의미 (palette 참조)
    "primary": "palette.blue.600",
    "primaryHover": "palette.blue.500",
    "text": "palette.gray.900",
    "textMuted": "palette.gray.500",
    "surface": "#ffffff",
    "canvas": "palette.gray.50",
    "border": "#e5e7eb",
    "danger": "#dc2626"
  },
  "scale": {                                     // 3단: 스케일
    "space":  { "unit": "4px" },                 // space.1 … space.24 파생
    "radius": { "sm": "4px", "md": "6px", "lg": "12px", "full": "9999px" },
    "shadow": { "sm": "0 1px 2px rgba(0,0,0,.05)", "lg": "0 10px 24px rgba(0,0,0,.12)" },
    "typography": {
      "family":  { "sans": "Pretendard, sans-serif", "serif": "…", "mono": "…" },
      "display": { "fontSize": "56px", "lineHeight": 1.1,  "fontWeight": 700, "letterSpacing": "-0.02em" },
      "h1":      { "fontSize": "32px", "lineHeight": 1.25, "fontWeight": 700 },
      "body":    { "fontSize": "14px", "lineHeight": 1.5,  "fontWeight": 400 },
      "caption": { "fontSize": "12px", "lineHeight": 1.4,  "fontWeight": 400 }
    },
    "motion": { "fast": "120ms", "base": "200ms", "easing": "cubic-bezier(.4,0,.2,1)" }
  }
}
```

의미 계층을 두는 이유는 다크 테마와 브랜드 교체 때문이다. `semantic`만 갈아끼우면 전체가 바뀐다. `space.unit`만 정의하면 `space.1`~`space.24`가 배수로 파생되므로 간격 토큰을 나열할 필요가 없다.

### 6.4 primitives — 사이트 골격

```jsonc
{
  "container": { "maxWidth": "1200px", "gutter": "space.6" },
  "grid":      { "columns": 12, "gap": "space.6" },
  "section":   { "paddingY": "space.20", "paddingYCompact": "space.10" },
  "breakpoints": { "sm": 640, "md": 768, "lg": 1024, "xl": 1280 }
}
```

"실제 사이트처럼 보이는" 인상의 절반은 여기서 나온다. 컨테이너 폭과 섹션의 세로 리듬이 사이트의 성격을 결정한다 — 관리자 화면은 `maxWidth: fluid`에 좁은 섹션 여백을, 마케팅 사이트는 `1200px`에 넉넉한 여백을 쓴다.

`breakpoints`는 **테마가 반응형 스타일을 정의**하기 위한 것이다. 페이지 편집 자체는 여전히 데스크톱 기준이며(§2.1), 뷰포트 프리셋을 바꾸면 테마가 정의한 브레이크포인트 스타일이 적용되어 확인만 가능하다.

### 6.5 components — 구조 + 스킨

```jsonc
{
  "List": {
    "structure": "cardGrid",
    "base":     { "gap": "space.6" },
    "parts": {
      "item":  { "bg": "semantic.surface", "radius": "radius.lg",
                 "shadow": "shadow.sm", "padding": "space.5" },
      "media": { "aspectRatio": "16/9", "objectFit": "cover", "radius": "radius.md" },
      "title": { "typography": "h3" }
    },
    "variants": {
      "featured": { "parts": { "item": { "shadow": "shadow.lg" } } },
      "compact":  { "parts": { "item": { "padding": "space.3" } } }
    },
    "states": {
      "selected": { "parts": { "item": { "borderColor": "semantic.primary", "borderWidth": "2px" } } },
      "disabled": { "opacity": 0.5 }
    },
    "responsive": {
      "md": { "base": { "gap": "space.4" } }
    }
  }
}
```

네 개의 층이 있다.

| 층 | 역할 |
|---|---|
| `structure` | 렌더러가 제공하는 구조 구현체 중 선택 |
| `base` / `parts` | 컴포넌트 루트와 내부 조각의 기본 스킨 |
| `variants` | 노드가 `variant`로 선택하는 표현 변형 |
| `states` | 노드 props에서 파생되는 상태 스킨 |
| `responsive` | 브레이크포인트별 오버라이드 |

`parts`가 **headless 컴포넌트를 테마에 매핑하는 실제 지점**이다. 렌더러는 내부 조각에 `data-wb-part`를 붙여 내보내고, 테마가 그 조각을 스타일링한다.

`states`는 설계서 표현에 필수다. "필수값 미입력 시 저장 버튼 비활성", "선택된 행 강조" 같은 서술을 목업에서 실제로 보여주려면 상태 스킨이 있어야 한다. 상태 목록은 컴포넌트 정의에 고정 선언되어 있어(§5.1) 임의 상태를 만들 수 없다.

**구조 구현체 목록** (렌더러가 구현, 테마가 선택)

| 컴포넌트 | structure 옵션 |
|---|---|
| `List` | `table` · `cardGrid` · `stackedList` · `mediaList` |
| `Card` | `plain` · `bordered` · `elevated` · `mediaTop` · `horizontal` |
| `Tabs` | `underline` · `pill` · `enclosed` · `vertical` |
| `SearchForm` | `inline` · `stacked` · `collapsible` |
| `EntryForm` | `labelLeft` · `labelTop` · `sectioned` |
| `Field` | `outlined` · `filled` · `underlined` |
| `Button` | `solid` · `outline` · `text` |
| `Tree` | `indent` · `accordion` |
| `KeyValue` | `table` · `definitionList` · `cardGrid` |
| `Section` | `contained` · `fullBleed` · `splitBg` |
| `Media` | `image` · `video` · `illustration` · `chart` |

### 6.6 patterns — 테마가 소유한 구성 레시피

패턴은 테마에 속한 **파라미터화된 스키마 조각**이다. 레이아웃이 패턴을 조합해 셸을 만들고, 페이지도 패턴을 꽂아 콘텐츠를 채운다.

```jsonc
{
  "patterns": {
    "hero.split": {
      "name": "히어로 — 좌우 분할",
      "slots": { "title": "text", "body": "text", "cta": "action", "image": "media" },
      "schema": {
        "type": "Section", "variant": "hero",
        "children": [
          { "type": "Grid", "props": { "columns": 2, "gap": "space.10" }, "children": [
            { "type": "Flex", "props": { "direction": "column" }, "children": [
              { "type": "Text", "slot": "title", "props": { "role": "display" } },
              { "type": "Text", "slot": "body",  "props": { "role": "body" } },
              { "type": "Button", "slot": "cta", "variant": "primary" }
            ]},
            { "type": "Media", "slot": "image" }
          ]}
        ]
      }
    }
  }
}
```

패턴을 페이지에 넣으면 `schema`가 전개되고 노드 `id`가 새로 발급된다. `slots`에 선언된 자리는 우측 속성 패널에서 채운다.

`slot` 필드는 **패턴 템플릿에만 존재**한다. 전개된 페이지 노드에는 남지 않으므로(§4.3의 노드 형태 그대로다), 패턴은 삽입 시점의 편의 장치이지 런타임 개념이 아니다. 삽입 후에는 일반 노드와 구분되지 않고 자유롭게 편집된다.

핵심 성질은 **테마를 바꾸면 같은 패턴 이름이 다른 모양으로 재현된다**는 것이다. `saas-marketing` 테마의 `hero.split`과 `corporate` 테마의 `hero.split`은 같은 슬롯 계약을 갖지만 전개 결과가 다르다. 테마 교체가 곧 사이트 리디자인이 된다.

패턴 이름은 `<범주>.<변형>` 규칙을 따르고, 범주는 고정 목록이다: `header` · `nav` · `hero` · `features` · `content` · `cta` · `pricing` · `testimonial` · `footer` · `auth` · `empty` · `error`.

**패턴과 페이지 프리셋의 차이**

| | 패턴 (Pattern) | 페이지 프리셋 (PagePreset) |
|---|---|---|
| 소유 | 테마 | 프로젝트 |
| 범위 | 페이지 일부 (섹션 단위) | 페이지 통째 |
| 테마 교체 시 | 다른 모양으로 재현됨 | 그대로 유지 |
| 용도 | 디자인 언어의 구성 단위 | 반복 화면의 출발점 |

### 6.7 assets

```jsonc
{
  "fonts": [ { "family": "Pretendard", "src": "…", "weights": [400, 500, 700] } ],
  "icons": "lucide",                              // 내장 아이콘 세트 중 선택
  "placeholder": { "style": "skeleton" }          // skeleton | blueprint | photo | solid
}
```

`placeholder.style`은 `Media`와 `Placeholder` 컴포넌트의 표현을 결정한다. 와이어프레임 느낌이 필요하면 `blueprint`, 실제 사이트에 가깝게 보여야 하면 `photo`(더미 이미지)를 쓴다.

### 6.8 스타일 프로퍼티 화이트리스트

임의 CSS는 여전히 쓸 수 없다. 다만 웹 디자인이 가능한 수준으로 어휘를 넓힌다.

```
색/배경:  bg, bgGradient, bgImage, bgSize, bgPosition, fg
간격:     padding, paddingX, paddingY, margin, marginX, marginY, gap
크기:     width, height, minWidth, maxWidth, minHeight, aspectRatio
배치:     display, direction, align, justify, wrap, position, inset, zIndex
테두리:   borderColor, borderWidth, borderStyle, radius
타이포:   typography(스케일 참조), fontSize, fontWeight, lineHeight,
          letterSpacing, textAlign, textTransform, textDecoration
이미지:   objectFit, objectPosition
효과:     shadow, opacity, overflow, transition
```

값은 **토큰 참조**(`"semantic.primary"`, `"space.6"`, `"radius.lg"`) 또는 **리터럴**(`"#ffffff"`, `"1px"`, `"16/9"`)만 허용한다. `calc()`나 임의 함수는 받지 않는다.

제한을 유지하는 이유는 두 가지로 줄었다. (1) 값을 검증할 수 있고 GUI 편집이 가능하다. (2) 설계서가 무제한 스타일 튜닝의 장이 되는 것을 막는다. **PPTX 무손실 변환은 목표에서 제외한다** — 배경 그라디언트와 이미지가 들어온 이상 도형 변환은 성립하지 않으므로, PPTX는 렌더 이미지 삽입 방식으로 확정한다.

### 6.9 상속과 병합

```
system:portal  (내장, 읽기 전용)
      ↓ extends
acme-portal    (프로젝트 소유, 일부만 오버라이드)
```

병합 규칙:

- 객체는 **깊은 병합**(deep merge)한다.
- 배열은 **교체**한다(부분 병합하지 않는다).
- `null`을 명시하면 상속된 키를 **삭제**한다.
- 상속 깊이는 1단계로 제한한다. 파생의 파생은 만들지 않는다.

대부분의 프로젝트는 시스템 테마를 상속해 `semantic` 색 몇 개와 `typography.family`만 덮어쓴다. 테마 전체를 손으로 쓰는 일이 없어야 한다.

### 6.10 테마 관리

| 층위 | 소유 | 편집 | 용도 |
|---|---|---|---|
| **시스템 테마** | wirebound 내장 | 읽기 전용 | 출발점. `admin` · `saas-marketing` · `portal` · `commerce` · `docs` |
| **프로젝트 테마** | 프로젝트 | owner | 처음부터 정의 |
| **파생 테마** | 프로젝트 | owner | 시스템 테마 상속 + 부분 오버라이드 (권장) |

- **저작 UI** — `tokens`는 전용 GUI(컬러 피커, 스케일 에디터, 타이포 미리보기)로 편집한다. `components`·`patterns`·`primitives`는 스키마 검증이 붙은 JSON 에디터로 편집한다. 기획자는 토큰만 만지고, 깊은 수정은 디자이너·개발자가 한다.
- **미리보기** — 테마 편집 화면은 모든 컴포넌트를 한 페이지에 늘어놓은 **테마 갤러리**를 실시간으로 보여준다. 변경이 전 컴포넌트에 어떻게 퍼지는지 즉시 확인한다.
- **가져오기/내보내기** — 테마는 JSON 한 벌로 내보내고 가져온다. 회사 디자인 시스템을 한 번 테마로 만들면 프로젝트마다 재사용한다.
- **버전** — `meta.version`을 기록한다. 테마 변경은 프로젝트 전체 페이지의 외형을 바꾸므로, 스냅샷은 참조 중인 테마 내용을 함께 저장한다(§4.5).
- **권한** — 테마 편집은 owner 전용이다(§10).

### 6.11 컴파일

`themes`가 테마를 CSS 한 장으로 컴파일한다.

```css
:root {
  --wb-semantic-primary: #2563eb;
  --wb-space-6: 24px;
  --wb-radius-lg: 12px;
  --wb-container-max: 1200px;
}

[data-wb-component="List"][data-wb-structure="cardGrid"] {
  display: grid; gap: var(--wb-space-6);
}
[data-wb-component="List"] [data-wb-part="item"] {
  background: var(--wb-semantic-surface);
  border-radius: var(--wb-radius-lg);
  box-shadow: var(--wb-shadow-sm);
}
[data-wb-component="List"][data-wb-state~="selected"] [data-wb-part="item"] {
  border-color: var(--wb-semantic-primary);
}
@media (max-width: 768px) {
  [data-wb-component="List"][data-wb-structure="cardGrid"] { gap: var(--wb-space-4); }
}
```

렌더러와 테마의 계약은 네 속성뿐이다: `data-wb-component` · `data-wb-structure` · `data-wb-variant` · `data-wb-part`, 그리고 상태를 나타내는 `data-wb-state`. 웹 앱은 이 CSS를 `<style>`로 주입하고, 내보낸 번들은 `assets/theme.css`로 담는다. 동일한 컴파일러를 쓰므로 결과가 같다.

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

**중앙 — 캔버스.** 편집 모드에서 선택 아웃라인과 번호 마커 오버레이가 보인다. 캔버스에서도 노드를 클릭해 선택할 수 있지만, **구조 변경은 구조 트리에서, 속성 변경은 속성 패널에서** 한다. 캔버스 직접 드래그 편집은 지원하지 않는다.

뷰포트 폭 프리셋(1920 / 1440 / 1280 / 1024 / 768 / 375)과 줌을 제공한다. 폭을 바꾸면 테마가 정의한 브레이크포인트 스타일(§6.4)이 적용된다. 페이지 스키마 자체에는 반응형 분기가 없으므로, 이는 **편집이 아니라 확인**이다.

테마 전환 드롭다운도 캔버스 상단에 둔다. 같은 페이지를 다른 테마로 즉시 바꿔 보며 비교할 수 있다.

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

테마·레이아웃 편집을 owner로 제한한 이유는 이 둘이 프로젝트 전체 페이지의 외형을 한 번에 바꾸는 전역 자원이기 때문이다. 시스템 테마는 누구도 편집할 수 없으며, 수정이 필요하면 `extends`로 파생 테마를 만든다(§6.9).

---

## 11. 프리셋 · 가져오기 / 내보내기

### 11.1 페이지 프리셋

내장 3종을 기본 제공한다.

- **검색 + 목록형** — `SearchForm` + `List` + 페이지네이션
- **상세 조회형** — `Card` + `KeyValue` + 액션 버튼 그룹
- **등록/수정 폼형** — `EntryForm` + 필드 묶음 + 저장/취소

"현재 페이지를 프리셋으로 저장"으로 프로젝트 프리셋을 추가할 수 있다. 프리셋 적용 시 노드 `id`를 새로 발급한다.

프리셋은 **테마 패턴(§6.6)과 다른 것**이다. 프리셋은 프로젝트가 소유한 페이지 통째 템플릿이고 테마를 바꿔도 그대로다. 패턴은 테마가 소유한 섹션 단위 레시피이고 테마를 바꾸면 다른 모양으로 재현된다. 페이지를 만들 때 프리셋으로 출발하고, 그 안에 패턴을 꽂아 채우는 것이 일반적인 흐름이다.

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

**설계서 규칙**
- 코멘트가 없는 주요 컴포넌트 (`List`, `EntryForm`, `SearchForm`)
- 어느 메뉴에도 연결되지 않은 페이지
- 대상 노드가 삭제된 상호작용 규칙
- `navigate`/`openModal` 대상 페이지가 존재하지 않음
- 중복된 코멘트 번호
- `EntryForm` 안에 `Field`가 하나도 없는 등 구조적 공백
- 프로젝트 명명 규칙 위반 (설정 가능)

**테마 규칙** (§6 규격 대조)
- 컴포넌트 정의에 없는 `structure` · `part` · `state` 참조
- 존재하지 않는 토큰 참조 (`semantic.brand` 오타 등)
- 화이트리스트에 없는 스타일 프로퍼티
- 노드가 쓰는 `variant`를 테마가 정의하지 않음
- 패턴 `slots` 계약과 `schema` 불일치
- `extends` 대상이 없거나 상속 깊이 위반

### 12.5 스킬

에이전트에게 다음 흐름을 가르친다.

1. 화면 구현 요청을 받으면 `list_pages`로 대상 페이지를 찾는다.
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
| `renderer` | 컴포넌트 × 구조 조합별 DOM 스냅샷 테스트, `data-wb-*` 속성 계약 검증 |
| `themes` | 토큰 참조 해석(3단 체인), 화이트리스트 위반 거부, `extends` 병합 규칙(깊은 병합·배열 교체·null 삭제), 컴포넌트 정의와의 대조 검증 |
| `themes` | **시스템 테마 전수 검증** — 내장 테마 각각이 모든 컴포넌트를 커버하는지, 미정의 조각이 없는지 |
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
| **P2** | 에디터 3분할 셸 — 트리·캔버스·속성 패널, revision 로그, 개인 undo/redo | 혼자서 설계서를 작성할 수 있다 |
| **P3** | WebSocket 실시간 동기화 + 소프트 잠금 | 여럿이 동시에 작업한다 |
| **P4a** | 테마 엔진 — 규격 정의·검증, `extends` 병합, CSS 컴파일, 레이아웃 관리 | 테마 JSON을 넣으면 외형이 바뀐다 |
| **P4b** | 구조 구현체 전개 (`structures` 목록 완성) + 시스템 테마 세트 5종 | 관리자 외 사이트 형태를 그릴 수 있다 |
| **P4c** | 테마 저작 UI — 토큰 GUI, JSON 에디터, 테마 갤러리, 가져오기/내보내기 | 디자이너가 테마를 만든다 |
| **P5** | 코멘트/번호 마커 + 상호작용 규칙 + 뷰 모드 | 설계서로서 완성된다 |
| **P6** | 스냅샷 태그/복원 (테마 동결 포함) | 버전을 관리한다 |
| **P7** | 페이지 프리셋 + 테마 패턴 삽입 + JSON 가져오기/내보내기 | 반복 작업이 빨라진다 |
| **P8** | HTML 정적 번들 내보내기 | **MVP 릴리스** — 설계서를 배포한다 |
| **P9** | `wireb` CLI + MCP + 스킬 + `.wirebound.json` + lint | 에이전트가 설계서를 읽고 구현한다 |
| **P10** | PPTX 내보내기 (렌더 이미지 방식) | 보고용 산출물을 만든다 |

각 단계는 그 자체로 동작 가능한 상태를 만들고 끝낸다. P2까지 가면 단독 사용이 가능하고, P8이 1차 릴리스다.

P4를 셋으로 쪼갠 이유는 테마가 이 제품의 차별점이자 가장 큰 덩어리이기 때문이다. P4a는 엔진, P4b는 표현력, P4c는 저작 도구다. P4b까지만 해도 내장 테마로 다양한 사이트를 그릴 수 있고, P4c는 그다음에 붙여도 된다.

---

## 16. 열린 질문 (구현 중 결정)

- **구조 구현체 목록의 최종 범위** — §6.5의 목록은 초안이다. P4b에서 시스템 테마 5종을 실제로 만들어 보면서 부족한 구조를 추가하고 안 쓰는 구조를 뺀다. 이 목록은 렌더러 구현량과 직결되므로 실사용으로 검증한 뒤 고정한다.
- **테마 마켓/공유** — 조직 계층이 없으므로 지금은 프로젝트 간 테마 공유가 JSON 내보내기/가져오기뿐이다. 수요가 확인되면 공용 테마 저장소를 검토한다.
- **패턴 슬롯 타입 체계** — `text` · `media` · `action` 정도로 시작하되, 실제 패턴을 만들며 필요한 타입을 확정한다.
- **스냅샷 보관 정책** — 개수 제한 또는 보관 기간. 테마를 함께 저장하므로 payload가 더 커진다. 실사용 데이터가 쌓인 뒤 결정한다.
- **revision 로그 압축** — 페이지당 revision이 수만 건이 되면 오래된 구간을 주기적으로 압축한다. 성능 문제가 실제로 관측되면 착수한다.
