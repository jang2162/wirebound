/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `restore-concurrency.test.ts`·
 * `snapshots-concurrency.test.ts`와 같은 부류다.
 *
 * ---
 *
 * # 왜 분모를 소스에서 만드나 — **숫자가 맞아 보이는 채로 항목이 숨는다**
 *
 * 복원 잠금을 잴 쓰기 라우트를 손으로 고르면 **수는 그럴듯한데 항목이 빠진다** — 복원이
 * 페이지 문서를 되돌릴 때 타는 `PUT .../schema`나 `PATCH .../ops`처럼 가장 아픈 자리도
 * 빠질 수 있다. 빠진 항목이 전부 막혀서 결론이 맞게 나와도 그것은 운이다. **분모를 손으로
 * 적으면 빠진 항목이 결과를 바꿔도 아무도 모른다.**
 *
 * `permission-matrix.test.ts`의 *"표가 라우트를 하나도 빠뜨리지 않는다"*와 같은 부류다
 * (표에서 빠진 라우트는 가드를 아예 없애도 0건이 죽는다). **그래서 분모를 등록된 라우트에서 만든다.**
 *
 * ---
 *
 * # 세는 단위 — 한 문장으로 못박는다
 *
 * > **이 표가 세는 것은 Fastify 가 등록한 라우트 중 `projectGuard`가 걸린
 * > 비-`GET` 라우트 하나당 한 줄이다.** 한 라우트가 **본문에 따라 잠금과 다르게 만나면**
 * > 그 갈래마다 한 줄을 더 둔다. **본문뿐 아니라 대상의 상태도 갈래를 만든다**:
 * > `POST .../menu`는 `parentId`가 `null`이냐로 갈리고, `renumber`는 **바꿀 번호가 있느냐**로
 * > 갈린다(없으면 `ops.length === 0`에서 조기 반환해 **아무것도 쓰지 않고 아무것도 잠그지
 * > 않는다**).
 *
 * `projectGuard`가 없는 비-`GET` 라우트(`/login`·`/logout`·`POST /` 프로젝트
 * 생성)는 **프로젝트 자원을 만지지 않으므로** 이 질문의 대상이 아니다. `GET`은 잠금과
 * 무관하다(`FOR UPDATE`는 읽기를 막지 않는다).
 *
 * **내보내기 둘(`GET .../export`·`GET .../export/preview`)은 이 표에 안 든다** — 위
 * 문장이 세는 단위를 비-`GET`으로 못박아 두었고, 내보내기는 프로젝트 전체를 **읽기만**
 * 한다. 복원이 쥔 `FOR UPDATE`는 읽기를 막지 않으므로 *"복원 중에 막히는가"*라는 이 표의
 * 물음 자체가 그 라우트에 대해 성립하지 않는다. 새 `GET` 라우트에 이 파일이 죽지 않는 것이 옳다.
 *
 * **아래 `분모를 등록된 라우트에서 만든다` 절이 그 문장을 실행으로 지킨다**(`guarded-routes.ts` — 라우트를 값으로 센다). 새 쓰기 라우트가
 * 생기면 이 파일이 **먼저 죽는다.**
 *
 * ---
 *
 * # 재는 방식
 *
 * 한 커넥션이 **`lockProjectForRestore`를 그대로 불러** 잠금을 쥔 채, 다른 커넥션에서 그
 * 라우트를 쏘고 `WAIT_MS` 안에 끝나는지 본다. 잠금 SQL을 이 파일에 베끼지 않는다 — 베끼면
 * 사본이 진짜 잠금과 갈린다.
 *
 * **판정마다 대조가 둘 붙는다:**
 *
 * | 대조 | 무엇을 배제하나 |
 * |---|---|
 * | 잠금을 놓은 **뒤** 그 요청이 2xx로 끝나는가 | *"막힌 게 아니라 원래 실패하는 요청"* |
 * | 잠금 **없이** 같은 요청이 창 안에 끝나는가 | *"막힌 게 아니라 그냥 느리다"* |
 *
 * 이 둘 중 하나가 없으면 **거짓 줄**이 선다 — 픽스처가 `commentId`를 잘못 읽어 400으로
 * 끝나는 요청도 *"안 막힌다"*로 읽힌다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { FastifyInstance } from 'fastify'
