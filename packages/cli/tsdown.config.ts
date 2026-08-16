import { defineConfig } from 'tsdown'

export default defineConfig({
  // **진입점이 둘이다.** `bin.ts`는 `wireb`가 되는 실행 파일이고, `index.ts`는 다른
  // 패키지가 `run`을 부를 자리다(오늘은 아무도 안 부르지만 `exports`가 그것을 가리킨다).
  entry: ['src/index.ts', 'src/bin.ts'],
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
  // (`pnpm test`는 소스를 alias로 보므로 초록인 채로 지나간다 — D11).
  fixedExtension: false,
})
