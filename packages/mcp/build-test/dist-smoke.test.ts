/**
 * **받는 쪽이 받는 것을 잰다 — 진짜 MCP 클라이언트로**(D9).
 *
 * ---
 *
 * # 왜 `build-test`인가 (판정)
 *
 * `pnpm test`는 소스를 alias로 보므로 **프로토콜도 `dist`도 그 안에서 안 드러난다.**
 * P9-2가 그것을 실측했다: `tsdown.config.ts`의 `fixedExtension: false` 한 줄을 지우면
 * `test:build` 9건이 죽고 `pnpm test`는 **0건**이 죽는다. 여기가 재는 것 셋이 전부 그 부류다.
 *
 * | 무엇 | 소스 케이스가 보나 |
 * |---|---|
 * | `bin`이 가리키는 파일이 실재하는가(확장자·shebang·실행 권한) | **아니다** |
 * | 호스트가 프로세스를 띄워 핸드셰이크가 서는가 | **아니다** — 단위 케이스는 `callTool`을 직접 부른다 |
 * | 표준출력이 JSON-RPC 프레임 통로로 깨끗한가 | **아니다** — 로그 한 줄이 섞이면 실서버에서만 끊긴다 |
 *
 * # 무엇을 안 건드리나
 *
 * **최상위의 dev 서버와 DB를 안 건드린다.** 이 파일이 `node:http`로 자기 서버를 임시 포트에
 * 띄우고 스냅샷 하나를 내준다. 자격도 임시 디렉터리에 쓴다 — 진짜 홈을 안 만진다.
 */
import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server as HttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { snapshotPayload, 오류가_있는_프로젝트 } from '@wirebound/cli/test-support'

// vitest의 cwd는 루트 설정이 사는 저장소 뿌리다.
const repoRoot = process.cwd()
const packageRoot = resolve(repoRoot, 'packages/mcp')
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
  bin: Record<string, string>
}
/** **`package.json`이 가리키는 자리를 쓴다** — 여기 경로를 베끼면 그 사본이 진짜와 갈린다. */
const binPath = resolve(packageRoot, manifest.bin['wireb-mcp'] ?? '')

const PROJECT = '90000000-0000-4000-8000-0000000000aa'
const TOKEN = 'SMOKE-TOKEN-Zx7Qv2Lp'

let http: HttpServer
let origin = ''
let repo = ''
let credentials = ''
/** 요청마다 어떤 payload를 낼지. 케이스가 갈아 끼운다. */
let payload: unknown = null
/** 서버가 실제로 받은 Authorization 헤더. **토큰이 실려 갔는지를 여기서 본다.** */
const seenAuth: string[] = []

beforeAll(async () => {
  execFileSync('pnpm', ['--filter', './packages/*', '-r', 'build'], { cwd: repoRoot, stdio: 'pipe' })

  http = createServer((request, response) => {
    seenAuth.push(request.headers.authorization ?? '')
    if (request.url === `/api/projects/${PROJECT}/snapshot`) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(payload))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { code: 'not-found', message: '대상을 찾을 수 없습니다' } }))
  })
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
  const address = http.address()
  if (address === null || typeof address === 'string') throw new Error('포트를 못 잡았다')
  origin = `http://127.0.0.1:${address.port}`

  // **임시 리포 하나.** 진짜 홈도 이 저장소도 안 만진다.
  repo = mkdtempSync(join(tmpdir(), 'wireb-mcp-smoke-'))
  writeFileSync(join(repo, '.wirebound.json'), `${JSON.stringify({ server: origin, projectId: PROJECT }, null, 2)}\n`)
  credentials = join(repo, 'credentials.json')
  writeFileSync(
    credentials,
    `${JSON.stringify({ version: 1, credentials: [{ server: origin, projectId: PROJECT, token: TOKEN }] })}\n`,
  )
}, 300_000)

afterAll(async () => {
  await new Promise<void>((done) => http.close(() => done()))
})

