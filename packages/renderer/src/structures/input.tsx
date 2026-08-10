/**
 * **입력 그룹.** `SearchForm`·`EntryForm`·`Field`.
 *
 * 카탈로그의 `component/catalog/input.ts`와 같은 경계다(P4b-2 D2). 등록(`INPUT_ENTRIES`)과
 * 기본 CSS(`inputCssBlocks`)를 이 파일이 소유한다. 공용 도구는 `../structure-css-tools`에
 * 있다 — 복사해 오지 마라.
 */
import type { StructureEntry, StructureRenderer } from './registry'

export const SearchFormInline: StructureRenderer = ({ attrs, part, children }) => (
  <form {...attrs}>
    <div {...part('fields')}>{children}</div>
    <div {...part('actions')}>
      <span>조회</span>
      <span>초기화</span>
    </div>
  </form>
)

export const EntryFormLabelLeft: StructureRenderer = ({ attrs, props, part, children }) => (
  <form {...attrs}>
    {props.title ? <div {...part('label')}>{String(props.title)}</div> : null}
    <div {...part('row')}>{children}</div>
    <div {...part('actions')}>
      <span>저장</span>
      <span>취소</span>
    </div>
  </form>
)

export const FieldOutlined: StructureRenderer = ({ attrs, props, part }) => (
  <div {...attrs}>
    <label {...part('label')}>{String(props.label)}</label>
    {/* `data-control`은 없어졌다 — `control`이 `data-wb-variant`로 루트에 나간다.
        조각이 아니라 루트에 붙으므로 테마는 `[data-wb-variant="select"] [data-wb-part="control"]`로
        같은 자리를 겨냥한다. */}
    <div {...part('control')}>
      {String(props.placeholder) || ' '}
    </div>
  </div>
)

/** 이 그룹이 등록하는 구조. 구조를 더하면 여기에 한 줄을 더한다(파일 끝에 둔다 — TDZ). */
export const INPUT_ENTRIES: StructureEntry[] = [
  ['SearchForm', 'inline', SearchFormInline],
  ['EntryForm', 'labelLeft', EntryFormLabelLeft],
  ['Field', 'outlined', FieldOutlined],
]
