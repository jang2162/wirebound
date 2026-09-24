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
 *
 * **폭의 값은 보지 않는다 — `maxWidth`가 걸렸는지만 본다.** `admin`은 `container.maxWidth`가 `none`이라 칼럼이
 * 가둬지지 않고 `marginX: 'auto'`는 0 으로 계산된다(실브라우저 1920 폭 좌우 간격 0 / 0). 뜻은 없지만 무해하므로
 * 그대로 요구한다: 그 폭은 `:root` 변수 하나이고 `primitives`만 덮는 파생 테마가 그것을 유한한 폭으로 바꾸는 순간
 * 가운데 정렬이 필요해진다. 그래서 `admin`이 fluid 라는 사실은 이 자가 아니라 아래 `admin의 컨테이너` 케이스가 잠근다.
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { SYSTEM_THEME_IDS, systemTheme } from '../src/system/index'

beforeAll(() => {
  // `resolveTheme`이 컴포넌트를 카탈로그와 대조한다 — 없으면 전부 `unknown-component`다.
  installCatalog()
})

/**
 * `Section`의 `inner`가 층마다 **실제로 갖는** 스타일 — 기본 층, 그리고 변형 · 상태 · 반응형 층을 하나씩 기본 층
 * **위에 겹친 것.** CSS 에서 그 층들은 기본 규칙 뒤에 와서 적은 속성만 덮으므로, 층을 따로 보면 `marginX`만 덮은 층
 * (`responsive.md.parts.inner: { marginX: '0' }`)이 `maxWidth`가 없다는 이유로 빠져 그 폭에서 칼럼이 왼쪽에
 * 붙어도 초록이 된다(실브라우저: `docs`에 그 줄을 심으면 880 폭에서 좌 0 / 우 112). 층 둘 이상이 함께 걸리는
 * 조합은 겹치지 않는다.
 */
function innerLayers(id: string): Array<{ where: string; style: Record<string, unknown> }> {
  const section = systemTheme(id)?.components?.['Section']
  if (section === undefined) throw new Error(`${id} 테마에 Section이 없다`)
  const base = section.parts?.['inner']
  const layers: Array<{ where: string; style: Record<string, unknown> }> = []
  if (base !== undefined) layers.push({ where: 'parts.inner', style: base })
  for (const kind of ['variants', 'states', 'responsive'] as const) {
    for (const [name, layer] of Object.entries(section[kind] ?? {})) {
      const inner = layer.parts?.['inner']
      if (inner !== undefined) layers.push({ where: `${kind}.${name}.parts.inner`, style: { ...base, ...inner } })
    }
  }
  return layers
}

describe('시스템 테마의 Section', () => {
  it.each(SYSTEM_THEME_IDS)('%s: inner에 maxWidth가 걸린 층마다 marginX가 auto다', (id) => {
    const bounded = innerLayers(id).filter((layer) => layer.style['maxWidth'] !== undefined)
    // 양성 대조: 폭을 거는 층이 실제로 있다. 없으면 아래 단언은 빈 배열에서 초록이다.
    expect(bounded.length).toBeGreaterThan(0)
    expect(bounded.map((layer) => [layer.where, layer.style['marginX']])).toEqual(
      bounded.map((layer) => [layer.where, 'auto']),
    )
  })
})

/**
 * **`admin`은 칼럼 폭을 가두지 않는다.** 설계서 「primitives — 사이트 골격」: *"관리자 화면은 `maxWidth: fluid`에 좁은
 * 섹션 여백을, 마케팅 사이트는 `1200px`에 넉넉한 여백을 쓴다."* `fluid`는 CSS 값이 아니어서 `none`으로 적는다 — 그
 * 까닭은 `src/system/admin.ts`의 `primitives` 주석에 있다. 위 자는 폭의 값을 안 보므로 이 값을 잠그는 자리는 여기
 * 하나다.
 */
describe('admin의 컨테이너', () => {
  it('fluid다 — container.maxWidth가 none으로 :root에 나간다', () => {
    expect(systemTheme('admin')?.primitives?.container?.maxWidth).toBe('none')
    const { theme, issues } = resolveTheme(systemTheme('admin')!)
    expect(issues).toEqual([])
    expect(compileTheme(theme!)).toContain('--wb-container-maxWidth: none;')
  })
})
