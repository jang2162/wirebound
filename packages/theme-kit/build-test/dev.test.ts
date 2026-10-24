/**
 * `wb-theme dev` 를 실브라우저로 잰다 — 빌드한 kit(`dist/`)을 절대 경로로 불러 픽스처 복사본에 dev 서버를 띄우고 Chrome 으로 셸을
 * 연다. 이름(`@wirebound/theme-kit`)으로 부르면 vitest 의 alias 가 소스로 돌려 미리 빌드한 갤러리 클라이언트(`dist/client`)를 안 잰다.
 *
 * Chrome 은 `apps/web/build-test/editor-stack.ts` 와 같은 순서로 찾는다(`EDITOR_BROWSER_PATH` → 설치된 Chrome → playwright-core 캐시).
 * **건너뛸 전제는 띄워 보고 정한다** — 못 띄우면 건너뛰고 그 까닭을 찍는다.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser, type Frame, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const KIT = resolve(repoRoot, 'packages/theme-kit')
const FIXTURE = join(KIT, 'test/fixtures/sample-theme')
// 설치한 작성자 프로젝트처럼 SDK · react 가 `node_modules` 로 풀리는 자리(`test/build.test.ts` 의 `TMP` 와 같은 까닭).
const TMP = join(KIT, '.tmp')

function chromeCandidates(): (string | undefined)[] {
  const fromShell = process.env.EDITOR_BROWSER_PATH
  if (fromShell !== undefined && fromShell !== '') return [fromShell]
  return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', undefined]
}

async function launchChrome(): Promise<Browser | string> {
  const failures: string[] = []
  for (const candidate of chromeCandidates()) {
    try {
      return await chromium.launch({ executablePath: candidate, headless: true })
    } catch (error) {
      failures.push(`${candidate ?? 'playwright-core 캐시'}: ${(error as Error).message.split('\n')[0]}`)
    }
  }
  return failures.join(' · ')
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => done(port))
    })
  })
}

interface DistKit {
  startDev(opts: { root: string; port?: number }): Promise<{ url: string; close(): Promise<void> }>
}

const launched = await launchChrome()
if (typeof launched === 'string') console.warn(`[theme-kit dev] Chrome 을 못 띄워 건너뛴다 — ${launched}`)

describe.skipIf(typeof launched === 'string')('wb-theme dev (실브라우저)', () => {
  const browser = launched as Browser
  let root: string
  let server: Awaited<ReturnType<DistKit['startDev']>>
  let page: Page

  beforeAll(async () => {
    execFileSync('pnpm', ['--filter', '@wirebound/theme-kit...', 'build'], { cwd: repoRoot, stdio: 'pipe' })
    const kit = (await import(/* @vite-ignore */ pathToFileURL(join(KIT, 'dist/index.js')).href)) as DistKit
    mkdirSync(TMP, { recursive: true })
    root = mkdtempSync(join(TMP, 'dev-'))
    cpSync(FIXTURE, root, { recursive: true })
    server = await kit.startDev({ root, port: await freePort() })
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    await page.goto(server.url)
    await galleryFrame()
  })

  afterAll(async () => {
    await page?.close().catch(() => {})
    await browser.close().catch(() => {})
    await server?.close().catch(() => {})
    rmSync(TMP, { recursive: true, force: true })
  })

  /** 프레임이 다시 실리면 `Frame` 이 바뀐다 — 매번 찾아 쓰고, 갤러리가 선 뒤에 돌려준다. */
  async function galleryFrame(): Promise<Frame> {
    const deadline = Date.now() + 20_000
    for (;;) {
      const frame = page.frames().find((f) => f.url().endsWith('/frame.html'))
      if (frame) {
        const ready = await frame.evaluate(() => document.querySelectorAll('[data-wb-gallery-item]').length).catch(() => 0)
        if (ready > 0) return frame
      }
      if (Date.now() > deadline) throw new Error('갤러리 프레임이 20s 안에 서지 않았다')
      await page.waitForTimeout(100)
    }
  }

  it('갤러리가 카탈로그를 그린다', async () => {
    const frame = await galleryFrame()
    const kinds = await frame.evaluate(
      () => new Set([...document.querySelectorAll('[data-wb-component]')].map((el) => el.getAttribute('data-wb-component'))).size,
    )
    expect(kinds).toBe(29)
  })

  it('테마 뷰가 쓰인다 — SDK 한 벌', async () => {
    const frame = await galleryFrame()
    const probe = await frame.evaluate(() => ({
      cards: document.querySelectorAll('.sample-card').length,
      errors: document.querySelectorAll('[data-wb-error]').length,
    }))
    expect(probe).toEqual({ cards: 6, errors: 0 })
  })

  it('뷰포트 프리셋 — 375 를 고르면 프레임이 375 폭이다', async () => {
    await page.selectOption('[data-wb-viewport]', '375')
    const frame = await galleryFrame()
    await expect
      .poll(async () => {
        const iframe = await page.$eval('iframe', (el) => el.getBoundingClientRect().width)
        const inner = await frame.evaluate(() => window.innerWidth)
        return [iframe, inner]
      })
      .toEqual([375, 375])
    await page.selectOption('[data-wb-viewport]', '1280')
  })

  it('토큰 패널 — 주색을 바꾸면 프레임의 계산된 색이 바뀐다', async () => {
    await page.fill('[data-wb-token-input="color.primary"]', '#00ff00')
    const frame = await galleryFrame()
    await expect
      .poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.sample-card')!).borderTopColor))
      .toBe('rgb(0, 255, 0)')
  })

  it('뷰 파일을 고치면 갤러리의 글자가 바뀐다 — 셸은 다시 안 실린다', async () => {
    await page.evaluate(() => {
      ;(window as unknown as { __wbShellMark: number }).__wbShellMark = 1
    })
    const file = join(root, 'src/index.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace('샘플 카드', '고친 카드'))
    await expect
      .poll(
        async () => {
          const frame = await galleryFrame()
          return frame.evaluate(() => document.querySelector('.sample-card-note')?.textContent ?? null).catch(() => null)
        },
        { timeout: 10_000 },
      )
      .toBe('고친 카드')
    expect(await page.evaluate(() => (window as unknown as { __wbShellMark?: number }).__wbShellMark)).toBe(1)
    // 프레임이 다시 섰어도 셸의 토큰 값을 다시 받는다.
    const frame = await galleryFrame()
    await expect
      .poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.sample-card')!).borderTopColor))
      .toBe('rgb(0, 255, 0)')
  })

  it('설정을 틀리면 셸에 이슈가 선다', async () => {
    const file = join(root, 'theme.config.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace("version: '1.0.0'", "version: '1.0'"))
    await page.waitForSelector('[data-wb-issue-code="bad-version"]', { timeout: 10_000 })
  })

  it('다른 Host 로 온 요청은 셸 경로(/ · /__wb/project)도 거절한다 — vite 의 경로와 같게', async () => {
    // DNS 재바인딩 판: 남의 페이지가 제 이름을 127.0.0.1 로 돌려 같은 출처로 읽는다. vite 의 host 검사는 `/frame.html` ·
    // `/@fs/…` 를 403 으로 막는데, 셸 미들웨어는 그 검사 앞에 걸려 manifest · 설정 이슈를 그대로 준다(A2 리뷰 항목 5).
    const { port } = new URL(server.url)
    const status = (path: string) =>
      new Promise<string>((done, fail) => {
        const socket = connect(Number(port), '127.0.0.1', () =>
          socket.write(`GET ${path} HTTP/1.1\r\nHost: evil.example:${port}\r\nConnection: close\r\n\r\n`),
        )
        let reply = ''
        socket.on('data', (chunk) => {
          reply += chunk
        })
        socket.on('end', () => done(reply.split('\r\n')[0]!.split(' ')[1]!))
        socket.on('error', fail)
      })
    // 카나리아 — vite 의 경로는 막힌다(이 판에서 host 검사가 돈다).
    expect(await status('/frame.html')).toBe('403')
    expect({ shell: await status('/'), project: await status('/__wb/project') }).toEqual({ shell: '403', project: '403' })
  })

  it('로컬 이름(localhost · 127.0.0.1 · [::1])으로 온 요청은 셸도 vite 의 경로도 받는다 — 두 판정이 같다', async () => {
    const { port } = new URL(server.url)
    const status = (host: string, path: string) =>
      new Promise<string>((done, fail) => {
        const socket = connect(Number(port), '127.0.0.1', () =>
          socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`),
        )
        let reply = ''
        socket.on('data', (chunk) => {
          reply += chunk
        })
        socket.on('end', () => done(reply.split('\r\n')[0]!.split(' ')[1]!))
        socket.on('error', fail)
      })
    const table: Record<string, Record<string, string>> = {}
    for (const host of [
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      `[::1]:${port}`,
      'localhost',
      `sub.localhost:${port}`,
      `evil.example:${port}`,
    ]) {
      table[host] = {}
      for (const path of ['/', '/__wb/project', '/frame.html']) table[host]![path] = await status(host, path)
    }
    console.log(`[dev host] ${JSON.stringify(table)}`)
    const local = { '/': '200', '/__wb/project': '200', '/frame.html': '200' }
    expect(table[`localhost:${port}`]).toEqual(local)
    expect(table[`127.0.0.1:${port}`]).toEqual(local)
    expect(table[`[::1]:${port}`]).toEqual(local)
    expect(table.localhost).toEqual(local)
    expect(table[`evil.example:${port}`]).toEqual({ '/': '403', '/__wb/project': '403', '/frame.html': '403' })
  })

  it('/@fs 로 작성자 프로젝트 · 갤러리 클라이언트 밖(저장소 뿌리의 README)을 못 읽는다', async () => {
    const readme = await fetch(`${server.url.replace(/\/$/, '')}/@fs${join(repoRoot, 'README.md')}?raw`)
    const own = await fetch(`${server.url.replace(/\/$/, '')}/@fs${join(root, 'theme.config.ts')}?raw`)
    // 카나리아 — 프로젝트 안 파일은 읽힌다(이 판에서 /@fs 가 돈다).
    expect(own.status).toBe(200)
    expect(readme.status).toBe(403)
  })

  it('작성자 프로젝트가 워크스페이스 안에 있으면 hoist 된 node_modules 의 CSS 가 부르는 글꼴도 받는다', async () => {
    // A2 좁은 반증 2 — `fs.allow` 를 [갤러리 클라이언트, 작성자 프로젝트] 로 좁힌 판. 워크스페이스(pnpm · npm)는 의존을 뿌리의
    // `node_modules` 로 올리므로 `@fontsource/*` 같은 패키지의 CSS 가 부르는 글꼴 파일은 작성자 프로젝트 밖에 있다. vite 는 JS 가
    // import 한 모듈만 허용 목록 밖에서도 내주고, CSS `url()` 이 부르는 파일은 허용 목록으로만 판정한다 — 빌드(`wb-theme build`)는
    // 그 글꼴을 `assets/` 로 싣는데 dev 만 403 이다. 템플릿을 워크스페이스 안에 풀어 `@fontsource/inter` 를 쓴 판이 그 값이었다.
    const kit = (await import(/* @vite-ignore */ pathToFileURL(join(KIT, 'dist/index.js')).href)) as DistKit
    const workspace = mkdtempSync(join(TMP, 'workspace-'))
    writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'authors', private: true }))
    writeFileSync(join(workspace, 'pnpm-workspace.yaml'), "packages:\n  - 'themes/*'\n")
    const font = join(workspace, 'node_modules/wb-probe-font')
    mkdirSync(join(font, 'files'), { recursive: true })
    writeFileSync(join(font, 'package.json'), JSON.stringify({ name: 'wb-probe-font', version: '1.0.0' }))
    writeFileSync(join(font, 'index.css'), "@font-face { font-family: WbProbe; src: url(./files/probe.woff2) format('woff2'); }\n")
    writeFileSync(join(font, 'files/probe.woff2'), 'not a real font — only the status is read')
    const project = join(workspace, 'themes/probe')
    cpSync(FIXTURE, project, { recursive: true })
    const entry = join(project, 'src/index.tsx')
    writeFileSync(entry, `import 'wb-probe-font/index.css'\n${readFileSync(entry, 'utf8')}`)
    writeFileSync(
      join(project, 'src/theme.css'),
      `${readFileSync(join(project, 'src/theme.css'), 'utf8')}\n* { font-family: WbProbe, sans-serif; }\n`,
    )

    const other = await kit.startDev({ root: project, port: await freePort() })
    const probe = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const statuses = new Map<string, number>()
    probe.on('response', (response) => {
      const name = new URL(response.url()).pathname.split('/').pop()!
      if (name === 'probe.woff2' || name === 'index.css') statuses.set(name, response.status())
    })
    try {
      await probe.goto(other.url)
      // 카나리아 — 갤러리가 서고, 패키지의 CSS 가 실려 글꼴을 부른다(이 판에서 글꼴 요청이 난다).
      await expect
        .poll(
          () =>
            probe
              .frames()
              .find((f) => f.url().endsWith('/frame.html'))
              ?.evaluate(() => document.querySelectorAll('[data-wb-gallery-item]').length)
              .catch(() => 0) ?? 0,
          { timeout: 20_000 },
        )
        .toBeGreaterThan(0)
      await expect.poll(() => statuses.has('probe.woff2'), { timeout: 10_000 }).toBe(true)
      expect(statuses.get('index.css')).toBe(200)
      expect(statuses.get('probe.woff2')).toBe(200)
    } finally {
      await probe.close().catch(() => {})
      await other.close().catch(() => {})
    }
  })
})