import { withTransaction } from '../src/db/tx'
import { lockProjectForRestore } from '../src/repos/snapshots'
import { routeCensus } from './guarded-routes'
import { createMenuNode, createPage, createProject, getTestDb, resetRealData, signup, withRealApi, type TestContext } from './helpers'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'
import { png } from './asset-samples'

const db = getTestDb()

// 청소도 하네스도 `helpers.ts`에 있다.
beforeEach(resetRealData)
afterEach(resetRealData)

/** 잠금 판정 창. 아래 *"잠금이 없으면 창 안에 끝난다"*가 이 창이 넉넉한지 함께 잰다. */
const WAIT_MS = 700

interface Ids {
  projectId: string
  menuId: string
  spareMenuId: string
  pageId: string
  sparePageId: string
  /** 문서의 `marker`가 어긋나 있는 페이지 — `renumber`가 실제로 쓰는 판을 만든다. */
  misnumberedPageId: string
  snapshotId: string
  nodeId: string
  commentId: string
  moduleId: string
  tokenId: string
  otherUserId: string
  memberUserId: string
  cookie: { wb_session: string }
}

interface Probe {
  /** 소스에서 뽑은 키(`METHOD /경로`)와 맞대는 값. 갈래가 둘인 라우트는 같은 키를 공유한다. */
  route: string
  label: string
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  url: (ids: Ids) => string
  payload?: (ids: Ids) => Record<string, unknown> | Buffer
  /** 본문이 바이트인 쓰기(그림 올리기)의 꼴. */
  contentType?: string
  /** 복원이 그 행을 쓰는가. `false`면 아래 "복원이 만지지 않는 자원" 절의 대상이다. */
  restoreWrites: boolean
  /** 기대: 잠금이 이 요청을 막는가. */
  blocked: boolean
}

/**
 * **표 본체.** 위 "세는 단위" 문장이 정하는 모집단 전부가 여기 있어야 한다 — 아래
 * `분모를 소스에서 만든다`가 그것을 센다.
 */
