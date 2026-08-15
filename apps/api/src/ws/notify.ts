/**
 * 라우트 핸들러가 부르는 자리. **`applyEdit`이 성공한 뒤, 그 트랜잭션이 커밋된 뒤에** 부른다.
 *
 * # 왜 파이프라인 밖인가 (P3-1 D3)
 *
 * `services/edit-pipeline.ts`가 *"`services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다"*를
 * 계약으로 못박았다. 브로드캐스트를 그 안에 넣으면 `applyEdit`이 전송을 알게 된다.
 * **호출자가 성공 결과를 받아 알린다** — 그리고 **호출자가 빠뜨릴 수 있다.**
 * `test/broadcast-census.test.ts`가 그 자리를 소스에서 세어 고정한다.
 *
 * # 커밋 뒤여야 한다
 *
 * 트랜잭션 안에서 알리면 받는 쪽이 그 프레임을 보고 다시 조회했을 때 **아직 없는 것을
 * 읽는다.** `routes/pages.ts`처럼 `applyEdit(app.db, …)`를 부른 자리는 그 호출이 끝난
 * 시점에 이미 커밋돼 있고, `routes/comments.ts`처럼 바깥 트랜잭션이 있는 자리는 그
 * `withTransaction`이 **반환한 뒤**에 불러야 한다.
 *
 * # 던지지 않는다
 *
 * 알림이 실패해도 **편집은 성공한 것이다.** 여기서 던지면 이미 커밋된 쓰기에 5xx가 나가고
 * 클라이언트가 그것을 실패로 읽는다 — 이 저장소가 반복해 만난 *"성공했는데 실패했다고
 * 말하는"* 부류의 거울상이다. 실패는 로그로만 남긴다.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PatchOp, ValidationIssue } from '@wirebound/schema'
import type { EventActor } from './protocol'

/**
 * 편집을 낸 클라이언트가 자기 WebSocket 연결을 가리키는 헤더.
 *
 * **§7.1이 *"[본인] ack / [타인] ops"*로 갈라 둔 것을 실행하는 값이다.** 이 슬라이스의
 * 클라이언트는 편집을 REST로 보내므로(D6) 서버는 그 요청이 어느 WS 연결의 주인이 낸
 * 것인지 알 방법이 달리 없다. 헤더가 없으면 **아무도 제외되지 않는다** — 즉 이 값을 안
 * 보내는 클라이언트도 그냥 동작하고, 자기 편집이 자기에게 한 번 더 온다.
 *
 * 위조해도 남의 것을 훔칠 수 없다: 이 값이 하는 일은 **덜 받는 것**뿐이다.
 */
export const CONNECTION_ID_HEADER = 'x-wb-connection-id'

/** 요청이 실어 온 연결 id. 없거나 문자열이 아니면 `undefined`다. */
export function originConnectionId(request: FastifyRequest): string | undefined {
  const raw = request.headers[CONNECTION_ID_HEADER]
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

export interface PageChangedInput {
  projectId: string
  pageId: string
  seq: number
  ops: PatchOp[]
  warnings: ValidationIssue[]
  actor: EventActor
  originConnectionId?: string
}

/** 페이지 문서가 바뀌었다(D4의 첫째). `applyEdit` 성공 하나당 한 번. */
export function notifyPageChanged(app: FastifyInstance, input: PageChangedInput): void {
  const { originConnectionId: except, ...frame } = input
  void app.realtime.broadcast
    .send(input.projectId, { type: 'page-changed', ...frame }, { exceptConnectionId: except })
    .catch((error: unknown) => {
      app.log.error({ err: error, projectId: input.projectId, pageId: input.pageId }, 'page-changed 알림 실패')
    })
}

export interface RestoredInput {
  projectId: string
  snapshotId: string
  actor: EventActor
  originConnectionId?: string
}

/**
 * 스냅샷 복원이 성공했다(D4의 둘째).
 *
 * **P6-2 이월 §9가 이것을 첫 브로드캐스트 대상으로 지목했다:** 복원은 다섯 자원을 한꺼번에
 * 바꾸는데 알릴 경로가 없어, 다른 접속자는 낡은 문서 위에서 편집하다 `stale` 409를 받고
 * **화면은 왜인지 말할 수단이 없었다.**
 *
 * **페이지별 `page-changed`를 내지 않는다.** 복원의 `applyEdit`은 복원 트랜잭션 **안**에
 * 있어 그 자리에서 알리면 커밋 전이고, 페이지마다 프레임을 내면 받는 쪽이 그것을 평범한
 * 편집으로 읽어 하나씩 적용하려 든다 — 복원은 페이지가 사라지고 생기기도 하는 사건이라
 * ops로 표현되지 않는다. **한 프레임으로 *"판이 갈렸다"*를 말하고 받는 쪽이 다시 읽는다.**
 */
export function notifyRestored(app: FastifyInstance, input: RestoredInput): void {
  const { originConnectionId: except, ...frame } = input
  void app.realtime.broadcast
    .send(input.projectId, { type: 'restored', ...frame }, { exceptConnectionId: except })
    .catch((error: unknown) => {
      app.log.error({ err: error, projectId: input.projectId }, 'restored 알림 실패')
    })
}
