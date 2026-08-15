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
import type { ApiErrorIssue } from '../api/client'

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
      /**
       * 낸 사람이 붙인 id. **있을 때만 온다.** 이것이 내 pending에 있으면 그 프레임은
       * **내가 낸 편집이 되돌아온 것**이고, 리베이스가 그것을 얹으면 같은 편집이 두 번
       * 들어간다(서버 `ws/protocol.ts`의 그 필드에 창이 적혀 있다).
       */
      clientOpId?: string
    }
  | { type: 'restored'; projectId: string; snapshotId: string; actor: EventActor }
  | { type: 'pong' }
  | {
      type: 'patch-ack'
      projectId: string
      pageId: string
      clientOpId: string
      seq: number
      revisionId: string
      inverse: PatchOp[]
      warnings: ValidationIssue[]
    }
  | {
      type: 'patch-error'
      projectId: string
      pageId: string
      clientOpId: string
      /**
       * **REST 에러 봉투와 같은 값이다**(서버 `errors.ts`). 그래서 받는 쪽이 그것을
       * `ApiError`로 되세우면 실패 → 화면 규칙(`api/failure.tsx`)이 접속 방식과 무관하게
       * 하나로 남는다.
       */
      status: number
      code: string
      message: string
      issues: ApiErrorIssue[]
    }

/**
 * 클라이언트가 보내는 것. **둘이다** — 하트비트와 편집 전송(P3-2).
 *
 * **서버의 `ClientFrame`(zod)의 거울이다.** 그쪽은 `http/patch-ops.ts`의 `OpsBody`를 넓혀
 * 만들고, 여기서는 같은 모양을 타입으로 적는다 — `test/realtime/protocol-parity.test.ts`가
 * 두 벌의 이름을 소스에서 맞대 본다.
 */
export type ClientFrame =
  | { type: 'ping' }
  | {
      type: 'patch'
      pageId: string
      /** 이 편집이 설 revision. 서버는 `head_seq`와 **정확히 같을 때만** 받는다. */
      baseSeq: number
      ops: PatchOp[]
      /**
       * **여기서는 필수다.** REST에서는 선택이지만(서버가 응답에 되돌려 줄 뿐이다) ack가
       * 프레임으로 오는 이쪽에서는 짝지을 것이 이 값밖에 없다.
       */
      clientOpId: string
    }

/** 하트비트. 문자열을 미리 만들어 둔다 — 프레임마다 같은 값이다. */
export const PING_FRAME = JSON.stringify({ type: 'ping' } satisfies ClientFrame)

/** 편집 하나를 실어 보낼 문자열. */
export function patchFrame(input: Omit<Extract<ClientFrame, { type: 'patch' }>, 'type'>): string {
  return JSON.stringify({ type: 'patch', ...input } satisfies ClientFrame)
}

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
            // **없으면 키 자체를 안 만든다** — `undefined`를 담아 두면 스토어의 대조가
            // *"id 없는 pending"*과 우연히 맞을 여지가 생긴다.
            ...(str(value.clientOpId) ? { clientOpId: value.clientOpId } : {}),
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
    case 'patch-ack':
      // **`clientOpId`가 없으면 버린다.** 짝지을 수 없는 ack는 `undefined`를 키로 in-flight를
      // 뒤지게 되고, 그러면 엉뚱한 편집이 성공으로 처리된다.
      return str(value.projectId) &&
        str(value.pageId) &&
        str(value.clientOpId) &&
        typeof value.seq === 'number' &&
        str(value.revisionId) &&
        Array.isArray(value.inverse) &&
        Array.isArray(value.warnings)
        ? {
            type: 'patch-ack',
            projectId: value.projectId,
            pageId: value.pageId,
            clientOpId: value.clientOpId,
            seq: value.seq,
            revisionId: value.revisionId,
            inverse: value.inverse as PatchOp[],
            warnings: value.warnings as ValidationIssue[],
          }
        : null
    case 'patch-error':
      return str(value.projectId) &&
        str(value.pageId) &&
        str(value.clientOpId) &&
        typeof value.status === 'number' &&
        str(value.code) &&
        str(value.message) &&
        Array.isArray(value.issues)
        ? {
            type: 'patch-error',
            projectId: value.projectId,
            pageId: value.pageId,
            clientOpId: value.clientOpId,
            status: value.status,
            code: value.code,
            message: value.message,
            issues: value.issues as ApiErrorIssue[],
          }
        : null
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
