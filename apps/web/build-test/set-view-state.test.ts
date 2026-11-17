/**
 * **상호작용 «화면 상태 바꾸기»(`setViewState`)를 실브라우저로 잰다**(설계 spec `2026-11-17-set-view-state-design.md` · 계획 Review Focus).
 *
 * | 판 | 재는 것 | Focus |
 * | --- | --- | --- |
 * | 뷰 모드 — 열고 닫기 | 상태가 숨긴 상세를 [등록] 이 열고 [취소] 가 기본으로 닫는다 · 셸 전환기가 그 상태를 보인다 | 1 |
 * | 뷰 모드 — 모드를 나가면 | 편집 모드에서 고른 «상세 열림» → 뷰 모드에서 [취소] 로 기본 → 편집 모드로 오면 «상세 열림» 으로 돌아간다 · 주소도 | 3 |
 * | 뷰 모드 — 나간 뒤 주소 | 기본에서 들어가 [등록] → 나가면 주소 `?state=` 가 걷히고 새로고침이 기본으로 연다 | RV-VS M1 |
 * | 뷰 모드 — 떠났다 돌아옴 | 뷰 모드 동안 다른 페이지에 갔다 돌아와 나가도 · 다른 페이지에서 나가도 그 페이지의 들어가기 전 고름이다 | RV-VS L1 |
 * | 뷰 모드 — 팝업 겹 | 팝업 안의 [더보기] 는 그 겹만 바꾸고 연 화면은 그대로 · 닫았다 다시 열면 기본 | 2 |
 * | 뷰 모드 — 지운 상태 | 대상 상태를 지우는 편집이 저장된다(경고) · 누르면 끊김 문장이 서고 화면은 그대로 | 4 |
 * | 번들 — 열고 닫기 | 1 과 같고 · 뷰어 고르개와 주소 해시가 따라간다 | 1 |
 * | 번들 — 팝업 겹 | 2 와 같다 | 2 |
 *
 * 나간 뒤 주소(`?state=`)의 축은 «나간 뒤 주소» 케이스가 갖는다 — 주소 맞춤(`shell/view-state-address.ts`)을 떼면 «모드를 나가면» · «떠났다
 * 돌아옴» 의 `search` 도 함께 죽는다. «떠났다 돌아옴» 은 페이지를 옮길 때 앞 페이지의 기록을 버리는 판에서 혼자 죽는다.
 *
 * 번들은 저장소 빌드의 산출물(api 가 `packages/*\/dist` 를 읽는다)로 그린다 — `pnpm build` 가 먼저다.
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

const button = (id: string, label: string, actions: unknown[]) => ({
  id,
  type: 'Button',
  props: { label },
  interactions: [{ on: 'click', actions }],
})

describe.skipIf(!전제.ok)('화면 상태 바꾸기 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let P: string
  let projectId: string
  /** 상태를 지우는 편집의 답 — Focus 4 의 «저장은 된다». */
  let removal: { status: number; warnings: string[] }

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    ;({ P, projectId, removal } = await fixture(stack, alice))
  }, 120_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  describe('에디터 뷰 모드', () => {
    it('Focus 1 — [등록] 이 상태가 숨긴 상세를 열고 [취소] 가 기본으로 닫는다 · 셸 전환기가 따라간다', async () => {
      await withView(stack, P, async (page, frame) => {
        const before = await screen(page, frame)
        await canvasFrame(page).locator('[data-wb-id="n_add"]').click()
        await settle(() => present(frame, '[data-wb-id="n_detail_text"]'))
        const opened = await screen(page, frame)
        // 판 카나리아 — 상세가 안 열렸으면 [취소] 가 없어 아래 누름이 판을 못 세운다.
        if (opened.detail) await canvasFrame(page).locator('[data-wb-id="n_cancel"]').click()
        await settle(async () => !(await present(frame, '[data-wb-id="n_detail"]')))
        const closed = await screen(page, frame)
        expect({ before, opened, closed }).toEqual({
          before: { detail: false, switcher: '화면 상태: 기본', notices: [] },
          opened: { detail: true, switcher: '화면 상태: 상세 열림', notices: [] },
          closed: { detail: false, switcher: '화면 상태: 기본', notices: [] },
        })
      })
    })

    it('Focus 3 — 뷰 모드에서 바꾼 상태는 모드를 나가면 들어가기 전 고름으로 돌아간다', async () => {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
        // 편집 모드에서 «상세 열림» 을 고른다 — 들어가기 전 고름.
        await switcher(page).click()
        await page.getByRole('menuitemradio', { name: '상세 열림' }).click()
        await canvasFrame(page).locator('[data-wb-id="n_detail_text"]').waitFor()
        await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        const frame = await canvasDocument(page)
        await canvasFrame(page).locator('[data-wb-id="n_cancel"]').click()
        await settle(async () => !(await present(frame, '[data-wb-id="n_detail"]')))
        const inView = { ...(await screen(page, frame)), search: search(page) }
        await toEdit(page)
        const edit = await canvasDocument(page)
        await settle(() => present(edit, '[data-wb-id="n_detail_text"]'))
        await settle(async () => search(page) === '?state=s_detail')
        const back = { ...(await screen(page, edit)), search: search(page) }
        expect({ inView, back }).toEqual({
          inView: { detail: false, switcher: '화면 상태: 기본', notices: [], search: '' },
          back: { detail: true, switcher: '화면 상태: 상세 열림', notices: [], search: '?state=s_detail' },
        })
      } finally {
        await context.close()
      }
    })

    it('RV-VS M1 — 기본에서 들어가 [등록] 한 뒤 나가면 주소의 `?state=` 도 걷히고 · 새로고침이 기본으로 연다', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_add"]').click()
        await settle(() => present(frame, '[data-wb-id="n_detail_text"]'))
        // 판 카나리아 — 뷰 모드가 주소에 상태를 실었다(나갈 때 걷을 것이 있다).
        await settle(async () => search(page) === '?state=s_detail')
        const inView = { ...(await screen(page, frame)), search: search(page) }
        await toEdit(page)
        const edit = await canvasDocument(page)
        await settle(async () => search(page) === '')
        const exit = { ...(await screen(page, edit)), search: search(page) }
        await page.reload()
        await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
        const reloaded = await canvasDocument(page)
        // 새로고침은 주소의 상태를 문서가 실린 뒤에 고른다 — 상세가 설 틈을 준다(기본이면 2s 를 기다리고 지난다).
        await settle(() => present(reloaded, '[data-wb-id="n_detail_text"]'))
        const reload = await screen(page, reloaded)
        expect({ inView, exit, reload }).toEqual({
          inView: { detail: true, switcher: '화면 상태: 상세 열림', notices: [], search: '?state=s_detail' },
          exit: { detail: false, switcher: '화면 상태: 기본', notices: [], search: '' },
          reload: { detail: false, switcher: '화면 상태: 기본', notices: [] },
        })
      })
    })

    it('RV-VS L1 — 뷰 모드 동안 다른 페이지에 갔다 돌아와 나가면 들어가기 전 고름 · 다른 페이지에서 나가면 그 페이지의 기본', async () => {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
        await switcher(page).click()
        await page.getByRole('menuitemradio', { name: '상세 열림' }).click()
        await canvasFrame(page).locator('[data-wb-id="n_detail_text"]').waitFor()
        await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await page.locator('.wb-shell-mode[aria-pressed="true"]', { hasText: '뷰 모드' }).waitFor()
        // 「다른」 에서 그 페이지의 상태를 바꾼 뒤 「목록」 으로 돌아온다 — 페이지를 옮기면 고름은 기본이다.
        await page.getByRole('link', { name: '다른', exact: true }).click()
        await canvasFrame(page).locator('[data-wb-id="n_b_add"]').click()
        await settle(async () => present(await canvasDocument(page), '[data-wb-id="n_b_detail"]'))
        const onOther = {
          bDetail: await present(await canvasDocument(page), '[data-wb-id="n_b_detail"]'),
          switcher: await switcher(page).getAttribute('aria-label'),
        }
        await page.getByRole('link', { name: '목록', exact: true }).click()
        await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
        const returned = await screen(page, await canvasDocument(page))
        await toEdit(page)
        const edit = await canvasDocument(page)
        await settle(() => present(edit, '[data-wb-id="n_detail_text"]'))
        await settle(async () => search(page) === '?state=s_detail')
        const exit = { ...(await screen(page, edit)), search: search(page) }
        // 「다른」 에서 나간다 — 그 페이지는 뷰 모드 전에 고른 것이 없다.
        await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await page.locator('.wb-shell-mode[aria-pressed="true"]', { hasText: '뷰 모드' }).waitFor()
        await page.getByRole('link', { name: '다른', exact: true }).click()
        await canvasFrame(page).locator('[data-wb-id="n_b_add"]').click()
        await settle(async () => search(page) === '?state=s_detail')
        const otherInView = { bDetail: await present(await canvasDocument(page), '[data-wb-id="n_b_detail"]'), search: search(page) }
        await toEdit(page)
        await settle(async () => search(page) === '')
        const otherExit = {
          bDetail: await present(await canvasDocument(page), '[data-wb-id="n_b_detail"]'),
          switcher: await switcher(page).getAttribute('aria-label'),
          search: search(page),
        }
        expect({ onOther, returned, exit, otherInView, otherExit }).toEqual({
          onOther: { bDetail: true, switcher: '화면 상태: B 상세' },
          returned: { detail: false, switcher: '화면 상태: 기본', notices: [] },
          exit: { detail: true, switcher: '화면 상태: 상세 열림', notices: [], search: '?state=s_detail' },
          otherInView: { bDetail: true, search: '?state=s_detail' },
          otherExit: { bDetail: false, switcher: '화면 상태: 기본', search: '' },
        })
      } finally {
        await context.close()
      }
    })

    it('Focus 2 — 팝업 안의 상태 바꾸기는 그 겹만 바꾸고 연 화면은 그대로 · 닫았다 다시 열면 기본', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame] [data-wb-id="n_more"]').waitFor()
        const first = await popupExtra(frame)
        await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-id="n_more"]').click()
        await settle(() => popupExtra(frame))
        const changed = { popup: await popupExtra(frame), page: await screen(page, frame) }
        await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-zone="footer"] button', { hasText: '취소' }).click()
        await frame.locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame] [data-wb-id="n_more"]').waitFor()
        const reopened = await popupExtra(frame)
        expect({ first, changed, reopened }).toEqual({
          first: false,
          changed: { popup: true, page: { detail: false, switcher: '화면 상태: 기본', notices: [] } },
          reopened: false,
        })
      })
    })

    it('Focus 4 — 대상 상태를 지우는 편집은 저장되고(경고) · 누르면 끊김 문장이 서고 화면은 그대로', async () => {
      expect(removal).toEqual({ status: 200, warnings: ['view-state-missing'] })
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_ghost"]').click()
        await settle(async () => (await page.locator('.wb-shell-canvas-runtime-item').count()) > 0)
        expect(await screen(page, frame)).toEqual({
          detail: false,
          switcher: '화면 상태: 기본',
          notices: ['setViewState의 대상 상태가 페이지의 상태 목록에 없습니다: s_temp'],
        })
      })
    })
  })

  describe('HTML 번들', () => {
    let bundle: UnpackedBundle

    beforeAll(async () => {
      if (!전제.ok) return
      bundle = await exportBundle(stack, alice, projectId)
    }, 120_000)

    afterAll(() => bundle?.dispose())

    it('Focus 1 — [등록] 이 상세를 열고 [취소] 가 닫는다 · 뷰어 고르개와 주소 해시가 따라간다', async () => {
      const { context, page } = await openBundlePage(stack, bundle.pages['관리자-목록']!, { viewport: { width: 1280, height: 800 } })
      try {
        const before = await bundleScreen(page)
        await page.locator('.wb-export-canvas [data-wb-id="n_add"]').click()
        await settle(() => present(page.mainFrame(), '.wb-export-canvas [data-wb-id="n_detail_text"]'))
        const opened = await bundleScreen(page)
        if (opened.detail) await page.locator('.wb-export-canvas [data-wb-id="n_cancel"]').click()
        await settle(async () => !(await present(page.mainFrame(), '.wb-export-canvas [data-wb-id="n_detail"]')))
        const closed = await bundleScreen(page)
        expect({ before, opened, closed }).toEqual({
          before: { detail: false, select: 'default', hash: '' },
          opened: { detail: true, select: 's_detail', hash: '#state=s_detail' },
          closed: { detail: false, select: 'default', hash: '' },
        })
      } finally {
        await context.close()
      }
    })

    it('Focus 2 — 팝업 안의 상태 바꾸기는 그 겹만 · 닫았다 다시 열면 기본', async () => {
      const { context, page } = await openBundlePage(stack, bundle.pages['관리자-목록']!, { viewport: { width: 1280, height: 800 } })
      try {
        await page.locator('.wb-export-canvas [data-wb-id="n_open"]').click()
        await page.locator('[data-wb-popup-frame] [data-wb-id="n_more"]').waitFor()
        const first = await popupExtra(page.mainFrame())
        await page.locator('[data-wb-popup-frame] [data-wb-id="n_more"]').click()
        await settle(() => popupExtra(page.mainFrame()))
        const changed = { popup: await popupExtra(page.mainFrame()), page: await bundleScreen(page) }
        await page.locator('[data-wb-popup-frame] [data-wb-zone="footer"] button', { hasText: '취소' }).click()
        await page.locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
        await page.locator('.wb-export-canvas [data-wb-id="n_open"]').click()
        await page.locator('[data-wb-popup-frame] [data-wb-id="n_more"]').waitFor()
        const reopened = await popupExtra(page.mainFrame())
        expect({ first, changed, reopened }).toEqual({
          first: false,
          changed: { popup: true, page: { detail: false, select: 'default', hash: '' } },
          reopened: false,
        })
      } finally {
        await context.close()
      }
    })
  })
})

