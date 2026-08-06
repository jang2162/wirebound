import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app'
import { ApiProvider } from './api/context'
import { createHttpClient } from './api/http-client'
// 셸 CSS는 앱에서만 필요하다. 화면 테스트는 `App`을 직접 렌더하므로 이 파일을 지나지
// 않고, 그래서 vitest가 CSS를 처리할 일이 없다.
import './shell.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

// HTTP 구현을 고르는 자리는 여기 하나다. 아래 화면들은 `useApi()`로 인터페이스만 본다.
createRoot(root).render(
  <StrictMode>
    <ApiProvider client={createHttpClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApiProvider>
  </StrictMode>,
)
