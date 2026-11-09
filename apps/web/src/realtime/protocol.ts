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
import { KNOWN_USER_QUERY } from '../api/known-user'
import type { PatchOp, ValidationIssue } from '@wirebound/schema'
import type { ApiErrorIssue } from '../api/client'

export interface Participant {
  connectionId: string
  userId: string
  userName: string
}

/**
 * 살아 있는 잠금 하나(설계서 「소프트 잠금」). **서버의 `LiveLock`의 거울이다.**
 *
 * `userName`이 실려 오므로 배지가 참가자 목록을 다시 뒤지지 않는다 — 그 목록은 낡을 수
 * 있고, 뒤지게 두면 낡은 한 프레임 동안 배지가 **이름 없이** 사라진다.
 */
export interface NodeLockView {
  pageId: string
  nodeId: string
  userId: string
  userName: string
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
      type: 'locks'
      projectId: string
      /** **프로젝트의 살아 있는 잠금 전부다.** 받는 쪽이 자기 페이지의 것만 걸러 쓴다. */
      locks: NodeLockView[]
    }
  /**
   * **내가 보낸 `lock`의 노드 가운데 서버가 받지 않은 것** — 겹치는 자리를 남이 쥐었으면 그 노드만 실리고 나머지는 쥐었다. 자격을
   * 보는 사이 멤버십이 바뀌었거나 끝내지 못했으면 보낸 노드 전부가 실리고 이 연결은 아무것도 안 쥔다(서버 `ws/lock.ts`의 표). 받는
   * 자리는 `lock-channel.ts`의 `denied`다.
   */
  | {
      type: 'lock-denied'
      projectId: string
      pageId: string
      nodeIds: string[]
      /** 거절된 그 `lock`의 `lockId` — `lock-channel.ts`가 마지막으로 보낸 것과 견준다. */
      lockId: number
    }
  | {
      type: 'page-changed'
      projectId: string
      pageId: string
      seq: number
      ops: PatchOp[]
      warnings: ValidationIssue[]
      /**
       * 낸 사람이 붙인 id. **있을 때만 온다.** 이것이 내 pending에 있으면 그 프레임은
       * **내가 낸 편집이 되돌아온 것**이고, 리베이스가 그것을 얹으면 같은 편집이 두 번
       * 들어간다(서버 `ws/protocol.ts`의 그 필드에 창이 적혀 있다).
       */
      clientOpId?: string
    }
  /**
   * **그 페이지가 서버에서 바뀌었는데 그 변경의 `page-changed`는 안 온다 — 다시 읽어라**(서버 `ws/protocol.ts`의 그 갈래). 번호도 `ops`도 안
   * 온다 — 늦게 커밋된 편집 · 게시의 번호 프레임을 늦게 내면 받는 쪽이 «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다. 받는 자리는
   * `EditorStore.markPageStale`이다. **`seq`는 힌트다 — 비교에만 쓴다**(`seq <= headSeq`면 이미 읽은 판이라 경보를 안 세운다). 번호를 얹는 데 쓰지 않는다.
   */
  | { type: 'page-stale'; projectId: string; pageId: string; seq?: number }
  | {
      type: 'restored'
      projectId: string
      snapshotId: string
      /**
       * 그 복원이 만든 안전망 스냅샷의 id. **있을 때만 온다.** 답을 받은 내 복원의 것이면 그 신호는 내 복원이 되돌아온 것이다 — 복원의 방송은
       * 낸 연결도 빼지 않는다(서버 `ws/notify.ts`의 `notifyRestored`). 스토어가 알아보고 넘긴다(`EditorStore.markRestored`).
       */
      safetySnapshotId?: string
      /**
       * 낸 탭이 그 요청에 실은 복원 id(`api/client.ts`의 `RestoreOptions`). **있을 때만 온다.** 답을 기다리는 · 잃은 내 복원의 신호를 알아본다 —
       * 넘기는 판정에는 안 쓴다(흉내 낼 수 있다 — `EditorStore`의 `RestoreSignal`).
       */
      clientRestoreId?: string
    }
  /**
   * **내 멤버십이 바뀌었다 — 프로젝트를 다시 읽어라.** 역할 값은 안 온다 — 역할은 `getProject`의 응답 하나에서
   * 읽는다(위 `joined`의 머리말과 같은 까닭 · 서버 `ws/protocol.ts`의 그 갈래).
   */
  | { type: 'membership-changed'; projectId: string }
  /**
   * **메뉴 · 페이지 트리가 바뀌었다 — `rev` 판보다 낡은 트리는 다시 받아라**(서버 `ws/protocol.ts`의 그 갈래). 트리는 안 온다. 받는 자리는 메뉴
   * 트리 칸이다(`tree/use-tree-commands.tsx`의 `remoteRev`) — 셸이 본 가장 큰 번호를 넘긴다. 낸 탭도 받는다 — 제 쓰기의 판은 번호로 넘긴다.
   */
  | { type: 'menu-changed'; projectId: string; rev: number }
  /**
   * **그 페이지의 코멘트가 바뀌었다 — 열어 둔 목록은 다시 읽어라**(서버 `ws/protocol.ts`의 그 갈래). 본문은 안 온다. 받는 자리는 열린 코멘트
   * 목록이다(`realtime/comment-signals.ts` → `panels/comment-panel.tsx`).
   */
  | { type: 'comments-changed'; projectId: string; pageId: string }
  /**
   * **프로젝트의 테마 바인딩 · 토큰이 바뀌었다**(서버 `ws/protocol.ts`의 그 갈래). 받는 자리는 셸의 프로젝트 테마다(`theme/project-theme.tsx`
   * 의 `applyFrame` — 판이 같으면 토큰만 바꾸고, 다르면 다시 읽어 번들을 싣는다).
   */
  | {
      type: 'theme-changed'
      projectId: string
      themeId: string
      version: string
      tokens: Record<string, string | number>
      rev: number
    }
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
 * 클라이언트가 보내는 것 — 하트비트(`ping`) · 잠금(`lock` · `unlock`) · 편집 전송(`patch`).
 *
 * **서버의 `ClientFrame`(zod)의 거울이다.** 그쪽은 `http/patch-ops.ts`의 `OpsBody`를 넓혀
 * 만들고, 여기서는 같은 모양을 타입으로 적는다 — `test/realtime/protocol-parity.test.ts`가
 * 두 벌의 이름을 소스에서 맞대 본다.
 */
