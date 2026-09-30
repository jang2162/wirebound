import type { ReactNode } from 'react'
import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const IndentTree = defaultView('Tree')

/**
 * **좌측 내비게이션(`accordion`).** 한 묶음만 펴져 있고 나머지는 접힌 문서 사이트의 사이드바다. 첫 마디만 편다 — 전부 펴면 들여쓰기
 * 트리와 화면이 같아져 무엇을 그린 것인지 안 보인다.
 *
 * 깊이를 DOM 중첩(`panel` 안의 `node`)으로 낸다 — 들여쓰기 단계 변수를 싣지 않으므로 기본 뷰 CSS 의 들여쓰기 규칙(`indent` 에만
 * 걸린다)도 안 닿는다. `indent` 는 기본 뷰다.
 */
export const TreeView = view((p) => {
  if (p.variant === 'indent') return <IndentTree {...p} />
  const items = p.props.items as string[]
  const depth = p.props.depth as number

  // 펴진 가지 하나를 `depth` 단계만큼 안쪽부터 감싸 만든다.
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
    <Root as="ul">
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
