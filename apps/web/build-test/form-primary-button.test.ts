/**
 * **폼의 주 단추가 기본테마 캔버스에서 주 단추 꼴로 그려지는가** — 실브라우저 판(에디터 캔버스 · 계산된 배경색).
 *
 * | 폼 | 짓는 길 | 기대 |
 * |---|---|---|
 * | 새 검색폼 · 입력폼 | `createNode`(팔레트 · 끌기와 같은 함수 — 카탈로그 `initial`) | «검색» · «저장» = 주색 바탕, «초기화» · «취소» = 바탕색(보조 꼴) |
 * | 옮긴 검색폼 · 입력폼 | `0028` 의 `liftDocument`(판 2 의 단추 없는 폼) | 같다 |
 *
 * 주 단추를 싣는 것은 노드의 `variant: 'primary'` 이고, 기본테마는 폼 단추 구역의 기본(`default`) 단추를 보조 꼴로 칠한다(`system-themes/admin/src/theme.css`
 * 의 «폼의 단추 구역» 규칙). 그 테마의 기본 단추는 폼 밖에서는 주색이다 — 폼 밖 단추 하나를 카나리아로 함께 잰다(규칙이 폼 밖으로 새지 않는다 · 테마 시트가 섰다).
 * 색은 캔버스 문서의 토큰(`--wb-semantic-primary` · `--wb-semantic-surface`)을 같은 문서에서 계산한 값과 견준다 — 색을 글자로 적지 않는다.
 */
import { fileURLToPath } from 'node:url'
import { installCatalog, type WbNode } from '@wirebound/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createNode } from '../src/edit/create-node'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack } from './editor-stack'

installCatalog()

// `0028` 은 api 소스라 이 프로젝트의 참조 밖이다(`tsconfig.json` 의 `rootDir`) — 경로를 실행 때 짓고 싣는다. 타입은 쓰는 함수 하나만 적는다.
const MIGRATION = fileURLToPath(new URL('../../api/src/db/migrations/0028-node-zones.ts', import.meta.url))
const { liftDocument } = (await import(MIGRATION)) as { liftDocument: (schema: unknown, pageId: string | null) => unknown }

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 노드 id 로 기본 내용까지 짓는다 — id 는 앞말 뒤 차례. */
function made(type: string, prefix: string): WbNode {
  let n = 0
  const node = createNode(type, () => `${prefix}${String(n++).padStart(4, '0')}`)
  if (node === null) throw new Error(`카탈로그에 없다: ${type}`)
  return node
}

const V2_FORMS = {
  version: 2,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_oldsf00001', type: 'SearchForm', children: [{ id: 'n_oldsff0001', type: 'Field', props: { label: '검색어' } }] },
      {
        id: 'n_oldef00001',
        type: 'EntryForm',
        props: { title: '등록' },
        children: [{ id: 'n_oldeff0001', type: 'Field', props: { label: '이름' } }],
      },
    ],
  },
}

/** 폼마다 단추 낱말 · 배경색과 견줄 토큰 색 · 폼 밖 단추의 배경색. 글로 넘긴다 — 변환기가 함수에 끼우는 도우미가 페이지에 없다. */
const MEASURE = `(formIds) => {
  const swatch = (value) => {
    const el = document.createElement('div')
    el.style.backgroundColor = value
    document.body.appendChild(el)
    const color = getComputedStyle(el).backgroundColor
    el.remove()
    return color
  }
  const forms = {}
  for (const id of formIds) {
    const form = document.querySelector('[data-wb-id="' + id + '"]')
    const buttons = form === null ? [] : [...form.querySelectorAll(':scope > [data-wb-part="actions"] > [data-wb-component="Button"]')]
    forms[id] = buttons.map((b) => [b.textContent, b.getAttribute('data-wb-variant'), getComputedStyle(b).backgroundColor])
  }
  const outside = document.querySelector('[data-wb-id="n_lone0000001"]')
  return {
    primary: swatch('var(--wb-semantic-primary)'),
    surface: swatch('var(--wb-semantic-surface)'),
    outside: outside === null ? null : getComputedStyle(outside).backgroundColor,
    theme: document.querySelectorAll('head link[data-wb-style="theme"]').length,
    forms,
  }
}`

interface Measured {
  primary: string
  surface: string
  outside: string | null
  theme: number
  forms: Record<string, [string, string | null, string][]>
}

describe.skipIf(!전제.ok)('폼의 주 단추 — 기본테마 캔버스', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('새 폼 · 0028 이 옮긴 폼 — «검색» · «저장» 은 주색, «초기화» · «취소» 는 보조 꼴 · 폼 밖 기본 단추는 주색 그대로', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = (await call('POST', '/projects', { name: '주 단추', slug: `primary-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string

    const lifted = (liftDocument(V2_FORMS, null) as { root: WbNode }).root.children!
    const nodes: WbNode[] = [
      made('SearchForm', 'n_newsf'),
      made('EntryForm', 'n_newef'),
      ...lifted,
      { id: 'n_lone0000001', type: 'Button', props: { label: '폼 밖' } },
    ]
    const seeded = await call('PATCH', `/projects/${project.id}/pages/${pageId}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    expect(seeded.status).toBe(200)

    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}/pages/${pageId}`)
      const frame = canvasFrame(page)
      await frame.locator('[data-wb-id="n_lone0000001"]').waitFor({ state: 'attached' })
      await frame.locator('head link[data-wb-style="theme"]').waitFor({ state: 'attached' })
      // 테마 시트가 실린 뒤 두 프레임 — 늦게 온 시트의 계산값을 읽는다.
      await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))')
      const handle = await page.$('iframe.wb-shell-canvas-iframe')
      const measured = (await (await handle!.contentFrame())!.evaluate(
        `(${MEASURE})(${JSON.stringify(['n_newsf0000', 'n_newef0000', 'n_oldsf00001', 'n_oldef00001'])})`,
      )) as Measured

      // 카나리아 — 테마 시트가 섰고 두 색이 다르며, 폼 밖 기본 단추는 주색이다(규칙이 폼 밖으로 새지 않는다).
      expect(measured.theme).toBe(1)
      expect(measured.primary).not.toBe(measured.surface)
      expect(measured.outside).toBe(measured.primary)

      const { primary: P, surface: S } = measured
      const search: [string, string, string][] = [
        ['초기화', 'default', S],
        ['검색', 'primary', P],
      ]
      const entry: [string, string, string][] = [
        ['저장', 'primary', P],
        ['취소', 'default', S],
      ]
      expect(measured.forms).toEqual({ n_newsf0000: search, n_newef0000: entry, n_oldsf00001: search, n_oldef00001: entry })
    } finally {
      await context.close()
    }
  })
})
