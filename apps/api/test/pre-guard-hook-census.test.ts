/**
 * **가드 앞 훅 인구조사.** 등록된 라우트 **전부**에서, 권한 가드보다 먼저 도는 훅이 **허용 목록의 것뿐인가**를
 * 라우트 옵션의 **값**으로 잰다.
 *
 * # 왜 — 가드 앞 훅은 권한을 안 본 채 답할 수 있다
 *
 * 코멘트 게시의 `replayBeforeGuard`(`preValidation`)는 같은 키의 자기 행이 있으면 **가드 앞에서 200 을 답한다**
 * (`apps/api/README.md`의 «멱등 키»). 그런 훅이 다른 라우트에 달리면 권한을 안 본 답이 나간다. 이 자 말고는 그것을
 * 재는 자가 없다 — 라우트를 세는 다른 넷이 이 훅을 보지 않는다(변조해 네 파일을 돌려 본다):
 *
 * | 변조 | 다른 네 자 |
 * |---|---|
 * | **이미 표에 있는** 라우트(프리셋 목록 `GET`)에 가드 앞 훅(`x-probe`가 있으면 200)을 단다 | **넷 다 통과** — 값 분모 둘(`permission-matrix` · `restore-lock-census` — `guarded-routes.ts`)은 라우트 집합과 최소 역할만 보고, `onRoute` 자 둘(`token-route-census` · `actor-census`)은 라우트는 보지만 픽스처가 `x-probe`를 안 실어 훅이 안 답한다 |
 * | **새** 라우트 + 같은 훅 | 값 분모 둘이 죽는다 — 훅이 아니라 **표에 없는 라우트**라서다. 사람이 표에 한 줄 더하면 초록이 되고 훅은 여전히 안 본다 |
 *
 * 행동으로 재는 자(매트릭스)도 이것을 못 잡는다 — 가드 앞 훅은 «조건이 맞을 때만 답한다»는 모양이라 픽스처가 그
 * 조건을 안 만들면 안 답한다. 그래서 **어디에 달렸는가**를 구조로 잰다.
 *
 * # 무엇을 세나 — 값으로, 참조로
 *
 * `buildApp`의 `onRoute` 이음매가 Fastify 가 받은 라우트 옵션을 그대로 준다(`RegisteredRoute`).
 *
 * | 자리 | 가드 앞인가 |
 * |---|---|
 * | `onRequest` · `preParsing` · `preValidation`(라우트 옵션) | **전부** — Fastify 는 단계 순으로 돌리고 가드는 `preHandler`다. 옵션을 적는 순서는 뜻이 없다 |
 * | `preHandler` 배열의 **마지막을 뺀** 앞자리 | 그렇다 — 배열은 적은 순서로 돌고 가드는 마지막에 둔다(`ws/routes.ts`의 `guards`) |
 *
 * 허용 목록과 **참조로** 견준다. 이름·원문으로 견주지 않는다 — 같은 이름의 다른 함수가 지나간다. 결과는 라우트마다
 * 이름표의 배열로 옮겨 통째로 단언한다 — 어느 라우트의 어느 자리가 새는지 실패 메시지가 그대로 말한다.
 *
 * # 실패 방향
 *
 * - **정당한 훅을 새로 달면 빨강이다(거짓 빨강)** — 허용 목록에 더하라는 뜻이다. 더하는 사람이 «이 훅이 정말 권한
 *   앞에서 돌아도 되나»를 판정한다.
 * - 가드가 `preHandler` 배열의 마지막이 아니면(`[projectGuard(…), 뒤 훅]`) 가드 자신이 «목록에 없는 앞자리»로
 *   잡힌다 — 이것도 거짓 빨강이다.
 * - 허용 목록에 있는데 그 라우트에서 사라졌으면 빨강이다(반대편) — 목록이 낡지 않게.
 * - **거짓 초록**: 라우트 옵션과 `preHandler` 배열로 단 것은 전부 분모에 든다. 남는 사각은 아래 «못 재는 것»이다.
 *
 * # 변조 — 죽는 것(api 전량)
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 새 라우트 + 가드 앞 훅을 자연 순서로(위 표의 첫 줄) | *"라우트마다 가드 앞 훅이 …"* **혼자** |
 * | 같은 새 라우트 · `preHandler: [새는 훅, projectGuard(…)]` | 같은 케이스 **혼자** |
 * | `replayBeforeGuard`를 **다른** 라우트(코멘트 `PATCH`)에 단다 | 같은 케이스 **혼자** — 허용은 라우트마다다 |
 * | 새는 훅의 이름을 `replayBeforeGuard`로 짓는다(다른 함수) | 같은 케이스 **혼자** — 이름이 아니라 참조로 견준다 |
 * | 무해한 `onRequest`를 코멘트 목록 `GET`에 단다 | 같은 케이스 **혼자** — 거짓 빨강의 방향이다 |
 * | 게시 라우트에서 `replayBeforeGuard`를 뗀다 | 같은 케이스(반대편) · `comments.test.ts`의 *"역할이 내려가거나 멤버에서 빠진 뒤에도 …"*·*"첫 게시 뒤 그 노드가 지워졌어도 …"* — 행동의 주인은 뒤의 둘 |
 * | 게시 라우트의 옵션 순서만 뒤집는다 | **0** — 값이 같다. 라우트를 값으로 세는 다른 자들도 안 죽는다 |
 * | 코멘트 플러그인에 `addHook('preValidation', 새는 훅)` | **0** — api 전량이 통과한다(아래 «못 재는 것»의 첫 줄) |
 *
 * # 못 재는 것
 *
 * - **플러그인의 `addHook`** — Fastify 는 그것을 `onRoute`가 불린 **뒤**(`preReady`)에 라우트 옵션과 합치므로
 *   이 이음매에 안 보인다(`fastify/lib/route.js`). 지금 전역 가드 앞 훅은 인증(`auth/plugin.ts`의 `onRequest`)
 *   하나다. 코멘트 플러그인에 `addHook('preValidation', …)`으로 새는 훅을 달면 **이 자도 api 스위트의 무엇도 안
 *   죽는다**(위 표의 끝 줄) — 이 부류의 거짓 초록 길이다. 합쳐진 훅을 **값으로** 주는 공개 API 는 없다 —
 *   `findRoute`는 일부러 핸들러·파라미터만 주고(`fastify/lib/route.js`의 «reduce the expose surface»),
 *   `printRoutes({ includeHooks: true })`는 글자로 그린다(되파싱하지 않는 까닭은 `app.ts`의 `onRoute` 주석).
 * - **허용된 훅이 무엇을 하는가** — 이 자는 어디에 달렸는지만 본다. `replayBeforeGuard`의 행동(남의 행 · 스코프 밖 ·
 *   키 없음이면 가드로 넘긴다)은 `comments.test.ts`의 «멱등 키» 절이 잰다.
 * - **가드 뒤에 돌지만 가드의 답을 바꾸는 훅**(`onSend` · `preSerialization`) — 가드 앞이 아니라 이 물음 밖이다.
 */
