/**
 * **설정 «멤버» 의 제외 확인은 연타 · 따로 누른 두 번에 지나가지 않는다** — 묻던 단추(«<이름> 제외»)의 왼끝 · 가운데 · 오른끝, 폭 360 ·
 * 390 · 1280, 이름 짧은 판 · 긴 판(C3 리뷰 — `docs/superpowers/plans/2026-09-30-c3-review.md`).
 *
 * 두 겹이 막는다(`settings/members-section.tsx` 머리말 «제외는 두 번 누른다»): 확정이 `detail > 1` 을 버리고 — jsdom 이 잰다
 * (`test/settings/members-section.test.tsx`) —, 확정이 묻던 자리에 서지 않는다. 따로 누른 두 번(각 `detail` 1)은 첫 겹을 지나므로, 첫
 * 누름 뒤 **묻던 자리에 무엇이 서는지**와 **확정이 그 자리에서 얼마나 떨어졌는지**가 그 판을 가른다 — 좌표라 여기서만 잰다
 * (`build-test/tokens-confirm.test.ts` 와 같은 자).
 *
 * 제외가 정말 도는지는 판마다 카나리아로 본다 — 확인을 열고 따로 한 번 누른 확정은 뺀다. 그것이 0 이면 아래 0 은 빈 자다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 뺄 멤버(앨리스)의 이름 둘 — 짧으면 «<이름> 제외» 가 «취소» 와 폭이 비슷하고, 길면 훨씬 넓다. */
const NAMES = { 짧은: '앨', 긴: '배포 파이프라인 야간 담당 앨리스' } as const
const POINTS = ['왼끝', '가운데', '오른끝'] as const
/** 따로 누른 두 번의 간격 — 첫 누름이 확인을 그린 뒤다. */
const TWO_CLICK_GAP_MS = 250

