/**
 * **자리표시자의 그림 — 실브라우저 판**(설계서 §11.4 «그림» · 설계 spec `2026-10-24-compose-input-design.md` «9» · «10» · «11»).
 *
 * | 케이스 | 판 | 재는 값 |
 * |---|---|---|
 * | SVG 스크립트 | 스크립트가 든 SVG 를 캔버스의 `<img>` 로 · 주소를 탭으로 직접 연다 | 전역 표지 `__wbSvgRan`(호스트 · 캔버스 · 그 탭) · 응답 머리. 카나리아: 같은 바이트를 격리 머리 없이 낸 판에서는 돈다 |
 * | 캔버스 | 그 프로젝트의 그림 · 남의 프로젝트 그림의 해시 | `<img>` 의 `naturalWidth` · 남의 것은 «그림을 불러올 수 없음» 표지 |
 * | 번들 | 내보낸 zip 을 풀어 `file://` 로 연다 | zip 의 `assets/images/` 파일 · 크기 · 그 페이지의 `naturalWidth` · 남의 것은 표지 |
 * | PPTX | 번들 페이지를 찍은 화면 | 그 자리표시자 칸의 화소가 그림의 색이다 |
 * | 파일 놓기 | CDP `Input.dispatchDragEvent`(`files`)로 패널의 다른 자리 · 그림 칸에 놓는다 | 탭 수 · 주소 · 올리기 요청 수 |
 * | 붙여넣기의 출처 | 그림 든 노드를 복사해 다른 프로젝트에 붙인다 — 같은 컨텍스트의 다른 탭 · 같은 탭 · 남이 지은 글 · 한 글자 바꾼 글(빈 페이지의 `<textarea>` 에서 복사) | 가져오기 요청 수 · 붙인 뒤 `GET <받는 프로젝트>/assets/<id>` 의 상태(`edit/copy-marks.ts`) |
 *
 * 그림 바이트는 이 파일이 짓는다 — 앱끼리 서로의 소스를 부르지 않는다(`apps/api/test/asset-samples.ts` 와 같은 꼴의 작은 판).
 */
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage } from './layout-bundle'
import { decodePng } from './png-pixels'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}

/** 한 색 PNG(RGB 8비트). */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** 그림의 색 — 테마의 어느 색과도 안 겹치는 자홍. */
const MAGENTA: [number, number, number] = [255, 0, 255]
const PNG = solidPng(64, 40, MAGENTA)
const FOREIGN = solidPng(30, 20, [0, 200, 0])
const SVG = Buffer.from(
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" onload="window.__wbSvgRan = (window.__wbSvgRan || 0) + 1">' +
    '<script>window.__wbSvgRan = (window.__wbSvgRan || 0) + 1; try { parent.__wbSvgRan = 1 } catch (e) {}</script>' +
    '<rect width="120" height="80" fill="#2563eb"/></svg>',
  'utf8',
)

const NODES = [
  { id: 'n_img', type: 'Placeholder', props: { label: '그림', image: sha256(PNG), width: 240, height: 160 } },
  { id: 'n_svg', type: 'Placeholder', props: { label: 'SVG', image: sha256(SVG), width: 120, height: 80 } },
  { id: 'n_foreign', type: 'Placeholder', props: { label: '남의 것', image: sha256(FOREIGN), width: 120, height: 80 } },
]

