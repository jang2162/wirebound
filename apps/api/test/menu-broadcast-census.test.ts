/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * # 무엇을 세는가 — 트리 쓰기마다 `menu-changed`가 나가는가
 *
 * 메뉴 · 페이지 트리를 바꾸는 쓰기는 커밋 앞에 판 번호를 올리고(`repos/menu.ts`의 `bumpMenuRev`) 커밋 뒤 `menu-changed`를 방송한다
 * (`ws/notify.ts`의 `notifyMenuChanged`). **둘 다 부르는 쪽이 하므로 빠뜨릴 수 있다** — `broadcast-census.test.ts`가 `applyEdit`의 호출
 * 자리를 세는 것과 같은 까닭이다. 그래서 **분모를 소스에서 만든다**:
 *
 * 1. **쓰는 함수** — `src/` 아래에서 `menu_nodes` · `pages` 표에 `insertInto` · `updateTable` · `deleteFrom`을 거는 함수 전부. 아래
 *    `WRITERS` 표와 대조한다 — 새 함수가 생기면 이 표에 판정 없이는 못 지나간다.
 * 2. **트리 쓰기의 호출 자리** — `WRITERS`에서 `entry`인 함수를 부르는 자리 전부(`./source-census.ts`의 `callSitesByFile`). 아래
 *    `CALL_SITES` 표와 파일별 수로 대조한다.
 * 3. **각 자리를 실제로 지나간다** — 그 자리를 태우는 요청을 내고, 룸에 붙은 **viewer** 가 그 쓰기가 올린 번호의 `menu-changed`를 받는지,
 *    트리 응답의 `rev`가 그 번호인지 본다.
 *
 * **안 세는 것**(L-141 — 이 자의 사각이다. 있다고 읽지 마라): 날 SQL(`sql` 템플릿)로 쓰는 `menu_nodes` · `pages` 쓰기 · `apps/api/src` 밖의 쓰기(`packages/mcp` 는 `…/ops` · 코멘트만 · `packages/cli` 는 트리 REST 0 —
 * 읽은 값) · FK CASCADE 로 지워지는 행(프로젝트 삭제는 룸이 사라진다) · **실패 · 유실 갈래의 방송**(COMMIT 답을 잃은 판) · **번호 문장이 맨 끝인가**(잠금 순서 — `menu-changed.test.ts` 의 교착 판이 둘을 잴 뿐이다) ·
 * `PATCH …/pages` 의 `touchesTree`(제목 · 소속 메뉴 · 순서)가 트리 응답의 칸(`listPageRows`)과 같은가 — 트리에 칸이 늘면 그 칸만 바꾼 쓰기가 번호를 안 올려도 이 자는 모른다.
 *
 * **세는 단위** — 1 은 함수 하나당 한 줄, 2 는 호출 자리 하나당 한 줄이다(선언은 호출이 아니다). 트리에 안 보이는 칸만 쓰는 함수도
 * 1 의 표에 있다(`not-tree` — 판정이지 누락이 아니다).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WIREBOUND_PAGE_VERSION } from '@wirebound/schema'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { SRC_ROOT, callSitesByFile, sourceFiles, stripComments } from './source-census'
