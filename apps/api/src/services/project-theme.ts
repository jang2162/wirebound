/**
 * **이 프로젝트의 화면이 지금 써야 할 테마.** 설계 §4.2의 사슬
 * `projects.default_layout_id → layouts.theme_id → themes`를 한 번에 따라간다.
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `repos/`의 함수를 조율할 뿐이다.
 *
 * ---
 *
 * # 왜 `routes/themes.ts`에서 나왔나 (P8-4 T2)
 *
 * **소비자가 셋이 되었다.** `GET /:projectId/theme`(캔버스가 부른다) · `PUT /:projectId/theme`
 * (고르개) · **내보내기**(`services/export-bundle.ts`). 라우트 파일 안의 비공개 함수로
 * 두면 셋째가 그 사슬을 **다시 짜야** 하고, 그러면 캔버스가 보는 테마와 번들이 싣는
 * 테마가 조용히 갈린다 — §11.3의 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*가
 * 렌더러가 아니라 **입력**에서 거짓이 되는 자리다.
 *
 * 옮긴 것은 자리뿐이고 규칙은 그대로다. 라우트는 `app.db`를 넘겨 부른다.
 */
import {
  mergeTheme,
  resolveTheme,
  systemTheme,
  themeIssue,
  type ResolvedTheme,
  type Theme,
  type ThemeIssue,
  type ThemePatch,
} from '@wirebound/themes'
import { findDefaultLayout } from '../repos/layouts'
import { findThemeById } from '../repos/themes'
import type { DbHandle } from '../db/tx'

/**
 * 상속 대상을 **코드에서** 찾는다(P4a-2 계획서 D4 — 코드가 진실이고 DB는 사본이다).
 *
 * DB의 `themes` 행을 보지 않는 이유: 그 행은 동기화가 만든 사본이고, 둘이 갈리면
 * 코드가 이긴다. 사본을 base로 쓰면 해석 결과가 **동기화가 언제 돌았는지에 따라**
 * 달라진다.
 *
 * **`themeIssue`를 쓴다 — 객체 리터럴로 짓지 않는다.** 리터럴은 `severity`를 손으로
 * 박게 되고, 그러면 `routes/themes.ts`의 `assertResolvable`이 딛고 선 문장(*"오늘 테마의
 * 이슈는 전부 `error`다"*)이 이 함수가 만드는 이슈에 대해서만 거짓이 된다. 실제로 그렇게
 * 짰다가 리뷰가 잡았고, `'warning'`으로 바꿔도 api 케이스가 전부 통과했다(구분력 0).
 */
export function resolveThemeBase(theme: Theme): { base: Theme | undefined; missing: ThemeIssue | null } {
  const ref = theme.meta.extends
  if (ref === undefined) return { base: undefined, missing: null }

  const base = systemTheme(ref)
  if (base === undefined) {
    return {
      base: undefined,
      missing: themeIssue(
        'bad-extends',
        'meta.extends',
        `상속 대상 시스템 테마를 찾을 수 없습니다: ${ref}`,
      ),
    }
  }
  return { base, missing: null }
}

/** `currentProjectTheme`이 내는 것. 라우트가 그대로 응답 본문으로 쓴다. */
export interface CurrentProjectTheme {
  themeId: string | null
  theme: Theme | null
  issues: (ThemeIssue | null)[]
}

/**
 * `theme`이 `null`인 경우가 셋이고 전부 정상이다: 기본 레이아웃이 없다(0007 이전
 * 프로젝트 — P4a-3 재라 #8), 레이아웃이 테마를 안 고름, 테마 행이 사라짐. 화면은 구조
 * 기본 CSS만으로 그려진다 — 이미 있는 경로다(`apps/web`의 `theme-source.ts`).
 *
 * 파생 테마면 여기서 `mergeTheme`으로 합쳐 낸다 — 받는 쪽(캔버스·번들)은 유래가
 * 필요 없고 **홀로 서는 테마 하나**를 받는다.
 *
 * **`theme: null`이어도 `themeId`가 있을 수 있다** — 상속이 끊긴 파생을 고른 상태다.
 * 반대로 **테마 행 자체가 사라졌으면 `themeId`도 `null`이다**(가리킬 것이 없다).
 */
export async function currentProjectTheme(
  db: DbHandle,
  projectId: string,
): Promise<CurrentProjectTheme> {
  const layout = await findDefaultLayout(db, projectId)
  if (!layout || layout.themeId === null) return { themeId: null, theme: null, issues: [] }

  const themeId = layout.themeId
  const record = await findThemeById(db, themeId)
  if (!record) return { themeId: null, theme: null, issues: [] }

  const stored = record.theme
  if (stored.meta.extends === undefined) return { themeId, theme: stored, issues: [] }

  const { base, missing } = resolveThemeBase(stored)
  if (base === undefined) {
    return { themeId, theme: null, issues: [missing] }
  }

  const merged = mergeTheme(base, stored as ThemePatch)
  return { themeId, theme: merged.theme, issues: merged.issues }
}

/**
 * `currentProjectTheme`이 낸 `Theme`을 그리는 쪽이 받는 `ResolvedTheme`으로 바꾼다.
 *
 * **소비자가 둘이 되어 여기로 왔다**(P10-2). `exportBundle`은 §11.3의 번들을 위해,
 * `exportPage`는 **PPTX에 실릴 래스터**를 위해 같은 값을 받는다 — 두 자리에서 각자
 * `resolveTheme`을 부르면 *"캔버스가 보는 테마와 산출물이 싣는 테마가 갈린다"*는
 * 이 파일의 존재 이유가 파일 안에서부터 거짓이 된다.
 *
 * **`null`이 정상이다** — 테마를 안 고른 프로젝트는 구조 기본 CSS만으로 그려진다.
 */
export function asResolvedTheme(theme: Theme | null): ResolvedTheme | null {
  if (theme === null) return null
  return resolveTheme(theme).theme
}
