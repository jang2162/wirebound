/**
 * **N2 — 정보 통지 한 칸 · 접힌 좌측의 F2 · 별칭 60자를 실브라우저로 잰다**(`docs/superpowers/plans/2026-10-10-n2-report.md`). jsdom 은 배치 ·
 * 키 입력의 포커스 · `maxLength` 의 실제 동작이 없어 아래 값을 못 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 정보 통지는 한 칸이다(창 800×500) | 같은 종류의 정보 통지(거절된 봉투 셋)가 쌓인다 · 하단 바가 첫 통지 때보다 높아진다 · 실패 통지와 함께 서면 셸이 넘친다 |
 * | 접힌 좌측의 F2 | F2 가 접힌 채 입력을 연다(화면에 아무것도 안 선다) · 펴고 나서도 입력이 안 보인다 |
 * | 속성 패널 별칭 칸 | 61자째가 입력되어 떠날 때 말없이 잘린다 · 서버의 별칭이 친 글과 다르다 |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('N2 정보 통지 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string, nodes: unknown[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'N2', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function open(P: string, viewport: { width: number; height: number }) {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const TEXTS = [0, 1, 2].map((at) => ({ id: `n_t${at}000000000`, type: 'Text', props: { content: `글 ${at}` } }))

  /** 진짜 `paste` 이벤트를 호스트 문서에 올린다 — 클립보드 권한 없이 글을 싣는 길이다(`edit/use-clipboard.ts` 가 받는다). */
  const paste = (page: import('playwright-core').Page, text: string) =>
    page.evaluate((value) => {
      const data = new DataTransfer()
      data.setData('text/plain', value)
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, text)

  const envelope = (nodes: unknown[]) => JSON.stringify({ wirebound: 'nodes', version: 5, nodes })

  it('정보 통지는 한 칸이다 — 까닭이 다른 거절 셋을 붙여도 한 줄이고 하단 바가 안 높아진다(창 800×500 · 실패 통지와 함께)', async () => {
    const P = await fixture('n2-one-slot', TEXTS)
    const { page, close } = await open(P, { width: 800, height: 500 })
    try {
      const measure = () =>
        page.evaluate(() => {
          const shell = document.querySelector('.wb-shell') as HTMLElement
          return {
            info: [...document.querySelectorAll('.wb-shell-info-notice')].map((el) => el.textContent ?? ''),
            alerts: [...document.querySelectorAll('.wb-shell-footer [role="alert"]')].map((el) => el.textContent ?? ''),
            footer: Math.round(document.querySelector('.wb-shell-footer')!.getBoundingClientRect().height),
            overflow: shell.scrollHeight - shell.clientHeight,
          }
        })
      const empty = await measure()
      expect(empty.info).toEqual([])

      const reasons: string[] = []
      const heights: number[] = []
      for (const nodes of [
        [{ id: 'n_zz0000000001', type: 'NoSuchType' }],
        [
          { id: 'n_zz0000000002', type: 'Text' },
          { id: 'n_zz0000000002', type: 'Text' },
        ],
        [{ id: 'n_zz0000000003', type: 'Text', props: { content: 3 } }],
      ]) {
        await paste(page, envelope(nodes))
        await page.waitForTimeout(150)
        const seen = await measure()
        // 한 번에 한 줄 — 앞의 거절이 쌓이지 않고 새 거절이 대신한다.
        expect(seen.info).toHaveLength(1)
        reasons.push(seen.info[0]!)
        heights.push(seen.footer)
      }
      // 까닭이 셋 모두 달랐다(같은 줄만 반복해 «바꿔 끼움» 이 안 재졌다는 거짓 초록을 막는다).
      expect(new Set(reasons).size).toBe(3)
      // 둘째 · 셋째 거절이 첫 거절보다 하단 바를 높이지 않는다(문장이 한 줄 더 길어 줄을 바꾸는 판은 허용 — 한 줄 높이 한도).
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(24)

      // 실패 통지(루트를 고른 Ctrl+D)와 함께 서도 셸이 안 넘친다.
      await page.keyboard.press('ControlOrMeta+d')
      await page.waitForTimeout(150)
      const both = await measure()
      expect({ info: both.info.length, alerts: both.alerts.length, overflow: both.overflow }).toEqual({ info: 1, alerts: 1, overflow: 0 })
      // eslint-disable-next-line no-console
      console.log(`[N2 정보 통지] ${JSON.stringify({ empty, heights, both })}`)
    } finally {
      await close()
    }
  }, 120_000)

  it('좌측 패널을 접은 채 F2 — 펴고 입력이 보이는 자리에 선다', async () => {
    const P = await fixture('n2-f2-folded', [{ id: 'n_card00000001', type: 'Card', alias: '회원 카드', props: { title: '회원' } }])
    const { page, close } = await open(P, { width: 1280, height: 800 })
    try {
      await page.locator('[data-tree-id="n_card00000001"] > button').first().click()
      await page.getByRole('button', { name: '좌측 패널 접기' }).click()
      const side = page.locator('.wb-shell-side')
      await poll(
        '좌측이 접힌다',
        async () => (await side.boundingBox())?.width ?? 0,
        (width) => width === 0,
      )

      await page.keyboard.press('F2')

      // CSS 로 찾는다 — `getByRole` 은 접혀 감춰진(display: none) 입력을 못 찾아, 접힌 채 열리는 결함이 «값 없는 시간 초과» 로 죽는다(구분력이 아니다).
      const input = page.locator('.wb-shell-region[aria-label="구조 트리"] li:has(> [data-tree-id="n_card00000001"]) input')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      const box = await input.boundingBox()
      expect({
        folded: await side.evaluate((el) => el.classList.contains('wb-shell-folded')),
        visible: (box?.width ?? 0) > 0 && (box?.x ?? -1) >= 0,
      }).toEqual({
        folded: false,
        visible: true,
      })
      expect(await input.inputValue()).toBe('회원 카드')
    } finally {
      await close()
    }
  }, 60_000)

  it('속성 패널 별칭 칸은 61자째를 받지 않는다 — 친 글이 그대로 서버에 닿는다', async () => {
    const P = await fixture('n2-alias-60', [{ id: 'n_card00000001', type: 'Card', props: { title: '회원' } }])
    const { page, close } = await open(P, { width: 1280, height: 800 })
    try {
      await page.locator('[data-tree-id="n_card00000001"] > button').first().click()
      const field = page.getByRole('textbox', { name: '별칭' }).last()
      await field.fill('')
      await field.pressSequentially('가'.repeat(70))
      expect(await field.inputValue()).toBe('가'.repeat(60))
      // 한도는 칸 밑 안내다(빈 칸의 자리표가 아니다 — 값처럼 읽혔다).
      expect(await field.getAttribute('placeholder')).toBeNull()
      expect(await field.evaluate((el) => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? null)).toBe(
        '트리 · 코멘트에 보이는 이름, 60자까지',
      )
      await field.press('Enter')
      await poll(
        '서버의 별칭',
        async () => (await call('GET', P)).body.schema.root.children[0].alias,
        (alias) => alias === '가'.repeat(60),
      )
    } finally {
      await close()
    }
  }, 60_000)
})
