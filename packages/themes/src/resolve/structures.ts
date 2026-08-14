import type { ResolvedTheme } from '../resolved'

/**
 * 테마가 고른 구조를 **컴포넌트 타입 → 구조 이름** 표로 낸다.
 *
 * §6.0의 약속 — *"같은 페이지 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도"* —
 * 의 배선이다. 렌더러의 `RenderOptions.structures`가 이 꼴을 받는다.
 *
 * ---
 *
 * **왜 `themes`에 있나 — 부르는 곳이 셋이기 때문이다.**
 *
 * P8-1까지 이 함수는 `apps/web/src/theme/theme-structures.ts`에 있었다. 거기 두면 화면만
 * 부를 수 있는데, **§11.3의 정적 번들도 같은 표를 써야 화면과 같은 것을 그린다** —
 * `packages/exporter`는 `apps/web`을 볼 수 없으므로 사본을 만들게 되고, 그 사본은 P8-3의
 * api 라우트에서 셋째가 된다. P7-3 이월 §8.2 규칙 1이 그 부류에 이름을 붙여 뒀다:
 * *"판정을 두 벌 두지 마라 — 화면·서버·번들이 같은 함수를 부르게 하라."*
 *
 * **의존 방향은 그대로다.** 이 함수가 받는 것은 `ResolvedTheme`이고 내는 것은 평범한
 * 레코드다 — `renderer`도 `react`도 보지 않는다(§3.3, `test/public-api.test.ts`가 지킨다).
 * 반환 타입이 렌더러의 옵션에 맞는 것은 우연이 아니라 **그 옵션이 평범한 레코드이기
 * 때문**이고, 두 이름이 실제로 이어지는지는 `apps/web`의 케이스가 대조한다.
 *
 * ---
 *
 * **생략된 구조를 여기서 채우지 않는다.** `checkThemeComponents`가 이미 `defaultStructure`로
 * 채워 `ResolvedComponent.structure`에 넣었다 — 두 곳에서 채우면 규칙이 둘이 되고 언젠가
 * 갈린다.
 *
 * **테마가 없으면 빈 객체다.** 그때 렌더러는 카탈로그의 첫 구조를 쓴다
 * (`resolveStructureOf`) — 즉 테마 없이도 화면이 그려지고, 번들도 마찬가지다.
 *
 * **`Object.create(null)`로 만든다.** 키가 문서·테마에서 오는 문자열이라 평범한 객체면
 * `structures['toString']`이 물려받은 함수를 집어 온다. 읽는 쪽
 * (`options.structures?.[def.type]`)이 그것을 구조 이름으로 다루면 무엇이 그려지는지
 * 알 수 없다 — P4a-1이 프로토타입 키로 306조합을 잰 자리와 같은 부류다.
 */
export function themeStructures(theme: ResolvedTheme | null): Record<string, string> {
  const structures = Object.create(null) as Record<string, string>
  if (theme === null) return structures

  for (const [type, component] of theme.components) {
    structures[type] = component.structure
  }
  return structures
}
