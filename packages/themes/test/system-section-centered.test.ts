/**
 * **시스템 테마의 `Section`은 가둔 칼럼을 가운데로 둔다.**
 *
 * 설계서 「컴포넌트 카탈로그」가 `Section`을 *"화면 전체 폭 배경 + 가운데 정렬된 콘텐츠"*로 정한다. `inner`에
 * `maxWidth`만 걸고 `marginX: 'auto'`를 빠뜨리면 뷰포트가 그 폭보다 넓을 때 칼럼이 왼쪽에 붙는데, 그것은
 * 아무 검증도 실패시키지 않는다 — 근거와 실브라우저로 다시 재는 법은 `src/system/admin.ts`의 `Section` 주석에 있다.
 *
 * **테마의 값을 잰다 — 레이아웃이 아니다.** 이 파일은 DOM 없이 돌고 jsdom 도 레이아웃을 하지 않으므로,
 * 화면에서 실제로 가운데 오는지는 여기서 못 잰다. `marginX` 대신 다른 수단(`justifySelf` 등)으로 가운데를
 * 만든 테마는 여기서 빨강이 된다 — 그때는 이 자를 고쳐야 한다. 사용자 테마는 재지 않는다.
 */
import { describe, expect, it } from 'vitest'
import { SYSTEM_THEME_IDS, systemTheme } from '../src/system/index'

/** `Section`의 기본 층과 반응형 층에서 `inner` 스타일을 모두 모은다 — 어느 층에서 폭을 걸든 짝을 본다. */
function innerLayers(id: string): Array<{ where: string; style: Record<string, unknown> }> {
  const section = systemTheme(id)?.components?.['Section']
  if (section === undefined) throw new Error(`${id} 테마에 Section이 없다`)
  const layers: Array<{ where: string; style: Record<string, unknown> }> = []
  const base = section.parts?.['inner']
  if (base !== undefined) layers.push({ where: 'parts.inner', style: base })
  for (const [breakpoint, layer] of Object.entries(section.responsive ?? {})) {
    const inner = layer.parts?.['inner']
    if (inner !== undefined) layers.push({ where: `responsive.${breakpoint}.parts.inner`, style: inner })
  }
  return layers
}

describe('시스템 테마의 Section', () => {
  it.each(SYSTEM_THEME_IDS)('%s: inner에 maxWidth를 걸면 marginX가 auto다', (id) => {
    const bounded = innerLayers(id).filter((layer) => layer.style['maxWidth'] !== undefined)
    // 양성 대조: 폭을 거는 층이 실제로 있다. 없으면 아래 단언은 빈 배열에서 초록이다.
    expect(bounded.length).toBeGreaterThan(0)
    expect(bounded.map((layer) => [layer.where, layer.style['marginX']])).toEqual(
      bounded.map((layer) => [layer.where, 'auto']),
    )
  })
})
