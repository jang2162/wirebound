/**
 * 전개된 패턴을 문서 어디에 꽂을지 정하고 `PatchOp`로 옮기는 곳.
 *
 * **순수 함수이고 React·DOM·`fetch`를 모른다** — `./ops.ts`·`./structure-actions.ts`와
 * 같은 층이다. **던지지 않는다**: 부르는 자리가 구조 트리의 명령(`panels/structure-toolbar.tsx`)이고 거기는 오류 경계 밖이라
 * 던지면 셸 전체가 흰 화면이 된다(`panels/structure-toolbar.tsx` 머리말).
 *
 * ---
 *
 * **새 API를 만들지 않는다.** 패턴 삽입은 결국 `add` op 몇 개이므로 기존 커밋 경로
 * (`useEditCommit.commitOps`)를 그대로 타면 **undo·낙관적 편집·경고 표시가 전부 공짜**로
 * 따라온다. 서버는 `applyEdit` 하나로 끝나고 `revisions`에도 평범한 편집으로 남는다.
 * 새 엔드포인트를 만들면 그것이 `applyEdit`을 다시 부르는 두 번째 쓰기 자리가 되고,
 * 쓰기 자리를 하나로 두는 규칙을 깨는 방향이다.
 */
import {
  applyOps,
  partitionIssues,
  validatePage,
  type PageDocument,
  type PatchOp,
  type ValidationIssue,
  type WbNode,
} from '@wirebound/schema'
import { insertNodeOps } from './ops'
import { nodeSpot, structureAbilities } from './structure-actions'
import { findNodeSafely } from './safe-walk'

/** 전개 결과 중 이 파일이 쓰는 부분. `@wirebound/themes`의 `ExpandedPattern`과 같은 모양이다. */
export interface ExpandedNodes {
  nodes: readonly WbNode[]
  /** 슬롯 이름 → 전개된 노드 id. 전개는 슬롯의 값을 채우지 않는다 — 사용자가 채운다. */
  slots: ReadonlyMap<string, string>
}

/**
 * 왜 꽂지 못했는가. **`null`이 아니라 이유를 낸다** — 화면이 *"패턴이
 * 잘못됐다"*와 *"내가 잘못 눌렀다"*를 갈라 말할 수 있어야 한다.
 *
 * | 값 | 무엇이 잘못됐나 | 사용자가 할 일 |
 * |---|---|---|
 * | `'empty'` | 전개가 노드를 하나도 내지 않았다 | 다른 패턴을 고른다 |
 * | `'no-spot'` | 고른 자리에 꽂을 수 없다(선택이 문서에 없다·자리가 깨졌다) | 다른 노드를 고른다 |
 * | `'invalid'` | **패턴 자체가** 페이지에 놓일 수 없다 | 테마를 고친다(그 패턴은 테마 manifest 의 `patterns`에 있다) |
 */
export type PatternInsertReason = 'empty' | 'no-spot' | 'invalid'

export interface PatternInsert {
  ops: PatchOp[]
  /**
   * 꽂은 뒤 고를 노드.
   *
   * **아무 데도 안 가면 슬롯을 채우는 흐름이 끊긴다** — 슬롯을 채우려면 사용자가 그 노드를 골라야
   * 하는데(전개는 값을 채우지 않는다), 선택이 그대로면 방금 넣은 것이 어디 있는지도
   * 알려 주지 않는다. 그래서 **첫 슬롯 노드**로 간다. 슬롯이 없으면 전개된 첫 노드다.
   *
   * **꽂은 노드 중 하나인 것이 계약이다.** 트리 밖 id를 고르면 선택이 사라진 노드를
   * 가리켜 속성 패널이 비고, 그것이 삭제 뒤 선택을 옮기는 이유와 같은 부류가 된다.
   */
  selectId: string
}

/**
 * 전개된 노드를 문서에 꽂는 편집을 만든다. 만들지 못하면 `insert`가 `null`이고 `reason`이
 * 왜인지 말한다.
 *
 * `issues`는 `reason === 'invalid'`일 때만 비어 있지 않다 — 화면이 무엇이 잘못됐는지
 * 그대로 보일 수 있게 싣는다.
 */
