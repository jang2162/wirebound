// @vitest-environment node
// **node 환경이다** — 아래 절이 `vite.config.ts` 로 진짜 dev 서버를 띄운다(`api-proxy-target.test.ts` 머리말과 같은 까닭: jsdom 안에서는
// `@vitejs/plugin-react` 를 싣다 죽는다).
/**
 * **`public/llms.txt` 는 생성물이다 — 정의에서 다시 지은 글과 바이트로 같아야 한다.** 짓는 자리는 `config/llms-txt.ts` 의 `renderLlmsTxt`
 * (머리말에 무엇을 정의에서 읽는지가 있다). vite 가 `public/` 을 개발 서버에서 `/llms.txt` 로 내고 빌드에서 `dist/` 로 옮기며, 운영 입구
 * (`docker/web/Caddyfile`)가 그 `dist/` 를 파일로 낸다 — 두 판이 같은 파일을 낸다. 운영 판(이미지 · compose)은 여기서 안 잰다 —
 * `docs/guides/deploy-docker.md` 「잰 값」.
 *
 * 카탈로그 · 노드 필드 · MCP 도구를 바꾸면 첫 케이스가 죽는다. 다시 지으려면:
 *
 *   pnpm vitest run apps/web/test/llms-txt.test.ts -u
 *
 * **파일이 없으면 vitest 가 새로 쓰고 초록이다**(새 스냅샷 — `CI` 에서만 죽는다). 그래서 «있다» 를 따로 단언한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderLlmsTxt } from '../config/llms-txt'

const FILE = fileURLToPath(new URL('../public/llms.txt', import.meta.url))
const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url))

it('public/llms.txt 가 정의에서 지은 글과 같다', async () => {
  expect(existsSync(FILE)).toBe(true)
  await expect(renderLlmsTxt()).toMatchFileSnapshot('../public/llms.txt')
})

describe('개발 서버가 /llms.txt 로 그 파일을 낸다', () => {
  let server: ViteDevServer
  let status = 0
  let contentType: string | null = null
  let body = ''

  beforeAll(async () => {
    server = await createServer({
      root: WEB_ROOT,
      configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
      logLevel: 'error',
      server: { port: 0, strictPort: false },
      // 모듈을 하나도 요청하지 않는다 — 스캐너가 배경에서 `index.html` 을 훑다 `close()` 와 겹치지 않게 끈다(`api-proxy-target.test.ts` 와 같다).
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    await server.listen()
    const address = server.httpServer?.address() as AddressInfo
    const host = address.family === 'IPv6' ? `[${address.address}]` : address.address
    const response = await fetch(`http://${host}:${address.port}/llms.txt`, { signal: AbortSignal.timeout(10_000) })
    status = response.status
    contentType = response.headers.get('content-type')
    body = await response.text()
  }, 30_000)

  afterAll(async () => {
    await server?.close()
  })

  it('200 · text/plain · 파일과 같은 글 — 깊은 링크처럼 index.html 로 돌아가지 않는다', () => {
    expect(status).toBe(200)
    expect(contentType).toMatch(/^text\/plain/)
    expect(body).toBe(readFileSync(FILE, 'utf8'))
  })
})
