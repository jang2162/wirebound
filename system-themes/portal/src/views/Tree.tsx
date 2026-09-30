import type { ReactNode } from 'react'
import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const IndentView = defaultView('Tree')

/**
 * `accordion` — 깊이를 노드 변수가 아니라 **DOM 중첩**이 나른다. 들여쓰기 단계(`--wb-node-tree-level`)를 싣지 않는다 — 실으면
 * 중첩과 곱셈이 겹쳐 두 번 들여쓴다(SDK 기본 CSS 의 들여쓰기 규칙은 `indent` 구조에만 걸린다).
 *
 * **첫 마디만 펴져 있다.** 전부 펴면 `indent` 와 화면이 같아져 무엇을 그린 것인지 안 보인다. `indent` 는 SDK 기본 뷰다.
 */
export const TreeView = view((p) => {
  if (p.variant === 'indent') return <IndentView {...p} />
  const items = p.props.items as string[]
  const depth = p.props.depth as number

  // 펴진 가지 하나를 `depth` 단계만큼 안쪽부터 감싸 중첩한다.
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
