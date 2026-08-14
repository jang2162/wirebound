/**
 * **캔버스가 그린 것과 번들이 그린 것을 견준다** — §11.3의 *"렌더러가 하나뿐이라 결과가
 * 어긋날 수 없다"*를 **진짜 화면**에 묶는 자리다.
 *
 * ---
 *
 * # 왜 `packages/exporter`가 아니라 여기인가
 *
 * P8-1 리뷰가 구멍을 짚었다: `packages/exporter/test/parity.test.tsx`의 *"화면 경로"*는
 * `renderDocument`를 **직접** 부른다. 그래서 `canvas.tsx`가 트리를 한 겹 감싸도 그 파일은
 * 아무것도 죽지 않는다 — *"화면과 같다"*를 재면서 **화면이 아닌 것**과 견주고 있었다.
 *
 * 캔버스는 `apps/web`에 살고 `packages/exporter`는 그것을 볼 수 없다. **`apps/web`만
 * 셋(캔버스 · 렌더러 · exporter)을 동시에 본다.** `themes`의 어휘를 `renderer`와 대조하는
 * 케이스가 이미 같은 이유로 여기 있다(`theme/node-handles.test.ts`).
 *
 * **견주는 자와 픽스처는 exporter의 것을 그대로 쓴다**(`@wirebound/exporter/test-support`).
 * 두 벌을 두면 *"같다"*의 뜻이 둘이 된다 — P7-3 이월 §8.2 규칙 1이 말한 그 자리다.
 *
 * # 무엇을 견주나
 *
 * 캔버스가 그린 DOM에서 **문서 뿌리 아래**만 떼어 낸다. 셸이 문서 **옆에** 그리는 것
 * (선택 아웃라인 · 번호 마커 · 오류 배너)은 번들에 없고 있어서도 안 된다 — D7이 셸을
 * P8-2로 미뤄 두었다. 그 셸이 문서 **안으로** 들어오면(노드를 감싸거나 속성을 얹으면)
 * 여기서 죽는다.
 *
 * # 테마
 *
 * 캔버스는 서버에서 테마를 읽는다(`useProjectTheme`). 그래서 **가짜 api가 주는 테마를
 * 이 파일이 정하고, 같은 것을 `exportPage`에 넘긴다** — 두 경로가 같은 테마를 보게 하는
 * 유일한 방법이다.
 *
 * **`portal`을 고른 것은 판정이다.** 가짜 api의 기본값은 `admin`인데 그 테마는 카탈로그의
 * 첫 구조와 다른 것을 **하나도 안 고른다**(P8-1 보고서 §7.2의 실측). 그래서 구조 배선이
 * 끊겨도 `admin`으로는 안 죽는다. `portal`은 일곱 자리에서 다른 구조를 고르고,
 * `EntryForm:sectioned`를 고르는 유일한 시스템 테마이기도 하다 — 갈림 ㉡이 난 자리다.
 */
import { describeTree } from '@wirebound/exporter/test-support'
import { broadFixture, variantFixture } from '@wirebound/exporter/test-support'
import { exportPage } from '@wirebound/exporter'
import type { PageDocument } from '@wirebound/schema'
import {
  THEME_ISSUE_SEVERITY,
  resolveTheme,
  systemTheme,
  type ResolvedTheme,
  type Theme,
} from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { canvasSurface, openPage } from '../editor-harness'

const THEME_ID = 'portal'

function themeDocument(): Theme {
  const theme = systemTheme(THEME_ID)
  if (theme === undefined) throw new Error(`시스템 테마가 없습니다: ${THEME_ID}`)
  return theme
}

function resolved(): ResolvedTheme {
  const { theme, issues } = resolveTheme(themeDocument())
  const errors = issues.filter((issue) => THEME_ISSUE_SEVERITY[issue.code] === 'error')
  expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  expect(theme).not.toBeNull()
  return theme!
}

/** 가짜 api가 캔버스에 줄 테마. `useProjectTheme`이 이 꼴을 받는다. */
function themeOverride(): { themeId: string; theme: Theme; issues: [] } {
  return { themeId: `system:${THEME_ID}`, theme: themeDocument(), issues: [] }
}

/**
 * 캔버스가 그린 **문서 뿌리**. 셸의 상자들은 `data-wb-id`를 달지 않으므로 표면 안에서 첫
 * `[data-wb-id]`가 곧 문서의 뿌리다(`editor-harness`의 `canvasRootId`가 같은 근거를 쓴다).
 */
function canvasDocumentRoot(): Element {
  const root = canvasSurface().querySelector('[data-wb-id]')
  if (root === null) throw new Error('캔버스에 문서가 없습니다')
  return root
}

/** 번들이 그린 문서 뿌리. */
function bundleDocumentRoot(document_: PageDocument, theme: ResolvedTheme | null): Element {
  const { html } = exportPage({ document: document_, title: '견주기', theme })
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const root = parsed.body.firstElementChild
  if (root === null) throw new Error('번들에 문서가 없습니다')
  return root
}

const FIXTURES: [label: string, make: () => PageDocument][] = [
  ['넓게 덮는 문서', broadFixture],
  ['variant를 전부 쓰는 문서', variantFixture],
]

