/**
 * **이음매를 안 지나는 길이 없는가.**
 *
 * 판정은 *"`pnpm test`가 브라우저를 안 띄운다"*이고, 그것을 지키는 방법은 **진짜
 * 그리는 자를 `main.ts`에서만 만드는 것**이다. 그 방법에는 두 갈래의 사고가 붙는다:
 *
 * | 사고 | 결과 | 여기서 세는 것 |
 * |---|---|---|
 * | `main.ts`가 그것을 안 준다 | **배포된 서버가 그림 없는 pptx를 낸다.** 게이트는 전부 초록이다 | `main.ts`가 `chromiumScreenRenderer`를 `buildApp`에 넘기는가 |
 * | 다른 자리가 브라우저를 부른다 | **케이스가 브라우저를 띄운다** — 개발 루프가 느려지고 기계마다 갈린다 | `playwright-core`를 import하는 소스가 그 파일 하나뿐인가 |
 *
 * **손으로 적은 목록이 아니라 소스에서 센다**(`source-census.ts`의 머리말). 적으면 다음
 * 파일이 조용히 빠진다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SRC_ROOT, sourceFiles, stripComments } from './source-census'

/** 브라우저가 들어 있는 패키지. 이 글자를 import하는 파일이 곧 브라우저를 부르는 파일이다. */
const BROWSER_PACKAGE = 'playwright-core'

/**
 * **순수한 쪽에 들어오면 안 되는 것들.** 표가 분모다 — 다른 브라우저 도구를 고르는 날
 * 여기 한 줄이고, 안 더하면 그 자가 조용히 좁아진다.
 */
const BROWSER_PACKAGES = ['playwright-core', 'playwright', 'puppeteer', 'puppeteer-core']

/** 진짜 그리는 자를 만드는 함수. */
const FACTORY = 'chromiumScreenRenderer'

function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(SRC_ROOT, relative), 'utf8'))
}

describe('브라우저를 부르는 자리', () => {
  it('`playwright-core` 를 import 하는 소스는 하나뿐이다', () => {
    const importers = sourceFiles().filter((relative) => sourceOf(relative).includes(BROWSER_PACKAGE))
    expect(importers).toEqual(['services/screen-render-chromium.ts'])
  })

  it('그 파일을 부르는 소스도 하나뿐이고 그것이 `main.ts` 다', () => {
    const callers = sourceFiles().filter(
      (relative) =>
        relative !== 'services/screen-render-chromium.ts' && sourceOf(relative).includes(FACTORY),
    )
    expect(callers).toEqual(['main.ts'])
  })
})

describe('운영이 그리는 자를 실제로 받는가', () => {
  /**
   * **이 케이스가 없으면 배포가 조용히 그림을 잃는다.** `buildApp`은 `screenRenderer`가
   * 없어도 정상으로 돌고 케이스 전부가 그 상태로 도므로, 게이트는 아무것도 안 말한다.
   */
  it('`main.ts` 가 그것을 만들어 `buildApp` 에 넘긴다', () => {
    const main = sourceOf('main.ts')
    expect(main).toContain(`screenRenderer: ${FACTORY}(`)
    expect(main).toMatch(/buildApp\s*\(\s*\{[^}]*screenRenderer/)
  })

  /**
   * **`SCREEN_CHROMIUM_PATH`가 배선된 채로 남는가.**
   *
   * 앞 줄이 `${FACTORY}(`까지만 재는 것은 인자가 붙었기 때문이고, 그렇게 느슨해진 만큼
   * **인자가 무엇인지를 여기서 센다.** 이 케이스가 없으면 `main.ts`가 다시
   * `${FACTORY}()`로 돌아가도 위가 초록이고, 그러면 `config.screenChromiumPath`는
   * **읽는 자가 없는 값**이 된다 — 기계에 있는 브라우저를 가리키는 유일한 길이 조용히
   * 끊긴다(`config.ts`의 주석이 왜 그 길이 유일한지 든다).
   */
  it('`main.ts` 가 `config.screenChromiumPath` 를 그리는 자에게 넘긴다', () => {
    const main = sourceOf('main.ts')
    expect(main).toContain('config.screenChromiumPath')
    expect(main).toContain('executablePath: config.screenChromiumPath')
  })

  it('`buildApp` 은 그것을 스스로 만들지 않는다 — 만들면 케이스 전부가 브라우저를 띄운다', () => {
    expect(sourceOf('app.ts')).not.toContain(`${FACTORY}(`)
  })
})

/**
 * **`packages/exporter`의 `src` 전부**. 뿌리 기준 상대 경로다.
 *
 * **`source-census.ts`의 `sourceFiles`를 안 쓴다** — 그쪽은 `.ts`만 세는데 이 패키지에는
 * `page.tsx`가 있다. 재사용하면 **분모에서 `.tsx`가 조용히 빠진다** — census 분모가
 * 흔히 새는 부류다.
 */
const EXPORTER_SRC = fileURLToPath(new URL('../../../packages/exporter/src', import.meta.url))

function exporterSources(dir: string = EXPORTER_SRC, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...exporterSources(join(dir, entry.name), relative))
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(relative)
    }
  }
  return found
}

describe('순수한 쪽이 오염되지 않았는가', () => {
  /**
   * **`packages/exporter`는 브라우저를 모른다**(전역 제약).
   *
   * **이 파일의 다른 census 는 그것을 못 지킨다** — 그쪽은 `apps/api/src`(`SRC_ROOT`)만
   * 훑으므로 그 패키지를 **볼 수조차 없다.** *"census가 그것을 지킨다"*고 적으면 거짓이다.
   *
   * **이 자 없이도 그 성질은 다른 데서 막힌다** — exporter 에 import 를 심으면 exporter
   * 케이스가 모듈 해석에서 죽고(pnpm 의 엄격한 `node_modules`), 의존을 `package.json`에
   * 더하면 `public-api.test.ts`의 의존 목록이 죽는다.
   *
   * **그래도 자를 세운다.** 그 둘이 내는 말은 *"Cannot find package"*이지 *"브라우저가
   * exporter 에 들어왔다"*가 아니고, *"census가 지킨다"*고 적는 문서가 가리키는 자가 실제로
   * 있어야 다음 사람이 그 문장을 믿을 수 있다.
   */
  it('`packages/exporter/src` 어디에도 브라우저 패키지가 없다', () => {
    const files = exporterSources()
    // **분모가 비면 이 케이스는 아무것도 안 지킨다.** 경로가 바뀌면 여기서 먼저 죽는다.
    // **정확한 수를 안 박는다** — 파일을 더할 때마다 어긋난다. 지키려는 것은 *"0이 아니다"*다.
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((relative) => relative.endsWith('.tsx'))).toBe(true)

    const 오염 = files.filter((relative) => {
      const source = stripComments(readFileSync(join(EXPORTER_SRC, relative), 'utf8'))
      return BROWSER_PACKAGES.some((name) => source.includes(name))
    })
    expect(오염).toEqual([])
  })

  /**
   * **`apps/api`가 그 패키지에 브라우저를 넘기지도 않는다** — 다른 축이다.
   * 그리는 자를 `exportPptx`에 넘기면 그 패키지가 브라우저를 알게 된다.
   */
  it('`exportPptx` 를 부르는 자리는 이미지를 **값으로** 넘긴다 — 그리는 자를 넘기지 않는다', () => {
    const service = sourceOf('services/export-pptx.ts')
    expect(service).toContain('exportPptx(')
    expect(service).not.toMatch(/exportPptx\s*\(\s*\{[^)]*renderer/)
  })
})
