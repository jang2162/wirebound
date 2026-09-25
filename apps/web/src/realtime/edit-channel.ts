/**
 * 편집을 WebSocket으로 내고 ack를 기다리는 자리(설계서 「정방향 흐름」의 *"[본인] ack(seq) 수신"*).
 * **React도 DOM도 `fetch`도 import하지 않는다** — `connection.ts`와 같은 이유다.
 *
 * # 왜 요청 하나가 프로미스 하나인가
 *
 * REST에서는 응답이 요청과 **짝지어져** 온다. WebSocket에서는 프레임이 그냥 올 뿐이라
 * 짝짓는 것을 누군가 해야 하고, 그것을 부르는 쪽마다 하면 *"어느 ack가 내 것인가"*가 자리
 * 수만큼 생긴다. 여기서 한 번 짝지어 `Promise`로 바꾸면 **`edit/use-edit-commit.tsx`의 펌프
 * 루프가 그대로 남는다** — 그 루프가 지키는 규칙(*"in-flight는 항상 하나"*)도 함께 남는다.
 *
 * **in-flight 하나를 WS에서도 그대로 둔다.** 서버는 `baseSeq`가 `head_seq`와 **정확히
 * 같을 때만** 받으므로(파이프라인 3단계 — 접속 방식과 무관하다) 같은 `baseSeq`로 둘을
 * 내보내면 **두 번째는 반드시 실패한다.** 즉 프레임을 겹쳐 보낼 수 있다는 것이 겹쳐 보내도
 * 된다는 뜻이 아니다.
 *
 * # 실패의 모양을 REST와 같게 둔다
 *
 * `patch-error` 프레임은 REST 에러 봉투와 같은 값을 싣는다(`ws/patch.ts`). 여기서 그것을
 * `ApiError`로 되세워 reject하면 **실패 → 화면 규칙이 하나로 남는다**(`api/failure.tsx`의
 * `toFailure`). 접속 방식에 따라 사용자가 보는 문장이 갈리지 않는다.
 *
 * **연결이 끊겨 실패한 것은 `ApiError`가 아니다.** 서버가 아무 판정도 하지 않은 실패라 되세울 봉투가 없다. 둘로 갈린다 —
 * 프레임이 **나가지 못했으면** `EditNotSentError`(서버에 안 닿았다), 나간 뒤 답을 기다리다 연결을 잃었으면
 * `UnansweredEditError`(닿았을 수 있다 — 결과를 모른다). REST 의 연결 실패도 «모른다»이므로(`api/failure.tsx`의
 * `refusedBeforeCommit`) 두 경로가 같은 말을 한다(`edit/use-edit-commit.tsx`의 `unknownNotice`).
 */
import type { PatchOp, ValidationIssue } from '@wirebound/schema'
import { ApiError, type ApiErrorCode } from '../api/client'
import type { RealtimeLink } from './connection'
import { patchFrame, type ServerFrame } from './protocol'

/** 스토어의 `nextRequest()`가 낸 것에 어느 페이지인지를 더한 것. */
export interface EditSend {
  pageId: string
  clientOpId: string
  ops: PatchOp[]
  baseSeq: number
}

/**
 * ack가 되돌려 주는 것. **`store.ackEdit`이 요구하는 모양이다** — `api/types.ts`의
 * `PatchResult`와 겹치지만 `schemaVersion`이 없다. 그 값을 읽는 자리가 없어 프레임에
 * 싣지 않았고, 그래서 이 타입도 그것을 약속하지 않는다.
 */
export interface EditAck {
  seq: number
  revisionId: string
  inverse: PatchOp[]
  warnings: ValidationIssue[]
}

