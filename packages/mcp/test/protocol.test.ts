/**
 * **프로토콜 매핑을 `pnpm test`가 본다** (리뷰 N2).
 *
 * ---
 *
 * # 왜 생겼나 — 스모크에만 걸려 있었다
 *
 * 리뷰어가 실측했다(귀속: 리뷰어 §5): `server.ts`가 결과에 `isError`를 안 싣게 바꾸면
 * **`pnpm test`는 84/84 초록이고 `pnpm test:build`만 1건 죽는다.** 단위 케이스가
 * `callTool`을 **직접** 부르므로 그 값이 프로토콜 응답의 어느 자리로 가는지는 아무도 안 봤다.
 * D8의 절반(*"못 붙은 것이 `isError`로 나간다"*)이 스모크에만 매여 있었고,
 * **스모크는 `pnpm test`에 안 들어간다**(`--project '!build'`).
 *
 * # 스모크를 대신하지 않는다 — 자리가 다르다
 *
 * | 자 | 무엇을 보나 |
 * |---|---|
 * | `test/tools.test.ts` 등 | `callTool`이 낸 값. **프로토콜을 모른다** |
 * | **이 파일** | `Server`↔`Client`가 **메모리에서** 주고받은 프레임. 소스를 본다 |
 * | `build-test/dist-smoke.test.ts` | **빌드된 `dist/bin.js`를 진짜 프로세스로** 띄운 것. `bin`·shebang·표준출력·전송이 여기서만 드러난다 |
 *
 * 가운데가 없으면 프로토콜 매핑이 **사람이 `pnpm test:build`를 칠 때만** 지켜진다.
 */
import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { FakeIo } from '@wirebound/cli/test-support'
import { createServer } from '../src/server'
import { TOOLS } from '../src/tools'
import { harness } from './harness'

/** 서버 하나를 메모리 짝으로 띄우고 진짜 `Client`를 붙인다. */
async function connect(io: FakeIo): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const server = createServer(io)
  const client = new Client({ name: 'wirebound-protocol-test', version: '0.0.0' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

/** 결과의 첫 글자 조각. 인자를 `unknown`으로 받는 근거는 스모크의 같은 함수에 있다. */
function text(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content
  return content?.[0]?.text ?? ''
}

describe('도구 목록이 프로토콜을 건넌다', () => {
  it('표의 셋이 이름·설명·인자 스키마와 함께 온다', async () => {
    const client = await connect(harness())
    try {
      const listed = await client.listTools()
      // **분모가 표다.** 도구를 더하고 서버에 안 실으면 여기가 죽는다.
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(TOOLS.map((tool) => tool.name).sort())
      for (const tool of TOOLS) {
        const seen = listed.tools.find((candidate) => candidate.name === tool.name)!
        expect(seen.description, tool.name).toBe(tool.description)
        expect(seen.inputSchema, tool.name).toEqual(tool.inputSchema)
      }
    } finally {
      await client.close()
    }
  })
})

/**
 * **D8의 셋이 프로토콜의 어느 자리로 가는가.**
 *
 * 단위 케이스는 `ToolOutcome.isError`를 보고, 여기서는 **응답 프레임의 `isError`**를 본다.
 * 그 둘을 잇는 코드가 `createServer`의 `CallToolRequestSchema` 핸들러 한 줄이다.
 */
describe('D8의 셋이 프로토콜에서 갈린다 (리뷰 N2)', () => {
  it('못 붙은 것은 `isError: true` **결과**다 — 예외가 아니다', async () => {
    const client = await connect(harness({ binding: false }))
    try {
      const result = await client.callTool({ name: 'list_pages', arguments: {} })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('wireb init')
      expect(text(result)).toContain('[wireb 코드 2]')
    } finally {
      await client.close()
    }
  })

  it('결함을 찾은 것은 `isError`가 안 선다 — 반대편', async () => {
    const client = await connect(harness())
    try {
      const result = await client.callTool({ name: 'validate', arguments: {} })
      // **`isError`를 세우면 에이전트가 *"도구가 고장났다"*로 읽고 재시도한다.**
      expect(result.isError).toBeFalsy()
      expect(JSON.parse(text(result)).ran).toBe(true)
    } finally {
      await client.close()
    }
  })

  it('성공한 것도 `isError`가 안 선다 — 술어가 늘 참이 아니다', async () => {
    const client = await connect(harness())
    try {
      const result = await client.callTool({ name: 'list_pages', arguments: {} })
      expect(result.isError).toBeFalsy()
      expect(JSON.parse(text(result)).pages).toHaveLength(3)
    } finally {
      await client.close()
    }
  })

  it('모르는 도구는 JSON-RPC 오류다 — 결과가 아니다', async () => {
    const client = await connect(harness())
    try {
      // **§12.2의 표에 없는 이름이다.** 표가 다섯을 다 덮으므로 실재하지 않는 이름을 골랐다.
      await expect(client.callTool({ name: 'delete_project', arguments: {} })).rejects.toMatchObject({
        code: ErrorCode.MethodNotFound,
      })
    } finally {
      await client.close()
    }
  })

  it('인자 모양이 틀린 것도 JSON-RPC 오류다', async () => {
    const client = await connect(harness())
    try {
      await expect(client.callTool({ name: 'get_page', arguments: {} })).rejects.toMatchObject({
        code: ErrorCode.InvalidParams,
      })
      await expect(client.callTool({ name: 'validate', arguments: { nope: 'x' } })).rejects.toMatchObject({
        code: ErrorCode.InvalidParams,
      })
    } finally {
      await client.close()
    }
  })

  it('본문이 글자 하나로 온다 — 봉투 모양이 바뀌면 죽는다', async () => {
    const client = await connect(harness())
    try {
      const result = await client.callTool({ name: 'get_page', arguments: { path: '관리자/회원/목록' } })
      expect(result.content).toHaveLength(1)
      expect((result.content as { type: string }[])[0]!.type).toBe('text')
      // 한국어가 프로토콜을 건너 그대로 왔는가.
      expect(text(result)).toContain('로딩 상태')
    } finally {
      await client.close()
    }
  })
})
