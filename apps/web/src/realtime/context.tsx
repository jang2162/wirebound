/**
 * 실시간 연결을 **켜는 자리**. `api/context.tsx`가 `ApiClient`에 대해 하는 것과 같은 배치다.
 *
 * # 왜 Provider가 없으면 안 붙나 — 기본값이 `null`인 것이 계약이다
 *
 * `useApi`는 Provider 밖에서 **던진다**. 이쪽은 다르다: **없으면 조용히 안 붙는다.**
 * 갈리는 이유는 무엇이 없는가에 있다 — `ApiClient`가 없으면 화면이 아무것도 못 하지만,
 * 실시간 연결이 없으면 화면은 **실시간 없이** 그대로 동작한다(새로고침해야 남의 변경이 보인다).
 *
 * 실무적으로도 그래야 한다. 화면 테스트는 jsdom에서 도는데 거기에도 `WebSocket`이 있어서,
 * 이 훅이 조건 없이 붙으면 **에디터를 렌더하는 모든 테스트가** `ws://localhost/...`로 붙으려
 * 시도하고 실패하고 재연결 타이머를 남긴다. 켜는 것을 명시로 두면 그 일이 없다.
 *
 * # 연결 id를 왜 여기서 드는가
 *
 * 설계서 「정방향 흐름」은 *"[본인] ack / [타인] ops"*로 갈라 두었다. 편집이 REST로 나가면
 * 서버는 그 요청이 어느 WS 연결의 주인이 낸 것인지 알 수 없고, 그래서 요청 헤더로 알린다
 * (`x-wb-connection-id`). 그 값은 **소켓이 알고 HTTP 클라이언트가 써야 하므로** 둘 다
 * 가리킬 수 있는 자리가 필요하다.
 *
 * **모듈 전역이 아니라 객체 하나다.** 전역으로 두면 한 프로세스에서 트리를 여럿 세우는
 * 테스트가 서로의 값을 덮는다.
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import type { RealtimeOptions } from './connection'
import type { EditChannel } from './edit-channel'
import type { LockChannel } from './lock-channel'

/** 지금 붙어 있는 연결의 id를 드는 곳. `main.tsx`가 하나 만들어 양쪽에 준다. */
export interface ConnectionIdHolder {
  get(): string | undefined
  set(id: string | undefined): void
}

export function createConnectionIdHolder(): ConnectionIdHolder {
  let current: string | undefined
  return {
    get: () => current,
    set: (id) => {
      current = id
    },
  }
}

export interface RealtimeSetup {
  holder: ConnectionIdHolder
  /**
   * 편집을 WS로 내는 통로. **없으면 편집은 REST로 나간다** — 그 경로는 남아 있고(설계서
   * 「LLM 편집 경로」의 MCP), `RealtimeProvider` 없이 도는 화면 테스트도 그쪽을 지난다.
   *
   * **소켓이 만들고 편집 경로가 쓰므로 둘 다 가리킬 수 있는 자리가 필요하다** — `holder`를
   * 여기 둔 것과 같은 이유이고, 모듈 전역이 아닌 것도 같은 이유다(한 프로세스에서 트리를
   * 여럿 세우는 테스트가 서로의 것을 덮는다).
   */
  channel?: EditChannel
  /**
   * 잠금을 잡고 놓는 통로(설계서 「소프트 잠금」). **없으면 잠금을 안 잡는다** — `RealtimeProvider`
   * 없이 도는 화면 테스트가 그 판이고, 그때 화면은 잠금 없이 동작한다.
   *
   * **편집 채널과 갈라 둔 이유는 `lock-channel.ts`의 머리말에 있다** — 끊겼을 때 할 일이
   * 정반대다.
   */
  lockChannel?: LockChannel
  /** WebSocket 주소를 만들 오리진. 기본은 브라우저의 것이다. */
  origin?: string
  /** `openRealtime`에 그대로 넘어간다. 테스트가 가짜 소켓·가짜 타이머를 끼운다. */
  connection?: Pick<RealtimeOptions, 'createSocket' | 'schedule' | 'cancel' | 'heartbeatMs' | 'reconnectDelaysMs'>
}

const RealtimeContext = createContext<RealtimeSetup | null>(null)

export function RealtimeProvider(props: { setup: RealtimeSetup; children: ReactNode }): ReactElement {
  return <RealtimeContext.Provider value={props.setup}>{props.children}</RealtimeContext.Provider>
}

/** Provider가 없으면 `null`이다 — **던지지 않는다**(위 머리말). */
export function useRealtimeSetup(): RealtimeSetup | null {
  return useContext(RealtimeContext)
}

/**
 * 편집을 WS로 낼 통로. **없으면 `null`이고 그때 편집은 REST로 나간다.**
 *
 * 같은 이유로 던지지 않는다 — 통로가 없다고 화면이 편집을 못 하게 되면 안 된다.
 */
export function useEditChannel(): EditChannel | null {
  return useContext(RealtimeContext)?.channel ?? null
}

/**
 * 잠금을 잡을 통로. **없으면 `null`이고 그때 화면은 잠금을 안 잡는다.**
 *
 * `useEditChannel`과 같은 이유로 던지지 않는다 — 통로가 없다고 화면이 멈추면 안 된다.
 */
export function useLockChannel(): LockChannel | null {
  return useContext(RealtimeContext)?.lockChannel ?? null
}
