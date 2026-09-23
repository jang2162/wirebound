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
import { roleAtLeast } from '../auth/roles'
import type { ProjectRole } from '../db/types'
import type { BroadcastOrigin } from './broadcast'
import { releaseLocksOf } from './lock'
import { MIN_ROLE_FOR_FRAME, type EventActor, type ServerFrame } from './protocol'

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

export interface MembershipChangedInput {
  projectId: string
  /** 멤버십이 바뀐 사람. **그 사람의 연결에만** 간다 — 룸의 다른 사람은 이것으로 할 일이 없다. */
  userId: string
  /** 바뀐 뒤의 역할. **`null`이면 멤버에서 빠졌다.** 프레임에는 안 실린다(`protocol.ts`의 그 갈래). */
  role: ProjectRole | null
}

/**
 * 멤버 행이 바뀐 **커밋 뒤에** 부른다(`routes/members.ts` — 역할 변경 · 제거). 이월 5차.
 *
 * # 무엇을 하는가 — 그 사람의 연결마다
 *
 * | 바뀐 뒤 | 프레임 | 잠금 | 연결 |
 * |---|---|---|---|
 * | 잠금을 쥘 수 있는 역할(`MIN_ROLE_FOR_FRAME.lock` 이상) | `membership-changed` | 그대로 | 그대로 |
 * | 그 아래(viewer) | `membership-changed` | **놓는다** | 그대로 — viewer 는 계속 받는다 |
 * | 멤버가 아님 | `membership-changed` | **놓는다** | 여기서 안 닫는다 — 아래 «제거는 여기서 안 닫는다» |
 *
 * **잠금을 여기서 놓는 까닭(재서 알았다).** 앞 판은 강등된 연결의 잠금을 놓을 길이 없었다 — 그 연결이 보내는 `unlock`은
 * `MIN_ROLE_FOR_FRAME.unlock`(editor)에 걸려 조용히 버려지고, 연결은 룸에 남으므로 닫힘도 안 온다(`protocol.ts`의 그 표
 * 주석이 *"TTL 30초로 사라진다"*고 적었다). Chrome: 앨리스가 캐럴을 viewer 로 내린 뒤에도 앨리스의 구조 트리에
 * «캐럴 편집 중»이 남아 앨리스가 그 카드를 **못 골랐다.** `unlock`의 문턱을 viewer 로 내리는 길도 있었지만, 그러면 강등을
 * 모르는(프레임을 못 받은) 클라이언트는 여전히 쥔 채다 — 멤버십을 바꾼 서버가 놓는 것이 받는 쪽에 기대지 않는다.
 *
 * **제거는 알리되 여기서 안 닫는다.** 앞 판은 제거된 연결의 화면이 **다음 프레임까지** 아무것도 몰랐다(Chrome · 제거 2.5초
 * 뒤 입구 전부). 이제 알림을 받은 웹은 다시 읽고 404 를 받아 셸째 내려가며 **자기 소켓을 닫는다.** 서버가 여기서 닫지 않는
 * 까닭은 **나가 있던 편집의 답**이다(재서 알았다): 잠금에 줄 선 WS `patch`는 커밋 순간의 재확인이 404 를 `patch-error`로
 * 답하는데(`test/guard-in-lock.test.ts`의 «멤버에서 빠지면 404»), 여기서 닫으면 그 답이 갈 길이 없어 낸 쪽은 «답을 못
 * 받았다»(웹의 «모름»)로 끝난다 — 이미 확정된 거절을 모름으로 바꾸는 것이다. 닫는 일은 앞 판의 회수가 그대로 한다 — 그
 * 연결이 무엇을 보내거나(`ws/routes.ts` · 하트비트 25초) 방송이 지나갈 때(`ws/broadcast.ts`의 `stillAllowed`) 4403 이고,
 * **그 사이 그 연결로 프로젝트의 무엇도 나가지 않는다**(방송이 보내기 전에 자격을 본다). 잠금은 여기서 놓는다 — 닫힘을
 * 기다리면 그동안 남의 선택을 막는다. **그 사람이 잠금을 쥐고 있었으면 놓는 `locks` 방송이 곧 그 회수다** — 방송이
 * 그 연결의 자격을 보고 닫는다. 그 판에서는 줄 선 `patch`의 404 답이 여전히 길을 잃는다(남는 틈 — 웹은 다시 읽기의
 * 404 로 셸째 내려가므로 그 편집의 «모름»은 화면에 안 남는다).
 *
 * **연결의 멤버십 세대도 여기서 올린다**(`RoomConnection.membershipEpoch` — 리뷰 R5). 그 연결이 보낸 `lock` 프레임이 자격을 보는
 * 중(await)이면 여기서 놓아도 놓을 것이 아직 없고, 뒤이어 그 프레임이 잡는다 — 그 잠금은 TTL 까지 남는다. 프레임 경로가
 * await 앞에서 읽은 세대와 견줘 바뀌었으면 잡지 않는다(`ws/routes.ts`의 `lock` 갈래). 지연을 넣은 변조(`stillAllowed`의
 * editor 판정에 30ms)로 잰 값: 고치기 전 **29초까지** 남고 31초에 풀림 → 고친 뒤 **0.5초에 이미 없음**(보고).
 *
 * # 보내기 전에 권한을 다시 보지 않는다
 *
 * `broadcast.ts`의 `send`는 프레임마다 받을 자격(viewer)을 다시 본다 — 프로젝트의 내용이 실려서다. 이 프레임은
 * `projectId` 하나뿐이고 받는 사람 **자신의** 멤버십이 바뀌었다는 사실이다. 제거된 사람도 받아야 뜻이 있다(자격을
 * 보면 그 사람만 못 받는다). **세션은 연결이 붙을 때 이미 본 값이다** — 세션이 사라진 연결도 이것을 받을 수 있지만,
 * 거기 실린 것은 그 연결이 이미 아는 `projectId`뿐이다.
 *
 * 던지지 않는다 — 멤버 행은 이미 커밋됐다(`notifyPageChanged`와 같은 자세).
 */
export function notifyMembershipChanged(app: FastifyInstance, input: MembershipChangedInput): void {
  const frame: ServerFrame = { type: 'membership-changed', projectId: input.projectId }
  const payload = JSON.stringify(frame)
  const canHold = input.role !== null && roleAtLeast(input.role, MIN_ROLE_FOR_FRAME.lock)
  const { rooms } = app.realtime
  for (const connection of rooms.membersOf(input.projectId)) {
    if (connection.userId !== input.userId) continue
    // **세대를 먼저 올린다** — 자격을 보는 중이던 `lock` 프레임이 이 뒤에 잡지 않게(`RoomConnection.membershipEpoch`).
    // 보내기가 던져도 오른 채다(아래 `try` 밖).
    connection.membershipEpoch += 1
    try {
      connection.send(payload)
      if (!canHold) releaseLocksOf(app, connection)
    } catch (error) {
      app.log.error({ err: error, projectId: input.projectId, connectionId: connection.id }, 'membership-changed 알림 실패')
    }
  }
}
