/**
 * **§12.2의 도구 표를 설계 문서에서 읽어 대조한다.** 손으로 옮긴 인용은 설계가 바뀌어도
 * 조용하다 — `packages/schema/test/lint-rules.test.ts`가 선례다.
 *
 * 이 파일이 드는 것 셋:
 *
 * 1. 표가 §12.2의 **읽기 셋**을 빠짐없이 덮고, 쓰기 둘을 **아직 안 덮는다**(그것이 P9-5다).
 * 2. **없는 것** — `validate`가 `LintConfig`를 안 받고(D5) 어느 도구도 `projectId`를 안 받는다(D4).
 * 3. 인자 검사가 **표에서 나온다** — 도구마다 손으로 짠 검사가 아니다.
 */
import { describe, expect, it } from 'vitest'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { createFakeIo } from '@wirebound/cli/test-support'
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { HANDLERS } from '../src/handlers'
import { callTool } from '../src/server'
import { TOOLS, findTool } from '../src/tools'

/** §12.2의 표에서 `| 도구 | 용도 |` 줄을 읽는다. */
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

/** 이 슬라이스가 짓는 셋. 나머지 둘(`patch_page`·`add_comment`)은 P9-5다. */
const READ_TOOLS = ['list_pages', 'get_page', 'validate']

describe('도구 표가 §12.2를 센다', () => {
  const spec = specTools()

  it('설계 문서에서 도구 줄을 실제로 읽는다', () => {
    // 파서가 어긋나면 **빈 집합에서 아래가 조용히 통과한다**(이 저장소가 여러 번 겪은 사고다).
    expect(spec.map((tool) => tool.name)).toEqual([
      'list_pages',
      'get_page',
      'patch_page',
      'add_comment',
      'validate',
    ])
  })

  it('읽기 셋을 빠짐없이 덮는다 — 이름도 용도도 문서에서 온다', () => {
    // **수를 여기 적지 않는다.** 문서가 든 줄이 곧 기대값이다.
    const expected = spec.filter((tool) => READ_TOOLS.includes(tool.name))
    expect(TOOLS.map((tool) => ({ name: tool.name, use: tool.spec }))).toEqual(
      expected.map((tool) => ({ name: tool.name, use: tool.use })),
    )
  })

  it('쓰기 둘은 아직 없다 — P9-5가 그 자리다', () => {
    for (const name of ['patch_page', 'add_comment']) {
      expect(findTool(name), name).toBeUndefined()
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

describe('인자 스키마에 **없는 것**이 판정이다', () => {
  /**
   * **D5 — 정규식의 신뢰 경계를 열지 않는다.**
   *
   * P9-1 이월 §5.2가 묻고 P9-2 이월 §2가 넘기고 P9-3 이월 §3이 *"경계가 바뀌는 날이
   * P9-4다"*로 적었다. **답은 열지 않는다이고, 그 부재를 이 케이스가 든다** — P9-2가
   * `--password`에서 한 것과 같은 자리다.
   *
   * 여는 순간 에이전트가 만든 문자열이 `new RegExp`에 들어간다. 그때 필요한 것(길이 상한 ·
   * 백트래킹 · 타임아웃)은 이 슬라이스 밖이다.
   */
  it('어느 도구도 lint 설정·정규식을 인자로 받지 않는다 (D5)', () => {
    for (const tool of TOOLS) {
      const keys = Object.keys(tool.inputSchema.properties)
      for (const forbidden of ['config', 'lint', 'naming', 'pattern', 'regex', 'rules']) {
        expect(keys, `${tool.name}.${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  /** **D4 — `.wirebound.json`이 프로젝트를 정한다. 세션이 정하지 않는다.** */
  it('어느 도구도 프로젝트·서버·토큰을 인자로 받지 않는다 (D4)', () => {
    for (const tool of TOOLS) {
      const keys = Object.keys(tool.inputSchema.properties)
      for (const forbidden of ['projectId', 'project', 'server', 'token', 'cwd']) {
        expect(keys, `${tool.name}.${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('받는 인자는 경로 하나뿐이다', () => {
    expect(Object.keys(findTool('list_pages')!.inputSchema.properties)).toEqual([])
    expect(Object.keys(findTool('get_page')!.inputSchema.properties)).toEqual(['path'])
    expect(Object.keys(findTool('validate')!.inputSchema.properties)).toEqual(['path'])
  })

  it('get_page는 경로가 필수이고 validate는 아니다', () => {
    expect(findTool('get_page')!.inputSchema.required).toEqual(['path'])
    expect(findTool('validate')!.inputSchema.required).toBeUndefined()
  })
})

/**
 * **D8의 첫 줄** — *"명령을 잘못 썼다"*(CLI 코드 1)는 JSON-RPC 오류다. 결과가 아니다.
 *
 * 검사가 **표에서 나오는지**를 함께 잰다: 도구마다 손으로 짠 검사면 표에 줄을 더할 때
 * 검사를 빠뜨리는 경로가 생긴다.
 */
describe('인자 검사는 표에서 나온다 (D8)', () => {
  const io = createFakeIo()

  it('모르는 도구는 MethodNotFound다', async () => {
    await expect(callTool(io, 'patch_page', {})).rejects.toMatchObject({
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
