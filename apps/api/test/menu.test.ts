import { describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { addMember, createMenuNode, createProject, signup, withApi } from './helpers'

interface MenuTreeNodeResponse {
  id: string
  title: string
  sortOrder: number
  children: MenuTreeNodeResponse[]
}

/** 존재하지 않는(그리고 문법적으로 유효한) uuid. `projects.test.ts`와 같은 관례. */
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

describe('GET /api/projects/:projectId/menu', () => {
  it('빈 프로젝트는 빈 배열', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })

  it('루트 노드들이 sortOrder 순으로 나온다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const a = await createMenuNode(ctx, owner.cookie, project.id, { title: '가' })
      const b = await createMenuNode(ctx, owner.cookie, project.id, { title: '나' })
      const c = await createMenuNode(ctx, owner.cookie, project.id, { title: '다' })

      // 생성 순서(가,나,다)와 sort_order 값을 일부러 어긋나게 만든다. 응답이
      // "생성된 순서"가 아니라 정말 sort_order 컬럼을 따라 정렬되는지 확인하기
      // 위해서다 — 이 재배치가 없으면 생성 순서와 sort_order 순서가 항상 같아,
      // 쿼리가 실수로 created_at이나 id로 정렬해도 이 테스트는 통과해 버린다.
      await ctx.db.updateTable('menu_nodes').set({ sort_order: 2 }).where('id', '=', a.id).execute()
      await ctx.db.updateTable('menu_nodes').set({ sort_order: 0 }).where('id', '=', b.id).execute()
      await ctx.db.updateTable('menu_nodes').set({ sort_order: 1 }).where('id', '=', c.id).execute()

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      const titles = (res.json() as MenuTreeNodeResponse[]).map((n) => n.title)
      expect(titles).toEqual(['나', '다', '가'])
    })
  })

  it('3단 중첩이 children으로 온다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const root = await createMenuNode(ctx, owner.cookie, project.id, { title: '루트' })
      const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: root.id, title: '자식' })
      const grandchild = await createMenuNode(ctx, owner.cookie, project.id, { parentId: child.id, title: '손자' })

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([
        {
          id: root.id,
          title: '루트',
          sortOrder: 0,
          children: [
            {
              id: child.id,
              title: '자식',
              sortOrder: 0,
              children: [{ id: grandchild.id, title: '손자', sortOrder: 0, children: [] }],
            },
          ],
        },
      ])
    })
  })

  it('다른 프로젝트의 노드가 섞이지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie)
      const projectB = await createProject(ctx, owner.cookie)
      await createMenuNode(ctx, owner.cookie, projectA.id, { title: 'A 메뉴' })
      await createMenuNode(ctx, owner.cookie, projectB.id, { title: 'B 메뉴' })

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${projectA.id}/menu`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      const titles = (res.json() as MenuTreeNodeResponse[]).map((n) => n.title)
      expect(titles).toEqual(['A 메뉴'])
    })
  })

  it('viewer도 조회 가능', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')
      await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/menu`,
        cookies: viewer.cookie,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
    })
  })
})

