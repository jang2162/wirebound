import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app'
import { ApiProvider } from './api/context'
import { createHttpClient } from './api/http-client'

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
