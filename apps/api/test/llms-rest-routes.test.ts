/**
 * **`/llms.txt` 의 REST 표(`@wirebound/mcp` 의 `LLMS_REST_ROUTES`)가 등록된 라우트와 맞는가** — 줄마다 그 메서드 · 경로가 Fastify 에
 * 등록됐고(`onRoute` — `guarded-routes.ts` 의 `routeCensus`), 적은 최소 역할이 가드의 값과 같다. 라우트를 걷거나 경로 · 역할을 바꾸면
 * 여기서 죽는다.
 *
 * **표에 빠진 라우트는 안 잰다** — 그 표는 고른 요약이다(`llms-txt.ts` 머리말 «REST 요약은 고른 것이다»). 토큰으로 닿는지도 여기서 따로
 * 안 잰다 — `:projectId` 라우트 전부가 토큰에 사람을 채우는 것은 `token-route-census.test.ts` 가 재고, 토큰을 거절하는 프로젝트
 * 라우트(토큰 관리 셋 · `/ws`)는 이 표에 없다.
 */
import { LLMS_REST_ROUTES } from '@wirebound/mcp'
import { describe, expect, it } from 'vitest'
import { routeCensus } from './guarded-routes'

describe('/llms.txt 의 REST 표', () => {
  it('줄마다 등록된 프로젝트 라우트이고 최소 역할이 가드와 같다', async () => {
    const { guarded } = await routeCensus()
    // 이음매가 어긋나 분모가 비면 아래 `undefined` 비교가 모든 줄에서 같이 빨갛다 — 그래도 원인이 보이게 먼저 단언한다.
    expect(guarded.length).toBeGreaterThan(20)
    const minOf = new Map(guarded.map((route) => [`${route.method} ${route.url}`, route.min]))

    expect(LLMS_REST_ROUTES.length).toBeGreaterThan(0)
    const mismatched = LLMS_REST_ROUTES.filter((route) => minOf.get(`${route.method} ${route.path}`) !== route.min).map(
      (route) => `${route.method} ${route.path}: 표 ${route.min} · 가드 ${minOf.get(`${route.method} ${route.path}`) ?? '등록 안 됨'}`,
    )
    expect(mismatched).toEqual([])
  })
})
