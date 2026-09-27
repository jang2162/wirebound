import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * `wb-theme dev` 의 갤러리 클라이언트를 미리 빌드한다(`dist/client/`). 템플릿을 설치하는 기계에는 비공개 패키지(renderer ·
 * schema · themes · theme-gallery)가 없어 dev 서버가 그 소스를 풀 수 없다 — 그래서 여기서 묶는다.
 *
 * **react · react-dom · theme-sdk 는 밖에 둔다.** dev 서버가 작성자 프로젝트의 것 한 벌로 푼다(`dev.ts` 의 `resolve.dedupe`).
 * 여기서 SDK 를 묶으면 갤러리의 렌더러가 연 `NodeContext` 와 작성자의 뷰가 쓰는 `Root` 가 다른 사본이 되어 `Root` 가 던지고
 * 모든 칸이 폴백이 된다. `virtual:wb-theme-entry` 는 dev 서버가 작성자의 진입으로 잇는 이름이다.
 */
function emitHtml(): Plugin {
  return {
    name: 'wb-theme-client-html',
    generateBundle() {
      for (const name of ['index.html', 'frame.html']) {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(new URL(`./src/client/${name}`, import.meta.url), 'utf8') })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), emitHtml()],
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: { shell: 'src/client/shell.tsx', frame: 'src/client/frame.tsx' },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^react(\/|$)/, /^react-dom(\/|$)/, /^@wirebound\/theme-sdk(\/|$)/, 'virtual:wb-theme-entry'],
    },
  },
})
