import { defineConfig } from 'tsdown'

export default defineConfig({
  // **진입점이 둘이다.** `bin.ts`는 호스트가 띄우는 실행 파일이고, `index.ts`는 서버를
  // 값으로 만드는 자리다(케이스와 스모크가 그것을 부른다).
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  target: 'node22',
  clean: true,
  // "type": "module" 패키지이므로 .js로 낸다. `packages/cli`와 같은 근거이고, 같은 자리에
  // 같은 사고가 난다 — `bin`이 가리키는 `dist/bin.js` 대신 `dist/bin.mjs`가 생긴다.
  // **`pnpm test`는 소스를 alias로 보므로 초록인 채 지나간다** — `build-test/`가 그것을 잡는다
  // (다시 재는 법: 이 줄을 지우고 빌드한 뒤 `pnpm test:build`와 `pnpm test`를 견준다).
  fixedExtension: false,
})
