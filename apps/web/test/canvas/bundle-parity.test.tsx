/**
 * **캔버스가 그린 것과 번들이 그린 것을 견준다** — 설계서 「HTML 정적 번들」의 *"렌더러가 하나뿐이라 결과가
 * 어긋날 수 없다"*를 **진짜 화면**에 묶는 자리다.
 *
 * ---
 *
 * # 왜 `packages/exporter`가 아니라 여기인가
 *
 * `packages/exporter/test/parity.test.tsx`의 *"화면 경로"*는 `renderDocument`를 **직접**
 * 부른다. 그래서 `canvas.tsx`가 트리를 한 겹 감싸도 그 파일은 아무것도 죽지 않는다 —
 * *"화면과 같다"*를 재면서 **화면이 아닌 것**과 견준다.
 *
 * 캔버스는 `apps/web`에 살고 `packages/exporter`는 그것을 볼 수 없다. **`apps/web`만
 * 셋(캔버스 · 렌더러 · exporter)을 동시에 본다.**
 *
 * **견주는 자와 픽스처는 exporter의 것을 그대로 쓴다**(`@wirebound/exporter/test-support`).
 * 두 벌을 두면 *"같다"*의 뜻이 둘이 된다.
 *
 * # 무엇을 견주나
 *
 * 캔버스가 iframe 안에 그린 DOM에서 **문서 뿌리 아래**만 떼어 낸다. 셸이 문서 **옆에** 그리는 것
 * (선택 아웃라인 · 번호 마커 · 오류 배너)은 번들에 없고 있어서도 안 된다. 그 셸이 문서
 * **안으로** 들어오면(노드를 감싸거나 속성을 얹으면) 여기서 죽는다.
 *
 * # 테마
 *
 * 캔버스는 프로젝트가 고정한 판의 번들을 싣는다 — 기본 하네스는 `system-admin@0.1.0` 에 `ADMIN_V0` 를 준다(`test/theme-loader.ts`).
 * 번들에 **같은 테마 정의**를 넘겨 견준다 — 캔버스가 뷰 경로에 무엇을 더하거나 빼면 여기서 죽는다.
 */
import { broadFixture, describeTree } from '@wirebound/exporter/test-support'
import { exportPage } from '@wirebound/exporter'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { ADMIN_V0 } from '@wirebound/system-theme-admin'
import { canvasDocument, openPage } from '../editor-harness'

/**
 * 캔버스가 그린 **문서 뿌리**. iframe 문서 안의 첫 `[data-wb-id]`가 곧 문서의 뿌리다(`editor-harness`의
 * `canvasRootId`가 같은 근거를 쓴다).
 */
function canvasDocumentRoot(): Element {
  const root = canvasDocument().body.querySelector('[data-wb-id]')
  if (root === null) throw new Error('캔버스에 문서가 없습니다')
  return root
}

/** 번들이 그린 문서 뿌리 — 캔버스와 같은 테마 정의로 그린다. */
function bundleDocumentRoot(document_: PageDocument): Element {
  const { html } = exportPage({ document: document_, title: '견주기', theme: ADMIN_V0 })
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const root = parsed.body.firstElementChild
  if (root === null) throw new Error('번들에 문서가 없습니다')
  return root
}

const FIXTURES: [label: string, make: () => PageDocument][] = [['넓게 덮는 문서', broadFixture]]

describe('진짜 캔버스와 번들이 같은 DOM을 낸다', () => {
  it.each(FIXTURES)('%s', async (_label, make) => {
    const document_ = make()
    await openPage(document_)

    expect(describeTree(bundleDocumentRoot(document_))).toEqual(
      describeTree(canvasDocumentRoot()),
    )
  })

  /**
   * **`Tree` 노드의 `style` 이 번들과 같다.** 선언은 CSS 변수 하나이고, 두 쪽이 같은 선언을 낸다.
   */
  it('캔버스의 Tree 노드 style 이 번들과 같다', async () => {
    await openPage(broadFixture())

    const canvasNode = canvasDocument().querySelector<HTMLElement>('[data-wb-component="Tree"] > [data-wb-part="node"]')
    const bundleNode = bundleDocumentRoot(broadFixture()).querySelector<HTMLElement>(
      '[data-wb-component="Tree"] > [data-wb-part="node"]',
    )
    // 글자로 견주지 않는다 — 번들은 SSR 문자열(`--x:0`), 캔버스는 DOM 이 다시 쓴 꼴(`--x: 0;`)이라 같은 선언이 다르게 적힌다.
    const declarations = (node: HTMLElement | null | undefined) =>
      node === null || node === undefined ? null : Array.from(node.style, (name) => `${name}=${node.style.getPropertyValue(name).trim()}`)
    expect(declarations(canvasNode)).toEqual(['--wb-node-tree-level=0'])
    expect(declarations(canvasNode)).toEqual(declarations(bundleNode))
  })

  /**
   * **문서 뿌리가 iframe 문서 `body` 의 **직계 자식**이다 — 아무것도 그것을 감싸지 않는다.**
   *
   * **이 케이스가 없으면 위 견주기가 감싸개를 못 본다.** 견주기는 뿌리 **아래**만 재므로
   * 캔버스가 문서를 한 겹 감싸도 두 목록이 같다 — 변이 *"캔버스가 트리를 한 겹 감싼다"*를
   * 심으면 견주기는 아무것도 안 죽고, 여기가 그 축을 든다.
   *
   * 셸의 장치들(런타임 알림 · 선택 아웃라인 · 번호 마커)은 호스트 문서에 있어 iframe 안에 없다. 지키는 것은
   * *"문서 위에 한 겹이 끼지 않는다"*이다 — 테마 CSS 의 `body > …` 가 문서 뿌리를 겨냥할 수 있어야 한다.
   */
  it('문서 뿌리를 아무것도 감싸지 않는다', async () => {
    await openPage(broadFixture())

    expect(canvasDocumentRoot().parentElement).toBe(canvasDocument().body)
  })

  /**
   * **셸은 문서 **옆에** 그린다.** 그래서 문서 뿌리 아래에는 셸의 어휘가
   * 하나도 없다 — 위 견주기가 성립하는 전제이고, 셸이 문서 안으로 들어오면 여기가 먼저
   * 무엇이 들어왔는지 이름으로 말한다.
   */
  it('문서 뿌리 아래에 셸의 어휘가 없다', async () => {
    await openPage(broadFixture())

    const root = canvasDocumentRoot()
    const shellAttributes = [...root.querySelectorAll('*')]
      .flatMap((element) => [...element.attributes].map((attr) => attr.name))
      .filter((name) => name.startsWith('data-wb-selected') || name.startsWith('data-wb-marker'))
    expect(shellAttributes).toEqual([])
    expect(root.querySelectorAll('[class*="wb-shell"]')).toHaveLength(0)
  })
})
