/**
 * 표시 옵션 라우트 — 설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「표시 옵션 저장」. 편집 캔버스에서 사람이 끈
 * 레이아웃 영역(GNB · LNB …)을 사람 × 프로젝트마다 둔다. `/api/projects` prefix 로 등록한다. SQL 은 `repos/view-prefs.ts`.
 *
 * | 경로 | 응답 |
 * |---|---|
 * | `GET /:projectId/view-prefs` | 200 `{ hiddenRegions }` — 행이 없으면 `[]` |
 * | `PUT /:projectId/view-prefs` | 200 `{ hiddenRegions }` — 본문 그대로 통째로 바꾼다 |
 *
 * - **viewer 도 저장한다** — 읽기 도구의 설정이다. 다루는 것은 자기 행뿐이다.
 * - **세션으로만이다** — 사람의 화면 설정이라 토큰은 403(`auth/session-only.ts`). 경로 파라미터가 `:projectId` 라 인증 훅이 토큰을
 *   받으므로(`auth/plugin.ts` 머리말 표) 거절은 이 파일이 한다.
 * - **열쇠는 글자로만 본다** — 어느 영역이 있는지는 테마 manifest 가 정하고, 모르는 열쇠도 받아 둔다(테마를 바꿨다 돌아오면 다시
 *   꺼진다). 그리는 쪽이 지금 테마가 선언한 영역에만 적용한다.
 * - **실시간 방송이 없다** — 남에게 보일 것이 아니다.
 *
 * # 오류 표
 *
 * | 상황 | 상태 |
 * |---|---|
 * | 열쇠 꼴 밖 · 33 개 이상 · 겹친 열쇠 · 선언되지 않은 키 | **400**(본문 zod) |
 * | 토큰으로 부름 | **403** |
 * | 비멤버 · 없는 프로젝트 | **404**(가드) |
 * | 쓰기가 복원 · 프로젝트 삭제를 기다리는 사이 멤버에서 빠짐 · 프로젝트가 지워짐 | **404**(재확인 · `lockProjectShared`) |
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { requireSessionUser } from '../auth/session-only'
import { withTransaction } from '../db/tx'
import { parseBody, parseParams } from '../http/parse'
import { lockProjectShared } from '../repos/projects'
import { findHiddenRegions, upsertHiddenRegions } from '../repos/view-prefs'

/**
 * 열쇠 «<레이아웃>.<영역 id>». 레이아웃 셋은 페이지 문서의 `layout` 값, 영역 id 꼴은 테마 manifest 의 `LayoutRegionDecl.id` 와 같다
 * (설계 「테마 계약」). 그 둘이 스키마 · 테마 패키지에 서기 전이라 글자로 둔다 — 바뀌면 함께 바꾼다.
 */
export const VIEW_PREF_KEY = /^(blank|popup|subpage)\.[a-z][A-Za-z0-9]{0,31}$/
export const VIEW_PREF_MAX = 32

const ProjectIdParams = z.object({ projectId: z.uuid() })

const ViewPrefsBody = z.strictObject({
  hiddenRegions: z
    .array(z.string().regex(VIEW_PREF_KEY, '영역 열쇠는 «<레이아웃>.<영역 id>» 꼴이어야 합니다'))
    .max(VIEW_PREF_MAX, `끈 영역은 ${VIEW_PREF_MAX}개까지입니다`)
    .refine((keys) => new Set(keys).size === keys.length, '같은 영역 열쇠가 두 번 있습니다'),
})

const SESSION_ONLY = 'API 토큰으로는 보기 설정을 다룰 수 없습니다. 로그인 후 다시 시도하세요'

export function viewPrefRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/view-prefs', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const user = requireSessionUser(request, SESSION_ONLY)
      return { hiddenRegions: await findHiddenRegions(app.db, user.id, projectId) }
    })

    app.put('/:projectId/view-prefs', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const user = requireSessionUser(request, SESSION_ONLY)
      const body = parseBody(ViewPrefsBody, request.body)
      const hiddenRegions = await withTransaction(app.db, async (trx) => {
        // **프로젝트 행이 먼저다**(`routes/tokens.ts` 의 발급과 같은 차례). 404 꾸밈이 아니다 — **행이 이미 있으면 upsert 가 FK 검사를
        // 안 돌아, 이 잠금만이 프로젝트 삭제와 차례를 정한다.** 떼면 삭제가 CASCADE 에서 이 행에 서고 재확인이 삭제가 지운 멤버 행에
        // 서서 교착이다(삭제 500 · `view-prefs-delete-order.test.ts`). 처음 쓰는 판은 FK 가 같은 `KEY SHARE` 를 걸지만 삭제 뒤에
        // 깨면 23503(봉투 없는 500)이라, 먼저 잡아 0 행 → 404 로 끊는다.
        await lockProjectShared(trx, projectId)
        const saved = await upsertHiddenRegions(trx, user.id, projectId, body.hiddenRegions)
        // 커밋 순간의 권한 — 복원 · 프로젝트 삭제를 기다리는 사이 멤버에서 빠졌으면 404 로 되돌린다(`guard-in-lock.test.ts`).
        await recheckProjectRole(trx, request)
        return saved
      })
      return { hiddenRegions }
    })
  }
}