describe('POST /api/projects/:projectId/menu', () => {
  it('루트 노드 생성 (parentId 없음)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
        payload: { title: '루트 메뉴' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ title: '루트 메뉴', parentId: null, sortOrder: 0 })

      const row = await ctx.db
        .selectFrom('menu_nodes')
        .select(['parent_id', 'sort_order'])
        .where('project_id', '=', project.id)
        .executeTakeFirstOrThrow()
      expect(row.parent_id).toBeNull()
      expect(row.sort_order).toBe(0)
    })
  })

  it('자식 노드 생성', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const parent = await createMenuNode(ctx, owner.cookie, project.id, { title: '부모' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
        payload: { parentId: parent.id, title: '자식' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ title: '자식', parentId: parent.id, sortOrder: 0 })
    })
  })

  it('sortOrder가 0,1,2로 부여된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const first = await createMenuNode(ctx, owner.cookie, project.id, { title: '첫' })
      const second = await createMenuNode(ctx, owner.cookie, project.id, { title: '둘' })
      const third = await createMenuNode(ctx, owner.cookie, project.id, { title: '셋' })

      expect([first.sortOrder, second.sortOrder, third.sortOrder]).toEqual([0, 1, 2])
    })
  })

  it('없는 parentId 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
        payload: { parentId: NONEXISTENT_UUID, title: '메뉴' },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('다른 프로젝트의 parentId 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie)
      const projectB = await createProject(ctx, owner.cookie)
      const nodeInB = await createMenuNode(ctx, owner.cookie, projectB.id, { title: 'B 노드' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${projectA.id}/menu`,
        cookies: owner.cookie,
        payload: { parentId: nodeInB.id, title: '메뉴' },
      })
      expect(res.statusCode).toBe(404)

      // 실패한 생성이 A 프로젝트에 아무 행도 남기지 않았는지 확인한다.
      const rows = await ctx.db.selectFrom('menu_nodes').selectAll().where('project_id', '=', projectA.id).execute()
      expect(rows).toHaveLength(0)
    })
  })

  it('빈 title 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
        payload: { title: '' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('viewer 403', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/menu`,
        cookies: viewer.cookie,
        payload: { title: '메뉴' },
      })
      expect(res.statusCode).toBe(403)
    })
  })
})

