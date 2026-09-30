import type { ReactNode } from 'react'
import { DEFAULT_VIEWS, Root, view } from '@wirebound/theme-sdk'

const IndentTree = DEFAULT_VIEWS['Tree']!

/**
 * **접히는 카테고리 — 아코디언.** 커머스의 좌측 카테고리는 깊이가 아니라 여닫힘으로 읽힌다. 기본 뷰(`indent`)는 단계를 노드 변수로
 * 실어 들여쓰고, 여기는 **DOM 중첩이 깊이**다 — 펴진 가지를 `panel` 조각(`<ul>`)으로 감싸 테마가 묶음의 범위(왼쪽 선)를 그을 상자를
 * 준다. 단계 변수는 싣지 않는다(실으면 중첩과 곱셈이 겹쳐 두 번 들여쓴다).
 *
 * **첫 마디만 펴져 있다** — 전부 펴면 들여쓰기와 화면이 같아져 무엇을 그린 것인지 안 보인다. `indent` 는 기본 뷰 그대로다.
 */
export const TreeView = view((p) => {
  if (p.variant === 'indent') return <IndentTree {...p} />
  const items = p.props.items as string[]
  const depth = p.props.depth as number

  // 펴진 가지 하나를 `depth` 단계만큼 안쪽부터 감싼다.
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
