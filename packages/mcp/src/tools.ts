/**
 * 설계서 「MCP 도구」의 도구 표. **한 자리에 둔다** — `packages/cli`의 `COMMANDS`와 같은 자세다.
 *
 * ---
 *
 * # 왜 표가 분모인가
 *
 * `test/tools.test.ts`가 이 배열에서 분모를 만든다. 도구를 더하면서 구현을 빠뜨리는 경로도,
 * 구현을 만들면서 목록에 안 싣는 경로도 없다 — `wireb`가 `COMMANDS`로 쓰임말을 만드는 것과
 * 같은 이유다.
 *
 * # 인자 스키마에 **없는 것**이 판정이다
 *
 * `validate`가 `LintConfig`를 **안 받는다.** 정규식 원문을 주는 것은 리포의
 * `.wirebound.json`뿐이고 세션은 그 값을 못 준다.
 *
 * **근거:** 세션이 정규식을 주면 에이전트가 만든 문자열이 `new RegExp`에 들어간다. 그때
 * 필요한 것(길이 상한 · 백트래킹 · 타임아웃)을 이 서버가 갖추지 않았고, **갖추지 않은 것을
 * 전제로 경계를 여는 것이 사고다.** 그래서 **열지 않는다.**
 *
 * `test/tools.test.ts`가 **그 부재를 든다** — `wireb login`이 `--password` 플래그를 안 만드는
 * 것과 같은 자세다(`commands/login.ts`).
 *
 * # `projectId`도 안 받는다
 *
 * 설계서 「리포 바인딩」이 *"이 리포가 어느 설계 프로젝트에 대응하는가"*를 `.wirebound.json`에 담았다.
 * 세션이 그것을 덮으면 리포 바인딩의 존재 이유가 사라진다.
 *
 * # 쓰기 둘이 받는 것 — **줄을 더하는 것이 판정이다**
 *
 * `patch_page`가 `ops`·`baseSeq`를 받는다. **그 순간이 *"이 값을 세션이 줘도 되는가"*를
 * 다시 묻는 자리다** — 답은 갈렸다:
 *
 * | 값 | 받나 | 왜 |
 * |---|---|---|
 * | `ops` | **받는다** | **그것이 이 도구의 존재 이유다.** 무엇을 고칠지는 에이전트만 안다 |
 * | `baseSeq` | **받는다** | 「MCP 도구」가 *"baseSeq 필수"*라고 적었다. **도구가 스스로 읽으면 안 된다** — 그러면 *"에이전트가 읽은 문서 위에 얹는다"*는 설계서 「LLM 편집 경로」의 보증이 사라지고, 도구가 방금 읽은 판으로 남의 편집을 덮는다 |
 * | `nodeId` | **받는다**(`add_comment`) | 어느 노드에 말을 붙일지도 에이전트의 판단이다. `get_page`가 낸 `nodes[].id`가 그 값이다 |
 * | `projectId`·`token`·`config`·`naming` | **여전히 안 받는다** | 위 두 절이 닫은 경계다. 쓰기가 섰다고 열리지 않는다 |
 *
 * **`ops`를 검증하는 자리는 서버다.** 「LLM 편집 경로」가 *"사람 편집과 동일 경로"*라고 적었고
 * `http/patch-ops.ts`의 `OpsBody`가 그 경계를 이미 든다(상한 200 · 경로 술어 · `value` 키
 * 요구). 도구가 자기 검증을 더하면 **두 벌**이 되고, 두 벌은 오늘 같은 답을 내므로 값을
 * 재는 케이스가 갈림을 못 본다. 여기서 보는 것은 **모양뿐이다**(배열인가).
 */

/**
 * 인자 하나의 스키마. **JSON Schema의 부분집합만 쓴다** — 도구가 받는 모양이 셋뿐이다.
 *
 * `string` 밖의 둘은 `patch_page`의 `baseSeq`(수)와 `ops`(배열)다. **넓히는 것 자체가
 * 판정이다**: 여기 갈래를 더하면 도구가 받을 수 있는 모양이 늘어나고, `server.ts`의 검사도
 * 함께 늘어야 한다(그러지 않으면 검사를 안 지나는 모양이 생긴다). 검사 줄을 빠뜨리면 컴파일이
 * 멈춘다 — `server.ts`의 `assertShape` 머리말.
 */
