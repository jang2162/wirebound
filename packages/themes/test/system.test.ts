import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { SYSTEM_THEME_IDS, systemTheme } from '../src/system/index'
import { MetaSchema } from '../src/spec/meta'

beforeAll(() => {
  // 카탈로그를 설치하지 않으면 `checkThemeComponents`가 모든 컴포넌트를
  // `unknown-component`로 본다.
  installCatalog()
})

describe('내장 시스템 테마', () => {
  it('id 목록이 비어 있지 않다', () => {
    expect(SYSTEM_THEME_IDS.length).toBeGreaterThan(0)
  })

  /**
   * **"이슈 없이"가 아니라 *"오류 없이"*다.**
   *
   * `portal`·`docs`가 `node-handle-overwrite` 경고를 하나씩 낸다 — 둘이
   * `Tree.parts.node.paddingX`로 손잡이와 셀렉터가 정확히 같다. **경고가 나는 것이 정상이고 그 수가
   * 정확히 무엇인지는 `warning-channel.test.ts`가 못박는다.** 여기서 지키는 것은
   * *"다섯 다 실제로 선다"* — `error`가 0이고 `theme`이 나온다.
   */
  it('오류 없이 해석된다 — 다섯 다 선다', () => {
    for (const id of SYSTEM_THEME_IDS) {
      const { theme, issues } = resolveTheme(systemTheme(id)!)
      const errors = issues.filter((entry) => entry.severity === 'error')
      // 이슈가 있으면 무엇인지 보이게 둔다 — 개수만 비교하면 고칠 수가 없다.
      expect(errors, `${id}: ${errors.map((i) => `${i.path} ${i.message}`).join(' | ')}`).toEqual([])
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
   * **`meta.id`에 `system:` 접두어가 없다.** `id: 'system:admin'`으로는 적을 수 없다 —
   * `THEME_ID_PATTERN`이 콜론을 받지 않는다. `system:`은 **가리키는 쪽의 문법**이다
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
    // 설계서 「상속과 병합」의 깊이 1단계 — 시스템 테마가 출발점이다.
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
      // 파생된 간격 스케일이 실려 있다(「tokens — 3단 분리」의 `space.unit` 파생).
      expect(css, id).toContain('--wb-space-4')
      expect(css, id).toContain('[data-wb-component="List"]')
      // `!important`가 없다.
      expect(css, id).not.toContain('!important')
    }
  })

  /**
   * **`variantFrom`이 실제로 쓰이는 자리.** `Text`의 변형이 타이포 스케일을 건다 — `variantFrom`이
   * 없었다면 아홉 역할이 전부 같은 스킨을 받거나 계약 밖 속성이 필요했다.
   */
  it('Text 변형이 타이포 스케일을 건다', () => {
    const { theme } = resolveTheme(systemTheme('admin')!)
    const css = compileTheme(theme!)
    expect(css).toContain('[data-wb-component="Text"][data-wb-variant="h1"]')
    expect(css).toContain('var(--wb-typography-h1-fontSize)')
  })

  it('내장 테마는 매번 같은 CSS를 낸다', () => {
    // 결정성. 주입이 재컴파일을 건너뛸 수 있는 근거다.
    const compile = () => compileTheme(resolveTheme(systemTheme('admin')!).theme!)
    expect(compile()).toBe(compile())
  })
})
