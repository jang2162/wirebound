/**
 * 서버가 WebSocket으로 보내는 프레임을 읽는 자리. **`apps/api/src/ws/protocol.ts`의 거울이다.**
 *
 * **왜 두 벌인가.** `apps/*`는 서로 의존하지 않는다(`CLAUDE.md`의 의존 방향) — 웹이 api의
 * 타입을 import할 수 없다. 공유 패키지로 올리는 길도 있지만, 그러면 `packages/`의 어느 것도
 * 갖고 있지 않은 **전송 계층**의 어휘가 `schema` 옆에 서게 된다.
 *
 * **두 벌이 갈라지는 것을 `test/realtime/protocol-parity.test.ts`가 막는다** — 양쪽 소스에서
 * `type` 리터럴을 뽑아 맞대 본다. 이름을 손으로 맞추면 한쪽만 바뀌고 아무도 모른다.
 *
 * # 신뢰할 수 없는 입력이다
 *
 * 소켓에서 온 문자열이다. `JSON.parse`가 던질 수 있고, 파싱돼도 모양이 다를 수 있다.
 * **모르는 프레임은 `null`로 떨어뜨린다** — 던지지 않는 것은 서버가 새 `type`을 더했을 때
 * 낡은 클라이언트가 **연결째 죽지 않게** 하기 위해서다.
 */
import type { PatchOp, ValidationIssue } from '@wirebound/schema'

export interface Participant {
  connectionId: string
  userId: string
  userName: string
}

export interface EventActor {
  type: string
  label: string
}

/**
 * **서버의 `joined`는 `role`도 싣는데 여기서는 읽지 않는다.** 화면의 역할 판정은
 * `projects/project-actions.ts`의 `projectAbilities` 하나가 하고 그 입력은
 * `getProject`의 응답이다 — 같은 값을 두 번째 경로로 들이면 그 판정이 둘이 된다
 * (`test/role-access.test.ts`가 `.role`을 읽는 자리를 세어 그것을 막는다).
 */
export type ServerFrame =
  | { type: 'joined'; projectId: string; connectionId: string; userId: string }
  | { type: 'presence'; projectId: string; participants: Participant[] }
  | {
      type: 'page-changed'
      projectId: string
      pageId: string
      seq: number
      ops: PatchOp[]
      warnings: ValidationIssue[]
      actor: EventActor
    }
  | { type: 'restored'; projectId: string; snapshotId: string; actor: EventActor }
  | { type: 'pong' }

/** 클라이언트가 보내는 것. **이 슬라이스에는 하나뿐이다** — 편집 전송은 P3-2다. */
export const PING_FRAME = JSON.stringify({ type: 'ping' })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * 프레임 하나를 읽는다. **모양이 어긋나면 `null`이다.**
 *
 * 필드를 **하나하나 본다.** `as ServerFrame`로 넘기면 `seq`가 없는 `page-changed`가
 * `undefined`로 흘러 들어가 `headSeq`를 `undefined`로 만든다 — 그 어긋남은 조용하고,
 * 다음 편집이 400을 받을 때까지 아무도 모른다.
 */
export function parseServerFrame(raw: string): ServerFrame | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null

  switch (value.type) {
    case 'joined':
      return str(value.projectId) && str(value.connectionId) && str(value.userId)
        ? {
            type: 'joined',
            projectId: value.projectId,
            connectionId: value.connectionId,
            userId: value.userId,
          }
        : null
    case 'presence':
      return str(value.projectId) && Array.isArray(value.participants)
        ? { type: 'presence', projectId: value.projectId, participants: value.participants as Participant[] }
        : null
    case 'page-changed':
      return str(value.projectId) &&
        str(value.pageId) &&
        typeof value.seq === 'number' &&
        Array.isArray(value.ops) &&
        Array.isArray(value.warnings) &&
        isRecord(value.actor)
        ? {
            type: 'page-changed',
            projectId: value.projectId,
            pageId: value.pageId,
            seq: value.seq,
            ops: value.ops as PatchOp[],
            warnings: value.warnings as ValidationIssue[],
            actor: value.actor as unknown as EventActor,
          }
        : null
    case 'restored':
      return str(value.projectId) && str(value.snapshotId) && isRecord(value.actor)
        ? {
            type: 'restored',
            projectId: value.projectId,
            snapshotId: value.snapshotId,
            actor: value.actor as unknown as EventActor,
          }
        : null
    case 'pong':
      return { type: 'pong' }
    default:
      return null
  }
}

/**
 * 프로젝트 룸의 WebSocket 주소. **`location`을 여기 한 줄에 가둔다** — 이 파일 밖의 실시간
 * 코드가 브라우저 전역을 알지 않게 한다.
 *
 * `https`면 `wss`다. 안 바꾸면 https 페이지에서 브라우저가 혼합 콘텐츠로 막는다.
 */
export function realtimeUrl(origin: string, projectId: string): string {
  const scheme = origin.startsWith('https:') ? 'wss:' : 'ws:'
  return `${scheme}//${origin.replace(/^https?:\/\//, '')}/api/projects/${projectId}/ws`
}
