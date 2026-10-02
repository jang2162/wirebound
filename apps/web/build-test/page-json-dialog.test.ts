/**
 * **페이지 JSON 의 두 입구를 실브라우저로 잰다** — 메뉴 줄 `+`의 «JSON 에서 가져오기…»가 여는 모달(`src/panels/page-import-dialog.tsx`)과 페이지
 * 줄 `…`의 «JSON 내보내기»(`src/panels/page-json-export.ts`). jsdom 은 `showModal` · 진짜 파일 칸 · 내려받기를 못 잰다
 * (`test/panels/page-json.test.tsx`는 대역까지다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 가져오기 | 줄 `+`가 그 메뉴를 대상으로 상자를 열지 않는다 · 파일 칸이 고른 파일을 안 읽는다 · 상자 단추의 `Delete`가 뒤 트리의 삭제 확인을 건다 · 성공해도 상자가 남거나 새 페이지로 안 옮긴다 · 결과가 하단 바에 안 선다 |
 * | 보내는 중 닫기 | 보내는 동안 «취소»가 켜져 있다 · Escape 가 상자를 못 닫는다 · 닫은 상자의 성공이 새 페이지로 옮긴다 · 결과가 하단 바에 안 선다 |
 * | 내보내기 | 받은 파일이 그 줄의 페이지가 아니다(열린 페이지를 낸다) · 내려받기가 안 난다 |
 */
