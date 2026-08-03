import type { StructureRenderer } from './registry'

export const ButtonSolid: StructureRenderer = ({ attrs, props, part }) => (
  <button {...attrs} type="button" disabled={props.disabled === true}>
    <span {...part('label')}>{String(props.label)}</span>
  </button>
)

export const LinkDefault: StructureRenderer = ({ attrs, props }) => (
  <a {...attrs} href={props.target ? `#${String(props.target)}` : '#'}>
    {String(props.label)}
  </a>
)
