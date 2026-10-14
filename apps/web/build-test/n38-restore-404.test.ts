/**
 * **복원의 404 는 «스냅샷 없음» 과 «프로젝트 없음 · 멤버 아님» 을 가른다**(`shell/snapshots-panel.tsx` 의 `runRestore` — L-312).
 *
 * 판: 스냅샷 상자를 연 채 다른 길(REST)로 프로젝트를 지우거나 이 사람을 멤버에서 뺀다. 그 뒤 «되돌리기» 는 가드의 404 «프로젝트를 찾을 수 없습니다» 다 — 서버가 «스냅샷 없음»
 * (`snapshot-gone`)은 멤버에게만 내므로 이 404 는 그 코드가 아니다. 성질: 그 404 는 서버 문장 그대로 서고, «이미 지워졌습니다 · 목록을 다시 받았습니다» 가 아니며, 목록을 다시
 * 받지 않는다(그래서 «저장은 됐지만 …» 앞머리도 붙지 않는다). 지워진 안전망(`snapshot-gone`)은 `n36-snapshot-gone.test.ts` 가 든다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { delayServerFrames, editorStackPrerequisite, poll, startEditorStack, type EditorStack } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('복원 404 가르기', () => {
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

  /** 상자를 열고 한 줄을 누른 뒤 «복원의 답이 화면에 선다» 까지 기다려, 보인 것을 돌려 준다. */
  async function restoreAndRead(page: Page, tag: string, after: () => Promise<void>) {
    await page.getByRole('button', { name: '더 보기', exact: true }).click()
    await page.getByRole('menuitem', { name: '스냅샷' }).click()
    const rows = page.locator('.wb-shell-snapshots-row')
    const row = rows.filter({ hasText: tag })
    await row.waitFor()
    const rowsBefore = await rows.count()

    // 판이 서는 순간부터 «복원 뒤에 간 목록 조회» 를 센다 — 404 가 목록을 다시 받게 하지 않는다는 성질.
    const requests: string[] = []
    page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`))
    await after()

    await row.getByRole('button', { name: '이 상태로 되돌리기' }).click()
    await row.getByRole('button', { name: '되돌린다' }).click()
    await poll(
      '복원의 답이 화면에 선다',
      async () => (await page.locator('.wb-shell-snapshots-error').allTextContents()).join(' | '),
      (shown) => shown !== '',
      10_000,
    )
    await page.waitForTimeout(1_000)
    const restoreAt = requests.findIndex((line) => /POST .*\/restore$/.test(line))
    return {
      restorePosted: restoreAt >= 0,
      목록조회: requests.slice(restoreAt + 1).filter((line) => /GET .*\/snapshots$/.test(line)).length,
      행: { 전: rowsBefore, 후: await rows.count() },
      알림: await page.locator('.wb-shell-snapshots-error').allTextContents(),
    }
  }

  function expectProjectGone(shown: Awaited<ReturnType<typeof restoreAndRead>>): void {
    const alert = shown.알림.join(' | ')
    // 카나리아 — 복원 요청이 실제로 나갔다.
    expect(shown.restorePosted).toBe(true)
    // 성질 — 서버 문장 그대로(가드의 404), 지워진 안전망의 문장이 아니고, 목록을 다시 받지 않고, 저장의 앞머리가 안 붙는다.
    expect(alert).toContain('프로젝트를 찾을 수 없습니다')
    expect(alert).not.toContain('이미 지워졌습니다')
    expect(alert).not.toContain('저장은 됐지만')
    expect(shown.목록조회).toBe(0)
    expect(shown.행.후).toBe(shown.행.전)
  }

  it('상자를 연 채 프로젝트가 지워지면 되돌리기는 «프로젝트를 찾을 수 없습니다» 이고 목록을 다시 받지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '지워질 프로젝트', slug: `n38-gone-${Date.now().toString(36)}` }), 201)
    created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v1' }), 201)

    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}`)
      const shown = await restoreAndRead(page, 'v1', async () => {
        const res = await call('DELETE', `/projects/${project.id}`)
        if (res.status !== 204) throw new Error(`프로젝트 삭제 ${res.status} ${JSON.stringify(res.body)}`)
      })
      // eslint-disable-next-line no-console
      console.log(`[프로젝트 지움] ${JSON.stringify(shown)}`)
      expectProjectGone(shown)
    } finally {
      await context.close()
    }
  })

  it('상자를 연 채 멤버에서 빠지면 되돌리기는 같은 404 이고 목록을 다시 받지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '빠질 멤버', slug: `n38-member-${Date.now().toString(36)}` }), 201)
    created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v1' }), 201)
    // 복원은 owner 만이다 — 밥을 owner 로 들였다가 앨리스가 뺀다.
    const added = created(await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'owner' }), 201)

    const { context, page } = await stack.openTab(stack.users.bob)
    try {
      // 셸이 `membership-changed` 를 받으면 화면 전체를 «설계서를 열지 못했습니다» 로 바꿔 상자가 사라진다 — 그 프레임을 늦춰 «빠졌는데 화면이 아직 모르는» 틈에서 누른다.
      await delayServerFrames(page, ['membership-changed'], 20_000)
      await page.goto(`/projects/${project.id}`)
      const shown = await restoreAndRead(page, 'v1', async () => {
        const res = await call('DELETE', `/projects/${project.id}/members/${added.userId}`)
        if (res.status !== 204) throw new Error(`멤버 빼기 ${res.status} ${JSON.stringify(res.body)}`)
      })
      // eslint-disable-next-line no-console
      console.log(`[멤버에서 뺌] ${JSON.stringify(shown)}`)
      expectProjectGone(shown)
    } finally {
      await context.close()
    }
  })
})

function created(response: { status: number; body: any }, status: number): any {
  if (response.status !== status) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
