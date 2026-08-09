import type { ThemeIssue } from '../issue'
import { issue } from '../issue'
import type { ResolvedTheme } from '../resolved'
import { checkThemeComponents } from '../spec/components'
import { checkPatterns } from '../spec/patterns'
import { checkPrimitives } from '../spec/primitives'
import { ThemeSchema, type Theme } from '../spec/theme'
import { ThemePatchSchema, mergeTheme, type ThemePatch } from './merge'
import { resolveTokens } from './tokens'

/**
 * 테마 문서 하나를 해석해 `ResolvedTheme`을 낸다. **던지지 않는다** — 이슈를 모아서 낸다.
 *
 * **입력을 `unknown`으로 받는다.** 계획서의 시그니처는 `(theme: Theme, base?: Theme)`였지만
 * 두 가지가 그것을 막는다. (1) 파생 문서는 `Theme`이 아니다 — 재라 #5에서 규격이 `null`을
 * 받지 않는 것을 쟀고 §6.9는 `null`이 삭제 지시라고 한다. (2) 이 함수가 **경계**다.
 * 웨이브 1이 남긴 관찰 그대로, 조각 검증기들은 zod를 통과한 값을 받는 것이 계약이라
 * 그 앞에 아무것도 없으면 계약 밖 입력이 그대로 들어간다. 여기서 파싱하면 `null`·`42`·
 * 배열 같은 것이 **이슈가 되어** 나간다(케이스로 고정했다).
 *
 * 층을 **끝까지 다 돈다.** 토큰이 깨져도 primitives·components·patterns를 마저 보고 이슈를
 * 모은다 — P4c의 저작 UI가 한 번에 고칠 수 있어야 한다(D2의 이유 1). 그래서 **토큰 하나가
 * 깨지면 그것을 가리키는 스타일마다 `unknown-token`이 따라 나온다.** 근원을 가리는 것이
 * 아니라 함께 보이는 쪽을 골랐다.
 *
 * 이슈가 하나라도 있으면 `theme`은 `null`이다 — 반쯤 해석된 것을 내보내면 `emit`이
 * 그것을 CSS로 만든다.
 */
export function resolveTheme(
  document: unknown,
  base?: Theme,
): { theme: ResolvedTheme | null; issues: ThemeIssue[] } {
  const prepared = prepare(document, base)
  if (prepared.theme === null) return { theme: null, issues: prepared.issues }

  const theme = prepared.theme
  const issues: ThemeIssue[] = []

  const tokens = resolveTokens(theme.tokens ?? {})
  issues.push(...tokens.issues)

  const primitives = checkPrimitives(theme.primitives ?? {}, tokens.table)
  issues.push(...primitives.issues)

  const components = checkThemeComponents(
    theme.components ?? {},
    tokens.table,
    [...primitives.breakpoints.keys()],
  )
  issues.push(...components.issues)

  const patterns = checkPatterns(theme.patterns ?? {})
  issues.push(...patterns.issues)

  if (issues.length > 0) return { theme: null, issues }

  return {
    theme: {
      meta: theme.meta,
      tokens: tokens.table,
      primitives: primitives.values,
      breakpoints: primitives.breakpoints,
      components: components.resolved,
      patterns: new Map(Object.entries(theme.patterns ?? {})),
      ...(theme.assets === undefined ? {} : { assets: theme.assets }),
    },
    issues,
  }
}

/**
 * 문서를 `Theme`으로 만든다 — 파생이면 병합하고, 아니면 규격만 본다.
 *
 * `base`를 준 것과 `extends`를 선언한 것이 **어긋나면 이슈다.** 한쪽만 있으면 부르는 쪽이
 * 관계를 잘못 안 것이고, 조용히 한쪽을 무시하면 그 오해가 화면까지 간다.
 */
function prepare(
  document: unknown,
  base: Theme | undefined,
): { theme: Theme | null; issues: ThemeIssue[] } {
  // 먼저 `ThemePatchSchema`로 본다. 절 안쪽을 `unknown`으로 두므로 파생 문서와 평범한
  // 테마를 **둘 다** 통과시키고, `meta.extends`를 읽어 어느 쪽인지 가를 수 있다.
  const envelope = ThemePatchSchema.safeParse(document)
  if (!envelope.success) return { theme: null, issues: specIssues(envelope.error.issues) }

  const declaresExtends = envelope.data.meta.extends !== undefined
  if (declaresExtends !== (base !== undefined)) {
    return {
      theme: null,
      issues: [
        issue(
          'bad-extends',
          'meta.extends',
          declaresExtends
            ? '상속을 선언한 문서를 해석하려면 상속 대상 테마가 필요합니다'
            : '상속을 선언하지 않은 문서에 상속 대상이 주어졌습니다',
        ),
      ],
    }
  }

  if (base !== undefined) return mergeTheme(base, envelope.data as ThemePatch)

  const parsed = ThemeSchema.safeParse(document)
  if (!parsed.success) return { theme: null, issues: specIssues(parsed.error.issues) }
  return { theme: parsed.data, issues: [] }
}

function specIssues(entries: readonly { path: readonly PropertyKey[]; message: string }[]): ThemeIssue[] {
  return entries.map((entry) =>
    issue('bad-spec', entry.path.join('.'), `테마 규격을 지키지 않습니다: ${entry.message}`),
  )
}
