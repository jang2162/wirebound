/**
 * WebSocket이 나르는 프레임의 모양. **여기가 그 계약의 단일 지점이다** — 서버가 만들고
 * `apps/web`의 수신부가 같은 이름으로 읽는다.
 *
 * `apps/web`은 이 파일을 import할 수 없다(`apps/*`는 서로 의존하지 않는다). 그래서
 * 그쪽에 같은 모양의 파서가 따로 있고, **`apps/web/test/realtime/protocol-parity.test.ts`가
 * 두 벌이 갈라지지 않는 것을 소스에서 세어 고정한다** — 그 파일이 이 파일을 `readFileSync`로
 * 읽어 `type` 리터럴을 맞대 본다. 이름을 손으로 맞추면 한쪽만 바뀐다.
 *
 * **검사는 거울을 든 쪽(`apps/web`)에 있다 — `apps/api/test/`에서 찾지 마라.** 앞 판이 이
 * 자리에 `test/ws-protocol-parity.test.ts`라고 적어 **없는 파일을 가리켰고**, 리뷰가 그것을
 * 찾았다.
 *
 * **`type`이 판별자다.** 새 프레임을 더할 때 `type` 없이 필드만 늘리지 마라 — 받는 쪽이
 * 모양으로 갈래를 추측하게 되고, 그것이 이 저장소가 반복해 만난 부류다.
 */
import type { PatchOp, ValidationIssue } from '@wirebound/schema'
import { z } from 'zod'
import type { ProjectRole } from '../db/types'
import type { ApiErrorCode, ApiErrorIssue } from '../errors'
import { ClientOpId, OpsBody } from '../http/patch-ops'

/** 룸에 들어와 있는 연결 하나. §7.2의 잠금이 이 목록 위에 선다. */
export interface Participant {
  connectionId: string
  userId: string
  userName: string
}

/** 변경을 일으킨 사람. `revisions.actor_*`와 같은 값이다(§7.4의 `mcp` 표시가 이 자리를 쓴다). */
export interface EventActor {
  type: 'user' | 'mcp'
  label: string
}

/**
 * 서버 → 클라이언트.
 *
 * | `type` | 언제 |
 * |---|---|
 * | `joined` | 핸드셰이크 직후, **그 연결에게만**. 자기 `connectionId`를 여기서 처음 안다 |
 * | `presence` | 누가 들어오거나 나갈 때, **룸 전체에** |
 * | `page-changed` | `applyEdit`이 성공했을 때(D4) |
 * | `restored` | 스냅샷 복원이 성공했을 때(D4) |
 * | `pong` | `ping`에 대한 답. 클라이언트가 연결이 살아 있는지 재는 유일한 수단이다 |
 * | `patch-ack` | **낸 사람에게만.** `patch` 프레임이 성공했다(§7.1의 *"[본인] ack(seq) 수신"*) |
 * | `patch-error` | **낸 사람에게만.** `patch` 프레임이 실패했다 |
 */
