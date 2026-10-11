import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { validateManifest, type ManifestIssue } from '@wirebound/themes'
import { build as esbuild, type Plugin } from 'esbuild'

export const CONFIG_FILE = 'theme.config.ts'
export const DEFAULT_ENTRY = 'src/index.tsx'

export interface LoadedProject {
  root: string
  /** 진입 파일의 절대 경로. */
  entry: string
  manifest: ThemeManifest
}

/**
 * 설정 파일이 부르는 `defineManifest` 를 항등 함수로 바꿔 끼운다. 설정은 임시 디렉터리에서 적재하므로 거기서는
 * `@wirebound/theme-sdk` 가 안 풀린다 — 묶으면 react 까지 딸려 온다. 설정이 SDK 의 다른 이름을 쓰면 esbuild 가 «내보내지
 * 않은 이름» 으로 죽는다(설정은 manifest 만 낸다).
 */
const SDK_SHIM: Plugin = {
  name: 'wb-theme-sdk-shim',
  setup(build) {
    build.onResolve({ filter: /^@wirebound\/theme-sdk$/ }, () => ({ path: 'theme-sdk', namespace: 'wb-theme-sdk-shim' }))
    build.onLoad({ filter: /.*/, namespace: 'wb-theme-sdk-shim' }, () => ({
      contents: 'export const defineManifest = (manifest) => manifest',
      loader: 'js',
    }))
  },
}

async function readConfig(configPath: string): Promise<unknown> {
  const out = await esbuild({
    entryPoints: [configPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [SDK_SHIM],
  })
  const dir = mkdtempSync(join(tmpdir(), 'wb-theme-config-'))
  const file = join(dir, 'theme.config.mjs')
  try {
    writeFileSync(file, out.outputFiles[0]!.contents)
    const mod = (await import(pathToFileURL(file).href)) as { default?: unknown }
    return mod.default
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * 작성자 프로젝트의 설정(`theme.config.ts` 의 default)을 적재하고 manifest 를 검증한다 — 업로드와 같은 함수
 * (`validateManifest`). 설정 · 진입 파일이 없거나 설정이 번들되지 않으면 던진다(manifest 의 이슈가 아니다).
 */
export async function loadProject(root: string, entry?: string): Promise<{ project: LoadedProject | null; issues: ManifestIssue[] }> {
  const rootAbs = resolve(root)
  const configPath = join(rootAbs, CONFIG_FILE)
  if (!existsSync(configPath)) throw new Error(`${CONFIG_FILE} 가 없습니다: ${configPath}`)
  const entryAbs = resolve(rootAbs, entry ?? DEFAULT_ENTRY)
  if (!existsSync(entryAbs)) throw new Error(`진입 파일이 없습니다: ${entryAbs}`)
  const { manifest, issues } = validateManifest(await readConfig(configPath))
  return { project: manifest === null ? null : { root: rootAbs, entry: entryAbs, manifest }, issues }
}
