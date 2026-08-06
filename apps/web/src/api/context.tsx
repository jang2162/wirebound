/**
 * 화면이 `ApiClient`를 찾는 자리. 컴포넌트마다 클라이언트를 prop으로 내려보내면
 * 트리 중간의 모든 컴포넌트가 자기와 상관없는 인자를 나르게 되므로 컨텍스트로 둔다.
 *
 * 앱에서는 `main.tsx`가 HTTP 구현을 넣고, 테스트에서는 각 테스트가 가짜를 넣는다.
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import type { ApiClient } from './client'

/**
 * 기본값이 `null`인 것은 의도다. "아무것도 안 하는 클라이언트"를 기본값으로 두면
 * Provider를 빠뜨린 트리가 조용히 돌다가 엉뚱한 곳에서 실패한다.
 */
const ApiContext = createContext<ApiClient | null>(null)

export function ApiProvider(props: { client: ApiClient; children: ReactNode }): ReactElement {
  return <ApiContext.Provider value={props.client}>{props.children}</ApiContext.Provider>
}

/**
 * 컨텍스트의 `ApiClient`. **Provider 밖에서 부르면 던진다** — `as`로 좁혀서 넘기면
 * 첫 호출 지점에서 `undefined.login`이 되고, 그때는 Provider를 빠뜨렸다는 사실이
 * 스택에 남지 않는다.
 */
export function useApi(): ApiClient {
  const client = useContext(ApiContext)
  if (client === null) throw new Error('useApi는 ApiProvider 안에서만 부를 수 있습니다')
  return client
}
