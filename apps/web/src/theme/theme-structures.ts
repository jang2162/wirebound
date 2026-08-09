import type { ResolvedTheme } from '@wirebound/themes'

/**
 * 테마가 고른 구조를 `RenderOptions.structures`가 받는 꼴로 바꾼다.
 *
 * §6.0의 약속 — *"같은 페이지 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도"* —
 * 의 배선이다. **오늘은 컴포넌트마다 구현체가 하나씩뿐이라 갈아 끼울 것이 없다**(P4b가
 * 채운다). 그래도 지금 잇는 것은, 없으면 P4b가 테마를 만들어도 렌더러가 그것을 못 보기
 * 때문이다.
 *
 * **생략된 구조를 여기서 채우지 않는다.** `checkThemeComponents`가 이미
 * `defaultStructure`로 채워 `ResolvedComponent.structure`에 넣었다 — 두 곳에서 채우면
 * 규칙이 둘이 되고 언젠가 갈린다.
 *
 * **테마가 없으면 빈 객체다.** 그때 렌더러는 카탈로그의 첫 구조를 쓴다
 * (`resolveStructureOf`) — 즉 테마 없이도 화면이 그려진다.
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