describe.skipIf(!전제.ok)('멤버 제외 확인', () => {
  let stack: EditorStack
  let bob: Session
  let projectId: string
  let aliceId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    bob = await stack.login(stack.users.bob)
    const project = await stack.request(bob, 'POST', '/projects', { name: '밥 설계서', slug: `members-${Date.now().toString(36)}` })
    if (project.status !== 201) throw new Error(`픽스처 project ${project.status}`)
    projectId = project.body.id
    aliceId = (await stack.query<{ id: string }>('select id from users where email = $1', [stack.users.alice.email]))[0]!.id
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const isMember = async () =>
    Number(
      (
        await stack.query<{ n: string }>('select count(*) as n from project_members where project_id = $1 and user_id = $2', [
          projectId,
          aliceId,
        ])
      )[0]!.n,
    ) === 1

  /** 폭 하나의 탭. `load` 가 앨리스를 그 이름으로 멤버로 되돌리고 설정을 다시 싣는다. DELETE 요청을 센다. */
  async function tab(width: number): Promise<{ page: Page; load(name: string): Promise<string[]>; close(): Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width, height: 900 } })
    let deletes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'DELETE' && request.url().includes('/members/')) deletes.push(new URL(request.url()).pathname)
    })
    return {
      page,
      async load(name) {
        await stack.query('update users set name = $1 where id = $2', [name, aliceId])
        if (!(await isMember())) {
          const added = await stack.request(bob, 'POST', `/projects/${projectId}/members`, {
            email: stack.users.alice.email,
            role: 'editor',
          })
          if (added.status !== 201) throw new Error(`픽스처 member ${added.status}`)
        }
        await page.goto(`/projects/${projectId}/settings?section=members`)
        await page.getByRole('button', { name: `${name} 제외`, exact: true }).waitFor()
        await page.getByRole('region', { name: '멤버' }).evaluate((section) => section.scrollIntoView({ block: 'start' }))
        deletes = []
        return deletes
      },
      close: () => context.close(),
    }
  }

  async function points(page: Page, ask: string): Promise<Record<(typeof POINTS)[number], [number, number]>> {
    const box = await page.getByRole('button', { name: ask, exact: true }).boundingBox()
    if (box === null) throw new Error(`${ask} 단추가 안 보인다`)
    const y = box.y + box.height / 2
    return { 왼끝: [box.x + 2, y], 가운데: [box.x + box.width / 2, y], 오른끝: [box.x + box.width - 2, y] }
  }

  const settle = (page: Page) => page.waitForTimeout(400)

  /**
   * **확정은 묻던 자리에서 단추 한 높이 이상 떨어진다**(`shell.css` 의 `-members-confirm`). 겹치지만 않는 거리면 아래 판은 초록이어도
   * 두 누름 사이 손이 조금만 내려가면 확정에 닿는다(`build-test/tokens-confirm.test.ts` 의 «거리» 와 같은 자).
   */
  it.each([360, 390, 1280])('폭 %i — 확정이 묻던 자리에서 단추 한 높이 이상 떨어져 선다(거리)', async (width) => {
    const rows: string[] = []
    const { page, load, close } = await tab(width)
    try {
      for (const [key, name] of Object.entries(NAMES)) {
        await load(name)
        const ask = page.getByRole('button', { name: `${name} 제외`, exact: true })
        const asked = await ask.boundingBox()
        if (asked === null) throw new Error(`${name} 제외 단추가 안 보인다`)
        await ask.click()
        const confirm = await page.getByRole('button', { name: `${name} 제외 확정`, exact: true }).boundingBox()
        if (confirm === null) throw new Error(`${key} 확정이 안 보인다`)
        const dx = Math.max(0, confirm.x - (asked.x + asked.width), asked.x - (confirm.x + confirm.width))
        const dy = Math.max(0, confirm.y - (asked.y + asked.height), asked.y - (confirm.y + confirm.height))
        rows.push(`${width} ${key}: 거리 ${Math.round(Math.hypot(dx, dy))} · 단추 높이 ${Math.round(asked.height)}`)
        expect(
          Math.round(Math.hypot(dx, dy)),
          `${width} ${key} — 확정과 묻던 자리의 거리(단추 높이 ${Math.round(asked.height)})`,
        ).toBeGreaterThanOrEqual(asked.height - 0.5)
      }
    } finally {
      await close()
    }
    // eslint-disable-next-line no-console
    console.log(`[멤버 확인 · 거리]\n${rows.join('\n')}`)
  })

  /** 첫 누름 뒤 세 점에 무엇이 서는가 — 값으로 적는다(판정은 아래 케이스가 한다). */
  it.each([360, 390, 1280])('폭 %i — 첫 누름 뒤 묻던 자리의 세 점에 서는 것', async (width) => {
    const rows: string[] = []
    const { page, load, close } = await tab(width)
    try {
      for (const [key, name] of Object.entries(NAMES)) {
        for (const point of POINTS) {
          await load(name)
          const [x, y] = (await points(page, `${name} 제외`))[point]
          await page.getByRole('button', { name: `${name} 제외`, exact: true }).click()
          await page.getByRole('button', { name: `${name} 제외 확정`, exact: true }).waitFor()
          const under = await page.evaluate(
            ([px, py]) => {
              const el = document.elementFromPoint(px!, py!)
              return el === null ? '없음' : (el.closest('button')?.innerText ?? el.tagName)
            },
            [x, y],
          )
          rows.push(`${width} ${key} ${point}: ${under}`)
        }
      }
    } finally {
      await close()
    }
    // eslint-disable-next-line no-console
    console.log(`[멤버 확인 · 자리]\n${rows.join('\n')}`)
    expect(rows.filter((row) => row.endsWith('확정'))).toEqual([])
  })

  it.each([360, 390, 1280])('폭 %i — 연타 · 따로 두 번이 어느 점에서도 안 뺀다', async (width) => {
    const rows: string[] = []
    const { page, load, close } = await tab(width)
    try {
      for (const [key, name] of Object.entries(NAMES)) {
        // 카나리아 — 따로 누른 확정은 뺀다.
        {
          const deletes = await load(name)
          await page.getByRole('button', { name: `${name} 제외`, exact: true }).click()
          await page.getByRole('button', { name: `${name} 제외 확정`, exact: true }).waitFor()
          await page.waitForTimeout(300)
          await page.getByRole('button', { name: `${name} 제외 확정`, exact: true }).click()
          await settle(page)
          expect({ 이름: key, DELETE: deletes.length, 멤버: await isMember() }).toEqual({ 이름: key, DELETE: 1, 멤버: false })
        }
        for (const point of POINTS) {
          for (const how of ['연타', '따로 두 번'] as const) {
            const deletes = await load(name)
            const [x, y] = (await points(page, `${name} 제외`))[point]
            if (how === '연타') {
              await page.mouse.dblclick(x, y)
            } else {
              await page.mouse.click(x, y)
              await page.waitForTimeout(TWO_CLICK_GAP_MS)
              await page.mouse.click(x, y)
            }
            await settle(page)
            rows.push(`${width} ${key} ${point} ${how}: DELETE ${deletes.length} · 멤버 ${await isMember()}`)
          }
        }
      }
    } finally {
      await close()
    }
    // eslint-disable-next-line no-console
    console.log(`[멤버 확인]\n${rows.join('\n')}`)
    expect(rows.filter((row) => !row.endsWith('DELETE 0 · 멤버 true'))).toEqual([])
    expect(rows).toHaveLength(Object.keys(NAMES).length * POINTS.length * 2)
  })
})
