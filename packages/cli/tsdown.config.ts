import { defineConfig } from 'tsdown'

export default defineConfig({
  // **진입점이 셋이다.** `bin.ts`는 `wireb`가 되는 실행 파일이고, `index.ts`는 다른
  // 패키지가 `run`을 부를 자리이며, `embed.ts`는 **붙는 자리**다(`@wirebound/mcp`가
  // 그것을 쓴다).
  //
  // **셋이 모듈을 두 벌로 만들지 않는다** — `tsdown`이 공유 코드를 청크 하나로 빼고 세
  // 진입점이 그것을 import한다(재는 법: `pnpm build` 뒤 `dist/*.js`의 import를 본다).
  // `CliError`의 identity가 진입점마다 갈리면
  // `packages/mcp`의 `isToolFailure`가 조용히 거짓이 된다.
  entry: ['src/index.ts', 'src/bin.ts', 'src/embed.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  target: 'node22',
  clean: true,
  // "type": "module" 패키지이므로 .js로 낸다. platform이 기본 'node'일 때
  // tsdown은 fixedExtension을 켜 무조건 .mjs를 낸다 — package.json의
  // exports("./dist/index.js")·bin("./dist/bin.js")과 어긋나므로 명시적으로 끈다.
  //
  // **이 한 줄이 없으면 `wireb`가 서지 않는다** — `bin`이 가리키는 `dist/bin.js`가
  // 없고 `dist/bin.mjs`가 생긴다. `build-test/dist-bin.test.ts`가 그것을 잡는다
  // (`pnpm test`는 소스를 alias로 보므로 초록인 채로 지나간다).
  fixedExtension: false,
})