import { describe, expect, it } from 'vitest'
import type { RegisteredRoute } from '../src/app'
import { replayBeforeGuard } from '../src/routes/comments'
import { requireSessionAuth } from '../src/ws/routes'
import { withApi } from './helpers'

type Stage = 'onRequest' | 'preParsing' | 'preValidation' | 'preHandler'

/**
 * **허용 목록** — (라우트, 자리)마다 가드 앞에서 돌아도 되는 훅. 이름표는 실패 메시지에만 쓴다 — 견주는 것은 참조다.
 *
 * | 훅 | 왜 가드 앞인가 |
 * |---|---|
 * | `replayBeforeGuard` | 강등·제외 뒤 같은 키 재전송이 403·404 대신 재생을 받아야 한다(`routes/comments.ts`의 주석) |
 * | `requireSessionAuth` | WS 는 쿠키만이다 — 토큰이 가드를 통과하기 전에 끊는다(`ws/routes.ts`의 주석) |
 *
 * `HEAD`는 Fastify 가 `GET`마다 같은 옵션으로 다는 것이라 `GET`과 함께 적는다.
 */
const ALLOWED: Readonly<Record<string, readonly { stage: Stage; name: string; hook: unknown }[]>> = {
  'POST /api/projects/:projectId/pages/:pageId/comments': [{ stage: 'preValidation', name: 'replayBeforeGuard', hook: replayBeforeGuard }],
  'GET /api/projects/:projectId/ws': [{ stage: 'preHandler', name: 'requireSessionAuth', hook: requireSessionAuth }],
  'HEAD /api/projects/:projectId/ws': [{ stage: 'preHandler', name: 'requireSessionAuth', hook: requireSessionAuth }],
}

/** 그 라우트에서 가드 앞에 도는 훅 — 자리와 값. 위 머리말의 표 그대로다. */
function beforeGuard(route: RegisteredRoute): { stage: Stage; hook: unknown }[] {
  return [
    ...route.beforePreHandler.onRequest.map((hook) => ({ stage: 'onRequest' as const, hook })),
    ...route.beforePreHandler.preParsing.map((hook) => ({ stage: 'preParsing' as const, hook })),
    ...route.beforePreHandler.preValidation.map((hook) => ({ stage: 'preValidation' as const, hook })),
    ...route.preHandlers.slice(0, -1).map((hook) => ({ stage: 'preHandler' as const, hook })),
  ]
}

async function withRoutes(fn: (routes: RegisteredRoute[]) => void): Promise<void> {
  const routes: RegisteredRoute[] = []
  await withApi(
    async () => {
      fn(routes)
    },
    { onRoute: (route) => routes.push(route) },
  )
}

describe('가드 앞 훅 인구조사 — 권한 가드보다 먼저 도는 훅은 허용 목록의 것뿐이다', () => {
  it('분모를 실제로 만든다 — 라우트 목록이 비어 있지 않고 허용 목록의 라우트가 다 있다', async () => {
    await withRoutes((routes) => {
      // 이음매가 어긋나면 **빈 집합에서 아래가 조용히 통과한다**(`token-route-census.test.ts`의 같은 줄).
      expect(routes.length).toBeGreaterThan(30)
      const seen = new Set(routes.map((route) => `${route.method} ${route.url}`))
      expect(Object.keys(ALLOWED).filter((key) => !seen.has(key))).toEqual([])
    })
  })

  it('라우트마다 가드 앞 훅이 허용 목록과 같다 — 참조로 견준다', async () => {
    await withRoutes((routes) => {
      const observed: Record<string, string[]> = {}
      for (const route of routes) {
        const key = `${route.method} ${route.url}`
        const allowed = ALLOWED[key] ?? []
        const labels = beforeGuard(route).map(({ stage, hook }) => {
          const match = allowed.find((entry) => entry.stage === stage && entry.hook === hook)
          if (match !== undefined) return `${stage}: ${match.name}`
          const name = typeof hook === 'function' && hook.name !== '' ? hook.name : '익명'
          return `${stage}: ✗ 허용 목록에 없음(${name})`
        })
        if (labels.length > 0) observed[key] = labels
      }

      const expected = Object.fromEntries(
        Object.entries(ALLOWED).map(([key, entries]) => [key, entries.map((entry) => `${entry.stage}: ${entry.name}`)]),
      )
      expect(observed).toEqual(expected)
    })
  })
})
