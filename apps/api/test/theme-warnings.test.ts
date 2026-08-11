/**
 * **경고가 저장을 통과하고 응답에 실린다** (P4c-1 T2 · 재라 #4).
 *
 * `themes`에 첫 `warning`이 생겼다(`suspicious-literal`·`node-handle-overwrite`).
 * 그 채널이 성립하려면 **두 곳을 함께** 고쳐야 한다 — `resolveTheme`의 *"이슈가 있으면
 * `theme`은 `null`"*과 이 파일이 겨냥하는 `assertResolvable`의 *"이슈가 있으면 422"*.
 * `routes/themes.ts`의 `assertResolvable` 주석이 하나만 고쳤을 때 각각 무엇이 죽는지를
 * 표로 적어 두었고, **양방향 구분력 실증은 P4c-1 보고에 있다.**
 *
 * **경고를 어느 라우트가 싣는가**는 아래 `전수` 절이 소스를 훑어 센다 — 손으로 센 수는
 * 틀린다(P4a-3이 *"형제 가드를 지나지 않은 자리"*를 여섯 번 찾았고 다섯을 닫은 뒤
 * 여섯째가 나왔다).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Theme } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { createProject, signup, withApi, type TestContext } from './helpers'

/**
 * `Tree.parts.node.paddingX`가 노드 손잡이(`padding-left`)를 덮는다 — `portal`·`docs`가
 * 실제로 쓰는 바로 그 선언이다(P4b-3의 ③이 쟀다). `gap: 'spce.4'`는 이름공간 오타다.
 */
function warningTheme(): Theme {
  return {
    meta: { id: 'warn', name: '경고', version: '1.0.0' },
    tokens: { scale: { space: { unit: '4px' } } },
    components: {
      Tree: { parts: { node: { paddingX: 'space.4' } } },
      Grid: { base: { gap: 'spce.4' } },
    },
  } as Theme
}

/** 경고도 오류도 없는 테마. `warnings` 키가 **안 붙는 것**을 재는 대조군이다. */
function cleanTheme(): Theme {
  return {
    meta: { id: 'clean', name: '깨끗', version: '1.0.0' },
    tokens: { semantic: { primary: '#2563eb' } },
  } as Theme
}

function post(ctx: TestContext, projectId: string, cookie: { wb_session: string }, theme: unknown) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/themes`,
    cookies: cookie,
    payload: { theme } as never,
  })
}

async function ownedProject(ctx: TestContext) {
  const owner = await signup(ctx)
  return { owner, project: await createProject(ctx, owner.cookie) }
}

describe('테마 경고가 저장을 통과한다', () => {
  it('POST — 경고만 있으면 201이고 warnings가 실린다', () =>
    withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      const res = await post(ctx, project.id, owner.cookie, warningTheme())

      expect(res.statusCode).toBe(201)
      const body: { id: string; warnings?: { code: string; severity: string; path: string }[] } =
        res.json()
      expect(body.warnings?.map((issue) => [issue.code, issue.severity, issue.path])).toEqual([
        ['node-handle-overwrite', 'warning', 'components.Tree.parts.node.paddingX'],
        ['suspicious-literal', 'warning', 'components.Grid.base.gap'],
      ])

      // **저장까지 갔는지 본다.** 응답만 보면 *"경고를 실었는데 안 저장했다"*와 구별되지 않는다.
      const stored = await ctx.db
        .selectFrom('themes')
        .select('id')
        .where('id', '=', body.id)
        .executeTakeFirst()
      expect(stored).toBeDefined()
    }))

  it('PUT — 같은 규칙이다', () =>
    withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const created = await post(ctx, project.id, owner.cookie, cleanTheme())
      expect(created.statusCode).toBe(201)

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/themes/${created.json().id as string}`,
        cookies: owner.cookie,
        payload: { theme: warningTheme() } as never,
      })

      expect(res.statusCode).toBe(200)
      expect((res.json() as { warnings?: unknown[] }).warnings).toHaveLength(2)
    }))

  /**
   * **비어 있으면 키 자체를 만들지 않는다**(`http/warnings.ts`). 이 대조군이 없으면
   * *"늘 붙는 키"*와 구별되지 않는다 — 페이지 쪽이 지키는 규칙과 같다.
   */
  it('경고가 없으면 warnings 키 자체가 없다', () =>
    withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      const res = await post(ctx, project.id, owner.cookie, cleanTheme())

      expect(res.statusCode).toBe(201)
      expect(Object.keys(res.json() as object)).not.toContain('warnings')
    }))

  /**
   * **오류가 섞이면 여전히 422다.** 그리고 그 응답의 `issues`에는 **경고도 함께** 실린다 —
   * 저작 UI가 한 번에 고칠 수 있어야 한다는 D2의 이유가 그대로다.
   */
  it('오류가 하나라도 있으면 422이고 issues에 경고도 함께 실린다', () =>
    withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      const broken = warningTheme()
      ;(broken.components as Record<string, unknown>)['Card'] = { base: { bg: 'semantic.없음' } }
      const res = await post(ctx, project.id, owner.cookie, broken)

      expect(res.statusCode).toBe(422)
      const issues: { code: string; severity: string }[] = res.json().error.issues
      expect(issues.some((issue) => issue.severity === 'error')).toBe(true)
      expect(issues.filter((issue) => issue.severity === 'warning')).toHaveLength(2)
    }))
})

