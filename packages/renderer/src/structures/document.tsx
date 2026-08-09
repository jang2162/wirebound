import { createElement, type CSSProperties } from 'react'
import { nodeVar } from '../structure-css'
import type { StructureRenderer } from './registry'

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

// `data-wb-role`은 없어졌다 — `role`이 `variantFrom`으로 `data-wb-variant`가 된다(P0 이월 #8).
// **`ROLE_TAG`는 그대로 둔다.** 태그를 바꾸는 것은 접근성과 문서 구조의 문제이지
// 스타일 채널이 아니다 — `<h1>`이 `<p>`가 되면 개요(outline)가 달라진다.
export const TextDefault: StructureRenderer = ({ attrs, props }) =>
  createElement(ROLE_TAG[props.role as string] ?? 'p', attrs, String(props.content))

export const MediaImage: StructureRenderer = ({ attrs, props, part }) => (
  <figure {...attrs}>
    <div
      {...part('frame')}
      style={{ [nodeVar('media', 'ratio')]: String(props.ratio) } as CSSProperties}
    />
    {props.caption ? <figcaption {...part('caption')}>{String(props.caption)}</figcaption> : null}
  </figure>
)

// `data-direction`은 없어졌다 — `direction`이 `data-wb-variant`로 나간다.
export const DividerDefault: StructureRenderer = ({ attrs }) => <hr {...attrs} />

export const PlaceholderDefault: StructureRenderer = ({ attrs, props }) => (
  // 길이 단위를 여기서 붙인다. 기본 CSS가 `calc(var(…) * 1px)`로 붙이면 그 곱셈이
  // 테마가 값을 덮을 때도 남아, `height: 300px`을 준 테마가 `300px * 1px`이라는 무효한
  // 값을 만든다 — 통로는 CSS에 그대로 실을 수 있는 값을 날라야 한다.
  <div
    {...attrs}
    style={{ [nodeVar('placeholder', 'height')]: `${props.height as number}px` } as CSSProperties}
  >
    {String(props.label)}
  </div>
)
