import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
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
