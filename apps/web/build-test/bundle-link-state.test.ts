/**
 * **링크(`Link` — 기본 뷰가 `<a href="#…">` 를 그린다)를 눌러 «화면 상태 바꾸기» 가 돈 판을 실브라우저로 잰다** — 번들과 에디터 뷰 모드.
 *
 * 번들에서 링크를 누르면 규칙이 상태를 바꾸고 해시를 `#state=…` 로 쓴 뒤, 앵커의 기본 동작이 주소를 `#` 로 바꿔 `hashchange` 가 나고
 * 뷰어(`packages/exporter/src/browser/boot.tsx` 의 `wireStatePicker`)가 `#` 를 «기본» 으로 읽어 상태를 되돌렸다. 규칙이 걸린 누름이면
 * 앵커의 기본 동작을 막는다(`packages/renderer/src/render.tsx` 의 `handlersFor`).
 *
 * | 판 | 재는 것 |
 * | --- | --- |
 * | 링크 자신에 규칙 | 상세가 서고 해시 · 고르개가 그 상태다 |
 * | 링크를 품은 그리드 행에 규칙 | 같다 — 규칙은 조상의 것이고 앵커는 규칙이 없다 |
 * | «페이지 이동» 링크 | 그 장 파일로 간다(막기가 이동을 막지 않는다) |
 * | «팝업 열기» 링크 | 상태를 고른 뒤 눌러도 팝업이 서고 상태 · 해시가 그대로다 |
 * | 규칙 없는 링크 | 앵커의 기본 동작이 그대로다(주소 끝이 `#`) |
 * | 상태를 고른 뒤 규칙 없는 링크 | 빈 조각(`…#`)을 뷰어가 상태로 안 읽어 상세 · 고르개가 그대로다(`boot.tsx` 머리말 «빈 조각») |
 * | 뒤로 가기로 해시 없는 주소 | 기본이다 — 빈 조각과 조각 없는 주소는 `location.hash` 가 둘 다 빈 글자라 주소 끝으로 가른 경계다 |
 *
 * 에디터 뷰 모드는 캔버스 iframe 이 해시로 상태를 안 읽어 막기 전에도 상태가 안 떨어진다 — 세 링크 판을 잠금으로 둔다.
 *
 * 번들은 저장소 빌드의 산출물(api 가 `packages/*\/dist` 를 읽는다)로 그린다 — `pnpm build` 가 먼저다. 에디터 뷰 모드도 `dist` 를 읽는다(vite 에
 * 별칭이 없다).
 */
import type { Frame, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage, type UnpackedBundle } from './layout-bundle'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const OPEN = [{ type: 'setViewState', target: 's_detail' }]
const link = (id: string, label: string, interactions?: unknown[]) => ({
  id,
  type: 'Link',
  props: { label },
  ...(interactions === undefined ? {} : { interactions }),
})

