/**
 * `wireb login` — 자격을 만들고, 세션 쿠키를 손으로 나른다.
 */
import { describe, expect, it } from 'vitest'
import { run } from '../src/run'
import { EXIT } from '../src/exit'
import { createFakeIo, stub, type FakeIo } from './fake-io'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
const BINDING = JSON.stringify({ server: SERVER, projectId: PROJECT })
const SESSION_COOKIE = 'wb_session=SESSIONVALUE; Path=/; HttpOnly; SameSite=Lax'

function loginIo(overrides: { env?: Record<string, string | undefined>; secret?: string; stdin?: string } = {}): FakeIo {
  const io = createFakeIo({
    files: { '/repo/.wirebound.json': BINDING },
    env: overrides.env ?? { WIREB_PASSWORD: 'password1234' },
    secret: overrides.secret,
    stdin: overrides.stdin,
  })
  stub(io, 'POST', '/api/auth/login', {
    status: 200,
    body: { id: 'u1', email: 'a@example.com', name: '사용자' },
    setCookie: [SESSION_COOKIE],
  })
  stub(io, 'POST', `/api/projects/${PROJECT}/tokens`, {
    status: 201,
    body: { id: 'tok_1', name: 'wireb', createdAt: '2026-08-16T00:00:00.000Z', lastUsedAt: null, value: 'RAWTOKEN' },
  })
  stub(io, 'POST', '/api/auth/logout', { status: 204 })
  return io
}

