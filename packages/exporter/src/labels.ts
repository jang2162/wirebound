/**
 * **산출물이 쓰는 말**(P10-1 D4).
 *
 * §11.3의 번들과 PPTX가 **같은 설계서를 말한다.** 같은 상태를 두 말로 부르면 — 한쪽은
 * *"코멘트가 없습니다"*, 다른 쪽은 *"코멘트 없음"* — 두 산출물을 나란히 본 사람이 그것을
 * **다른 상태**로 읽는다. `bundle/comments.ts`의 `MISSING_NODE_LABEL`이 같은 이유로 있는
 * 상수이고(그쪽은 `packages/schema`의 글자를 옮긴 자리다), 이 파일은 **번들과 PPTX 사이**의
 * 같은 자리다.
 *
 * **탭 이름을 PPTX가 절 제목으로 쓴다.** §9의 우측 패널이 탭 셋이고 PPTX는 탭을 만들 수
 * 없으므로 같은 이름의 절로 편다 — 이름이 갈리면 *"상호작용"* 탭과 *"동작"* 절이 같은
 * 것인지 읽는 사람이 모른다.
 */

/** 우측 패널의 탭 셋. **§9의 뷰 모드 구성이고 `apps/web`의 `PANEL_TABS.view`와 같은 셋이다.** */
export const PANEL_TABS = [
  { id: 'description', label: '페이지 설명' },
  { id: 'comments', label: '코멘트' },
  { id: 'interactions', label: '상호작용' },
] as const

export type PanelTabId = (typeof PANEL_TABS)[number]['id']

/** 그 탭의 이름. **두 산출물이 이 함수를 지난다.** */
export function panelLabel(id: PanelTabId): string {
  return PANEL_TABS.find((tab) => tab.id === id)!.label
}

/** 빈 상태의 말. **자리를 그냥 비우지 않는다** — 빈 자리는 *"못 찾은 것"*으로 읽힌다. */
export const EMPTY_DESCRIPTION = '페이지 설명이 없습니다'
export const EMPTY_COMMENTS = '코멘트가 없습니다'
export const EMPTY_INTERACTIONS = '상호작용이 없습니다'

/** 번호는 있는데 코멘트가 없는 노드의 말(`marker-without-comment`). */
export const MARKER_WITHOUT_COMMENT = '코멘트가 달려 있지 않습니다'
