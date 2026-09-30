import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const TableView = defaultView('List')

/**
 * `stackedList` — 이 테마의 이름표. 한 줄이 글 하나를 가리킨다(제목 왼쪽 · 날짜 오른쪽). `featured` · `compact` 는 같은 DOM 에
 * 시트만 다르다. `table` 은 `admin` 의 구조(SDK 기본 뷰)다.
 *
 * `<ul>/<li>` 로 그린다 — 줄 목록의 뜻을 태그가 나른다. 불릿 · 들여쓰기는 시트가 걷는다(`theme.css` 의 `List` 규칙).
 */
export const ListView = view((p) => {
  if (p.variant === 'table') return <TableView {...p} />
  const items = p.props.items as number
  return (
    <Root as="ul" data-wb-structure="stackedList">
      {Array.from({ length: items }, (_, index) => (
        <li key={index} data-wb-part="item">
          <div data-wb-part="title">{`항목 ${index + 1}`}</div>
          <div data-wb-part="meta">—</div>
        </li>
      ))}
      {p.props.pagination === true ? <li data-wb-part="pagination">1 2 3</li> : null}
    </Root>
  )
})
