import { describe, expect, it } from 'vitest'
import packageJson from '../package.json?raw'

/**
 * `src/`의 모든 파일. **이 파일이 `test/`에 사는 것이 중요하다** — 소스를 훑는 검사를 `src/`에
 * 두면 그 검사가 자기 자신을 훑는다(`packages/themes/test/public-api.test.ts`가 선례다).
 */
const sources = import.meta.glob('../src/**/*.ts', { query: '?raw', eager: true, import: 'default' })

/**
 * **lint 규칙의 소유 판정이 딛고 선 사실을 케이스로 든다.**
 *
 * *"설계서 규칙은 `schema`, 테마 규칙은 `themes`"*라는 판정의 근거 전부가 이 경계다 —
 * 설계서 「lint 규칙」은 *"규칙은 `schema` 패키지에 두어"*라고 적었고, 그 문장을 글자대로 지키려면 여기서
 * `themes`를 봐야 하는데 그 순간 의존 방향이 뒤집힌다. 근거가 케이스 없이 주석으로만
 * 남아 있으면 다음 사람이 그 판정을 뒤집는 import 한 줄을 조용히 넣는다.
 */
describe('경계 — schema가 무엇을 보지 않는가', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 빈 집합에서 아래 검사가 조용히 통과한다.
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    expect(Object.keys(sources)).toContain('../src/index.ts')
    expect(sources['../src/index.ts']).toContain('PACKAGE_NAME')
  })

  /**
   * 금지된 모듈 지정자를 **어느 형태로 적어도** 잡는다.
   *
   * **`/from '(…)/`만 보면 세 형태가 빠져나간다:**
   * 쌍따옴표(`from "…"`) · 부수효과 import(`import '…'` — `from`이 없다) · 동적
   * `import('…')`. 그중 부수효과 import는 **`pnpm typecheck`도 통과하므로** 이 자 말고는
   * 그 한 줄을 막는 게이트가 없다.
   *
   * **모듈 지정자 자리만 본다** — 인용부호에 감싸인 채 `from`·`import`·`require` 뒤에 오는
   * 것. 이름을 그냥 언급하는 주석(`index.ts`가 *"테마 규칙은 `@wirebound/themes`"*라고
   * 적는다)까지 잡으면 케이스가 문서를 막게 된다.
   */
  const FORBIDDEN_SPECIFIER =
    /(?:^|[^\w$])(?:from|import|require)\s*\(?\s*['"](?:@wirebound\/(?:themes|renderer)|react(?:\/[\w./-]*)?)['"]/

  it('themes도 renderer도 react도 import하지 않는다 — 인용부호·부수효과·동적 전부', () => {
    for (const [path, source] of Object.entries(sources)) {
      expect(String(source), path).not.toMatch(FORBIDDEN_SPECIFIER)
    }
  })

  /**
   * **자를 케이스 안에서 재 둔다**(전역 제약: 자를 구현 파일에 두지 마라). 정규식이 조용히
   * 좁아지면 위 케이스가 아무것도 안 잡는 채로 통과하므로, 잡아야 하는 형태를 여기서
   * 직접 먹여 본다.
   */
  it('금지 형태를 실제로 잡는다 — 이 정규식의 구분력', () => {
    const caught = [
      "import type { Theme } from '@wirebound/themes'",
      'import type { Theme } from "@wirebound/themes"',
      "import '@wirebound/themes'",
      'import "@wirebound/renderer"',
      "const m = await import('@wirebound/themes')",
      "require('@wirebound/renderer')",
      "import { useState } from 'react'",
      "import 'react/jsx-runtime'",
    ]
    for (const line of caught) {
      expect(line, line).toMatch(FORBIDDEN_SPECIFIER)
    }

    const allowed = [
      '// 테마 규칙은 `@wirebound/themes`. 합치는 자리는 그쪽이다.',
      "import { z } from 'zod'",
      "import type { WbNode } from '../node'",
      ' * 그 판정은 react 쪽 이야기가 아니다',
      "import { reactive } from './reactive'",
    ]
    for (const line of allowed) {
      expect(line, line).not.toMatch(FORBIDDEN_SPECIFIER)
    }
  })

  it('package.json이 zod만 의존한다', () => {
    const manifest = JSON.parse(packageJson) as { dependencies: Record<string, string> }
    expect(Object.keys(manifest.dependencies)).toEqual(['zod'])
  })
})
