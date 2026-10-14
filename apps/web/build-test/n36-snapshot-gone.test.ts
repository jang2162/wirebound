/**
 * **상한이 지운 안전망의 «되돌리기» 는 목록에서 그 줄을 뺀다**(`shell/snapshots-panel.tsx` 의 `runRestore` — L-287).
 *
 * 판: 스냅샷 상자를 연 채 다른 길(REST)로 연쇄 삭제를 상한(`CASCADE_SAFETY_KEEP` 20) + 1 번 하면 가장 오래된 안전망이 서버에서 지워진다. 상자의 그 줄은
 * 그대로 남아 있고, 그 줄의 «되돌리기» 는 404 «스냅샷을 찾을 수 없습니다» 다. 성질: 404 면 목록을 다시 받아 사라진 줄이 빠지고, 사람에게 까닭을 말한다.
 * 404 가 아닌 실패(권한 · 503)는 지금 동작 그대로 — 줄이 남고 목록을 다시 안 받는다(`test/shell/snapshots-panel.test.tsx` 가 든다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** `services/menu-cascade.ts` 의 `CASCADE_SAFETY_KEEP` — 웹 판이 api 소스를 import 하지 않는다. */
const KEEP = 20

describe.skipIf(!전제.ok)('상한이 지운 안전망의 되돌리기', () => {
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

  it('상자를 연 채 상한이 가장 오래된 안전망을 지우면, 그 줄의 되돌리기는 줄을 빼고 까닭을 말한다', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '지워진 안전망', slug: `gone-safety-${Date.now().toString(36)}` }))
    const cascadeOnce = async (title: string): Promise<string> => {
      const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title }))
      const made = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: `${title} 페이지` }))
      const res = await call('DELETE', `/projects/${project.id}/menu/${menu.id}`, {
        cascade: true,
        expect: { menuIds: [], pageIds: [made.id] },
      })
      if (res.status !== 200) throw new Error(`연쇄 삭제 ${res.status} ${JSON.stringify(res.body)}`)
      return String(res.body.safetySnapshot.id)
    }
    const listed = async (): Promise<string[]> => {
      const res = await call('GET', `/projects/${project.id}/snapshots`)
      return (res.body as { id: string }[]).map((row) => row.id)
    }

    const oldest = await cascadeOnce('가장 오래된')
    // 이 탭이 상자를 열 때 받은 목록에 가장 오래된 안전망이 든다 — 상한 아래라 둘째 연쇄 하나만 더한다.
    await cascadeOnce('둘째')

    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}`)
      await page.getByRole('button', { name: '더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: '스냅샷' }).click()
      const rows = page.locator('.wb-shell-snapshots-row')
      const oldestRow = rows.filter({ hasText: '가장 오래된' })
      await oldestRow.waitFor()
      expect(await rows.count()).toBe(2)

      // 상자가 열린 채 다른 길(REST)로 상한 + 1 번 — 가장 오래된 안전망이 서버에서 지워진다.
      for (let i = 0; i < KEEP; i++) await cascadeOnce(`채움 ${i}`)
      const serverIds = await listed()
      // 판 카나리아 — 서버에서 지워졌고, 이 탭의 상자는 아직 옛 목록이다.
      expect(serverIds).not.toContain(oldest)
      expect(await oldestRow.count()).toBe(1)

      await oldestRow.getByRole('button', { name: '이 상태로 되돌리기' }).click()
      await oldestRow.getByRole('button', { name: '되돌린다' }).click()
      // 끝 조건은 답이 닿았다는 것 — 서버가 404 를 냈다는 카나리아(문장이든 줄이 빠졌든 어느 쪽으로도 끝난다).
      await poll(
        '복원의 답이 화면에 선다',
        async () => ({
          alert: (await page.locator('.wb-shell-snapshots-error').allTextContents()).join(' | '),
          status: (await page.locator('.wb-shell-snapshots-body [role=status], .wb-shell-snapshots-restored').allTextContents()).join(
            ' | ',
          ),
        }),
        (shown) => shown.alert !== '' || shown.status !== '',
        10_000,
      )
      await page.waitForTimeout(1_000)

      const shown = {
        행: await rows.count(),
        가장오래된줄: await oldestRow.count(),
        알림: await page.locator('.wb-shell-snapshots-error').allTextContents(),
      }
      // eslint-disable-next-line no-console
      console.log(`[지워진 안전망] ${JSON.stringify(shown)}`)

      // 성질 — 사라진 줄이 빠지고, 까닭을 말한다. 서버가 가진 줄만 상자에 남는다.
      expect(shown.가장오래된줄).toBe(0)
      expect(shown.행).toBe(serverIds.length)
      expect(shown.알림.join(' ')).toContain('이미 지워졌습니다')
      // 지워진 안전망은 «복원됐는지 모른다» 가 아니다 — 서버가 커밋 전에 거절했다.
      expect(shown.알림.join(' ')).not.toContain('복원됐는지 알 수 없습니다')
    } finally {
      await context.close()
    }
  })
})

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
