import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolveApiProxyTarget } from './config/api-proxy-target'

/** `apps/api/.env` — 포트가 사는 **한 자리**. */
const API_ENV_URL = new URL('../api/.env', import.meta.url)

/**
 * `apps/api/.env`를 읽는다. **새 의존을 들이지 않는다** — `node:util`의 `parseEnv`가
 * 그 일을 한다(Node 20.12+, 이 저장소의 `engines`는 ≥22.9다). `process.loadEnvFile()`도
 * 같은 순서를 내지만 그쪽은 `process.env`를 통째로 바꾸므로 쓰지 않는다 — 접속 문자열이
 * vite 프로세스의 환경에 얹힌다.
 *
 * **파일이 없으면 빈 객체다.** `.env`를 안 만든 사람은 기본값 3001로 뜬다.
 */
function readApiEnvFile(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(API_ENV_URL, 'utf8')) as Record<string, string | undefined>
  } catch {
    return {}
  }
}

const apiProxyTarget = resolveApiProxyTarget({ shellEnv: process.env, fileEnv: readApiEnvFile() })

export default defineConfig({
  plugins: [
    react(),
    {
      // **뜰 때 어디로 보내는지 말한다.** 터미널 둘을 나란히 놓은 사람이 눈으로
      // 가를 수 있어야 한다 — 프록시가 성공하면 vite는 그 뒤로 아무 말도 안 한다.
      name: 'wirebound:api-proxy-banner',
      configureServer(server) {
        const printUrls = server.printUrls.bind(server)
        server.printUrls = () => {
          printUrls()
          server.config.logger.info(`  ➜  API 프록시:  ${apiProxyTarget}`)
        }
      },
    },
  ],
  server: {
    // 개발 중 API를 같은 오리진으로 보이게 한다.
    // 그래야 세션 쿠키가 same-origin으로 실리고 서버에 CORS 설정이 필요 없다.
    proxy: {
      // **대상은 `apps/api/.env`의 `PORT`를 따라간다 — 손으로 맞추지 않는다.**
      // 셸 환경변수가 파일을 이기는 순서까지 api 쪽과 같다. 규칙은
      // `config/api-proxy-target.ts`가 소유하고 `test/api-proxy-target.test.ts`가 잰다.
      //
      // **`ws: true`가 없으면 실시간이 통째로 죽는다.** 실시간 라우트
      // (`/api/projects/:projectId/ws`)는 이 컨텍스트에 맞지만, vite는 업그레이드를
      // **따로** 다루면서 `opts.ws || 대상이 ws:/wss:`를 한 번 더 묻는다. 셋 다 거짓이면
      // 그 핸들러는 소켓을 닫지도 상태 코드를 쓰지도 않고 그냥 빠져나온다 — **응답
      // 바이트 0**이다. 브라우저는 `CONNECTING`에서 멈추고 `onclose`가 안 오니
      // `realtime/connection.ts`의 재연결도 안 탄다. 조용히 죽는 실패라 아무도 말하지
      // 않는다. 대상을 `ws:`로 바꾸는 것은 답이 아니다 — 같은 엔트리로 REST도 나간다.
      //
      // **`changeOrigin`은 WS에서도 `false`다.** http-proxy는 업그레이드 요청의 헤더를
      // 통째로 베끼고(`setupOutgoing`) `changeOrigin`이 손대는 것은 `Host` 하나뿐이라,
      // 세션 쿠키는 same-origin으로 그대로 실린다 — 위 같은 오리진의 근거가 그대로 선다. 그 쿠키가
      // 없으면 이 라우트의 `projectGuard('viewer')`가 막는다.
      '/api': { target: apiProxyTarget, changeOrigin: false, ws: true },
    },
  },
})
