/**
 * **거절돼 돌아온 노드의 선택을 되돌린다** — 지우는 편집은 보내자마자 선택을 부모(키보드 삭제는 빈 선택)로 옮기는데(`panels/structure-toolbar.tsx`
 * 의 `removeSelected` — 안 옮기면 지운 노드를 쥔 선택이 남고 둘째 Delete 가 이웃을 지운다), 서버가 편집을 통째로 거절하면(423 · 422 · 409) 수습이 문서를
 * 서버 것으로 다시 실어(`EditorStore.loadPage`) 노드는 돌아오나 선택은 옮긴 채로 남았다(Chrome · `build-test/keyboard-holes.test.ts` «7»).
 *
 * **신호는 «다시 실은 문서에 지운 노드가 모두 지울 때의 부모 밑에 있다»이다.** 수습만이 지운 편집을 안 보낸 것으로 되돌리는 판을 싣는다(`documentLoads` 가 오른다) — 이
 * 값은 받아 간 편집의 ack 로는 안 오른다. 사람이 그 사이 선택을 바꿨거나(`selection` 이 달라짐) 페이지를 옮겼으면 말없이 접는다 — 사람이 둔 선택을
 * 뺏지 않는다. 남이 잡은 노드는 `selectMany` 가 거른다(거절의 까닭이 대개 그 잠금이다).
 */
import type { EditorStore } from '../store/editor-store'
import { nodeSpot } from './structure-actions'

/** 지운 노드 하나 — 지울 때의 부모. 돌아온 자리가 그 부모일 때만 선택을 돌려준다(아래). */
export interface RemovedNode {
  id: string
  parentId: string
}

export function restoreSelectionOnReload(store: EditorStore, removed: { nodes: readonly RemovedNode[]; anchor: string | null }): void {
  const start = store.getState()
  const pageId = start.openPageId
  const loads = start.documentLoads
  const set = start.selectedNodeIds
  const picked = start.selectedNodeId
  const stop = store.subscribe(() => {
    const now = store.getState()
    const sameSelection = now.selectedNodeId === picked && now.selectedNodeIds.length === set.length && now.selectedNodeIds.every((id, at) => id === set[at])
    if (now.openPageId !== pageId || !sameSelection) return stop()
    if (now.documentLoads === loads) return
    stop()
    const doc = now.document
    // 남이 그 사이 노드를 지웠거나 다른 부모로 옮겼으면(돌아온 자리가 지울 때의 부모가 아니면) 돌려줄 노드가 없다 — 비운 채로 둔다.
    if (doc !== null && removed.nodes.every((node) => nodeSpot(doc, node.id)?.parentId === node.parentId)) {
      store.selectMany(removed.nodes.map((node) => node.id), 'replace', removed.anchor ?? undefined)
    }
  })
}
