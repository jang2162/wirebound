/**
 * 테마 실브라우저 판(`theme-*.test.ts`)이 함께 쓰는 픽스처 — 한 판(`editor-stack.ts`) 위에 프로젝트 · 페이지 · 올린 테마를 세운다.
 *
 * 픽스처 테마는 kit 의 `sample-theme`(`packages/theme-kit/test/fixtures/sample-theme` — `sample@1.0.0`)를 **kit `buildTheme` 로 케이스
 * 안에서 짓는다** — 업로드가 받는 진짜 산출물이고, 그 `Card` 뷰가 «샘플 카드» 를 그려 SDK 기본 뷰와 갈린다(시스템 테마 `system-admin` 의
 * 첫 판은 뷰가 기본 뷰 그대로라 «테마 뷰로 그렸다» 를 못 가른다).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { systemThemeVersion } from '@wirebound/test-support/system-admin'
import { buildTheme } from '@wirebound/theme-kit'
import type { Page } from 'playwright-core'
import { canvasFrame, type EditorStack, type Session, type StackUser } from './editor-stack'

const SAMPLE_ROOT = fileURLToPath(new URL('../../../packages/theme-kit/test/fixtures/sample-theme/', import.meta.url))

/** `sample@1.0.0` 의 `.wbtheme` 바이트 — kit 으로 짓는다. */
export async function sampleTheme(): Promise<Uint8Array> {
  const outDir = mkdtempSync(join(tmpdir(), 'wb-browser-theme-'))
  try {
    const built = await buildTheme({ root: SAMPLE_ROOT, entry: 'src/index.tsx', outDir })
    return new Uint8Array(readFileSync(built.file))
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

/**
 * **실제 컨트롤을 그리는 테마**(`controls@1.0.0`) — `Button` 은 `<button>`, `Field` 는 `<input>` 을 그린다. SDK 기본 뷰는 입력을 `<div>` 로 그려 포커스 요소가 없어
 * (`packages/theme-sdk` 의 기본 뷰) 축소판의 `inert`(`src/palette/palette-thumbs.tsx`)가 «진짜 컨트롤» 에서도 서는지를 못 가른다. kit 의 `sample-theme` 를 복사해
 * 두 뷰만 바꿔 `buildTheme` 로 짓는다 — 업로드가 받는 진짜 산출물이다.
 */
export async function controlsTheme(): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'wb-controls-theme-'))
  try {
    cpSync(SAMPLE_ROOT, dir, { recursive: true })
    writeFileSync(
      join(dir, 'theme.config.ts'),
      `import { defineManifest } from '@wirebound/theme-sdk'
export default defineManifest({ id: 'controls', name: '컨트롤', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } })
`,
    )
    writeFileSync(
      join(dir, 'src/index.tsx'),
      `import { defineTheme, Root, view } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
const Button = view(({ props }) => <Root as="button">{String(props.label ?? '단추')}</Root>)
const Field = view(({ props }) => <Root as="div"><input type="text" aria-label="실제 입력" defaultValue={String(props.label ?? '')} /></Root>)
export default defineTheme({ manifest, views: { Button, Field } })
`,
    )
    const built = await buildTheme({ root: dir, entry: 'src/index.tsx', outDir: join(dir, 'out') })
    return new Uint8Array(readFileSync(built.file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 인스턴스 관리자로 만든다 — API 에는 그 길이 없다(spec 「인스턴스 관리자」). 이 판의 DB 에 직접 쓴다. */
export async function makeAdmin(stack: EditorStack, user: StackUser): Promise<void> {
  await stack.query('update users set is_instance_admin = true where email = $1', [user.email])
}

/** zip 바이트를 그대로 올린다(`POST /api/admin/theme-packages` — JSON 이 아니다). */
export async function uploadRaw(stack: EditorStack, session: Session, bytes: Uint8Array): Promise<number> {
  const response = await fetch(`${stack.apiUrl}/api/admin/theme-packages`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'content-type': 'application/zip' },
    // 사본을 Blob 으로 — `fetch` 의 본문 타입이 `ArrayBuffer` 를 쥔 뷰만 받는다.
    body: new Blob([new Uint8Array(bytes)]),
  })
  return response.status
}

type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

function created(response: { status: number; body: any }, what: string): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

/**
 * 프로젝트 하나 · 메뉴 하나 · 페이지 둘. 첫 페이지에는 글(`원문`)과 카드(`n_card000001`)를 둔다 — 카드가 테마 뷰(«샘플 카드»)와
 * 기본 뷰를 가른다. `bob` 을 주면 editor 로 들인다.
 */
export async function themeProject(
  stack: EditorStack,
  owner: Session,
  options: { bob?: boolean } = {},
): Promise<{ id: string; first: string; second: string; call: Call }> {
  const call: Call = (method, path, body) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '테마 판', slug: `theme-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }), '프로젝트')
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }), '메뉴')
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }), '첫째')
  const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }), '둘째')
  const seeded = await call('PATCH', `/projects/${project.id}/pages/${first.id}/ops`, {
    baseSeq: 0,
    ops: [
      { op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '원문' } } },
      { op: 'add', path: '/root/children/1', value: { id: 'n_card000001', type: 'Card', props: { title: '카드' } } },
    ],
  })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  const other = await call('PATCH', `/projects/${project.id}/pages/${second.id}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000002', type: 'Text', props: { content: '둘째 글' } } }],
  })
  if (other.status >= 300) throw new Error(`픽스처 ops ${other.status}`)
  if (options.bob === true) {
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status !== 201) throw new Error(`멤버 ${member.status} ${JSON.stringify(member.body)}`)
  }
  return { id: project.id, first: first.id, second: second.id, call }
}

