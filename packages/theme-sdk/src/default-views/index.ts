/**
 * **SDK 기본 뷰.** 테마가 뷰를 내지 않은 컴포넌트는 이것으로 그린다.
 *
 * 각 컴포넌트의 **기본 구조**(카탈로그의 `structures[0]`) 구현체를 옮긴 것이고, DOM 은 그 구현체와 바이트까지 같다 —
 * `data-wb-structure` · `data-wb-part` 도 제 마크업의 훅으로 그대로 단다(`packages/renderer/test/default-view-parity.test.tsx`
 * 가 대조한다). 그래서 기본 뷰 + 옛 컴파일 CSS 한 장이면 옛 캔버스와 같은 외형이 선다.
 *
 * `data-wb-structure` 는 `Root` 에 명시 prop 으로 준다 — 렌더러가 테마 경로에서 주는 노드 속성에는 structure 가 없다.
 */
import type { View } from '../types'
import { actionCssBlocks, ButtonView, LinkView } from './action'
import { dataCssBlocks, KeyValueView, ListView, TreeView } from './data'
import { DividerView, documentCssBlocks, MediaView, PlaceholderView, TextView } from './document'
import { EntryFormView, FieldView, inputCssBlocks, SearchFormView } from './input'
import { CardView, FlexView, GridView, PageView, SectionView, SlotView, structureCssBlocks, TabsView } from './structure'

export const DEFAULT_VIEWS: Readonly<Record<string, View>> = Object.freeze({
  Page: PageView, Slot: SlotView, Section: SectionView, Flex: FlexView, Grid: GridView, Card: CardView, Tabs: TabsView,
  List: ListView, Tree: TreeView, KeyValue: KeyValueView,
  SearchForm: SearchFormView, EntryForm: EntryFormView, Field: FieldView,
  Button: ButtonView, Link: LinkView,
  Text: TextView, Media: MediaView, Divider: DividerView, Placeholder: PlaceholderView,
})

/** 기본 뷰가 서기 위한 최소 CSS. 호스트는 테마 CSS 보다 **먼저** 싣는다 — 같은 특이도에서 테마가 이긴다. */
export function defaultViewsCss(): string {
  return [...structureCssBlocks(), ...dataCssBlocks(), ...inputCssBlocks(), ...actionCssBlocks(), ...documentCssBlocks()].join('\n')
}