export type ClientFrame =
  | { type: 'ping' }
  | {
      /**
       * 이 연결의 잠금을 **이 노드 집합으로** 한다(「소프트 잠금」 — 고른 서브트리마다 하나). **같은 집합을 다시 보내는 것이
       * 하트비트다** — 갱신용 프레임이 따로 없다. 서버는 집합 전부를 판정하고(이미 쥔 것도) 빠지는 것은 놓는다.
       */
      type: 'lock'
      pageId: string
      nodeIds: string[]
      /**
       * **이 `lock`의 차례** — 거절(`lock-denied`)이 그대로 되돌려준다. `lock-channel.ts`가 보낼 때마다 올린다. 서버에서는
       * 선택이다(에이전트는 안 싣는다).
       */
      lockId: number
    }
  | {
      /** 잡고 있는 것을 전부 놓는다. **가리킬 값이 없다** — 이 연결의 집합 전부다. */
      type: 'unlock'
    }
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

/** 잠금 집합을 잡거나 갱신할 문자열(「소프트 잠금」). `lockId`는 거절과 짝지을 차례다. */
export function lockFrame(pageId: string, nodeIds: readonly string[], lockId: number): string {
  return JSON.stringify({ type: 'lock', pageId, nodeIds: [...nodeIds], lockId } satisfies ClientFrame)
}

/** 잡고 있는 것을 놓는다. 프레임마다 같은 값이라 미리 만들어 둔다. */
export const UNLOCK_FRAME = JSON.stringify({ type: 'unlock' } satisfies ClientFrame)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown): value is string {
  return typeof value === 'string'
}

function isLockView(value: unknown): value is NodeLockView {
  return isRecord(value) && str(value.pageId) && str(value.nodeId) && str(value.userId) && str(value.userName)
}