const PROBES: Probe[] = [
  // ── 복원이 쓰는 다섯 자원 ────────────────────────────────────────────────
  {
    route: 'POST /:projectId/menu',
    label: '메뉴 생성 (parentId 없음) — 잠긴 어떤 행도 참조하지 않는 유일한 삽입',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/menu`,
    payload: () => ({ title: '끼어든 메뉴' }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'POST /:projectId/menu',
    label: '메뉴 생성 (parentId 있음) — 잠긴 부모 행을 FK로 참조한다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/menu`,
    payload: (ids) => ({ title: '끼어든 하위 메뉴', parentId: ids.menuId }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'PATCH /:projectId/menu/:nodeId',
    label: '메뉴 수정',
    method: 'PATCH',
    url: (ids) => `/api/projects/${ids.projectId}/menu/${ids.menuId}`,
    payload: () => ({ title: '끼어든 제목' }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'DELETE /:projectId/menu/:nodeId',
    label: '메뉴 삭제',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}/menu/${ids.spareMenuId}`,
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'DELETE /:projectId/menu/:nodeId',
    label: '메뉴 연쇄 삭제(cascade) — 복원과 같은 잠금을 쥔다(`services/menu-cascade.ts`)',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}/menu/${ids.spareMenuId}`,
    payload: () => ({ cascade: true, expect: { menuIds: [], pageIds: [] } }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'POST /:projectId/pages',
    label: '페이지 생성',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/pages`,
    payload: (ids) => ({ menuNodeId: ids.menuId, title: '끼어든 페이지' }),
    restoreWrites: true,
    blocked: true,
  },
  {
    // **가져오기** — *"가져오기가 복원 중에 어떻게 되는가"*를 여기서 잰다.
    //
    // 복원이 되돌리는 행 셋(`pages`·`revisions`·`comments`)을 전부 쓰므로 `restoreWrites`가
    // 참이다. 막히지 않으면 **복원이 얼린 상태 옆에 새 페이지가 끼어든다.**
    route: 'POST /:projectId/pages/import',
    label: '페이지 가져오기 — 페이지·문서·코멘트 셋을 한 트랜잭션에 쓴다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/pages/import`,
    payload: (ids) => ({
      menuNodeId: ids.menuId,
      file: {
        wireboundVersion: '1',
        page: { title: '끼어든 가져오기' },
        schema: { version: 5, root: { id: 'n_root', type: 'Page', children: [] } },
        comments: [],
      },
    }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'PATCH /:projectId/pages/:pageId',
    label: '페이지 메타 수정',
    method: 'PATCH',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.pageId}`,
    payload: () => ({ title: '끼어든 페이지 제목' }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'DELETE /:projectId/pages/:pageId',
    label: '페이지 삭제 — revisions·comments가 CASCADE로 함께 간다',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.sparePageId}`,
    restoreWrites: true,
    blocked: true,
  },
  {
    // **복원이 페이지 문서를 되돌릴 때 타는 바로 그 경로다** — 이 줄이 빠지면 가장 아픈
    // 자리가 안 잰 채로 남는다.
    route: 'PUT /:projectId/pages/:pageId/schema',
    label: '페이지 스키마 저장 — 복원이 되돌릴 때 타는 그 경로다',
    method: 'PUT',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.pageId}/schema`,
    payload: (ids) => ({
      schema: { version: 5, root: { id: ids.nodeId, type: 'Page', children: [] } },
    }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'PATCH /:projectId/pages/:pageId/ops',
    label: '페이지 ops 편집',
    method: 'PATCH',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.pageId}/ops`,
    // 빈 ops다 — 재는 것은 잠금이지 편집 내용이 아니다(`permission-matrix.test.ts`와 같은 판단).
    payload: () => ({ baseSeq: 1, ops: [] }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'POST /:projectId/pages/:pageId/comments',
    label: '코멘트 작성',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.pageId}/comments`,
    payload: (ids) => ({ nodeId: ids.nodeId, body: '끼어든 코멘트' }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'PATCH /:projectId/pages/:pageId/comments/:commentId',
    label: '코멘트 수정',
    method: 'PATCH',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.pageId}/comments/${ids.commentId}`,
    payload: () => ({ body: '끼어든 본문' }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'DELETE /:projectId/pages/:pageId/comments/:commentId',
    label: '코멘트 삭제',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.pageId}/comments/${ids.commentId}`,
    restoreWrites: true,
    blocked: true,
  },
  {
    // **바꿀 번호가 없으면 `ops.length === 0`에서 조기 반환한다** — `applyEdit`을 아예 부르지
    // 않으므로 잠금도 안 잡는다.
    // **그래도 안전하다:** 쓰지 않는 요청이 통과하는 것은 복원이 되돌릴 것을 만들지 않는다.
    route: 'POST /:projectId/pages/:pageId/comments/renumber',
    label: '코멘트 재번호 (바꿀 번호가 없다 — 아무것도 쓰지 않는다)',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.pageId}/comments/renumber`,
    restoreWrites: false,
    blocked: false,
  },
  {
    route: 'POST /:projectId/pages/:pageId/comments/renumber',
    label: '코멘트 재번호 (바꿀 번호가 있다 — 문서를 쓴다)',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/pages/${ids.misnumberedPageId}/comments/renumber`,
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'POST /:projectId/snapshots',
    label: '스냅샷 생성 — 복원이 안전망을 넣는 그 표다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/snapshots`,
    payload: () => ({ tag: '끼어든 스냅샷' }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'POST /:projectId/snapshots/:snapshotId/restore',
    label: '복원 자신 — 두 복원이 겹치면 뒤엣것이 기다린다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/snapshots/${ids.snapshotId}/restore`,
    // **진짜 스냅샷이어야 한다.** 없는 id를 주면 잠금이 404보다 먼저 걸려 판정은 옳게
    // 나오지만 **놓은 뒤 2xx** 대조가 404로 죽는다 — 그 대조가 없으면 이 줄은 초록인 채로
    // *"막힌다"*를 잘못된 근거로 주장한다.
    restoreWrites: true,
    blocked: true,
  },

  // ── 복원이 **쓰지 않는** 자원 — 막히지만, 그것은 부수 효과다 ────────────────
  {
    route: 'PATCH /:projectId',
    label: '프로젝트 수정 — 복원이 되돌리지 않는다(payload에 프로젝트 메타가 없다)',
    method: 'PATCH',
    url: (ids) => `/api/projects/${ids.projectId}`,
    payload: () => ({ name: '끼어든 이름' }),
    restoreWrites: false,
    blocked: true,
  },
  {
    route: 'PUT /:projectId/theme',
    label: '테마 바인딩 저장 — 판 3 복원이 되돌리는 바인딩 칸을 쓴다(`UPDATE projects` 라 프로젝트 행 뒤에 선다)',
    method: 'PUT',
    url: (ids) => `/api/projects/${ids.projectId}/theme`,
    payload: () => ({ themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: { [SYSTEM_ADMIN.color.key]: '#123456' }, rev: 0 }),
    restoreWrites: true,
    blocked: true,
  },
  {
    route: 'DELETE /:projectId',
    label: '프로젝트 삭제',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}`,
    restoreWrites: false,
    blocked: true,
  },
  {
    route: 'POST /:projectId/members',
    label: '멤버 초대',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/members`,
    payload: () => ({ email: 'census-invitee@example.com', role: 'viewer' }),
    restoreWrites: false,
    blocked: true,
  },
  {
    route: 'PATCH /:projectId/members/:userId',
    label: '멤버 수정 — `project_members`는 `projects`를 참조하지만 **UPDATE는 부모 행을 안 잡는다**',
    method: 'PATCH',
    url: (ids) => `/api/projects/${ids.projectId}/members/${ids.memberUserId}`,
    payload: () => ({ role: 'editor' }),
    restoreWrites: false,
    blocked: false,
  },
  {
    route: 'DELETE /:projectId/members/:userId',
    label: '멤버 삭제 — 같은 이유로 안 막힌다',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}/members/${ids.memberUserId}`,
    restoreWrites: false,
    blocked: false,
  },
  {
    // **모듈 쓰기 셋** — *"모듈 쓰기가 복원 중에 어떻게 되는가"*를 여기서 잰다.
    //
    // **막힌다.** `modules.project_id`가 `projects(id)`를
    // 참조하므로 삽입이 그 행에 `FOR KEY SHARE`를 걸고 그것이 `FOR UPDATE`와 충돌한다.
    // **복원이 모듈 행을 쓰지 않는데도 막히는 것**이라 부수 효과다. 라우트도 삽입 앞에서 같은 `KEY SHARE`를 먼저 잡는다(`lockProjectShared`).
    route: 'POST /:projectId/modules',
    label: '모듈 저장 — 복원은 모듈을 되돌리지 않지만 `project_id` FK 때문에 막힌다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/modules`,
    payload: () => ({ name: '끼어든 모듈', nodes: [{ id: 'm_a', type: 'Button', props: { label: '저장' } }] }),
    restoreWrites: false,
    blocked: true,
  },
  {
    // **안 막힌다.** FK 열을 안 바꾸는 UPDATE 는 부모 행의 FK 검사를 부르지 않는다. **복원이 모듈을 되돌리지 않으므로 해롭지 않다.**
    route: 'PATCH /:projectId/modules/:moduleId',
    label: '모듈 이름 바꾸기 — FK 열을 안 바꾸는 UPDATE 라 부모를 잡지 않는다',
    method: 'PATCH',
    url: (ids) => `/api/projects/${ids.projectId}/modules/${ids.moduleId}`,
    payload: () => ({ name: '바꾼 이름' }),
    restoreWrites: false,
    blocked: false,
  },
  {
    // **안 막힌다.** 자식 행을 지우는 것은 부모 행의
    // FK 검사를 부르지 않는다. **복원이 모듈을 되돌리지 않으므로 해롭지 않다** —
    // 복원 도중 지운 모듈은 복원 뒤에도 없는 것이 맞다.
    route: 'DELETE /:projectId/modules/:moduleId',
    label: '모듈 삭제 — 자식 행 삭제라 부모를 잡지 않는다',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}/modules/${ids.moduleId}`,
    restoreWrites: false,
    blocked: false,
  },
  // **공통코드 쓰기 여섯** — 복원이 표를 통째로 덮으므로(`services/restore.ts`) `restoreWrites` 가 참이다. 쓰기는 프로젝트 행을
  // `FOR NO KEY UPDATE` 로 먼저 잡아(`routes/codes.ts` 머리말 «잠금 순서») 복원의 `FOR UPDATE` 뒤에 선다.
  ...(
    [
      ['POST /:projectId/codes', '공통코드 그룹 만들기', 'POST', 'codes', { key: 'NEW', name: '새 그룹' }],
      ['PATCH /:projectId/codes/:key', '공통코드 그룹 고치기', 'PATCH', 'codes/S', { name: '바꿈' }],
      ['DELETE /:projectId/codes/:key', '공통코드 그룹 지우기', 'DELETE', 'codes/S', undefined],
      ['POST /:projectId/codes/:key/items', '공통코드 항목 만들기', 'POST', 'codes/S/items', { value: 'NEW', name: '새 항목' }],
      ['PATCH /:projectId/codes/:key/items/:value', '공통코드 항목 고치기', 'PATCH', 'codes/S/items/A', { active: false }],
      ['DELETE /:projectId/codes/:key/items/:value', '공통코드 항목 지우기', 'DELETE', 'codes/S/items/A', undefined],
    ] as const
  ).map(([route, label, method, path, body]): Probe => ({
    route,
    label,
    method,
    url: (ids) => `/api/projects/${ids.projectId}/${path}`,
    ...(body === undefined ? {} : { payload: () => ({ ...body }) }),
    restoreWrites: true,
    blocked: true,
  })),
  {
    // **그림 쓰기 둘** — 둘 다 소유 행을 넣기 전에 프로젝트 행을 `KEY SHARE` 로 먼저 잡는다(`routes/assets.ts` · `lockProjectShared`). **막힌다** — 복원은 그림을
    // 되돌리지 않지만(그림은 프로젝트와 함께만 지운다) 모듈 저장과 같은 부수 효과다.
    route: 'POST /:projectId/assets',
    label: '그림 올리기 — 프로젝트 행 `KEY SHARE` 때문에 막힌다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/assets`,
    payload: () => png(2, 2, 91),
    contentType: 'image/png',
    restoreWrites: false,
    blocked: true,
  },
  {
    route: 'POST /:projectId/assets/claim',
    label: '그림 가져오기 — 같은 까닭으로 막힌다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/assets/claim`,
    payload: () => ({ ids: ['0'.repeat(64)], from: { personal: true } }),
    restoreWrites: false,
    blocked: true,
  },
  {
    // **API 토큰 쓰기 둘.**
    //
    // **막힌다 — `POST .../modules`와 같은 이유다.**
    // `api_tokens.project_id`가 `projects(id)`를 참조하므로 삽입이 그 행에
    // `FOR KEY SHARE`를 걸고 그것이 `FOR UPDATE`와 충돌한다. **복원이 토큰 행을
    // 쓰지 않는데도 막히는 것**이라 부수 효과다.
    route: 'POST /:projectId/tokens',
    label: 'API 토큰 발급 — 복원은 토큰을 되돌리지 않지만 `project_id` FK 때문에 막힌다',
    method: 'POST',
    url: (ids) => `/api/projects/${ids.projectId}/tokens`,
    payload: () => ({ name: '끼어든 토큰' }),
    restoreWrites: false,
    blocked: true,
  },
  {
    // **안 막힌다 — `DELETE .../modules`와 같은 이유다.** 자식 행을 지우는 것은 부모 행의
    // FK 검사를 부르지 않는다. **복원이 토큰을 되돌리지 않으므로 해롭지 않다** —
    // 오히려 막히면 안 되는 쪽이다: 폐기는 자격을 거두는 조작이라 복원이 도는 동안
    // 기다려야 할 이유가 없다.
    route: 'DELETE /:projectId/tokens/:tokenId',
    label: 'API 토큰 폐기 — 자식 행 삭제라 부모를 잡지 않는다',
    method: 'DELETE',
    url: (ids) => `/api/projects/${ids.projectId}/tokens/${ids.tokenId}`,
    restoreWrites: false,
    blocked: false,
  },
  {
    // **표시 옵션 저장 — 막힌다.** 복원은 이 표를 안 쓰지만(payload 에 없다) 라우트가 프로젝트 행을 `KEY SHARE` 로 먼저 잡는다
    // (`routes/view-prefs.ts` — 토큰 발급과 같은 차례 · 처음 쓰는 판의 FK 와 같은 모드). 행이 이미 있는 판도 같은 자리에 선다.
    route: 'PUT /:projectId/view-prefs',
    label: '표시 옵션 저장 — 복원은 이 표를 안 쓰지만 프로젝트 행 `KEY SHARE` 때문에 막힌다',
    method: 'PUT',
    url: (ids) => `/api/projects/${ids.projectId}/view-prefs`,
    payload: () => ({ hiddenRegions: ['subpage.gnb'] }),
    restoreWrites: false,
    blocked: true,
  },
]

