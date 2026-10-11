/**
 * `wireb export --format <html|pptx> -o <dir>`.
 *
 * 재는 것: **서버가 만든 것을 그대로 받는가** · **압축 안의 위험한 경로를 거부하는가** ·
 * **이미 있는 파일을 덮지 않는가** · **`--format`이 아는 값만 받는가** ·
 * **pptx 를 풀지 않고 파일 하나로 쓰는가**.
 */
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { EXIT } from '../src/exit'
import { EXPORT_BUSY_RETRIES, EXPORT_BUSY_WAIT_LIMIT_S, SCREENLESS_HEADER, SCREEN_FAILURES_HEADER } from '../src/commands/export'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo, type StubResponse } from './fake-io'
import { BUNDLE_FILES, BUNDLE_ROOT, bundleZip, singleFileZip } from './bundle-fixture'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
const TOKEN = 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq'

function 준비(zip: Uint8Array = bundleZip(), files: Record<string, string> = {}): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: TOKEN }],
      }),
      ...files,
    },
  })
  stub(io, 'GET', `/api/projects/${PROJECT}/export?format=html`, { status: 200, bytes: zip })
  return io
}

function 쓴것(io: FakeIo): string[] {
  return [...io.fs.keys()].filter((path) => path.startsWith('/repo/dist/')).sort()
}

