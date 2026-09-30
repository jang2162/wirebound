import { DEFAULT_VIEWS, type View } from '@wirebound/theme-sdk'
import { EntryFormView } from './EntryForm'
import { KeyValueView } from './KeyValue'
import { ListView } from './List'
import { SearchFormView } from './SearchForm'
import { TreeView } from './Tree'

/**
 * 테마의 뷰 표. 옛 구조가 기본 뷰와 DOM 이 달랐던 다섯만 뷰를 쓰고 나머지는 SDK 기본 뷰다 — `Card:bordered` · `Tabs:enclosed` 는
 * 옛 구현체도 기본 구조와 DOM 이 같았다(시트로만 갈린다).
 */
export const VIEWS: Readonly<Record<string, View>> = {
  ...DEFAULT_VIEWS,
  List: ListView,
  Tree: TreeView,
  KeyValue: KeyValueView,
  SearchForm: SearchFormView,
  EntryForm: EntryFormView,
}
