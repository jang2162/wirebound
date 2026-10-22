/**
 * 우측 패널의 **«페이지 정보»** 탭(설계서 「설계서 화면 구조」) — 편집 모드에서는 «속성» 왼쪽, 뷰 모드에서는 첫 탭이다. 차례는 페이지 이름 →
 * 페이지 설명 → 상태다.
 *
 * | 자리 | 무엇이 든다 |
 * |---|---|
 * | 이름 · 설명 | `./page-description.tsx`의 `PageMeta` — 자기 조회 · 바탕을 실은 저장 · 충돌 화면(`./meta-conflict.tsx`). 이름은 메뉴 트리의 이름 바꾸기와 같은 요청이다 |
 * | 상태 | `./page-states.tsx`의 `PageStates` — 열린 문서의 상태 목록 · 추가 · 이름 · 설명 · 순서 · 삭제 |
 *
 * **쓰기는 편집할 수 있는 판에서만이다**(`canEdit` — 셸이 «편집 모드이고 editor 이상»으로 내린다. 메뉴 트리의 줄 행동이 서는 판과 같은 값).
 * 뷰 모드는 같은 탭을 읽기만 한다 — 결과를 보는 모드다.
 */
import type { ReactElement } from 'react'
import { NO_PAGE, PageMeta } from './page-description'
import { PageStates } from './page-states'

export function PageInfoPanel(props: { projectId: string; pageId: string | undefined; canEdit: boolean; menuRev: number }): ReactElement {
  if (props.pageId === undefined) return <p className="wb-shell-panel-notice">{NO_PAGE}</p>
  return (
    <>
      <PageMeta projectId={props.projectId} pageId={props.pageId} canEdit={props.canEdit} menuRev={props.menuRev} />
      <PageStates projectId={props.projectId} pageId={props.pageId} canEdit={props.canEdit} />
    </>
  )
}
