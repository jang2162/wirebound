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
      // 좁은 것이 먼저다 — 아래 exporter 주석의 규칙.
      '@wirebound/theme-sdk/runtime': src('./packages/theme-sdk/src/runtime.ts'),
      '@wirebound/theme-sdk/version': src('./packages/theme-sdk/src/version.ts'),
      '@wirebound/theme-sdk/capture': src('./packages/theme-sdk/src/capture.ts'),
      '@wirebound/theme-sdk': src('./packages/theme-sdk/src/index.ts'),
      '@wirebound/renderer': src('./packages/renderer/src/index.ts'),
      '@wirebound/theme-gallery': src('./packages/theme-gallery/src/index.ts'),
      '@wirebound/theme-kit': src('./packages/theme-kit/src/index.ts'),
      '@wirebound/system-theme-admin': src('./system-themes/admin/src/index.ts'),
      '@wirebound/themes': src('./packages/themes/src/index.ts'),
      // **더 좁은 것을 먼저 둔다.** rollup의 alias는 `id === find || id.startsWith(find + '/')`로
      // 맞추고 **앞의 것이 이기므로**, 순서를 뒤집으면 `@wirebound/exporter/test-support`가
      // `…/src/index.ts/test-support`로 바뀐다.
      '@wirebound/exporter/test-support': src('./packages/exporter/test-support/index.ts'),
      '@wirebound/exporter/browser': src('./packages/exporter/src/browser/index.ts'),
      '@wirebound/exporter': src('./packages/exporter/src/index.ts'),
      // 같은 규칙이 `@wirebound/cli`에도 걸린다 — **좁은 둘이 먼저다**.
      // `./embed`은 `packages/mcp`가 쓰는 **붙는 자리**이고 `./test-support`는 가짜 `io`와
      // 스냅샷 픽스처다. 순서를 뒤집으면 `…/src/index.ts/embed`가 된다.
      '@wirebound/cli/test-support': src('./packages/cli/test-support/index.ts'),
      '@wirebound/cli/embed': src('./packages/cli/src/embed.ts'),
      '@wirebound/cli': src('./packages/cli/src/index.ts'),
      '@wirebound/mcp': src('./packages/mcp/src/index.ts'),
      '@wirebound/test-support/system-admin': src('./packages/test-support/src/system-admin.ts'),
      '@wirebound/test-support': src('./packages/test-support/src/index.ts'),
    },
  },
}

