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
import type { BroadcastOrigin } from './broadcast'
import type { EventActor } from './protocol'

/**
 * 편집을 낸 클라이언트가 자기 WebSocket 연결을 가리키는 헤더.
 *
 * **§7.1이 *"[본인] ack / [타인] ops"*로 갈라 둔 것을 실행하는 값이다.** **편집이 REST로
 * 들어오면** 서버는 그 요청이 어느 WS 연결의 주인이 낸 것인지 알 방법이 달리 없다 —
 * §7.4의 MCP가 그 길이고, 웹 클라이언트도 소켓이 아직 안 열렸으면 그 길로 간다.
 * (WS로 들어온 편집은 **연결이 곧 발신자**라 이 헤더가 필요 없다 — `ws/patch.ts`.)
 *
 * 헤더가 없으면 **아무도 제외되지 않는다** — 즉 이 값을 안 보내는 클라이언트도 그냥
 * 동작하고, 자기 편집이 자기에게 한 번 더 온다. **그 되받기를 받는 쪽이 알아보는 수단이
 * 아래 `clientOpId`다**(P3-2 — 리베이스가 그것을 두 번 얹지 않게 한다).
 *
 * **이 값이 빼는 것은 그 요청과 같은 세션의 연결뿐이다** — 위조해도 덜 받는 것은 **자기 세션의 연결**이다.
 * 앞 판은 *"위조해도 남의 것을 훔칠 수 없다: 이 값이 하는 일은 덜 받는 것뿐이다"*라고 적었는데, 덜 받는 쪽은
 * **그 id 를 쥔 연결**이었다(id 는 `presence`로 룸의 모두에게 보인다). 규칙과 그 값은 `ws/broadcast.ts`의
 * `sentBy`가 소유한다.
 */
export const CONNECTION_ID_HEADER = 'x-wb-connection-id'

/**
 * 방송에서 뺄 발신 연결. 헤더가 없거나 문자열이 아니거나 **세션이 없으면**(토큰 요청 — `ws/broadcast.ts`의
 * `sentBy`가 까닭을 적는다) `undefined`다 — 아무도 안 뺀다. 연결 id 는 요청이 말한 값이고, 세션은
 * `auth/plugin.ts`가 쿠키에서 읽은 값이다.
 */
export function broadcastOrigin(request: FastifyRequest): BroadcastOrigin | undefined {
  const raw = request.headers[CONNECTION_ID_HEADER]
  if (typeof raw !== 'string' || raw.length === 0 || request.sessionId === null) return undefined
  return { connectionId: raw, sessionId: request.sessionId }
}

export interface PageChangedInput {
  projectId: string
  pageId: string
  seq: number
  ops: PatchOp[]
  warnings: ValidationIssue[]
  actor: EventActor
  /** 방송에서 뺄 발신 연결(`broadcastOrigin`). 없으면 아무도 안 뺀다. */
  origin?: BroadcastOrigin
  /**
   * 낸 사람이 붙인 id. **있을 때만 프레임에 실린다** — 서버가 만들어 내는 값이 아니다
   * (`routes/pages.ts`의 응답이 같은 관례를 쓴다).
   *
   * 무엇에 쓰는지는 `protocol.ts`의 그 필드에 적혀 있다: **발신자 제외가 성립하지 않는
   * 창에서 받는 쪽이 자기 편집을 알아보는 수단**이다.
   */
  clientOpId?: string
}

/** 페이지 문서가 바뀌었다(D4의 첫째). `applyEdit` 성공 하나당 한 번. */
export function notifyPageChanged(app: FastifyInstance, input: PageChangedInput): void {
  const { origin, ...frame } = input
  void app.realtime.broadcast
    .send(input.projectId, { type: 'page-changed', ...frame }, origin === undefined ? undefined : { except: origin })
    .catch((error: unknown) => {
      app.log.error({ err: error, projectId: input.projectId, pageId: input.pageId }, 'page-changed 알림 실패')
    })
}

export interface RestoredInput {
  projectId: string
  snapshotId: string
  actor: EventActor
  /** 방송에서 뺄 발신 연결(`broadcastOrigin`). 없으면 아무도 안 뺀다. */
  origin?: BroadcastOrigin
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
  const { origin, ...frame } = input
  void app.realtime.broadcast
    .send(input.projectId, { type: 'restored', ...frame }, origin === undefined ? undefined : { except: origin })
    .catch((error: unknown) => {
      app.log.error({ err: error, projectId: input.projectId }, 'restored 알림 실패')
    })
}
