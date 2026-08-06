import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 중 API를 같은 오리진으로 보이게 한다(설계 결정 D4).
    // 그래야 세션 쿠키가 same-origin으로 실리고 서버에 CORS 설정이 필요 없다.
    proxy: {
      // 3001은 apps/api의 PORT 기본값이다(apps/api/src/config.ts의 EnvSchema).
      // apps/api/.env로 PORT를 바꾸면 이 대상도 함께 바꿔야 한다 — 자동으로
      // 따라가지 않는다.
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
})
