import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { SYSTEM_THEME_IDS, systemTheme } from '../src/system/index'
import { MetaSchema } from '../src/spec/meta'

beforeAll(() => {
  // 카탈로그를 설치하지 않으면 `checkThemeComponents`가 모든 컴포넌트를
  // `unknown-component`로 본다(P4a-1이 잰 갈래).
  installCatalog()
})

describe('내장 시스템 테마', () => {
  it('id 목록이 비어 있지 않다', () => {
    expect(SYSTEM_THEME_IDS.length).toBeGreaterThan(0)
  })

  it('이슈 없이 해석된다', () => {
    for (const id of SYSTEM_THEME_IDS) {
      const { theme, issues } = resolveTheme(systemTheme(id)!)
      // 이슈가 있으면 무엇인지 보이게 둔다 — 개수만 비교하면 고칠 수가 없다.
      expect(issues, `${id}: ${issues.map((i) => `${i.path} ${i.message}`).join(' | ')}`).toEqual([])
      expect(theme).not.toBeNull()
    }
  })

  it('meta가 규격을 지킨다', () => {
    for (const id of SYSTEM_THEME_IDS) {
      const parsed = MetaSchema.safeParse(systemTheme(id)!.meta)
      expect(parsed.success, id).toBe(true)
    }
  })

  /**
   * **`meta.id`에 `system:` 접두어가 없다.** 계획서가 `id: 'system:admin'`이라고 적었는데
   * `THEME_ID_PATTERN`이 콜론을 받지 않는다 — `system:`은 **가리키는 쪽의 문법**이다
   * (`EXTENDS_PATTERN`). 이 케이스가 그 사실을 고정한다.
   */
  it('id에 접두어가 없고 조회는 두 꼴을 다 받는다', () => {
    expect(SYSTEM_THEME_IDS).toContain('admin')
    expect(systemTheme('admin')).toBeDefined()
    expect(systemTheme('system:admin')).toBe(systemTheme('admin'))
    expect(systemTheme('admin')!.meta.id).toBe('admin')
  })

  it('없는 id는 undefined다', () => {
    expect(systemTheme('없는테마')).toBeUndefined()
    // 물려받은 이름이 값을 집어 오지 않는다.
    expect(systemTheme('constructor')).toBeUndefined()
    expect(systemTheme('__proto__')).toBeUndefined()
    expect(systemTheme('toString')).toBeUndefined()
  })

  it('시스템 테마는 extends를 갖지 않는다', () => {
    // §6.9의 깊이 1단계 — 시스템 테마가 출발점이다.
    for (const id of SYSTEM_THEME_IDS) {
      expect(systemTheme(id)!.meta.extends, id).toBeUndefined()
    }
  })

  it('컴파일된 CSS가 실제 선언을 담는다', () => {
    for (const id of SYSTEM_THEME_IDS) {
      const { theme } = resolveTheme(systemTheme(id)!)
      const css = compileTheme(theme!)
      expect(css, id).toContain(':root {')
      expect(css, id).toContain('--wb-semantic-primary')
      // 파생된 간격 스케일이 실려 있다(§6.3의 `space.unit` 파생).
      expect(css, id).toContain('--wb-space-4')
      expect(css, id).toContain('[data-wb-component="List"]')
      // D8 — `!important`가 없다.
      expect(css, id).not.toContain('!important')
    }
  })

  /**
   * **D4가 실제로 쓰이는 자리.** `Text`의 변형이 타이포 스케일을 건다 — `variantFrom`이
   * 없었다면 아홉 역할이 전부 같은 스킨을 받거나 계약 밖 속성이 필요했다.
   */
  it('Text 변형이 타이포 스케일을 건다', () => {
    const { theme } = resolveTheme(systemTheme('admin')!)
    const css = compileTheme(theme!)
    expect(css).toContain('[data-wb-component="Text"][data-wb-variant="h1"]')
    expect(css).toContain('var(--wb-typography-h1-fontSize)')
  })

  it('내장 테마는 매번 같은 CSS를 낸다', () => {
    // P4a-1의 결정성. 주입이 재컴파일을 건너뛸 수 있는 근거다(Task 8).
    const compile = () => compileTheme(resolveTheme(systemTheme('admin')!).theme!)
    expect(compile()).toBe(compile())
  })
})