/**
 * **전수 — 테마 문서를 해석하는 라우트가 정확히 둘이고 둘 다 경고를 싣는다.**
 *
 * 소스를 훑는 이유는 계획서가 넷으로 셌고 내가 다시 세어 둘이 됐기 때문이다(재라 #4의
 * 판정과 근거는 `routes/themes.ts`의 머리말에 있다). **다음 사람이 라우트를 하나 더
 * 만들고 `assertResolvable`을 부르면서 `withWarnings`를 빠뜨리면 여기가 죽는다.**
 */
describe('전수 — 경고를 싣는 라우트', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/routes/themes.ts', import.meta.url)),
    'utf8',
  )
  /**
   * **주석을 걷어낸 코드만 센다.** 이 파일의 주석은 판정 근거를 표로 적느라
   * `resolveTheme(theme, base)` 같은 이름을 여러 번 쓴다 — 안 걷어내면 수가 5가 되고,
   * 그 5는 *"라우트가 다섯"*이 아니라 *"주석이 넷"*이다.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('소스를 실제로 읽고 주석을 걷어낸다', () => {
    // 경로가 어긋나면 빈 문자열에서 아래 검사가 조용히 통과한다.
    expect(source).toContain('function assertResolvable')
    expect(source).toContain('themeRoutes')
    // 걷어내기가 헛돌면(주석이 남거나 코드까지 지우면) 아래 수가 전부 틀린다.
    expect(source).toContain('*/')
    expect(code).not.toContain('*/')
    expect(code).toContain('function assertResolvable')
  })

  it('assertResolvable을 부르는 자리가 둘이고 둘 다 warnings를 받는다', () => {
    const calls = [...code.matchAll(/^\s*(?:const (\w+) = )?assertResolvable\(/gm)]
    expect(calls).toHaveLength(2)
    // 반환값을 안 받으면 경고가 그 자리에서 사라진다 — 그것을 잡는다.
    expect(calls.map((call) => call[1])).toEqual(['warnings', 'warnings'])
  })

  it('withWarnings를 쓰는 자리도 둘이다', () => {
    expect(code.match(/withWarnings\(/g)).toHaveLength(2)
  })

  /**
   * **`resolveTheme`을 부르는 다른 자리가 있으면 여기가 죽는다.** `currentTheme`은
   * `mergeTheme`만 부르고 해석하지 않는다 — 그 판정이 뒤집히면 경고를 실을 라우트가
   * 하나 느는 것이고, 재라 #4를 다시 판정해야 한다.
   */
  it('resolveTheme 호출은 assertResolvable 안의 하나뿐이다', () => {
    expect(code.match(/\bresolveTheme\(/g)).toHaveLength(1)
  })
})
