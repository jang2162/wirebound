/**
 * **탭 사이의 세션 소식** — 이 탭에서 로그인했다 · 로그아웃했다를 같은 브라우저의 다른 탭에 알린다.
 *
 * ## 왜 필요한가 — 쿠키는 탭끼리 하나인데, 세션을 아는 것은 탭마다다
 *
 * 세션 쿠키는 브라우저에 하나라 다른 탭의 로그인·로그아웃이 **이 탭의 쿠키도 바꾼다.** 그런데 «지금 누구인가»
 * (`session-context.tsx`의 상태 · 사용자 · 세대)는 탭마다 메모리에 든다. 둘이 갈리면:
 *
 * - **Y** — 다른 탭이 로그아웃하고 **다른 사람**(밥)으로 들어오면, 머리에 «alice»가 선 이 탭의 쓰기가 **밥의
 *   쿠키로** 나간다. «다시 확인»의 같은 키 재전송이 201 → 같은 글이 alice · bob **두 행**(Chrome 실측).
 * - **Z** — 다른 탭이 **같은 사람으로 다시** 들어오면(옛 세션은 산다) 이 탭의 HTTP 는 새 세션, WS 는 옛 세션이다.
 *   서버의 방송은 요청과 같은 세션의 연결만 빼므로 **자기 방송을 되받는다**(복원이면 본인
 *   화면에 복원 배너).
 *
 * 무엇을 알면 무엇을 하는지는 `session-context.tsx`의 «탭 사이»가 소유한다. 여기는 **통로**다.
 *
 * ## 수단 — `BroadcastChannel`
 *
 * | 후보 | 고르지 않은 까닭 |
 * |---|---|
 * | `storage` 이벤트(`localStorage`) | 소식을 **저장소에 남겨야** 온다 — 같은 값이면 안 오므로 매번 바뀌는 값을 써야 하고, 그 값이 문서보다 오래 산다. `routes/require-auth.tsx`가 «로그인 결과를 `localStorage`에 적지 않는다»를 이미 적었다. 비공개 창·사이트 데이터 차단에서는 접근 자체가 던진다(`shell/sidebar-layout.ts`) |
 * | 서버 경유(WS 로 «쿠키가 바뀌었다») | 탭마다 다른 WS 가 붙어 있고 **에디터 밖에서는 WS 가 없다**(목록 · 로그인 화면). 알 길이 에디터 안에만 생긴다 |
 * | **`BroadcastChannel`** | 같은 오리진의 탭끼리 메시지 하나를 흘린다 — 남는 것이 없고, **보낸 탭에는 안 온다**(자기 소식에 반응하는 순환이 없다) |
 *
 * **없으면 조용히 안 알린다**(오래된 브라우저 · 테스트) — 그때 탭끼리는 서로의 로그인 · 로그아웃을 모른다(위 Y · Z 가
 * 열린 채다). 실시간의 `RealtimeProvider`와
 * 같은 관례다(`realtime/context.tsx`): 켜는 자리는 `main.tsx` 하나이고, 화면 테스트는 필요한 것만 가짜를 끼운다.
 * **테스트가 진짜 채널을 기본으로 쓰면 안 된다** — Node 의 `BroadcastChannel`은 **같은 프로세스의 워커 사이에도**
 * 흐르므로, 병렬로 도는 다른 테스트 파일의 로그인이 이 파일의 세션을 바꾼다.
 *
 * ## 받은 것은 믿지 않고 읽는다
 *
 * 같은 오리진의 스크립트만 보낼 수 있지만, **배포가 바뀌는 창**에는 옛 판의 탭과 새 판의 탭이 함께 산다. 모양이 안
 * 맞는 소식은 버린다(`readNews`) — 모르는 소식에 세션을 바꾸는 것보다 모르는 채 두는 것이 낫다(다음 요청의 401 이
 * 여전히 잡는다).
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import type { SessionUser } from '../api/types'

/**
 * 다른 탭에 알리는 것. **이 탭에서 일어난 일**만 알린다 — 무엇을 내는지는 `session-context.tsx`의 «탭 사이».
 *
 * `signed-out`의 `era`는 초안 사본의 **로그아웃 세대**다(`panels/draft-store.tsx`의 «표지는 세대 번호다»). 로그아웃한
 * 탭만 번호를 짓고 듣는 탭은 그 번호로 `max`만 한다. **없을 수 있다** — 옛 판 탭의 소식이거나, 사본을 세우지 않은
 * 앱(테스트)이다.
 */