export function patternInsert(
  document: PageDocument,
  selectedNodeId: string | null,
  expanded: ExpandedNodes,
): {
  insert: PatternInsert | null
  reason: PatternInsertReason | null
  issues: ValidationIssue[]
} {
  const nodes = expanded.nodes
  if (nodes.length === 0) return { insert: null, reason: 'empty', issues: [] }

  /**
   * **판정은 전개된 노드만 담은 프로브로 한다** — `TypePicker.placeableTypes`가 하는 것과
   * 같은 형태다. 문서 전체를 검증하면 **이미 깨진 문서에서 멀쩡한 패턴도 막힌다**:
   * 알 수 없는 타입의 노드가 하나 있으면 `validatePage`가 그 문서에 `error`를 내는데,
   * 그것을 0으로 만드는 길은 그 노드를 지우는 것뿐이고(`structure-actions.ts`의 실측)
   * 패턴 삽입은 그것과 아무 상관이 없다.
   *
   * **`error`만 본다.** `ignored-variant` 같은 `warning`은 편집 파이프라인도 막지 않으므로
   * (`apps/api/README.md` 「이슈의 severity — 무엇이 저장을 막는가」) 여기서 막으면 화면만
   * 서버보다 엄격해진다.
   */
  const probe: PageDocument = {
    version: document.version,
    root: { id: 'n-pattern-probe', type: 'Page', children: [...nodes] },
  }
  const { errors } = partitionIssues(validatePage(probe))
  if (errors.length > 0) return { insert: null, reason: 'invalid', issues: errors }

  const spot = insertSpot(document, selectedNodeId)
  if (spot === null) return { insert: null, reason: 'no-spot', issues: [] }

  /**
   * **문서를 진행시키며 op을 만든다.** `insertNodeOps`는 준 문서의 `children` 길이로
   * 인덱스 범위를 보므로, 원본 문서만 보고 `index + i`를 주면 **둘째 노드부터 범위 밖**이
   * 되어 `null`이 나온다. `moveNodeOps`가 `remove` 뒤 경로를 다시 찾는 것과 같은 형태다.
   *
   * `children` 키가 없던 부모의 첫 op이 배열째 `add`인 것도 여기서 저절로 갈린다 —
   * 진행된 문서에는 그 배열이 이미 있다.
   */
  const ops: PatchOp[] = []
  let current = document
  for (let index = 0; index < nodes.length; index += 1) {
    const step = insertNodeOps(current, spot.parentId, spot.index + index, nodes[index]!)
    if (step === null) return { insert: null, reason: 'no-spot', issues: [] }
    ops.push(...step)
    // `insertNodeOps`가 `null`이 아니면 적용 가능한 op이다(그쪽이 갈래를 재 뒀다).
    current = applyOps(current, step)
  }

  return { insert: { ops, selectId: selectId(expanded) }, reason: null, issues: [] }
}

/**
 * 꽂을 부모와 인덱스.
 *
 * - 선택이 없으면 **root의 자식 끝**.
 * - 선택 노드가 자식을 받을 수 있으면 **그 자식 끝**.
 * - 못 받으면 **그 노드 바로 뒤 형제**. **거부하지 않는다** — 사용자가 *"여기쯤"*을 가리킨
 *   것이고, 거부는 어디를 눌러야 할지 알려 주지 않는다.
 *
 * **자식 허용 판정을 여기서 다시 짓지 않는다.** `structureAbilities`의 `addInside`가 그
 * 판정을 가진 유일한 자리이고, 그것은 카탈로그의 `children === 'many'`뿐 아니라
 * 문서의 `children`이 배열인지도 본다 — 둘 중 하나만 봐서는 눌러도 아무 일이 없는 자리가
 * 생긴다.
 *
 * **선택 노드가 문서에 없으면 `null`이다 — root로 흘리지 않는다.** 그것은 *"선택이
 * 없다"*와 다른 상태이고, 조용히 다른 곳에 꽂으면 사용자가 가리킨 적 없는 자리에 노드가
 * 생긴다.
 */
function insertSpot(document: PageDocument, selectedNodeId: string | null): { parentId: string; index: number } | null {
  if (selectedNodeId === null) {
    const rootId = document.root?.id
    if (typeof rootId !== 'string') return null
    return { parentId: rootId, index: document.root.children?.length ?? 0 }
  }

  const selected = findNodeSafely(document.root, selectedNodeId)
  if (selected === undefined) return null

  if (structureAbilities(document, selectedNodeId).addInside) {
    return { parentId: selectedNodeId, index: selected.children?.length ?? 0 }
  }

  // 자식을 못 받는다 — 형제 뒤로. 루트가 자식을 못 받는 문서(깨진 문서)에서는 `nodeSpot`이
  // `null`이고, 그때는 꽂을 자리가 정말로 없다.
  const spot = nodeSpot(document, selectedNodeId)
  if (spot === null) return null
  return { parentId: spot.parentId, index: spot.index + 1 }
}

/**
 * 꽂은 뒤 고를 노드의 id. **첫 슬롯 노드, 없으면 전개된 첫 노드.** 하단 판 «모듈» 탭의 테마 패턴 넣기도 이것으로 고른다(`palette/module-insert.ts`).
 *
 * *"첫"*은 `slots` 맵의 순회 순서이고, 그것은 `expandPattern`이 **전위 순회로** 넣은
 * 순서다 — 사용자가 트리에서 위에서부터 보는 순서와 같다.
 */
export function selectId(expanded: ExpandedNodes): string {
  const first = expanded.nodes[0]!.id
  const placed = new Set<string>()
  const collect = (node: WbNode): void => {
    placed.add(node.id)
    for (const child of node.children ?? []) collect(child)
  }
  for (const node of expanded.nodes) collect(node)

  for (const nodeId of expanded.slots.values()) {
    // **꽂은 노드 중 하나여야 한다.** 그렇지 않은 매핑은 전개가 내지 않지만, 여기서
    // 가정하면 선택이 문서에 없는 노드를 가리킬 수 있다.
    if (placed.has(nodeId)) return nodeId
  }
  return first
}
