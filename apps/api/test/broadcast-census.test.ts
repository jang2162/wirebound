/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 왜 이 파일이 있나 — 브로드캐스트를 파이프라인 밖에 둔 대가
 *
 * 브로드캐스트는 **파이프라인 밖**에 있다. `services/`가 SQL도 HTTP도
 * 모른다는 계약(`services/edit-pipeline.ts`)을 지키려면 `applyEdit` 안에서 알릴 수 없다.
 * 그러면 **호출자가 성공 결과를 받아 알리고, 호출자가 빠뜨릴 수 있다.** 그것이 이 결정의
 * 대가다.
 *
 * **`restore-lock-census.test.ts`가 같은 자세다.** 그쪽 머리말이 이 부류를
 * 적어 둔다: *"분모를 손으로 적으면 빠진 항목이 결과를 바꿔도 아무도 모른다."* 그래서
 * 여기도 **분모를 소스에서 만든다.**
 *
 * ---
 *
 * # 세는 단위 — 한 문장으로 못박는다
 *
 * > **이 표가 세는 것은 `apps/api/src/` 아래 어느 `.ts`에서든 `applyEdit`을 부르는 자리
 * > 하나당 한 줄이다.** 선언(`services/edit-pipeline.ts`의 `function applyEdit(`)은 호출이
 * > 아니므로 세지 않는다.
 *
 * **`src/` 전체를 재귀로 훑는다.** `routes`·`services` 둘만 비재귀로 보면
 * **`src/ws/`의 호출자를 조용히 못 본다** — WS의 patch 핸들러가 정확히 거기 있다.
 * `훑는 범위가 src 전체다`가 그 범위를 실행으로 지킨다.
 *
 * **왜 라우트가 아니라 호출 자리인가.** 알릴 것은 *"페이지 문서가 바뀌었다"*이고, 그것을
 * 만드는 것은 라우트가 아니라 `applyEdit`의 성공이다. 한 라우트가 그 함수를 두 번 부를 수
 * 있고(`routes/comments.ts`가 갈래마다 부른다), 라우트를 세면 그 갈래가 표에서 사라진다.
 *
 * **`false`인 줄도 표에 있다.** *"안 알린다"*는 판정이지 누락이 아니고, 판정이 표에 없으면
 * 다음 사람이 그것을 누락으로 읽고 고친다.
 *
 * ---
 *
 * # 재는 방식
 *
 * 같은 프로젝트에 **다른 연결**을 하나 붙여 두고 그 자리를 실제로 지나가게 한 뒤, 그
 * 연결이 `page-changed`를 받는지 본다. **판정마다 대조가 하나 붙는다:** 그 뒤에 *"알린다"*가
 * 확실한 편집을 한 번 더 내서 같은 연결이 그것을 받는지 본다 — 이것이 없으면 *"안
 * 알린다"*가 *"연결이 죽어 있었다"*와 구분되지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { WIREBOUND_PAGE_VERSION, type PatchOp } from '@wirebound/schema'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { SRC_ROOT, callSitesByFile, sourceFiles } from './source-census'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []

afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

function track(probe: WsProbe): WsProbe {
  opened.push(probe)
  return probe
}

/**
 * 소스에 있는 `applyEdit` **호출** 자리를 파일별로 센다.
 *
 * **훑는 것은 `./source-census.ts`다** — `lock-census.test.ts`가 같은 분모를 쓰므로, 훑는
 * 방식을 두 벌로 두면 한쪽만 넓어진다. `routes`·`services`만 비재귀로 훑으면
 * `src/ws/`의 호출자를 조용히 못 보고, 넓힌 범위가 이 파일에만 있으면 다음 census가
 * 좁은 채로 태어난다.
 */
function editCallSitesByFile(): Map<string, number> {
  return callSitesByFile('applyEdit')
}

interface Fixture {
  owner: SignedUpUser
  peer: SignedUpUser
  projectId: string
  menuId: string
  pageId: string
  /** 다른 페이지. *"알린다"*가 확실한 대조 편집이 이 페이지를 쓴다. */
  controlPageId: string
  rootId: string
  firstNodeId: string
  secondNodeId: string
  /** **아직 번호가 없는 노드.** `POST .../comments`가 *"번호를 붙이는"* 갈래를 타려면 필요하다. */
  freshNodeId: string
  /** `firstNodeId`에 달린 코멘트. 지우면 그 노드의 마지막이라 번호가 사라진다. */
  commentId: string
  snapshotId: string
}

