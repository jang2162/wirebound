/**
 * 프리셋 라우트 — 설계서 「페이지 프리셋」의 서버 쪽이다. `pageRoutes`와 같은
 * `/api/projects` prefix로 등록한다(`app.ts`) — 파일은 갈리되 URL 네임스페이스는
 * 공유한다(`routes/comments.ts`·`routes/snapshots.ts`와 같은 관례).
 *
 * HTTP·zod 검증만 다룬다 — SQL은 `repos/presets.ts`, 내장 목록은 `@wirebound/schema`다.
 * **권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가 전담한다.**
 *
 * ---
 *
 * # 엔드포인트 셋
 *
 * | 경로 | 가드 | 근거 |
 * |---|---|---|
 * | `GET /:projectId/presets` | viewer | 조회 |
 * | `POST /:projectId/presets` | **editor** | 아래 문단 |
 * | `DELETE /:projectId/presets/:presetId` | **editor** | 아래 문단 |
 *
 * **설계서 「권한 모델」의 표에 프리셋이 없어 판정하고 근거를 남긴다.** editor가 *"메뉴·페이지·
 * 컴포넌트·코멘트·상호작용 편집"*을 하고 **프리셋은 그 편집을 돕는 도구**다 — 테마·
 * 레이아웃처럼 프로젝트 전체 외형을 한 번에 바꾸지 않는다(적용해야 바뀌고, 적용은 페이지
 * 편집 하나다). 조회는 viewer.
 *
 * **상세(`GET .../presets/:presetId`)를 만들지 않는다.** 목록이 `nodes`를 함께 내므로
 * (`repos/presets.ts`의 `PresetRecord` 주석) 고른 뒤 다시 물을 것이 없다 — 만들면 아무도
 * 부르지 않는 엔드포인트가 하나 생기고, *"쓰이지 않는 것은 그것이 무엇을 지키는지 아무도
 * 확인하지 않은 채 남는다"*(`routes/snapshots.ts`가 owner 가드에 대해 적은 것과 같은 판단).
 *
 * ---
 *
 * # 목록은 내장과 프로젝트 것을 함께 낸다
 *
 * `listThemes`가 시스템+프로젝트를 함께 내는 선례를 따른다(그 함수 주석: *"이 프로젝트에서
 * **고를 수 있는** 것"*). **`source`로 갈라 말하고 `id`도 갈린다** — 내장은
 * `builtin:<키>`, 프로젝트 것은 uuid다. 그래서 둘이 겹칠 수 없고, 내장 id로 DELETE를
 * 부르면 경로 zod(`z.uuid()`)가 **400**으로 끊는다. 내장을 지우는 갈래를 따로 짤 필요가
 * 없는 것이 이 형식의 값어치다.
 *
 * **내장 항목에 `createdBy`·`createdAt`을 `null`로 싣지 않는다.** 없는 값을 `null`로
 * 말하면 받는 쪽이 *"만든 사람이 지워졌다"*와 가르지 못한다 — `source`가 판별자인
 * 유니온이라 그 키들이 **아예 없다.**
 *
 * ---
 *
 * # 저장은 `marker`를 버린다
 *
 * 담으면 적용된 문서에 번호가 있는데 그것을 가리키는 코멘트 행이 없다(고아 marker —
 * `routes/comments.ts` 머리말 「번호는 있는데 코멘트 행이 없는 노드」). **버리는 자리가 화면이 아니라 여기인 것이 요점이다** — 저장 경로가 웹
 * 하나가 아니게 될 때(MCP·CLI) 규칙이 그쪽에도 저절로 걸린다.
 *
 * **카탈로그 검증은 여기서 하지 않는다.** 프리셋은 문서가 아니라 `WbNode[]`이고, *"이것을
 * 페이지에 놓을 수 있는가"*는 **적용 시점에 결과 문서 전체로** 판정한다. 여기에 게이트를
 * 하나 더 두면 같은 물음에 답하는 자리가 둘이 되고, 둘은 언젠가 갈린다 — 화면이 서버보다
 * 엄격해지는 부류의 반대편 형태다. 여기서 보는 것은 **봉투**뿐이다
 * (`WbNodeSchema` — 노드의 모양과 선언되지 않은 키).
 *
 * ---
 *
 * # 오류 표
 *
 * | 상황 | 상태 | 어디서 |
 * |---|---|---|
 * | 이름 길이 위반·설명 길이 위반·노드 봉투 위반 | **400** | 본문 zod(`PresetBody`) |
 * | NUL(U+0000) | **400** | 아래 `containsNulByte`(라우트) · `PresetNulByteError`(repo, 마지막 방벽) |
 * | 없는 프리셋 / 남의 프로젝트의 프리셋 삭제 | **404** | `deletePreset`이 `projectId`를 함께 받는다(존재를 숨긴다) |
 * | 내장 프리셋 id로 삭제 | **400** | 경로 zod(`z.uuid()`) |
 *
 * **이름 중복은 오류가 아니다** — 유일 제약이 없으므로 409가 나올 자리 자체가 없다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { BUILTIN_PRESETS, WbNodeSchema, stripMarkers, type PagePreset } from '@wirebound/schema'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction } from '../db/tx'
import { badRequest, notFound, unauthenticated } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { PresetNulByteError, deletePreset, insertPreset, listPresets, type PresetRecord } from '../repos/presets'
import { lockProjectShared } from '../repos/projects'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const PresetParams = z.object({ projectId: z.uuid(), presetId: z.uuid() })

/**
 * 내장 프리셋 id의 접두. **uuid와 겹칠 수 없는 모양**이라 목록 안에서 둘이 섞여도
 * 가려낼 수 있고, 경로 zod가 이 값을 400으로 끊는다.
 */
