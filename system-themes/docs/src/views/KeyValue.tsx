import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const TableKeyValue = defaultView('KeyValue')

/**
 * **API 레퍼런스의 파라미터 목록(`definition`).** `<dl>/<dt>/<dd>` 가 «용어와 그 뜻» 을 읽는 도구에 그대로 나른다 — 표(`<th>/<td>`)는
 * 행렬의 칸이라 뜻이 다르다. `<div>` 로 짝을 감싸는 것은 HTML 이 허용하고, 그래야 `row` 조각이 남는다. 열 수를 읽지 않는다
 * (`columns` 는 `hideProps`). `table` 은 기본 뷰다.
 */
export const KeyValueView = view((p) => {
  if (p.variant === 'table') return <TableKeyValue {...p} />
  const pairs = p.props.pairs as { key: string; value: string }[]
  return (
    <Root as="dl">
      {pairs.map((pair, index) => (
        <div key={`${pair.key}-${index}`} data-wb-part="row">
          <dt data-wb-part="key">{pair.key}</dt>
          <dd data-wb-part="value">{pair.value}</dd>
        </div>
      ))}
    </Root>
  )
})