/** 등록된 **`projectGuard`가 걸린 비-`GET`** 라우트 전부(위 "세는 단위") — `METHOD /:projectId/…`(표의 `route` 꼴). */
async function declaredWriteRoutes(): Promise<string[]> {
  return (await routeCensus()).guarded
    .filter((route) => route.method !== 'GET')
    .map((route) => `${route.method} ${route.url.replace(/^\/api\/projects/, '')}`)
}

describe('분모를 등록된 라우트에서 만든다', () => {
  it('분모를 실제로 만든다', async () => {
    // 이음매가 어긋나면 **빈 집합에서 아래가 조용히 통과한다**.
    expect((await declaredWriteRoutes()).length).toBeGreaterThan(15)
  })

  it('쓰기 라우트가 하나도 빠지지 않았다 — 이 파일이 생긴 이유다', async () => {
    const covered = new Set(PROBES.map((probe) => probe.route))
    const missing = [...new Set(await declaredWriteRoutes())].filter((route) => !covered.has(route))

    expect(missing).toEqual([])
  })

  it('표에 등록되지 않은 라우트를 적어 두지 않았다 — 반대편', async () => {
    const declared = new Set(await declaredWriteRoutes())
    const extra = [...new Set(PROBES.map((probe) => probe.route))].filter((route) => !declared.has(route))

    expect(extra).toEqual([])
  })
})