export type ServerFrame =
  | { type: 'joined'; projectId: string; connectionId: string; userId: string; role: ProjectRole }
  | { type: 'presence'; projectId: string; participants: Participant[] }
  | {
      type: 'page-changed'
      projectId: string
      pageId: string
      /** 이 변경이 만든 revision의 seq. 받는 쪽의 `headSeq`가 이 값이 된다. */
      seq: number
      /**
       * **문서 전체가 아니라 `ops`다.** 받는 쪽에는 아직 보내지 않은 낙관적 편집이 있을 수
       * 있고, 서버 문서로 갈아 끼우면 그것이 화면에서 사라진다(`editor-store.ts`의
       * `applyMarkerChange` 머리말이 같은 이유를 적어 두었다).
       */
      ops: PatchOp[]
      /**
       * 저장을 막지 않은 이슈(`edit-pipeline.ts`의 성공 결과). **반드시 싣는다** —
       * REST 응답만 경고를 나르면 사용자가 보는 것이 접속 방식에 따라 갈린다.
       */
      warnings: ValidationIssue[]
      actor: EventActor
      /**
       * **낸 사람이 붙인 id. 있을 때만 실린다**(REST 본문이나 `patch` 프레임에 있었을 때).
       *
       * **받는 쪽이 *"이건 내가 낸 것"*을 알아보는 유일한 수단이다.** 보통은 서버가 발신자를
       * 제외하므로(`exceptConnectionId`) 그럴 일이 없지만, **제외가 성립하지 않는 창이 있다:**
       * 편집이 REST로 나가는 동안(소켓이 아직 안 열려 `x-wb-connection-id`가 없다) 그 소켓이
       * 열려 룸에 들어오면, 그 뒤에 나가는 브로드캐스트를 **낸 사람이 되받는다.**
       *
       * 앞 슬라이스에서는 그 프레임이 미뤄지기만 해서 무해했다. **P3-2의 리베이스는 그것을
       * 바탕에 얹고 내 pending을 그 위에 다시 올리므로 같은 편집이 두 번 들어간다** — 그리고
       * 조용하다. 그래서 받는 쪽이 그 프레임을 알아보고 건너뛸 수 있게 이 값을 싣는다.
       *
       * **멱등 키가 아니다**(D4). 서버는 저장하지 않고 되돌려 줄 뿐이다.
       */
      clientOpId?: string
    }
  | { type: 'restored'; projectId: string; snapshotId: string; actor: EventActor }
  | { type: 'pong' }
  | {
      type: 'patch-ack'
      projectId: string
      pageId: string
      /** 보낸 프레임의 `clientOpId`를 그대로 되돌려 준다 — 짝을 짓는 것은 이 값뿐이다. */
      clientOpId: string
      seq: number
      revisionId: string
      /**
       * 서버가 적용 직전 상태를 보고 만든 역패치(§7.1). undo 스택이 이것을 든다 —
       * REST 응답의 같은 필드와 같은 값이고, 그래서 두 경로의 undo가 갈리지 않는다.
       */
      inverse: PatchOp[]
      /** REST 응답의 `warnings`와 같다(P4a-3 — 한쪽만 나르면 접속 방식에 따라 갈린다). */
      warnings: ValidationIssue[]
    }
  | {
      type: 'patch-error'
      projectId: string
      pageId: string
      clientOpId: string
      /**
       * **REST가 내는 것과 같은 봉투다**(`errors.ts`의 `{ code, message, issues? }` +
       * `status`). 같은 실패를 두 벌로 이름 짓지 않으려고 `http/edit-outcome.ts`의 매핑을
       * 그대로 지나온 값을 싣는다 — 받는 쪽은 접속 방식과 무관하게 한 규칙으로 읽는다.
       */
      status: number
      code: ApiErrorCode
      message: string
      issues: ApiErrorIssue[]
    }

/**
 * 클라이언트 → 서버. **둘이다** — 하트비트(`ping`)와 편집 전송(`patch`).
 *
 * `ping`이 있는 이유는 둘이다. 브라우저 `WebSocket`은 프로토콜 ping을 **보낼 수 없어**
 * (읽기 전용 API에 그 메서드가 없다) 클라이언트가 연결이 살아 있는지 재려면 앱 수준
 * 프레임이 필요하고, §10이 요구하는 *"프레임 수신 시 권한 재확인"*이 설 자리가 생긴다.
 *
 * # `patch`의 모양은 REST 본문에서 온다 (P3-2 D2)
 *
 * `http/patch-ops.ts`의 `OpsBody`를 **그대로 넓혀** 만든다. 그 파일 머리말이 *"P3의
 * WebSocket 핸들러도 `applyEdit`을 부르기 전에 신뢰할 수 없는 프레임을 걸러야 하는데, 그
 * 규칙이 REST 라우트 파일 안에만 있으면 복제된다"*고 적어 둔 그 자리다. 복제하면
 * *"REST로는 되는데 WS로는 안 되는"* 입력이 생기고, 그 어긋남은 **접속 방식에 따라 갈린다.**
 *
 * **넓히는 것은 셋뿐이다:** 판별자 `type`, REST에서는 URL이 나르던 `pageId`, 그리고
 * `clientOpId`를 **선택에서 필수로** 좁히는 것. 마지막이 갈리는 이유는 ack의 모양이다 —
 * REST의 응답은 요청과 짝이 지어져 오지만 `patch-ack`은 프레임이라 **이 값 말고는 짝지을
 * 것이 없다.**
 */
