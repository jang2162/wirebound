/**
 * `theme-node-variant` — 설계서 「lint 규칙」의 *"노드가 쓰는 `variant`를 테마가 정의하지 않음"*.
 * **테마 lint가 `resolveTheme`에 기대지 않고 새로 하는 판정 하나**다.
 *
 * 테마가 `primary`만 정의한 상태에서 `variant: 'danger'`인 노드를 심으면 `resolveTheme`도
 * `validatePage`도 **이슈 0건**이다 — 두 문서를 함께 보는 자리가 이것뿐이다.
 *
 * ## 테마가 그 컴포넌트를 아예 안 꾸미면 내지 않는다
 *
 * 테마가 모든 컴포넌트를 꾸밀 의무는 없다 — 안 꾸민 것은 구조 기본 CSS로 그려지고 그것이
 * 정상 경로다(`snapshot/payload.ts`의 *"`theme`이 `null`인 것은 정상이다"*와 같은 태도).
 * 그 자리에서까지 내면 **테마 하나가 카탈로그 전체를 덮어야 조용해지고**, 그것은 설계서
 * 「테마 시스템」이 정한
 * 규격이 아니다. 결함은 *"꾸미기는 하는데 이 변형만 빠졌다"*일 때 생긴다 — 그때 그 노드는
 * **형제 노드와 다르게 보이는데 이유가 문서 어디에도 없다.**
 *
 * ## 파생 변형(`variantFrom`)은 보지 않는다 — 못박아 둔 구멍이다
 *
 * `Text`·`Divider`·`Field`는 `variantFrom`을 선언해 **prop에서 변형을 파생한다.** 그 파생
 * 규칙(*"`variantFrom`이 `node.variant`를 이긴다"*)의 구현은 `packages/renderer`의
 * `attrs.ts`에 있고 **`themes`는 `renderer`를 볼 수 없다**(「각 패키지의 책임과 의존」). 여기 옮겨 적으면
 * *"무엇이 이 노드의 변형인가"*가 두 벌이 되고, 갈리는 날 lint가 **화면에 닿지도 않는 값**을
 * 두고 경고한다.
 *
 * 그래서 **안 본다**를 케이스로 고정했다(`test/lint-theme.test.ts`). 메우려면 파생 규칙이
 * 순수 패키지에 한 자리로 서야 하고, 그것은 `renderer`를 건드리는 일이다.
 */
import {
  DocumentEnvelopeSchema,
  getComponent,
  lintIssue,
  walkNodes,
  type LintIssue,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import type { ResolvedTheme } from '../resolved'
import type { LintThemeEntry } from './input'

export function nodeVariantIssues(entry: LintThemeEntry, theme: ResolvedTheme): LintIssue[] {
  const pages = entry.pages ?? []
  if (pages.length === 0) return []

  const issues: LintIssue[] = []

  for (const page of pages) {
    // 봉투가 깨진 문서는 **돌 수 없다**(아래 `walkable`의 머리말).
    if (!walkable(page.document)) continue

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
 * 이 문서를 `walkNodes`로 돌 수 있는가.
 *
 * **lint는 남이 준 것을 읽는 도구다** — `wireb pull`이 받은 JSON도 MCP가 받은 본문도
 * `JSON.parse`의 결과라 타입이 막아 주지 않는다. 돌기 전에 묻지 않으면 `root`가 없는 문서
 * 하나가 **프로젝트 전체의 lint를 예외로 끝낸다.** `declaredVariant`가 값의 타입을 믿지
 * 않는 것과 같은 태도를 문서 자체에도 적용한다.
 *
 * **묻는 자리는 `DocumentEnvelopeSchema` 하나다** — `validate.ts`의 `validateEnvelope`가
 * 보는 것과 **같은 규격**이다. 여기서 조건을 손으로 적으면 두 벌이 되고, 갈리는 날 한쪽이
 * 돌 수 있다고 한 문서에서 다른 쪽이 터진다.
 *
 * **깨졌다는 사실을 여기서 이슈로 내지 않는다.** 그것은 문서의 결함이고 「lint 규칙」의 설계서
 * 규칙(`document-invalid`)이 낸다 — `lintProject`에서 `lintDesign`이 같은 페이지를 보고
 * 이미 말한다. 여기서 함께 내면 **설계서 규칙이 `themes` 소유로 새어** *"표를 덮는다"*
 * 케이스가 owner를 두고 죽는다.
 */
function walkable(document: PageDocument): boolean {
  return DocumentEnvelopeSchema.safeParse(document).success
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
 * **카탈로그가 그 변형 자체를 거부하는 경우도 `null`이다.** 그때 `validatePage`가 이미
 * `unknown-variant`를 `error`로 낸다 — 여기서 또 말하면 **한 노드의 같은 필드를 두 severity로**
 * 말하는 목록이 되고, `wireb lint`가 severity로 종료 코드를 가를 때 읽는 사람이 *"고칠 것이
 * 하나인가 둘인가"*를 판단해야 한다. 고칠 자리도 같다 — 둘 다 `variant` 한 글자다.
 * 이 규칙이 말해야 하는 것은 *"카탈로그는 아는데 **테마가** 안 꾸몄다"*뿐이다.
 *
 * 문자열이 아니면 `null`이다 — lint는 서버 검증 전 문서를 받을 수 있으므로 값의 타입을
 * 믿지 않는다(`renderer`의 `variantOf`와 같은 태도).
 */
function declaredVariant(node: WbNode): string | null {
  const def = getComponent(node.type)
  if (def === undefined || def.variantFrom !== undefined) return null
  if (typeof node.variant !== 'string' || node.variant.length === 0) return null
  return def.variants.includes(node.variant) ? node.variant : null
}
