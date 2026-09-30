import { Children } from 'react'
import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const LabelLeftView = defaultView('EntryForm')

/**
 * `sectioned` — 민원 · 신청 서식. **최상위 자식 하나가 구획 하나다** — 구획 수를 말하는 prop 이 없고, 저자는 필드 묶음을
 * `Card` · `Flex` 로 묶어 넣는다. 구획 머리글의 글자는 자리 표시자다(와이어프레임).
 *
 * `label` 조각이 폼의 `title` 을 담는다(기본 뷰와 같은 이름). 조각 규칙이 자손 결합자라 안의 `Field` · `Button` 의 `label` 에도
 * 닿는다 — 시트가 그 둘을 되돌린다(`theme.css` 의 `EntryForm` 규칙). `labelLeft` 는 SDK 기본 뷰다.
 */
export const EntryFormView = view((p) => {
  if (p.variant === 'labelLeft') return <LabelLeftView {...p} />
  return (
    <Root as="form" data-wb-structure="sectioned">
      {p.props.title ? <div data-wb-part="label">{String(p.props.title)}</div> : null}
      {Children.map(p.children, (child, index) => (
        <div data-wb-part="section">
          <div data-wb-part="sectionTitle">구획 {index + 1}</div>
          <div data-wb-part="row">{child}</div>
        </div>
      ))}
      <div data-wb-part="actions">
        <span>저장</span>
        <span>취소</span>
      </div>
    </Root>
  )
})
