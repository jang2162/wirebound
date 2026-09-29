import { defineConfig } from 'vite'

/**
 * **내보내기 런타임 `dist/runtime.js`** — 번들 페이지가 싣는 일반 스크립트 하나(IIFE). 진입은 `src/browser/runtime.tsx`.
 *
 * - **react · react-dom 을 묶는다** — 번들은 `file://` 로 열리고 바깥에 닿지 않는다. 테마 번들은 이 사본을 공유 런타임 전역으로 받는다.
 * - **셸의 NODE_ENV 와 무관하게 운영판이다** — `process.env.NODE_ENV` 를 글자로 바꾸고 개발 JSX(`jsxDEV`)를 끈다. vite 는 이미 선
 *   NODE_ENV(`test`)를 덮지 않아, 안 바꾸면 vitest 의 global-setup 이 지은 판이 개발 React 를 싣는다(theme-kit 의 `build.ts` 와 같은 판단).
 * - 워크스페이스 패키지는 **소스**로 푼다(`development` 조건) — 앞선 `dist` 가 낡아도 이 판은 지금 소스다.
 */
export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  mode: 'production',
  define: { 'process.env.NODE_ENV': '"production"' },
  esbuild: { jsx: 'automatic', jsxDev: false },
  resolve: { conditions: ['development', 'module', 'browser', 'production'] },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    // 클래스 필드를 그대로 둔다 — 낮추면 esbuild 가 도우미(`__defNormalProp`)를 IIFE **밖** 전역 `var` 로 내어, 같은 페이지의 테마 번들이
    // 같은 짧은 이름을 전역에 두면 이 런타임의 도우미를 덮는다(`build-test/runtime-dist.test.ts` «일반 스크립트(IIFE)다» 가 글자의 머리로 잰다).
    target: 'es2022',
    copyPublicDir: false,
    reportCompressedSize: false,
    lib: {
      entry: 'src/browser/runtime.tsx',
      formats: ['iife'],
      name: 'wireboundExportRuntime',
      fileName: () => 'runtime.js',
    },
  },
})
