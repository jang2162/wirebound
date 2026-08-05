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
          // DB 하나를 공유하므로 파일 간 병렬을 끈다.
          //
          // **`fileParallelism: false`를 여기 쓰면 안 된다 — 조용히 무시된다.**
          // 그 옵션은 프로젝트 설정이 아니라 루트 전용이라, 여기 적어 두면 에러도
          // 경고도 없이 그냥 파일이 병렬로 돈다(실측: 이 자리에 `fileParallelism: false`를
          // 둔 채 `revisions-concurrency.test.ts`를 추가하니 매 실행마다 서로 다른
          // 파일 5~6개가 깨졌고, CLI로 `--no-file-parallelism`을 주면 전부 통과했다).
          // `poolOptions.forks.singleFork`는 프로젝트 단위로 먹히고 같은 결과를 낸다 —
          // 이 프로젝트의 파일 전부가 포크 하나에서 차례로 돈다.
          //
          // 이 설정이 사라지면 `revisions-concurrency.test.ts`가 실제로 커밋한 행이
          // 동시에 도는 다른 파일의 `withApi` 트랜잭션에 보이고, 그 파일의 정리
          // (`projects`·`users` 전체 삭제)가 남의 데이터를 지운다. `pool`을 명시하는
          // 것은 기본값이 언젠가 바뀌어도 `poolOptions.forks`가 계속 유효하도록
          // 못박아 두기 위해서다.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
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
          name: 'web',
          include: ['apps/web/test/**/*.test.{ts,tsx}'],
          // React 컴포넌트를 렌더하므로 DOM이 필요하다. api·unit 프로젝트는
          // DOM이 없어야 하므로(노드 전용 코드가 DOM 전역에 기대지 않도록)
          // 이 프로젝트에만 jsdom을 건다.
          //
          // `jsdom`은 vitest의 optional peer dependency이고, vitest가 자기
          // 위치에서 `import('jsdom')` 한다. pnpm의 strict node_modules에서는
          // vitest를 의존하는 패키지 — 즉 **저장소 루트** — 가 jsdom을 갖고
          // 있어야 vitest 옆에 링크된다. apps/web에만 넣으면
          // `Cannot find package 'jsdom'`으로 죽는다(실측).
          environment: 'jsdom',
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
