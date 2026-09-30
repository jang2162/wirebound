import { DEFAULT_VIEWS, Root, view } from '@wirebound/theme-sdk'

const PlainCard = DEFAULT_VIEWS['Card']!

/**
 * **상품 카드 — 머리에 이미지 자리(`media` 조각)가 있다.** 기본 뷰(`plain`)에는 그 조각이 없어 CSS 로는 만들 수 없다 — 없는 상자는
 * 겨냥할 수 없다. 상품 격자는 `Grid` + 이 카드로 조립한다.
 *
 * `plain` 은 기본 뷰 그대로다(글만 담는 카드). 초점 · 마커는 루트다 — 루트가 곧 카드의 상자이고 감싸는 틀이 없다.
 */
export const CardView = view((p) => {
  if (p.variant === 'plain') return <PlainCard {...p} />
  const { props, children } = p
  return (
    <Root as="div" data-wb-structure="mediaTop">
      <div data-wb-part="media" />
      <div data-wb-part="header">
        <div data-wb-part="title">{String(props.title)}</div>
        {props.subtitle ? <div data-wb-part="subtitle">{String(props.subtitle)}</div> : null}
      </div>
      <div data-wb-part="body">{children}</div>
    </Root>
  )
})