describe('서버가 만든 zip을 받아 푼다', () => {
  it('번들을 다시 만들지 않는다 — 부르는 것은 GET .../export 하나다', async () => {
    const io = 준비()
    expect(await run(['export', '--format', 'html', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)

    expect(io.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${SERVER}/api/projects/${PROJECT}/export?format=html`,
    ])
  })

  it('파일의 글자가 압축 안의 것과 같다 — 같은 바이트다', async () => {
    const io = 준비()
    await run(['export', '-o', 'dist'], io)

    expect(io.fs.get('/repo/dist/index.html')).toBe(BUNDLE_FILES['index.html'])
    expect(io.fs.get('/repo/dist/assets/theme.css')).toBe(BUNDLE_FILES['assets/theme.css'])
  })

  it('한글 파일 이름이 살아 있다 — UTF-8 비트가 없으면 여기서 깨진다', async () => {
    const io = 준비()
    await run(['export', '-o', 'dist'], io)

    expect(쓴것(io)).toContain('/repo/dist/pages/관리자-회원-목록.html')
  })

  /**
   * **뿌리 폴더를 벗긴다.** `-o`는 사람이 이미 고른 디렉터리이고, 서버가 고른 슬러그를
   * 그 안에 한 겹 더 두면 정적 호스팅 설정이 그 이름을 알 방법이 없다 — CLI가 말해 준 적이
   * 없기 때문이다.
   */
  it('뿌리 폴더를 벗긴다', async () => {
    const io = 준비()
    await run(['export', '-o', 'dist'], io)

    expect(쓴것(io)).toEqual(['/repo/dist/assets/theme.css', '/repo/dist/index.html', '/repo/dist/pages/관리자-회원-목록.html'])
    expect(io.fs.has(`/repo/dist/${BUNDLE_ROOT}/index.html`)).toBe(false)
  })

  it('마디를 공유하지 않으면 아무것도 안 벗긴다 — 어중간하게 벗기면 트리가 바뀐다', async () => {
    const io = 준비(bundleZip({ 'README.txt': '뿌리 밖' }))
    await run(['export', '-o', 'dist'], io)

    expect(io.fs.has('/repo/dist/README.txt')).toBe(true)
    expect(io.fs.has(`/repo/dist/${BUNDLE_ROOT}/index.html`)).toBe(true)
  })

  /**
   * **뿌리 폴더가 없는 한 파일짜리 번들.** 이 케이스가 없으면 `segments.length > 1` 가드를
   * `>= 1`로 바꿔도 **아무 케이스도 안 죽는다** — 그 가드가 막는 유일한 모양이 이것이다.
   *
   * 벗기면 `'index.html'.slice(len + 1)`이 **빈 문자열**이 되어 `-o` 디렉터리 자체에 쓰려
   * 든다. 서버는 언제나 뿌리 폴더를 두지만 **CLI는 그 계약을 안 믿는다**(압축
   * 안의 경로를 안 믿는 것과 같은 자세).
   */
  it('한 마디짜리 항목은 안 벗긴다 — 벗기면 경로가 빈 문자열이 된다', async () => {
    const io = 준비(singleFileZip())

    expect(await run(['export', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(쓴것(io)).toEqual(['/repo/dist/index.html'])
    // 벗겼다면 `join('/repo/dist', '')`가 `/repo/dist`가 된다.
    expect(io.fs.has('/repo/dist')).toBe(false)
  })

  it('뿌리 없는 여러 파일도 안 벗긴다 — 마디를 공유하지 않는다', async () => {
    const io = 준비(bundleZip({}, null))
    await run(['export', '-o', 'dist'], io)

    expect(쓴것(io)).toEqual(['/repo/dist/assets/theme.css', '/repo/dist/index.html', '/repo/dist/pages/관리자-회원-목록.html'])
  })

  it('상대 경로는 현재 디렉터리 기준이다', async () => {
    const io = createFakeIo({
      cwd: '/repo/apps/web',
      files: {
        '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
        '/home/tester/.wirebound/credentials.json': JSON.stringify({
          version: 1,
          credentials: [{ server: SERVER, projectId: PROJECT, token: TOKEN }],
        }),
      },
    })
    stub(io, 'GET', `/api/projects/${PROJECT}/export?format=html`, { status: 200, bytes: bundleZip() })

    await run(['export', '-o', 'out'], io)
    expect(io.fs.has('/repo/apps/web/out/index.html')).toBe(true)
  })
})

describe('압축 안의 경로를 믿지 않는다', () => {
  /**
   * **이 명령은 *"서버가 준 archive를 사용자의 파일 시스템에 푸는 도구"*다.** 그 zip은
   * 우리 서버가 만들지만 그 부류의 도구가 오래 겪어 온 사고가 zip-slip이다.
   */
  it('`..`가 든 항목을 거부한다 — 걸러 내고 나머지를 풀지 않는다', async () => {
    const 나쁜 = zipSync({ 'index.html': strToU8('ok'), '../evil.sh': strToU8('rm -rf /') })
    const io = 준비(나쁜)

    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('안전하지 않은 경로')
    // **아무것도 안 썼다.** 절반 풀고 멈추면 사람은 *"다 풀렸다"*고 읽는다.
    expect(쓴것(io)).toEqual([])
    expect(io.fs.has('/repo/evil.sh')).toBe(false)
  })

  it('가운데 마디의 `..`도 거부한다 — 정규화한 뒤 판정하지 않는다', async () => {
    const io = 준비(zipSync({ 'a/../b.html': strToU8('ok') }))
    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.server)
  })

  it('절대 경로를 거부한다', async () => {
    const io = 준비(zipSync({ '/etc/passwd': strToU8('nope') }))
    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('절대 경로')
  })

  it('역슬래시와 드라이브 경로를 거부한다 — `paths.ts`가 POSIX만 다룬다', async () => {
    const 역 = 준비(zipSync({ 'a\\b.html': strToU8('nope') }))
    expect(await run(['export', '-o', 'dist'], 역)).toBe(EXIT.server)

    const 드라이브 = 준비(zipSync({ 'C:/evil.html': strToU8('nope') }))
    expect(await run(['export', '-o', 'dist'], 드라이브)).toBe(EXIT.server)
    expect(드라이브.stderr.join('\n')).toContain('드라이브 경로')
  })

  it('멀쩡한 하위 경로는 통과한다 — 반대편', async () => {
    const io = 준비(zipSync({ 'pages/a/b/c.html': strToU8('ok') }))
    expect(await run(['export', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.fs.has('/repo/dist/a/b/c.html')).toBe(true)
  })

  it('zip이 아니면 코드 3이다 — 서버가 준 것이 이상하다', async () => {
    const io = 준비(new TextEncoder().encode('이건 zip이 아니다'))
    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('압축을 풀 수 없습니다')
  })
})

describe('이미 있는 파일을 덮지 않는다', () => {
  /**
   * **충돌 파일이 압축의 *마지막* 항목이다.** 첫 항목(`index.html`)으로 재면
   * 검사를 `files.slice(0, 1)`로 좁혀도 **아무 케이스도 안 죽는다** — *"하나라도
   * 있으면"*이 *"첫째가 있으면"*으로 조용히 바뀐다. **하나짜리로 재지 마라의 그 부류다.**
   */
  it('마지막 항목이 충돌해도 **아무것도 쓰기 전에** 멈춘다', async () => {
    const 마지막 = `/repo/dist/${Object.keys(BUNDLE_FILES).at(-1)}`
    const io = 준비(bundleZip(), { [마지막]: '사람이 쓴 것' })

    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('--force')
    // **앞의 둘도 안 썼다** — 절반 쓰고 멈추면 그 디렉터리가 섞인다.
    expect(io.fs.has('/repo/dist/index.html')).toBe(false)
    expect(io.fs.has('/repo/dist/assets/theme.css')).toBe(false)
    expect(io.fs.get(마지막)).toBe('사람이 쓴 것')
  })

  it('첫 항목이 충돌해도 멈춘다 — 양쪽 끝을 다 본다', async () => {
    const io = 준비(bundleZip(), { '/repo/dist/index.html': '사람이 쓴 것' })

    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.usage)
    expect(io.fs.has('/repo/dist/assets/theme.css')).toBe(false)
    expect(io.fs.get('/repo/dist/index.html')).toBe('사람이 쓴 것')
  })

  it('--force 면 덮는다', async () => {
    const io = 준비(bundleZip(), { '/repo/dist/index.html': '사람이 쓴 것' })

    expect(await run(['export', '-o', 'dist', '--force'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.fs.get('/repo/dist/index.html')).toBe(BUNDLE_FILES['index.html'])
  })

  it('비어 있으면 그냥 쓴다', async () => {
    const io = 준비()
    expect(await run(['export', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stdout.join('\n')).toContain('3개 파일을 썼습니다')
  })
})

/**
 * **`-o`가 디렉터리가 아닌 자리를 가리킬 때.**
 *
 * 안 끊으면 `mkdir`이 `ENOTDIR`로 던지고 `run.ts`의 마지막 갈래가 **70**
 * (*"버그다 — 사용자가 고칠 수 없다"*)으로 낸다. **사람이 할 일은 `-o` 한 글자를 고치는
 * 것**이므로 `exit.ts`의 표대로면 1이다.
 */
describe('-o 가 파일을 가리키면', () => {
  it('쓰기 전에 끊고 코드 1이다 — 70이 아니다', async () => {
    const io = 준비(bundleZip(), { '/repo/dist': '사람이 만든 파일' })

    const code = await run(['export', '-o', 'dist'], io)

    expect(code).toBe(EXIT.usage)
    // **70과 갈리는 것이 요점이다** — 그 번호는 *"사용자가 고칠 수 없다"*를 뜻한다.
    expect(code).not.toBe(EXIT.internal)
    expect(io.stderr.join('\n')).toContain('-o 는 디렉터리를 가리켜야 합니다')
    // 그 파일을 안 건드렸다.
    expect(io.fs.get('/repo/dist')).toBe('사람이 만든 파일')
  })

  /** `--force`는 *"덮어써도 된다"*이지 *"파일을 디렉터리로 만들어도 된다"*가 아니다. */
  it('--force 도 같은 자리에서 끊는다', async () => {
    const io = 준비(bundleZip(), { '/repo/dist': '사람이 만든 파일' })

    expect(await run(['export', '-o', 'dist', '--force'], io)).toBe(EXIT.usage)
    expect(io.fs.get('/repo/dist')).toBe('사람이 만든 파일')
  })

  it('이미 디렉터리면 그냥 쓴다 — 반대편', async () => {
    const io = 준비(bundleZip(), { '/repo/dist/기존.txt': '남의 파일' })

    expect(await run(['export', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.fs.has('/repo/dist/index.html')).toBe(true)
  })
})

describe('쓰임말과 서버 거절', () => {
  /** **`--format` 은 `html`·`pptx` 만 받는다.** 그 밖의 값은 서버에 묻기 전에 끊는다. */
  it('--format 은 아는 값만 받는다 — 모르는 값은 네트워크를 타기 전에 끊긴다', async () => {
    const io = 준비()
    expect(await run(['export', '--format', 'pdf', '-o', 'dist'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('--format')
    expect(쓴것(io)).toEqual([])
    // **요청을 안 보냈다.** 보내고 서버의 400 을 옮기면 오프라인에서 다른 코드가 나온다.
    expect(io.requests).toEqual([])
  })

  it('--format 을 안 주면 html이다', async () => {
    const io = 준비()
    expect(await run(['export', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)
  })

  it('-o 를 안 주면 쓰임말 오류다', async () => {
    const io = 준비()
    expect(await run(['export', '--format', 'html'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('디렉터리를 주세요')
  })

  /** 페이지가 없는 프로젝트는 409다. **서버가 쓴 문장을 그대로 옮긴다.** */
  it('서버가 거절하면 코드 3이고 서버의 문장이 나온다', async () => {
    const io = 준비()
    stub(io, 'GET', `/api/projects/${PROJECT}/export?format=html`, {
      status: 409,
      body: { error: { code: 'conflict', message: '내보낼 페이지가 없습니다' } },
    })

    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('내보낼 페이지가 없습니다')
  })

  it('자격이 없으면 코드 2다', async () => {
    const io = createFakeIo({
      cwd: '/repo',
      files: { '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }) },
    })
    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.config)
  })
})

/* ------------------------------------------------------------------- pptx */

/** pptx 를 흉내 내는 바이트. **내용을 안 본다** — CLI 는 이것을 풀지 않는다. */
const PPTX_BYTES = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x01, 0x02, 0x03])

function pptx준비(options: { fileName?: string | null; files?: Record<string, string> } = {}): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: TOKEN }],
      }),
      ...options.files,
    },
  })
  const fileName = options.fileName === undefined ? 'wirebound-export-foo.pptx' : options.fileName
  stub(io, 'GET', `/api/projects/${PROJECT}/export?format=pptx`, {
    status: 200,
    bytes: PPTX_BYTES,
    headers: fileName === null ? {} : { 'content-disposition': `attachment; filename="${fileName}"` },
  })
  return io
}

describe('--format pptx 는 파일 하나다', () => {
  it('형식을 그대로 실어 부른다', async () => {
    const io = pptx준비()
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${SERVER}/api/projects/${PROJECT}/export?format=pptx`,
    ])
  })

  /** **풀지 않는다.** pptx 도 zip 이지만 그것은 파일 하나의 안쪽이다. */
  it('파일 하나를 서버가 준 이름으로 쓴다', async () => {
    const io = pptx준비()
    await run(['export', '--format', 'pptx', '-o', 'dist'], io)
    expect(쓴것(io)).toEqual(['/repo/dist/wirebound-export-foo.pptx'])
  })

  /**
   * **바이트가 그대로다.** 문자열로 왕복시키면 UTF-8 로 못 되돌리는 바이트가 `U+FFFD` 가
   * 되고, 그러면 받는 쪽이 그 pptx 를 못 연다.
   */
  it('바이트를 글자로 왕복시키지 않는다', async () => {
    const io = pptx준비()
    await run(['export', '--format', 'pptx', '-o', 'dist'], io)
    expect(io.fs.get('/repo/dist/wirebound-export-foo.pptx')).toEqual(PPTX_BYTES)
  })

  it('서버가 이름을 안 주면 지어내지 않고 끊는다', async () => {
    const io = pptx준비({ fileName: null })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(쓴것(io)).toEqual([])
  })

  /** 서버가 준 이름이라도 그것이 곧 **사용자의 파일 시스템 경로**가 된다. */
  it('이름에 경로 마디가 있으면 끊는다 — -o 바깥을 못 겨눈다', async () => {
    const io = pptx준비({ fileName: '../../etc/passwd.pptx' })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(쓴것(io)).toEqual([])
  })

  it('이미 있으면 덮지 않는다 — html 과 같은 규칙이다', async () => {
    const io = pptx준비({ files: { '/repo/dist/wirebound-export-foo.pptx': '옛것' } })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io)).toBe(EXIT.usage)
    expect(io.text('/repo/dist/wirebound-export-foo.pptx')).toBe('옛것')
  })

  it('--force 면 덮는다', async () => {
    const io = pptx준비({ files: { '/repo/dist/wirebound-export-foo.pptx': '옛것' } })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist', '--force'], io)).toBe(EXIT.ok)
    expect(io.fs.get('/repo/dist/wirebound-export-foo.pptx')).toEqual(PPTX_BYTES)
  })

  it('-o 가 파일이면 끊는다 — html 과 같은 규칙이다', async () => {
    const io = pptx준비({ files: { '/repo/dist': '파일이다' } })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io)).toBe(EXIT.usage)
  })

  it('-o 가 없으면 사용법 오류이고 형식을 문장에 싣는다', async () => {
    const io = pptx준비()
    expect(await run(['export', '--format', 'pptx'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('pptx')
  })
})

/* ------------------------------------------------------------------- 밀려 있을 때 · 빠진 화면 */

const BUSY: StubResponse = {
  status: 503,
  headers: { 'retry-after': '5' },
  body: { error: { code: 'internal', message: '내보내기가 밀려 있습니다 — 잠시 뒤 다시 시도하세요' } },
}

/** 처음 `busyCount`번은 `busy`를, 그 뒤로는 `ok`를 낸다. */
function 차례로(busyCount: number, busy: StubResponse, ok: StubResponse): () => StubResponse {
  let seen = 0
  return () => (seen++ < busyCount ? busy : ok)
}

describe('밀려 있으면 Retry-After 를 따라 다시 보낸다', () => {
  it('503 + Retry-After 면 그 초만큼 쉬고 다시 보내 쓴다 — 기다릴 때마다 한 줄을 적는다', async () => {
    const io = 준비()
    stub(io, 'GET', `/api/projects/${PROJECT}/export?format=html`, 차례로(2, BUSY, { status: 200, bytes: bundleZip() }))

    expect(await run(['export', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.requests).toHaveLength(3)
    expect(io.sleeps).toEqual([5000, 5000])
    expect(io.stderr).toHaveLength(2)
    expect(io.stderr[0]).toContain('내보내기가 밀려 있습니다')
    expect(io.stderr[0]).toContain('5초 뒤 다시 보냅니다 (1/3)')
    expect(쓴것(io)).toContain('/repo/dist/index.html')
  })

  it(`${EXPORT_BUSY_RETRIES}번 다시 보내도 밀려 있으면 마지막 거절을 그대로 낸다 — 코드 3`, async () => {
    const io = 준비()
    stub(io, 'GET', `/api/projects/${PROJECT}/export?format=html`, BUSY)

    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(io.requests).toHaveLength(EXPORT_BUSY_RETRIES + 1)
    expect(io.sleeps).toEqual(Array.from({ length: EXPORT_BUSY_RETRIES }, () => 5000))
    expect(io.stderr.at(-1)).toContain('서버가 거절했습니다 (503): 내보내기가 밀려 있습니다')
    expect(쓴것(io)).toEqual([])
  })

  it('Retry-After 가 없는 503 은 다시 보내지 않는다 — 서버가 «언제»를 말하지 않았다', async () => {
    const io = 준비()
    stub(io, 'GET', `/api/projects/${PROJECT}/export?format=html`, { ...BUSY, headers: {} })

    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.server)
    expect(io.requests).toHaveLength(1)
    expect(io.sleeps).toEqual([])
  })

  it(`${EXPORT_BUSY_WAIT_LIMIT_S}초보다 긴 Retry-After 는 따르지 않는다 · 503 이 아닌 거절도 다시 보내지 않는다`, async () => {
    const long = 준비()
    stub(long, 'GET', `/api/projects/${PROJECT}/export?format=html`, {
      ...BUSY,
      headers: { 'retry-after': String(EXPORT_BUSY_WAIT_LIMIT_S + 1) },
    })
    expect(await run(['export', '-o', 'dist'], long)).toBe(EXIT.server)
    expect(long.requests).toHaveLength(1)

    const conflict = 준비()
    stub(conflict, 'GET', `/api/projects/${PROJECT}/export?format=html`, {
      status: 409,
      headers: { 'retry-after': '5' },
      body: { error: { code: 'conflict', message: '내보낼 페이지가 없습니다' } },
    })
    expect(await run(['export', '-o', 'dist'], conflict)).toBe(EXIT.server)
    expect(conflict.requests).toHaveLength(1)
  })
})

describe('--format pptx 가 빠진 화면을 말한다', () => {
  function 화면(headers: Record<string, string>): FakeIo {
    const io = pptx준비()
    stub(io, 'GET', `/api/projects/${PROJECT}/export?format=pptx`, {
      status: 200,
      bytes: PPTX_BYTES,
      headers: { 'content-disposition': 'attachment; filename="wirebound-export-foo.pptx"', ...headers },
    })
    return io
  }

  it('그리려다 실패한 장이 있으면 파일은 쓰고 표준에러에 경고한다 — 코드는 0 이다', async () => {
    const io = 화면({ [SCREEN_FAILURES_HEADER]: '3', [SCREENLESS_HEADER]: '0' })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io)).toBe(EXIT.ok)
    expect(쓴것(io)).toEqual(['/repo/dist/wirebound-export-foo.pptx'])
    expect(io.stderr).toEqual([
      '경고: 화면 이미지 3장을 그리지 못해 그 슬라이드에는 글자만 실렸습니다. 이유는 웹의 내보내기 창에서 PPTX 를 고르면 보입니다',
    ])
  })

  it('아무도 안 그린 장이 있으면 그것도 말한다', async () => {
    const io = 화면({ [SCREEN_FAILURES_HEADER]: '0', [SCREENLESS_HEADER]: '2' })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io)).toBe(EXIT.ok)
    expect(io.stderr).toEqual(['경고: 서버가 화면 이미지를 그리지 않아 2장이 글자만 실렸습니다'])
  })

  it('둘 다 0 이거나 머리가 없으면(그 머리를 모르는 서버) 아무 말도 하지 않는다', async () => {
    const zero = 화면({ [SCREEN_FAILURES_HEADER]: '0', [SCREENLESS_HEADER]: '0' })
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], zero)).toBe(EXIT.ok)
    expect(zero.stderr).toEqual([])

    const old = 화면({})
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], old)).toBe(EXIT.ok)
    expect(old.stderr).toEqual([])
  })
})