/**
 * 누른 뒤 판이 설 때까지 기다린다 — `done` 이 참이 되거나 2s 가 지나면 돌아온다(**던지지 않는다**). 단언은 그 뒤에 값으로 한다 — 바뀌어야 할 것을
 * 기다림의 끝 조건으로 던지게 두면 그것을 깨는 변조가 값이 아니라 시간 초과로 죽는다.
 */
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

/** 주소의 질의 — 화면 상태는 `?state=<id>` 다. */
function search(page: Page): string {
  return new URL(page.url()).search
}

async function toEdit(page: Page): Promise<void> {
  await page.getByRole('button', { name: '편집 모드', exact: true }).click()
  await page.locator('.wb-shell-mode[aria-pressed="true"]', { hasText: '편집 모드' }).waitFor()
}

function switcher(page: Page) {
  return page.locator('button[aria-label^="화면 상태: "]')
}

/** 연 화면의 모습 — 상세(상태가 숨긴 카드)가 섰는가 · 셸 전환기의 이름 · 캔버스 알림 줄. */
async function screen(page: Page, frame: Frame): Promise<{ detail: boolean; switcher: string | null; notices: string[] }> {
  const detail = await frame.evaluate(
    () =>
      document.querySelector('[data-wb-id="n_detail"]') !== null &&
      document.querySelector('[data-wb-popup-layer] [data-wb-id="n_detail"]') === null,
  )
  return {
    detail,
    switcher: await switcher(page).getAttribute('aria-label'),
    notices: await page.locator('.wb-shell-canvas-runtime-item').allTextContents(),
  }
}

