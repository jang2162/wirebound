/**
 * 편집 모드 우측의 **«컴포넌트» 탭**(설계서 「설계서 화면 구조」) — 고른 노드의 묶음 둘: **«속성»**(`./property-panel.tsx` 그대로) ·
 * **«코멘트»**(`./comment-panel.tsx`를 고른 노드의 범위로 — `scope="node"`).
 *
 * **코멘트 묶음은 «코멘트» 탭과 한 본문이다.** 따로 짓지 않고 범위만 좁혀 그리므로 칸(목록 · 초안 · 쓰기 잠금 · 통지 — `./panel-drafts.tsx`)도
 * 조회 · 쓰기도 같다. 한쪽에서 단 말 · 친 초안이 다른 쪽에 그대로 선다 — 두 벌을 두면 목록을 따로 읽어 두 판이 갈린다.
 *
 * **코멘트 묶음은 노드를 하나 이상 고른 동안만 선다.** 고른 것이 없을 때 세우면 페이지를 열 때마다 목록 조회가 나간다(코멘트 본문은 마운트할 때
 * 읽는다 — `routes/editor.tsx`가 안 보이는 탭을 DOM 에서 빼는 까닭과 같다). 고르면 그때 읽는다.
 *
 * **코멘트 묶음은 기본으로 접혀 있다** — 머리 줄(«코멘트» · «N개» · «펼치기»)만 서고 속성이 탭을 차지한다. 접힌 동안에도 본문은 마운트한 채
 * 감춘다(`hidden`) — 그래야 목록을 읽어 수를 말하고, 남의 쓰기(`comments-changed`)에 그 수가 따라간다. **그 노드에 쓰던 글(새 코멘트 초안 ·
 * 고치는 중인 코멘트)이 있으면 펴 둔다**(`useNodeComments` 의 `writing`) — 초안을 숨기지 않는다. 그동안 접기 단추는 꺼지고, 쓰던 글이 서면 편 상태로
 * 바뀐다(달아 초안이 비어도 접히지 않는다 — 방금 단 말이 보인다). 사람이 편 상태는
 * 셸이 사는 동안(노드를 바꿔 골라도 · 탭 · 모드 · 페이지를 오가도) 남는다 — 그 값은 우측 패널이 든다(`ComponentCommentsOpenProvider`).
 */
import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'
import { CommentPanel, useNodeComments } from './comment-panel'
import { PropertyPanel } from './property-panel'

/** 접기 단추가 꺼진 까닭(`title`). */
export const COMMENTS_KEPT_OPEN = '쓰던 코멘트가 있어 접지 않습니다'

type OpenState = readonly [boolean, (open: boolean) => void]
const CommentsOpen = createContext<OpenState | null>(null)

/** 사람이 «코멘트» 묶음을 편 상태 — 우측 패널(`routes/editor.tsx` 의 `RightPanel`)이 셸 동안 든다. 탭 본문은 탭을 옮기면 내려가서다. */
export function ComponentCommentsOpenProvider(props: { children: ReactNode }): ReactElement {
  const state = useState(false)
  return <CommentsOpen.Provider value={state}>{props.children}</CommentsOpen.Provider>
}

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
      {picked && <CommentsPart projectId={props.projectId} pageId={props.pageId} canEdit={props.canEdit} />}
    </>
  )
}

function CommentsPart(props: { projectId: string; pageId: string | undefined; canEdit: boolean }): ReactElement {
  const store = useEditorStoreInstance()
  // 수 · 쓰던 글은 «달 곳» 과 같은 값으로 본다 — 하나를 골랐을 때만(여럿이면 `CommentPanel` 도 달 곳이 없다).
  const nodeId = useEditorStore(store, (s) => (s.selectedNodeIds.length > 1 ? null : s.selectedNodeId))
  const { count, writing } = useNodeComments(nodeId)
  const shared = useContext(CommentsOpen)
  const local = useState(false)
  const [userOpen, setUserOpen] = shared ?? local
  // 쓰던 글이 서면 편 상태로 둔다 — 달아 초안이 비는 순간 접히면 방금 단 말이 안 보인다.
  useEffect(() => {
    if (writing && !userOpen) setUserOpen(true)
  }, [writing, userOpen, setUserOpen])
  const open = userOpen || writing
  return (
    <section className="wb-shell-component-comments" aria-labelledby="wb-component-part-comments">
      <div className="wb-shell-component-part-head">
        <h2 id="wb-component-part-comments" className="wb-shell-component-part-title wb-shell-component-part-title-inline">
          코멘트
        </h2>
        {count !== null && <span className="wb-shell-component-part-count">{count}개</span>}
        <button
          type="button"
          className="wb-shell-component-part-toggle"
          aria-expanded={open}
          aria-controls="wb-component-comments-body"
          disabled={writing}
          title={writing ? COMMENTS_KEPT_OPEN : undefined}
          onClick={() => setUserOpen(!userOpen)}
        >
          {open ? '접기' : '펼치기'}
        </button>
      </div>
      <div id="wb-component-comments-body" hidden={!open}>
        <CommentPanel projectId={props.projectId} pageId={props.pageId} canEdit={props.canEdit} scope="node" />
      </div>
    </section>
  )
}
