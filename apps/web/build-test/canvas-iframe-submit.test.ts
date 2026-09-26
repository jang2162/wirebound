/**
 * **캔버스 안의 폼 제출이 iframe 문서를 떠나지 않는다**(`src/canvas/canvas-iframe.tsx` 의 `submit` 캡처).
 *
 * 폼 안에 진짜 제출 단추가 있으면(코드 테마가 `<button>` 을 그리는 순간 — 기본 `type` 이 `submit` 이다) 눌렀을 때 브라우저가
 * iframe 을 `about:blank?` 로 옮겨 **캔버스가 빈다**(호스트 주소는 그대로라 무엇이 일어났는지 안 보인다). 렌더러의 `submit` 핸들러는
 * 규칙이 있을 때만 막으므로(`packages/renderer/src/render.tsx` 의 `handlersFor`) 편집 모드 · 규칙 없는 폼은 막는 자리가 없었다.
 *
 * 기본 뷰의 폼에는 제출 단추가 없어 케이스가 단추를 심는다. 판 카나리아로 규칙 있는 폼의 제출이 **규칙을 돌리는지**(대상 글이
 * 숨는다)를 함께 본다 — 캡처에서 기본 동작을 막아도 React 의 `submit` 핸들러는 불려야 한다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('캔버스 iframe — 폼 제출', () => {
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

  for (const [label, mode, form] of [
    ['편집 모드 — 핸들러가 없는 폼', '편집 모드', 'n_form_rule01'],
    ['뷰 모드 — 규칙 없는 폼', '뷰 모드', 'n_form_bare01'],
  ] as const) {
    it(`${label}: 제출해도 캔버스 문서가 그대로다`, async () => {
      const P = await fixture(stack, alice, `submit-${mode === '뷰 모드' ? 'view' : 'edit'}`)
      await withTab(stack, async (page) => {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id="n_text0000001"]').waitFor()
        await page.getByRole('button', { name: mode }).click()
        const before = await read(page)
        await submitIn(page, form)
        const after = await settleRead(page, (value) => value.nodes === 0)
        expect({ before, after }).toEqual({ before, after: before })
      })
    })
  }

  it('뷰 모드 — 규칙 있는 폼: 제출이 규칙을 돌리고 캔버스 문서는 그대로다', async () => {
    const P = await fixture(stack, alice, 'submit-rule')
    await withTab(stack, async (page) => {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000001"]').waitFor()
      await page.getByRole('button', { name: '뷰 모드' }).click()
      const before = await read(page)
      await submitIn(page, 'n_form_rule01')
      const after = await settleRead(page, (value) => value.nodes === 0 || !value.targetShown)
      // 규칙(`setVisible` false)이 대상 글을 DOM 에서 뺀다 — 노드 하나가 준다.
      expect({ before, after }).toEqual({
        before: { ...before, targetShown: true },
        after: { ...before, nodes: before.nodes - 1, targetShown: false },
      })
    })
  })
})

interface Seen {
  /** iframe 문서의 주소 — 제출로 떠나면 `about:blank?` 가 된다. */
  frameUrl: string
  /** iframe 문서 안의 노드 수. 떠나면 0 이다. */
  nodes: number
  /** 규칙의 대상 글이 보이는가. */
  targetShown: boolean
  hostPath: string
}

async function read(page: Page): Promise<Seen> {
  const handle = await page.$('iframe.wb-shell-canvas-iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) throw new Error('캔버스 iframe 이 없다')
  return {
    frameUrl: frame.url(),
    nodes: await frame.evaluate(() => document.querySelectorAll('[data-wb-id]').length),
    targetShown: await frame.evaluate(() => document.querySelector('[data-wb-id="n_text0000001"]') !== null),
    hostPath: new URL(page.url()).pathname + new URL(page.url()).search,
  }
}

/** 조건이 설 때까지(최대 1.5s) 읽는다 — 서지 않아도 마지막 값을 돌려준다(떠나는 판을 기다리는 창). */
async function settleRead(page: Page, done: (value: Seen) => boolean): Promise<Seen> {
  const deadline = Date.now() + 1_500
  let value = await read(page)
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    value = await read(page)
  }
  return value
}

/** 폼 노드 안에 진짜 제출 단추를 심고 누른다. */
async function submitIn(page: Page, formId: string): Promise<void> {
  await canvasFrame(page)
    .locator(`[data-wb-id="${formId}"]`)
    .evaluate((form) => {
      const button = form.ownerDocument.createElement('button')
      button.type = 'submit'
      button.textContent = '제출 탐침'
      button.setAttribute('data-probe', '')
      form.appendChild(button)
    })
  await canvasFrame(page).locator('[data-probe]').click()
}

async function withTab(stack: EditorStack, run: (page: Page) => Promise<void>): Promise<void> {
  const { context, page } = await stack.openTab(stack.users.alice)
  try {
    await run(page)
  } finally {
    await context.close()
  }
}

/** `Page > [SearchForm(submit → 글 숨김), SearchForm(규칙 없음), Text]`. */
async function fixture(stack: EditorStack, owner: Session, slug: string): Promise<string> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: 'A1a', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P = `/projects/${project.id}/pages/${page.id}`
  const nodes = [
    {
      id: 'n_form_rule01',
      type: 'SearchForm',
      props: {},
      interactions: [{ on: 'submit', actions: [{ type: 'setVisible', target: 'n_text0000001', value: false }] }],
    },
    { id: 'n_form_bare01', type: 'SearchForm', props: {} },
    { id: 'n_text0000001', type: 'Text', props: { content: '숨을 글' } },
  ]
  const ops = nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return P
}