import { WsProbe, joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

/**
 * `menu_nodes` · `pages`에 쓰는 함수의 판정.
 *
 * | 판정 | 뜻 |
 * |---|---|
 * | `entry` | 트리를 바꾼다 — 부르는 자리가 전부 `CALL_SITES`에 있어야 한다 |
 * | `helper` | 같은 파일의 `entry`만 부르는 내부 함수(형제 재번호) — 부른 `entry`가 방송한다 |
 * | `not-tree` | 트리 응답에 없는 칸만 쓴다(`listPageRows`가 고르는 것: id · 소속 메뉴 · 제목 · 순서) |
 */
const WRITERS: Record<string, 'entry' | 'helper' | 'not-tree'> = {
  'repos/menu.ts:closeGap': 'helper',
  'repos/menu.ts:openGap': 'helper',
  'repos/menu.ts:reorderWithinSiblings': 'helper',
  'repos/menu.ts:insertMenuNode': 'entry',
  'repos/menu.ts:updateMenuNode': 'entry',
  'repos/menu.ts:deleteMenuNode': 'entry',
  'repos/menu.ts:deleteMenuSubtree': 'entry',
  'repos/menu.ts:insertMenuNodeWithId': 'entry',
  'repos/menu.ts:writeMenuNodePlacement': 'entry',
  'repos/menu.ts:deleteMenuNodeRow': 'entry',
  'repos/pages.ts:closeGap': 'helper',
  'repos/pages.ts:openGap': 'helper',
  'repos/pages.ts:reorderWithinSiblings': 'helper',
  'repos/pages.ts:insertPage': 'entry',
  'repos/pages.ts:updatePage': 'entry',
  // 문서(`schema` · `head_seq`)만 쓴다 — 편집 파이프라인의 몫이고 `page-changed`가 알린다(`broadcast-census.test.ts`).
  'repos/pages.ts:writePageSchemaAtSeq': 'not-tree',
  'repos/pages.ts:deletePage': 'entry',
  'repos/pages.ts:insertPageWithId': 'entry',
  'repos/pages.ts:writePagePlacement': 'entry',
  'repos/pages.ts:deletePageRow': 'entry',
}

const WRITE_TO_TREE_TABLE = /\b(?:insertInto|updateTable|deleteFrom)\s*\(\s*['"](?:menu_nodes|pages)['"]/g
const FUNCTION_HEAD = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g

/** `src/` 아래에서 트리 표에 쓰는 함수 — `파일:함수` 꼴. 쓰기가 든 함수는 그 쓰기 앞에 선 마지막 함수 머리로 가른다. */
function treeTableWriters(): Set<string> {
  const found = new Set<string>()
  for (const relative of sourceFiles()) {
    const source = stripComments(readFileSync(join(SRC_ROOT, relative), 'utf8'))
    const heads = [...source.matchAll(FUNCTION_HEAD)].map((match) => ({ at: match.index, name: match[1] }))
    for (const write of source.matchAll(WRITE_TO_TREE_TABLE)) {
      const owner = heads.filter((head) => head.at < write.index).at(-1)
      found.add(`${relative}:${owner?.name ?? '(파일 머리)'}`)
    }
  }
  return found
}

interface Fixture {
  owner: SignedUpUser
  /** 룸에 붙어 받는 쪽 — **viewer** 다(받는 최소 역할 · `ws/broadcast.ts`의 `MIN_ROLE_TO_RECEIVE`). */
  viewer: SignedUpUser
  projectId: string
  /** 페이지 둘을 품은 메뉴. 그 밑에 하위 메뉴 하나. */
  menuId: string
  childMenuId: string
  /** 아무것도 안 품은 메뉴 — 본문 없는 삭제의 대상. */
  emptyMenuId: string
  pageId: string
  otherPageId: string
}

interface CallSite {
  file: string
  fn: string
  label: string
  drive: (ctx: RealApiContext, fx: Fixture) => Promise<void>
}

async function send(ctx: RealApiContext, who: SignedUpUser, method: string, url: string, payload?: unknown): Promise<unknown> {
  const res = await ctx.app.inject({
    method: method as never,
    url,
    cookies: who.cookie,
    ...(payload === undefined ? {} : { payload: payload as never }),
  })
  if (res.statusCode >= 300) throw new Error(`${method} ${url} 실패 (${res.statusCode}): ${res.body}`)
  return res.body === '' ? null : res.json()
}

/**
 * 복원이 여섯 쓰기를 다 태우는 판 — 스냅샷을 뜬 뒤 메뉴 · 페이지를 하나씩 더하고(되돌리면 지운다) · 지우고(되돌리면 id 째 되살린다) ·
 * 옮기고 · 이름을 바꾼다(되돌리면 자리째 쓴다). 되돌린 트리가 스냅샷의 트리와 같은지로 다 탔는지 본다.
 */
async function restoreEverything(ctx: RealApiContext, fx: Fixture): Promise<void> {
  const P = `/api/projects/${fx.projectId}`
  const before = await send(ctx, fx.owner, 'GET', `${P}/tree`)
  const snapshot = (await send(ctx, fx.owner, 'POST', `${P}/snapshots`, { tag: '전부 되돌릴 판' })) as { id: string }
  await createMenuNode(ctx, fx.owner.cookie, fx.projectId, { title: '스냅샷 뒤 메뉴' })
  await createPage(ctx, fx.owner.cookie, fx.projectId, fx.menuId, { title: '스냅샷 뒤 페이지' })
  await send(ctx, fx.owner, 'DELETE', `${P}/pages/${fx.otherPageId}`)
  await send(ctx, fx.owner, 'DELETE', `${P}/menu/${fx.emptyMenuId}`)
  await send(ctx, fx.owner, 'PATCH', `${P}/pages/${fx.pageId}`, { menuNodeId: fx.childMenuId })
  await send(ctx, fx.owner, 'PATCH', `${P}/menu/${fx.childMenuId}`, { title: '바꾼 이름' })
  await send(ctx, fx.owner, 'POST', `${P}/snapshots/${snapshot.id}/restore`)
  const after = (await send(ctx, fx.owner, 'GET', `${P}/tree`)) as { menu: unknown }
  expect(after.menu, '복원이 여섯 쓰기를 다 태워 스냅샷의 트리로 돌아왔다').toEqual((before as { menu: unknown }).menu)
}

/** 복원의 여섯 자리 — 한 판(`restoreEverything`)이 다 태운다. */
const RESTORE_SITES: CallSite[] = [
  'insertMenuNodeWithId',
  'writeMenuNodePlacement',
  'deleteMenuNodeRow',
  'insertPageWithId',
  'writePagePlacement',
  'deletePageRow',
].map((fn) => ({ file: 'services/restore.ts', fn, label: `복원의 ${fn}`, drive: restoreEverything }))

/** **소스의 호출 자리 하나당 한 줄.** `분모를 소스에서 만든다`가 이 표와 소스를 대조한다. */
const CALL_SITES: CallSite[] = [
  {
    file: 'routes/menu.ts',
    fn: 'insertMenuNode',
    label: 'POST …/menu — 메뉴 만들기',
    drive: async (ctx, fx) => {
      await createMenuNode(ctx, fx.owner.cookie, fx.projectId, { parentId: fx.menuId, title: '새 메뉴' })
    },
  },
  {
    file: 'routes/menu.ts',
    fn: 'updateMenuNode',
    label: 'PATCH …/menu/:id — 바탕을 실은 이름 바꾸기',
    drive: async (ctx, fx) => {
      const tree = (await send(ctx, fx.owner, 'GET', `/api/projects/${fx.projectId}/tree`)) as { menu: { title: string }[] }
      await send(ctx, fx.owner, 'PATCH', `/api/projects/${fx.projectId}/menu/${fx.menuId}`, {
        title: '바꾼 메뉴',
        base: { title: tree.menu[0]?.title },
      })
    },
  },
  {
    file: 'routes/menu.ts',
    fn: 'updateMenuNode',
    label: 'PATCH …/menu/:id — 자리 옮기기',
    drive: async (ctx, fx) => {
      await send(ctx, fx.owner, 'PATCH', `/api/projects/${fx.projectId}/menu/${fx.emptyMenuId}`, { sortOrder: 0 })
    },
  },
  {
    file: 'routes/menu.ts',
    fn: 'deleteMenuNode',
    label: 'DELETE …/menu/:id — 본문 없는 삭제',
    drive: async (ctx, fx) => {
      await send(ctx, fx.owner, 'DELETE', `/api/projects/${fx.projectId}/menu/${fx.emptyMenuId}`)
    },
  },
  {
    file: 'services/menu-cascade.ts',
    fn: 'deleteMenuSubtree',
    label: 'DELETE …/menu/:id — 연쇄 삭제',
    drive: async (ctx, fx) => {
      await send(ctx, fx.owner, 'DELETE', `/api/projects/${fx.projectId}/menu/${fx.menuId}`, {
        cascade: true,
        expect: { menuIds: [fx.childMenuId], pageIds: [fx.pageId, fx.otherPageId] },
      })
    },
  },
  {
    file: 'repos/menu.ts',
    fn: 'deletePageRow',
    label: '연쇄 삭제가 서브트리의 페이지를 지우는 자리(`deleteMenuSubtree` 안)',
    drive: async (ctx, fx) => {
      await send(ctx, fx.owner, 'DELETE', `/api/projects/${fx.projectId}/menu/${fx.menuId}`, {
        cascade: true,
        expect: { menuIds: [fx.childMenuId], pageIds: [fx.pageId, fx.otherPageId] },
      })
    },
  },
  {
    file: 'routes/pages.ts',
    fn: 'insertPage',
    label: 'POST …/pages — 페이지 만들기',
    drive: async (ctx, fx) => {
      await createPage(ctx, fx.owner.cookie, fx.projectId, fx.childMenuId, { title: '새 페이지' })
    },
  },
  {
    file: 'services/page-import.ts',
    fn: 'insertPage',
    label: 'POST …/pages/import — 가져오기',
    drive: async (ctx, fx) => {
      await send(ctx, fx.owner, 'POST', `/api/projects/${fx.projectId}/pages/import`, {
        menuNodeId: fx.menuId,
        file: {
          wireboundVersion: WIREBOUND_PAGE_VERSION,
          page: { title: '가져온 페이지' },
          schema: { version: 4, root: { id: 'file_root', type: 'Page', children: [] } },
          comments: [],
        },
      })
    },
  },
  {
    file: 'routes/pages.ts',
    fn: 'updatePage',
    label: 'PATCH …/pages/:id — 바탕을 실은 이름 바꾸기',
    drive: async (ctx, fx) => {
      const page = (await send(ctx, fx.owner, 'GET', `/api/projects/${fx.projectId}/pages/${fx.pageId}`)) as { title: string }
      await send(ctx, fx.owner, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}`, {
        title: '바꾼 페이지',
        base: { title: page.title },
      })
    },
  },
  {
    file: 'routes/pages.ts',
    fn: 'updatePage',
    label: 'PATCH …/pages/:id — 다른 메뉴로 옮기기',
    drive: async (ctx, fx) => {
      await send(ctx, fx.owner, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}`, { menuNodeId: fx.childMenuId })
    },
  },
  {
    file: 'routes/pages.ts',
    fn: 'deletePage',
    label: 'DELETE …/pages/:id',
    drive: async (ctx, fx) => {
      await send(ctx, fx.owner, 'DELETE', `/api/projects/${fx.projectId}/pages/${fx.otherPageId}`)
    },
  },
  ...RESTORE_SITES,
]

function entryCallSites(): Map<string, number> {
  const found = new Map<string, number>()
  for (const [key, verdict] of Object.entries(WRITERS)) {
    if (verdict !== 'entry') continue
    const fn = key.slice(key.indexOf(':') + 1)
    for (const [file, count] of callSitesByFile(fn)) found.set(`${file}:${fn}`, count)
  }
  return found
}

describe('분모를 소스에서 만든다', () => {
  it('트리 표에 쓰는 함수가 전부 판정을 받았다 — 새 쓰기 함수는 이 표 없이 못 지나간다', () => {
    const inSource = treeTableWriters()
    // 카나리아 — 정규식 · 글롭이 어긋나면 빈 집합에서 아래가 조용히 통과한다.
    expect(inSource.size).toBeGreaterThanOrEqual(17)
    expect({
      판정없음: [...inSource].filter((key) => !(key in WRITERS)),
      소스에없음: Object.keys(WRITERS).filter((key) => !inSource.has(key)),
    }).toEqual({
      판정없음: [],
      소스에없음: [],
    })
  })

  // 내부 함수라 다른 파일에서는 못 부른다 — 같은 이름의 내부 함수가 두 파일에 있어(`closeGap` …) 이름만으로 세면 서로를 부른 것으로 읽힌다.
  // 그래서 «그 이름의 `helper`를 둔 파일 밖에서 불리지 않는다»로 잰다.
  it('`helper` 는 제 파일 밖에서 불리지 않는다', () => {
    const helpers = Object.entries(WRITERS)
      .filter(([, verdict]) => verdict === 'helper')
      .map(([key]) => key.split(':') as [string, string])
    const strays: string[] = []
    for (const [, fn] of helpers) {
      const homes = new Set(helpers.filter(([, other]) => other === fn).map(([file]) => file))
      const elsewhere = [...callSitesByFile(fn).keys()].filter((file) => !homes.has(file))
      if (elsewhere.length > 0) strays.push(`${fn} ← ${elsewhere.join(', ')}`)
    }
    expect(helpers.length).toBeGreaterThanOrEqual(6)
    expect(strays).toEqual([])
  })

  it('트리 쓰기의 호출 자리가 하나도 빠지지 않았다', () => {
    const covered = new Map<string, number>()
    for (const site of CALL_SITES) covered.set(`${site.file}:${site.fn}`, (covered.get(`${site.file}:${site.fn}`) ?? 0) + 1)
    const inSource = entryCallSites()
    // 카나리아 — 호출 자리가 줄면(훑기가 틀렸다) 아래 대조가 빈 것끼리 같아진다.
    expect([...inSource.values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(17)
    const keys = new Set([...inSource.keys(), ...covered.keys()])
    const mismatched = [...keys]
      .filter((key) => inSource.get(key) !== covered.get(key))
      .map((key) => `${key}: 소스 ${inSource.get(key) ?? 0} / 표 ${covered.get(key) ?? 0}`)
    expect(mismatched).toEqual([])
  })
})

async function fixture(ctx: RealApiContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const viewer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, viewer.user.id, 'viewer')
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원관리' })
  const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: menu.id, title: '권한' })
  const empty = await createMenuNode(ctx, owner.cookie, project.id, { title: '빈 메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })
  const other = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '상세' })
  return {
    owner,
    viewer,
    projectId: project.id,
    menuId: menu.id,
    childMenuId: child.id,
    emptyMenuId: empty.id,
    pageId: page.id,
    otherPageId: other.id,
  }
}

async function treeRev(ctx: RealApiContext, fx: Fixture): Promise<number> {
  return ((await send(ctx, fx.viewer, 'GET', `/api/projects/${fx.projectId}/tree`)) as { rev: number }).rev
}

describe('표의 각 줄을 실제로 지나가 본다 — viewer 가 그 판의 `menu-changed` 를 받는다', () => {
  for (const site of CALL_SITES) {
    it(`${site.file} · ${site.fn} — ${site.label}`, async () => {
      await withRealApi(async (ctx) => {
        const fx = await fixture(ctx)
        const from = await treeRev(ctx, fx)
        // 픽스처의 쓰기 다섯이 하나씩 올렸다 — 번호가 안 오르면 아래 «더 큰 번호»가 공허하다.
        expect(from).toBe(5)
        const watcher = await joinRoom(ctx.port, fx.projectId, fx.viewer.cookie.wb_session)
        opened.push(watcher)

        await site.drive(ctx, fx)

        const to = await treeRev(ctx, fx)
        expect(to).toBeGreaterThan(from)
        // 마지막 쓰기의 판까지 왔는가 — 판마다 하나씩, 차례는 연결마다 뒤집힐 수 있어 집합으로 본다(`ws/broadcast.ts`의 `deliver`).
        const frames = await watcher.waitForCount('menu-changed', to - from)
        expect(frames.map((frame) => frame.rev).sort((a, b) => a - b)).toEqual(
          Array.from({ length: to - from }, (_, index) => from + index + 1),
        )
        expect(frames.every((frame) => frame.projectId === fx.projectId)).toBe(true)
      })
    }, 30_000)
  }
})