describe('PATCH /api/projects/:projectId/menu/:nodeId — title', () => {
  it('제목만 바꾼다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const node = await createMenuNode(ctx, owner.cookie, project.id, { title: '원래 제목' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${node.id}`,
        cookies: owner.cookie,
        payload: { title: '바뀐 제목' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().title).toBe('바뀐 제목')

      const row = await ctx.db
        .selectFrom('menu_nodes')
        .select('title')
        .where('id', '=', node.id)
        .executeTakeFirstOrThrow()
      expect(row.title).toBe('바뀐 제목')
    })
  })

  it('다른 필드가 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const parent = await createMenuNode(ctx, owner.cookie, project.id, { title: '부모' })
      const node = await createMenuNode(ctx, owner.cookie, project.id, { parentId: parent.id, title: '원래 제목' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${node.id}`,
        cookies: owner.cookie,
        payload: { title: '바뀐 제목' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ parentId: parent.id, sortOrder: 0 })
    })
  })
})

describe('PATCH /api/projects/:projectId/menu/:nodeId — parentId', () => {
  it('루트를 다른 노드 밑으로 옮긴다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const moving = await createMenuNode(ctx, owner.cookie, project.id, { title: '이동 대상' })
      const target = await createMenuNode(ctx, owner.cookie, project.id, { title: '새 부모' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${moving.id}`,
        cookies: owner.cookie,
        payload: { parentId: target.id },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ id: moving.id, parentId: target.id, sortOrder: 0 })

      const row = await ctx.db
        .selectFrom('menu_nodes')
        .select('parent_id')
        .where('id', '=', moving.id)
        .executeTakeFirstOrThrow()
      expect(row.parent_id).toBe(target.id)
    })
  })

  it('옮긴 뒤 원래 형제가 0,1,…로 재번호된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const a = await createMenuNode(ctx, owner.cookie, project.id, { title: '가' })
      const b = await createMenuNode(ctx, owner.cookie, project.id, { title: '나' })
      const c = await createMenuNode(ctx, owner.cookie, project.id, { title: '다' })
      const target = await createMenuNode(ctx, owner.cookie, project.id, { title: '새 부모' })

      // 가운데(나)를 옮겨서, 재번호가 "빠진 자리를 당긴다"를 정말 하는지 본다
      // (끝을 옮기면 재번호할 대상 자체가 없어 이 테스트가 공허해진다).
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${b.id}`,
        cookies: owner.cookie,
        payload: { parentId: target.id },
      })
      expect(res.statusCode).toBe(200)

      const tree = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/menu`,
        cookies: owner.cookie,
      })
      const roots = tree.json() as MenuTreeNodeResponse[]
      // target(새 부모)도 포함한다 — b가 빠지며 생긴 빈틈을 closeGap이 메울 때
      // target 자신의 sort_order도 3에서 2로 당겨져야 한다(target은 이동 대상 b의
      // 새 부모일 뿐, b가 있던 루트 형제 그룹의 네 번째 자리였다). target을 빼고
      // a·c만 보면 이 재번호가 실제로 이 값까지 미쳤는지 확인하지 못한다.
      const remainingRoots = roots.filter((r) => r.id === a.id || r.id === c.id || r.id === target.id)
      expect(remainingRoots.map((r) => r.title)).toEqual(['가', '다', '새 부모'])
      expect(remainingRoots.map((r) => r.sortOrder)).toEqual([0, 1, 2])
    })
  })

  it('기존 형제 그룹의 중간 위치로 옮기면 그 뒤 형제들이 밀린다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const target = await createMenuNode(ctx, owner.cookie, project.id, { title: '대상 부모' })
      // target 밑에 이미 형제가 셋 있는 상태(빈 그룹도 끝자리도 아님)에서, 그
      // 가운데(index 1)로 다른 노드를 끼워 넣는다 — openGap의 "새 위치보다 뒤에
      // 있는 형제들을 한 칸씩 미는" 경로는 그룹이 비어 있거나 맨 끝에 붙일 때는
      // 전혀 실행되지 않는다(WHERE sort_order >= insertIndex가 매칭하는 행이
      // 없다). 이 테스트만이 그 경로에 실제로 행을 매칭시킨다.
      const x = await createMenuNode(ctx, owner.cookie, project.id, { parentId: target.id, title: '엑스' })
      const y = await createMenuNode(ctx, owner.cookie, project.id, { parentId: target.id, title: '와이' })
      const z = await createMenuNode(ctx, owner.cookie, project.id, { parentId: target.id, title: '제트' })
      const moving = await createMenuNode(ctx, owner.cookie, project.id, { title: '이동 노드' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${moving.id}`,
        cookies: owner.cookie,
        payload: { parentId: target.id, sortOrder: 1 },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ id: moving.id, parentId: target.id, sortOrder: 1 })

      const tree = (
        await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/menu`, cookies: owner.cookie })
      ).json() as MenuTreeNodeResponse[]
      const targetNode = tree.find((n) => n.id === target.id)
      expect(targetNode?.children.map((c) => c.title)).toEqual(['엑스', '이동 노드', '와이', '제트'])
      expect(targetNode?.children.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3])
      void x
      void y
      void z
    })
  })

  it('자기 자신 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const node = await createMenuNode(ctx, owner.cookie, project.id, { title: '노드' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${node.id}`,
        cookies: owner.cookie,
        payload: { parentId: node.id },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.message).toBe('메뉴를 자기 자신의 하위로 옮길 수 없습니다')

      // SelfParentError는 어떤 UPDATE도 시도하기 전에 애플리케이션 검사에서
      // 던져진다 — DB에는 실패한 문장 자체가 없으므로 이 확인은 세이브포인트
      // 증거가 아니다. 응답의 400과는 별개로, 요청이 parent_id를 실제로
      // 바꾸지 않았는지를 확인한다.
      const row = await ctx.db
        .selectFrom('menu_nodes')
        .select('parent_id')
        .where('id', '=', node.id)
        .executeTakeFirstOrThrow()
      expect(row.parent_id).toBeNull()
    })
  })

  it('직계 자식 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const root = await createMenuNode(ctx, owner.cookie, project.id, { title: '루트' })
      const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: root.id, title: '자식' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${root.id}`,
        cookies: owner.cookie,
        payload: { parentId: child.id },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.message).toBe('메뉴를 자기 하위 메뉴로 옮길 수 없습니다')

      const row = await ctx.db
        .selectFrom('menu_nodes')
        .select('parent_id')
        .where('id', '=', root.id)
        .executeTakeFirstOrThrow()
      expect(row.parent_id).toBeNull()
    })
  })

  it('손자 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const root = await createMenuNode(ctx, owner.cookie, project.id, { title: '루트' })
      const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: root.id, title: '자식' })
      const grandchild = await createMenuNode(ctx, owner.cookie, project.id, {
        parentId: child.id,
        title: '손자',
      })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${root.id}`,
        cookies: owner.cookie,
        payload: { parentId: grandchild.id },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.message).toBe('메뉴를 자기 하위 메뉴로 옮길 수 없습니다')

      const row = await ctx.db
        .selectFrom('menu_nodes')
        .select('parent_id')
        .where('id', '=', root.id)
        .executeTakeFirstOrThrow()
      expect(row.parent_id).toBeNull()
    })
  })

  it('null로 주면 루트로 올라간다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const root = await createMenuNode(ctx, owner.cookie, project.id, { title: '루트' })
      const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: root.id, title: '자식' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${child.id}`,
        cookies: owner.cookie,
        payload: { parentId: null },
      })
      expect(res.statusCode).toBe(200)
      // 루트 레벨엔 이미 root(sortOrder 0)가 있다 — child는 그 형제 그룹의 맨 끝
      // (sortOrder 1)에 붙어야 한다. parentId만 확인하면 승격된 노드가 실제로
      // 새 형제 그룹 안에서 정렬 불변식을 지키는지는 검증하지 못한다.
      expect(res.json()).toMatchObject({ id: child.id, parentId: null, sortOrder: 1 })

      const tree = (
        await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/menu`, cookies: owner.cookie })
      ).json() as MenuTreeNodeResponse[]
      const rootsTitles = tree.map((n) => n.title)
      expect(rootsTitles).toContain('자식')
      const rootNode = tree.find((n) => n.id === root.id)
      expect(rootNode?.children).toEqual([])
    })
  })
})

