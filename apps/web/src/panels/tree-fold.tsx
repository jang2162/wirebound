/**
 * **트리 줄 접기의 단추** — 줄 앞의 펼침 단추(`TreeToggle`)와 트리 머리의 «모두 접기» · «모두 펴기»(`TreeFoldButtons`). 구조 트리 · 메뉴 트리가 같이
 * 쓴다(설계서 「설계서 화면 구조」 «트리 줄마다 접기»). 접힘은 `tree/collapse.ts` 가 든다.
 *
 * ## 펼침 단추는 포인터 몫이다 — 상태는 줄 단추가 말한다
 *
 * 펼침 단추는 `aria-hidden` 이고 Tab 정지점이 아니다(`tabIndex={-1}`). 접고 편 상태는 줄 단추의 `aria-expanded` 가 갖고(트리 항목 꼴),
 * 키보드는 ← → 로 접고 편다 — 구조 트리는 에디터 단축키(`shell/editor-keys.tsx`), 메뉴 트리는 그 상자의 단축키(`panels/menu-tree.tsx`).
 * 단추로 접근성 트리에 세우면 줄마다 이름 없는(또는 줄 이름을 품은) 단추가 하나 더 서서, 줄 단추를 «목록 안의 단추»로 · 줄 이름의
 * 조각으로 찾던 자리(jsdom `queryAllByRole('button')` · playwright 부분 일치)가 한꺼번에 둘을 잡는다.
 *
 * 자식 줄이 없는 줄은 같은 폭의 빈 자리를 둔다 — 이름이 깊이마다 같은 눈금에 선다.
 *
 * ## DOM 에서는 줄 단추 뒤다 — 앞에 보이는 것은 CSS 다
 *
 * 줄 상자의 첫 자식은 줄 단추로 남는다 — 펼침 단추 · 빈 자리는 그 뒤에 그리고 `order: -1`(`shell.css` 의 `.wb-shell-tree-toggle`)로 앞에
 * 세운다. 줄 상자의 첫 자식 · 첫 단추를 줄 단추로 읽는 자리(케이스의 `firstElementChild` · `querySelector('button')`)가 여럿이고, 펼침
 * 단추는 Tab 정지점도 접근성 트리의 항목도 아니라 DOM 차례와 보이는 차례가 갈려도 읽는 차례가 바뀌지 않는다.
 */
import type { ReactElement } from 'react'
import { shellIcon } from '../shell/icons'

export function TreeToggle(props: { foldable: boolean; folded: boolean; onToggle?: () => void }): ReactElement {
  if (!props.foldable) return <span className="wb-shell-tree-toggle-space" aria-hidden="true" />
  return (
    <button
      type="button"
      className="wb-shell-tree-toggle"
      data-tree-toggle=""
      aria-hidden="true"
      tabIndex={-1}
      // 접근성 트리에는 안 서지만 아이콘만 남은 단추의 꼴(이름 = `title` = 얹기 전의 글 — `shell/icons.ts` 머리말)은 지킨다.
      aria-label={props.folded ? '펴기' : '접기'}
      title={props.folded ? '펴기' : '접기'}
      onClick={props.onToggle}
    >
      {shellIcon(props.folded ? 'expand' : 'collapse', 14)}
    </button>
  )
}

/** 트리 머리의 «모두 접기» · «모두 펴기» — 아이콘만 남는 단추라 이름 · `title` 이 아이콘을 얹기 전의 글이다(`shell/icons.ts` 머리말). */
export function TreeFoldButtons(props: { onCollapse: () => void; onExpand: () => void }): ReactElement {
  return (
    <>
      <button type="button" className="wb-shell-tree-fold" aria-label="모두 접기" title="모두 접기" onClick={props.onCollapse}>
        {shellIcon('collapseAll', 14)}
      </button>
      <button type="button" className="wb-shell-tree-fold" aria-label="모두 펴기" title="모두 펴기" onClick={props.onExpand}>
        {shellIcon('expandAll', 14)}
      </button>
    </>
  )
}