interface CallSite {
  /** 세는 단위의 키. 파일 안의 호출 자리를 **파일별 개수**로 대조한다. */
  file: string
  label: string
  broadcasts: boolean
  why: string
  drive: (ctx: RealApiContext, fx: Fixture) => Promise<void>
}

/**
 * **소스의 호출 자리 하나당 한 줄.** `분모를 소스에서 만든다`가 이 표와 소스를 대조한다.
 */
const CALL_SITES: CallSite[] = [
  {
    file: 'routes/pages.ts',
    label: 'PUT .../schema — 문서 통째 교체',
    broadcasts: true,
    why: '편집의 본줄기. 문서가 바뀌었고 다른 접속자가 그 위에서 편집한다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/schema`,
        cookies: fx.owner.cookie,
        payload: {
          schema: { version: 3, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_put', type: 'Text', props: {} }] } },
        } as never,
      })
      if (res.statusCode !== 200) throw new Error(`PUT 실패 (${res.statusCode}): ${res.body}`)
    },
  },
  {
    file: 'routes/pages.ts',
    label: 'PATCH .../ops — 부분 편집',
    broadcasts: true,
    why: '편집의 본줄기 — 설계서 「정방향 흐름」의 REST 입구',
    drive: async (ctx, fx) => {
      await patchOps(ctx, fx.projectId, fx.owner, fx.pageId, [
        { op: 'add', path: '/root/children/-', value: { id: 'n_patched', type: 'Text', props: {} } },
      ])
    },
  },
  {
    file: 'routes/comments.ts',
    label: 'POST .../comments — 번호를 붙이는 갈래',
    broadcasts: true,
    why: '**번호는 문서에 산다** — 번호가 붙으면 페이지 문서가 바뀌므로 알려야 다른 접속자에게 번호가 실시간으로 보인다. 코멘트 행 자체는 안 알린다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`,
        cookies: fx.owner.cookie,
        payload: { nodeId: fx.freshNodeId, body: '번호가 붙는다' },
      })
      if (res.statusCode !== 201) throw new Error(`코멘트 실패 (${res.statusCode}): ${res.body}`)
    },
  },
  {
    file: 'routes/comments.ts',
    label: 'DELETE .../comments/:id — 번호를 지우는 갈래',
    broadcasts: true,
    why: '같은 이유. 마지막 코멘트를 지우면 문서에서 번호가 사라진다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.commentId}`,
        cookies: fx.owner.cookie,
      })
      if (res.statusCode !== 200) throw new Error(`코멘트 삭제 실패 (${res.statusCode}): ${res.body}`)
    },
  },
  {
    file: 'routes/comments.ts',
    label: 'POST .../comments/renumber — 바꿀 번호가 있는 갈래',
    broadcasts: true,
    why: '같은 이유. 바꿀 것이 없으면 revision도 안 쌓이므로 그 갈래는 아무것도 안 보낸다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/renumber`,
        cookies: fx.owner.cookie,
      })
      if (res.statusCode !== 200) throw new Error(`재번호 실패 (${res.statusCode}): ${res.body}`)
      if ((res.json() as { markerOps: PatchOp[] }).markerOps.length === 0) {
        throw new Error('재번호가 아무것도 바꾸지 않았다 — 픽스처가 이 갈래를 안 태웠다')
      }
    },
  },
  {
    file: 'ws/patch.ts',
    label: 'patch 프레임 — WS로 들어온 편집',
    broadcasts: true,
    why: '편집의 본줄기가 WS로 들어오는 자리다. **REST와 같은 `applyEdit`·같은 `notifyPageChanged`를 부른다** — 다른 것은 발신자를 헤더가 아니라 **연결 자체**로 아는 것뿐이다',
    drive: async (ctx, fx) => {
      // **좁게 훑으면 놓치는 자리다.** `routes`·`services`만 훑으면 `src/ws/`의
      // 호출자를 못 본다 — 그래서 범위가 `src/` 전체다.
      const author = track(await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session))
      const row = await db.selectFrom('pages').select('head_seq').where('id', '=', fx.pageId).executeTakeFirstOrThrow()
      author.send(
        JSON.stringify({
          type: 'patch',
          pageId: fx.pageId,
          baseSeq: Number(row.head_seq),
          ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_ws_patched', type: 'Text', props: {} } }],
          clientOpId: 'op_census',
        }),
      )
      const ack = await author.waitFor('patch-ack')
      if (ack.clientOpId !== 'op_census') throw new Error(`ack가 엉뚱한 편집의 것이다: ${JSON.stringify(ack)}`)
    },
  },
  {
    file: 'services/restore.ts',
    label: '복원이 페이지 문서를 되돌리는 자리',
    broadcasts: false,
    why: '**복원은 한 프레임(`restored`)으로 나간다.** 이 호출은 복원 트랜잭션 **안**이라 그 자리에서 알리면 커밋 전이고, 페이지마다 프레임을 내면 받는 쪽이 그것을 평범한 편집으로 읽는다 — 복원은 페이지가 사라지고 생기기도 하는 사건이라 ops로 표현되지 않는다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots/${fx.snapshotId}/restore`,
        cookies: fx.owner.cookie,
      })
      if (res.statusCode !== 200) throw new Error(`복원 실패 (${res.statusCode}): ${res.body}`)
    },
  },
  {
    file: 'services/page-import.ts',
    label: '가져오기가 새 페이지의 첫 문서를 쓰는 자리',
    broadcasts: false,
    why: '**한순간 전까지 없던 페이지다** — 어느 연결도 그것을 열어 두고 있을 수 없다. 남에게 필요한 것은 *"페이지가 생겼다"*이고 **그것을 알리는 프레임은 없다**(`ws/protocol.ts`). 그런 프레임이 생기면 이 줄을 다시 판정한다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/import`,
        cookies: fx.owner.cookie,
        payload: {
          menuNodeId: fx.menuId,
          file: {
            wireboundVersion: WIREBOUND_PAGE_VERSION,
            page: { title: '가져온 페이지' },
            schema: { version: 3, root: { id: 'file_root', type: 'Page', children: [] } },
            comments: [],
          },
        } as never,
      })
      if (res.statusCode !== 201) throw new Error(`가져오기 실패 (${res.statusCode}): ${res.body}`)
    },
  },
]