export interface EditChannel {
  /**
   * 지금 WS로 보낼 수 있는가. **`false`면 부르는 쪽이 REST로 간다**(두 경로가 남는다).
   */
  ready(): boolean
  /** 편집 하나를 내고 ack를 기다린다. 실패는 reject다. */
  send(request: EditSend): Promise<EditAck>
  /**
   * 받은 프레임을 in-flight에 넘긴다. **그 프레임을 여기서 쓴 경우에만 `true`**다.
   *
   * **그 반환을 읽는 프로덕션 호출자는 없다**(`use-realtime.ts`가 버린다 — 모르는 ack에
   * 화면이 할 일이 없다). 읽는 것은 케이스뿐이고, 그것이 *"모르는 `clientOpId`는 아무것도
   * 끝내지 않는다"*를 재는 유일한 수단이다. **`void`로 바꾸면 그 축이 관측 불가능해진다.**
   */
  deliver(frame: ServerFrame): boolean
  /** 연결 하나를 붙인다. 앞의 것이 있으면 그것에 매달린 편집은 실패로 끝난다. */
  attach(link: RealtimeLink): void
  /** 연결을 뗀다. 기다리던 편집은 전부 실패한다. */
  detach(): void
  /**
   * 연결이 끊겼다 — **기다리던 편집을 지금 실패시킨다.** 안 하면 그 프로미스는 영영 안
   * 끝나고, 펌프 루프가 거기 매달려 **다음 편집도 안 나간다**(in-flight 하나를 지키는 `#pumping`이 계속 서
   * 있다). 화면에 증상 없이 조용히 멈추는 부류다.
   *
   * **«답을 못 받았다»로 끝낸다**(`UnansweredEditError`의 `'lost'`) — 기다리던 편집은 열린 연결로 나갔으므로 서버에
   * 닿았을 수 있다. 소켓 리셋이면 서버는 그것을 커밋하고, 다시 붙은 연결이 그 결과를 화면에 세운다(Chrome — 행 잠금으로
   * 편집을 서버에 붙잡은 채 WS 소켓만 RST 로 끊었다: 끊김으로 끝내던 판은 «편집 1개가 취소됐습니다» 인데 DB · 화면 둘 다
   * 고친 값).
   */
  failInFlight(): void
  /**
   * **이 탭이 스스로 연결을 버린다 — 기다리던 편집을 «답을 못 받았다»로 끝낸다**(`UnansweredEditError`의 `'renewed'`).
   * 스스로 버린 연결은 **열려 있었으므로** 기다리던 편집이 서버에 닿았다 — 결과만 모른다. 끊김(`failInFlight`)과 까닭만
   * 다르고 판정은 같다 — 화면이 말하는 까닭이 갈린다. 부르는 곳은 쿠키가 바뀌어 다시 붙는 자리 하나다
   * (`use-realtime.ts`의 «쿠키가 바뀌면»).
   */
  abandonInFlight(): void
}

/**
 * 프레임이 **나가지 못해** 끝난 편집 — 연결이 없거나 이미 닫혀 있었다. 서버에 안 닿았으므로 결과를 안다: 안 됐다.
 * **`ApiError`가 아니다**(머리말).
 */
export class EditNotSentError extends Error {
  constructor() {
    super('실시간 연결이 끊겨 편집을 보내지 못했습니다')
    this.name = 'EditNotSentError'
  }
}

/**
 * 답을 못 받은 편집이 왜 답을 못 받았나 — 화면이 말하는 까닭이다.
 *
 * | 값 | 언제 |
 * |---|---|
 * | `'lost'` | 연결이 끊겼다(오프라인 · 소켓 리셋 · 서버 재기동) · 새 연결로 갈아 끼웠다 · 채널을 뗐다 |
 * | `'renewed'` | 쿠키가 바뀌어 이 탭이 스스로 연결을 버리고 다시 붙었다(`abandonInFlight`) |
 */
export type UnansweredCause = 'lost' | 'renewed'

