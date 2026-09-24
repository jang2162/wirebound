/**
 * MCP 서버 하나. **프로토콜을 다시 구현하지 않는다** — 공식 SDK가 stdio JSON-RPC와
 * 핸드셰이크를 갖고 있고, 우리가 그것을 손으로 짜면 **남이 정한 계약의 두 벌**이 된다.
 *
 * ---
 *
 * # `io`를 인자로 받는다
 *
 * 바깥 세계를 만지는 자리를 값 하나로 묶는 것은 `packages/cli`의 `io.ts`가 정한 자세이고,
 * 그것을 그대로 물려받는다 — 이 파일이 `node:*`를 부르면 케이스가 **진짜 홈 디렉터리와 진짜 서버**를
 * 건드린다. `node:*`를 부르는 자리는 `bin.ts` 하나이고 `test/io-boundary.test.ts`가 센다.
 *
 * # 인자를 **표로** 검사한다
 *
 * 낮은 층의 `Server`는 `tools/call`의 인자를 검사하지 않는다(핸들러가 날 `params`를 받는다). 검사를 도구마다 손으로 짜면 표와 검사가 갈리므로 **`TOOLS`의 `inputSchema`
 * 하나에서 만든다.** 모르는 도구·모르는 인자·빠진 인자·문자열이 아닌 인자가 전부 여기서
 * **JSON-RPC 오류**가 된다(`outcome.ts`의 표 첫 줄).
 *
 * # 도구를 부르는 자리와 프로토콜을 붙이는 자리를 가른다
 *
 * `callTool`은 `io`와 이름과 인자만 받는다. 그래서 단위 케이스가 **SDK 없이** 도구를 부를 수
 * 있고, 스모크는 반대로 **SDK를 통해서만** 부른다 — 둘이 같은 함수를 지나므로 스모크가
 * 잡는 것은 프로토콜 층뿐이다.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import type { Io } from '@wirebound/cli/embed'
import { HANDLERS } from './handlers'
import { isToolFailure, toolFailure, type ToolOutcome } from './outcome'
import { TOOLS, findTool, type ToolArgSchema, type ToolSpec } from './tools'

/** 호스트에게 보이는 이름. `packages/mcp/package.json`의 `bin` 이름과 같다. */
export const SERVER_NAME = 'wirebound'
export const SERVER_VERSION = '0.0.0'

/**
 * 도구 하나를 부른다. **프로토콜을 모른다** — 낸 것은 글자와 `isError`뿐이다.
 *
 * 던지는 것은 **JSON-RPC 오류**로 나갈 것들이다(모르는 이름 · 인자 모양). `CliError`는
 * 던지지 않고 `isError: true`로 접힌다(`outcome.ts`).
 */
export async function callTool(io: Io, name: string, args: unknown): Promise<ToolOutcome> {
  const tool = findTool(name)
  if (tool === undefined) {
    throw new McpError(ErrorCode.MethodNotFound, `모르는 도구입니다: ${name}`)
  }
  const parsed = readArgs(tool, args)

  const handler = HANDLERS[tool.name]
  if (handler === undefined) {
    // 표에 줄이 있는데 구현이 없다. **케이스가 이 상태를 먼저 잡는다**(`test/tools.test.ts`).
    throw new McpError(ErrorCode.InternalError, `구현이 없는 도구입니다: ${name}`)
  }

  try {
    return await handler(io, parsed)
  } catch (error) {
    if (isToolFailure(error)) return toolFailure(error, io.cwd)
    throw error
  }
}

/**
 * 도구의 `inputSchema` 하나로 인자를 검사한다. **표가 분모다.**
 *
 * 모르는 키를 **거부한다**(`additionalProperties: false`). 조용히 무시하면 에이전트가
 * `pageId`를 주고 *"경로 전체를 검사했다"*는 답을 받는다 — 그때 무엇을 물었는지와 무엇을
 * 답했는지가 갈린다.
 *
 * **모양만 본다.** `ops`가 배열인지는 여기서 보고, 그 안이 옳은 JSON Patch인지는
 * **서버가 본다**(`tools.ts`의 머리말). 여기서 더 보면 검증이 두 벌이 된다.
 */
function readArgs(tool: ToolSpec, args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) args = {}
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new McpError(ErrorCode.InvalidParams, `${tool.name}의 인자는 객체여야 합니다`)
  }

  const raw = args as Record<string, unknown>
  const known = Object.keys(tool.inputSchema.properties)
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) {
      const hint = known.length === 0 ? '이 도구는 인자를 받지 않습니다' : `받는 것: ${known.join(', ')}`
      throw new McpError(ErrorCode.InvalidParams, `${tool.name}이 모르는 인자입니다: ${key} — ${hint}`)
    }
  }

  const parsed: Record<string, unknown> = {}
  for (const key of known) {
    const value = raw[key]
    if (value === undefined) {
      if (tool.inputSchema.required?.includes(key)) {
        throw new McpError(ErrorCode.InvalidParams, `${tool.name}에 ${key}가 필요합니다`)
      }
      continue
    }
    assertShape(tool, key, tool.inputSchema.properties[key]!, value)
    parsed[key] = value
  }
  return parsed
}

/**
 * 값 하나가 선언한 모양인가. **`ToolArgSchema`의 갈래마다 한 줄이다.**
 *
 * ⚠ **컴파일러가 빠진 갈래를 잡지 않는다.** 반환이 `void`라 `switch`에 없는 갈래는 오류 없이
 * 끝으로 떨어지고, 그 모양은 **검사 없이** 지나간다(다시 재는 법: `ToolArgSchema`에 갈래 하나를
 * 더하고 `pnpm typecheck` — 오류 0). `ToolArgSchema`에 갈래를 더하면 여기 한 줄을 함께 더한다.
 */
function assertShape(tool: ToolSpec, key: string, schema: ToolArgSchema, value: unknown): void {
  const bad = (want: string): never => {
    throw new McpError(ErrorCode.InvalidParams, `${tool.name}의 ${key}는 ${want}이어야 합니다`)
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') bad('문자열')
      return
    case 'integer':
      // **`Number.isInteger`로 본다** — `3.5`도 `NaN`도 `seq`가 될 수 없고, 그것을 서버까지
      // 보내면 zod가 낸 문장이 도구 인자 이름을 안 쓴다.
      if (typeof value !== 'number' || !Number.isInteger(value) || value < schema.minimum) {
        bad(`${schema.minimum} 이상의 정수`)
      }
      return
    case 'array':
      if (!Array.isArray(value)) bad('배열')
      return
  }
}

/**
 * SDK의 `Server` 하나를 만든다. **전송은 붙이지 않는다** — 붙이는 것은 `bin.ts`(stdio)와
 * 스모크(메모리 짝)이고, 그 둘이 같은 서버를 본다.
 */
export function createServer(io: Io): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const outcome = await callTool(io, request.params.name, request.params.arguments)
    return { content: [{ type: 'text' as const, text: outcome.text }], isError: outcome.isError }
  })

  return server
}
