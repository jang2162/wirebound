/**
 * **텍스트 칸의 NUL 은 400 이다 — 500 이 아니다**.
 *
 * 훑은 목록과 막는 자리는 `src/db/nul-guard.ts`의 `NulByteError` 머리말이 소유한다. 여기는 그 표에서 **판정이 없으면
 * 500 이 되는 칸**을 하나씩 HTTP 로 보낸다 — 400 이고, **아무것도 안 바뀐다.** 가져오기의 제목·설명은
 * `page-import.test.ts`의 *"제목에 NUL이 있으면 …"*이 갖는다(같은 `insertPage`를 지난다).
 *
 * **변조와 죽는 케이스**(변조는 백업 후 바이트 비교로 되돌린다):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 저장소의 한 칸을 판정에서 뺀다 — 열 칸 하나씩 | 그 칸의 케이스 **혼자**. 다만 `insertPage`의 제목은 가져오기의 *"제목에 NUL이 …"*와 **함께** 죽는다(같은 `insertPage`를 지난다 — 축의 주인은 여기의 *"POST …/pages title"*) |
 * | `http/error-handler.ts`가 `NulByteError`를 옮기지 않는다(500) | 여기 열 · 가져오기의 *"제목에 NUL이 있으면 …"*(api 전량에서 그 열하나뿐) |
 */
import { describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

const NUL = String.fromCharCode(0)

interface World {
  cookie: { wb_session: string }
  projectId: string
  menuId: string
  pageId: string
}

async function world(ctx: TestContext): Promise<World> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '원래 메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '원래 제목', description: '원래 설명' })
  return { cookie: owner.cookie, projectId: project.id, menuId: menu.id, pageId: page.id }
}

/** 요청 뒤에 **바뀐 것이 없는지** 볼 값 — 프로젝트·메뉴·페이지의 텍스트 칸과 행 수. */
async function snapshot(ctx: TestContext, w: World) {
  const projects = await ctx.db.selectFrom('projects').select(['name', 'description']).orderBy('name').execute()
  const menus = await ctx.db.selectFrom('menu_nodes').select('title').where('project_id', '=', w.projectId).execute()
  const pages = await ctx.db.selectFrom('pages').select(['title', 'description']).where('project_id', '=', w.projectId).execute()
  return { projects, menus, pages }
}

interface Case {
  name: string
  method: 'POST' | 'PATCH'
  url: (w: World) => string
  payload: (w: World) => Record<string, unknown>
  /** 문장이 부르는 칸의 이름(`NulByteError`). */
  what: string
}

const CASES: Case[] = [
  {
    name: 'POST /projects name',
    method: 'POST',
    url: () => '/api/projects',
    payload: () => ({ name: `이${NUL}름`, slug: 'nul-name' }),
    what: '프로젝트 이름·설명',
  },
  {
    name: 'POST /projects description',
    method: 'POST',
    url: () => '/api/projects',
    payload: () => ({ name: '이름', slug: 'nul-description', description: `설${NUL}명` }),
    what: '프로젝트 이름·설명',
  },
  {
    name: 'PATCH /projects/:id name',
    method: 'PATCH',
    url: (w) => `/api/projects/${w.projectId}`,
    payload: () => ({ name: `이${NUL}름` }),
    what: '프로젝트 이름·설명',
  },
  {
    name: 'PATCH /projects/:id description',
    method: 'PATCH',
    url: (w) => `/api/projects/${w.projectId}`,
    payload: () => ({ description: `설${NUL}명` }),
    what: '프로젝트 이름·설명',
  },
  {
    name: 'POST …/menu title',
    method: 'POST',
    url: (w) => `/api/projects/${w.projectId}/menu`,
    payload: () => ({ parentId: null, title: `메${NUL}뉴` }),
    what: '메뉴 제목',
  },
  {
    name: 'PATCH …/menu/:nodeId title',
    method: 'PATCH',
    url: (w) => `/api/projects/${w.projectId}/menu/${w.menuId}`,
    payload: () => ({ title: `메${NUL}뉴` }),
    what: '메뉴 제목',
  },
  {
    name: 'POST …/pages title',
    method: 'POST',
    url: (w) => `/api/projects/${w.projectId}/pages`,
    payload: (w) => ({ menuNodeId: w.menuId, title: `제${NUL}목` }),
    what: '페이지 제목·설명',
  },
  {
    name: 'POST …/pages description',
    method: 'POST',
    url: (w) => `/api/projects/${w.projectId}/pages`,
    payload: (w) => ({ menuNodeId: w.menuId, title: '제목', description: `설${NUL}명` }),
    what: '페이지 제목·설명',
  },
  {
    name: 'PATCH …/pages/:pageId title',
    method: 'PATCH',
    url: (w) => `/api/projects/${w.projectId}/pages/${w.pageId}`,
    payload: () => ({ title: `제${NUL}목` }),
    what: '페이지 제목·설명',
  },
  {
    name: 'PATCH …/pages/:pageId description',
    method: 'PATCH',
    url: (w) => `/api/projects/${w.projectId}/pages/${w.pageId}`,
    payload: () => ({ description: `설${NUL}명` }),
    what: '페이지 제목·설명',
  },
]

describe('텍스트 칸의 NUL 은 400 이고 아무것도 안 바뀐다', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      await withApi(async (ctx) => {
        const w = await world(ctx)
        const before = await snapshot(ctx, w)

        const res = await ctx.app.inject({ method: c.method, url: c.url(w), cookies: w.cookie, payload: c.payload(w) })

        expect(res.statusCode, res.body).toBe(400)
        expect(res.json()).toEqual({
          error: { code: 'bad-request', message: `${c.what}에 NUL 문자(U+0000)를 포함할 수 없습니다` },
        })
        expect(await snapshot(ctx, w)).toEqual(before)
      })
    })
  }
})
