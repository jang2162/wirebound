import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const TableView = defaultView('KeyValue')

/**
 * `definitionList` — 공지 상세의 머리 정보(작성일 · 담당 부서 · 조회수). 조각은 `table` 과 같고(`row` · `key` · `value`) 뜻을
 * 태그가 나른다(`<dt>`/`<dd>`). `<dl>` 안에서 `<div>` 로 짝을 묶는 것은 HTML 이 허용한다 — `row` 조각을 지키는 유일한 길이다.
 * 열 수(`columns`)는 세로로 흐르는 정의 목록에서 뜻이 없어 읽지 않는다(manifest 의 `hideProps`). `table` 은 SDK 기본 뷰다.
 */
export const KeyValueView = view((p) => {
  if (p.variant === 'table') return <TableView {...p} />
  const pairs = p.props.pairs as { key: string; value: string }[]
  return (
    <Root as="dl" data-wb-structure="definitionList">
      {pairs.map((pair, index) => (
        <div key={`${pair.key}-${index}`} data-wb-part="row">
          <dt data-wb-part="key">{pair.key}</dt>
          <dd data-wb-part="value">{pair.value}</dd>
        </div>
      ))}
    </Root>
  )
})
