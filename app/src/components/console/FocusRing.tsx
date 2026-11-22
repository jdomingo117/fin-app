import './focus-ring.css'

/** Place the glow outside any scrolling or masked track. The edge scales with its tile artwork. */
export function FocusRing({ layer }: { layer: 'edge' | 'glow' | 'sweep' }) {
  return <span className="console-focus-decoration" data-layer={layer} aria-hidden="true" />
}
