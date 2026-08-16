/**
 * **모든 요청이 `x-wb-client`를 단다**(P9-5 D1 · 계획서 재라 #2).
 *
 * ---
 *
 * # 왜 필요한가 — `wireb`도 실어야 `cli`가 채워진다
 *
 * 서버는 이 헤더로 `revisions.actor_type`을 정한다(§7.4 · `apps/api/src/auth/actor.ts`).
 * **안 실으면 서버가 기본값을 쓰고, 그때 *"헤더를 잊었다"*와 *"정말 그 종류다"*가
 * 구별되지 않는다.** 그리고 그 어긋남은 조용하다 — 편집은 200으로 끝나고 이력만 틀린다.
 *
 * # 무엇으로 *"모든 요청"*을 보증하나
 *
 * 명령을 하나씩 세지 않는다. **`io.fetch`를 부르는 자리가 `client.ts` 하나**임을 소스에서
 * 세고, 그 한 자리가 헤더를 다는 것을 값으로 잰다. 명령을 세면 명령이 늘 때마다 이 파일이
 * 낡고, 낡은 것을 아무도 못 본다(`no-token-in-repo.test.ts`가 분모를 `COMMANDS`에서 만드는
 * 것과 같은 부류의 물음이고, 여기서는 분모가 **소스의 호출 자리**다).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLIENT_KIND_HEADER, callApi, callApiBytes } from '../src/client'
import { CliError } from '../src/exit'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo } from './fake-io'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
const SRC = fileURLToPath(new URL('../src', import.meta.url))

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function sourceFiles(dir: string = SRC, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...sourceFiles(join(dir, entry.name), relative))
    else if (entry.name.endsWith('.ts')) found.push(relative)
  }
  return found
}

describe('요청을 내는 자리가 하나다 — 그래서 헤더를 빠뜨릴 수 없다', () => {
  it('`io.fetch(` 를 부르는 파일이 `client.ts` 하나다', () => {
    const callers = sourceFiles().filter((file) =>
      /\bio\.fetch\s*\(/.test(stripComments(readFileSync(join(SRC, file), 'utf8'))),
    )
    expect(callers).toEqual(['client.ts'])
  })

  it('술어가 실제로 가른다 — 반대편', () => {
    // 분모가 0이면 위가 공허하다.
    expect(/\bio\.fetch\s*\(/.test('return await io.fetch(url, init)')).toBe(true)
    expect(/\bio\.fetch\s*\(/.test("import type { HttpFetch } from './io'")).toBe(false)
  })
})

describe('`callApi` 가 자기 종류를 싣는다', () => {
  it('기본은 `cli` 다 — `createNodeIo` 가 내는 값이다', async () => {
    const io = createFakeIo()
    stub(io, 'GET', '/api/x', { status: 200, body: {} })
    await callApi(io, SERVER, { method: 'GET', path: '/api/x' })

    expect(io.requests[0]!.headers[CLIENT_KIND_HEADER]).toBe('cli')
  })

  it('`mcp` 로 세운 `io` 는 `mcp` 를 싣는다 — MCP 의 `bin.ts` 가 그 판이다', async () => {
    const io = createFakeIo({ client: 'mcp' })
    stub(io, 'GET', '/api/x', { status: 200, body: {} })
    await callApi(io, SERVER, { method: 'GET', path: '/api/x' })

    expect(io.requests[0]!.headers[CLIENT_KIND_HEADER]).toBe('mcp')
  })

  it('바이트로 받는 요청도 같다 — `wireb export` 가 이 길이다', async () => {
    const io = createFakeIo()
    stub(io, 'GET', '/api/zip', { status: 200, bytes: new Uint8Array([1, 2, 3]) })
    await callApiBytes(io, SERVER, { method: 'GET', path: '/api/zip' })

    expect(io.requests[0]!.headers[CLIENT_KIND_HEADER]).toBe('cli')
  })

  it('거절당한 요청에도 실려 나갔다 — 실패 갈래에서 빠지지 않는다', async () => {
    const io = createFakeIo()
    stub(io, 'GET', '/api/x', { status: 403, body: { error: { code: 'forbidden', message: '안 됩니다' } } })

    await expect(callApi(io, SERVER, { method: 'GET', path: '/api/x' })).rejects.toBeInstanceOf(CliError)
    expect(io.requests[0]!.headers[CLIENT_KIND_HEADER]).toBe('cli')
  })
})

describe('`wireb` 가 실제로 낸 요청 전부에 실린다', () => {
  it('`wireb pull` 이 낸 요청 — 명령을 실제로 돌린다', async () => {
    const io = pullIo()
    expect(await run(['pull'], io), io.stderr.join('\n')).toBe(0)

    // 분모가 0이면 아래가 공허하다.
    expect(io.requests.length).toBeGreaterThan(0)
    for (const request of io.requests) {
      expect(request.headers[CLIENT_KIND_HEADER], request.url).toBe('cli')
    }
  })

  it('`wireb login` 도 같다 — 세션 경로에서도 자기를 말한다', async () => {
    const io = createFakeIo({
      cwd: '/repo',
      files: { '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }) },
      env: { WIREB_PASSWORD: 'password1234' },
    })
    stub(io, 'POST', '/api/auth/login', {
      status: 200,
      body: { id: 'u1', email: 'a@b.c', name: '사람' },
      setCookie: ['wb_session=abc; Path=/; HttpOnly'],
    })
    stub(io, 'POST', `/api/projects/${PROJECT}/tokens`, {
      status: 201,
      body: { id: 't1', name: 'wireb', value: 'RAWTOKEN', createdAt: '2026-08-16T00:00:00.000Z', lastUsedAt: null },
    })

    await run(['login', '--email', 'a@b.c'], io)

    expect(io.requests.length).toBeGreaterThan(1)
    for (const request of io.requests) {
      expect(request.headers[CLIENT_KIND_HEADER], request.url).toBe('cli')
    }
  })
})

function pullIo(): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: 'RAWTOKEN' }],
      }),
    },
  })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, {
    status: 200,
    body: {
      payloadVersion: 1,
      capturedAt: '2026-08-16T00:00:00.000Z',
      menu: [],
      pages: [],
      layouts: [],
      themes: [],
      comments: [],
    },
  })
  return io
}