const BUILTIN_ID_PREFIX = 'builtin:'

/**
 * 이름은 **이름이므로 짧다** — `snapshots.tag`와 같은 1~60자다. 설명은 0~2000자로
 * 코멘트 본문·프로젝트 설명과 같은 값이다.
 *
 * `z.strictObject`라 선언되지 않은 키는 그 자체로 400이다(`routes/snapshots.ts`와 같은 관례).
 *
 * **`schema`는 `WbNode[]`다** — 문서 봉투가 아니다. 빈 배열을 받는 것은
 * *"빈 페이지도 저장할 수 있다"*이기 때문이고, 그 프리셋은 **치우기**라는 정상
 * 조작이 된다.
 */
const PresetBody = z.strictObject({
  name: z.string().min(1, '이름을 입력하세요').max(60, '이름은 60자 이하여야 합니다'),
  description: z.string().max(2000, '설명은 2000자 이하여야 합니다').nullable().optional(),
  schema: z.array(WbNodeSchema),
})

/** 목록 항목 — 내장. `source`가 판별자다. */
function toBuiltinResponse(preset: PagePreset) {
  return {
    id: `${BUILTIN_ID_PREFIX}${preset.key}`,
    source: 'builtin' as const,
    name: preset.name,
    description: preset.description,
    nodes: preset.nodes,
  }
}

/** 목록·생성 항목 — 프로젝트. 내장에 없는 셋(`createdBy`·`createdByName`·`createdAt`)이 더 붙는다. */
function toProjectResponse(record: PresetRecord) {
  return {
    id: record.id,
    source: 'project' as const,
    name: record.name,
    description: record.description,
    nodes: record.nodes,
    createdBy: record.createdBy,
    createdByName: record.createdByName,
    createdAt: record.createdAt,
  }
}