/** 번들 화면의 모습 — 상세가 섰는가 · 뷰어 고르개 값 · 주소 해시. */
async function bundleScreen(page: Page): Promise<{ detail: boolean; select: string; hash: string }> {
  return page.evaluate(() => ({
    detail:
      document.querySelector('.wb-export-canvas > * [data-wb-id="n_detail"], .wb-export-canvas > [data-wb-id="n_detail"]') !== null &&
      document.querySelector('[data-wb-popup-layer] [data-wb-id="n_detail"]') === null,
    select: (document.querySelector('.wb-export-state-select') as HTMLSelectElement | null)?.value ?? '',
    hash: location.hash,
  }))
}

/** 맨 위 팝업 겹에 «추가 칸»(팝업의 상태가 숨긴 노드)이 섰는가. */
async function popupExtra(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => document.querySelector('[data-wb-popup-frame] [data-wb-id="n_extra"]') !== null)
}

async function canvasDocument(page: Page): Promise<Frame> {
  const handle = await page.$('iframe.wb-shell-canvas-iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) throw new Error('캔버스 iframe 이 없다')
  return frame
}

/** 페이지(`path`)를 열어 뷰 모드로 두고 캔버스 문서의 Frame 을 넘긴다. */
async function withView(stack: EditorStack, path: string, run: (page: Page, frame: Frame) => Promise<void>): Promise<void> {
  const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(path)
    await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
    await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
    await run(page, await canvasDocument(page))
  } finally {
    await context.close()
  }
}

