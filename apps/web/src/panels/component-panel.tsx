/**
 * 편집 모드 우측의 **«컴포넌트» 탭**(설계서 「설계서 화면 구조」) — 고른 노드의 묶음 둘: **«속성»**(`./property-panel.tsx` 그대로) ·
 * **«코멘트»**(`./comment-panel.tsx`를 고른 노드의 범위로 — `scope="node"`).
 *
 * **코멘트 묶음은 «코멘트» 탭과 한 본문이다.** 따로 짓지 않고 범위만 좁혀 그리므로 칸(목록 · 초안 · 쓰기 잠금 · 통지 — `./panel-drafts.tsx`)도
 * 조회 · 쓰기도 같다. 한쪽에서 단 말 · 친 초안이 다른 쪽에 그대로 선다 — 두 벌을 두면 목록을 따로 읽어 두 판이 갈린다.
 *
 * **코멘트 묶음은 노드를 하나 이상 고른 동안만 선다.** 고른 것이 없을 때 세우면 페이지를 열 때마다 목록 조회가 나간다(코멘트 본문은 마운트할 때
 * 읽는다 — `routes/editor.tsx`가 안 보이는 탭을 DOM 에서 빼는 까닭과 같다). 고르면 그때 읽는다.
 */
import type { ReactElement } from 'react'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'
import { CommentPanel } from './comment-panel'
import { PropertyPanel } from './property-panel'

export function ComponentPanel(props: { projectId: string; pageId: string | undefined; canEdit: boolean }): ReactElement {
  const store = useEditorStoreInstance()
  const picked = useEditorStore(store, (s) => s.selectedNodeId !== null)
  return (
    <>
      <section aria-labelledby="wb-component-part-props">
        <h2 id="wb-component-part-props" className="wb-shell-component-part-title">
          속성
        </h2>
        <PropertyPanel projectId={props.projectId} pageId={props.pageId} canEdit={props.canEdit} />
      </section>
      {picked && (
        <section className="wb-shell-component-comments" aria-labelledby="wb-component-part-comments">
          <h2 id="wb-component-part-comments" className="wb-shell-component-part-title">
            코멘트
          </h2>
          <CommentPanel projectId={props.projectId} pageId={props.pageId} canEdit={props.canEdit} scope="node" />
        </section>
      )}
    </>
  )
}
