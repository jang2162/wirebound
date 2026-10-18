/**
 * 편집을 `PatchOp`로 옮기는 곳. **순수 함수이고 React·DOM·`fetch`를 모른다** —
 * `store/editor-store.ts`와 같은 이유로, 화면 없이 단위 테스트할 수 있어야 한다.
 *
 * 두 갈래가 산다 — prop 편집(`propOps`)과 구조 편집(`insertNodeOps`·`removeNodeOps`·
 * `moveNodeOps`). **파이프라인은 하나다:** 어느 쪽이든 만든 `ops`를 `useEditCommit`에
 * 넘기면 낙관적 적용·직렬 전송·실패 수렴·undo가 그대로 따라온다.
 *
 * **여기 있는 함수가 `null`을 내는 것은 전부 같은 뜻이다: 요청을 만들지 마라.**
 * 던지지 않는 것도 같은 이유다 — 이 함수들은 렌더 도중에도 불릴 수 있고, 속성 패널과
 * 구조 트리는 오류 경계 밖이라 던지면 셸 전체가 흰 화면이 된다.
 */
import {
  applyOps,
  getByPointer,
  tidyAlias,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type Interaction,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
// **schema의 `findNodePath`·`findNode`·`walkNodes`를 쓰지 않는다.** 셋 다 `walkNodes`를
// 지나고 그것이 `children` 배열 안의 `null` 원소에서 던진다 — 이 파일의 계약("던지지
// 않는다")이 거기서 깨진다(`./safe-walk.ts` 머리말에 실측).
import { findNodePathSafely, findNodeSafely, walkSafely } from './safe-walk'

/**
 * 문서 루트 노드의 JSON Pointer. `walkNodes`의 `basePath` 기본값과 같은 값이고,
 * `findNodePath`가 루트에 대해 내는 경로가 이것이다 — 둘이 갈리면 아래 루트 판정이
 * 조용히 통과한다.
 */
const ROOT_PATH = '/root'

/**
 * 노드의 prop 하나를 바꾸는 op. 문서에서 노드 경로를 찾아 조립한다.
 * 그 노드가 문서에 없으면 `null`이다 — **요청을 보내지 않는 신호다.**
 *
 * **갈래가 셋인 것은 `applyOps`가 그렇게 던지기 때문이다.** 소스(`packages/schema/src/
 * patch/apply.ts`)를 읽고 실측한 값이다:
 *
 * | 노드 상태 | `replace /…/props/<prop>` | 그래서 쓰는 op |
 * |---|---|---|
 * | `props` 자체가 없다 | `resolveSlot`이 `parent`를 `undefined`로 만들어 `경로를 찾을 수 없습니다` | `add /…/props` 값 `{ [prop]: value }` |
 * | `props`는 있고 그 키가 없다 | `replaceAt`의 `Object.hasOwn`에 걸려 `바꿀 키가 없습니다` | `add /…/props/<prop>` |
 * | `props`에 그 키가 있다 | 통과한다 | `replace /…/props/<prop>` |
 *
 * 가운데 줄이 **빠뜨리기 쉬운 갈래다.** "`props`가 없으면 통째 `add`, 있으면
 * `replace`" 두 갈래로만 두면 `props`는 있고 그 **키**만 없는 노드에서
 * `applyOps`가 던지고 로컬 적용이 던진 편집은 나가지 않으므로 **값이 없던 prop을 처음 켜는 편집이 아예 나가지
 * 못한다.** 통째 `add`로 합치는 것도 답이 아니다 — 그러면 그 노드의 다른 prop이 지워진다.
 *
 * **op을 하나로 유지하는 것은 의도다.** 둘로 나누면 서버가 만들 `inverse`도 둘이 된다.
 * 서버는 `packages/schema`의 `invertOps`를 그대로 쓰므로(`apps/api/src/services/
 * edit-pipeline.ts`) 그 `inverse`를 여기서 재 둘 수 있고, 재 본 값은 각각
 * `remove /…/props` · `remove /…/props/<prop>` · `replace /…/props/<prop>(옛 값)` 하나씩이다
 * (`test/edit/ops.test.ts`의 `서버가 만들 inverse를 여기서 재 둔다`).
 */
export function propOps(document: PageDocument, nodeId: string, prop: string, value: unknown): PatchOp[] | null {
  const nodePath = findNodePathSafely(document.root, nodeId)
  if (nodePath === undefined) return null

  const propsPath = `${nodePath}/props`
  const props = getByPointer(document, propsPath)

  // **`undefined` 는 «그 prop 을 지운다» 다** — 기본값이 없는 prop(`SearchForm.columns`)을 «안 정한» 판으로 되돌리는 길이다. 문서 봉투가
  // `undefined` 값을 받지 않으므로 다른 뜻과 안 겹친다. 키가 없으면 지울 것이 없다(`null`).
  if (value === undefined) {
    if (typeof props !== 'object' || props === null || Array.isArray(props) || !Object.hasOwn(props, prop)) return null
    return [{ op: 'remove', path: `${propsPath}/${escapeToken(prop)}` }]
  }

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
 * 노드의 `variant`를 바꾸는 op. **경로를 가르는 자리는 여기 하나다.**
 *
 * **`/props/variant`가 아니라 `/…/variant`다.** `variant`는 props의 키가 아니라 **노드 봉투의
 * 필드**이고(설계서 「페이지 스키마 노드」: `{ id, type, props, variant, marker, interactions, children }`), 그래서
 * `propOps`를 재사용할 수 없다. 재사용하면 `props` 안에 `variant`라는 키가 생겨
 * `z.strictObject`인 컴포넌트에서 `invalid-props`가 되고, 그렇지 않은 컴포넌트에서는
 * **아무 데도 안 쓰이는 값이 조용히 저장된다.**
 *
 * **`variant`를 비우는 것은 `remove`다 — `replace null`이 아니다.** `WbNodeSchema.variant`가
 * `z.string().optional()`이라 `null`은 유효한 값이 아니다. 비울 수 없으면 사용자가 한 번
 * 고른 변형에 갇힌다.
 *
 * **거절되는 코드는 422다 — 400이 아니다.**
 * 실측: `validatePage`가 그 문서에 `bad-document`(severity `error`)를 내고
 * (*"잘못된 입력: 예상 타입은 string, 받은 타입은 null입니다"*, path `/root/…/variant`),
 * `edit-pipeline`이 그것을 `reason: 'invalid'`로 올려 라우트가 **422 `validation-failed`**로
 * 낸다(`apps/api/src/routes/pages.ts`의 머리말). 400은 봉투 **요청 본문**이 깨졌을 때다.
 *
 * 갈래는 `propOps`와 같은 이유로 셋이다 — `applyOps`의 `replace`가 없는 키에서 던진다.
 *
 * | 노드 상태 | 주는 값 | op |
 * |---|---|---|
 * | `variant` 키가 있다 | 문자열 | `replace /…/variant` |
 * | `variant` 키가 없다 | 문자열 | `add /…/variant` |
 * | `variant` 키가 있다 | `null` | `remove /…/variant` |
 * | `variant` 키가 없다 | `null` | **`null`** — 지울 것이 없다 |
 */
export function variantOps(document: PageDocument, nodeId: string, variant: string | null): PatchOp[] | null {
  const nodePath = findNodePathSafely(document.root, nodeId)
  if (nodePath === undefined) return null

  const node = findNodeSafely(document.root, nodeId)
  if (node === undefined) return null

  const path = `${nodePath}/variant`
  // `getByPointer`로 값을 보지 않고 키의 존재를 본다 — 값이 `undefined`인 키와
  // 키가 없는 것을 갈라야 `replace`/`add`가 갈린다(`propOps`가 같은 자리에서
  // 봉투가 그런 키를 허용하지 않는다는 사실에 기댄 것과 대비된다).
  const has = Object.hasOwn(node, 'variant')

  if (variant === null) return has ? [{ op: 'remove', path }] : null
  return has ? [{ op: 'replace', path, value: variant }] : [{ op: 'add', path, value: variant }]
}

/**
 * 노드의 별칭(`alias`)을 바꾸는 op. `variantOps`와 같은 층이다 — 노드 봉투의 필드라 경로가 `/…/alias`다.
 *
 * **봉투가 거절할 값을 짓지 않는다** — 친 글을 봉투와 한 벌인 다듬기(`@wirebound/schema` 의 `tidyAlias` — 표는
 * `packages/schema/src/alias.ts` 머리말)로 맞춘다. 거절을 받아 422 로 되돌리는 것보다 보낼 때 맞추는 편이 친 사람이 잃는 것이
 * 적다. 다듬어 빈 값(보이는 글자 없음)이면 지운다.
 *
 * | 노드 상태 | 다듬은 값 | op |
 * |---|---|---|
 * | `alias` 키가 있다 | 비지 않음 · 지금과 다름 | `replace /…/alias` |
 * | 키가 없다 | 비지 않음 | `add /…/alias` |
 * | 키가 있다 | 빈 값(또는 `null`) | `remove /…/alias` |
 * | 키가 없다 | 빈 값 | **`null`** — 지울 것이 없다 |
 * | 지금과 같다 | — | **`null`** |
 */
export function aliasOps(document: PageDocument, nodeId: string, alias: string | null): PatchOp[] | null {
  const nodePath = findNodePathSafely(document.root, nodeId)
  if (nodePath === undefined) return null
  const node = findNodeSafely(document.root, nodeId)
  if (node === undefined) return null

  const next = alias === null ? '' : tidyAlias(alias)
  const path = `${nodePath}/alias`
  const has = Object.hasOwn(node, 'alias')
  if (next === '') return has ? [{ op: 'remove', path }] : null
  if (has && node.alias === next) return null
  return has ? [{ op: 'replace', path, value: next }] : [{ op: 'add', path, value: next }]
}

/**
 * 노드의 몫(`weight` — 정수 `WEIGHT_MIN` ~ `WEIGHT_MAX`)을 바꾸는 op. `aliasOps` 와 같은 층(노드 봉투의 필드)이고 갈래도 같다 — 키가 있으면
 * `replace`, 없으면 `add`, `null` 이면 `remove`(없으면 지울 것이 없어 `null`), 지금과 같으면 `null`. 범위는 부르는 쪽(속성 패널)이 먼저 본다 —
 * 범위 밖 값은 서버가 422 로 거절할 값이라 여기 오면 `null` 이다.
 */
export function weightOps(document: PageDocument, nodeId: string, weight: number | null): PatchOp[] | null {
  const nodePath = findNodePathSafely(document.root, nodeId)
  if (nodePath === undefined) return null
  const node = findNodeSafely(document.root, nodeId)
  if (node === undefined) return null

  const path = `${nodePath}/weight`
  const has = Object.hasOwn(node, 'weight')
  if (weight === null) return has ? [{ op: 'remove', path }] : null
  if (!Number.isInteger(weight) || weight < WEIGHT_MIN || weight > WEIGHT_MAX) return null
  if (has && node.weight === weight) return null
  return has ? [{ op: 'replace', path, value: weight }] : [{ op: 'add', path, value: weight }]
}

/**
 * 노드의 `interactions`를 통째로 갈아 끼우는 op(설계서 「상호작용」의 「모델」 절). **`variantOps`와 같은 층이다** —
 * `interactions`도 props의 키가 아니라 **노드 봉투의 필드**라 경로가 한 단계 위다(「페이지 스키마 노드」).
 *
 * **코멘트와 다른 점:** 코멘트는 **서버가** 문서의 `marker`를 바꿔야 해서 새 계약
 * (`markerOps`)이 필요하다. **상호작용은 클라이언트가 바꾸므로 그것이 필요 없다** —
 * 이미 있는 낙관적 편집 경로(`useEditCommit` → `PATCH .../ops`)를 그대로 탄다.
 *
 * **배열을 통째로 다루는 것은 의도다.** 액션 하나만 겨냥한 세밀한 op을 만들면 저작 UI의
 * 조작 하나가 op 여럿이 되고, 그 조합마다 `applyOps`의 갈래(있는 키/없는 키/배열 범위)를
 * 다시 다뤄야 한다. 통째 `replace`의 `inverse`는 **앞 배열 하나**라 undo가 정확하고,
 * 남의 편집을 덮는 문제는 `baseSeq`의 낙관적 잠금이 409로 막는다.
 *
 * 갈래는 `variantOps`와 같은 이유로 넷이다:
 *
 * | 노드 상태 | 주는 값 | op |
 * |---|---|---|
 * | `interactions` 키가 있다 | 비어 있지 않은 배열 | `replace /…/interactions` |
 * | 키가 없다 | 비어 있지 않은 배열 | `add /…/interactions` |
 * | 키가 있다 | **빈 배열** | `remove /…/interactions` |
 * | 키가 없다 | 빈 배열 | **`null`** — 지울 것이 없다 |
 *
 * **빈 배열을 `remove`로 옮기는 이유:** 남기면 *"상호작용 없음"*의 표현이 두 벌(키 없음 /
 * 빈 배열)이 된다. `WbNodeSchema.interactions`가 `.optional()`이라 키가 없는 것이 정상이다.
 */
export function interactionsOps(document: PageDocument, nodeId: string, interactions: readonly Interaction[]): PatchOp[] | null {
  const nodePath = findNodePathSafely(document.root, nodeId)
  if (nodePath === undefined) return null

  const node = findNodeSafely(document.root, nodeId)
  if (node === undefined) return null

  const path = `${nodePath}/interactions`
  // 값이 아니라 **키의 존재**를 본다(`variantOps`와 같은 이유) — `replace`/`add`가 그것으로 갈린다.
  const has = Object.hasOwn(node, 'interactions')

  if (interactions.length === 0) return has ? [{ op: 'remove', path }] : null
  return has ? [{ op: 'replace', path, value: interactions }] : [{ op: 'add', path, value: interactions }]
}

/**
 * 새 노드를 부모의 `children` 안 `index` 자리에 넣는 op. 넣을 수 없으면 `null`이다.
 *
 * **`children` 키가 없는 부모에는 배열째 넣는다 — `propOps`의 첫 갈래와 같은 성질이고
 * 실측했다.** `children`이 없는 노드에 `add /…/children/0`을 주면 `applyOps`의
 * `resolveSlot`이 마지막 토큰만 남기고 따라 내려가다 `parent`를 `undefined`로 만들어
 * `경로를 찾을 수 없습니다`로 던진다(실측). 그러면 로컬 적용이 던진 편집은 나가지 않으므로 **빈 컨테이너에
 * 첫 자식을 넣는 편집이 아예 나가지 못한다.** 그 배열째 `add`의 `inverse`는
 * `[remove /…/children]` 하나다(실측) — undo가 키까지 지워 원본과 완전히 같아진다.
 *
 * `null`을 내는 자리 넷:
 *
 * | 조건 | 왜 |
 * |---|---|
 * | 부모가 문서에 없다 | 보낼 경로가 없다 |
 * | `children`이 없는데 `index`가 0이 아니다 | 배열을 통째로 놓는 것이라 "1번 자리"가 없다 |
 * | `index`가 `0…children.length` 밖이다 | `applyOps`가 `배열 인덱스가 범위를 벗어납니다`로 던진다(실측) |
 * | `children`이 배열도 `undefined`도 아니다 | 아래 참조 |
 *
 * 마지막 줄은 **깨진 문서를 조용히 덮지 않기 위해서다.** 실측: `children`이 문자열인
 * 노드에 배열째 `add`를 주면 던지지 않고 그 문자열을 배열로 갈아 끼운다(`addAt`이
 * 객체 부모에서는 키 할당이라서다). `propOps`가 `props`에 대해 내린 것과 같은 판단이다.
 */
export function insertNodeOps(document: PageDocument, parentId: string, index: number, node: WbNode): PatchOp[] | null {
  const parentPath = findNodePathSafely(document.root, parentId)
  if (parentPath === undefined) return null

  const childrenPath = `${parentPath}/children`
  const children = getByPointer(document, childrenPath)

  if (children === undefined) {
    return index === 0 ? [{ op: 'add', path: childrenPath, value: [node] }] : null
  }
  if (!Array.isArray(children)) return null
  if (!Number.isInteger(index) || index < 0 || index > children.length) return null

  return [{ op: 'add', path: `${childrenPath}/${index}`, value: node }]
}

/**
 * 노드와 그 서브트리를 지우는 op. 루트이거나 문서에 없으면 `null`이다.
 *
 * **루트를 거르는 것은 `applyOps`가 막아 주지 않기 때문이다 — 실측했다.**
 * `remove /root`는 던지지 않고 문서에서 `root` 키를 지워 `{ version: 1 }`을 만든다
 * (`removeAt`의 객체 분기가 `Object.hasOwn`을 통과한다). 그러면 낙관적 적용이
 * **성공해** 큐에 들어가고, 화면은 루트 없는 문서를 그리게 된다. 서버는 봉투 검증에서
 * 거절하겠지만 그때는 이미 사용자가 빈 화면을 보고 난 뒤다.
 *
 * 서브트리는 따로 다루지 않는다 — 자식은 그 노드 **안에** 있으므로 노드를 지우면 함께
 * 간다. 그 `inverse`도 서브트리를 통째로 품은 `add` 하나다(실측).
 */
export function removeNodeOps(document: PageDocument, nodeId: string): PatchOp[] | null {
  const path = findNodePathSafely(document.root, nodeId)
  if (path === undefined || path === ROOT_PATH) return null

  return [{ op: 'remove', path }]
}

/**
 * 노드를 다른 부모의 `index` 자리로 옮기는 op. 같은 부모 안 순서 변경도 이것이다.
 * 옮길 수 없으면 `null`이다.
 *
 * **`index`는 결과 배열에서 그 노드가 놓일 자리다.** `move`가 remove 후 add이므로 목적지
 * 인덱스는 **값을 뺀 배열**을 기준으로 읽히고(실측: `[A,B,C]`에서 A를 인덱스 2로 옮기면
 * `[B,C,A]`다 — `[B,A,C]`가 아니다), 그것이 곧 결과에서의 자리다. 그래서 호출자는
 * "한 칸 아래로"를 `index + 1`, "앞 형제 안 마지막"을 `앞형제.children.length`로 적을 수
 * 있다 — 방향에 따라 보정을 나눌 필요가 없다.
 *
 * **목적지 경로도 값을 뺀 뒤 문서에서 찾는다.** 소스가 목적지
 * 부모보다 앞에 있으면 뺀 순간 부모의 인덱스가 당겨진다. 원본 기준 경로를 그대로 쓰면
 * `applyOps`가 `경로를 찾을 수 없습니다`로 던지고(실측) 편집이 나가지 않는다. 이
 * 보정은 "같은 배열 안에서 뒤로 옮길 때"만의 일이 아니다 — **부모가 다를 때도 난다.**
 *
 * **목적지에 `children` 키가 없으면 빈 배열을 먼저 놓는다**(`insertNodeOps`의 같은 갈래와
 * 같은 원인 — 실측으로 던지는 것을 봤다). 그때만 op이 둘이 되고, **그 둘의 경로 기준이
 * 다르다**: `add`는 첫 op이라 원본 문서 기준이고 `move`의 `path`는 remove가 지나간 뒤
 * 기준이다. 한쪽으로 통일하면 둘 중 하나가 다른 노드를 가리킨다(테스트가 그 두 값이
 * 실제로 갈리는 문서로 고정한다).
 *
 * op을 둘로 나누어도 «이동은 편집 하나»를 어기지 않는 이유: **편집 하나는 revision 하나**이고 서버가
 * `invertOps(before, ops)`로 배열째 역을 만든다(`apps/api/src/services/edit-pipeline.ts`).
 * 그 사이에 다른 편집이 끼지 않는다. 막아야 하는 것은 이동을 `remove`+`add` **두 편집**
 * 으로 쪼개는 쪽이다.
 *
 * `null`을 내는 자리: 노드가 없거나 루트다 · 부모가 없다 · **자기 자신이나 자기 자손을
 * 부모로 삼는다**(그 op은 `applyOps`가 던진다 — 아래) · 인덱스가 범위 밖이다 ·
 * 목적지 `children`이 배열이 아니다.
 *
 * **자손 판정이 막는 것은 "끊어진 트리"가 아니다.** `move`가 `from`을 먼저 빼므로 목적지 경로가 그 순간 문서에서
 * 사라지고 `applyOps`가 `경로를 찾을 수 없습니다`로 던진다. 즉 이 판정의 값어치는
 * **적용해 보기 전에 끊는 것**이고, 그마저도 `EditorStore.applyEdit`의 `try/catch`가
 * 뒤에서 잡는다(`test/edit/ops.test.ts`의 `자손을 부모로 주면 null이다 —`).
 */
export function moveNodeOps(document: PageDocument, nodeId: string, parentId: string, index: number): PatchOp[] | null {
  const from = findNodePathSafely(document.root, nodeId)
  if (from === undefined || from === ROOT_PATH) return null

  const node = findNodeSafely(document.root, nodeId)
  if (node === undefined) return null

  // 자기 서브트리 안으로는 못 옮긴다. `walkNodes`는 자기 자신부터 내므로 "자신을 부모로"도
  // 같은 검사에 걸린다.
  //
  // **이 루프와 위 루트 판정은 서로를 덮는다 — 하나씩 지우면 어느 쪽도 죽는 케이스가 없다(실측).**
  // 이 루프만 지우면 자손을 부모로 준 편집은 아래 `parentPathAfter === undefined`가 잡고
  // (자손은 뺀 문서에 없다), 루트 판정만 지우면 **루트는 모든 노드의 조상이므로** 어떤
  // 부모를 줘도 이 루프에 걸린다. 케이스를 더해도 하나만 죽이는 입력은 없다 —
  // 정상 문서에서 둘이 잡는 입력 집합이 같다.
  //
  // **그래도 둘 다 남기는 것은 함께 지우면 던지기 때문이다(실측).** 둘 다 없애고 루트를
  // 옮기려 하면 아래 `remove /root`가 문서에서 root를 지우고, 그 문서를 `findNodePath`에
  // 넣은 `walkNodes`가 `Cannot read properties of undefined (reading 'id')`로 던진다 —
  // 여기는 오류 경계 밖이라 그 예외가 셸을 통째로 지운다.
  for (const visit of walkSafely(node)) {
    if (visit.node.id === parentId) return null
  }

  const parentPathBefore = findNodePathSafely(document.root, parentId)
  if (parentPathBefore === undefined) return null

  // **여기부터가 remove 후 기준이다.** 위 자손 검사를 통과했으므로 부모는 빠지는 서브트리
  // 밖에 있고, 그래서 뺀 문서에도 남아 있다.
  const afterRemove = applyOps(document, [{ op: 'remove', path: from }])
  const parentPathAfter = findNodePathSafely(afterRemove.root, parentId)
  if (parentPathAfter === undefined) return null

  const children = getByPointer(afterRemove, `${parentPathAfter}/children`)

  if (children === undefined) {
    if (index !== 0) return null
    return [
      { op: 'add', path: `${parentPathBefore}/children`, value: [] },
      { op: 'move', from, path: `${parentPathAfter}/children/0` },
    ]
  }
  if (!Array.isArray(children)) return null
  if (!Number.isInteger(index) || index < 0 || index > children.length) return null

  return [{ op: 'move', from, path: `${parentPathAfter}/children/${index}` }]
}

/**
 * JSON Pointer의 토큰 이스케이프(RFC 6901). prop 이름에 `/`나 `~`가 들어가면 경로가
 * 다른 곳을 가리킨다. 카탈로그의 prop 이름에 그런 글자가 있는지는 **재지 않았다** —
 * 없더라도 이스케이프는 두 글자짜리 규칙이라 여기 두는 편이 싸다.
 */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}
