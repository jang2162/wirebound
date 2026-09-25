/**
 * **«API 토큰»의 폐기 확인은 연타 · 따로 누른 두 번에 지나가지 않는다** — 묻던 단추의 왼끝 · 가운데 · 오른끝, 폭 390 · 1280.
 *
 * 두 겹이 막는다(`routes/tokens.tsx` 머리말 «폐기는 두 번 누른다»): 확정이 `detail > 1` 을 버리고, 확정이 묻던 단추 자리에 서지
 * 않는다. 첫 겹은 jsdom 이 잰다(`test/routes/tokens.test.tsx`). **둘째 겹은 좌표라 여기서만 잰다** — 따로 누른 두 번(각 `detail`
 * 1)은 첫 겹을 지나므로 이 겹만 막는다. 가운데 한 점만 재면 «그 자리에 취소가 선다»여도 가장자리 · 긴 이름에서 확정이 선다.
 *
 * 폐기가 정말 도는지는 판마다 카나리아로 본다 — 확인을 열고 따로 한 번 누른 확정은 지운다. 그것이 0 이면 아래 0 은 빈 자다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 줄 둘 — 첫 줄은 이름이 짧아 «CI 폐기»가 «취소»와 폭이 비슷하고, 둘째 줄은 길어 묻는 단추가 «취소»보다 훨씬 넓다. */
const ROWS = ['CI', '배포 파이프라인 야간 빌드'] as const
const TARGETS = [
  { key: '전부', ask: '전부 폐기', revokes: 2 },
  { key: '짧은 줄', ask: `${ROWS[0]} 폐기`, revokes: 1 },
  { key: '긴 줄', ask: `${ROWS[1]} 폐기`, revokes: 1 },
] as const
const POINTS = ['왼끝', '가운데', '오른끝'] as const
/** 따로 누른 두 번의 간격 — 첫 누름이 확인을 그린 뒤다. */
const TWO_CLICK_GAP_MS = 250

describe.skipIf(!전제.ok)('토큰 폐기 확인', () => {
  let stack: EditorStack
  let bob: Session
  let projectId: string
  let userId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    bob = await stack.login(stack.users.bob)
    const project = await stack.request(bob, 'POST', '/projects', { name: '밥 설계서', slug: `tokens-${Date.now().toString(36)}` })
    if (project.status !== 201) throw new Error(`픽스처 project ${project.status}`)
    projectId = project.body.id
    userId = (await stack.query<{ id: string }>('select id from users where email = $1', [stack.users.bob.email]))[0]!.id
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const count = async () => Number((await stack.query<{ n: string }>('select count(*) as n from api_tokens where user_id = $1', [userId]))[0]!.n)

  /** 폭 하나의 탭 — 로그인은 한 번이다. `load` 가 토큰을 줄 둘로 되돌리고 `/tokens` 를 다시 싣는다. DELETE 요청을 센다. */
  async function tab(width: number): Promise<{ page: Page; load(): Promise<string[]>; close(): Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width, height: 900 } })
    let deletes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'DELETE' && request.url().includes('/api/auth/tokens')) deletes.push(new URL(request.url()).pathname)
    })
    return {
      page,
      async load() {
        await stack.query('delete from api_tokens where user_id = $1', [userId])
        for (const name of ROWS) {
          const made = await stack.request(bob, 'POST', `/projects/${projectId}/tokens`, { name })
          if (made.status !== 201) throw new Error(`픽스처 token ${made.status}`)
        }
        await page.goto('/tokens')
        await page.getByRole('button', { name: `${ROWS[0]} 폐기`, exact: true }).waitFor()
        deletes = []
        return deletes
      },
      close: () => context.close(),
    }
  }

  /** 묻는 단추의 세 점(왼끝 · 가운데 · 오른끝 — 가장자리는 2px 안쪽). */
  async function points(page: Page, ask: string): Promise<Record<(typeof POINTS)[number], [number, number]>> {
    const box = await page.getByRole('button', { name: ask, exact: true }).boundingBox()
    if (box === null) throw new Error(`${ask} 단추가 안 보인다`)
    const y = box.y + box.height / 2
    return { 왼끝: [box.x + 2, y], 가운데: [box.x + box.width / 2, y], 오른끝: [box.x + box.width - 2, y] }
  }

  /** 판이 끝난 뒤 — 늦게 나가는 DELETE 를 기다린다. 확정이 섰다면 이 안에 나간다(카나리아가 잰다). */
  const settle = (page: Page) => page.waitForTimeout(400)

  it.each([390, 1280])('폭 %i — 연타 · 따로 두 번이 어느 점에서도 안 지운다', async (width) => {
    const rows: string[] = []
    const { page, load, close } = await tab(width)
    try {
      for (const target of TARGETS) {
        // 카나리아 — 따로 누른 확정은 지운다.
        {
          const deletes = await load()
          await page.getByRole('button', { name: target.ask, exact: true }).click()
          await page.locator('.wb-shell-project-danger').waitFor()
          await page.waitForTimeout(300)
          await page.locator('.wb-shell-project-danger').click()
          await settle(page)
          expect({ 대상: target.key, DELETE: deletes.length, 남은: await count() }).toEqual({
            대상: target.key,
            DELETE: 1,
            남은: ROWS.length - target.revokes,
          })
        }
        for (const point of POINTS) {
          for (const how of ['연타', '따로 두 번'] as const) {
            const deletes = await load()
            const [x, y] = (await points(page, target.ask))[point]
            if (how === '연타') {
              await page.mouse.dblclick(x, y)
            } else {
              await page.mouse.click(x, y)
              await page.waitForTimeout(TWO_CLICK_GAP_MS)
              await page.mouse.click(x, y)
            }
            await settle(page)
            rows.push(`${width} ${target.key} ${point} ${how}: DELETE ${deletes.length} · 남은 ${await count()}`)
          }
        }
      }
    } finally {
      await close()
    }
    // eslint-disable-next-line no-console
    console.log(`[토큰 확인]\n${rows.join('\n')}`)
    expect(rows.filter((row) => !row.endsWith(`DELETE 0 · 남은 ${ROWS.length}`))).toEqual([])
    expect(rows).toHaveLength(TARGETS.length * POINTS.length * 2)
  })
})
