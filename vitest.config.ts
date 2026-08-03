import { defineConfig } from 'vitest/config'

export default defineConfig({
  // .ts 파일에서도 자동 JSX 런타임을 쓴다. renderer 테스트가 .tsx다.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.{ts,tsx}'],
  },
})
