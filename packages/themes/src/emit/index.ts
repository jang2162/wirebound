import { cssVarName } from '../resolve/style'
import type { CssDeclaration, ResolvedComponent, ResolvedLayer, ResolvedTheme } from '../resolved'

/**
 * `ResolvedTheme`을 CSS 한 장으로 만든다(§6.11).
 *
 * **여기서 검증하지 않는다.** 해석이 이미 끝났고, 이슈가 하나라도 있으면 `resolveTheme`이
 * `null`을 내므로 이 함수에 오는 것은 통과한 테마뿐이다(D2). 그래서 이 파일은 문자열을
 * 조립하기만 한다 — **CSS 파서를 들이지 않는다.**
 *
 * **`!important`를 붙이지 않는다**(D9). P0 이월이 남긴 결함(구조 구현체가 inline style을
 * 방출해 테마가 캐스케이드에서 진다)은 P4a-2가 걷어낼 것이고, 여기서 `!important`를 쓰면
 * 그때 되돌려야 한다. **그래서 "컴파일된 CSS가 실제로 먹히는가"는 이 패키지가 잴 수 없다** —
 * 브라우저가 없고 jsdom은 캐스케이드를 계산하지 않는다. P4a-2가 잰다.
 *
 * **결정적이다.** 같은 입력이 같은 문자열을 낸다(§6.11: *"동일한 컴파일러를 쓰므로 결과가
 * 같다"*). 근거는 이 함수가 순회하는 것(`tokens`·`primitives`·`components`·`breakpoints`)이
 * `Map`이고 그 순회 순서를 그대로 쓴다는 것이다. 그 `Map`은 문서의 객체 키 순서로
 * 채워지는데, 자바스크립트는 **정수형 키를 먼저 오름차순으로 돌리고 나머지를 삽입 순서로
 * 돌린다** — `JSON.parse('{"z":1,"2":2}')`의 키가 `["2","z"]`인 것을 쟀다. 순서가 계약인
 * 자리는 그 갈래에 걸리지 않는다: 상태·변형·컴포넌트 이름은 카탈로그가 선언한 것이고
 * 브레이크포인트 이름은 규격이 글자로 시작하기를 요구한다. 그래서 문서에 적힌 순서가
 * 그대로 남고, 브레이크포인트만 폭으로 다시 정렬한다.
 *
 * ---
 *
 * **이 계약은 메모리 안에서만 성립한다. 저장을 거치면 무너진다.**
 *
 * 설계 §4.2가 테마의 절을 `jsonb`로 두는데 **Postgres `jsonb`는 객체 키 순서를 보존하지
 * 않는다.** 컨테이너에 직접 캐스팅해 쟀다(PostgreSQL 16.14):
 *
 * ```
 * '{"selected":1,"disabled":2,"loading":3,"empty":4}'::jsonb
 *   → {"empty": 4, "loading": 3, "disabled": 2, "selected": 1}
 * '{"featured":1,"compact":2,"default":3}'::jsonb  → {"compact", "default", "featured"}
 * '{"sm":640,"md":768,"lg":1024}' 와 '{"md":768,"sm":640,"lg":1024}'  → 둘 다 {"lg","md","sm"}
 * ```
 *
 * 키가 **(길이, 바이트)로 정규화**된다. `List`의 상태를 `selected, disabled` 순으로 적어도
 * 저장을 거치면 뒤집히므로, **둘이 같은 프로퍼티를 건드릴 때 이기는 쪽이 바뀐다.**
 * 브레이크포인트는 여기서 폭으로 다시 정렬하므로 면역이고, 노출되는 것은 `states`·
 * `variants`·`parts`·`components` 순서다.
 *
 * **오늘 테마를 저장하는 코드는 없다** — 그래서 여기서 고치지 않는다. 계약을 바꾸려면
 * 저장의 맥락이 필요하고 **그것은 P4a-3이 재서 정한다.**
 */
export function compileTheme(resolved: ResolvedTheme): string {
  const blocks: string[] = []

  const root: CssDeclaration[] = [
    ...[...resolved.tokens].map(([path, value]) => [cssVarName(path), value] as const),
    ...[...resolved.primitives].map(([path, value]) => [cssVarName(path), value] as const),
  ]
  pushRule(blocks, ':root', root)

  for (const [type, component] of resolved.components) {
    pushComponent(blocks, type, component)
  }

  pushResponsive(blocks, resolved)

  return blocks.join('\n')
}

