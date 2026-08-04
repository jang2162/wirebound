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
      {
        ...shared,
        test: {
          name: 'api',
          include: ['apps/api/test/**/*.test.ts'],
          // DB 하나를 공유하므로 파일 간 병렬을 끈다. 태스크 5에서 의미가 생긴다.
          fileParallelism: false,
          testTimeout: 20_000,
          // 전체 실행 전 한 번: 테스트 DB를 최신 마이그레이션까지 올린다.
          globalSetup: ['apps/api/test/global-setup.ts'],
          // 파일마다: 공유 DB 풀을 afterAll에서 정리한다.
          setupFiles: ['apps/api/test/setup.ts'],
        },
      },
      {
        ...shared,
        test: {
          name: 'build',
          include: ['packages/*/build-test/**/*.test.ts'],
          // tsdown 재빌드를 beforeAll에서 돈다. 기본 테스트 실행에서 분리한 이유:
          // pnpm test가 PATH의 pnpm과 전체 재빌드에 묶이면 개발 루프가 매번 수십 초씩
          // 느려진다. 이 프로젝트만 `pnpm test:build`로 따로 돌린다.
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
})
