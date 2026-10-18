/**
 * **관리자가 올린 테마로 바꾼다** — 실브라우저 판(`routes/admin-themes.tsx` · `settings/theme-chooser.tsx` · 캔버스의 번들 적재).
 *
 * alice(인스턴스 관리자 · owner)가 관리자 화면에서 kit 으로 지은 `sample@1.0.0` 을 올리고(파일 칸에 바이트 그대로), 설정 페이지에서 그
 * 테마로 바꾼다(확인 창의 수) → bob(editor)의 열린 캔버스가 새 `theme.js` 를 싣고 그 테마의 뷰(«샘플 카드»)로 그린다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack } from './editor-stack'
import { canvasSheets, countThemeFiles, makeAdmin, sampleCard, sampleTheme, themeProject } from './theme-fixtures'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('관리자 화면에서 올리고 설정에서 바꾼다', () => {
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

  it('올린 테마로 바꾸면 bob 의 캔버스가 새 번들을 싣고 그 뷰로 그린다', async () => {
    await makeAdmin(stack, stack.users.alice)
    const alice = await stack.login(stack.users.alice)
    const project = await themeProject(stack, alice, { bob: true })
    const bytes = await sampleTheme()
    const a = await stack.openTab(stack.users.alice)
    const b = await stack.openTab(stack.users.bob)
    const bobFiles = countThemeFiles(b.page)
    try {
      // 관리자 항목은 목록 머리의 `…` 에 — 관리자에게만.
      await a.page.goto('/')
      await a.page.getByRole('button', { name: '더 보기', exact: true }).click()
      await a.page.getByRole('menuitem', { name: '테마 관리' }).click()
      await a.page.getByRole('heading', { name: '테마 관리' }).waitFor()
      await a.page
        .getByLabel('테마 패키지 올리기')
        .setInputFiles({ name: 'sample-1.0.0.wbtheme', mimeType: '', buffer: Buffer.from(bytes) })
      await a.page.getByText('sample@1.0.0 을 올렸습니다').waitFor()
      await a.page.getByRole('region', { name: 'sample' }).waitFor()

      await b.page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(b.page).locator('body', { hasText: '원문' }).waitFor()
      await poll(
        'bob 이 system-admin 을 싣는다',
        async () => bobFiles.js(),
        (count) => count === 1,
      )
      expect(await sampleCard(b.page)).toBe(false)

      await a.page.goto(`/projects/${project.id}/settings?section=theme`)
      const section = a.page.getByRole('region', { name: '테마' })
      await section.getByLabel('테마', { exact: true }).selectOption('sample')
      const confirm = section.getByRole('group', { name: '테마 바꾸기 확인' })
      // 새 프로젝트는 토큰이 비었다 — 이을 것도 버릴 것도 없고 sample 의 토큰 하나가 기본값으로 선다.
      await confirm.getByText('이어짐 0 · 버려짐 0 · 기본값 1').waitFor()
      await confirm.getByRole('button', { name: '바꾸기' }).click()
      await section.getByText('샘플 sample@1.0.0').waitFor()

      await poll(
        'bob 의 캔버스가 샘플 카드로',
        () => sampleCard(b.page),
        (drawn) => drawn,
      )
      expect(bobFiles.lines.filter((line) => line.endsWith('theme.js'))).toEqual([
        `system-admin/${SYSTEM_ADMIN.version}/files/theme.js`,
        'sample/1.0.0/files/theme.js',
      ])
      expect(await canvasSheets(b.page)).toEqual(['style:base', 'link:theme', 'style:tokens'])
      const href = await canvasFrame(b.page).locator('head link[data-wb-style="theme"]').getAttribute('href')
      expect(href).toBe('/api/theme-packages/sample/1.0.0/files/theme.css')
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })
})
