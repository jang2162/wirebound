import { defineConfig } from 'tsdown'

export default defineConfig({
  // 본 진입과 공유 런타임(`./runtime`). 둘이 한 청크를 나눠 쓰므로 `runtime` 의 `sdk` 가 본 진입의 모듈 그 자체다.
  // `./version` 은 react 없이 판만 읽는 자리다(`src/version.ts` 의 머리말).
  entry: ['src/index.ts', 'src/runtime.ts', 'src/version.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  target: 'node22',
  clean: true,
  // "type": "module" 패키지이므로 .js로 낸다. platform이 기본 'node'일 때
  // tsdown은 fixedExtension을 켜 무조건 .mjs를 낸다 — package.json의
  // exports("./dist/index.js")와 어긋나므로 명시적으로 끈다.
  fixedExtension: false,
})
