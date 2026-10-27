# wirebound 설계서로 화면 구현하기

이 리포에는 `.wirebound.json`이 있고, 그 파일이 가리키는 **wirebound 설계 프로젝트**에
화면 설계가 들어 있다. `wirebound` MCP 서버가 그 설계서를 읽고 고치는 도구 다섯을 낸다.

> 이 문서는 `@wirebound/mcp` 패키지의 `skill/SKILL.md`다. 호스트에 스킬로 설치하거나
> 에이전트 지침에 그대로 실어라. **`packages/mcp/test/skill.test.ts`가 이 문서의 도구
> 이름·인자 이름을 실제 도구 표와 대조한다** — 여기 적힌 것이 없는 인자면 그 케이스가 죽는다.

## 도구 다섯

| 도구 | 인자 | 무엇을 하나 |
|---|---|---|
| `list_pages` | (없음) | 메뉴 트리와 페이지 목록. **각 줄의 `path`가 다른 도구의 인자다** |
| `get_page` | `path` | 페이지 하나의 문서·노드 개요·코멘트·상호작용 문장. **`headSeq`를 함께 낸다** |
| `patch_page` | `path` · `baseSeq` · `ops` | 문서를 JSON Patch로 고친다. 사람 편집과 같은 경로다 |
| `add_comment` | `path` · `nodeId` · `body` | 노드에 코멘트를 단다. 설계에 회신하는 자리다 |
| `validate` | `path` | lint 규칙을 돌린다. `path`를 빼면 프로젝트 전체다 |

프로젝트·서버·토큰은 **인자가 아니다.** 리포의 `.wirebound.json`과 로그인 자격이 정한다.
명명 규칙(`lint`)도 그 파일에서만 온다.

## 흐름

1. 화면 구현 요청을 받으면 `list_pages`로 대상 페이지를 찾는다.
2. `get_page`로 스키마·코멘트·상호작용을 읽는다.
3. 구현한다.
4. 설계와 어긋나거나 결정이 필요한 부분을 `add_comment`로 회신한다.
5. `validate`로 설계서 자체의 결함을 보고한다. `document-invalid` 의 «Page는 루트에만 둘 수 있습니다»는 그 규칙 전에 저장된
   페이지다 — `nodeId` 가 가리키는 Page 안의 노드를 밖으로 옮기고 그 Page 를 지우면 사라진다고 사람에게 알린다.

**3단계는 도구가 아니다** — 리포의 컨벤션에 따라 네가 판단해 코드를 쓴다. 설계서 페이지와
소스 파일을 잇는 매핑은 wirebound가 갖고 있지 않다.

`patch_page`는 이 흐름에 없다. **설계서를 고치는 것은 사람의 일이 기본**이고, 도구가 그것을
할 수 있는 것은 사람이 명시적으로 시킬 때다(*"목록에 정렬 컬럼을 추가해 줘"*).

## 경로를 다루는 법

`list_pages`가 낸 `path`(`관리자/회원/목록`)를 **그대로** 다른 도구에 넣어라. 제목만
(`목록`) 주면 못 찾는다 — 조상 메뉴가 경로의 일부다.

- 못 찾으면 `found: false` · `reason: "no-such-path"`와 함께 **후보 목록**이 온다. 오류가
  아니다 — 후보를 읽고 고쳐라.
- 둘 이상이면 `reason: "ambiguous"`다. **도구가 하나를 고르지 않는다** — 같은 타겟을 든
  페이지가 둘이면 설계서의 링크도 그 페이지들을 못 가리킨다. `add_comment`로 그 사실을
  회신하는 것이 옳은 다음 걸음이다.
- `list_pages`의 `duplicatePaths`가 비어 있지 않으면 그 경로들이 그 상태다.

## 고칠 때 (`patch_page`)

`baseSeq`는 **`get_page`가 낸 `headSeq`**다. 지어내지 마라 — 그 값이 *"내가 읽은 문서 위에
얹는다"*를 서버에게 말하는 유일한 수단이다.

`ops`의 경로는 `get_page` 응답의 `nodes[].path`가 그대로 JSON Pointer다.

같은 타입이 여럿이면 `nodes[].rowLabel`(구조 트리 줄과 같은 `타입 (별칭) 요약`)과 `nodes[].alias`(사람이 붙인 이름 — 있을 때만)로
가른다. 별칭은 노드의 alias 필드다 — 고치려면 그 노드 경로 뒤 /alias 를 add · replace · remove 한다(앞뒤 공백 없는 1 ~ 60자 · 줄바꿈 · 제어 문자 · 방향 제어 글자 · 짝 없는 서로게이트 없음 · 보이는 글자가 있어야 함. 어기면 거절된다).