export default defineConfig({
  ...shared,
  test: {
    // 워커(포크) 수를 코어의 절반으로 묶는다. 기본값은 `availableParallelism() - 1`이라
    // `vitest run` 한 번이 기계를 통째로 가져간다.
    //
    // **워커를 더 띄워도 일이 빨리 끝나지 않는다 — 붐빌 뿐이다.** web 전량의 CPU 시간은
    // 워커 수와 거의 무관하다(파일마다 새 포크·jsdom·모듈 그래프를 세우는 비용이 몸통이다).
    // 실측(15코어, 다른 실행이 없을 때): 기본값(14)과 50%(8)의 벽시계가 같은 폭 안이고
    // CPU 시간도 비슷한데, web 전량을 연달아 돌리면 기본값은 1분 load 가 코어 수의 몇 배로
    // 계속 오르고 50%는 그 절반쯤에서 멈춘다. 25%(4)부터는 벽시계가 눈에 띄게 는다.
    // 다시 재는 법: `pnpm vitest run --project web --maxWorkers=<값>`의 벽시계와 그동안의
    // `uptime` 1분 load 를 견준다.
    //
    // **프로젝트 자리에 쓰면 안 된다 — 조용히 무시된다.** 포크 풀은 모든 프로젝트가 하나를
    // 나눠 쓰고 그 크기를 루트 설정에서만 읽는다(아래 api 의 `fileParallelism`과 같은 함정.
    // 실측: web 프로젝트에 `maxWorkers: 4`를 두어도 포크가 14개 떴다). CLI 의
    // `--maxWorkers`가 이 값을 덮는다 — 기계를 다 쓰고 싶으면 `--maxWorkers=100%`.
    //
    // 이것이 사라지면 한 실행이 코어를 다 가져가 옆 워크트리·IDE 가 굶고, 루프로 돌리면
    // load 가 코어 수의 몇 배로 쌓인다. `apps/web/test/setup.ts`가 적어 둔 *"CPU가 붐비면
    // 그 경주에서 진다"*가 그 붐빔이다. **이것은 한 실행의 몫만 묶는다** — 워크트리 여럿이
    // 동시에 돌리면 그 수만큼 다시 쌓인다.
    maxWorkers: '50%',
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          include: [
            'packages/*/test/**/*.test.{ts,tsx}',
            'apps/playground/test/**/*.test.{ts,tsx}',
            'system-themes/*/test/**/*.test.{ts,tsx}',
          ],
          // 시스템 테마의 `theme.css?raw` 를 실제로 읽는다. 기본값이면 vitest 가 CSS 임포트를 **빈 문자열**로 바꿔
          // `ADMIN_V0_CSS` 가 비고, CSS 를 재는 케이스가 빈 문자열을 잰다(web 프로젝트의 `css: true` 와 같은 함정).
          // 이 저장소의 다른 CSS 는 건드리지 않게 그 파일만 고른다.
          css: { include: [/\/system-themes\/[^/]+\/src\/theme\.css/] },
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
          // 두고 `revisions-concurrency.test.ts`가 든 api 전량을 돌리면 매 실행마다 서로 다른
          // 파일 몇 개가 깨지고, CLI로 `--no-file-parallelism`을 주면 전부 통과한다).
          // `poolOptions.forks.singleFork`는 프로젝트 단위로 먹히고 같은 결과를 낸다 —
          // 이 프로젝트의 파일이 하나씩 차례로 돈다(포크 프로세스가 몇 개 떠 있든 파일은 겹치지 않는다 — 아래 build 주석).
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
          // CSS 임포트를 실제로 처리한다. **`shell-css.test.ts`가 이것에 매여 있다** —
          // 그 파일은 `../src/shell.css?raw`로 원문을 읽어 셸 CSS가 캔버스로 새는지 검사하는데,
          // 이 옵션이 꺼져 있으면(기본값) vitest가 CSS 임포트를 **빈 문자열**로 바꾼다. 그러면 검사가
          // 빈 파일을 훑어 위반 0건을 내고, 심어 둔 위반만 걸리는 초록이 된다.
          // (실측: 이 줄을 빼면 `검사가 진짜 shell.css를 읽는다` **한 케이스만** 실패하고
          // 나머지는 전부 통과한다 — 그 카나리아가 없으면 못 알아챈다. 분모를 적지 않는
          // 것은 그 파일에 케이스를 더할 때마다 어긋나기 때문이다. 지키려는 것은
          // "카나리아 한 줄만 실패한다"이지 분모가 아니다.)
          css: true,
          // 파일마다: RTL의 DOM cleanup을 afterEach에 등록한다. 이 저장소는
          // `globals`를 켜지 않아 RTL이 스스로 등록하지 못한다 — 자세한 이유는
          // 그 파일 주석에 있다.
          setupFiles: ['apps/web/test/setup.ts'],
        },
      },
      {
        ...shared,
        test: {
          name: 'build',
          // `apps/*`도 든다. 여기 담기는 것의 공통점은 **무거워서 `pnpm test`에
          // 못 두는 것**이지 패키지인지 앱인지가 아니다 — `apps/api/build-test`가 진짜
          // 브라우저를 띄운다. 그쪽은 `dist`가 아니라 소스를 보지만(앱에는 `dist`가
          // 없다) 재려는 것이 *"빌드된 것"*이 아니라 *"진짜 브라우저"*라 결이 같다.
          //
          // **`apps/web/build-test`는 에디터를 실브라우저로 모는 판이다** — 파일마다 일회용 DB · api · vite · Chrome 을 띄우고
          // 거둔다(`editor-stack.ts`). 그 파일들은 이 프로젝트가 아니라 `vitest.browser.config.ts` 가 파일 병렬로 돌린다
          // (`pnpm test:browser`) — 여기 다시 담으면 같은 파일이 두 번 돈다. **`export-bundle.test.ts` 만 예외로 여기 든다** — 제
          // `beforeAll` 에서 `packages/exporter/dist/runtime.js` 를 다시 짓는데, 이 프로젝트는 파일을 차례로 돌려 그 `dist` 를
          // 다른 파일과 겹쳐 쓰지 않는다. 새 앱 `build-test` 는 여기 줄을 더해야 돈다(앱 글롭을 쓰지 않는 까닭이 이것이다).
          // **Postgres 가 있어야 돈다** — 없으면 건너뛰고 그렇다고 말한다. 포트는 빈 것을 받아 워크트리끼리 안 부딪힌다.
          //
          // `system-themes/*/build-test` 는 시스템 테마를 저장소 빌드(`wb-theme build`)로 `.wbtheme` 로 내고 실어 본다.
          include: [
            'packages/*/build-test/**/*.test.ts',
            'apps/api/build-test/**/*.test.ts',
            'apps/web/build-test/export-bundle.test.ts',
            'system-themes/*/build-test/**/*.test.{ts,tsx}',
          ],
          // tsdown 재빌드를 beforeAll에서 돈다. 기본 테스트 실행에서 분리한 이유:
          // pnpm test가 PATH의 pnpm과 전체 재빌드에 묶이면 개발 루프가 매번 수십 초씩
          // 느려진다. 이 프로젝트만 `pnpm test:build`로 따로 돌린다.
          testTimeout: 300_000,
          hookTimeout: 300_000,
          // **파일을 차례로 돌린다** — 포크 프로세스는 워커 수만큼 떠도 파일은 하나씩 돈다(다시 재는 법: `pnpm test:build:serial
          // --reporter=json` 의 파일별 시작 · 끝 시각이 겹치지 않는다). 파일마다 `beforeAll`에서 `packages/*`를 재빌드하고 tsdown 이 `dist`를
          // 비운 뒤 채우므로, 둘이 나란히 돌면 한쪽이 읽는 `dist`를 다른 쪽이 지운다(`Cannot find module …/dist/index.js`
          // — `--maxWorkers=25%`로 돌리면 mcp `dist-smoke`가 죽는다). 워커 수를 CLI 로 얼마를 주든 이 줄이 막는다.
          // `fileParallelism`은 여기 쓰면 조용히 무시된다(위 api 프로젝트 주석) — 같은 이유로 `singleFork`다.
          // 에디터 판(`apps/web/build-test`)은 이 줄에 기대지 않는다 — `dist` 를 안 읽고 포트 · DB 를 판마다 새로 받아 파일끼리
          // 겹쳐 돌아도 된다(`vitest.browser.config.ts`). 하나만 `dist` 에 닿는다 — `export-bundle.test.ts` 가 번들에 실릴
          // `packages/exporter/dist/runtime.js` 를 제 `beforeAll` 에서 다시 짓는다(그 파일 하나만 덮고 `dist` 를 비우지 않는다 —
          // `vite.runtime.config.ts` 의 `emptyOutDir`). 그 파일이 이 프로젝트에 남은 까닭이다.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
})
