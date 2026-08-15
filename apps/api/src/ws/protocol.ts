/**
 * WebSocket이 나르는 프레임의 모양. **여기가 그 계약의 단일 지점이다** — 서버가 만들고
 * `apps/web`의 수신부가 같은 이름으로 읽는다.
 *
 * `apps/web`은 이 파일을 import할 수 없다(`apps/*`는 서로 의존하지 않는다). 그래서
 * 그쪽에 같은 모양의 파서가 따로 있고, **`test/ws-protocol-parity.test.ts`가 두 벌이
 * 갈라지지 않는 것을 소스에서 세어 고정한다** — 이름을 손으로 맞추면 한쪽만 바뀐다.
 *
 * **`type`이 판별자다.** 새 프레임을 더할 때 `type` 없이 필드만 늘리지 마라 — 받는 쪽이
 * 모양으로 갈래를 추측하게 되고, 그것이 이 저장소가 반복해 만난 부류다.
 */
import type { PatchOp, ValidationIssue } from '@wirebound/schema'
import type { ProjectRole } from '../db/types'

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
    }
  | { type: 'restored'; projectId: string; snapshotId: string; actor: EventActor }
  | { type: 'pong' }

/**
 * 클라이언트 → 서버. **이 슬라이스에는 `ping` 하나뿐이다** — 편집 전송·ack·리베이스는
 * P3-2다.
 *
 * 그 하나가 있는 이유는 둘이다. 브라우저 `WebSocket`은 프로토콜 ping을 **보낼 수 없어**
 * (읽기 전용 API에 그 메서드가 없다) 클라이언트가 연결이 살아 있는지 재려면 앱 수준
 * 프레임이 필요하고, §10이 요구하는 *"프레임 수신 시 권한 재확인"*이 설 자리가 생긴다.
 */
export type ClientFrame = { type: 'ping' }

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
 * 신뢰할 수 없는 문자열을 `ClientFrame`으로 읽는다. **zod를 쓰지 않는다** — 갈래가 하나뿐인
 * 지금 스키마를 세우면 그 스키마가 이 파일의 유일한 내용이 된다. 갈래가 늘면
 * (`http/patch-ops.ts`가 그랬듯) zod로 옮긴다.
 */
export function parseClientFrame(raw: string): ClientFrame | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const type = (value as { type?: unknown }).type
  return type === 'ping' ? { type: 'ping' } : null
}
