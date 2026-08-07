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
import { SessionProvider } from './session/session-context'

export function App(): ReactElement {
  return (
    // 라우트 표 **바깥**이다 — 주소가 바뀌어도 세션 상태가 살아 있어야 한다.
    //
    // **"안쪽에 두면 순환이 난다"는 관측되지 않았다.** Provider를 두 라우트 `element`
    // 안쪽으로 옮겨 재봤더니(`/login`의 `RedirectWhenAuthenticated`와 보호 레이아웃의
    // `RequireAuth`를 각각 감싸는 배치) 순환 하네스에서 `me`=1·`list`=1로 `/login`에
    // 정착하고 web 전량이 그대로 통과했다(0 사망). 왕복 8홉에서도 `me`=1이다 —
    // react-router가 두 배치를 같은 슬롯의 같은 컴포넌트 타입으로 렌더하므로 React가
    // 재조정으로 인스턴스를 보존하고, 언마운트가 없으니 `me()` 이펙트가 다시 돌지 않는다.
    //
    // **다만 재마운트가 실제로 일어나면 순환은 선다.** 위 배치에 서로 다른 `key`를 줘
    // 강제로 언마운트·재마운트시키면 같은 하네스에서 `me`=6442·`list`=3221(800ms)이고
    // 세 케이스가 죽는다. 즉 위험한 것은 "안쪽"이 아니라 **재마운트**이므로, 이 자리를
    // 옮기려는 사람은 그 배치가 Provider를 재마운트시키는지부터 재라.
    <SessionProvider>
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
    </SessionProvider>
  )
}