/**
 * 나간 뒤 답을 기다리던 편집이 연결과 함께 끝났다. **`ApiError`가 아니고 «안 됐다»도 아니다** — 서버에 닿았을 수 있는데
 * 결과를 모른다. 편집 경로가 이것을 보고 «취소됐다» 대신 «반영됐는지 모른다»를 말한다(`edit/use-edit-commit.tsx`의
 * `unknownNotice`).
 */
export class UnansweredEditError extends Error {
  readonly why: UnansweredCause
  constructor(why: UnansweredCause) {
    super(
      why === 'renewed'
        ? '연결을 다시 붙이느라 보낸 편집의 답을 받지 못했습니다'
        : '실시간 연결이 끊겨 보낸 편집의 답을 받지 못했습니다',
    )
    this.name = 'UnansweredEditError'
    this.why = why
  }
}

interface Waiting {
  resolve: (ack: EditAck) => void
  reject: (error: unknown) => void
}

export function createEditChannel(): EditChannel {
  let link: RealtimeLink | null = null
  /**
   * 답을 기다리는 편집. **`clientOpId`가 키다.** in-flight는 하나뿐이지만 `Map`인 것은 늦게 도착한
   * ack가 **엉뚱한 편집을 성공으로 만들지 않게** 하기 위해서다 — 슬롯 하나로 두면 "지금
   * 기다리는 것"과 "그 ack가 가리키는 것"이 같은지 다시 볼 수 없다.
   */
  const waiting = new Map<string, Waiting>()

  const failAll = (why: UnansweredCause): void => {
    // **사본을 순회하고 먼저 비운다.** reject가 부르는 쪽의 `catch`를 태우고, 그쪽이 다시
    // 이 채널을 건드릴 수 있다.
    const pending = [...waiting.values()]
    waiting.clear()
    for (const one of pending) one.reject(new UnansweredEditError(why))
  }

  return {
    ready: () => link !== null && link.isOpen(),

    send: (request) =>
      new Promise<EditAck>((resolve, reject) => {
        const live = link
        if (live === null || !live.send(patchFrame(request))) {
          reject(new EditNotSentError())
          return
        }
        waiting.set(request.clientOpId, { resolve, reject })
      }),

    deliver: (frame) => {
      if (frame.type !== 'patch-ack' && frame.type !== 'patch-error') return false
      const one = waiting.get(frame.clientOpId)
      // **모르는 `clientOpId`는 버린다.** 이미 실패로 끝낸 편집의 ack가 뒤늦게 올 수 있고,
      // 그것을 지금 큐의 머리에 적용하면 보내지도 않은 편집이 성공으로 처리된다.
      if (one === undefined) return false
      waiting.delete(frame.clientOpId)

      if (frame.type === 'patch-ack') {
        one.resolve({
          seq: frame.seq,
          revisionId: frame.revisionId,
          inverse: frame.inverse,
          warnings: frame.warnings,
        })
      } else {
        // `code`는 서버가 보낸 문자열이다. `ApiErrorCode` 밖의 값이 오면 화면은 `message`로
        // 떨어지므로(그 유니온을 코드로 가르는 것은 `unauthenticated` 하나다 —
        // `api/failure.tsx`) 여기서 다시 검사하지 않는다.
        //
        // **프레임은 늘 api 의 봉투다**(`enveloped`) — 앞단이 WS 프레임을 지어낼 자리가 없다. 그래서 500 은 REST 의 봉투 500 처럼
        // «커밋 전»이고, DB 가 답하지 않은 판은 api 가 503 으로 따로 낸다(`refusedBeforeCommit`이 그 둘을 숫자로 가른다).
        one.reject(new ApiError(frame.status, frame.code as ApiErrorCode, frame.message, frame.issues, true))
      }
      return true
    },

    attach: (next) => {
      failAll('lost')
      link = next
    },

    detach: () => {
      failAll('lost')
      link = null
    },

    failInFlight: () => failAll('lost'),

    abandonInFlight: () => failAll('renewed'),
  }
}
