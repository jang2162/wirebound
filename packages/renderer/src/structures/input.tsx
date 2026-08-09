import type { StructureRenderer } from './registry'

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
