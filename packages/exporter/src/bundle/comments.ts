/**
 * **코멘트 탭이 그릴 줄들**(D4).
 *
 * 순수 함수다. 코멘트가 **어디서 왔는지**는 이 파일이 묻지 않는다 — P7-3 이월 §1이 그 출처를
 * 셋으로 갈라 두었고(살아 있는 값 / 한 시점의 값 / 스냅샷의 *"그때"*) 성질이 서로 다르다.
 * 순수 패키지가 그 정책을 가지면 P8-3의 라우트가 그것을 되돌릴 수 없다.
 *
 * ---
 *
 * ## 조용히 버리지 않는다 (D4)
 *
 * 문서의 `marker`와 입력의 코멘트는 **서로 어긋날 수 있다.** P7-3 이월 §3이 그 경로를 셋으로
 * 셌다. 여기서는 갈래마다 **다른 줄**을 낸다:
 *
 * | 상태 | 낸다 |
 * |---|---|
 * | 노드에 번호가 있고 그 노드를 가리키는 코멘트도 있다 | `comment` |
 * | 노드에 번호가 **있는데** 코멘트가 없다 (고아 마커) | `marker-without-comment` |
 * | 코멘트가 있는데 그 노드가 문서에 **없다** (고아 코멘트) | `comment`, 이름이 *"사라진 노드"* |
 * | 노드에 번호가 없는데 코멘트는 있다 | `comment`, `marker`가 `null` |
 *
 * **버리는 쪽을 고르지 않은 이유:** 목업에는 ①이 찍혀 있는데 목록에 아무것도 없으면 읽는
 * 사람이 *"내가 못 찾은 것"*으로 읽는다. P7-3 이월 §8.2 규칙 2가 이름 붙인 자리다 —
 * **화면이 못 보는 것을 세어 적고 화면이 그것을 말하게 한다.**
 */
import { describeNode, type PageDocument, type WbNode } from '@wirebound/schema'

/**
 * 번들이 받는 코멘트 하나.
 *
 * **`authorName`·`createdAt`이 선택인 것이 D4다.** §11.2의 봉투(`PageJsonComment`)는
 * `nodeId`와 `body`뿐이라 그 길로 만든 번들에는 애초에 없다. **없으면 안 그린다** —
 * 자리를 비워 두면 *"이름이 없는 사람"*과 *"이름을 안 실은 경로"*가 같은 화면이 된다.
 */
export interface BundleComment {
  nodeId: string
  body: string
  authorName?: string
  createdAt?: string
}

/**
 * 코멘트 탭의 한 줄.
 *
 * `label`은 `describeNode`가 만든 문장이고 **번호가 그 안에 들어 있다**(`① 검색 버튼`).
 * 그래서 `marker`를 화면에 다시 찍지 않는다 — 이 필드는 **기계가 읽는 자리**다(P8-3의
 * `runtime.js`가 겹layer를 그릴 때 노드와 번호를 짝지어야 한다).
 */
export type CommentEntry =
  | {
      kind: 'comment'
      nodeId: string
      label: string
      marker: number | null
      body: string
      authorName: string | null
      createdAt: string | null
    }
  | { kind: 'marker-without-comment'; nodeId: string; label: string; marker: number }

/**
 * 문서에 없는 노드를 가리키는 코멘트의 이름.
 *
 * **`schema`의 문장화가 쓰는 말과 같다**(`interaction/describe.ts`의 `MISSING_NODE`).
 * 그쪽은 모듈 안의 상수라 부를 수 없어 글자를 옮겼다 — **같은 상태를 두 말로 부르면**
 * 상호작용 탭과 코멘트 탭이 같은 노드를 다르게 부른다. 아래 케이스가 두 탭의 말을 견준다.
 */
export const MISSING_NODE_LABEL = '사라진 노드'

/**
 * 노드의 번호. **`schema`의 문장화와 같은 기준이다** — 정수이고 1 이상일 때만 번호다.
 *
 * 기준이 갈리면 `label`에는 번호가 없는데 `marker`에는 값이 있는 줄이 생긴다. 케이스가
 * 두 값을 함께 잰다.
 */
function markerOf(node: WbNode): number | null {
  const marker = node.marker
  if (typeof marker !== 'number' || !Number.isInteger(marker) || marker < 1) return null
  return marker
}

/**
 * 문서를 훑어 노드를 순서대로 낸다.
 *
 * **`walkNodes`를 쓰지 않는다.** 그 함수는 `children`이 노드 배열인 트리를 전제하고,
 * 자식이 `null`이면 던진다. 번들은 **그리지 못하는 문서도 통과시킨다** — 렌더러가 폴백
 * 상자를 그리고 `errors`로 알리는 것이 계약이므로(D9), 코멘트 목록만 던지면 그 문서는
 * 번들이 아예 안 나온다. `test-support`의 `typesIn`이 같은 이유로 같은 모양이다.
 */
function* eachNode(node: unknown): Generator<WbNode> {
  if (node === null || typeof node !== 'object') return
  const shaped = node as WbNode
  yield shaped
  const children = (node as { children?: unknown }).children
  if (!Array.isArray(children)) return
  for (const child of children) yield* eachNode(child)
}

/**
 * 코멘트 탭의 줄들을 **문서 순서로** 만든다.
 *
 * 문서에 있는 노드가 먼저고, 고아 코멘트가 뒤다 — 그것들은 문서에 자리가 없으므로
 * **입력 순서**말고 줄 세울 근거가 없다. 같은 노드에 달린 코멘트끼리도 입력 순서다.
 */
export function commentEntries(
  page: PageDocument,
  comments: readonly BundleComment[],
): CommentEntry[] {
  const byNode = new Map<string, BundleComment[]>()
  for (const comment of comments) {
    const list = byNode.get(comment.nodeId)
    if (list === undefined) byNode.set(comment.nodeId, [comment])
    else list.push(comment)
  }

  const entries: CommentEntry[] = []
  const inTree = new Set<string>()

  for (const node of eachNode(page.root)) {
    if (typeof node.id !== 'string') continue
    inTree.add(node.id)
    const label = describeNode(node)
    const marker = markerOf(node)
    const own = byNode.get(node.id)
    if (own === undefined) {
      if (marker !== null) {
        entries.push({ kind: 'marker-without-comment', nodeId: node.id, label, marker })
      }
      continue
    }
    for (const comment of own) entries.push(commentLine(node.id, label, marker, comment))
  }

  for (const comment of comments) {
    if (inTree.has(comment.nodeId)) continue
    entries.push(commentLine(comment.nodeId, MISSING_NODE_LABEL, null, comment))
  }

  return entries
}

function commentLine(
  nodeId: string,
  label: string,
  marker: number | null,
  comment: BundleComment,
): CommentEntry {
  return {
    kind: 'comment',
    nodeId,
    label,
    marker,
    body: comment.body,
    authorName: comment.authorName ?? null,
    createdAt: comment.createdAt ?? null,
  }
}
