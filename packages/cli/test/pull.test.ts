/**
 * `wireb pull` — T6·D8.
 *
 * **세 갈래를 각각 든다**(자격 없음·서버 거절·서버에 못 닿음). *"에러 처리"*로 뭉치지
 * 않는 것이 이 명령의 값이다.
 */
import { describe, expect, it } from 'vitest'
import { run } from '../src/run'
import { EXIT } from '../src/exit'
import { DEFAULT_PULL_FILE } from '../src/commands/pull'
import { createFakeIo, stub, type FakeIo } from './fake-io'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'

const PAYLOAD = {
  payloadVersion: 1,
  capturedAt: '2026-08-16T00:00:00.000Z',
  menu: [{ id: 'm1', parentId: null, title: '관리자', sortOrder: 0 }],
  pages: [{ id: 'p1', menuNodeId: 'm1', title: '목록', schemaVersion: 1, schema: { version: 1 }, headSeq: 0 }],
  layouts: [],
  themes: [],
  comments: [],
}

function pullIo(options: { cwd?: string; token?: string; env?: Record<string, string | undefined> } = {}): FakeIo {
  const files: Record<string, string> = {
    '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
  }
  if (options.token !== undefined) {
    files['/home/tester/.wirebound/credentials.json'] = JSON.stringify({
      version: 1,
      credentials: [{ server: SERVER, projectId: PROJECT, token: options.token }],
    })
  }
  const io = createFakeIo({ cwd: options.cwd ?? '/repo', files, env: options.env })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: PAYLOAD })
  return io
}

