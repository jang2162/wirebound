/**
 * **경계와 공개 표면이 계약이다.** `packages/themes/test/public-api.test.ts`와 같은 배치다.
 *
 * **이 파일이 `test/`에 사는 것이 중요하다** — 소스를 훑는 검사를 `src/`에 두면 그 검사가
 * 자기 자신을 훑는다.
 */
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json?raw'
import tsconfigJson from '../tsconfig.json?raw'
import tsconfigRuntimeJson from '../tsconfig.runtime.json?raw'
import tsconfigTestJson from '../tsconfig.test.json?raw'
import * as api from '../src/index'

/**
 * **DOM을 봐도 되는 자리. 목록이 여기 사는 것이 요점이다.**
 *
 * `assets/runtime.js`를 만드는 파일 하나는 브라우저에서 돈다. 그 파일은 `src`에 살지만
 * **Node에서는 한 줄도 돌지 않고**(글자로 나가 브라우저가 판다) 자기 `tsconfig`가 따로
 * 검사한다. 명제를 지우지 않고 *"정확히 이것 하나가 예외다"*로 센다 —
 * 목록이 `src`에 있으면 파일을 더하는 손이 목록도 함께 고쳐 아무것도 안 재게 된다.
 */
const BROWSER_SOURCES = ['../src/runtime/browser.ts']

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
   * **`src`의 `tsconfig`가 DOM을 들이지 않는다.**
   *
   * 이 설정이 실제로 막는 것은 양방향으로 잴 수 있다: `src/page.tsx`에 `document.title`을
   * 적으면 `TS2584`로 죽고, `lib`에 `"DOM"`을 되넣으면 같은 줄이 통과한다. 여기서는 그 설정이
   * 그대로인지만 본다 — **컴파일러가 지키는 것을 케이스가 다시 재려 하면 베끼는 것이 된다.**
   *
   * **케이스 쪽(`tsconfig.test.json`)은 DOM을 받는다.** 견주기가 jsdom의 DOM을 다루기
   * 때문이고, 그 갈림이 이 패키지가 `tsconfig`를 둘로 가른 이유다.
   */
  it('src의 tsconfig가 DOM을 들이지 않고 브라우저 파일을 뺀다', () => {
    const parsed = JSON.parse(tsconfigJson) as {
      compilerOptions: { lib: string[] }
      exclude: string[]
    }
    expect(parsed.compilerOptions.lib).toEqual(['ES2022'])
    expect(parsed.exclude).toEqual(BROWSER_SOURCES.map((path) => path.replace('../', '')))
  })

  /**
   * **브라우저로 나가는 파일만 DOM을 받는다.** `src`의 금지를 그 한 파일이 깨는
   * 것이 아니라 **다른 프로젝트가 그 파일을 맡는다** — 그래서 나머지 `src`는 여전히
   * `document`라는 이름조차 컴파일할 수 없다.
   */
  it('브라우저 파일만 DOM을 받는 별도 tsconfig가 든다', () => {
    const parsed = JSON.parse(tsconfigRuntimeJson) as {
      compilerOptions: { lib: string[] }
      include: string[]
    }
    expect(parsed.compilerOptions.lib).toEqual(['ES2022', 'DOM', 'DOM.Iterable'])
    expect(parsed.include).toEqual(BROWSER_SOURCES.map((path) => path.replace('../', '')))
  })

  it('케이스의 tsconfig만 DOM을 받는다', () => {
    const parsed = JSON.parse(tsconfigTestJson) as {
      compilerOptions: { lib: string[] }
      include: string[]
    }
    expect(parsed.compilerOptions.lib).toEqual(['ES2022', 'DOM', 'DOM.Iterable'])
    expect(parsed.include).toEqual(['test', 'test-support', 'build-test'])
  })

  /**
   * **`src`가 브라우저 전역을 부르지 않는다 — 브라우저로 나가는 그 하나만 빼고.** 위 `lib`
   * 설정이 컴파일 시점에 막지만, 그 설정을 되돌리는 변경과 전역을 쓰는 변경이 **같은
   * 커밋에** 오면 컴파일러는 조용하다. 여기서 이름으로 한 번 더 본다.
   */
  it('src가 DOM 전역을 이름으로 부르지 않는다', () => {
    for (const [path, source] of Object.entries(sources)) {
      if (BROWSER_SOURCES.includes(path)) continue
      expect(source as string, path).not.toMatch(/\b(document|window|navigator|localStorage)\./)
    }
  })

  /** 예외 목록이 **실재하는 파일**을 가리키는지 본다. 오타면 위 검사가 아무것도 안 뺀다. */
  it('예외로 적은 파일이 실제로 있고 실제로 DOM을 부른다', () => {
    for (const path of BROWSER_SOURCES) {
      expect(Object.keys(sources), path).toContain(path)
      expect(sources[path] as string, path).toMatch(/\bdocument\./)
    }
  })

  /**
   * **`src`가 `node:` 모듈을 부르지 않는다**(*"Node 전용 API를 최소로"*). 파일로 쓰는 것은
   * 호출자(`apps/api`)의 일이다.
   */
  it('src가 node: 모듈을 부르지 않는다', () => {
    for (const [path, source] of Object.entries(sources)) {
      expect(source as string, path).not.toContain("from 'node:")
    }
  })

  /**
   * **`src`가 zip을 모른다.**
   *
   * PPTX가 zip(OOXML)이라 **압축을 여기서 하고 싶어진다.** 하면
   * 이 패키지가 파일 하나를 통째로 만들게 되고, 압축하는 자리가 `apps/api`와 둘이 된다 —
   * `exportBundle`이 파일 시스템을 모르는 것과 같은 이유로 막는다.
   *
   * **`build-test`는 이 검사를 안 지난다** — 그쪽은 받는 쪽에게 먹일 진짜 파일을 만들어야
   * 해서 `fflate`를 쓴다. 분모가 `src/**`인 것이 요점이다.
   */
  it('src가 압축 라이브러리를 부르지 않는다', () => {
    for (const [path, source] of Object.entries(sources)) {
      expect(source as string, path).not.toMatch(/from '(fflate|jszip|yazl|zlib)'/)
    }
  })

  /**
   * **`react-dom`이 진짜 의존이다.** `renderer`는 그것을 devDependency로만 두는데,
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
  const CONTRACT = [
    'PACKAGE_NAME',
    'exportBundle',
    'exportPage',
    'scriptJson',
    // `NO_SCREEN`은 **화면 이미지가 없는 자리의 말**이고, 라우트·CLI가 사람에게 그 상태를
    // 말할 때 같은 글자를 쓰라고 밖으로 낸다(두 벌이 되는 것을 막는다).
    'exportPptx',
    'NO_SCREEN',
  ].sort()

  it('공개 표면이 계약과 정확히 같다', () => {
    expect(Object.keys(api).sort()).toEqual(CONTRACT)
  })

  it('내부 헬퍼가 새어 나가지 않는다', () => {
    for (const name of ['installRegistries', 'pageCss', 'DOCTYPE', 'DEFAULT_LANG']) {
      expect(Object.keys(api), name).not.toContain(name)
    }
  })
})
