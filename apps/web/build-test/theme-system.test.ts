/**
 * **시스템 테마 다섯을 설정 페이지에서 골라 쓴다** — 실브라우저 판(`settings/theme-chooser.tsx` · 캔버스 · 내보낸 번들).
 *
 * | 케이스 | 재는 성질 | 값 |
 * |---|---|---|
 * | 다섯 차례로 | 설정 페이지의 고르개 · 확인 · «바꾸기» 로 테마를 바꾸면 캔버스와 내보낸 번들이 **그 테마로** 선다 · 확인 상자의 수가 impact 응답과 같다 | 테마 표지(아래) · 확인 줄 |
 * | 0.1.0 → 지금 판 | `system-admin@0.1.0` 에 고정한 프로젝트를 설정 페이지에서 올릴 때 확인 상자의 토큰 이전 · 없는 variant 수가 impact 응답과 같고, 올린 뒤 고친 토큰이 이어진다 | 확인 줄 · 목록 · 저장된 바인딩 |
 *
 * **테마 표지는 주 단추(`Button` `primary`)의 바탕색이다** — 다섯 테마의 `theme.css` 가 저마다의 규칙으로 그 단추를 `var(--wb-semantic-primary)`
 * 로 칠하고, 그 토큰의 기본값이 테마마다 다르다(기대값은 그 판의 manifest 에서 읽는다 — 색을 글자로 적지 않는다). SDK 기본 뷰의 CSS 는 단추에
 * 바탕을 안 준다 — 테마 시트가 안 실리면(번들 적재 실패는 시트도 걷는다) 표지가 선다는 길이 없다. 다섯 값이 서로 다른지를 먼저 본다.
 *
 * 같은 설계서를 다섯 테마로 그렸을 때 깨지지 않는가(세로 Divider · 좁은 폭 · 캔버스 = 번들 · PPTX 폭 · 토큰 칸)는
 * `theme-system-review.test.ts` 가 잰다 — 여기서 다시 세우지 않는다. 캔버스가 판의 번들 · 시트를 싣는 차례 · 캐시 · `theme-changed` 따라가기는
 * `theme-canvas.test.ts`, 토큰 편집기는 `theme-settings.test.ts` 다.
 *
 * **`0.1.0` 판은 저장소에 얼린 산출물이다**(`fixtures/system-admin-0.1.0.wbtheme`) — 저장소 빌드는 지금 판만 내고, 사용자 DB 에는
 * `0.1.0` 이 시딩돼 있다. 이 파일은 admin 트랙 병합 전 소스(`git archive 29bc91b7 system-themes/admin`)를 지금 kit 으로 지은 것이고, 케이스가
 * 그 sha256 이 `system-themes/admin/checksums.json` 의 `system-admin@0.1.0` 줄과 같은지 먼저 본다 — 다르면 사용자 DB 의 판이 아니다.
 * 판 DB 에는 기동 시딩과 같은 행 꼴로 넣는다(관리자 업로드는 `system-` 접두어를 거절한다).
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import type { Frame, Page } from 'playwright-core'
import { readWbtheme } from '@wirebound/themes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 고르는 차례 — 새 프로젝트가 `system-admin` 으로 서므로 admin 을 끝에 둔다(다섯 모두 고르개로 고른다). */
const ORDER = ['system-commerce', 'system-docs', 'system-portal', 'system-saas-marketing', 'system-admin'] as const

const OLD_ADMIN = fileURLToPath(new URL('./fixtures/system-admin-0.1.0.wbtheme', import.meta.url))
const ADMIN_CHECKSUMS = fileURLToPath(new URL('../../../system-themes/admin/checksums.json', import.meta.url))

type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

