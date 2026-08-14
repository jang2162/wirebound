/**
 * **경계와 공개 표면이 계약이다.** `packages/themes/test/public-api.test.ts`가 선례이고
 * 그 배치를 그대로 따른다 — P8-1 리뷰가 *"exporter의 `tsconfig`가 `src`에 DOM을 안 주는
 * 것을 지키는 케이스가 없다"*고 지목한 자리다.
 *
 * **이 파일이 `test/`에 사는 것이 중요하다** — 소스를 훑는 검사를 `src/`에 두면 그 검사가
 * 자기 자신을 훑는다. 이 저장소에서 같은 사고가 두 번 났다.
 */
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json?raw'
import tsconfigJson from '../tsconfig.json?raw'
import tsconfigTestJson from '../tsconfig.test.json?raw'
import * as api from '../src/index'

/** `src/`의 모든 파일. */
const sources = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  eager: true,
  import: 'default',
})

describe('경계 — exporter가 무엇을 보지 않는가', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 빈 집합에서 아래 검사가 조용히 통과한다.
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    expect(Object.keys(sources)).toContain('../src/index.ts')
    expect(sources['../src/index.ts']).toContain('PACKAGE_NAME')
  })

  /**
   * **`src`의 `tsconfig`가 DOM을 들이지 않는다**(D2).
   *
   * 이 설정이 실제로 막는 것을 양방향으로 쟀다: `src/page.tsx`에 `document.title`을 적으면
   * `TS2584`로 죽고, `lib`에 `"DOM"`을 되넣으면 같은 줄이 통과했다. 여기서는 그 설정이
   * 그대로인지만 본다 — **컴파일러가 지키는 것을 케이스가 다시 재려 하면 베끼는 것이 된다.**
   *
   * **케이스 쪽(`tsconfig.test.json`)은 DOM을 받는다.** 견주기가 jsdom의 DOM을 다루기
   * 때문이고, 그 갈림이 이 패키지가 `tsconfig`를 둘로 가른 이유다.
   */
  it('src의 tsconfig가 DOM을 들이지 않는다', () => {
    const parsed = JSON.parse(tsconfigJson) as { compilerOptions: { lib: string[] } }
    expect(parsed.compilerOptions.lib).toEqual(['ES2022'])
  })

  it('케이스의 tsconfig만 DOM을 받는다', () => {
    const parsed = JSON.parse(tsconfigTestJson) as {
      compilerOptions: { lib: string[] }
      include: string[]
    }
    expect(parsed.compilerOptions.lib).toEqual(['ES2022', 'DOM', 'DOM.Iterable'])
    expect(parsed.include).toEqual(['test', 'test-support'])
  })

  /**
   * **`src`가 브라우저 전역을 부르지 않는다.** 위 `lib` 설정이 컴파일 시점에 막지만,
   * 그 설정을 되돌리는 변경과 전역을 쓰는 변경이 **같은 커밋에** 오면 컴파일러는 조용하다.
   * 여기서 이름으로 한 번 더 본다.
   */
  it('src가 DOM 전역을 이름으로 부르지 않는다', () => {
    for (const [path, source] of Object.entries(sources)) {
      expect(source as string, path).not.toMatch(/\b(document|window|navigator|localStorage)\./)
    }
  })

  /**
   * **`src`가 `node:` 모듈을 부르지 않는다**(D2: *"Node 전용 API를 최소로"*). P9의 CLI가
   * 같은 함수를 부르고, 파일로 쓰는 것은 D1대로 호출자의 일이다.
   */
  it('src가 node: 모듈을 부르지 않는다', () => {
    for (const [path, source] of Object.entries(sources)) {
      expect(source as string, path).not.toContain("from 'node:")
    }
  })

  /**
   * **`react-dom`이 진짜 의존이다**(D2). `renderer`는 그것을 devDependency로만 두는데,
   * 이 패키지는 `renderToStaticMarkup`을 **부르므로** 받는 쪽에 함께 가야 한다.
   */
  it('package.json이 렌더에 필요한 것을 의존으로 든다', () => {
    const manifest = JSON.parse(packageJson) as { dependencies: Record<string, string> }
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@wirebound/renderer',
      '@wirebound/schema',
      '@wirebound/themes',
      'react',
      'react-dom',
    ])
  })

  /**
   * **`test-support`는 `dist`에 안 들어간다.** 케이스가 쓰는 도구이고 제품 표면이 아니다 —
   * `files`가 `dist` 하나라 배포에 실리지 않고, `exports`의 서브패스는 워크스페이스 안에서만
   * 쓰인다.
   */
  it('test-support가 배포에 실리지 않는다', () => {
    const manifest = JSON.parse(packageJson) as {
      files: string[]
      exports: Record<string, unknown>
    }
    expect(manifest.files).toEqual(['dist'])
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './test-support'])
  })
})

describe('공개 표면이 계약이다', () => {
  /**
   * `src/index.ts`가 내는 것 전부. **여기 손으로 적은 목록이 계약이고, 이것을 고치는 것은
   * 밖으로 나가는 약속을 고치는 것이다.** 새 이름이 실수로 새면 이 케이스가 죽는다.
   */
  const CONTRACT = ['PACKAGE_NAME', 'exportPage', 'scriptJson'].sort()

  it('공개 표면이 계약과 정확히 같다', () => {
    expect(Object.keys(api).sort()).toEqual(CONTRACT)
  })

  it('내부 헬퍼가 새어 나가지 않는다', () => {
    for (const name of ['installRegistries', 'pageCss', 'DOCTYPE', 'DEFAULT_LANG']) {
      expect(Object.keys(api), name).not.toContain(name)
    }
  })
})
