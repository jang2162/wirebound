/**
 * **기동 시딩이 넣는 `system-admin` 의 지금 판과 색 토큰** — 새 프로젝트가 고정하는 판이다. 소스 manifest(`system-themes/admin/src/manifest.ts`)
 * 에서 읽는다 — 시딩이 넣는 `.wbtheme` 는 그 manifest 로 빌드된다(`apps/api/test/global-setup.ts`).
 *
 * **케이스는 판 · 토큰 키를 글자로 적지 않고 이것을 쓴다.** system-admin 은 제 디렉터리 안에서 판을 올리고 토큰을 고친다 — 글자로 적은
 * 케이스는 그때마다 테마 밖의 파일을 고치게 만든다. api 케이스와 웹의 실브라우저 판(`apps/web/build-test` — 그 판의 api 도 같은 시딩으로
 * 선다)이 쓴다.
 */
import { MANIFEST } from '@wirebound/system-theme-admin/manifest'

export interface ColorToken {
  key: string
  /** 설정 페이지의 토큰 칸 이름. */
  label: string
  /** 캔버스 · 미리보기의 CSS 변수(`tokenVar` 와 같은 꼴). */
  cssVar: string
  /** manifest 의 기본값 — 토큰을 안 덮은 캔버스의 변수 값. */
  value: string
}

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
