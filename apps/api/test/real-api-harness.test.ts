/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `revisions-concurrency.test.ts`와 같은
 * 부류다.
 *
 * ---
 *
 * # 하네스가 스스로를 재는 자리 (P3-1 T1 · D1)
 *
 * `helpers.ts`의 `withRealApi`·`resetRealData`는 **다섯 파일이 각자 들고 있던 사본을 합친
 * 것**이다. 사본이 하나가 되면 *"이 청소가 정말로 다 지우는가"*를 한 곳에서 물을 수 있다 —
 * 앞서는 파일마다 각자 믿고 있었다.
 *
 * **청소 방식을 판정한다(D1).** 후보는 셋이었다.
 *
 * | 후보 | 왜 아닌가 / 왜인가 |
 * |---|---|
 * | 관련 테이블 TRUNCATE | `themes`에 프로젝트에 매이지 않은 **시스템 테마** 행이 산다(§6.10). 그것까지 지우면 다음 `buildApp`의 `syncSystemThemes`가 다시 넣기 전까지 프로젝트 생성이 깨진다. 게다가 ACCESS EXCLUSIVE 잠금이라 같은 DB를 보는 커넥션을 이유 없이 세운다 |
 * | 만든 프로젝트만 지운다 | 케이스가 만든 id를 **호출자가 기억해야** 한다. 중간에 죽으면 그 목록이 사라져 다음 케이스가 오염된 판에서 돈다 — 지금 `beforeEach`·`afterEach` 양쪽에 거는 이유가 정확히 그것이다 |
 * | **`projects`·`users` 두 줄의 DELETE** ✅ | 나머지는 전부 그 둘에 FK로 매여 CASCADE로 따라간다. 시스템 테마는 프로젝트에 안 매여 있어 **남는다** — 남아야 맞는다 |
 *
 * **아래 케이스가 그 마지막 칸을 실제로 센다.** 표에 적어 두기만 하면 새 테이블이 생겼을 때
 * 아무도 모른다.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type TestContext,
} from './helpers'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

/**
 * 청소가 비워야 하는 테이블. **`themes`가 빠져 있는 것이 판정이다** — 시스템 테마는
 * 프로젝트에 매여 있지 않으므로 남는다(위 표).
 */
const CLEARED_TABLES = [
  'users',
  'sessions',
  'projects',
  'project_members',
  'menu_nodes',
  'pages',
  'revisions',
  'layouts',
  'comments',
  'snapshots',
  'presets',
] as const

async function countRows(table: (typeof CLEARED_TABLES)[number] | 'themes'): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow()
  return Number(row.count)
}

/** 청소가 지워야 할 것을 **한 자리도 빠짐없이** 만든다. 분모가 0이면 아래가 공허해진다. */
async function fillEveryTable(ctx: TestContext): Promise<void> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const nodeId = (page.schema as { root: { id: string } }).root.id

  const post = async (url: string, payload: Record<string, unknown>): Promise<void> => {
    const res = await ctx.app.inject({ method: 'POST', url, cookies: owner.cookie, payload })
    if (res.statusCode !== 201) throw new Error(`픽스처 실패 ${url} (${res.statusCode}): ${res.body}`)
  }

  // 코멘트가 `revisions`도 함께 채운다 — 번호를 붙이는 편집이 revision을 남긴다(P5-1).
  await post(`/api/projects/${project.id}/pages/${page.id}/comments`, { nodeId, body: '청소 대상' })
  await post(`/api/projects/${project.id}/snapshots`, { tag: 'v1' })
  await post(`/api/projects/${project.id}/presets`, { name: '청소 대상 프리셋', schema: [] })
  await post(`/api/projects/${project.id}/themes`, {
    theme: { meta: { id: 'harness-target', name: '청소 대상 테마', version: '1.0.0' } },
  })
}

describe('실커밋 하네스의 청소 (P3-1 D1)', () => {
  it('청소가 비워야 할 테이블을 케이스가 실제로 채운다 — 분모', async () => {
    await withRealApi(async (ctx) => {
      await fillEveryTable(ctx)

      const empty: string[] = []
      for (const table of CLEARED_TABLES) {
        if ((await countRows(table)) === 0) empty.push(table)
      }

      expect(empty).toEqual([])
    })
  })

  it('청소가 그 테이블을 전부 비운다', async () => {
    await withRealApi(async (ctx) => {
      await fillEveryTable(ctx)
      await resetRealData()

      const left: string[] = []
      for (const table of CLEARED_TABLES) {
        if ((await countRows(table)) > 0) left.push(table)
      }

      expect(left).toEqual([])
    })
  })

  it('시스템 테마는 남는다 — 지우면 다음 프로젝트 생성이 깨진다', async () => {
    await withRealApi(async (ctx) => {
      await fillEveryTable(ctx)
      await resetRealData()

      expect(await countRows('themes')).toBeGreaterThan(0)

      // 남았다는 것을 **쓸 수 있다는 것으로** 확인한다. 행 수만 세면 그 행이 쓸모 있는지는
      // 모른다 — 프로젝트 생성이 기본 레이아웃의 `theme_id`로 시스템 테마를 가리킨다.
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      expect(project.id).toBeTruthy()
    })
  })

  it('하네스가 진짜 포트를 연다 — WS 케이스가 이것에 매여 있다', async () => {
    await withRealApi(async (ctx) => {
      const res = await fetch(`http://127.0.0.1:${ctx.port}/health`)

      expect(res.status).toBe(200)
    })
  })
})

/**
 * **누가 이 청소를 쓰나 — 목록을 손으로 안 적고 센다.**
 *
 * 이 인구조사가 있는 이유: 문서가 *"api 테스트 파일은 모두 예순여덟"*처럼 **수를 산문에
 * 적었다가 같은 판에서 낡았다**(테스트 파일 둘을 더한 것이 이 판 자신이다 — 귀속: 리뷰 §7.1).
 * 수는 파일을 더할 때마다 낡지만 **아래 불변식은 안 낡는다.**
 *
 * 지키는 것: **실커밋 하네스를 쓰는 파일은 전부 청소를 건다.** 하나라도 안 걸면 그 파일이
 * 커밋한 행이 다음 파일의 판에 남는다 — `singleFork`가 파일을 직렬화할 뿐 판을 비우지는
 * 않기 때문이다.
 */
describe('실커밋 하네스를 쓰는 파일은 전부 청소를 건다', () => {
  const testDir = new URL('.', import.meta.url)
  const sources = readdirSync(testDir)
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => ({ name, source: readFileSync(new URL(name, testDir), 'utf8') }))

  it('센 것이 비어 있지 않다 — 디렉터리를 못 읽으면 아래가 통째로 헛돈다', () => {
    expect(sources.length).toBeGreaterThan(10)
    expect(sources.map((file) => file.name)).toContain('real-api-harness.test.ts')
  })

  it('`withRealApi` 를 쓰면서 `resetRealData` 를 안 거는 파일이 없다', () => {
    const 샌다 = sources
      .filter((file) => file.source.includes('withRealApi'))
      .filter((file) => !file.source.includes('beforeEach(resetRealData)'))
      .map((file) => file.name)

    expect(샌다).toEqual([])
  })

  it('청소를 거는 파일은 **`afterEach` 에도** 건다 — 중간에 죽은 케이스가 판을 남긴다', () => {
    const 한쪽만 = sources
      .filter((file) => file.source.includes('beforeEach(resetRealData)'))
      .filter((file) => !file.source.includes('afterEach(resetRealData)'))
      .map((file) => file.name)

    expect(한쪽만).toEqual([])
  })
})
