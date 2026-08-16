/**
 * **D6의 인구조사: 토큰 원문이 리포 안 어디에도 없다.**
 *
 * 계획서가 *"하나짜리로 재지 마라"*고 못박은 자리다. `.wirebound.json`만 보는 케이스는
 * **캐시 파일이 하나 늘어나는 날 조용히 통과한다** — 그래서 이 파일은 명령 셋을 전부
 * 돌린 뒤 **가짜 파일 시스템에서 리포 아래에 있는 것 전부**를 훑는다. 분모를 손으로
 * 적지 않으므로 새 파일이 생기면 여기가 먼저 말한다.
 *
 * `.wirebound.json`은 **커밋되는 파일이다**(§12.1 — *"개발 리포 루트에 둔다"*가 리포
 * 바인딩을 선언하는 것이 존재 이유다). 계획서 재라 #7이 그 추론을 다시 재라고 했다:
 * 아래 *"바인딩 파일은 커밋될 수 있는 내용만 담는다"*가 그 판정을 값으로 만든다 —
 * 담기는 키가 `server`·`projectId` 둘뿐이고 어느 쪽도 비밀이 아니다.
 */
import { describe, expect, it } from 'vitest'
import { run } from '../src/run'
import { EXIT } from '../src/exit'
import { createFakeIo, stub, type FakeIo } from './fake-io'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
/** 원문. **한 글자짜리로 재지 않는다** — 흔한 글자를 쓰면 어디서나 우연히 맞는다. */
const TOKEN = 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq'
const REPO = '/repo'

function fullRun(): FakeIo {
  const io = createFakeIo({ cwd: REPO, env: { WIREB_PASSWORD: 'password1234' } })
  stub(io, 'POST', '/api/auth/login', {
    status: 200,
    body: { id: 'u1' },
    setCookie: ['wb_session=SESSIONVALUE; Path=/; HttpOnly'],
  })
  stub(io, 'POST', `/api/projects/${PROJECT}/tokens`, { status: 201, body: { value: TOKEN } })
  stub(io, 'POST', '/api/auth/logout', { status: 204 })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, {
    status: 200,
    body: { payloadVersion: 1, capturedAt: '2026-08-16T00:00:00.000Z', menu: [], pages: [], layouts: [], themes: [], comments: [] },
  })
  return io
}

/** 리포 아래에 있는 파일 전부. **목록을 손으로 적지 않는다.** */
function repoFiles(io: FakeIo): [string, string][] {
  return [...io.fs.entries()].filter(([path]) => path.startsWith(`${REPO}/`))
}

describe('토큰은 리포에 남지 않는다 (D6)', () => {
  it('명령 셋을 다 돌린 뒤 리포 안 어느 파일에도 원문이 없다', async () => {
    const io = fullRun()

    expect(await run(['init', '--server', SERVER, '--project', PROJECT], io)).toBe(EXIT.ok)
    expect(await run(['login', '--email', 'a@example.com'], io)).toBe(EXIT.ok)
    expect(await run(['pull'], io)).toBe(EXIT.ok)

    // 분모가 0이면 아래가 공허하게 통과한다. 명령 셋이 실제로 파일을 남겼는가.
    const files = repoFiles(io)
    expect(files.map(([path]) => path).sort()).toEqual([
      '/repo/.wirebound.json',
      '/repo/wirebound-snapshot.json',
    ])

    const leaked = files.filter(([, content]) => content.includes(TOKEN)).map(([path]) => path)
    expect(leaked).toEqual([])
  })

  it('자격은 홈 아래에 있다 — 그쪽에는 있어야 한다', async () => {
    const io = fullRun()
    await run(['init', '--server', SERVER, '--project', PROJECT], io)
    await run(['login', '--email', 'a@example.com'], io)

    // **이 대조가 없으면 위 케이스가 *"토큰을 아예 안 만들었다"*와 구분되지 않는다.**
    const stored = [...io.fs.entries()].filter(([, content]) => content.includes(TOKEN))
    expect(stored.map(([path]) => path)).toEqual(['/home/tester/.wirebound/credentials.json'])
  })

  it('바인딩 파일은 커밋될 수 있는 내용만 담는다 (재라 #7)', async () => {
    const io = fullRun()
    await run(['init', '--server', SERVER, '--project', PROJECT], io)
    await run(['login', '--email', 'a@example.com'], io)

    const binding = JSON.parse(io.fs.get('/repo/.wirebound.json') ?? '')
    // 키를 통째로 단언한다 — 하나 늘면 사람이 *"이것이 커밋돼도 되나"*를 다시 판정한다.
    expect(Object.keys(binding)).toEqual(['server', 'projectId'])
  })

  it('세션 쿠키도 리포에 남지 않는다 — 토큰만 보면 놓친다', async () => {
    const io = fullRun()
    await run(['init', '--server', SERVER, '--project', PROJECT], io)
    await run(['login', '--email', 'a@example.com'], io)

    const leaked = repoFiles(io).filter(([, content]) => content.includes('SESSIONVALUE'))
    expect(leaked.map(([path]) => path)).toEqual([])
  })

  it('비밀번호도 어디에도 안 쓴다 — 홈 아래도 포함이다', async () => {
    const io = fullRun()
    await run(['init', '--server', SERVER, '--project', PROJECT], io)
    await run(['login', '--email', 'a@example.com'], io)

    const leaked = [...io.fs.entries()].filter(([, content]) => content.includes('password1234'))
    expect(leaked.map(([path]) => path)).toEqual([])
  })

  it('심으면 잡는다 — 구분력', () => {
    const io = createFakeIo()
    io.fs.set('/repo/cache.json', `{"token":"${TOKEN}"}`)
    const leaked = repoFiles(io).filter(([, content]) => content.includes(TOKEN))
    expect(leaked.map(([path]) => path)).toEqual(['/repo/cache.json'])
  })
})