/** 기동 시딩이 넣은 시스템 테마(`system-<이름>`)의 지금 판. 판은 글자로 적지 않는다 — 테마가 판을 올릴 때마다 케이스를 고치게 된다. */
export function seededVersion(themeId: string): string {
  return systemThemeVersion(themeId.replace(/^system-/, ''))
}

/** 프로젝트 테마를 API 로 저장한다 — 지금 `rev` 를 읽어 싣는다. */
export async function putTheme(call: Call, projectId: string, body: { themeId: string; version: string; tokens: Record<string, string | number> }): Promise<void> {
  const now = await call('GET', `/projects/${projectId}/theme`)
  const saved = await call('PUT', `/projects/${projectId}/theme`, { ...body, rev: now.body.rev })
  if (saved.status !== 200) throw new Error(`테마 저장 ${saved.status} ${JSON.stringify(saved.body)}`)
}

/** 캔버스 문서의 `:root` 에서 토큰 변수의 **계산값** — 시트의 겹침까지 지난 값이다. */
export async function canvasVar(page: Page, name: string): Promise<string> {
  const handle = await page.$('iframe.wb-shell-canvas-iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) return ''
  return frame.evaluate((variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name)
}

/** 캔버스 iframe 머리의 시트 차례 — `style:base` · `link:theme` · `style:tokens`. */
export async function canvasSheets(page: Page): Promise<string[]> {
  return canvasFrame(page)
    .locator('head [data-wb-style]')
    .evaluateAll((elements) => elements.map((el) => `${el.tagName.toLowerCase()}:${el.getAttribute('data-wb-style')}`))
}

/** 캔버스의 카드가 테마 뷰(«샘플 카드»)로 그려졌나. */
export async function sampleCard(page: Page): Promise<boolean> {
  return (await canvasFrame(page).locator('body', { hasText: '샘플 카드' }).count()) > 0
}

/** 이 탭이 낸 테마 파일 요청을 센다. */
export function countThemeFiles(page: Page): { js: () => number; css: () => number; lines: string[] } {
  const lines: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/files/theme.js') || url.includes('/files/theme.css')) lines.push(url.replace(/^.*\/api\/theme-packages\//, ''))
  })
  return {
    js: () => lines.filter((line) => line.endsWith('theme.js')).length,
    css: () => lines.filter((line) => line.endsWith('theme.css')).length,
    lines,
  }
}
