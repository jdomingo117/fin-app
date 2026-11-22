import { motion } from 'framer-motion'
import { useState } from 'react'
import { FocusRing } from './FocusRing'
import { FocusRow, SectionFocusRow } from './FocusRow'
import { GlassSurface } from './GlassSurface'
import { consoleRise, useConsoleReducedMotion } from './motion'
import { enabledSections, type SectionId } from './sections'
import './foundation-demo.css'

export default function FoundationDemo() {
  const reduced = useConsoleReducedMotion()
  const [active, setActive] = useState<SectionId>('dashboard')
  const [opened, setOpened] = useState<string>()
  const [replay, setReplay] = useState(0)
  return <section className="console-foundation-demo" aria-labelledby="foundation-title">
    <h1 id="foundation-title">Console foundation demo</h1>
    <p>Motion: {reduced ? '150 ms fades' : 'Full effects'}</p>
    <SectionFocusRow items={enabledSections} activeId={active} onPreview={setActive}
      onActivate={id => setOpened(enabledSections.find(item => item.id === id)?.name)} />
    <p role="status">{opened ? `${opened} activated` : 'Choose a section to preview. Activate to confirm.'}</p>
    <button type="button" className="console-toggle" onClick={() => setReplay(value => value + 1)}>Replay entrance</button>
    <motion.div key={replay} {...consoleRise(reduced)} data-section={active}>
      <FocusRow label="Surface examples" className="console-foundation-materials">
        <GlassSurface as="button" material="activity" className="console-activity-card" data-console-row-item
          onClick={() => setOpened('Activity')}>
          <FocusRing layer="sweep" /><span>Activity card</span>
        </GlassSurface>
        <GlassSurface as="section" material="hub" data-console-row-item data-focus-ring tabIndex={0}
          aria-label="Tinted hub surface">Tinted hub surface</GlassSurface>
        <GlassSurface as="section" material="opaque" data-console-row-item data-focus-ring tabIndex={0}
          aria-label="Opaque reading surface">Opaque reading surface</GlassSurface>
        <GlassSurface as="div" material="sheet" data-console-row-item data-focus-ring tabIndex={0}
          aria-label="Sheet surface">Sheet surface</GlassSurface>
        <GlassSurface as="button" material="activity" className="console-activity-card" data-console-row-item disabled>
          Disabled activity card
        </GlassSurface>
      </FocusRow>
    </motion.div>
  </section>
}
