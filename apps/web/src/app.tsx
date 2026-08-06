/**
 * 라우트 표(설계 D6). 라우터 자체는 여기서 만들지 않는다 — 앱은 `main.tsx`가
 * `BrowserRouter`를, 테스트는 메모리 라우터를 씌운다. 그래야 테스트가 주소를 정하고
 * 읽을 수 있다.
 */
import type { ReactElement } from 'react'
import { Outlet, Route, Routes } from 'react-router'
import { EditorShellRoute } from './routes/editor'
import { LoginRoute } from './routes/login'
import { ProjectListRoute } from './routes/project-list'
import { RedirectWhenAuthenticated, RequireAuth } from './routes/require-auth'

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
        {/* 두 주소가 같은 셸이다. 페이지를 연 것은 셸 안의 캔버스가 달라지는 일이지
            다른 화면이 아니므로, 라우터가 컴포넌트를 다시 마운트하지 않고 편집 상태가
            그대로 이어진다. */}
        <Route path="/projects/:projectId" element={<EditorShellRoute />} />
        <Route path="/projects/:projectId/pages/:pageId" element={<EditorShellRoute />} />
      </Route>
    </Routes>
  )
}
