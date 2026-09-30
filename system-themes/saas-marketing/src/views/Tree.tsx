import { Root, view } from '@wirebound/theme-sdk'
import type { ReactNode } from 'react'
import { defaultView } from './fallback'

const IndentTree = defaultView('Tree')

/**
 * **아코디언(옛 구조 `accordion`)** — 랜딩 페이지에서 트리 꼴로 쓰이는 것은 파일 트리가 아니라 FAQ 다. 첫 항목만 펼쳐 `depth`
 * 단계까지 안쪽 패널을 겹쳐 보인다. 들여쓰기는 노드 변수가 아니라 패널의 여백이 만든다 — SDK 기본 CSS 의 들여쓰기 규칙은
 * `indent` 구조에만 걸린다.
 */
export const TreeView = view((viewProps) => {
  if (viewProps.variant === 'indent') return <IndentTree {...viewProps} />
  const items = viewProps.props.items as string[]
  const depth = viewProps.props.depth as number
  const branch = (label: string): ReactNode => {
    let inner: ReactNode = null
    for (let level = depth; level > 1; level -= 1) {
      inner = (
        <ul data-wb-part="panel">
          <li data-wb-part="node">
            <span data-wb-part="toggle">{inner === null ? '▸' : '▾'}</span>
            <span data-wb-part="label">{`${label} · ${level}단계`}</span>
            {inner}
          </li>
        </ul>
      )
    }
    return inner
  }
  return (
    <Root as="ul" data-wb-structure="accordion">
      {items.map((label, index) => (
        <li key={`${label}-${index}`} data-wb-part="node">
          <span data-wb-part="toggle">{index === 0 ? '▾' : '▸'}</span>
          <span data-wb-part="label">{label}</span>
          {index === 0 ? branch(label) : null}
        </li>
      ))}
    </Root>
  )
})
