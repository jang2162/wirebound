/**
 * 테마 패키지 케이스가 함께 쓰는 `.wbtheme` 바이트.
 *
 * - `builtSample()` — A2 의 kit 픽스처(`packages/theme-kit/test/fixtures/sample-theme` — `sample@1.0.0`)를 **kit 으로 빌드한** 것.
 *   업로드가 받는 진짜 산출물이다. 한 프로세스에서 한 번 빌드한다.
 * - `packed(manifest)` — manifest 만 바꾼 최소 패키지(`packWbtheme`). kit 은 검증을 못 지나는 manifest 를 빌드하지 않으므로 거절
 *   갈래(판 `1.0` · `system-` · SDK 범위 밖)와 판 여럿은 이것으로 짓는다.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTheme } from '@wirebound/theme-kit'
import { packWbtheme, type ThemeManifest } from '@wirebound/themes'

const SAMPLE_ROOT = fileURLToPath(new URL('../../../packages/theme-kit/test/fixtures/sample-theme/', import.meta.url))

let sample: Promise<Uint8Array> | null = null

export function builtSample(): Promise<Uint8Array> {
  sample ??= (async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'wb-api-sample-'))
    const built = await buildTheme({ root: SAMPLE_ROOT, entry: 'src/index.tsx', outDir })
    return new Uint8Array(readFileSync(built.file))
  })()
  return sample
}

export function manifestOf(id: string, version: string, extra: Partial<ThemeManifest> = {}): ThemeManifest {
  return { id, name: `${id} 테마`, version, sdk: '^1.0.0', tokens: { items: {} }, ...extra } as ThemeManifest
}

export function packed(manifest: ThemeManifest, files: { themeCss?: string; assets?: Record<string, string> } = {}): Uint8Array {
  const encoder = new TextEncoder()
  return packWbtheme({
    manifest,
    themeJs: ';',
    themeCss: files.themeCss ?? null,
    assets: new Map(Object.entries(files.assets ?? {}).map(([name, body]) => [name, encoder.encode(body)])),
  })
}