/**
 * 컴포넌트 하나. 순서가 곧 우선순위다 — 같은 특이도에서는 나중에 온 규칙이 이긴다.
 *
 * **재라 #7(변형과 상태가 같은 조각을 건드릴 때): 상태가 이긴다.** 그래서 변형을 먼저 낸다.
 * 근거는 §6.5가 둘을 가른 방식이다 — `variants`는 *"노드가 `variant`로 선택하는 표현 변형"*
 * 이라 그 노드에 붙박이고, `states`는 *"노드 props에서 파생되는 상태 스킨"*이라 같은 노드
 * 위에서 켜졌다 꺼진다. 같은 절이 상태의 쓸모를 *"'선택된 행 강조' 같은 서술을 목업에서
 * 실제로 보여주려면"*이라고 적었는데, 변형이 상태를 덮으면 그 서술이 보이지 않는다.
 * 두 셀렉터의 속성 개수가 같다는 것(=특이도가 같다)은 케이스가 세어 확인한다. **다만
 * "뒤에 온 것이 이긴다"는 CSS 규칙 자체는 이 패키지가 재지 못한다** — 브라우저가 없다.
 */
function pushComponent(blocks: string[], type: string, component: ResolvedComponent): void {
  const root = `[data-wb-component="${type}"]`

  pushRule(blocks, `${root}[data-wb-structure="${component.structure}"]`, component.base)
  for (const [part, declarations] of component.parts) {
    pushRule(blocks, `${root} [data-wb-part="${part}"]`, declarations)
  }

  for (const [name, layer] of component.variants) {
    pushLayer(blocks, `${root}[data-wb-variant="${name}"]`, layer)
  }
  // `~=`다 — `data-wb-state`가 공백 구분 목록이라(§6.11) `=`면 상태가 둘일 때 맞지 않는다.
  for (const [name, layer] of component.states) {
    pushLayer(blocks, `${root}[data-wb-state~="${name}"]`, layer)
  }
}

/**
 * 브레이크포인트 블록. **재라 #3의 답이 여기 있다.**
 *
 * **방향은 `max-width`이고 값은 선언된 것을 그대로 쓴다.** §6.11의 예시가 `md: 768`에
 * `@media (max-width: 768px)`를 냈다. `767px`로 한 칸 내리지 않는 이유는 §9의 뷰포트 프리셋에
 * `768`이 그대로 있어서다 — 그 프리셋으로 바꾼 사람은 `md` 스타일을 보려는 것인데,
 * 경계를 내리면 그 폭에서 데스크톱 스타일이 보인다.
 *
 * **넓은 것부터 낸다.** desktop-first에서 `max-width` 조건은 서로 겹친다 — `sm: 640`·`md: 768`
 * 이면 폭 640 이하는 **두 블록이 모두 맞는다.** 겹침이 결함이 아니라 그 방식이고, 좁은 것이
 * 나중에 와야 이긴다. 그래서 문서에 적힌 순서가 아니라 **폭 내림차순**으로 정렬한다.
 * 폭 769 이상은 어느 블록도 맞지 않고 바깥 규칙이 그대로 남는다 — 틈이 아니라 기준선이다.
 * (케이스가 폭을 넣어 겹침과 틈을 확인한다.)
 */
function pushResponsive(blocks: string[], resolved: ResolvedTheme): void {
  const ordered = [...resolved.breakpoints].sort(([, a], [, b]) => b - a)
  for (const [name, width] of ordered) {
    const inner: string[] = []
    for (const [type, component] of resolved.components) {
      const layer = component.responsive.get(name)
      if (layer === undefined) continue
      pushLayer(inner, `[data-wb-component="${type}"][data-wb-structure="${component.structure}"]`, layer, `[data-wb-component="${type}"]`)
    }
    if (inner.length === 0) continue
    blocks.push(`@media (max-width: ${width}px) {\n${indent(inner.join('\n'))}\n}`)
  }
}

/** 층 하나 — 루트 스킨과 조각 스킨. 빈 층은 규칙을 내지 않는다. */
function pushLayer(
  blocks: string[],
  selector: string,
  layer: ResolvedLayer,
  partScope = selector,
): void {
  pushRule(blocks, selector, layer.base)
  for (const [part, declarations] of layer.parts) {
    pushRule(blocks, `${partScope} [data-wb-part="${part}"]`, declarations)
  }
}

/** 선언이 하나도 없으면 규칙을 내지 않는다 — 빈 셀렉터가 CSS에 남지 않게 한다. */
function pushRule(blocks: string[], selector: string, declarations: readonly CssDeclaration[]): void {
  if (declarations.length === 0) return
  const body = declarations.map(([property, value]) => `  ${property}: ${value};`).join('\n')
  blocks.push(`${selector} {\n${body}\n}`)
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n')
}