export type ToolArgSchema =
  | { type: 'string'; description: string }
  | { type: 'integer'; description: string; minimum: number }
  | { type: 'array'; description: string; items: { type: 'object' } }

/** 인자 스키마. */
export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, ToolArgSchema>
  required?: string[]
  additionalProperties: false
}

export interface ToolSpec {
  name: string
  /** 에이전트가 읽고 고른다. **무엇을 돌려주는지까지 적는다.** */
  description: string
  inputSchema: ToolInputSchema
  /** 설계서 「MCP 도구」 표의 그 줄. **글자 그대로** 적는다 — 케이스가 설계 문서와 대조한다. */
  spec: string
}

/**
 * 페이지 경로(설계서 「상호작용」의 「모델」 절의 `page:` 타겟)를 받는 자리. 네 도구가 같은
 * 말을 받는다.
 */
const PATH_ARG = {
  type: 'string',
  description: '페이지 경로 (예: 관리자/회원/목록). `page:` 접두를 붙여도 됩니다.',
} as const

export const TOOLS: readonly ToolSpec[] = [
  {
    name: 'list_pages',
    description:
      '이 리포에 바인딩된 설계 프로젝트의 메뉴 트리와 페이지 목록을 돌려줍니다. ' +
      '각 페이지의 경로(관리자/회원/목록)가 get_page·validate 의 인자이고, kind 가 그 페이지의 종류(page 화면 · popup 팝업)입니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    spec: '프로젝트 메뉴/페이지 트리 조회',
  },
  {
    name: 'get_page',
    description:
      '페이지 하나의 스키마 문서·노드 개요·코멘트·상호작용 문장을 돌려줍니다. ' + '경로가 없거나 둘 이상이면 후보를 함께 말합니다.',
    inputSchema: { type: 'object', properties: { path: PATH_ARG }, required: ['path'], additionalProperties: false },
    spec: '페이지 스키마 + 코멘트 + 상호작용 문장 조회',
  },
  {
    name: 'patch_page',
    description:
      '페이지 문서를 JSON Patch 로 고칩니다. 사람 편집과 같은 경로를 지나므로 검증·이력·실시간 알림이 모두 같습니다. ' +
      'baseSeq 는 get_page 가 낸 headSeq 여야 합니다 — 그 사이 문서가 바뀌었으면 409 로 거절하고 아무것도 쓰지 않습니다. ' +
      '이 도구는 재시도하지 않습니다: 거절당하면 get_page 로 다시 읽고 ops 를 새로 만드세요.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_ARG,
        baseSeq: {
          type: 'integer',
          description: 'get_page 응답의 headSeq. 이 편집이 어느 판 위에 서는지를 말합니다.',
          minimum: 0,
        },
        ops: {
          type: 'array',
          description:
            'RFC 6902 JSON Patch 연산 목록 (add·remove·replace·move·test — copy 는 받지 않습니다). 경로는 /root 아래(get_page 응답의 nodes[].path 가 그 포인터입니다) · 화면 상태 목록 /viewStates 아래 · /version 입니다.',
          items: { type: 'object' },
        },
      },
      required: ['path', 'baseSeq', 'ops'],
      additionalProperties: false,
    },
    spec: '사람 편집과 동일 경로의 수정 (baseSeq 필수)',
  },
  {
    name: 'add_comment',
    description:
      '페이지의 노드 하나에 코멘트를 답니다. 구현 중 발견한 이슈를 설계서에 회신하는 자리입니다. ' +
      '번호가 없던 노드면 서버가 번호를 붙이므로 **문서가 바뀌고 headSeq 가 오릅니다** — 응답의 documentChanged 와 headSeq 를 보고 다음 patch_page 의 baseSeq 를 맞추세요.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_ARG,
        nodeId: {
          type: 'string',
          description: '코멘트를 달 노드의 id. get_page 응답의 nodes[].id 입니다.',
        },
        body: {
          type: 'string',
          description:
            '코멘트 본문. 다른 페이지 · 번호 · 공통코드를 가리키려면 토큰 `[보이는 글](wb:page/<pageId>)` · `[글](wb:comment/<pageId>/<nodeId>)`(그 노드의 번호) · ' +
            '`[글](wb:code/<그룹 키>)` · `[글](wb:code/<그룹 키>/<퍼센트 인코딩한 코드값>)` 을 넣습니다 — 읽는 자리마다 지금의 이름 · 번호로 풀립니다. ' +
            'get_page 의 comments[].resolved 가 풀린 글 뒤에 같은 대상을 괄호로 싣습니다(`(comment:<pageId>/<nodeId>)`).',
        },
      },
      required: ['path', 'nodeId', 'body'],
      additionalProperties: false,
    },
    spec: '구현 중 발견한 이슈를 설계서에 기록',
  },
  {
    name: 'validate',
    description:
      '설계서에 lint 규칙을 돌리고 결함 목록을 돌려줍니다. 결함이 있는 것은 오류가 아닙니다. ' +
      '경로를 주면 그 페이지의 결함만 내되 범위 밖에 남은 개수를 함께 말합니다. ' +
      '명명 규칙은 리포의 .wirebound.json 이 정합니다 — 인자로 줄 수 없습니다.',
    inputSchema: { type: 'object', properties: { path: PATH_ARG }, additionalProperties: false },
    spec: 'lint 규칙 실행',
  },
  {
    name: 'list_codes',
    description:
      '프로젝트의 공통코드 표(그룹 → 항목: 그룹 키 · 코드값 · 이름 · 사용 여부)와 그룹 · 항목마다 그것을 쓰는 노드 수를 돌려줍니다. ' +
      '노드는 그룹 키 · 코드값으로 표를 가리킵니다 — get_page 의 nodes[].code 가 그 참조와 풀린 이름(resolved)입니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    spec: '공통코드 표 + 사용 수 조회',
  },
  {
    name: 'code_usage',
    description:
      '공통코드 그룹(· 항목)을 가리키는 노드를 페이지 · 모듈마다 돌려줍니다. 항목을 지우거나 바꾸기 전에 고칠 곳을 셉니다. ' +
      '화면 상태로 숨은 노드 · 구역 안 노드도 셉니다.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: '그룹 키(예: ORDER_STATUS). list_codes 의 groups[].key 입니다.' },
        item: { type: 'string', description: '코드값(예: WAIT). 주면 그 항목을 가리키는 노드만 냅니다.' },
      },
      required: ['group'],
      additionalProperties: false,
    },
    spec: '공통코드 그룹 · 항목의 사용처 조회',
  },
  {
    name: 'edit_codes',
    description:
      '공통코드 표를 고칩니다. ops 를 차례로 보내고 첫 거절에서 멈춥니다 — 표에는 이력이 없어 묶음을 되돌리지 않으므로 응답의 applied 가 이미 된 수입니다. ' +
      '원소: { op: "add-group", group, name } · { op: "update-group", group, name?, sortOrder? } · { op: "delete-group", group } · ' +
      '{ op: "add-item", group, item, name, active? } · { op: "update-item", group, item, name?, sortOrder?, active? } · { op: "delete-item", group, item }. ' +
      '그룹 키 · 코드값은 만든 뒤 못 바꿉니다. 지운 그룹 · 항목을 가리키던 노드는 끊긴 참조로 남습니다(지우기 전에 code_usage).',
    inputSchema: {
      type: 'object',
      properties: {
        ops: { type: 'array', description: '표 쓰기 목록. 원소의 꼴은 이 도구의 설명에 있습니다.', items: { type: 'object' } },
      },
      required: ['ops'],
      additionalProperties: false,
    },
    spec: '공통코드 그룹 · 항목 만들기 · 고치기 · 지우기',
  },
]

/** 표에서 하나. 모르는 이름이면 `undefined` — 부르는 쪽이 그것을 프로토콜 오류로 만든다. */
export function findTool(name: string): ToolSpec | undefined {
  return TOOLS.find((tool) => tool.name === name)
}
