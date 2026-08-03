import type { CSSProperties } from 'react'
import type { StructureRenderer } from './registry'

export const PageDefault: StructureRenderer = ({ attrs, children }) => (
  <div {...attrs}>{children}</div>
)

export const SlotDefault: StructureRenderer = ({ attrs, slot }) => <div {...attrs}>{slot}</div>

export const SectionContained: StructureRenderer = ({ attrs, part, children }) => (
  <section {...attrs}>
    <div {...part('inner')}>{children}</div>
  </section>
)

export const FlexDefault: StructureRenderer = ({ attrs, props, children }) => (
  <div
    {...attrs}
    style={{
      display: 'flex',
      flexDirection: props.direction as 'row' | 'column',
      alignItems: mapAlign(props.align as string),
      justifyContent: mapJustify(props.justify as string),
      flexWrap: props.wrap === true ? 'wrap' : 'nowrap',
    }}
  >
    {children}
  </div>
)

export const GridDefault: StructureRenderer = ({ attrs, props, children }) => {
  // CSS 커스텀 프로퍼티는 CSSProperties 타입에 없으므로 캐스팅한다.
  const style = {
    display: 'grid',
    gridTemplateColumns: `repeat(${props.columns as number}, 1fr)`,
    '--wb-grid-columns': String(props.columns),
  } as CSSProperties

  return (
    <div {...attrs} style={style}>
      {children}
    </div>
  )
}

export const CardPlain: StructureRenderer = ({ attrs, props, part, children }) => (
  <div {...attrs}>
    <div {...part('header')}>
      <div {...part('title')}>{String(props.title)}</div>
      {props.subtitle ? <div {...part('subtitle')}>{String(props.subtitle)}</div> : null}
    </div>
    <div {...part('body')}>{children}</div>
  </div>
)

export const TabsUnderline: StructureRenderer = ({ attrs, props, part, children }) => {
  const tabs = props.tabs as string[]
  const active = props.active as number
  return (
    <div {...attrs}>
      <div {...part('list')}>
        {tabs.map((label, index) => (
          <span key={`${label}-${index}`} {...part('tab')} aria-selected={index === active}>
            {label}
          </span>
        ))}
      </div>
      <div {...part('panel')}>{children}</div>
    </div>
  )
}

function mapAlign(value: string): string {
  return value === 'start' ? 'flex-start' : value === 'end' ? 'flex-end' : value
}

function mapJustify(value: string): string {
  if (value === 'start') return 'flex-start'
  if (value === 'end') return 'flex-end'
  if (value === 'between') return 'space-between'
  return value
}
