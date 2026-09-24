/**
 * **이 탭이 아는 사용자** — 요청마다 서버에 싣는 «이 탭이 누구의 화면인가».
 *
 * 쿠키는 브라우저에 하나라 다른 탭이 다른 사람으로 로그인하면 이 탭의 쿠키도 바뀐다. 탭은 그것을 탭 사이 알림으로 알지만
 * (`session/session-context.tsx`의 «탭 사이»), 알림이 늦거나 안 오면 그 사이의 요청이 **새 사람의 이름으로** 나간다
 * (값은 `apps/api/src/auth/plugin.ts`의 머리말 «요청한 탭이 아는 사용자»). 그래서 요청이 탭의 사람을 싣고, 서버가 쿠키의
 * 사람과 다르면 409 + 이슈 코드 `session-user-changed`로 거절한다.
 *
 * | 자리 | 무엇 |
 * |---|---|
 * | 쓰는 자리 — `SessionProvider` | 세션의 사람이 바뀌어 커밋될 때 `set`(레이아웃 이펙트 — 자식의 조회 이펙트보다 먼저 선다) |
 * | 싣는 자리 — `api/http-client.ts` · `realtime/use-realtime.ts` | REST 는 머리(`KNOWN_USER_HEADER`), WS 핸드셰이크는 쿼리(`KNOWN_USER_QUERY`) |
 * | 알아채는 자리 — `api/http-client.ts` 하나 | 응답이 `session-user-changed`면 `changed()` — 어느 화면의 요청이든 한 자리에서 |
 * | 받는 자리 — `SessionProvider` | `me`로 쿠키의 사람을 다시 알아낸다 — 다른 사람이면 그 사람이 된다(탭 사이 알림의 «다른 사람» 줄과 같다) |
 *
 * **없으면 싣지 않는다** — 아직 누구인지 모르거나(마운트의 `me` 전) 로그인 전이다. 서버도 실린 것이 없는 요청은 대조 없이 받는다.
 * 화면 테스트는 이 holder 를 안 세운다(`null` — 아무것도 안 싣고 안 듣는다).
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { ApiError } from './client'

/** 머리 이름 — `apps/api/src/auth/plugin.ts`의 `KNOWN_USER_HEADER`와 같아야 한다. */
export const KNOWN_USER_HEADER = 'x-wb-known-user'
/** WS 핸드셰이크의 쿼리 키 — 같은 파일의 `KNOWN_USER_QUERY`와 같아야 한다(브라우저 `WebSocket`은 머리를 못 단다). */
export const KNOWN_USER_QUERY = 'knownUser'
/** 서버가 «쿠키의 사람이 이 탭이 아는 사람과 다르다»로 거절할 때의 이슈 코드. **이 코드로만** 가른다 — 문장으로 가르지 않는다. */
export const SESSION_USER_CHANGED = 'session-user-changed'

/** 그 실패가 «쿠키의 사람이 바뀌었다»인가. */
export function isSessionUserChanged(caught: unknown): boolean {
  return (
    caught instanceof ApiError &&
    caught.code === 'conflict' &&
    caught.issues.some((issue) => issue.code === SESSION_USER_CHANGED)
  )
}

export interface KnownUserHolder {
  /** 이 탭이 아는 사용자 id. 모르면 `undefined` — 그때는 싣지 않는다. */
  get(): string | undefined
  set(id: string | undefined): void
  /** 서버가 «쿠키의 사람이 다르다»고 답했다 — 듣는 자리를 부른다. */
  changed(): void
  /** 그 답을 들을 것을 단다. 돌려주는 함수가 뗀다. */
  onChanged(listener: () => void): () => void
}

export function createKnownUserHolder(): KnownUserHolder {
  let current: string | undefined
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (id) => {
      current = id
    },
    changed: () => {
      for (const listener of [...listeners]) listener()
    },
    onChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const KnownUserContext = createContext<KnownUserHolder | null>(null)

/** holder 를 세운다 — **여는 자리는 `main.tsx` 하나다**(HTTP 클라이언트와 같은 것을 준다). */
export function KnownUserProvider(props: { holder: KnownUserHolder; children: ReactNode }): ReactElement {
  return <KnownUserContext.Provider value={props.holder}>{props.children}</KnownUserContext.Provider>
}

/** holder. **없으면 `null`이고 던지지 않는다** — 화면 테스트는 세우지 않는다(실시간 쪽의 관례와 같다). */
export function useKnownUserHolder(): KnownUserHolder | null {
  return useContext(KnownUserContext)
}