describe.skipIf(!전제.ok)('링크를 눌러 화면 상태 바꾸기 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let P: string
  let projectId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    ;({ P, projectId } = await fixture(stack, alice))
  }, 120_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  describe('HTML 번들', () => {
    let bundle: UnpackedBundle

    beforeAll(async () => {
      if (!전제.ok) return
      bundle = await exportBundle(stack, alice, projectId)
    }, 120_000)

    afterAll(() => bundle?.dispose())

    for (const [name, nodeId] of [
      ['링크 자신에 규칙', 'n_self'],
      ['링크를 품은 그리드 행에 규칙', 'n_inrow'],
    ] as const) {
      it(`${name} — 누르면 상세가 서고 해시 · 고르개가 그 상태다`, async () => {
        await withBundle(stack, bundle, async (page) => {
          const target = page.locator(`.wb-export-canvas [data-wb-id="${nodeId}"]`)
          // 판 카나리아 — 누를 링크가 하나이고 앵커다.
          const shape = { count: await target.count(), tag: await target.first().evaluate((el) => el.tagName) }
          const before = await bundleScreen(page)
          await target.click()
          // 앵커의 기본 동작(`hashchange`)이 상태를 되돌리는 것은 누른 뒤다 — 해시가 굳을 틈을 준다.
          await settle(async () => (await bundleScreen(page)).detail)
          await page.waitForTimeout(300)
          expect({ shape, before, after: await bundleScreen(page) }).toEqual({
            shape: { count: 1, tag: 'A' },
            before: { detail: false, select: 'default', hash: '' },
            after: { detail: true, select: 's_detail', hash: '#state=s_detail' },
          })
        })
      })
    }

    it('«페이지 이동» 링크 — 그 장 파일로 간다', async () => {
      await withBundle(stack, bundle, async (page) => {
        const from = page.url()
        await page.locator('.wb-export-canvas [data-wb-id="n_go"]').click()
        await settle(async () => page.url() !== from && /관리자-다른\.html/.test(decodeURIComponent(page.url())))
        await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
        const url = decodeURIComponent(page.url())
        expect({ file: url.slice(url.lastIndexOf('/') + 1), other: await page.locator('[data-wb-id="n_other"]').count() }).toEqual({
          file: '관리자-다른.html',
          other: 1,
        })
      })
    })

    it('규칙 없는 링크 — 앵커의 기본 동작이 그대로다(주소 끝이 `#`)', async () => {
      await withBundle(stack, bundle, async (page) => {
        await page.locator('.wb-export-canvas [data-wb-id="n_plain"]').click()
        // 빈 조각(`…#`)의 `location.hash` 는 빈 글자다 — 주소 끝으로 읽는다.
        const emptyFragment = (): Promise<boolean> => page.evaluate(() => location.href.endsWith('#'))
        await settle(emptyFragment)
        expect({ ...(await bundleScreen(page)), emptyFragment: await emptyFragment() }).toEqual({
          detail: false,
          select: 'default',
          hash: '',
          emptyFragment: true,
        })
      })
    })

    it('«팝업 열기» 링크 — 상태를 고른 뒤 누르면 팝업이 서고 상세 · 고르개 · 해시가 그 상태다', async () => {
      await withBundle(stack, bundle, async (page) => {
        await page.locator('.wb-export-state-select').selectOption('s_detail')
        await page.locator('.wb-export-canvas [data-wb-id="n_modal"]').click()
        const popupShown = (): Promise<boolean> =>
          page.evaluate(() => document.querySelector('[data-wb-popup-frame] [data-wb-id="n_pop"]') !== null)
        await settle(popupShown)
        await page.waitForTimeout(300)
        expect({ popup: await popupShown(), screen: await bundleScreen(page) }).toEqual({
          popup: true,
          screen: { detail: true, select: 's_detail', hash: '#state=s_detail' },
        })
      })
    })

    it('규칙 없는 링크 — 상태를 고른 뒤 눌러도 상세 · 고르개가 그 상태다', async () => {
      await withBundle(stack, bundle, async (page) => {
        await page.locator('.wb-export-state-select').selectOption('s_detail')
        const before = await bundleScreen(page)
        await page.locator('.wb-export-canvas [data-wb-id="n_plain"]').click()
        // 판 카나리아 — 앵커의 기본 동작이 돌아 주소가 빈 조각이 됐다(그 `hashchange` 가 재려는 입력이다).
        const emptyFragment = (): Promise<boolean> => page.evaluate(() => location.href.endsWith('#'))
        await settle(emptyFragment)
        await page.waitForTimeout(300)
        expect({ before, after: await bundleScreen(page), emptyFragment: await emptyFragment() }).toEqual({
          before: { detail: true, select: 's_detail', hash: '#state=s_detail' },
          after: { detail: true, select: 's_detail', hash: '' },
          emptyFragment: true,
        })
      })
    })

    it('뒤로 가기로 상태 해시에서 해시 없는 주소에 돌아오면 기본이다', async () => {
      await withBundle(stack, bundle, async (page) => {
        // 상태 고르기는 주소를 바꿔 쓰기만 한다(`replaceState`) — 뒤로 갈 자리를 만들려고 해시를 옮긴다(링크 · 주소창과 같은 이동).
        await page.evaluate(() => {
          location.hash = 'state=s_detail'
        })
        await settle(async () => (await bundleScreen(page)).detail)
        const forward = await bundleScreen(page)
        await page.goBack({ waitUntil: 'commit' })
        await settle(async () => !(await bundleScreen(page)).detail)
        await page.waitForTimeout(300)
        expect({ forward, back: await bundleScreen(page), emptyFragment: await page.evaluate(() => location.href.endsWith('#')) }).toEqual({
          forward: { detail: true, select: 's_detail', hash: '#state=s_detail' },
          back: { detail: false, select: 'default', hash: '' },
          emptyFragment: false,
        })
      })
    })
  })

  describe('에디터 뷰 모드', () => {
    for (const [name, nodeId] of [
      ['링크 자신에 규칙', 'n_self'],
      ['링크를 품은 그리드 행에 규칙', 'n_inrow'],
    ] as const) {
      it(`${name} — 누르면 상세가 서고 셸 전환기가 그 상태다`, async () => {
        const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
        try {
          await page.goto(P)
          await canvasFrame(page).locator('[data-wb-id="n_self"]').waitFor()
          await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
          await page.locator('.wb-shell-mode[aria-pressed="true"]', { hasText: '뷰 모드' }).waitFor()
          const frame = await canvasDocument(page)
          await canvasFrame(page).locator(`[data-wb-id="${nodeId}"]`).click()
          await settle(() => present(frame, '[data-wb-id="n_detail"]'))
          await page.waitForTimeout(300)
          expect({
            detail: await present(frame, '[data-wb-id="n_detail"]'),
            switcher: await page.locator('button[aria-label^="화면 상태: "]').getAttribute('aria-label'),
          }).toEqual({ detail: true, switcher: '화면 상태: 상세 열림' })
        } finally {
          await context.close()
        }
      })
    }

    it('규칙 없는 링크 — 상태를 고른 뒤 눌러도 상세 · 셸 전환기가 그 상태다', async () => {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id="n_self"]').waitFor()
        await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await page.locator('.wb-shell-mode[aria-pressed="true"]', { hasText: '뷰 모드' }).waitFor()
        await page.getByRole('button', { name: /^화면 상태:/ }).click()
        await page.getByRole('menuitemradio', { name: '상세 열림', exact: true }).click()
        const frame = await canvasDocument(page)
        await settle(() => present(frame, '[data-wb-id="n_detail"]'))
        const screen = async () => ({
          detail: await present(frame, '[data-wb-id="n_detail"]'),
          switcher: await page.locator('button[aria-label^="화면 상태: "]').getAttribute('aria-label'),
        })
        const before = await screen()
        await canvasFrame(page).locator('[data-wb-id="n_plain"]').click()
        await page.waitForTimeout(500)
        expect({ before, after: await screen() }).toEqual({
          before: { detail: true, switcher: '화면 상태: 상세 열림' },
          after: { detail: true, switcher: '화면 상태: 상세 열림' },
        })
      } finally {
        await context.close()
      }
    })
  })
})