describe('PATCH /api/projects/:projectId/menu/:nodeId — sortOrder', () => {
  it('마지막을 처음으로 옮기면 형제 순서가 정확히 뒤바뀐다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const a = await createMenuNode(ctx, owner.cookie, project.id, { title: '가' })
      const b = await createMenuNode(ctx, owner.cookie, project.id, { title: '나' })
      const c = await createMenuNode(ctx, owner.cookie, project.id, { title: '다' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${c.id}`,
        cookies: owner.cookie,
        payload: { sortOrder: 0 },
      })
      expect(res.statusCode).toBe(200)

      const tree = (
        await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/menu`, cookies: owner.cookie })
      ).json() as MenuTreeNodeResponse[]
      expect(tree.map((n) => n.title)).toEqual(['다', '가', '나'])
      expect(tree.map((n) => n.sortOrder)).toEqual([0, 1, 2])
      void a
      void b
    })
  })

  it('형제 수보다 큰 값은 끝으로 클램프된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const a = await createMenuNode(ctx, owner.cookie, project.id, { title: '가' })
      await createMenuNode(ctx, owner.cookie, project.id, { title: '나' })
      await createMenuNode(ctx, owner.cookie, project.id, { title: '다' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${a.id}`,
        cookies: owner.cookie,
        payload: { sortOrder: 99 },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().sortOrder).toBe(2)

      const tree = (
        await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/menu`, cookies: owner.cookie })
      ).json() as MenuTreeNodeResponse[]
      expect(tree.map((n) => n.title)).toEqual(['나', '다', '가'])
      expect(tree.map((n) => n.sortOrder)).toEqual([0, 1, 2])
    })
  })

  it('음수는 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const node = await createMenuNode(ctx, owner.cookie, project.id, { title: '노드' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${node.id}`,
        cookies: owner.cookie,
        payload: { sortOrder: -1 },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('소수는 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const node = await createMenuNode(ctx, owner.cookie, project.id, { title: '노드' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${node.id}`,
        cookies: owner.cookie,
        payload: { sortOrder: 1.5 },
      })
      expect(res.statusCode).toBe(400)
    })
  })
})

