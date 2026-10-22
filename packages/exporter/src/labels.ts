/**
 * **산출물이 쓰는 말.**
 *
 * 설계서 「HTML 정적 번들」의 번들과 PPTX가 **같은 설계서를 말한다.** 같은 상태를 두 말로 부르면 — 한쪽은
 * *"코멘트가 없습니다"*, 다른 쪽은 *"코멘트 없음"* — 두 산출물을 나란히 본 사람이 그것을
 * **다른 상태**로 읽는다. `bundle/comments.ts`의 `MISSING_NODE_LABEL`이 같은 이유로 있는
 * 상수이고(그쪽은 `packages/schema`의 글자를 옮긴 자리다), 이 파일은 **번들과 PPTX 사이**의
 * 같은 자리다.
 *
 * **탭 이름을 PPTX가 절 제목으로 쓴다 — 같은 것을 싣는 탭만.** 「설계서 화면 구조」의 우측 패널이 탭 셋이고 PPTX는 탭을 만들 수
 * 없으므로 같은 이름의 절로 편다 — 이름이 갈리면 *"상호작용"* 탭과 *"동작"* 절이 같은
 * 것인지 읽는 사람이 모른다. **첫 탭은 예외다** — 탭(«페이지 정보»)은 페이지 설명과 화면 상태를 싣는데 PPTX 노트의 절은 페이지 설명만
 * 싣는다(PPTX 에는 상태를 실을 자리가 없다). 탭 이름을 절에 쓰면 «페이지 정보» 절이 설명 한 줄만 든다 — 그래서 절 이름은 따로 둔다
 * (`NOTE_DESCRIPTION_SECTION`).
 */

/**
 * 우측 패널의 탭 셋. **「설계서 화면 구조」의 뷰 모드 구성이고 `apps/web`의 `PANEL_TABS.view`와 같은 셋 · 같은 이름이다.** 첫 탭(`description`)은
 * 페이지 설명과 화면 상태(이름 · 설명)를 싣는다 — 에디터 뷰 모드의 «페이지 정보»와 같은 것을 읽어 이름도 같다. PPTX 노트의 절 이름은 따로다
 * (머리말 · `NOTE_DESCRIPTION_SECTION`).
 */
export const PANEL_TABS = [
  { id: 'description', label: '페이지 정보' },
  { id: 'comments', label: '코멘트' },
  { id: 'interactions', label: '상호작용' },
] as const

export type PanelTabId = (typeof PANEL_TABS)[number]['id']

/** 그 탭의 이름. **두 산출물이 이 함수를 지난다**(PPTX 는 코멘트 · 상호작용 절만 — 페이지 설명 절은 `NOTE_DESCRIPTION_SECTION`). */
export function panelLabel(id: PanelTabId): string {
  return PANEL_TABS.find((tab) => tab.id === id)!.label
}

/** PPTX 노트의 페이지 설명 절 이름 — 그 절은 페이지 설명만 싣는다(머리말 «탭 이름을 PPTX가 절 제목으로 쓴다 — 같은 것을 싣는 탭만»). */
export const NOTE_DESCRIPTION_SECTION = '페이지 설명'

/** 빈 상태의 말. **자리를 그냥 비우지 않는다** — 빈 자리는 *"못 찾은 것"*으로 읽힌다. */
export const EMPTY_DESCRIPTION = '페이지 설명이 없습니다'
export const EMPTY_COMMENTS = '코멘트가 없습니다'
export const EMPTY_INTERACTIONS = '상호작용이 없습니다'

/** 번호는 있는데 코멘트가 없는 노드의 말(`marker-without-comment`). */
export const MARKER_WITHOUT_COMMENT = '코멘트가 달려 있지 않습니다'

/** 화면 상태 전환기의 이름표 — 상태 목록이 있는 페이지만 그것을 싣는다. */
export const STATE_SWITCH_LABEL = '화면 상태'
