import type { ComponentPropsWithoutRef } from 'react'
import './glass-surface.css'

type Material = 'hub' | 'opaque' | 'activity' | 'sheet'
type Props =
  | ({ as: 'button'; material: Material } & ComponentPropsWithoutRef<'button'>)
  | ({ as: 'section' | 'div'; material: Material } & ComponentPropsWithoutRef<'div'>)

export function GlassSurface(props: Props) {
  if (props.as === 'button') {
    const { as: Surface, material, type = 'button', ...attributes } = props
    return <Surface {...attributes} type={type} data-console-surface={material} />
  }
  const { as: Surface, material, ...attributes } = props
  return <Surface {...attributes} data-console-surface={material} />
}
