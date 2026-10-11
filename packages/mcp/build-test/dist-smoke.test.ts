/**
 * **받는 쪽이 받는 것을 잰다 — 진짜 MCP 클라이언트로.**
 *
 * ---
 *
 * # 왜 `build-test`인가 (판정)
 *
 * `pnpm test`는 소스를 alias로 보므로 **프로토콜도 `dist`도 그 안에서 안 드러난다.**
 * `tsdown.config.ts`의 `fixedExtension: false` 한 줄을 지우면 `test:build`는 죽고 `pnpm test`는
 * **아무것도 안 죽는다**(다시 재는 법: 그 줄을 지우고 둘을 돌린다). 여기가 재는 것 셋이 전부
 * 그 부류다.
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
import { execFileSync, spawn } from 'node:child_process'
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server as HttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
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
/**
 * 서버가 실제로 받은 `x-wb-client` 헤더.
 *
 * **이것을 재는 자가 여기밖에 없다.** `bin.ts`가 `io`를 조립하며 `client: 'mcp'`를
 * 심는데, 단위 케이스는 그 파일을 안 지나고 자기 가짜 `io`를 세운다 — 그 한 줄을 지워도
 * `pnpm test`는 0 사망이다.
 */
const seenClient: string[] = []
/**
 * 쓰기 요청 하나가 실제로 받은 것. **받는 쪽이 받는 것을 재는 자리다.**
 *
 * 단위 케이스는 `callTool`을 직접 부르므로 **프로토콜을 건넌 인자**를 못 본다 —
 * `ops` 배열이 JSON-RPC를 지나 그대로 오는지, 한국어 본문이 안 깨지는지는 여기서만 잰다.
 */
const seenWrites: { method: string; url: string; body: unknown; client: string }[] = []
/** 쓰기 라우트가 어떻게 답할지. 케이스가 갈아 끼운다. */
let writeMode: 'ok' | 'stale' | 'locked' = 'ok'

beforeAll(async () => {
  execFileSync('pnpm', ['--filter', './packages/*', '-r', 'build'], { cwd: repoRoot, stdio: 'pipe' })

  http = createServer((request, response) => {
    seenAuth.push(request.headers.authorization ?? '')
    seenClient.push(String(request.headers['x-wb-client'] ?? ''))
    if (request.url === `/api/projects/${PROJECT}/snapshot`) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(payload))
      return
    }

    // **쓰기 둘.** 본문을 다 받은 뒤에 답한다.
    const write = /\/api\/projects\/[^/]+\/pages\/([^/]+)\/(ops|comments)$/.exec(request.url ?? '')
    if (write !== null) {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        seenWrites.push({
          method: request.method ?? '',
          url: request.url ?? '',
          body: raw.length === 0 ? null : JSON.parse(raw),
          client: String(request.headers['x-wb-client'] ?? ''),
        })
        const answer = writeAnswer(write[2] === 'ops')
        response.writeHead(answer.status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(answer.body))
      })
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
  writeFileSync(credentials, `${JSON.stringify({ version: 1, credentials: [{ server: origin, projectId: PROJECT, token: TOKEN }] })}\n`)
}, 300_000)

afterAll(async () => {
  await new Promise<void>((done) => http.close(() => done()))
})

/**
 * 쓰기 라우트가 낼 답. **문장은 `apps/api`가 실제로 내는 것을 옮긴다** — 다시 잴 때는 `apps/api`가
 * 낸 409·423 응답의 `message`와 대조한다.
 */
