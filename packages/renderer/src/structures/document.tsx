import { createElement } from 'react'
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

export const TextDefault: StructureRenderer = ({ attrs, props }) =>
  createElement(
    ROLE_TAG[props.role as string] ?? 'p',
    { ...attrs, 'data-wb-role': String(props.role) },
    String(props.content),
  )

export const MediaImage: StructureRenderer = ({ attrs, props, part }) => (
  <figure {...attrs}>
    <div {...part('frame')} style={{ aspectRatio: String(props.ratio) }} />
    {props.caption ? <figcaption {...part('caption')}>{String(props.caption)}</figcaption> : null}
  </figure>
)

export const DividerDefault: StructureRenderer = ({ attrs, props }) => (
  <hr {...attrs} data-direction={String(props.direction)} />
)

export const PlaceholderDefault: StructureRenderer = ({ attrs, props }) => (
  <div {...attrs} style={{ height: `${props.height as number}px` }}>
    {String(props.label)}
  </div>
)
