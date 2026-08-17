/**
 * **이음매를 안 지나는 길이 없는가**(P10-2 D3).
 *
 * D3의 판정은 *"`pnpm test`가 브라우저를 안 띄운다"*이고, 그것을 지키는 방법은 **진짜
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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SRC_ROOT, sourceFiles, stripComments } from './source-census'

/** 브라우저가 들어 있는 패키지. 이 글자를 import하는 파일이 곧 브라우저를 부르는 파일이다. */
const BROWSER_PACKAGE = 'playwright-core'

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
    expect(main).toContain(`screenRenderer: ${FACTORY}()`)
    expect(main).toMatch(/buildApp\(\{[^}]*screenRenderer/)
  })

  it('`buildApp` 은 그것을 스스로 만들지 않는다 — 만들면 케이스 전부가 브라우저를 띄운다', () => {
    expect(sourceOf('app.ts')).not.toContain(`${FACTORY}(`)
  })
})

describe('순수한 쪽이 오염되지 않았는가', () => {
  /**
   * **`packages/exporter`는 브라우저를 모른다**(전역 제약). 그쪽의 `src/**`를 지키는 자는
   * `packages/exporter/test/public-api.test.ts`이고, 여기서는 **`apps/api`가 그 패키지에
   * 브라우저를 넘기지 않는지**를 다른 축으로 본다: 그리는 자를 `@wirebound/exporter`에
   * 넘기는 자리가 있으면 그 패키지가 브라우저를 알게 된다.
   */
  it('`exportPptx` 를 부르는 자리는 이미지를 **값으로** 넘긴다 — 그리는 자를 넘기지 않는다', () => {
    const service = sourceOf('services/export-pptx.ts')
    expect(service).toContain('exportPptx(')
    expect(service).not.toMatch(/exportPptx\(\{[^)]*renderer/)
  })
})