function ok(response: { status: number; body: any }, what: string): any {
  if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

/** 프로젝트 하나 · 메뉴 하나 · 페이지들(제목 → 노드). 페이지 id 를 제목으로 낸다. */
async function project(
  stack: EditorStack,
  owner: Session,
  pages: Record<string, unknown[]>,
): Promise<{ id: string; call: Call; pages: Record<string, string> }> {
  const call: Call = (method, path, body) => stack.request(owner, method, path, body)
  const made = ok(
    await call('POST', '/projects', {
      name: '테마 고르기',
      slug: `sys-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    }),
    '프로젝트',
  )
  const menu = ok(await call('POST', `/projects/${made.id}/menu`, { parentId: null, title: '화면' }), '메뉴')
  const ids: Record<string, string> = {}
  for (const [title, nodes] of Object.entries(pages)) {
    const page = ok(await call('POST', `/projects/${made.id}/pages`, { menuNodeId: menu.id, title }), title)
    ok(
      await call('PATCH', `/projects/${made.id}/pages/${page.id}/ops`, {
        baseSeq: 0,
        ops: nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value })),
      }),
      `ops ${title}`,
    )
    ids[title] = page.id
  }
  return { id: made.id, call, pages: ids }
}

/** `#rrggbb` → 계산 스타일의 꼴 `rgb(r, g, b)`. */
function rgb(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (m === null) throw new Error(`주색 기본값이 #rrggbb 가 아니다: ${hex}`)
  return `rgb(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)})`
}

/** 표지 — 주 단추의 계산 바탕색. `scope` 는 문서 뿌리를 찾는 셀렉터 접두(캔버스 `''` · 번들 `'.wb-export-canvas '`). */
const MARK = `(scope) => {
  const button = document.querySelector(scope + '[data-wb-id="m_btn"]')
  return button === null ? '단추 없음' : getComputedStyle(button).backgroundColor
}`

/** 설정 페이지의 확인 상자 — 확인 줄과 «없는 variant» 목록. 준비(manifest · impact 읽기)가 끝난 뒤에 읽는다. */
async function confirmBox(page: Page): Promise<{ tokens: { kept: number; dropped: number; defaulted: number }; variants: string[] }> {
  const box = page.getByRole('group', { name: '테마 바꾸기 확인' })
  const line = box.locator('.wb-shell-settings-confirm-line')
  await line.waitFor()
  const m = /^이어짐 (\d+) · 버려짐 (\d+) · 기본값 (\d+)$/.exec((await line.textContent()) ?? '')
  if (m === null) throw new Error(`확인 줄의 꼴이 다르다: ${await line.textContent()}`)
  const items = box.getByRole('list', { name: '없는 variant 를 쓰는 페이지' }).getByRole('listitem')
  return { tokens: { kept: Number(m[1]), dropped: Number(m[2]), defaulted: Number(m[3]) }, variants: await items.allTextContents() }
}

/** impact 응답을 확인 상자와 같은 꼴로. */
function impactAsBox(impact: {
  tokens: { kept: number; dropped: number; defaulted: number }
  variants: { title: string; count: number }[]
}) {
  return { tokens: impact.tokens, variants: impact.variants.map((v) => `${v.title} — 없는 variant ${v.count}개`) }
}

/** «바꾸기» 를 누르고 저장을 기다린다. */
async function apply(page: Page): Promise<void> {
  await page.getByRole('group', { name: '테마 바꾸기 확인' }).getByRole('button', { name: '바꾸기' }).click()
  await page.getByRole('status').filter({ hasText: '테마를 바꿨습니다' }).waitFor()
}

/** 에디터에서 그 페이지를 열고 캔버스 문서를 낸다 — 테마 시트가 실린 뒤. */
async function openCanvas(page: Page, projectId: string, pageId: string): Promise<Frame> {
  await page.goto(`/projects/${projectId}/pages/${pageId}`)
  const frame = (await (await page.waitForSelector('iframe.wb-shell-canvas-iframe')).contentFrame())!
  await frame.waitForSelector('[data-wb-id="m_btn"]', { state: 'attached' })
  await frame.waitForFunction(() =>
    [...document.querySelectorAll('link[data-wb-style="theme"]')].every((l) => (l as HTMLLinkElement).sheet !== null),
  )
  return frame
}

const unpacked: string[] = []

/** 내보낸 zip 을 풀어 `pages/<메뉴>-<제목>.html` 을 `file://` 로 열고 준비(`data-wb-ready`)를 기다린다. */
async function openBundle(
  stack: EditorStack,
  session: Session,
  projectId: string,
  title: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=html`, { headers: { cookie: session.cookie } })
  if (response.status !== 200) throw new Error(`내보내기 ${response.status}`)
  const dir = mkdtempSync(join(tmpdir(), 'wb-system-bundle-'))
  unpacked.push(dir)
  let file: string | undefined
  for (const [path, bytes] of Object.entries(unzipSync(new Uint8Array(await response.arrayBuffer())))) {
    if (path.endsWith('/')) continue
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), bytes)
    if (path.endsWith(`/pages/화면-${title}.html`)) file = join(dir, path)
  }
  if (file === undefined) throw new Error(`번들에 «${title}» 페이지가 없다`)
  const context = await stack.browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()
  await page.goto(pathToFileURL(file).href)
  await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
  return { page, close: () => context.close() }
}

describe.skipIf(!전제.ok)('시스템 테마 다섯 — 설정 페이지에서 고르기', () => {
  let stack: EditorStack
  let alice: Session
  /** 테마 → 표지의 기대값(그 판 manifest 의 `semantic.primary` 기본값). */
  const expected = new Map<string, string>()
  let fixture: { id: string; call: Call; pages: Record<string, string> }

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    fixture = await project(stack, alice, {
      화면: [
        { id: 'm_head', type: 'Text', props: { content: '주문 관리', role: 'h1' } },
        { id: 'm_btn', type: 'Button', variant: 'primary', props: { label: '주문 등록' } },
        {
          id: 'm_card',
          type: 'Card',
          props: { title: '오늘 주문' },
          children: [{ id: 'm_card_t', type: 'Text', props: { content: '128건' } }],
        },
      ],
    })
    for (const themeId of ORDER) {
      const manifest = ok(await fixture.call('GET', `/theme-packages/${themeId}/${seededVersion(themeId)}/manifest`), `manifest ${themeId}`)
      expected.set(themeId, rgb(manifest.tokens.items['semantic.primary'].default))
    }
  }, 180_000)

  afterAll(async () => {
    for (const dir of unpacked) rmSync(dir, { recursive: true, force: true })
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  it('표지 다섯이 서로 다르다 — 한 값이 두 테마를 가리키면 표지가 테마를 못 가른다', () => {
    expect(expected.size).toBe(5)
    expect(new Set(expected.values()).size).toBe(5)
  })

  it.each(ORDER)(
    '%s — 설정 페이지에서 고르면 확인 상자가 impact 와 같고, 캔버스 · 번들이 그 테마로 선다',
    async (themeId) => {
      const before = ok(await fixture.call('GET', `/projects/${fixture.id}/theme`), '바인딩')
      expect(before.themeId).not.toBe(themeId)
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 1000 } })
      try {
        await page.goto(`/projects/${fixture.id}/settings?section=theme`)
        await page.getByRole('combobox', { name: '테마', exact: true }).selectOption(themeId)
        const box = await confirmBox(page)
        const impact = ok(
          await fixture.call('GET', `/projects/${fixture.id}/theme/impact?themeId=${themeId}&version=${seededVersion(themeId)}`),
          'impact',
        )
        expect(box).toEqual(impactAsBox(impact))
        await apply(page)
        const saved = ok(await fixture.call('GET', `/projects/${fixture.id}/theme`), '바인딩')
        expect({ themeId: saved.themeId, version: saved.version }).toEqual({ themeId, version: seededVersion(themeId) })

        const frame = await openCanvas(page, fixture.id, fixture.pages.화면!)
        // 기다림이 끝나도 값으로 단언한다 — 시간 초과로 죽으면 무엇이 섰는지가 안 남는다.
        const mark = () => frame.evaluate(`(${MARK})('')`) as Promise<string>
        await poll('캔버스 표지', mark, (value) => value === expected.get(themeId)).catch(() => undefined)
        expect(await mark(), `캔버스 — ${themeId}`).toBe(expected.get(themeId))
      } finally {
        await context.close()
      }

      const bundle = await openBundle(stack, alice, fixture.id, '화면')
      try {
        expect(await bundle.page.evaluate(() => document.documentElement.getAttribute('data-wb-failed'))).toBeNull()
        expect(await bundle.page.evaluate(`(${MARK})('.wb-export-canvas ')`), `번들 — ${themeId}`).toBe(expected.get(themeId))
      } finally {
        await bundle.close()
      }
    },
    180_000,
  )

  it('system-admin@0.1.0 에 고정한 프로젝트를 지금 판으로 올린다 — 확인 상자의 토큰 이전 · 없는 variant 수가 impact 와 같다', async () => {
    const bytes = readFileSync(OLD_ADMIN)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    expect(sha256, '얼린 0.1.0 이 사용자 DB 에 시딩된 판(체크섬 줄)과 같다').toBe(
      JSON.parse(readFileSync(ADMIN_CHECKSUMS, 'utf8'))['system-admin@0.1.0'],
    )
    const { files } = readWbtheme(new Uint8Array(bytes))
    const old = files!.manifest
    expect(`${old.id}@${old.version}`).toBe('system-admin@0.1.0')
    await stack.query(
      `insert into theme_packages (theme_id, version, name, description, sdk_range, manifest, files, size, sha256, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null)`,
      [old.id, old.version, old.name, old.description ?? null, old.sdk, JSON.stringify(old), bytes, bytes.byteLength, sha256],
    )

    // 없는 variant 대조군 — `cards` 는 두 판 모두 List 에 없다(센다) · `Section` 의 `hero` 는 두 판 모두 선언한다(안 센다).
    const upgrade = await project(stack, alice, {
      목록: [
        { id: 'u_sec', type: 'Section', variant: 'hero', props: {}, children: [{ id: 'u_t', type: 'Text', props: { content: '회원' } }] },
        { id: 'u_list', type: 'List', variant: 'cards', props: { items: 3 } },
      ],
      상세: [{ id: 'u_btn', type: 'Button', variant: 'primary', props: { label: '저장' } }],
    })
    // 0.1.0 의 첫 색 · 첫 길이 토큰을 기본값과 다른 값으로 둔다 — 이어짐이 0 이면 0 과 0 을 견준 것이다.
    const items = Object.entries<any>(old.tokens.items)
    const color = items.find(([, d]) => d.type === 'color')![0]
    const length = items.find(([, d]) => d.type === 'length')![0]
    const tokens = { [color]: '#ff5500', [length]: '12px' }
    const now = ok(await upgrade.call('GET', `/projects/${upgrade.id}/theme`), '바인딩')
    ok(
      await upgrade.call('PUT', `/projects/${upgrade.id}/theme`, { themeId: 'system-admin', version: '0.1.0', tokens, rev: now.rev }),
      '0.1.0 고정',
    )

    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 1000 } })
    try {
      await page.goto(`/projects/${upgrade.id}/settings?section=theme`)
      const version = page.getByRole('combobox', { name: '버전', exact: true })
      await expect.poll(() => version.inputValue()).toBe('0.1.0')
      await version.selectOption(seededVersion('system-admin'))
      const box = await confirmBox(page)
      const impact = ok(
        await upgrade.call('GET', `/projects/${upgrade.id}/theme/impact?themeId=system-admin&version=${seededVersion('system-admin')}`),
        'impact',
      )
      expect(box).toEqual(impactAsBox(impact))
      // 카나리아 — 고친 토큰 둘이 이어지고, 심은 없는 variant 하나가 목록 페이지에만 선다.
      expect(box.tokens.kept).toBe(2)
      expect(box.variants).toEqual(['목록 — 없는 variant 1개'])
      await apply(page)
    } finally {
      await context.close()
    }
    const saved = ok(await upgrade.call('GET', `/projects/${upgrade.id}/theme`), '바인딩')
    expect({ themeId: saved.themeId, version: saved.version, tokens: saved.tokens }).toEqual({
      themeId: 'system-admin',
      version: seededVersion('system-admin'),
      tokens,
    })
  }, 180_000)
})
