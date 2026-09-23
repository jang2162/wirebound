/**
 * 메뉴 트리 라우트: 조회·생성·수정·삭제. `projectRoutes`(`routes/projects.ts`)와
 * 같은 `/api/projects` prefix로 등록한다(`app.ts`) — 파일은 분리하되 URL
 * 네임스페이스는 공유한다. 이 파일의 라우트는 전부 `/:projectId/menu`
 * (그 아래 `/:nodeId`) 아래에 있다.
 *
 * HTTP·zod 검증만 다룬다 — SQL과 정렬·이동 불변식은 전부 `repos/menu.ts`에
 * 맡긴다. 권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가 전담한다 — 이
 * 파일은 역할을 비교하지 않는다.
 *
 * 페이지 라우트(`/:projectId/pages`)는 이 파일이 아니라 `routes/pages.ts`에 있다 —
 * 페이지는 이 트리의 리프에 매달린다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { samePageMeta } from '@wirebound/schema'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { withTransaction } from '../db/tx'
import { badRequest, conflict, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  DescendantParentError,
  HasChildrenError,
  ParentNotFoundError,
  SelfParentError,
  deleteMenuNode,
  insertMenuNode,
  listMenuTree,
  lockMenuTitle,
  updateMenuNode,
} from '../repos/menu'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const NodeParams = z.object({ projectId: z.uuid(), nodeId: z.uuid() })

const Title = z.string().min(1, '제목을 입력하세요').max(200, '제목은 200자 이하여야 합니다')

/**
 * `sortOrder`는 `z.int().min(0)`이다 — 음수는 여기서 400으로 걸러지고, 형제
 * 수보다 큰 값은 `repos/menu.ts`가 클램프한다(브리프 "정렬 규칙" 절: 큰 값은
 * "맨 뒤로 보내라"는 흔한 의도라 오류로 다루지 않는다).
 */
const SortOrder = z.int().min(0)

/** `z.strictObject`라 선언되지 않은 키가 오면 그 자체로 400이다(`routes/projects.ts`·`routes/members.ts`와 같은 관례). */
const CreateMenuBody = z.strictObject({
  parentId: z.uuid().nullable().optional(),
  title: Title,
})

/**
 * **고치기 전 제목**(이월 5차 ② — 아래 `PATCH` 핸들러의 머리말). 페이지의 `MetaBase`(`routes/pages.ts`)와 같은 자세다 —
 * 바꿀 값의 규칙(`Title`)으로 재지 않는다. 이것은 저장할 값이 아니라 **견줄 값**이다.
 */
const MenuBase = z.strictObject({ title: z.string().optional() })

/**
 * 필드가 전부 optional이므로, 빈 본문(`{}`)이 통과하지 않도록 `.refine`으로 따로 막는다(`routes/projects.ts`의 `UpdateProjectBody`와 같은 관례).
 *
 * **`base`의 규칙은 페이지(`routes/pages.ts`의 `UpdatePageBody`)와 같은 셋이고 문장도 같다** — 바꾸지 않는 칸의 바탕은
 * 400 · 바꾸는 제목에 바탕이 없으면 400(`base: {}`가 비교 없이 쓰지 않게) · **자리 옮기기(`parentId`·`sortOrder`)와
 * 한 본문에 못 싣는다 — 400.** 셋째의 까닭은 잠금 순서다: 바탕 경로는 이 행을 먼저 잡고(`lockMenuTitle`), 자리 옮기기는
 * 프로젝트 행을 먼저 잡는다(`repos/projects.ts`의 `lockProjectTree`) — 한 본문에 실으면 «이 행 → 프로젝트 행»으로 거꾸로
 * 서서 동시에 온 자리 옮기기와 서로 기다린다. 웹은 이름 변경과 자리 옮기기를 따로 보낸다.
 */
const UpdateMenuBody = z
  .strictObject({
    title: Title.optional(),
    parentId: z.uuid().nullable().optional(),
    sortOrder: SortOrder.optional(),
    base: MenuBase.optional(),
  })
  .refine(({ base: _base, ...changes }) => Object.keys(changes).length > 0, { message: '변경할 값이 없습니다' })
  .refine(({ base, ...changes }) => Object.keys(base ?? {}).every((field) => field in changes), {
    path: ['base'],
    message: '바탕(base)은 바꾸는 칸에만 줄 수 있습니다',
    abort: true,
  })
  .refine(({ base, title }) => base === undefined || title === undefined || 'title' in base, {
    path: ['base'],
    message: '바탕(base)을 주면 바꾸는 제목에 바탕이 있어야 합니다',
    abort: true,
  })
  .refine(({ base, parentId, sortOrder }) => base === undefined || (parentId === undefined && sortOrder === undefined), {
    path: ['base'],
    message: '순서 · 부모 이동은 바탕(base)과 함께 보낼 수 없습니다 — 따로 보내십시오',
  })

/**
 * **메뉴 제목 충돌의 이슈 코드**(이월 5차 ②). 페이지의 `page-meta-changed`와 **갈라 둔다** — 웹은 코드로 갈래를 고르므로
 * (`apps/web/src/api/page-meta.ts`의 `metaConflict`) 한 코드면 메뉴의 409 가 페이지 제목의 충돌로 읽힐 수 있다. 웹은 같은
 * 글자를 `MENU_TITLE_CHANGED`로 든다.
 */
