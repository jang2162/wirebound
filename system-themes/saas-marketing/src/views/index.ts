import { DEFAULT_VIEWS, type View } from '@wirebound/theme-sdk'
import { KeyValueView } from './KeyValue'
import { ListView } from './List'
import { MediaView } from './Media'
import { SectionView } from './Section'
import { TreeView } from './Tree'

/**
 * 이 테마의 뷰 — 기본 뷰 DOM 으로 옛 외형이 안 서는 다섯만 바꾼다. `Card` · `Tabs` · `EntryForm` · `Field` · `Button` 은 옛 구조가
 * 기본 구조와 DOM 이 같아(스킨만 다르다) 기본 뷰에 `theme.css` 를 입힌다.
 */
export const VIEWS: Readonly<Record<string, View>> = Object.freeze({
  ...DEFAULT_VIEWS,
  Section: SectionView,
  List: ListView,
  Tree: TreeView,
  KeyValue: KeyValueView,
  Media: MediaView,
})
