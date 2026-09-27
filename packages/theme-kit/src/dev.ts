import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createServer, searchForWorkspaceRoot, type Plugin } from 'vite'
import { EVENTS_PATH, PROJECT_PATH, type ProjectState } from './client/protocol'
import { CONFIG_FILE, DEFAULT_ENTRY, loadProject } from './config'

export interface DevServer {
  url: string
  close(): Promise<void>
}

/** 미리 빌드한 갤러리 클라이언트(`vite.client.config.ts`). 이 파일이 든 `dist/` 옆에 산다. */
function clientDir(): string {
  const dir = fileURLToPath(new URL('./client/', import.meta.url))
  if (!existsSync(join(dir, 'shell.js'))) {
    throw new Error(`갤러리 클라이언트가 없습니다(${dir}) — theme-kit 을 빌드하세요(pnpm --filter @wirebound/theme-kit build)`)
  }
  return dir
}

/**
 * 로컬 이름으로 온 요청인가 — `localhost` · `127.0.0.1` · `[::1]`(포트가 붙어도). 셸 미들웨어는 vite 의 Host 검사보다 먼저 걸리므로
 * 스스로 본다. 안 보면 DNS 재바인딩으로 남의 페이지가 같은 출처가 되어 `/__wb/project`(manifest · 설정 이슈)와 SSE 를 읽는다.
 * 이 판정은 vite 가 `/frame.html` · `/@fs/…` 에 내리는 판정보다 좁다 — `*.localhost` · IP 꼴(`127.0.0.2` · `[0:0::1]`)은 셸만 403
 * 이고, 대문자(`LOCALHOST`)는 셸만 받는다(브라우저는 Host 를 소문자로 보낸다).
 */
function isLocalHost(header: string | undefined): boolean {
  if (header === undefined) return false
  const host = header.toLowerCase().replace(/:\d+$/, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/**
 * 셸 페이지(`/`)는 vite 를 거치지 않고 내준다 — vite 의 HTML 변환이 HMR 클라이언트를 심으면, 뷰를 고쳐 프레임이 다시 실릴 때
 * 오는 `full-reload` 가 셸까지 다시 싣고 토큰 패널의 값이 날아간다. 셸은 SSE(`/__wb/events`)로 설정의 이슈만 받는다.
 * 프레임(`/frame.html`)은 vite 가 내준다 — 작성자 코드의 HMR 이 거기서 돈다.
 */
function devPlugin(opts: { root: string; entry: string; clientDir: string }): Plugin {
  const configPath = join(opts.root, CONFIG_FILE)
  const clients = new Set<ServerResponse>()
  let state: ProjectState = { manifest: null, issues: [] }

  const reload = async (): Promise<void> => {
    try {
      const { project, issues } = await loadProject(opts.root, opts.entry)
      // 설정이 틀린 동안에도 토큰 패널이 비지 않게 마지막으로 지난 manifest 를 둔다.
      state = { manifest: project?.manifest ?? state.manifest, issues }
    } catch (error) {
      state = { manifest: state.manifest, issues: [{ code: 'config', path: CONFIG_FILE, message: (error as Error).message }] }
    }
    const frame = `data: ${JSON.stringify(state)}\n\n`
    for (const client of clients) client.write(frame)
  }

  return {
    name: 'wb-theme-dev',
    async configureServer(server) {
      await reload()
      server.watcher.add(configPath)
      server.watcher.on('change', (file) => {
        if (resolve(file) === configPath) void reload()
      })
      const shellHtml = readFileSync(join(opts.clientDir, 'index.html'), 'utf8')
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const path = (req.url ?? '/').split('?')[0]
        const ours = path === '/' || path === '/index.html' || path === PROJECT_PATH || path === EVENTS_PATH
        if (ours && !isLocalHost(req.headers.host)) {
          res.statusCode = 403
          res.end('로컬 이름(localhost · 127.0.0.1 · [::1])으로만 엽니다')
        } else if (path === '/' || path === '/index.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(shellHtml)
        } else if (path === PROJECT_PATH) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(state))
        } else if (path === EVENTS_PATH) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
          res.write(': wb\n\n')
          clients.add(res)
          req.on('close', () => clients.delete(res))
        } else {
          next()
        }
      })
      server.httpServer?.on('close', () => {
        for (const client of clients) client.end()
        clients.clear()
      })
    },
  }
}

/** `wb-theme dev` — 갤러리 · 토큰 패널 · 뷰포트 프리셋 · 겹쳐 보기(spec 「`wb-theme dev`」). */
export async function startDev(opts: { root: string; entry?: string; port?: number; host?: string }): Promise<DevServer> {
  const root = resolve(opts.root)
  const entry = resolve(root, opts.entry ?? DEFAULT_ENTRY)
  if (!existsSync(entry)) throw new Error(`진입 파일이 없습니다: ${entry}`)
  const client = clientDir()
  const server = await createServer({
    root: client,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    // 의존 사전 번들 캐시는 작성자 프로젝트에 둔다 — 클라이언트 디렉터리는 설치된 패키지 안이다.
    cacheDir: join(root, 'node_modules', '.vite-wb-theme'),
    // react 새로 고침은 작성자 코드에만 — 미리 빌드한 클라이언트는 새로 고칠 컴포넌트가 아니다.
    plugins: [react({ exclude: [/\/node_modules\//, new RegExp(`^${escapeRegExp(client)}`)] }), devPlugin({ root, entry, clientDir: client })],
    resolve: {
      alias: { 'virtual:wb-theme-entry': entry },
      // 작성자의 뷰 · 갤러리 클라이언트 · SDK 가 react 와 SDK 를 한 벌 나눠 쓰게(클라이언트 빌드가 둘을 밖에 둔 까닭).
      dedupe: ['react', 'react-dom', '@wirebound/theme-sdk'],
    },
    optimizeDeps: {
      entries: ['frame.html', 'shell.js'],
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    server: {
      port: opts.port ?? 5190,
      host: opts.host ?? '127.0.0.1',
      // 갤러리 클라이언트 · 작성자 프로젝트 · 그 프로젝트가 든 워크스페이스 뿌리의 `node_modules`. 워크스페이스 뿌리 전체를 열면
      // 작성자 프로젝트가 큰 워크스페이스 안에 있을 때 그 워크스페이스 전체(README · 다른 패키지 소스)가 `/@fs` 로 읽힌다. 뿌리의
      // `node_modules` 는 연다 — pnpm(`.pnpm`) · npm 워크스페이스가 의존을 거기로 올리고, 그 패키지의 CSS 가 `url()` 로 부르는
      // 글꼴 · 이미지를 dev 가 403 으로 막으면 build 에는 실리는 글꼴이 갤러리에서만 안 보인다. `build-test/dev.test.ts` 가
      // README(밖) · pnpm 워크스페이스의 글꼴(안)을 잰다 — npm 워크스페이스 판은 케이스가 없다(`docs/superpowers/plans/2026-09-27-a2-fix-report.md` 의 탐침).
      fs: { allow: [client, root, join(searchForWorkspaceRoot(root), 'node_modules')] },
    },
  })
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) {
    await server.close()
    throw new Error('dev 서버의 주소를 얻지 못했습니다')
  }
  return { url, close: () => server.close() }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
