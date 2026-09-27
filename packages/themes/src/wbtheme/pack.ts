import type { ThemeManifest } from '@wirebound/theme-sdk'
import { strToU8, zipSync, type Zippable } from 'fflate'

/**
 * 항목의 수정 시각. **고정한다** — 시각을 담으면 같은 소스를 다시 빌드한 `.wbtheme` 의 바이트가 달라지고, 시스템
 * 테마 시딩이 «같은 `id@version` 인데 `sha256` 이 다르다» 로 기동을 멈춘다(spec 「시스템 테마」). zip 의 시각은 지역
 * 시각 칸이라 지역 칸으로 짓는다 — 어느 시간대에서 빌드해도 같은 바이트가 된다.
 */
const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0)

export function packWbtheme(input: {
  manifest: ThemeManifest
  themeJs: string
  themeCss?: string | null
  assets?: ReadonlyMap<string, Uint8Array>
}): Uint8Array {
  const files: Zippable = {
    'manifest.json': strToU8(`${JSON.stringify(input.manifest, null, 2)}\n`),
    'theme.js': strToU8(input.themeJs),
  }
  if (input.themeCss != null) files['theme.css'] = strToU8(input.themeCss)
  // 넣는 차례도 바이트다 — 이름 순으로 고정한다.
  for (const name of [...(input.assets?.keys() ?? [])].sort()) files[name] = input.assets!.get(name)!
  return zipSync(files, { mtime: FIXED_MTIME })
}
