/**
 * **SDK 기본 뷰.** 테마가 뷰를 내지 않은 컴포넌트는 이것으로 그린다.
 *
 * 각 컴포넌트의 **기본 구조**(카탈로그의 `structures[0]`)를 그린다 — `data-wb-structure` · `data-wb-part` 를 제 마크업의 훅으로 달고,
 * 아래 `*CssBlocks` 가 그 훅을 겨냥한다. 그래서 기본 뷰 + 그 CSS 한 장이면 테마 없이도 화면이 선다.
 *
 * `data-wb-structure` 는 `Root` 에 명시 prop 으로 준다 — 렌더러가 테마 경로에서 주는 노드 속성에는 structure 가 없다.
 */
import type { View } from '../types'
import { actionCssBlocks, ButtonView, LinkView } from './action'
import { dataCssBlocks, KeyValueView, ListView, TreeView } from './data'
import { DividerView, documentCssBlocks, MediaView, PlaceholderView, TextView } from './document'
import { EntryFormView, FieldView, inputCssBlocks, SearchFormView } from './input'
export { SEARCHFORM_COLUMNS_VAR, searchFormFieldsAttrs } from './input'
import { CardView, FlexView, GridView, PageView, SectionView, SlotView, structureCssBlocks, TabPanelView, TabsView } from './structure'

export const DEFAULT_VIEWS: Readonly<Record<string, View>> = Object.freeze({
  Page: PageView,
  Slot: SlotView,
  Section: SectionView,
  Flex: FlexView,
  Grid: GridView,
  Card: CardView,
  Tabs: TabsView,
  TabPanel: TabPanelView,
  List: ListView,
  Tree: TreeView,
  KeyValue: KeyValueView,
  SearchForm: SearchFormView,
  EntryForm: EntryFormView,
  Field: FieldView,
  Button: ButtonView,
  Link: LinkView,
  Text: TextView,
  Media: MediaView,
  Divider: DividerView,
  Placeholder: PlaceholderView,
})

/**
 * **끊을 자리 없는 긴 낱말(이메일 · 주소)이 좁은 폭에서 문서 밖으로 안 나가게** — 글자를 싣는 컴포넌트의 뿌리에 건다. 안 걸면 글자만 제 상자
 * 밖으로 나가고(요소 상자는 안 넘친다), `overflow: hidden` 조상은 그 글자를 잘라 숨긴다. 상속되므로 테마가 뷰로 바꾼 조각(카드 목록의 제목 ·
 * 정의 목록의 값)에도 닿는다. `break-word` 가 아니라 `anywhere` 다 — 최소 폭(min-content)에도 끊을 자리를 세야 표 칸 · 격자 칸이 낱말 폭까지
 * 안 버틴다. 특이도 (0,1,0) 이라 테마의 어느 규칙이든 이긴다(`apps/web/build-test/theme-system-review.test.ts` 「좁은 폭」).
 */
const LONG_WORD_CSS = `[data-wb-component="Text"],
[data-wb-component="KeyValue"],
[data-wb-component="List"] {
  overflow-wrap: anywhere;
}`

/** 기본 뷰가 서기 위한 최소 CSS. 호스트는 테마 CSS 보다 **먼저** 싣는다 — 같은 특이도에서 테마가 이긴다. */
export function defaultViewsCss(): string {
  return [
    ...structureCssBlocks(),
    ...dataCssBlocks(),
    ...inputCssBlocks(),
    ...actionCssBlocks(),
    ...documentCssBlocks(),
    LONG_WORD_CSS,
  ].join('\n')
}
