import { DEFAULT_VIEWS, type View } from '@wirebound/theme-sdk'
import { CardView } from './Card'
import { KeyValueView } from './KeyValue'
import { ListView } from './List'
import { TreeView } from './Tree'

/**
 * 기본 뷰 위에 이 테마의 뷰 넷을 얹는다. 나머지 컴포넌트는 기본 뷰 DOM 이 옛 구조와 같아(`Tabs:enclosed` · `EntryForm:labelTop` ·
 * `Field:underlined` · `Button:text` 는 옛 렌더러에서도 기본 구조와 DOM 이 같았다) CSS 만으로 선다.
 */
export const DOCS_VIEWS: Readonly<Record<string, View>> = Object.freeze({
  ...DEFAULT_VIEWS,
  Card: CardView,
  List: ListView,
  Tree: TreeView,
  KeyValue: KeyValueView,
})
