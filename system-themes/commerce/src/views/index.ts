import { DEFAULT_VIEWS, type View } from '@wirebound/theme-sdk'
import { CardView } from './Card'
import { KeyValueView } from './KeyValue'
import { ListView } from './List'
import { SearchFormView } from './SearchForm'
import { TreeView } from './Tree'

/**
 * 기본 뷰 위에 옛 구조 선택이 DOM 을 바꾸던 다섯만 얹는다(`Card:mediaTop` · `List:mediaList` · `Tree:accordion` ·
 * `KeyValue:cardGrid` · `SearchForm:collapsible`). 나머지(`Tabs:pill` · `EntryForm:labelTop` · `Field:filled` · `Button:solid` …)는
 * 옛 구조가 기본 구조와 DOM 이 같아 `theme.css` 만으로 선다.
 */
export const COMMERCE_VIEWS: Readonly<Record<string, View>> = Object.freeze({
  ...DEFAULT_VIEWS,
  Card: CardView,
  List: ListView,
  Tree: TreeView,
  KeyValue: KeyValueView,
  SearchForm: SearchFormView,
})
