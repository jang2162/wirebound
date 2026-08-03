import { ButtonSolid, LinkDefault } from './action'
import { KeyValueTable, ListTable, TreeIndent } from './data'
import { DividerDefault, MediaImage, PlaceholderDefault, TextDefault } from './document'
import { EntryFormLabelLeft, FieldOutlined, SearchFormInline } from './input'
import { getStructure, registerStructure, type StructureRenderer } from './registry'
import {
  CardPlain,
  FlexDefault,
  GridDefault,
  PageDefault,
  SectionContained,
  SlotDefault,
  TabsUnderline,
} from './structure'

const DEFAULTS: [type: string, structure: string, render: StructureRenderer][] = [
  ['Page', 'default', PageDefault],
  ['Slot', 'default', SlotDefault],
  ['Section', 'contained', SectionContained],
  ['Flex', 'default', FlexDefault],
  ['Grid', 'default', GridDefault],
  ['Card', 'plain', CardPlain],
  ['Tabs', 'underline', TabsUnderline],
  ['List', 'table', ListTable],
  ['Tree', 'indent', TreeIndent],
  ['KeyValue', 'table', KeyValueTable],
  ['SearchForm', 'inline', SearchFormInline],
  ['EntryForm', 'labelLeft', EntryFormLabelLeft],
  ['Field', 'outlined', FieldOutlined],
  ['Button', 'solid', ButtonSolid],
  ['Link', 'default', LinkDefault],
  ['Text', 'default', TextDefault],
  ['Media', 'image', MediaImage],
  ['Divider', 'default', DividerDefault],
  ['Placeholder', 'default', PlaceholderDefault],
]

/** 기본 구조를 등록한다. 이미 등록돼 있으면 건너뛴다. */
export function installStructures(): void {
  for (const [type, structure, render] of DEFAULTS) {
    if (!getStructure(type, structure)) registerStructure(type, structure, render)
  }
}
