/**
 * 좌·우 패널이 **검증 전 문서**를 견디기 위한 모양 가드.
 *
 * **왜 타입을 믿지 않는가.** 스토어에 실리는 문서는 서버 검증 **전에** 낙관적
 * 패치가 지나간 것이라(설계서 「정방향 흐름」) 일시적으로 `WbNode` 타입을 만족하지 않을 수 있다.
 * 컴파일러가 막아 주는 것은 호출부의 타입뿐이고 런타임에 들어오는 값이 아니다 — 렌더러가
 * 같은 이유로 `shapeError`를 두고 있다(`packages/renderer/src/render.tsx`).
 *
 * **왜 렌더러의 것을 쓰지 않는가.** 렌더러의 가드는 노드를 폴백 **엘리먼트로** 바꾸는
 * 것이라, 글자 한 줄이 필요한 두 패널이 쓸 수 있는 모양이 아니다(`FallbackNode`는 문서
 * 안에 그려질 상자다). 여기 있는 것은 같은 판정을 글자로 옮기는 두 줄이다.
 *
 * **왜 이것이 필요한가.** 두 패널은 오류 경계 **밖**이다 — 에디터 셸 안의
 * 경계는 `canvas/canvas.tsx`의 `CanvasBoundary` 하나다(`GalleryBoundary`는 테마 갤러리 몫). 그래서 여기서 React가
 * 렌더 도중 던지면 캔버스만이 아니라 **`.wb-shell`이 통째로 DOM에서 사라진다**(실측:
 * `type`이 객체인 노드를 심으면 `Objects are not valid as a React child`로 셸이 사라진다.
 * 그 실측을 케이스로 옮긴 것이 `test/panels/structure-tree.test.tsx`·
 * `test/panels/property-panel.test.tsx`의 `type이 문자열이 아닌 노드가 있어도 / 골라도 셸은 살아 있다`다).
 */
import type { WbNode } from '@wirebound/schema'

/** 타입을 읽지 못한 노드 자리에 쓸 이름. 빈 줄로 두면 그 줄이 무엇인지 알 수 없다. */
export const BROKEN_TYPE_LABEL = '(타입을 읽을 수 없는 노드)'

/**
 * 노드의 타입 문자열. **문자열이 아니면 `null`이다.**
 *
 * 호출자가 `null`을 따로 다뤄야 하는 것은 의도다 — 타입을 카탈로그 조회에 쓰는 자리
 * (`getComponent`)와 화면에 그리는 자리가 다르고, 둘의 대응이 다르다.
 */
export function nodeType(node: WbNode): string | null {
  return typeof node.type === 'string' ? node.type : null
}

/** 화면에 그릴 타입 이름. 읽지 못한 노드에는 `BROKEN_TYPE_LABEL`이 대신 간다. */
export function nodeTypeLabel(node: WbNode): string {
  return nodeType(node) ?? BROKEN_TYPE_LABEL
}
