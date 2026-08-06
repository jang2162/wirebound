/**
 * 좌측 하단의 구조 트리 — 열린 페이지의 컴포넌트 트리다(설계 §9). 편집 모드에서만 있고,
 * 뷰 모드에서는 자리째 접힌다(`routes/editor.tsx`).
 *
 * **문서와 선택은 스토어에서 온다.** 캔버스도 같은 곳을 보므로 어느 쪽에서 골라도 둘이
 * 같은 것을 가리킨다 — 각자 상태를 들면 "캔버스에서 고른 노드"와 "트리에서 고른 노드"가
 * 서로 다른 것이 되고, 그 어긋남은 속성 패널이 어느 쪽을 믿어야 할지의 문제로 번진다.
 *
 * 이 단계는 **고르는 것까지**다. 추가·삭제·드래그 이동(설계 §9)은 P2b-2가 얹는다.
 */
import type { ReactElement } from 'react'
import type { WbNode } from '@wirebound/schema'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'

export function StructureTree(props: { pageId: string | undefined }): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 그린다.
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)

  if (doc === null) {
    // 문서가 없는 이유가 셋(페이지 미선택·조회 중·조회 실패)이라는 것은 스토어만 봐서는
    // 알 수 없다(`routes/editor.tsx`의 `CanvasFrame` 주석). 어느 쪽이든 트리에 그릴
    // 것은 없으므로 여기서는 가르지 않고, 이유는 캔버스가 그 자리에서 말한다.
    return <p className="wb-shell-tree-notice">열린 페이지가 없습니다</p>
  }

  return (
    <ul className="wb-shell-structure">
      <StructureNode node={doc.root} selectedNodeId={selectedNodeId} onSelect={store.selectNode} />
    </ul>
  )
}

/**
 * 고를 수 있는 노드인가. **타입이 아니라 런타임 값을 본다** — 렌더러가 모양 가드를 두는
 * 것과 같은 이유다(`packages/renderer/src/render.tsx`): 스토어에 실리는 문서는 P2b-2부터
 * 서버 검증 전의 것이라 일시적으로 타입을 만족하지 않을 수 있다.
 */
function isSelectable(node: WbNode): boolean {
  return typeof node.id === 'string' && node.id !== ''
}

/** 노드 한 줄과 그 아래. 트리 자체가 재귀 구조라 컴포넌트도 재귀다. */
function StructureNode(props: {
  node: WbNode
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
}): ReactElement {
  const { node } = props
  // `children`이 배열이 아닌 문서는 지금 들어올 수 없지만(서버가 검증한다), 들어오면
  // `.map`이 던져 셸 전체가 죽는다 — 캔버스와 달리 이쪽에는 오류 경계가 없다. P2b-2가
  // 검증 전 문서를 스토어에 싣기 시작하면 렌더러(`packages/renderer/src/render.tsx`)처럼
  // 모양 가드가 더 필요해진다. 지금 막는 것은 그 한 줄뿐이다.
  const children = Array.isArray(node.children) ? node.children : []

  return (
    <li>
      {/* **id가 없는 노드는 고를 수 없다.** 선택은 id 하나로 오가므로(스토어·캔버스·패널이
          전부 id를 본다), id 없는 노드를 누르면 아무도 가리키지 못하는 값이 스토어에
          들어간다 — 캔버스가 빈 `data-wb-id`를 거르는 것과 같은 이유다. 대신 줄은 그대로
          보여 준다: 캔버스에는 폴백으로 그려져 있는데 트리에서만 사라지면 무엇이 잘못됐는지
          더 알기 어렵다. */}
      {isSelectable(node) ? (
        <button
          type="button"
          className="wb-shell-structure-node"
          // 선택 표시는 `aria-current`가 갖고 색은 CSS가 가져간다 — 보조 기술이 읽는 것과
          // 눈에 보이는 것이 같은 하나에서 갈라져 나와야 둘이 어긋나지 않는다(메뉴 트리의
          // 페이지 링크와 같은 방식).
          //
          // `false`가 아니라 `undefined`인 것은 `aria-current="false"`가 DOM에 남기
          // 때문이다 — 그러면 "표시가 붙은 줄"을 셀 수 없다.
          aria-current={props.selectedNodeId === node.id ? true : undefined}
          onClick={() => props.onSelect(node.id)}
        >
          {node.type}
        </button>
      ) : (
        <span className="wb-shell-structure-broken">{node.type}</span>
      )}

      {children.length > 0 && (
        <ul className="wb-shell-structure-list">
          {children.map((child, index) => (
            // 키는 노드 id다. 인덱스를 쓰면 P2b-2가 형제를 넣고 뺄 때 React가 앞 노드의
            // 상태를 다른 노드에 재사용한다. id가 없는 노드에서만 인덱스로 물러선다 —
            // 그 자리에는 쓸 id가 없다.
            <StructureNode
              key={isSelectable(child) ? child.id : `wb-invalid-${index}`}
              node={child}
              selectedNodeId={props.selectedNodeId}
              onSelect={props.onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