export const MENU_TITLE_CHANGED = 'menu-title-changed'
const MENU_TITLE_CHANGED_MESSAGE = '다른 사람이 이 메뉴를 먼저 바꿨습니다'

/** `app.ts`가 `app.register(menuRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function menuRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/menu', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      return listMenuTree(app.db, projectId)
    })

    app.post('/:projectId/menu', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(CreateMenuBody, request.body)

      let node
      try {
        node = await withTransaction(app.db, async (trx) => {
          const inserted = await insertMenuNode(trx, projectId, { parentId: body.parentId ?? null, title: body.title })
          // **커밋 순간의 권한**(이월 AA′ — `auth/roles.ts`의 `recheckProjectRole`). 트리 쓰기의 첫 잠금(프로젝트 행)이
          // 복원 · 프로젝트 삭제 · 다른 트리 쓰기 뒤에 섰을 수 있다 — 그 대기 뒤의 역할로 판정한다.
          await recheckProjectRole(trx, request)
          return inserted
        })
      } catch (error) {
        if (error instanceof ParentNotFoundError) {
          throw notFound(error.message)
        }
        throw error
      }

      reply.code(201)
      return node
    })

    /**
     * **메뉴 제목의 충돌 모델 — 페이지 메타(`routes/pages.ts`의 `PATCH` 머리말)와 같은 모델이다**(이월 5차 ② · 2026-09-23).
     * 요청이 **고치기 전 제목**(`base`)을 함께 보내면 «행 잠금 → 권한 재확인 → 견줌 → 씀» 한 트랜잭션이다:
     *
     * | 지금 제목 | 답 |
     * |---|---|
     * | `base`와 같다(`@wirebound/schema`의 `samePageMeta` — 화면의 판정과 같은 함수) | 쓴다 — 200 |
     * | `base`와 다르다 | **409** · 이슈 코드 `menu-title-changed` · 이슈 하나(`path` = `title` · `current` = **지금 제목**) — 쓰지 않는다 |
     * | `base`를 안 보냈다 | 쓴다 — 나중이 이긴다(옛 클라이언트 · 순서 · 부모 이동. 페이지와 같은 결정) |
     *
     * **재확인이 견줌보다 먼저다** — 잠금을 기다리는 동안 멤버에서 빠진 사람에게 지금 제목을 409 로 흘리지 않는다.
     * **바탕 없는 경로도 쓴 뒤 재확인한다**(페이지와 같다) — 앞 판에는 이 라우트에 재확인이 없었다. 메뉴 `POST` ·
     * `DELETE`도 쓴 뒤 재확인한다(이월 AA′).
     *
     * 방송하지 않는다 — 남이 바꾼 것은 저장할 때 409 로 안다(페이지와 같다).
     */
    app.patch('/:projectId/menu/:nodeId', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, nodeId } = parseParams(NodeParams, request.params)
      const { base, ...patch } = parseBody(UpdateMenuBody, request.body)

      let node
      try {
        node = await withTransaction(app.db, async (trx) => {
          if (base !== undefined) {
            const current = await lockMenuTitle(trx, projectId, nodeId)
            if (current === null) return null
            // **커밋 순간의 권한**(이월 AA) — 비교보다 먼저다(위 머리말).
            await recheckProjectRole(trx, request)
            if (base.title !== undefined && !samePageMeta(base.title, current)) {
              throw conflict(MENU_TITLE_CHANGED_MESSAGE, [
                { path: 'title', code: MENU_TITLE_CHANGED, message: MENU_TITLE_CHANGED_MESSAGE, current },
              ])
            }
            return updateMenuNode(trx, projectId, nodeId, patch)
          }
          const updated = await updateMenuNode(trx, projectId, nodeId, patch)
          // **커밋 순간의 권한**(이월 AA) — 자리 옮기기는 트리 쓰기의 첫 잠금(프로젝트 행)을 기다릴 수 있다.
          if (updated) await recheckProjectRole(trx, request)
          return updated
        })
      } catch (error) {
        if (error instanceof ParentNotFoundError) {
          throw notFound(error.message)
        }
        if (error instanceof SelfParentError || error instanceof DescendantParentError) {
          throw badRequest(error.message)
        }
        throw error
      }

      if (!node) {
        throw notFound()
      }
      return node
    })

    app.delete('/:projectId/menu/:nodeId', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, nodeId } = parseParams(NodeParams, request.params)

      let result
      try {
        result = await withTransaction(app.db, async (trx) => {
          const deleted = await deleteMenuNode(trx, projectId, nodeId)
          // **커밋 순간의 권한**(이월 AA′) — 생성과 같은 자리다(트리 쓰기의 첫 잠금 뒤).
          if (deleted === 'deleted') await recheckProjectRole(trx, request)
          return deleted
        })
      } catch (error) {
        if (error instanceof HasChildrenError) {
          throw conflict(error.message)
        }
        throw error
      }

      if (result === 'not-found') {
        throw notFound()
      }
      reply.code(204).send()
    })
  }
}
