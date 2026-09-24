/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 테마 고르기가 가드 뒤 커밋된 프로젝트 삭제를 만나면 404 다 — «기본 레이아웃이 없다»(409)가 아니다
 *
 * 가드는 삭제 전의 멤버십을 읽고 지난다. 그 뒤 핸들러가 무엇이든 읽기 **전에** 삭제가 커밋되면, 핸들러는 사라진 프로젝트를 만난다.
 * 기본 레이아웃을 프로젝트 행 잠금(`repos/projects.ts`의 `lockProjectShared`) **앞**에서 읽으면 그 판을 «0007 이전 프로젝트라 기본
 * 레이아웃이 없다»로 읽어 409 와 거짓 문장을 낸다. 잠금 뒤에 읽으면 잠금이 0 행을 보고 404 다.
 *
 * **«가드 뒤 · 핸들러의 첫 조회 앞»에 문을 세운다** — 핸들러가 부르는 두 모듈 함수(`findDefaultLayout` · `lockProjectShared`) 중
 * 먼저 불리는 쪽이 문 앞에 선다. 그래서 어느 순서의 코드에서나 같은 자리다. 혼자 죽는 변조: 기본 레이아웃을 트랜잭션 밖에서
 * 프로젝트 행보다 먼저 읽는다.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'

const door = vi.hoisted(() => {
  let armed = false
  let reached = (): void => {}
  let open = (): void => {}
  const state = {
    reached: Promise.resolve(),
    opened: Promise.resolve(),
    arm(): void {
      armed = true
      state.reached = new Promise<void>((resolve) => (reached = resolve))
      state.opened = new Promise<void>((resolve) => (open = resolve))
    },
    open: (): void => open(),
    /** 무장돼 있으면 한 번만 선다 — 처음 부른 쪽이. */
    async pass(): Promise<void> {
      if (!armed) return
      armed = false
      reached()
      await state.opened
    },
  }
  return state
})

vi.mock('../src/repos/layouts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repos/layouts')>()
  return {
    ...actual,
    findDefaultLayout: async (...args: Parameters<typeof actual.findDefaultLayout>) => {
      await door.pass()
      return actual.findDefaultLayout(...args)
    },
  }
})

vi.mock('../src/repos/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repos/projects')>()
  return {
    ...actual,
    lockProjectShared: async (...args: Parameters<typeof actual.lockProjectShared>) => {
      await door.pass()
      return actual.lockProjectShared(...args)
    },
  }
})

/**
 * **`helpers`를 여기서 다시 적재한다.** `test/setup.ts`가 `helpers` → `src/app` → 라우트 · 저장소를 이 파일보다 먼저 적재하므로, 위
 * `vi.mock`은 이미 적재된 모듈에 닿지 않는다(목 팩토리가 한 번도 안 불린다). 모듈 목록을 비우고 다시 적재하면 새 그래프가 목을 받는다.
 * 그 그래프의 DB 풀은 `setup.ts`가 닫는 것과 다른 것이라 여기서 닫는다.
 */
let helpers: typeof import('./helpers')
beforeAll(async () => {
  vi.resetModules()
  helpers = await import('./helpers')
})
afterAll(async () => {
  await helpers.closeTestDb()
})
beforeEach(() => helpers.resetRealData())
afterEach(() => helpers.resetRealData())

it('테마 고르기 — 가드 뒤에 프로젝트 삭제가 커밋되면 404 다(«기본 레이아웃이 없다» 409 가 아니다)', async () => {
  const { createProject, signup, withRealApi } = helpers
  await withRealApi(async (ctx) => {
    const owner = await signup(ctx)
    const project = await createProject(ctx, owner.cookie)

    door.arm()
    // `inject`는 `then`이 불려야 요청을 낸다 — 곧바로 내게 한다.
    const choosing = ctx.app
      .inject({ method: 'PUT', url: `/api/projects/${project.id}/theme`, cookies: owner.cookie, payload: { themeId: null } })
      .then((response) => response)
    await door.reached
    const deleted = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: owner.cookie })
    expect(deleted.statusCode).toBe(204)
    door.open()

    const chosen = await choosing
    expect(chosen.statusCode).toBe(404)
  })
}, 30_000)
