/**
 * `wireb export --format html -o <dir>` (P9-3 T6 · D9·D10).
 *
 * 재는 것: **서버가 만든 것을 그대로 받는가** · **압축 안의 위험한 경로를 거부하는가** ·
 * **이미 있는 파일을 덮지 않는가** · **`--format`이 `html`만 받는가**.
 */
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { EXIT } from '../src/exit'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import { BUNDLE_FILES, BUNDLE_ROOT, bundleZip } from './bundle-fixture'

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
  stub(io, 'GET', `/api/projects/${PROJECT}/export`, { status: 200, bytes: zip })
  return io
}

function 쓴것(io: FakeIo): string[] {
  return [...io.fs.keys()].filter((path) => path.startsWith('/repo/dist/')).sort()
}

describe('서버가 만든 zip을 받아 푼다 (D9)', () => {
  it('번들을 다시 만들지 않는다 — 부르는 것은 GET .../export 하나다', async () => {
    const io = 준비()
    expect(await run(['export', '--format', 'html', '-o', 'dist'], io), io.stderr.join('\n')).toBe(EXIT.ok)

    expect(io.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${SERVER}/api/projects/${PROJECT}/export`,
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

    expect(쓴것(io)).toEqual([
      '/repo/dist/assets/theme.css',
      '/repo/dist/index.html',
      '/repo/dist/pages/관리자-회원-목록.html',
    ])
    expect(io.fs.has(`/repo/dist/${BUNDLE_ROOT}/index.html`)).toBe(false)
  })

  it('마디를 공유하지 않으면 아무것도 안 벗긴다 — 어중간하게 벗기면 트리가 바뀐다', async () => {
    const io = 준비(bundleZip({ 'README.txt': '뿌리 밖' }))
    await run(['export', '-o', 'dist'], io)

    expect(io.fs.has('/repo/dist/README.txt')).toBe(true)
    expect(io.fs.has(`/repo/dist/${BUNDLE_ROOT}/index.html`)).toBe(true)
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
    stub(io, 'GET', `/api/projects/${PROJECT}/export`, { status: 200, bytes: bundleZip() })

    await run(['export', '-o', 'out'], io)
    expect(io.fs.has('/repo/apps/web/out/index.html')).toBe(true)
  })
})

describe('압축 안의 경로를 믿지 않는다', () => {
  /**
   * **이 명령은 *"서버가 준 archive를 사용자의 파일 시스템에 푸는 도구"*다.** 오늘 그 zip은
   * 우리 서버가 만들지만 그 부류가 오래 겪어 온 사고가 zip-slip이다.
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
  it('하나라도 있으면 **아무것도 쓰기 전에** 멈춘다', async () => {
    const io = 준비(bundleZip(), { '/repo/dist/index.html': '사람이 쓴 것' })

    expect(await run(['export', '-o', 'dist'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('--force')
    // 남은 둘도 안 썼다.
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

describe('쓰임말과 서버 거절', () => {
  it('--format 은 html만 받는다 (P10이 다른 자리를 쓴다)', async () => {
    const io = 준비()
    expect(await run(['export', '--format', 'pptx', '-o', 'dist'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('--format')
    expect(쓴것(io)).toEqual([])
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
    stub(io, 'GET', `/api/projects/${PROJECT}/export`, {
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
