/**
 * **열린 페이지를 내보내면 방금 친 글이 파일에 든다**(`panels/page-json-export.ts` — 보낸 편집의 답을 받은 뒤에 읽는다).
 *
 * 칸에 친 채 줄 `…`를 누르면 그 클릭이 blur 로 편집을 WS 로 내고, 곧바로 «JSON 내보내기»가 다른 연결(REST)로 페이지를 읽는다. 읽기가 편집
 * 앞이면 파일에는 옛 글이 든다. 편집을 서버에 붙잡는 것은 페이지 행 잠금이다 — 줄이 섰는지는 `holdRow` 의 대기자로 센다(안 서면 던진다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 열린 페이지 | 내보내기가 편집의 답을 안 기다린다(파일에 옛 글) |
 * | 다른 페이지 줄 | 열린 페이지가 아닌 줄의 내보내기가 열린 페이지의 편집을 기다린다(기다리면 편집이 늦을 때 내려받기가 늦다) |
 */
import { readFile } from 'node:fs/promises'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session, canvasFrame } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('열린 페이지의 JSON 내보내기와 보낸 편집', () => {
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
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('칸에 친 채 열린 페이지를 내보내면 그 글이 든 파일이 나온다', async () => {
    const fx = await fixture(stack, alice, 'export-open')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(fx.P1)
      const box = await selectFirstText(page, '1쪽 원문')
      await box.click()
      await box.fill('친 채 내보낸 글')
      const hold = await stack.holdRow('pages', fx.first)
      try {
        const downloading = page.waitForEvent('download')
        // 실클릭 — blur 가 편집을 낸다. 행에 줄 서야 판이 선다.
        await rowLabel(page, fx.first).hover()
        await row(page, fx.first).getByRole('button', { name: '첫째 더 보기', exact: true }).click()
        await page.getByRole('menuitem', { name: 'JSON 내보내기', exact: true }).click()
        await hold.waitForWaiters(1)
        await new Promise((resolve) => setTimeout(resolve, 300))
        await hold.release()
        const download = await downloading
        const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as { schema: { root: { children?: { props?: { content?: string } }[] } } }
        const exported = (file.schema.root.children ?? []).map((child) => child.props?.content)
        // eslint-disable-next-line no-console
        console.log(`[열린 페이지 내보내기] 파일 ${JSON.stringify(exported)}`)
        expect(exported).toEqual(['친 채 내보낸 글'])
        expect(await server(stack, alice, fx.P1)).toEqual({ head: 2, content: ['친 채 내보낸 글'] })
      } finally {
        await hold.release()
      }
    } finally {
      await context.close()
    }
  })

  it('열린 페이지가 아닌 줄의 내보내기는 열린 페이지의 편집을 기다리지 않는다', async () => {
    const fx = await fixture(stack, alice, 'export-other')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(fx.P1)
      const box = await selectFirstText(page, '1쪽 원문')
      await box.click()
      await box.fill('붙잡힌 글')
      const hold = await stack.holdRow('pages', fx.first)
      try {
        const downloading = page.waitForEvent('download')
        const clicked = Date.now()
        await rowLabel(page, fx.second).hover()
        await row(page, fx.second).getByRole('button', { name: '둘째 더 보기', exact: true }).click()
        await page.getByRole('menuitem', { name: 'JSON 내보내기', exact: true }).click()
        await hold.waitForWaiters(1)
        const download = await downloading
        const waited = Date.now() - clicked
        // eslint-disable-next-line no-console
        console.log(`[다른 줄 내보내기] ${waited}ms · ${download.suggestedFilename()}`)
        expect({ 파일: download.suggestedFilename(), 한도안: waited < 2_000 }).toEqual({ 파일: '둘째.wirebound-page.json', 한도안: true })
      } finally {
        await hold.release()
      }
    } finally {
      await context.close()
    }
  })
})

function row(page: Page, id: string) {
  return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
}

/** 줄의 단추 · 링크 — 줄 상자는 `visibility: hidden`이고 보이는 것은 이 자식이다. 마우스 올림이 여기 선다. */
function rowLabel(page: Page, id: string) {
  return row(page, id).locator('> button, > a').first()
}

interface Fixture {
  first: string
  second: string
  P1: string
}

async function fixture(stack: EditorStack, owner: Session, slug: string): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '내보내기', slug: `${slug}-${Date.now().toString(36)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const seeded = await call('PATCH', `${P1}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_one0000001', type: 'Text', props: { content: '1쪽 원문' } } }],
  })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { first: first.id, second: second.id, P1 }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; content: string[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  return { head: page.headSeq as number, content: (page.schema.root.children ?? []).map((child: any) => child.props?.content) }
}

async function selectFirstText(page: Page, content: string) {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  return box
}
