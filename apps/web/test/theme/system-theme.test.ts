/**
 * **두 패키지를 함께 볼 수 있는 유일한 자리.**
 *
 * `packages/themes`는 `renderer`를 import할 수 없고(§3.3의 의존표 — `test/public-api.test.ts`가
 * 그것을 지킨다), `packages/renderer`는 `themes`를 import할 수 없다. 그래서 **"테마가 고른
 * 구조를 렌더러가 구현하는가"**와 **"두 패키지가 만드는 CSS 변수 이름이 겹치는가"**는
 * 어느 패키지에서도 잴 수 없다. `apps/web`은 셋을 다 의존하므로(§3.3) 여기가 그 자리다.
 *
 * `apps/web/test/`에 두는 것은 `packages/renderer/test/`에 두는 것보다 낫다 — 후자는
 * 테스트만이라도 `renderer → themes` 방향을 만들고, 그 방향이 한 번 생기면
 * `public-api.test.ts` 같은 경계 검사가 무엇을 지키는지 흐려진다.
 */
import { installStructures, listStructureKeys, structureBaseCss } from '@wirebound/renderer'
import { installCatalog, requireComponent, type ComponentDef } from '@wirebound/schema'
import {
  PrimitivesSchema,
  SYSTEM_THEME_IDS,
  TOKEN_NAMESPACES,
  cssVarName,
  resolveTheme,
  systemTheme,
} from '@wirebound/themes'
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  installCatalog()
  installStructures()
})

describe('내장 테마가 고른 구조를 렌더러가 구현한다 (D7)', () => {
  it('구조 목록이 비어 있지 않다', () => {
    expect(listStructureKeys().length).toBeGreaterThan(0)
  })

  it('테마가 고른 모든 구조에 구현이 있다', () => {
    const implemented = new Set(listStructureKeys())

    for (const id of SYSTEM_THEME_IDS) {
      const { theme, issues } = resolveTheme(systemTheme(id)!)
      // 오류만 본다 — `portal`·`docs`는 손잡이 경고를 1건씩 낸다(P4c-1 T4).
      expect(issues.filter((entry) => entry.severity === 'error'), id).toEqual([])

      const chosen = [...theme!.components].map(([type, component]) => `${type}:${component.structure}`)
      // 테마가 컴포넌트를 하나도 안 고르면 아래 검사가 헛돈다.
      expect(chosen.length, id).toBeGreaterThan(0)
      expect(chosen.filter((key) => !implemented.has(key)), id).toEqual([])
    }
  })

  /**
   * **테마가 구조를 생략해도 같은 결과여야 한다.** 생략하면 `defaultStructure`(=`structures[0]`)가
   * 채워지므로, 카탈로그의 첫 구조에 구현이 없으면 테마를 안 쓰는 화면도 폴백을 그린다.
   */
  it('카탈로그의 첫 구조에는 언제나 구현이 있다', () => {
    const implemented = new Set(listStructureKeys())
    const types = [...new Set(listStructureKeys().map((key) => key.split(':')[0]!))]
    expect(types.length).toBeGreaterThan(0)

    for (const type of types) {
      const def: ComponentDef = requireComponent(type)
      expect(implemented.has(`${type}:${def.structures[0]}`), type).toBe(true)
    }
  })
})

/**
 * `primitives`의 그룹 이름 전부. **규격에서 끌어온다 — 손으로 적지 않는다.**
 *
 * `TOKEN_NAMESPACES`는 규격이 상수로 내보내는데 이쪽은 zod 객체 안에만 있어서, 앞서
 * 배열을 손으로 적어 뒀다. 그러면 **규격에 새 그룹이 생겨도 대조가 조용히 좁아진다** —
 * 대칭이 깨진 자리였다. zod의 `shape` 키를 읽는 방식은 `packages/schema`의 `propKeys`가
 * 이미 쓰는 것과 같다(`define.ts`).
 *
 * 읽지 못하면 **빈 배열이 아니라 던진다.** 조용히 비면 위 대조가 토큰 이름공간만 보게
 * 되어, 고치려던 "조용히 좁아진다"가 그대로 돌아온다.
 */
function primitiveGroups(): string[] {
  const shape = (PrimitivesSchema as unknown as { shape?: Record<string, unknown> }).shape
  const keys = shape === undefined ? [] : Object.keys(shape)
  if (keys.length === 0) {
    throw new Error('PrimitivesSchema에서 그룹 이름을 읽지 못했습니다 (zod 내부 표현이 바뀌었나?)')
  }
  return keys
}

/**
 * **재라 #5 — 두 이름 집합이 겹치지 않는다.**
 *
 * 렌더러는 노드가 나르는 값을 `--wb-node-*`로 내고, 테마는 토큰·primitives 경로에서
 * `cssVarName`으로 이름을 만든다. **겹치면 마지막에 쓴 쪽이 이기고 아무도 모른다** —
 * 실제로 겹치는 자리가 있었다: `primitives.grid.columns`가 `--wb-grid-columns`가 되는데
 * 그것이 계획서 D3이 `Grid` 노드에 주려던 이름과 **정확히 같았다.** 그래서 접두어를 갈랐다.
 */
