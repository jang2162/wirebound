/**
 * **기동 시딩이 넣는 `system-admin` 의 판과 색 토큰** — 새 프로젝트가 고정하는 판이다. 시딩이 읽는 산출물(`system-themes/admin/dist/*.wbtheme`)
 * 의 manifest 에서 읽는다 — 서버가 넣은 것과 같은 한 벌이다. api 실행은 global-setup 이 소스에서 그것을 다시 빌드한 뒤 케이스를 싣는다
 * (`apps/api/test/global-setup.ts`). 웹의 실브라우저 판은 그 판의 api 가 같은 산출물을 시딩한다.
 *
 * **케이스는 판 · 토큰 키를 글자로 적지 않고 이것을 쓴다.** system-admin 은 제 디렉터리 안에서 판을 올리고 토큰을 고친다 — 글자로 적은
 * 케이스는 그때마다 테마 밖의 파일을 고치게 만든다.
 *
 * **패키지(`@wirebound/system-theme-admin`)를 가져오지 않는다** — 그 패키지는 렌더러에 기대고 렌더러의 케이스가 이 패키지에 기대어, 의존이
 * 고리가 되면 `pnpm build` 의 차례가 깨진다(테마가 kit 보다 먼저 빌드되어 `wb-theme` 을 못 찾는다).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readWbtheme, type ThemeManifest } from '@wirebound/themes'

/** 시스템 테마 하나(`system-themes/<theme>`)의 산출물 manifest. */
function readManifest(theme = 'admin'): ThemeManifest {
  const dist = fileURLToPath(new URL(`../../../system-themes/${theme}/dist/`, import.meta.url))
  let artifacts: string[] = []
  try {
    artifacts = readdirSync(dist).filter((name) => name.endsWith('.wbtheme'))
  } catch {
    // 아래에서 까닭을 말한다.
  }
  // 빌드는 `dist` 를 비우고 낸다 — 둘 이상이면 옛 산출물이 남은 것이다(시딩도 둘 다 읽는다).
  if (artifacts.length !== 1) {
    throw new Error(`system-${theme} 산출물이 하나여야 합니다(${dist} — 지금 ${artifacts.length} 개) — 저장소 뿌리에서 \`pnpm build\``)
  }
  const { files, issues } = readWbtheme(new Uint8Array(readFileSync(`${dist}${artifacts[0]}`)))
  if (files === null) throw new Error(`system-${theme} 산출물이 검증을 못 지났습니다: ${JSON.stringify(issues)}`)
  return files.manifest
}

/**
 * 기동 시딩이 넣는 시스템 테마의 판(`system-<theme>` — `admin` · `commerce` · `docs` · `portal` · `saas-marketing`). `SYSTEM_ADMIN.version` 과
 * 같은 까닭으로 케이스는 다른 시스템 테마의 판도 글자로 적지 않고 이것을 쓴다.
 */
export function systemThemeVersion(theme: string): string {
  return readManifest(theme).version
}

export interface ColorToken {
  key: string
  /** 설정 페이지의 토큰 칸 이름. */
  label: string
  /** 캔버스 · 미리보기의 CSS 변수(`tokenVar` 와 같은 꼴). */
  cssVar: string
  /** manifest 의 기본값 — 토큰을 안 덮은 캔버스의 변수 값. */
  value: string
}

const MANIFEST = readManifest()
const colors: ColorToken[] = Object.entries(MANIFEST.tokens.items)
  .filter(([, decl]) => decl.type === 'color')
  .map(([key, decl]) => ({ key, label: decl.label, cssVar: `--wb-${key.replace(/\./g, '-')}`, value: String(decl.default) }))

// 케이스가 «덮은 토큰 · 안 덮은 토큰 · 셋째» 를 가른다 — 모자라면 여기서 까닭을 말하고 죽는다(케이스마다 undefined 로 죽지 않게).
if (colors.length < 3) throw new Error(`system-admin 의 manifest 에 color 토큰이 셋 이상 있어야 합니다(지금 ${colors.length})`)

export const SYSTEM_ADMIN = {
  id: 'system-admin',
  version: MANIFEST.version,
  /** 케이스가 값을 덮는 색 토큰. */
  color: colors[0]!,
  /** 케이스가 안 덮는 다른 색 토큰. */
  otherColor: colors[1]!,
  /** 셋째 색 토큰 — 테마를 바꿀 때 «새 테마에 없는 키» 로 쓴다. */
  thirdColor: colors[2]!,
} as const

/** system-admin 의 지금 판보다 큰 판 — `step` 이 클수록 크다. 케이스가 «더 새 판» 을 넣을 때 쓴다(지금 판이 몇이든). */
export function laterAdminVersion(step: number): string {
  const major = Number(SYSTEM_ADMIN.version.split('.')[0])
  return `${major + step}.0.0`
}
