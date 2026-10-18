import { DEFAULT_VIEWS, Root, searchFormFieldsAttrs, view } from '@wirebound/theme-sdk'

const InlineSearchForm = DEFAULT_VIEWS['SearchForm']!

/**
 * **접히는 필터.** 커머스의 검색 조건은 늘 펴 두면 상품을 밀어낸다 — 접힌 상태가 기본형이고, 그 상태를 `toggle` 조각과 함께 DOM 으로
 * 낸다. 기본 뷰(`inline`)는 `collapsed` 를 읽지 않는다.
 *
 * **열을 정했으면(`columns`) `fields` 조각에 SDK 의 `searchFormFieldsAttrs` 를 편다** — `theme.css` 가 그 속성으로 격자를 깐다.
 *
 * **접히면 자식도 DOM 에서 빠진다** — `display: none` 으로 감추면 CSS 가 되살릴 수 있어 접힘이 아니게 된다. `inline` 은 기본 뷰
 * 그대로다(manifest 가 거기서 `collapsed` 를 감춘다).
 */
export const SearchFormView = view((p) => {
  if (p.variant === 'inline') return <InlineSearchForm {...p} />
  const collapsed = p.props.collapsed === true
  return (
    <Root as="form" data-wb-structure="collapsible">
      <div data-wb-part="toggle">
        <span>검색 조건</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </div>
      {collapsed ? null : (
        <>
          <div data-wb-part="fields" {...searchFormFieldsAttrs(p.props.columns)}>
            {p.children}
          </div>
          <div data-wb-part="actions">
            <span>조회</span>
            <span>초기화</span>
          </div>
        </>
      )}
    </Root>
  )
})