describe('진짜 캔버스와 번들이 같은 DOM을 낸다', () => {
  it.each(FIXTURES)('%s', async (_label, make) => {
    const document_ = make()
    await openPage(document_, {
      apiOverrides: { getProjectTheme: async () => themeOverride() },
    })

    expect(describeTree(bundleDocumentRoot(document_, resolved()))).toEqual(
      describeTree(canvasDocumentRoot()),
    )
  })

  /**
   * **테마가 실제로 캔버스에 닿았는지부터 본다.** 안 닿으면 위 견주기는 두 경로가 나란히
   * *"테마 없음"*을 그리는 것을 재게 되고, 구조 배선이 끊겨도 통과한다.
   *
   * `portal`이 `List`를 `stackedList`로 고르는 것이 그 증거다 — 카탈로그의 첫 구조는
   * `table`이다.
   */
  it('캔버스가 서버가 준 테마의 구조를 그린다 — 카탈로그 기본이 아니다', async () => {
    await openPage(broadFixture(), {
      apiOverrides: { getProjectTheme: async () => themeOverride() },
    })

    const list = canvasSurface().querySelector('[data-wb-component="List"]')
    expect(list?.getAttribute('data-wb-structure')).toBe('stackedList')
    expect(resolved().components.get('List')?.structure).toBe('stackedList')
  })

  /**
   * **갈렸던 자리 ㉢ — 캔버스에만 남는 빈 `style` 속성.**
   *
   * **이 파일이 없었으면 못 봤을 갈림이다.** `packages/exporter`의 견주기는 한 번만
   * 그리므로 이 상태를 만들지 못한다.
   *
   * 캔버스는 테마를 **서버에서 늦게** 받는다(`useProjectTheme`의 첫 상태가 `loading`이고
   * 그때 테마는 `null`이다). 그래서 `Tree`가 먼저 `indent`로 그려지고 — 그 구조는
   * 단계 변수를 `style`에 싣는다 — 테마가 온 뒤 `accordion`으로 바뀐다. React는 같은
   * `<li>`를 재사용하며 선언만 지우고 **속성은 남긴다.**
   *
   * **선언이 0개이므로 스타일이 다른 것이 아니다.** 원인의 재현은
   * `packages/exporter/test/parity.test.tsx`의 *"갈렸던 자리 ㉢"*이 구조 전환 하나로 든다.
   */
  it('캔버스의 Tree 노드에 선언 없는 style이 남는다 — 번들에는 없다', async () => {
    await openPage(broadFixture(), {
      apiOverrides: { getProjectTheme: async () => themeOverride() },
    })

    const canvasNode = canvasSurface().querySelector(
      '[data-wb-component="Tree"] > [data-wb-part="node"]',
    )
    expect(canvasNode?.getAttribute('style')).toBe('')

    const bundleNode = bundleDocumentRoot(broadFixture(), resolved()).querySelector(
      '[data-wb-component="Tree"] > [data-wb-part="node"]',
    )
    expect(bundleNode?.getAttribute('style')).toBeNull()
  })

  /**
   * **문서 뿌리가 캔버스 표면의 **직계 자식**이다 — 아무것도 그것을 감싸지 않는다.**
   *
   * **이 케이스가 없으면 위 견주기가 감싸개를 못 본다.** 견주기는 뿌리 **아래**만 재므로
   * 캔버스가 문서를 한 겹 감싸도 두 목록이 같다 — P8-1 리뷰가 짚은 구멍이 정확히 그
   * 모양이었고(변이 *"캔버스가 트리를 한 겹 감싼다"*가 사망 0이었다), 여기가 그 축을 든다.
   *
   * 표면 안의 다른 상자들(런타임 알림 · 선택 아웃라인 · 번호 마커)은 문서 **옆**이므로
   * 형제로 있어도 된다. 지키는 것은 *"문서 위에 한 겹이 끼지 않는다"*이다.
   */
  it('문서 뿌리를 아무것도 감싸지 않는다', async () => {
    await openPage(broadFixture(), {
      apiOverrides: { getProjectTheme: async () => themeOverride() },
    })

    expect(canvasDocumentRoot().parentElement).toBe(canvasSurface())
  })

  /**
   * **셸은 문서 **옆에** 그린다(캔버스의 D7).** 그래서 문서 뿌리 아래에는 셸의 어휘가
   * 하나도 없다 — 위 견주기가 성립하는 전제이고, 셸이 문서 안으로 들어오면 여기가 먼저
   * 무엇이 들어왔는지 이름으로 말한다.
   */
  it('문서 뿌리 아래에 셸의 어휘가 없다', async () => {
    await openPage(broadFixture(), {
      apiOverrides: { getProjectTheme: async () => themeOverride() },
    })

    const root = canvasDocumentRoot()
    const shellAttributes = [...root.querySelectorAll('*')]
      .flatMap((element) => [...element.attributes].map((attr) => attr.name))
      .filter((name) => name.startsWith('data-wb-selected') || name.startsWith('data-wb-marker'))
    expect(shellAttributes).toEqual([])
    expect(root.querySelectorAll('[class*="wb-shell"]')).toHaveLength(0)
  })
})
