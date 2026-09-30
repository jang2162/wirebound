import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const InlineView = defaultView('SearchForm')

/**
 * `collapsible` — 포털의 검색은 목록 위에 늘 놓여 접혀 있는 것이 기본이다. 노드의 `collapsed` 를 읽어 접힌 모습과 편 모습을 가른다.
 *
 * **접히면 자식도 DOM 에서 사라진다** — `display:none` 으로 감추면 시트가 `display` 를 덮어 되살릴 수 있어 접힘이 아니게 된다.
 * `toggle` 은 접혔을 때 남는 유일한 조각이라 시트가 머리줄처럼 그린다. `inline` 은 SDK 기본 뷰다(`collapsed` 를 안 읽는다 —
 * manifest 의 `hideProps`).
 */
export const SearchFormView = view((p) => {
  if (p.variant === 'inline') return <InlineView {...p} />
  const collapsed = p.props.collapsed === true
  return (
    <Root as="form" data-wb-structure="collapsible">
      <div data-wb-part="toggle">
        <span>검색 조건</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </div>
      {collapsed ? null : (
        <>
          <div data-wb-part="fields">{p.children}</div>
          <div data-wb-part="actions">
            <span>조회</span>
            <span>초기화</span>
          </div>
        </>
      )}
    </Root>
  )
})