describe('분모를 소스에서 만든다', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다**.
    expect(sourceFiles().length).toBeGreaterThan(10)
    expect([...editCallSitesByFile().values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThan(5)
  })

  /**
   * **훑는 범위가 `src/` 전체다.** `routes`·`services` 둘을 비재귀로 보면 `src/ws/`에
   * 호출을 심어도 아무것도 안 죽는다. 이 케이스는 *"거기까지 본다"*를
   * 디렉터리 이름이 아니라 **훑은 결과**로 확인한다 — `src/`의 모든 디렉터리가 결과에
   * 나타나야 한다.
   */
  it('훑는 범위가 src 전체다 — 디렉터리가 빠지면 그 아래 호출자가 안 보인다', () => {
    const scanned = new Set(
      sourceFiles()
        .filter((relative) => relative.includes('/'))
        .map((relative) => relative.slice(0, relative.indexOf('/'))),
    )
    const declared = new Set(
      readdirSync(SRC_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    )

    expect([...declared].filter((name) => !scanned.has(name))).toEqual([])
    // **`ws`를 이름으로 못박는다** — 좁게 훑으면 놓치는 자리이고, WS의 patch 핸들러가 거기 선다.
    expect(scanned.has('ws')).toBe(true)
  })

  it('호출 자리가 하나도 빠지지 않았다 — 이 파일이 생긴 이유다', () => {
    const covered = new Map<string, number>()
    for (const site of CALL_SITES) {
      covered.set(site.file, (covered.get(site.file) ?? 0) + 1)
    }

    const mismatched = [...editCallSitesByFile()]
      .filter(([file, count]) => covered.get(file) !== count)
      .map(([file, count]) => `${file}: 소스 ${count} / 표 ${covered.get(file) ?? 0}`)

    expect(mismatched).toEqual([])
  })

  it('표에 소스에 없는 파일을 적어 두지 않았다 — 반대편', () => {
    const declared = editCallSitesByFile()
    const extra = [...new Set(CALL_SITES.map((site) => site.file))].filter((file) => !declared.has(file))

    expect(extra).toEqual([])
  })

  it('두 갈래가 모두 비어 있지 않다 — 분모가 한쪽으로 쏠리면 아래가 공허해진다', () => {
    expect(CALL_SITES.filter((site) => site.broadcasts).length).toBeGreaterThan(0)
    expect(CALL_SITES.filter((site) => !site.broadcasts).length).toBeGreaterThan(0)
  })
})

