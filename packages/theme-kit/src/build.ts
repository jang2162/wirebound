import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { WB_RUNTIME_GLOBAL } from '@wirebound/theme-sdk/runtime'
import { packWbtheme, readWbtheme } from '@wirebound/themes'
import { build as viteBuild, type Plugin } from 'vite'
import { loadProject, type LoadedProject } from './config'

export interface BuildResult {
  /** 낸 `.wbtheme` 의 절대 경로. */
  file: string
  manifest: ThemeManifest
  bytes: number
  themeJsBytes: number
}

export interface BuildIssue {
  code: string
  path: string
  message: string
}

/** manifest · 패키지 검증에 걸렸다. `issues` 가 이유를 항목별로 든다 — 파일은 만들지 않았다. */
export class BuildError extends Error {
  readonly issues: readonly BuildIssue[]
  constructor(issues: readonly BuildIssue[]) {
    super(`테마를 빌드하지 않았습니다 — 이슈 ${issues.length} 건\n${issues.map((i) => `✗ ${i.path} — ${i.message}`).join('\n')}`)
    this.name = 'BuildError'
    this.issues = issues
  }
}

/**
 * 공유 런타임 모듈(spec 「`.wbtheme` 파일」의 «공유 런타임»)과 그것을 대신 읽을 전역의 속성. 이 셋을 묶으면 테마가 호스트와
 * 다른 SDK 사본을 쥐어 `Root` 가 던지고 모든 노드가 기본 뷰로 그려진다 — 화면에 오류가 없다.
 */
export const RUNTIME_GLOBALS: Readonly<Record<string, string>> = {
  react: `${WB_RUNTIME_GLOBAL}.react`,
  'react/jsx-runtime': `${WB_RUNTIME_GLOBAL}.jsxRuntime`,
  '@wirebound/theme-sdk': `${WB_RUNTIME_GLOBAL}.sdk`,
}

const ENTRY_ID = 'virtual:wb-theme-entry'

/** 작성자의 진입은 `defineTheme` 을 내보내기만 한다 — 전역에 등록하는 줄은 kit 이 짓는다(작성자 코드에 전역 이름이 안 나온다). */
function entryPlugin(entry: string): Plugin {
  return {
    name: 'wb-theme-entry',
    enforce: 'pre',
    resolveId: (id) => (id === ENTRY_ID ? `\0${ENTRY_ID}` : null),
    load: (id) =>
      id === `\0${ENTRY_ID}` ? `import def from ${JSON.stringify(entry)}; globalThis.${WB_RUNTIME_GLOBAL}.register(def);` : null,
  }
}

interface Bundled {
  themeJs: string
  themeCss: string | null
  assets: Map<string, Uint8Array>
}

/**
 * vite 로 `theme.js`(IIFE) · `theme.css` · `assets/*` 를 짓는다.
 *
 * **`build.lib` 을 쓰지 않는다.** vite 6 의 라이브러리 모드는 `assetsInlineLimit` 와 무관하게 CSS 의 자산을 전부 data URL 로
 * 인라인한다(vite 의 `shouldInline` — `build.lib` 이면 참). 그러면 `assets/**` 가 빈 채 글꼴 · 이미지가 `theme.css` 에 부풀어
 * 들어간다. 그래서 일반 빌드에 rollup 출력 형식을 `iife` 로 준다 — 자산은 `assets/` 로 나가고 CSS 는 `base: './'` 라 그것을
 * 상대 경로로 가리킨다.
 */
async function bundleTheme(project: LoadedProject): Promise<Bundled> {
  const result = await viteBuild({
    root: project.root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    mode: 'production',
    base: './',
    plugins: [react(), entryPlugin(project.entry)],
    // **셸의 NODE_ENV 와 무관하게 운영 JSX 다.** vite 는 이미 선 NODE_ENV(`test` · `development`)를 안 덮고, 그러면 개발 JSX(`jsxDEV`)가
    // 나와 `react/jsx-dev-runtime` 이 번들에 묶인다 — 그것은 개발 React 의 내부(`getOwner`)를 불러 운영 호스트에서 뷰가 던진다
    // (`test/build.test.ts` «NODE_ENV 가 production 이 아닌 셸»). JSX 는 공유 런타임의 `react/jsx-runtime` 으로만 간다. 작성자 코드의
    // `process.env.NODE_ENV` 갈래는 여전히 셸의 값으로 풀린다 — 그 판을 재는 케이스가 없어 치환은 두지 않았다.
    esbuild: { jsxDev: false },
    build: {
      write: false,
      assetsInlineLimit: 0,
      cssCodeSplit: false,
      minify: true,
      modulePreload: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      rollupOptions: {
        input: ENTRY_ID,
        external: Object.keys(RUNTIME_GLOBALS),
        output: {
          format: 'iife',
          globals: { ...RUNTIME_GLOBALS },
          // 기본 가져오기(`import React from 'react'`)가 전역의 네임스페이스에 `default` 가 없어도 풀리게.
          interop: 'auto',
          inlineDynamicImports: true,
          entryFileNames: 'theme.js',
          assetFileNames: (info) => ((info.names[0] ?? '').endsWith('.css') ? 'theme.css' : 'assets/[name]-[hash][extname]'),
        },
      },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []))
  let themeJs: string | null = null
  let themeCss: string | null = null
  const assets = new Map<string, Uint8Array>()
  for (const out of outputs) {
    if (out.type === 'chunk') {
      if (out.fileName !== 'theme.js') throw new Error(`theme.js 밖의 청크를 냈습니다: ${out.fileName}`)
      themeJs = out.code
    } else if (out.fileName === 'theme.css') {
      themeCss = typeof out.source === 'string' ? out.source : new TextDecoder().decode(out.source)
    } else {
      assets.set(out.fileName, typeof out.source === 'string' ? new TextEncoder().encode(out.source) : out.source)
    }
  }
  if (themeJs === null) throw new Error('theme.js 를 내지 않았습니다')
  return { themeJs, themeCss, assets }
}

/**
 * `wb-theme build` — 설정 적재 · manifest 검증 → `theme.js` 번들 → `.wbtheme` 로 묶고 업로드와 같은 읽기로 다시 검증 →
 * `<outDir>/<id>-<version>.wbtheme`(spec 「`wb-theme build`」). 검증에 걸리면 `BuildError` 를 던지고 파일을 만들지 않는다.
 */
export async function buildTheme(opts: { root: string; entry?: string; outDir?: string }): Promise<BuildResult> {
  const { project, issues } = await loadProject(opts.root, opts.entry)
  if (project === null) throw new BuildError(issues)
  const { themeJs, themeCss, assets } = await bundleTheme(project)
  const bytes = packWbtheme({ manifest: project.manifest, themeJs, themeCss, assets })
  // 빌드가 허용 밖의 자산(`.js` 청크 · 모르는 확장자)을 냈으면 여기서 걸린다 — 업로드에서 처음 알게 하지 않는다.
  const check = readWbtheme(bytes)
  if (check.files === null) throw new BuildError(check.issues)
  const outDir = resolve(project.root, opts.outDir ?? 'dist')
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, `${project.manifest.id}-${project.manifest.version}.wbtheme`)
  writeFileSync(file, bytes)
  return { file, manifest: project.manifest, bytes: bytes.length, themeJsBytes: new TextEncoder().encode(themeJs).length }
}