describe('DELETE /api/projects/:projectId/menu/:nodeId', () => {
  it('잎 노드를 지운다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const node = await createMenuNode(ctx, owner.cookie, project.id, { title: '지울 메뉴' })

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/menu/${node.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const row = await ctx.db.selectFrom('menu_nodes').selectAll().where('id', '=', node.id).executeTakeFirst()
      expect(row).toBeUndefined()
    })
  })

  it('남은 형제가 재번호된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const a = await createMenuNode(ctx, owner.cookie, project.id, { title: '가' })
      const b = await createMenuNode(ctx, owner.cookie, project.id, { title: '나' })
      const c = await createMenuNode(ctx, owner.cookie, project.id, { title: '다' })
      void a

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/menu/${b.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const tree = (
        await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/menu`, cookies: owner.cookie })
      ).json() as MenuTreeNodeResponse[]
      expect(tree.map((n) => n.title)).toEqual(['가', '다'])
      expect(tree.map((n) => n.sortOrder)).toEqual([0, 1])
      expect(tree.find((n) => n.id === c.id)?.sortOrder).toBe(1)
    })
  })

  it('자식 있는 노드는 409', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const root = await createMenuNode(ctx, owner.cookie, project.id, { title: '루트' })
      const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: root.id, title: '자식' })

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/menu/${root.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(409)
      // 태스크 13이 이 검사를 "자식 메뉴나 페이지"로 넓히면서 메시지도 함께 바뀌었다
      // (repos/menu.ts의 HasChildrenError). 이 테스트는 자식 메뉴 쪽 경로만 확인한다 —
      // 페이지 쪽 경로는 test/pages.test.ts의 "메뉴 연동" 테스트가 확인한다.
      expect(res.json().error.message).toBe('하위 메뉴나 페이지가 있어 삭제할 수 없습니다')

      // HasChildrenError는 DELETE 문장을 시도하기 전, 자식 존재를 먼저 확인하는
      // 단계에서 던져진다 — DB에 실패한 문장 자체가 없으므로 이 확인은 세이브포인트
      // 증거가 아니다(세이브포인트가 실제로 필요한 경로는 이 파일의 "DB의 RESTRICT
      // 제약도..." 테스트 하나뿐이다). 부모·자식 행이 둘 다 그대로 남아 있는지만 확인한다.
      const rows = await ctx.db
        .selectFrom('menu_nodes')
        .select('id')
        .where('id', 'in', [root.id, child.id])
        .execute()
      expect(rows).toHaveLength(2)
    })
  })

  it('없는 노드는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/menu/${NONEXISTENT_UUID}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('다른 프로젝트 노드는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie)
      const projectB = await createProject(ctx, owner.cookie)
      const nodeInB = await createMenuNode(ctx, owner.cookie, projectB.id, { title: 'B 노드' })

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectA.id}/menu/${nodeInB.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(404)

      const row = await ctx.db.selectFrom('menu_nodes').selectAll().where('id', '=', nodeInB.id).executeTakeFirst()
      expect(row).toBeDefined()
    })
  })

  it('DB의 RESTRICT 제약도 자식 있는 부모 삭제를 막는다 (앱 사전 검사를 거치지 않아도)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const root = await createMenuNode(ctx, owner.cookie, project.id, { title: '루트' })
      await createMenuNode(ctx, owner.cookie, project.id, { parentId: root.id, title: '자식' })

      // 라우트·리포지토리(=사전 자식 확인)를 거치지 않고 DB에 직접 DELETE를 보낸다 —
      // `0003-menu-nodes` 마이그레이션의 `parent_id ... ON DELETE RESTRICT`가
      // 애플리케이션 검사 없이도 실제로 막아 서는지 확인한다(브리프: "DB가 두
      // 번째 방어선이 된다"). `withTransaction`으로 감싸 이 의도된 위반이
      // `withApi`의 바깥 트랜잭션을 오염시키지 않게 한다.
      await expect(
        withTransaction(ctx.db, (trx) => trx.deleteFrom('menu_nodes').where('id', '=', root.id).execute()),
      ).rejects.toThrow()

      // 세이브포인트가 없다면 여기서부터 25P02로 실패한다 — 통과 자체가 증거다.
      const row = await ctx.db.selectFrom('menu_nodes').select('id').where('id', '=', root.id).executeTakeFirst()
      expect(row).toBeDefined()
    })
  })
})