**자식 자리는 구역이다.** 노드의 몸통은 `children`(`…/children/<i>`), 카드의 머리 오른쪽 · 바닥이나 폼의 단추 같은 이름 붙은 자리는
`zones`(`…/zones/<이름>/<i>` — `nodes[].zone` 이 그 이름)다. 컴포넌트마다 어떤 구역이 있는지는 `/llms.txt` 의 카탈로그가 적는다. 빈 구역에 첫
노드를 넣으려면 `…/zones/<이름>` 에 `[노드]` 를 `add` 한다(`zones` 가 없으면 `…/zones` 에 `{ "<이름>": [노드] }`). 서버는 새 검색폼 · 입력폼에
단추를 넣어 주지 않는다 — 단추가 필요하면 `actions` 구역에 `Button` 을 함께 넣는다. **탭은 `TabPanel` 노드다** — 탭 하나가 `Tabs` 몸통의
`TabPanel` 하나이고(이름은 그 `label`), 그 탭의 내용은 패널의 `children` 이다. 탭을 바꾸는 상호작용은 패널을 가리킨다(`switchTab` 의 `target`).

**그리드는 열 · 행 · 칸이다.** `DataGrid` 의 몸통(`children`)이 열(`GridColumn` — `label` 이 머리 칸, `children` 이 셀 틀 · `GridColumnGroup` —
병합 머리, 그 `children` 이 아래 열들)이고 `zones.rows` 가 행(`GridRow` — `repeat` 줄로 그려진다)이다. 칸 없는 행은 셀 틀을 줄마다 되풀이하고(모든 줄이
같은 글이다), 줄마다 다른 값이 필요한 행만 `GridCell` 을 `children` 으로 갖는다(칸이 앞 열부터 덮는다 — `span` · `rowSpan`). 열 하나를 더하려면 몸통에
`GridColumn` 하나(셀 틀 포함)를 `add` 한다 — 행마다 칸을 더하지 않는다. 바닥(`zones.footer`)의 `Pagination` 은 `total` · `pageSize` · `page` 로 범위 글을
셈한다. 서버는 새 그리드에 열 · 행 · 바를 넣어 주지 않는다 — 함께 넣는다.

**반복 행 입력 표(`[추가]` · 행마다 입력 · `[삭제]` · 합계)는 같은 `DataGrid` 다.** `[추가]` 는 `zones.headEnd` 의 `Button`, 행마다 입력은 열의 셀 틀
(`Input` · `DateInput` …), `[삭제]` 는 «삭제» 열의 셀 틀 `Button`, 합계는 `GridRow` `kind: "total"` 의 제 칸이다. 바닥 바는 빼 둔다. 에디터 팔레트의
«반복 행 표» 카드가 넣는 꼴은 `/llms.txt` 의 `DataGrid` 절 «Editor preset» 줄에 있다 — 같은 꼴을 `patch_page` 로 적는다(노드마다 id 를 지어 붙인다).

**파일첨부는 `FileAttach` 다.** 파일 목록은 prop `files`(`{ "name", "size" }` 배열 — 표본 값이다 · 실제 파일은 안 올린다)이고, 단추는 `zones.actions`
의 `Button` 이다(서버는 넣어 주지 않는다). 한도 글은 `maxFiles`(0 이면 개수 없음) · `maxSize`(빈 글이면 크기 없음)에서 짓는다. 폼 표의 값 칸에 둘 때는
`Field` 의 `children` 에 넣는다. «[파일선택][선택된 파일 없음]» 같은 단순 파일 선택 줄은 파일첨부가 아니라 `Button` + `readonly` `Input` 이다.

**팝업은 페이지의 종류다.** 뿌리가 `Popup` 인 페이지가 팝업 페이지다(`list_pages` 의 `kind` 가 `popup` · `get_page` 의 `kind`). 팝업의 제목은
뿌리의 `title`, 크기는 `size`(`small` · `medium` · `large`)이고, 내용은 뿌리의 `children`, 바닥 단추는 `zones.footer` 다 — 닫기(✖)는 노드가 아니다.
다른 화면에서 그 팝업을 띄우는 상호작용은 `openModal`(대상은 그 팝업 페이지의 경로), 팝업 안의 «취소» · «닫기» 단추는 `closeModal`(대상 없음 —
`{ "type": "closeModal" }`)이다. 팝업 페이지를 새로 만드는 도구는 없다 — 사람이 메뉴 트리에서 만든다. 있는 팝업 페이지의 뿌리 · 바닥을 고친다.
`validate` 는 팝업이 아닌 페이지를 `openModal` 로 · 팝업 페이지를 `navigate` 로 가리키는 것 · 화면 페이지의 `closeModal` 을 경고한다.

