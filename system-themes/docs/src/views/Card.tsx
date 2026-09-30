import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const PlainCard = defaultView('Card')

/**
 * **주의 상자(`default` 참고 · `featured` 경고).** 문서의 NOTE / WARNING 은 «왼쪽에 표시, 오른쪽에 제목과 글» 이다. 표시(`media`)를 옆에
 * 두려면 머리와 본문이 한 덩어리(`content`)로 묶여야 한다 — 안 묶으면 루트를 가로로 세우는 순간 표시 · 머리 · 본문 셋이 나란히 선다.
 * 감싸는 상자는 CSS 로 못 만들어 뷰가 DOM 을 낸다. `plain` 은 기본 뷰의 카드다.
 *
 * 마커는 오른쪽 위다 — 왼쪽 위에는 상자의 종류를 말하는 색 표시가 선다. 모서리에 그대로 두면 전체 폭 카드에서 마커의 절반이 문서 밖으로
 * 나가 PPTX 화면(720 폭)이 넓게 찍힌다 — 번들 마커(`packages/exporter/src/bundle/shell-css.ts` 의 `.wb-export-marker` · 28px)의 절반보다
 * 안으로 들인다. −12 는 2px 모자란다(`apps/web/build-test/theme-system-review.test.ts` 「PPTX 화면 폭」).
 */
export const CardView = view((p) => {
  if (p.variant === 'plain') return <PlainCard {...p} />
  return (
    <Root as="div" marker={{ placement: 'top-end', offset: [-16, 0] }}>
      <div data-wb-part="media" />
      <div data-wb-part="content">
        <div data-wb-part="header">
          <div data-wb-part="title">{String(p.props.title)}</div>
          {p.props.subtitle ? <div data-wb-part="subtitle">{String(p.props.subtitle)}</div> : null}
        </div>
        <div data-wb-part="body">{p.children}</div>
      </div>
    </Root>
  )
})
