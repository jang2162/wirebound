/** **문서 그룹 기본 뷰.** `Text`·`Media`·`Divider`·`Placeholder`. 옮긴 규칙은 `./index.ts` 머리말. */
import type { CSSProperties } from 'react'
import { componentRule, nodeVar, partRule, zeroRule } from '../css-tools'
import { view } from '../define'
import { Root } from '../root'

// 태그는 접근성 · 문서 개요의 문제라 역할에서 고른다 — `<h1>` 이 `<p>` 가 되면 개요가 달라진다.
const ROLE_TAG: Record<string, string> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body: 'p',
  caption: 'small',
}

export const TextView = view(({ props }) => (
  <Root as={ROLE_TAG[props.role as string] ?? 'p'} data-wb-structure="default">
    {String(props.content)}
  </Root>
))

/** 종류(`kind`)마다 틀 가운데 표지. `image` 는 없다 — 빈 틀이 곧 «사진» 이다. */
const MEDIA_GLYPH: Record<string, string> = { video: '▶', illustration: '✎', chart: '▤' }

// 기본 구조 `image`.
export const MediaView = view(({ props }) => {
  const glyph = MEDIA_GLYPH[String(props.kind)]
  return (
    <Root as="figure" data-wb-structure="image">
      <div
        data-wb-part="frame"
        style={{ [nodeVar('media', 'ratio')]: String(props.ratio) } as CSSProperties}
      >
        {glyph === undefined ? null : (
          <span data-wb-part="glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
      </div>
      {props.caption ? <figcaption data-wb-part="caption">{String(props.caption)}</figcaption> : null}
    </Root>
  )
})

export const DividerView = view(() => <Root as="hr" data-wb-structure="default" />)

export const PlaceholderView = view(({ props }) => (
  // 길이 단위를 여기서 붙인다 — CSS 가 `calc(var(…) * 1px)` 로 붙이면 테마가 `300px` 을 줄 때 무효한 값이 된다.
  <Root
    as="div"
    data-wb-structure="default"
    style={{ [nodeVar('placeholder', 'height')]: `${props.height as number}px` } as CSSProperties}
  >
    {String(props.label)}
  </Root>
))

export function documentCssBlocks(): string[] {
  return [
    partRule('Media', 'frame', [`aspect-ratio: var(${nodeVar('media', 'ratio')}, 16/9);`]),
    // 표지를 틀 가운데 둔다. 틀의 높이는 `aspect-ratio` 가 정하므로 격자로 바꿔도 크기가 안 변한다.
    zeroRule('[data-wb-component="Media"] [data-wb-part="frame"]', ['display: grid;', 'place-items: center;']),
    componentRule('Placeholder', 'default', [`height: var(${nodeVar('placeholder', 'height')}, 120px);`]),
  ]
}