describe('재라 #5 — 렌더러의 변수 이름과 테마의 변수 이름이 겹치지 않는다', () => {
  it('primitives 그룹 이름을 규격에서 읽는다', () => {
    // 오늘의 값. **이 목록이 바뀌면 위 대조가 함께 넓어지는 것이 요점**이고,
    // 이 줄은 읽어 오는 경로가 살아 있는지만 본다.
    expect(primitiveGroups()).toEqual(['container', 'grid', 'section', 'breakpoints'])
  })

  it('접두어를 가르기 전에는 실제로 겹쳤다', () => {
    // 이 케이스가 문제의 실재를 고정한다. `cssVarName`이 이 이름을 만드는 한
    // 렌더러가 같은 이름을 쓰면 안 된다.
    expect(cssVarName('grid.columns')).toBe('--wb-grid-columns')
    expect(cssVarName('section.paddingY')).toBe('--wb-section-paddingY')
  })

  /**
   * **인스턴스가 아니라 부류를 본다.**
   *
   * 앞서 이 케이스는 **설치된 시스템 테마가 실제로 내는 이름**만 모아 대조했다. 오늘은
   * `admin`이 `primitives.grid.columns`를 선언해 원래 충돌 이름(`--wb-grid-columns`)을
   * 붙잡고 있지만, **그 한 줄이 사라지면 케이스가 조용히 약해진다** — 테마가 안 쓰는
   * 이름은 대조 대상에서 빠지기 때문이다.
   *
   * 그래서 대조 대상을 **규격이 만들 수 있는 첫 마디 전체**로 올린다. 두 목록이
   * `z.strictObject`로 닫혀 있으므로(`tokens: { tree: … }`는 `Unrecognized key`가 된다)
   * 이것이 실제로 전체다:
   *
   * - `TOKEN_NAMESPACES` 7: palette · semantic · space · radius · shadow · typography · motion
   * - `primitives` 그룹 4: container · grid · section · breakpoints
   */
  it('규격이 만들 수 있는 첫 마디 전체와 겹치지 않는다', () => {
    const rendererNames = [...structureBaseCss().matchAll(/--[\w-]+/g)].map((match) => match[0])
    expect(rendererNames.length).toBeGreaterThan(0)

    // 테마 쪽 이름이 시작할 수 있는 접두어 전부. 뒤에 무엇이 붙든 이 접두어로 시작한다.
    const themePrefixes = [...TOKEN_NAMESPACES, ...primitiveGroups()].map(
      (namespace) => `--wb-${namespace}-`,
    )
    // 손으로 센 수가 아니라 **두 목록이 비어 있지 않다**는 것만 본다 — 규격이 늘면
    // 접두어도 늘어야 하고, 개수를 적으면 그때 이 줄이 거짓이 된다.
    expect(themePrefixes.length).toBeGreaterThan(TOKEN_NAMESPACES.length)

    const collisions = rendererNames.filter((name) =>
      themePrefixes.some((prefix) => name.startsWith(prefix)),
    )
    expect(collisions).toEqual([])
  })

  /**
   * 위 케이스가 부류를 보게 됐으므로, **오늘 설치된 테마가 실제로 내는 이름**과도
   * 대조해 둔다 — 규격 목록을 내가 잘못 옮겨 적었으면 이쪽이 잡는다.
   */
  it('설치된 테마가 실제로 내는 이름과도 겹치지 않는다', () => {
    const rendererNames = new Set(
      [...structureBaseCss().matchAll(/--[\w-]+/g)].map((match) => match[0]),
    )

    const themeNames = new Set<string>()
    for (const id of SYSTEM_THEME_IDS) {
      const { theme } = resolveTheme(systemTheme(id)!)
      for (const path of theme!.tokens.keys()) themeNames.add(cssVarName(path))
      for (const path of theme!.primitives.keys()) themeNames.add(cssVarName(path))
    }
    expect(themeNames.size).toBeGreaterThan(0)

    expect([...rendererNames].filter((name) => themeNames.has(name))).toEqual([])
  })

  /**
   * **`--wb-tree-indent`는 `--wb-node-` 밖에 있다.** 오늘 충돌하지 않는 이유는
   * `tree`라는 이름공간이 규격에 **없어서**일 뿐 접두어 규칙이 지켜서가 아니다.
   * 그래서 예외를 이름으로 적고, 그것이 실제로 쓰이는 것까지 본다 — 목록이 썩지 않게.
   */
  it('--wb-node- 밖의 이름은 tree-indent 하나뿐이고 실제로 쓰인다', () => {
    const names = [...structureBaseCss().matchAll(/--[\w-]+/g)].map((match) => match[0])
    expect(names.filter((name) => !name.startsWith('--wb-node-'))).toEqual(['--wb-tree-indent'])
  })
})
