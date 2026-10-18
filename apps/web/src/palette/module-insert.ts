/**
 * **모듈 묶음을 넣는 편집** — 하단 판 «모듈» 탭(`./module-tab.tsx`)의 카드 «넣기» · 끌어 놓기가 쓴다(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「B2」 · 「B3」).
 *
 * **편집은 새 종류를 만들지 않는다** — 붙여넣기와 같은 길이다: 노드는 `prepareNodesForPaste` 가 새 id 를 받고(넣는 페이지에 없는 대상을 겨냥하는
 * 액션을 빼고 센다) `insertMany`(`edit/paste-ops.ts`)가 자리에 차례로 넣는다. 묶음 하나가 편집 하나 · 되돌리기 하나다.
 *
 * | 묶음 | 노드 | 넣은 뒤 고르는 것 |
 * |---|---|---|
 * | 프로젝트 모듈 · 기본 모듈 | 새 id 로 다시 짓는다(`prepareNodesForPaste`) | 넣은 노드 전부 |
 * | 테마 패턴 | 전개가 이미 새 id 를 지었다 — 그대로 넣는다(거를 액션 · 보임 · 번호가 없다) | 첫 슬롯 노드(`patternInsert` 와 같은 `selectId`) |
 *
 * **자리는 부르는 쪽이 정한다** — 단추는 `paletteAddTarget`(고른 노드에 따라), 끌기는 놓은 대상 · 띠를 그때의 문서로 다시 판정한 자리다
 * (`drag/use-placement.ts` 의 `onModuleDrop`).
 *
 * **넣은 노드는 보임 없이 들어간다** — 모든 상태에서 보이고 지금 고른 상태와 무관하다(설계 spec «B3» · «C2»). 모듈 저장이 보임을 걷지만
 * (`moduleNodesForSave` — 화면과 서버) 그 앞에 저장된 묶음 · 손으로 넣은 행에 남았어도 여기서 걷는다.
 *
 * **순수 함수이고 던지지 않는다**(`edit/paste-ops.ts` · `./palette-add.ts` 와 같은 층).
 */
import { prepareNodesForPaste, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { insertMany } from '../edit/paste-ops'
import { selectId, type ExpandedNodes } from '../edit/pattern-insert'
import { findNodeSafely } from '../edit/safe-walk'
import type { StructureDrop } from '../edit/structure-drop'

export interface ModuleInsert {
  ops: PatchOp[]
  /** 넣은 맨 위 노드들의 id — 문서 차례. */
  insertedIds: string[]
  /** 넣은 뒤 고를 노드들 — 모듈은 넣은 노드 전부, 패턴은 첫 슬롯 하나. */
  selectIds: string[]
  /** 넣는 페이지에 없는 대상을 겨냥해 뺀 액션 수(`prepareNodesForPaste`). */
  droppedActions: number
}

/** 노드(와 자손)의 보임을 걷은 사본 — 넣은 노드는 모든 상태에서 보인다(머리말). */
function withoutVisibility(node: WbNode): WbNode {
  const next: WbNode = { ...node }
  delete next.visibility
  if (Array.isArray(node.children)) next.children = node.children.map(withoutVisibility)
  return next
}

/** 넣을 묶음 — 모듈(노드를 다시 짓는다) · 전개한 패턴(그대로 넣는다). */
export type ModuleBundle = { kind: 'nodes'; nodes: readonly WbNode[] } | { kind: 'pattern'; expanded: ExpandedNodes }

/**
 * 묶음을 `target` 에 넣는 편집. 못 넣으면 `{ reason }`(자리의 부모가 자식을 안 받음 · 연산 수 한도 · 넣은 뒤 문서가 저장될 수 없음 — `insertMany` 의
 * 문장 그대로).
 *
 * @param keepPage 페이지 대상 액션을 남길지 — 붙여넣기처럼 프로젝트의 페이지 목록으로 가늠한다(`matchPageTargets`). 페이지 대상이 없는 묶음이면 안
 *   불린다.
 * @param generate 케이스가 id 를 결정적으로 만드는 이음매. 운영은 기본값(`createNodeId`).
 */
export function moduleInsertOps(
  document: PageDocument,
  bundle: ModuleBundle,
  target: StructureDrop,
  keepPage: (target: string) => boolean,
  generate?: () => string,
): ModuleInsert | { reason: string } {
  if (bundle.kind === 'pattern') {
    const edit = insertMany(document, target.parentId, target.index, bundle.expanded.nodes, '넣지')
    if ('reason' in edit) return edit
    return { ...edit, selectIds: [selectId(bundle.expanded)], droppedActions: 0 }
  }
  const prepared = prepareNodesForPaste(
    bundle.nodes.map(withoutVisibility),
    { node: (id) => findNodeSafely(document.root, id) !== undefined, page: keepPage },
    generate,
  )
  const edit = insertMany(document, target.parentId, target.index, prepared.nodes, '넣지')
  if ('reason' in edit) return edit
  return { ...edit, selectIds: edit.insertedIds, droppedActions: prepared.droppedActions }
}

/** 넣으며 뺀 것을 말하는 한 줄 — 없으면 빈 글. 넣기는 성공했으므로 정보 통지 자리에 선다(실패 자리가 아니다). */
export function moduleDroppedNotice(edit: Pick<ModuleInsert, 'droppedActions'>): string {
  return edit.droppedActions > 0 ? `상호작용 동작 ${edit.droppedActions}개는 대상이 없어 빼고 넣었습니다.` : ''
}