/** `app.ts`가 `app.register(presetRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function presetRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * **이 프로젝트에서 고를 수 있는 프리셋 전부.** 내장이 먼저다 — 프로젝트 프리셋이
     * 하나도 없는 것이 **기본 상태**이고, 그때도 목록이 비지 않아야 *"프리셋으로
     * 시작한다"*가 성립한다.
     */
    app.get('/:projectId/presets', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const records = await listPresets(app.db, projectId)
      return [...BUILTIN_PRESETS.map(toBuiltinResponse), ...records.map(toProjectResponse)]
    })

    /**
     * **지금 페이지를 프리셋으로 남긴다**(설계서 「페이지 프리셋」). 본문이 나르는 것은 노드 배열이고,
     * *"지금 페이지"*를 읽어 오는 것은 화면이다 — 서버가 페이지를 읽어 담으면 사용자가
     * 화면에서 보고 있는 것(낙관적 편집이 얹힌 문서)과 저장되는 것이 갈릴 수 있다.
     *
     * **`marker`는 여기서 버린다**(위 머리말).
     * **id는 그대로 담는다** — 재발급은 **적용**이 한다(「페이지 프리셋」). 저장에서 재발급하면
     * 같은 프리셋을 두 번 적용했을 때 두 페이지가 같은 id를 갖는다.
     */
    app.post('/:projectId/presets', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(PresetBody, request.body)

      // **NUL을 삽입 전에 끊는다.** repo도 같은 검사를 하지만(마지막 방벽), 여기서 걸러야
      // 이 요청이 jsonb를 만들기 전에 끝난다 — `routes/snapshots.ts`와 같은 판단이다.
      //
      // **무엇을 지우면 무엇이 되나(변이로 지우고 돌린다):**
      //
      // | 무엇을 지웠나 | 상태 |
      // |---|---|
      // | (그대로) | **400** |
      // | 이 검사만 | **400** — repo의 `PresetNulByteError`가 잡는다 |
      // | 이 검사와 repo의 것 둘 다 | **500** — `schema::jsonb` 캐스팅이 `22P05`로 죽는다 |
      //
      // **그래서 이 줄만 지우는 변이에는 죽는 케이스가 없다**(둘 다 400이라 케이스가 못 가른다).
      // 그래도 두는 이유는 위의 *"jsonb를 만들기 전에 끝난다"*이고, 그 성질은 상태
      // 코드로는 잴 수 없다.
      if (containsNulByte(body.name) || containsNulByte(body.description ?? null) || containsNulByte(body.schema)) {
        throw badRequest('프리셋에 NUL 문자(U+0000)를 포함할 수 없습니다')
      }

      // `projectGuard('editor')`가 이미 인증을 요구하므로 여기 도달했다면 `currentUser`는
      // 있다. `as`로 좁히지 않고 던지는 것은 아래에서 `.id`를 반드시 읽기 때문이다 —
      // 가드가 빠지는 순간 `as` 버전은 미인증 요청에 `null` 역참조로 500을 낸다.
      const currentUser = request.currentUser
      if (!currentUser) {
        throw unauthenticated()
      }

      let record: PresetRecord
      try {
        record = await withTransaction(app.db, async (trx) => {
          // **프로젝트 행이 먼저다**(`repos/projects.ts`의 `lockProjectShared`). 삽입의 FK 도 같은 `KEY SHARE`를 걸지만
          // 그것은 프로젝트 삭제 뒤에 섰다가 깨면 23503 — 봉투 없는 500 이다. 먼저 잡으면 0 행 → 404.
          await lockProjectShared(trx, projectId)
          const inserted = await insertPreset(trx, {
            projectId,
            name: body.name,
            description: body.description ?? null,
            nodes: stripMarkers(body.schema),
            createdBy: currentUser.id,
          })
          // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). 삽입의 FK 가 프로젝트 행에 거는
          // `KEY SHARE`가 복원 · 프로젝트 삭제의 `FOR UPDATE` 뒤에 섰을 수 있다 — 그 대기 뒤의 역할로 판정한다.
          await recheckProjectRole(trx, request)
          return inserted
        })
      } catch (error) {
        if (error instanceof PresetNulByteError) {
          // repo의 마지막 방벽에 걸렸다. 위에서 이미 걸렀으므로 여기 오는 경로는 없다.
          throw badRequest(error.message)
        }
        throw error
      }

      return reply.status(201).send(toProjectResponse(record))
    })

    /**
     * 프리셋 하나를 지운다. **내장은 지울 수 없다** — 경로 zod가 `builtin:…`을 400으로
     * 끊으므로 그 갈래를 여기서 다시 다루지 않는다(위 머리말).
     */
    app.delete('/:projectId/presets/:presetId', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, presetId } = parseParams(PresetParams, request.params)
      const deleted = await withTransaction(app.db, async (trx) => {
        const gone = await deletePreset(trx, projectId, presetId)
        // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). 이 쓰기는 기다리는 잠금이 거의 없지만 가드와 `DELETE`
        // 사이는 있다 — 그 사이 viewer 로 내려가거나 빠졌으면 가드와 같은 403 · 404 로 되돌린다(`test/guard-in-lock.test.ts`의
        // «프리셋 삭제 — 가드와 커밋 사이»). 행을 잡은 **뒤**에 본다 — 멤버 행 `FOR SHARE`가 그 뒤의 역할 변경을 이 커밋 뒤로 세운다.
        // «프리셋 행 → 멤버 행» 순이라 프로젝트 삭제가 CASCADE 전에 프리셋 행을 먼저 잡는다(`routes/projects.ts`의 삭제 주석).
        if (gone) await recheckProjectRole(trx, request)
        return gone
      })
      if (!deleted) {
        // 남의 프로젝트의 프리셋 id도 같은 404다 — 존재를 숨긴다(설계서 「권한 모델」).
        throw notFound('프리셋을 찾을 수 없습니다')
      }
      return reply.status(204).send()
    })
  }
}
