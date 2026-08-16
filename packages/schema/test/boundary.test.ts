import { describe, expect, it } from 'vitest'
import packageJson from '../package.json?raw'

/**
 * `src/`의 모든 파일. **이 파일이 `test/`에 사는 것이 중요하다** — 소스를 훑는 검사를 `src/`에
 * 두면 그 검사가 자기 자신을 훑는다(`packages/themes/test/public-api.test.ts`가 선례다).
 */
const sources = import.meta.glob('../src/**/*.ts', { query: '?raw', eager: true, import: 'default' })

/**
 * **D2가 딛고 선 사실을 케이스로 든다.**
 *
 * *"설계서 규칙은 `schema`, 테마 규칙은 `themes`"*라는 판정의 근거 전부가 이 경계다 —
 * §12.4는 *"규칙은 `schema` 패키지에 두어"*라고 적었고, 그 문장을 글자대로 지키려면 여기서
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

  it('themes도 renderer도 react도 import하지 않는다', () => {
    for (const [path, source] of Object.entries(sources)) {
      expect(String(source), path).not.toMatch(/from '(@wirebound\/(themes|renderer)|react)/)
    }
  })

  it('package.json이 zod만 의존한다', () => {
    const manifest = JSON.parse(packageJson) as { dependencies: Record<string, string> }
    expect(Object.keys(manifest.dependencies)).toEqual(['zod'])
  })
})
