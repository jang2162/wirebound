import { defineTheme } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
import './theme.css'
import { ButtonView, LinkView } from './views/action'
import {
  DataGridView,
  GridCellView,
  GridColumnGroupView,
  GridColumnView,
  GridRowView,
  KeyValueView,
  PaginationView,
  TreeView,
} from './views/data'
import { DividerView, MediaView, PlaceholderView, TextView } from './views/document'
import { EntryFormView, FieldView, FormTableView, SearchFormView } from './views/input'
import { CardView, FlexView, GridView, PageView, SectionView, SlotView, TabsView } from './views/structure'

// 뷰를 빼면 그 컴포넌트는 SDK 기본 뷰로 그려진다 — 고칠 것만 남겨도 된다.
export default defineTheme({
  manifest,
  views: {
    Page: PageView,
    Slot: SlotView,
    Section: SectionView,
    Flex: FlexView,
    Grid: GridView,
    Card: CardView,
    Tabs: TabsView,
    DataGrid: DataGridView,
    GridColumnGroup: GridColumnGroupView,
    GridColumn: GridColumnView,
    GridRow: GridRowView,
    GridCell: GridCellView,
    Pagination: PaginationView,
    Tree: TreeView,
    KeyValue: KeyValueView,
    SearchForm: SearchFormView,
    EntryForm: EntryFormView,
    FormTable: FormTableView,
    Field: FieldView,
    Button: ButtonView,
    Link: LinkView,
    Text: TextView,
    Media: MediaView,
    Divider: DividerView,
    Placeholder: PlaceholderView,
  },
})
