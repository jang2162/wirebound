/**
 * **번들 뷰어 셸의 서브페이지 장 — 틀이 장 칸 높이까지 서고 목업이 안 구른다** — 실브라우저. 기본테마의 서브페이지 틀은 «그리는 판의 높이» 까지
 * 선다(`system-themes/admin/src/theme.css` «서브페이지 틀» — `var(--wb-frame-min-height, 100vh)`). 뷰어 셸에서는 장이 iframe 이 아니라 목업 칸
 * 안에 서서 `100vh` 가 칸보다 목업 · 장 상자 여백만큼 길다 — 셸이 칸 높이를 그 변수로 준다(`packages/exporter/src/bundle/shell-css.ts` 의
 * `.wb-export-canvas`). 화면 모드(`#wb-screen`)는 셸이 없어 틀이 창 높이다(대조).
 *
 * | 판 | 잡는 결함 |
 * |---|---|
 * | 뷰어 셸 · 짧은 장 | 목업이 구른다(셸 칸 높이를 안 줌 → 틀이 `100vh` 라 88px) · 틀이 장 상자 끝까지 안 선다 |
 * | 화면 모드 · 짧은 장 | 틀이 창 높이가 아니다 · 문서가 구른다 |
 *
 * 카나리아 — 장에 기본테마의 서브페이지 틀이 하나 섰고 영역이 섰다. 번들은 저장소 빌드의 산출물로 그린다 — `pnpm build` 가 먼저다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage, type UnpackedBundle } from './layout-bundle'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

function ok(response: { status: number; body: any }, what: string): any {
  if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

describe.skipIf(!전제.ok)('번들 뷰어 셸의 서브페이지 장 높이(실브라우저)', () => {
  let stack: EditorStack
  let bundle: UnpackedBundle

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    const alice: Session = await stack.login(stack.users.alice)
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = ok(await call('POST', '/projects', { name: '장 높이', slug: `bundle-h-${Date.now().toString(36)}` }), '프로젝트')
    const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원' }), '메뉴')
    const page = ok(
      await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '짧은 장', layout: 'subpage' }),
      '페이지',
    )
    ok(
      await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, {
        baseSeq: 0,
        ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_t', type: 'Text', props: { content: '본문' } } }],
      }),
      'ops',
    )
    bundle = await exportBundle(stack, alice, project.id)
  }, 180_000)

  afterAll(async () => {
    bundle?.dispose()
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it.each([
    ['뷰어 셸', false],
    ['화면 모드', true],
  ] as const)('%s — 짧은 장의 틀이 판 끝까지 서고 아무것도 안 구른다', async (_label, screen) => {
    const files = Object.values(bundle.pages)
    expect(files).toHaveLength(1)
    const { context, page } = await openBundlePage(stack, files[0]!, { viewport: { width: 1280, height: 800 }, screen })
    try {
      const got = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
        const mockup = document.querySelector('.wb-export-mockup') as HTMLElement
        const canvas = document.querySelector('.wb-export-canvas') as HTMLElement
        const frame = box('[data-wb-layout="subpage"] > [data-wb-part="frame"]')
        const inner = box('.wb-export-canvas')
        const padding = parseFloat(getComputedStyle(canvas).paddingBottom)
        return {
          frames: document.querySelectorAll('[data-wb-layout="subpage"]').length,
          regions: document.querySelectorAll('[data-wb-layout-region]').length,
          mockupScroll: mockup.scrollHeight - mockup.clientHeight,
          documentScroll: document.documentElement.scrollHeight - innerHeight,
          // 틀 아래 끝 − 장 상자의 안쪽 아래 끝(여백을 뺀 자리) · 틀 높이 − 창 높이.
          frameToCanvas: Math.round(frame.bottom - (inner.bottom - padding)),
          frameToWindow: Math.round(frame.height - innerHeight),
        }
      })
      expect({
        frames: got.frames,
        regions: got.regions > 0,
        mockupScroll: got.mockupScroll,
        documentScroll: got.documentScroll,
        ...(screen ? { frameToWindow: got.frameToWindow } : { frameToCanvas: got.frameToCanvas }),
      }).toEqual({
        frames: 1,
        regions: true,
        mockupScroll: 0,
        documentScroll: 0,
        ...(screen ? { frameToWindow: 0 } : { frameToCanvas: 0 }),
      })
    } finally {
      await context.close()
    }
  })
})
