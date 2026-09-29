/**
 * 라우트 표. 라우터 자체는 여기서 만들지 않는다 — 앱은 `main.tsx`가
 * `BrowserRouter`를, 테스트는 메모리 라우터를 씌운다. 그래야 테스트가 주소를 정하고
 * 읽을 수 있다.
 */
import type { ReactElement } from 'react'
import { Outlet, Route, Routes } from 'react-router'
import { WriteLedgerProvider } from './panels/write-ledger'
import { EditorShellRoute } from './routes/editor'
import { LoginRoute } from './routes/login'
import { ProjectListRoute } from './routes/project-list'
import { RedirectWhenAuthenticated, RequireAuth } from './routes/require-auth'
import { SettingsRoute } from './routes/settings'
import { TokensRoute } from './routes/tokens'
import { SessionProvider } from './session/session-context'

export function App(): ReactElement {
  return (
    // 라우트 표 **바깥**이다 — 주소가 바뀌어도 세션 상태가 살아 있어야 한다.
    //
    // **"안쪽에 두면 순환이 난다"는 관측되지 않는다.** Provider를 두 라우트 `element`
    // 안쪽으로 옮겨 재면(`/login`의 `RedirectWhenAuthenticated`와 보호 레이아웃의
    // `RequireAuth`를 각각 감싸는 배치) 순환 하네스에서 `me`=1·`list`=1로 `/login`에
    // 정착하고 web 전량이 그대로 통과한다(죽는 케이스가 없다). 왕복 8홉에서도 `me`=1이다 —
    // react-router가 두 배치를 같은 슬롯의 같은 컴포넌트 타입으로 렌더하므로 React가
    // 재조정으로 인스턴스를 보존하고, 언마운트가 없으니 `me()` 이펙트가 다시 돌지 않는다.
    //
    // **다만 재마운트가 실제로 일어나면 순환은 선다.** 위 배치에 서로 다른 `key`를 줘
    // 강제로 언마운트·재마운트시키면 같은 하네스에서 `me`=6442·`list`=3221(800ms)이고
    // 세 케이스가 죽는다. 즉 위험한 것은 "안쪽"이 아니라 **재마운트**이므로, 이 자리를
    // 옮기려는 사람은 그 배치가 Provider를 재마운트시키는지부터 재라.
    <SessionProvider>
      {/* **나가 있는 쓰기의 장부도 라우트 표 바깥이다** — 에디터 셸이 내려가도(프로젝트 목록 ·
          설정 페이지) 쓰기는 산다. 잠금이 셸과 함께 사라지면 앞 쓰기가 나가 있는 채 둘째가 나가고,
          늦게 온 앞 쓰기가 뒤 쓰기를 덮는다(`panels/write-ledger.tsx`의 머리말). **세션 안이다** —
          세션이 끝나면(로그아웃 · 401) 장부가 그 세션의 쓰기를 끊는다(그 머리말의 «세션을 넘지 않는다»). */}
      <WriteLedgerProvider>
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
            {/* **내 API 토큰은 계정의 것이라 프로젝트 밖 라우트다** — 근거는 `routes/tokens.tsx` 머리말. */}
            <Route path="/tokens" element={<TokensRoute />} />
            {/* 두 주소가 같은 셸이다. 페이지를 연 것은 셸 안의 캔버스가 달라지는 일이지
                다른 화면이 아니므로, 라우터가 컴포넌트를 다시 마운트하지 않고 편집 상태가
                그대로 이어진다. */}
            <Route path="/projects/:projectId" element={<EditorShellRoute />} />
            <Route path="/projects/:projectId/pages/:pageId" element={<EditorShellRoute />} />
            {/* **설정은 셸 밖 라우트다** — 근거는 `routes/settings.tsx` 머리말. */}
            <Route path="/projects/:projectId/settings" element={<SettingsRoute />} />
            {/* **스냅샷에는 주소가 없다** — 셸 밖 라우트가 아니라 **셸 머리의 팝오버**다
                (`shell/snapshots-panel.tsx` 머리말의 표가 라우트로 둘 근거 둘과 그것이 서지 않는 까닭을 짝지어 적고 있다).
                요지: 설계서 「설계서 화면 구조」는 머리에 무엇이 오는지 말하지 않고, 스냅샷 목록은 링크로 건네는
                화면이 아니다. */}
          </Route>
        </Routes>
      </WriteLedgerProvider>
    </SessionProvider>
  )
}