import { readFile } from 'node:fs/promises'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('페이지 JSON — 가져오기 상자 · 내보내기 — 실브라우저', () => {
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

  /**
   * 빈 메뉴(«가져올 곳» — 지울 수 있는 메뉴라 상자 밖으로 `Delete`가 새면 삭제 확인이 선다)의 줄 `+`로 상자를 열고, 진짜 파일 칸에
   * `setInputFiles`로 파일을 준다. 판 카나리아: 상자 밖에서 그 메뉴를 고르고 친 `Delete`는 확인을 건다(아래 `대조`).
   */
  it('메뉴 줄 `+` → «JSON 에서 가져오기…» → 파일 → 미리보기 → 가져오기 → 새 페이지 · 하단 바 통지', async () => {
    const { projectId, P, ids } = await fixture('import')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await rowLabel(page, ids.target).waitFor()

      // 대조 — 상자 밖(트리)에서 그 메뉴를 고르고 친 Delete 는 삭제 확인을 건다. 이것이 아래 «0»의 분모다.
      await row(page, ids.target).getByRole('button', { name: '가져올 곳', exact: true }).click()
      await page.keyboard.press('Delete')
      const 대조 = await page.getByRole('button', { name: '정말 삭제합니까?', exact: true }).count()
      await page.keyboard.press('Escape')

      await openImport(page, ids.target)
      const dialog = page.getByRole('dialog', { name: '페이지 가져오기 — 가져올 곳 메뉴로', exact: true })
      await dialog.waitFor()

      // 상자 안 단추에 포커스를 두고 Delete — 모달 · 형제 자리라 뒤 트리의 삭제 확인이 안 선다.
      await dialog.getByRole('button', { name: 'JSON 직접 붙여 넣기' }).focus()
      await page.keyboard.press('Delete')
      const 상자_안_Delete = await page.getByRole('button', { name: '정말 삭제합니까?', exact: true }).count()

      await dialog.getByLabel('페이지 파일', { exact: true }).setInputFiles({
        name: 'from-disk.wirebound-page.json',
        mimeType: 'application/json',
        buffer: Buffer.from(pageFile('디스크에서 온 목록')),
      })
      const status = await poll('미리보기', () => dialog.getByRole('status').textContent(), (text) => (text ?? '').includes('디스크에서 온 목록'))
      const before = new URL(page.url()).pathname
      await dialog.getByRole('button', { name: '가져오기', exact: true }).click()

      const after = await poll('새 페이지로 옮긴다', async () => new URL(page.url()).pathname, (path) => path !== before)
      const notice = await poll('하단 바 통지', () => page.locator('.wb-shell-footer-notices').innerText(), (text) => text.includes('가져왔습니다'))
      const tree = (await stack.request(alice, 'GET', `/projects/${projectId}/tree`)).body.menu as { id: string; pages: { id: string; title: string }[] }[]
      const target = tree.find((menu) => menu.id === ids.target)

      expect({
        대조,
        상자_안_Delete,
        status: (status ?? '').replace(/\s+/g, ' ').trim(),
        상자: await page.locator('dialog[open]').count(),
        옮겨_간_곳: after === `/projects/${projectId}/pages/${target?.pages[0]?.id}`,
        대상_메뉴의_페이지: target?.pages.map((p) => p.title),
        통지: notice.includes('가져왔습니다: 디스크에서 온 목록 — 코멘트 1개'),
      }).toEqual({
        대조: 1,
        상자_안_Delete: 0,
        status: '디스크에서 온 목록 — 노드 2개, 코멘트 1개',
        상자: 0,
        옮겨_간_곳: true,
        대상_메뉴의_페이지: ['디스크에서 온 목록'],
        통지: true,
      })
    } finally {
      await context.close()
    }
  })

  /**
   * 가져오기 요청을 늦춰(`page.route`) 보내는 동안의 상자를 본다 — «취소»는 꺼지고(보낸 요청은 못 멈춘다), Escape 는 상자를 닫는다(사람을
   * 가두지 않는다). 닫은 상자의 답은 페이지를 만들되 사람을 옮기지 않고 하단 바에 결과만 남긴다. 판 카나리아: 요청이 실제로 늦춰진 동안
   * 단추가 «가져오는 중…»이다(`보내는_중`).
   */
  it('보내는 중 «취소»는 꺼지고, Escape 로 닫은 상자의 성공은 새 페이지로 옮기지 않고 하단 바 통지만 남긴다', async () => {
    const { projectId, P, ids } = await fixture('close')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      let release: (() => void) | undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      let requests = 0
      await page.route('**/pages/import', async (route) => {
        requests += 1
        await held
        await route.continue()
      })
      await page.goto(P)
      await rowLabel(page, ids.target).waitFor()
      await openImport(page, ids.target)
      const dialog = page.getByRole('dialog', { name: '페이지 가져오기 — 가져올 곳 메뉴로', exact: true })
      await dialog.waitFor()
      await dialog.getByLabel('페이지 파일', { exact: true }).setInputFiles({
        name: 'closed.wirebound-page.json',
        mimeType: 'application/json',
        buffer: Buffer.from(pageFile('닫은 상자의 목록')),
      })
      await poll('미리보기', () => dialog.getByRole('status').textContent(), (text) => (text ?? '').includes('닫은 상자의 목록'))
      await dialog.getByRole('button', { name: '가져오기', exact: true }).click()
      await poll('요청이 붙잡혔다', async () => requests, (n) => n === 1)

      const 보내는_중 = await dialog.getByRole('button', { name: '가져오는 중…', exact: true }).count()
      const 취소_꺼짐 = await dialog.getByRole('button', { name: '취소', exact: true }).isDisabled()
      const 닫기_꺼짐 = await dialog.getByRole('button', { name: '닫기', exact: true }).isDisabled()
      await page.keyboard.press('Escape')
      const 닫힌_뒤_상자 = await page.locator('dialog[open]').count()

      release?.()
      const notice = await poll('하단 바 통지', () => page.locator('.wb-shell-footer-notices').innerText(), (text) => text.includes('가져왔습니다'))
      // 트리가 다시 받혀 새 줄이 선 뒤에 주소를 본다 — 옮기는 일은 다시 받은 뒤에 돈다(`useTreeCommands`의 `run`).
      const tree = (await stack.request(alice, 'GET', `/projects/${projectId}/tree`)).body.menu as { id: string; pages: { id: string; title: string }[] }[]
      const made = tree.find((menu) => menu.id === ids.target)?.pages[0]
      await rowLabel(page, made?.id ?? '').waitFor()

      expect({
        보내는_중,
        취소_꺼짐,
        닫기_꺼짐,
        닫힌_뒤_상자,
        요청: requests,
        만든_페이지: made?.title,
        주소: new URL(page.url()).pathname,
        통지: notice.includes('가져왔습니다: 닫은 상자의 목록 — 코멘트 1개'),
      }).toEqual({
        보내는_중: 1,
        취소_꺼짐: true,
        닫기_꺼짐: false,
        닫힌_뒤_상자: 0,
        요청: 1,
        만든_페이지: '닫은 상자의 목록',
        주소: P,
        통지: true,
      })
    } finally {
      await context.close()
    }
  })

  /**
   * «둘째»를 연 채 «첫째» 줄의 `…`에서 내보낸다 — 받은 파일이 열린 페이지(«둘째»)가 아니라 그 줄의 페이지(«첫째»)여야 한다.
   */
  it('페이지 줄 `…` → «JSON 내보내기» → 받은 파일이 그 줄의 페이지다(열린 페이지와 다른 줄)', async () => {
    const { projectId, ids } = await fixture('export')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(`/projects/${projectId}/pages/${ids.second}`)
      await rowLabel(page, ids.first).waitFor()
      await rowLabel(page, ids.first).hover()
      const downloading = page.waitForEvent('download')
      await row(page, ids.first).getByRole('button', { name: '첫째 더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: 'JSON 내보내기', exact: true }).click()
      const download = await downloading
      const text = await readFile((await download.path())!, 'utf8')
      const parsed = JSON.parse(text) as { page: { title: string }; schema: { root: { children?: { id: string }[] } } }

      expect({
        열린_페이지: new URL(page.url()).pathname.endsWith(ids.second),
        파일_이름: download.suggestedFilename(),
        제목: parsed.page.title,
        첫_노드: parsed.schema.root.children?.[0]?.id,
      }).toEqual({ 열린_페이지: true, 파일_이름: '첫째.wirebound-page.json', 제목: '첫째', 첫_노드: 'n_first000001' })
    } finally {
      await context.close()
    }
  })

  /** 메뉴 «가져올 곳»(빈 메뉴) · 메뉴 «원본» 안에 페이지 «첫째»(노드 하나) · «둘째». */
  async function fixture(slug: string): Promise<{ projectId: string; P: string; ids: { target: string; first: string; second: string } }> {
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '페이지 JSON', slug: `pj-${slug}-${Date.now().toString(36)}` }))
    const source = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '원본' }))
    const target = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가져올 곳' }))
    const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: source.id, title: '첫째' }))
    const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: source.id, title: '둘째' }))
    const seeded = await call('PATCH', `/projects/${project.id}/pages/${first.id}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_first000001', type: 'Text', props: { content: '첫째의 글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return {
      projectId: project.id,
      P: `/projects/${project.id}/pages/${first.id}`,
      ids: { target: target.id, first: first.id, second: second.id },
    }
  }
})

function row(page: Page, id: string) {
  return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
}

/** 줄의 단추 · 링크 — 줄 상자는 `visibility: hidden`이고 보이는 것은 이 자식이다(`shell.css`의 `.wb-shell-tree-row`). 기다림 · 마우스 올림이 여기 선다. */
function rowLabel(page: Page, id: string) {
  return row(page, id).locator('> button, > a').first()
}

/** 그 메뉴 줄의 `+`를 열고 «JSON 에서 가져오기…»를 고른다 — 줄 행동은 마우스가 올라와야 보인다. */
async function openImport(page: Page, menuId: string): Promise<void> {
  await rowLabel(page, menuId).hover()
  await row(page, menuId).getByRole('button', { name: '가져올 곳 추가', exact: true }).click()
  await page.getByRole('menuitem', { name: 'JSON 에서 가져오기…', exact: true }).click()
}

/** 디스크의 페이지 파일 한 벌 — 봉투 · 노드 둘 · 코멘트 하나(설계서 「페이지 JSON」). */
function pageFile(title: string): string {
  return JSON.stringify({
    wireboundVersion: '1',
    page: { title, description: null },
    schema: { version: 1, root: { id: 'file_root', type: 'Page', children: [{ id: 'file_text', type: 'Text', props: { content: '본문' } }] } },
    comments: [{ nodeId: 'file_text', body: '가' }],
  })
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
