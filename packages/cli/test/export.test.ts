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

  /**
   * **뿌리 폴더가 없는 한 파일짜리 번들**(리뷰 N5). `segments.length > 1` 가드를 `>= 1`로
   * 바꿔도 **0건이 죽었다**(리뷰어 실측 R19) — 그 가드가 막는 유일한 모양을 아무도 안 쟀다.
   *
   * 벗기면 `'index.html'.slice(len + 1)`이 **빈 문자열**이 되어 `-o` 디렉터리 자체에 쓰려
   * 든다. 오늘 서버는 언제나 뿌리 폴더를 두지만 **CLI는 그 계약을 안 믿기로 했다**(압축
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

    expect(쓴것(io)).toEqual([
      '/repo/dist/assets/theme.css',
      '/repo/dist/index.html',
      '/repo/dist/pages/관리자-회원-목록.html',
    ])
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
  /**
   * **충돌 파일이 압축의 *마지막* 항목이다**(리뷰 N4). 첫 항목(`index.html`)으로 재면
   * 검사를 `files.slice(0, 1)`로 좁혀도 **0건이 죽는다**(리뷰어 실측 R20) — *"하나라도
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
 * **`-o`가 디렉터리가 아닌 자리를 가리킬 때**(리뷰 N6).
 *
 * 안 끊으면 `mkdir`이 `ENOTDIR`로 던지고 `run.ts`의 마지막 갈래가 **70**
 * (*"버그다 — 사용자가 고칠 수 없다"*)으로 낸다. **사람이 할 일은 `-o` 한 글자를 고치는
 * 것**이므로 `exit.ts`의 표대로면 1이다.
 */
describe('-o 가 파일을 가리키면 (리뷰 N6)', () => {
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