/**
 * 메뉴 «관리자» 아래 — «목록»(화면: 상태 «상세 열림» · «임시» · [등록] · 상세 카드(상세 열림에서만 — 안에 [취소]) · [팝업 열기] · [끊긴 열기](임시로))
 * · «팝업»(팝업: 상태 «더보기»(id 는 연 화면의 «상세 열림» 과 같은 `s_detail`) · [더보기] · 추가 칸(더보기에서만))
 * · «다른»(화면: 상태 «B 상세»(id `s_detail`) · [B 등록] · B 상세 글(B 상세에서만)). 픽스처를 세운 뒤 «임시» 를 목록에서 지운다 — [끊긴 열기] 만 그것을 가리킨다.
 */
async function fixture(
  stack: EditorStack,
  owner: Session,
): Promise<{ P: string; projectId: string; removal: { status: number; warnings: string[] } }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const ok = (response: { status: number; body: any }, what: string) => {
    if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }
  const project = ok(await call('POST', '/projects', { name: '상태 바꾸기', slug: `vs-${Date.now().toString(36)}` }), '프로젝트')
  const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
  const list = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '목록', kind: 'page' }), '목록')
  const popup = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '팝업', kind: 'popup' }), '팝업')
  const other = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '다른', kind: 'page' }), '다른')
  const listOps = [
    {
      op: 'add',
      path: '/viewStates',
      value: [
        { id: 's_detail', name: '상세 열림' },
        { id: 's_temp', name: '임시' },
      ],
    },
    { op: 'add', path: '/root/children/0', value: { id: 'n_list', type: 'Text', props: { content: '목록' } } },
    { op: 'add', path: '/root/children/1', value: button('n_add', '등록', [{ type: 'setViewState', target: 's_detail' }]) },
    {
      op: 'add',
      path: '/root/children/2',
      value: {
        id: 'n_detail',
        type: 'Card',
        props: { title: '상세' },
        visibility: { mode: 'only', states: ['s_detail'] },
        children: [
          { id: 'n_detail_text', type: 'Text', props: { content: '상세 폼' } },
          button('n_cancel', '취소', [{ type: 'setViewState', target: 'default' }]),
        ],
      },
    },
    { op: 'add', path: '/root/children/3', value: button('n_open', '팝업 열기', [{ type: 'openModal', target: 'page:관리자/팝업' }]) },
    { op: 'add', path: '/root/children/4', value: button('n_ghost', '끊긴 열기', [{ type: 'setViewState', target: 's_temp' }]) },
  ]
  ok(await call('PATCH', `/projects/${project.id}/pages/${list.id}/ops`, { baseSeq: 0, ops: listOps }), 'ops 목록')
  const popupOps = [
    // 상태 id 는 문서마다다 — 연 화면의 «상세 열림» 과 같은 글자로 지어, 팝업의 상태 바꾸기가 연 화면으로 새면 연 화면의 상세가 열린다.
    { op: 'add', path: '/viewStates', value: [{ id: 's_detail', name: '더보기' }] },
    { op: 'add', path: '/root/children/0', value: button('n_more', '더보기', [{ type: 'setViewState', target: 's_detail' }]) },
    {
      op: 'add',
      path: '/root/children/1',
      value: { id: 'n_extra', type: 'Text', props: { content: '추가 칸' }, visibility: { mode: 'only', states: ['s_detail'] } },
    },
  ]
  ok(await call('PATCH', `/projects/${project.id}/pages/${popup.id}/ops`, { baseSeq: 0, ops: popupOps }), 'ops 팝업')
  // «다른» 의 상태 id 도 «목록» 과 같은 글자다 — 떠났다 돌아온 판이 페이지 id 가 아니라 글자로 되돌리면 섞인다.
  const otherOps = [
    { op: 'add', path: '/viewStates', value: [{ id: 's_detail', name: 'B 상세' }] },
    { op: 'add', path: '/root/children/0', value: button('n_b_add', 'B 등록', [{ type: 'setViewState', target: 's_detail' }]) },
    {
      op: 'add',
      path: '/root/children/1',
      value: { id: 'n_b_detail', type: 'Text', props: { content: 'B 상세 글' }, visibility: { mode: 'only', states: ['s_detail'] } },
    },
  ]
  ok(await call('PATCH', `/projects/${project.id}/pages/${other.id}/ops`, { baseSeq: 0, ops: otherOps }), 'ops 다른')
  // «임시» 를 지운다 — 보임은 안 가리키고 [끊긴 열기] 의 액션만 가리킨다.
  const removed = await call('PATCH', `/projects/${project.id}/pages/${list.id}/ops`, {
    baseSeq: 1,
    ops: [{ op: 'remove', path: '/viewStates/1' }],
  })
  const warnings = ((removed.body?.warnings ?? []) as { code: string }[]).map((issue) => issue.code)
  return { P: `/projects/${project.id}/pages/${list.id}`, projectId: project.id, removal: { status: removed.status, warnings } }
}
