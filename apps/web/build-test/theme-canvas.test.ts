/**
 * **에디터 캔버스가 프로젝트가 고정한 테마로 그린다** — 실브라우저 판(`theme/project-theme.tsx` · `theme/bundle-loader.ts`).
 *
 * jsdom 은 `<script src>` 를 실행하지 않고(`test/theme/project-theme.test.tsx` 는 시험용 로더로 경계를 잰다) 시트의 겹침도 계산하지
 * 않는다. 여기서 재는 것은 실제 스크립트 적재 · 캐시(판마다 한 번) · 토큰 시트가 테마 시트를 이기는 계산값 · 남의 저장을 새로고침 없이
 * 따라감 · 놓친 프레임의 따라잡기 · 번들 실패의 기본 뷰와 «다시 불러오기» 다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack } from './editor-stack'
import { canvasSheets, canvasVar, countThemeFiles, makeAdmin, putTheme, sampleCard, sampleTheme, themeProject, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** system-admin `theme.css` 의 `:root` 가 적는 주색 기본값 — 토큰 시트가 이것을 이겨야 저장한 값이 선다. */
const ADMIN_PRIMARY = '#2563eb'

describe.skipIf(!전제.ok)('캔버스의 프로젝트 테마', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('새 프로젝트를 열면 theme.js · theme.css 를 싣고 시트가 base → theme → tokens 차례 — 페이지를 옮겨도 theme.js 를 다시 받지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await themeProject(stack, alice)
    const { context, page } = await stack.openTab(stack.users.alice)
    const files = countThemeFiles(page)
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      await poll('테마 시트가 선다', () => canvasSheets(page), (sheets) => sheets.length === 3)
      expect(await canvasSheets(page)).toEqual(['style:base', 'link:theme', 'style:tokens'])
      expect(files.js()).toBe(1)
      expect(files.css()).toBeGreaterThanOrEqual(1)
      expect(files.lines[0]).toBe('system-admin/0.1.0/files/theme.js')
      // 테마 시트가 실제로 먹었다 — theme.css 가 적는 변수가 캔버스에 선다.
      await poll('테마 변수', () => canvasVar(page, '--wb-semantic-primary'), (value) => value === ADMIN_PRIMARY)

      await page.getByRole('link', { name: '둘째' }).click()
      await canvasFrame(page).locator('body', { hasText: '둘째 글' }).waitFor()
      await poll('새 iframe 에도 시트 셋', () => canvasSheets(page), (sheets) => sheets.length === 3)
      expect(await canvasSheets(page)).toEqual(['style:base', 'link:theme', 'style:tokens'])
      expect(files.js()).toBe(1)
    } finally {
      await context.close()
    }
  })

  it('토큰 시트가 테마 시트 뒤라 theme.css 의 :root 기본값을 이긴다 — 계산값', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#123456' } })
    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      await poll('테마 시트가 실린다', () => canvasSheets(page), (sheets) => sheets.includes('link:theme'))
      // link 가 실린 뒤에도(늦게 온 시트가 뒤에 겹쳐지지 않는다 — 차례는 요소의 차례다) 저장한 값이다.
      await page.waitForTimeout(500)
      expect(await canvasVar(page, '--wb-semantic-primary')).toBe('#123456')
      // 토큰이 안 덮은 변수는 theme.css · 토큰 기본값 그대로다.
      expect(await canvasVar(page, '--wb-semantic-danger')).toBe('#ef4444')
    } finally {
      await context.close()
    }
  })

  it('남이 토큰을 저장하면 열린 캔버스가 새로고침 없이 따라간다 — theme.js 를 다시 받지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await themeProject(stack, alice, { bob: true })
    const { context, page } = await stack.openTab(stack.users.bob)
    const files = countThemeFiles(page)
    let navigations = 0
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      await poll('테마 변수', () => canvasVar(page, '--wb-semantic-primary'), (value) => value === ADMIN_PRIMARY)
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations += 1
      })

      await putTheme(project.call, project.id, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#00aa11' } })
      await poll('밥의 캔버스가 새 값', () => canvasVar(page, '--wb-semantic-primary'), (value) => value === '#00aa11')
      expect(navigations).toBe(0)
      expect(files.js()).toBe(1)
    } finally {
      await context.close()
    }
  })

  it('프레임을 놓친 탭은 다시 붙은 뒤의 다시 읽기(themeRev)로 따라잡는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await themeProject(stack, alice, { bob: true })
    const cut = await stack.startCutProxy()
    const { context, page } = await stack.openTab(stack.users.bob, { origin: cut.origin })
    const frames: string[] = []
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const kind = /"type":"(joined|theme-changed)"/.exec(String(frame.payload))?.[1]
        if (kind !== undefined) frames.push(kind)
      })
    })
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      await poll('룸에 든다', async () => frames.slice(), (lines) => lines.includes('joined'))
      await poll('테마 변수', () => canvasVar(page, '--wb-semantic-primary'), (value) => value === ADMIN_PRIMARY)

      // 끊고 곧바로 저장한다 — 첫 재연결(500ms 뒤)보다 먼저 방송이 나가 이 탭은 그 프레임을 못 받는다.
      expect(cut.reset(/\/ws[ ?]/)).toBeGreaterThanOrEqual(1)
      await putTheme(project.call, project.id, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#abcdef' } })
      await poll('다시 룸에 든다', async () => frames.slice(), (lines) => lines.filter((line) => line === 'joined').length >= 2)
      await poll('따라잡는다', () => canvasVar(page, '--wb-semantic-primary'), (value) => value === '#abcdef')
      // 판이 섰는가 — 저장의 프레임은 이 탭에 안 왔다(왔으면 따라잡기가 아니라 프레임이 푼 것이다).
      expect(frames.filter((line) => line === 'theme-changed')).toEqual([])
    } finally {
      await context.close()
      await cut.close()
    }
  })

  it('번들을 못 받으면 기본 뷰로 그리고 머리에 알린다 — «다시 불러오기» 가 테마 뷰로 되돌린다', async () => {
    const alice = await stack.login(stack.users.alice)
    await makeAdmin(stack, stack.users.alice)
    expect(await uploadRaw(stack, alice, await sampleTheme())).toBe(201)
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'sample', version: '1.0.0', tokens: {} })
    const { context, page } = await stack.openTab(stack.users.alice)
    let refused = 0
    await page.route('**/files/theme.js', (route) => {
      refused += 1
      return route.fulfill({ status: 500, body: 'no' })
    })
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await page.getByText(/테마를 불러오지 못해 기본 모양으로 그립니다/).waitFor()
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      expect(await sampleCard(page)).toBe(false)
      expect(await canvasSheets(page)).toEqual(['style:base', 'style:tokens'])
      expect(refused).toBeGreaterThanOrEqual(1)

      await page.unroute('**/files/theme.js')
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await poll('테마 뷰로 선다', () => sampleCard(page), (drawn) => drawn)
      expect(await page.getByText(/테마를 불러오지 못해/).count()).toBe(0)
      expect(await canvasSheets(page)).toEqual(['style:base', 'link:theme', 'style:tokens'])
    } finally {
      await context.close()
    }
  })
})
