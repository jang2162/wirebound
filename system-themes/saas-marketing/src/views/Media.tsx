import { nodeVar, Root, view } from '@wirebound/theme-sdk'
import type { CSSProperties } from 'react'
import { defaultView } from './fallback'

const PhotoMedia = defaultView('Media')

/**
 * **그림(옛 구조 `illustration`)** — 랜딩 페이지의 그림은 사진보다 그린 것(제품 일러스트 · 다이어그램)이 많고, 빈 틀만 두면 전부
 * 사진으로 읽힌다. 틀 가운데 표지(`glyph`)를 둔다 — 노드의 `kind` 가 `video` 면 재생 표지다. `image` variant 는 기본 뷰(빈 틀)다.
 * 비율은 문서의 것이다 — SDK 기본 CSS 가 `frame` 의 `aspect-ratio` 를 이 변수로 잡는다.
 */
export const MediaView = view((viewProps) => {
  if (viewProps.variant === 'image') return <PhotoMedia {...viewProps} />
  const { props } = viewProps
  return (
    <Root as="figure" data-wb-structure="illustration">
      <div data-wb-part="frame" style={{ [nodeVar('media', 'ratio')]: String(props.ratio) } as CSSProperties}>
        <span data-wb-part="glyph" aria-hidden="true">
          {props.kind === 'video' ? '▶' : '✎'}
        </span>
      </div>
      {props.caption ? <figcaption data-wb-part="caption">{String(props.caption)}</figcaption> : null}
    </Root>
  )
})