async function fixture(app: FastifyInstance): Promise<Ids> {
  await resetRealData()
  const ctx: TestContext = { app, db }
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  const spareMenu = await createMenuNode(ctx, owner.cookie, project.id, { title: '지울 메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '사용자 목록' })
  const sparePage = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '지울 페이지' })
  const nodeId = (page.schema as { root: { id: string } }).root.id

  const commentRes = await app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/pages/${page.id}/comments`,
    cookies: owner.cookie,
    payload: { nodeId, body: '기존 코멘트' },
  })
  if (commentRes.statusCode !== 201) throw new Error(`코멘트 픽스처 실패: ${commentRes.body}`)

  const moduleRes = await app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/modules`,
    cookies: owner.cookie,
    payload: { name: '대상 모듈', nodes: [{ id: 'm_a', type: 'Button', props: { label: '저장' } }] },
  })
  if (moduleRes.statusCode !== 201) throw new Error(`모듈 픽스처 실패: ${moduleRes.body}`)

  for (const [url, payload] of [
    ['codes', { key: 'S', name: '상태' }],
    ['codes/S/items', { value: 'A', name: '가' }],
  ] as const) {
    const codeRes = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/${url}`, cookies: owner.cookie, payload })
    if (codeRes.statusCode !== 201) throw new Error(`공통코드 픽스처 실패: ${codeRes.body}`)
  }

  const tokenRes = await app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/tokens`,
    cookies: owner.cookie,
    payload: { name: '대상 토큰' },
  })
  if (tokenRes.statusCode !== 201) throw new Error(`토큰 픽스처 실패: ${tokenRes.body}`)

  const invitee = await signup(ctx, { email: 'census-invitee@example.com' })
  const member = await signup(ctx)
  await db.insertInto('project_members').values({ project_id: project.id, user_id: member.user.id, role: 'viewer' }).execute()

  // **재번호가 실제로 쓰는 판.** 문서의 `marker`를 어긋난 값으로 심는다 — 프로덕션을
  // 고치지 않고 상태만 만든다(`snapshots.test.ts`가 raw SQL로 같은 일을 한다).
  const misnumbered = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '번호가 어긋난 페이지' })
  const misNodeId = (misnumbered.schema as { root: { id: string } }).root.id
  await db
    .updateTable('pages')
    .set({ schema: sql`jsonb_set(schema, '{root,marker}', '5')` })
    .where('id', '=', misnumbered.id)
    .execute()

  const snapshotRes = await app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/snapshots`,
    cookies: owner.cookie,
    payload: { tag: '복원 대상' },
  })
  if (snapshotRes.statusCode !== 201) throw new Error(`스냅샷 픽스처 실패: ${snapshotRes.body}`)

  return {
    projectId: project.id,
    menuId: menu.id,
    spareMenuId: spareMenu.id,
    pageId: page.id,
    sparePageId: sparePage.id,
    misnumberedPageId: misnumbered.id,
    snapshotId: (snapshotRes.json() as { id: string }).id,
    nodeId,
    commentId: (commentRes.json() as { comment: { id: string } }).comment.id,
    moduleId: (moduleRes.json() as { module: { id: string } }).module.id,
    tokenId: (tokenRes.json() as { id: string }).id,
    otherUserId: invitee.user.id,
    memberUserId: member.user.id,
    cookie: owner.cookie,
  }
}

function fire(app: FastifyInstance, probe: Probe, ids: Ids) {
  let settled = false
  const promise = app
    .inject({
      method: probe.method,
      url: probe.url(ids),
      cookies: ids.cookie,
      ...(probe.contentType === undefined ? {} : { headers: { 'content-type': probe.contentType } }),
      payload: probe.payload ? (probe.payload(ids) as never) : undefined,
    })
    .then((res) => {
      settled = true
      return { statusCode: res.statusCode, body: res.body }
    })
  return { done: () => settled, promise }
}

describe('복원 잠금이 무엇을 막는가', () => {
  it('잠금이 없으면 표의 모든 요청이 창 안에 끝난다 — 음성 대조', async () => {
    const slow: string[] = []
    await withRealApi(async ({ app }) => {
      for (const probe of PROBES) {
        const ids = await fixture(app)
        const request = fire(app, probe, ids)
        await new Promise((resolve) => setTimeout(resolve, WAIT_MS))
        if (!request.done()) slow.push(probe.label)
        await request.promise
      }
    })
    // 이것이 없으면 아래의 *"막힌다"*가 *"그냥 느리다"*와 구분되지 않는다.
    expect(slow).toEqual([])
  }, 300_000)

  for (const probe of PROBES) {
    it(`${probe.blocked ? '막힌다' : '안 막힌다'} — ${probe.label}`, async () => {
      await withRealApi(async ({ app }) => {
        const ids = await fixture(app)

        let release: () => void = () => {}
        const held = new Promise<void>((resolve) => {
          release = resolve
        })
        let locked = false
        // **잠금 SQL을 베끼지 않는다** — 진짜 함수를 부른다. 베끼면 사본이 갈린다.
        const holder = withTransaction(db, async (trx) => {
          await lockProjectForRestore(trx, ids.projectId)
          locked = true
          await held
        })
        while (!locked) await new Promise((resolve) => setTimeout(resolve, 20))

        let blocked: boolean
        let request: ReturnType<typeof fire>
        try {
          request = fire(app, probe, ids)
          await new Promise((resolve) => setTimeout(resolve, WAIT_MS))
          blocked = !request.done()
        } finally {
          // **놓아 주는 것이 `finally`에 있어야 한다** — 실패 경로에서 안 놓으면 `afterEach`의
          // `deleteFrom('projects')`가 그 잠금을 기다리며 스위트 전체가 멈춘다.
          release()
          await holder
        }

        expect(blocked).toBe(probe.blocked)

        // **놓은 뒤에는 성공해야 한다.** 이것이 없으면 *"막혔다"*가 *"원래 실패하는 요청"*과
        // 구분되지 않는다 — 픽스처가 `commentId`를 잘못 읽어 400으로 끝나는 요청도
        // *"안 막힌다"*로 읽힌다.
        const res = await request.promise
        expect(res.statusCode, `${probe.label}: ${res.body}`).toBeLessThan(400)
      })
    }, 120_000)
  }
})

describe('표가 스스로 세는 것', () => {
  /**
   * **이것이 복원 잠금이 실제로 주장하는 명제다.** *"쓰기 라우트 전부가 막힌다"*가 아니다 —
   * 그것은 참이 아니고(재번호의 무-op 갈래가 안 막힌다) 참일 필요도 없다.
   *
   * 주장은 **"복원이 되돌리는 행을 쓰는 라우트는 하나도 빠짐없이 막힌다"**이고, 그 분모는
   * 위 census에서 `restoreWrites`가 `true`인 줄이다.
   */
  it('복원이 쓰는 행을 쓰는 라우트는 하나도 빠짐없이 막힌다', () => {
    const leaks = PROBES.filter((probe) => probe.restoreWrites && !probe.blocked).map((probe) => probe.label)
    expect(leaks).toEqual([])
    // 분모가 0이면 위 줄이 공허하게 통과한다.
    expect(PROBES.filter((probe) => probe.restoreWrites).length).toBeGreaterThan(10)
  })

  /**
   * **막히지 않는 줄은 전부 "아무것도 쓰지 않거나, 복원이 되돌리지 않는 것을 쓰는" 줄이다.**
   * 그 목록을 손으로 적는다 — 새 줄이 여기 들어오면 사람이 *"이것이 정말 안 막혀도 되나"*를
   * 다시 판정하게 된다.
   *
   * **이 목록이 «복원 중에 막히지 않는 쓰기»의 정본이다** — `apps/api/README.md` 「복원은 자기가 쓰는 동안 남이 못 고치게
   * 한다」와 `repos/snapshots.ts`의 `lockProjectForRestore` 머리말은 이 케이스를 가리키기만 한다. 줄마다의 까닭은 아래 주석과
   * 위 census 의 그 줄이 갖는다.
   */
  it('막히지 않는 줄의 목록이 고정돼 있다', () => {
    expect(
      PROBES.filter((probe) => !probe.blocked)
        .map((probe) => probe.route)
        .sort(),
    ).toEqual([
      // **멤버 수정 · 삭제**는 `project_members`의 UPDATE · DELETE 라 부모 행을 안 잡는다. 복원은 멤버를 되돌리지 않고, **막히면
      // 안 되는 쪽이다** — 막히면 복원이 도는 동안 회수(강등 · 제외)가 서지 않는다(`repos/members.ts`의 `lockOwnerIds` 머리말).
      'DELETE /:projectId/members/:userId',
      // **모듈 삭제 · 이름 바꾸기**는 자식 행 삭제 · FK 열을 안 바꾸는 UPDATE 라 부모를 잡지 않는다 —
      // 복원이 모듈을 되돌리지 않으므로(payload에 모듈 절이 없다) 해롭지 않다.
      'DELETE /:projectId/modules/:moduleId',
      // **토큰 폐기**도 자식 행 삭제라 부모를 잡지 않는다.
      // 복원이 토큰을 되돌리지 않으므로 해롭지 않고, **오히려 막히면 안 되는 쪽이다** —
      // 폐기는 자격을 거두는 조작이라 복원이 도는 동안 기다려야 할 이유가 없다.
      'DELETE /:projectId/tokens/:tokenId',
      'PATCH /:projectId/members/:userId',
      'PATCH /:projectId/modules/:moduleId',
      // **바꿀 번호가 없는 재번호**는 아무것도 쓰지 않는다 — 바꿀 번호가 있는 갈래는 막힌다(위 census 의 두 줄).
      'POST /:projectId/pages/:pageId/comments/renumber',
    ])
  })
})
