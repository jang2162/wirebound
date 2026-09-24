import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app'
import { ApiProvider } from './api/context'
import { createHttpClient } from './api/http-client'
import { KnownUserProvider, createKnownUserHolder } from './api/known-user'
import { RealtimeProvider, createConnectionIdHolder } from './realtime/context'
import { createEditChannel } from './realtime/edit-channel'
import { createLockChannel } from './realtime/lock-channel'
import { DraftStoreProvider, openDraftStore } from './panels/draft-store'
import { TabChannelProvider, openTabChannel } from './session/tab-channel'
// 셸 CSS는 앱에서만 필요하다. 화면 테스트는 `App`을 직접 렌더하므로 이 파일을 지나지
// 않고, 그래서 vitest가 CSS를 처리할 일이 없다.
import './shell.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

/**
 * 실시간 연결의 id를 드는 곳. **HTTP 클라이언트와 소켓이 같은 것을 봐야 한다** —
 * 소켓이 `joined`에서 받은 id를 편집 요청이 헤더로 실어야 자기 편집을 되받지 않는다
 * (`realtime/context.tsx`의 머리말).
 */
const connectionIds = createConnectionIdHolder()

/**
 * 편집이 WS로 나가는 통로. **소켓이 붙이고 편집 경로가 쓴다** — 홀더와 같은 이유로
 * 여기 하나를 만들어 양쪽에 준다. **없으면 편집은 REST로 나가고**, 화면 테스트가 바로 그
 * 판이다(`RealtimeProvider`를 안 세운다).
 */
const editChannel = createEditChannel()
/** 잠금을 잡고 놓는 통로(설계서 「소프트 잠금」). 편집 채널과 갈라 둔 이유는 `realtime/lock-channel.ts`에 있다. */
const lockChannel = createLockChannel()

/**
 * 탭 사이의 세션 소식 통로(`session/tab-channel.tsx`). **켜는 자리는 여기 하나다** — 화면 테스트는
 * 세우지 않거나 가짜를 끼운다. 브라우저에 `BroadcastChannel`이 없으면 `null`이고 그때는 알리지도 받지도 않는다.
 */
const tabChannel = openTabChannel()

/**
 * 초안의 사본(`panels/draft-store.tsx`). **여는 자리는 여기 하나다** — 화면 테스트는 세우지 않거나 가짜를
 * 끼운다. 저장소를 **꺼내는 것 자체가 던질 수 있어**(비공개 창 · 사이트 데이터 차단) 값이 아니라 함수로 넘긴다.
 */
const draftStore = openDraftStore(
  () => globalThis.sessionStorage,
  () => globalThis.localStorage,
)

/**
 * **이 탭이 아는 사용자**(`api/known-user.tsx`). 세션이 쓰고(`SessionProvider`) HTTP 클라이언트 · 실시간 연결이
 * 싣는다 — 연결 id 홀더와 같은 까닭으로 여기 하나를 만들어 양쪽에 준다.
 */
const knownUser = createKnownUserHolder()

// HTTP 구현을 고르는 자리는 여기 하나다. 아래 화면들은 `useApi()`로 인터페이스만 본다.
// **실시간을 켜는 자리도 여기 하나다** — 화면 테스트는 `RealtimeProvider` 없이 트리를
// 세우므로 소켓을 열지 않는다.
createRoot(root).render(
  <StrictMode>
    <ApiProvider client={createHttpClient(globalThis.fetch, connectionIds.get, knownUser)}>
      <KnownUserProvider holder={knownUser}>
        <RealtimeProvider setup={{ holder: connectionIds, channel: editChannel, lockChannel }}>
          <TabChannelProvider channel={tabChannel}>
            <DraftStoreProvider store={draftStore}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </DraftStoreProvider>
          </TabChannelProvider>
        </RealtimeProvider>
      </KnownUserProvider>
    </ApiProvider>
  </StrictMode>,
)
