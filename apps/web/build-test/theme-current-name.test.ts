/**
 * **설정 «테마» 의 지금 테마 요약이 그리는 이름** — 실브라우저 판(`settings/theme-section.tsx` 의 `CurrentTheme`).
 *
 * | 판 | 요약 첫 줄 |
 * | --- | --- |
 * | 옛 판(`system-admin@0.1.0` — 이름 «관리자»)에 고정 · 같은 테마에 숨기지 않은 새 판이 있다 | 새 판의 이름 + `system-admin@0.1.0` — 고르개의 테마 칸과 같은 이름 |
 * | 판이 다 숨은 테마(`primary-mark@1.0.0`)에 고정 | 고정한 판의 이름 — 그때 참인 이름이 그것뿐이다 |
 *
 * 옛 판은 `theme-system.test.ts` 와 같은 얼린 산출물(`fixtures/system-admin-0.1.0.wbtheme` — 사용자 DB 에 시딩된 판)이다. 시딩된 지금 판의
 * 이름은 글자로 적지 않고 그 manifest 에서 읽는다.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readWbtheme } from '@wirebound/themes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { makeAdmin, primaryMarkTheme, putTheme, seededVersion, themeProject, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const OLD_ADMIN = fileURLToPath(new URL('./fixtures/system-admin-0.1.0.wbtheme', import.meta.url))

describe.skipIf(!전제.ok)('설정 «테마» — 지금 테마 요약의 이름', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    await makeAdmin(stack, stack.users.alice)
  }, 180_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  /** 설정 페이지를 열어 요약 첫 줄과 «새 버전» 표지를 읽는다. */
  async function summary(projectId: string): Promise<{ current: string; newer: string | null }> {
    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${projectId}/settings?section=theme`)
      const group = page.getByRole('group', { name: '지금 테마', exact: true })
      await group.waitFor()
      const newer = group.locator('.wb-shell-settings-newer')
      return {
        current: (await group.locator('.wb-shell-settings-current').textContent()) ?? '',
        newer: (await newer.count()) === 0 ? null : await newer.textContent(),
      }
    } finally {
      await context.close()
    }
  }

  it('옛 판에 고정한 프로젝트 — 이름은 숨기지 않은 최신판의 것이다', async () => {
    const bytes = readFileSync(OLD_ADMIN)
    // 저장된 옛 판이다 — 그 manifest 는 카탈로그가 걷은 `List` 를 선언한다(`readWbtheme` 의 `stored`).
    const old = readWbtheme(new Uint8Array(bytes), { stored: true }).files!.manifest
    await stack.query(
      `insert into theme_packages (theme_id, version, name, description, sdk_range, manifest, files, size, sha256, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null)`,
      [
        old.id,
        old.version,
        old.name,
        old.description ?? null,
        old.sdk,
        JSON.stringify(old),
        bytes,
        bytes.byteLength,
        createHash('sha256').update(bytes).digest('hex'),
      ],
    )
    const seeded = seededVersion('system-admin')
    const latest = await stack.request(alice, 'GET', `/theme-packages/system-admin/${seeded}/manifest`)
    expect(latest.status).toBe(200)
    // 카나리아 — 두 판의 이름이 달라야 «어느 판의 이름인가» 를 가른다.
    expect(latest.body.name).not.toBe(old.name)

    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'system-admin', version: old.version, tokens: {} })
    expect(await summary(project.id)).toEqual({ current: `${latest.body.name} system-admin@${old.version}`, newer: `새 버전 ${seeded}` })
  }, 180_000)

  it('판이 다 숨은 테마에 고정한 프로젝트 — 이름은 고정한 판의 것이다', async () => {
    expect(await uploadRaw(stack, alice, await primaryMarkTheme()), '픽스처 테마 올리기').toBe(201)
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'primary-mark', version: '1.0.0', tokens: {} })
    const hidden = await stack.request(alice, 'PATCH', '/admin/theme-packages/primary-mark/1.0.0', { hidden: true })
    expect(hidden.status).toBe(200)
    const theme = await project.call('GET', `/projects/${project.id}/theme`)
    // 카나리아 — 숨기지 않은 판이 없는 판이다.
    expect({ latest: theme.body.latest, latestName: theme.body.latestName }).toEqual({ latest: null, latestName: null })
    expect(await summary(project.id)).toEqual({ current: `${theme.body.manifest.name} primary-mark@1.0.0`, newer: null })
  }, 180_000)
})
