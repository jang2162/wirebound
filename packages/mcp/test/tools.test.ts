/**
 * **설계서 「MCP 도구」의 도구 표를 설계 문서에서 읽어 대조한다.** 손으로 옮긴 인용은 설계가
 * 바뀌어도 조용하다 — `packages/schema/test/lint-rules.test.ts`가 선례다.
 *
 * 이 파일이 드는 것 셋:
 *
 * 1. 표가 「MCP 도구」의 **다섯을 빠짐없이** 덮는다 — 쓰기 둘도 표에 있다.
 * 2. **없는 것** — `validate`가 `LintConfig`를 안 받고 어느 도구도 `projectId`를 안 받는다
 *    (`tools.ts`의 머리말).
 * 3. 인자 검사가 **표에서 나온다** — 도구마다 손으로 짠 검사가 아니다.
 */
import { describe, expect, it } from 'vitest'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { createFakeIo } from '@wirebound/cli/test-support'
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { HANDLERS } from '../src/handlers'
import { callTool } from '../src/server'
import { TOOLS, findTool } from '../src/tools'

/** 「MCP 도구」의 표에서 `| 도구 | 용도 |` 줄을 읽는다. */
function specTools(): { name: string; use: string }[] {
  const section = designDoc.slice(
    designDoc.indexOf('### 12.2 MCP 도구'),
    designDoc.indexOf('### 12.3 CLI'),
  )
  const found: { name: string; use: string }[] = []
  for (const line of section.split('\n')) {
    const match = /^\|\s*`([a-z_]+)`\s*\|\s*(.+?)\s*\|$/.exec(line.trim())
    if (match) found.push({ name: match[1]!, use: match[2]! })
  }
  return found
}

describe('도구 표가 설계서 「MCP 도구」를 센다', () => {
  const spec = specTools()

  it('설계 문서에서 도구 줄을 실제로 읽는다', () => {
    // 파서가 어긋나면 **빈 집합에서 아래가 조용히 통과한다.**
    expect(spec.map((tool) => tool.name)).toEqual([
      'list_pages',
      'get_page',
      'patch_page',
      'add_comment',
      'validate',
    ])
  })

  it('「MCP 도구」의 다섯을 빠짐없이 덮는다 — 이름도 용도도 문서에서 온다', () => {
    // **수를 여기 적지 않는다.** 문서가 든 줄이 곧 기대값이고 **순서까지 같다.**
    expect(TOOLS.map((tool) => ({ name: tool.name, use: tool.spec }))).toEqual(
      spec.map((tool) => ({ name: tool.name, use: tool.use })),
    )
  })

  it('쓰기 둘이 실재한다 — 표가 다시 좁아지면 죽는다', () => {
    // **이 케이스를 지우지 않는다.** 지우면 「MCP 도구」의 표와 `TOOLS`가 함께 좁아져도
    // 아무도 안 죽는다.
    for (const name of ['patch_page', 'add_comment']) {
      expect(findTool(name), name).toBeDefined()
    }
  })

  it('표의 모든 도구에 설명과 인자 스키마가 있다', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20)
      expect(tool.inputSchema.type, tool.name).toBe('object')
      // 모르는 인자를 조용히 무시하지 않는다.
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false)
    }
  })

  it('이름이 중복되지 않는다', () => {
    expect(new Set(TOOLS.map((tool) => tool.name)).size).toBe(TOOLS.length)
  })
})

/**
 * **도구가 받아도 되는 인자 이름 — 전체 목록이다.**
 *
 * **위험한 이름을 적은 블랙리스트만으로는 못 지킨다** — 이름을 정확히 맞추는 목록이라
 * `validate`에 `namingRule`을 더해도 안 잡는다. **도구 이름을 손으로 적은 화이트리스트도
 * 못 지킨다** — 새 도구를 더하면 그 도구의 인자는 어느 줄에도 안 걸린다.
 *
 * **그래서 분모를 `TOOLS`에서 만든다.** 도구가 몇 개든, 이름이 무엇이든, 이 목록 밖의 인자를
 * 받으면 죽는다.
 *
 * **줄을 더하는 것은 판정이다.** 도구가 새 인자를 받아야 하면 그때 여기에 이유와 함께
 * 적어라 — 그 순간이 *"이 값을 세션이 줘도 되는가"*를 다시 묻는 자리다.
 */
