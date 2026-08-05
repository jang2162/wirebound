/**
 * 라우트 표(설계 D6). 라우터 자체는 여기서 만들지 않는다 — 앱은 `main.tsx`가
 * `BrowserRouter`를, 테스트는 메모리 라우터를 씌운다. 그래야 테스트가 주소를 정하고
 * 읽을 수 있다.
 */
import type { ReactElement } from 'react'
import { Outlet, Route, Routes, useParams } from 'react-router'
import { LoginRoute } from './routes/login'
import { ProjectListRoute } from './routes/project-list'
import { RedirectWhenAuthenticated, RequireAuth } from './routes/require-auth'

/** 태스크 6·7이 메뉴 트리와 캔버스로 채운다. */
function EditorShellPlaceholder(): ReactElement {
  const params = useParams()
  return (
    <main>
      <h1>에디터</h1>
      <p>프로젝트 {params.projectId}</p>
      {params.pageId !== undefined && <p>페이지 {params.pageId}</p>}
    </main>
  )
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectWhenAuthenticated>
            <LoginRoute />
          </RedirectWhenAuthenticated>
        }
      />
      {/* 인증이 필요한 라우트를 하나의 부모 아래 모은다. 문지기가 라우트마다 따로
          걸려 있으면 새 화면을 추가할 때 빠뜨릴 수 있고, 형제 라우트 사이를 오갈 때마다
          세션을 다시 확인하게 된다. */}
      <Route
        element={
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        }
      >
        <Route path="/" element={<ProjectListRoute />} />
        <Route path="/projects/:projectId" element={<EditorShellPlaceholder />} />
        <Route path="/projects/:projectId/pages/:pageId" element={<EditorShellPlaceholder />} />
      </Route>
    </Routes>
  )
}
