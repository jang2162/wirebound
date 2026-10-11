import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  target: 'node22',
  clean: true,
  // "type": "module" 패키지이므로 .js로 낸다(다른 패키지의 tsdown 설정과 같은 까닭).
  fixedExtension: false,
  // 비공개 워크스페이스 패키지는 산출물 안에 묶는다 — 템플릿을 설치하는 기계에는 그 패키지가 없다(npm 에 없다). `check` 가 그리는
  // 렌더러 · 갤러리도 그렇다. 설치로 받는 것(`package.json` 의 dependencies · peerDependencies)과 Node 내장만 밖에 둔다. SDK 는 작성자
  // 프로젝트의 것 한 벌을 쓴다.
  noExternal: [/^@wirebound\/(schema|themes|renderer|theme-gallery)(\/|$)/],
  external: [
    'vite',
    '@vitejs/plugin-react',
    'esbuild',
    'fflate',
    'zod',
    'jsdom',
    /^react(-dom)?(\/|$)/,
    /^node:/,
    /^@wirebound\/theme-sdk(\/|$)/,
  ],
})