describe('wireb login — 자격을 만드는 유일한 명령', () => {
  it('세션을 만들고 토큰을 발급받아 홈 아래에 저장하고 세션을 정리한다', async () => {
    const io = loginIo()
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${SERVER}/api/auth/login`,
      `POST ${SERVER}/api/projects/${PROJECT}/tokens`,
      `POST ${SERVER}/api/auth/logout`,
    ])

    const stored = JSON.parse(io.text('/home/tester/.wirebound/credentials.json') ?? '')
    expect(stored).toEqual({
      version: 1,
      credentials: [{ server: SERVER, projectId: PROJECT, token: 'RAWTOKEN' }],
    })
  })

  /**
   * **쿠키를 손으로 나르는 것을 여기서 고정한다.** Node의 전역 `fetch`에는 쿠키 저장소가 없다(실측:
   * `Set-Cookie`를 받은 뒤 같은 오리진으로 다시 요청해도 `Cookie`가 실리지 않고,
   * `credentials: 'include'`도 리다이렉트도 이어 주지 않는다). 그래서 `login`이 손으로
   * 날라야 하고, **안 나르면 토큰 발급이 401이 된다.**
   */
  it('세션 쿠키를 손으로 날라 다음 두 요청에 싣는다', async () => {
    const io = loginIo()
    await run(['login', '--email', 'a@example.com'], io)

    const [loginCall, tokenCall, logoutCall] = io.requests
    expect(loginCall?.headers.cookie).toBeUndefined()
    expect(tokenCall?.headers.cookie).toBe('wb_session=SESSIONVALUE')
    expect(logoutCall?.headers.cookie).toBe('wb_session=SESSIONVALUE')
  })

  it('쿠키 이름을 보지 않는다 — 서버 설정이 바뀌어도 선다', async () => {
    const io = loginIo()
    stub(io, 'POST', '/api/auth/login', {
      status: 200,
      body: {},
      setCookie: ['custom_name=ABC; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT', 'extra=1; Path=/'],
    })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    // 여럿이면 `; `로 잇는다. `Expires` 안의 쉼표에 걸리지 않는 것이 `getSetCookie()`를
    // 쓰는 이유다.
    expect(io.requests[1]?.headers.cookie).toBe('custom_name=ABC; extra=1')
  })

  it('세션 쿠키가 없으면 3이다 — 토큰을 달라고 하지 않는다', async () => {
    const io = loginIo()
    stub(io, 'POST', '/api/auth/login', { status: 200, body: {}, setCookie: [] })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code).toBe(EXIT.server)
    expect(io.requests).toHaveLength(1)
  })

  it('로그인이 거절되면 서버가 쓴 문장을 그대로 옮긴다', async () => {
    const io = loginIo()
    stub(io, 'POST', '/api/auth/login', {
      status: 401,
      body: { error: { code: 'unauthenticated', message: '이메일 또는 비밀번호가 올바르지 않습니다' } },
    })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('이메일 또는 비밀번호가 올바르지 않습니다')
  })

  it('로그아웃이 실패해도 로그인은 성공이다 — 토큰이 이미 손에 있다', async () => {
    const io = loginIo()
    stub(io, 'POST', '/api/auth/logout', () => new Error('연결이 끊겼다'))
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code).toBe(EXIT.ok)
    expect(io.text('/home/tester/.wirebound/credentials.json')).toContain('RAWTOKEN')
  })

  it('.wirebound.json이 없으면 2이고 init을 가리킨다', async () => {
    const io = createFakeIo({ env: { WIREB_PASSWORD: 'pw' } })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('wireb init')
  })

  it('--server 와 --project 를 둘 다 주면 바인딩이 없어도 된다', async () => {
    const io = loginIo()
    io.fs.delete('/repo/.wirebound.json')
    const code = await run(['login', '--email', 'a@example.com', '--server', `${SERVER}/`, '--project', PROJECT], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.requests[0]?.url).toBe(`${SERVER}/api/auth/login`)
  })

  it('--name 이 토큰 꼬리표가 된다. 기본은 wireb다', async () => {
    const io = loginIo()
    await run(['login', '--email', 'a@example.com'], io)
    expect(JSON.parse(io.requests[1]?.body ?? '{}').name).toBe('wireb')

    const named = loginIo()
    await run(['login', '--email', 'a@example.com', '--name', '내 노트북'], named)
    expect(JSON.parse(named.requests[1]?.body ?? '{}').name).toBe('내 노트북')
  })
})

describe('비밀번호는 argv에 오지 않는다', () => {
  /** **없는 것을 케이스로 드는 자리다.** */
  it('--password 는 인식할 수 없는 옵션이다', async () => {
    const io = loginIo()
    const code = await run(['login', '--email', 'a@example.com', '--password', 'password1234'], io)

    expect(code).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain("Unknown option '--password'")
    // **아무 요청도 나가지 않는다** — 파싱에서 끝난다.
    expect(io.requests).toEqual([])
  })

  it('플래그 표에 password 가 없다 — 이름을 바꿔 되살리는 것도 막는다', async () => {
    const { COMMANDS } = await import('../src/run')
    const login = COMMANDS.find((command) => command.words[0] === 'login')
    expect(Object.keys(login?.options ?? {})).toEqual(['server', 'project', 'email', 'name'])
  })

  it('tty면 에코 없이 묻는다', async () => {
    const io = loginIo({ env: {}, secret: 'password1234' })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(JSON.parse(io.requests[0]?.body ?? '{}').password).toBe('password1234')
  })

  it('tty가 아니면 표준입력을 읽는다', async () => {
    const io = loginIo({ env: {}, stdin: 'password1234\n' })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(JSON.parse(io.requests[0]?.body ?? '{}').password).toBe('password1234')
  })

  it('WIREB_PASSWORD 가 프롬프트와 표준입력을 이긴다', async () => {
    const io = loginIo({ env: { WIREB_PASSWORD: '환경값' }, secret: '프롬프트값', stdin: '표준입력값' })
    await run(['login', '--email', 'a@example.com'], io)

    expect(JSON.parse(io.requests[0]?.body ?? '{}').password).toBe('환경값')
  })

  it('어디에서도 못 읽으면 2이고 무엇을 하라고 말한다', async () => {
    const io = loginIo({ env: {} })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('WIREB_PASSWORD')
    expect(io.requests).toEqual([])
  })

  it('이메일이 없으면 1이다 — 표준입력에서 읽지 않는다', async () => {
    const io = loginIo({ env: { WIREB_PASSWORD: 'pw' }, stdin: 'a@example.com\npw\n' })
    const code = await run(['login'], io)

    expect(code).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('--email')
  })

  it('WIREB_EMAIL 이 --email 을 대신한다', async () => {
    const io = loginIo({ env: { WIREB_PASSWORD: 'pw', WIREB_EMAIL: 'env@example.com' } })
    const code = await run(['login'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(JSON.parse(io.requests[0]?.body ?? '{}').email).toBe('env@example.com')
  })
})

describe('자격 저장소', () => {
  /**
   * **자격 파일의 권한을 지키는 자가 이것이다.** 프로덕션이 좁게 쓰는 것을 스모크로
   * (`drwx------`·`-rw-------`) 보는 것은 **다시 안 도는 관찰**이고, 이 케이스가 없으면
   * 0600을 0644로 바꿔도 아무 케이스도 안 죽는다.
   *
   * 가짜 `io`가 `write`의 셋째 인자를 버리면 이 자가 설 수 없다 — `fake-io.ts`의 `modes`가
   * 그것을 기록하고 여기서 단언한다.
   *
   * **8진수로 적는다.** `0o600`을 십진수 384로 적으면 사람이 그것이 무엇인지 못 읽는다.
   */
  it('자격 파일은 0600, 그 디렉터리는 0700이다', async () => {
    const io = loginIo()
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.modes.get('/home/tester/.wirebound/credentials.json')).toEqual({
      mode: 0o600,
      dirMode: 0o700,
    })
  })

  /**
   * **바인딩 파일은 반대다 — 좁히지 않는다.** 그것은 커밋되는 선언이라(설계서 「리포 바인딩」) 팀이 함께
   * 읽고, 0600으로 쓰면 같은 기계의 다른 사용자·CI 러너가 못 읽는다. **없는 것을
   * 케이스가 든다** — 누가 두 파일에 같은 권한을 걸면 여기가 말한다.
   */
  it('.wirebound.json에는 권한을 걸지 않는다 — 커밋되는 파일이다', async () => {
    const io = loginIo()
    await run(['init', '--server', SERVER, '--project', PROJECT, '--force'], io)

    expect(io.modes.get('/repo/.wirebound.json')).toEqual({ mode: undefined, dirMode: undefined })
  })

  it('WIREB_CREDENTIALS 가 자리를 덮는다 — CI에는 홈이 없을 수 있다', async () => {
    const io = loginIo({ env: { WIREB_PASSWORD: 'pw', WIREB_CREDENTIALS: '/tmp/ci-creds.json' } })
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code, io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.fs.has('/tmp/ci-creds.json')).toBe(true)
    expect(io.fs.has('/home/tester/.wirebound/credentials.json')).toBe(false)
  })

  it('같은 서버·프로젝트를 다시 로그인하면 앞 자격이 대체된다', async () => {
    const io = loginIo()
    await run(['login', '--email', 'a@example.com'], io)

    stub(io, 'POST', `/api/projects/${PROJECT}/tokens`, { status: 201, body: { value: 'SECONDTOKEN' } })
    await run(['login', '--email', 'a@example.com'], io)

    const stored = JSON.parse(io.text('/home/tester/.wirebound/credentials.json') ?? '')
    expect(stored.credentials).toEqual([{ server: SERVER, projectId: PROJECT, token: 'SECONDTOKEN' }])
  })

  it('다른 프로젝트의 자격은 나란히 남는다', async () => {
    const io = loginIo()
    await run(['login', '--email', 'a@example.com'], io)

    stub(io, 'POST', '/api/projects/prj_other/tokens', { status: 201, body: { value: 'OTHERTOKEN' } })
    await run(['login', '--email', 'a@example.com', '--server', SERVER, '--project', 'prj_other'], io)

    const stored = JSON.parse(io.text('/home/tester/.wirebound/credentials.json') ?? '')
    expect(stored.credentials.map((entry: { projectId: string }) => entry.projectId)).toEqual([PROJECT, 'prj_other'])
  })

  it('모르는 형식의 자격 파일을 조용히 덮지 않는다', async () => {
    const io = loginIo()
    io.fs.set('/home/tester/.wirebound/credentials.json', JSON.stringify({ version: 99, credentials: [] }))
    const code = await run(['login', '--email', 'a@example.com'], io)

    expect(code).toBe(EXIT.config)
    expect(JSON.parse(io.text('/home/tester/.wirebound/credentials.json') ?? '').version).toBe(99)
  })
})
