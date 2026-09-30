import { Root, view } from '@wirebound/theme-sdk'

/**
 * **목록 둘 — 미디어 줄과 상품 격자.** 옛 테마는 구조를 하나만 골라(`mediaList`) 격자를 `Grid` + `Card` 로 조립하게 했다. 이제 둘 다
 * variant 라 한 문서에 함께 둔다. `compact` · `featured` 는 미디어 줄의 스킨이라 DOM 이 같다.
 *
 * 기본 뷰(표)로는 둘 다 못 선다 — 미디어 줄은 «썸네일 옆에 이름 위 가격» 을 한 덩어리로 묶는 `body` 조각이, 격자는 칸마다 이미지
 * 자리(`media`)가 있어야 한다. `columns`(표의 열 이름)는 읽지 않는다 — manifest 가 모든 variant 에서 감춘다.
 *
 * 초점 · 마커는 루트다 — 페이지네이션도 목록의 일부라 루트 상자 전체가 노드다.
 */
export const ListView = view(({ props, variant }) => {
  const items = props.items as number
  const pagination = props.pagination === true
  if (variant === 'cardGrid') {
    return (
      <Root as="div" data-wb-structure="cardGrid">
        {Array.from({ length: items }, (_, index) => (
          <div key={index} data-wb-part="item">
            <div data-wb-part="media" />
            <div data-wb-part="title">{`항목 ${index + 1}`}</div>
            <div data-wb-part="meta">—</div>
          </div>
        ))}
        {pagination ? <div data-wb-part="pagination">1 2 3</div> : null}
      </Root>
    )
  }
  return (
    <Root as="ul" data-wb-structure="mediaList">
      {Array.from({ length: items }, (_, index) => (
        <li key={index} data-wb-part="item">
          <div data-wb-part="media" />
          <div data-wb-part="body">
            <div data-wb-part="title">{`항목 ${index + 1}`}</div>
            <div data-wb-part="meta">—</div>
          </div>
        </li>
      ))}
      {pagination ? <li data-wb-part="pagination">1 2 3</li> : null}
    </Root>
  )
})