/** 누른 뒤 판이 설 때까지 기다린다 — 참이 되거나 2s 가 지나면 돌아온다(**던지지 않는다**). 단언은 그 뒤에 값으로 한다. */
async function settle(done: () => Promise<boolean>, ms = 2000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await done()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function present(frame: Frame, selector: string): Promise<boolean> {
  return frame.evaluate((css) => document.querySelector(css) !== null, selector)
}

/** 번들 화면의 모습 — 상세(상태가 숨긴 글)가 섰는가 · 뷰어 고르개 값 · 주소 해시. */
async function bundleScreen(page: Page): Promise<{ detail: boolean; select: string; hash: string }> {
  return page.evaluate(() => ({
    detail: document.querySelector('.wb-export-canvas [data-wb-id="n_detail"]') !== null,
    select: (document.querySelector('.wb-export-state-select') as HTMLSelectElement | null)?.value ?? '',
    hash: location.hash,
  }))
}

async function withBundle(stack: EditorStack, bundle: UnpackedBundle, run: (page: Page) => Promise<void>): Promise<void> {
  const { context, page } = await openBundlePage(stack, bundle.pages['관리자-목록']!, { viewport: { width: 1280, height: 800 } })
  try {
    await run(page)
  } finally {
    await context.close()
  }
}

async function canvasDocument(page: Page): Promise<Frame> {
  const handle = await page.$('iframe.wb-shell-canvas-iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) throw new Error('캔버스 iframe 이 없다')
  return frame
}

/**
 * 메뉴 «관리자» 아래 — «목록»(상태 «상세 열림» · 상세 글(상세 열림에서만) · 규칙 든 링크 · 그리드(행에 규칙 · 칸에 규칙 없는 링크) · «페이지 이동»
 * 링크 · 규칙 없는 링크 · «팝업 열기» 링크) · «다른»(글 하나) · «팝업»(글 하나).
 */
async function fixture(stack: EditorStack, owner: Session): Promise<{ P: string; projectId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const ok = (response: { status: number; body: any }, what: string) => {
    if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }
  const project = ok(await call('POST', '/projects', { name: '링크 상태', slug: `bl-${Date.now().toString(36)}` }), '프로젝트')
  const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
  const list = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '목록', kind: 'page' }), '목록')
  const other = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '다른', kind: 'page' }), '다른')
  const popup = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '팝업', kind: 'popup' }), '팝업')
  const grid = {
    id: 'n_grid',
    type: 'DataGrid',
    props: {},
    children: [
      { id: 'n_col', type: 'GridColumn', props: { label: '제목' }, children: [link('n_inrow', '행 링크')] },
      { id: 'n_col2', type: 'GridColumn', props: { label: '값' }, children: [{ id: 'n_cell', type: 'Text', props: { content: '값' } }] },
    ],
    zones: { rows: [{ id: 'n_row', type: 'GridRow', props: { repeat: 1 }, interactions: [{ on: 'click', actions: OPEN }] }] },
  }
  const nodes = [
    { id: 'n_detail', type: 'Text', props: { content: '상세' }, visibility: { mode: 'only', states: ['s_detail'] } },
    link('n_self', '자기 링크', [{ on: 'click', actions: OPEN }]),
    grid,
    link('n_go', '다른으로', [{ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/다른' }] }]),
    link('n_plain', '그냥 링크'),
    link('n_modal', '팝업으로', [{ on: 'click', actions: [{ type: 'openModal', target: 'page:관리자/팝업' }] }]),
  ]
  ok(
    await call('PATCH', `/projects/${project.id}/pages/${list.id}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/viewStates', value: [{ id: 's_detail', name: '상세 열림' }] },
        ...nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value })),
      ],
    }),
    'ops 목록',
  )
  ok(
    await call('PATCH', `/projects/${project.id}/pages/${other.id}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_other', type: 'Text', props: { content: '다른 장' } } }],
    }),
    'ops 다른',
  )
  ok(
    await call('PATCH', `/projects/${project.id}/pages/${popup.id}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_pop', type: 'Text', props: { content: '팝업 글' } } }],
    }),
    'ops 팝업',
  )
  return { P: `/projects/${project.id}/pages/${list.id}`, projectId: project.id }
}