const PatchFrame = OpsBody.extend({
  type: z.literal('patch'),
  /** REST에서는 URL 파라미터였다(`routes/pages.ts`의 `PageParams`와 같은 술어다). */
  pageId: z.uuid(),
  clientOpId: ClientOpId,
})

const ClientFrameSchema = z.discriminatedUnion('type', [z.strictObject({ type: z.literal('ping') }), PatchFrame])

export type ClientFrame = z.infer<typeof ClientFrameSchema>

/**
 * 프레임 하나를 받으려면 지금 무슨 역할이어야 하는가. **§10의 *"각 patch 수신 시 한 번"*이
 * 실제로 서는 자리다.**
 *
 * **`viewer`와 `editor`가 갈리는 것이 이 표의 전부다**(P3-2 D1). 앞 슬라이스는 프레임이
 * `ping` 하나여서 *"받을 자격"*(`broadcast.ts`의 `MIN_ROLE_TO_RECEIVE`)을 프레임 수신에도
 * 그대로 썼고, 그래서 **WS 경로 어디에도 `editor` 판정이 없었다** — 그대로 `patch`를
 * 얹었으면 §10이 *"조회 전용 — 편집·코멘트 모두 불가"*로 못박은 viewer가 편집을 냈다.
 *
 * **`Record<ClientFrame['type'], ProjectRole>`인 것이 계약이다** — 프레임을 하나 더하면
 * 여기서 컴파일이 막힌다. 빠뜨린 갈래가 `undefined`로 새어 나가면 `roleAtLeast`가 무엇과
 * 비교하는지 알 수 없게 되고, 그 자리는 조용하다(`editor-store.ts`의 `STALE_RANK`가 같은
 * 이유로 같은 모양이다).
 */
export const MIN_ROLE_FOR_FRAME: Record<ClientFrame['type'], ProjectRole> = {
  ping: 'viewer',
  patch: 'editor',
}

/**
 * 닫을 때 쓰는 코드. 1000·1001은 표준이고 4000번대는 애플리케이션 몫이다(RFC 6455).
 *
 * **`unauthorized`와 `revoked`를 가른다.** 붙을 때부터 권한이 없던 것과 붙어 있는 동안
 * 권한이 사라진 것은 클라이언트가 할 일이 다르다 — 앞의 것은 다시 시도해도 같고, 뒤의
 * 것은 로그인 화면으로 가야 한다.
 */
export const WS_CLOSE = {
  /** 붙을 때 인증·권한이 없었다. 핸드셰이크가 HTTP 401/403/404로 끝나므로 실제로는 드물다. */
  unauthorized: 4401,
  /** 붙어 있는 동안 세션이나 멤버십이 사라졌다(§10의 *"즉시 회수"*). */
  revoked: 4403,
  /** 읽을 수 없는 프레임을 받았다. */
  badFrame: 4400,
} as const

/**
 * 신뢰할 수 없는 문자열을 `ClientFrame`으로 읽는다. **zod로 읽는다** — 앞 슬라이스의 이
 * 함수는 손으로 쓴 검사였고 그 주석이 *"갈래가 늘면 `http/patch-ops.ts`가 그랬듯 zod로
 * 옮긴다"*고 적었다. `patch`가 그 갈래다.
 *
 * **모양이 어긋나면 `null`이다.** 부르는 쪽이 그것을 `WS_CLOSE.badFrame`으로 옮긴다 —
 * 읽을 수 없는 프레임은 편집 실패가 아니라 계약 위반이라 되돌려 줄 `clientOpId`조차 없다.
 */
export function parseClientFrame(raw: string): ClientFrame | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = ClientFrameSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
