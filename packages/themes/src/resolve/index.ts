import { partitionIssues } from '@wirebound/schema'
import type { ThemeIssue } from '../issue'
import { issue } from '../issue'
import type { ResolvedTheme } from '../resolved'
import { checkAssets } from '../spec/assets'
import { checkThemeComponents } from '../spec/components'
import { checkPatterns } from '../spec/patterns'
import { checkPrimitives } from '../spec/primitives'
import { ThemeSchema, type Theme } from '../spec/theme'
import { ThemePatchSchema, mergeTheme, type ThemePatch } from './merge'
import { cssVarName } from './style'
import { resolveTokens } from './tokens'

/**
 * 테마 문서 하나를 해석해 `ResolvedTheme`을 낸다. **던지지 않는다** — 이슈를 모아서 낸다.
 *
 * **입력을 `unknown`으로 받는다.** `Theme`으로 받지 않는 이유가 둘이다. (1) 파생 문서는
 * `Theme`이 아니다 — 규격은 `null`을 받지 않는데 설계서 「상속과 병합」은 `null`이 삭제
 * 지시라고 한다. (2) 이 함수가 **경계**다. 조각 검증기들은 zod를 통과한 값을 받는 것이
 * 계약이라 그 앞에 아무것도 없으면 계약 밖 입력이 그대로 들어간다. 여기서 파싱하면 `null`·`42`·
 * 배열 같은 것이 **이슈가 되어** 나간다(케이스로 고정했다).
 *
 * 층을 **끝까지 다 돈다.** 토큰이 깨져도 primitives·components·patterns를 마저 보고 이슈를
 * 모은다 — 저작 UI가 한 번에 고칠 수 있어야 한다. 그래서 **토큰 하나가
 * 깨지면 그것을 가리키는 스타일마다 `unknown-token`이 따라 나온다.** 근원을 가리는 것이
 * 아니라 함께 보이는 쪽을 골랐다.
 *
 * **`error`가 하나라도 있으면 `theme`은 `null`이다** — 반쯤 해석된 것을 내보내면 `emit`이
 * 그것을 CSS로 만든다. `warning`(`suspicious-literal`·`node-handle-overwrite`)은 해석을
 * 막지 않는다.
 *
 * **선을 긋는 것은 `partitionIssues` 하나다**(`schema`). 여기서 `filter`를 다시 쓰면
 * `apps/api`의 `assertResolvable`·`edit-pipeline`과 갈릴 수 있고, 그 함수의 머리말이
 * *"이 선을 긋는 코드는 이 함수 하나뿐이어야 한다"*고 못박아 두었다.
 *
 * **경고는 `issues`에 그대로 실려 나간다** — `theme`이 `null`이 아니어도 비지 않는다.
 * 삼키면 severity를 만든 이유가 사라진다.
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

  // **컴포넌트 스타일이 primitives를 가리킬 수 있게 하는 배선이다.**
  // 넘기는 것은 값이 아니라 **선언된 경로의 집합**이다 — 값을 넘기면 컴파일러가
  // 그것을 인라인하고 싶어지는데, 그 참조는 `var(--wb-<경로>)`로 낸다
  // (파생 테마가 primitives만 덮어써도 컴포넌트 스타일이 따라온다).
  const components = checkThemeComponents(
    theme.components ?? {},
    tokens.table,
    [...primitives.breakpoints.keys()],
    new Set(primitives.values.keys()),
  )
  issues.push(...components.issues)

  const patterns = checkPatterns(theme.patterns ?? {})
  issues.push(...patterns.issues)

  // **`assets`도 검사한다.** `compileTheme`이 그것으로 `@font-face`를 내므로 **CSS로 나가는
  // 문자열**이고, 다른 스타일 값과 같은 탈출 검사를 지나야 한다(`checkAssets`의 머리말).
  issues.push(...checkAssets(theme.assets))

  issues.push(...collidingVariables(tokens.table, primitives.values))

  if (partitionIssues(issues).errors.length > 0) return { theme: null, issues }

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

/**
 * 서로 다른 경로가 같은 CSS 변수 이름으로 접히는지 본다.
 *
 * `cssVarName`이 경로의 `.`을 `-`로 바꾸는데 **토큰 이름 자체가 `.`과 `-`를 모두 쓸 수
 * 있다** — 설계서 「tokens — 3단 분리」의 `palette` 키가 `"blue.500"`인 것이 그 예다. 그래서
 * `blue.500`과 `blue-500`이 같은 변수가 되고, 이 검사가 없으면 이슈 없이 `:root`에 같은
 * 이름이 두 번 나간다.
 * CSS는 나중 선언이 이기므로 앞의 토큰이 조용히 사라진다.
 *
 * 두 층을 합쳐서 본다. 토큰 경로는 이름공간(`palette`·`semantic`·…)으로 시작하고
 * primitives는 `container`·`grid`·`section`으로 시작하므로 지금 카탈로그에서 층을 가로지르는
 * 충돌은 만들지 못했지만, 검사를 한 층으로 좁힐 근거가 없어 합집합에서 돈다.
 */
function collidingVariables(
  tokens: ReadonlyMap<string, string>,
  primitives: ReadonlyMap<string, string>,
): ThemeIssue[] {
  const seen = new Map<string, string>()
  const issues: ThemeIssue[] = []
  for (const path of [...tokens.keys(), ...primitives.keys()]) {
    const name = cssVarName(path)
    const previous = seen.get(name)
    if (previous === undefined) {
      seen.set(name, path)
      continue
    }
    issues.push(
      issue(
        'duplicate-variable',
        path,
        `${previous}와 ${path}가 같은 CSS 변수 이름 ${name}으로 접힙니다 — 둘 중 하나의 이름을 바꾸세요`,
      ),
    )
  }
  return issues
}
