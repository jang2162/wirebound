/**
 * **N27 — 그 페이지의 내 첫 편집을 ack 전에 되돌린다**(`docs/superpowers/plans/2026-10-12-n27-report.md`). 되돌리기 스택은 ack 가 쌓고, 페이지를 열 때
 * 새로고침으로 채우는 항목은 내 revision 뿐이다 — 남이 지은 페이지에서 내가 처음 고친 편집은 ack 전까지 스택이 비어 있다. 그때 누른 되돌리기는
 * 미룬 되돌리기(`useEditCommit` 의 `afterAck`)로 가야 하는데, 단추 · 키 가드(`canUndo`)가 스택만 보면 말없이 버려진다.
 *
 * 판은 `delayServerFrames` 로 **ack 만** 늦춰 세운다 — 누른 때 ack 가 안 닿았는지(`ackedBeforePress`)와 스택이 비었는지(편집 전 되돌리기 단추가
 * 꺼져 있음)가 판 카나리아다. 가르는 값은 이 탭이 보낸 `patch` 프레임 수 · 서버 머리 · 화면 차례 = 서버 차례다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 키(Cmd+Z) | 스택이 빈 채 ack 전에 누른 키가 버려진다(`patch` 1 · 머리 2) |
 * | 머리 단추 | 같은 판에서 단추가 꺼져 있다(`enabledAtPress` 거짓 — 누를 수 없음) |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  delayServerFrames,
  editorStackPrerequisite,
  poll,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const ORIGINAL = ['n_text0000001', 'n_text0000002', 'n_text0000003']

describe.skipIf(!전제.ok)('N27 그 페이지의 내 첫 편집을 ack 전에 되돌린다 — 실브라우저', () => {
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

  /** alice 가 짓고 시드한 페이지 — bob(editor)에게는 이 페이지의 revision 이 없어 열 때 되돌리기 스택이 빈다. */
  async function fixture(): Promise<string> {
    const mk = async (path: string, body: unknown) => {
      const r = await call('POST', path, body)
      if (r.status !== 201) throw new Error(`픽스처 ${r.status} ${JSON.stringify(r.body)}`)
      return r.body
    }
    const project = (await mk('/projects', { name: 'N27', slug: `n27-${Date.now().toString(36)}` })).id as string
    const menu = (await mk(`/projects/${project}/menu`, { parentId: null, title: '메뉴' })).id as string
    const first = (await mk(`/projects/${project}/pages`, { menuNodeId: menu, title: '첫째' })).id as string
    await mk(`/projects/${project}/members`, { email: stack.users.bob.email, role: 'editor' })
    const P = `/projects/${project}/pages/${first}`
    const ops = ORIGINAL.map((id, index) => ({
      op: 'add',
      path: `/root/children/${index}`,
      value: { id, type: 'Text', props: { content: `글 ${index + 1} — 캔버스를 채운다` } },
    }))
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    return P
  }

  for (const via of ['키', '머리 단추'] as const) {
    it(`${via} — bob 이 처음 고친 편집을 ack 전에 되돌리면 ack 뒤에 되돌림이 나가 화면 · 서버가 원래 차례로 돌아온다`, async () => {
      const P = await fixture()
      const ACK_DELAY_MS = 1_500
      const b = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
      const delay = await delayServerFrames(b.page, ['patch-ack'], ACK_DELAY_MS)
      const undoButton = b.page.locator('button[aria-label="되돌리기"]')
      const screen = () =>
        canvasFrame(b.page)
          .locator('[data-wb-id^="n_text"]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-wb-id')))
      try {
        await b.page.goto(P)
        await canvasFrame(b.page).locator('[data-wb-id="n_text0000002"]').click()
        await poll(
          '룸에 든다',
          async () => delay.delivered().map((a) => a.type),
          (types) => types.includes('joined'),
        )
        const stackEmptyBeforeEdit = await undoButton.isDisabled()
        await b.page.keyboard.press('Alt+ArrowUp')
        await poll(
          '서버에 닿는다',
          async () => (await call('GET', P)).body.headSeq,
          (n) => n === 2,
        )
        const ackedBeforePress = delay.delivered().some((a) => a.type === 'patch-ack')
        // 꺼진 단추는 누르지 않는다 — 누르면 값이 아니라 시간 초과로 죽는다. 꺼짐 자체를 값으로 단언한다.
        const enabledAtPress = await undoButton.isEnabled()
        if (via === '키') await b.page.keyboard.press('ControlOrMeta+z')
        else if (enabledAtPress) await undoButton.click()
        // 끝 조건은 판이 선 것(ack 가 닿음)만 — 재는 값(patch 수 · 머리)은 그 뒤에 한 번 읽는다.
        await poll(
          'ack 가 늦춰져 닿는다',
          async () => delay.delivered().map((a) => a.type),
          (types) => types.includes('patch-ack'),
          ACK_DELAY_MS * 3,
        )
        await b.page.waitForTimeout(1_000)
        const server = (await call('GET', P)).body
        expect({
          // 판 카나리아 — 편집 전 스택이 비었고(단추 꺼짐) 누른 때 ack 가 안 닿았다.
          stackEmptyBeforeEdit,
          ackedBeforePress,
          // 키 판은 단추를 안 본다 — 키 가드만 혼자 재게 한다.
          enabledAtPress: via === '머리 단추' ? enabledAtPress : null,
          delayed: delay.delayed() >= 1,
          patchFrames: delay.sent().filter((type) => type === 'patch').length,
          head: server.headSeq,
          ids: server.schema.root.children.map((c: { id: string }) => c.id),
          screen: await screen(),
        }).toEqual({
          stackEmptyBeforeEdit: true,
          ackedBeforePress: false,
          enabledAtPress: via === '머리 단추' ? true : null,
          delayed: true,
          patchFrames: 2,
          head: 3,
          ids: ORIGINAL,
          screen: ORIGINAL,
        })
      } finally {
        await b.context.close()
      }
    }, 90_000)
  }
})