describe('wireb pull', () => {
  it('단수 라우트를 부른다 — 복수는 쓰기다 (D8)', async () => {
    const io = pullIo({ token: 'RAWTOKEN' })
    const code = await run(['pull'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.requests).toHaveLength(1)
    expect(io.requests[0]?.method).toBe('GET')
    expect(io.requests[0]?.url).toBe(`${SERVER}/api/projects/${PROJECT}/snapshot`)
    expect(io.requests[0]?.headers.authorization).toBe('Bearer RAWTOKEN')
  })

  it('리포 뿌리에 wirebound-snapshot.json으로 쓴다', async () => {
    const io = pullIo({ token: 'RAWTOKEN' })
    await run(['pull'], io)

    const written = io.fs.get(`/repo/${DEFAULT_PULL_FILE}`)
    expect(written).toBeDefined()
    expect(JSON.parse(written ?? '')).toEqual(PAYLOAD)
    // **한 줄이 아니라 펴서 쓴다** — 사람이 열어 보고 `git diff`가 읽혀야 한다.
    expect((written ?? '').split('\n').length).toBeGreaterThan(5)
  })

  it('하위 디렉터리에서 쳐도 같은 파일이 갱신된다', async () => {
    const io = pullIo({ cwd: '/repo/apps/web', token: 'RAWTOKEN' })
    const code = await run(['pull'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.fs.has(`/repo/${DEFAULT_PULL_FILE}`)).toBe(true)
    expect(io.fs.has(`/repo/apps/web/${DEFAULT_PULL_FILE}`)).toBe(false)
  })

  it('-o 는 현재 디렉터리 기준으로 푼다', async () => {
    const io = pullIo({ cwd: '/repo/apps/web', token: 'RAWTOKEN' })
    await run(['pull', '-o', 'design.json'], io)

    expect(io.fs.has('/repo/apps/web/design.json')).toBe(true)
  })

  it('-o 에 절대 경로도 준다', async () => {
    const io = pullIo({ token: 'RAWTOKEN' })
    await run(['pull', '--out', '/tmp/design.json'], io)

    expect(io.fs.has('/tmp/design.json')).toBe(true)
  })

  it('무엇을 받았는지 말한다', async () => {
    const io = pullIo({ token: 'RAWTOKEN' })
    await run(['pull'], io)

    expect(io.stdout.join('\n')).toContain('메뉴 1개 · 페이지 1개')
  })

  it('WIREB_TOKEN 이 자격 파일을 이긴다', async () => {
    // **ASCII로 잰다.** 서버가 내는 토큰은 base64url이고, 헤더는 ByteString이라
    // 한국어 값은 애초에 보낼 수 없다(아래 *"헤더에 실을 수 없는 자격"* 케이스).
    const io = pullIo({ token: 'FILE-TOKEN', env: { WIREB_TOKEN: 'ENV-TOKEN' } })
    await run(['pull'], io)

    expect(io.requests[0]?.headers.authorization).toBe('Bearer ENV-TOKEN')
  })
})

describe('세 갈래를 갈라 말한다 (T6)', () => {
  it('① 자격이 없다 → 2, login을 가리킨다', async () => {
    const io = pullIo()
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('wireb login')
    // **요청을 아예 안 보낸다** — 자격 없이 찔러 401을 받아 오는 것보다 낫다.
    expect(io.requests).toEqual([])
  })

  it('② 프로젝트가 안 맞는다 → 3, 서버가 쓴 문장을 옮긴다', async () => {
    const io = pullIo({ token: 'RAWTOKEN' })
    stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, {
      status: 404,
      body: { error: { code: 'not-found', message: '프로젝트를 찾을 수 없습니다' } },
    })
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('프로젝트를 찾을 수 없습니다')
    expect(io.stderr.join('\n')).toContain('404')
    expect(io.fs.has(`/repo/${DEFAULT_PULL_FILE}`)).toBe(false)
  })

  it('③ 서버가 죽었다 → 4, 주소와 원인을 말한다', async () => {
    const io = pullIo({ token: 'RAWTOKEN' })
    stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, () => {
      const error = new TypeError('fetch failed')
      ;(error as { cause?: unknown }).cause = new Error('connect ECONNREFUSED 127.0.0.1:3001')
      return error
    })
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.unreachable)
    expect(io.stderr.join('\n')).toContain(SERVER)
    // **`fetch failed` 하나로는 아무것도 못 본다** — `cause`를 꺼내는 이유다.
    expect(io.stderr.join('\n')).toContain('ECONNREFUSED')
  })

  it('세 갈래의 코드가 서로 다르다 — 스크립트가 가를 수 있다', () => {
    expect(new Set([EXIT.config, EXIT.server, EXIT.unreachable]).size).toBe(3)
  })

  /**
   * **스모크에서 재서 알았다.** HTTP 헤더 값은 ByteString이라 한국어가 든 `WIREB_TOKEN`은
   * `fetch`가 던진다. 그것을 그대로 `catch`가 받으면 **"서버에 연결할 수 없습니다"(4)**가
   * 나가 사람이 네트워크를 들여다보게 된다 — 원인은 자기 환경 변수다.
   */
  it('헤더에 실을 수 없는 자격은 4가 아니라 2다 — 원인을 서버에 떠넘기지 않는다', async () => {
    const io = pullIo({ env: { WIREB_TOKEN: '한국어토큰' } })
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('authorization')
    // **요청이 나가지 않는다** — 나갔다면 그 실패는 서버 쪽으로 기록된다.
    expect(io.requests).toEqual([])
  })

  it('JSON이 아닌 응답도 3이다 — 본문을 터미널에 쏟지 않는다', async () => {
    const io = pullIo({ token: 'RAWTOKEN' })
    stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, {
      status: 502,
      text: '<html><body>Bad Gateway</body></html>',
    })
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('502')
    expect(io.stderr.join('\n')).not.toContain('<html>')
  })

  it('.wirebound.json이 없으면 2다', async () => {
    const io = createFakeIo()
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('wireb init')
  })

  it('.wirebound.json에 projectId가 없으면 2이고 어느 파일인지 말한다', async () => {
    const io = createFakeIo({ files: { '/repo/.wirebound.json': JSON.stringify({ server: SERVER }) } })
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('/repo/.wirebound.json')
    expect(io.stderr.join('\n')).toContain('projectId')
  })
})