async function upload(stack: EditorStack, session: Session, projectId: string, bytes: Buffer, type: string, name: string) {
  const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/assets`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'content-type': type, 'x-asset-name': encodeURIComponent(name) },
    body: new Uint8Array(bytes),
  })
  if (response.status >= 300) throw new Error(`그림 올리기 ${response.status} ${await response.text()}`)
  return response.json() as Promise<{ id: string }>
}

describe.skipIf(!전제.ok)('자리표시자의 그림 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let bob: Session
  let projectId = ''
  let pageId = ''
  let P = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    bob = await stack.login(stack.users.bob)
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '그림', slug: `img-${Date.now().toString(36)}` })).body
    projectId = project.id
    const menu = (await call('POST', `/projects/${projectId}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menu.id, title: '그림' })).body
    pageId = page.id
    P = `/projects/${projectId}/pages/${pageId}`
    await upload(stack, alice, projectId, PNG, 'image/png', '자홍.png')
    await upload(stack, alice, projectId, SVG, 'image/svg+xml', '스크립트.svg')
    // 남의 프로젝트(bob 의 것 · alice 는 멤버가 아니다)에만 있는 그림.
    const other = (await stack.request(bob, 'POST', '/projects', { name: '남', slug: `img-other-${Date.now().toString(36)}` })).body
    await upload(stack, bob, other.id, FOREIGN, 'image/png', '남.png')
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: NODES.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }, 120_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  /** 캔버스의 그림 셋 — 실린 뒤의 `naturalWidth` · 표지. */
  async function canvasImages(page: import('playwright-core').Page) {
    const frame = canvasFrame(page)
    await frame.locator('[data-wb-id="n_img"] > [data-wb-part="image"]').waitFor({ state: 'attached' })
    return poll(
      '캔버스 그림이 다 실림',
      () =>
        frame.locator('body').evaluate(() => {
          const one = (id: string) => {
            const root = document.querySelector(`[data-wb-id="${id}"]`)
            const img = root?.querySelector<HTMLImageElement>(':scope > [data-wb-part="image"]') ?? null
            return {
              complete: img === null ? true : img.complete,
              naturalWidth: img?.naturalWidth ?? null,
              missing: root?.querySelector(':scope > [data-wb-part="image-missing"]')?.textContent ?? null,
            }
          }
          return { img: one('n_img'), svg: one('n_svg'), foreign: one('n_foreign') }
        }),
      (got) => got.img.complete && got.svg.complete && got.foreign.missing !== null,
      15_000,
    )
  }

  it('캔버스 — 그 프로젝트의 그림은 실리고(naturalWidth) · 남의 프로젝트 그림의 해시는 «그림을 불러올 수 없음» · SVG 의 스크립트는 안 돈다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      const got = await canvasImages(page)
      // viewBox 만 든 SVG 의 원래 크기는 Chrome 이 기본 300×150 에 맞춰 정한다(225) — 실렸는지만 본다.
      expect({ ...got, svg: { ...got.svg, naturalWidth: (got.svg.naturalWidth ?? 0) > 0 } }).toEqual({
        img: { complete: true, naturalWidth: 64, missing: null },
        svg: { complete: true, naturalWidth: true, missing: null },
        foreign: { complete: true, naturalWidth: null, missing: '그림을 불러올 수 없음' },
      })
      await sleep(300)
      const ran = {
        host: await page.evaluate(() => (window as { __wbSvgRan?: number }).__wbSvgRan ?? 0),
        canvas: await canvasFrame(page)
          .locator('body')
          .evaluate(() => (window as { __wbSvgRan?: number }).__wbSvgRan ?? 0),
      }
      expect(ran).toEqual({ host: 0, canvas: 0 })
    } finally {
      await context.close()
    }
  }, 60_000)

  it('SVG 주소를 탭으로 직접 열어도 스크립트가 안 돈다 — 격리 머리 · 카나리아: 머리 없이 낸 같은 바이트는 돈다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 800, height: 600 } })
    try {
      const url = `/api/projects/${projectId}/assets/${sha256(SVG)}`
      const response = await page.goto(url)
      const headers = response!.headers()
      expect({
        status: response!.status(),
        type: headers['content-type'],
        csp: headers['content-security-policy'],
        nosniff: headers['x-content-type-options'],
        corp: headers['cross-origin-resource-policy'],
      }).toEqual({
        status: 200,
        type: 'image/svg+xml',
        csp: "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        nosniff: 'nosniff',
        corp: 'same-origin',
      })
      await sleep(300)
      const opened = await page.evaluate(() => (window as { __wbSvgRan?: number }).__wbSvgRan ?? 0)
      // 카나리아 — 같은 origin 의 다른 주소에서 같은 바이트를 격리 머리 없이 내면 스크립트가 돈다(이 판이 «도는 것» 을 볼 수 있다).
      const bare = `/api/projects/${projectId}/assets/bare-canary.svg`
      await page.route(`**${bare}`, (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }))
      await page.goto(bare)
      await sleep(300)
      const canary = await page.evaluate(() => (window as { __wbSvgRan?: number }).__wbSvgRan ?? 0)
      expect({ opened, canary: canary > 0 }).toEqual({ opened: 0, canary: true })
    } finally {
      await context.close()
    }
  }, 60_000)

  it('번들 — zip 에 그 프로젝트의 그림만 · 파일로 연 페이지의 그림이 실린다 · 남의 것은 표지 · SVG 의 스크립트는 안 돈다', async () => {
    const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=html`, { headers: { cookie: alice.cookie } })
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const images = Object.entries(entries)
      .filter(([path]) => path.includes('/assets/images/'))
      .map(([path, bytes]) => [path.split('/assets/images/')[1], bytes.length])
      .sort()
    expect(images).toEqual(
      [
        [`${sha256(PNG)}.png`, PNG.length],
        [`${sha256(SVG)}.svg`, SVG.length],
      ].sort(),
    )
    const bundle = await exportBundle(stack, alice, projectId)
    try {
      const file = Object.values(bundle.pages)[0]!
      const { context, page } = await openBundlePage(stack, file, { viewport: { width: 1440, height: 900 } })
      try {
        const got = await page.evaluate(() => {
          const one = (id: string) => {
            const root = document.querySelector(`.wb-export-canvas [data-wb-id="${id}"]`)
            const img = root?.querySelector<HTMLImageElement>(':scope > [data-wb-part="image"]') ?? null
            return {
              src: img?.getAttribute('src') ?? null,
              naturalWidth: img?.naturalWidth ?? null,
              missing: root?.querySelector(':scope > [data-wb-part="image-missing"]')?.textContent ?? null,
            }
          }
          return {
            img: one('n_img'),
            svg: one('n_svg'),
            foreign: one('n_foreign'),
            ran: (window as { __wbSvgRan?: number }).__wbSvgRan ?? 0,
          }
        })
        expect({ ...got, svg: { ...got.svg, naturalWidth: (got.svg.naturalWidth ?? 0) > 0 } }).toEqual({
          img: { src: `../assets/images/${sha256(PNG)}.png`, naturalWidth: 64, missing: null },
          svg: { src: `../assets/images/${sha256(SVG)}.svg`, naturalWidth: true, missing: null },
          foreign: { src: null, naturalWidth: null, missing: '그림을 불러올 수 없음' },
          ran: 0,
        })
      } finally {
        await context.close()
      }
    } finally {
      bundle.dispose()
    }
  }, 90_000)

  it('PPTX — 화면 이미지의 그 자리표시자 칸이 그림의 색이다', async () => {
    const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=pptx`, { headers: { cookie: alice.cookie } })
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const shots = Object.entries(entries).filter(([path]) => path.startsWith('ppt/media/') && path.endsWith('.png'))
    expect(shots.length).toBe(1)
    const pixels = decodePng(Buffer.from(shots[0]![1]))
    let magenta = 0
    for (let y = 0; y < pixels.height; y += 2)
      for (let x = 0; x < pixels.width; x += 2) {
        const [r, g, b] = pixels.at(x, y)
        if (r > 240 && g < 20 && b > 240) magenta += 1
      }
    // 칸 240×160 CSS px · 기기 배율 2 · 두 칸마다 하나 센다 — 칸이 다 그림이면 약 240×160 개다. 테두리 · 둥근 모서리를 뺀 절반을 하한으로 둔다.
    expect(magenta).toBeGreaterThan((240 * 160) / 2)
  }, 120_000)

  /** alice 의 새 프로젝트 — 페이지 하나 · 글 하나. 붙인 그림을 이 프로젝트가 가졌는지(`GET …/assets/<id>`)로 가져오기를 잰다. */
  async function receiver(name: string): Promise<{ projectId: string; P: string }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (
      await call('POST', '/projects', { name, slug: `img-to-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` })
    ).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '받는 곳' })).body
    const to = `/projects/${project.id}/pages/${page.id}`
    const seeded = await call('PATCH', `${to}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text_to', type: 'Text', props: { content: '받는 페이지' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { projectId: project.id, P: to }
  }

  /** 그 탭에서 그림 노드(`n_img`)를 골라 복사한다 — 클립보드에 실린 글을 캔버스 창의 `copy` 리스너로 받아 돌려준다. */
  async function copyImageNode(page: import('playwright-core').Page): Promise<string> {
    await page.goto(P)
    const node = canvasFrame(page).locator('[data-wb-id="n_img"]')
    await node.waitFor({ state: 'attached' })
    await canvasFrame(page)
      .locator('body')
      .evaluate(() => {
        ;(window as unknown as { __copied: string[] }).__copied = []
        window.addEventListener('copy', (event) =>
          (window as unknown as { __copied: string[] }).__copied.push(event.clipboardData?.getData('text/plain') ?? ''),
        )
      })
    await node.click()
    await page.keyboard.press('ControlOrMeta+c')
    return poll(
      '복사한 글',
      () =>
        canvasFrame(page)
          .locator('body')
          .evaluate(() => (window as unknown as { __copied: string[] }).__copied.slice()),
      (copied) => copied.length > 0,
      5_000,
    ).then((copied) => copied[0]!)
  }

  /** 글을 빈 페이지의 `<textarea>` 에서 골라 복사한다 — 남이 보낸 글을 사람이 복사한 판. */
  async function copyText(context: import('playwright-core').BrowserContext, text: string): Promise<void> {
    const page = await context.newPage()
    await page.setContent('<textarea id="t"></textarea>')
    await page.fill('#t', text)
    await page.focus('#t')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+c')
    await page.close()
  }

  /** 받는 페이지를 열고 붙인다 — 붙인 노드가 서버에 닿을 때까지 기다리고, 그 노드의 그림 id 와 그 그림을 받는 프로젝트에서 읽은 상태를 준다. */
  async function pasteInto(page: import('playwright-core').Page, to: { projectId: string; P: string }) {
    await page.goto(to.P)
    await canvasFrame(page).locator('[data-wb-id="n_text_to"]').waitFor({ state: 'attached' })
    await canvasFrame(page)
      .locator('body')
      .click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('ControlOrMeta+v')
    const children = await poll(
      '붙인 노드가 서버에 닿는다',
      async () => ((await stack.request(alice, 'GET', to.P)).body.schema.root.children ?? []) as { props?: { image?: string } }[],
      (nodes) => nodes.length === 2,
    )
    const image = children[1]!.props?.image ?? null
    return { image, asset: (await stack.request(alice, 'GET', `/projects/${to.projectId}/assets/${sha256(PNG)}`)).status }
  }

  function countClaims(context: import('playwright-core').BrowserContext): { readonly n: number } {
    const counter = { n: 0 }
    context.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/assets/claim')) counter.n += 1
    })
    return counter
  }

  it('붙여넣기의 출처 — 같은 브라우저의 다른 탭 · 같은 탭에서 낸 복사는 다른 프로젝트에 붙일 때 그림을 가져온다', async () => {
    const otherTab = await receiver('다른 탭')
    const sameTab = await receiver('같은 탭')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const claims = countClaims(context)
    try {
      await copyImageNode(page)
      const second = await context.newPage()
      const viaOtherTab = { ...(await pasteInto(second, otherTab)), claims: claims.n }
      await copyImageNode(page)
      const viaSameTab = { ...(await pasteInto(page, sameTab)), claims: claims.n }
      expect({ viaOtherTab, viaSameTab }).toEqual({
        viaOtherTab: { image: sha256(PNG), asset: 200, claims: 1 },
        viaSameTab: { image: sha256(PNG), asset: 200, claims: 2 },
      })
    } finally {
      await context.close()
    }
  }, 90_000)

  it('붙여넣기의 출처 — 남이 지은 글 · 이 브라우저의 복사를 한 글자 바꾼 글은 출처가 다른 프로젝트여도 그림을 가져오지 않는다', async () => {
    const composedTo = await receiver('지은 글')
    const alteredTo = await receiver('바꾼 글')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const claims = countClaims(context)
    try {
      const real = await copyImageNode(page)
      const { version } = JSON.parse(real) as { version: number }
      // 남이 지은 글 — 출처는 그림을 가진 프로젝트, 노드는 그 그림의 해시(리뷰 RV-CI-B H1 의 재현 꼴).
      const composed = JSON.stringify({
        wirebound: 'nodes',
        version,
        source: { projectId },
        nodes: [{ id: 'n_forged', type: 'Placeholder', props: { label: '지은 것', image: sha256(PNG) } }],
      })
      await copyText(context, composed)
      const viaComposed = { ...(await pasteInto(page, composedTo)), claims: claims.n }
      const altered = real.replace('"그림"', '"그린"')
      await copyText(context, altered)
      const viaAltered = { ...(await pasteInto(page, alteredTo)), claims: claims.n }
      // 카나리아 — 바꾼 글이 실제로 바뀌었고, 두 붙이기가 그림 id 를 든 노드로 닿았다(가져오기만 안 했다).
      expect({ changed: altered !== real, viaComposed, viaAltered }).toEqual({
        changed: true,
        viaComposed: { image: sha256(PNG), asset: 404, claims: 0 },
        viaAltered: { image: sha256(PNG), asset: 404, claims: 0 },
      })
    } finally {
      await context.close()
    }
  }, 90_000)

  it('파일 놓기 — 패널의 다른 자리에 놓은 파일은 브라우저가 열지 않는다 · 그림 칸에 놓은 파일은 올린다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const dir = await mkdtemp(join(tmpdir(), 'wb-img-drop-'))
    const file = join(dir, 'dropped.png')
    await writeFile(file, solidPng(10, 10, [10, 20, 30]))
    let uploads = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/projects\/[^/]+\/assets$/.test(new URL(request.url()).pathname)) uploads += 1
    })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_img"]').waitFor({ state: 'attached' })
      await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]').first().waitFor({ state: 'attached' })
      await page
        .getByRole('region', { name: '구조 트리' })
        .getByRole('button', { name: /^Placeholder/ })
        .first()
        .click()
      const field = page.getByRole('group', { name: '그림' })
      await field.waitFor()
      const cdp = await context.newCDPSession(page)
      const drop = async (x: number, y: number) => {
        const data = { items: [], files: [file], dragOperationsMask: 1 }
        await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
        await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
        await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data })
        await sleep(500)
      }
      const centre = async (locator: import('playwright-core').Locator) => {
        const box = (await locator.boundingBox())!
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      const url = page.url()
      const label = await centre(page.getByRole('complementary', { name: '우측 패널' }).getByRole('textbox', { name: /라벨/ }))
      await drop(label.x, label.y)
      const elsewhere = { tabs: context.pages().length, sameUrl: page.url() === url, uploads }
      const zone = await centre(field)
      await drop(zone.x, zone.y)
      await poll(
        '올리기 요청',
        async () => uploads,
        (n) => n > 0,
        5_000,
      ).catch(() => uploads)
      expect({ elsewhere, onField: { tabs: context.pages().length, sameUrl: page.url() === url, uploads } }).toEqual({
        elsewhere: { tabs: 1, sameUrl: true, uploads: 0 },
        onField: { tabs: 1, sameUrl: true, uploads: 1 },
      })
    } finally {
      await context.close()
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