const ALLOWED_ARGS: readonly { name: string; why: string }[] = [
  { name: 'path', why: '§8.1의 페이지 경로. 세션이 만드는 값이 아니라 list_pages 가 낸 값이다' },
  {
    name: 'baseSeq',
    why: 'P9-5 D5 — §12.2가 "baseSeq 필수"라고 적었다. 도구가 스스로 읽으면 "에이전트가 읽은 문서 위에 얹는다"는 §7.4의 보증이 사라진다',
  },
  {
    name: 'ops',
    why: 'P9-5 D5 — 그것이 patch_page 의 존재 이유다. **검증하는 자리는 서버다**(§7.4의 "사람 편집과 동일 경로") — 도구가 자기 검증을 더하면 두 벌이 된다',
  },
  { name: 'nodeId', why: 'P9-5 — 어느 노드에 말을 붙일지는 에이전트의 판단이다. get_page 가 낸 nodes[].id 가 그 값이다' },
  { name: 'body', why: 'P9-5 — 코멘트 본문. 길이 상한은 서버가 든다(COMMENT_BODY_MAX_LENGTH)' },
]

describe('인자 스키마에 **없는 것**이 판정이다', () => {
  /**
   * **정규식의 신뢰 경계를 열지 않는다. 프로젝트는 리포가 정한다**(`tools.ts`의 머리말).
   * **그 부재를 이 케이스가 든다.**
   *
   * 여는 순간 에이전트가 만든 문자열이 `new RegExp`에 들어간다. 그때 필요한 것(길이 상한 ·
   * 백트래킹 · 타임아웃)을 이 서버가 갖추지 않았다.
   */
  it('어느 도구도 허용 목록 밖의 인자를 안 받는다 (D4·D5)', () => {
    const allowed = ALLOWED_ARGS.map((entry) => entry.name)
    const found: string[] = []
    for (const tool of TOOLS) {
      for (const key of Object.keys(tool.inputSchema.properties)) {
        if (!allowed.includes(key)) found.push(`${tool.name}.${key}`)
      }
    }
    expect(found).toEqual([])
  })

  it('허용 목록에 이유가 달려 있고 죽은 줄이 없다', () => {
    // 이유 없이 늘리면 위 케이스가 아무것도 안 막는다.
    for (const entry of ALLOWED_ARGS) expect(entry.why.length, entry.name).toBeGreaterThan(10)
    // 어느 도구도 안 받는 이름을 허용해 두면 그것도 죽은 허가다.
    const used = new Set(TOOLS.flatMap((tool) => Object.keys(tool.inputSchema.properties)))
    expect(ALLOWED_ARGS.map((entry) => entry.name).filter((name) => !used.has(name))).toEqual([])
  })

  /**
   * **위험한 이름을 따로도 든다.** 위 화이트리스트가 이미 그것을 덮지만, 이 줄들이
   * **왜 닫혀 있는지**를 이름으로 남긴다 — 정규식의 신뢰 경계가 무엇을 막는 판정인지 다음
   * 사람이 읽는다.
   */
  it('정규식·프로젝트·자격을 이름으로도 막는다', () => {
    for (const tool of TOOLS) {
      const keys = Object.keys(tool.inputSchema.properties)
      for (const forbidden of ['config', 'lint', 'naming', 'pattern', 'regex', 'rules', 'projectId', 'project', 'server', 'token', 'cwd']) {
        expect(keys, `${tool.name}.${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('다섯이 받는 것 — 모양을 고정한다', () => {
    expect(Object.keys(findTool('list_pages')!.inputSchema.properties)).toEqual([])
    expect(Object.keys(findTool('get_page')!.inputSchema.properties)).toEqual(['path'])
    expect(Object.keys(findTool('patch_page')!.inputSchema.properties)).toEqual(['path', 'baseSeq', 'ops'])
    expect(Object.keys(findTool('add_comment')!.inputSchema.properties)).toEqual(['path', 'nodeId', 'body'])
    expect(Object.keys(findTool('validate')!.inputSchema.properties)).toEqual(['path'])
  })

  it('get_page는 경로가 필수이고 validate는 아니다', () => {
    expect(findTool('get_page')!.inputSchema.required).toEqual(['path'])
    expect(findTool('validate')!.inputSchema.required).toBeUndefined()
  })

  /**
   * **쓰기는 셋 다 필수다.** 하나라도 선택이면 *"안 줬다"*가 서버까지 가고, 그때 나오는
   * 문장은 도구 인자 이름을 안 쓴다 — 에이전트가 무엇을 빠뜨렸는지 모른다.
   */
  it('쓰기 둘은 인자가 전부 필수다', () => {
    expect(findTool('patch_page')!.inputSchema.required).toEqual(['path', 'baseSeq', 'ops'])
    expect(findTool('add_comment')!.inputSchema.required).toEqual(['path', 'nodeId', 'body'])
  })
})

/**
 * **`outcome.ts` 표의 첫 줄** — *"명령을 잘못 썼다"*(CLI 코드 1)는 JSON-RPC 오류다. 결과가 아니다.
 *
 * 검사가 **표에서 나오는지**를 함께 잰다: 도구마다 손으로 짠 검사면 표에 줄을 더할 때
 * 검사를 빠뜨리는 경로가 생긴다.
 */
describe('인자 검사는 표에서 나온다', () => {
  const io = createFakeIo()

  it('모르는 도구는 MethodNotFound다', async () => {
    await expect(callTool(io, 'delete_project', {})).rejects.toMatchObject({
      code: ErrorCode.MethodNotFound,
    })
  })

  it('모르는 인자는 InvalidParams다 — 조용히 무시하지 않는다', async () => {
    for (const tool of TOOLS) {
      const error = await callTool(io, tool.name, { pageId: 'x' }).catch((e: unknown) => e)
      expect(error, tool.name).toBeInstanceOf(McpError)
      expect((error as McpError).code, tool.name).toBe(ErrorCode.InvalidParams)
      expect((error as McpError).message, tool.name).toContain('pageId')
    }
  })

  it('빠진 필수 인자는 InvalidParams다', async () => {
    await expect(callTool(io, 'get_page', {})).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
  })

  it('문자열이 아닌 인자는 InvalidParams다', async () => {
    await expect(callTool(io, 'get_page', { path: 12 })).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
    })
  })

  it('인자를 아예 안 줘도 필수가 없으면 지나간다 — 검사가 늘 던지지 않는다', async () => {
    // 반대편을 확인한다. 이 갈래가 없으면 위 넷이 *"언제나 던진다"*로도 통과한다.
    // 바인딩이 없는 `io`라 도구는 `isError` 결과로 끝난다 — **던지지 않는 것이 요점이다.**
    const outcome = await callTool(io, 'list_pages', undefined)
    expect(outcome.isError).toBe(true)
  })

  it('표의 모든 도구에 구현이 있다', () => {
    // 표에 줄만 더하고 지나가는 경로가 없다. **분모가 표다.**
    expect(TOOLS.map((tool) => tool.name).filter((name) => HANDLERS[name] === undefined)).toEqual([])
  })

  it('표에 없는 이름의 구현이 없다 — 반대편', () => {
    expect(Object.keys(HANDLERS).filter((name) => findTool(name) === undefined)).toEqual([])
  })
})