function writeAnswer(isOps: boolean): { status: number; body: unknown } {
  if (writeMode === 'stale') {
    return {
      status: 409,
      body: { error: { code: 'conflict', message: '페이지가 이미 변경되었습니다 (요청 baseSeq 0, 현재 2)' } },
    }
  }
  if (writeMode === 'locked') {
    return { status: 423, body: { error: { code: 'locked', message: '장병현님이 편집 중인 영역입니다' } } }
  }
  if (isOps) {
    return { status: 200, body: { seq: 5, revisionId: 'rev_smoke', inverse: [], schemaVersion: 1 } }
  }
  return {
    status: 201,
    body: {
      comment: {
        id: 'cmt_smoke',
        nodeId: 'list',
        body: '정렬 기준이 없습니다',
        authorId: 'usr_smoke',
        authorName: '장병현',
        createdAt: '2026-08-17T00:00:00.000Z',
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
      marker: 3,
      seq: 6,
      markerOps: [{ op: 'add', path: '/root/children/1/marker', value: 3 }],
    },
  }
}

/** 빌드된 서버를 **호스트가 하듯이** 띄우고 진짜 클라이언트로 붙는다. */
async function connect(env: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: 'wirebound-smoke', version: '0.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [binPath],
      // **`cwd`가 바인딩을 정한다.** 호스트가 리포에서 띄우는 것이 이 모양이다.
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
 * (`pnpm typecheck`가 그것을 잡는다). 우리가 내는 것은 언제나 `content` 판이다.
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

describe('진짜 클라이언트가 붙어 도구를 부른다', () => {
  it('핸드셰이크가 서고 설계서 「MCP 도구」의 다섯이 보인다', async () => {
    payload = snapshotPayload()
    const client = await connect()
    try {
      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(['add_comment', 'get_page', 'list_pages', 'patch_page', 'validate'])
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

      // **목록이 낸 경로를 그대로 다음 도구에 넣는다** — 설계서 「스킬」의 흐름이 그 모양이다.
      const got = JSON.parse(text(await client.callTool({ name: 'get_page', arguments: { path: listed.pages[0]!.path } }))) as {
        found: boolean
        page: { interactions: { text: string }[] }
      }
      expect(got.found).toBe(true)
      // **한국어가 프로토콜을 건너 그대로 왔는가.** 카탈로그가 실제 프로세스에서도 섰는가.
      expect(got.page.interactions[0]!.text).toContain('로딩 상태')

      // **검사에서 빠진 것(`notes`)도 프로토콜을 건너오는가** — 메뉴를 잃은 페이지 하나로 노트를 세운다.
      const 떠돌이 = snapshotPayload()
      떠돌이.pages[2]!.menuNodeId = '00000000-0000-4000-8000-00000000dead'
      payload = 떠돌이
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

  it('결함을 찾아도 오류가 아니다 — `isError`가 안 선다', async () => {
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

  it('붙지 못한 것은 `isError` 결과다 — 예외가 아니다', async () => {
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

  it('모르는 도구는 JSON-RPC 오류다 — 결과가 아니다', async () => {
    payload = snapshotPayload()
    const client = await connect()
    try {
      // **설계서 「MCP 도구」의 표에 없는 이름이다.** 표가 닫혔으므로 실재하지 않는 이름을 골랐다.
      await expect(client.callTool({ name: 'delete_project', arguments: {} })).rejects.toMatchObject({ code: -32601 })
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
   * **자기를 `mcp`라고 말한다**(설계서 「LLM 편집 경로」의 `actor_type='mcp'`가 이 헤더에 매여 있다).
   *
   * **`bin.ts`의 `client: 'mcp'` 한 줄을 볼 수 있는 자가 여기뿐이다.** 단위 케이스는 자기
   * 가짜 `io`를 세우므로 그 줄을 지워도 안 죽는다 — `dist`를 띄우는 이 파일만 그 조립을 지난다.
   */
  it('자기를 `mcp` 라고 말한다 — `wireb` 가 싣는 값과 갈린다', async () => {
    payload = snapshotPayload()
    seenClient.length = 0
    const client = await connect()
    try {
      await client.callTool({ name: 'list_pages', arguments: {} })
      // 분모가 0이면 아래가 공허하다 — 요청이 실제로 갔는가.
      expect(seenClient.length).toBeGreaterThan(0)
      expect([...new Set(seenClient)]).toEqual(['mcp'])
    } finally {
      await client.close()
    }
  }, 60_000)

  /**
   * **`payloadVersion`이 높아도 응답이 온다.**
   *
   * **이 케이스는 표준출력을 재지 않는다** — 리다이렉트를 지우고 `io.out`으로 한 줄을 실제로
   * 찍어도 `Client`로 재는 케이스는 전부 초록이다. `StdioClientTransport`가 개행으로 끝나는
   * 이물 한 줄을 만나도 안 끊기기 때문이다. **그래서 이름에 그 주장을 싣지 않고**, 표준출력을
   * 재는 것은 아래 `표준출력이 JSON-RPC 프레임뿐이다` 절이 **날 스트림을 직접 읽어** 한다.
   */
  it('payload 형식이 높아도 응답이 온다 — 경고가 읽기를 막지 않는다', async () => {
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

/**
 * **쓰기 둘이 실제로 서버에 닿는다.**
 *
 * ---
 *
 * # 단위 케이스가 못 보는 것
 *
 * 단위 케이스는 `callTool`을 직접 부르고 가짜 `io`의 라우트 표를 본다. **여기서만 보이는
 * 것 셋:** (1) `ops` 배열이 JSON-RPC 프레임을 건너 그대로 오는가, (2) 빌드된 번들이
 * `PATCH`를 실제로 보내는가(유니온에 더한 것이 런타임까지 왔는가), (3) 쓰기 응답을 낸
 * **뒤에도** 표준출력이 프레임뿐인가.
 */
describe('빌드된 서버가 실제로 쓴다', () => {
  const OPS = [{ op: 'add', path: '/root/children/-', value: { id: 'n_smoke', type: 'Text', props: {} } }]

  it('`patch_page` 가 `PATCH .../ops` 를 보낸다 — 본문이 프로토콜을 건너 그대로 온다', async () => {
    payload = snapshotPayload()
    writeMode = 'ok'
    seenWrites.length = 0
    const client = await connect()
    try {
      const said = JSON.parse(
        text(await client.callTool({ name: 'patch_page', arguments: { path: '관리자/회원/목록', baseSeq: 0, ops: OPS } })),
      ) as { applied: boolean; headSeq: number; revisionId: string }

      expect(said.applied).toBe(true)
      expect(said.headSeq).toBe(5)
      expect(said.revisionId).toBe('rev_smoke')

      expect(seenWrites).toHaveLength(1)
      expect(seenWrites[0]!.method).toBe('PATCH')
      expect(seenWrites[0]!.url).toContain('/ops')
      // **`ops`가 그대로 왔는가** — 도구가 다시 만들지 않는다.
      expect(seenWrites[0]!.body).toEqual({ baseSeq: 0, ops: OPS })
      // **`actor_type`이 이 헤더에서 온다.**
      expect(seenWrites[0]!.client).toBe('mcp')
    } finally {
      await client.close()
    }
  }, 60_000)

  it('`add_comment` 가 한국어 본문을 안 깨뜨리고 보낸다', async () => {
    payload = snapshotPayload()
    writeMode = 'ok'
    seenWrites.length = 0
    const client = await connect()
    try {
      const said = JSON.parse(
        text(
          await client.callTool({
            name: 'add_comment',
            arguments: { path: '관리자/회원/목록', nodeId: 'list', body: '① 정렬 기준이 없습니다' },
          }),
        ),
      ) as { added: boolean; documentChanged: boolean; headSeq: number; note: string }

      expect(said.added).toBe(true)
      expect(said.documentChanged).toBe(true)
      expect(said.headSeq).toBe(6)
      expect(said.note).toContain('409')

      expect(seenWrites[0]!.body).toEqual({ nodeId: 'list', body: '① 정렬 기준이 없습니다' })
    } finally {
      await client.close()
    }
  }, 60_000)

  it('409 는 `isError` 결과이고 다시 읽으라고 말한다 — 예외가 아니다', async () => {
    payload = snapshotPayload()
    writeMode = 'stale'
    seenWrites.length = 0
    const client = await connect()
    try {
      const result = await client.callTool({
        name: 'patch_page',
        arguments: { path: '관리자/회원/목록', baseSeq: 0, ops: OPS },
      })
      expect(result.isError).toBe(true)
      const said = JSON.parse(text(result)) as { reason: string; next: string; headSeq: number | null }
      expect(said.reason).toBe('stale')
      expect(said.next).toContain('get_page')
      // 스냅샷을 다시 읽어 값으로 싣는다.
      expect(said.headSeq).toBe(0)
      // **한 번만 보냈다** — 재시도가 없다.
      expect(seenWrites.filter((one) => one.method === 'PATCH')).toHaveLength(1)
    } finally {
      await client.close()
    }
  }, 60_000)

  it('423 은 **기다리라고** 말하고 누가 잡고 있는지를 싣는다', async () => {
    payload = snapshotPayload()
    writeMode = 'locked'
    const client = await connect()
    try {
      const result = await client.callTool({
        name: 'patch_page',
        arguments: { path: '관리자/회원/목록', baseSeq: 0, ops: OPS },
      })
      expect(result.isError).toBe(true)
      const said = JSON.parse(text(result)) as { reason: string; next: string; message: string }
      expect(said.reason).toBe('locked')
      expect(said.next).toContain('기다')
      expect(said.next).not.toContain('get_page')
      expect(said.message).toContain('장병현님이 편집 중인 영역입니다')
    } finally {
      await client.close()
    }
  }, 60_000)

  it('인자 모양이 틀리면 JSON-RPC 오류이고 **아무것도 안 보낸다**', async () => {
    payload = snapshotPayload()
    writeMode = 'ok'
    seenWrites.length = 0
    const client = await connect()
    try {
      await expect(
        client.callTool({ name: 'patch_page', arguments: { path: '관리자/회원/목록', baseSeq: '0', ops: OPS } }),
      ).rejects.toMatchObject({ code: -32602 })
      expect(seenWrites).toHaveLength(0)
    } finally {
      await client.close()
    }
  }, 60_000)

  /**
   * **쓰기 뒤에도 표준출력이 프레임뿐이다.**
   *
   * 쓰기 경로는 응답 본문을 새로 읽고 갈래를 새로 가른다 — **로그 한 줄이 붙기 가장 쉬운
   * 자리**이고, 그 한 줄은 실서버에서 *다음* 프레임 앞에 붙는다.
   */
  it('쓰기 뒤에도 표준출력이 JSON-RPC 프레임뿐이다', async () => {
    payload = snapshotPayload()
    writeMode = 'ok'
    const said = await rawStdout([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'wirebound-raw', version: '0.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'patch_page', arguments: { path: '관리자/회원/목록', baseSeq: 0, ops: OPS } },
      },
    ])

    expect(said.split('\n').filter((line) => line.length > 0).length).toBeGreaterThanOrEqual(2)
    expect(strayLines(said), said).toEqual([])
    expect(said).toContain('rev_smoke')
  }, 60_000)
})

/**
 * **표준출력이 JSON-RPC 프레임의 통로다 — 그것을 날 스트림에서 잰다.**
 *
 * ---
 *
 * # 왜 `Client`로는 못 재나
 *
 * `bin.ts`의 리다이렉트를 지우고 `io.out`으로 한 줄을 실제로 찍어도 **`Client`로 재는
 * 케이스는 전부 초록이다.** SDK 1.30.0의 `StdioClientTransport`가 **개행으로 끝나는 이물 한 줄을
 * 만나도 연결을 안 끊기** 때문이고, 무엇보다 그 전송이 **자식의 표준출력을 독점하므로**
 * 케이스가 원문을 볼 수 없다.
 *
 * **그래서 여기서는 `Client`를 안 쓴다.** `spawn`으로 직접 띄우고 JSON-RPC 프레임을 손으로
 * 써 넣은 뒤 **표준출력 전문**을 읽어 모든 줄을 검사한다.
 *
 * # 무엇이 위험한가 — 개행 없는 조각이다
 *
 * 이 SDK 판은 개행으로 끝나는 이물 줄에 관대하다. **그러나 개행 없는 조각**이 섞이면 다음
 * 프레임 앞에 붙어 그 프레임이 깨지고, **호스트마다 다르다.** 그래서 술어는 관대함에
 * 기대지 않고 *"모든 줄이 JSON-RPC 프레임이다"*로 둔다.
 */
describe('표준출력이 JSON-RPC 프레임뿐이다', () => {
  it('핸드셰이크와 도구 호출을 손으로 써 넣고 표준출력 전문을 읽는다', async () => {
    payload = snapshotPayload({ payloadVersion: 99 })
    const said = await rawStdout([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'wirebound-raw', version: '0.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_pages', arguments: {} } },
    ])

    // **분모가 0이면 아래가 공허하다** — 응답 둘이 실제로 왔는가.
    const frames = said.split('\n').filter((line) => line.length > 0)
    expect(frames.length, said).toBeGreaterThanOrEqual(2)
    expect(strayLines(said), said).toEqual([])

    // 그 프레임들이 우리가 물은 것에 대한 답인가.
    const ids = frames.map((line) => (JSON.parse(line) as { id?: number }).id)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
  }, 60_000)

  it('붙지 못한 갈래에서도 프레임뿐이다 — 오류 문장이 표준출력으로 안 샌다', async () => {
    payload = snapshotPayload()
    const said = await rawStdout(
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'wirebound-raw', version: '0.0.0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_pages', arguments: {} } },
      ],
      // 자격을 없는 자리로 돌린다. `fetchSnapshot`도 `requireProject`도 말을 하는 갈래다.
      { WIREB_CREDENTIALS: join(repo, 'none.json') },
    )

    expect(strayLines(said), said).toEqual([])
    expect(said).toContain('wireb login')
  }, 60_000)

  /**
   * **응답을 낸 뒤에 찍히는 것도 본다.**
   *
   * 위 둘이 이미 같은 창을 쓰지만, **창이 응답에서 끊기면 조용히 좁아지는 자리**이므로
   * 그 명제를 이름으로 남긴다 — 프로세스가 살아 있는 동안 나온 것이 전부 읽혔는가.
   */
  it('응답 뒤에도 읽는다 — 서버가 끝까지 산 뒤에 창이 닫힌다', async () => {
    payload = snapshotPayload()
    const said = await rawStdout([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'wirebound-raw', version: '0.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'validate', arguments: {} } },
    ])

    // 응답은 왔고,
    expect(said.split('\n').filter((line) => line.length > 0).length).toBeGreaterThanOrEqual(2)
    // 그 뒤로도 이물이 안 나왔다.
    expect(strayLines(said), said).toEqual([])
  }, 60_000)

  /** **술어를 보정한다.** 늘 `[]`를 내면 위 둘이 아무것도 안 재고 통과한다. */
  it('술어가 이물을 실제로 잡는다 — 반대편', () => {
    expect(strayLines('{"jsonrpc":"2.0","id":1}\n')).toEqual([])
    expect(strayLines('wirebound mcp ready\n{"jsonrpc":"2.0","id":1}\n')).toEqual(['wirebound mcp ready'])
    // 개행 없는 조각이 앞에 붙으면 그 줄 자체가 프레임이 아니게 된다.
    expect(strayLines('ready{"jsonrpc":"2.0","id":1}\n')).toEqual(['ready{"jsonrpc":"2.0","id":1}'])
    // JSON이지만 JSON-RPC가 아닌 줄도 이물이다.
    expect(strayLines('{"hello":1}\n')).toEqual(['{"hello":1}'])
  })
})

/**
 * 표준출력에서 **JSON-RPC 프레임이 아닌 줄**들. 비어 있어야 한다.
 *
 * `jsonrpc: '2.0'`까지 본다 — JSON이기만 하면 통과시키면 로그를 JSON으로 찍는 판이
 * 그대로 새 나간다.
 */
function strayLines(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .filter((line) => {
      try {
        return (JSON.parse(line) as { jsonrpc?: unknown }).jsonrpc !== '2.0'
      } catch {
        return true
      }
    })
}

/**
 * 빌드된 서버를 띄워 프레임들을 써 넣고 **표준출력 전문**을 돌려준다.
 *
 * ---
 *
 * # 답을 받은 뒤에도 읽는다 — **창을 응답에서 끊지 않는다**
 *
 * *"`id`를 든 요청 수만큼 프레임이 오면"* 곧바로 끝내면 응답 뒤에 찍히는 것을 아무도 안
 * 읽는다 — 리다이렉트를 지우고 `setTimeout(() => io.out(…), 1500)`을 심어도 전부 초록이다.
 *
 * **실서버에서는 그쪽이 더 흔하다.** 호스트의 세션은 오래 살고 도구 호출이 이어지므로,
 * 응답 뒤에 찍는 줄은 **다음 프레임 앞에 붙는다.**
 *
 * 그래서 프레임을 다 받으면 **표준입력을 닫고**(stdio 전송이 EOF로 끝난다) 프로세스가
 * 죽을 때까지 계속 읽는다. 안 죽으면 `GRACE_MS`까지 기다린 뒤 그때까지 모인 것을 낸다 —
 * **늦게 찍히는 줄이 그 창 안에 들어온다.**
 */
const GRACE_MS = 3_000

async function rawStdout(frames: unknown[], env: Record<string, string> = {}): Promise<string> {
  const child = spawn(process.execPath, [binPath], {
    cwd: repo,
    env: { PATH: process.env.PATH ?? '', WIREB_CREDENTIALS: credentials, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const wanted = frames.filter((frame) => (frame as { id?: unknown }).id !== undefined).length
  let out = ''

  try {
    return await new Promise<string>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`응답이 안 왔다: ${JSON.stringify(out)}`)), 30_000)
      let grace: NodeJS.Timeout | undefined
      let done = false
      const finish = (): void => {
        if (done) return
        done = true
        clearTimeout(deadline)
        if (grace !== undefined) clearTimeout(grace)
        resolve(out)
      }

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        out += chunk
        if (grace !== undefined) return
        // **줄 수가 아니라 프레임 수로 센다** — 이물이 섞여도 기다림이 안 끝나지 않게.
        const answered = out
          .split('\n')
          .filter((line) => line.length > 0)
          .filter((line) => {
            try {
              return (JSON.parse(line) as { id?: unknown }).id !== undefined
            } catch {
              return false
            }
          }).length
        if (answered < wanted) return

        // **여기서 안 끝낸다.** 입력을 닫고 늦게 찍히는 것까지 읽는다(위 머리말).
        child.stdin.end()
        grace = setTimeout(finish, GRACE_MS)
      })
      child.on('error', reject)
      // 프로세스가 먼저 죽으면 더 나올 것이 없다.
      child.on('close', finish)
      for (const frame of frames) child.stdin.write(`${JSON.stringify(frame)}\n`)
    })
  } finally {
    child.kill()
  }
}

/** 날 제어 바이트. **소스에 날로 적지 않는다** — `packages/cli/build-test`와 같은 규칙이다. */
const CONTROL_BYTES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
