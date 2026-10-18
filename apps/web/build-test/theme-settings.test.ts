/**
 * **설정 페이지에서 토큰을 고친다** — 실브라우저 판(`settings/token-editor.tsx` · `settings/theme-preview.tsx`).
 *
 * 두 탭: alice(owner)가 설정 페이지에서 주색을 고쳐 저장하면 bob(editor)의 열린 캔버스가 새로고침 없이 그 값으로 선다(`theme-changed`).
 * 저장 전의 초안은 미리보기(갤러리 iframe)의 계산값만 바꾸고 bob 에게 가지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'
import type { Page } from 'playwright-core'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack } from './editor-stack'
import { canvasVar, countThemeFiles, themeProject } from './theme-fixtures'

/** system-admin 의 색 토큰 — 판 · 키 · 칸 이름을 글자로 적지 않는다(`@wirebound/test-support/system-admin`). */
const COLOR = SYSTEM_ADMIN.color

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 미리보기 iframe 문서의 `:root` 에서 변수의 계산값. */
async function previewVar(page: Page, name: string): Promise<string> {
  const handle = await page.$('.wb-shell-settings-preview iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) return ''
  return frame.evaluate((variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name)
}

describe.skipIf(!전제.ok)('설정 페이지의 토큰 편집', () => {
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

  it('초안은 미리보기만 바꾸고, 저장하면 bob 의 캔버스가 새로고침 없이 따라간다', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await themeProject(stack, alice, { bob: true })
    const a = await stack.openTab(stack.users.alice)
    const b = await stack.openTab(stack.users.bob)
    const bobFiles = countThemeFiles(b.page)
    let bobNavigations = 0
    try {
      await b.page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(b.page).locator('body', { hasText: '원문' }).waitFor()
      await poll(
        'bob 테마 변수',
        () => canvasVar(b.page, COLOR.cssVar),
        (value) => value === COLOR.value,
      )
      b.page.on('framenavigated', (frame) => {
        if (frame === b.page.mainFrame()) bobNavigations += 1
      })

      await a.page.goto(`/projects/${project.id}/settings?section=theme`)
      const primary = a.page.getByRole('group', { name: '토큰' }).getByLabel(COLOR.label, { exact: true })
      await primary.waitFor()
      await poll(
        '미리보기가 선다',
        () => previewVar(a.page, COLOR.cssVar),
        (value) => value === COLOR.value,
      )

      await primary.fill('#ff5500')
      await poll(
        '미리보기가 초안을 따라간다',
        () => previewVar(a.page, COLOR.cssVar),
        (value) => value === '#ff5500',
      )
      // 초안은 bob 에게 가지 않는다.
      await b.page.waitForTimeout(300)
      expect(await canvasVar(b.page, COLOR.cssVar)).toBe(COLOR.value)

      await a.page.getByRole('button', { name: '토큰 저장' }).click()
      await a.page.getByText('토큰을 저장했습니다').waitFor()
      await poll(
        'bob 의 캔버스가 새 값',
        () => canvasVar(b.page, COLOR.cssVar),
        (value) => value === '#ff5500',
      )
      expect(bobNavigations).toBe(0)
      expect(bobFiles.js()).toBe(1)

      const saved = await project.call('GET', `/projects/${project.id}/theme`)
      expect(saved.body.tokens).toEqual({ [COLOR.key]: '#ff5500' })
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })

  it('반쯤 친 값은 저장이 꺼지고 미리보기는 그 키만 기본값이다', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await themeProject(stack, alice)
    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}/settings?section=theme`)
      const primary = page.getByRole('group', { name: '토큰' }).getByLabel(COLOR.label, { exact: true })
      await primary.waitFor()
      await poll(
        '미리보기가 선다',
        () => previewVar(page, COLOR.cssVar),
        (value) => value === COLOR.value,
      )
      await primary.fill('#12')
      await page.getByText(`고칠 칸이 있습니다 — ${COLOR.label}`).waitFor()
      expect(await page.getByRole('button', { name: '토큰 저장' }).isDisabled()).toBe(true)
      await page.waitForTimeout(200)
      expect(await previewVar(page, COLOR.cssVar)).toBe(COLOR.value)
    } finally {
      await context.close()
    }
  })
})
