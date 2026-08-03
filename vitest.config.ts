import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// 프로젝트마다 별도 Vite 설정이므로 상속되지 않는다. 명시적으로 펼친다.
const shared = {
  // .ts 파일에서도 자동 JSX 런타임을 쓴다. renderer 테스트가 .tsx다.
  esbuild: { jsx: 'automatic' as const },
  // package.json exports가 dist를 가리키므로, 테스트는 alias로 소스를 직접 본다.
  // 조건 해석에 기대지 않아 결정적이다.
  resolve: {
    alias: {
      '@wirebound/schema': src('./packages/schema/src/index.ts'),
      '@wirebound/renderer': src('./packages/renderer/src/index.ts'),
    },
  },
}

export default defineConfig({
  ...shared,
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/playground/test/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