/** 빌드된 서버를 **호스트가 하듯이** 띄우고 진짜 클라이언트로 붙는다. */
async function connect(env: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: 'wirebound-smoke', version: '0.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [binPath],
      // **`cwd`가 바인딩을 정한다**(D4). 호스트가 리포에서 띄우는 것이 이 모양이다.
      cwd: repo,
      env: { PATH: process.env.PATH ?? '', WIREB_CREDENTIALS: credentials, ...env },
    }),
  )
  return client
}

/**
 * 결과의 첫 글자 조각.
 *
 * **인자를 `unknown`으로 받는다** — SDK의 `CallToolResult`가 `content` 판과 옛
 * `toolResult` 판의 합집합이라, 좁은 모양으로 받으면 *"공통 속성이 없다"*로 컴파일이 막힌다
 * (`pnpm typecheck`가 그것을 잡았다). 우리가 내는 것은 언제나 `content` 판이다.
 */
function text(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content
  return content?.[0]?.text ?? ''
}

describe('빌드된 wireb-mcp', () => {
  it('`bin`이 가리키는 파일이 실재한다 — 확장자가 어긋나면 여기서 죽는다', () => {
    expect(manifest.bin['wireb-mcp']).toBe('./dist/bin.js')
    expect(existsSync(binPath), binPath).toBe(true)
    // 기본값(`fixedExtension`)이면 이쪽이 생긴다. **둘 다 확인해야** 어긋남이 드러난다.
    expect(existsSync(resolve(packageRoot, 'dist/bin.mjs'))).toBe(false)
  })

  it('첫 줄이 shebang이고 실행 권한이 있다', () => {
    expect(readFileSync(binPath, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node')
    expect(() => accessSync(binPath, constants.X_OK)).not.toThrow()
  })

  it('소스가 아니라 번들이다 — 카나리아', () => {
    const source = readFileSync(binPath, 'utf8')
    expect(source.length).toBeGreaterThan(200)
    expect(source).not.toContain("from './server'")
  })
})

describe('진짜 클라이언트가 붙어 도구를 부른다 (D9)', () => {
  it('핸드셰이크가 서고 도구 셋이 보인다', async () => {
    payload = snapshotPayload()
    const client = await connect()
    try {
      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(['get_page', 'list_pages', 'validate'])
      // 인자 스키마가 프로토콜을 건너 그대로 왔는가.
      const get = listed.tools.find((tool) => tool.name === 'get_page')!
      expect((get.inputSchema as { required?: string[] }).required).toEqual(['path'])
    } finally {
      await client.close()
    }
  }, 60_000)

  it('list_pages → get_page → validate 를 실제로 부른다', async () => {
    payload = snapshotPayload()
    const client = await connect()
    try {
      const listed = JSON.parse(text(await client.callTool({ name: 'list_pages', arguments: {} }))) as {
        pages: { path: string }[]
      }
      expect(listed.pages.map((p) => p.path)).toContain('관리자/회원/목록')

      // **목록이 낸 경로를 그대로 다음 도구에 넣는다** — §12.5의 흐름이 그 모양이다.
      const got = JSON.parse(
        text(await client.callTool({ name: 'get_page', arguments: { path: listed.pages[0]!.path } })),
      ) as { found: boolean; page: { interactions: { text: string }[] } }
      expect(got.found).toBe(true)
      // **한국어가 프로토콜을 건너 그대로 왔는가.** 카탈로그가 실제 프로세스에서도 섰는가.
      expect(got.page.interactions[0]!.text).toContain('로딩 상태')

      const validated = JSON.parse(text(await client.callTool({ name: 'validate', arguments: {} }))) as {
        ran: boolean
        failing: boolean
        notes: unknown[]
      }
      expect(validated.ran).toBe(true)
      expect(validated.failing).toBe(false)
      expect(validated.notes.length).toBeGreaterThan(0)
    } finally {
      await client.close()
    }
  }, 60_000)

  it('결함을 찾아도 오류가 아니다 — `isError`가 안 선다 (D8)', async () => {
    payload = 오류가_있는_프로젝트()
    const client = await connect()
    try {
      const result = await client.callTool({ name: 'validate', arguments: {} })
      expect(result.isError).toBeFalsy()
      expect((JSON.parse(text(result)) as { failing: boolean }).failing).toBe(true)
    } finally {
      await client.close()
    }
  }, 60_000)

  it('붙지 못한 것은 `isError` 결과다 — 예외가 아니다 (D8)', async () => {
    payload = snapshotPayload()
    // 자격 파일을 없는 자리로 돌린다. 서버는 정상이고 **자격만** 없다.
    const client = await connect({ WIREB_CREDENTIALS: join(repo, 'none.json') })
    try {
      const result = await client.callTool({ name: 'list_pages', arguments: {} })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('wireb login')
      expect(text(result)).toContain('[wireb 코드 2]')
    } finally {
      await client.close()
    }
  }, 60_000)

  it('모르는 도구는 JSON-RPC 오류다 — 결과가 아니다 (D8)', async () => {
    payload = snapshotPayload()
    const client = await connect()
    try {
      // P9-5가 이 이름을 만든다. 오늘은 프로토콜 층에서 거절된다.
      await expect(client.callTool({ name: 'patch_page', arguments: {} })).rejects.toMatchObject({ code: -32601 })
      await expect(client.callTool({ name: 'get_page', arguments: {} })).rejects.toMatchObject({ code: -32602 })
    } finally {
      await client.close()
    }
  }, 60_000)

  it('토큰을 서버에 싣고 응답 글자에는 안 싣는다', async () => {
    payload = snapshotPayload()
    seenAuth.length = 0
    const client = await connect()
    try {
      const result = await client.callTool({ name: 'list_pages', arguments: {} })
      // 자격이 실제로 요청에 실렸다 — 분모가 0이면 아래가 공허하다.
      expect(seenAuth).toContain(`Bearer ${TOKEN}`)
      expect(text(result)).not.toContain(TOKEN)
    } finally {
      await client.close()
    }
  }, 60_000)

  /**
   * **표준출력은 JSON-RPC 프레임의 통로다.** 서버가 거기 한 줄이라도 쓰면 호스트가 프레임을
   * 못 읽고 연결이 끊긴다 — `bin.ts`가 `io.out`을 `err`로 돌린 이유이고, 그것이 실제 프로세스에서
   * 참인지는 **여기서만** 드러난다(단위 케이스의 가짜 `io`는 배열에 담을 뿐이다).
   *
   * `payloadVersion`이 높으면 `fetchSnapshot`이 경고 한 줄을 낸다(`project.ts`) — 그 줄이
   * 표준출력으로 갔다면 이 케이스가 죽는다.
   */
  it('서버가 표준출력을 더럽히지 않는다 — payload 경고가 프레임을 안 깬다', async () => {
    payload = snapshotPayload({ payloadVersion: 99 })
    const client = await connect()
    try {
      const listed = JSON.parse(text(await client.callTool({ name: 'list_pages', arguments: {} }))) as {
        pages: unknown[]
      }
      expect(listed.pages).toHaveLength(3)
    } finally {
      await client.close()
    }
  }, 60_000)

  it('응답에 날 제어 바이트가 없다', async () => {
    payload = snapshotPayload()
    const client = await connect()
    try {
      const said = text(await client.callTool({ name: 'get_page', arguments: { path: '관리자/회원/목록' } }))
      expect(CONTROL_BYTES.test(said)).toBe(false)
      // 분모가 0이면 위가 공허하다 — 실제로 한국어가 나왔는가.
      expect(said).toContain('검색')
    } finally {
      await client.close()
    }
  }, 60_000)
})

/** 날 제어 바이트. **소스에 날로 적지 않는다** — `packages/cli/build-test`와 같은 규칙이다. */
const CONTROL_BYTES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
