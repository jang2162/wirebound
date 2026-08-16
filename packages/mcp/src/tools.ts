/**
 * §12.2의 도구 표. **한 자리에 둔다** — `packages/cli`의 `COMMANDS`와 같은 자세다.
 *
 * ---
 *
 * # 왜 표가 분모인가
 *
 * `test/tools.test.ts`가 이 배열에서 분모를 만든다. 도구를 더하면서 구현을 빠뜨리는 경로도,
 * 구현을 만들면서 목록에 안 싣는 경로도 없다 — `wireb`가 `COMMANDS`로 쓰임말을 만드는 것과
 * 같은 이유다(P9-2 이월 §1).
 *
 * # 인자 스키마에 **없는 것**이 판정이다 (D5)
 *
 * `validate`가 `LintConfig`를 **안 받는다.** 정규식 원문을 주는 것은 리포의
 * `.wirebound.json`뿐이고 세션은 그 값을 못 준다.
 *
 * **근거:** 세션이 정규식을 주면 에이전트가 만든 문자열이 `new RegExp`에 들어간다. 그때
 * 필요한 것(길이 상한 · 백트래킹 · 타임아웃)은 이 슬라이스 밖이고, **범위 밖의 것을 전제로
 * 경계를 여는 것이 사고다.** P9-1 이월 §5.2가 묻고 P9-2 이월 §2가 넘기고 P9-3 이월 §3이
 * *"경계가 바뀌는 날이 P9-4다"*로 적은 물음에 대한 답이 **열지 않는다**이다.
 *
 * `test/tools.test.ts`가 **그 부재를 든다** — P9-2가 `--password`에서 한 것과 같은 자리다.
 *
 * # `projectId`도 안 받는다 (D4)
 *
 * §12.1이 *"이 리포가 어느 설계 프로젝트에 대응하는가"*를 `.wirebound.json`에 담았다.
 * 세션이 그것을 덮으면 리포 바인딩의 존재 이유가 사라진다.
 */

/** 인자 스키마. JSON Schema의 부분집합만 쓴다 — 도구 셋이 받는 것이 문자열 하나뿐이다. */
export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, { type: 'string'; description: string }>
  required?: string[]
  additionalProperties: false
}

export interface ToolSpec {
  name: string
  /** 에이전트가 읽고 고른다. **무엇을 돌려주는지까지 적는다.** */
  description: string
  inputSchema: ToolInputSchema
  /** §12.2의 그 줄. **글자 그대로** 적는다 — 케이스가 설계 문서와 대조한다. */
  spec: string
}

/** §8.1의 페이지 경로를 받는 자리. 두 도구가 같은 말을 받는다. */
const PATH_ARG = {
  type: 'string',
  description: '페이지 경로 (예: 관리자/회원/목록). `page:` 접두를 붙여도 됩니다.',
} as const

export const TOOLS: readonly ToolSpec[] = [
  {
    name: 'list_pages',
    description:
      '이 리포에 바인딩된 설계 프로젝트의 메뉴 트리와 페이지 목록을 돌려줍니다. ' +
      '각 페이지의 경로(관리자/회원/목록)가 get_page·validate 의 인자입니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    spec: '프로젝트 메뉴/페이지 트리 조회',
  },
  {
    name: 'get_page',
    description:
      '페이지 하나의 스키마 문서·노드 개요·코멘트·상호작용 문장을 돌려줍니다. ' +
      '경로가 없거나 둘 이상이면 후보를 함께 말합니다.',
    inputSchema: { type: 'object', properties: { path: PATH_ARG }, required: ['path'], additionalProperties: false },
    spec: '페이지 스키마 + 코멘트 + 상호작용 문장 조회',
  },
  {
    name: 'validate',
    description:
      '설계서와 테마에 lint 규칙을 돌리고 결함 목록을 돌려줍니다. 결함이 있는 것은 오류가 아닙니다. ' +
      '경로를 주면 그 페이지의 결함만 내되 범위 밖에 남은 개수를 함께 말합니다. ' +
      '명명 규칙은 리포의 .wirebound.json 이 정합니다 — 인자로 줄 수 없습니다.',
    inputSchema: { type: 'object', properties: { path: PATH_ARG }, additionalProperties: false },
    spec: 'lint 규칙 실행',
  },
]

/** 표에서 하나. 모르는 이름이면 `undefined` — 부르는 쪽이 그것을 프로토콜 오류로 만든다. */
export function findTool(name: string): ToolSpec | undefined {
  return TOOLS.find((tool) => tool.name === name)
}
