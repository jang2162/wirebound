/**
 * **D6의 반증 — `renderComposed(Page>Slot 레이아웃, page)`는 `renderDocument(page)`와 같지 않다.**
 *
 * P4a-3 계획서의 D6이 *"기본 레이아웃이 `Page > Slot`이라 오늘 결과는 지금과 같아야 한다"*고
 * 적었고 *"다르면 그것이 발견이다"*라고 덧붙였다. 재보니 **다르다.**
 *
 * 관찰(react-dom/server로 찍었다):
 *
 * ```
 * 합성: <div data-wb-id="레이아웃루트" …><div data-wb-id="슬롯" …><div data-wb-id="페이지루트" …>…
 * 직접: <div data-wb-id="페이지루트" …>…
 * ```
 *
 * **원인:** `renderComposed`는 페이지를 그려 `slot`으로 넘기고 **레이아웃 문서를 다시
 * 그린다**(`compose.tsx`). 레이아웃의 루트 `Page`와 그 안의 `Slot`이 **각각 자기 엘리먼트를
 * 낸다** — `Slot`은 구멍이 아니라 그 자리에 그려지는 노드다. `Page > Slot`이 "아무것도
 * 더하지 않는 껍데기"라는 전제가 틀렸다.
 *
 * **그래서 이 슬라이스는 캔버스를 합성으로 바꾸지 않았다.** 바꿨다면 결과가 셋이었다:
 *
 * 1. **테마 규칙이 두 번 맞는다.** `[data-wb-component="Page"]` 규칙이 레이아웃 루트와
 *    페이지 루트 **둘 다**에 맞아 여백·배경이 중첩된다(아래 케이스가 그 겹침을 센다).
 * 2. **선택이 유령 노드를 가리킨다.** 캔버스의 `nodeIdAt`은 눌린 자리에서 가장 가까운
 *    `data-wb-id`를 집는데, 레이아웃 루트·슬롯의 id는 **페이지 문서에 없다** — 스토어에는
 *    선택이 있는데 그 노드를 찾을 수 없는 상태가 된다.
 * 3. **아웃라인이 그 노드를 못 찾는다.** `findNodeElement`가 페이지 문서 기준으로 돈다.
 *
 * 셋 다 이 슬라이스가 감당할 크기가 아니다(§4.4의 레이아웃 에디터가 오면 선택 모델 자체를
 * 다시 정해야 한다). **케이스로 남기는 이유는 그 사실이 산문으로만 남으면 아무도 다시 재지
 * 않기 때문이다.**
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { installCatalog, type LayoutDocument, type PageDocument } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderComposed } from '../src/compose'
import { renderDocument } from '../src/render'
import { installStructures } from '../src/structures/index'

beforeAll(() => {
  installCatalog()
  installStructures()
})

const page: PageDocument = {
  version: 1,
  root: {
    id: 'n_pageroot001',
    type: 'Page',
    children: [{ id: 'n_text00000001', type: 'Text', props: { content: '안녕' } }],
  },
}

/** `repos/layouts.ts`의 `defaultLayoutDocument()`와 같은 모양이다 — `Page` 하나와 `Slot` 하나. */
const layout: LayoutDocument = {
  version: 1,
  root: { id: 'n_layoutroot1', type: 'Page', children: [{ id: 'n_slot00000001', type: 'Slot' }] },
}

describe('renderComposed와 renderDocument (P4a-3 D6)', () => {
  it('결과가 같지 않다 — D6이 틀렸다', () => {
    expect(renderToStaticMarkup(renderComposed(layout, page))).not.toBe(
      renderToStaticMarkup(renderDocument(page)),
    )
  })

  it('합성은 노드 둘을 더 그린다 — 레이아웃 루트와 Slot', () => {
    const composed = renderToStaticMarkup(renderComposed(layout, page))
    const direct = renderToStaticMarkup(renderDocument(page))

    const ids = (markup: string): string[] =>
      [...markup.matchAll(/data-wb-id="([^"]+)"/g)].map((match) => match[1]!)

    expect(ids(direct)).toEqual(['n_pageroot001', 'n_text00000001'])
    expect(ids(composed)).toEqual(['n_layoutroot1', 'n_slot00000001', 'n_pageroot001', 'n_text00000001'])
  })

  /**
   * **테마가 겨냥하는 자리가 늘어난다.** `compileTheme`의 컴포넌트 규칙은
   * `[data-wb-component="Page"][data-wb-structure="…"]`인데, 합성 후에는 그 셀렉터에
   * 맞는 엘리먼트가 **둘**이다. 여백·배경을 주는 테마면 그것이 중첩된다.
   */
  it('data-wb-component="Page"에 맞는 자리가 하나에서 둘로 는다', () => {
    const count = (markup: string): number =>
      [...markup.matchAll(/data-wb-component="Page"/g)].length

    expect(count(renderToStaticMarkup(renderDocument(page)))).toBe(1)
    expect(count(renderToStaticMarkup(renderComposed(layout, page)))).toBe(2)
  })

  /**
   * **페이지 문서에 없는 id가 DOM에 생긴다.** 캔버스의 선택은 `data-wb-id`로 도는데
   * (`canvas.tsx`의 `nodeIdAt`), 그 두 id는 페이지 문서 어디에도 없다.
   */
  it('합성 DOM의 id 중 둘은 페이지 문서에 없다', () => {
    const composed = renderToStaticMarkup(renderComposed(layout, page))
    const inPage = new Set(['n_pageroot001', 'n_text00000001'])
    const foreign = [...composed.matchAll(/data-wb-id="([^"]+)"/g)]
      .map((match) => match[1]!)
      .filter((id) => !inPage.has(id))

    expect(foreign).toEqual(['n_layoutroot1', 'n_slot00000001'])
  })
})

/**
 * **재라 #9 — `renderComposed`의 인자 뒤바꿈이 아직 컴파일되는가.**
 *
 * 답: **아니다. 컴파일되지 않는다.** P0 이월 #3이 열어 둔 자리는 `node.ts`의 팬텀
 * 판별자(`declare const documentKind: unique symbol`)로 닫혀 있다. 그런데
 * `document-kind.test-d.ts`가 재는 것은 **스텁**(`composeStub`)이지 실제 함수가 아니어서,
 * 진짜 `renderComposed`가 그 보호를 받는지는 아무도 재지 않고 있었다. 아래 한 줄이 그것을 잰다.
 *
 * **곁들여 알아낸 것 — 판별자가 무음으로 꺼지는 경로가 있다.** 처음 프로브에서
 * `PageDocument`를 `packages/schema/src/node`(소스 경로)에서, `renderComposed`를
 * `@wirebound/renderer`(패키지 → `dist`)에서 가져왔더니 **뒤바꿈이 통과했다.**
 * `documentKind`가 `unique symbol`이라 **선언이 둘이면 서로 다른 키**가 되고, 그러면 두
 * 문서 타입이 똑같이 `{version, root}`로 접혀 구별이 사라진다. 소스 경로 import와 패키지
 * import를 섞는 자리에서는 이 보호가 없다.
 */
describe('재라 #9 — 인자 뒤바꿈', () => {
  it('뒤바꿔 부르면 타입이 맞지 않는다', () => {
    // @ts-expect-error 인자 순서가 뒤바뀌었다 — 이 지시가 불필요해지면(즉 뒤바꿈이
    // 컴파일되기 시작하면) `tsc`가 "사용되지 않은 @ts-expect-error"로 죽는다.
    renderComposed(page, layout)
    expect(true).toBe(true)
  })
})