성공하면 응답의 `headSeq`가 **새 값**이다. 이어서 고칠 것이 있으면 그 값을 다음
`baseSeq`로 쓴다.

### 거절당했을 때 — 세 갈래가 다른 일을 시킨다

| `reason` | 뜻 | 할 일 |
|---|---|---|
| `stale`(409) | 문서가 내 밑에서 움직였다 | **`get_page`로 다시 읽고 `ops`를 새로 만든다.** 같은 `ops`를 새 `baseSeq`로 다시 보내면 남이 고친 것 위에 얹힌다 |
| `locked`(423) | **사람이 그 영역을 편집 중이다** | 재조회해도 안 풀린다. 기다렸다 다시 하거나 다른 페이지를 먼저 한다. 문장에 누가 잡고 있는지가 있다 |
| `rejected` | 서버가 다른 이유로 거절했다 | 문장을 읽는다(권한·검증 실패·없는 페이지) |

**도구는 재시도하지 않는다.** 그것이 의도다 — 몰래 재시도하면 네가 만든 patch가 **다른
문서**에 얹히고, 그 편집은 성공으로 끝난다.

`locked`에 재시도 루프를 돌리지 마라. 잠금이 풀리는 순간 네가 남의 구역을 고치게 된다.

### 쓰기를 겹쳐 보내지 마라

**이 서버는 도구 호출을 동시에 처리한다**(실측). `patch_page`가 도는 중에 또 `patch_page`나
`add_comment`를 부르면 **둘 중 하나가 409**다 — 앞엣것이 `headSeq`를 올리기 때문이다.

하나가 끝나 새 `headSeq`를 받고 **나서** 다음을 불러라. 읽기(`list_pages`·`get_page`·
`validate`)는 겹쳐도 된다.

## 화면 상태를 다룰 때

같은 페이지가 상황(권한 · 로그인 · 데이터 유무)에 따라 다른 화면을 보이면 설계서는 **화면 상태**로 적는다. 상태 목록은 문서의
`viewStates`(`{ id, name, parent? }` 배열)이고 `parent` 로 트리다(깊이 3 까지 · 많아야 20개). «기본»은 목록에 없이 늘 있다(id `default`).
**자식 상태는 부모의 경우를 좁힌 것이다** — «로그인 > 관리자»의 관리자 화면은 로그인 화면에서 보이는 것을 물려받는다.

노드마다 `visibility` 로 어느 상태에서 보이는지 적는다. 없으면 모든 상태에서 보인다.

| `visibility` | 뜻 |
|---|---|
| `{ "mode": "only", "states": [...] }` | 나열한 상태(와 그 하위 상태)에서만 보인다 |
| `{ "mode": "except", "states": [...] }` | 나열한 상태(와 그 하위 상태)에서 숨는다 |

- `states` 는 1개 이상 · 겹침 없음 · 목록의 id 또는 `default`(기본 화면 — 하위가 없다). 부모가 숨으면 자손도 숨는다. 페이지 뿌리에는 못 둔다.
- `get_page` 의 `page.viewStates` 가 목록(트리 차례가 아니라 목록 차례 — `parent` 로 짓는다)이고, `nodes[].visibility` 가 그 노드 자신의
  보임이다. `nodes[].name` 은 `only` 노드(와 그 안)에 «'승인 버튼'(관리자 상태)»처럼 상태를 단다.
- 상태 전용 도구는 없다. **`patch_page` 의 JSON Patch 로 고친다** — 아래 꼴대로.
- 상태 id 는 노드 id 와 같은 글자(영문 · 숫자 · `_` · `-`, 64자까지)로 네가 짓는다. `default` 는 못 쓴다.

**상태 더하기** — 목록이 **없으면** `/viewStates` 를 배열째 `add`, **있으면** `/viewStates/-` 로 끝에 더한다(목록이 있는데 `/viewStates` 를
통째로 `add` 하면 남의 목록을 덮는다). 이름은 앞뒤 공백 없는 1 ~ 30자 · 페이지 안에서 겹치지 않음.

<!-- wirebound:example add-state -->
```json
[
  { "op": "add", "path": "/viewStates", "value": [{ "id": "s_login", "name": "로그인" }] }
]
```

**하위 상태 더하기** — `parent` 를 싣고, 그 부모의 자리 앞에 `test /viewStates/<i>/id` 를 둔다(그 사이 남이 부모를 지웠으면 409 로 막힌다).

<!-- wirebound:example add-child-state -->
```json
[
  { "op": "test", "path": "/viewStates/0/id", "value": "s_login" },
  { "op": "add", "path": "/viewStates/-", "value": { "id": "s_admin", "name": "관리자", "parent": "s_login" } }
]
```