describe('표의 각 줄을 실제로 지나가 본다', () => {
  for (const site of CALL_SITES) {
    it(`${site.broadcasts ? '알린다' : '안 알린다'} — ${site.label}`, async () => {
      await withRealApi(async (ctx) => {
        const fx = await fixture(ctx)
        const watcher = track(await joinRoom(ctx.port, fx.projectId, fx.peer.cookie.wb_session))

        await site.drive(ctx, fx)

        if (site.broadcasts) {
          const frame = await watcher.waitFor('page-changed')
          expect(frame.pageId, site.why).toBe(fx.pageId)
        } else {
          const quiet = await watcher.quiet()
          expect(
            quiet.filter((frame) => frame.type === 'page-changed'),
            site.why,
          ).toEqual([])
        }

        // **대조.** 이 연결이 살아 있고 이 룸에 있다는 것을 *"알린다"*가 확실한 편집으로
        // 보인다. 없으면 위 `안 알린다`가 *"연결이 죽어 있었다"*와 구분되지 않는다.
        const before = watcher.received.filter((frame) => frame.type === 'page-changed').length
        await patchOps(ctx, fx.projectId, fx.owner, fx.controlPageId, [
          { op: 'add', path: '/root/children/-', value: { id: 'n_control', type: 'Text', props: {} } },
        ])
        const frames = await watcher.waitForCount('page-changed', before + 1)
        expect(frames.at(-1)?.pageId).toBe(fx.controlPageId)
      })
    }, 30_000)
  }
})

async function patchOps(ctx: RealApiContext, projectId: string, who: SignedUpUser, pageId: string, ops: PatchOp[]): Promise<void> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${projectId}/pages/${pageId}/ops`,
    cookies: who.cookie,
    payload: { baseSeq: Number(row.head_seq), ops },
  })
  if (res.statusCode !== 200) throw new Error(`ops 실패 (${res.statusCode}): ${res.body}`)
}

/**
 * 표의 모든 줄이 자기 갈래를 **실제로 태울 수 있는** 판.
 *
 * 재번호가 바꿀 것을 갖게 하려고 **문서 순서와 어긋나게** 번호를 붙인다: 뒤 노드에 먼저
 * 코멘트를 달아 1번을 주고, 앞 노드에 나중에 달아 2번을 준다.
 */
async function fixture(ctx: RealApiContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '표가 지나갈 페이지' })
  const controlPage = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '대조용 페이지' })
  const rootId = (page.schema as { root: { id: string } }).root.id

  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: owner.cookie,
    payload: {
      schema: {
        version: 3,
        root: {
          id: rootId,
          type: 'Page',
          children: [
            { id: 'n_first', type: 'Text', props: {} },
            { id: 'n_second', type: 'Text', props: {} },
            { id: 'n_fresh', type: 'Text', props: {} },
          ],
        },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)

  // 뒤 노드에 먼저 → 1번. 앞 노드에 나중에 → 2번. 재번호가 이것을 뒤집는다.
  await addComment(ctx, project.id, page.id, owner, 'n_second')
  const firstComment = await addComment(ctx, project.id, page.id, owner, 'n_first')

  const snapshot = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/snapshots`,
    cookies: owner.cookie,
    payload: { tag: 'census' },
  })
  if (snapshot.statusCode !== 201) throw new Error(`스냅샷 픽스처 실패: ${snapshot.body}`)

  // 복원이 되돌릴 것이 있어야 그 자리가 실제로 `applyEdit`을 탄다.
  await patchOps(ctx, project.id, owner, page.id, [
    { op: 'add', path: '/root/children/-', value: { id: 'n_after_snapshot', type: 'Text', props: {} } },
  ])

  return {
    owner,
    peer,
    projectId: project.id,
    menuId: menu.id,
    pageId: page.id,
    controlPageId: controlPage.id,
    rootId,
    firstNodeId: 'n_first',
    secondNodeId: 'n_second',
    freshNodeId: 'n_fresh',
    commentId: firstComment,
    snapshotId: (snapshot.json() as { id: string }).id,
  }
}

async function addComment(ctx: RealApiContext, projectId: string, pageId: string, who: SignedUpUser, nodeId: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/pages/${pageId}/comments`,
    cookies: who.cookie,
    payload: { nodeId, body: `${nodeId}에 붙인 코멘트` },
  })
  if (res.statusCode !== 201) throw new Error(`코멘트 픽스처 실패 (${res.statusCode}): ${res.body}`)
  return (res.json() as { comment: { id: string } }).comment.id
}