export type SessionNews =
  | { readonly kind: 'signed-in'; readonly user: SessionUser }
  | { readonly kind: 'signed-out'; readonly era?: number }

export interface TabChannel {
  /** 다른 탭들에 알린다. **보낸 탭에는 안 온다.** */
  post(news: SessionNews): void
  /** 다른 탭의 소식을 받는다. 돌려주는 함수가 그만 받는다. */
  listen(receive: (news: SessionNews) => void): () => void
}

/** 채널 이름. 같은 오리진의 이 앱 탭끼리만 쓴다. */
export const TAB_CHANNEL_NAME = 'wirebound-session'

/** 받은 값이 소식의 모양이면 그 소식, 아니면 `null`(위 머리말 «받은 것은 믿지 않고 읽는다»). */
export function readNews(data: unknown): SessionNews | null {
  if (typeof data !== 'object' || data === null) return null
  const kind = (data as { kind?: unknown }).kind
  if (kind === 'signed-out') {
    // **번호가 없으면 옛 판의 소식이다 — 받는다**(로그아웃은 로그아웃이다). **있는데 세대의 모양(0 이상의 정수)이
    // 아니면 버린다** — 모르는 번호로 표지를 올리면 그 브라우저의 초안이 전부 «로그아웃보다 앞선 것»이 된다.
    if (!('era' in data)) return { kind }
    const era = (data as { era?: unknown }).era
    return Number.isSafeInteger(era) && (era as number) >= 0 ? { kind, era: era as number } : null
  }
  if (kind !== 'signed-in') return null
  const user = (data as { user?: unknown }).user
  if (typeof user !== 'object' || user === null) return null
  const { id, email, name, isInstanceAdmin } = user as Record<string, unknown>
  if (typeof id !== 'string' || typeof email !== 'string' || typeof name !== 'string') return null
  // 관리자 표시도 옮긴다 — 빠지면 다른 탭의 로그인으로 들어온 탭이 목록 머리의 «테마 관리» 를 안 세운다. 불리언이 아니면 안 싣는다.
  return { kind, user: { id, email, name, ...(typeof isInstanceAdmin === 'boolean' ? { isInstanceAdmin } : {}) } }
}

/**
 * 브라우저의 `BroadcastChannel`로 통로를 연다. **없으면 `null`**(위 머리말). 문서가 사는 동안 하나를 쓴다 —
 * `main.tsx`가 모듈에서 한 번 부르고 닫지 않는다(`close`는 통로를 재는 테스트가 쓴다).
 */
export function openTabChannel(name: string = TAB_CHANNEL_NAME): (TabChannel & { close(): void }) | null {
  if (typeof globalThis.BroadcastChannel !== 'function') return null
  const channel = new globalThis.BroadcastChannel(name)
  return {
    close: () => channel.close(),
    post: (news) => channel.postMessage(news),
    listen: (receive) => {
      const onMessage = (event: MessageEvent): void => {
        const news = readNews(event.data)
        if (news !== null) receive(news)
      }
      channel.addEventListener('message', onMessage)
      return () => channel.removeEventListener('message', onMessage)
    },
  }
}

const TabChannelContext = createContext<TabChannel | null>(null)

export function TabChannelProvider(props: { channel: TabChannel | null; children: ReactNode }): ReactElement {
  return <TabChannelContext.Provider value={props.channel}>{props.children}</TabChannelContext.Provider>
}

/** 통로. **Provider 가 없으면 `null`이고 던지지 않는다**(위 머리말 — 없으면 다른 탭에 알리지도 받지도 않는다). */
export function useTabChannel(): TabChannel | null {
  return useContext(TabChannelContext)
}