/**
 * 프레임 하나를 읽는다. **모양이 어긋나면 `null`이다.**
 *
 * 필드를 **하나하나 본다.** `as ServerFrame`로 넘기면 `seq`가 없는 `page-changed`가
 * `undefined`로 흘러 들어가 `headSeq`를 `undefined`로 만든다 — 그 어긋남은 조용하고,
 * 다음 편집이 400을 받을 때까지 아무도 모른다.
 *
 * **선언에 없는 필드는 옮기지 않고, 있다고 프레임을 버리지도 않는다.** 옛 서버는 `page-changed` · `restored` · `theme-changed` ·
 * `menu-changed`에 `actor`(낸 사람 · 토큰 이름)를 실었다 — 읽는 자리가 없어 이 파서도 안 옮긴다. 실려 와도 같은 프레임으로 읽는다.
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
    case 'locks':
      // **원소를 하나씩 본다 — `as`로 넘기지 않는다.** 배지는 `userName`을 그리고 차단은
      // `userId`를 보는데, 둘 중 하나가 없는 원소가 섞여 들어오면 화면이 `undefined`를
      // 그리거나 **아무의 것도 아닌 잠금**이 선다. `page-changed`가 필드를 하나씩 보는 것과
      // 같은 이유다.
      return str(value.projectId) && Array.isArray(value.locks)
        ? { type: 'locks', projectId: value.projectId, locks: value.locks.filter(isLockView) }
        : null
    case 'lock-denied':
      // **`lockId`가 없으면 버린다** — 짝지을 수 없는 거절은 어느 `lock`의 것인지 모른다(`lock-channel.ts` 「거절은 그 `lock` 프레임과 짝짓는다」).
      // 노드 목록도 원소를 하나씩 본다 — 문자열이 아닌 것이 섞이면 버린다(어느 노드를 뺄지 모른다).
      return str(value.projectId) &&
        str(value.pageId) &&
        Array.isArray(value.nodeIds) &&
        value.nodeIds.length > 0 &&
        value.nodeIds.every(str) &&
        typeof value.lockId === 'number'
        ? { type: 'lock-denied', projectId: value.projectId, pageId: value.pageId, nodeIds: value.nodeIds, lockId: value.lockId }
        : null
    case 'page-changed':
      return str(value.projectId) &&
        str(value.pageId) &&
        typeof value.seq === 'number' &&
        Array.isArray(value.ops) &&
        Array.isArray(value.warnings)
        ? {
            type: 'page-changed',
            projectId: value.projectId,
            pageId: value.pageId,
            seq: value.seq,
            ops: value.ops as PatchOp[],
            warnings: value.warnings as ValidationIssue[],
            // **없으면 키 자체를 안 만든다** — `undefined`를 담아 두면 스토어의 대조가
            // *"id 없는 pending"*과 우연히 맞을 여지가 생긴다.
            ...(str(value.clientOpId) ? { clientOpId: value.clientOpId } : {}),
          }
        : null
    case 'restored':
      return str(value.projectId) && str(value.snapshotId)
        ? {
            type: 'restored',
            projectId: value.projectId,
            snapshotId: value.snapshotId,
            // 없으면 키를 안 만든다 — `page-changed`의 `clientOpId`와 같다.
            ...(str(value.safetySnapshotId) ? { safetySnapshotId: value.safetySnapshotId } : {}),
            ...(str(value.clientRestoreId) ? { clientRestoreId: value.clientRestoreId } : {}),
          }
        : null
    case 'page-stale':
      // 모르는 필드는 안 옮긴다(서버가 나중에 더한 값이 이 갈래를 깨지 않는다) — 페이지 id 가 없으면 어느 페이지가 낡았는지 모른다.
      // `seq` 힌트는 음이 아닌 정수일 때만 옮긴다 — 어긋난 값이 프레임을 버리게 하지 않는다(힌트가 없는 신호로 읽는다 = 경보는 지금처럼 선다).
      return str(value.projectId) && str(value.pageId)
        ? {
            type: 'page-stale',
            projectId: value.projectId,
            pageId: value.pageId,
            ...(typeof value.seq === 'number' && Number.isInteger(value.seq) && value.seq >= 0 ? { seq: value.seq } : {}),
          }
        : null
    case 'membership-changed':
      return str(value.projectId) ? { type: 'membership-changed', projectId: value.projectId } : null
    case 'comments-changed':
      return str(value.projectId) && str(value.pageId)
        ? { type: 'comments-changed', projectId: value.projectId, pageId: value.pageId }
        : null
    case 'menu-changed':
      // 번호가 정수가 아니면 버린다 — 그 번호가 «이미 받은 판인가»를 가른다.
      return str(value.projectId) && typeof value.rev === 'number' && Number.isSafeInteger(value.rev)
        ? { type: 'menu-changed', projectId: value.projectId, rev: value.rev }
        : null
    case 'theme-changed':
      // 토큰 값은 하나씩 본다 — 글자 · 수 밖의 값이 CSS 변수로 흘러가지 않게.
      return str(value.projectId) &&
        str(value.themeId) &&
        str(value.version) &&
        typeof value.rev === 'number' &&
        isRecord(value.tokens) &&
        Object.values(value.tokens).every((token) => typeof token === 'string' || typeof token === 'number')
        ? {
            type: 'theme-changed',
            projectId: value.projectId,
            themeId: value.themeId,
            version: value.version,
            tokens: value.tokens as Record<string, string | number>,
            rev: value.rev,
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
 *
 * `knownUser`는 **이 탭이 아는 사용자**다(`api/known-user.tsx`). 브라우저 `WebSocket`은 머리를 못 달아 쿼리로
 * 싣고, 서버가 쿠키의 사람과 다르면 핸드셰이크를 거절한다. 모르면 쿼리 없이 연결한다.
 */
export function realtimeUrl(origin: string, projectId: string, knownUser?: string): string {
  const scheme = origin.startsWith('https:') ? 'wss:' : 'ws:'
  const query = knownUser === undefined ? '' : `?${KNOWN_USER_QUERY}=${encodeURIComponent(knownUser)}`
  return `${scheme}//${origin.replace(/^https?:\/\//, '')}/api/projects/${projectId}/ws${query}`
}
