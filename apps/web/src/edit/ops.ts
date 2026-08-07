/**
 * 편집을 `PatchOp`로 옮기는 곳. **순수 함수이고 React·DOM·`fetch`를 모른다** —
 * `store/editor-store.ts`와 같은 이유로, 화면 없이 단위 테스트할 수 있어야 한다.
 *
 * 지금은 "노드의 prop 하나를 바꾼다" 하나뿐이다. 구조 편집(노드 추가·삭제·이동)은
 * P2b-3이고, 그것도 **`ops`를 만드는 방법만 다른** 같은 경로를 지난다.
 */
import { findNodePath, getByPointer, type PageDocument, type PatchOp } from '@wirebound/schema'

/**
 * 노드의 prop 하나를 바꾸는 op. 문서에서 노드 경로를 찾아 조립한다.
 * 그 노드가 문서에 없으면 `null`이다 — **요청을 보내지 않는 신호다**(D7).
 *
 * **갈래가 셋인 것은 `applyOps`가 그렇게 던지기 때문이다.** 소스(`packages/schema/src/
 * patch/apply.ts`)를 읽고 실측해 확정했다:
 *
 * | 노드 상태 | `replace /…/props/<prop>` | 그래서 쓰는 op |
 * |---|---|---|
 * | `props` 자체가 없다 | `resolveSlot`이 `parent`를 `undefined`로 만들어 `경로를 찾을 수 없습니다` | `add /…/props` 값 `{ [prop]: value }` |
 * | `props`는 있고 그 키가 없다 | `replaceAt`의 `Object.hasOwn`에 걸려 `바꿀 키가 없습니다` | `add /…/props/<prop>` |
 * | `props`에 그 키가 있다 | 통과한다 | `replace /…/props/<prop>` |
 *
 * 가운데 줄이 **계획서가 빠뜨린 갈래다.** 계획서는 "`props`가 없으면 통째 `add`, 있으면
 * `replace`" 두 갈래로 적었는데, 그러면 `props`는 있고 그 **키**만 없는 노드에서
 * `applyOps`가 던지고 D7이 요청을 막아 **값이 없던 prop을 처음 켜는 편집이 아예 나가지
 * 못한다.** 통째 `add`로 합치는 것도 답이 아니다 — 그러면 그 노드의 다른 prop이 지워진다.
 *
 * **op을 하나로 유지하는 것은 의도다.** 둘로 나누면 서버가 만들 `inverse`도 둘이 된다.
 * 서버는 `packages/schema`의 `invertOps`를 그대로 쓰므로(`apps/api/src/services/
 * edit-pipeline.ts`) 그 `inverse`를 여기서 재 둘 수 있고, 재 본 값은 각각
 * `remove /…/props` · `remove /…/props/<prop>` · `replace /…/props/<prop>(옛 값)` 하나씩이다
 * (`test/edit/ops.test.ts`의 `서버가 만들 inverse를 여기서 재 둔다`).
 */
export function propOps(
  document: PageDocument,
  nodeId: string,
  prop: string,
  value: unknown,
): PatchOp[] | null {
  const nodePath = findNodePath(document.root, nodeId)
  if (nodePath === undefined) return null

  const propsPath = `${nodePath}/props`
  const props = getByPointer(document, propsPath)

  // `props`가 아예 없으면 통째로 넣는다. `getByPointer`는 없는 키에 `undefined`를 주므로
  // 값이 `undefined`인 키와 구분되지 않지만, 문서 봉투가 그런 키를 허용하지 않는다.
  if (props === undefined) {
    return [{ op: 'add', path: propsPath, value: { [prop]: value } }]
  }

  // `props`가 객체가 아니면 이 문서는 이미 깨져 있다. 서버가 검증한 문서만 실리므로
  // 정상 경로에서는 오지 않지만, 여기서 `Object.hasOwn`을 부르면 던지므로 막아 둔다 —
  // **던지는 대신 `null`이다.** 이 함수의 `null`은 "요청을 보내지 마라"이고, 그것이
  // 깨진 문서에 대해서도 맞는 답이다.
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return null

  return Object.hasOwn(props, prop)
    ? [{ op: 'replace', path: `${propsPath}/${escapeToken(prop)}`, value }]
    : [{ op: 'add', path: `${propsPath}/${escapeToken(prop)}`, value }]
}

/**
 * JSON Pointer의 토큰 이스케이프(RFC 6901). prop 이름에 `/`나 `~`가 들어가면 경로가
 * 다른 곳을 가리킨다. 카탈로그의 prop 이름에 그런 글자가 있는지는 **재지 않았다** —
 * 없더라도 이스케이프는 두 글자짜리 규칙이라 여기 두는 편이 싸다.
 */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}