**노드를 그 상태에서만 보이기** — 노드의 `visibility` 를 `add`(있으면 `replace`)한다(아래는 `/root/children/1` 의 노드).

<!-- wirebound:example show-only -->
```json
[
  { "op": "add", "path": "/root/children/1/visibility", "value": { "mode": "only", "states": ["s_admin"] } }
]
```

**이름 바꾸기 · 순서 바꾸기 · 지우기** — 목록의 자리(`/viewStates/<i>`)를 고치는 연산 앞에 `test /viewStates/<i>/id` 를 둔다. 순서는 형제(같은
`parent`) 사이에서만 바꾼다. **상태를 지울 때는 하위 상태와 그 상태들을 가리키는 보임을 같은 묶음에서 함께 고친다** — `only` 가 비는 노드는
지우고, `except` 가 비는 노드는 `visibility` 를 지우고, 남는 것은 `states` 를 `replace` 한다. 목록에서만 빼거나 목록 밖 상태를 보임에 넣으면
422 `state-cases-left` 다.

<!-- wirebound:example remove-state -->
```json
[
  { "op": "remove", "path": "/root/children/1" },
  { "op": "test", "path": "/viewStates/1/id", "value": "s_admin" },
  { "op": "remove", "path": "/viewStates/1" }
]
```

`validate` 는 목록에 없는 상태를 가리키는 보임(`warning`) · 어느 보임도 안 가리키는 상태(`info`)를 말한다. `info` 는 결함이 아니다 —
`infos` 로 따로 센다.

## 회신할 때 (`add_comment`)

**코멘트가 문서를 바꾼다.** 번호가 없던 노드에 첫 코멘트를 달면 서버가 번호(`marker`)를
붙이고, 그것은 문서 편집이라 `headSeq`가 오른다.

- 응답의 `documentChanged`가 `true`면 **들고 있던 `baseSeq`가 낡았다.** 응답의 `headSeq`가
  새 값이다 — 그것을 쓰지 않으면 다음 `patch_page`가 409다.
- 이미 번호가 있는 노드에 하나 더 달면 `documentChanged`가 `false`이고 `headSeq`는 그대로다.

`nodeId`는 `get_page` 응답의 `nodes[].id`다. 없는 노드면 `reason: "no-such-node"`가 온다.

## 검사할 때 (`validate`)

**`failing`만 읽지 마라.** `failing`은 *"`error` 등급 결함이 있는가"*이고, 그것이 `false`라고
설계서가 깨끗한 것이 아니다.

| 필드 | 0이 아니면 |
|---|---|
| `notes` | **검사에서 빠진 것이 있다** — 테마를 안 고른 레이아웃·상속이 끊긴 파생 테마·못 올린 문서 버전·메뉴를 잃은 페이지. 결함 0건이 *"깨끗하다"*가 아니다 |
| `outsideErrors` | `path`를 줬을 때 **그 범위 밖에 남은 `error`** 수. 프로젝트가 깨끗하다고 말하면 안 된다 |
| `droppedProjectIssues` | 페이지에 안 매인 이슈(테마·메뉴 이름 규칙)가 경로 필터에서 통째로 빠진 수 |
| `warnings` | 저장을 막지 않은 이슈. 보고할 값이다 |

각 이슈의 `pagePath`가 `get_page`에 그대로 넣을 수 있는 값이다.

## 도구가 실패로 답했을 때

`isError`가 선 응답은 **재시도할 것이 아니라 사람이 고칠 것**이다. 문장 앞의
`[wireb 코드 N]`이 무엇을 해야 하는지 말한다.

| 코드 | 뜻 | 사람이 할 일 |
|---|---|---|
| 2 | 설정·자격이 없다 | 리포 뿌리에서 `wireb init`, 또는 `wireb login` |
| 3 | 서버가 거절했다 | 문장을 읽는다(권한·잠금·검증) |
| 4 | 서버에 못 닿았다 | 주소·네트워크·서버 기동을 본다 |

같은 도구를 다시 부르면 같은 답이 온다. **무엇을 해야 하는지 사람에게 말해라.**

## 알아 둘 것

- **네가 고친 것은 이력에 `mcp`로 남는다.** 사람 화면에도 실시간으로 그렇게 보인다 —
  숨기려 하지 마라.
- **잠금을 걸지 않는다.** 걸 수단도 없다. 다만 남이 잡은 자리에는 막힌다(위 `locked`).
- **응답의 `capturedAt`이 그 답이 선 시점이다.** 도구를 부를 때마다 새로 읽으므로, 오래
  전에 읽은 값을 근거로 삼지 마라.
