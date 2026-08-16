/**
 * ⑪ *"노드가 쓰는 `variant`를 테마가 정의하지 않음"* — **이 슬라이스가 새로 짠 판정 하나**다.
 *
 * T1에서 쟀다: 테마가 `primary`만 정의한 상태에서 `variant: 'danger'`인 노드를 심으면
 * `resolveTheme`도 `validatePage`도 **이슈 0건**이다. 두 문서를 함께 보는 자리가 없었다.
 *
 * ## 테마가 그 컴포넌트를 아예 안 꾸미면 내지 않는다
 *
 * 테마가 모든 컴포넌트를 꾸밀 의무는 없다 — 안 꾸민 것은 구조 기본 CSS로 그려지고 그것이
 * 정상 경로다(`resolve/index.ts`의 *"`theme`이 `null`인 것은 정상이다"*와 같은 태도).
 * 그 자리에서까지 내면 **테마 하나가 카탈로그 전체를 덮어야 조용해지고**, 그것은 §6이 정한
 * 규격이 아니다. 결함은 *"꾸미기는 하는데 이 변형만 빠졌다"*일 때 생긴다 — 그때 그 노드는
 * **형제 노드와 다르게 보이는데 이유가 문서 어디에도 없다.**
 *
 * ## 파생 변형(`variantFrom`)은 보지 않는다 — 못박아 둔 구멍이다
 *
 * `Text`·`Divider`·`Field`는 `variantFrom`을 선언해 **prop에서 변형을 파생한다.** 그 파생
 * 규칙(*"`variantFrom`이 `node.variant`를 이긴다"*)의 구현은 `packages/renderer`의
 * `attrs.ts`에 있고 **`themes`는 `renderer`를 볼 수 없다**(§3.3). 여기 옮겨 적으면
 * *"무엇이 이 노드의 변형인가"*가 두 벌이 되고, 갈리는 날 lint가 **화면에 닿지도 않는 값**을
 * 두고 경고한다.
 *
 * 그래서 **안 본다**를 케이스로 고정했다(`test/lint-theme.test.ts`). 메우려면 파생 규칙이
 * 순수 패키지에 한 자리로 서야 하고, 그것은 `renderer`를 건드리는 일이라 이 슬라이스 밖이다
 * (이월에 적었다).
 */
import { getComponent, lintIssue, walkNodes, type LintIssue, type WbNode } from '@wirebound/schema'
import type { ResolvedTheme } from '../resolved'
import type { LintThemeEntry } from './input'

export function nodeVariantIssues(entry: LintThemeEntry, theme: ResolvedTheme): LintIssue[] {
  const pages = entry.pages ?? []
  if (pages.length === 0) return []

  const issues: LintIssue[] = []

  for (const page of pages) {
    for (const { node, path } of walkNodes(page.document.root)) {
      const variant = declaredVariant(node)
      if (variant === null) continue

      const component = theme.components.get(node.type)
      // 테마가 이 컴포넌트를 아예 안 꾸민다 — 위 머리말.
      if (component === undefined) continue
      if (component.variants.has(variant)) continue

      issues.push(
        lintIssue(
          'theme-node-variant',
          { themeId: entry.id, pageId: page.id, nodeId: node.id },
          `${path}/variant`,
          `테마 ${entry.id}가 ${node.type}의 변형 ${variant}를 정의하지 않았습니다`,
        ),
      )
    }
  }

  return issues
}

/**
 * 노드가 **문서에 적은** 변형. 없으면 `null`이다.
 *
 * **`variantFrom`을 선언한 컴포넌트는 `null`이다** — 그 컴포넌트에서 `node.variant`는
 * 화면에 닿지 않고(`validate.ts`의 `ignored-variant`가 그 사실을 이미 말한다) 실제 변형은
 * prop에서 파생되는데, 그 파생 규칙을 여기 옮겨 적지 않는다(위 머리말). 읽는 것은
 * **카탈로그의 선언**(`ComponentDef.variantFrom`)뿐이고 파생 자체는 하지 않는다.
 *
 * 카탈로그에 없는 타입도 `null`이다 — 대조할 선언이 없고, 그 사실은 `unknown-type`이
 * 이미 말한다(`lintDesign`이 나른다).
 *
 * 문자열이 아니면 `null`이다 — lint는 서버 검증 전 문서를 받을 수 있으므로 값의 타입을
 * 믿지 않는다(`renderer`의 `variantOf`와 같은 태도).
 */
function declaredVariant(node: WbNode): string | null {
  const def = getComponent(node.type)
  if (def === undefined || def.variantFrom !== undefined) return null
  return typeof node.variant === 'string' && node.variant.length > 0 ? node.variant : null
}
