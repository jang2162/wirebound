import { defineConfig } from 'vitest/config'
import base from './vitest.config'

// 실브라우저 판(`apps/web/build-test`)만 **파일 병렬**로 돌리는 별도 설정이다. 루트 `vitest.config.ts` 의 `build` 프로젝트는
// 파일을 차례로 돌린다(`packages/*` 재빌드가 서로의 `dist` 를 지우므로) — 이 판은 `dist` 를 안 읽고 포트 · DB 를 판마다
// 새로 받아(`editor-stack.ts`) 겹쳐 돌아도 서로를 안 건드린다. 예외 하나: `export-bundle.test.ts` 가 제 `beforeAll` 에서
// `packages/exporter/dist/runtime.js` 를 다시 짓는다 — 그 파일은 `--exclude` 로 빼고 따로 돈다.
//
// **새 vitest *프로젝트*가 아니라 별도 설정 파일이다** — `pnpm test` 의 `--project '!build'` 는 부정 패턴 둘이 서로를 포함해
// 아무것도 안 빼므로 프로젝트를 더하지 않는다. `fileParallelism` · `maxWorkers` 는 루트 설정에서만 읽히므로 여기가 루트다.
//
// 쓰는 법(워커 수는 CLI 로 준다 — 기본은 1):
//   pnpm vitest run -c vitest.browser.config.ts --maxWorkers=2 --exclude apps/web/build-test/export-bundle.test.ts
// `package.json` 에는 연결하지 않았다.
const build = (base.test?.projects as { test?: { name?: string } }[] | undefined)?.find((project) => project.test?.name === 'build') as
  | { esbuild?: object; resolve?: object }
  | undefined
if (!build) throw new Error('루트 vitest.config.ts 에서 build 프로젝트를 못 찾았다')

export default defineConfig({
  esbuild: build.esbuild,
  resolve: build.resolve,
  test: {
    include: ['apps/web/build-test/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: true,
    maxWorkers: 1,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
